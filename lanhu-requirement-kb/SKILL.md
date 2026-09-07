---
name: lanhu-requirement-kb
description: >-
  Builds a desktop 需求知识库 from Lanhu: opens a native popup for project URL
  and Cookie (session-only, never persisted), exports all Axure docs/pages,
  synthesizes structured requirements, and writes interaction-logic analysis
  for test cases. Use when the user asks for 需求知识库, 蓝湖知识库, Lanhu
  requirement export, or organizing requirements for test case writing.
---

# 蓝湖需求知识库构建

从蓝湖项目导出全部 Axure 文档与页面，在**本机桌面**生成「需求知识库」，并撰写交互逻辑分析，供编写测试用例使用。

**本 Skill 为单文件自包含，不依赖任何外部脚本。** Agent 按下列步骤直接执行。

---

## 安全规范（必须遵守）

| 规则 | 说明 |
|------|------|
| Cookie **不落盘** | 禁止写入 `.json`、`.env`、配置文件、知识库目录或 git |
| Cookie **不上传** | 禁止上传到 TestHub、服务器、云盘或任何远程 API（除蓝湖官方 `lanhuapp.com` 拉取需求） |
| Cookie **仅本次使用** | 仅通过进程环境变量或内存传递给当次导出；任务结束立即清除 |
| 不在 frontmatter 存 Cookie | 导出 Markdown 的 YAML 中不得出现 Cookie |
| 不在汇报中复述 Cookie | 完成汇报时不输出、不摘要 Cookie 内容 |

凭据收集后，Agent 在终端设置环境变量（示例）：

```powershell
# Windows — 值来自用户当次输入，勿写入文件
$env:LANHU_COOKIE = '<用户粘贴的 Cookie>'
$env:LANHU_TEAM_ID = '<从 URL 解析的 tid>'
$env:LANHU_PROJECT_ID = '<从 URL 解析的 pid>'
```

```bash
# macOS / Linux
export LANHU_COOKIE='...'
export LANHU_TEAM_ID='...'
export LANHU_PROJECT_ID='...'
```

任务结束（成功或失败）后执行清理：

```powershell
Remove-Item Env:LANHU_COOKIE, Env:LANHU_TEAM_ID, Env:LANHU_PROJECT_ID -ErrorAction SilentlyContinue
```

---

## 执行清单

```
- [ ] 1. 解析桌面路径，创建「需求知识库」目录
- [ ] 2. **弹出凭据窗**收集 URL + Cookie（禁止默认走对话粘贴；仅弹窗失败时降级）
- [ ] 2b. 自测弹窗脚本（`-SelfTest`）后再对用户弹出真实窗
- [ ] 3. pip 安装 requests、beautifulsoup4（若缺失）
- [ ] 4. 执行导出 + 结构化合成（下方完整代码，临时文件用后删除）
- [ ] 5. 阅读产出，撰写交互逻辑 / 测试关注点 / 页面关系图
- [ ] 6. 清除环境变量与临时文件，向用户汇报
```

---

## Step 1：桌面目录

Agent 运行下列逻辑确定路径并建目录（勿要求用户手建）：

```python
import sys
from pathlib import Path

def desktop() -> Path:
    if sys.platform == "win32":
        import winreg
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders",
        ) as k:
            p, _ = winreg.QueryValueEx(k, "Desktop")
        return Path(p)
    home = Path.home()
    for c in (home / "Desktop", home / "桌面"):
        if c.is_dir():
            return c
    return home / "Desktop"

KB_ROOT = desktop() / "需求知识库"
KB_ROOT.mkdir(parents=True, exist_ok=True)
print(KB_ROOT)
```

固定结构：

```
{Desktop}/需求知识库/
├── raw/                 # 原始导出
├── 结构化知识库/         # 合成版 + 分析报告
├── index.md
└── manifest.json
```

**不得**在知识库目录下创建 `.lanhu_session.json` 或任何凭据文件。

---

## Step 2：弹窗收集 URL 与 Cookie（必做）

