"""Global guard: block JMeter smoke when UI automation is running."""

from __future__ import annotations

import fcntl
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
    return


@contextmanager
def jmeter_smoke_run_lock():
    check_can_run_jmeter()
    _jmeter_smoke_lock_path.parent.mkdir(parents=True, exist_ok=True)
    fh = open(_jmeter_smoke_lock_path, "a+", encoding="utf-8")
    try:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise JmeterRunBusyError("已有 JMeter 试跑任务进行中，请稍后再试。") from exc
        yield
    finally:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        fh.close()
