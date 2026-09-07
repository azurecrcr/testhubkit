"""交流群相关 API（独立蓝图，不影响投稿/登录）。"""

from __future__ import annotations

from flask import Blueprint, jsonify, request, send_file

from core.services.auth.admin_guard import get_admin_user
from core.services.community.wechat_qr_service import (
    resolve_wechat_qr_abs_path,
    save_wechat_qr_upload,
    sniff_wechat_qr_mimetype,
    wechat_qr_public_url,
)


def register_routes(bp: Blueprint) -> None:
    @bp.get("/community/wechat-qr")
    def community_wechat_qr_get():
        try:
            path = resolve_wechat_qr_abs_path()
        except FileNotFoundError:
            return jsonify({"error": "二维码暂不可用"}), 404
        return send_file(
            path,
            mimetype=sniff_wechat_qr_mimetype(path),
            conditional=True,
            max_age=300,
        )

    @bp.post("/community/wechat-qr")
    def community_wechat_qr_upload():
        from core.services.auth.auth_session import get_current_user_id

        if not get_admin_user():
            if not get_current_user_id():
                return jsonify({"error": "请先登录", "code": "AUTH_REQUIRED"}), 401
            return jsonify({"error": "仅管理员可更换交流群二维码", "code": "ADMIN_REQUIRED"}), 403

        file = request.files.get("qr") or request.files.get("file")
        try:
            info = save_wechat_qr_upload(file)
            return jsonify({"error": None, "url": info["url"], "version": info["version"]})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:
            return jsonify({"error": "上传失败，请稍后重试"}), 500

    @bp.get("/community/wechat-qr/meta")
    def community_wechat_qr_meta():
        return jsonify({"error": None, "url": wechat_qr_public_url()})
