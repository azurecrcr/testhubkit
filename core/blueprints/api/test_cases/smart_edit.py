from __future__ import annotations

import json

import requests
from flask import Blueprint, Response, jsonify, request, stream_with_context

from core.config.user_ai_credentials import (
    UserAiConfigRequired,
    resolve_text_ai_credentials,
    user_ai_config_error_response,
)
from core.services.auth.auth_session import get_current_user_id
from core.services.test_cases.smart_edit_service import (
    iter_smart_edit_stream_events,
    run_smart_edit,
)


def _parse_temperature(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return float(text)


def _parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value).strip().lower()
    return text in {"1", "true", "yes", "on"}


def _resolve_smart_edit_request(data: dict) -> tuple[dict[str, object] | None, tuple[dict, int] | None]:
    user_prompt = str(data.get("user_prompt") or "").strip()
    table_snapshot = data.get("table_snapshot")
    use_builtin = bool(data.get("use_builtin"))
    is_metersphere_headers = _parse_bool(data.get("is_metersphere_headers"))

    if not user_prompt:
        return None, ({"success": False, "error": "请输入编辑指令"}, 400)
    if not isinstance(table_snapshot, dict):
        return None, ({"success": False, "error": "缺少表格快照"}, 400)
    if not list(table_snapshot.get("columns") or []):
        return None, ({"success": False, "error": "表格列定义为空，请先应用模板"}, 400)

    visual_context_id = str(data.get("visual_context_id") or "").strip() or None

    quota_meta = None
    use_attachments = bool(data.get("use_attachments"))
    use_vision = bool(visual_context_id) and use_attachments
    if use_builtin:
        try:
            if use_vision:
                from core.config.user_ai_credentials import resolve_vision_ai_credentials
                ai_cfg = resolve_vision_ai_credentials(get_current_user_id())
                from core.services.ai.user_ai_daily_quota_service import pop_quota_meta
                quota_meta = pop_quota_meta(ai_cfg)
                temperature_raw = 0.1
            else:
                ai_cfg = resolve_text_ai_credentials(data, get_current_user_id())
                from core.services.ai.user_ai_daily_quota_service import pop_quota_meta
                quota_meta = pop_quota_meta(ai_cfg)
                temperature_raw = ai_cfg.get("temperature")
        except UserAiConfigRequired as exc:
            body, code = user_ai_config_error_response(exc)
            return None, (body, code)
        base_url = ai_cfg["base_url"]
        api_key = ai_cfg["api_key"]
        model = ai_cfg["model"]
    else:
        base_url = data.get("base_url")
        api_key = data.get("api_key")
        model = data.get("model")
        temperature_raw = data.get("temperature")

    if not base_url:
        return None, ({"success": False, "error": "请输入 AI BASE URL"}, 400)
    if not api_key:
        return None, ({"success": False, "error": "请输入 AI API KEY"}, 400)
    if not model:
        return None, ({"success": False, "error": "请输入 AI MODEL"}, 400)

    try:
        temperature = _parse_temperature(temperature_raw)
    except ValueError:
        return None, ({"success": False, "error": "AI TEMPERATURE 必须是数字"}, 400)

    return {
        "base_url": str(base_url),
        "api_key": str(api_key),
        "model": str(model),
        "user_prompt": user_prompt,
        "table_snapshot": table_snapshot,
        "temperature": temperature,
        "is_metersphere_headers": is_metersphere_headers,
        "visual_context_id": visual_context_id,
        "user_id": get_current_user_id(),
        "conversation_history": data.get("conversation_history"),
        "_quota_meta": quota_meta,
        "use_vision": use_vision,
        "vision_cfg": dict(ai_cfg) if use_vision else None,
    }, None


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/smart-edit", methods=["POST"])
    def smart_edit_cases():
        try:
            data = request.json or {}
            resolved, err = _resolve_smart_edit_request(data)
            if err:
                body, code = err
                return jsonify(body), code

            result = run_smart_edit(
                base_url=str(resolved["base_url"]),
                api_key=str(resolved["api_key"]),
                model=str(resolved["model"]),
                user_prompt=str(resolved["user_prompt"]),
                table_snapshot=resolved["table_snapshot"],
                temperature=resolved["temperature"],
                is_metersphere_headers=bool(resolved["is_metersphere_headers"]),
                visual_context_id=resolved.get("visual_context_id"),
                user_id=resolved.get("user_id"),
                conversation_history=resolved.get("conversation_history"),
                use_vision=bool(resolved.get("use_vision")),
                vision_cfg=resolved.get("vision_cfg"),
            )
            if resolved.get("_quota_meta"):
                result["ai_quota"] = resolved["_quota_meta"]
            return jsonify(result)
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        except ConnectionError as exc:
            return jsonify({"success": False, "error": str(exc)}), 502
        except requests.exceptions.RequestException as exc:
            return jsonify({"success": False, "error": f"API请求失败: {str(exc)}"}), 502
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    @bp.route("/test-cases/smart-edit/stream", methods=["POST"])
    def smart_edit_cases_stream():
        try:
            data = request.json or {}
            resolved, err = _resolve_smart_edit_request(data)
            if err:
                body, code = err
                return jsonify(body), code

            def generate():
                quota_meta = resolved.get("_quota_meta")
                if quota_meta:
                    yield f"data: {json.dumps({'type': 'ai_quota', 'ai_quota': quota_meta}, ensure_ascii=False)}\n\n"
                for event in iter_smart_edit_stream_events(
                    base_url=str(resolved["base_url"]),
                    api_key=str(resolved["api_key"]),
                    model=str(resolved["model"]),
                    user_prompt=str(resolved["user_prompt"]),
                    table_snapshot=resolved["table_snapshot"],
                    temperature=resolved["temperature"],
                    is_metersphere_headers=bool(resolved["is_metersphere_headers"]),
                    visual_context_id=resolved.get("visual_context_id"),
                    user_id=resolved.get("user_id"),
                    conversation_history=resolved.get("conversation_history"),
                    use_vision=bool(resolved.get("use_vision")),
                    vision_cfg=resolved.get("vision_cfg"),
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
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500