**Agent 启动本 Skill 后，必须先向用户弹出凭据输入窗**，在窗内填写 URL 与 Cookie；**不要**默认在对话里让用户粘贴（除非弹窗失败）。

| 规则 | 说明 |
|------|------|
| 弹窗优先 | 用户可见双字段窗：URL + Cookie |
| 不落盘 | 弹窗脚本可写 `%TEMP%`，**用后删除**；Cookie **不得**写入知识库/git |
| 内存传递 | 从弹窗 stdout 解析 JSON → 设 `LANHU_*` 环境变量 |
| 自测 | 真实弹窗前先跑 `-SelfTest`，确认脚本可执行 |
| 降级 | 仅当弹窗无法显示时，才在对话中收集 |

Cookie 获取：浏览器登录蓝湖 → F12 → Network → 刷新项目页 → 复制 Request Headers 中的 `Cookie`。

URL 示例：

```
https://lanhuapp.com/web/#/item/project/product?tid=TEAM_UUID&pid=PROJECT_UUID
```

### 2.1 执行流程

1. 将下方 **lanhu_cred_dialog** 脚本写入 `%TEMP%\lanhu_cred_dialog.ps1`（Windows）或对应平台脚本
2. **自测**：`powershell -NoProfile -STA -File "%TEMP%\lanhu_cred_dialog.ps1" -SelfTest`  
   - 期望 stdout 含 `"ok":true` 且 exit 0
3. **对用户弹窗**（同脚本不加 `-SelfTest`），提示用户：「请在弹出窗口中填写蓝湖 URL 与 Cookie」
4. 解析 stdout JSON：`url` → 解析 tid/pid；`cookie` → `$env:LANHU_COOKIE`
5. 用户点取消或空字段 → 告知重新运行 Skill 或降级对话收集
6. **立即删除** `%TEMP%\lanhu_cred_dialog.ps1`（及 macOS/Linux 临时脚本）

### 2.2 Windows 弹窗脚本（lanhu_cred_dialog.ps1）

**必须** `-STA`，**必须** UTF-8 BOM 保存（含中文时用下方 PowerShell 写入方式）。

Agent 写入文件示例：

```powershell
$path = Join-Path $env:TEMP 'lanhu_cred_dialog.ps1'
# 将下方 param...exit 0 整段作为 $content
[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $true))
powershell -NoProfile -STA -File $path -SelfTest          # 自测
powershell -NoProfile -STA -File $path                    # 对用户弹窗
Remove-Item $path -Force -ErrorAction SilentlyContinue
```

脚本正文（写入 `$content`）：

