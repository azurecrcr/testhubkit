#!/usr/bin/env python3
"""Smart edit: use OpenAI multi-turn messages[] per workbench session."""
from pathlib import Path
import textwrap

ROOT = Path(__file__).resolve().parents[1]

GEN_PATH = ROOT / "core/services/test_cases/generation_stream_service.py"
GEN_OLD = textwrap.dedent(
    """
    def _resolve_ai_config(data: dict[str, Any], user_id: str | None) -> dict[str, Any]:
"""
)

GEN_INSERT = textwrap.dedent(
    """

    def stream_chat_completions_messages(
        base_url: str,
        api_key: str,
        model: str,
        messages: list[dict[str, Any]],
        temperature: float | None = None,
    ) -> Generator[tuple[str, str], None, None]:
        \"\"\"OpenAI 兼容流式 chat completions（多轮 messages）。\"\"\"
        api_url = f"{base_url.rstrip('/')}/chat/completions"
        payload = build_chat_completions_payload(
            model=model,
            messages=messages,
            stream=True,
            temperature=temperature,
            enable_thinking=True,
        )
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
        with requests.post(
            api_url, json=payload, headers=headers, stream=True, timeout=(10, None)
        ) as response:
            if response.status_code >= 400:
                detail = _format_upstream_api_error(response)
                raise requests.exceptions.HTTPError(
                    f"API请求失败 ({response.status_code}): {detail or response.text[:200]}"
                )
            for raw_line in response.iter_lines(decode_unicode=True):
                if not raw_line:
                    continue
                line = raw_line.strip()
                if not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue
                for stream_kind, content_piece in _extract_stream_delta_parts(chunk):
                    yield stream_kind, content_piece


"""
)

TCG_PATH = ROOT / "core/services/test_cases/test_case_generator_service.py"
TCG_MARKER = "def append_form_images(files, max_images: int = 4):"
TCG_INSERT = textwrap.dedent(
    '''

    def generate_chat_completions_messages(
        base_url: str,
        api_key: str,
        model: str,
        messages: list,
        temperature: float | None = None,
    ):
        from core.services.ai.openai_compat import build_chat_completions_payload

        api_url = f"{base_url.rstrip('/')}/chat/completions"
        payload = build_chat_completions_payload(
            model=model,
            messages=messages,
            stream=False,
            temperature=temperature,
            enable_thinking=False,
        )
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
        try:
            response = requests.post(
                api_url, json=payload, headers=headers, timeout=(10, 180)
            )
            response.raise_for_status()
        except requests.exceptions.HTTPError as exc:
            detail = _format_upstream_api_error(exc.response)
            status = exc.response.status_code if exc.response is not None else "?"
            msg = f"API请求失败 ({status})"
            if detail:
                msg += f": {detail}"
            raise requests.exceptions.HTTPError(
                msg, request=exc.request, response=exc.response
            ) from exc
        except requests.exceptions.ConnectTimeout:
            raise ConnectionError(
                f"连接 AI 服务超时，请确认 Base URL 可从当前服务器访问：{base_url}"
            )
        except requests.exceptions.ConnectionError:
            raise ConnectionError(
                f"无法连接 AI 服务（{base_url}）。云服务器通常无法访问 192.168.x 内网地址，"
                f"请改用公网可访问的 OpenAI 兼容地址，或在内网预设模式下由浏览器直连模型。"
            )
        response_data = response.json()
        if "choices" in response_data and response_data["choices"]:
            return response_data["choices"][0]["message"]["content"]
        return "无法获取AI回复"


'''
)

