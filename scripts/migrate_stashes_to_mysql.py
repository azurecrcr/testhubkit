#!/usr/bin/env python3
"""将 uploads/test_case_stashes 下的 JSON 暂存迁移到 MySQL（可重复执行，按 id 跳过已存在）。"""

from __future__ import annotations

import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

from core.config.paths import UPLOADS_DIR  # noqa: E402
from core.services.test_cases.stash_db import ensure_stash_table, get_connection  # noqa: E402

STASH_ROOT = os.path.join(UPLOADS_DIR, "test_case_stashes")
_ID_RE = re.compile(r"^[a-f0-9]{32}$")


def main() -> int:
    ensure_stash_table()
    migrated = 0
    skipped = 0
    if not os.path.isdir(STASH_ROOT):
        print("no stash dir, nothing to migrate")
        return 0
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for user_id in os.listdir(STASH_ROOT):
                user_dir = os.path.join(STASH_ROOT, user_id)
                if not os.path.isdir(user_dir) or not _ID_RE.match(user_id):
                    continue
                for name in os.listdir(user_dir):
                    if not name.endswith(".json"):
                        continue
                    sid = name[:-5]
                    if not _ID_RE.match(sid):
                        continue
                    path = os.path.join(user_dir, name)
                    try:
                        with open(path, "r", encoding="utf-8") as f:
                            doc = json.load(f)
                    except Exception as exc:
                        print("skip bad file", path, exc)
                        skipped += 1
                        continue
                    cur.execute(
                        "SELECT id FROM test_case_stashes WHERE user_id=%s AND id=%s",
                        (user_id, sid),
                    )
                    if cur.fetchone():
                        skipped += 1
                        continue
                    payload = doc.get("payload") or {}
                    cur.execute(
                        """
                        INSERT INTO test_case_stashes
                            (id, user_id, title, payload, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (
                            sid,
                            user_id,
                            (doc.get("title") or "未命名暂存")[:120],
                            json.dumps(payload, ensure_ascii=False),
                            doc.get("created_at") or doc.get("updated_at"),
                            doc.get("updated_at") or doc.get("created_at"),
                        ),
                    )
                    migrated += 1
                    print("migrated", user_id, sid)
    finally:
        conn.close()
    print(f"done: migrated={migrated} skipped={skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
