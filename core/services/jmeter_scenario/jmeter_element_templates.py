"""Load cached JMeter element JMX templates."""
import json
from functools import lru_cache
from pathlib import Path

TEMPLATES_JSON = Path(__file__).resolve().parent / "jmeter_element_templates.json"


@lru_cache(maxsize=1)
def load_element_templates():
    if TEMPLATES_JSON.is_file():
        try:
            return json.loads(TEMPLATES_JSON.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"version": "0", "templates": {}}
