"""目录列结构（schema）独立服务：一目录一套列，不影响工作台。"""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Any, Optional

from core.services.case_management.access import assert_owned_row, assert_project_editor, assert_project_viewer
from core.services.case_management.project_db import ensure_cm_tables, touch_project
from core.services.case_management.suite_db import (
    assert_suite_in_project,
    collect_suite_subtree_ids,
    get_suite,
)
from core.services.test_cases.mysql_db import get_connection

ROLE_SYNONYMS: dict[str, tuple[str, ...]] = {
    "title": ("用例名称", "用例标题", "标题", "case name", "name"),
    "priority": ("优先级", "用例等级", "等级", "priority"),
    "status": ("状态", "status"),
    "precondition": ("前置条件", "前置", "precondition"),
    "steps": ("步骤描述", "步骤", "操作步骤", "steps"),
    "expect": ("预期结果", "期望结果", "预期", "expect", "expected"),
    "tags": ("标签", "tags", "tag"),
    "module": ("所属模块", "模块", "module"),
}

DEFAULT_TEMPLATE_LABELS = [
    ("用例名称", "title"),
    ("所属模块", "module"),
    ("优先级", "priority"),
    ("状态", "status"),
    ("前置条件", "precondition"),
    ("步骤描述", "steps"),
    ("预期结果", "expect"),
    ("标签", "tags"),
]

# 导入锁定表头上限；列表区域另有展示上限（前端）
MAX_SCHEMA_COLUMNS = 30


def assert_schema_column_limit(columns: list[Any] | None) -> None:
    n = len(columns or [])
    if n > MAX_SCHEMA_COLUMNS:
        raise ValueError(
            f"表头列数不能超过 {MAX_SCHEMA_COLUMNS} 列（当前 {n} 列），请精简后再导入"
        )


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def normalize_label(label: str) -> str:
    text = str(label or "").strip()
    text = re.sub(r"\s+", "", text)
    return text.lower()


def infer_role(label: str) -> str:
    norm = normalize_label(label)
    for role, aliases in ROLE_SYNONYMS.items():
        for alias in aliases:
            if normalize_label(alias) == norm:
                return role
    return "custom"


def _role_key(role: str, label: str, used: set[str]) -> str:
    if role == "title":
        base = "title"
    elif role in ("priority", "status", "precondition", "steps", "expect", "tags", "module"):
        base = role if role != "module" else "col_module"
    else:
        slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "_", str(label or "field")).strip("_")
        if not slug:
            slug = "field"
        base = "col_" + slug[:40]
    key = base
    n = 2
    while key in used:
        key = "%s_%d" % (base, n)
        n += 1
    used.add(key)
    return key


def build_columns_from_headers(headers: list[str]) -> list[dict[str, Any]]:
    used: set[str] = set()
    columns: list[dict[str, Any]] = []
    seen_norm: set[str] = set()
    for raw in headers or []:
        label = str(raw or "").strip()
        if not label:
            continue
        norm = normalize_label(label)
        if norm in seen_norm:
            continue
        seen_norm.add(norm)
        role = infer_role(label)
        # 同一 role 只保留第一次（title/priority 等）
        if role != "custom" and any(c.get("role") == role for c in columns):
            role = "custom"
        key = _role_key(role, label, used)
        # 导入锁定后列表默认展示全部列（含前置/步骤/预期），与确认弹层一致
        list_visible = True
        columns.append(
            {
                "key": key,
                "label": label,
                "role": role,
                "required": role == "title",
                "list_visible": bool(list_visible),
                "aliases": [],
            }
        )
    if not any(c.get("role") == "title" for c in columns):
        # 强制补标题列
        columns.insert(
            0,
            {
                "key": "title",
                "label": "用例名称",
                "role": "title",
                "required": True,
                "list_visible": True,
                "aliases": [],
            },
        )
    assert_schema_column_limit(columns)
    return columns


