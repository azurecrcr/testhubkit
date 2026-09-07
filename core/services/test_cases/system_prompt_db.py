"""测试用例生成相关系统提示词（MySQL，供后台维护）。"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from core.services.feedback.feedback_db import get_connection

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS tc_system_prompts (
    prompt_key VARCHAR(64) NOT NULL PRIMARY KEY,
    content LONGTEXT NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

TABLE_GENERATE_DEFAULT_KEY = "table_generate_default"

_MINDMAP_RULE_PRESET_CONTENT = (
    "# 角色\n"
    "你是精通测试设计的高级测试架构师。\n"
    "# 任务\n"
    "用\"要素分类法\"为指定功能生成思维导图测试用例，格式可直接导入XMind。\n"
    "# 规则\n"
    "1. **层级结构**：测试对象 → 测试要素 → 要素取值 → 测试用例（TC开头）\n"
    "2. **要素维度**：用户类型、输入数据、操作步骤、环境、网络、系统状态、异常场景等\n"
    "3. **用例要求**：具体可执行，覆盖正向、异常、边界、组合场景\n"
    "# 输出格式\n"
    "- 用缩进表示层级：中心主题无缩进，每层缩进4个空格\n"
    "- 用例以\"TC:\"开头，描述必须具体\n"
    "# 示例：用户登录功能\n"
    "用户登录功能\n"
    "    **输入数据-账号**\n"
    "        有效账号\n"
    "            TC: 输入注册手机号，验证登录成功并跳转主页\n"
    "        无效账号\n"
    "            TC: 输入未注册手机号，验证提示\"账号不存在\"\n"
    "        空账号\n"
    "            TC: 账号留空点击登录，验证提示\"账号不能为空\"\n"
    "    **输入数据-密码**\n"
    "        正确密码\n"
    "            TC: 输入匹配密码，验证登录成功\n"
    "        错误密码\n"
    "            TC: 输入错误密码，验证提示\"账号或密码错误\"\n"
    "    **网络环境**\n"
    "        断网\n"
    "            TC: 断网点击登录，验证立即提示\"网络连接失败\"\n"
    "        弱网\n"
    "            TC: 弱网下登录，验证超时后给出友好提示\n"
    "    **系统状态**\n"
    "        账号冻结\n"
    "            TC: 使用已冻结账号登录，验证提示\"账号已被冻结\"\n"
    "---\n"
    "请为以下功能生成测试用例：\n"
)

# 表格用例生成默认提示词（首次建表或缺失键时写入 tc_system_prompts）
_TABLE_GENERATE_DEFAULT_CONTENT = (
    "# 角色\n"
    "你是精通测试设计的高级测试架构师。\n"
    "\n"
    "# 任务\n"
    "严格按照规则为指定功能生成测试用例，格式为可直接复制的Python数组格式。\n"
    "\n"
    "# 规则\n"
    "1. **字段设置**：每条用例需包含以下字段，字段顺序可根据实际场景灵活调整：\n"
    "   用例名称、所属模块、标签、前置条件、步骤描述、预期结果、编辑模式、备注、用例等级\n"
    "   示例排列：用例名称、所属模块、标签、前置条件、步骤描述、预期结果、编辑模式、备注、用例等级\n"
    "2. **编辑模式**：必须且只能填写STEP（全大写），每条用例的第7列（按示例顺序）须为STEP，不得留空\n"
    "3. **标签与备注**：固定留空即可\n"
    "4. **用例等级**：仅限P0、P1、P2、P3四档\n"
    "   P0：核心主干流程，产品基础必备功能，阻断版本上线，必测不可遗漏\n"
    "   P1：高频常用基础功能，正常用户高频操作，上线必须全部验证通过\n"
    "   P2：低频场景、边界条件、异常交互、次要功能、UI细节类场景\n"
    "   P3：极冷门功能、小众场景、美化动效、极端兼容、非核心体验优化，按需抽样测试\n"
    "5. **步骤与预期**：\n"
    "   - 步骤描述、预期结果使用[1][2][3]有序编号\n"
    "   - 前置条件使用1、2、3编号\n"
    "   - 每一条内容单独换行并添加\\n分隔\n"
    "   - 一个步骤对应一个结果，预期结果精准对应步骤操作\n"
    "6. **输出格式**：以Python可复制的数组格式输出，示例结构如下：\n"
    "   test_cases = [\n"
    "       [\"用例名称\", \"所属模块\", \"标签\", \"前置条件\", \"步骤描述\", \"预期结果\", \"编辑模式\", \"备注\", \"用例等级\"]\n"
    "   ]\n"
    "   实际输出时可按设置的字段顺序调整列的位置\n"
    "7. **内容约束**：\n"
    "   - 基于常规合理业务逻辑设计，不虚构功能与场景\n"
    "   - 综合运用边界分析法、等价类划分法、错误推测法、场景法、正交分解法、反向测试、异常测试等\n"
    "   - 覆盖正向流程、边界极值、非法反向、空值/特殊字符/超长文本、重复操作、连续交互、异常状态等维度\n"
    "   - 描述客观中立，可落地、可执行、可校验，无主观模糊话术\n"
    "   - 逻辑闭环，精简无废话\n"
)
DEFAULT_PROMPTS: Dict[str, Dict[str, str]] = {
    TABLE_GENERATE_DEFAULT_KEY: {
        "description": "表格用例生成 · 默认提示词（管理员可维护）",
        "content": _TABLE_GENERATE_DEFAULT_CONTENT,
    },
    "mindmap_rule_preset": {
        "description": "内网预设 · 导图用例生成默认规则",
        "content": _MINDMAP_RULE_PRESET_CONTENT,
    },
    "mindmap_rule_custom": {
        "description": "自定义模式 · 导图用例生成默认规则",
        "content": (
            "严格按照思维导图格式生成测试用例，以功能模块为根节点，向下拆解为测试场景，"
            "末级叶子节点必须是一条可直接执行的完整用例。禁止输出任何解释、说明或无关内容。"
            "仅输出导图结构本身。"
        ),
    },
}


def ensure_tc_system_prompts_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
    finally:
        conn.close()


def seed_tc_system_prompt_defaults() -> int:
    """缺失的 prompt_key 写入默认值；返回本次新增条数。"""
    ensure_tc_system_prompts_table()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    inserted = 0
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for key, meta in DEFAULT_PROMPTS.items():
                cur.execute(
                    "SELECT prompt_key FROM tc_system_prompts WHERE prompt_key = %s LIMIT 1",
                    (key,),
                )
                if cur.fetchone():
                    continue
                cur.execute(
                    """
                    INSERT INTO tc_system_prompts (prompt_key, content, description, updated_at)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (key, meta["content"], meta.get("description", ""), now),
                )
                inserted += 1
    finally:
        conn.close()
    return inserted


