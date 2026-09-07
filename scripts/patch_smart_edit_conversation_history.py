#!/usr/bin/env python3
"""Add smart-edit multi-turn conversation history to AI prompt."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SERVICE_PATH = ROOT / "core/services/test_cases/smart_edit_service.py"
API_PATH = ROOT / "core/blueprints/api/test_cases/smart_edit.py"
JS_PATH = ROOT / "static/js/tc_workbench/l3_ai/tc_ai_smart_edit.js"
SESSION_PATH = ROOT / "static/js/tc_workbench/l2_services/tc_workbench_session.js"
TEST_PATH = ROOT / "tests/test_smart_edit_service.py"

SERVICE_INSERT_AFTER = '''def _format_columns_block(columns: list[str]) -> str:
    if not columns:
        return "（无）"
    return "\\n".join(f"{i}. {col}" for i, col in enumerate(columns, 1))


'''

SERVICE_INSERT = '''def _format_columns_block(columns: list[str]) -> str:
    if not columns:
        return "（无）"
    return "\\n".join(f"{i}. {col}" for i, col in enumerate(columns, 1))


def _normalize_conversation_history(
    history: list[dict[str, Any]] | None,
    *,
    max_turns: int = 20,
) -> list[dict[str, str]]:
    if not history:
        return []
    out: list[dict[str, str]] = []
    for item in history:
        if not isinstance(item, dict):
            continue
        user = str(item.get("user_prompt") or item.get("user") or "").strip()
        if not user:
            continue
        summary = str(
            item.get("assistant_summary")
            or item.get("summary")
            or item.get("assistant")
            or ""
        ).strip()
        out.append({"user_prompt": user, "assistant_summary": summary})
        if len(out) >= max_turns:
            break
    return out


def _format_conversation_history_block(history: list[dict[str, str]] | None) -> str:
    if not history:
        return ""
    blocks: list[str] = []
    for idx, item in enumerate(history, 1):
        user = str(item.get("user_prompt") or "").strip()
        if not user:
            continue
        summary = str(item.get("assistant_summary") or "").strip()
        block = f"第{idx}轮\\n用户：{user}"
        if summary:
            block += f"\\n助手：{summary}"
        blocks.append(block)
    if not blocks:
        return ""
    return (
        "\\n\\n【本次会话中先前的编辑对话（仅供理解当前指令；"
        "实际编辑必须以当前表格快照为准）】\\n"
        + "\\n\\n".join(blocks)
    )


'''

SERVICE_BUILD_OLD = """def build_edit_prompt(
    user_prompt: str,
    table_snapshot: dict[str, Any],
    *,
    is_metersphere_headers: bool = False,
    visual_context_id: str | None = None,
    user_id: str | None = None,
) -> str:"""

SERVICE_BUILD_NEW = """def build_edit_prompt(
    user_prompt: str,
    table_snapshot: dict[str, Any],
    *,
    is_metersphere_headers: bool = False,
    visual_context_id: str | None = None,
    user_id: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
) -> str:"""

SERVICE_RETURN_OLD = """        + snapshot_json
        + "\\n\\n【用户编辑指令】\\n"
        + user
    )"""

SERVICE_RETURN_NEW = """        + snapshot_json
        + _format_conversation_history_block(
            _normalize_conversation_history(conversation_history)
        )
        + "\\n\\n【用户编辑指令（本轮）】\\n"
        + user
    )"""

SERVICE_STREAM_SIG_OLD = """    visual_context_id: str | None = None,
    user_id: str | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> Generator[dict[str, Any], None, None]:"""

SERVICE_STREAM_SIG_NEW = """    visual_context_id: str | None = None,
    user_id: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> Generator[dict[str, Any], None, None]:"""

SERVICE_STREAM_PROMPT_OLD = """    prompt = build_edit_prompt(
        user_prompt,
        table_snapshot,
        is_metersphere_headers=is_metersphere_headers,
        visual_context_id=visual_context_id,
        user_id=user_id,
    )"""

SERVICE_STREAM_PROMPT_NEW = """    prompt = build_edit_prompt(
        user_prompt,
        table_snapshot,
        is_metersphere_headers=is_metersphere_headers,
        visual_context_id=visual_context_id,
        user_id=user_id,
        conversation_history=conversation_history,
    )"""

SERVICE_RUN_SIG_OLD = """    visual_context_id: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:"""

SERVICE_RUN_SIG_NEW = """    visual_context_id: str | None = None,
    user_id: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:"""

API_RESOLVED_OLD = """        "visual_context_id": str(data.get("visual_context_id") or "").strip() or None,
        "user_id": get_current_user_id(),
    }, None"""

API_RESOLVED_NEW = """        "visual_context_id": str(data.get("visual_context_id") or "").strip() or None,
        "user_id": get_current_user_id(),
        "conversation_history": data.get("conversation_history"),
    }, None"""

API_RUN_OLD = """                visual_context_id=resolved.get("visual_context_id"),
                user_id=resolved.get("user_id"),
            )
            return jsonify(result)"""

API_RUN_NEW = """                visual_context_id=resolved.get("visual_context_id"),
                user_id=resolved.get("user_id"),
                conversation_history=resolved.get("conversation_history"),
            )
            return jsonify(result)"""

API_STREAM_OLD = """                    visual_context_id=resolved.get("visual_context_id"),
                    user_id=resolved.get("user_id"),
                ):"""

API_STREAM_NEW = """                    visual_context_id=resolved.get("visual_context_id"),
                    user_id=resolved.get("user_id"),
                    conversation_history=resolved.get("conversation_history"),
                ):"""

SESSION_LIST_FN = """
    function listCurrentTurns() {
        return (state.currentTurns || []).slice().sort(function (a, b) {
            return (a.turn_index || 0) - (b.turn_index || 0);
        });
    }

