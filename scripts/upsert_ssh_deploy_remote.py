# -*- coding: utf-8 -*-
"""Python 3.6+ compatible upsert for ssh_deploy1 (no future annotations)."""
import json
import os
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE not in sys.path:
    sys.path.insert(0, BASE)

from core.services.prompts.prompt_library_db import ensure_prompt_table, get_connection
from core.services.prompts.prompt_library_service import get_ssh_key_deploy_seed_entry


def main():
    entry = get_ssh_key_deploy_seed_entry()
    if not entry.get("body"):
        sys.exit("ssh-key-deploy/SKILL.md missing")
    ensure_prompt_table()
    tags = json.dumps(entry["tags"], ensure_ascii=False)
    now = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM prompt_library_entries")
        row = cur.fetchone() or {}
        sort_order = int(row.get("n") or 50)
        cur.execute(
            """
            INSERT INTO prompt_library_entries
                (id, entry_type, category, kicker, title, blurb, tags, body, sort_order, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                entry_type = VALUES(entry_type),
                category = VALUES(category),
                kicker = VALUES(kicker),
                title = VALUES(title),
                blurb = VALUES(blurb),
                tags = VALUES(tags),
                body = VALUES(body),
                sort_order = VALUES(sort_order),
                updated_at = VALUES(updated_at)
            """,
            (
                entry["id"],
                entry["entry_type"],
                entry["category"],
                entry["kicker"],
                entry["title"],
                entry["blurb"],
                tags,
                entry["body"],
                sort_order,
                now,
                now,
            ),
        )
        conn.commit()
    finally:
        conn.close()
    print("db ok:", entry["id"], entry["title"])


if __name__ == "__main__":
    main()