def default_template_columns() -> list[dict[str, Any]]:
    used: set[str] = set()
    out: list[dict[str, Any]] = []
    for label, role in DEFAULT_TEMPLATE_LABELS:
        key = _role_key(role, label, used)
        out.append(
            {
                "key": key,
                "label": label,
                "role": role,
                "required": role == "title",
                "list_visible": role in ("title", "priority", "status", "module", "tags"),
                "aliases": [],
            }
        )
    return out


def _serialize_schema(row: dict[str, Any]) -> dict[str, Any]:
    try:
        columns = json.loads(row.get("columns_json") or "[]")
    except json.JSONDecodeError:
        columns = []
    if not isinstance(columns, list):
        columns = []
    return {
        "id": str(row.get("id") or ""),
        "suite_id": str(row.get("suite_id") or ""),
        "project_id": str(row.get("project_id") or ""),
        "user_id": str(row.get("user_id") or ""),
        "version": int(row.get("version") or 1),
        "status": str(row.get("status") or "empty"),
        "columns": columns,
        "source_kind": row.get("source_kind"),
        "source_ref": row.get("source_ref"),
        "locked_at": str(row.get("locked_at") or "") or None,
        "updated_at": str(row.get("updated_at") or ""),
    }


def get_schema_by_suite(suite_id: str) -> Optional[dict[str, Any]]:
    sid = str(suite_id or "").strip()
    if not sid:
        return None
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM cm_suite_schemas WHERE suite_id = %s LIMIT 1",
                (sid,),
            )
            row = cur.fetchone()
        return _serialize_schema(row) if row else None
    finally:
        conn.close()


def get_suite_schema(user_id: str, suite_id: str) -> dict[str, Any]:
    suite = assert_owned_row(get_suite(suite_id), user_id, not_found="目录不存在")
    schema = get_schema_by_suite(str(suite["id"]))
    if schema:
        return schema
    return {
        "id": "",
        "suite_id": str(suite["id"]),
        "project_id": str(suite.get("project_id") or ""),
        "user_id": str(user_id),
        "version": 0,
        "status": "empty",
        "columns": [],
        "source_kind": None,
        "source_ref": None,
        "locked_at": None,
        "updated_at": "",
    }


def _schema_columns_signature(columns: list[dict[str, Any]] | None) -> tuple:
    cols = columns or []
    return tuple(
        (
            str(c.get("key") or ""),
            str(c.get("role") or ""),
            str(c.get("label") or ""),
        )
        for c in cols
    )


