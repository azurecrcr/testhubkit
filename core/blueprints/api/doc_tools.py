from __future__ import annotations

import json

from flask import Blueprint, Response, jsonify, request, stream_with_context

from core.config.user_ai_credentials import (
    USER_AI_CONFIG_REQUIRED,
    UserAiConfigRequired,
    resolve_text_ai_credentials,
    user_ai_config_error_response,
)
from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.doc_tools.chat_service import iter_doc_tools_chat_stream_events


def _parse_temperature(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return float(text)


def register_routes(bp: Blueprint) -> None:
    @bp.route("/doc-tools/chat/stream", methods=["POST"])
    @require_login_api
    def doc_tools_chat_stream():
        try:
            data = request.json or {}
            user_message = str(data.get("message") or "").strip()
            if not user_message:
                return jsonify({"success": False, "error": "请输入消息"}), 400

            table_matrix = data.get("table_matrix")
            if not isinstance(table_matrix, list):
                return jsonify({"success": False, "error": "缺少表格数据"}), 400

            user_id = get_current_user_id()
            quota_meta = None
            try:
                ai_cfg = resolve_text_ai_credentials({"use_builtin": True}, user_id)
                from core.services.ai.user_ai_daily_quota_service import pop_quota_meta
                quota_meta = pop_quota_meta(ai_cfg)
            except UserAiConfigRequired as exc:
                body, code = user_ai_config_error_response(exc)
                return jsonify(body), code

            base_url = str(ai_cfg.get("base_url") or "").strip()
            api_key = str(ai_cfg.get("api_key") or "").strip()
            model = str(ai_cfg.get("model") or "").strip()
            if not base_url or not api_key or not model:
                body, code = user_ai_config_error_response(UserAiConfigRequired(USER_AI_CONFIG_REQUIRED))
                return jsonify(body), code

            try:
                temperature = _parse_temperature(ai_cfg.get("temperature"))
            except ValueError:
                return jsonify({"success": False, "error": "AI TEMPERATURE 必须是数字"}), 400

            conversation_history = data.get("conversation_history")

            def generate():
                if quota_meta:
                    yield f"data: {json.dumps({'type': 'ai_quota', 'ai_quota': quota_meta}, ensure_ascii=False)}\n\n"
                for event in iter_doc_tools_chat_stream_events(
                    base_url=base_url,
                    api_key=api_key,
                    model=model,
                    user_message=user_message,
                    table_matrix=table_matrix,
                    temperature=temperature,
                    conversation_history=conversation_history if isinstance(conversation_history, list) else None,
                ):
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'stream_end'}, ensure_ascii=False)}\n\n"

            return Response(
                stream_with_context(generate()),
                mimetype="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",
                },
            )
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500
