#!/usr/bin/env python3
"""在服务器上启用 RAG 环境变量（不改动其他 compose 配置）。"""
import re
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: patch_rag_compose.py <embed_base_url> <embed_api_key> <embed_model>", file=sys.stderr)
        return 1
    base, api_key, embed = sys.argv[1:4]
    compose = Path("/root/TestHub/docker-compose.yml")
    text = compose.read_text(encoding="utf-8")
    text = re.sub(r'RAG_ENABLED: "[^"]*"', 'RAG_ENABLED: "1"', text)
    for name, val in (
        ("RAG_EMBED_BASE_URL", base),
        ("RAG_EMBED_API_KEY", api_key),
        ("RAG_EMBED_MODEL", embed),
    ):
        pattern = rf"^(\s*{re.escape(name)}:).*"
        if re.search(pattern, text, re.M):
            text = re.sub(pattern, rf"\1 {val}", text, flags=re.M)
        else:
            text = text.replace(
                '      RAG_ENABLED: "1"\n',
                f'      RAG_ENABLED: "1"\n      {name}: {val}\n',
            )
    compose.write_text(text, encoding="utf-8")
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
