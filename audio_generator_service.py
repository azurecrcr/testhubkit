import asyncio
import os
import re
import uuid
from dataclasses import dataclass

import edge_tts
import pyttsx3
from pydub import AudioSegment
from pydub.exceptions import CouldntDecodeError
from pydub.utils import which


SUPPORTED_AUDIO_FORMATS = ("mp3", "wav", "flac", "aac", "ogg", "m4a")
DEFAULT_VOICE_ZH = "zh-CN-XiaoxiaoNeural"
DEFAULT_VOICE_EN = "en-US-JennyNeural"


@dataclass
class AudioGenerationResult:
    output_path: str
    output_filename: str
    applied_rate_percent: int
    actual_duration_seconds: float
    openim_output_key: str | None = None


def _contains_chinese(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text))


def _sanitize_text_for_tts(text: str) -> str:
    # 仅保留中文、英文和空白字符，过滤特殊符号及其他字符。
    cleaned = re.sub(r"[^\u4e00-\u9fffA-Za-z\s]", " ", text or "")
    return " ".join(cleaned.split())


def _clamp_rate_percent(rate_percent: int) -> int:
    # edge-tts rate generally supports [-100, 100], here we keep a safer range
    return max(-80, min(100, rate_percent))


def _rate_to_edge_tts_value(rate_percent: int) -> str:
    if rate_percent == 0:
        return "+0%"
    if rate_percent > 0:
        return f"+{rate_percent}%"
    return f"{rate_percent}%"


async def _synthesize_to_mp3(text: str, voice: str, rate_percent: int, output_path: str) -> None:
    communicate = edge_tts.Communicate(
        text=text,
        voice=voice,
        rate=_rate_to_edge_tts_value(rate_percent),
    )
    await communicate.save(output_path)


def _synthesize_to_wav_offline(text: str, output_path: str) -> None:
    try:
        engine = pyttsx3.init("espeak")
    except Exception:
        engine = pyttsx3.init()
    # 使用默认语速生成基础音频，后续再按目标时长统一做变速处理。
    engine.save_to_file(text, output_path)
    engine.runAndWait()
    engine.stop()


def _adjust_audio_speed(audio: AudioSegment, speed_ratio: float) -> AudioSegment:
    # 通过调整采样率实现加/减速，兼容性更高（会有轻微音高变化）。
    safe_ratio = max(0.3, min(3.0, speed_ratio))
    adjusted = audio._spawn(audio.raw_data, overrides={"frame_rate": int(audio.frame_rate * safe_ratio)})
    return adjusted.set_frame_rate(audio.frame_rate)


def _ffmpeg_available() -> bool:
    return bool(which("ffmpeg"))


def _safe_remove(path: str) -> None:
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass


def generate_audio_from_text(
    text: str,
    target_format: str,
    target_duration_seconds: float,
    output_dir: str,
) -> AudioGenerationResult:
    fmt = (target_format or "").strip().lower()
    if fmt not in SUPPORTED_AUDIO_FORMATS:
        raise ValueError(f"不支持的音频格式: {target_format}")

    if target_duration_seconds <= 0:
        raise ValueError("音频时长必须大于0秒")

    cleaned_text = _sanitize_text_for_tts(text)
    if not cleaned_text:
        raise ValueError("过滤特殊符号后无可朗读内容，请输入中文或英文")

    voice = DEFAULT_VOICE_ZH if _contains_chinese(cleaned_text) else DEFAULT_VOICE_EN
    task_id = uuid.uuid4().hex
    base_mp3_path = os.path.join(output_dir, f"audio_base_{task_id}.mp3")
    base_wav_path = os.path.join(output_dir, f"audio_base_{task_id}.wav")
    temp_source_path = base_mp3_path
    used_offline_engine = False

    try:
        try:
            asyncio.run(_synthesize_to_mp3(text=cleaned_text, voice=voice, rate_percent=0, output_path=base_mp3_path))
            base_audio = AudioSegment.from_file(base_mp3_path, format="mp3")
            temp_source_path = base_mp3_path
        except Exception:
            # Edge 在线服务不可用时，自动回退为本地离线 TTS（需 espeak-ng + ffmpeg）。
            _synthesize_to_wav_offline(text=cleaned_text, output_path=base_wav_path)
            base_audio = AudioSegment.from_file(base_wav_path, format="wav")
            temp_source_path = base_wav_path
            used_offline_engine = True

        base_duration_seconds = max(base_audio.duration_seconds, 0.1)

        speed_ratio = base_duration_seconds / target_duration_seconds
        raw_rate_percent = int(round((speed_ratio - 1.0) * 100))
        applied_rate_percent = _clamp_rate_percent(raw_rate_percent)
        final_audio = _adjust_audio_speed(base_audio, speed_ratio)

        actual_fmt = fmt
        if used_offline_engine and fmt != "wav" and not _ffmpeg_available():
            # 本地回退模式下若未安装 ffmpeg，无法导出压缩格式，自动降级为 WAV。
            actual_fmt = "wav"

        output_filename = f"generated_audio_{task_id}.{actual_fmt}"
        output_path = os.path.join(output_dir, output_filename)

        export_kwargs = {}
        export_format = actual_fmt
        if actual_fmt == "m4a":
            export_format = "mp4"
            export_kwargs["codec"] = "aac"
        elif actual_fmt == "aac":
            export_format = "adts"
            export_kwargs["codec"] = "aac"
        elif actual_fmt == "ogg":
            export_kwargs["codec"] = "libvorbis"

        final_audio.export(output_path, format=export_format, **export_kwargs)

        openim_output_key = None
        try:
            from core.services.media.media_storage_helper import persist_media_bytes
            from core.services.storage import is_openim_storage_enabled

            if is_openim_storage_enabled():
                import mimetypes

                mime = mimetypes.guess_type(output_filename)[0] or "application/octet-stream"
                with open(output_path, "rb") as audio_file:
                    openim_output_key = persist_media_bytes(
                        "audio/outputs",
                        output_filename,
                        audio_file.read(),
                        mime,
                        task_id=task_id,
                    )
                for temp_name, temp_path in (
                    (base_mp3_path, base_mp3_path),
                    (base_wav_path, base_wav_path),
                ):
                    if os.path.exists(temp_path):
                        temp_mime = mimetypes.guess_type(temp_name)[0] or "application/octet-stream"
                        with open(temp_path, "rb") as temp_file:
                            persist_media_bytes(
                                "audio/work",
                                os.path.basename(temp_name),
                                temp_file.read(),
                                temp_mime,
                                task_id=task_id,
                            )
        except Exception as storage_exc:
            raise RuntimeError(f"音频已生成但写入 OpenIM 失败: {storage_exc}") from storage_exc

        return AudioGenerationResult(
            output_path=output_path,
            output_filename=output_filename,
            applied_rate_percent=applied_rate_percent,
            actual_duration_seconds=final_audio.duration_seconds,
            openim_output_key=openim_output_key,
        )
    except CouldntDecodeError as exc:
        raise RuntimeError("音频处理失败，请确认系统已安装并配置 ffmpeg。") from exc
    except Exception as exc:
        hint = "请确认容器已安装 espeak-ng 与 ffmpeg，或检查服务器访问 Edge TTS 的网络。"
        raise RuntimeError(f"语音生成失败，请检查网络或本地语音引擎: {exc}。{hint}") from exc
    finally:
        _safe_remove(base_mp3_path)
        _safe_remove(base_wav_path)
        _safe_remove(temp_source_path)