def _pick_best_locked_schema(candidates: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not candidates:
        return None
    counts: dict[tuple, int] = {}
    first_by_sig: dict[tuple, dict[str, Any]] = {}
    for sch in candidates:
        sig = _schema_columns_signature(sch.get("columns") or [])
        counts[sig] = counts.get(sig, 0) + 1
        if sig not in first_by_sig:
            first_by_sig[sig] = sch
    best_sig = None
    best_count = -1
    for sig, cnt in counts.items():
        if cnt > best_count:
            best_count = cnt
            best_sig = sig
    return dict(first_by_sig.get(best_sig) or candidates[0])


def _collect_locked_in_subtree(
    project_id: str, root_suite_id: str, *, exclude_ids: Optional[set[str]] = None
) -> list[dict[str, Any]]:
    exclude = exclude_ids or set()
    subtree = collect_suite_subtree_ids(project_id, root_suite_id)
    out: list[dict[str, Any]] = []
    for sid in subtree:
        if str(sid) in exclude:
            continue
        sch = get_schema_by_suite(str(sid))
        if sch and str(sch.get("status") or "") == "locked" and (sch.get("columns") or []):
            out.append(sch)
    return out


def find_inherited_locked_schema(
    user_id: str, suite_id: str
) -> Optional[dict[str, Any]]:
    """本目录未锁定时：先从父级子树继承，再回退到项目内任意已锁定目录。"""
    suite = assert_owned_row(get_suite(suite_id), user_id, not_found="目录不存在")
    project_id = str(suite.get("project_id") or "")
    self_id = str(suite["id"])
    parent_id = suite.get("parent_id")
    guard = 0
    while parent_id and guard < 50:
        pid = str(parent_id)
        candidates = _collect_locked_in_subtree(
            project_id, pid, exclude_ids={self_id}
        )
        picked = _pick_best_locked_schema(candidates)
        if picked:
            out = dict(picked)
            out["effective_from"] = "inherited"
            out["inherited_from_suite_id"] = str(picked.get("suite_id") or "")
            out["effective_for_suite_id"] = self_id
            return out
        parent_row = get_suite(pid)
        parent_id = parent_row.get("parent_id") if parent_row else None
        guard += 1

    # 项目级：任一目录已锁定，则全项目共用该表头
    project_picked = get_project_effective_schema(user_id, project_id)
    if (
        project_picked
        and str(project_picked.get("status") or "") == "locked"
        and (project_picked.get("columns") or [])
    ):
        out = dict(project_picked)
        out["effective_from"] = "inherited"
        out["inherited_from_suite_id"] = str(project_picked.get("suite_id") or "")
        out["effective_for_suite_id"] = self_id
        return out
    return None


def get_project_effective_schema(user_id: str, project_id: str) -> dict[str, Any]:
    """项目内任一目录已锁定的列结构（用于「全部用例」与空目录继承）。"""
    assert_project_viewer(user_id, project_id)
    ensure_cm_tables()
    pid = str(project_id or "").strip()
    candidates: list[dict[str, Any]] = []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, suite_id, project_id, user_id, version, status, columns_json, "
                "source_kind, source_ref, locked_at, updated_at "
                "FROM cm_suite_schemas WHERE project_id = %s AND status = 'locked'",
                (pid,),
            )
            rows = cur.fetchall() or []
        for row in rows:
            sch = _serialize_schema(row)
            if sch.get("columns"):
                candidates.append(sch)
    finally:
        conn.close()
    picked = _pick_best_locked_schema(candidates)
    if not picked:
        return {
            "id": "",
            "suite_id": "",
            "project_id": str(project_id),
            "user_id": str(user_id),
            "version": 0,
            "status": "empty",
            "columns": [],
            "source_kind": None,
            "source_ref": None,
            "locked_at": None,
            "updated_at": "",
            "effective_from": "none",
        }
    out = dict(picked)
    out["effective_from"] = "project"
    out["effective_for_project_id"] = str(project_id)
    return out


def ensure_inherited_schema(
    user_id: str, suite_id: str
) -> dict[str, Any]:
    """若本目录无锁定列、但父级/兄弟已锁定，则把列结构落到本目录。"""
    own = get_suite_schema(user_id, suite_id)
    if str(own.get("status") or "") == "locked" and (own.get("columns") or []):
        out = dict(own)
        out["effective_from"] = "self"
        return out
    inherited = find_inherited_locked_schema(user_id, suite_id)
    if not inherited or not (inherited.get("columns") or []):
        empty = dict(own)
        empty["effective_from"] = "none"
        return empty
    suite = assert_owned_row(get_suite(suite_id), user_id, not_found="目录不存在")
    locked = lock_schema(
        user_id,
        str(suite.get("project_id") or ""),
        str(suite["id"]),
        columns=list(inherited.get("columns") or []),
        source_kind="inherit",
        source_ref=str(inherited.get("inherited_from_suite_id") or inherited.get("suite_id") or "")[
            :256
        ],
        propagate=False,
    )
    out = dict(locked)
    out["effective_from"] = "inherited"
    out["inherited_from_suite_id"] = str(
        inherited.get("inherited_from_suite_id") or inherited.get("suite_id") or ""
    )
    return out


