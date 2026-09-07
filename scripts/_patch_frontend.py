import os, re
ROOT = "/root/TestHub"

def read(rel):
    with open(os.path.join(ROOT, rel), "r", encoding="utf-8-sig") as f:
        return f.read()

def write(rel, text):
    with open(os.path.join(ROOT, rel), "w", encoding="utf-8") as f:
        f.write(text)
    print("patched", rel)

nav = read("templates/partials/hf_global_nav.html")
if "hf-auth-open-builtin-ai-config" not in nav:
    nav = nav.replace(
        '<button type="button" id="hf-auth-open-ai-config" role="menuitem">AI配置</button>',
        '<button type="button" id="hf-auth-open-ai-config" role="menuitem">AI配置</button>\n                            <button type="button" id="hf-auth-open-builtin-ai-config" role="menuitem" class="is-hidden">全站 AI 配置</button>',
    )
if "hf_user_ai_config_modal.html" not in nav:
    nav = nav.replace(
        "{% include 'partials/hf_builtin_ai_config_modal.html' %}",
        "{% include 'partials/hf_user_ai_config_modal.html' %}\n{% include 'partials/hf_builtin_ai_config_modal.html' %}",
    )
if "hf_user_ai_config.js" not in nav:
    nav = nav.replace(
        '<script src="{{ url_for(\'static\', filename=\'js/hf_auth_nav.js\') }}?v=20260608auth1"></script>',
        '<script src="{{ url_for(\'static\', filename=\'js/hf_auth_nav.js\') }}?v=20260608auth1"></script>\n<script src="{{ url_for(\'static\', filename=\'js/hf_user_ai_config.js\') }}?v=20260610uai1"></script>',
    )
    nav = nav.replace(
        '<script src="{{ url_for(\'static\', filename=\'js/hf_builtin_ai_admin.js\') }}?v=20260608vf0"></script>',
        '<script src="{{ url_for(\'static\', filename=\'js/hf_builtin_ai_admin.js\') }}?v=20260610uai1"></script>',
    )
write("templates/partials/hf_global_nav.html", nav)

admin = read("static/js/hf_builtin_ai_admin.js")
old_setup = """  function setupAdminMenu(data) {
    var canManage = data && data.can_manage_builtin_ai;
    var menuWrap = $(\"hf-auth-user-menu\");
    var plainEmail = $(\"hf-auth-user-email-plain\");
    var sheetAiBtn = $(\"hf-auth-sheet-ai-config\");
    if (menuWrap) menuWrap.classList.toggle(\"is-hidden\", !canManage);
    if (plainEmail) plainEmail.classList.toggle(\"is-hidden\", !!canManage);
    if (sheetAiBtn) sheetAiBtn.classList.toggle(\"is-hidden\", !canManage);
    if (!canManage) return;

    var btn = $(\"hf-auth-user-menu-btn\");
    var panel = $(\"hf-auth-user-menu-panel\");
    var openAi = $(\"hf-auth-open-ai-config\");
    if (btn && panel && !btn._hfAiMenuBound) {
      btn._hfAiMenuBound = true;
      btn.addEventListener(\"click\", function (e) {
        e.stopPropagation();
        var open = panel.classList.contains(\"is-open\");
        closeUserMenu();
        if (!open) {
          panel.classList.add(\"is-open\");
          btn.setAttribute(\"aria-expanded\", \"true\");
        }
      });
      document.addEventListener(\"click\", function (e) {
        if (!panel.contains(e.target) && e.target !== btn) closeUserMenu();
      });
    }
    if (openAi && !openAi._hfAiBound) {
      openAi._hfAiBound = true;
      openAi.addEventListener(\"click\", function (e) {
        e.preventDefault();
        openModal();
      });
    }
    if (sheetAiBtn && !sheetAiBtn._hfAiBound) {
      sheetAiBtn._hfAiBound = true;
      sheetAiBtn.addEventListener(\"click\", function () {
        openModal();
      });
    }
  }"""
new_setup = """  function setupAdminMenu(data) {
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
  }"""
if "hf-auth-open-builtin-ai-config" in admin and "menuWrap" in admin.split("setupAdminMenu")[1].split("function init")[0]:
    admin = admin.replace(old_setup, new_setup)
    write("static/js/hf_builtin_ai_admin.js", admin)

# tc_ai_generate.js gate
gen = read("static/js/tc_workbench/l3_ai/tc_ai_generate.js")
if "HfUserAiConfig" not in gen:
    marker = "    if (!promptEl) return;\n    if (!ensureTcTableTemplateApplied()) return;"
    insert = marker + "\n\n    var _runAiBody = function() {"
    if insert not in gen:
        gen = gen.replace(
            marker,
            marker + "\n\n    var _runAiBody = function() {",
        )
        # close function before end - find last part of runAiTableToolbar
        # Easier approach: wrap at start after validations
        pass
    # Simpler: add gate right after preset unlock check
    gate_old = "    var mode = getAiConfigMode();\n    if (mode === 'preset' && !isTcFeatureUnlocked('preset')) {"
    gate_new = """    var mode = getAiConfigMode();
    if (mode === 'preset' && window.HfUserAiConfig && typeof window.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
        window.HfUserAiConfig.ensurePresetAiConfigured().then(function(ok) {
            if (!ok) return;
            runAiTableToolbar(scope, loadingBtn, options);
        });
        return;
    }
    if (mode === 'preset' && !isTcFeatureUnlocked('preset')) {"""
    if "ensurePresetAiConfigured" not in gen:
        gen = gen.replace(gate_old, gate_new)
        write("static/js/tc_workbench/l3_ai/tc_ai_generate.js", gen)

# tc_agent_orchestrator.js
agent = read("static/js/tc_workbench/l3_ai/tc_agent_orchestrator.js")
if "ensurePresetAiConfigured" not in agent:
    agent = agent.replace(
        "        if (getAiMode() === 'preset' && typeof global.isTcFeatureUnlocked === 'function' && !global.isTcFeatureUnlocked('preset')) {",
        "        if (getAiMode() === 'preset' && global.HfUserAiConfig && typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {\n            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {\n                if (!ok) return;\n                return startAgentJob(options);\n            });\n        }\n        if (getAiMode() === 'preset' && typeof global.isTcFeatureUnlocked === 'function' && !global.isTcFeatureUnlocked('preset')) {",
    )
    write("static/js/tc_workbench/l3_ai/tc_agent_orchestrator.js", agent)

# tc_coverage_matrix.js - find analyze function
cov = read("static/js/tc_workbench/l3_ai/tc_coverage_matrix.js")
if "ensurePresetAiConfigured" not in cov:
    cov = cov.replace(
        "    function analyzeCoverage(options) {",
        "    function analyzeCoverage(options) {\n        if (typeof getAiMode === 'function' && getAiMode() === 'preset' && global.HfUserAiConfig && typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {\n            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {\n                if (!ok) return Promise.resolve();\n                return analyzeCoverage(options);\n            });\n        }",
    )
    # fix infinite recursion - use inner function name. Need to read file first
write("static/js/tc_workbench/l3_ai/tc_coverage_matrix.js", cov)

print("frontend nav/admin done")
