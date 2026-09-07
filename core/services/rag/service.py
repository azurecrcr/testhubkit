"""RAG 对外服务：检索历史需求并格式化为 prompt 片段。"""
from __future__ import annotations

import threading
import time

from core.services.rag import config as rag_config
from core.services.rag.confidence import compute_confidence
from core.services.rag.retriever import RetrievedChunk, multi_route_retrieve

# /api/rag/status 会同时读 available + chunk_count；Chroma PersistentClient 很重，
# 进程内短 TTL + 单例客户端，避免首屏重复打开向量库。
_STATUS_TTL_SEC = 30.0
_status_lock = threading.Lock()
_status_cache: dict[str, object] = {"expires": 0.0, "available": False, "chunk_count": 0}
_chroma_client = None
_chroma_client_path: str | None = None


def invalidate_rag_status_cache() -> None:
    with _status_lock:
        _status_cache["expires"] = 0.0


def _get_chroma_collection():
    """复用 PersistentClient，避免每次 status 重新加载索引。"""
    global _chroma_client, _chroma_client_path
    kdir = rag_config.knowledge_dir()
    if not kdir.is_dir():
        return None
    path = str(kdir)
    import chromadb

    with _status_lock:
        if _chroma_client is None or _chroma_client_path != path:
            _chroma_client = chromadb.PersistentClient(path=path)
            _chroma_client_path = path
        client = _chroma_client
    return client.get_collection(rag_config.collection_name())


def _read_chroma_status() -> tuple[bool, int]:
    if not rag_config.rag_enabled():
        return False, 0
    try:
        col = _get_chroma_collection()
        if col is None:
            return False, 0
        count = int(col.count())
        return count > 0, count
    except ImportError:
        return False, 0
    except Exception:
        return False, 0


def _cached_chroma_status() -> tuple[bool, int]:
    now = time.monotonic()
    with _status_lock:
        if float(_status_cache["expires"]) > now:
            return bool(_status_cache["available"]), int(_status_cache["chunk_count"])
    available, count = _read_chroma_status()
    with _status_lock:
        _status_cache["available"] = available
        _status_cache["chunk_count"] = count
        _status_cache["expires"] = time.monotonic() + _STATUS_TTL_SEC
    return available, count


def probe_chroma_status() -> tuple[bool, int]:
    """直接探测 Chroma（供快照刷新）；检索逻辑勿用此绕过缓存。"""
    return _read_chroma_status()


def get_rag_chunk_count() -> int:
    return _cached_chroma_status()[1]


def get_rag_last_ingest_at() -> str | None:
    path = rag_config.bm25_index_path()
    if not path.is_file():
        return None
    try:
        from datetime import datetime, timezone

        mtime = path.stat().st_mtime
        return datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat(timespec="seconds")
    except OSError:
        return None


def is_rag_available() -> bool:
    return _cached_chroma_status()[0]


def retrieve_legacy_requirements(query: str, top_k: int | None = None) -> list[RetrievedChunk]:
    if not rag_config.rag_enabled():
        return []
    try:
        return multi_route_retrieve(query, top_k=top_k)
    except Exception:
        return []


def format_retrieval_context(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return ""
    parts: list[str] = []
    for i, chunk in enumerate(chunks, 1):
        route = "+".join(chunk.routes) if chunk.routes else "unknown"
        parts.append(
            f"[片段{i} | 来源: {chunk.source} | 召回: {route}]\n{chunk.text.strip()}"
        )
    return "\n\n---\n\n".join(parts)


def serialize_retrieved_chunks(chunks: list[RetrievedChunk]) -> list[dict]:
    if not chunks:
        return []
    max_score = max((c.score for c in chunks), default=0.0)
    out: list[dict] = []
    for chunk in chunks:
        text = str(chunk.text or "")
        confidence = compute_confidence(chunk.score, chunk.routes, max_score)
        out.append(
            {
                "id": chunk.chunk_id,
                "layer": "public",
                "source": chunk.source,
                "source_type": "file",
                "text": text,
                "preview": text[:240],
                "score": round(chunk.score, 6),
                "confidence": confidence,
                "routes": list(chunk.routes or []),
            }
        )
    return out
