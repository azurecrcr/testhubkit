"""缺陷管理 API：独立蓝图，复用用例项目成员与团队门槛。"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.case_management.access import CmAccessError
from core.services.defect_management import defect_db
from core.services.defect_management.access import (
    assert_defect_editor,
    assert_defect_owner,
    assert_defect_viewer,
)
from core.services.defect_management.schema import ensure_dm_tables


def _uid() -> str:
    return str(get_current_user_id() or "").strip()


def _err(exc: Exception):
    if isinstance(exc, CmAccessError):
        return jsonify({"error": exc.message}), exc.status
    return jsonify({"error": str(exc)}), 400


def register_routes(bp: Blueprint) -> None:
    @bp.route("/defect-management/projects", methods=["GET"])
    @require_login_api
    def dm_list_projects():
        try:
            ensure_dm_tables()
            return jsonify({"items": defect_db.list_projects_for_defect(_uid())})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/defect-management/projects/<project_id>/members", methods=["GET"])
    @require_login_api
    def dm_list_members(project_id: str):
        try:
            # 列表成员用于指派：只需是成员即可，不强制 team_ready（以便空态页也能读）
            proj = assert_defect_viewer(_uid(), project_id, require_team=False)
            from core.services.case_management import member_db

            return jsonify(
                {
                    "items": member_db.list_members(project_id),
                    "my_role": proj.get("_cm_role"),
                    "member_count": proj.get("member_count"),
                    "team_ready": proj.get("team_ready"),
                }
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/defect-management/projects/<project_id>/defects", methods=["GET"])
    @require_login_api
    def dm_list_defects(project_id: str):
        try:
            assert_defect_viewer(_uid(), project_id, require_team=True)
            assigned_me = ""
            if str(request.args.get("assigned_to_me") or "").lower() in ("1", "true", "yes"):
                assigned_me = _uid()
            data = defect_db.list_defects(
                project_id=project_id,
                page=int(request.args.get("page") or 1),
                page_size=int(request.args.get("page_size") or 20),
                status=str(request.args.get("status") or ""),
                severity=str(request.args.get("severity") or ""),
                assignee_id=str(request.args.get("assignee_id") or ""),
                q=str(request.args.get("q") or ""),
                assigned_to_me=assigned_me,
                unclosed=str(request.args.get("unclosed") or "").lower()
                in ("1", "true", "yes"),
            )
            return jsonify(data)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/defect-management/projects/<project_id>/defects", methods=["POST"])
    @require_login_api
    def dm_create_defect(project_id: str):
        try:
            assert_defect_editor(_uid(), project_id, require_team=True)
            data = request.get_json(silent=True) or {}
            item = defect_db.create_defect(
                project_id=project_id,
                reporter_id=_uid(),
                title=str(data.get("title") or ""),
                description=str(data.get("description") or ""),
                severity=str(data.get("severity") or "normal"),
                handler_ids=data.get("handler_ids", data.get("assignee_ids")),
                assignee_id=data.get("assignee_id"),
                status=str(data.get("status") or "open"),
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/defect-management/defects/<defect_id>", methods=["GET"])
    @require_login_api
    def dm_get_defect(defect_id: str):
        try:
            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            assert_defect_viewer(_uid(), str(item.get("project_id") or ""), require_team=True)
            cases = defect_db.list_case_briefs(
                str(item.get("project_id") or ""),
                item.get("case_ids") or [],
            )
            item = dict(item)
            item["cases"] = cases
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/defect-management/defects/<defect_id>", methods=["PATCH"])
    @require_login_api
    def dm_patch_defect(defect_id: str):
        try:
            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            assert_defect_editor(_uid(), str(item.get("project_id") or ""), require_team=True)
            data = request.get_json(silent=True) or {}
            kwargs: dict = {"defect_id": defect_id, "actor_id": _uid()}
            if "title" in data:
                kwargs["title"] = data.get("title")
            if "description" in data:
                kwargs["description"] = data.get("description")
            if "status" in data:
                kwargs["status"] = data.get("status")
            if "severity" in data:
                kwargs["severity"] = data.get("severity")
            if "handler_ids" in data:
                kwargs["handler_ids"] = data.get("handler_ids")
            elif "assignee_ids" in data:
                kwargs["handler_ids"] = data.get("assignee_ids")
            elif "assignee_id" in data:
                kwargs["assignee_id"] = data.get("assignee_id")
            updated = defect_db.update_defect(**kwargs)
            # L5 hook：不改 update_defect；resolved/closed 时标记待回归；状态变更发消息
            if "status" in data:
                try:
                    from core.services.l5_bridge.execution_defect import after_defect_status_change_l5

                    after_defect_status_change_l5(
                        updated or {},
                        previous_status=str(item.get("status") or ""),
                        actor_id=_uid(),
                    )
                except Exception:  # noqa: BLE001
                    pass
            try:
                from core.services.l5_bridge.activity_l5 import record_defect_activity_l5

                if "status" in data:
                    record_defect_activity_l5(
                        defect_id,
                        _uid(),
                        "status_change",
                        {
                            "from": item.get("status"),
                            "to": (updated or {}).get("status"),
                        },
                    )
            except Exception:  # noqa: BLE001
                pass
            return jsonify({"item": updated})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/defect-management/defects/<defect_id>", methods=["DELETE"])
    @require_login_api
    def dm_delete_defect(defect_id: str):
        try:
            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            assert_defect_owner(_uid(), str(item.get("project_id") or ""), require_team=True)
            return jsonify(defect_db.delete_defect(defect_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/defect-management/defects/<defect_id>/comments", methods=["GET"])
    @require_login_api
    def dm_list_comments(defect_id: str):
        try:
            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            assert_defect_viewer(_uid(), str(item.get("project_id") or ""), require_team=True)
            return jsonify({"items": defect_db.list_comments(defect_id)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/defect-management/defects/<defect_id>/comments", methods=["POST"])
    @require_login_api
    def dm_add_comment(defect_id: str):
        try:
            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            assert_defect_editor(_uid(), str(item.get("project_id") or ""), require_team=True)
            data = request.get_json(silent=True) or {}
            comment = defect_db.add_comment(
                defect_id=defect_id,
                user_id=_uid(),
                body=str(data.get("body") or ""),
            )
            return jsonify({"item": comment})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/defect-management/defects/<defect_id>/cases", methods=["PUT"])
    @require_login_api
    def dm_set_cases(defect_id: str):
        try:
            item = defect_db.get_defect(defect_id)
            if not item:
                return jsonify({"error": "缺陷不存在"}), 404
            pid = str(item.get("project_id") or "")
            assert_defect_editor(_uid(), pid, require_team=True)
            data = request.get_json(silent=True) or {}
            case_ids = data.get("case_ids") or []
            if not isinstance(case_ids, list):
                raise ValueError("case_ids 必须为数组")
            result = defect_db.set_case_links(
                defect_id=defect_id,
                project_id=pid,
                case_ids=case_ids,
            )
            cases = defect_db.list_case_briefs(pid, result.get("case_ids") or [])
            return jsonify({"case_ids": result.get("case_ids") or [], "cases": cases})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/defect-management/projects/<project_id>/cases/search", methods=["GET"])
    @require_login_api
    def dm_search_cases(project_id: str):
        """关联用例时搜索本项目用例（薄封装）。"""
        try:
            assert_defect_viewer(_uid(), project_id, require_team=True)
            from core.services.case_management import case_db

            q = str(request.args.get("q") or "").strip()
            data = case_db.list_cases(
                _uid(),
                project_id,
                page=1,
                page_size=50,
                q=q,
                suite_id="__all__",
            )
            items = []
            for c in data.get("items") or []:
                items.append(
                    {
                        "id": c.get("id"),
                        "title": c.get("title") or c.get("name") or c.get("id"),
                    }
                )
            return jsonify({"items": items})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)
