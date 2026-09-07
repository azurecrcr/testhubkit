#!/usr/bin/env python3
"""将 data/rag/docs 下的需求文档导入向量库 + BM25 索引。"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:
    pass

from core.services.rag.config import docs_dir
from core.services.rag.ingest import run_ingest


def main() -> int:
    parser = argparse.ArgumentParser(description="导入历史需求文档到 RAG 知识库")
    parser.add_argument(
        "--docs",
        default=str(docs_dir()),
        help="需求文档目录（默认 data/rag/docs）",
    )
    args = parser.parse_args()
    try:
        result = run_ingest(Path(args.docs))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
