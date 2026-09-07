"""多媒体相关 API：图片与音频路由。"""

from __future__ import annotations

from flask import Blueprint

from . import audio, format_converter, image_sizer


def register_routes(bp: Blueprint) -> None:
    image_sizer.register_routes(bp)
    audio.register_routes(bp)
    format_converter.register_routes(bp)
