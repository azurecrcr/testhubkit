"""用例管理 API：独立蓝图注册，不影响 test_cases。"""

from __future__ import annotations

from flask import Blueprint, jsonify, request, send_file
import io

from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.case_management.access import CmAccessError
from core.services.case_management import case_db, case_ops_db, execution_db, project_db, suite_db
from core.services.case_management import schema_import, suite_schema_db
from core.services.case_management.excel_io import export_project_excel
from core.services.case_management.workbench_import import list_workbench_sources
import json as _json


def _uid() -> str:
    return str(get_current_user_id() or "").strip()


def _err(exc: Exception):
    if isinstance(exc, CmAccessError):
        return jsonify({"error": exc.message}), exc.status
    return jsonify({"error": str(exc)}), 400


def _cm_audit(
    project_id: str,
    action: str,
    *,
    ref_type: str | None = None,
    ref_id: str | None = None,
    payload: dict | None = None,
) -> None:
    """用例管理日常操作写入项目操作日志；失败不影响主流程。"""
    try:
        from core.services.l5_bridge.activity_l5 import write_audit_l5

        write_audit_l5(
            str(project_id or ""),
            _uid(),
            action,
            ref_type=ref_type,
            ref_id=ref_id,
            payload=payload,
        )
    except Exception:  # noqa: BLE001
        pass


