import os
ROOT = "/root/TestHub"

def rw(rel):
    p = os.path.join(ROOT, rel)
    with open(p, "r", encoding="utf-8-sig") as f:
        return p, f.read()

def w(p, t):
    with open(p, "w", encoding="utf-8") as f:
        f.write(t)
    print("fixed", os.path.basename(p))

p, t = rw("static/js/tc_workbench_enhancements.js")
marker = "    function runValidation(useLlmOverride) {\n        var scope = VALIDATE_SCOPE_SINGLE;"
if "ensurePresetAiConfigured" not in t and marker in t:
    insert = """    function runValidation(useLlmOverride, userAiGatePassed) {
        var scope = VALIDATE_SCOPE_SINGLE;"""
    t = t.replace(marker, insert)
    gate = """        else wantLlm = isValidateUseLlmEnabled();

        if (!userAiGatePassed && wantLlm && typeof getAiMode === 'function' && getAiMode() === 'preset' && global.HfUserAiConfig && typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {
                if (!ok) return Promise.resolve();
                return runValidation(useLlmOverride, true);
            });
        }

        var vData = vScopeData(scope);"""
    t = t.replace("        else wantLlm = isValidateUseLlmEnabled();\n\n        var vData = vScopeData(scope);", gate)
    w(p, t)

p, t = rw("static/js/case_to_mindmap.js")
marker = """        var useBuiltin = window.ThAiConfigBridge && typeof window.ThAiConfigBridge.getMode === 'function'
            && window.ThAiConfigBridge.getMode() === 'preset';
        var aiCfg = null;
        if (!useBuiltin) {"""
if "ensurePresetAiConfigured" not in t and marker in t:
    gate = """        var useBuiltin = window.ThAiConfigBridge && typeof window.ThAiConfigBridge.getMode === 'function'
            && window.ThAiConfigBridge.getMode() === 'preset';
        if (useBuiltin && window.HfUserAiConfig && typeof window.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
            return window.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {
                if (!ok) return;
                runAiPolish();
            });
        }
        var aiCfg = null;
        if (!useBuiltin) {"""
    t = t.replace(marker, gate)
    w(p, t)

print("done")
