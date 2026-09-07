from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.test_cases.lanhu_page_cache_db import (
    list_page_cache_for_doc,
    upsert_page_cache,
)
from core.services.test_cases.user_lanhu_doc_quota_service import get_user_lanhu_doc_quota
from core.services.test_cases.user_lanhu_docs_db import (
    _DUPLICATE_MSG,
    create_user_lanhu_doc,
    delete_user_lanhu_doc,
    import_user_lanhu_docs,
    list_user_lanhu_docs,
    update_user_lanhu_doc,
    upsert_user_lanhu_doc_by_url,
)
from core.services.test_cases.user_lanhu_config_db import (
    get_user_lanhu_config,
    save_user_lanhu_config,
)
from core.services.test_cases.user_lanhu_config_gate import (
    activate_lanhu_doc_for_tree,
    get_effective_user_lanhu_config,
    sync_lanhu_tree_session_from_credentials,
)
from core.services.test_cases.lanhu_requirement_service import (
    fetch_lanhu_page_content,
    fetch_lanhu_requirements_result,
    fetch_lanhu_sitemap_tree,
)



from core.services.test_cases.lanhu_doc_url_validator import INVALID_LANHU_DOC_URL_MSG
from core.services.test_cases.user_lanhu_doc_quota_service import DOC_QUOTA_EXCEEDED_MSG


def _lanhu_doc_value_error_response(exc: ValueError):
    msg = str(exc)
    code = None
    if msg == _DUPLICATE_MSG:
        code = "lanhu_doc_duplicate"
    elif msg == DOC_QUOTA_EXCEEDED_MSG:
        code = "lanhu_doc_quota_exceeded"
    elif msg == INVALID_LANHU_DOC_URL_MSG:
        code = "lanhu_doc_invalid_url"
    payload = {"ok": False, "error": msg}
    if code:
        payload["code"] = code
    return jsonify(payload), 400


def _find_page_name(tree: list | None, page_id: str) -> str:
    if not tree or not page_id:
        return ""

    def walk(nodes: list) -> str:
        for node in nodes or []:
            if node.get("type") == "page" and str(node.get("id") or "") == page_id:
                return str(node.get("name") or "")
            found = walk(node.get("children") or [])
            if found:
                return found
        return ""

    return walk(tree)


