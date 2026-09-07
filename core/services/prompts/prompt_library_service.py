from __future__ import annotations

import json
import os
import re
import time
import uuid
from typing import Any, Dict, List, Optional

from core.config.paths import BASE_DIR
from core.services.prompts.prompt_library_db import ensure_prompt_table, get_connection

VALID_CATEGORIES = {"metersphere", "test_report", "api_auto", "smoke"}
VALID_TYPES = {"prompt", "skill"}
SSH_KEY_DEPLOY_ENTRY_ID = "ssh_deploy1"
LANHU_REQUIREMENT_KB_ENTRY_ID = "lanhu_req_kb1"


def _now_str() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())


def _read_ssh_key_deploy_skill_text() -> str:
    path = os.path.join(BASE_DIR, "ssh-key-deploy", "SKILL.md")
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read().replace("\r\n", "\n").strip()
    return ""


def get_ssh_key_deploy_seed_entry() -> Dict[str, Any]:
    body = _read_ssh_key_deploy_skill_text()
    return {
        "id": SSH_KEY_DEPLOY_ENTRY_ID,
        "entry_type": "skill",
        "category": "smoke",
        "kicker": "运维 · SSH 密钥部署",
        "title": "SSH 公钥部署（Cursor）",
        "tags": ["SSH", "ed25519", "Cursor Agent", "免密登录", "Posh-SSH", "authorized_keys"],
        "blurb": "按主机生成 ed25519 密钥，系统原生弹窗收集账号密码，写入 authorized_keys，支持 Windows / macOS / Linux 免密登录。",
        "body": body,
        "sort_order": 50,
    }


def _read_lanhu_requirement_kb_skill_text() -> str:
    path = os.path.join(BASE_DIR, "lanhu-requirement-kb", "SKILL.md")
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read().replace("\r\n", "\n").strip()
    return ""


def get_lanhu_requirement_kb_seed_entry() -> Dict[str, Any]:
    body = _read_lanhu_requirement_kb_skill_text()
    return {
        "id": LANHU_REQUIREMENT_KB_ENTRY_ID,
        "entry_type": "skill",
        "category": "smoke",
        "kicker": "需求 · 蓝湖知识库",
        "title": "产品需求梳理（Cursor）",
        "tags": ["蓝湖", "需求知识库", "Axure", "Cursor Agent", "测试用例", "交互逻辑", "产品需求"],
        "blurb": (
            "从蓝湖导出整个项目的 Axure 文档与全部页面，在本机桌面生成结构化需求知识库，"
            "并撰写交互逻辑分析、测试关注点与页面关系图，供梳理全项目需求与编写测试用例使用。"
            "Cookie 仅本次会话使用，禁止落盘或上传服务器。"
        ),
        "body": body,
        "sort_order": 55,
    }


def _read_smoke_skill_text() -> str:
    path = os.path.join(BASE_DIR, "templates", "prompt_library.html")
    if not os.path.isfile(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    m = re.search(
        r'<script\s+type="text/plain"\s+id="hf-smoke-skill">(.*?)</script>',
        html,
        re.DOTALL,
    )
    return m.group(1).replace("\r\n", "\n").strip() if m else ""


def _load_seed_from_json() -> Optional[List[Dict[str, Any]]]:
    path = os.path.join(BASE_DIR, "scripts", "builtin_prompts.json")
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        return None
    out: List[Dict[str, Any]] = []
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "id": str(item.get("id") or uuid.uuid4().hex[:12]),
                "entry_type": str(item.get("entry_type") or "prompt"),
                "category": str(item.get("category") or ""),
                "kicker": str(item.get("kicker") or ""),
                "title": str(item.get("title") or ""),
                "blurb": str(item.get("blurb") or ""),
                "tags": item.get("tags") if isinstance(item.get("tags"), list) else [],
                "body": str(item.get("body") or item.get("text") or ""),
                "sort_order": (i + 1) * 10,
            }
        )
    return out or None


