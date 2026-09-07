"""Context Stack RAG 单元测试。"""
from __future__ import annotations

import unittest

from core.services.rag.confidence import compute_confidence
from core.services.rag.context_budget import allocate_layers, estimate_tokens
from core.services.rag.retriever import RetrievedChunk
from core.services.rag.service import serialize_retrieved_chunks


class TestContextStackRag(unittest.TestCase):
    def test_compute_confidence_dual_route(self):
        high = compute_confidence(0.05, ["vector", "bm25"], 0.05)
        low = compute_confidence(0.01, ["vector"], 0.05)
        self.assertGreater(high, low)
        self.assertLessEqual(high, 1.0)

    def test_serialize_retrieved_chunks(self):
        chunks = [
            RetrievedChunk(
                chunk_id="c1",
                text="hello world",
                source="demo.md",
                score=0.05,
                routes=["vector", "bm25"],
            )
        ]
        out = serialize_retrieved_chunks(chunks)
        self.assertEqual(out[0]["layer"], "public")
        self.assertIn("confidence", out[0])

    def test_allocate_layers(self):
        layers, budget = allocate_layers(
            {
                "requirements": {"text": "req " * 200, "chunks": []},
                "personal": {"text": "personal " * 100, "chunks": []},
                "public": {"text": "", "chunks": []},
            },
            stage="summary",
        )
        self.assertLessEqual(budget["used"], budget["cap"])
        self.assertTrue(layers["requirements"]["text"])


if __name__ == "__main__":
    unittest.main()
