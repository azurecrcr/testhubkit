import re
ROOT = "/root/TestHub"

# 1. Fix tc_stash_storage.js
p = ROOT + "/static/js/tc_stash_storage.js"
t = open(p, encoding="utf-8-sig").read()
old_remote = """    function saveAutoRecoveryRemote(payload) {
        var body = JSON.stringify({ payload: payload });
        var sent = false;
        if (typeof fetch === 'function') {
            try {
                fetch('/api/test-case-stashes/auto-recovery', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: body,
                    keepalive: true
                }).catch(function () { /* 页面卸载时静默失败 */ });
                sent = true;
            } catch (fe) { sent = false; }
        }
        if (!sent) {
            try {
                if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
                    var blob = new Blob([body], { type: 'application/json' });
                    navigator.sendBeacon('/api/test-case-stashes/auto-recovery', blob);
                }
            } catch (be) { /* ignore */ }
        }
    }"""
new_remote = """    function saveAutoRecoveryRemote(payload) {
        var body = JSON.stringify({ payload: payload });
        var url = '/api/test-case-stashes/auto-recovery';
        var sent = false;
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            try {
                var blob = new Blob([body], { type: 'application/json' });
                if (navigator.sendBeacon(url, blob)) sent = true;
            } catch (be) { /* ignore */ }
        }
        if (!sent && typeof fetch === 'function') {
            try {
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: body,
                    keepalive: true
                }).catch(function () { /* 页面卸载时静默失败 */ });
            } catch (fe) { /* ignore */ }
        }
    }"""
if old_remote in t:
    t = t.replace(old_remote, new_remote)
old_save = """    function saveAutoRecovery(payload) {
        var localDoc = saveAutoRecoveryLocal(payload);
        if (isServerMode()) {
            saveAutoRecoveryRemote(payload);
            return Promise.resolve(localDoc);
        }
        return Promise.resolve(localDoc);
    }"""
new_save = """    function saveAutoRecovery(payload) {
        var localDoc = saveAutoRecoveryLocal(payload);
        saveAutoRecoveryLocal(payload);
        saveAutoRecoveryRemote(payload);
        return Promise.resolve(localDoc);
    }"""
if old_save in t:
    t = t.replace(old_save, new_save)
else:
    t = t.replace(
        "        if (isServerMode()) {\n            saveAutoRecoveryRemote(payload);\n            return Promise.resolve(localDoc);\n        }\n        return Promise.resolve(localDoc);",
        "        saveAutoRecoveryRemote(payload);\n        return Promise.resolve(localDoc);",
    )
# remove duplicate saveAutoRecoveryLocal if introduced
t = t.replace("        saveAutoRecoveryLocal(payload);\n        saveAutoRecoveryLocal(payload);\n", "        saveAutoRecoveryLocal(payload);\n")
open(p, "w", encoding="utf-8").write(t)
print("patched tc_stash_storage.js")

# 2. Fix tc_stash.js
p = ROOT + "/static/js/tc_workbench/l4_domain/tc_stash.js"
t = open(p, encoding="utf-8-sig").read()
old_init_guard = "    if (!document.querySelector('.tc-workbench-scope')) return;"
new_init_guard = old_init_guard
# ensure sendAutoRecovery uses stash unlock memory flag fallback
old_send = """    function sendAutoRecoverySnapshot() {
        if (typeof isTcFeatureUnlocked === 'function' && !isTcFeatureUnlocked('stash')) return;"""
new_send = """    function sendAutoRecoverySnapshot() {
        var stashUsable = (typeof isTcFeatureUnlocked === 'function' && isTcFeatureUnlocked('stash'))
            || (typeof hfToolkitGetUnlockFlag === 'function' && hfToolkitGetUnlockFlag('tc_stash'));
        if (!stashUsable) return;"""
if old_send in t:
    t = t.replace(old_send, new_send)
open(p, "w", encoding="utf-8").write(t)
print("patched tc_stash.js")

