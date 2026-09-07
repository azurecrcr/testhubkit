"""JSON / Base64 等文本工具 API。"""

from __future__ import annotations

from flask import Blueprint

from . import base64_converter, json_formatter


def register_routes(bp: Blueprint) -> None:
    json_formatter.register_routes(bp)
    base64_converter.register_routes(bp)
