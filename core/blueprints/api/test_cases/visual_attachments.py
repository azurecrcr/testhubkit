"""用例录入附件 API（普通用户个人视觉模型；管理员全站视觉模型）。"""
from __future__ import annotations

from flask import Blueprint, jsonify, request, send_file

from core.services.ai.user_ai_daily_quota_service import attach_quota_to_response
from core.config.user_ai_credentials import (
    UserAiConfigRequired,
    is_vision_ai_configured,
    resolve_vision_ai_credentials,
    user_ai_config_error_response,
)
from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.visual_attachments.asset_store import (
    MAX_BATCH_FILES,
    classify_asset_type,
    delete_files,
    resolve_path,
    save_upload,
)
from core.services.visual_attachments.limits import MAX_ATTACH_FILES
from core.services.visual_attachments.attachment_db import (
    delete_asset as db_delete_asset,
    ensure_tables,
    get_asset,
    insert_asset,
)
from core.services.visual_attachments.context_builder import create_attachment_context
from core.services.visual_attachments.edit_attachment_context import prepare_edit_attachment_context
from core.services.visual_attachments.parse_service import parse_asset_async


def _is_truthy_form_flag(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/attachments/status", methods=["GET"])
    @require_login_api
    def attachments_status():
        user_id = get_current_user_id() or ""
        # 视觉 env 回填已在进程内 memo；status 热路径不再强制调用，避免抢占首屏连接
        from core.services.ai.user_ai_daily_quota_service import get_user_daily_quota_status

        quota = get_user_daily_quota_status(user_id)
        vision_q = quota.get("vision") or {}
        vision_configured = is_vision_ai_configured(user_id)
        remaining = int(vision_q.get("remaining") or 0)
        return jsonify(
            {
                "enabled": True,
                "vision_configured": vision_configured,
                "vision_quota_remaining": remaining,
                "vision_quota_exhausted": bool(
                    vision_configured
                    and remaining <= 0
                    and not vision_q.get("has_own_config")
                ),
                "max_attach_files": MAX_ATTACH_FILES,
                "max_batch_files": MAX_BATCH_FILES,
            }
        )

    @bp.route("/test-cases/attachments/batch", methods=["POST"])
    @require_login_api
    def attachments_upload_batch():
        user_id = get_current_user_id() or ""
        defer_parse = _is_truthy_form_flag(request.form.get("defer_parse"))
        vision_quota_meta = None
        ensure_tables()
        files = request.files.getlist("files[]") or request.files.getlist("files")
        if not files:
            return jsonify({"error": "缺少 files"}), 400
        valid_files = [f for f in files if f and f.filename]
        if not valid_files:
            return jsonify({"error": "缺少有效文件"}), 400
        if len(valid_files) > MAX_BATCH_FILES:
            return jsonify({"error": f"单次最多上传 {MAX_BATCH_FILES} 个文件"}), 400

        existing_ids = request.form.getlist("existing_asset_ids[]") or []
        unique_existing: list[str] = []
        for raw_id in existing_ids:
            aid = str(raw_id or "").strip()
            if not aid or aid in unique_existing:
                continue
            asset = get_asset(aid, user_id)
            if not asset:
                return jsonify({"error": "存在无效或未授权的附件引用"}), 400
            unique_existing.append(aid)
        if len(unique_existing) + len(valid_files) > MAX_ATTACH_FILES:
            return jsonify({"error": f"最多 {MAX_ATTACH_FILES} 个附件，请先移除部分后再上传"}), 400

        created = []
        for f in valid_files:
            try:
                storage_key, thumb_key, mime, _ = save_upload(f, user_id=user_id)
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400
            asset = insert_asset(
                user_id=user_id,
                asset_type=classify_asset_type(mime),
                mime_type=mime,
                storage_key=storage_key,
                thumb_key=thumb_key,
            )
            from core.services.visual_attachments.attachment_db import update_asset_parse
            if defer_parse:
                update_asset_parse(asset["id"], parse_status="pending", parse_result={})
            else:
                from core.services.ai.user_ai_daily_quota_service import pop_quota_meta
                try:
                    vision_cfg_pre = resolve_vision_ai_credentials(user_id)
                except UserAiConfigRequired as exc:
                    body, code = user_ai_config_error_response(exc)
                    return jsonify(body), code
                qm = pop_quota_meta(vision_cfg_pre)
                if qm:
                    vision_quota_meta = qm
                update_asset_parse(
                    asset["id"],
                    parse_status="pending",
                    parse_result={"_vision_quota_charged": True},
                )
                parse_asset_async(asset["id"], user_id, vision_cfg=vision_cfg_pre)
            asset["thumb_url"] = f"/api/test-cases/attachments/{asset['id']}/thumb"
            created.append(asset)
        resp = {"assets": created}
        if vision_quota_meta:
            resp["ai_quota"] = vision_quota_meta
        return jsonify(resp), 201

    @bp.route("/test-cases/attachments/edit-prepare-context", methods=["POST"])
    @require_login_api
    def attachments_edit_prepare_context():
        """智能编辑专用：发送前同步解析附件并构建上下文。"""
        user_id = get_current_user_id() or ""
        data = request.get_json(silent=True) or {}
        asset_ids = data.get("asset_ids") or []
        if not isinstance(asset_ids, list) or not asset_ids:
            return jsonify({"error": "缺少 asset_ids"}), 400
        if len(asset_ids) > MAX_ATTACH_FILES:
            return jsonify({"error": f"最多 {MAX_ATTACH_FILES} 个附件参与编辑"}), 400
        normalized_ids: list[str] = []
        for raw_id in asset_ids:
            aid = str(raw_id or "").strip()
            if aid and aid not in normalized_ids:
                normalized_ids.append(aid)
        try:
            ctx, vision_quota_meta = prepare_edit_attachment_context(
                user_id=user_id,
                asset_ids=normalized_ids,
                user_prompt=str(data.get("user_prompt") or "").strip(),
            )
            assets: list[dict] = []
            for aid in normalized_ids:
                asset = get_asset(aid, user_id)
                if asset:
                    asset["thumb_url"] = f"/api/test-cases/attachments/{asset['id']}/thumb"
                    assets.append(asset)
            resp = {"context": ctx, "assets": assets}
            if vision_quota_meta:
                resp["ai_quota"] = vision_quota_meta
            return jsonify(resp), 201
        except UserAiConfigRequired as exc:
            body, code = user_ai_config_error_response(exc)
            return jsonify(body), code
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc) or "附件解析失败"}), 500

    @bp.route("/test-cases/attachments/history-resolve", methods=["POST"])
    @require_login_api
    def attachments_history_resolve():
        user_id = get_current_user_id() or ""
        data = request.get_json(silent=True) or {}
        raw_ids = data.get("asset_ids") or []
        if not isinstance(raw_ids, list):
            return jsonify({"error": "asset_ids 必须为数组"}), 400
        items = []
        seen = set()
        for raw in raw_ids[:48]:
            aid = str(raw or "").strip()
            if not aid or aid in seen:
                continue
            seen.add(aid)
            asset = get_asset(aid, user_id)
            if not asset:
                items.append({"id": aid, "available": False})
                continue
            mime = str(asset.get("mime_type") or "").lower()
            kind = "pdf" if "pdf" in mime else ("txt" if "text" in mime else "image")
            items.append(
                {
                    "id": aid,
                    "available": True,
                    "mime_type": mime,
                    "kind": kind,
                    "thumb_url": f"/api/test-cases/attachments/{aid}/thumb",
                }
            )
        return jsonify({"items": items})

    @bp.route("/test-cases/attachments/<asset_id>", methods=["DELETE"])
    @require_login_api
    def attachments_delete(asset_id: str):
        user_id = get_current_user_id() or ""
        asset = get_asset(asset_id, user_id)
        if not asset:
            return jsonify({"error": "附件不存在"}), 404
        delete_files(asset.get("storage_key") or "", asset.get("thumb_key"))
        db_delete_asset(asset_id, user_id)
        return jsonify({"ok": True})

    @bp.route("/test-cases/attachments/<asset_id>", methods=["GET"])
    @require_login_api
    def attachments_get(asset_id: str):
        user_id = get_current_user_id() or ""
        asset = get_asset(asset_id, user_id)
        if not asset:
            return jsonify({"error": "附件不存在"}), 404
        asset["thumb_url"] = f"/api/test-cases/attachments/{asset_id}/thumb"
        return jsonify({"asset": asset})

    @bp.route("/test-cases/attachments/<asset_id>/thumb", methods=["GET"])
    @require_login_api
    def attachments_thumb(asset_id: str):
        user_id = get_current_user_id() or ""
        asset = get_asset(asset_id, user_id)
        if not asset:
            return jsonify({"error": "附件不存在"}), 404
        key = asset.get("thumb_key") or asset.get("storage_key")
        path = resolve_path(key)
        if not path.is_file():
            return jsonify({"error": "文件不存在"}), 404
        return send_file(path, conditional=True)

    @bp.route("/test-cases/attachments/contexts", methods=["POST"])
    @require_login_api
    def attachments_create_context():
        user_id = get_current_user_id() or ""
        data = request.get_json(silent=True) or {}
        asset_ids = data.get("asset_ids") or []
        if not isinstance(asset_ids, list) or not asset_ids:
            return jsonify({"error": "缺少 asset_ids"}), 400
        if len(asset_ids) > MAX_ATTACH_FILES:
            return jsonify({"error": f"最多 {MAX_ATTACH_FILES} 个附件参与生成"}), 400
        try:
            include_gen = data.get("include_in_generation", True)
            if isinstance(include_gen, str):
                include_gen = include_gen.lower() not in ("0", "false", "no")
            ctx = create_attachment_context(
                user_id=user_id,
                asset_ids=[str(a) for a in asset_ids],
                user_prompt=str(data.get("user_prompt") or "").strip(),
                include_in_generation=bool(include_gen),
            )
            return jsonify(ctx), 201
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
