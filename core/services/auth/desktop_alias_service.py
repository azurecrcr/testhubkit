"""桌面别名词典：规则读写、种子、学习候选。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from core.services.auth.desktop_alias_db import ensure_desktop_alias_tables
from core.services.test_cases.mysql_db import get_connection

# 与 Workbench 内置表对齐的种子（仅首次空库导入）
_BUILTIN_SEED: list[dict[str, Any]] = [
    {
        "terms": ["qq音乐", "qq 音乐", "qqmusic", "腾讯音乐"],
        "prefer_names": ["QQMusic", "QQ音乐"],
        "exclude_names": ["QQ", "QQ邮箱", "QQ空间", "TIM", "微信", "QQ飞车", "腾讯视频"],
        "category": "music",
    },
    {
        "terms": ["汽水音乐", "汽水", "sodamusic", "soda music"],
        "prefer_names": ["汽水音乐", "SodaMusic", "Soda Music"],
        "exclude_names": ["QQ音乐", "QQMusic", "网易云音乐", "酷狗音乐"],
        "category": "music",
    },
    {
        "terms": ["网易云音乐", "网易云", "cloudmusic"],
        "prefer_names": ["网易云音乐", "CloudMusic"],
        "exclude_names": ["QQ音乐", "酷狗音乐", "汽水音乐"],
        "category": "music",
    },
    {
        "terms": ["酷狗音乐", "酷狗", "kugou"],
        "prefer_names": ["酷狗音乐", "Kugou"],
        "exclude_names": ["QQ音乐", "网易云音乐"],
        "category": "music",
    },
    {
        "terms": ["spotify"],
        "prefer_names": ["Spotify"],
        "exclude_names": [],
        "category": "music",
    },
    {
        "terms": ["企业微信", "企微", "wecom", "wxwork"],
        "prefer_names": ["企业微信", "WXWork", "WeCom"],
        "exclude_names": ["微信", "WeChat"],
        "category": "im",
    },
    {
        "terms": ["微信", "wechat", "weixin"],
        "prefer_names": ["微信", "WeChat"],
        "exclude_names": ["企业微信", "WXWork"],
        "category": "im",
    },
    {
        "terms": ["qq邮箱", "qq mail", "qqmail"],
        "prefer_names": ["QQ邮箱", "QQMail"],
        "exclude_names": ["QQ", "QQ音乐", "TIM"],
        "category": "mail",
    },
    {
        "terms": ["腾讯qq", "qq"],
        "prefer_names": ["QQ", "腾讯QQ"],
        "exclude_names": ["QQ音乐", "QQMusic", "QQ邮箱", "TIM", "QQ飞车"],
        "category": "im",
    },
    {
        "terms": ["tim"],
        "prefer_names": ["TIM"],
        "exclude_names": ["QQ", "QQ音乐"],
        "category": "im",
    },
    {
        "terms": ["钉钉", "dingtalk", "ding ding"],
        "prefer_names": ["钉钉", "DingTalk"],
        "exclude_names": [],
        "category": "im",
    },
    {
        "terms": ["飞书", "lark", "feishu"],
        "prefer_names": ["飞书", "Lark", "Feishu"],
        "exclude_names": [],
        "category": "im",
    },
    {
        "terms": ["telegram", "tg"],
        "prefer_names": ["Telegram"],
        "exclude_names": [],
        "category": "im",
    },
    {
        "terms": ["discord"],
        "prefer_names": ["Discord"],
        "exclude_names": [],
        "category": "im",
    },
    {
        "terms": ["谷歌浏览器", "谷歌chrome", "google chrome", "chrome"],
        "prefer_names": ["Google Chrome", "Chrome"],
        "exclude_names": ["Microsoft Edge", "Edge", "Firefox"],
        "category": "browser",
    },
    {
        "terms": ["微软edge", "microsoft edge", "edge浏览器", "edge"],
        "prefer_names": ["Microsoft Edge", "Edge"],
        "exclude_names": ["Google Chrome", "Chrome", "Firefox"],
        "category": "browser",
    },
    {
        "terms": ["firefox", "火狐"],
        "prefer_names": ["Firefox", "Mozilla Firefox"],
        "exclude_names": [],
        "category": "browser",
    },
    {
        "terms": ["记事本", "notepad"],
        "prefer_names": ["记事本", "Notepad"],
        "exclude_names": [],
        "category": "system",
    },
    {
        "terms": ["计算器", "calculator", "calc"],
        "prefer_names": ["计算器", "Calculator"],
        "exclude_names": [],
        "category": "system",
    },
    {
        "terms": ["文件资源管理器", "资源管理器", "explorer"],
        "prefer_names": ["文件资源管理器", "Explorer"],
        "exclude_names": [],
        "category": "system",
    },
    {
        "terms": ["任务管理器", "taskmgr", "task manager"],
        "prefer_names": ["任务管理器", "Task Manager"],
        "exclude_names": [],
        "category": "system",
    },
    {
        "terms": ["vscode", "vs code", "visual studio code"],
        "prefer_names": ["Visual Studio Code", "Code"],
        "exclude_names": ["Cursor"],
        "category": "dev",
    },
    {
        "terms": ["cursor"],
        "prefer_names": ["Cursor"],
        "exclude_names": ["Visual Studio Code", "Code"],
        "category": "dev",
    },
    {
        "terms": ["word", "微软word", "winword"],
        "prefer_names": ["Word", "Microsoft Word"],
        "exclude_names": [],
        "category": "office",
    },
    {
        "terms": ["excel", "微软excel"],
        "prefer_names": ["Excel", "Microsoft Excel"],
        "exclude_names": [],
        "category": "office",
    },
    {
        "terms": ["powerpoint", "ppt", "微软ppt"],
        "prefer_names": ["PowerPoint", "Microsoft PowerPoint"],
        "exclude_names": [],
        "category": "office",
    },
    {
        "terms": ["wps", "wps office"],
        "prefer_names": ["WPS Office", "WPS"],
        "exclude_names": [],
        "category": "office",
    },
    {
        "terms": ["百度网盘", "baidunetdisk", "百度云"],
        "prefer_names": ["百度网盘", "BaiduNetdisk"],
        "exclude_names": [],
        "category": "tool",
    },
    {
        "terms": ["迅雷", "xunlei", "thunder"],
        "prefer_names": ["迅雷", "Thunder"],
        "exclude_names": [],
        "category": "tool",
    },
    {
        "terms": ["steam"],
        "prefer_names": ["Steam"],
        "exclude_names": [],
        "category": "game",
    },
    {
        "terms": ["支付宝", "alipay"],
        "prefer_names": ["支付宝", "Alipay"],
        "exclude_names": [],
        "category": "finance",
    },
    {
        "terms": ["淘宝", "taobao"],
        "prefer_names": ["淘宝", "Taobao"],
        "exclude_names": [],
        "category": "shopping",
    },
]


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _dumps(value: Any) -> str:
    return json.dumps(value if value is not None else [], ensure_ascii=False)


def _loads(text: str) -> list[Any]:
    try:
        data = json.loads(text or "[]")
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def _bump_version(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT v FROM hub_desktop_alias_meta WHERE k=%s", ("rules_version",))
        row = cur.fetchone()
        cur_v = int((row or {}).get("v") or 0)
        new_v = cur_v + 1
        now = _now()
        if row:
            cur.execute(
                "UPDATE hub_desktop_alias_meta SET v=%s, updated_at=%s WHERE k=%s",
                (str(new_v), now, "rules_version"),
            )
        else:
            cur.execute(
                "INSERT INTO hub_desktop_alias_meta (k, v, updated_at) VALUES (%s, %s, %s)",
                ("rules_version", str(new_v), now),
            )
    return new_v


def get_rules_version() -> int:
    ensure_desktop_alias_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT v FROM hub_desktop_alias_meta WHERE k=%s", ("rules_version",))
            row = cur.fetchone()
            return int((row or {}).get("v") or 0)
    finally:
        conn.close()


def ensure_builtin_seed() -> int:
    """空库时导入内置种子，返回当前 version。"""
    ensure_desktop_alias_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM hub_desktop_alias_rules WHERE scope='global' AND source='builtin_seed'"
            )
            row = cur.fetchone() or {}
            if int(row.get("c") or 0) > 0:
                return get_rules_version()
            cur.execute("SELECT COUNT(*) AS c FROM hub_desktop_alias_rules WHERE scope='global'")
            row = cur.fetchone() or {}
            if int(row.get("c") or 0) > 0:
                return get_rules_version()

        version = _bump_version(conn)
        now = _now()
        with conn.cursor() as cur:
            for item in _BUILTIN_SEED:
                rid = uuid.uuid4().hex
                cur.execute(
                    """
                    INSERT INTO hub_desktop_alias_rules (
                        id, scope, tenant_id, user_id, terms_json, prefer_json, exclude_json,
                        category, exe_hints_json, status, source, version, created_at, updated_at
                    ) VALUES (
                        %s,'global','','',%s,%s,%s,%s,'[]','published','builtin_seed',%s,%s,%s
                    )
                    """,
                    (
                        rid,
                        _dumps(item.get("terms") or []),
                        _dumps(item.get("prefer_names") or []),
                        _dumps(item.get("exclude_names") or []),
                        str(item.get("category") or "general"),
                        version,
                        now,
                        now,
                    ),
                )
        conn.commit()
        return version
    finally:
        conn.close()


def list_published_rules(*, user_id: str = "", since_version: int = 0) -> dict[str, Any]:
    ensure_desktop_alias_tables()
    version = ensure_builtin_seed()
    if since_version and since_version >= version:
        return {
            "error": None,
            "not_modified": True,
            "version": version,
            "etag": str(version),
            "rules": [],
            "scopes": ["global", "user"],
        }

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, scope, terms_json, prefer_json, exclude_json, category, source, version
                FROM hub_desktop_alias_rules
                WHERE status='published'
                  AND (
                    scope='global'
                    OR (scope='user' AND user_id=%s)
                  )
                ORDER BY scope DESC, updated_at DESC
                """,
                (user_id or "",),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()

    rules: list[dict[str, Any]] = []
    scopes: set[str] = set()
    for row in rows:
        scope = str(row.get("scope") or "global")
        scopes.add(scope)
        rules.append(
            {
                "id": str(row.get("id") or ""),
                "scope": scope,
                "terms": _loads(str(row.get("terms_json") or "[]")),
                "prefer_names": _loads(str(row.get("prefer_json") or "[]")),
                "exclude_names": _loads(str(row.get("exclude_json") or "[]")),
                "category": str(row.get("category") or "general"),
                "source": str(row.get("source") or ""),
                "version": int(row.get("version") or version),
            }
        )
    return {
        "error": None,
        "not_modified": False,
        "version": version,
        "etag": str(version),
        "rules": rules,
        "scopes": sorted(scopes | {"global", "user"}),
    }


