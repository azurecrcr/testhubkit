"""Global guard: block JMeter smoke when UI automation is running.

开源仓不含 UI 自动化模块时，UIA 忙碌检查自动跳过（不影响压测本身）。
正式站若包含 ui_automation，行为与原先一致。
"""

from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from pathlib import Path

_lock = threading.Lock()
_jmeter_smoke_lock_path = Path(
    os.environ.get(
        "JMETER_SMOKE_LOCK_FILE",
        "/tmp/testhub_jmeter_smoke.lock",
    )
)


class JmeterRunBusyError(RuntimeError):
    pass


def check_can_run_jmeter(user_id: str | None = None) -> None:
    """若存在 UI 自动化忙碌任务则拒绝；模块未安装时直接放行。"""
    try:
        from core.services.ui_automation.job_store import UiAutomationJobStore
    except ImportError:
        return
    store = UiAutomationJobStore()
    if store.get_active_job_global():
        raise JmeterRunBusyError("当前有 WebUI 自动化任务运行中，请稍后再试跑 JMeter。")


@contextmanager
def jmeter_smoke_run_lock():
    check_can_run_jmeter()
    _jmeter_smoke_lock_path.parent.mkdir(parents=True, exist_ok=True)
    fh = open(_jmeter_smoke_lock_path, "a+", encoding="utf-8")
    try:
        try:
            import fcntl

            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except ImportError:
            # Windows / 无 fcntl：仅保留进程内锁
            pass
        except BlockingIOError as exc:
            fh.close()
            raise JmeterRunBusyError("JMeter 试跑锁已被占用，请稍后再试。") from exc
        yield
    finally:
        try:
            import fcntl

            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass
        fh.close()
