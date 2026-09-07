#!/usr/bin/env python3
"""Self-test smart edit multi-turn chat messages (no external API)."""
import sys
from pathlib import Path

ROOT = Path("/app")
if not (ROOT / "core").is_dir():
    ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.services.test_cases.smart_edit_service import build_edit_chat_messages  # noqa: E402


def _snapshot():
    return {
        "columns": ["模块", "用例标题"],
        "rows": [{"cells": {"模块": "登录", "用例标题": "正常登录"}}],
        "rowCount": 1,
    }


def main() -> int:
    history = [
        {
            "user_prompt": "把标题改成 A",
            "assistant_summary": "更新了 1 行",
            "assistant_content": '{"summary":"更新了 1 行","operations":[]}',
        },
        {
            "user_prompt": "再加一条用例",
            "assistant_summary": "新增了 1 行",
            "operations": [{"type": "add", "cells": {"模块": "B", "用例标题": "B1"}}],
        },
    ]
    messages = build_edit_chat_messages(
        "第三问：补充步骤",
        _snapshot(),
        conversation_history=history,
    )
    roles = [m["role"] for m in messages]
    expected = ["system", "user", "assistant", "user", "assistant", "user"]
    if roles != expected:
        print("FAIL roles", roles, "expected", expected)
        return 1
    if "第三问" not in messages[-1]["content"]:
        print("FAIL missing current prompt in last user message")
        return 1
    if "正常登录" not in messages[-1]["content"]:
        print("FAIL missing snapshot in last user message")
        return 1
    if messages[1]["content"] != "把标题改成 A":
        print("FAIL history user 1")
        return 1
    print("OK multiturn messages", len(messages))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