```powershell
param([switch]$SelfTest)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

if ($SelfTest) {
    @{ ok = $true; url = 'https://lanhuapp.com/web/#/item/project/product?tid=test&pid=test'; cookie = 'session=test' } | ConvertTo-Json -Compress | Write-Output
    exit 0
}

$form = New-Object System.Windows.Forms.Form
$form.Text = '蓝湖需求知识库 - 凭据输入'
$form.Size = New-Object System.Drawing.Size(640, 520)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

$tip = New-Object System.Windows.Forms.Label
$tip.Location = New-Object System.Drawing.Point(16, 12)
$tip.Size = New-Object System.Drawing.Size(590, 36)
$tip.Text = '凭据仅用于本次导出，不会保存到本地。Cookie 从 F12 - Network - Request Headers 复制。'
$form.Controls.Add($tip)

$urlLabel = New-Object System.Windows.Forms.Label
$urlLabel.Location = New-Object System.Drawing.Point(16, 52)
$urlLabel.Size = New-Object System.Drawing.Size(590, 20)
$urlLabel.Text = '蓝湖项目 URL（须含 tid 与 pid）'
$form.Controls.Add($urlLabel)

$urlBox = New-Object System.Windows.Forms.TextBox
$urlBox.Location = New-Object System.Drawing.Point(16, 74)
$urlBox.Size = New-Object System.Drawing.Size(590, 24)
$form.Controls.Add($urlBox)

$cookieLabel = New-Object System.Windows.Forms.Label
$cookieLabel.Location = New-Object System.Drawing.Point(16, 108)
$cookieLabel.Size = New-Object System.Drawing.Size(590, 20)
$cookieLabel.Text = 'Cookie（完整 Request Header Cookie 值）'
$form.Controls.Add($cookieLabel)

$cookieBox = New-Object System.Windows.Forms.TextBox
$cookieBox.Location = New-Object System.Drawing.Point(16, 130)
$cookieBox.Size = New-Object System.Drawing.Size(590, 280)
$cookieBox.Multiline = $true
$cookieBox.ScrollBars = 'Vertical'
$form.Controls.Add($cookieBox)

$okBtn = New-Object System.Windows.Forms.Button
$okBtn.Location = New-Object System.Drawing.Point(430, 430)
$okBtn.Size = New-Object System.Drawing.Size(80, 32)
$okBtn.Text = '确定'
$okBtn.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($okBtn)

$cancelBtn = New-Object System.Windows.Forms.Button
$cancelBtn.Location = New-Object System.Drawing.Point(526, 430)
$cancelBtn.Size = New-Object System.Drawing.Size(80, 32)
$cancelBtn.Text = '取消'
$cancelBtn.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelBtn)

$form.AcceptButton = $okBtn
$form.CancelButton = $cancelBtn

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Output '{"ok":false}'
    exit 1
}

$url = $urlBox.Text.Trim()
$cookie = $cookieBox.Text.Trim()
if (-not $url -or -not $cookie) {
    [System.Windows.Forms.MessageBox]::Show('URL 与 Cookie 均不能为空', '输入不完整', 'OK', 'Warning') | Out-Null
    Write-Output '{"ok":false,"error":"empty_fields"}'
    exit 2
}

[ordered]@{ ok = $true; url = $url; cookie = $cookie } | ConvertTo-Json -Compress | Write-Output
exit 0
```

解析 stdout（Agent 在 shell 中）：

```powershell
$raw = powershell -NoProfile -STA -File $path
$data = $raw | ConvertFrom-Json
if (-not $data.ok) { throw '用户取消或未填写凭据' }
$env:LANHU_COOKIE = $data.cookie
# tid/pid 用下方 Python parse_lanhu_url 解析 $data.url
```

### 2.3 macOS / Linux 弹窗

| 系统 | 方式 |
|------|------|
| macOS | 临时 Python + tkinter 双字段窗（`Toplevel` + 两个 `Text`），stdout 输出 JSON，脚本用后删除 |
| Linux | `zenity --forms --title="蓝湖需求知识库" --text="凭据仅本次使用" --add-entry="URL" --add-entry="Cookie"` |

macOS/Linux 同样先 `-SelfTest` 或 `--test` 分支输出 mock JSON，再对用户弹窗。

### 2.4 对话收集（仅降级）

弹窗失败（无 GUI、`-STA` 报错、用户取消）时，才在对话中请用户提供 URL + Cookie。

### 2.5 解析 URL

```python
from urllib.parse import parse_qs, urlparse
import re

def parse_lanhu_url(url: str) -> dict:
    url = url.strip()
    merged = {}
    p = urlparse(url)
    if p.query:
        merged.update(parse_qs(p.query))
    frag = p.fragment or ""
    if "?" in frag:
        merged.update(parse_qs(frag.split("?", 1)[1]))
    tid = (merged.get("tid") or [""])[0]
    pid = (merged.get("pid") or [""])[0]
    if not tid:
        m = re.search(r"[?&]tid=([^&#]+)", url)
        tid = m.group(1) if m else ""
    if not pid:
        m = re.search(r"[?&]pid=([^&#]+)", url)
        pid = m.group(1) if m else ""
    if not tid or not pid:
        raise ValueError("URL 缺少 tid 或 pid")
    return {"team_id": tid, "project_id": pid}
```

