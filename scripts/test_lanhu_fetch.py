import time
import sys

from core.services.test_cases.lanhu_requirement_service import fetch_lanhu_requirements_summary

cookie = sys.argv[1] if len(sys.argv) > 1 else ""
url = sys.argv[2] if len(sys.argv) > 2 else ""
t0 = time.time()
try:
    s = fetch_lanhu_requirements_summary(cookie, url)
    print("OK", len(s), "chars", round(time.time() - t0, 1), "s")
    print(s[:800])
except Exception as e:
    print("ERR", type(e).__name__, e, round(time.time() - t0, 1), "s")
    sys.exit(1)
