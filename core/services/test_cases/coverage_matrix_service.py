"""需求覆盖率矩阵：功能点抽取、用例映射与汇总统计。"""
from __future__ import annotations

import json
import re
from typing import Any, Callable

from core.config.user_ai_credentials import resolve_text_ai_credentials
from core.services.test_cases.test_case_generator_service import generate_test_cases

POINT_TYPES = frozenset({"module", "page", "interaction", "boundary", "rule"})
COVERAGE_STATUSES = frozenset({"covered", "partial", "uncovered"})
MAX_POINTS = 60
MAX_ROWS_SNIPPET = 40


def _parse_json_blob(raw: str) -> Any:
    text = str(raw or "").strip()
    if not text:
        return None
    match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", text)
    if match:
        text = match.group(0)
    return json.loads(text)


def _call_llm(
    prompt: str,
    *,
    use_builtin: bool,
    base_url: str,
    api_key: str,
    model: str,
    temperature: float | None = 0.1,
) -> str:
    return generate_test_cases(
        base_url,
        api_key,
        model,
        prompt,
        [],
        temperature=temperature,
    )


def _row_signature(columns: list[str], row: list[str]) -> str:
    parts: list[str] = []
    for i, col in enumerate(columns[: min(len(columns), len(row))]):
        cell = str(row[i] or "").strip()
        if cell:
            parts.append(f"{col}={cell[:80]}")
    return " | ".join(parts[:6])


def _build_rows_snippet(columns: list[str], rows: list[list[str]]) -> str:
    lines: list[str] = []
    for i, row in enumerate(rows[:MAX_ROWS_SNIPPET]):
        lines.append(f"[{i + 1}] (index={i}) {_row_signature(columns, row)}")
    if len(rows) > MAX_ROWS_SNIPPET:
        lines.append(f"... 共 {len(rows)} 条，仅展示前 {MAX_ROWS_SNIPPET} 条")
    return "\n".join(lines)


def _normalize_row_ref_text(text: str, row_indices: list[int]) -> str:
    """将 evidence/message 中 0 起 row_index 的用例行号转为从 1 开始展示。"""
    if not text or not row_indices:
        return text
    result = str(text)
    for ri in sorted({int(x) for x in row_indices}, reverse=True):
        display = ri + 1
        result = re.sub(rf"用例\s*{ri}(?!\d)", f"用例{display}", result)
        result = re.sub(rf"第\s*{ri}\s*行", f"第{display}行", result)
    return result


def _normalize_point(item: dict[str, Any], index: int) -> dict[str, Any] | None:
    title = str(item.get("title") or item.get("name") or "").strip()
    if not title:
        return None
    point_type = str(item.get("type") or "interaction").strip().lower()
    if point_type not in POINT_TYPES:
        point_type = "interaction"
    pid = str(item.get("id") or f"rp_{index + 1:03d}").strip()
    return {
        "id": pid,
        "type": point_type,
        "path": str(item.get("path") or title).strip(),
        "title": title,
        "description": str(item.get("description") or "").strip(),
        "priority": str(item.get("priority") or "P1").strip(),
    }


def extract_requirement_points(
    requirements: str,
    user_intent: str,
    *,
    use_builtin: bool = True,
    base_url: str = "",
    api_key: str = "",
    model: str = "",
    temperature: float | None = 0.1,
    call_llm: Callable[[str], str] | None = None,
) -> list[dict[str, Any]]:
    """从需求摘要抽取结构化功能点清单。"""
    req = str(requirements or "").strip()
    if not req:
        req = str(user_intent or "").strip()
    if not req:
        return []

    prompt = (
        "你是需求分析专家。从【需求摘要】抽取测试功能点清单（模块/页面/交互/边界/规则）。\n"
        "严格输出 JSON，不要 markdown：\n"
        '{"points":[{"id":"rp_001","type":"module|page|interaction|boundary|rule",'
        '"path":"模块>页面>交互","title":"功能点标题","description":"一句话","priority":"P0|P1|P2"}]}\n'
        f"限制 {5}～{MAX_POINTS} 个功能点，优先 P0/P1 与边界场景。\n\n"
        f"【用户指令】\n{user_intent[:2000]}\n\n"
        f"【需求摘要】\n{req[:12000]}"
    )
    if call_llm:
        raw = call_llm(prompt)
    else:
        raw = _call_llm(
            prompt,
            use_builtin=use_builtin,
            base_url=base_url,
            api_key=api_key,
            model=model,
            temperature=temperature,
        )
    data = _parse_json_blob(raw)
    raw_points: list[Any] = []
    if isinstance(data, dict) and isinstance(data.get("points"), list):
        raw_points = data["points"]
    elif isinstance(data, list):
        raw_points = data

    cleaned: list[dict[str, Any]] = []
    for idx, item in enumerate(raw_points[:MAX_POINTS]):
        if not isinstance(item, dict):
            continue
        point = _normalize_point(item, idx)
        if point:
            cleaned.append(point)
    if not cleaned and req:
        cleaned.append(
            {
                "id": "rp_001",
                "type": "interaction",
                "path": "主流程",
                "title": "主流程验证",
                "description": user_intent[:200] or req[:200],
                "priority": "P1",
            }
        )
    return cleaned