SERVICE_HELPERS = textwrap.dedent(
    '''

    def _build_system_content(is_metersphere_headers: bool) -> str:
        content = SYSTEM_PROMPT
        if is_metersphere_headers:
            content += METERSPHERE_EDIT_MODE_PROMPT
        return content

    def _build_snapshot_context_block(table_snapshot: dict[str, Any]) -> str:
        columns = list(table_snapshot.get("columns") or [])
        headers_block = _format_columns_block(columns)
        snapshot_json = json.dumps(table_snapshot, ensure_ascii=False, indent=2)
        return (
            "【表格表头 columns（cells 的 key 必须且仅能使用以下列名）】\\n"
            + headers_block
            + "\\n\\n【当前表格数据快照】\\n"
            + "说明：快照 JSON 含 columns（表头）、rows（行数据）、rowCount（行数）；"
            + "rows 中每行以 cells 对象存储，key 为表头列名。\\n"
            + snapshot_json
        )

    def _build_history_assistant_content(item: dict[str, str]) -> str:
        raw = str(item.get("assistant_content") or "").strip()
        if raw:
            return raw
        summary = str(item.get("assistant_summary") or "").strip()
        operations = item.get("operations")
        if not isinstance(operations, list):
            operations = []
        if summary or operations:
            return json.dumps(
                {"summary": summary or "已完成编辑", "operations": operations},
                ensure_ascii=False,
            )
        return ""

    def _build_current_user_content(
        user_prompt: str,
        table_snapshot: dict[str, Any],
        *,
        visual_context_id: str | None = None,
        user_id: str | None = None,
    ) -> str:
        from core.services.visual_attachments.context_builder import (
            inject_attachment_context_into_prompt,
        )

        effective_user_prompt = inject_attachment_context_into_prompt(
            user_prompt, visual_context_id, user_id
        )
        user = str(effective_user_prompt or "").strip()
        return (
            _build_snapshot_context_block(table_snapshot)
            + "\\n\\n【用户编辑指令（本轮）】\\n"
            + user
        )

    def build_edit_chat_messages(
        user_prompt: str,
        table_snapshot: dict[str, Any],
        *,
        is_metersphere_headers: bool = False,
        visual_context_id: str | None = None,
        user_id: str | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, str]]:
        history = _normalize_conversation_history(conversation_history)
        messages: list[dict[str, str]] = [
            {"role": "system", "content": _build_system_content(is_metersphere_headers)}
        ]
        for item in history:
            messages.append({"role": "user", "content": item["user_prompt"]})
            assistant = _build_history_assistant_content(item)
            if assistant:
                messages.append({"role": "assistant", "content": assistant})
        messages.append(
            {
                "role": "user",
                "content": _build_current_user_content(
                    user_prompt,
                    table_snapshot,
                    visual_context_id=visual_context_id,
                    user_id=user_id,
                ),
            }
        )
        return messages

'''
)

SERVICE_IMPORT_OLD = "from core.services.test_cases.generation_stream_service import stream_chat_completions"
SERVICE_IMPORT_NEW = (
    "from core.services.test_cases.generation_stream_service import "
    "stream_chat_completions_messages"
)

SERVICE_TCG_IMPORT_OLD = "from core.services.test_cases.test_case_generator_service import generate_test_cases"
SERVICE_TCG_IMPORT_NEW = (
    "from core.services.test_cases.test_case_generator_service import "
    "generate_chat_completions_messages"
)

NORMALIZE_OLD = """        out.append({"user_prompt": user, "assistant_summary": summary})
        if len(out) >= max_turns:"""

NORMALIZE_NEW = """        assistant_content = str(item.get("assistant_content") or "").strip()
        operations = item.get("operations")
        if not isinstance(operations, list):
            operations = []
        out.append(
            {
                "user_prompt": user,
                "assistant_summary": summary,
                "assistant_content": assistant_content,
                "operations": operations,
            }
        )
        if len(out) >= max_turns:"""

ITER_OLD = """    prompt = build_edit_prompt(
        user_prompt,
        table_snapshot,
        is_metersphere_headers=is_metersphere_headers,
        visual_context_id=visual_context_id,
        user_id=user_id,
        conversation_history=conversation_history,
    )
    reasoning_parts: list[str] = []
    content_parts: list[str] = []
    last_reasoning_push = 0.0
    last_content_thinking_push = 0.0

    try:
        for stream_kind, delta in stream_chat_completions(
            base_url,
            api_key,
            model,
            prompt,
            temperature=temperature,
        ):"""

