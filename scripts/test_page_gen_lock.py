#!/usr/bin/env python3
"""Smoke test for page generation lock."""
from core.services.test_cases.page_generation_lock_db import (
    PageGenLockConflictError,
    acquire_page_gen_lock,
    ensure_page_generation_lock_table,
    get_active_page_gen_lock,
    release_active_page_gen_lock,
)
from core.services.test_cases.page_generation_lock_service import (
    finish_page_gen_lock_for_session,
    link_generation_session_to_lock,
    reconcile_user_page_gen_lock,
)

uid = "test-pagelock-user-001"
ensure_page_generation_lock_table()
release_active_page_gen_lock(uid)
lock = acquire_page_gen_lock(
    uid,
    {"lanhu_page_id": "page-a", "lanhu_doc_id": "doc-1", "page_name": "页面A"},
)
print("acquired", lock["lanhu_page_id"])
try:
    acquire_page_gen_lock(
        uid,
        {"lanhu_page_id": "page-b", "lanhu_doc_id": "doc-1", "page_name": "页面B"},
    )
    print("ERROR: should conflict")
except PageGenLockConflictError as exc:
    print("conflict ok:", str(exc)[:50])
link_generation_session_to_lock(uid, "sess-123")
released = finish_page_gen_lock_for_session("sess-123", "done")
print("released", bool(released), "active", get_active_page_gen_lock(uid))

# orphan lock without session should be reconciled
acquire_page_gen_lock(
    uid,
    {"lanhu_page_id": "page-orphan", "lanhu_doc_id": "doc-1", "page_name": "孤儿页"},
)
print("orphan before", get_active_page_gen_lock(uid) is not None)
print("reconciled", reconcile_user_page_gen_lock(uid), "active", get_active_page_gen_lock(uid))
print("ALL OK")