# 3. Fix index.html inline initTcAutoRecoveryOnLeave
p = ROOT + "/templates/partials/tools/index.html"
t = open(p, encoding="utf-8-sig").read()
old_block = """        /** 刷新 / 跳转离开页面前自动写入暂存（标题由服务端生成为 自动保存-年月日-时分秒） */
        function initTcAutoRecoveryOnLeave() {
            if (window._tcAutoRecoveryBound) return;
            if (!document.getElementById('tc-app-dialog')) return;
            window._tcAutoRecoveryBound = true;
            var lastSent = 0;
            function sendAutoRecoverySnapshot() {
                if (!isTcFeatureUnlocked('stash')) return;
                if (typeof collectTcStashPayload !== 'function') return;
                if (typeof testCasesData === 'undefined' || !testCasesData.length) return;
                var now = Date.now();
                if (now - lastSent < 2000) return;
                lastSent = now;
                var payload;
                try {
                    payload = collectTcStashPayload();
                } catch (e) {
                    return;
                }
                if (!payload || !payload.columns || !payload.columns.length) return;
                try {
                    if (window.TcStashStorage && typeof TcStashStorage.saveAutoRecovery === 'function') {
                        TcStashStorage.saveAutoRecovery(payload);
                    } else if (window.HfLocalStash && HfLocalStash.isAvailable) {
                        HfLocalStash.tc.saveAutoRecovery(payload);
                    }
                } catch (e2) { /* ignore */ }
            }
            window.addEventListener('pagehide', sendAutoRecoverySnapshot);
            window.addEventListener('beforeunload', sendAutoRecoverySnapshot);
        }"""
new_block = """        /** 刷新 / 跳转离开页面前自动写入暂存（标题由服务端生成为 自动保存-年月日-时分秒） */
        function initTcAutoRecoveryOnLeave() {
            if (window._tcAutoRecoveryBound) return;
            if (!document.querySelector('.tc-workbench-scope')) return;
            window._tcAutoRecoveryBound = true;
            var lastSent = 0;
            function sendAutoRecoverySnapshot() {
                var stashUsable = (typeof isTcFeatureUnlocked === 'function' && isTcFeatureUnlocked('stash'))
                    || (typeof hfToolkitGetUnlockFlag === 'function' && hfToolkitGetUnlockFlag('tc_stash'));
                if (!stashUsable) return;
                try {
                    if (typeof tcEditingCell !== 'undefined' && tcEditingCell &&
                        typeof commitTableCellEdit === 'function') {
                        commitTableCellEdit(true);
                    }
                } catch (e0) { /* ignore */ }
                if (typeof collectTcStashPayload !== 'function') return;
                if (typeof testCasesData === 'undefined' || !testCasesData.length) return;
                if (typeof tableColumns === 'undefined' || !tableColumns.length) return;
                var now = Date.now();
                if (now - lastSent < 800) return;
                lastSent = now;
                var payload;
                try {
                    payload = collectTcStashPayload();
                } catch (e) {
                    return;
                }
                if (!payload || !payload.columns || !payload.columns.length) return;
                if (!payload.rows || !payload.rows.length) return;
                try {
                    if (window.TcStashStorage && typeof TcStashStorage.saveAutoRecovery === 'function') {
                        TcStashStorage.saveAutoRecovery(payload);
                    } else if (window.HfLocalStash && HfLocalStash.isAvailable) {
                        HfLocalStash.tc.saveAutoRecovery(payload);
                    }
                } catch (e2) { /* ignore */ }
            }
            window.addEventListener('pagehide', sendAutoRecoverySnapshot);
            window.addEventListener('beforeunload', sendAutoRecoverySnapshot);
        }"""
if old_block in t:
    t = t.replace(old_block, new_block)
    open(p, "w", encoding="utf-8").write(t)
    print("patched index.html initTcAutoRecoveryOnLeave")
else:
    print("WARN: index.html block not found, trying partial patch")
    t = t.replace("if (!document.getElementById('tc-app-dialog')) return;", "if (!document.querySelector('.tc-workbench-scope')) return;")
    open(p, "w", encoding="utf-8").write(t)

# bump version strings
for rel, names in [
    ("templates/partials/tools/index.html", ["tc_stash_storage.js"]),
    ("static/js/tc_workbench/l4_domain/tc_stash.js", []),
]:
    pass

ver = "20260610stash2"
for rel in ["templates/partials/tools/index.html", "templates/_scripts_manifest.html", "templates/partials/tools/tc_workbench/_scripts_manifest.html"]:
    fp = ROOT + "/" + rel
    if not __import__('os').path.exists(fp):
        continue
    txt = open(fp, encoding="utf-8-sig").read()
    orig = txt
    for name in ["tc_stash_storage.js", "tc_stash.js"]:
        idx = 0
        while True:
            pos = txt.find(name, idx)
            if pos == -1:
                break
            q = txt.find("?v=", pos)
            if q != -1 and q < pos + 80:
                end = q + 3
                while end < len(txt) and txt[end] not in "'\"":
                    end += 1
                txt = txt[:q+3] + ver + txt[end:]
            idx = pos + len(name)
    if txt != orig:
        open(fp, "w", encoding="utf-8").write(txt)
        print("bumped", rel)

print("done")
