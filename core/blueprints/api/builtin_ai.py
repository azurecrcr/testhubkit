from __future__ import annotations

import requests
from flask import Blueprint, jsonify, request

from core.config.ai_preset import get_builtin_ai_config, get_env_image_model
from core.services.ai.builtin_ai_config_db import (
    ensure_vision_seeded_from_env,
    get_stored_builtin_ai_config,
    get_stored_builtin_cursor_agent_config,
    save_builtin_ai_config,
)
from core.services.ai.builtin_ai_text_presets_db import (
    get_active_text_slot,
    get_active_text_preset,
    list_text_presets,
    save_text_preset,
    save_text_presets_batch,
    set_active_text_slot,
)
from core.config.user_ai_credentials import (
    UserAiConfigRequired,
    resolve_text_ai_credentials,
    user_ai_config_error_response,
)
from core.services.ai.builtin_llm_service import (
    AUDIO_SCRIPT_SYSTEM_PROMPT,
    complete_builtin_ai,
)
from core.services.ai.omniflow_vision_config import (
    get_env_omniflow_vision_config,
    get_omniflow_vision_config,
    sync_omniflow_vision_env,
)
from core.services.auth.auth_session import get_current_user_id
from core.services.auth.prompt_visibility_admin import is_site_manager
from core.services.auth.user_service import get_user_by_id
from core.services.toolkit_lock.toolkit_lock_db import (
    get_toolkit_lock_status,
    set_toolkit_switches,
)


def _require_builtin_ai_admin():
    uid = get_current_user_id()
    if not uid:
        return jsonify({"error": "请先登录", "code": "AUTH_REQUIRED"}), 401
    user = get_user_by_id(uid)
    if not user or not is_site_manager(user):
        return jsonify({"error": "无权修改全站 AI 配置"}), 403
    return None


def _active_text_fields() -> dict:
    cfg = get_builtin_ai_config()
    return {
        "base_url": cfg.get("base_url") or "",
        "api_key": cfg.get("api_key") or "",
        "model": cfg.get("model") or "",
        "temperature": cfg.get("temperature", 0.1),
    }


def _merge_ai_put_payload(data: dict) -> dict:
    """PUT 时合并已有配置，避免用例页只提交文本字段时覆盖文生图/视觉配置。"""
    stored = get_stored_builtin_ai_config() or get_builtin_ai_config()
    stored_vision = get_omniflow_vision_config()
    stored_cursor = get_stored_builtin_cursor_agent_config()
    env_vision = get_env_omniflow_vision_config()

    def _pick(key: str, fallback: str = "") -> str:
        if key in data:
            return str(data.get(key) or "").strip()
        if key in ("cursor_api_key", "agent_model"):
            return str(stored_cursor.get(key) or fallback).strip()
        if key.startswith("vision_"):
            return str(stored_vision.get(key) or env_vision.get(key) or fallback).strip()
        return str(stored.get(key) or fallback).strip()

    try:
        temp_raw = data.get("temperature", stored.get("temperature", 0.1))
        temperature = float(temp_raw)
    except (TypeError, ValueError):
        temperature = float(stored.get("temperature") or 0.1)

    return {
        "base_url": _pick("base_url"),
        "api_key": _pick("api_key"),
        "model": _pick("model"),
        "temperature": temperature,
        "image_model": _pick("image_model") or get_env_image_model(),
        "vision_api_base_url": _pick("vision_api_base_url"),
        "vision_api_key": _pick("vision_api_key"),
        "vision_model": _pick("vision_model") or "gpt-4o",
        "cursor_api_key": _pick("cursor_api_key"),
        "agent_model": _pick("agent_model"),
    }


def _config_json_response(cfg: dict, *, stored: bool) -> dict:
    vision = get_omniflow_vision_config()
    cursor = get_stored_builtin_cursor_agent_config()
    toolkit = get_toolkit_lock_status()
    cursor_key = str(cfg.get("cursor_api_key") if cfg.get("cursor_api_key") is not None else cursor.get("cursor_api_key") or "").strip()
    agent_model = str(cfg.get("agent_model") if cfg.get("agent_model") is not None else cursor.get("agent_model") or "").strip()
    return {
        "base_url": cfg["base_url"],
        "api_key": cfg["api_key"],
        "model": cfg["model"],
        "temperature": cfg["temperature"],
        "image_model": cfg.get("image_model") or get_env_image_model(),
        "source": "database" if stored else "environment",
        "active_text_slot": get_active_text_slot(),
        "text_presets": list_text_presets(),
        "vision_api_base_url": vision.get("vision_api_base_url") or "",
        "vision_api_key": vision.get("vision_api_key") or "",
        "vision_model": vision.get("vision_model") or "gpt-4o",
        "vision_source": vision.get("source", "environment"),
        "cursor_api_key": cursor_key,
        "agent_model": agent_model,
        "cursor_agent_configured": bool(cursor_key and agent_model),
        "toolkit": {
            "is_locked": bool(toolkit.get("is_locked")),
            "prompt_cards_blur": bool(toolkit.get("prompt_cards_blur")),
        },
    }