def register_routes(bp: Blueprint) -> None:
    # ---- projects ----
    @bp.route("/case-management/projects", methods=["GET"])
    @require_login_api
    def cm_list_projects():
        try:
            return jsonify({"items": project_db.list_projects(_uid())})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects", methods=["POST"])
    @require_login_api
    def cm_create_project():
        try:
            data = request.get_json(silent=True) or {}
            item = project_db.create_project(
                _uid(),
                name=str(data.get("name") or ""),
                description=str(data.get("description") or ""),
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>", methods=["PATCH"])
    @require_login_api
    def cm_patch_project(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            item = project_db.update_project(
                _uid(),
                project_id,
                name=data.get("name") if "name" in data else None,
                description=data.get("description") if "description" in data else None,
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>", methods=["DELETE"])
    @require_login_api
    def cm_delete_project(project_id: str):
        try:
            force = str(request.args.get("force") or "").lower() in ("1", "true", "yes")
            return jsonify(project_db.delete_project(_uid(), project_id, force=force))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- project members (collaboration) ----
    @bp.route("/case-management/projects/<project_id>/members", methods=["GET"])
    @require_login_api
    def cm_list_members(project_id: str):
        try:
            from core.services.case_management.access import assert_project_viewer
            from core.services.case_management import invite_db, member_db

            proj = assert_project_viewer(_uid(), project_id)
            items = member_db.list_members(project_id)
            pending = invite_db.list_pending_invites(project_id)
            return jsonify(
                {
                    "items": items,
                    "pending_invites": pending,
                    "my_role": proj.get("_cm_role"),
                    "primary_owner_id": proj.get("user_id"),
                }
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/users/search", methods=["GET"])
    @require_login_api
    def cm_search_users():
        try:
            from core.services.case_management import member_db

            q = str(request.args.get("q") or "")
            return jsonify({"items": member_db.search_users_for_invite(q)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/members", methods=["POST"])
    @require_login_api
    def cm_invite_member(project_id: str):
        try:
            from core.services.case_management.access import assert_project_owner
            from core.services.case_management import invite_db, member_db

            assert_project_owner(_uid(), project_id)
            data = request.get_json(silent=True) or {}
            target = str(data.get("user_id") or "").strip()
            if not target:
                q = str(data.get("q") or "").strip()
                found = member_db.search_users_for_invite(q, limit=5)
                if len(found) == 1:
                    target = found[0]["id"]
                elif not found:
                    raise ValueError("未找到该用户，请输入完整邮箱或手机号")
                else:
                    raise ValueError("匹配到多个用户，请选择精确账号")
            if target == _uid():
                raise ValueError("不能邀请自己")
            result = invite_db.create_project_invite(
                project_id=project_id,
                target_user_id=target,
                role=str(data.get("role") or "editor"),
                invited_by=_uid(),
            )
            _cm_audit(
                project_id,
                "member.invite",
                ref_type="invite",
                ref_id=str(((result or {}).get("invite") or {}).get("id") or target),
                payload={
                    "target_user_id": target,
                    "role": str(data.get("role") or "editor"),
                },
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route(
        "/case-management/projects/<project_id>/invites/<invite_id>",
        methods=["DELETE"],
    )
    @require_login_api
    def cm_cancel_invite(project_id: str, invite_id: str):
        try:
            from core.services.case_management.access import assert_project_owner
            from core.services.case_management import invite_db

            assert_project_owner(_uid(), project_id)
            return jsonify(
                invite_db.cancel_invite(
                    project_id=project_id,
                    invite_id=invite_id,
                    actor_user_id=_uid(),
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/invites/<invite_id>/accept", methods=["POST"])
    @require_login_api
    def cm_accept_invite(invite_id: str):
        try:
            from core.services.case_management import invite_db

            return jsonify(
                invite_db.accept_invite(invite_id=invite_id, actor_user_id=_uid())
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/invites/<invite_id>/reject", methods=["POST"])
    @require_login_api
    def cm_reject_invite(invite_id: str):
        try:
            from core.services.case_management import invite_db

            return jsonify(
                invite_db.reject_invite(invite_id=invite_id, actor_user_id=_uid())
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route(
        "/case-management/projects/<project_id>/transfer-owner",
        methods=["POST"],
    )
    @require_login_api
    def cm_transfer_owner(project_id: str):
        try:
            from core.services.case_management import member_db

            data = request.get_json(silent=True) or {}
            return jsonify(
                member_db.transfer_project_owner(
                    project_id=project_id,
                    actor_user_id=_uid(),
                    target_user_id=str(data.get("target_user_id") or ""),
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/messages", methods=["GET"])
    @require_login_api
    def cm_list_messages():
        try:
            from core.services.case_management import message_db

            status = (request.args.get("status") or "").strip() or None
            # Inbox 走 list_messages_inbox（分页 + 可选 status）；无 status 时与旧 list 兼容
            return jsonify(
                message_db.list_messages_inbox(
                    _uid(),
                    page=int(request.args.get("page") or 1),
                    page_size=int(request.args.get("page_size") or 15),
                    status=status,
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/messages/read-all", methods=["POST"])
    @require_login_api
    def cm_mark_all_messages_read():
        try:
            from core.services.case_management import message_db

            return jsonify(message_db.mark_all_messages_read(_uid()))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/messages/<message_id>/read", methods=["POST"])
    @require_login_api
    def cm_mark_message_read(message_id: str):
        try:
            from core.services.case_management import message_db

            return jsonify({"item": message_db.mark_message_read(_uid(), message_id)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/messages/<message_id>/delete", methods=["POST"])
    @require_login_api
    def cm_soft_delete_message(message_id: str):
        try:
            from core.services.case_management import message_db

            return jsonify(
                message_db.soft_delete_messages_inbox(
                    _uid(), message_ids=[message_id]
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/messages/delete", methods=["POST"])
    @require_login_api
    def cm_soft_delete_messages_batch():
        try:
            from core.services.case_management import message_db

            data = request.get_json(silent=True) or {}
            delete_all = bool(data.get("all") or data.get("delete_all"))
            status = (data.get("status") or "").strip() or None
            ids = data.get("ids") or data.get("message_ids") or []
            if not isinstance(ids, list):
                ids = []
            return jsonify(
                message_db.soft_delete_messages_inbox(
                    _uid(),
                    message_ids=[str(x) for x in ids],
                    delete_all=delete_all,
                    status=status,
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route(
        "/case-management/projects/<project_id>/members/<member_user_id>",
        methods=["PATCH"],
    )
    @require_login_api
    def cm_patch_member(project_id: str, member_user_id: str):
        try:
            from core.services.case_management.access import assert_project_owner
            from core.services.case_management import member_db

            assert_project_owner(_uid(), project_id)
            data = request.get_json(silent=True) or {}
            item = member_db.update_member_role(
                project_id=project_id,
                target_user_id=member_user_id,
                role=str(data.get("role") or ""),
                actor_user_id=_uid(),
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route(
        "/case-management/projects/<project_id>/members/<member_user_id>",
        methods=["DELETE"],
    )
    @require_login_api
    def cm_remove_member(project_id: str, member_user_id: str):
        try:
            from core.services.case_management.access import assert_project_owner
            from core.services.case_management import member_db

            assert_project_owner(_uid(), project_id)
            return jsonify(
                member_db.remove_member(
                    project_id=project_id, target_user_id=member_user_id
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- suites ----
    @bp.route("/case-management/projects/<project_id>/suites", methods=["GET"])
    @require_login_api
    def cm_list_suites(project_id: str):
        try:
            return jsonify({"items": suite_db.list_suites(_uid(), project_id)})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/suites", methods=["POST"])
    @require_login_api
    def cm_create_suite(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            item = suite_db.create_suite(
                _uid(),
                project_id,
                name=str(data.get("name") or ""),
                parent_id=data.get("parent_id"),
            )
            _cm_audit(
                project_id,
                "suite.create",
                ref_type="suite",
                ref_id=str((item or {}).get("id") or ""),
                payload={"name": str((item or {}).get("name") or data.get("name") or "")},
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/suites/<suite_id>", methods=["PATCH"])
    @require_login_api
    def cm_patch_suite(suite_id: str):
        try:
            data = request.get_json(silent=True) or {}
            item = suite_db.update_suite(
                _uid(),
                suite_id,
                name=data.get("name") if "name" in data else None,
                parent_id=data.get("parent_id") if "parent_id" in data else None,
                sort_order=data.get("sort_order") if "sort_order" in data else None,
                move_up=bool(data.get("move_up")),
                move_down=bool(data.get("move_down")),
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/suites/<suite_id>", methods=["DELETE"])
    @require_login_api
    def cm_delete_suite(suite_id: str):
        try:
            return jsonify(suite_db.delete_suite(_uid(), suite_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- cases ----
    @bp.route("/case-management/projects/<project_id>/cases", methods=["GET"])
    @require_login_api
    def cm_list_cases(project_id: str):
        try:
            suite_id = request.args.get("suite_id")
            result = case_db.list_cases(
                _uid(),
                project_id,
                q=str(request.args.get("q") or ""),
                priority=str(request.args.get("priority") or ""),
                status=str(request.args.get("status") or ""),
                suite_id=suite_id if suite_id is not None else "__all__",
                page=int(request.args.get("page") or 1),
                page_size=int(request.args.get("page_size") or 20),
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/cases", methods=["POST"])
    @require_login_api
    def cm_create_case(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            item = case_db.create_case(_uid(), project_id, data)
            _cm_audit(
                project_id,
                "case.create",
                ref_type="case",
                ref_id=str((item or {}).get("id") or ""),
                payload={"title": str((item or {}).get("title") or data.get("title") or "")},
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/cases/<case_id>", methods=["GET"])
    @require_login_api
    def cm_get_case(case_id: str):
        try:
            from core.services.case_management.access import assert_owned_row

            item = assert_owned_row(
                case_db.get_case(case_id), _uid(), not_found="用例不存在"
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/cases/<case_id>", methods=["PATCH"])
    @require_login_api
    def cm_patch_case(case_id: str):
        try:
            data = request.get_json(silent=True) or {}
            item = case_db.update_case(_uid(), case_id, data)
            _cm_audit(
                str((item or {}).get("project_id") or ""),
                "case.update",
                ref_type="case",
                ref_id=case_id,
                payload={"title": str((item or {}).get("title") or "")},
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/cases/<case_id>", methods=["DELETE"])
    @require_login_api
    def cm_delete_case(case_id: str):
        try:
            # 默认进回收站；mode=purge 保持旧硬删
            before = case_db.get_case(case_id) or {}
            project_id = str(before.get("project_id") or "")
            mode = str(request.args.get("mode") or "trash").strip().lower()
            if mode == "purge":
                result = case_db.delete_case(_uid(), case_id)
            else:
                result = case_ops_db.trash_case(_uid(), case_id)
            _cm_audit(
                project_id,
                "case.delete",
                ref_type="case",
                ref_id=case_id,
                payload={
                    "title": str(before.get("title") or ""),
                    "mode": mode,
                },
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/cases/batch-delete", methods=["POST"])
    @require_login_api
    def cm_batch_delete_cases(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            mode = str(data.get("mode") or "trash").strip().lower()
            scope = str(data.get("scope") or "")
            # 先解析 ids，再按 mode 软删/硬删（硬删仍走旧 batch_hard_delete）
            if mode == "purge" and scope in ("suite", "filtered", "ids"):
                result = case_db.batch_hard_delete_cases(
                    _uid(),
                    project_id,
                    scope=scope,
                    case_ids=data.get("case_ids") if isinstance(data.get("case_ids"), list) else None,
                    suite_id=str(data.get("suite_id") or "") or None,
                    q=str(data.get("q") or ""),
                    priority=str(data.get("priority") or ""),
                    status=str(data.get("status") or ""),
                )
                _cm_audit(
                    project_id,
                    "case.delete",
                    ref_type="batch",
                    payload={
                        "mode": mode,
                        "scope": scope,
                        "count": int(result.get("deleted") or 0),
                    },
                )
                return jsonify(result)
            resolved = case_db.resolve_case_ids(
                _uid(),
                project_id,
                scope=scope,
                case_ids=data.get("case_ids") if isinstance(data.get("case_ids"), list) else None,
                suite_id=str(data.get("suite_id") or "") or None,
                q=str(data.get("q") or ""),
                priority=str(data.get("priority") or ""),
                status=str(data.get("status") or ""),
                limit=5000,
            )
            ids = resolved.get("case_ids") or []
            if mode == "purge":
                result = case_ops_db.purge_cases(_uid(), project_id, case_ids=ids)
            else:
                result = case_ops_db.trash_cases(_uid(), project_id, case_ids=ids)
                result["deleted"] = result.get("trashed") or 0
            _cm_audit(
                project_id,
                "case.delete",
                ref_type="batch",
                payload={
                    "mode": mode,
                    "scope": scope,
                    "count": int(result.get("deleted") or result.get("trashed") or 0),
                },
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/cases/batch-status", methods=["POST"])
    @require_login_api
    def cm_batch_update_case_status(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            # status = 目标状态；filter_status = 列表筛选状态（避免与目标冲突）
            filter_status = str(
                data.get("filter_status")
                if data.get("filter_status") is not None
                else data.get("status_filter")
                or ""
            )
            # 兼容：filtered 且未传 filter_status 时，勿把 status 当筛选
            result = case_db.batch_update_case_status(
                _uid(),
                project_id,
                new_status=str(data.get("status") or data.get("target_status") or ""),
                scope=str(data.get("scope") or ""),
                case_ids=data.get("case_ids") if isinstance(data.get("case_ids"), list) else None,
                suite_id=str(data.get("suite_id") or "") or None,
                q=str(data.get("q") or ""),
                priority=str(data.get("priority") or ""),
                filter_status=filter_status,
            )
            _cm_audit(
                project_id,
                "case.batch_status",
                ref_type="batch",
                payload={
                    "status": str(data.get("status") or data.get("target_status") or ""),
                    "count": int(result.get("updated") or result.get("count") or 0),
                    "scope": str(data.get("scope") or ""),
                },
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/cases/resolve-ids", methods=["POST"])
    @require_login_api
    def cm_resolve_case_ids(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            result = case_db.resolve_case_ids(
                _uid(),
                project_id,
                scope=str(data.get("scope") or ""),
                case_ids=data.get("case_ids") if isinstance(data.get("case_ids"), list) else None,
                suite_id=str(data.get("suite_id") or "") or None,
                q=str(data.get("q") or ""),
                priority=str(data.get("priority") or ""),
                status=str(data.get("status") or ""),
                limit=int(data.get("limit") or 200),
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/cases/move", methods=["POST"])
    @require_login_api
    def cm_move_cases(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            result = case_ops_db.move_cases(
                _uid(),
                project_id,
                case_ids=data.get("case_ids") if isinstance(data.get("case_ids"), list) else [],
                target_suite_id=str(data.get("target_suite_id") or ""),
            )
            _cm_audit(
                project_id,
                "case.batch_move",
                ref_type="batch",
                payload={
                    "target_suite_id": str(data.get("target_suite_id") or ""),
                    "count": int(result.get("moved") or result.get("count") or len(data.get("case_ids") or [])),
                },
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/cases/copy", methods=["POST"])
    @require_login_api
    def cm_copy_cases(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            result = case_ops_db.copy_cases(
                _uid(),
                project_id,
                case_ids=data.get("case_ids") if isinstance(data.get("case_ids"), list) else [],
                target_suite_id=str(data.get("target_suite_id") or ""),
                title_suffix=str(data.get("title_suffix") if data.get("title_suffix") is not None else " (副本)"),
            )
            _cm_audit(
                project_id,
                "case.batch_copy",
                ref_type="batch",
                payload={
                    "target_suite_id": str(data.get("target_suite_id") or ""),
                    "count": int(result.get("created") or result.get("copied") or result.get("count") or len(data.get("case_ids") or [])),
                },
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/cases/trash", methods=["GET"])
    @require_login_api
    def cm_list_trash(project_id: str):
        try:
            result = case_ops_db.list_trash(
                _uid(),
                project_id,
                page=int(request.args.get("page") or 1),
                page_size=int(request.args.get("page_size") or 20),
                for_user_id=str(request.args.get("for_user_id") or "") or None,
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/cases/restore", methods=["POST"])
    @require_login_api
    def cm_restore_cases(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            result = case_ops_db.restore_cases(
                _uid(),
                project_id,
                case_ids=data.get("case_ids") if isinstance(data.get("case_ids"), list) else [],
                for_user_id=str(data.get("for_user_id") or "") or None,
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/cases/purge", methods=["POST"])
    @require_login_api
    def cm_purge_cases(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            result = case_ops_db.purge_cases(
                _uid(),
                project_id,
                case_ids=data.get("case_ids") if isinstance(data.get("case_ids"), list) else [],
                for_user_id=str(data.get("for_user_id") or "") or None,
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- executions ----
    @bp.route("/case-management/cases/<case_id>/executions", methods=["GET"])
    @require_login_api
    def cm_list_executions(case_id: str):
        try:
            page = int(request.args.get("page") or 1)
            page_size = int(request.args.get("page_size") or request.args.get("limit") or 10)
            return jsonify(
                execution_db.list_executions(
                    _uid(),
                    case_id,
                    page=page,
                    page_size=page_size,
                )
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/cases/<case_id>/executions", methods=["POST"])
    @require_login_api
    def cm_create_execution(case_id: str):
        try:
            data = request.get_json(silent=True) or {}
            item = execution_db.create_execution(
                _uid(),
                case_id,
                result=str(data.get("result") or ""),
                comment=str(data.get("comment") or ""),
            )
            _cm_audit(
                str((item or {}).get("project_id") or ""),
                "execution.create",
                ref_type="execution",
                ref_id=str((item or {}).get("id") or ""),
                payload={
                    "case_id": case_id,
                    "result": str((item or {}).get("result") or ""),
                },
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/suites/<suite_id>/schema", methods=["GET"])
    @require_login_api
    def cm_get_suite_schema(suite_id: str):
        try:
            effective = str(request.args.get("effective") or "").strip().lower() in (
                "1",
                "true",
                "yes",
            )
            if effective:
                item = suite_schema_db.get_effective_list_schema(_uid(), suite_id)
            else:
                item = suite_schema_db.get_suite_schema(_uid(), suite_id)
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/schema/effective", methods=["GET"])
    @require_login_api
    def cm_get_project_effective_schema(project_id: str):
        try:
            item = suite_schema_db.get_project_effective_schema(_uid(), project_id)
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/suites/<suite_id>/schema/template", methods=["POST"])
    @require_login_api
    def cm_apply_suite_schema_template(suite_id: str):
        try:
            suite = suite_db.get_suite(suite_id)
            if not suite:
                return jsonify({"error": "目录不存在"}), 404
            item = suite_schema_db.apply_default_template(
                _uid(), str(suite.get("project_id") or ""), suite_id
            )
            return jsonify({"item": item})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/suites/<suite_id>/schema/reset", methods=["POST"])
    @require_login_api
    def cm_reset_suite_schema(suite_id: str):
        try:
            return jsonify(suite_schema_db.reset_schema(_uid(), suite_id))
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- excel ----
    @bp.route("/case-management/projects/<project_id>/export/excel", methods=["GET"])
    @require_login_api
    def cm_export_excel(project_id: str):
        try:
            suite_id = str(request.args.get("suite_id") or "").strip() or "__all__"
            raw = export_project_excel(_uid(), project_id, suite_id=suite_id)
            name = "case_management_export.xlsx"
            if suite_id not in ("", "__all__", "*"):
                name = "case_management_export_suite.xlsx"
            _cm_audit(
                project_id,
                "case.export_excel",
                ref_type="project",
                ref_id=project_id,
                payload={"suite_id": suite_id, "bytes": len(raw or b"")},
            )
            return send_file(
                io.BytesIO(raw),
                mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                as_attachment=True,
                download_name=name,
            )
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/import/excel/preview", methods=["POST"])
    @require_login_api
    def cm_preview_excel(project_id: str):
        try:
            f = request.files.get("file")
            if not f:
                return jsonify({"error": "请上传 Excel 文件"}), 400
            suite_id = str(request.form.get("suite_id") or "").strip()
            if not suite_id:
                return jsonify({"error": "请选择导入目录"}), 400
            raw = f.read()
            result = schema_import.preview_excel(
                _uid(), project_id, suite_id, io.BytesIO(raw)
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/import/excel", methods=["POST"])
    @require_login_api
    def cm_import_excel(project_id: str):
        try:
            f = request.files.get("file")
            if not f:
                return jsonify({"error": "请上传 Excel 文件"}), 400
            suite_id = str(request.form.get("suite_id") or request.args.get("suite_id") or "").strip()
            if not suite_id:
                return jsonify({"error": "请选择导入目录"}), 400
            confirm_schema = str(request.form.get("confirm_schema") or "").lower() in (
                "1",
                "true",
                "yes",
            )
            mapping_raw = request.form.get("column_mapping") or ""
            column_mapping = None
            if mapping_raw:
                try:
                    column_mapping = _json.loads(mapping_raw)
                except _json.JSONDecodeError as exc:
                    raise ValueError("column_mapping 不是合法 JSON") from exc
            proposed_raw = request.form.get("proposed_columns") or ""
            proposed_columns = None
            if proposed_raw:
                try:
                    proposed_columns = _json.loads(proposed_raw)
                except _json.JSONDecodeError as exc:
                    raise ValueError("proposed_columns 不是合法 JSON") from exc
            raw = f.read()
            result = schema_import.import_excel_with_schema(
                _uid(),
                project_id,
                io.BytesIO(raw),
                suite_id=suite_id,
                column_mapping=column_mapping,
                confirm_schema=confirm_schema,
                proposed_columns=proposed_columns,
                duplicate_mode=str(request.form.get("duplicate_mode") or "create"),
            )
            _cm_audit(
                project_id,
                "case.import_excel",
                ref_type="suite",
                ref_id=suite_id,
                payload={
                    "created": int((result or {}).get("created") or 0),
                    "updated": int((result or {}).get("updated") or 0),
                    "skipped": int((result or {}).get("skipped") or 0),
                },
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    # ---- workbench import (read-only source) ----
    @bp.route("/case-management/import/workbench/sources", methods=["GET"])
    @require_login_api
    def cm_workbench_sources():
        try:
            items = list_workbench_sources(_uid())
            return jsonify({"items": items})
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/import/workbench/preview", methods=["POST"])
    @require_login_api
    def cm_preview_workbench(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            suite_id = str(data.get("suite_id") or "").strip()
            if not suite_id:
                return jsonify({"error": "请选择导入目录"}), 400
            result = schema_import.preview_workbench(
                _uid(),
                project_id,
                suite_id,
                lanhu_pid=str(data.get("lanhu_pid") or ""),
                lanhu_doc_id=str(data.get("lanhu_doc_id") or ""),
                lanhu_page_id=str(data.get("lanhu_page_id") or ""),
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

    @bp.route("/case-management/projects/<project_id>/import/workbench", methods=["POST"])
    @require_login_api
    def cm_import_workbench(project_id: str):
        try:
            data = request.get_json(silent=True) or {}
            suite_id = str(data.get("suite_id") or "").strip()
            if not suite_id:
                return jsonify({"error": "请选择导入目录"}), 400
            result = schema_import.import_workbench_with_schema(
                _uid(),
                project_id,
                lanhu_pid=str(data.get("lanhu_pid") or ""),
                lanhu_doc_id=str(data.get("lanhu_doc_id") or ""),
                lanhu_page_id=str(data.get("lanhu_page_id") or ""),
                suite_id=suite_id,
                column_mapping=data.get("column_mapping"),
                confirm_schema=bool(data.get("confirm_schema")),
                proposed_columns=data.get("proposed_columns"),
                duplicate_mode=str(data.get("duplicate_mode") or "create"),
            )
            return jsonify(result)
        except Exception as exc:  # noqa: BLE001
            return _err(exc)