**注意**：PowerShell 中 `$pid` 是保留变量，解析 URL 必须用 Python，勿在 shell 手写 `$pid`。

---

## Step 3：导出与合成

1. 确认已安装：`pip install requests beautifulsoup4`
2. 设置环境变量 `LANHU_COOKIE`、`LANHU_TEAM_ID`、`LANHU_PROJECT_ID`
3. 将下方 **export_and_synthesize** 整段写入系统临时文件（如 `%TEMP%\lanhu_kb_once.py`），执行：

```bash
python "%TEMP%\lanhu_kb_once.py" --kb-root "{KB_ROOT}"
```

4. 执行完毕后**立即删除**临时 Python 文件
5. 清除所有 `LANHU_*` 环境变量

### 蓝湖 API 参考

| 接口 | 用途 |
|------|------|
| `GET /api/project/product_documents?team_id=&project_id=` | 文档列表 |
| `GET /api/project/image?pid=&image_id={docId}` | 版本与 mapping |
| `GET {json_url}` | sitemap + pages |
| `GET https://axure-file.lanhuapp.com/{sign_md5}` | 页面 HTML |

请求头：`Cookie`（环境变量）、`Referer: https://lanhuapp.com/web/`、`request-from: web`、`real-path: /item/project/product`

| URL 参数 | 含义 |
|----------|------|
| `tid` | team_id |
| `pid` | project_id |
| `pageId` | 单页 ID（写入 frontmatter） |

### 平台分类关键词

| 关键词 | 合成目录 |
|--------|----------|
| 桌面端 | 03_桌面端 |
| Web端 | 04_Web端 |
| App端 | 05_App端 |
| 云课堂 | 06_云课堂 |
| 功能清单 / 流程图 / 角色权限 等 | 02_全局元信息 |

### export_and_synthesize 完整代码

Agent 将下列代码写入临时文件执行，**用后删除**。Cookie 只从环境变量 `LANHU_COOKIE`、`LANHU_TEAM_ID`、`LANHU_PROJECT_ID` 读取。

