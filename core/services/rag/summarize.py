"""将蓝湖需求摘要提炼为一句检索 query。"""
from __future__ import annotations

from core.services.test_cases.test_case_generator_service import generate_test_cases

_SUMMARIZE_INSTRUCTION = """你是需求分析助手。将下方产品需求摘要提炼为一句中文检索语句，用于在历史需求知识库中搜索相关文档。

要求：
- 只输出一句话，20～80 字为宜
- 突出业务模块、功能点、关键场景
- 不要引号、不要编号、不要 markdown、不要解释"""


def summarize_lanhu_for_rag_query(
    lanhu_text: str,
    base_url: str,
    api_key: str,
    model: str,
    temperature: float | None = 0.1,
) -> str:
    text = str(lanhu_text or "").strip()
    if not text:
        return ""
    prompt = f"{_SUMMARIZE_INSTRUCTION}\n\n【当前页需求摘要】\n{text}"
    result = generate_test_cases(
        base_url,
        api_key,
        model,
        prompt,
        temperature=temperature,
    )
    line = str(result or "").strip().split("\n")[0].strip()
    for ch in ('"', "'", "「", "」", "『", "』", "`"):
        line = line.strip(ch)
    return line[:200]
