from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.test_cases.share_service import (
    ShareGoneError,
    ShareNotFoundError,
    ShareRateLimitError,
    SHARE_MAX_PER_USER,
    add_comment,
    create_share,
    delete_share,
    get_owned_share_comments_context,
    get_public_snapshot,
    list_comments_public,
    list_user_shares,
    revoke_share,
)


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return (request.remote_addr or "unknown")[:45]


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/shares", methods=["POST"])
    @require_login_api
    def tc_shares_create():
        user_id = get_current_user_id()
        data = request.get_json(silent=True) or {}
        title = data.get("title")
        payload = data.get("payload")
        expires_days = data.get("expires_days")
        comment_enabled = data.get("comment_enabled", True)
        try:
            doc = create_share(
                user_id,
                title=title if isinstance(title, str) else "",
                payload=payload if isinstance(payload, dict) else {},
                expires_days=expires_days,
                comment_enabled=bool(comment_enabled),
            )
            share_url = request.host_url.rstrip("/") + "/share/tc/" + doc["token"]
            return jsonify({"error": None, "share": doc, "url": share_url})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/shares", methods=["GET"])
    @require_login_api
    def tc_shares_list():
        user_id = get_current_user_id()
        items = list_user_shares(user_id)
        count = len(items)
        return jsonify({
            "error": None,
            "items": items,
            "count": count,
            "limit": SHARE_MAX_PER_USER,
            "limit_reached": count >= SHARE_MAX_PER_USER,
        })

    @bp.route("/test-cases/shares/<share_id>", methods=["DELETE"])
    @require_login_api
    def tc_shares_revoke(share_id: str):
        user_id = get_current_user_id()
        purge = request.args.get("purge") in ("1", "true", "yes")
        if purge:
            deleted = delete_share(user_id, share_id)
            if not deleted:
                return jsonify({"error": "分享不存在或已删除"}), 404
            return jsonify({"error": None, "deleted": True})
        revoked = revoke_share(user_id, share_id)
        if not revoked:
            return jsonify({"error": "分享不存在或已作废"}), 404
        return jsonify({"error": None, "revoked": True})

    @bp.route("/test-cases/shares/<share_id>/comments", methods=["GET"])
    @require_login_api
    def tc_shares_comments_owned(share_id: str):
        user_id = get_current_user_id()
        try:
            ctx = get_owned_share_comments_context(user_id, share_id)
            return jsonify({
                "error": None,
                "comments": ctx["comments"],
                "columns": ctx["columns"],
                "rows": ctx["rows"],
            })
        except ShareNotFoundError as exc:
            return jsonify({"error": str(exc)}), 404

    @bp.route("/test-cases/shares/by-token/<token>", methods=["GET"])
    def tc_shares_public_snapshot(token: str):
        try:
            snap = get_public_snapshot(token)
            return jsonify({"error": None, "snapshot": snap})
        except ShareGoneError as exc:
            return jsonify({"error": str(exc), "code": "SHARE_GONE"}), 410
        except ShareNotFoundError as exc:
            return jsonify({"error": str(exc)}), 404

    @bp.route("/test-cases/shares/by-token/<token>/comments", methods=["GET"])
    def tc_shares_public_comments(token: str):
        try:
            comments = list_comments_public(token)
            return jsonify({"error": None, "comments": comments})
        except ShareGoneError as exc:
            return jsonify({"error": str(exc), "code": "SHARE_GONE"}), 410
        except ShareNotFoundError as exc:
            return jsonify({"error": str(exc)}), 404

    @bp.route("/test-cases/shares/by-token/<token>/comments", methods=["POST"])
    def tc_shares_public_comment_create(token: str):
        data = request.get_json(silent=True) or {}
        author_name = data.get("author_name")
        content = data.get("content")
        row_index = data.get("row_index")
        user_id = get_current_user_id()
        try:
            comment = add_comment(
                token,
                author_name=author_name if isinstance(author_name, str) else "",
                content=content if isinstance(content, str) else "",
                row_index=row_index,
                user_id=user_id,
                client_ip=_client_ip(),
            )
            return jsonify({"error": None, "comment": comment})
        except ShareGoneError as exc:
            return jsonify({"error": str(exc), "code": "SHARE_GONE"}), 410
        except ShareNotFoundError as exc:
            return jsonify({"error": str(exc)}), 404
        except ShareRateLimitError as exc:
            return jsonify({"error": str(exc), "code": "RATE_LIMIT"}), 429
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