def create_learn_candidate(
    *,
    user_id: str,
    device_id: str = "",
    payload: dict[str, Any],
) -> dict[str, Any]:
    ensure_desktop_alias_tables()
    if not user_id:
        raise ValueError("缺少用户")
    term = str(payload.get("matched_term") or "").strip()
    prefer = payload.get("prefer_names") or []
    if not term or not prefer:
        raise ValueError("学习候选缺少 term/prefer_names")
    cid = str(payload.get("id") or "").strip() or uuid.uuid4().hex
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # 同用户同 term pending 去重：更新最新一条
            cur.execute(
                """
                SELECT id FROM hub_desktop_alias_learn
                WHERE user_id=%s AND matched_term=%s AND status='pending'
                ORDER BY created_at DESC LIMIT 1
                """,
                (user_id, term),
            )
            existing = cur.fetchone()
            if existing:
                cid = str(existing["id"])
                cur.execute(
                    """
                    UPDATE hub_desktop_alias_learn SET
                        device_id=%s, raw_goal=%s, prefer_json=%s, exclude_json=%s,
                        category=%s, resolved_launch=%s, resolved_display=%s,
                        exe_name=%s, exe_path_hash=%s, job_id=%s,
                        verify_passed=%s, confidence=%s, updated_at=%s
                    WHERE id=%s
                    """,
                    (
                        device_id or "",
                        str(payload.get("raw_goal") or "")[:512],
                        _dumps(prefer),
                        _dumps(payload.get("exclude_names") or []),
                        str(payload.get("category") or "general"),
                        str(payload.get("resolved_launch") or "")[:256],
                        str(payload.get("resolved_display") or "")[:256],
                        str(payload.get("exe_name") or "")[:128],
                        str(payload.get("exe_path_hash") or "")[:32],
                        str(payload.get("job_id") or "")[:64],
                        1 if payload.get("verify_passed") else 0,
                        float(payload.get("confidence") or 0),
                        now,
                        cid,
                    ),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO hub_desktop_alias_learn (
                        id, user_id, device_id, raw_goal, matched_term, prefer_json, exclude_json,
                        category, resolved_launch, resolved_display, exe_name, exe_path_hash,
                        job_id, verify_passed, confidence, status, created_at, updated_at
                    ) VALUES (
                        %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending',%s,%s
                    )
                    """,
                    (
                        cid,
                        user_id,
                        device_id or "",
                        str(payload.get("raw_goal") or "")[:512],
                        term[:128],
                        _dumps(prefer),
                        _dumps(payload.get("exclude_names") or []),
                        str(payload.get("category") or "general"),
                        str(payload.get("resolved_launch") or "")[:256],
                        str(payload.get("resolved_display") or "")[:256],
                        str(payload.get("exe_name") or "")[:128],
                        str(payload.get("exe_path_hash") or "")[:32],
                        str(payload.get("job_id") or "")[:64],
                        1 if payload.get("verify_passed") else 0,
                        float(payload.get("confidence") or 0),
                        now,
                        now,
                    ),
                )
        conn.commit()
    finally:
        conn.close()
    return {"error": None, "ok": True, "id": cid, "status": "pending"}


def confirm_learn_candidate(*, user_id: str, candidate_id: str) -> dict[str, Any]:
    ensure_desktop_alias_tables()
    conn = get_connection()
    rid = ""
    version = 0
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM hub_desktop_alias_learn WHERE id=%s AND user_id=%s",
                (candidate_id, user_id),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("候选不存在")
            if str(row.get("status")) not in ("pending", "auto_user"):
                raise ValueError("候选状态不可确认")
        version = _bump_version(conn)
        now = _now()
        rid = uuid.uuid4().hex
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hub_desktop_alias_rules (
                    id, scope, tenant_id, user_id, terms_json, prefer_json, exclude_json,
                    category, exe_hints_json, status, source, version, created_at, updated_at
                ) VALUES (
                    %s,'user','',%s,%s,%s,%s,%s,'[]','published','learned',%s,%s,%s
                )
                """,
                (
                    rid,
                    user_id,
                    _dumps([str(row.get("matched_term") or "")]),
                    str(row.get("prefer_json") or "[]"),
                    str(row.get("exclude_json") or "[]"),
                    str(row.get("category") or "general"),
                    version,
                    now,
                    now,
                ),
            )
            cur.execute(
                "UPDATE hub_desktop_alias_learn SET status='confirmed', updated_at=%s WHERE id=%s",
                (now, candidate_id),
            )
        conn.commit()
    finally:
        conn.close()
    return {"error": None, "ok": True, "rule_id": rid, "version": version}