"""

SESSION_EXPORT_OLD = """        getCurrentTurnCount: function () { return state.currentTurnCount || 0; },"""

SESSION_EXPORT_NEW = """        getCurrentTurnCount: function () { return state.currentTurnCount || 0; },
        listCurrentTurns: listCurrentTurns,"""

JS_HELPERS = """
    function parseEditTurnChain(turn) {
        var chain = turn && turn.chain;
        if (!chain && turn && turn.chain_json) {
            try {
                chain = typeof turn.chain_json === 'string' ? JSON.parse(turn.chain_json) : turn.chain_json;
            } catch (e) {
                chain = null;
            }
        }
        return chain || {};
    }

    function resolveEditTurnSummary(chain) {
        chain = chain || {};
        return String(chain.status_hint || chain.summary || chain.editSummary || '').trim();
    }

    function buildEditConversationHistory(activeTurn) {
        if (!global.TcWorkbenchSession ||
            typeof global.TcWorkbenchSession.listCurrentTurns !== 'function') {
            return [];
        }
        var currentIndex = activeTurn && activeTurn.turnIndex != null
            ? parseInt(activeTurn.turnIndex, 10)
            : null;
        if (currentIndex == null || isNaN(currentIndex)) return [];
        return global.TcWorkbenchSession.listCurrentTurns()
            .filter(function (turn) {
                if (!turn) return false;
                var idx = parseInt(turn.turn_index, 10);
                if (isNaN(idx) || idx >= currentIndex) return false;
                return !!String(turn.user_prompt || '').trim();
            })
            .map(function (turn) {
                var chain = parseEditTurnChain(turn);
                return {
                    user_prompt: String(turn.user_prompt || '').trim(),
                    assistant_summary: resolveEditTurnSummary(chain)
                };
            });
    }

