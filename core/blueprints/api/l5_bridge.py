# -*- coding: utf-8 -*-
"""L5 桥梁 API：全部新路由，旧 CM/DM 路由保持不变。"""

from __future__ import annotations

from flask import Blueprint, Response, jsonify, request

from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.case_management.access import CmAccessError, assert_owned_row
from core.services.case_management.case_db import get_case
from core.services.defect_management.access import assert_defect_editor, assert_defect_viewer
from core.services.defect_management import defect_db
from core.services.l5_bridge.schema_l5 import ensure_l5_tables


def _uid() -> str:
    return str(get_current_user_id() or "").strip()


def _err(exc: Exception):
    if isinstance(exc, CmAccessError):
        return jsonify({"error": exc.message}), exc.status
    return jsonify({"error": str(exc)}), 400


def register_routes(bp: Blueprint) -> None:
    @bp.route("/l5/health", methods=["GET"])
    @require_login_api
    def l5_health():
        try:
            ensure_l5_tables()
            return jsonify({"ok": True, "no_attachments": True, "workbench_frozen": True})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- P1/P2 case & defect detail ----
    @bp.route("/l5/cases/<case_id>", methods=["GET"])
    @require_login_api
    def l5_get_case(case_id: str):
        try:
            from core.services.l5_bridge.nav_meta_l5 import serialize_case_l5

            item = serialize_case_l5(case_id)
            if not item:
                return jsonify({"error": "用例不存在"}), 404
            assert_owned_row(item, _uid(), not_found="用例不存在")
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/cases/<case_id>/defects", methods=["GET"])
    @require_login_api
    def l5_case_defects(case_id: str):
        try:
            from core.services.l5_bridge.nav_meta_l5 import list_defects_for_case_l5

            case = assert_owned_row(get_case(case_id), _uid(), not_found="用例不存在")
            return jsonify({"items": list_defects_for_case_l5(case_id), "case_id": case.get("id")})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/defects/<defect_id>", methods=["GET"])
    @require_login_api
    def l5_get_defect(defect_id: str):
        try:
            from core.services.l5_bridge.nav_meta_l5 import serialize_defect_l5

            item = serialize_defect_l5(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            assert_defect_viewer(_uid(), str(item.get("project_id") or ""), require_team=True)
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/defects/<defect_id>/cases", methods=["PUT"])
    @require_login_api
    def l5_set_defect_cases(defect_id: str):
        try:
            from core.services.l5_bridge.case_link_sync_l5 import set_case_links_and_sync_refs_l5
            from core.services.l5_bridge.activity_l5 import record_defect_activity_l5

            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            pid = str(item.get("project_id") or "")
            assert_defect_editor(_uid(), pid, require_team=True)
            data = request.get_json(silent=True) or {}
            case_ids = data.get("case_ids") or []
            if not isinstance(case_ids, list):
                raise ValueError("case_ids 必须为数组")
            result = set_case_links_and_sync_refs_l5(
                defect_id=defect_id, project_id=pid, case_ids=case_ids
            )
            record_defect_activity_l5(defect_id, _uid(), "set_cases", result)
            cases = defect_db.list_case_briefs(pid, result.get("case_ids") or [])
            return jsonify({"case_ids": result.get("case_ids") or [], "cases": cases, "defect_refs": result.get("defect_refs")})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- P3 execution bridge ----
    @bp.route("/l5/cases/<case_id>/executions", methods=["POST"])
    @require_login_api
    def l5_create_execution(case_id: str):
        try:
            from core.services.l5_bridge.execution_defect import create_execution_and_maybe_defect_l5

            data = request.get_json(silent=True) or {}
            out = create_execution_and_maybe_defect_l5(
                _uid(),
                case_id,
                result=str(data.get("result") or ""),
                comment=str(data.get("comment") or ""),
                create_defect=bool(data.get("create_defect")),
                defect_opts={
                    "title": data.get("defect_title"),
                    "description": data.get("defect_description"),
                    "severity": data.get("severity") or "normal",
                    "handler_ids": data.get("handler_ids"),
                    "actual_result": data.get("actual_result"),
                    "expected_result": data.get("expected_result"),
                    "repro_steps": data.get("repro_steps"),
                    "environment": data.get("environment"),
                }
                if data.get("create_defect")
                else None,
            )
            return jsonify(out)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/executions/<execution_id>/create-defect", methods=["POST"])
    @require_login_api
    def l5_create_defect_from_exec(execution_id: str):
        try:
            from core.services.l5_bridge.execution_defect import create_defect_from_execution_l5

            data = request.get_json(silent=True) or {}
            item = create_defect_from_execution_l5(
                _uid(),
                execution_id,
                title=data.get("title"),
                description=data.get("description"),
                severity=str(data.get("severity") or "normal"),
                handler_ids=data.get("handler_ids"),
                actual_result=data.get("actual_result"),
                expected_result=data.get("expected_result"),
                repro_steps=data.get("repro_steps"),
                environment=data.get("environment"),
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/executions/<execution_id>/link-defect", methods=["POST"])
    @require_login_api
    def l5_link_defect_exec(execution_id: str):
        try:
            from core.services.l5_bridge.execution_defect import link_existing_defect_to_execution_l5

            data = request.get_json(silent=True) or {}
            item = link_existing_defect_to_execution_l5(
                _uid(), execution_id, str(data.get("defect_id") or "")
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/cases/<case_id>/regression-flag", methods=["GET"])
    @require_login_api
    def l5_regression_flag(case_id: str):
        try:
            from core.services.l5_bridge.execution_defect import get_regression_flag_l5

            assert_owned_row(get_case(case_id), _uid(), not_found="用例不存在")
            return jsonify({"item": get_regression_flag_l5(case_id)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- P4 plans/runs ----
    @bp.route("/l5/projects/<project_id>/plans", methods=["GET"])
    @require_login_api
    def l5_list_plans(project_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import list_plans_payload_l5

            return jsonify(list_plans_payload_l5(_uid(), project_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/projects/<project_id>/plans", methods=["POST"])
    @require_login_api
    def l5_create_plan(project_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import create_plan_l5

            data = request.get_json(silent=True) or {}
            item = create_plan_l5(
                _uid(),
                project_id,
                name=str(data.get("name") or ""),
                description=str(data.get("description") or ""),
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/projects/<project_id>/plans/bundle", methods=["POST"])
    @require_login_api
    def l5_create_plan_bundle(project_id: str):
        """工作台向导：创建计划 + 可选一次性加用例（独立路由，不影响原 POST /plans）。"""
        try:
            from core.services.l5_bridge.plan_run_l5 import create_plan_bundle_l5

            data = request.get_json(silent=True) or {}
            result = create_plan_bundle_l5(
                _uid(),
                project_id,
                name=str(data.get("name") or ""),
                description=str(data.get("description") or ""),
                case_ids=data.get("case_ids") or [],
                assignee_id=str(data.get("assignee_id") or ""),
            )
            return jsonify(
                {
                    "item": result.get("plan"),
                    "run_id": result.get("run_id"),
                    "added": result.get("added") or 0,
                    "updated": result.get("updated") or 0,
                }
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/plans/<plan_id>", methods=["GET"])
    @require_login_api
    def l5_get_plan(plan_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import get_plan_run_l5

            data = get_plan_run_l5(_uid(), plan_id)
            return jsonify(
                {
                    "item": data.get("plan"),
                    "run": data.get("run"),
                    "run_id": data.get("run_id"),
                }
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/plans/<plan_id>", methods=["DELETE"])
    @require_login_api
    def l5_delete_plan(plan_id: str):
        """删除测试计划（仅负责人；独立路由，不影响 GET /plans/<id>）。"""
        try:
            from core.services.l5_bridge.plan_run_l5 import delete_plan_l5

            return jsonify(delete_plan_l5(_uid(), plan_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/plans/<plan_id>/runs", methods=["GET"])
    @require_login_api
    def l5_list_runs(plan_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import list_runs_l5

            return jsonify({"items": list_runs_l5(_uid(), plan_id)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/plans/<plan_id>/runs", methods=["POST"])
    @require_login_api
    def l5_create_run(plan_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import create_run_l5

            data = request.get_json(silent=True) or {}
            item = create_run_l5(
                _uid(),
                plan_id,
                name=str(data.get("name") or "Run"),
                build_no=str(data.get("build_no") or ""),
                environment=str(data.get("environment") or ""),
                run_type=str(data.get("run_type") or "custom"),
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/runs/<run_id>", methods=["GET"])
    @require_login_api
    def l5_get_run(run_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import get_run_l5

            return jsonify({"item": get_run_l5(_uid(), run_id)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/runs/<run_id>/items", methods=["GET"])
    @require_login_api
    def l5_list_run_items(run_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import list_run_items_l5

            return jsonify({"items": list_run_items_l5(_uid(), run_id)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/runs/<run_id>/items", methods=["POST"])
    @require_login_api
    def l5_add_run_items(run_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import add_run_items_l5

            data = request.get_json(silent=True) or {}
            return jsonify(
                add_run_items_l5(
                    _uid(),
                    run_id,
                    data.get("case_ids") or [],
                    assignee_id=data.get("assignee_id"),
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/run-items/<item_id>/execute", methods=["POST"])
    @require_login_api
    def l5_exec_run_item(item_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import execute_run_item_l5

            data = request.get_json(silent=True) or {}
            return jsonify(
                execute_run_item_l5(
                    _uid(),
                    item_id,
                    result=str(data.get("result") or ""),
                    comment=str(data.get("comment") or ""),
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/runs/<run_id>/items/batch-execute", methods=["POST"])
    @require_login_api
    def l5_batch_exec_run_items(run_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import batch_execute_run_items_l5

            data = request.get_json(silent=True) or {}
            return jsonify(
                batch_execute_run_items_l5(
                    _uid(),
                    run_id,
                    data.get("item_ids") if isinstance(data.get("item_ids"), list) else [],
                    result=str(data.get("result") or ""),
                    comment=str(data.get("comment") or ""),
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/runs/<run_id>/stats", methods=["GET"])
    @require_login_api
    def l5_run_stats(run_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import run_stats_l5

            return jsonify(run_stats_l5(_uid(), run_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- P5 case revisions ----
    @bp.route("/l5/cases/<case_id>/revisions", methods=["POST"])
    @require_login_api
    def l5_save_revision(case_id: str):
        try:
            from core.services.l5_bridge.revision_baseline_l5 import save_case_revision_l5

            return jsonify(save_case_revision_l5(_uid(), case_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/cases/<case_id>", methods=["PATCH"])
    @require_login_api
    def l5_patch_case(case_id: str):
        try:
            from core.services.l5_bridge.revision_baseline_l5 import update_case_l5

            data = request.get_json(silent=True) or {}
            return jsonify({"item": update_case_l5(_uid(), case_id, data)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- P7 enrich / activity ----
    @bp.route("/l5/defects/<defect_id>/enrich", methods=["PATCH"])
    @require_login_api
    def l5_enrich_defect(defect_id: str):
        try:
            from core.services.l5_bridge.access_l5 import assert_l5_defect_action_l5
            from core.services.l5_bridge.activity_l5 import update_defect_enrich_l5

            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            assert_l5_defect_action_l5(_uid(), defect_id, "defect.enrich")
            data = request.get_json(silent=True) or {}
            updated = update_defect_enrich_l5(
                defect_id=defect_id,
                actor_id=_uid(),
                repro_steps=data.get("repro_steps"),
                expected_result=data.get("expected_result"),
                actual_result=data.get("actual_result"),
                environment=data.get("environment"),
                module=data.get("module"),
                find_phase=data.get("find_phase"),
                defect_type=data.get("defect_type"),
                priority=data.get("priority"),
                evidence_url=data.get("evidence_url"),
            )
            return jsonify({"item": updated, "no_attachments": True})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/defects/<defect_id>/activity", methods=["GET"])
    @require_login_api
    def l5_defect_activity(defect_id: str):
        try:
            from core.services.l5_bridge.activity_l5 import list_defect_activity_l5

            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            assert_defect_viewer(_uid(), str(item.get("project_id") or ""), require_team=True)
            return jsonify({"items": list_defect_activity_l5(defect_id)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/defects/<defect_id>/relations", methods=["POST"])
    @require_login_api
    def l5_relate_defects(defect_id: str):
        try:
            from core.services.l5_bridge.activity_l5 import relate_defects_l5

            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            assert_defect_editor(_uid(), str(item.get("project_id") or ""), require_team=True)
            data = request.get_json(silent=True) or {}
            relate_defects_l5(defect_id, str(data.get("to_id") or ""), str(data.get("rel_type") or "related"))
            return jsonify({"ok": True})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- P8 sync ----
    @bp.route("/l5/projects/<project_id>/import/workbench/sync-preview", methods=["POST"])
    @require_login_api
    def l5_sync_preview(project_id: str):
        try:
            from core.services.l5_bridge.workbench_sync_l5 import diff_workbench_against_suite_l5

            data = request.get_json(silent=True) or {}
            return jsonify(
                diff_workbench_against_suite_l5(
                    _uid(),
                    project_id,
                    suite_id=str(data.get("suite_id") or ""),
                    lanhu_pid=str(data.get("lanhu_pid") or ""),
                    lanhu_doc_id=str(data.get("lanhu_doc_id") or ""),
                    lanhu_page_id=str(data.get("lanhu_page_id") or ""),
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/projects/<project_id>/import/workbench/sync-apply", methods=["POST"])
    @require_login_api
    def l5_sync_apply(project_id: str):
        try:
            from core.services.l5_bridge.workbench_sync_l5 import apply_workbench_sync_l5

            data = request.get_json(silent=True) or {}
            return jsonify(
                apply_workbench_sync_l5(
                    _uid(),
                    project_id,
                    suite_id=str(data.get("suite_id") or ""),
                    lanhu_pid=str(data.get("lanhu_pid") or ""),
                    lanhu_doc_id=str(data.get("lanhu_doc_id") or ""),
                    lanhu_page_id=str(data.get("lanhu_page_id") or ""),
                    strategy=str(data.get("strategy") or "upsert"),
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- P10 metrics ----
    @bp.route("/l5/projects/<project_id>/metrics", methods=["GET"])
    @require_login_api
    def l5_metrics(project_id: str):
        try:
            from core.services.l5_bridge.metrics_l5 import (
                project_metrics_decision_l5,
                project_metrics_detail_l5,
                project_metrics_l5,
            )

            detail = str(request.args.get("detail") or "").lower() in ("1", "true", "yes")
            decision = str(request.args.get("decision") or "").lower() in ("1", "true", "yes")
            if decision:
                return jsonify(project_metrics_decision_l5(_uid(), project_id))
            if detail:
                return jsonify(project_metrics_detail_l5(_uid(), project_id))
            return jsonify(project_metrics_l5(_uid(), project_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/projects/<project_id>/defects/export.csv", methods=["GET"])
    @require_login_api
    def l5_export_defects(project_id: str):
        try:
            from core.services.l5_bridge.metrics_l5 import export_defects_csv_l5

            csv_text = export_defects_csv_l5(_uid(), project_id)
            return Response(
                csv_text,
                mimetype="text/csv; charset=utf-8",
                headers={
                    "Content-Disposition": "attachment; filename=defects_l5.csv",
                },
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- remaining ops: board / audit / relations ----
    @bp.route("/l5/projects/<project_id>/cases/board", methods=["GET"])
    @require_login_api
    def l5_cases_board(project_id: str):
        try:
            from core.services.l5_bridge.governance_l5 import list_cases_board_l5

            return jsonify(
                list_cases_board_l5(
                    _uid(),
                    project_id,
                    status=str(request.args.get("status") or ""),
                    last_result=str(request.args.get("last_result") or ""),
                    regression=str(request.args.get("regression") or ""),
                    q=str(request.args.get("q") or ""),
                    page=int(request.args.get("page") or 1),
                    page_size=int(request.args.get("page_size") or 50),
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/projects/<project_id>/audit", methods=["GET"])
    @require_login_api
    def l5_project_audit(project_id: str):
        try:
            from core.services.l5_bridge.activity_l5 import list_audit_page_l5

            page = max(1, int(request.args.get("page") or 1))
            page_size = max(1, min(int(request.args.get("page_size") or request.args.get("limit") or 10), 100))
            offset = (page - 1) * page_size
            data = list_audit_page_l5(
                _uid(),
                project_id,
                action=str(request.args.get("action") or ""),
                actor_id=str(request.args.get("actor_id") or ""),
                limit=page_size,
                offset=offset,
            )
            total = int(data.get("total") or 0)
            pages = max(1, (total + page_size - 1) // page_size) if total else 1
            return jsonify(
                {
                    "items": data.get("items") or [],
                    "total": total,
                    "page": page,
                    "page_size": page_size,
                    "pages": pages,
                }
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/defects/<defect_id>/relations", methods=["GET"])
    @require_login_api
    def l5_list_relations(defect_id: str):
        try:
            from core.services.l5_bridge.activity_l5 import list_relations_l5

            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            assert_defect_viewer(_uid(), str(item.get("project_id") or ""), require_team=True)
            return jsonify({"relations": list_relations_l5(defect_id)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- L5+ P1 lineage ----
    @bp.route("/l5/cases/<case_id>/lineage", methods=["GET"])
    @require_login_api
    def l5_case_lineage(case_id: str):
        try:
            from core.services.l5_bridge.lineage_l5 import get_case_lineage_l5

            return jsonify(get_case_lineage_l5(_uid(), case_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/defects/<defect_id>/lineage", methods=["GET"])
    @require_login_api
    def l5_defect_lineage(defect_id: str):
        try:
            from core.services.l5_bridge.lineage_l5 import get_defect_lineage_l5

            return jsonify(get_defect_lineage_l5(_uid(), defect_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- L5+ P2 regression ----
    @bp.route("/l5/defects/<defect_id>/status", methods=["POST"])
    @require_login_api
    def l5_defect_status(defect_id: str):
        try:
            from core.services.l5_bridge.access_l5 import assert_l5_defect_action_l5
            from core.services.l5_bridge.regression_flow_l5 import update_defect_status_l5

            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            assert_l5_defect_action_l5(_uid(), defect_id, "defect.close")
            data = request.get_json(silent=True) or {}
            updated = update_defect_status_l5(
                _uid(),
                defect_id,
                status=str(data.get("status") or ""),
                mark_regression=bool(data.get("mark_regression", True)),
            )
            return jsonify({"item": updated})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/projects/<project_id>/regression/pending", methods=["GET"])
    @require_login_api
    def l5_pending_regression(project_id: str):
        try:
            from core.services.l5_bridge.regression_flow_l5 import list_pending_regression_l5

            return jsonify(list_pending_regression_l5(_uid(), project_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- L5+ P3 report ----
    @bp.route("/l5/runs/<run_id>/report", methods=["GET"])
    @require_login_api
    def l5_run_report(run_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import build_run_report_l5

            return jsonify(build_run_report_l5(_uid(), run_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- L5+ 计划发布状态（手动） ----
    @bp.route("/l5/plans/<plan_id>/execution-summary", methods=["GET"])
    @require_login_api
    def l5_plan_execution_summary(plan_id: str):
        try:
            from core.services.l5_bridge.gate_l5 import count_plan_executed_l5

            return jsonify(count_plan_executed_l5(_uid(), plan_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/plans/<plan_id>/release-status", methods=["POST"])
    @require_login_api
    def l5_plan_release_status(plan_id: str):
        try:
            from core.services.l5_bridge.access_l5 import assert_l5_action
            from core.services.l5_bridge.gate_l5 import set_plan_release_status_l5
            from core.services.l5_bridge.plan_run_l5 import get_plan_l5

            plan = get_plan_l5(_uid(), plan_id)
            assert_l5_action(_uid(), str(plan.get("project_id") or ""), "plan.release")
            data = request.get_json(silent=True) or {}
            item = set_plan_release_status_l5(
                _uid(), plan_id, str(data.get("status") or "")
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- L5+ P6 sync batches ----
    @bp.route("/l5/projects/<project_id>/import/workbench/sync-batches", methods=["GET"])
    @require_login_api
    def l5_sync_batches(project_id: str):
        try:
            from core.services.l5_bridge.workbench_sync_l5 import list_sync_batches_l5

            return jsonify({"items": list_sync_batches_l5(_uid(), project_id)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/projects/<project_id>/import/workbench/broken-sources", methods=["GET"])
    @require_login_api
    def l5_broken_sources(project_id: str):
        try:
            from core.services.l5_bridge.workbench_sync_l5 import detect_broken_source_links_l5

            return jsonify(
                detect_broken_source_links_l5(
                    _uid(), project_id, limit=int(request.args.get("limit") or 100)
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- L5+ P8 audit export / settings ----
    @bp.route("/l5/projects/<project_id>/audit/export.csv", methods=["GET"])
    @require_login_api
    def l5_audit_export(project_id: str):
        try:
            from core.services.l5_bridge.access_l5 import assert_l5_action
            from core.services.l5_bridge.activity_l5 import export_audit_csv_l5

            assert_l5_action(_uid(), project_id, "audit.export")
            csv_text = export_audit_csv_l5(_uid(), project_id)
            return Response(
                csv_text,
                mimetype="text/csv; charset=utf-8",
                headers={"Content-Disposition": "attachment; filename=audit_l5.csv"},
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/l5/projects/<project_id>/settings", methods=["GET", "PATCH"])
    @require_login_api
    def l5_project_settings(project_id: str):
        try:
            from core.services.case_management.access import assert_project_viewer
            from core.services.l5_bridge.access_l5 import (
                get_project_l5_settings,
                save_project_l5_settings_l5,
            )

            if request.method == "GET":
                assert_project_viewer(_uid(), project_id)
                return jsonify({"settings": get_project_l5_settings(project_id)})
            data = request.get_json(silent=True) or {}
            return jsonify({"settings": save_project_l5_settings_l5(_uid(), project_id, data)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- L5+ P10 release pack / decision metrics ----
    @bp.route("/l5/plans/<plan_id>/release-pack.json", methods=["GET"])
    @require_login_api
    def l5_release_pack(plan_id: str):
        try:
            from core.services.l5_bridge.plan_run_l5 import get_plan_l5
            from core.services.l5_bridge.release_pack_l5 import build_release_pack_l5

            plan = get_plan_l5(_uid(), plan_id)
            return jsonify(
                build_release_pack_l5(
                    _uid(),
                    str(plan.get("project_id") or ""),
                    plan_id=plan_id,
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)
