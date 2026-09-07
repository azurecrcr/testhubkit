"""用例生成采纳率 API。"""
from __future__ import annotations

from flask import Blueprint, jsonify, request, session

from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.test_cases import adoption_service


def _session_key() -> str:
    if "tc_adoption_session" not in session:
        import uuid

        session["tc_adoption_session"] = uuid.uuid4().hex
        session.modified = True
    return str(session.get("tc_adoption_session") or "")


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/generation-batches", methods=["POST"])
    def create_generation_batch():
        try:
            data = request.json or {}
            user_id = get_current_user_id()
            batch = adoption_service.create_batch(
                user_id=user_id,
                session_key=_session_key() if not user_id else None,
                mode=str(data.get("mode") or "list"),
                ai_mode=str(data.get("ai_mode") or "preset"),
                rag_used=bool(data.get("rag_used")),
                row_count=int(data.get("row_count") or 0),
            )
            return jsonify(batch)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/generation-batches/<batch_id>", methods=["GET"])
    def get_generation_batch(batch_id: str):
        try:
            return jsonify(adoption_service.get_batch_stats(batch_id))
        except LookupError:
            return jsonify({"error": "批次不存在"}), 404
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/generation-batches/<batch_id>/feedback", methods=["POST"])
    def post_generation_feedback(batch_id: str):
        try:
            data = request.json or {}
            action = str(data.get("action") or "").strip()
            row_index = data.get("row_index")
            if row_index is None:
                return jsonify({"error": "缺少 row_index"}), 400
            stats = adoption_service.upsert_feedback(batch_id, int(row_index), action)
            return jsonify(stats)
        except LookupError:
            return jsonify({"error": "批次不存在"}), 404
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/generation-batches/<batch_id>/accept-all", methods=["POST"])
    def accept_all_batch(batch_id: str):
        try:
            return jsonify(adoption_service.batch_accept_all(batch_id))
        except LookupError:
            return jsonify({"error": "批次不存在"}), 404
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/generation-batches/<batch_id>/reject-all", methods=["POST"])
    def reject_all_batch(batch_id: str):
        try:
            return jsonify(adoption_service.batch_reject_all(batch_id))
        except LookupError:
            return jsonify({"error": "批次不存在"}), 404
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/generation-batches/<batch_id>/close", methods=["POST"])
    def close_generation_batch(batch_id: str):
        try:
            adoption_service.close_batch(batch_id)
            return jsonify({"ok": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/adoption-stats/import", methods=["POST"])
    @require_login_api
    def import_adoption_stats():
        try:
            data = request.json or {}
            batches = data.get("batches")
            if not isinstance(batches, list):
                return jsonify({"error": "batches 须为数组"}), 400
            user_id = get_current_user_id()
            return jsonify(adoption_service.import_user_batch_summaries(user_id, batches))
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/adoption-stats", methods=["GET"])
    @require_login_api
    def adoption_stats():
        try:
            days = int(request.args.get("days") or adoption_service.TC_STATS_DISPLAY_DAYS)
            page = int(request.args.get("page") or 1)
            page_size = int(request.args.get("page_size") or adoption_service.TC_STATS_PAGE_SIZE)
            user_id = get_current_user_id()
            return jsonify(
                adoption_service.list_user_stats(
                    user_id,
                    days=days,
                    page=page,
                    page_size=page_size,
                )
            )
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400