def _default_seed_entries() -> List[Dict[str, Any]]:
    from_json = _load_seed_from_json()
    if from_json:
        return from_json
    smoke_text = _read_smoke_skill_text()
    return [
        {
            "id": "m1",
            "entry_type": "prompt",
            "category": "metersphere",
            "kicker": "用例设计 · MeterSphere",
            "title": "MeterSphere 用例生成（Kimi）",
            "tags": ["MeterSphere", "YAML", "P0–P3"],
            "blurb": "九列固定顺序、编辑模式 STEP、P0–P3 等级、步骤/预期 [1][2][3] 与 Python 列表样例。",
            "body": "请严格按照以下所有规则生成测试用例，格式规则 + 内容规则严格遵守，禁止违规输出：\n一、固定格式规则\n1.固定字段顺序：用例名称、所属模块、标签、前置条件、步骤描述、预期结果、编辑模式、备注、用例等级\n2.编辑模式字段必须且只能填写：STEP（全大写，禁止使用 STMP 或其他值；每条用例的第 7 列必须为 STEP，不得留空），标签和备注固定留空即可\n3.用例等级仅限：P0、P1、P2、P3 四档\n    P0：核心主干流程，产品基础必备功能，阻断版本上线，必测不可遗漏。\n    P1：高频常用基础功能，正常用户高频操作，上线必须全部验证通过。\n    P2：低频场景、边界条件、异常交互、次要功能、UI 细节类场景。\n    P3：极冷门功能、小众场景、美化动效、极端兼容、非核心体验优化，按需抽样测试。\n4.步骤描述、预期结果必须使用 [1][2][3] 有序编号，前置条件必须使用1、2、3，每一条内容单独换行并添加 \\n 分隔\n5.步骤简洁客观，一个步骤对应一个结果，预期结果精准对应步骤操作，贴合业务场景，\n6.整体格式整洁，每条用例独立分段，严格以指定 python 的可复制的数组格式返回：\ntest_cases = [\n[\n\"用例名称\",\n\"所属模块\",\n\"标签\",\n\"前置条件\",\n\"步骤描述\",\n\"预期结果\",\n\"编辑模式\",\n\"备注\",\n\"用例等级\"\n]\n]\n7.内容输出在代码块中\n二、内容创作强制约束规则\n1.禁止臆想、脑补、虚构、捏造业务功能与场景，不胡思乱想，所有内容基于常规合理业务逻辑，无凭空编造内容。\n2.必须结合专业测试方法设计用例，包含但不限于：边界分析法、等价类划分法、错误推测法、场景法、正向测试、反向测试、异常测试等。\n3.全面覆盖测试场景：正常正向流程、边界极值场景、非法反向操作、空值 / 特殊字符 / 超长文本、重复操作、连续交互、异常状态等维度。\n4.所有描述保持客观中立，只写可落地、可执行、可校验的操作与结果，无主观评价、无模糊笼统话术。\n5.严格遵循单步骤对应单预期结果，逻辑闭环，内容精简无废话、无多余修饰语句。\n\n需求为：\n",
            "sort_order": 10,
        },
        {
            "id": "tr1",
            "entry_type": "prompt",
            "category": "test_report",
            "kicker": "报告产出 · Gamma",
            "title": "版本测试报告（Gamma / PPT）",
            "tags": ["AISSP", "测试报告", "PPT", "缺陷统计"],
            "blurb": "硬性格式的缺陷统计表与三模块功能清单，适配 15–20 页 PPT，以下为示例项目内容可整体替换。",
            "body": "请根据以下项目信息生成《AISSP V1.5.0测试报告》，适配15-20页PPT。\n\n【视觉风格要求】\n- 整体配色：暗色系背景（深灰/深蓝），高亮文字使用青蓝、亮绿、橙色\n- 布局风格：模块化卡片式布局，信息分区清晰\n- 数据呈现：缺陷统计使用表格+色块标识等级（P0红/P1橙/P2黄/P3蓝）\n- 字体：标题加粗16-18号，正文14号，无衬线字体\n\n【硬性内容结构】\n1. 封面页：报告名称、版本号、测试负责人、测试时间\n2. 测试概览页：项目信息、环境、用例执行数据、缺陷总数\n3. 缺陷统计页（独占1页）：表格含姓名、P3/P2/P1/P0\n4. 风险说明页：独立卡片\n5. 功能清单：\n   - xxxxxxx\n6. 测试结论页\n\n【项目数据】（严格使用以下原文，不修改）\n测试负责人：xx\n测试时间：xxxx-xxxx\n测试环境：xxxxxxxx\n需求文档：xxxxxxx\n公司文档：软件测试流程规范\n总用例xxx条（核心xx条），执行xxx条，通过率xxx%\n\n缺陷统计：\n张三(P0:x,P1:x,P2:x,P3:x)\n李四(P0:x,P1:x,P2:x,P3:x)\n王五(P0:x,P1:x,P2:x,P3:x)\n赵六(P0:x,P1:x,P2:x,P3:x)\n总计xx个，均已闭环\n\n风险说明：\nxxxxxxx\n【功能清单】（全部通过，逐条原文抄录，不增不减不改）\n\nxxxxxx\n\n测试结论：\nxxxxxx\n\n【输出要求】\n- 返回完整PPT脚本（每页标题+正文），正文仅含上述原文内容\n- 不对功能清单做任何增删改，不添加描述性文字\n- 不加真实图片，仅提供图标占位符描述（如“[环形图占位]”）\n- 每页标注卡片数量建议\n- **所有页面禁止出现页码**\n",
            "sort_order": 20,
        },
        {
            "id": "a1",
            "entry_type": "prompt",
            "category": "api_auto",
            "kicker": "接口自动化 · pytest",
            "title": "API自动化用例（待调试）",
            "tags": ["API", "pytest", "契约"],
            "blurb": "基于接口说明生成可脚本化的用例要点：方法、鉴权、状态码、契约与异常。",
            "body": "你是一个“接口自动化测试用例生成/维护”的资深工程师（Python + pytest 风格优先）。我会在这段提示词后面追加 一个接口的 OpenAPI/Apifox YAML（类似示例）。你的任务是：先全局分析当前项目里是否已存在该接口的自动化用例；存在则基于现有用例做最小代价改造与补齐，不存在则新增一套高质量用例。严格按以下规则执行。\n\n（完整正文见系统内置种子，此处略）\n",
            "sort_order": 30,
        },
        {
            "id": "smoke1",
            "entry_type": "skill",
            "category": "smoke",
            "kicker": "冒烟 · Cursor Agent",
            "title": "冒烟测试（Cursor）",
            "tags": ["SSH", "docker", "pytest", "Allure", "Git", "Machine"],
            "blurb": "远端容器冒烟：YAML 选机、Machine 环境变量、git fetch 网络重试、pull/ff-only、Allure 同步与静态报告。",
            "body": smoke_text or "---\nname: smoke-test\n---\n",
            "sort_order": 40,
        },
    ]


