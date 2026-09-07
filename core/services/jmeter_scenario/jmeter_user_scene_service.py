"""JMeter 压测 · 用户场景服务（始终带 user_id 条件，防串数据）。"""
from __future__ import annotations

import json
import re
import time
import uuid
from datetime import datetime
from typing import Any

from core.services.jmeter_scenario.jmeter_user_scene_db import ensure_jmeter_user_scenes_table
from core.services.test_cases.mysql_db import get_connection

MAX_JMETER_SCENES_PER_USER = 10
_MAX_YAML_CHARS = 2_000_000
_ID_RE = re.compile(r"^[a-f0-9]{32}$")


def _validate_user_id(user_id: str) -> str:
    uid = str(user_id or "").strip()
    if not _ID_RE.match(uid):
        raise ValueError("无效的用户标识")
    return uid


def _validate_scene_id(scene_id: str) -> str:
    sid = str(scene_id or "").strip()
    if not _ID_RE.match(sid):
        raise ValueError("无效的场景标识")
    return sid


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def validate_jmeter_scene_payload(payload: object) -> tuple[bool, str | None]:
    if not isinstance(payload, dict):
        return False, "payload 必须是对象"
    yaml_text = payload.get("yaml")
    if yaml_text is None:
        return False, "缺少 yaml 字段"
    if not isinstance(yaml_text, str):
        return False, "yaml 必须是字符串"
    if not yaml_text.strip():
        return False, "场景内容为空"
    if len(yaml_text) > _MAX_YAML_CHARS:
        return False, "场景内容过大，请精简后再保存"
    return True, None


def normalize_jmeter_scene_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {"yaml": str(payload.get("yaml") or "")}


def _fmt_dt(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M:%S")
    return str(value or "")


def _row_to_meta(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "title": row.get("title") or "未命名场景",
        "created_at": _fmt_dt(row.get("created_at")),
        "updated_at": _fmt_dt(row.get("updated_at")),
        "createdAt": _fmt_dt(row.get("created_at")),
        "updatedAt": _fmt_dt(row.get("updated_at")),
    }


def _doc_from_row(row: dict[str, Any]) -> dict[str, Any]:
    payload = row.get("payload")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {}
    if not isinstance(payload, dict):
        payload = {}
    payload = normalize_jmeter_scene_payload(payload)
    return {
        "id": row["id"],
        "title": row.get("title") or "未命名场景",
        "created_at": _fmt_dt(row.get("created_at")),
        "updated_at": _fmt_dt(row.get("updated_at")),
        "createdAt": _fmt_dt(row.get("created_at")),
        "updatedAt": _fmt_dt(row.get("updated_at")),
        "payload": payload,
    }


def count_jmeter_user_scenes(user_id: str) -> int:
    ensure_jmeter_user_scenes_table()
    user_id = _validate_user_id(user_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM jmeter_user_scenes WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone() or {}
            return int(row.get("c") or 0)
    finally:
        conn.close()


def list_jmeter_user_scenes(user_id: str) -> list[dict[str, Any]]:
    ensure_jmeter_user_scenes_table()
    user_id = _validate_user_id(user_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, title, created_at, updated_at
                FROM jmeter_user_scenes
                WHERE user_id = %s
                ORDER BY updated_at DESC
                """,
                (user_id,),
            )
            rows = cur.fetchall() or []
        return [_row_to_meta(r) for r in rows]
    finally:
        conn.close()


def read_jmeter_user_scene(user_id: str, scene_id: str) -> dict[str, Any]:
    ensure_jmeter_user_scenes_table()
    user_id = _validate_user_id(user_id)
    scene_id = _validate_scene_id(scene_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, title, payload, created_at, updated_at
                FROM jmeter_user_scenes
                WHERE user_id = %s AND id = %s
                LIMIT 1
                """,
                (user_id, scene_id),
            )
            row = cur.fetchone()
        if not row:
            raise FileNotFoundError("场景不存在或无权访问")
        return _doc_from_row(row)
    finally:
        conn.close()


def delete_jmeter_user_scene(user_id: str, scene_id: str) -> bool:
    ensure_jmeter_user_scenes_table()
    user_id = _validate_user_id(user_id)
    scene_id = _validate_scene_id(scene_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM jmeter_user_scenes WHERE user_id = %s AND id = %s",
                (user_id, scene_id),
            )
            return int(cur.rowcount or 0) > 0
    finally:
        conn.close()


def save_new_jmeter_user_scene(
    user_id: str,
    title: str | None,
    payload: dict[str, Any],
) -> dict[str, Any]:
    ensure_jmeter_user_scenes_table()
    user_id = _validate_user_id(user_id)
    ok, err = validate_jmeter_scene_payload(payload)
    if not ok:
        raise ValueError(err or "无效的场景数据")
    if count_jmeter_user_scenes(user_id) >= MAX_JMETER_SCENES_PER_USER:
        raise ValueError(f"已达保存上限（{MAX_JMETER_SCENES_PER_USER} 条），请先删除旧场景")
    normalized = normalize_jmeter_scene_payload(payload)
    scene_id = uuid.uuid4().hex
    now = _now_str()
    title_text = (title or "").strip() or f"未命名场景 {now}"
    if len(title_text) > 120:
        title_text = title_text[:120]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO jmeter_user_scenes (id, user_id, title, payload, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    scene_id,
                    user_id,
                    title_text,
                    json.dumps(normalized, ensure_ascii=False),
                    now,
                    now,
                ),
            )
        iso = now.replace(" ", "T")
        return {
            "id": scene_id,
            "title": title_text,
            "created_at": iso,
            "updated_at": iso,
            "createdAt": iso,
            "updatedAt": iso,
            "payload": normalized,
        }
    finally:
        conn.close()
