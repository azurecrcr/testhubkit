"""从 docs 目录导入需求文档，构建向量库 + BM25 索引。"""
from __future__ import annotations

import json
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter

from core.services.rag import config as rag_config
from core.services.rag.embedder import embed_texts
from core.services.rag.tokenizer import tokenize


def collect_doc_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for pattern in ("**/*.md", "**/*.txt"):
        files.extend(root.glob(pattern))
    return sorted({p.resolve() for p in files if p.is_file()})


def run_ingest(docs_root: Path | None = None) -> dict:
    docs_root = docs_root or rag_config.docs_dir()
    knowledge_dir = rag_config.knowledge_dir()
    knowledge_dir.mkdir(parents=True, exist_ok=True)

    files = collect_doc_files(docs_root)
    if not files:
        raise FileNotFoundError(f"未找到文档: {docs_root}")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=rag_config.chunk_size(),
        chunk_overlap=rag_config.chunk_overlap(),
    )

    try:
        import chromadb
    except ImportError as exc:
        raise RuntimeError("未安装 chromadb，请 pip install chromadb") from exc

    chroma = chromadb.PersistentClient(path=str(knowledge_dir))
    name = rag_config.collection_name()
    try:
        chroma.delete_collection(name)
    except Exception:
        pass
    col = chroma.create_collection(name)

    all_ids: list[str] = []
    all_docs: list[str] = []
    all_metas: list[dict] = []
    all_tokenized: list[list[str]] = []
    total = 0

    for fp in files:
        text = fp.read_text(encoding="utf-8").strip()
        if not text:
            continue
        rel = fp.relative_to(docs_root).as_posix()
        chunks = splitter.split_text(text)
        vectors = embed_texts(chunks)
        ids = [f"{rel.replace('/', '__')}__{i}" for i in range(len(chunks))]
        metas = [{"source": rel, "chunk": i} for i in range(len(chunks))]
        col.add(ids=ids, documents=chunks, embeddings=vectors, metadatas=metas)
        all_ids.extend(ids)
        all_docs.extend(chunks)
        all_metas.extend(metas)
        all_tokenized.extend(tokenize(c) for c in chunks)
        total += len(chunks)

    bm25_path = rag_config.bm25_index_path()
    bm25_path.write_text(
        json.dumps(
            {
                "documents": all_docs,
                "metadatas": all_metas,
                "ids": all_ids,
                "tokenized": all_tokenized,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    try:
        from core.services.rag.service import invalidate_rag_status_cache
        from core.services.rag.status_snapshot import write_rag_status_snapshot
        from core.services.rag.service import get_rag_last_ingest_at

        invalidate_rag_status_cache()
        write_rag_status_snapshot(
            available=total > 0,
            chunk_count=int(total),
            last_ingest_at=get_rag_last_ingest_at(),
        )
    except Exception:
        pass

    return {
        "files": len(files),
        "chunks": total,
        "knowledge_dir": str(knowledge_dir),
        "collection": name,
    }
