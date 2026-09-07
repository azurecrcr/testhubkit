#!/usr/bin/env python3
"""Verify fill_gaps prompt assembly (fixed text, conditional requirements)."""
from core.services.test_cases.agent_llm_utils import (
    _build_fill_gaps_user_prompt,
    _resolve_fill_gaps_requirements_text,
    _rag_context_block,
)

job = {"mode": "fill_gaps_only", "user_intent": "用户自定义不应出现", "options": {}}
opts = {"fill_gap_mode": "both", "agent_prompt": "也不应出现"}
fixed = _build_fill_gaps_user_prompt(job, opts)
assert "用户自定义" not in fixed
assert "也不应出现" not in fixed
assert "补全以下未覆盖" in fixed

req_off = _resolve_fill_gaps_requirements_text({}, job, {})
assert req_off == ""

job2 = {
    "mode": "fill_gaps_only",
    "options": {"lanhu_url": "http://x", "lanhu_cookie": "c"},
}
ctx = {"requirements": "需求摘要ABC"}
req_on = _resolve_fill_gaps_requirements_text(ctx, job2, {})
assert req_on == "需求摘要ABC"

ctx3 = {
    "context_layers": {
        "requirements": "蓝湖需求不应进RAG",
        "public": "公共案例XYZ",
    },
    "rag_context": "",
}
rag_fill = _rag_context_block(ctx3, exclude_requirements=True).strip()
assert "蓝湖需求不应进RAG" not in rag_fill
assert "公共案例XYZ" in rag_fill

ctx4 = {"context_layers": {"requirements": "仅有需求"}, "rag_context": ""}
assert _rag_context_block(ctx4, exclude_requirements=True).strip() == ""

print("OK fill_gaps prompt helpers")
