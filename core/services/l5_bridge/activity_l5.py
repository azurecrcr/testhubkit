# -*- coding: utf-8 -*-
"""审计与缺陷活动日志（仅追加）。"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def record_defect_activity_l5(
    defect_id: str, actor_id: str, action: str, payload: dict | None = None
) -> None:
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO dm_defect_activity_l5 "
                "(id, defect_id, actor_id, action, payload_json, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s)",
                (
                    _new_id(),
                    str(defect_id or "").strip(),
                    str(actor_id or "").strip(),
                    str(action or "")[:64],
                    json.dumps(payload or {}, ensure_ascii=False)[:4000],
                    _now(),
                ),
            )
    finally:
        conn.close()


def list_defect_activity_l5(defect_id: str, limit: int = 50) -> list[dict[str, Any]]:
    ensure_l5_tables()
    lim = max(1, min(int(limit or 50), 200))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, defect_id, actor_id, action, payload_json, created_at "
                "FROM dm_defect_activity_l5 WHERE defect_id=%s "
                "ORDER BY created_at DESC LIMIT %s",
                (str(defect_id or "").strip(), lim),
            )
            rows = cur.fetchall() or []
        actor_ids = sorted(
            {
                str(r.get("actor_id") or "").strip()
                for r in rows
                if str(r.get("actor_id") or "").strip()
            }
        )
        actor_names = {uid: _actor_name_l5(uid) for uid in actor_ids}
        out = []
        for r in rows:
            payload = {}
            try:
                payload = json.loads(r.get("payload_json") or "{}")
            except Exception:  # noqa: BLE001
                payload = {}
            actor_id = str(r.get("actor_id") or "").strip()
            out.append(
                {
                    "id": str(r.get("id") or ""),
                    "defect_id": str(r.get("defect_id") or ""),
                    "actor_id": actor_id,
                    "actor_name": actor_names.get(actor_id) or (_actor_name_l5(actor_id) if actor_id else "—"),
                    "action": str(r.get("action") or ""),
                    "payload": payload,
                    "created_at": str(r.get("created_at") or ""),
                }
            )
        return out
    finally:
        conn.close()


# action 原始码 → 中文（列表/导出展示用；库内仍存英文码）
AUDIT_ACTION_LABELS: dict[str, str] = {
    "run.create": "创建测试执行",
    "execution_create_defect": "执行中创建缺陷",
    "defect.status": "变更缺陷状态",
    "defect.enrich": "补充缺陷信息",
    "sync.apply": "应用工作台同步",
    "access.denied": "权限拒绝",
    "audit.export": "导出审计",
    "plan.release_status": "更新发布状态",
    # 用例管理日常操作
    "case.create": "新建用例",
    "case.update": "编辑用例",
    "case.delete": "删除用例",
    "case.batch_status": "批量改状态",
    "case.batch_move": "批量移动",
    "case.batch_copy": "批量复制",
    "case.import_excel": "导入 Excel",
    "case.export_excel": "导出 Excel",
    "suite.create": "新建目录",
    "member.invite": "成员邀请",
    "execution.create": "登记执行结果",
}

# 前端已下线能力：停止继续写入（历史记录仍可查，但不再新增）
AUDIT_ACTIONS_DISABLED: frozenset[str] = frozenset(
    {
        "plan.bind_baseline",  # 历史：基线已下线
        "baseline.create",  # 历史：基线已下线
        "regression.pending",
        "regression.cleared",
        "regression.force_clear",
        "settings.save",
        "gate.rules_save",  # 历史：自动门禁规则已下线
        "ops_selftest",
    }
)

# 仅用于历史日志中文展示 / 筛选，不再作为可写动作
AUDIT_ACTION_LABELS_LEGACY: dict[str, str] = {
    "plan.bind_baseline": "绑定版本基线",
    "baseline.create": "创建版本基线",
    "regression.pending": "标记待回归",
    "regression.cleared": "清除待回归",
    "regression.force_clear": "强制清除待回归",
    "settings.save": "保存项目设置",
    "gate.rules_save": "保存门禁规则",
    "ops_selftest": "运维自检",
}

REF_TYPE_LABELS: dict[str, str] = {
    "case": "用例",
    "defect": "缺陷",
    "plan": "测试计划",
    "run": "测试执行",
    "project": "项目",
    "sync_batch": "同步批次",
    "action": "动作",
    "baseline": "版本基线",  # 历史 ref_type，仅展示
}


def action_label_l5(action: str) -> str:
    code = str(action or "").strip()
    if not code:
        return ""
    return (
        AUDIT_ACTION_LABELS.get(code)
        or AUDIT_ACTION_LABELS_LEGACY.get(code)
        or code
    )


def resolve_audit_action_filter_l5(raw: str) -> str:
    """筛选框可填英文码或中文标签，统一成库内 action。"""
    text = str(raw or "").strip()
    if not text:
        return ""
    if text in AUDIT_ACTION_LABELS or text in AUDIT_ACTION_LABELS_LEGACY:
        return text
    for code, label in {**AUDIT_ACTION_LABELS, **AUDIT_ACTION_LABELS_LEGACY}.items():
        if label == text:
            return code
    return text


def _actor_name_l5(actor_id: str) -> str:
    from core.services.defect_management.defect_db import _user_brief

    uid = str(actor_id or "").strip()
    if not uid or uid == "anonymous":
        return "匿名"
    brief = _user_brief(uid)
    return str(
        brief.get("display_name")
        or brief.get("label")
        or brief.get("email")
        or brief.get("phone_masked")
        or uid
    )


def _batch_titles_by_ids(
    table: str,
    ids: list[str],
    *,
    title_cols: tuple[str, ...],
) -> dict[str, str]:
    """批量取标题；title_cols 按优先级拼接。"""
    clean = [str(x or "").strip() for x in ids if str(x or "").strip()]
    if not clean:
        return {}
    # 表白名单，避免拼接注入
    allowed = {
        "cm_test_cases": "cm_test_cases",
        "dm_defects": "dm_defects",
        "cm_test_plans_l5": "cm_test_plans_l5",
        "cm_test_runs_l5": "cm_test_runs_l5",
        "cm_projects": "cm_projects",
        "cm_workbench_sync_batches_l5": "cm_workbench_sync_batches_l5",
    }
    tbl = allowed.get(table)
    if not tbl:
        return {}
    cols = [c for c in title_cols if c.replace("_", "").isalnum()]
    if not cols:
        return {}
    select_cols = ", ".join(["id"] + cols)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            fmt = ",".join(["%s"] * len(clean))
            cur.execute(
                "SELECT " + select_cols + " FROM " + tbl + " WHERE id IN (" + fmt + ")",
                tuple(clean),
            )
            rows = cur.fetchall() or []
        out: dict[str, str] = {}
        for r in rows:
            rid = str(r.get("id") or "")
            parts: list[str] = []
            for c in cols:
                v = str(r.get(c) or "").strip()
                if v:
                    parts.append(v)
            if rid:
                out[rid] = " ".join(parts) if parts else rid
        return out
    finally:
        conn.close()


def enrich_audit_items_l5(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """为审计条目补充中文动作、对象名、操作者昵称。"""
    if not items:
        return items

    actor_ids = sorted({str(a.get("actor_id") or "").strip() for a in items if a.get("actor_id")})
    actor_names = {uid: _actor_name_l5(uid) for uid in actor_ids}

    by_type: dict[str, list[str]] = {}
    for a in items:
        rt = str(a.get("ref_type") or "").strip()
        rid = str(a.get("ref_id") or "").strip()
        if rt and rid:
            by_type.setdefault(rt, []).append(rid)

    case_map = _batch_titles_by_ids(
        "cm_test_cases", by_type.get("case") or [], title_cols=("title",)
    )
    defect_ids = by_type.get("defect") or []
    defect_map: dict[str, str] = {}
    if defect_ids:
        clean = [str(x or "").strip() for x in defect_ids if str(x or "").strip()]
        if clean:
            conn = get_connection()
            try:
                with conn.cursor() as cur:
                    fmt = ",".join(["%s"] * len(clean))
                    cur.execute(
                        "SELECT id, number, title FROM dm_defects WHERE id IN (" + fmt + ")",
                        tuple(clean),
                    )
                    for r in cur.fetchall() or []:
                        did = str(r.get("id") or "")
                        num = r.get("number")
                        title = str(r.get("title") or "").strip()
                        if not did:
                            continue
                        if num is not None and str(num).strip() != "":
                            label = "D-" + str(int(num) if str(num).isdigit() else num)
                            if title:
                                label += " " + title
                            defect_map[did] = label
                        else:
                            defect_map[did] = title or did
            finally:
                conn.close()

    plan_map = _batch_titles_by_ids(
        "cm_test_plans_l5", by_type.get("plan") or [], title_cols=("name",)
    )
    run_map = _batch_titles_by_ids(
        "cm_test_runs_l5", by_type.get("run") or [], title_cols=("name",)
    )
    project_map = _batch_titles_by_ids(
        "cm_projects", by_type.get("project") or [], title_cols=("name",)
    )
    sync_map = _batch_titles_by_ids(
        "cm_workbench_sync_batches_l5",
        by_type.get("sync_batch") or [],
        title_cols=("source_ref",),
    )

    type_maps = {
        "case": case_map,
        "defect": defect_map,
        "plan": plan_map,
        "run": run_map,
        "project": project_map,
        "sync_batch": sync_map,
    }

    out: list[dict[str, Any]] = []
    for a in items:
        item = dict(a)
        action = str(item.get("action") or "")
        rt = str(item.get("ref_type") or "").strip()
        rid = str(item.get("ref_id") or "").strip()
        type_zh = REF_TYPE_LABELS.get(rt) or (rt or "对象")
        name = ""
        if rt and rid:
            name = (type_maps.get(rt) or {}).get(rid) or ""
        if name:
            ref_label = type_zh + "：" + name
        elif rid:
            ref_label = type_zh + "：" + rid[:8]
        elif rt:
            ref_label = type_zh
        else:
            ref_label = "—"
        actor_id = str(item.get("actor_id") or "").strip()
        item["action_label"] = action_label_l5(action)
        item["ref_label"] = ref_label
        item["actor_name"] = actor_names.get(actor_id) or (_actor_name_l5(actor_id) if actor_id else "—")
        out.append(item)
    return out


def write_audit_l5(
    project_id: str,
    actor_id: str,
    action: str,
    *,
    ref_type: str | None = None,
    ref_id: str | None = None,
    payload: dict | None = None,
) -> None:
    act = str(action or "").strip()
    if not act or act in AUDIT_ACTIONS_DISABLED:
        return
    pid = str(project_id or "").strip()
    if not pid:
        return
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO cm_project_audit_l5 "
                "(id, project_id, actor_id, action, ref_type, ref_id, payload_json, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    _new_id(),
                    pid,
                    str(actor_id or "").strip(),
                    act[:64],
                    (ref_type or None),
                    (ref_id or None),
                    json.dumps(payload or {}, ensure_ascii=False)[:4000],
                    _now(),
                ),
            )
    finally:
        conn.close()


def list_audit_l5(
    user_id: str,
    project_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """新方法：项目审计列表。"""
    page = list_audit_page_l5(user_id, project_id, limit=limit, offset=offset)
    return page["items"]


def _rows_to_audit_items(rows: list) -> list[dict[str, Any]]:
    out = []
    for r in rows:
        payload = {}
        try:
            payload = json.loads(r.get("payload_json") or "{}")
        except Exception:  # noqa: BLE001
            payload = {}
        out.append(
            {
                "id": str(r.get("id") or ""),
                "project_id": str(r.get("project_id") or ""),
                "actor_id": str(r.get("actor_id") or ""),
                "action": str(r.get("action") or ""),
                "ref_type": str(r.get("ref_type") or "") or None,
                "ref_id": str(r.get("ref_id") or "") or None,
                "payload": payload,
                "created_at": str(r.get("created_at") or ""),
            }
        )
    return enrich_audit_items_l5(out)


def list_audit_page_l5(
    user_id: str,
    project_id: str,
    *,
    action: str = "",
    actor_id: str = "",
    limit: int = 10,
    offset: int = 0,
) -> dict[str, Any]:
    """分页审计列表，返回 items / total / limit / offset。"""
    from core.services.case_management.access import assert_project_viewer

    assert_project_viewer(user_id, project_id)
    ensure_l5_tables()
    lim = max(1, min(int(limit or 10), 200))
    off = max(0, int(offset or 0))
    where = ["project_id=%s"]
    params: list[Any] = [str(project_id).strip()]
    if action:
        where.append("action=%s")
        params.append(resolve_audit_action_filter_l5(action)[:64])
    if actor_id:
        where.append("actor_id=%s")
        params.append(str(actor_id).strip())
    where_sql = " AND ".join(where)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_project_audit_l5 WHERE " + where_sql,
                tuple(params),
            )
            total = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                "SELECT id, project_id, actor_id, action, ref_type, ref_id, payload_json, created_at "
                "FROM cm_project_audit_l5 WHERE "
                + where_sql
                + " ORDER BY created_at DESC LIMIT %s OFFSET %s",
                tuple(params + [lim, off]),
            )
            rows = cur.fetchall() or []
        return {
            "items": _rows_to_audit_items(rows),
            "total": total,
            "limit": lim,
            "offset": off,
        }
    finally:
        conn.close()


def list_relations_l5(defect_id: str) -> list[dict[str, Any]]:
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT from_id, to_id, rel_type, created_at FROM dm_defect_relations_l5 "
                "WHERE from_id=%s OR to_id=%s ORDER BY created_at DESC",
                (str(defect_id).strip(), str(defect_id).strip()),
            )
            rows = cur.fetchall() or []
        return [
            {
                "from_id": str(r.get("from_id") or ""),
                "to_id": str(r.get("to_id") or ""),
                "rel_type": str(r.get("rel_type") or ""),
                "created_at": str(r.get("created_at") or ""),
            }
            for r in rows
        ]
    finally:
        conn.close()


def relate_defects_l5(from_id: str, to_id: str, rel_type: str = "related") -> None:
    ensure_l5_tables()
    rt = str(rel_type or "related").strip().lower()
    if rt not in ("duplicate", "parent", "related"):
        raise ValueError("rel_type 无效")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT IGNORE INTO dm_defect_relations_l5 "
                "(from_id, to_id, rel_type, created_at) VALUES (%s,%s,%s,%s)",
                (str(from_id).strip(), str(to_id).strip(), rt, _now()),
            )
    finally:
        conn.close()


def update_defect_enrich_l5(
    *,
    defect_id: str,
    actor_id: str,
    repro_steps: str | None = None,
    expected_result: str | None = None,
    actual_result: str | None = None,
    environment: str | None = None,
    module: str | None = None,
    find_phase: str | None = None,
    defect_type: str | None = None,
    priority: str | None = None,
    evidence_url: str | None = None,
) -> dict[str, Any]:
    """仅更新 L5 扩展字段，不改旧 update_defect。"""
    ensure_l5_tables()
    fields = []
    args: list[Any] = []
    mapping = {
        "repro_steps": repro_steps,
        "expected_result": expected_result,
        "actual_result": actual_result,
        "environment": environment,
        "module": module,
        "find_phase": find_phase,
        "defect_type": defect_type,
        "priority": priority,
        "evidence_url": evidence_url,
    }
    for col, val in mapping.items():
        if val is not None:
            fields.append("%s = %%s" % col)
            if col == "evidence_url":
                args.append(str(val)[:1000])
            elif col.endswith("result") or col == "repro_steps":
                args.append(str(val)[:8000])
            else:
                args.append(str(val)[:200])
    if not fields:
        from core.services.defect_management.defect_db import get_defect

        return get_defect(defect_id) or {}
    args.append(_now())
    args.append(str(defect_id).strip())
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE dm_defects SET " + ", ".join(fields) + ", updated_at=%s WHERE id=%s",
                tuple(args),
            )
    finally:
        conn.close()
    record_defect_activity_l5(defect_id, actor_id, "enrich_update", mapping)
    from core.services.defect_management.defect_db import get_defect
    from core.services.l5_bridge.nav_meta_l5 import serialize_defect_l5

    item = serialize_defect_l5(defect_id) or get_defect(defect_id) or {}
    write_audit_l5(
        str(item.get("project_id") or ""),
        actor_id,
        "defect.enrich",
        ref_type="defect",
        ref_id=defect_id,
        payload={"keys": [k for k, v in mapping.items() if v is not None]},
    )
    return item


def list_audit_filtered_l5(
    user_id: str,
    project_id: str,
    *,
    action: str = "",
    actor_id: str = "",
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """新方法：带筛选的审计列表（不改 list_audit_l5）。"""
    page = list_audit_page_l5(
        user_id,
        project_id,
        action=action,
        actor_id=actor_id,
        limit=limit,
        offset=offset,
    )
    return page["items"]


def export_audit_csv_l5(user_id: str, project_id: str, *, limit: int = 500) -> str:
    import csv
    import io

    items = list_audit_filtered_l5(user_id, project_id, limit=limit)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["时间", "动作", "操作者", "对象", "备注"])
    for a in items:
        w.writerow(
            [
                a.get("created_at"),
                a.get("action_label") or action_label_l5(str(a.get("action") or "")),
                a.get("actor_name") or a.get("actor_id") or "",
                a.get("ref_label") or "",
                json.dumps(a.get("payload") or {}, ensure_ascii=False),
            ]
        )
    return buf.getvalue()

