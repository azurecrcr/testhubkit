"""仅保留 table-to-mindmap 路由（工作台思维导图使用）"""

from __future__ import annotations

from typing import Any

import json

from flask import Blueprint, Response, jsonify, request, stream_with_context

from core.config.user_ai_credentials import (
    UserAiConfigRequired,
    resolve_text_ai_credentials,
    user_ai_config_error_response,
)
from core.services.auth.auth_session import get_current_user_id




def _parse_ai_temperature(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return float(text)


def _resolve_ai_table_to_mindmap_request(data: dict):
    columns = data.get("columns")
    rows = data.get("rows")
    root_topic = (data.get("root_topic") or "测试用例").strip() or "测试用例"
    use_builtin = bool(data.get("use_builtin"))

    if not isinstance(columns, list) or not columns:
        return None, ({"error": "缺少表头 columns"}, 400)
    if not isinstance(rows, list):
        return None, ({"error": "缺少用例 rows"}, 400)

    quota_meta = None
    if use_builtin:
        try:
            ai_cfg = resolve_text_ai_credentials(data, get_current_user_id())
            from core.services.ai.user_ai_daily_quota_service import pop_quota_meta
            quota_meta = pop_quota_meta(ai_cfg)
        except UserAiConfigRequired as exc:
            body, code = user_ai_config_error_response(exc)
            return None, (body, code)
        base_url = ai_cfg["base_url"]
        api_key = ai_cfg["api_key"]
        model = ai_cfg["model"]
        temperature_raw = ai_cfg.get("temperature")
    else:
        base_url = data.get("base_url")
        api_key = data.get("api_key")
        model = data.get("model")
        temperature_raw = data.get("temperature")

    if not base_url:
        return None, ({"error": "请输入 AI BASE URL"}, 400)
    if not api_key:
        return None, ({"error": "请输入 AI API KEY"}, 400)
    if not model:
        return None, ({"error": "请输入 AI MODEL"}, 400)

    try:
        temperature = _parse_ai_temperature(temperature_raw)
    except ValueError:
        return None, ({"error": "AI TEMPERATURE 必须是数字"}, 400)

    return {
        "base_url": str(base_url),
        "api_key": str(api_key),
        "model": str(model),
        "columns": columns,
        "rows": rows,
        "root_topic": root_topic,
        "temperature": temperature,
        "_quota_meta": quota_meta,
    }, None



def _make_ai_table_to_mindmap_cancel_checker():
    """AI 转导图流式接口专用：检测客户端断开/取消。"""
    state = {"cancelled": False}

    def should_cancel() -> bool:
        if state["cancelled"]:
            return True
        try:
            if getattr(request, "is_disconnected", False):
                state["cancelled"] = True
                return True
        except Exception:
            state["cancelled"] = True
            return True
        return False

    def mark_cancelled() -> None:
        state["cancelled"] = True

    return should_cancel, mark_cancelled

def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/table-to-mindmap", methods=["POST"])
    def test_cases_table_to_mindmap():
        try:
            from core.services.test_cases.case_to_mindmap_service import (
                convert_table_to_mindmap,
            )

            data = request.get_json(silent=True) or {}
            columns = data.get("columns")
            rows = data.get("rows")
            root_topic = (data.get("root_topic") or "测试用例").strip() or "测试用例"

            if not isinstance(columns, list) or not columns:
                return jsonify({"error": "缺少表头 columns"}), 400
            if not isinstance(rows, list):
                return jsonify({"error": "缺少用例 rows"}), 400

            columns = [str(c) for c in columns]
            normalized_rows: list[list[Any]] = []
            for row in rows:
                if isinstance(row, (list, tuple)):
                    normalized_rows.append([str(v) if v is not None else "" for v in row])
                else:
                    return jsonify({"error": "rows 须为二维数组"}), 400

            result = convert_table_to_mindmap(columns, normalized_rows, root_topic=root_topic)
            return jsonify(
                {
                    "error": None,
                    "field_map": result.get("field_map"),
                    "stats": result.get("stats"),
                    "mind": result.get("mind"),
                }
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": f"转换失败：{exc}"}), 500
    @bp.route("/test-cases/ai-table-to-mindmap", methods=["POST"])
    def test_cases_ai_table_to_mindmap():
        try:
            from core.services.test_cases.ai_table_to_mindmap_service import (
                run_ai_table_to_mindmap,
            )

            data = request.get_json(silent=True) or {}
            resolved, err = _resolve_ai_table_to_mindmap_request(data)
            if err:
                body, code = err
                return jsonify(body), code

            result = run_ai_table_to_mindmap(
                base_url=resolved["base_url"],
                api_key=resolved["api_key"],
                model=resolved["model"],
                columns=resolved["columns"],
                rows=resolved["rows"],
                temperature=resolved.get("temperature"),
                root_topic=resolved.get("root_topic") or "测试用例",
            )
            payload = {
                    "error": None,
                    "summary": result.get("summary"),
                    "mindmap_text": result.get("mindmap_text"),
                    "stats": result.get("stats"),
                }
            if resolved.get("_quota_meta"):
                payload["ai_quota"] = resolved["_quota_meta"]
            return jsonify(payload)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": f"AI 转换失败：{exc}"}), 500

    @bp.route("/test-cases/ai-table-to-mindmap/stream", methods=["POST"])
    def test_cases_ai_table_to_mindmap_stream():
        try:
            from core.services.test_cases.ai_table_to_mindmap_service import (
                iter_ai_table_to_mindmap_stream_events,
            )

            data = request.get_json(silent=True) or {}
            resolved, err = _resolve_ai_table_to_mindmap_request(data)
            if err:
                body, code = err
                return jsonify(body), code

            should_cancel, mark_cancelled = _make_ai_table_to_mindmap_cancel_checker()

            def generate():
                quota_meta = resolved.get("_quota_meta")
                if quota_meta:
                    yield f"data: {json.dumps({'type': 'ai_quota', 'ai_quota': quota_meta}, ensure_ascii=False)}\n\n"
                try:
                    for event in iter_ai_table_to_mindmap_stream_events(
                        base_url=str(resolved["base_url"]),
                        api_key=str(resolved["api_key"]),
                        model=str(resolved["model"]),
                        columns=resolved["columns"],
                        rows=resolved["rows"],
                        temperature=resolved.get("temperature"),
                        root_topic=resolved.get("root_topic") or "测试用例",
                        should_cancel=should_cancel,
                    ):
                        if should_cancel():
                            mark_cancelled()
                            yield f"data: {json.dumps({'type': 'cancelled', 'error': '已取消转换'}, ensure_ascii=False)}\n\n"
                            break
                        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                        if event.get("type") == "cancelled":
                            break
                except GeneratorExit:
                    mark_cancelled()
                    raise
                finally:
                    yield f"data: {json.dumps({'type': 'stream_end'}, ensure_ascii=False)}\n\n"

            return Response(
                stream_with_context(generate()),
                mimetype="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",
                },
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": f"AI 转换失败：{exc}"}), 500

