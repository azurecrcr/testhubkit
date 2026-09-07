p = "/root/TestHub/static/js/tc_stash_storage.js"
t = open(p, encoding="utf-8-sig").read()
t = t.replace(
    "        var localDoc = saveAutoRecoveryLocal(payload);\n        saveAutoRecoveryLocal(payload);\n        saveAutoRecoveryRemote(payload);",
    "        var localDoc = saveAutoRecoveryLocal(payload);\n        saveAutoRecoveryRemote(payload);",
)
open(p, "w", encoding="utf-8").write(t)
print("fixed dup local save")