"""

JS_INSERT_BEFORE = """    function appendEditVisualPayload(body) {"""

JS_BODY_OLD = """            var body = {
                user_prompt: promptText,
                table_snapshot: snapshot,
                use_builtin: true,
                is_metersphere_headers: !!isMetersphereHeaders
            };"""

JS_BODY_NEW = """            var body = {
                user_prompt: promptText,
                table_snapshot: snapshot,
                use_builtin: true,
                is_metersphere_headers: !!isMetersphereHeaders,
                conversation_history: buildEditConversationHistory(activeEditTurn)
            };"""

TEST_APPEND = """

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
"""


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new.split("\n")[0] in text and label.endswith("(skip)"):
            return text
        raise SystemExit(f"{label}: pattern not found")
    return text.replace(old, new, 1)


def patch_service(text: str) -> str:
    if "_normalize_conversation_history" not in text:
        text = text.replace(SERVICE_INSERT_AFTER, SERVICE_INSERT, 1)
    text = replace_once(text, SERVICE_BUILD_OLD, SERVICE_BUILD_NEW, "build_edit_prompt sig")
    text = replace_once(text, SERVICE_RETURN_OLD, SERVICE_RETURN_NEW, "build_edit_prompt return")
    text = replace_once(text, SERVICE_STREAM_SIG_OLD, SERVICE_STREAM_SIG_NEW, "iter sig")
    text = replace_once(text, SERVICE_STREAM_PROMPT_OLD, SERVICE_STREAM_PROMPT_NEW, "iter prompt")
    text = replace_once(text, SERVICE_RUN_SIG_OLD, SERVICE_RUN_SIG_NEW, "run sig")
    run_old = """    prompt = build_edit_prompt(
        user_prompt,
        table_snapshot,
        is_metersphere_headers=is_metersphere_headers,
        visual_context_id=visual_context_id,
        user_id=user_id,
    )
    raw = generate_test_cases("""
    run_new = """    prompt = build_edit_prompt(
        user_prompt,
        table_snapshot,
        is_metersphere_headers=is_metersphere_headers,
        visual_context_id=visual_context_id,
        user_id=user_id,
        conversation_history=conversation_history,
    )
    raw = generate_test_cases("""
    if run_old in text:
        text = text.replace(run_old, run_new, 1)
    return text


def main() -> None:
    svc = SERVICE_PATH.read_text(encoding="utf-8")
    if "_normalize_conversation_history" in svc and "conversation_history" in JS_PATH.read_text(encoding="utf-8"):
        print("already patched")
        return
    svc = patch_service(svc)
    SERVICE_PATH.write_text(svc, encoding="utf-8")
    print("patched", SERVICE_PATH)

    api = API_PATH.read_text(encoding="utf-8")
    api = replace_once(api, API_RESOLVED_OLD, API_RESOLVED_NEW, "api resolved")
    api = replace_once(api, API_RUN_OLD, API_RUN_NEW, "api run")
    api = replace_once(api, API_STREAM_OLD, API_STREAM_NEW, "api stream")
    API_PATH.write_text(api, encoding="utf-8")
    print("patched", API_PATH)

    js = JS_PATH.read_text(encoding="utf-8")
    if "buildEditConversationHistory" not in js:
        js = js.replace(JS_INSERT_BEFORE, JS_HELPERS + JS_INSERT_BEFORE, 1)
    js = replace_once(js, JS_BODY_OLD, JS_BODY_NEW, "js body")
    JS_PATH.write_text(js, encoding="utf-8")
    print("patched", JS_PATH)

    sess = SESSION_PATH.read_text(encoding="utf-8")
    if "function listCurrentTurns" not in sess:
        sess = sess.replace(
            "    function getLatestValidatedTurnId(scope) {",
            SESSION_LIST_FN + "    function getLatestValidatedTurnId(scope) {",
            1,
        )
    sess = replace_once(sess, SESSION_EXPORT_OLD, SESSION_EXPORT_NEW, "session export")
    SESSION_PATH.write_text(sess, encoding="utf-8")
    print("patched", SESSION_PATH)

    test = TEST_PATH.read_text(encoding="utf-8")
    if "test_build_edit_prompt_includes_conversation_history" not in test:
        test = test.rstrip() + TEST_APPEND + "\n"
        TEST_PATH.write_text(test, encoding="utf-8")
        print("patched", TEST_PATH)


if __name__ == "__main__":
    main()
