"""非管理员用户蓝湖需求文档数量限制（每人最多 3 个）。"""
from __future__ import annotations

from core.services.auth.prompt_visibility_admin import is_site_manager
from core.services.auth.user_service import get_user_by_id
from core.services.test_cases.user_lanhu_docs_db import list_user_lanhu_docs

NON_ADMIN_LANHU_DOC_MAX = 3

DOC_QUOTA_EXCEEDED_MSG = (
    "每位用户最多只能添加三个需求文档。"
    "您当前已达上限，如需添加新文档请先删除现有文档。"
    "注意：删除需求文档后，该文档下的所有用例都会丢失，请务必先导出用例后再删除。"
)


def is_lanhu_doc_quota_admin(user_id: str) -> bool:
    uid = str(user_id or "").strip()
    if not uid:
        return False
    user = get_user_by_id(uid)
    if not user:
        return False
    return is_site_manager(user)


def count_user_lanhu_docs(user_id: str) -> int:
    return len(list_user_lanhu_docs(user_id))


def get_user_lanhu_doc_quota(user_id: str) -> dict:
    """返回当前用户蓝湖文档配额信息（供 API / 前端展示）。"""
    uid = str(user_id or "").strip()
    count = count_user_lanhu_docs(uid) if uid else 0
    unlimited = is_lanhu_doc_quota_admin(uid) if uid else False
    max_count = None if unlimited else NON_ADMIN_LANHU_DOC_MAX
    can_add = unlimited or count < NON_ADMIN_LANHU_DOC_MAX
    return {
        "max": max_count,
        "count": count,
        "can_add": can_add,
        "is_unlimited": unlimited,
    }


def assert_user_may_create_lanhu_doc(user_id: str) -> None:
    """非管理员已达上限时禁止再创建；管理员不受限。"""
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("请先登录")
    if is_lanhu_doc_quota_admin(uid):
        return
    if count_user_lanhu_docs(uid) >= NON_ADMIN_LANHU_DOC_MAX:
        raise ValueError(DOC_QUOTA_EXCEEDED_MSG)