def get_tc_system_prompt(prompt_key: str) -> Optional[str]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT content FROM tc_system_prompts
                WHERE prompt_key = %s
                LIMIT 1
                """,
                (prompt_key,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return (row["content"] or "").strip() or None
    finally:
        conn.close()


def get_table_generate_default_prompt() -> str:
    """表格 MeterSphere 用例生成默认提示词（库中无记录时用代码兜底）。"""
    seed_tc_system_prompt_defaults()
    text = get_tc_system_prompt(TABLE_GENERATE_DEFAULT_KEY)
    if text:
        return text
    return DEFAULT_PROMPTS[TABLE_GENERATE_DEFAULT_KEY]["content"]


def get_mindmap_prompt_rules() -> Dict[str, str]:
    """返回导图生成用的 preset/custom 规则文案（库中无记录时用 DEFAULT_PROMPTS）。"""
    seed_tc_system_prompt_defaults()
    preset = get_tc_system_prompt("mindmap_rule_preset")
    custom = get_tc_system_prompt("mindmap_rule_custom")
    if not preset:
        preset = DEFAULT_PROMPTS["mindmap_rule_preset"]["content"]
    if not custom:
        custom = DEFAULT_PROMPTS["mindmap_rule_custom"]["content"]
    return {
        "mindmap_rule_preset": preset,
        "mindmap_rule_custom": custom,
    }


def get_tc_workbench_system_prompts() -> Dict[str, str]:
    """返回用例工作台前端需要的全部系统提示词（导图 + 表格默认）。"""
    rules = get_mindmap_prompt_rules()
    rules[TABLE_GENERATE_DEFAULT_KEY] = get_table_generate_default_prompt()
    return rules


def save_tc_system_prompt(prompt_key: str, content: str, description: str = "") -> Dict[str, Any]:
    """供后续后台维护：按 key 更新系统提示词。"""
    ensure_tc_system_prompts_table()
    text = (content or "").strip()
    if not text:
        raise ValueError("提示词内容不能为空")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_system_prompts (prompt_key, content, description, updated_at)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    content = VALUES(content),
                    description = VALUES(description),
                    updated_at = VALUES(updated_at)
                """,
                (prompt_key, text, (description or "").strip(), now),
            )
    finally:
        conn.close()
    return {"prompt_key": prompt_key, "content": text, "description": description, "updated_at": now}
