#!/usr/bin/env python3
import os
ROOT = "/root/TestHub"

def read(rel):
    with open(os.path.join(ROOT, rel), "r", encoding="utf-8-sig") as f:
        return f.read()

def write(rel, text):
    path = os.path.join(ROOT, rel)
    if not os.path.isdir(os.path.dirname(path)):
        os.makedirs(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print("patched", rel)

init = read("core/blueprints/api/__init__.py")
if "user_ai_config" not in init:
    init = init.replace(
        "        auth,\n        builtin_ai,",
        "        auth,\n        user_ai_config,\n        builtin_ai,",
    )
    init = init.replace(
        "    auth.register_routes(api_bp)\n",
        "    auth.register_routes(api_bp)\n    user_ai_config.register_routes(api_bp)\n",
    )
    write("core/blueprints/api/__init__.py", init)

gen = read("core/blueprints/api/test_cases/generator.py")
if "resolve_text_ai_credentials" not in gen:
    gen = gen.replace(
        "from core.config.ai_preset import get_builtin_ai_config\n",
        "from core.config.user_ai_credentials import (\n    UserAiConfigRequired,\n    resolve_text_ai_credentials,\n    user_ai_config_error_response,\n)\nfrom core.services.auth.auth_session import get_current_user_id\n",
    )
    old = """            if use_builtin:
                cfg = get_builtin_ai_config()
                base_url = cfg["base_url"]
                api_key = cfg["api_key"]
                model = cfg["model"]
                temperature_raw = cfg["temperature"]
                images = []"""
    new = """            if use_builtin:
                try:
                    ai_cfg = resolve_text_ai_credentials(
                        data if request.is_json else {"use_builtin": True},
                        get_current_user_id(),
                    )
                except UserAiConfigRequired as exc:
                    body, code = user_ai_config_error_response(exc)
                    return jsonify(body), code
                base_url = ai_cfg["base_url"]
                api_key = ai_cfg["api_key"]
                model = ai_cfg["model"]
                temperature_raw = ai_cfg["temperature"]
                images = []"""
    gen = gen.replace(old, new)
    write("core/blueprints/api/test_cases/generator.py", gen)

rag = read("core/blueprints/api/rag.py")
if "resolve_text_ai_credentials" not in rag:
    rag = rag.replace(
        "from core.config.ai_preset import get_builtin_ai_config\n",
        "from core.config.user_ai_credentials import (\n    UserAiConfigRequired,\n    resolve_text_ai_credentials,\n    user_ai_config_error_response,\n)\nfrom core.services.auth.auth_session import get_current_user_id\n",
    )
    old = """            use_builtin = bool(data.get("use_builtin"))
            if use_builtin:
                cfg = get_builtin_ai_config()
                base_url = str(cfg.get("base_url") or "")
                api_key = str(cfg.get("api_key") or "")
                model = str(cfg.get("model") or "")
                temperature_raw = cfg.get("temperature")
            else:
                base_url = str(data.get("base_url") or "").strip()
                api_key = str(data.get("api_key") or "").strip()
                model = str(data.get("model") or "").strip()
                temperature_raw = data.get("temperature")"""
    new = """            use_builtin = bool(data.get("use_builtin"))
            try:
                ai_cfg = resolve_text_ai_credentials(data, get_current_user_id())
            except UserAiConfigRequired as exc:
                body, code = user_ai_config_error_response(exc)
                return jsonify({"query": "", **body}), code
            base_url = str(ai_cfg.get("base_url") or "")
            api_key = str(ai_cfg.get("api_key") or "")
            model = str(ai_cfg.get("model") or "")
            temperature_raw = ai_cfg.get("temperature")"""
    rag = rag.replace(old, new)
    write("core/blueprints/api/rag.py", rag)

cov = read("core/blueprints/api/test_cases/coverage.py")
if "user_id=get_current_user_id()" not in cov:
    cov = cov.replace(
        "from flask import Blueprint, jsonify, request\n",
        "from flask import Blueprint, jsonify, request\n\nfrom core.services.auth.auth_session import get_current_user_id\n",
    )
    cov = cov.replace(
        "            matrix = analyze_coverage(\n                requirements=requirements,",
        "            matrix = analyze_coverage(\n                user_id=get_current_user_id(),\n                requirements=requirements,",
    )
    write("core/blueprints/api/test_cases/coverage.py", cov)

ctm = read("core/blueprints/api/test_cases/case_to_mindmap.py")
if "resolve_text_ai_credentials" not in ctm:
    if "get_current_user_id" not in ctm:
        ctm = "from core.services.auth.auth_session import get_current_user_id\n" + ctm
    old = """            use_builtin = bool(data.get("use_builtin"))
            if use_builtin:
                from core.config.ai_preset import get_builtin_ai_config

                cfg = get_builtin_ai_config()
                base_url = str(cfg.get("base_url") or "").strip()
                api_key = str(cfg.get("api_key") or "").strip()
                model = str(cfg.get("model") or "").strip()
                temperature = _parse_temperature_optional(cfg.get("temperature"))
            else:
                base_url = (data.get("base_url") or "").strip()
                api_key = (data.get("api_key") or "").strip()
                model = (data.get("model") or "").strip()
                try:
                    temperature = _parse_temperature_optional(data.get("temperature"))
                except ValueError as exc:
                    return jsonify({"error": str(exc)}), 400
                try:
                    _validate_ai_credentials(base_url, api_key, model)
                except ValueError as exc:
                    return jsonify({"error": str(exc)}), 400"""
    new = """            use_builtin = bool(data.get("use_builtin"))
            try:
                from core.config.user_ai_credentials import (
                    UserAiConfigRequired,
                    resolve_text_ai_credentials,
                    user_ai_config_error_response,
                )

                ai_cfg = resolve_text_ai_credentials(data, get_current_user_id())
            except UserAiConfigRequired as exc:
                body, code = user_ai_config_error_response(exc)
                return jsonify(body), code
            base_url = str(ai_cfg.get("base_url") or "").strip()
            api_key = str(ai_cfg.get("api_key") or "").strip()
            model = str(ai_cfg.get("model") or "").strip()
            temperature = _parse_temperature_optional(ai_cfg.get("temperature"))
            if not use_builtin:
                try:
                    _validate_ai_credentials(base_url, api_key, model)
                except ValueError as exc:
                    return jsonify({"error": str(exc)}), 400"""
    ctm = ctm.replace(old, new)
    write("core/blueprints/api/test_cases/case_to_mindmap.py", ctm)

agent = read("core/services/test_cases/agent_orchestrator_service.py")
if "resolve_text_ai_credentials" not in agent:
    agent = agent.replace(
        "from core.config.ai_preset import get_builtin_ai_config\n",
        "from core.config.user_ai_credentials import UserAiConfigRequired, resolve_text_ai_credentials\n",
    )
    old_fn = """def _resolve_ai_config(data: dict[str, Any]) -> dict[str, Any]:
    use_builtin = bool(data.get("use_builtin", True))
    cfg: dict[str, Any] = {
        "use_builtin": use_builtin,
        "base_url": str(data.get("base_url") or "").strip(),
        "api_key": str(data.get("api_key") or "").strip(),
        "model": str(data.get("model") or "").strip(),
        "temperature": data.get("temperature"),
    }
    if use_builtin:
        builtin = get_builtin_ai_config()
        cfg["base_url"] = str(builtin.get("base_url") or "")
        cfg["api_key"] = str(builtin.get("api_key") or "")
        cfg["model"] = str(builtin.get("model") or "")
        try:
            cfg["temperature"] = float(builtin.get("temperature") or 0.1)
        except (TypeError, ValueError):
            cfg["temperature"] = 0.1
    else:
        temp = cfg["temperature"]
        if temp is not None and temp != "":
            try:
                cfg["temperature"] = float(temp)
            except (TypeError, ValueError):
                cfg["temperature"] = 0.1
        else:
            cfg["temperature"] = None
    return cfg"""
    new_fn = """def _resolve_ai_config(data: dict[str, Any], user_id: str | None = None) -> dict[str, Any]:
    try:
        return resolve_text_ai_credentials(data, user_id)
    except UserAiConfigRequired:
        raise RuntimeError("请先配置 AI")"""
    agent = agent.replace(old_fn, new_fn)
    agent = agent.replace(
        "    job_id = _new_id()\n    now = _now()\n    step_defs = _build_step_plan(mode)",
        "    try:\n        _resolve_ai_config(data, user_id)\n    except RuntimeError as exc:\n        raise ValueError(str(exc)) from exc\n\n    job_id = _new_id()\n    now = _now()\n    step_defs = _build_step_plan(mode)",
    )
    agent = agent.replace(
        "        ai = _resolve_ai_config(request_data)\n        if not ai[\"base_url\"] or not ai[\"api_key\"] or not ai[\"model\"]:\n            raise RuntimeError(\"AI 配置不完整\")\n        update_job_status(job_id, \"running\", now=_now())\n        job = get_job(job_id)\n        if not job:\n            return",
        "        job = get_job(job_id)\n        ai = _resolve_ai_config(request_data, (job or {}).get(\"user_id\"))\n        if not ai[\"base_url\"] or not ai[\"api_key\"] or not ai[\"model\"]:\n            raise RuntimeError(\"AI 配置不完整\")\n        update_job_status(job_id, \"running\", now=_now())\n        if not job:\n            return",
    )
    agent = agent.replace(
        "    options.setdefault(\"use_llm_validate\", bool(data.get(\"use_llm_validate\", True)))",
        "    options.setdefault(\"use_llm_validate\", bool(data.get(\"use_llm_validate\", True)))\n    options.setdefault(\"use_builtin\", bool(data.get(\"use_builtin\", True)))\n    if not options.get(\"use_builtin\"):\n        options.setdefault(\"base_url\", str(data.get(\"base_url\") or \"\").strip())\n        options.setdefault(\"api_key\", str(data.get(\"api_key\") or \"\").strip())\n        options.setdefault(\"model\", str(data.get(\"model\") or \"\").strip())\n        options.setdefault(\"temperature\", data.get(\"temperature\"))",
    )
    agent = agent.replace(
        "    thread = threading.Thread(target=_run_job, args=(job_id, {\"use_builtin\": True}), daemon=True)",
        "    req = {\"use_builtin\": bool((job.get(\"options\") or {}).get(\"use_builtin\", True))}\n    if not req[\"use_builtin\"]:\n        req.update({\n            \"base_url\": (job.get(\"options\") or {}).get(\"base_url\", \"\"),\n            \"api_key\": (job.get(\"options\") or {}).get(\"api_key\", \"\"),\n            \"model\": (job.get(\"options\") or {}).get(\"model\", \"\"),\n            \"temperature\": (job.get(\"options\") or {}).get(\"temperature\"),\n        })\n    thread = threading.Thread(target=_run_job, args=(job_id, req), daemon=True)",
    )
    write("core/services/test_cases/agent_orchestrator_service.py", agent)

vs = read("core/services/test_cases/validation_service.py")
if "resolve_text_ai_credentials" not in vs:
    vs = vs.replace(
        "from core.config.ai_preset import get_builtin_ai_config\n",
        "from core.config.user_ai_credentials import resolve_text_ai_credentials\n",
    )
    vs = vs.replace(
        "    scope_hint: str = \"\",\n) -> list[dict[str, Any]]:",
        "    scope_hint: str = \"\",\n    user_id: str | None = None,\n) -> list[dict[str, Any]]:",
    )
    vs = vs.replace(
        "    if use_builtin:\n        cfg = get_builtin_ai_config()\n        base_url = str(cfg.get(\"base_url\") or \"\")\n        api_key = str(cfg.get(\"api_key\") or \"\")\n        model = str(cfg.get(\"model\") or \"\")\n        try:\n            temperature = float(cfg.get(\"temperature\") or 0.1)\n        except (TypeError, ValueError):\n            temperature = 0.1",
        "    if use_builtin:\n        try:\n            ai_cfg = resolve_text_ai_credentials({\"use_builtin\": True}, user_id)\n            base_url = str(ai_cfg.get(\"base_url\") or \"\")\n            api_key = str(ai_cfg.get(\"api_key\") or \"\")\n            model = str(ai_cfg.get(\"model\") or \"\")\n            temperature = float(ai_cfg.get(\"temperature\") or 0.1)\n        except Exception:\n            return []",
    )
    vs = vs.replace(
        "            scope_hint=llm_scope_hint,\n        )",
        "            scope_hint=llm_scope_hint,\n            user_id=user_id,\n        )",
    )
    write("core/services/test_cases/validation_service.py", vs)

cms = read("core/services/test_cases/coverage_matrix_service.py")
if "resolve_text_ai_credentials" not in cms:
    cms = cms.replace(
        "from core.config.ai_preset import get_builtin_ai_config\n",
        "from core.config.user_ai_credentials import resolve_text_ai_credentials\n",
    )
    cms = cms.replace(
        "    temperature: float | None = 0.1,\n) -> dict[str, Any]:",
        "    temperature: float | None = 0.1,\n    user_id: str | None = None,\n) -> dict[str, Any]:",
    )
    cms = cms.replace(
        "    if use_builtin:\n        builtin = get_builtin_ai_config()\n        base_url = str(builtin.get(\"base_url\") or base_url)\n        api_key = str(builtin.get(\"api_key\") or api_key)\n        model = str(builtin.get(\"model\") or model)\n        try:\n            temperature = float(builtin.get(\"temperature\") or temperature or 0.1)\n        except (TypeError, ValueError):\n            temperature = 0.1",
        "    if use_builtin:\n        ai_cfg = resolve_text_ai_credentials({\"use_builtin\": True}, user_id)\n        base_url = str(ai_cfg.get(\"base_url\") or base_url)\n        api_key = str(ai_cfg.get(\"api_key\") or api_key)\n        model = str(ai_cfg.get(\"model\") or model)\n        temperature = float(ai_cfg.get(\"temperature\") or temperature or 0.1)",
    )
    write("core/services/test_cases/coverage_matrix_service.py", cms)

llm = read("core/services/ai/builtin_llm_service.py")
if "cfg: dict | None = None" not in llm:
    llm = llm.replace(
        "    timeout: int = 120,\n) -> str:",
        "    timeout: int = 120,\n    cfg: dict | None = None,\n) -> str:",
    )
    llm = llm.replace(
        "    cfg = get_builtin_ai_config()\n    base_url = str(cfg[\"base_url\"])",
        "    if cfg is None:\n        cfg = get_builtin_ai_config()\n    base_url = str(cfg[\"base_url\"])",
    )
    write("core/services/ai/builtin_llm_service.py", llm)

bai = read("core/blueprints/api/builtin_ai.py")
if "resolve_text_ai_credentials" not in bai:
    bai = bai.replace(
        "from core.services.ai.builtin_llm_service import (\n    AUDIO_SCRIPT_SYSTEM_PROMPT,\n    complete_builtin_ai,\n)",
        "from core.config.user_ai_credentials import (\n    UserAiConfigRequired,\n    resolve_text_ai_credentials,\n    user_ai_config_error_response,\n)\nfrom core.services.ai.builtin_llm_service import (\n    AUDIO_SCRIPT_SYSTEM_PROMPT,\n    complete_builtin_ai,\n)",
    )
    bai = bai.replace(
        "        try:\n            text = complete_builtin_ai(prompt, system_prompt=AUDIO_SCRIPT_SYSTEM_PROMPT)\n            return jsonify({\"text\": text})",
        "        try:\n            uid = get_current_user_id()\n            cfg = None\n            if uid:\n                try:\n                    cfg = resolve_text_ai_credentials({\"use_builtin\": True}, uid)\n                except UserAiConfigRequired as exc:\n                    body, code = user_ai_config_error_response(exc)\n                    return jsonify(body), code\n            text = complete_builtin_ai(prompt, system_prompt=AUDIO_SCRIPT_SYSTEM_PROMPT, cfg=cfg)\n            return jsonify({\"text\": text})",
    )
    write("core/blueprints/api/builtin_ai.py", bai)

print("done")