ITER_NEW = """    messages = build_edit_chat_messages(
        user_prompt,
        table_snapshot,
        is_metersphere_headers=is_metersphere_headers,
        visual_context_id=visual_context_id,
        user_id=user_id,
        conversation_history=conversation_history,
    )
    reasoning_parts: list[str] = []
    content_parts: list[str] = []
    last_reasoning_push = 0.0
    last_content_thinking_push = 0.0

    try:
        for stream_kind, delta in stream_chat_completions_messages(
            base_url,
            api_key,
            model,
            messages,
            temperature=temperature,
        ):"""

RUN_OLD = """    prompt = build_edit_prompt(
        user_prompt,
        table_snapshot,
        is_metersphere_headers=is_metersphere_headers,
        visual_context_id=visual_context_id,
        user_id=user_id,
        conversation_history=conversation_history,
    )
    raw = generate_test_cases(
        base_url,
        api_key,
        model,
        prompt,
        images_base64=None,
        temperature=temperature,
    )"""

RUN_NEW = """    messages = build_edit_chat_messages(
        user_prompt,
        table_snapshot,
        is_metersphere_headers=is_metersphere_headers,
        visual_context_id=visual_context_id,
        user_id=user_id,
        conversation_history=conversation_history,
    )
    raw = generate_chat_completions_messages(
        base_url,
        api_key,
        model,
        messages,
        temperature=temperature,
    )"""

TEST_APPEND = """

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
"""


def patch_file(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        if new.split("\n", 1)[0].strip() in text:
            print(label, "skip")
            return
        raise SystemExit(f"{label}: not found")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("patched", label)


def main() -> None:
    gen = GEN_PATH.read_text(encoding="utf-8")
    if "stream_chat_completions_messages" not in gen:
        if GEN_OLD not in gen:
            raise SystemExit("generation_stream insert point missing")
        gen = gen.replace(GEN_OLD, GEN_INSERT + GEN_OLD, 1)
        GEN_PATH.write_text(gen, encoding="utf-8")
        print("patched generation_stream_service.py")

    tcg = TCG_PATH.read_text(encoding="utf-8")
    if "generate_chat_completions_messages" not in tcg:
        if TCG_MARKER not in tcg:
            raise SystemExit("test_case_generator insert point missing")
        tcg = tcg.replace(TCG_MARKER, TCG_INSERT + TCG_MARKER, 1)
        TCG_PATH.write_text(tcg, encoding="utf-8")
        print("patched test_case_generator_service.py")

    svc_path = ROOT / "core/services/test_cases/smart_edit_service.py"
    svc = svc_path.read_text(encoding="utf-8")
    if "def build_edit_chat_messages(" not in svc:
        anchor = "def build_edit_prompt("
        if anchor not in svc:
            raise SystemExit("smart_edit anchor missing")
        svc = svc.replace(anchor, SERVICE_HELPERS.lstrip("\n") + anchor, 1)
        svc_path.write_text(svc, encoding="utf-8")
        print("patched smart_edit helpers")
    patch_file(svc_path, SERVICE_IMPORT_OLD, SERVICE_IMPORT_NEW, "smart_edit import stream")
    patch_file(svc_path, SERVICE_TCG_IMPORT_OLD, SERVICE_TCG_IMPORT_NEW, "smart_edit import gen")
    patch_file(svc_path, NORMALIZE_OLD, NORMALIZE_NEW, "normalize history")
    patch_file(svc_path, ITER_OLD, ITER_NEW, "iter stream")
    patch_file(svc_path, RUN_OLD, RUN_NEW, "run sync")

    test_path = ROOT / "tests/test_smart_edit_service.py"
    test = test_path.read_text(encoding="utf-8")
    if "build_edit_chat_messages" not in test:
        test = test.replace(
            "from core.services.test_cases.smart_edit_service import (",
            "from core.services.test_cases.smart_edit_service import (\n    build_edit_chat_messages,",
            1,
        )
    if "test_build_edit_chat_messages_multi_turn" not in test:
        test = test.rstrip() + TEST_APPEND + "\n"
        test_path.write_text(test, encoding="utf-8")
        print("patched tests")


if __name__ == "__main__":
    main()
