"""多路召回：向量检索 + BM25，RRF 融合。"""
from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from typing import Any

from core.services.rag import config as rag_config
from core.services.rag.embedder import embed_texts
from core.services.rag.tokenizer import tokenize

_lock = threading.Lock()
_bm25_cache: dict[str, Any] = {"mtime": None, "bm25": None, "docs": None, "metas": None, "ids": None}


@dataclass
class RetrievedChunk:
    chunk_id: str
    text: str
    source: str
    score: float
    routes: list[str]


def _load_bm25_index():
    path = rag_config.bm25_index_path()
    if not path.is_file():
        return None, [], [], []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, [], [], []
    docs = payload.get("documents") or []
    metas = payload.get("metadatas") or []
    ids = payload.get("ids") or []
    tokenized = payload.get("tokenized") or [tokenize(d) for d in docs]
    try:
        from rank_bm25 import BM25Okapi
    except ImportError:
        return None, docs, metas, ids
    bm25 = BM25Okapi(tokenized) if tokenized else None
    return bm25, docs, metas, ids


def _get_bm25():
    path = rag_config.bm25_index_path()
    mtime = path.stat().st_mtime if path.is_file() else None
    with _lock:
        if _bm25_cache["mtime"] == mtime and _bm25_cache["bm25"] is not None:
            return (
                _bm25_cache["bm25"],
                _bm25_cache["docs"],
                _bm25_cache["metas"],
                _bm25_cache["ids"],
            )
        bm25, docs, metas, ids = _load_bm25_index()
        _bm25_cache.update(
            {"mtime": mtime, "bm25": bm25, "docs": docs, "metas": metas, "ids": ids}
        )
        return bm25, docs, metas, ids


def _vector_search(query: str, top_k: int) -> list[tuple[str, float]]:
    try:
        import chromadb
    except ImportError:
        return []
    kdir = rag_config.knowledge_dir()
    if not kdir.is_dir():
        return []
    try:
        col = chromadb.PersistentClient(path=str(kdir)).get_collection(
            rag_config.collection_name()
        )
    except Exception:
        return []
    try:
        qvec = embed_texts([query])[0]
        hits = col.query(query_embeddings=[qvec], n_results=min(top_k, 50))
    except Exception:
        return []
    ids = (hits.get("ids") or [[]])[0]
    dists = (hits.get("distances") or [[]])[0]
    out: list[tuple[str, float]] = []
    for cid, dist in zip(ids, dists):
        try:
            score = 1.0 / (1.0 + float(dist))
        except (TypeError, ValueError):
            score = 0.0
        out.append((cid, score))
    return out


def _bm25_search(query: str, top_k: int) -> list[tuple[str, float]]:
    bm25, docs, _metas, ids = _get_bm25()
    if bm25 is None or not ids:
        return []
    tokens = tokenize(query)
    if not tokens:
        return []
    scores = bm25.get_scores(tokens)
    ranked = sorted(zip(ids, scores), key=lambda x: x[1], reverse=True)
    return [(cid, float(score)) for cid, score in ranked[:top_k] if score > 0]


def _rrf_merge(*ranked_lists: list[tuple[str, float]], k: int = 60) -> dict[str, float]:
    fused: dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, (cid, _raw) in enumerate(ranked):
            fused[cid] = fused.get(cid, 0.0) + 1.0 / (k + rank + 1)
    return fused


def _resolve_chunks(chunk_ids: list[str]) -> dict[str, RetrievedChunk]:
    resolved: dict[str, RetrievedChunk] = {}
    try:
        import chromadb
    except ImportError:
        chromadb = None
    if chromadb is not None:
        kdir = rag_config.knowledge_dir()
        if kdir.is_dir():
            try:
                col = chromadb.PersistentClient(path=str(kdir)).get_collection(
                    rag_config.collection_name()
                )
                data = col.get(ids=chunk_ids, include=["documents", "metadatas"])
                for cid, doc, meta in zip(
                    data.get("ids") or [],
                    data.get("documents") or [],
                    data.get("metadatas") or [],
                ):
                    meta = meta or {}
                    resolved[cid] = RetrievedChunk(
                        chunk_id=cid,
                        text=str(doc or ""),
                        source=str(meta.get("source") or "unknown"),
                        score=0.0,
                        routes=[],
                    )
            except Exception:
                pass
    bm25, docs, metas, ids = _get_bm25()
    id_to_idx = {cid: i for i, cid in enumerate(ids)}
    for cid in chunk_ids:
        if cid in resolved:
            continue
        idx = id_to_idx.get(cid)
        if idx is None:
            continue
        meta = metas[idx] if idx < len(metas) else {}
        resolved[cid] = RetrievedChunk(
            chunk_id=cid,
            text=str(docs[idx] or ""),
            source=str((meta or {}).get("source") or "unknown"),
            score=0.0,
            routes=[],
        )
    return resolved


def multi_route_retrieve(query: str, top_k: int | None = None) -> list[RetrievedChunk]:
    q = str(query or "").strip()
    if not q:
        return []
    k = top_k if top_k is not None else rag_config.default_top_k()
    fetch_k = max(k * 3, 15)

    vector_ranked = _vector_search(q, fetch_k)
    bm25_ranked = _bm25_search(q, fetch_k)

    vector_ids = [cid for cid, _ in vector_ranked]
    bm25_ids = [cid for cid, _ in bm25_ranked]
    fused = _rrf_merge(vector_ranked, bm25_ranked)

    for cid in vector_ids:
        if cid in fused:
            fused[cid] += 0.001
    for cid in bm25_ids:
        if cid in fused:
            fused[cid] += 0.001

    ordered_ids = sorted(fused.keys(), key=lambda x: fused[x], reverse=True)[:k]
    chunks_map = _resolve_chunks(ordered_ids)
    vector_set = set(vector_ids)
    bm25_set = set(bm25_ids)

    out: list[RetrievedChunk] = []
    for cid in ordered_ids:
        chunk = chunks_map.get(cid)
        if not chunk or not chunk.text.strip():
            continue
        routes = []
        if cid in vector_set:
            routes.append("vector")
        if cid in bm25_set:
            routes.append("bm25")
        chunk.score = fused.get(cid, 0.0)
        chunk.routes = routes
        out.append(chunk)
    return out
