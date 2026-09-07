import os
ROOT = "/root/TestHub"

def rw(rel):
    p = os.path.join(ROOT, rel)
    with open(p, "r", encoding="utf-8-sig") as f:
        t = f.read()
    return p, t

def w(p, t):
    with open(p, "w", encoding="utf-8") as f:
        f.write(t)
    print("fixed", os.path.basename(p))

p, t = rw("static/js/tc_workbench/l3_ai/tc_ai_generate.js")
t = t.replace("\n    var _runAiBody = function() {\n\n", "\n")
old = """    var mode = getAiConfigMode();
    if (mode === 'preset' && window.HfUserAiConfig && typeof window.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
        window.HfUserAiConfig.ensurePresetAiConfigured().then(function(ok) {
            if (!ok) return;
            runAiTableToolbar(scope, loadingBtn, options);
        });
        return;
    }"""
new = """    var mode = getAiConfigMode();
    if (!options._userAiGatePassed && mode === 'preset' && window.HfUserAiConfig && typeof window.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
        window.HfUserAiConfig.ensurePresetAiConfigured().then(function(ok) {
            if (!ok) return;
            options._userAiGatePassed = true;
            runAiTableToolbar(scope, loadingBtn, options);
        });
        return;
    }"""
t = t.replace(old, new)
w(p, t)

p, t = rw("static/js/tc_workbench/l3_ai/tc_agent_orchestrator.js")
old = """        if (getAiMode() === 'preset' && global.HfUserAiConfig && typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {
                if (!ok) return;
                return startAgentJob(options);
            });
        }"""
new = """        if (!options._userAiGatePassed && getAiMode() === 'preset' && global.HfUserAiConfig && typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {
                if (!ok) return;
                options._userAiGatePassed = true;
                return startAgentJob(options);
            });
        }"""
if old in t:
    t = t.replace(old, new)
    w(p, t)

p, t = rw("static/js/hf_builtin_ai_admin.js")
start = t.find("  function setupAdminMenu(data) {")
end = t.find("  function init()", start)
old_block = t[start:end]
new_block = """  function setupAdminMenu(data) {
    var canManage = data && data.can_manage_builtin_ai;
    var adminBtn = $(\"hf-auth-open-builtin-ai-config\");
    if (adminBtn) adminBtn.classList.toggle(\"is-hidden\", !canManage);
    if (!canManage) return;

    if (adminBtn && !adminBtn._hfBuiltinAiBound) {
      adminBtn._hfBuiltinAiBound = true;
      adminBtn.addEventListener(\"click\", function (e) {
        e.preventDefault();
        closeUserMenu();
        openModal();
      });
    }
  }

"""
if "hf-auth-open-builtin-ai-config" not in old_block:
    t = t[:start] + new_block + t[end:]
    w(p, t)

p, t = rw("static/js/tc_workbench/l3_ai/tc_coverage_matrix.js")
if "ensurePresetAiConfigured" not in t:
    old = """    function runCoverageAnalyze() {
        if (covState().analyzing) return Promise.resolve();"""
    new = """    function runCoverageAnalyze(options) {
        options = options || {};
        if (!options._userAiGatePassed && typeof getAiMode === 'function' && getAiMode() === 'preset' && global.HfUserAiConfig && typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {
                if (!ok) return;
                options._userAiGatePassed = true;
                return runCoverageAnalyze(options);
            });
        }
        if (covState().analyzing) return Promise.resolve();"""
    t = t.replace(old, new)
    w(p, t)

p, t = rw("static/js/tc_workbench/l2_services/tc_rag_feature.js")
if "/api/user-ai-config" not in t:
    old = """function loadTcAiPresetFromServer() {
    return fetch('/api/builtin-ai/config')
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function(data) {
            applyTcAiPresetToObject(data);
            syncTcPresetModelSummary();
            return data;
        });
}"""
    new = """function loadTcAiPresetFromServer() {
    var userCfgPromise = (window.HfAuthNav && window.HfAuthNav.fetchMe)
        ? window.HfAuthNav.fetchMe().then(function (me) {
            if (!me || !me.authenticated) return null;
            return fetch('/api/user-ai-config', { credentials: 'same-origin' })
                .then(function (r) { return r.ok ? r.json() : null; });
        })
        : Promise.resolve(null);
    return userCfgPromise.then(function (userData) {
        if (userData && userData.configured) {
            applyTcAiPresetToObject(userData);
            syncTcPresetModelSummary();
            return userData;
        }
        return fetch('/api/builtin-ai/config')
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(data) {
                applyTcAiPresetToObject(data);
                syncTcPresetModelSummary();
                return data;
            });
    });
}"""
    if old in t:
        t = t.replace(old, new)
        w(p, t)

p, t = rw("static/js/tc_workbench_enhancements.js")
marker = "    function runValidateForScope(scope, opts) {\n        opts = opts || {};"
if marker in t and "ensurePresetAiConfigured" not in t:
    insert = marker + "\n        if (!opts._userAiGatePassed && typeof getAiMode === 'function' && getAiMode() === 'preset' && global.HfUserAiConfig && typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {\n            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {\n                if (!ok) return;\n                opts._userAiGatePassed = true;\n                return runValidateForScope(scope, opts);\n            });\n        }"
    t = t.replace(marker, insert)
    w(p, t)

p, t = rw("static/js/case_to_mindmap.js")
if os.path.exists(p) and "ensurePresetAiConfigured" not in t:
    marker = "function runCtmPolishWithAi("
    if marker in t:
        old = marker + "opts) {\n    opts = opts || {};"
        new = marker + "opts) {\n    opts = opts || {};\n    if (!opts._userAiGatePassed && window.HfUserAiConfig && typeof window.HfUserAiConfig.ensurePresetAiConfigured === 'function') {\n        return window.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {\n            if (!ok) return;\n            opts._userAiGatePassed = true;\n            return runCtmPolishWithAi(opts);\n        });\n    }"
        if old in t:
            t = t.replace(old, new)
            w(p, t)

print("all fixes done")
