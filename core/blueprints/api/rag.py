from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.config.user_ai_credentials import (
    UserAiConfigRequired,
    resolve_text_ai_credentials,
    user_ai_config_error_response,
)
from core.services.auth.admin_guard import require_admin_api, user_can_use_public_rag
from core.services.auth.auth_session import get_current_user_id
from core.services.auth.user_service import get_user_by_id
from core.services.auth.prompt_visibility_admin import is_site_manager
from core.services.rag import config as rag_config
from core.services.rag.rag_admin_db import (
    admin_rag_auto_unlock_enabled,
    get_rag_admin_settings_row,
    update_rag_admin_settings,
)
from core.services.rag.service import (
    format_retrieval_context,
    get_rag_last_ingest_at,
    retrieve_legacy_requirements,
    serialize_retrieved_chunks,
)
from core.services.rag.status_snapshot import get_rag_status_for_api
from core.services.rag.summarize import summarize_lanhu_for_rag_query


def _parse_temperature(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return float(text)


def register_routes(bp: Blueprint) -> None:
    @bp.route("/rag/status", methods=["GET"])
    def rag_status():
        stack_on = rag_config.context_stack_enabled()
        can_public = user_can_use_public_rag() if stack_on else False
        # 轻量快照：避免首屏/并发打开 Chroma 拖垮 sync worker（检索仍走原 service）
        snap = get_rag_status_for_api()
        return jsonify(
            {
                "enabled": rag_config.rag_enabled(),
                "available": bool(snap.get("available")),
                "knowledge_dir": str(rag_config.knowledge_dir()),
                "collection": rag_config.collection_name(),
                "chunk_count": int(snap.get("chunk_count") or 0),
                "last_ingest_at": snap.get("last_ingest_at") or get_rag_last_ingest_at(),
                "context_stack_enabled": stack_on,
                "user_can_use_public_rag": can_public,
                "admin_rag_no_password": admin_rag_auto_unlock_enabled(),
                "error": None,
            }
        )

    @bp.route("/rag/retrieve", methods=["POST"])
    @require_admin_api
    def rag_retrieve():
        if not rag_config.rag_enabled():
            return jsonify(
                {
                    "context": "",
                    "sources": [],
                    "chunks": [],
                    "available": False,
                    "error": None,
                }
            )
        try:
            data = request.json or {}
            query = str(data.get("query") or "").strip()
            if not query:
                return jsonify({"error": "缺少 query 参数"}), 400
            top_k = data.get("top_k")
            try:
                top_k_int = int(top_k) if top_k is not None else None
            except (TypeError, ValueError):
                top_k_int = None

            include_public_raw = data.get("include_public")
            include_public = True if include_public_raw is None else bool(include_public_raw)
            if not include_public:
                return jsonify(
                    {
                        "context": "",
                        "sources": [],
                        "chunks": [],
                        "available": True,
                        "error": None,
                    }
                )

            if not is_rag_available():
                return jsonify(
                    {
                        "context": "",
                        "sources": [],
                        "chunks": [],
                        "available": False,
                        "error": "知识库未就绪，请先导入文档",
                    }
                )

            chunks = retrieve_legacy_requirements(query, top_k=top_k_int)
            context = format_retrieval_context(chunks)
            sources = sorted({c.source for c in chunks if c.source})
            serialized = serialize_retrieved_chunks(chunks)
            return jsonify(
                {
                    "context": context,
                    "sources": sources,
                    "chunks": serialized,
                    "query": query,
                    "available": True,
                    "error": None,
                }
            )
        except Exception as exc:
            return jsonify(
                {
                    "context": "",
                    "sources": [],
                    "chunks": [],
                    "available": False,
                    "error": str(exc),
                }
            )

    @bp.route("/rag/summarize-query", methods=["POST"])
    def rag_summarize_query():
        """将蓝湖需求摘要提炼为一句 RAG 检索 query（供用例生成链路调用）。"""
        try:
            data = request.json or {}
            text = str(data.get("text") or "").strip()
            if not text:
                return jsonify({"query": "", "error": None})

            use_builtin = bool(data.get("use_builtin"))
            try:
                ai_cfg = resolve_text_ai_credentials(data, get_current_user_id())
            except UserAiConfigRequired as exc:
                body, code = user_ai_config_error_response(exc)
                return jsonify({"query": "", **body}), code
            base_url = str(ai_cfg.get("base_url") or "")
            api_key = str(ai_cfg.get("api_key") or "")
            model = str(ai_cfg.get("model") or "")
            temperature_raw = ai_cfg.get("temperature")

            if not base_url or not api_key or not model:
                return jsonify({"query": "", "error": "缺少 AI 配置"})

            try:
                temperature = _parse_temperature(temperature_raw)
            except ValueError:
                return jsonify({"query": "", "error": "AI TEMPERATURE 必须是数字"})

            query = summarize_lanhu_for_rag_query(
                text, base_url, api_key, model, temperature=temperature
            )
            return jsonify({"query": query, "error": None})
        except Exception as exc:
            return jsonify({"query": "", "error": str(exc)})

    @bp.route("/rag/admin-settings", methods=["GET"])
    def rag_admin_settings_get():
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录", "code": "AUTH_REQUIRED"}), 401
        user = get_user_by_id(uid)
        if not user or not is_site_manager(user):
            return jsonify({"error": "无权操作", "code": "ADMIN_REQUIRED"}), 403
        row = get_rag_admin_settings_row()
        return jsonify(
            {
                "public_rag_enabled": rag_config.rag_enabled(),
                "auto_enable_for_admin": row.get("auto_enable_for_admin", True),
                "default_token_budget": row.get("default_token_budget"),
                "chunk_count": get_rag_chunk_count(),
                "last_ingest_at": get_rag_last_ingest_at(),
                "updated_at": row.get("updated_at"),
                "updated_by": row.get("updated_by"),
            }
        )

    @bp.route("/rag/admin-settings", methods=["PUT"])
    def rag_admin_settings_put():
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录", "code": "AUTH_REQUIRED"}), 401
        user = get_user_by_id(uid)
        if not user or not is_site_manager(user):
            return jsonify({"error": "无权操作", "code": "ADMIN_REQUIRED"}), 403
        data = request.get_json(silent=True) or {}
        row = update_rag_admin_settings(
            auto_enable_for_admin=data.get("auto_enable_for_admin")
            if "auto_enable_for_admin" in data
            else None,
            default_token_budget=data.get("default_token_budget")
            if "default_token_budget" in data
            else None,
            updated_by=str(user.get("email") or ""),
        )
        return jsonify(
            {
                "public_rag_enabled": rag_config.rag_enabled(),
                "auto_enable_for_admin": row.get("auto_enable_for_admin", True),
                "default_token_budget": row.get("default_token_budget"),
                "chunk_count": get_rag_chunk_count(),
                "last_ingest_at": get_rag_last_ingest_at(),
                "updated_at": row.get("updated_at"),
                "updated_by": row.get("updated_by"),
            }
        )
