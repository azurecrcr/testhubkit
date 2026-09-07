"""JMeter smoke run API."""

from __future__ import annotations

from flask import Blueprint, Response, jsonify, request

from core.services.auth.auth_session import require_login_api
from core.services.jmeter_scenario.jmeter_run_guard import JmeterRunBusyError
from core.services.jmeter_scenario.jmx_smoke_run_service import (
    get_smoke_failure_log,
    run_smoke_jmx,
)


def register_routes(bp: Blueprint) -> None:
    @bp.post("/jmeter-scenario/smoke-run")
    @require_login_api
    def jmeter_scenario_smoke_run():
        data = request.get_json(silent=True) or {}
        jmx = data.get("jmx")
        if jmx is None or not str(jmx).strip():
            return jsonify({"ok": False, "error": "缺少 jmx 字段"}), 400
        slug = str(data.get("scenario_slug") or "scenario").strip() or "scenario"
        skip_validate = data.get("skip_validate")
        if skip_validate is None:
            skip_validate = True
        else:
            skip_validate = bool(skip_validate)
        try:
            result = run_smoke_jmx(str(jmx), scenario_slug=slug, skip_validate=skip_validate)
        except JmeterRunBusyError as exc:
            return jsonify({"ok": False, "error": str(exc), "code": "JMETER_BUSY"}), 409
        except OSError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

        body = {"ok": True, **result.to_dict()}
        if result.run_id:
            body["failure_log_url"] = f"/api/jmeter-scenario/smoke-run/{result.run_id}/failure-log"
        return jsonify(body)

    @bp.get("/jmeter-scenario/smoke-run/<run_id>/failure-log")
    @require_login_api
    def jmeter_scenario_smoke_failure_log(run_id: str):
        log_text = get_smoke_failure_log((run_id or "").strip())
        if log_text is None:
            return jsonify({"ok": False, "error": "日志已过期或不存在"}), 404
        filename = f"jmeter-smoke-failures-{run_id[:8]}.log"
        return Response(
            log_text,
            mimetype="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


