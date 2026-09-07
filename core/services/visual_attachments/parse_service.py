"""附件解析编排（使用用户视觉模型配置）。"""
from __future__ import annotations

import queue
import threading
import time
from dataclasses import dataclass
from typing import Any

from core.config.user_ai_credentials import (
    UserAiConfigRequired,
    resolve_vision_ai_credentials,
    resolve_vision_ai_credentials_only,
)
from core.services.test_cases.mysql_db import get_connection
from core.services.visual_attachments.asset_store import read_bytes
from core.services.visual_attachments.attachment_db import get_asset, update_asset_parse
from core.services.visual_attachments.design_parser import parse_design_image
from core.services.visual_attachments.pdf_parser import parse_pdf_api_doc
from core.services.visual_attachments.txt_parser import parse_text_doc

_PARSE_QUEUE_LOCK = threading.Lock()
_PARSE_QUEUES: dict[str, queue.Queue] = {}
_PARSE_WORKERS: set[str] = set()

_PARSE_LOCK_TIMEOUT_SEC = 600
_SYNC_PARSE_TIMEOUT_SEC = 600

_PARSE_JOB_GAP_SEC = 1.2  # 串行 job 间隔，降低视觉 API QPS


@dataclass
class _ParseJob:
    asset_id: str
    user_id: str | None
    vision_cfg: dict | None = None
    done_event: threading.Event | None = None


def _user_queue_key(user_id: str | None) -> str:
    return str(user_id or "anon")


def _execute_asset_parse(
    asset_id: str,
    user_id: str | None,
    *,
    vision_cfg: dict[str, Any],
) -> None:
    asset = get_asset(asset_id, user_id)
    if not asset:
        update_asset_parse(asset_id, parse_status="error")
        return
    update_asset_parse(asset_id, parse_status="processing")
    raw = read_bytes(asset["storage_key"])
    mime = asset.get("mime_type") or "image/jpeg"
    if mime == "application/pdf":
        result = parse_pdf_api_doc(raw, vision_cfg=vision_cfg)
        atype = "api_pdf"
    elif mime == "text/plain":
        result = parse_text_doc(raw)
        atype = "text_doc"
    else:
        result = parse_design_image(raw, mime_type=mime, vision_cfg=vision_cfg)
        atype = "design"
    if result.get("error"):
        update_asset_parse(asset_id, parse_status="error", parse_result=result)
    else:
        update_asset_parse(
            asset_id,
            parse_status="done",
            parse_result=result,
            asset_type=atype,
        )


def _acquire_user_parse_lock(user_key: str) -> Any:
    conn = get_connection()
    lock_name = f"tc_visual_parse:{user_key}"
    with conn.cursor() as cur:
        cur.execute("SELECT GET_LOCK(%s, %s) AS locked", (lock_name, _PARSE_LOCK_TIMEOUT_SEC))
        row = cur.fetchone() or {}
        locked = row.get("locked")
        if locked != 1:
            conn.close()
            raise TimeoutError("附件解析排队超时，请稍后重试")
    return conn, lock_name


def _release_user_parse_lock(conn: Any, lock_name: str) -> None:
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT RELEASE_LOCK(%s)", (lock_name,))
    finally:
        conn.close()


def _process_parse_job(job: _ParseJob) -> None:
    asset_id = job.asset_id
    user_id = job.user_id
    user_key = _user_queue_key(user_id)
    asset = get_asset(asset_id, user_id)
    if not asset:
        update_asset_parse(asset_id, parse_status="error")
        return
    if asset.get("parse_status") == "done":
        return

    conn: Any | None = None
    lock_name = ""
    try:
        conn, lock_name = _acquire_user_parse_lock(user_key)
        asset = get_asset(asset_id, user_id)
        if not asset:
            update_asset_parse(asset_id, parse_status="error")
            return
        if asset.get("parse_status") == "done":
            return
        try:
            if job.vision_cfg:
                vision_cfg = job.vision_cfg
            else:
                asset_for_quota = get_asset(asset_id, user_id) or {}
                pr = asset_for_quota.get("parse_result") or {}
                if pr.get("_vision_quota_charged"):
                    vision_cfg = resolve_vision_ai_credentials_only(user_id)
                else:
                    vision_cfg = resolve_vision_ai_credentials(user_id)
        except UserAiConfigRequired as exc:
            update_asset_parse(
                asset_id,
                parse_status="error",
                parse_result={"error": str(exc), "ui_elements": []},
            )
            return
        try:
            _execute_asset_parse(asset_id, user_id, vision_cfg=vision_cfg)
        except Exception as exc:
            update_asset_parse(
                asset_id,
                parse_status="error",
                parse_result={"error": str(exc), "ui_elements": []},
            )
    except TimeoutError as exc:
        update_asset_parse(
            asset_id,
            parse_status="error",
            parse_result={"error": str(exc), "ui_elements": []},
        )
    finally:
        if conn is not None:
            _release_user_parse_lock(conn, lock_name)


def _user_queue_worker(user_key: str) -> None:
    job_queue = _PARSE_QUEUES[user_key]
    while True:
        job = job_queue.get()
        try:
            _process_parse_job(job)
        finally:
            if job.done_event is not None:
                job.done_event.set()
            job_queue.task_done()
            time.sleep(_PARSE_JOB_GAP_SEC)


def _ensure_user_worker_locked(user_key: str) -> None:
    """启动用户解析 worker；调用方必须已持有 _PARSE_QUEUE_LOCK。"""
    if user_key in _PARSE_WORKERS:
        return
    _PARSE_WORKERS.add(user_key)
    threading.Thread(
        target=_user_queue_worker,
        args=(user_key,),
        daemon=True,
        name=f"tc-visual-parse-{user_key[:8]}",
    ).start()


def _enqueue_parse_job(asset_id: str, user_id: str | None, *, wait: bool, vision_cfg: dict | None = None) -> None:
    user_key = _user_queue_key(user_id)
    done_event = threading.Event() if wait else None
    job = _ParseJob(asset_id=asset_id, user_id=user_id, vision_cfg=vision_cfg, done_event=done_event)
    with _PARSE_QUEUE_LOCK:
        if user_key not in _PARSE_QUEUES:
            _PARSE_QUEUES[user_key] = queue.Queue()
        _PARSE_QUEUES[user_key].put(job)
        _ensure_user_worker_locked(user_key)
    if wait and done_event is not None:
        if not done_event.wait(timeout=_SYNC_PARSE_TIMEOUT_SEC):
            raise ValueError("附件解析超时，请稍后重试")


def parse_asset_async(asset_id: str, user_id: str | None, vision_cfg: dict | None = None) -> None:
    """异步排队解析：同一用户附件依次处理，避免视觉 API 并发限流。"""
    _enqueue_parse_job(asset_id, user_id, wait=False, vision_cfg=vision_cfg)


def parse_asset_sync(asset_id: str, user_id: str | None) -> dict[str, Any]:
    """同步排队解析（智能编辑发送前专用，与异步队列共用顺序）。"""
    asset = get_asset(asset_id, user_id)
    if not asset:
        raise ValueError(f"附件不存在: {asset_id}")
    if asset.get("parse_status") == "done":
        return asset

    _enqueue_parse_job(asset_id, user_id, wait=True)

    updated = get_asset(asset_id, user_id)
    if not updated:
        raise ValueError(f"附件不存在: {asset_id}")
    if updated.get("parse_status") == "error":
        result = updated.get("parse_result") or {}
        err = str(result.get("error") or "附件解析失败")
        raise ValueError(err)
    return updated
