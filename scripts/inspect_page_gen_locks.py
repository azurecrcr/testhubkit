#!/usr/bin/env python3
import os
import sys

os.chdir("/app")
sys.path.insert(0, "/app")

from core.services.test_cases.mysql_db import get_connection
from core.services.test_cases.generation_session_db import get_session

with get_connection() as conn:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT user_id, lanhu_page_id, page_name, session_id, status, started_at, updated_at "
            "FROM tc_user_page_generation_lock ORDER BY updated_at DESC"
        )
        rows = cur.fetchall() or []
print("locks:", len(rows))
for row in rows:
    sid = row.get("session_id")
    sess = get_session(sid) if sid else None
    sess_status = (sess or {}).get("status") if sess else None
    print(dict(row), "session_status=", sess_status)
