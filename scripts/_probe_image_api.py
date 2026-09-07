#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import requests
from core.config.ai_preset import get_builtin_ai_config
cfg = get_builtin_ai_config()
base = cfg["base_url"].rstrip("/")
key = cfg.get("api_key") or "empty"
h = {"Authorization": f"Bearer {key}"}
for path in ["/models", "/images/generations"]:
    url = base + path
    try:
        if path == "/models":
            r = requests.get(url, headers=h, timeout=10)
        else:
            r = requests.post(url, headers=h, json={"model":"dall-e-3","prompt":"test","size":"1024x1024","n":1}, timeout=15)
        print(path, r.status_code, r.text[:300])
    except Exception as e:
        print(path, "ERR", e)
