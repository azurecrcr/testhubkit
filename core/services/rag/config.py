"""RAG 配置：知识库路径、Embedding API、多路召回参数。"""
from __future__ import annotations

import os
from pathlib import Path

_APP_ROOT = Path(__file__).resolve().parents[3]


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _env_bool(name: str, default: str = "0") -> bool:
    return _env(name, default).lower() in ("1", "true", "yes", "on")


def rag_enabled() -> bool:
    return _env_bool("RAG_ENABLED", "0")


def context_stack_enabled() -> bool:
    """三层上下文 Stack；默认关闭以保持 legacy 行为。"""
    return _env_bool("CONTEXT_STACK_ENABLED", "0")


def admin_rag_no_password() -> bool:
    return _env_bool("ADMIN_RAG_NO_PASSWORD", "1")


def knowledge_dir() -> Path:
    raw = _env("RAG_KNOWLEDGE_DIR") or str(_APP_ROOT / "data" / "rag" / "knowledge")
    return Path(raw)


def docs_dir() -> Path:
    raw = _env("RAG_DOCS_DIR") or str(_APP_ROOT / "data" / "rag" / "docs")
    return Path(raw)


def collection_name() -> str:
    return _env("RAG_COLLECTION", "default")


def embed_base_url() -> str:
    return _env("RAG_EMBED_BASE_URL") or _env("LLM_API_BASE_URL") or _env("OPENAI_BASE_URL")


def embed_api_key() -> str:
    return _env("RAG_EMBED_API_KEY") or _env("LLM_API_KEY") or _env("OPENAI_API_KEY")


def embed_model() -> str:
    return _env("RAG_EMBED_MODEL") or _env("EMBED_MODEL") or "text-embedding-v3"


def default_top_k() -> int:
    try:
        return max(1, min(20, int(_env("RAG_TOP_K", "5"))))
    except ValueError:
        return 5


def chunk_size() -> int:
    try:
        return max(200, int(_env("RAG_CHUNK_SIZE", "600")))
    except ValueError:
        return 600


def chunk_overlap() -> int:
    try:
        return max(0, int(_env("RAG_CHUNK_OVERLAP", "80")))
    except ValueError:
        return 80


def bm25_index_path() -> Path:
    return knowledge_dir() / "bm25_index.json"
