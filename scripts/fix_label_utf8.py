#!/usr/bin/env python3
from pathlib import Path
import re

p = Path("/root/TestHub/templates/omniflow_hub.html")
t = p.read_text(encoding="utf-8")
t2, n = re.subn(
    r'(<p id="uia-tunnel-ssh-label"[^>]*>).*?(</p>)',
    r"\1SSH 反向隧道命令\2",
    t,
    count=1,
)
if n:
    p.write_text(t2, encoding="utf-8")
    print("fixed", n)
else:
    print("not found")
