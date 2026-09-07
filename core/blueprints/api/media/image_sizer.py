from __future__ import annotations

import uuid

from flask import Blueprint, jsonify, request, send_file

from core.config import ALLOWED_IMAGE_EXTENSIONS
from core.services.media import resize_image_to_target
from core.services.media.media_storage_helper import persist_media_bytes
from core.utils.image_upload import validate_image_upload_size


def register_routes(bp: Blueprint) -> None:
    @bp.route("/image-sizer", methods=["POST"])
    def image_sizer():
        if "file" not in request.files:
            return jsonify({"error": "请上传图片文件"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "请选择一个文件"}), 400

        if not file.filename.lower().endswith(ALLOWED_IMAGE_EXTENSIONS):
            return jsonify({"error": "请上传图片文件"}), 400

        ok, size_msg = validate_image_upload_size(file)
        if not ok:
            return jsonify({"error": size_msg}), 413 if size_msg and "超过限制" in size_msg else 400

        target_size = float(request.form.get("target_size", 1.0))
        task_id = uuid.uuid4().hex
        try:
            output, file_data = resize_image_to_target(file, target_size)
            persist_media_bytes(
                "image/uploads",
                file.filename,
                file_data,
                file.content_type or "application/octet-stream",
                task_id=task_id,
            )
            persist_media_bytes(
                "image/outputs",
                f"resized_{file.filename}",
                output.getvalue(),
                "image/jpeg",
                task_id=task_id,
            )
            output.seek(0)
            return send_file(
                output,
                mimetype="image/jpeg",
                as_attachment=True,
                download_name=f"resized_{file.filename}",
            )
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 500
        except Exception as exc:
            return jsonify({"error": f"图片处理失败: {exc}"}), 500