def get_effective_list_schema(user_id: str, suite_id: str) -> dict[str, Any]:
    """列表展示用：本目录锁定列 → 子目录锁定列 → 父级/兄弟继承锁定列。"""
    suite = assert_owned_row(get_suite(suite_id), user_id, not_found="目录不存在")
    own = get_schema_by_suite(str(suite["id"]))
    if own and str(own.get("status") or "") == "locked" and (own.get("columns") or []):
        out = dict(own)
        out["effective_from"] = "self"
        return out

    project_id = str(suite.get("project_id") or "")
    candidates = _collect_locked_in_subtree(
        project_id, str(suite["id"]), exclude_ids={str(suite["id"])}
    )
    picked = _pick_best_locked_schema(candidates)
    if picked:
        out = dict(picked)
        out["effective_from"] = "descendant"
        out["effective_for_suite_id"] = str(suite["id"])
        return out

    # 叶子空目录：继承父级子树（如 Web 下 1 已锁定，则 2 沿用）
    return ensure_inherited_schema(user_id, suite_id)


def _propagate_locked_schema_to_empty_relatives(
    user_id: str,
    project_id: str,
    source_suite_id: str,
    columns: list[dict[str, Any]],
) -> None:
    """某目录锁定后，同步到项目内所有尚未锁定的目录。"""
    from core.services.case_management.suite_db import list_suites

    for s in list_suites(user_id, project_id):
        tid = str(s.get("id") or "")
        if not tid or tid == str(source_suite_id):
            continue
        sch = get_schema_by_suite(tid)
        if sch and str(sch.get("status") or "") == "locked" and (sch.get("columns") or []):
            continue
        try:
            lock_schema(
                user_id,
                project_id,
                tid,
                columns=columns,
                source_kind="inherit",
                source_ref=str(source_suite_id)[:256],
                propagate=False,
            )
        except Exception:
            continue


def lock_schema(
    user_id: str,
    project_id: str,
    suite_id: str,
    *,
    columns: list[dict[str, Any]],
    source_kind: str = "",
    source_ref: str = "",
    propagate: bool = True,
) -> dict[str, Any]:
    suite = assert_suite_in_project(user_id, project_id, suite_id)
    cols = columns or []
    if not cols:
        raise ValueError("列结构不能为空")
    if not any(str(c.get("role") or "") == "title" for c in cols):
        raise ValueError("列结构必须包含标题列")
    assert_schema_column_limit(cols)
    ensure_cm_tables()
    now = _now()
    existing = get_schema_by_suite(str(suite["id"]))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if existing and existing.get("id"):
                cur.execute(
                    "UPDATE cm_suite_schemas SET version = %s, status = 'locked', "
                    "columns_json = %s, source_kind = %s, source_ref = %s, "
                    "locked_at = COALESCE(locked_at, %s), updated_at = %s "
                    "WHERE suite_id = %s",
                    (
                        int(existing.get("version") or 1) + 1,
                        json.dumps(cols, ensure_ascii=False),
                        str(source_kind or "")[:32] or None,
                        str(source_ref or "")[:256] or None,
                        now,
                        now,
                        suite["id"],
                    ),
                )
                sid = existing["id"]
            else:
                sid = _new_id()
                cur.execute(
                    "INSERT INTO cm_suite_schemas ("
                    "id, suite_id, project_id, user_id, version, status, columns_json, "
                    "source_kind, source_ref, locked_at, updated_at"
                    ") VALUES (%s,%s,%s,%s,%s,'locked',%s,%s,%s,%s,%s)",
                    (
                        sid,
                        suite["id"],
                        project_id,
                        user_id,
                        1,
                        json.dumps(cols, ensure_ascii=False),
                        str(source_kind or "")[:32] or None,
                        str(source_ref or "")[:256] or None,
                        now,
                        now,
                    ),
                )
    finally:
        conn.close()
    touch_project(project_id)
    result = get_schema_by_suite(str(suite["id"])) or {"id": sid, "status": "locked"}
    if propagate:
        _propagate_locked_schema_to_empty_relatives(
            user_id, project_id, str(suite["id"]), cols
        )
    return result


def apply_default_template(
    user_id: str, project_id: str, suite_id: str
) -> dict[str, Any]:
    return lock_schema(
        user_id,
        project_id,
        suite_id,
        columns=default_template_columns(),
        source_kind="template",
        source_ref="default",
    )