def reject_learn_candidate(*, user_id: str, candidate_id: str) -> dict[str, Any]:
    ensure_desktop_alias_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE hub_desktop_alias_learn SET status='rejected', updated_at=%s WHERE id=%s AND user_id=%s",
                (_now(), candidate_id, user_id),
            )
            if cur.rowcount <= 0:
                raise ValueError("候选不存在")
        conn.commit()
    finally:
        conn.close()
    return {"error": None, "ok": True}


def list_my_learn(*, user_id: str, limit: int = 50) -> dict[str, Any]:
    ensure_desktop_alias_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, raw_goal, matched_term, prefer_json, exclude_json, category,
                       confidence, status, created_at
                FROM hub_desktop_alias_learn
                WHERE user_id=%s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (user_id, max(1, min(int(limit or 50), 100))),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()
    items = []
    for row in rows:
        items.append(
            {
                "id": str(row.get("id") or ""),
                "raw_goal": str(row.get("raw_goal") or ""),
                "matched_term": str(row.get("matched_term") or ""),
                "prefer_names": _loads(str(row.get("prefer_json") or "[]")),
                "exclude_names": _loads(str(row.get("exclude_json") or "[]")),
                "category": str(row.get("category") or "general"),
                "confidence": float(row.get("confidence") or 0),
                "status": str(row.get("status") or ""),
                "created_at": str(row.get("created_at") or ""),
            }
        )
    return {"error": None, "candidates": items}
