from __future__ import annotations

import requests
from flask import Blueprint, jsonify, request

from core.services.ai.user_ai_daily_quota_service import attach_quota_to_response
from core.config.user_ai_credentials import (
    UserAiConfigRequired,
    resolve_text_ai_credentials,
    user_ai_config_error_response,
)
from core.services.auth.auth_session import get_current_user_id
from core.services.test_cases import append_form_images, generate_test_cases
from core.services.test_cases.generation_guard import (
    GenerationRateLimitError,
    assert_generation_allowed,
)
from core.services.test_cases.lanhu_provenance import resolve_lanhu_provenance_from_request
from core.services.test_cases.lanhu_requirement_service import fetch_lanhu_requirements_summary


def _parse_temperature(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return float(text)


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-case-generator", methods=["POST"])
    def test_case_generator():
        try:
            if request.is_json:
                data = request.json or {}
                use_builtin = bool(data.get("use_builtin"))
                base_url = data.get("base_url")
                api_key = data.get("api_key")
                model = data.get("model")
                temperature_raw = data.get("temperature")
                prompt = data.get("prompt")
                images = data.get("images", [])
                lanhu_cookie = (data.get("lanhu_cookie") or "").strip()
                lanhu_url = (data.get("lanhu_url") or "").strip()
            else:
                base_url = request.form.get("base_url")
                api_key = request.form.get("api_key")
                model = request.form.get("model")
                temperature_raw = request.form.get("temperature")
                prompt = request.form.get("prompt")
                images = append_form_images(request.files)
                use_builtin = False
                lanhu_cookie = ""
                lanhu_url = ""

            ai_cfg_for_quota = None
            if use_builtin:
                try:
                    ai_cfg = resolve_text_ai_credentials(
                        data if request.is_json else {"use_builtin": True},
                        get_current_user_id(),
                    )
                except UserAiConfigRequired as exc:
                    body, code = user_ai_config_error_response(exc)
                    return jsonify(body), code
                ai_cfg_for_quota = ai_cfg
                base_url = ai_cfg["base_url"]
                api_key = ai_cfg["api_key"]
                model = ai_cfg["model"]
                temperature_raw = ai_cfg["temperature"]
                images = []

            if not base_url:
                return jsonify({"error": "请输入AI BASE URL"})
            if not api_key:
                return jsonify({"error": "请输入AI API KEY"})
            if not model:
                return jsonify({"error": "请输入AI MODEL"})
            if not prompt:
                return jsonify({"error": "请输入提示词"})

            user_id = get_current_user_id()
            try:
                assert_generation_allowed(
                    request=request,
                    user_id=user_id,
                    action="legacy_generate",
                    prompt=str(prompt or ""),
                    mode="legacy",
                )
            except GenerationRateLimitError as exc:
                resp = jsonify({"error": str(exc)})
                resp.status_code = 429
                resp.headers["Retry-After"] = str(exc.retry_after_sec)
                return resp

            visual_context_id = None
            if request.is_json:
                visual_context_id = str((data or {}).get("visual_context_id") or "").strip() or None
            if visual_context_id:
                from core.services.visual_attachments.context_builder import (
                    inject_attachment_context_into_prompt,
                )

                prompt = inject_attachment_context_into_prompt(
                    prompt, visual_context_id, get_current_user_id()
                )

            try:
                temperature = _parse_temperature(temperature_raw)
            except ValueError:
                return jsonify({"error": "AI TEMPERATURE 必须是数字"})

            if lanhu_cookie or lanhu_url:
                if not lanhu_cookie or not lanhu_url:
                    return jsonify({"error": "蓝湖需求需同时填写 Cookie 与文档 URL"})
                try:
                    requirement_summary = fetch_lanhu_requirements_summary(
                        lanhu_cookie, lanhu_url
                    )
                    prompt = (
                        requirement_summary
                        + "\n\n【用户提示词】\n"
                        + prompt.strip()
                    )
                except ValueError as exc:
                    return jsonify({"error": str(exc)})
                except Exception as exc:
                    return jsonify({"error": f"获取蓝湖需求失败: {exc}"})

            import logging
            _log = logging.getLogger(__name__)
            result = generate_test_cases(
                base_url,
                api_key,
                model,
                prompt,
                images,
                temperature=temperature,
            )
            _log.info("test-case-generator ok result_len=%s", len(result or ""))
            payload = {"result": result, "error": None}
            req_for_prov = data if request.is_json else {
                "lanhu_cookie": lanhu_cookie,
                "lanhu_url": lanhu_url,
                "prompt": prompt,
            }
            lanhu_prov = resolve_lanhu_provenance_from_request(req_for_prov)
            if lanhu_prov:
                payload["lanhu_provenance"] = lanhu_prov
            if ai_cfg_for_quota:
                payload = attach_quota_to_response(payload, ai_cfg_for_quota)
            return jsonify(payload)
        except ConnectionError as exc:
            return jsonify({"result": None, "error": str(exc)})
        except requests.exceptions.RequestException as exc:
            return jsonify({"result": None, "error": f"API请求失败: {str(exc)}"})
        except Exception as exc:
            return jsonify({"result": None, "error": str(exc)})
