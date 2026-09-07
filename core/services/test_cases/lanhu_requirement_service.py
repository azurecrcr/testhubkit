"""从蓝湖 PRD/原型链接抓取需求文本并整理为适合喂给 LLM 的摘要。"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://lanhuapp.com"
CDN_URL = "https://axure-file.lanhuapp.com"
HTTP_TIMEOUT = int(os.environ.get("LANHU_HTTP_TIMEOUT", "60"))
MAX_PAGE_TEXT = int(os.environ.get("LANHU_MAX_PAGE_TEXT", "2000"))
MAX_TOTAL_CHARS = int(os.environ.get("LANHU_MAX_TOTAL_CHARS", "12000"))
MAX_PAGES = int(os.environ.get("LANHU_MAX_PAGES", "30"))
MODULE_GEN_MIN_PAGE_CHARS = int(os.environ.get("LANHU_MODULE_GEN_MIN_CHARS", "2000"))


def _normalize_cookie_text(text: str) -> str:
    """清理从网页复制的 Cookie 中的常见不可见/标点字符，避免 latin-1 编码失败。"""
    raw = str(text or "").strip()
    for src, dst in (
        ("\u2026", "..."),
        ("\u2018", "'"),
        ("\u2019", "'"),
        ("\u201c", '"'),
        ("\u201d", '"'),
        ("\u00a0", " "),
        ("\ufeff", ""),
    ):
        raw = raw.replace(src, dst)
    try:
        raw.encode("latin-1")
    except UnicodeEncodeError as exc:
        raise ValueError(
            "Cookie 含有无法编码的特殊字符，请从浏览器 Network 重新复制完整 Cookie（勿含省略号等）"
        ) from exc
    return raw


def _lanhu_referer(url: str, params: dict) -> str:
    u = (url or "").strip()
    if u.startswith("http"):
        return u
    tid = params.get("team_id") or ""
    pid = params.get("project_id") or ""
    doc_id = params.get("doc_id") or ""
    page_id = params.get("page_id") or ""
    q = f"tid={tid}&pid={pid}"
    if doc_id:
        q += f"&docId={doc_id}"
    if page_id:
        q += f"&pageId={page_id}"
    return f"https://lanhuapp.com/web/#/item/project/product?{q}"


def _make_lanhu_session(cookie: str, url: str, params: dict) -> requests.Session:
    cookie = _normalize_cookie_text(cookie)
    referer = _lanhu_referer(url, params)
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": referer,
            "Origin": "https://lanhuapp.com",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cookie": cookie,
            "request-from": "web",
            "real-path": "/item/project/product",
        }
    )
    return session


def _lanhu_raise_http_error(resp: requests.Response) -> None:
    status = resp.status_code
    if status == 418:
        raise ValueError(
            "蓝湖拒绝了请求（418）：Cookie 可能已过期或无效，请登录蓝湖后从当前页面 "
            "Network 重新复制 Cookie 与完整 URL（须含 pageId）"
        )
    if status in (401, 403):
        raise ValueError(
            f"蓝湖鉴权失败（HTTP {status}）：请确认 Cookie 有效且对该项目有访问权限"
        )
    resp.raise_for_status()


def _parse_lanhu_url(url: str) -> dict:
    if url.startswith("http"):
        parsed = urlparse(url)
        fragment = parsed.fragment
        if not fragment:
            raise ValueError("蓝湖链接无效：缺少 # 后的参数部分")
        url = fragment.split("?", 1)[1] if "?" in fragment else fragment
    if url.startswith("?"):
        url = url[1:]
    params = {}
    for part in url.split("&"):
        if "=" in part:
            key, value = part.split("=", 1)
            params[key] = value
    project_id = params.get("pid")
    if not project_id:
        raise ValueError("蓝湖链接缺少 pid（项目 ID）")
    return {
        "team_id": params.get("tid"),
        "project_id": project_id,
        "doc_id": params.get("docId") or params.get("image_id"),
        "page_id": params.get("pageId") or params.get("page_id"),
        "version_id": params.get("versionId") or params.get("version_id"),
    }


def _extract_text_from_html(html_path: Path) -> str:
    raw = html_path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(raw, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    lines = []
    seen = set()
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if len(line) < 2 or line in seen:
            continue
        seen.add(line)
        lines.append(line)
    return "\n".join(lines)


def _truncate(text: str, limit: int) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 20].rstrip() + "\n...(内容已截断)"


def _extract_sitemap_pages(project_mapping: dict) -> list[dict]:
    """从 Axure sitemap 提取页面列表（与蓝湖 Web 导航一致，含 pageId）。"""
    sitemap = project_mapping.get("sitemap") or {}
    root_nodes = sitemap.get("rootNodes") or []
    pages_list: list[dict] = []

    def walk(nodes, parent_path: str = "", parent_folder: str | None = None, level: int = 0):
        for node in nodes or []:
            page_name = node.get("pageName", "")
            page_url = node.get("url", "")
            node_type = node.get("type", "Wireframe")
            node_id = node.get("id", "")
            current_path = f"{parent_path}/{page_name}" if parent_path else page_name
            is_pure_folder = node_type == "Folder" and not page_url

            if page_name and page_url:
                pages_list.append(
                    {
                        "id": node_id,
                        "name": page_name,
                        "filename": page_url,
                        "path": current_path,
                        "folder": parent_folder or "根目录",
                        "level": level,
                    }
                )

            children = node.get("children") or []
            if children:
                next_folder = page_name if is_pure_folder else parent_folder
                walk(children, current_path, next_folder, level + 1)

    walk(root_nodes)
    return pages_list


def _resolve_target_sitemap_pages(
    sitemap_pages: list[dict], page_id: str | None
) -> list[dict]:
    if not page_id:
        return sitemap_pages
    matched = [p for p in sitemap_pages if p.get("id") == page_id]
    if not matched:
        names_hint = "、".join(
            (p.get("name") or p.get("filename") or "")[:20] for p in sitemap_pages[:8]
        )
        raise ValueError(
            f"链接中的 pageId={page_id} 在文档导航中未找到。"
            f"请从蓝湖复制当前正在查看页面的完整 URL（须含 pageId）。"
            + (f" 文档内部分页面示例：{names_hint}" if names_hint else "")
        )
    return matched



_PAGE_ID_DISPLAY_RE = re.compile(r"[（(]\s*pageId\s*=\s*[^）)\n]*[）)]", re.I)


def _sanitize_lanhu_summary_display(text: str) -> str:
    """Remove pageId fragments from user-visible Lanhu summaries."""
    if not text:
        return text
    cleaned = _PAGE_ID_DISPLAY_RE.sub("", text)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _page_text_char_count(pages: list[dict]) -> int:
    """统计目标页面原始文本总字数（未截断），用于判断是否走分模块生成。"""
    total = 0
    for page in pages or []:
        total += len(str(page.get("text") or ""))
    return total


def lanhu_use_module_pipeline(page_text_chars: int) -> bool:
    """由蓝湖拉取结果的字数判断是否走分模块生成（阈值仅服务端维护）。"""
    try:
        chars = int(page_text_chars or 0)
    except (TypeError, ValueError):
        chars = 0
    return chars >= MODULE_GEN_MIN_PAGE_CHARS


def _summarize_pages(
    doc_name: str, pages: list[dict], *, focus_page_id: str | None = None
) -> str:
    parts = [
        "【蓝湖需求摘要】",
        f"文档：{doc_name or '未命名'}",
    ]
    if focus_page_id and pages:
        p0 = pages[0]
        parts.append(
            f"当前页面：{p0.get('name') or '未命名'}"
        )
    parts.extend(
        [
            f"页面数：{len(pages)}（仅包含 URL 指定范围）",
            "",
            "| 序号 | 页面名称 |",
            "| --- | --- |",
        ]
    )
    for i, p in enumerate(pages[:MAX_PAGES], 1):
        name = (p.get("name") or "").replace("|", "/")
        parts.append(f"| {i} | {name} |")
    if len(pages) > MAX_PAGES:
        parts.append(f"| … | 另有 {len(pages) - MAX_PAGES} 个页面未展开 |")

    parts.append("")
    parts.append("【各页面要点】")
    total = len("\n".join(parts))
    for i, p in enumerate(pages[:MAX_PAGES], 1):
        name = p.get("name") or f"页面{i}"
        body = _truncate(p.get("text") or "", MAX_PAGE_TEXT)
        block = f"\n### {i}. {name}\n{body}\n"
        if total + len(block) > MAX_TOTAL_CHARS:
            parts.append("\n…(后续页面因长度限制未写入，请缩小文档或拆分生成)")
            break
        parts.append(block)
        total += len(block)
    return _truncate("\n".join(parts), MAX_TOTAL_CHARS)


def fetch_lanhu_requirements_result(
    cookie: str, url: str, *, page_id: str | None = None
) -> dict[str, str | int]:
    """
    拉取蓝湖需求并返回摘要与页面原始文本总字数。
    PRD/原型链接需包含 pid 与 docId（或 image_id）。
    """
    url = (url or "").strip()
    if not (cookie or "").strip():
        raise ValueError("请填写蓝湖 Cookie")
    if not url:
        raise ValueError("请填写蓝湖文档 URL")
    if "lanhuapp.com" not in url:
        raise ValueError("请填写有效的蓝湖链接（lanhuapp.com）")

    params = _parse_lanhu_url(url)
    doc_id = params.get("doc_id")
    if not doc_id:
        raise ValueError("链接缺少 docId 或 image_id，无法定位需求文档")

    session = _make_lanhu_session(cookie, url, params)

    image_params: dict = {"pid": params["project_id"], "image_id": doc_id}
    if params.get("team_id"):
        image_params["team_id"] = params["team_id"]

    doc_resp = session.get(
        f"{BASE_URL}/api/project/image",
        params=image_params,
        timeout=HTTP_TIMEOUT,
    )
    _lanhu_raise_http_error(doc_resp)
    doc_data = doc_resp.json()
    code = doc_data.get("code")
    if code not in (0, "0", "00000"):
        raise ValueError(f"蓝湖 API 错误：{doc_data.get('msg') or doc_data}")
    doc_info = doc_data.get("data") or doc_data.get("result") or {}
    doc_name = doc_info.get("name") or "需求文档"

    versions = doc_info.get("versions") or []
    if not versions:
        raise ValueError("文档无可用版本")
    version_info = versions[0]
    json_url = version_info.get("json_url")
    if not json_url:
        raise ValueError("无法获取文档 mapping 地址")

    mapping_resp = session.get(json_url, timeout=HTTP_TIMEOUT)
    _lanhu_raise_http_error(mapping_resp)
    project_mapping = mapping_resp.json()
    pages_map = project_mapping.get("pages") or {}

    sitemap_pages = _extract_sitemap_pages(project_mapping)
    if not sitemap_pages:
        raise ValueError("文档 sitemap 为空，无法解析页面列表")

    page_id = (page_id or params.get("page_id") or "").strip() or None
    target_pages = _resolve_target_sitemap_pages(sitemap_pages, page_id)

    work_dir = Path(tempfile.mkdtemp(prefix="testhub_lanhu_"))
    try:
        page_entries = []
        for sp in target_pages:
            html_filename = sp.get("filename") or ""
            if not html_filename.endswith(".html"):
                html_filename = f"{html_filename}.html" if html_filename else ""

            page_info = pages_map.get(html_filename)
            if not page_info:
                for key in pages_map:
                    if key.replace(".html", "") == html_filename.replace(".html", ""):
                        html_filename = key
                        page_info = pages_map[key]
                        break
            if not page_info:
                page_entries.append(
                    {
                        "name": sp.get("name") or html_filename,
                        "text": "(未能下载该页 HTML，请确认链接是否为 Axure 原型页)",
                    }
                )
                continue

            html_data = page_info.get("html") or {}
            sign_md5 = html_data.get("sign_md5")
            if not sign_md5:
                continue
            html_resp = session.get(f"{CDN_URL}/{sign_md5}", timeout=HTTP_TIMEOUT)
            html_resp.raise_for_status()
            html_path = work_dir / html_filename
            html_path.write_text(html_resp.text, encoding="utf-8")
            text = _extract_text_from_html(html_path)
            page_entries.append(
                {
                    "name": sp.get("name") or html_filename.replace(".html", ""),
                    "text": text,
                    "path": sp.get("path"),
                    "page_id": sp.get("id"),
                }
            )

        if not page_entries:
            raise ValueError("未能解析到任何页面内容，请检查 Cookie 是否有效或链接是否有权限")

        summary = _sanitize_lanhu_summary_display(
            _summarize_pages(doc_name, page_entries, focus_page_id=page_id)
        )
        page_text_chars = _page_text_char_count(page_entries)
        return {
            "summary": summary,
            "page_text_chars": page_text_chars,
            "use_module_pipeline": lanhu_use_module_pipeline(page_text_chars),
        }
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def fetch_lanhu_requirements_summary(cookie: str, url: str) -> str:
    """兼容旧调用：仅返回需求摘要文本。"""
    return str(fetch_lanhu_requirements_result(cookie, url).get("summary") or "")


def fetch_lanhu_page_content(cookie: str, url: str, page_id: str) -> dict[str, str | int]:
    """拉取单个蓝湖页面的正文与字数（用于树状图节点刷新与页面缓存）。"""
    url = (url or "").strip()
    page_id = (page_id or "").strip()
    if not (cookie or "").strip():
        raise ValueError("请填写蓝湖 Cookie")
    if not url:
        raise ValueError("请填写蓝湖文档 URL")
    if not page_id:
        raise ValueError("缺少 page_id")
    if "lanhuapp.com" not in url:
        raise ValueError("请填写有效的蓝湖链接（lanhuapp.com）")

    params = _parse_lanhu_url(url)
    doc_id = params.get("doc_id")
    if not doc_id:
        raise ValueError("链接缺少 docId 或 image_id，无法定位需求文档")

    session = _make_lanhu_session(cookie, url, params)
    image_params: dict = {"pid": params["project_id"], "image_id": doc_id}
    if params.get("team_id"):
        image_params["team_id"] = params["team_id"]

    doc_resp = session.get(
        f"{BASE_URL}/api/project/image",
        params=image_params,
        timeout=HTTP_TIMEOUT,
    )
    _lanhu_raise_http_error(doc_resp)
    doc_data = doc_resp.json()
    code = doc_data.get("code")
    if code not in (0, "0", "00000"):
        raise ValueError(f"蓝湖 API 错误：{doc_data.get('msg') or doc_data}")
    doc_info = doc_data.get("data") or doc_data.get("result") or {}
    versions = doc_info.get("versions") or []
    if not versions:
        raise ValueError("文档无可用版本")
    json_url = versions[0].get("json_url")
    if not json_url:
        raise ValueError("无法获取文档 mapping 地址")

    mapping_resp = session.get(json_url, timeout=HTTP_TIMEOUT)
    _lanhu_raise_http_error(mapping_resp)
    project_mapping = mapping_resp.json()
    pages_map = project_mapping.get("pages") or {}
    sitemap_pages = _extract_sitemap_pages(project_mapping)
    if not sitemap_pages:
        raise ValueError("文档 sitemap 为空，无法解析页面列表")

    target_pages = _resolve_target_sitemap_pages(sitemap_pages, page_id)
    work_dir = Path(tempfile.mkdtemp(prefix="testhub_lanhu_page_"))
    try:
        page_text = ""
        for sp in target_pages:
            html_filename = sp.get("filename") or ""
            if not html_filename.endswith(".html"):
                html_filename = f"{html_filename}.html" if html_filename else ""

            page_info = pages_map.get(html_filename)
            if not page_info:
                for key in pages_map:
                    if key.replace(".html", "") == html_filename.replace(".html", ""):
                        html_filename = key
                        page_info = pages_map[key]
                        break
            if not page_info:
                continue

            html_data = page_info.get("html") or {}
            sign_md5 = html_data.get("sign_md5")
            if not sign_md5:
                continue
            html_resp = session.get(f"{CDN_URL}/{sign_md5}", timeout=HTTP_TIMEOUT)
            html_resp.raise_for_status()
            html_path = work_dir / html_filename
            html_path.write_text(html_resp.text, encoding="utf-8")
            page_text = _extract_text_from_html(html_path)
            break

        if not page_text:
            raise ValueError("未能解析页面内容，请检查 Cookie 是否有效或 page_id 是否正确")

        return {"page_text": page_text, "page_text_chars": len(page_text)}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _build_sitemap_tree_nodes(nodes: list) -> list[dict]:
    """将蓝湖 Axure sitemap rootNodes 转为前端树结构（含文件夹层级）。"""
    result: list[dict] = []
    for node in nodes or []:
        page_name = str(node.get("pageName") or "").strip()
        page_url = str(node.get("url") or "").strip()
        node_id = str(node.get("id") or "").strip()
        children_raw = node.get("children") or []
        if not page_name and not page_url and not children_raw:
            continue
        child_tree = _build_sitemap_tree_nodes(children_raw)
        is_page = bool(page_url)
        stable_key = f"{page_name}|{page_url}|{node_id}"
        entry: dict = {
            "id": node_id or hashlib.md5(stable_key.encode("utf-8")).hexdigest()[:12],
            "name": page_name or "未命名",
            "type": "page" if is_page else "folder",
        }
        if is_page:
            entry["page_id"] = node_id
            entry["filename"] = page_url
        if child_tree:
            entry["children"] = child_tree
        result.append(entry)
    return result


def _count_sitemap_tree_pages(nodes: list) -> int:
    total = 0
    for node in nodes or []:
        if node.get("type") == "page":
            total += 1
        total += _count_sitemap_tree_pages(node.get("children") or [])
    return total


def fetch_lanhu_sitemap_tree(cookie: str, url: str) -> dict:
    """
    拉取蓝湖文档完整页面导航树（不下载页面 HTML，供工作台左侧树状展示）。
    返回文档下全部页面，不受 URL 中 pageId 范围限制。
    """
    url = (url or "").strip()
    if not (cookie or "").strip():
        raise ValueError("请填写蓝湖 Cookie")
    if not url:
        raise ValueError("请填写蓝湖文档 URL")
    if "lanhuapp.com" not in url:
        raise ValueError("请填写有效的蓝湖链接（lanhuapp.com）")

    params = _parse_lanhu_url(url)
    doc_id = params.get("doc_id")
    if not doc_id:
        raise ValueError("链接缺少 docId 或 image_id，无法定位需求文档")

    session = _make_lanhu_session(cookie, url, params)
    image_params: dict = {"pid": params["project_id"], "image_id": doc_id}
    if params.get("team_id"):
        image_params["team_id"] = params["team_id"]

    doc_resp = session.get(
        f"{BASE_URL}/api/project/image",
        params=image_params,
        timeout=HTTP_TIMEOUT,
    )
    _lanhu_raise_http_error(doc_resp)
    doc_data = doc_resp.json()
    code = doc_data.get("code")
    if code not in (0, "0", "00000"):
        raise ValueError(f"蓝湖 API 错误：{doc_data.get('msg') or doc_data}")
    doc_info = doc_data.get("data") or doc_data.get("result") or {}
    doc_name = doc_info.get("name") or "需求文档"

    versions = doc_info.get("versions") or []
    if not versions:
        raise ValueError("文档无可用版本")
    version_info = versions[0]
    json_url = version_info.get("json_url")
    if not json_url:
        raise ValueError("无法获取文档 mapping 地址")

    mapping_resp = session.get(json_url, timeout=HTTP_TIMEOUT)
    _lanhu_raise_http_error(mapping_resp)
    project_mapping = mapping_resp.json()
    sitemap = project_mapping.get("sitemap") or {}
    root_nodes = sitemap.get("rootNodes") or []
    if not root_nodes:
        raise ValueError("文档 sitemap 为空，无法解析页面列表")

    tree = _build_sitemap_tree_nodes(root_nodes)
    page_count = _count_sitemap_tree_pages(tree)
    if page_count == 0:
        raise ValueError("文档中未找到可展示的页面节点")

    return {
        "doc_name": doc_name,
        "doc_id": doc_id,
        "project_id": params.get("project_id"),
        "team_id": params.get("team_id"),
        "focus_page_id": params.get("page_id"),
        "tree": tree,
        "page_count": page_count,
    }


def _flatten_sitemap(node, acc=None):
    acc = acc or []
    if isinstance(node, dict):
        if node.get("pageName") or node.get("url"):
            acc.append(node)
        for child in node.get("children") or []:
            _flatten_sitemap(child, acc)
    elif isinstance(node, list):
        for item in node:
            _flatten_sitemap(item, acc)
    return acc


def _download_page_assets(session: requests.Session, page_mapping: dict, output_dir: Path, skip_document_js: bool):
    for key, value in (page_mapping or {}).items():
        if skip_document_js and key == "document.js":
            continue
        if isinstance(value, str) and len(value) == 32 and re.fullmatch(r"[a-f0-9]+", value):
            rel = key if key.endswith((".js", ".css", ".png", ".jpg", ".gif", ".svg")) else key
            target = output_dir / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                continue
            try:
                resp = session.get(f"{CDN_URL}/{value}", timeout=HTTP_TIMEOUT)
                resp.raise_for_status()
                if "text" in (resp.headers.get("content-type") or "") or rel.endswith((".js", ".css", ".html")):
                    target.write_text(resp.text, encoding="utf-8", errors="ignore")
                else:
                    target.write_bytes(resp.content)
            except Exception:
                pass
        elif isinstance(value, dict):
            _download_page_assets(session, value, output_dir, skip_document_js)
