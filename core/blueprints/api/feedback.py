from __future__ import annotations

from flask import Blueprint, jsonify, request, send_file

from core.services.auth.admin_guard import get_admin_user
from core.services.auth.auth_session import get_current_user_id
from core.utils.client_ip import get_client_ip


def register_routes(bp: Blueprint) -> None:
    @bp.route("/feedback", methods=["POST"])
    def submit_feedback():
        user_agent = request.headers.get("User-Agent", "")
        client_ip = get_client_ip(request)
        user_id = get_current_user_id()
        is_multipart = bool(request.content_type and "multipart/form-data" in request.content_type.lower())

        try:
            from core.services.feedback.feedback_service import (
                FeedbackRateLimitError,
                create_feedback,
                create_feedback_with_images,
            )

            if is_multipart:
                content = request.form.get("content") or ""
                contact = request.form.get("contact") or ""
                page_url = request.form.get("page_url") or ""
                image_files = request.files.getlist("images") or []
                # 过滤空 file 位
                image_files = [f for f in image_files if f and getattr(f, "filename", None) is not None]
                result = create_feedback_with_images(
                    content=content,
                    contact=contact,
                    page_url=page_url,
                    user_agent=user_agent,
                    client_ip=client_ip,
                    user_id=user_id,
                    image_files=image_files,
                )
            else:
                data = request.get_json(silent=True) or {}
                content = data.get("content") or request.form.get("content") or ""
                contact = data.get("contact") or request.form.get("contact") or ""
                page_url = data.get("page_url") or request.form.get("page_url") or ""
                result = create_feedback(
                    content=content,
                    contact=contact,
                    page_url=page_url,
                    user_agent=user_agent,
                    client_ip=client_ip,
                    user_id=user_id,
                )
            return jsonify(
                {
                    "ok": True,
                    "id": result["id"],
                    "message": "感谢你的建议，我们已收到。",
                    "email_sent": result.get("email_sent", False),
                    "sms_sent": result.get("sms_sent", False),
                    "image_count": int(result.get("image_count") or 0),
                    "inbox_notified": bool(result.get("inbox_notified")),
                    "inbox_recipient_count": int(result.get("inbox_recipient_count") or 0),
                }
            )
        except FeedbackRateLimitError as exc:
            return jsonify({"error": str(exc)}), 429
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": f"提交失败: {exc}"}), 500

    @bp.get("/feedback/admin/item/<feedback_id>")
    def feedback_admin_detail(feedback_id: str):
        """管理员查看单条投稿详情（含图片）。新接口，不影响分页列表与图片路由。"""
        if not get_current_user_id():
            return jsonify({"error": "请先登录"}), 401
        if not get_admin_user():
            return jsonify({"error": "需要管理员权限"}), 403
        from core.services.feedback.feedback_admin_service import get_feedback_admin_detail

        data = get_feedback_admin_detail(feedback_id)
        if not data:
            return jsonify({"error": "投稿不存在"}), 404
        return jsonify({"error": None, "item": data})

    @bp.get("/feedback/admin/list")
    def feedback_admin_list():
        """管理员分页查看投稿建议（只读）。"""
        if not get_current_user_id():
            return jsonify({"error": "请先登录"}), 401
        if not get_admin_user():
            return jsonify({"error": "需要管理员权限"}), 403
        try:
            page = int(request.args.get("page") or 1)
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.args.get("page_size") or 20)
        except (TypeError, ValueError):
            page_size = 20
        from core.services.feedback.feedback_admin_service import list_feedback_admin

        data = list_feedback_admin(page=page, page_size=page_size)
        return jsonify({"error": None, **data})

    @bp.get("/feedback/admin/images/<image_id>")
    def feedback_admin_image(image_id: str):
        """管理员查看投稿图片原图（独立鉴权，不影响其它静态资源）。"""
        if not get_current_user_id():
            return jsonify({"error": "请先登录"}), 401
        if not get_admin_user():
            return jsonify({"error": "需要管理员权限"}), 403
        try:
            from core.services.feedback.feedback_image_db import get_feedback_image_by_id
            from core.services.feedback.feedback_image_service import resolve_feedback_image_abs_path

            row = get_feedback_image_by_id(image_id)
            if not row:
                return jsonify({"error": "图片不存在"}), 404
            abs_path = resolve_feedback_image_abs_path(str(row.get("storage_path") or ""))
            return send_file(
                abs_path,
                mimetype=str(row.get("mime_type") or "application/octet-stream"),
                as_attachment=False,
                download_name=str(row.get("file_name") or "image"),
                max_age=300,
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except FileNotFoundError:
            return jsonify({"error": "图片文件缺失"}), 404
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": f"读取失败: {exc}"}), 500
