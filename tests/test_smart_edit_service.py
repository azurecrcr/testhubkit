import pytest

from core.services.test_cases.smart_edit_service import (
    build_edit_chat_messages,
    build_edit_prompt,
    validate_edit_response,
    _extract_json_object,
    _extract_edit_stream_thinking_prefix,
)


def _snapshot():
    return {
        "columns": ["模块", "用例标题", "步骤"],
        "rows": [
            {"rowIndex": 0, "cells": {"模块": "登录", "用例标题": "正常登录", "步骤": "输入账号"}},
            {"rowIndex": 1, "cells": {"模块": "登录", "用例标题": "错误密码", "步骤": "输入错误密码"}},
        ],
        "rowCount": 2,
    }


def _metersphere_snapshot():
    return {
        "columns": [
            "用例名称", "所属模块", "标签", "前置条件", "步骤描述",
            "预期结果", "编辑模式", "备注", "用例等级",
        ],
        "rows": [],
        "rowCount": 0,
    }


def test_build_edit_prompt_contains_user_snapshot_and_headers():
    prompt = build_edit_prompt("统一模块名", _snapshot())
    assert "统一模块名" in prompt
    assert "正常登录" in prompt
    assert "智能编辑助手" in prompt
    assert "【表格表头 columns" in prompt
    assert "1. 模块" in prompt
    assert "2. 用例标题" in prompt
    assert "3. 步骤" in prompt
    assert "新增 N 行则输出 N 条 add" in prompt


def test_build_edit_prompt_metersphere_step_constraint():
    prompt = build_edit_prompt(
        "新增一条用例",
        _metersphere_snapshot(),
        is_metersphere_headers=True,
    )
    assert "MeterSphere 编辑模式约束" in prompt
    assert "必须且只能填写 STEP" in prompt


def test_build_edit_prompt_without_metersphere_flag():
    prompt = build_edit_prompt(
        "新增一条用例",
        _metersphere_snapshot(),
        is_metersphere_headers=False,
    )
    assert "MeterSphere 编辑模式约束" not in prompt


def test_validate_update_and_add():
    data = {
        "summary": "更新1行新增1行",
        "operations": [
            {"type": "update", "rowIndex": 0, "cells": {"模块": "认证"}},
            {"type": "add", "cells": {"模块": "登出", "用例标题": "退出登录"}},
        ],
    }
    out = validate_edit_response(data, _snapshot())
    assert len(out["operations"]) == 2
    assert out["operations"][0]["rowIndex"] == 0


def test_validate_multiple_add_rows():
    data = {
        "summary": "新增2行",
        "operations": [
            {"type": "add", "cells": {"模块": "登出", "用例标题": "退出登录", "步骤": "点击退出"}},
            {"type": "add", "cells": {"模块": "登出", "用例标题": "会话超时", "步骤": "等待超时"}},
        ],
    }
    out = validate_edit_response(data, _snapshot())
    assert len(out["operations"]) == 2
    assert all(op["type"] == "add" for op in out["operations"])


def test_reject_delete():
    data = {"summary": "x", "operations": [{"type": "delete", "rowIndex": 0, "cells": {}}]}
    with pytest.raises(ValueError, match="禁止删除"):
        validate_edit_response(data, _snapshot())


def test_reject_out_of_range_row_index():
    data = {
        "summary": "x",
        "operations": [{"type": "update", "rowIndex": 9, "cells": {"模块": "x"}}],
    }
    with pytest.raises(ValueError, match="越界"):
        validate_edit_response(data, _snapshot())


def test_extract_json_from_markdown_fence():
    raw = '说明\n```json\n{"summary":"ok","operations":[]}\n```'
    data = _extract_json_object(raw)
    assert data["summary"] == "ok"


def test_extract_edit_stream_thinking_prefix_before_json():
    buf = "分析用户需求，准备更新模块列。\n\n```json\n{\"summary\":\"ok\"}"
    assert "分析用户需求" in _extract_edit_stream_thinking_prefix(buf)


def test_extract_edit_stream_thinking_prefix_empty_when_json_only():
    buf = '{"summary":"ok","operations":[]}'
    assert _extract_edit_stream_thinking_prefix(buf) == ""

def test_build_edit_prompt_includes_conversation_history():
    history = [
        {"user_prompt": "第一问", "assistant_summary": "更新了 1 行"},
        {"user_prompt": "第二问", "assistant_summary": "新增了 1 行"},
    ]
    prompt = build_edit_prompt("第三问", _snapshot(), conversation_history=history)
    assert "第一问" in prompt
    assert "第二问" in prompt
    assert "第三问" in prompt
    assert "先前的编辑对话" in prompt
    assert "【用户编辑指令（本轮）】" in prompt

def test_build_edit_chat_messages_multi_turn():
    history = [
        {
            "user_prompt": "第一问",
            "assistant_summary": "更新了 1 行",
            "assistant_content": '{"summary":"更新了 1 行","operations":[]}',
        },
        {
            "user_prompt": "第二问",
            "assistant_summary": "新增了 1 行",
            "operations": [{"type": "add", "cells": {"模块": "A"}}],
        },
    ]
    messages = build_edit_chat_messages(
        "第三问",
        _snapshot(),
        conversation_history=history,
    )
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user" and messages[1]["content"] == "第一问"
    assert messages[2]["role"] == "assistant"
    assert messages[3]["role"] == "user" and messages[3]["content"] == "第二问"
    assert messages[4]["role"] == "assistant"
    assert messages[-1]["role"] == "user"
    assert "第三问" in messages[-1]["content"]
    assert "正常登录" in messages[-1]["content"]

