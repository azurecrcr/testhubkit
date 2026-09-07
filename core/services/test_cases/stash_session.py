"""测试用例暂存载荷校验（由 share_service 使用）。"""

from __future__ import annotations

from typing import Optional


def validate_stash_payload(payload: object) -> tuple[bool, Optional[str]]:
    if not isinstance(payload, dict):
        return False, "payload 必须是对象"
    cols = payload.get("columns")
    rows = payload.get("rows")
    if not isinstance(cols, list) or not cols or not all(isinstance(c, str) for c in cols):
        return False, "columns 必须为非空字符串数组"
    if not isinstance(rows, list):
        return False, "rows 必须为数组"
    for row in rows:
        if not isinstance(row, list):
            return False, "rows 中每一项必须为数组"
        if len(row) != len(cols):
            return False, "每行列数必须与表头列数一致"
    prov = payload.get("provenance")
    if prov is not None:
        if not isinstance(prov, list):
            return False, "provenance 必须为数组"
        if len(prov) != len(rows):
            return False, "provenance 长度必须与 rows 一致"
        for item in prov:
            if item is None:
                continue
            if not isinstance(item, dict):
                return False, "provenance 中每一项必须为对象或 null"
            sources = item.get("sources")
            if not isinstance(sources, list):
                return False, "provenance.sources 必须为数组"
    return True, None