def register_routes(bp: Blueprint) -> None:
    @bp.route("/builtin-ai/text-presets/activate", methods=["POST"])
    def activate_text_preset():
        """管理员切换全局生效的文本 AI 预设 Tab。"""
        denied = _require_builtin_ai_admin()
        if denied:
            return denied
        data = request.get_json(silent=True) or {}
        try:
            slot = int(data.get("slot"))
        except (TypeError, ValueError):
            return jsonify({"error": "缺少有效的 slot 参数"}), 400
        presets_in = data.get("text_presets")
        if isinstance(presets_in, list) and presets_in:
            try:
                save_text_presets_batch(presets_in, active_slot=slot)
            except Exception as exc:
                return jsonify({"error": f"保存预设失败：{exc}"}), 500
        else:
            preset = get_active_text_preset()
            slots = {p["slot"]: p for p in list_text_presets()}
            if slot in slots and (data.get("base_url") is not None or data.get("model")):
                p = slots[slot]
                save_text_preset(
                    slot,
                    base_url=str(data.get("base_url", p.get("base_url") or "")),
                    api_key=str(data.get("api_key", p.get("api_key") or "")),
                    model=str(data.get("model", p.get("model") or "")),
                    temperature=float(
                        data.get("temperature", p.get("temperature", 0.1))
                    ),
                    label=str(data.get("label") or p.get("label") or f"预设 {slot}"),
                )
            set_active_text_slot(slot)
        cfg = get_builtin_ai_config()
        stored = get_stored_builtin_ai_config()
        resp = _config_json_response(cfg, stored=bool(stored))
        return jsonify(resp)

    @bp.route("/builtin-ai/config", methods=["GET", "PUT"])
    def builtin_ai_config():
        """GET：当前生效配置（库内 > 环境变量）。PUT：写入数据库（仅管理员）。"""
        if request.method == "PUT":
            denied = _require_builtin_ai_admin()
            if denied:
                return denied

            data = request.get_json(silent=True) or {}

            if isinstance(data.get("text_presets"), list):
                try:
                    active_slot = data.get("active_text_slot")
                    if active_slot is not None:
                        active_slot = int(active_slot)
                    save_text_presets_batch(data["text_presets"], active_slot=active_slot)
                except Exception as exc:
                    return jsonify({"error": f"保存文本预设失败：{exc}"}), 500

            merged = _merge_ai_put_payload(data)
            try:
                temperature = float(merged["temperature"])
            except (TypeError, ValueError):
                temperature = 0.1
            merged["temperature"] = max(0.0, min(2.0, temperature))

            if merged["cursor_api_key"] and not merged["agent_model"]:
                return jsonify({"error": "已填写 Cursor API Key，请选择 Agent 模型"}), 400
            if not merged["cursor_api_key"]:
                merged["agent_model"] = ""

            toolkit_keys = ("is_locked", "prompt_cards_blur")
            has_toolkit = any(k in data for k in toolkit_keys)

            try:
                slot = get_active_text_slot()
                save_text_preset(
                    slot,
                    base_url=merged["base_url"],
                    api_key=merged["api_key"],
                    model=merged["model"],
                    temperature=merged["temperature"],
                )

                cfg = save_builtin_ai_config(
                    base_url=merged["base_url"],
                    api_key=merged["api_key"],
                    model=merged["model"],
                    temperature=merged["temperature"],
                    image_model=merged["image_model"],
                    vision_api_base_url=merged["vision_api_base_url"],
                    vision_api_key=merged["vision_api_key"],
                    vision_model=merged["vision_model"],
                    cursor_api_key=merged["cursor_api_key"],
                    agent_model=merged["agent_model"],
                )
                vision_payload = {
                    "vision_api_base_url": merged["vision_api_base_url"],
                    "vision_api_key": merged["vision_api_key"],
                    "vision_model": merged["vision_model"],
                }
                try:
                    sync_omniflow_vision_env(vision_payload)
                except Exception:
                    pass

                toolkit_payload = get_toolkit_lock_status()
                if has_toolkit:
                    toolkit_payload = set_toolkit_switches(
                        is_locked=data.get("is_locked")
                        if "is_locked" in data
                        else None,                        prompt_cards_blur=data.get("prompt_cards_blur")
                        if "prompt_cards_blur" in data
                        else None,
                    )

                resp = _config_json_response(cfg, stored=True)
                resp["vision_source"] = "database"
                return jsonify(resp)

            except Exception as exc:
                return jsonify({"error": f"保存配置失败：{exc}"}), 500

        denied = _require_builtin_ai_admin()
        if denied:
            return denied

        try:
            ensure_vision_seeded_from_env()
        except Exception:
            pass

        cfg = get_builtin_ai_config()
        stored = None
        try:
            stored = get_stored_builtin_ai_config()
        except Exception:
            stored = None
        return jsonify(_config_json_response(cfg, stored=bool(stored)))

    @bp.route("/builtin-ai/audio-script", methods=["POST"])
    def audio_script():
        data = request.get_json(silent=True) or {}
        prompt = (data.get("prompt") or request.form.get("prompt") or "").strip()
        if not prompt:
            return jsonify({"error": "请输入 AI 提示信息"}), 400
        try:
            uid = get_current_user_id()
            if not uid:
                return jsonify({"error": "请先登录", "code": "AUTH_REQUIRED"}), 401
            try:
                cfg = resolve_text_ai_credentials({"use_builtin": True}, uid)
            except UserAiConfigRequired as exc:
                body, code = user_ai_config_error_response(exc)
                return jsonify(body), code
            from core.services.ai.user_ai_daily_quota_service import pop_quota_meta
            quota_meta = pop_quota_meta(cfg)
            text = complete_builtin_ai(prompt, system_prompt=AUDIO_SCRIPT_SYSTEM_PROMPT, cfg=cfg)
            payload = {"text": text}
            if quota_meta:
                payload["ai_quota"] = quota_meta
            return jsonify(payload)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except requests.RequestException as exc:
            return jsonify({"error": f"AI 服务调用失败：{exc}"}), 502
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
