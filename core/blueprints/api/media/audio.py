from __future__ import annotations

import os
import shutil
import tempfile

from flask import Blueprint, jsonify, request, send_file

from core.services.media import (
    SUPPORTED_AUDIO_FORMATS,
    VOICE_AUTO,
    generate_audio_from_text,
    list_voice_options,
    resolve_voice_for_text,
)


def register_routes(bp: Blueprint) -> None:
    @bp.route("/audio-voices", methods=["GET"])
    def audio_voices():
        return jsonify({"engine": "edge-tts", "voices": list_voice_options()})

    @bp.route("/audio-generator", methods=["POST"])
    def audio_generator():
        text = (request.form.get("text") or "").strip()
        target_format = (request.form.get("target_format") or "mp3").strip().lower()
        duration_text = (request.form.get("duration") or "").strip()
        voice = (request.form.get("voice") or VOICE_AUTO).strip() or VOICE_AUTO

        if not text:
            return jsonify({"error": "请输入要转换的文本"}), 400
        if target_format not in SUPPORTED_AUDIO_FORMATS:
            return jsonify({"error": f"不支持的格式：{target_format}"}), 400
        if not duration_text:
            return jsonify({"error": "请输入目标音频时长（秒）"}), 400

        try:
            duration_seconds = float(duration_text)
            if duration_seconds <= 0:
                return jsonify({"error": "音频时长必须大于0"}), 400

            temp_dir = tempfile.mkdtemp(prefix="testhub_audio_")
            result = generate_audio_from_text(
                text=text,
                target_format=target_format,
                target_duration_seconds=duration_seconds,
                output_dir=temp_dir,
                voice=voice,
            )
            response = send_file(
                result.output_path,
                as_attachment=True,
                download_name=result.output_filename,
            )
            response.headers["X-Applied-Rate"] = str(result.applied_rate_percent)
            response.headers["X-Output-Filename"] = result.output_filename
            response.headers["X-Actual-Duration"] = f"{result.actual_duration_seconds:.2f}"
            response.headers["X-Applied-Voice"] = result.applied_voice or resolve_voice_for_text(text, voice)
            response.headers["X-TTS-Engine"] = result.tts_engine
            if result.openim_output_key:
                response.headers["X-OpenIM-Object-Key"] = result.openim_output_key

            @response.call_on_close
            def cleanup():
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as cleanup_err:
                    print(f"清理临时音频目录失败: {str(cleanup_err)}")

            return response
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 500
        except Exception as exc:
            return jsonify({"error": f"音频生成失败: {str(exc)}"}), 500
