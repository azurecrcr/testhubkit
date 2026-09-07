#!/usr/bin/env python3
"""将 ssh-key-deploy/SKILL.md 同步到提示词库（JSON 种子 + MySQL upsert）。"""
from __future__ import annotations

import json
import sys

BASE = __file__.rsplit("scripts", 1)[0].rstrip("/\\")
if BASE:
    sys.path.insert(0, BASE)

from core.services.prompts.prompt_library_db import ensure_prompt_table  # noqa: E402
from core.services.prompts.prompt_library_service import (  # noqa: E402
    SSH_KEY_DEPLOY_ENTRY_ID,
    get_ssh_key_deploy_seed_entry,
    upsert_prompt_entry,
)

BUILTIN_JSON = BASE + "/scripts/builtin_prompts.json"


def sync_builtin_json(entry: dict) -> None:
    with open(BUILTIN_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("builtin_prompts.json must be a list")
    found = False
    for i, item in enumerate(data):
        if isinstance(item, dict) and item.get("id") == SSH_KEY_DEPLOY_ENTRY_ID:
            data[i] = {
                "id": entry["id"],
                "entry_type": entry["entry_type"],
                "category": entry["category"],
                "kicker": entry["kicker"],
                "title": entry["title"],
                "tags": entry["tags"],
                "blurb": entry["blurb"],
                "body": entry["body"],
            }
            found = True
            break
    if not found:
        data.append(
            {
                "id": entry["id"],
                "entry_type": entry["entry_type"],
                "category": entry["category"],
                "kicker": entry["kicker"],
                "title": entry["title"],
                "tags": entry["tags"],
                "blurb": entry["blurb"],
                "body": entry["body"],
            }
        )
    with open(BUILTIN_JSON, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--json-only", action="store_true", help="仅更新 builtin_prompts.json，不写数据库")
    args = parser.parse_args()

    entry = get_ssh_key_deploy_seed_entry()
    if not entry.get("body"):
        raise SystemExit("ssh-key-deploy/SKILL.md not found or empty")
    sync_builtin_json(entry)
    print("json:", BUILTIN_JSON)
    if args.json_only:
        return
    ensure_prompt_table()
    item = upsert_prompt_entry(entry)
    print("db:", item["id"], item["title"])


if __name__ == "__main__":
    main()
