#!/usr/bin/env python3
"""为文档工具页生成整页背景图（OpenAI 兼容 images/generations）。"""
from __future__ import annotations

import argparse
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from core.services.ai.builtin_image_service import (  # noqa: E402
    DOC_TOOLS_PAGE_ASPECT,
    generate_image_png,
    pick_landscape_size,
)

OUT_DIR = os.path.join(ROOT, "static", "images", "doc-tools")
OUT_FILE = os.path.join(OUT_DIR, "doc-tools-page-bg.png")

DOC_TOOLS_BG_PROMPT = (
    "Wide cinematic full-page website background for a professional developer toolkit page "
    "about Excel document automation: batch column fill, spreadsheet rows and columns, "
    "clean data preview table, subtle excel grid and document icons, emerald and cyan "
    "accent glow on dark slate blue base, soft abstract geometric mesh, minimal UI mood, "
    "no text, no letters, no watermark, no people, high-end SaaS aesthetic, soft depth, "
    "plenty of negative space in center for overlay UI cards"
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--width", type=int, default=1920, help="目标页面参考宽度")
    parser.add_argument("--height", type=int, default=1080, help="目标页面参考高度")
    parser.add_argument("--model", type=str, default="", help="覆盖 BUILTIN_AI_IMAGE_MODEL")
    parser.add_argument("--prompt", type=str, default=DOC_TOOLS_BG_PROMPT)
    parser.add_argument("--dry-run", action="store_true", help="仅打印尺寸与提示词")
    args = parser.parse_args()

    size = pick_landscape_size(args.width, args.height)
    print(f"target aspect: {args.width}x{args.height} ({args.width / args.height:.3f})")
    print(f"api size: {size}")
    print(f"prompt: {args.prompt[:120]}...")

    if args.dry_run:
        return

    png = generate_image_png(
        args.prompt,
        width=args.width,
        height=args.height,
        model=args.model or None,
    )
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_FILE, "wb") as f:
        f.write(png)
    print(f"saved: {OUT_FILE} ({len(png)} bytes)")


if __name__ == "__main__":
    main()
