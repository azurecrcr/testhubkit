#!/usr/bin/env python3
"""扫描 bundle 内已删除模块引用（硬门禁）"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "static" / "dist" / "jms-load-test"
# 仅拦截已删除且不应再被调用的符号
HARD = [
    (r"JmsTgIfControllerUi", "deleted TG If UI"),
    (r"JmsHttpStepAssertionUi", "deleted HTTP assertion UI"),
    (r"JmsHttpCardToggle", "deleted HTTP card toggle"),
    (r"jms_http_context_ui\.js", "deleted context ui path"),
]

def main():
    files = [DIST / "jms-load-test-a.js", DIST / "jms-load-test-b.js"]
    hits = []
    for fp in files:
        if not fp.is_file():
            continue
        text = fp.read_text(encoding="utf-8", errors="ignore")
        for pat, label in HARD:
            if re.search(pat, text):
                hits.append((fp.name, label, pat))
    if hits:
        for h in hits:
            print("HARD_HIT", *h)
        sys.exit(1)
    print("SCAN_LEGACY_REFS_PASS hard_hits=0")

if __name__ == "__main__":
    main()