def register_routes(bp: Blueprint) -> None:
    @bp.route("/lanhu-requirements", methods=["POST"])
    def lanhu_requirements():
        try:
            data = request.json or {}
            cookie = (data.get("lanhu_cookie") or data.get("cookie") or "").strip()
            url = (data.get("lanhu_url") or data.get("url") or "").strip()
            page_id = (data.get("page_id") or data.get("pageId") or "").strip() or None
            result = fetch_lanhu_requirements_result(cookie, url, page_id=page_id)
            return jsonify({
                "summary": result.get("summary"),
                "page_text_chars": result.get("page_text_chars") or 0,
                "use_module_pipeline": bool(result.get("use_module_pipeline")),
                "error": None,
            })
        except ValueError as exc:
            return jsonify({"summary": None, "error": str(exc)})
        except Exception as exc:
            return jsonify({"summary": None, "error": str(exc)})

    @bp.route("/lanhu-sitemap-tree", methods=["POST"])
    def lanhu_sitemap_tree():
        try:
            data = request.json or {}
            cookie = (data.get("lanhu_cookie") or data.get("cookie") or "").strip()
            url = (data.get("lanhu_url") or data.get("url") or "").strip()
            result = fetch_lanhu_sitemap_tree(cookie, url)
            return jsonify({**result, "error": None})
        except ValueError as exc:
            return jsonify({"tree": None, "error": str(exc)})
        except Exception as exc:
            return jsonify({"tree": None, "error": str(exc)})

    @bp.route("/lanhu-page-chars", methods=["POST"])
    def lanhu_page_chars():
        try:
            data = request.json or {}
            cookie = (data.get("lanhu_cookie") or data.get("cookie") or "").strip()
            url = (data.get("lanhu_url") or data.get("url") or "").strip()
            page_id = (data.get("page_id") or "").strip()
            doc_id = (data.get("doc_id") or "").strip()
            page_name = (data.get("page_name") or "").strip()
            if not page_id:
                return jsonify({"page_text_chars": 0, "page_text": "", "error": "缺少 page_id"})
            result = fetch_lanhu_page_content(cookie, url, page_id)
            page_text = str(result.get("page_text") or "")
            page_chars = int(result.get("page_text_chars") or 0)
            user_id = get_current_user_id()
            if user_id and doc_id:
                upsert_page_cache(
                    user_id=user_id,
                    doc_id=doc_id,
                    page_id=page_id,
                    page_name=page_name or None,
                    lanhu_url=url,
                    content_text=page_text,
                    content_chars=page_chars,
                )
            return jsonify({
                "page_text_chars": page_chars,
                "page_text": page_text,
                "error": None,
                "persisted": bool(user_id and doc_id),
            })
        except ValueError as exc:
            return jsonify({"page_text_chars": 0, "page_text": "", "error": str(exc)})
        except Exception as exc:
            return jsonify({"page_text_chars": 0, "page_text": "", "error": str(exc)})


    @bp.route("/user-lanhu-config", methods=["GET"])
    @require_login_api
    def user_lanhu_config_get():
        user_id = get_current_user_id()
        config = get_effective_user_lanhu_config(user_id or "")
        return jsonify({"ok": True, **config})

    @bp.route("/user-lanhu-config", methods=["POST"])
    @require_login_api
    def user_lanhu_config_post():
        user_id = get_current_user_id()
        data = request.get_json(silent=True) or {}
        try:
            saved = save_user_lanhu_config(user_id or "", data)
            cookie = str(saved.get("lanhu_cookie") or "").strip()
            url = str(saved.get("lanhu_url") or "").strip()
            if cookie and url:
                sync_lanhu_tree_session_from_credentials(
                    user_id or "",
                    cookie,
                    url,
                    name=str(data.get("name") or data.get("doc_name") or "").strip(),
                )
                saved = get_effective_user_lanhu_config(user_id or "")
            return jsonify({"ok": True, **saved})
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

    @bp.route("/lanhu-page-cache", methods=["POST"])
    def lanhu_page_cache_list():
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({"items": [], "error": None, "persisted": False})
        try:
            data = request.json or {}
            doc_id = (data.get("doc_id") or "").strip()
            if not doc_id:
                return jsonify({"items": [], "error": "缺少 doc_id", "persisted": False})
            items = list_page_cache_for_doc(user_id, doc_id)
            return jsonify({"items": items, "error": None, "persisted": True})
        except Exception as exc:
            return jsonify({"items": [], "error": str(exc), "persisted": False})

    @bp.route("/user-lanhu-docs", methods=["GET"])
    @require_login_api
    def user_lanhu_docs_list():
        user_id = get_current_user_id()
        docs = list_user_lanhu_docs(user_id or "")
        quota = get_user_lanhu_doc_quota(user_id or "")
        return jsonify({"ok": True, "docs": docs, "quota": quota})

    @bp.route("/user-lanhu-docs", methods=["POST"])
    @require_login_api
    def user_lanhu_docs_create():
        user_id = get_current_user_id()
        data = request.get_json(silent=True) or {}
        try:
            doc = create_user_lanhu_doc(user_id or "", data)
            activate_lanhu_doc_for_tree(user_id or "", str(doc.get("id") or ""))
            return jsonify({"ok": True, "doc": doc})
        except ValueError as exc:
            return _lanhu_doc_value_error_response(exc)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

    @bp.route("/user-lanhu-docs/import-local", methods=["POST"])
    @require_login_api
    def user_lanhu_docs_import_local():
        user_id = get_current_user_id()
        data = request.get_json(silent=True) or {}
        docs = data.get("docs") or []
        try:
            items = import_user_lanhu_docs(user_id or "", docs)
            return jsonify({"ok": True, "docs": items})
        except ValueError as exc:
            return _lanhu_doc_value_error_response(exc)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

    @bp.route("/user-lanhu-docs/upsert", methods=["POST"])
    @require_login_api
    def user_lanhu_docs_upsert():
        user_id = get_current_user_id()
        data = request.get_json(silent=True) or {}
        try:
            doc = upsert_user_lanhu_doc_by_url(user_id or "", data)
            activate_lanhu_doc_for_tree(user_id or "", str(doc.get("id") or ""))
            return jsonify({"ok": True, "doc": doc})
        except ValueError as exc:
            return _lanhu_doc_value_error_response(exc)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

    @bp.route("/user-lanhu-docs/<doc_id>", methods=["PATCH"])
    @require_login_api
    def user_lanhu_docs_update(doc_id: str):
        user_id = get_current_user_id()
        data = request.get_json(silent=True) or {}
        try:
            doc = update_user_lanhu_doc(user_id or "", doc_id, data)
            activate_lanhu_doc_for_tree(user_id or "", str(doc.get("id") or doc_id))
            return jsonify({"ok": True, "doc": doc})
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 404
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

    @bp.route("/user-lanhu-docs/<doc_id>", methods=["DELETE"])
    @require_login_api
    def user_lanhu_docs_delete(doc_id: str):
        user_id = get_current_user_id()
        result = delete_user_lanhu_doc(user_id or "", doc_id)
        if not result.get("deleted"):
            return jsonify({"ok": False, "error": "文档不存在"}), 404
        return jsonify({"ok": True, "purged": result.get("purged") or {}})