def reset_schema(user_id: str, suite_id: str) -> dict[str, Any]:
    suite = assert_owned_row(get_suite(suite_id), user_id, not_found="目录不存在")
    project_id = str(suite.get("project_id") or "")
    assert_project_editor(user_id, project_id)
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_test_cases "
                "WHERE suite_id = %s AND is_deleted = 0",
                (suite_id,),
            )
            active = int((cur.fetchone() or {}).get("c") or 0)
            if active:
                raise ValueError("目录下仍有用例，无法重置列结构")
            cur.execute("DELETE FROM cm_suite_schemas WHERE suite_id = %s", (suite_id,))
    finally:
        conn.close()
    touch_project(project_id)
    return {"reset": True, "suite_id": suite_id}


def delete_schemas_for_project(project_id: str) -> None:
    pid = str(project_id or "").strip()
    if not pid:
        return
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM cm_suite_schemas WHERE project_id = %s", (pid,))
    finally:
        conn.close()


def delete_schema_for_suite(suite_id: str) -> None:
    sid = str(suite_id or "").strip()
    if not sid:
        return
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM cm_suite_schemas WHERE suite_id = %s", (sid,))
    finally:
        conn.close()


def match_header_to_column(
    header: str, columns: list[dict[str, Any]]
) -> Optional[str]:
    """返回匹配的 schema key。"""
    norm = normalize_label(header)
    if not norm:
        return None
    for col in columns or []:
        labels = [str(col.get("label") or "")]
        labels.extend(str(a) for a in (col.get("aliases") or []) if a)
        for lab in labels:
            if normalize_label(lab) == norm:
                return str(col.get("key") or "")
        role = str(col.get("role") or "")
        for alias in ROLE_SYNONYMS.get(role, ()):
            if normalize_label(alias) == norm:
                return str(col.get("key") or "")
    return None


def compare_headers_to_schema(
    source_headers: list[str], columns: list[dict[str, Any]]
) -> dict[str, Any]:
    headers = [str(h).strip() for h in (source_headers or []) if str(h).strip()]
    suggested: dict[str, Optional[str]] = {}
    used_keys: set[str] = set()
    for h in headers:
        key = match_header_to_column(h, columns)
        if key and key in used_keys:
            suggested[h] = None
        else:
            suggested[h] = key
            if key:
                used_keys.add(key)

    required_keys = [
        str(c.get("key"))
        for c in columns
        if c.get("required") or str(c.get("role") or "") == "title"
    ]
    covered = {k for k in suggested.values() if k}
    missing_required = [k for k in required_keys if k not in covered]

    schema_norms = set()
    for c in columns:
        schema_norms.add(normalize_label(str(c.get("label") or "")))
        for a in c.get("aliases") or []:
            schema_norms.add(normalize_label(str(a)))
    source_norms = {normalize_label(h) for h in headers}

    if not missing_required and all(suggested.get(h) for h in headers) and source_norms <= (
        schema_norms
        | {
            normalize_label(a)
            for c in columns
            for a in ROLE_SYNONYMS.get(str(c.get("role") or ""), ())
        }
    ):
        # 全部源列都能映射到 schema
        if source_norms == {normalize_label(str(c.get("label") or "")) for c in columns}:
            mode = "align"
        else:
            mode = "auto_map"
    elif not missing_required and all(
        suggested.get(h) for h in headers if match_header_to_column(h, columns)
    ):
        # 有未映射列或缺映射
        if missing_required or any(suggested.get(h) is None for h in headers):
            mode = "need_map"
        else:
            mode = "auto_map"
    else:
        mode = "need_map"

    if missing_required or any(v is None for v in suggested.values()):
        # 存在无法自动映射的源列，或缺必填
        unmapped = [h for h, v in suggested.items() if not v]
        if unmapped or missing_required:
            mode = "need_map"

    return {
        "mode": mode,
        "source_headers": headers,
        "suggested_mapping": suggested,
        "missing_required_keys": missing_required,
        "unmapped_headers": [h for h, v in suggested.items() if not v],
    }


