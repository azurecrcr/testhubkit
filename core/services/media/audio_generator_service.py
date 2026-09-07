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
VOICE_AUTO = "auto"

# edge-tts（Microsoft Neural）免费高质量音色，精选常用中英及方言
VOICE_CATALOG: tuple[dict[str, str], ...] = (
    {"id": VOICE_AUTO, "label": "自动（随文本语言）", "group": "推荐", "locale": ""},
    {"id": "zh-CN-XiaoxiaoNeural", "label": "晓晓 · 温暖女声", "group": "中文普通话", "locale": "zh-CN"},
    {"id": "zh-CN-XiaoyiNeural", "label": "晓伊 · 活泼女声", "group": "中文普通话", "locale": "zh-CN"},
    {"id": "zh-CN-YunxiNeural", "label": "云希 · 阳光男声", "group": "中文普通话", "locale": "zh-CN"},
    {"id": "zh-CN-YunjianNeural", "label": "云健 · 沉稳男声", "group": "中文普通话", "locale": "zh-CN"},
    {"id": "zh-CN-YunxiaNeural", "label": "云夏 · 清新女声", "group": "中文普通话", "locale": "zh-CN"},
    {"id": "zh-CN-liaoning-XiaobeiNeural", "label": "晓北 · 东北方言", "group": "中文方言", "locale": "zh-CN"},
    {"id": "zh-CN-shaanxi-XiaoniNeural", "label": "晓妮 · 陕西方言", "group": "中文方言", "locale": "zh-CN"},
    {"id": "zh-TW-HsiaoChenNeural", "label": "曉臻 · 台湾女声", "group": "中文繁体", "locale": "zh-TW"},
    {"id": "zh-TW-YunJheNeural", "label": "雲哲 · 台湾男声", "group": "中文繁体", "locale": "zh-TW"},
    {"id": "en-US-JennyNeural", "label": "Jenny · 美式女声", "group": "English", "locale": "en-US"},
    {"id": "en-US-GuyNeural", "label": "Guy · 美式男声", "group": "English", "locale": "en-US"},
    {"id": "en-US-AriaNeural", "label": "Aria · 叙事女声", "group": "English", "locale": "en-US"},
    {"id": "en-US-AndrewNeural", "label": "Andrew · 温暖男声", "group": "English", "locale": "en-US"},
    {"id": "en-US-EmmaNeural", "label": "Emma · 清晰女声", "group": "English", "locale": "en-US"},
    {"id": "en-GB-SoniaNeural", "label": "Sonia · 英式女声", "group": "English", "locale": "en-GB"},
    {"id": "en-GB-RyanNeural", "label": "Ryan · 英式男声", "group": "English", "locale": "en-GB"},
    {"id": "en-AU-NatashaNeural", "label": "Natasha · 澳式女声", "group": "English", "locale": "en-AU"},
)

_ALLOWED_EDGE_VOICE_IDS = frozenset(
    item["id"] for item in VOICE_CATALOG if item["id"] != VOICE_AUTO
)


@dataclass
class AudioGenerationResult:
    output_path: str
    output_filename: str
    applied_rate_percent: int
    actual_duration_seconds: float
    applied_voice: str = ""
    tts_engine: str = "edge-tts"
    openim_output_key: str | None = None


def _contains_chinese(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text))


def list_voice_options() -> list[dict[str, str]]:
    """返回可选音色列表（edge-tts Neural）。"""
    return [dict(item) for item in VOICE_CATALOG]


def resolve_voice_for_text(text: str, voice: str | None) -> str:
    """解析用户选择的音色；auto 或空则按文本语言选择默认 Neural 音色。"""
    chosen = (voice or "").strip()
    if chosen and chosen != VOICE_AUTO and chosen in _ALLOWED_EDGE_VOICE_IDS:
        return chosen
    return DEFAULT_VOICE_ZH if _contains_chinese(text) else DEFAULT_VOICE_EN


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


def _configure_offline_voice(engine, text: str) -> None:
    voices = engine.getProperty("voices") or []
    want_zh = _contains_chinese(text)
    for voice in voices:
        vid = (getattr(voice, "id", "") or "").lower()
        name = (getattr(voice, "name", "") or "").lower()
        if want_zh and any(token in vid or token in name for token in ("zh", "cmn", "chinese", "mandarin")):
            engine.setProperty("voice", voice.id)
            return
    if not want_zh:
        for voice in voices:
            vid = (getattr(voice, "id", "") or "").lower()
            if "en" in vid or "english" in (getattr(voice, "name", "") or "").lower():
                engine.setProperty("voice", voice.id)
                return


