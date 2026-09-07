"""JMeter smoke run: 1 thread, 1 loop, 30s wall clock."""

from __future__ import annotations

import os
import subprocess
import tempfile
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from core.services.jmeter_scenario.jmeter_run_guard import jmeter_smoke_run_lock
from core.services.jmeter_scenario.jmx_smoke_prepare import prepare_jmx_for_smoke
from core.services.jmeter_scenario.jtl_parse_service import (
    JtlParseResult,
    build_failure_log_text,
    parse_jtl_text,
)



def is_jmeter_available() -> bool:
    jmeter_bin = os.path.join(JMETER_HOME, "bin", "jmeter")
    return os.path.isfile(jmeter_bin)

JMETER_HOME = os.environ.get("JMETER_HOME", "/opt/apache-jmeter-5.6.3")
SMOKE_TIMEOUT_SEC = int(os.environ.get("JMETER_SMOKE_TIMEOUT_SEC", "30"))
SMOKE_JVM_OPTS = os.environ.get("JMETER_SMOKE_JVM_OPTS", "-Xms128m -Xmx384m")

# Short-lived in-memory cache for failure log download (not persisted to disk store)
_smoke_cache: dict[str, dict[str, Any]] = {}
_CACHE_TTL_SEC = 600


@dataclass
class SmokeRunResult:
    run_id: str
    status: str  # pass | fail | timeout
    timed_out: bool
    duration_ms: int
    total_ms: int = 0
    summary: dict[str, Any] = field(default_factory=dict)
    failures: list[dict[str, Any]] = field(default_factory=list)
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _purge_cache() -> None:
    now = time.time()
    dead = [k for k, v in _smoke_cache.items() if now - v.get("_ts", 0) > _CACHE_TTL_SEC]
    for k in dead:
        _smoke_cache.pop(k, None)


def get_smoke_failure_log(run_id: str) -> str | None:
    _purge_cache()
    item = _smoke_cache.get(run_id)
    if not item:
        return None
    return item.get("failure_log")


def run_smoke_jmx(
    jmx_text: str,
    scenario_slug: str = "scenario",
    *,
    skip_validate: bool = True,
) -> SmokeRunResult:
    total_started = time.time()
    raw = jmx_text if isinstance(jmx_text, str) else str(jmx_text or "")
    if not raw.strip():
        return SmokeRunResult(
            run_id="",
            status="fail",
            timed_out=False,
            duration_ms=0,
            message="JMX 内容为空",
        )

    if not is_jmeter_available():
        return SmokeRunResult(
            run_id="",
            status="fail",
            timed_out=False,
            duration_ms=0,
            message="JMeter 未安装或未配置",
        )

    run_id = uuid.uuid4().hex
    jmeter_bin = os.path.join(JMETER_HOME, "bin", "jmeter")
    if not os.path.isfile(jmeter_bin):
        return SmokeRunResult(
            run_id=run_id,
            status="fail",
            timed_out=False,
            duration_ms=0,
            message=f"找不到 JMeter：{jmeter_bin}",
        )

    smoke_jmx = prepare_jmx_for_smoke(jmx_text)
    started = time.time()
    timed_out = False
    jtl_text = ""
    jmeter_log = ""

    with jmeter_smoke_run_lock():
        with tempfile.TemporaryDirectory(prefix="jms_smoke_") as tmp:
            tmp_path = Path(tmp)
            jmx_path = tmp_path / f"{scenario_slug}.smoke.jmx"
            jtl_path = tmp_path / "result.jtl"
            log_path = tmp_path / "jmeter.log"
            jmx_path.write_text(smoke_jmx, encoding="utf-8")

            cmd = [
                jmeter_bin,
                "-n",
                "-t",
                str(jmx_path),
                "-l",
                str(jtl_path),
                "-j",
                str(log_path),
                "-Jjmeterengine.force.system.exit=true",
            ]
            env = os.environ.copy()
            env["JVM_ARGS"] = SMOKE_JVM_OPTS

            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=SMOKE_TIMEOUT_SEC,
                    env=env,
                    check=False,
                )
            except subprocess.TimeoutExpired:
                timed_out = True
                proc = None

            duration_ms = int((time.time() - started) * 1000)
            if log_path.is_file():
                jmeter_log = log_path.read_text(encoding="utf-8", errors="replace")
            if jtl_path.is_file():
                jtl_text = jtl_path.read_text(encoding="utf-8", errors="replace")

            parsed: JtlParseResult = parse_jtl_text(jtl_text)
            failure_log = build_failure_log_text(parsed, jmeter_log)

            if timed_out:
                status = "timeout"
                msg = (
                    f"试跑超过 {SMOKE_TIMEOUT_SEC}s 已终止。"
                    f"已完成 {parsed.total} 个请求，成功 {parsed.success_count} 个，"
                    f"失败 {parsed.error_count} 个。"
                )
            elif parsed.total == 0:
                status = "fail"
                tail = (proc.stderr or proc.stdout or jmeter_log if proc else jmeter_log)[-500:]
                msg = f"未产生任何采样结果。{tail}"
            elif parsed.error_count == 0:
                status = "pass"
                msg = f"试跑通过：{parsed.total} 个请求全部成功，平均 {parsed.avg_elapsed_ms}ms。"
            else:
                status = "fail"
                msg = (
                    f"试跑完成但有失败：共 {parsed.total} 个请求，"
                    f"成功 {parsed.success_count} 个，失败 {parsed.error_count} 个。"
                )

            result = SmokeRunResult(
                run_id=run_id,
                status=status,
                timed_out=timed_out,
                duration_ms=duration_ms,
                total_ms=int((time.time() - total_started) * 1000),
                summary=parsed.to_dict(),
                failures=[asdict(f) for f in parsed.failures],
                message=msg,
            )

            _purge_cache()
            _smoke_cache[run_id] = {
                "_ts": time.time(),
                "failure_log": failure_log,
                "result": result.to_dict(),
            }
            return result
