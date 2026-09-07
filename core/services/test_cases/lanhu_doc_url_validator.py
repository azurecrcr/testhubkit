"""蓝湖需求文档 URL 前缀校验（独立于 lanhu_requirement_service，避免影响拉取逻辑）。"""
from __future__ import annotations

INVALID_LANHU_DOC_URL_MSG = "文档 URL 须以 https://lanhuapp.com 开头"


def assert_lanhu_doc_url_https_prefix(url: str) -> str:
    u = str(url or "").strip()
    if not u.lower().startswith("https://lanhuapp.com"):
        raise ValueError(INVALID_LANHU_DOC_URL_MSG)
    return u


def is_lanhu_doc_url_https_prefix(url: str) -> bool:
    u = str(url or "").strip()
    return bool(u) and u.lower().startswith("https://lanhuapp.com")