```python
#!/usr/bin/env python3
"""一次性导出 + 合成。Cookie 仅从环境变量读取，禁止落盘。"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://lanhuapp.com"
CDN_URL = "https://axure-file.lanhuapp.com"
HTTP_TIMEOUT = 60
INVALID_FS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
META_TITLES = {
    "版本说明", "功能图", "功能清单", "提示清单", "流程图",
    "角色权限", "字段说明", "优化内容", "数据权限",
}
VERSION_RE = re.compile(r"_V(\d+)\.(\d+)\.(\d+)")


def env_required(name: str) -> str:
    v = (os.environ.get(name) or "").strip()
    if not v:
        raise RuntimeError(f"缺少环境变量 {name}")
    return v


def safe_name(name: str, max_len: int = 80) -> str:
    t = INVALID_FS.sub("_", (name or "未命名").strip())
    t = re.sub(r"\s+", " ", t).strip(" .") or "未命名"
    return t[:max_len].rstrip(" .")


def make_session(cookie: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://lanhuapp.com/web/",
        "Accept": "application/json, text/plain, */*",
        "Cookie": cookie,
        "request-from": "web",
        "real-path": "/item/project/product",
    })
    return s


def api_ok(p: dict) -> bool:
    return p.get("code") in (0, "0", "00000")


def extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    lines, seen = [], set()
    for line in soup.get_text("\n", strip=True).splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if len(line) < 2 or line in seen:
            continue
        seen.add(line)
        lines.append(line)
    return "\n".join(lines)


def extract_sitemap(project_mapping: dict) -> list[dict]:
    root = (project_mapping.get("sitemap") or {}).get("rootNodes") or []
    pages = []

    def walk(nodes, parent_path="", parent_folder=None, level=0):
        for node in nodes or []:
            name = node.get("pageName", "")
            url = node.get("url", "")
            ntype = node.get("type", "Wireframe")
            nid = node.get("id", "")
            path = f"{parent_path}/{name}" if parent_path else name
            is_folder = ntype == "Folder" and not url
            if name and url:
                pages.append({
                    "id": nid, "name": name, "filename": url,
                    "path": path, "folder": parent_folder or "根目录", "level": level,
                })
            children = node.get("children") or []
            if children:
                walk(children, path, name if is_folder else parent_folder, level + 1)

    walk(root)
    return pages


def resolve_page(pages_map: dict, filename: str):
    html = filename if filename.endswith(".html") else f"{filename}.html"
    if html in pages_map:
        return html, pages_map[html]
    base = html.replace(".html", "")
    for k, v in pages_map.items():
        if k.replace(".html", "") == base:
            return k, v
    return None


def list_documents(session, team_id, project_id) -> list[dict]:
    r = session.get(
        f"{BASE_URL}/api/project/product_documents",
        params={"team_id": team_id, "project_id": project_id},
        timeout=HTTP_TIMEOUT,
    )
    r.raise_for_status()
    payload = r.json()
    if not api_ok(payload):
        raise RuntimeError(payload.get("msg") or payload)
    result = payload.get("result") or payload.get("data") or {}
    docs = []
    for item in result.get("resources") or []:
        if item.get("id"):
            docs.append({"doc_id": item["id"], "name": item.get("name") or item["id"]})
    return docs


def fetch_mapping(session, project_id, doc_id):
    r = session.get(
        f"{BASE_URL}/api/project/image",
        params={"pid": project_id, "image_id": doc_id},
        timeout=HTTP_TIMEOUT,
    )
    r.raise_for_status()
    payload = r.json()
    if not api_ok(payload):
        raise RuntimeError(payload.get("msg") or payload)
    doc_info = payload.get("result") or payload.get("data") or {}
    versions = doc_info.get("versions") or []
    if not versions:
        raise RuntimeError(f"文档 {doc_id} 无版本")
    ver = versions[0]
    json_url = ver.get("json_url")
    if not json_url:
        raise RuntimeError("缺少 mapping JSON")
    mapping = session.get(json_url, timeout=HTTP_TIMEOUT).json()
    return doc_info, ver, mapping


def fetch_page_text(session, page_info) -> str:
    sign = (page_info.get("html") or {}).get("sign_md5")
    if not sign:
        return ""
    html = session.get(f"{CDN_URL}/{sign}", timeout=HTTP_TIMEOUT).text
    return extract_text(html)


def build_md(*, doc_name, doc_id, version_id, page, text, team_id, project_id) -> str:
    pid = page.get("id") or ""
    lines = [
        "---",
        f"document: {doc_name}",
        f"doc_id: {doc_id}",
        f"version_id: {version_id}",
        f"page_id: {pid}",
        f"path: {page.get('path') or page.get('name')}",
        f"folder: {page.get('folder') or '根目录'}",
        f"team_id: {team_id}",
        f"project_id: {project_id}",
        f"source_url: https://lanhuapp.com/web/#/item/project/product?tid={team_id}&pid={project_id}&docId={doc_id}&pageId={pid}",
        f"exported_at: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
        "---", "",
        f"# {page.get('name') or '未命名'}", "",
        f"> 文档路径: `{page.get('path') or page.get('name')}`", "",
    ]
    body = (text or "").strip()
    lines.append(body if body else "（该页面未提取到文本内容）")
    lines.append("")
    return "\n".join(lines)


def export_all(kb_root: Path, session, team_id, project_id, delay=0.3) -> dict:
    raw = kb_root / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    documents = list_documents(session, team_id, project_id)
    if not documents:
        raise RuntimeError("未找到文档，请检查 Cookie 与 URL")

    manifest = {
        "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "team_id": team_id,
        "project_id": project_id,
        "document_count": len(documents),
        "page_count": 0,
        "documents": [],
    }

    for idx, doc in enumerate(documents, 1):
        doc_id, doc_name = doc["doc_id"], doc["name"]
        doc_dir = raw / safe_name(doc_name)
        doc_dir.mkdir(parents=True, exist_ok=True)
        meta = {"doc_id": doc_id, "exported_pages": 0, "empty_pages": 0, "failed_pages": []}
        try:
            _, ver, mapping = fetch_mapping(session, project_id, doc_id)
            version_id = str(ver.get("id") or "")
            sitemap = extract_sitemap(mapping)
            pages_map = mapping.get("pages") or {}
            meta["page_count"] = len(sitemap)
            for i, page in enumerate(sitemap, 1):
                fp = doc_dir / f"{i:03d}_{safe_name(page.get('name') or f'page_{i}')}.md"
                resolved = resolve_page(pages_map, page.get("filename") or "")
                text = ""
                if resolved:
                    try:
                        text = fetch_page_text(session, resolved[1])
                    except Exception as e:
                        meta["failed_pages"].append({"page": page.get("name"), "error": str(e)})
                else:
                    meta["failed_pages"].append({"page": page.get("name"), "error": "mapping 无 HTML"})
                if not text.strip():
                    meta["empty_pages"] += 1
                fp.write_text(build_md(
                    doc_name=doc_name, doc_id=doc_id, version_id=version_id,
                    page=page, text=text, team_id=team_id, project_id=project_id,
                ), encoding="utf-8")
                meta["exported_pages"] += 1
                if delay:
                    time.sleep(delay)
        except Exception as e:
            meta["error"] = str(e)
        manifest["page_count"] += meta.get("page_count", 0)
        manifest["documents"].append({"doc_name": doc_name, **meta})
        (doc_dir / "_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  [{idx}/{len(documents)}] {doc_name}: {meta.get('exported_pages', 0)} pages")

    index_lines = [
        "# 蓝湖需求知识库", "",
        f"- 导出时间: {manifest['exported_at']}",
        f"- 文档数: {manifest['document_count']}",
        f"- 页面总数: {manifest['page_count']}", "",
        "## 文档索引", "",
        "| 文档 | 页面 |", "| --- | ---: |",
    ]
    for d in manifest["documents"]:
        index_lines.append(f"| {d.get('doc_name')} | {d.get('page_count', '-')} |")
    (kb_root / "index.md").write_text("\n".join(index_lines) + "\n", encoding="utf-8")
    (kb_root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def parse_page(fp: Path, raw_root: Path) -> dict:
    text = fp.read_text(encoding="utf-8")
    meta, body = {}, text
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            for line in parts[1].splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
            body = parts[2].strip()
    title = fp.stem.split("_", 1)[1] if "_" in fp.stem else fp.stem
    return {
        "file": str(fp.relative_to(raw_root)).replace("\\", "/"),
        "document": fp.parent.name,
        "title": title,
        "path": meta.get("path", ""),
        "source_url": meta.get("source_url", ""),
        "body": body,
        "is_meta": title in META_TITLES,
    }


def doc_version(name: str):
    m = VERSION_RE.search(name)
    return tuple(int(x) for x in m.groups()) if m else None


def pick_primary(dirs: list[Path]) -> str | None:
    ranked = [(doc_version(d.name), d.name, d.stat().st_mtime) for d in dirs if doc_version(d.name)]
    if ranked:
        ranked.sort(key=lambda x: (x[0], x[2]), reverse=True)
        return ranked[0][1]
    return max(dirs, key=lambda p: p.stat().st_mtime).name if dirs else None


def classify(page: dict) -> tuple[str, str]:
    combined = f"{page['path']}/{page['title']}"
    if page["is_meta"]:
        return "02_全局元信息", page["title"]
    if page["title"] in {"版本说明", "优化内容"}:
        return "01_版本与变更", page["title"]
    zone = "99_其他"
    if "桌面端" in combined: zone = "03_桌面端"
    elif "Web端" in combined or "web端" in combined: zone = "04_Web端"
    elif "App端" in combined: zone = "05_App端"
    elif "云课堂" in combined: zone = "06_云课堂"
    role = "学员侧" if "学员" in combined else "导师侧" if "导师" in combined else "管理侧" if "管理" in combined else "通用"
    return zone, role


def strip_body(body: str) -> str:
    lines = body.splitlines()
    if lines and lines[0].startswith("#"):
        lines = lines[1:]
    while lines and (not lines[0].strip() or lines[0].startswith(">")):
        lines.pop(0)
    return "\n".join(lines).strip()


def block(page: dict, level=3) -> str:
    h = "#" * level
    body = strip_body(page["body"])
    lines = [f"{h} {page['title']}", "", f"- **来源**: `{page['document']}`", f"- **路径**: `{page['path']}`"]
    if page.get("source_url"):
        lines.append(f"- **蓝湖**: {page['source_url']}")
    lines.extend(["", body or "（无正文）", ""])
    return "\n".join(lines)


def write_group(path: Path, title: str, intro: str, sections: list[tuple[str, list]]):
    lines = [f"# {title}", "", intro, ""]
    for sec, pages in sections:
        if not pages:
            continue
        lines += [f"## {sec}", ""]
        for p in pages:
            lines.append(block(p))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def synthesize(kb_root: Path) -> dict:
    raw = kb_root / "raw"
    out = kb_root / "结构化知识库"
    dirs = [p for p in raw.iterdir() if p.is_dir()]
    primary = pick_primary(dirs)
    if not primary:
        raise RuntimeError("raw/ 为空")

    all_pages = [parse_page(fp, raw) for d in dirs for fp in sorted(d.glob("*.md")) if not fp.name.startswith("_")]
    primary_pages = sorted([p for p in all_pages if p["document"] == primary], key=lambda x: x["file"])
    primary_titles = {p["title"] for p in primary_pages}

    if out.exists():
        import shutil
        shutil.rmtree(out)
    out.mkdir()

    grouped = defaultdict(lambda: defaultdict(list))
    for p in primary_pages:
        if p["is_meta"]:
            z, sub = classify(p)
            grouped[z][sub].append(p)
        elif not p["title"].startswith("AI"):
            z, sub = classify(p)
            grouped[z][sub].append(p)

    (out / "00_产品总览.md").write_text(
        f"# 产品需求总览\n\n> 主文档: **{primary}** | 页数: {len(primary_pages)}\n\n"
        f"详见各端目录与 Agent 撰写的交互逻辑分析。\n", encoding="utf-8"
    )

    names = {"03_桌面端": "桌面端", "04_Web端": "Web端", "05_App端": "App端", "06_云课堂": "云课堂", "02_全局元信息": "全局元信息", "99_其他": "其他"}
    for zone in sorted(grouped.keys()):
        sections = [(s, ps) for s, ps in sorted(grouped[zone].items())]
        write_group(out / zone / "需求汇总.md", names.get(zone, zone), f"来自 `{primary}`", sections)
        for s, ps in sections:
            for p in ps:
                safe = re.sub(r'[<>:"/\\|?*]', "_", p["title"])[:60]
                write_group(out / zone / f"{safe}.md", p["title"], p["path"], [("详情", [p])])

    legacy = [p for p in all_pages if p["document"] != primary and not p["is_meta"] and p["title"] not in primary_titles]
    if legacy:
        by_doc = defaultdict(list)
        for p in legacy:
            by_doc[p["document"]].append(p)
        write_group(out / "11_历史文档补充" / "历史功能汇总.md", "历史补充", "主文档未覆盖项", list(by_doc.items()))

    for fname, placeholder in [
        ("交互逻辑分析.md", "# 交互逻辑分析\n\n> 待 Agent 补充跨页交互与复杂逻辑。\n"),
        ("测试关注点.md", "# 测试关注点\n\n> 待 Agent 补充边界与异常路径。\n"),
        ("页面关系图.md", "# 页面关系图\n\n> 待 Agent 补充 Mermaid 流程图。\n"),
    ]:
        (out / fname).write_text(placeholder, encoding="utf-8")

    (out / "README.md").write_text(
        f"# 结构化需求知识库\n\n主文档: {primary}\n\n1. 00_产品总览\n2. 各端需求汇总\n3. 交互逻辑分析\n", encoding="utf-8"
    )
    sm = {"primary_document": primary, "primary_pages": len(primary_pages), "legacy_pages": len(legacy)}
    (out / "manifest.json").write_text(json.dumps(sm, ensure_ascii=False, indent=2), encoding="utf-8")
    return sm


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kb-root", type=Path, required=True)
    args = parser.parse_args()
    kb_root = args.kb_root.resolve()

    cookie = env_required("LANHU_COOKIE")
    team_id = env_required("LANHU_TEAM_ID")
    project_id = env_required("LANHU_PROJECT_ID")

    session = make_session(cookie)
    print("[1/2] 导出 raw …")
    export_all(kb_root, session, team_id, project_id)
    print("[2/2] 合成结构化知识库 …")
    synthesize(kb_root)
    print("OK:", kb_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

---

## Step 4：交互逻辑分析（Agent 必做）

自动化导出只做结构化整理；**跨页流程、状态机、权限差异、复杂业务规则**须 Agent 阅读产出后撰写。

### 4.1 阅读顺序

1. `结构化知识库/00_产品总览.md`
2. `结构化知识库/02_全局元信息/`
3. 各端 `03_桌面端/` … `06_云课堂/` 的 `需求汇总.md`
4. `raw/` 原始页核对细节

### 4.2 必须写入 `{KB_ROOT}/结构化知识库/`

| 文件 | 内容 |
|------|------|
| `交互逻辑分析.md` | 跨页跳转、状态流转、角色切换、列表→详情闭环 |
| `测试关注点.md` | 边界、权限、异常路径、多端一致性 |
| `页面关系图.md` | Mermaid 主流程与用户旅程 |

### 4.3 每模块检查项

- **入口 / 出口**：从哪进入、操作后跳哪
- **状态**：列表 / 编辑 / 空态 / 加载
- **权限**：学员 / 导师 / 管理员差异
- **字段联动**：筛选、校验、计分
- **跨端一致**：桌面 / Web / App 同名功能差异

### 4.4 分析文档模板

**交互逻辑分析.md**：

```markdown
# 交互逻辑分析
> 项目：{name} | {date}

