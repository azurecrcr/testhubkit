"""中文友好分词：用于 BM25 关键词一路召回。"""
from __future__ import annotations

import re


def tokenize(text: str) -> list[str]:
    raw = str(text or "").lower()
    tokens: list[str] = []
    tokens.extend(re.findall(r"[\u4e00-\u9fff]", raw))
    tokens.extend(re.findall(r"[\u4e00-\u9fff]{2}", raw))
    tokens.extend(re.findall(r"[a-z0-9_]+", raw))
    if not tokens and raw.strip():
        tokens.append(raw.strip()[:32])
    return tokens
