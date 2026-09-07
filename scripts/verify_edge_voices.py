#!/usr/bin/env python3
"""Verify edge-tts can synthesize distinct voices (run in container)."""
from __future__ import annotations

import asyncio
import hashlib
import sys

import edge_tts


async def _hash_voice(voice_id: str, text: str) -> str:
    path = f"/tmp/edge_voice_{voice_id.replace('-', '_')}.mp3"
    await edge_tts.Communicate(text=text, voice=voice_id).save(path)
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()[:12]


async def main() -> None:
    pairs = [
        ("zh-CN-XiaoxiaoNeural", "你好世界"),
        ("zh-CN-YunxiNeural", "你好世界"),
        ("en-US-JennyNeural", "hello world"),
        ("en-US-GuyNeural", "hello world"),
    ]
    digests = {}
    for vid, txt in pairs:
        digests[vid] = await _hash_voice(vid, txt)
        print(vid, digests[vid])
    zh_ok = digests["zh-CN-XiaoxiaoNeural"] != digests["zh-CN-YunxiNeural"]
    en_ok = digests["en-US-JennyNeural"] != digests["en-US-GuyNeural"]
    print("zh distinct:", zh_ok, "en distinct:", en_ok)
    if not (zh_ok and en_ok):
        sys.exit(1)
    print("edge-tts voices OK, version:", edge_tts.__version__)


if __name__ == "__main__":
    asyncio.run(main())
