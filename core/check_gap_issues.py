import json
from core.services.test_cases.mysql_db import get_connection

conn = get_connection()
cur = conn.cursor()
cur.execute("SELECT validation_json FROM tc_workbench_session_turns WHERE id=%s", ("59b4a55bba19491aab269376a7da58a0",))
v = json.loads(cur.fetchone()["validation_json"])
print("gap_count", v.get("gap_count"))
print("gap_issues", len(v.get("gap_issues") or []))
print("issues total", len(v.get("issues") or []))
gaps = [i for i in (v.get("issues") or []) if i.get("type") == "gap"]
print("issues gap type", len(gaps))
for i, g in enumerate((v.get("gap_issues") or [])[:10]):
    print(i, (g.get("message") or "")[:60])
conn.close()
