#!/usr/bin/env python3
import sys
sys.path.insert(0, "/root/TestHub")
from core.services.jmeter_scenario.demo_seed_db import upsert_default_demo_seed, get_demo_seed, DEMO_SEED_KEY

r = upsert_default_demo_seed()
print("upsert:", r)
d = get_demo_seed(DEMO_SEED_KEY)
y = d["payload"]["yaml"]
print("title:", d["title"])
print("yaml_len:", len(y))
checks = {
    "users_2": "users: 2" in y,
    "if": "type: if_controller" in y,
    "random": "type: random_controller" in y,
    "txn": "type: transaction_controller" in y,
    "loop": "type: loop_controller" in y,
    "simple": "type: simple_controller" in y,
    "jdbc": "type: jdbc_post" in y,
    "multipart": "body_type: multipart" in y,
    "name": "全元件精简演示" in y,
}
print("checks:", checks)
if not all(checks.values()):
    raise SystemExit(1)
print("OK")
