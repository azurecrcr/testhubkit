"""Agent 多步生成任务 API。"""
from __future__ import annotations

import json
import time

from flask import Blueprint, Response, jsonify, request, stream_with_context

from core.services.auth.auth_session import get_current_user_id
from core.services.test_cases import agent_orchestrator_service as agent_svc
from core.schemas.test_cases.agent_job import validate_agent_job_payload
from core.services.test_cases.agent_job_db import ensure_agent_job_tables, get_job
from core.services.test_cases.generation_guard import (
    GenerationRateLimitError,
    assert_generation_allowed,
)


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/agent-jobs", methods=["POST"])
    def create_agent_job():
        try:
            ensure_agent_job_tables()
            data = validate_agent_job_payload(request.json)
            user_id = get_current_user_id()
            prompt = str(data.get("user_intent") or data.get("prompt") or "").strip()
            mode = str(data.get("mode") or "").strip()
            try:
                assert_generation_allowed(
                    request=request,
                    user_id=user_id,
                    action="agent_job",
                    prompt=prompt,
                    mode=mode,
                    check_agent_concurrency=True,
                )
            except GenerationRateLimitError as exc:
                resp = jsonify({"error": str(exc)})
                resp.status_code = 429
                resp.headers["Retry-After"] = str(exc.retry_after_sec)
                return resp
            job = agent_svc.create_agent_job(data, user_id)
            return jsonify(job)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/agent-jobs/<job_id>", methods=["GET"])
    def get_agent_job(job_id: str):
        ensure_agent_job_tables()
        job = get_job(job_id)
        if not job:
            return jsonify({"error": "任务不存在"}), 404
        return jsonify(job)

    @bp.route("/test-cases/agent-jobs/<job_id>/stream", methods=["GET"])
    def stream_agent_job(job_id: str):
        ensure_agent_job_tables()

        def generate():
            last_payload = None
            idle = 0
            max_idle = 120
            # 限制 SSE 占用 worker 时长，避免 gunicorn worker timeout 杀死同进程内的 Agent 线程
            stream_started = time.time()
            max_stream_seconds = 90
            while idle < max_idle:
                if time.time() - stream_started >= max_stream_seconds:
                    break
                job = get_job(job_id)
                if not job:
                    yield f"data: {json.dumps({'type': 'error', 'message': '任务不存在'}, ensure_ascii=False)}\n\n"
                    break
                payload = agent_svc.job_to_stream_payload(job)
                blob = json.dumps(payload, ensure_ascii=False, default=str)
                if blob != last_payload:
                    yield f"data: {blob}\n\n"
                    last_payload = blob
                    idle = 0
                elif job["status"] in ("running", "pending"):
                    idle = 0
                else:
                    idle += 1
                if job["status"] in ("done", "error", "cancelled"):
                    break
                time.sleep(0.45)
            yield f"data: {json.dumps({'type': 'stream_end', 'job_id': job_id}, ensure_ascii=False)}\n\n"

        return Response(
            stream_with_context(generate()),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    @bp.route("/test-cases/agent-jobs/<job_id>/cancel", methods=["POST"])
    def cancel_agent_job(job_id: str):
        try:
            ok = agent_svc.cancel_agent_job(job_id)
            return jsonify({"ok": ok})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/agent-jobs/<job_id>/retry", methods=["POST"])
    def retry_agent_job(job_id: str):
        try:
            job = get_job(job_id)
            if not job:
                return jsonify({"error": "任务不存在或不可重试"}), 404
            user_id = get_current_user_id()
            try:
                assert_generation_allowed(
                    request=request,
                    user_id=user_id,
                    action="agent_retry",
                    prompt=str(job.get("user_intent") or ""),
                    mode=str(job.get("mode") or ""),
                    check_agent_concurrency=True,
                )
            except GenerationRateLimitError as exc:
                resp = jsonify({"error": str(exc)})
                resp.status_code = 429
                resp.headers["Retry-After"] = str(exc.retry_after_sec)
                return resp
            job = agent_svc.retry_agent_job(job_id)
            if not job:
                return jsonify({"error": "任务不存在或不可重试"}), 404
            return jsonify(job)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400
