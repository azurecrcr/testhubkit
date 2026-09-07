from pathlib import Path

p = Path("/root/TestHub/templates/index.html")
t = p.read_text(encoding="utf-8")
old = "href=\"{{ url_for('static', filename='css/toolkit.css') }}\""
new = "href=\"{{ url_for('static', filename='css/toolkit.css') }}?v=20260525b\""
if "?v=20260525b" in t:
    print("already bumped")
elif old not in t:
    raise SystemExit("pattern not found")
else:
    p.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("bumped toolkit.css cache")
