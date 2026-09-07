import base64
import json


def format_json_text(json_str: str):
    parsed = json.loads(json_str)
    return json.dumps(parsed, indent=2, ensure_ascii=False)


def convert_base64_text(action: str, text: str):
    if action == "encode":
        return base64.b64encode(text.encode("utf-8")).decode("utf-8")
    return base64.b64decode(text).decode("utf-8")
