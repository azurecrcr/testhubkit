p = "/root/TestHub/core/blueprints/api/test_cases/case_to_mindmap.py"
t = open(p, encoding="utf-8-sig").read()
if t.startswith("from core.services.auth.auth_session import get_current_user_id\nfrom __future__"):
    t = t.replace(
        "from core.services.auth.auth_session import get_current_user_id\nfrom __future__ import annotations\n\n",
        "from __future__ import annotations\n\n",
        1,
    )
    if "get_current_user_id" not in t.split("from flask")[0]:
        t = t.replace(
            "from flask import Blueprint, jsonify, request\n",
            "from flask import Blueprint, jsonify, request\n\nfrom core.services.auth.auth_session import get_current_user_id\n",
            1,
        )
    open(p, "w", encoding="utf-8").write(t)
    print("fixed case_to_mindmap header")
else:
    print("header already ok")