def _row_to_item(row: Dict[str, Any]) -> Dict[str, Any]:
    tags = row.get("tags")
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except json.JSONDecodeError:
            tags = []
    return {
        "id": row["id"],
        "entry_type": row.get("entry_type") or "prompt",
        "category": row.get("category") or "",
        "kicker": row.get("kicker") or "",
        "title": row.get("title") or "",
        "blurb": row.get("blurb") or "",
        "tags": tags if isinstance(tags, list) else [],
        "text": row.get("body") or "",
    }


def _count_entries() -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM prompt_library_entries")
            row = cur.fetchone() or {}
            return int(row.get("c") or 0)
    finally:
        conn.close()


def seed_default_entries_if_empty() -> None:
    if _count_entries() > 0:
        return
    entries = _default_seed_entries()
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for item in entries:
                cur.execute(
                    """
                    INSERT INTO prompt_library_entries
                        (id, entry_type, category, kicker, title, blurb, tags, body, sort_order, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        item["id"],
                        item["entry_type"],
                        item["category"],
                        item["kicker"],
                        item["title"],
                        item["blurb"],
                        json.dumps(item.get("tags") or [], ensure_ascii=False),
                        item["body"],
                        item.get("sort_order", 0),
                        now,
                        now,
                    ),
                )
    finally:
        conn.close()


def init_prompt_library_storage() -> None:
    ensure_prompt_table()
    seed_default_entries_if_empty()


def list_prompt_entries() -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, entry_type, category, kicker, title, blurb, tags, body
                FROM prompt_library_entries
                ORDER BY sort_order ASC, updated_at DESC
                """
            )
            rows = cur.fetchall() or []
        return [_row_to_item(r) for r in rows]
    finally:
        conn.close()