## 1. 角色与端矩阵
| 角色 | 桌面端 | Web | App |

## 2. 核心用户旅程
### 2.1 {旅程名}
- 步骤：...
- 分支/异常：...

## 3. 模块交互
### 3.1 {模块}
- 入口 / 出口 / 状态 / 权限 / 联动

## 4. 写用例建议
- P0：...
```

**页面关系图.md** — 使用 Mermaid `flowchart` 描述主流程。

**测试关注点.md** — 按模块列出：边界值、权限拒绝、空态、并发、多端不一致、回归范围。

---

## Step 5：完成汇报

向用户说明：

1. 知识库路径：`{Desktop}/需求知识库`
2. 文档数、页面数（见 `manifest.json`）
3. 推荐阅读：`结构化知识库/README.md` → `交互逻辑分析.md`
4. **已清除本次 Cookie，未保存至本地**
5. 更新导出：重新运行 Skill → **再次弹出凭据窗**填写 Cookie（勿复用过期 Cookie）

---

## 故障排查

| 现象 | 处理 |
|------|------|
| 文档列表为空 | Cookie 过期或 tid/pid 错误 |
| 大量空页 | 页面仅含原型图/交互，属正常 |
| API 401/403 | 重新复制 Cookie，勿复用旧环境变量 |
| Windows 弹窗无效 | PowerShell 加 `-STA`；脚本须 UTF-8 BOM；先跑 `-SelfTest` |
| 弹窗未出现 | 检查是否在无 GUI 环境；降级对话收集或换本机终端 |
| 用户取消弹窗 | 提示重新运行 Skill，不要静默继续 |
