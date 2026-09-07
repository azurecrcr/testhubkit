#!/usr/bin/env python3
"""若表为空则导入 scripts/builtin_prompts.json。"""
from __future__ import annotations

import sys

BASE = __file__.rsplit("scripts", 1)[0].rstrip("/\\")
if BASE:
    sys.path.insert(0, BASE)

from core.services.prompts.prompt_library_service import (  # noqa: E402
    _count_entries,
    init_prompt_library_storage,
    seed_default_entries_if_empty,
)

if __name__ == "__main__":
    init_prompt_library_storage()
    before = _count_entries()
    seed_default_entries_if_empty()
    after = _count_entries()
    print(f"prompt_library: {before} -> {after} entries")
