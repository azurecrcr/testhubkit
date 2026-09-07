from __future__ import annotations

from openai import OpenAI

from core.services.rag import config as rag_config

_EMBED_BATCH_SIZE = 10


def get_embed_client() -> OpenAI:
    api_key = rag_config.embed_api_key()
    base_url = rag_config.embed_base_url()
    if not api_key or not base_url:
        raise RuntimeError("未配置 RAG Embedding API（RAG_EMBED_* 或 LLM_API_*）")
    return OpenAI(api_key=api_key, base_url=base_url, timeout=60.0)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = get_embed_client()
    model = rag_config.embed_model()
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), _EMBED_BATCH_SIZE):
        batch = texts[i : i + _EMBED_BATCH_SIZE]
        resp = client.embeddings.create(model=model, input=batch)
        all_embeddings.extend(item.embedding for item in resp.data)
    return all_embeddings
