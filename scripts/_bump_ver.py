import os
ROOT = "/root/TestHub"
ver = "20260610uai1"
files = [
    "templates/_scripts_manifest.html",
    "templates/partials/tools/tc_workbench/_scripts_manifest.html",
    "templates/partials/tools/index.html",
]
targets = [
    "tc_rag_feature.js",
    "tc_ai_generate.js",
    "tc_agent_orchestrator.js",
    "tc_coverage_matrix.js",
    "tc_workbench_enhancements.js",
    "case_to_mindmap.js",
]
for rel in files:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        continue
    t = open(p, encoding="utf-8-sig").read()
    orig = t
    for name in targets:
        idx = 0
        while True:
            pos = t.find(name, idx)
            if pos == -1:
                break
            q = t.find("?v=", pos)
            if q != -1 and q < pos + 80:
                end = q + 3
                while end < len(t) and t[end] not in "'\"":
                    end += 1
                t = t[:q+3] + ver + t[end:]
            idx = pos + len(name)
    if t != orig:
        open(p, "w", encoding="utf-8").write(t)
        print("bumped", rel)
