"""文档工具 AI 响应解析与校验（与 smart_edit 完全隔离）。"""

from __future__ import annotations

import json
import re
from typing import Any


def _extract_json_object(text: str) -> dict[str, Any]:
    raw = str(text or "").strip()
    if not raw:
        raise ValueError("AI 返回为空")
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.IGNORECASE)
    if fence:
        raw = fence.group(1).strip()
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        try:
            data = json.loads(raw[start : end + 1])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError as exc:
            raise ValueError(f"AI 返回不是合法 JSON: {exc}") from exc
    raise ValueError("无法从 AI 响应中解析 JSON 对象")


def normalize_doc_tools_matrix(matrix: Any) -> list[list[str]]:
    if not isinstance(matrix, list) or not matrix:
        raise ValueError("matrix 必须是非空二维数组")
    rows: list[list[str]] = []
    col_count = 0
    for i, row in enumerate(matrix):
        if not isinstance(row, list):
            raise ValueError(f"matrix[{i}] 必须是数组")
        line = [str(cell if cell is not None else "") for cell in row]
        if not col_count:
            col_count = len(line)
        elif len(line) != col_count:
            raise ValueError(f"matrix 每行列数必须一致，第 {i + 1} 行列数为 {len(line)}，期望 {col_count}")
        rows.append(line)
    if col_count <= 0:
        raise ValueError("matrix 列数不能为 0")
    return rows


def parse_doc_tools_ai_response(text: str) -> dict[str, Any]:
    data = _extract_json_object(text)
    if "matrix" not in data:
        raise ValueError("AI 响应缺少必填字段 matrix")
    summary = str(data.get("summary") or "").strip() or "已完成智能编辑"
    matrix = normalize_doc_tools_matrix(data.get("matrix"))
    return {"summary": summary, "matrix": matrix}


def validate_doc_tools_matrix_against_source(
    matrix: list[list[str]],
    source_matrix: list[list[str]] | None,
) -> list[list[str]]:
    """校验并返回规范化 matrix；若源表存在则要求列数一致（除非源表为空）。"""
    normalized = normalize_doc_tools_matrix(matrix)
    if not source_matrix:
        return normalized
    try:
        source = normalize_doc_tools_matrix(source_matrix)
    except ValueError:
        return normalized
    if not source:
        return normalized
    source_cols = len(source[0])
    result_cols = len(normalized[0])
    if source_cols != result_cols:
        raise ValueError(
            f"AI 返回列数 ({result_cols}) 与当前表格列数 ({source_cols}) 不一致，请重试"
        )
    return normalized
