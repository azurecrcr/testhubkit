from __future__ import annotations

import uuid

from flask import Blueprint, jsonify, request, send_file
from PIL import Image

from core.services.media import convert_image_format
from core.services.media.media_storage_helper import persist_media_bytes
from core.utils.image_upload import validate_image_upload_size


def register_routes(bp: Blueprint) -> None:
    @bp.route("/image-format-converter", methods=["POST"])
    def image_format_converter():
        try:
            file = request.files.get("file")
            target_format = request.form.get("target_format")
            quality = int(request.form.get("quality", 85))

            if not file:
                return jsonify({"error": "请上传图片文件"}), 400
            if not target_format:
                return jsonify({"error": "请选择目标格式"}), 400

            file.seek(0)
            file_content = file.read(1)
            file.seek(0)
            if len(file_content) == 0:
                return jsonify({"error": "上传的文件为空，请重新上传"}), 400

            ok, size_msg = validate_image_upload_size(file)
            if not ok:
                return jsonify({"error": size_msg}), 413 if size_msg and "超过限制" in size_msg else 400

            task_id = uuid.uuid4().hex
            file_data, input_name, output, output_filename, mimetype = convert_image_format(
                file, target_format, quality
            )

            try:
                Image.open(output)
            except Exception:
                return jsonify({"error": "无法识别的图片格式，请检查上传的文件"}), 400

            output.seek(0)
            persist_media_bytes(
                "image/uploads",
                input_name,
                file_data,
                file.content_type or "application/octet-stream",
                task_id=task_id,
            )
            persist_media_bytes(
                "image/outputs",
                output_filename,
                output.getvalue(),
                mimetype,
                task_id=task_id,
            )
            output.seek(0)
            return send_file(
                output,
                mimetype=mimetype,
                as_attachment=True,
                download_name=output_filename,
            )
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 500
        except Exception as exc:
            return jsonify({"error": f"转换图片格式时出错: {exc}"}), 500