def compute_summary(
    points: list[dict[str, Any]],
    mappings: list[dict[str, Any]],
    over_generated_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """计算覆盖率汇总（covered + 0.5*partial）/ total。"""
    total = len(points)
    by_id: dict[str, str] = {}
    for m in mappings:
        pid = str(m.get("point_id") or "").strip()
        status = str(m.get("status") or "").strip().lower()
        if pid and status in COVERAGE_STATUSES:
            by_id[pid] = status

    covered = partial = uncovered = 0
    for p in points:
        st = by_id.get(str(p.get("id") or ""), "uncovered")
        if st == "covered":
            covered += 1
        elif st == "partial":
            partial += 1
        else:
            uncovered += 1

    over = len(over_generated_rows or [])
    rate = 0.0
    if total:
        rate = round((covered + 0.5 * partial) / total * 100.0, 1)

    return {
        "total": total,
        "covered": covered,
        "partial": partial,
        "uncovered": uncovered,
        "over_generated": over,
        "coverage_rate": rate,
    }


def gaps_from_matrix(
    points: list[dict[str, Any]],
    mappings: list[dict[str, Any]],
    *,
    include_partial: bool = True,
    target_point_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """将矩阵中未覆盖/部分覆盖项转为 Agent fill_gaps 可用的 gaps 列表。"""
    point_map = {str(p.get("id") or ""): p for p in points}
    by_id: dict[str, str] = {}
    for m in mappings:
        pid = str(m.get("point_id") or "").strip()
        status = str(m.get("status") or "").strip().lower()
        if pid:
            by_id[pid] = status

    targets = {str(x).strip() for x in (target_point_ids or []) if str(x).strip()}
    gaps: list[dict[str, Any]] = []
    for p in points:
        pid = str(p.get("id") or "")
        status = by_id.get(pid, "uncovered")
        if status == "covered":
            continue
        if status == "partial" and not include_partial:
            continue
        if status not in ("uncovered", "partial"):
            continue
        if targets and pid not in targets:
            continue
        path = str(p.get("path") or p.get("title") or "")
        gaps.append(
            {
                "point_id": pid,
                "module": path.split(">")[0].strip() if ">" in path else path,
                "scenario": str(p.get("title") or ""),
                "priority": str(p.get("priority") or "P1"),
                "reason": str(p.get("description") or ""),
                "coverage_status": status,
            }
        )
    return gaps[:30]


def build_coverage_matrix(
    requirements: str,
    columns: list[str],
    rows: list[list[str]],
    points: list[dict[str, Any]],
    *,
    use_builtin: bool = True,
    base_url: str = "",
    api_key: str = "",
    model: str = "",
    temperature: float | None = 0.1,
    call_llm: Callable[[str], str] | None = None,
) -> dict[str, Any]:
    """建立需求点 ↔ 用例行映射矩阵。"""
    if not points:
        return {
            "points": [],
            "mappings": [],
            "over_generated_rows": [],
            "summary": compute_summary([], [], []),
        }

    points_json = json.dumps(points, ensure_ascii=False, indent=2)
    rows_snippet = _build_rows_snippet(columns, rows)
    header = " | ".join(str(c) for c in columns)

    prompt = (
        "你是测试覆盖率审查员。对照【功能点清单】与【已有用例】，判断每个功能点的覆盖状态。\n"
        "覆盖状态：covered=已有用例充分覆盖；partial=有关联用例但缺关键步骤/边界；uncovered=无对应用例。\n"
        "同时找出【过度生成】的用例（需求未提及的内容）。\n"
        "row_indices / row_index 为【已有用例】列表从 0 开始的数组下标（与 index= 一致）；"
        "evidence 与 message 文字引用用例时使用从 1 开始的序号（[1] 对应 用例1，index=0 对应 用例1）。\n"
        "严格输出 JSON，不要 markdown：\n"
        "{\n"
        '  "mappings":[{"point_id":"rp_001","row_indices":[0,2],"status":"covered|partial|uncovered",'
        '"confidence":0.9,"evidence":"简要说明"}],\n'
        '  "over_generated_rows":[{"row_index":5,"message":"需求未提及…"}]\n'
        "}\n\n"
        f"【需求摘要】\n{str(requirements or '')[:6000]}\n\n"
        f"【表头】\n{header}\n\n"
        f"【功能点清单】\n{points_json[:8000]}\n\n"
        f"【已有用例】\n{rows_snippet}"
    )

    if call_llm:
        raw = call_llm(prompt)
    else:
        raw = _call_llm(
            prompt,
            use_builtin=use_builtin,
            base_url=base_url,
            api_key=api_key,
            model=model,
            temperature=temperature,
        )

    data = _parse_json_blob(raw)
    mappings: list[dict[str, Any]] = []
    over_rows: list[dict[str, Any]] = []
    if isinstance(data, dict):
        if isinstance(data.get("mappings"), list):
            for item in data["mappings"]:
                if not isinstance(item, dict):
                    continue
                pid = str(item.get("point_id") or "").strip()
                status = str(item.get("status") or "uncovered").strip().lower()
                if status not in COVERAGE_STATUSES:
                    status = "uncovered"
                row_indices: list[int] = []
                for ri in item.get("row_indices") or []:
                    try:
                        row_indices.append(int(ri))
                    except (TypeError, ValueError):
                        continue
                mappings.append(
                    {
                        "point_id": pid,
                        "row_indices": row_indices,
                        "status": status,
                        "confidence": float(item.get("confidence") or 0.0),
                        "evidence": _normalize_row_ref_text(
                            str(item.get("evidence") or "").strip(),
                            row_indices,
                        ),
                    }
                )
        if isinstance(data.get("over_generated_rows"), list):
            for item in data["over_generated_rows"]:
                if not isinstance(item, dict):
                    continue
                try:
                    ri = int(item.get("row_index"))
                except (TypeError, ValueError):
                    continue
                over_rows.append(
                    {
                        "row_index": ri,
                        "message": _normalize_row_ref_text(
                            str(item.get("message") or "可能过度生成").strip(),
                            [ri],
                        ),
                    }
                )

    point_ids = {str(p.get("id") or "") for p in points}
    mapped_ids = {str(m.get("point_id") or "") for m in mappings}
    for p in points:
        pid = str(p.get("id") or "")
        if pid and pid not in mapped_ids:
            mappings.append(
                {
                    "point_id": pid,
                    "row_indices": [],
                    "status": "uncovered",
                    "confidence": 0.0,
                    "evidence": "",
                }
            )

    mappings = [m for m in mappings if str(m.get("point_id") or "") in point_ids]
    summary = compute_summary(points, mappings, over_rows)
    return {
        "points": points,
        "mappings": mappings,
        "over_generated_rows": over_rows[:20],
        "summary": summary,
    }


def analyze_coverage(
    *,
    requirements: str,
    columns: list[str],
    rows: list[list[str]],
    user_intent: str = "",
    use_builtin: bool = True,
    base_url: str = "",
    api_key: str = "",
    model: str = "",
    temperature: float | None = 0.1,
    user_id: str | None = None,
) -> dict[str, Any]:
    """独立 API：抽取功能点并生成覆盖率矩阵。"""
    quota_meta = None
    if use_builtin:
        ai_cfg = resolve_text_ai_credentials({"use_builtin": True}, user_id)
        from core.services.ai.user_ai_daily_quota_service import pop_quota_meta
        quota_meta = pop_quota_meta(ai_cfg)
        base_url = str(ai_cfg.get("base_url") or base_url)
        api_key = str(ai_cfg.get("api_key") or api_key)
        model = str(ai_cfg.get("model") or model)
        temperature = float(ai_cfg.get("temperature") or temperature or 0.1)

    llm = lambda prompt: _call_llm(
        prompt,
        use_builtin=use_builtin,
        base_url=base_url,
        api_key=api_key,
        model=model,
        temperature=temperature,
    )
    points = extract_requirement_points(
        requirements,
        user_intent,
        call_llm=llm,
    )
    matrix = build_coverage_matrix(
        requirements,
        columns,
        rows,
        points,
        call_llm=llm,
    )
    matrix["gaps"] = gaps_from_matrix(points, matrix.get("mappings") or [])
    if quota_meta:
        matrix["_ai_quota_meta"] = quota_meta
    return matrix
