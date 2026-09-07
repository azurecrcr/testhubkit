"""蓝湖需求 provenance：后端构建并与前端 tc_state_provenance 结构对齐。"""
from __future__ import annotations

import copy
import datetime as dt
import re
from typing import Any
from urllib.parse import unquote


def _sanitize_display(text: str) -> str:
    text = str(text or "")
    text = re.sub(r"[（(]\s*pageId\s*=\s*[^）)\n]*[）)]", "", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _parse_url_query(url: str) -> dict[str, str]:
    url = str(url or "").strip()
    if not url:
        return {}
    if url.startswith("http"):
        if "#" in url:
            frag = url.split("#", 1)[1]
            url = frag.split("?", 1)[1] if "?" in frag else frag
        elif "?" in url:
            url = url.split("?", 1)[1]
    if url.startswith("?"):
        url = url[1:]
    params: dict[str, str] = {}
    for part in url.split("&"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        params[key] = unquote(value)
    return params


def parse_lanhu_provenance_from_summary(summary: str) -> dict[str, Any] | None:
    text = str(summary or "").strip()
    if not text:
        return None
    doc_match = re.search(r"文档[：:]\s*([^\n|]+)", text)
    page_match = re.search(r"当前页面[：:]\s*([^\n|]+)", text)
    doc_name = _sanitize_display(doc_match.group(1)) if doc_match else ""
    page_name = _sanitize_display(page_match.group(1)) if page_match else ""
    if not doc_name and not page_name:
        return None
    label = f"蓝湖《{doc_name}》" if doc_name else "蓝湖需求"
    return {"type": "lanhu", "label": label, "section": page_name or "", "expandable": False}


def parse_lanhu_provenance_from_url(url: str) -> dict[str, Any] | None:
    params = _parse_url_query(url)
    doc_name = _sanitize_display(
        params.get("docName")
        or params.get("doc_name")
        or params.get("filename")
        or params.get("fileName")
        or params.get("title")
        or params.get("name")
        or ""
    )
    page_name = _sanitize_display(params.get("pageName") or params.get("page_name") or params.get("pageTitle") or "")
    if not doc_name and not page_name:
        return None
    label = f"蓝湖《{doc_name}》" if doc_name else "蓝湖需求"
    return {"type": "lanhu", "label": label, "section": page_name or "", "expandable": False}


def build_lanhu_provenance_entry(summary: str, lanhu_url: str) -> dict[str, Any] | None:
    lanhu = parse_lanhu_provenance_from_summary(summary)
    if not lanhu and lanhu_url:
        lanhu = parse_lanhu_provenance_from_url(lanhu_url)
    if not lanhu:
        return None
    entry: dict[str, Any] = {
        "sources": [lanhu],
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    url = str(lanhu_url or "").strip()
    if url:
        entry["lanhuUrl"] = url
    return entry


def _first_non_empty(data: dict[str, Any], *keys: str) -> str:
    for key in keys:
        val = str(data.get(key) or "").strip()
        if val:
            return val
    return ""


def resolve_lanhu_provenance_from_request(data: dict[str, Any] | None) -> dict[str, Any] | None:
    data = data if isinstance(data, dict) else {}
    opts = data.get("options") if isinstance(data.get("options"), dict) else {}

    cookie = _first_non_empty(data, "lanhu_cookie") or _first_non_empty(opts, "lanhu_cookie")
    url = _first_non_empty(data, "lanhu_url") or _first_non_empty(opts, "lanhu_url")

    summary = (
        _first_non_empty(data, "requirements", "requirement_summary", "requirements_summary")
        or _first_non_empty(opts, "requirements", "requirement_summary", "requirements_summary")
    )
    layers = data.get("context_layers") if isinstance(data.get("context_layers"), dict) else None
    if not layers and isinstance(opts.get("context_layers"), dict):
        layers = opts.get("context_layers")
    if not summary and isinstance(layers, dict):
        summary = str(layers.get("requirements") or "").strip()

    prompt = str(data.get("prompt") or "")
    if not summary and "【用户提示词】" in prompt:
        summary = prompt.split("【用户提示词】", 1)[0].strip()

    has_credentials = bool(cookie and url)
    has_summary_markers = bool(parse_lanhu_provenance_from_summary(summary))
    has_url_markers = bool(url and parse_lanhu_provenance_from_url(url))
    if not has_credentials and not has_summary_markers and not has_url_markers:
        return None
    return build_lanhu_provenance_entry(summary, url)


def provenance_list_for_rows(entry: dict[str, Any] | None, row_count: int) -> list[dict[str, Any]] | None:
    if not entry or row_count <= 0:
        return None
    return [copy.deepcopy(entry) for _ in range(row_count)]