def _user_chose_specific_voice(voice: str | None) -> bool:
    chosen = (voice or "").strip()
    return bool(chosen and chosen != VOICE_AUTO)


def _synthesize_to_wav_offline(text: str, output_path: str, edge_voice: str) -> None:
    try:
        engine = pyttsx3.init()
    except Exception as exc:
        raise RuntimeError(
            "本地语音引擎不可用，请确认容器已安装 espeak-ng（Dockerfile 需包含 espeak-ng 与 ffmpeg）"
        ) from exc
    # 离线引擎无法对应 Neural 音色，仅按语种选 espeak 声线；男声请求尽量选较低 pitch。
    _configure_offline_voice(engine, text)
    if "Neural" in edge_voice and ("Yun" in edge_voice or "Guy" in edge_voice or "Ryan" in edge_voice or "Andrew" in edge_voice):
        try:
            engine.setProperty("rate", 165)
        except Exception:
            pass
    elif "Neural" in edge_voice and ("Xiao" in edge_voice or "Jenny" in edge_voice or "Aria" in edge_voice):
        try:
            engine.setProperty("rate", 185)
        except Exception:
            pass
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
    voice: str | None = None,
) -> AudioGenerationResult:
    fmt = (target_format or "").strip().lower()
    if fmt not in SUPPORTED_AUDIO_FORMATS:
        raise ValueError(f"不支持的音频格式: {target_format}")

    if target_duration_seconds <= 0:
        raise ValueError("音频时长必须大于0秒")

    cleaned_text = _sanitize_text_for_tts(text)
    if not cleaned_text:
        raise ValueError("过滤特殊符号后无可朗读内容，请输入中文或英文")

    edge_voice = resolve_voice_for_text(cleaned_text, voice)
    task_id = uuid.uuid4().hex
    base_mp3_path = os.path.join(output_dir, f"audio_base_{task_id}.mp3")
    base_wav_path = os.path.join(output_dir, f"audio_base_{task_id}.wav")
    temp_source_path = base_mp3_path
    used_offline_engine = False

    edge_error: str | None = None
    tts_engine = "edge-tts"
    explicit_voice = _user_chose_specific_voice(voice)
    try:
        try:
            asyncio.run(
                _synthesize_to_mp3(text=cleaned_text, voice=edge_voice, rate_percent=0, output_path=base_mp3_path)
            )
            base_audio = AudioSegment.from_file(base_mp3_path, format="mp3")
            temp_source_path = base_mp3_path
        except Exception as edge_exc:
            edge_error = str(edge_exc).strip() or edge_exc.__class__.__name__
            if explicit_voice:
                raise RuntimeError(
                    f"在线 Edge TTS 不可用，无法使用所选音色（{edge_voice}）。"
                    f"请稍后重试或联系管理员升级 edge-tts。详情: {edge_error}"
                ) from edge_exc
            # 仅「自动」模式才回退本地引擎（音色差异有限）。
            _synthesize_to_wav_offline(text=cleaned_text, output_path=base_wav_path, edge_voice=edge_voice)
            base_audio = AudioSegment.from_file(base_wav_path, format="wav")
            temp_source_path = base_wav_path
            used_offline_engine = True
            tts_engine = "offline-espeak"

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
            applied_voice=edge_voice,
            tts_engine=tts_engine,
            openim_output_key=openim_output_key,
        )
    except CouldntDecodeError as exc:
        raise RuntimeError("音频处理失败，请确认系统已安装并配置 ffmpeg。") from exc
    except Exception as exc:
        detail = str(exc).strip() or exc.__class__.__name__
        if edge_error and "espeak" in detail.lower():
            detail = f"在线 Edge TTS 不可用（{edge_error}）；本地引擎: {detail}"
        raise RuntimeError(f"语音生成失败，请检查网络或本地语音引擎: {detail}") from exc
    finally:
        _safe_remove(base_mp3_path)
        _safe_remove(base_wav_path)
        _safe_remove(temp_source_path)
