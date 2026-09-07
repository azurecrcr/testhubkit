"""上下文 Token 预算裁剪。"""
from __future__ import annotations

import copy
from typing import Any

DEFAULT_BUDGET: dict[str, Any] = {
    "total_cap": 12000,
    "layer_ratio": {"requirements": 0.45, "personal": 0.35, "public": 0.20},
    "stage_multiplier": {
        "summary": {"requirements": 0.6, "personal": 0.3, "public": 0.2},
        "module": {"requirements": 0.8, "personal": 0.7, "public": 0.6},
        "row": {"requirements": 0.5, "personal": 0.5, "public": 0.4},
    },
    "min_requirements_tokens": 800,
}


def estimate_tokens(text: str) -> int:
    t = str(text or "")
    if not t:
        return 0
    return max(1, len(t) // 4)


def _merge_budget(config: dict[str, Any] | None) -> dict[str, Any]:
    base = copy.deepcopy(DEFAULT_BUDGET)
    if not config:
        return base
    if config.get("total_cap") is not None:
        base["total_cap"] = int(config["total_cap"])
    if isinstance(config.get("layer_ratio"), dict):
        base["layer_ratio"].update(config["layer_ratio"])
    if isinstance(config.get("stage_multiplier"), dict):
        base["stage_multiplier"].update(config["stage_multiplier"])
    if config.get("min_requirements_tokens") is not None:
        base["min_requirements_tokens"] = int(config["min_requirements_tokens"])
    return base


def _trim_text(text: str, token_cap: int) -> str:
    if token_cap <= 0:
        return ""
    char_cap = max(1, token_cap * 4)
    t = str(text or "")
    if len(t) <= char_cap:
        return t
    if char_cap <= 80:
        return t[:char_cap]
    head = t[: char_cap // 2]
    tail = t[-(char_cap // 2) :]
    return head + "\n…（已裁剪）\n" + tail


def _trim_chunks(chunks: list[dict], token_cap: int) -> tuple[list[dict], str]:
    if token_cap <= 0 or not chunks:
        return [], ""
    kept: list[dict] = []
    used = 0
    parts: list[str] = []
    for chunk in chunks:
        text = str(chunk.get("text") or "")
        need = estimate_tokens(text)
        if used + need > token_cap:
            remain = token_cap - used
            if remain < 80:
                break
            trimmed = _trim_text(text, remain)
            if trimmed:
                c = dict(chunk)
                c["text"] = trimmed
                c["preview"] = trimmed[:240]
                kept.append(c)
                parts.append(trimmed)
            break
        kept.append(chunk)
        parts.append(text)
        used += need
    return kept, "\n\n---\n\n".join(parts)


def allocate_layers(
    layers: dict[str, dict[str, Any]],
    *,
    stage: str = "module",
    budget_config: dict[str, Any] | None = None,
) -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    cfg = _merge_budget(budget_config)
    stage = str(stage or "module").strip().lower()
    if stage not in cfg["stage_multiplier"]:
        stage = "module"
    multipliers = cfg["stage_multiplier"][stage]
    total_cap = int(cfg["total_cap"])
    ratios = cfg["layer_ratio"]

    req_text = str((layers.get("requirements") or {}).get("text") or "")
    personal = layers.get("personal") or {}
    public = layers.get("public") or {}

    req_cap = max(
        int(cfg["min_requirements_tokens"] * multipliers.get("requirements", 1)),
        int(total_cap * ratios.get("requirements", 0.45) * multipliers.get("requirements", 1)),
    )
    personal_cap = int(total_cap * ratios.get("personal", 0.35) * multipliers.get("personal", 1))
    public_cap = int(total_cap * ratios.get("public", 0.20) * multipliers.get("public", 1))

    req_out = _trim_text(req_text, req_cap)
    personal_chunks, personal_text = _trim_chunks(
        list(personal.get("chunks") or []), personal_cap
    )
    public_chunks, public_text = _trim_chunks(list(public.get("chunks") or []), public_cap)

    out = {
        "requirements": {
            "tokens": estimate_tokens(req_out),
            "text": req_out,
            "chunks": [],
        },
        "personal": {
            "tokens": estimate_tokens(personal_text),
            "text": personal_text,
            "chunks": personal_chunks,
        },
        "public": {
            "tokens": estimate_tokens(public_text),
            "text": public_text,
            "chunks": public_chunks,
        },
    }
    used = out["requirements"]["tokens"] + out["personal"]["tokens"] + out["public"]["tokens"]
    budget = {
        "used": used,
        "cap": total_cap,
        "by_layer": {
            "requirements": out["requirements"]["tokens"],
            "personal": out["personal"]["tokens"],
            "public": out["public"]["tokens"],
        },
    }
    return out, budget
