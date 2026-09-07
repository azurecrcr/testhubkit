"""检索 chunk 置信度归一化。"""
from __future__ import annotations


def compute_confidence(score: float, routes: list[str], max_score: float) -> float:
    if max_score <= 0:
        normalized = 0.0
    else:
        normalized = min(1.0, max(0.0, float(score) / float(max_score)))
    route_bonus = 0.15 if len(routes) >= 2 else (0.06 if routes else 0.0)
    return round(min(1.0, normalized * 0.85 + route_bonus), 4)
