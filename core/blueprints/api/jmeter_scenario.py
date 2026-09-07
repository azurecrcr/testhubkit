"""JMeter 压测场景相关 API。"""

from __future__ import annotations

import json

from flask import Blueprint, Response, jsonify, request, stream_with_context

from core.config.user_ai_credentials import (
    USER_AI_CONFIG_REQUIRED,
    UserAiConfigRequired,
    resolve_text_ai_credentials,
    user_ai_config_error_response,
)
from core.services.auth.admin_guard import get_admin_user
from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.jmeter_scenario import ai_chat_log_service as chat_log
from core.services.jmeter_scenario.ai_step_edit_service import (
    iter_jmeter_ai_step_stream_events,
    iter_jmeter_ai_timeline_stream_events,
)
from core.services.jmeter_scenario.demo_seed_db import get_demo_seed


def _parse_temperature(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return float(text)



def _pop_ai_quota_meta(ai_cfg: dict) -> dict | None:
    from core.services.ai.user_ai_daily_quota_service import pop_quota_meta

    return pop_quota_meta(ai_cfg) if isinstance(ai_cfg, dict) else None


def _iter_sse_with_quota(quota_meta, events):
    """先推送免费额度事件（若有），再推送业务 SSE。"""
    if quota_meta:
        yield f"data: {json.dumps({'type': 'ai_quota', 'ai_quota': quota_meta}, ensure_ascii=False)}\n\n"
    yield from events


def _sse_response(generate):
    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def _resolve_query_user_id() -> tuple[str | None, tuple | None]:
    """返回 (target_user_id, error_response)。管理员可查 user_id/email。"""
    self_uid = get_current_user_id()
    if not self_uid:
        return None, (jsonify({"ok": False, "error": "请先登录"}), 401)
    q_uid = str(request.args.get("user_id") or "").strip()
    q_email = str(request.args.get("email") or "").strip()
    if not q_uid and not q_email:
        return self_uid, None
    if not get_admin_user():
        return None, (jsonify({"ok": False, "error": "无权查询其他用户", "code": "ADMIN_REQUIRED"}), 403)
    if q_uid:
        return q_uid, None
    resolved = chat_log.resolve_email_user_id(q_email)
    if not resolved:
        return None, (jsonify({"ok": False, "error": "未找到该邮箱用户"}), 404)
    return resolved, None


def register_routes(bp: Blueprint) -> None:

    @bp.get("/jmeter-scenario/scenes")
    @require_login_api
    def jmeter_user_scenes_list():
        """当前登录用户的场景列表（按 user_id 隔离）。"""
        from core.services.jmeter_scenario.jmeter_user_scene_service import list_jmeter_user_scenes

        user_id = get_current_user_id()
        if not user_id:
            return jsonify({"ok": False, "error": "请先登录", "code": "AUTH_REQUIRED"}), 401
        try:
            items = list_jmeter_user_scenes(user_id)
            return jsonify({"ok": True, "items": items, "count": len(items)})
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

    @bp.post("/jmeter-scenario/scenes")
    @require_login_api
    def jmeter_user_scenes_create():
        """保存场景到当前用户名下。"""
        from core.services.jmeter_scenario.jmeter_user_scene_service import (
            save_new_jmeter_user_scene,
            validate_jmeter_scene_payload,
        )

        user_id = get_current_user_id()
        if not user_id:
            return jsonify({"ok": False, "error": "请先登录", "code": "AUTH_REQUIRED"}), 401
        data = request.json or {}
        title = str(data.get("title") or "").strip()
        payload = data.get("payload") if isinstance(data.get("payload"), dict) else data.get("data")
        if not isinstance(payload, dict):
            payload = {"yaml": str(data.get("yaml") or "")}
        ok, err = validate_jmeter_scene_payload(payload)
        if not ok:
            return jsonify({"ok": False, "error": err or "无效数据"}), 400
        try:
            doc = save_new_jmeter_user_scene(user_id, title, payload)
            return jsonify({"ok": True, "scene": doc, "item": doc})
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

    @bp.get("/jmeter-scenario/scenes/<scene_id>")
    @require_login_api
    def jmeter_user_scenes_get(scene_id: str):
        from core.services.jmeter_scenario.jmeter_user_scene_service import read_jmeter_user_scene

        user_id = get_current_user_id()
        if not user_id:
            return jsonify({"ok": False, "error": "请先登录", "code": "AUTH_REQUIRED"}), 401
        try:
            doc = read_jmeter_user_scene(user_id, scene_id)
            return jsonify({"ok": True, "scene": doc, "item": doc})
        except FileNotFoundError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 404
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

    @bp.delete("/jmeter-scenario/scenes/<scene_id>")
    @require_login_api
    def jmeter_user_scenes_delete(scene_id: str):
        from core.services.jmeter_scenario.jmeter_user_scene_service import delete_jmeter_user_scene

        user_id = get_current_user_id()
        if not user_id:
            return jsonify({"ok": False, "error": "请先登录", "code": "AUTH_REQUIRED"}), 401
        try:
            deleted = delete_jmeter_user_scene(user_id, scene_id)
            if not deleted:
                return jsonify({"ok": False, "error": "场景不存在或无权访问"}), 404
            return jsonify({"ok": True, "deleted": True})
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500


    @bp.get("/jmeter-scenario/demo-seed")
    def jmeter_demo_seed():
        key = (request.args.get("key") or "").strip()
        if not key:
            return jsonify({"ok": False, "error": "缺少 key 参数"}), 400
        row = get_demo_seed(key)
        if not row:
            return jsonify({"ok": False, "error": "未找到演示种子"}), 404
        return jsonify(
            {
                "ok": True,
                "seed_key": row["seed_key"],
                "title": row["title"],
                "payload": row["payload"],
            }
        )

    @bp.route("/jmeter-scenario/ai/step-edit/stream", methods=["POST"])
    @require_login_api
    def jmeter_ai_step_edit_stream():
        try:
            data = request.json or {}
            user_message = str(data.get("message") or "").strip()
            if not user_message:
                return jsonify({"success": False, "error": "请输入消息"}), 400

            thread_group_timeline = data.get("thread_group_timeline")
            thread_group_yaml = str(data.get("thread_group_yaml") or "").strip()
            use_timeline = isinstance(thread_group_timeline, dict) and bool(thread_group_timeline.get("timeline"))
            if not use_timeline and not thread_group_yaml:
                return jsonify({"success": False, "error": "缺少线程组 Timeline JSON 或 YAML"}), 400

            thread_group_name = str(data.get("thread_group_name") or "").strip() or None
            conversation_history = data.get("conversation_history")

            user_id = get_current_user_id()
            chat_meta = chat_log.extract_chat_meta(data)
            if thread_group_name and not chat_meta.get("tg_name"):
                chat_meta["tg_name"] = thread_group_name
            try:
                ai_cfg = resolve_text_ai_credentials({"use_builtin": True}, user_id)
            except UserAiConfigRequired as exc:
                body, code = user_ai_config_error_response(exc)
                return jsonify(body), code

            quota_meta = _pop_ai_quota_meta(ai_cfg)
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

            def generate():
                stream_fn = iter_jmeter_ai_timeline_stream_events if use_timeline else iter_jmeter_ai_step_stream_events
                stream_kwargs = dict(
                    base_url=base_url,
                    api_key=api_key,
                    model=model,
                    user_message=user_message,
                    thread_group_name=thread_group_name,
                    temperature=temperature,
                    conversation_history=conversation_history if isinstance(conversation_history, list) else None,
                )
                if use_timeline:
                    stream_kwargs["thread_group_timeline"] = thread_group_timeline
                else:
                    stream_kwargs["thread_group_yaml"] = thread_group_yaml
                yield from _iter_sse_with_quota(quota_meta, chat_log.iter_sse_logged(
                    stream_fn(**stream_kwargs),
                    user_id=user_id,
                    meta=chat_meta,
                    phase="legacy",
                    route_mode="legacy",
                ))

            return _sse_response(generate)
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    @bp.route("/jmeter-scenario/ai/step-plan/stream", methods=["POST"])
    @require_login_api
    def jmeter_ai_step_plan_stream():
        """第一轮：仅识别要动的组件清单（两轮 AI，隔离）。"""
        try:
            from core.services.jmeter_scenario.ai_step_plan_service import (
                iter_jmeter_ai_step_plan_stream_events,
            )

            data = request.json or {}
            user_message = str(data.get("message") or "").strip()
            if not user_message:
                return jsonify({"success": False, "error": "请输入消息"}), 400
            brief = data.get("thread_group_brief")
            if not isinstance(brief, dict):
                tl = data.get("thread_group_timeline")
                brief = tl if isinstance(tl, dict) else None
            if not isinstance(brief, dict):
                return jsonify({"success": False, "error": "缺少 thread_group_brief"}), 400
            thread_group_name = str(data.get("thread_group_name") or "").strip() or None

            user_id = get_current_user_id()
            chat_meta = chat_log.extract_chat_meta(data)
            if thread_group_name and not chat_meta.get("tg_name"):
                chat_meta["tg_name"] = thread_group_name

            try:
                ai_cfg = resolve_text_ai_credentials({"use_builtin": True}, user_id)
            except UserAiConfigRequired as exc:
                body, code = user_ai_config_error_response(exc)
                return jsonify(body), code
            quota_meta = _pop_ai_quota_meta(ai_cfg)
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

            def generate():
                yield from _iter_sse_with_quota(quota_meta, chat_log.iter_sse_logged(
                    iter_jmeter_ai_step_plan_stream_events(
                        base_url=base_url,
                        api_key=api_key,
                        model=model,
                        user_message=user_message,
                        thread_group_brief=brief,
                        thread_group_name=thread_group_name,
                        temperature=temperature,
                    ),
                    user_id=user_id,
                    meta=chat_meta,
                    phase="plan",
                    route_mode="two_pass",
                ))

            return _sse_response(generate)
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    @bp.route("/jmeter-scenario/ai/step-edit/two-pass/stream", methods=["POST"])
    @require_login_api
    def jmeter_ai_step_edit_two_pass_stream():
        """第二轮：原逻辑 + 组件清单 + 字段格式包（旧 step-edit/stream 不动）。"""
        try:
            from core.services.jmeter_scenario.ai_step_edit_two_pass_service import (
                iter_jmeter_ai_timeline_stream_events_two_pass,
            )

            data = request.json or {}
            user_message = str(data.get("message") or "").strip()
            if not user_message:
                return jsonify({"success": False, "error": "请输入消息"}), 400
            thread_group_timeline = data.get("thread_group_timeline")
            if not isinstance(thread_group_timeline, dict) or not thread_group_timeline.get("timeline"):
                return jsonify({"success": False, "error": "缺少线程组 Timeline JSON"}), 400
            thread_group_name = str(data.get("thread_group_name") or "").strip() or None
            conversation_history = data.get("conversation_history")
            component_plan = data.get("component_plan") if isinstance(data.get("component_plan"), list) else []
            schema_pack = data.get("schema_pack")

            user_id = get_current_user_id()
            chat_meta = chat_log.extract_chat_meta(data)
            if thread_group_name and not chat_meta.get("tg_name"):
                chat_meta["tg_name"] = thread_group_name
            try:
                ai_cfg = resolve_text_ai_credentials({"use_builtin": True}, user_id)
            except UserAiConfigRequired as exc:
                body, code = user_ai_config_error_response(exc)
                return jsonify(body), code
            quota_meta = _pop_ai_quota_meta(ai_cfg)
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

            def generate():
                yield from _iter_sse_with_quota(quota_meta, chat_log.iter_sse_logged(
                    iter_jmeter_ai_timeline_stream_events_two_pass(
                        base_url=base_url,
                        api_key=api_key,
                        model=model,
                        user_message=user_message,
                        thread_group_timeline=thread_group_timeline,
                        thread_group_name=thread_group_name,
                        temperature=temperature,
                        conversation_history=conversation_history if isinstance(conversation_history, list) else None,
                        component_plan=component_plan,
                        schema_pack=schema_pack,
                    ),
                    user_id=user_id,
                    meta=chat_meta,
                    phase="edit",
                    route_mode="two_pass",
                ))

            return _sse_response(generate)
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    @bp.get("/jmeter-scenario/ai/chat/turns")
    @require_login_api
    def jmeter_ai_chat_turns_list():
        target_uid, err = _resolve_query_user_id()
        if err:
            return err
        try:
            limit = int(request.args.get("limit") or 30)
        except ValueError:
            limit = 30
        try:
            offset = int(request.args.get("offset") or 0)
        except ValueError:
            offset = 0
        session_id = str(request.args.get("client_session_id") or "").strip() or None
        rows = chat_log.list_turns_safe(
            user_id=target_uid,
            client_session_id=session_id,
            limit=limit,
            offset=offset,
        )
        # 列表可不返回超大 operations
        items = []
        for row in rows:
            item = chat_log.serialize_turn(row) or {}
            ops = item.get("operations_json")
            if isinstance(ops, str) and len(ops) > 4000:
                item["operations_json"] = ops[:4000] + "…(truncated)"
                item["operations_truncated"] = True
            items.append(item)
        return jsonify({"ok": True, "user_id": target_uid, "items": items, "count": len(items)})

    @bp.get("/jmeter-scenario/ai/chat/turns/<turn_id>")
    @require_login_api
    def jmeter_ai_chat_turn_detail(turn_id: str):
        self_uid = get_current_user_id()
        if not self_uid:
            return jsonify({"ok": False, "error": "请先登录"}), 401
        tid = str(turn_id or "").strip()
        if not tid:
            return jsonify({"ok": False, "error": "缺少 turn_id"}), 400
        # 先按本人查；管理员查不到时再放开
        row = chat_log.get_turn_safe(turn_id=tid, user_id=self_uid)
        if not row and get_admin_user():
            row = chat_log.get_turn_safe(turn_id=tid, user_id=None)
        if not row:
            return jsonify({"ok": False, "error": "记录不存在"}), 404
        if row.get("user_id") != self_uid and not get_admin_user():
            return jsonify({"ok": False, "error": "无权查看", "code": "FORBIDDEN"}), 403
        return jsonify({"ok": True, "item": chat_log.serialize_turn(row)})

    @bp.post("/jmeter-scenario/ai/chat/apply-result")
    @require_login_api
    def jmeter_ai_chat_apply_result():
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({"ok": False, "error": "请先登录"}), 401
        data = request.json or {}
        client_turn_id = str(data.get("client_turn_id") or "").strip() or None
        turn_id = str(data.get("turn_id") or "").strip() or None
        apply_result = data.get("apply_result")
        if not client_turn_id and not turn_id:
            return jsonify({"ok": False, "error": "缺少 client_turn_id 或 turn_id"}), 400
        row = chat_log.persist_apply_safe(
            user_id=user_id,
            client_turn_id=client_turn_id,
            turn_id=turn_id,
            apply_result=apply_result,
        )
        if not row:
            # 旁路：找不到记录也返回 ok，避免影响前端
            return jsonify({"ok": True, "saved": False})
        return jsonify({"ok": True, "saved": True, "id": row.get("id"), "status": row.get("status")})