def compare_locked_headers_strict(
    source_headers: list[str], columns: list[dict[str, Any]]
) -> dict[str, Any]:
    """
    已锁定表头的严格比对（与常见 TMS 一致：表头固定）。
    仅当源表头与锁定列「标签」完全一致（忽略空白/大小写规范化）时为 align；
    否则返回 header_mismatch，并给出缺少/多余列，供用户改文件后重导。
    不走字段映射；不影响未锁定时的首次确认流程。
    """
    expected = [
        str(c.get("label") or c.get("key") or "").strip()
        for c in (columns or [])
        if str(c.get("label") or c.get("key") or "").strip()
    ]
    source = [str(h).strip() for h in (source_headers or []) if str(h).strip()]
    expected_norms = [normalize_label(h) for h in expected]
    source_norms = [normalize_label(h) for h in source]

    if expected_norms == source_norms:
        suggested = {}
        for h, col in zip(source, columns or []):
            key = str(col.get("key") or "").strip()
            if key:
                suggested[h] = key
        return {
            "mode": "align",
            "source_headers": source,
            "expected_headers": expected,
            "suggested_mapping": suggested,
            "missing_headers": [],
            "extra_headers": [],
            "order_mismatch": False,
            "message": "",
        }

    expected_set = set(expected_norms)
    source_set = set(source_norms)
    missing = [e for e, n in zip(expected, expected_norms) if n not in source_set]
    extra = [s for s, n in zip(source, source_norms) if n not in expected_set]
    order_mismatch = (not missing and not extra and expected_norms != source_norms)

    lines = [
        "项目表头已锁定，再次导入时表头必须与锁定表头完全一致。",
        "请按下方差异修改文件（或工作台列）后重新导入。",
        "",
        "已锁定表头：" + ("、".join(expected) if expected else "（空）"),
        "当前导入表头：" + ("、".join(source) if source else "（空）"),
    ]
    if missing:
        lines.append("缺少列：" + "、".join(missing))
    if extra:
        lines.append("多余列：" + "、".join(extra))
    if order_mismatch:
        lines.append("列名一致但顺序不同，请按已锁定表头的顺序调整后再导入。")

    return {
        "mode": "header_mismatch",
        "source_headers": source,
        "expected_headers": expected,
        "suggested_mapping": {},
        "missing_headers": missing,
        "extra_headers": extra,
        "order_mismatch": order_mismatch,
        "message": "\n".join(lines),
    }


def validate_mapping(
    columns: list[dict[str, Any]], mapping: dict[str, Any]
) -> dict[str, str]:
    """mapping: source_label -> schema_key；返回清洗后的 mapping。忽略空/ignore。"""
    key_set = {str(c.get("key") or "") for c in columns if c.get("key")}
    cleaned: dict[str, str] = {}
    used: set[str] = set()
    for src, dst in (mapping or {}).items():
        src_l = str(src or "").strip()
        dst_k = str(dst or "").strip()
        if not src_l or not dst_k or dst_k in ("__", "ignore", "__ignore__"):
            continue
        if dst_k not in key_set:
            raise ValueError("映射目标列不存在：%s" % dst_k)
        if dst_k in used:
            raise ValueError("多个源列映射到同一目标列：%s" % dst_k)
        used.add(dst_k)
        cleaned[src_l] = dst_k
    title_key = next(
        (str(c.get("key")) for c in columns if str(c.get("role") or "") == "title"),
        "title",
    )
    if title_key not in used:
        raise ValueError("请将某一源列映射到标题（用例名称）")
    return cleaned


def row_values_by_header(headers: list[str], row: list[Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for i, h in enumerate(headers):
        label = str(h or "").strip()
        if not label:
            continue
        val = ""
        if i < len(row):
            val = str(row[i] or "").strip()
        out[label] = val
    return out
