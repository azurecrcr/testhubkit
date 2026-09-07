#!/usr/bin/env python3
"""容器内检测 edge-tts / pyttsx3 / ffmpeg 依赖。"""
import asyncio
import shutil
import sys

print("ffmpeg:", shutil.which("ffmpeg"))
print("espeak:", shutil.which("espeak"))
print("espeak-ng:", shutil.which("espeak-ng"))

try:
    import edge_tts

    async def _run():
        c = edge_tts.Communicate(text="hello", voice="zh-CN-XiaoxiaoNeural")
        await c.save("/tmp/edge_test.mp3")

    asyncio.run(_run())
    print("edge-tts: OK")
except Exception as e:
    print("edge-tts: FAIL", e)

try:
    import pyttsx3

    eng = pyttsx3.init()
    eng.save_to_file("hello", "/tmp/pyttsx_test.wav")
    eng.runAndWait()
    eng.stop()
    print("pyttsx3: OK")
except Exception as e:
    print("pyttsx3: FAIL", e)

sys.exit(0)
