"""Parse JMeter JTL (CSV) into summary stats."""

from __future__ import annotations

import csv
import io
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class JtlFailureRow:
    label: str
    response_code: str
    response_message: str
    thread_name: str
    success: bool
    elapsed_ms: int
    url: str = ""


@dataclass
class JtlParseResult:
    total: int = 0
    success_count: int = 0
    error_count: int = 0
    avg_elapsed_ms: float = 0.0
    max_elapsed_ms: int = 0
    failures: list[JtlFailureRow] = field(default_factory=list)
    by_label: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["failures"] = [asdict(f) for f in self.failures]
        return d


def _is_success(val: str) -> bool:
    return str(val or "").strip().lower() in ("true", "1", "yes")


def parse_jtl_text(jtl_text: str, max_failures: int = 50) -> JtlParseResult:
    text = (jtl_text or "").strip()
    if not text:
        return JtlParseResult()

    sample = text[:4096]
    delimiter = "\t" if sample.count("\t") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        return JtlParseResult()

    fields = {f.lower(): f for f in reader.fieldnames}
    label_key = fields.get("label") or fields.get("samplerlabel") or "label"
    elapsed_key = fields.get("elapsed") or "elapsed"
    code_key = fields.get("responsecode") or fields.get("response code") or "responseCode"
    msg_key = fields.get("responsemessage") or fields.get("response message") or "responseMessage"
    thread_key = fields.get("threadname") or fields.get("thread name") or "threadName"
    success_key = fields.get("success") or "success"
    url_key = fields.get("url") or "URL"

    total = 0
    success_count = 0
    elapsed_sum = 0
    max_elapsed = 0
    failures: list[JtlFailureRow] = []
    label_stats: dict[str, dict[str, Any]] = {}

    for row in reader:
        total += 1
        try:
            elapsed = int(float(row.get(elapsed_key) or 0))
        except (TypeError, ValueError):
            elapsed = 0
        elapsed_sum += elapsed
        max_elapsed = max(max_elapsed, elapsed)
        label = str(row.get(label_key) or "").strip() or "(unknown)"
        ok = _is_success(str(row.get(success_key) or ""))
        if ok:
            success_count += 1
        else:
            if len(failures) < max_failures:
                failures.append(
                    JtlFailureRow(
                        label=label,
                        response_code=str(row.get(code_key) or ""),
                        response_message=str(row.get(msg_key) or "")[:500],
                        thread_name=str(row.get(thread_key) or ""),
                        success=False,
                        elapsed_ms=elapsed,
                        url=str(row.get(url_key) or "")[:500],
                    )
                )
        bucket = label_stats.setdefault(
            label,
            {"label": label, "count": 0, "errors": 0, "elapsed_sum": 0, "max_elapsed": 0},
        )
        bucket["count"] += 1
        bucket["elapsed_sum"] += elapsed
        bucket["max_elapsed"] = max(bucket["max_elapsed"], elapsed)
        if not ok:
            bucket["errors"] += 1

    by_label = []
    for item in label_stats.values():
        cnt = item["count"] or 1
        by_label.append(
            {
                "label": item["label"],
                "count": item["count"],
                "error_rate": round(item["errors"] / cnt, 4),
                "avg_ms": round(item["elapsed_sum"] / cnt, 1),
                "max_ms": item["max_elapsed"],
            }
        )
    by_label.sort(key=lambda x: (-x["error_rate"], -x["max_ms"]))

    return JtlParseResult(
        total=total,
        success_count=success_count,
        error_count=total - success_count,
        avg_elapsed_ms=round(elapsed_sum / total, 1) if total else 0.0,
        max_elapsed_ms=max_elapsed,
        failures=failures,
        by_label=by_label[:30],
    )


def build_failure_log_text(result: JtlParseResult, jmeter_log: str = "") -> str:
    lines = [
        "JMeter Smoke Run — Failure Log",
        f"Total samples: {result.total}",
        f"Success: {result.success_count}",
        f"Errors: {result.error_count}",
        "",
        "=== Failed samples ===",
    ]
    for i, f in enumerate(result.failures, 1):
        lines.append(f"[{i}] {f.label}")
        lines.append(f"    code: {f.response_code}")
        lines.append(f"    message: {f.response_message}")
        lines.append(f"    thread: {f.thread_name}")
        lines.append(f"    elapsed_ms: {f.elapsed_ms}")
        if f.url:
            lines.append(f"    url: {f.url}")
        lines.append("")
    if jmeter_log:
        lines.extend(["=== JMeter log (tail) ===", jmeter_log[-8000:]])
    return "\n".join(lines)
