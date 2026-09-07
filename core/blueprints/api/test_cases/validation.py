"""用例二次校验 API。"""
from __future__ import annotations

import json

from flask import Blueprint, Response, jsonify, request, stream_with_context

from core.services.auth.auth_session import get_current_user_id
from core.services.test_cases import validation_service


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/validate", methods=["POST"])
    def validate_test_cases():
        try:
            data = request.json or {}
            columns = data.get("columns") or []
            rows = data.get("rows") or []
            if not isinstance(columns, list) or not isinstance(rows, list):
                return jsonify({"error": "columns / rows 格式不正确"}), 400
            use_llm = bool(data.get("use_llm", True))
            format_check = bool(data.get("format_check", True))
            use_builtin = bool(data.get("use_builtin", True))
            result = validation_service.run_validation(
                user_id=get_current_user_id(),
                batch_id=str(data.get("batch_id") or "").strip() or None,
                requirements=str(data.get("requirements") or "").strip(),
                columns=[str(c) for c in columns],
                rows=[[str(c) for c in row] for row in rows if isinstance(row, list)],
                use_llm=use_llm,
                format_check=format_check,
                use_builtin=use_builtin,
                base_url=str(data.get("base_url") or "").strip(),
                api_key=str(data.get("api_key") or "").strip(),
                model=str(data.get("model") or "").strip(),
                llm_scope_hint=str(data.get("llm_scope_hint") or "").strip(),
                user_content=str(data.get("user_content") or "").strip(),
                required_profile=str(data.get("required_profile") or "default").strip(),
                template_id=str(data.get("template_id") or "").strip() or None,
                ai_output_text=str(data.get("ai_output_text") or "").strip(),
                mindmap_nodes=data.get("mindmap_nodes")
                if isinstance(data.get("mindmap_nodes"), list)
                else [],
            )
            return jsonify(result)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/validate/llm-stream", methods=["POST"])
    def validate_test_cases_llm_stream():
        try:
            data = request.json or {}
            columns = data.get("columns") or []
            rows = data.get("rows") or []
            if not isinstance(columns, list) or not isinstance(rows, list):
                return jsonify({"error": "columns / rows 格式不正确"}), 400

            def generate():
                for event in validation_service.iter_llm_validation_stream_events(
                    user_id=get_current_user_id(),
                    batch_id=str(data.get("batch_id") or "").strip() or None,
                    requirements=str(data.get("requirements") or "").strip(),
                    columns=[str(c) for c in columns],
                    rows=[[str(c) for c in row] for row in rows if isinstance(row, list)],
                    use_builtin=bool(data.get("use_builtin", True)),
                    base_url=str(data.get("base_url") or "").strip(),
                    api_key=str(data.get("api_key") or "").strip(),
                    model=str(data.get("model") or "").strip(),
                    scope_hint=str(data.get("llm_scope_hint") or "").strip(),
                    user_content=str(data.get("user_content") or "").strip(),
                    validation_context=str(data.get("validation_context") or "").strip(),
                    rag_context=str(data.get("rag_context") or "").strip(),
                ):
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'stream_end'}, ensure_ascii=False)}\n\n"

            return Response(
                stream_with_context(generate()),
                mimetype="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",
                },
            )
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/validate/<run_id>/dismiss", methods=["POST"])
    def dismiss_validation_issue(run_id: str):
        try:
            data = request.json or {}
            issue_index = int(data.get("issue_index", 0))
            validation_service.dismiss_issue(run_id, issue_index)
            return jsonify({"ok": True})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400
