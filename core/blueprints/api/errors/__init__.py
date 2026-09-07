"""API 蓝图统一错误响应（JSON）。"""

from __future__ import annotations

from flask import Blueprint, jsonify, request
from werkzeug.exceptions import HTTPException


def register_error_handlers(bp: Blueprint) -> None:
    @bp.errorhandler(HTTPException)
    def handle_http_exception(exc: HTTPException):
        code = exc.code or 500
        body = {
            "error": exc.description or exc.name or str(exc),
            "path": request.path,
        }
        return jsonify(body), code