def create_prompt_entry(data: Dict[str, Any]) -> Dict[str, Any]:
    entry_type = str(data.get("entry_type") or "prompt").strip().lower()
    category = str(data.get("category") or "").strip()
    title = str(data.get("title") or "").strip()
    body = str(data.get("body") or data.get("text") or "").strip()
    if entry_type not in VALID_TYPES:
        raise ValueError("类型须为 prompt 或 skill")
    if category not in VALID_CATEGORIES:
        raise ValueError("分类无效")
    if not title:
        raise ValueError("请填写标题")
    if not body:
        raise ValueError("请填写正文内容")
    kicker = str(data.get("kicker") or "").strip()
    blurb = str(data.get("blurb") or "").strip()
    tags = data.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    if not isinstance(tags, list):
        tags = []
    entry_id = uuid.uuid4().hex[:12]
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM prompt_library_entries")
            sort_order = int((cur.fetchone() or {}).get("n") or 10)
            cur.execute(
                """
                INSERT INTO prompt_library_entries
                    (id, entry_type, category, kicker, title, blurb, tags, body, sort_order, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    entry_id,
                    entry_type,
                    category,
                    kicker,
                    title,
                    blurb,
                    json.dumps(tags, ensure_ascii=False),
                    body,
                    sort_order,
                    now,
                    now,
                ),
            )
    finally:
        conn.close()
    return _row_to_item(
        {
            "id": entry_id,
            "entry_type": entry_type,
            "category": category,
            "kicker": kicker,
            "title": title,
            "blurb": blurb,
            "tags": tags,
            "body": body,
        }
    )


def upsert_prompt_entry(data: Dict[str, Any]) -> Dict[str, Any]:
    entry_id = str(data.get("id") or "").strip() or uuid.uuid4().hex[:12]
    entry_type = str(data.get("entry_type") or "prompt").strip().lower()
    category = str(data.get("category") or "").strip()
    title = str(data.get("title") or "").strip()
    body = str(data.get("body") or data.get("text") or "").strip()
    if entry_type not in VALID_TYPES:
        raise ValueError("类型须为 prompt 或 skill")
    if category not in VALID_CATEGORIES:
        raise ValueError("分类无效")
    if not title:
        raise ValueError("请填写标题")
    if not body:
        raise ValueError("请填写正文内容")
    kicker = str(data.get("kicker") or "").strip()
    blurb = str(data.get("blurb") or "").strip()
    tags = data.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    if not isinstance(tags, list):
        tags = []
    sort_order = int(data.get("sort_order") or 0)
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if sort_order <= 0:
                cur.execute("SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM prompt_library_entries")
                sort_order = int((cur.fetchone() or {}).get("n") or 10)
            cur.execute(
                """
                INSERT INTO prompt_library_entries
                    (id, entry_type, category, kicker, title, blurb, tags, body, sort_order, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    entry_type = VALUES(entry_type),
                    category = VALUES(category),
                    kicker = VALUES(kicker),
                    title = VALUES(title),
                    blurb = VALUES(blurb),
                    tags = VALUES(tags),
                    body = VALUES(body),
                    sort_order = VALUES(sort_order),
                    updated_at = VALUES(updated_at)
                """,
                (
                    entry_id,
                    entry_type,
                    category,
                    kicker,
                    title,
                    blurb,
                    json.dumps(tags, ensure_ascii=False),
                    body,
                    sort_order,
                    now,
                    now,
                ),
            )
    finally:
        conn.close()
    return _row_to_item(
        {
            "id": entry_id,
            "entry_type": entry_type,
            "category": category,
            "kicker": kicker,
            "title": title,
            "blurb": blurb,
            "tags": tags,
            "body": body,
        }
    )
