/* hf_site_nav.bundle.js v=20260807qbonus2 */

/* ---- hf_auth_nav.js ---- */
/**
 * 全站导航：登录态展示与退出。
 */
(function (global) {
  "use strict";

  var fetchMeInflight = null;
  var fetchMeCache = null;
  var fetchMeCacheAt = 0;
  var FETCH_ME_TTL_MS = 8000;

  function fetchMe(force) {
    if (!force && fetchMeInflight) return fetchMeInflight;
    var now = Date.now();
    if (!force && fetchMeCache && (now - fetchMeCacheAt) < FETCH_ME_TTL_MS) {
      return Promise.resolve(fetchMeCache);
    }
    fetchMeInflight = fetch("/api/auth/me", { credentials: "same-origin" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        fetchMeCache = data;
        fetchMeCacheAt = Date.now();
        return data;
      })
      .finally(function () { fetchMeInflight = null; });
    return fetchMeInflight;
  }

  function loginUrl(nextPath) {
    var next = nextPath || global.location.pathname + global.location.search;
    if (!next || next === "/auth" || next.indexOf("/auth?") === 0) {
      next = "/app";
    }
    return "/auth?next=" + encodeURIComponent(next);
  }

  function userNavLabel(user) {
    if (!user) return "";
    var name = (user.display_name || "").trim();
    return name || user.email || user.phone || "";
  }

  function userAccountText(user) {
    if (!user) return "";
    return user.email || user.phone || "";
  }

  function renderAuthNav(data) {
    var loginBtn = document.getElementById("hf-auth-login-btn");
    var userBox = document.getElementById("hf-auth-user-box");
    var menuBtn = document.getElementById("hf-auth-user-menu-btn");
    var menuAvatar = document.getElementById("hf-auth-user-menu-avatar");
    var sheetLogin = document.getElementById("hf-auth-sheet-login");
    var sheetUser = document.getElementById("hf-auth-sheet-user");
    var sheetEmail = document.getElementById("hf-auth-sheet-email");
    var sheetProfile = document.getElementById("hf-auth-sheet-profile");
    var sheetAiBtn = document.getElementById("hf-auth-sheet-ai-config");

    var authed = data && data.authenticated && data.user;
    var email = authed ? userAccountText(data.user) : "";
    var label = authed ? userNavLabel(data.user) : "";
    if (loginBtn) {
      loginBtn.classList.toggle("is-hidden", !!authed);
      if (!authed) loginBtn.setAttribute("href", loginUrl());
    }
    if (userBox) userBox.classList.toggle("is-hidden", !authed);
    if (menuBtn && authed) {
      var tip = label || email || "账户菜单";
      menuBtn.title = tip;
      menuBtn.setAttribute("aria-label", tip);
    }
    if (menuAvatar && authed) {
      menuAvatar.src = data.user.avatar_url || "/api/auth/avatar";
      menuAvatar.alt = label || "账户头像";
      menuAvatar.classList.remove("is-hidden");
    }
    if (sheetLogin) {
      sheetLogin.classList.toggle("is-hidden", !!authed);
      if (!authed) sheetLogin.setAttribute("href", loginUrl());
    }
    if (sheetUser) sheetUser.classList.toggle("is-hidden", !authed);
    if (sheetEmail && authed) sheetEmail.textContent = label;
    if (sheetProfile) sheetProfile.classList.toggle("is-hidden", !authed);
    if (sheetAiBtn) sheetAiBtn.classList.toggle("is-hidden", !authed);

    try {
      global.dispatchEvent(new CustomEvent("hf-auth-nav-updated", { detail: data || {} }));
    } catch (e) { /* ignore */ }
  }

  var LOGOUT_TREE_CLEAR_FLAG = "tc_logout_pending_tree_clear_v1";

  function markWorkbenchLanhuTreeClearOnLogout() {
    try {
      sessionStorage.setItem(LOGOUT_TREE_CLEAR_FLAG, "1");
    } catch (e) { /* ignore */ }
  }

  function bindLogout() {
    document.querySelectorAll("[data-hf-auth-logout]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
          .then(function () {
            markWorkbenchLanhuTreeClearOnLogout();
            global.location.reload();
          })
          .catch(function () {
            markWorkbenchLanhuTreeClearOnLogout();
            global.location.reload();
          });
      });
    });
  }

  function refreshNav() {
    return fetchMe().then(renderAuthNav).catch(function () { renderAuthNav(null); });
  }

  function ensureAuthenticated(options) {
    options = options || {};
    return fetchMe().then(function (data) {
      if (data && data.authenticated) return data;
      if (options.redirect !== false) {
        global.location.href = loginUrl(options.next);
      }
      return null;
    });
  }

  global.HfAuthNav = {
    refreshNav: refreshNav,
    fetchMe: fetchMe,
    loginUrl: loginUrl,
    ensureAuthenticated: ensureAuthenticated,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      refreshNav();
      bindLogout();
    });
  } else {
    refreshNav();
    bindLogout();
  }
})(typeof window !== "undefined" ? window : this);

/* ---- hf_user_ai_config.js ---- */
/**
 * 全站导航：登录用户个人 AI 配置
 */
(function (global) {
  "use strict";

  if (global.__hfUserAiConfigBound) return;
  global.__hfUserAiConfigBound = true;

  var cache = { configured: false, loaded: false, authed: false };
  var loadPromise = null;

  function $(id) {
    return document.getElementById(id);
  }

  function toast(msg, isErr) {
    if (global.tcAppToast) {
      global.tcAppToast(msg, isErr ? { variant: "error" } : undefined);
      return;
    }
    if (typeof global.hfFloatToast === "function") {
      global.hfFloatToast(msg, { placement: "top", variant: isErr ? "warning" : "success", duration: 2600 });
      return;
    }
    alert(msg);
  }

  function fetchMe() {
    if (global.HfAuthNav && global.HfAuthNav.fetchMe) return global.HfAuthNav.fetchMe();
    return fetch("/api/auth/me", { credentials: "same-origin" }).then(function (r) { return r.json(); });
  }

  function closeUserMenu() {
    var panel = $("hf-auth-user-menu-panel");
    var btn = $("hf-auth-user-menu-btn");
    if (panel) panel.classList.remove("is-open");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function applyCache(data) {
    cache.loaded = true;
    cache.authed = true;
    cache.configured = !!(data && data.configured);
    cache.vision_configured = !!(data && data.vision_configured);
    cache.base_url = (data && data.base_url) || "";
    cache.api_key = (data && data.api_key) || "";
    cache.model = (data && data.model) || "";
    cache.temperature = data && data.temperature != null ? data.temperature : 0.1;
    cache.vision_api_base_url = (data && data.vision_api_base_url) || "";
    cache.vision_api_key = (data && data.vision_api_key) || "";
    cache.vision_model = (data && data.vision_model) || "";
    cache.cursor_api_key = (data && data.cursor_api_key) || "";
    cache.agent_model = (data && data.agent_model) || "";
    cache.cursor_agent_configured = !!(data && data.cursor_agent_configured);
    try {
      global.dispatchEvent(new CustomEvent("hf-user-ai-config-updated", { detail: cache }));
    } catch (e) { /* ignore */ }
  }

  function loadConfig(force) {
    if (!force && loadPromise) return loadPromise;
    loadPromise = fetchMe().then(function (me) {
      cache.authed = !!(me && me.authenticated);
      if (!cache.authed) {
        cache.loaded = true;
        cache.configured = false;
        return cache;
      }
      return fetch("/api/user-ai-config", { credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          applyCache(data);
          return cache;
        })
        .catch(function () {
          cache.loaded = true;
          return cache;
        });
    });
    return loadPromise;
  }

  function fillForm(data) {
    if ($("hf-user-ai-base-url")) $("hf-user-ai-base-url").value = (data && data.base_url) || "";
    if ($("hf-user-ai-api-key")) $("hf-user-ai-api-key").value = (data && data.api_key) || "";
    if ($("hf-user-ai-model")) $("hf-user-ai-model").value = (data && data.model) || "";
    if ($("hf-user-ai-temperature")) {
      $("hf-user-ai-temperature").value = data && data.temperature != null ? data.temperature : "0.1";
    }
    if ($("hf-user-ai-vision-base-url")) $("hf-user-ai-vision-base-url").value = (data && data.vision_api_base_url) || "";
    if ($("hf-user-ai-vision-api-key")) $("hf-user-ai-vision-api-key").value = (data && data.vision_api_key) || "";
    if ($("hf-user-ai-vision-model")) $("hf-user-ai-vision-model").value = (data && data.vision_model) || "";
    if (global.HfUserAiCursorAgent && global.HfUserAiCursorAgent.applySaved) {
      global.HfUserAiCursorAgent.applySaved((data && data.cursor_api_key) || "", (data && data.agent_model) || "");
    } else {
      if ($("hf-user-ai-cursor-api-key")) $("hf-user-ai-cursor-api-key").value = (data && data.cursor_api_key) || "";
    }
    if ($("hf-user-ai-source")) {
      $("hf-user-ai-source").textContent = data && data.updated_at
        ? "上次保存：" + data.updated_at
        : "尚未保存个人 AI 配置";
    }
  }

  function _quotaKindLine(q, label) {
    if (!q) return label + " —";
    var used = q.used != null ? q.used : 0;
    var limit = q.limit != null ? q.limit : 0;
    var remaining = q.remaining != null ? q.remaining : Math.max(0, limit - used);
    var line = label + " 剩余 " + remaining + " / " + limit;
    if (q.has_own_config) line += "（已配个人，不扣免费额度）";
    return line;
  }

  function fillQuotaPanel(quota) {
    var panel = $("hf-user-ai-quota-panel");
    var summary = $("hf-user-ai-quota-summary");
    var hint = $("hf-user-ai-quota-bonus-hint");
    if (!panel || !summary) return;
    if (!quota) {
      panel.hidden = true;
      panel.classList.add("is-hidden");
      return;
    }
    panel.hidden = false;
    panel.classList.remove("is-hidden");
    summary.textContent = [
      _quotaKindLine(quota.text, "文本"),
      _quotaKindLine(quota.vision, "视觉"),
      _quotaKindLine(quota.cursor, "Cursor"),
    ].join(" · ");
    var bonusParts = [];
    var until = "";
    ["text", "vision", "cursor"].forEach(function (k) {
      var q = quota[k];
      if (q && q.bonus > 0) {
        bonusParts.push(k === "text" ? "文本+" + q.bonus : k === "vision" ? "视觉+" + q.bonus : "Cursor+" + q.bonus);
        if (q.bonus_until) until = q.bonus_until;
      }
    });
    if (hint) {
      if (bonusParts.length) {
        hint.textContent = "含增额 " + bonusParts.join(" / ") + (until ? " · 至 " + until : "");
        hint.classList.remove("is-hidden");
      } else {
        hint.textContent = "";
        hint.classList.add("is-hidden");
      }
    }
  }

  function loadQuotaPanel() {
    return fetch("/api/user-ai-daily-quota", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && !data.error && data.quota) fillQuotaPanel(data.quota);
        else fillQuotaPanel(null);
      })
      .catch(function () { fillQuotaPanel(null); });
  }

  function openModal(options) {
    options = options || {};
    var modal = $("hf-user-ai-modal");
    if (!modal) return Promise.resolve();
    if (modal.parentNode !== document.body) document.body.appendChild(modal);
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    return loadConfig(true).then(function () {
      return fetch("/api/user-ai-config", { credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          fillForm(data);
          loadQuotaPanel();
          if (global.HfUserAiCursorAgent && global.HfUserAiCursorAgent.onModalOpen) {
            global.HfUserAiCursorAgent.onModalOpen();
          }
          var focusEl = options.focusVision ? $("hf-user-ai-vision-base-url") : (options.focusCursor ? $("hf-user-ai-cursor-api-key") : $("hf-user-ai-base-url"));
          if (focusEl) focusEl.focus();
        })
        .catch(function () { fillForm(cache); });
    });
  }

  function closeModal() {
    var modal = $("hf-user-ai-modal");
    if (modal) modal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  }

  function saveModal() {
    var cursorFields = (global.HfUserAiCursorAgent && global.HfUserAiCursorAgent.readForm)
      ? global.HfUserAiCursorAgent.readForm()
      : {
          cursor_api_key: ($("hf-user-ai-cursor-api-key") && $("hf-user-ai-cursor-api-key").value || "").trim(),
          agent_model: ($("hf-user-ai-agent-model") && $("hf-user-ai-agent-model").value || "").trim(),
        };
    if (!cursorFields.cursor_api_key) {
      cursorFields.agent_model = "";
    }
    if (cursorFields.cursor_api_key && !cursorFields.agent_model) {
      toast("已填写 Cursor API Key，请选择 Agent 模型", true);
      return Promise.resolve();
    }
    var payload = {
      base_url: ($("hf-user-ai-base-url") && $("hf-user-ai-base-url").value || "").trim(),
      api_key: ($("hf-user-ai-api-key") && $("hf-user-ai-api-key").value || "").trim(),
      model: ($("hf-user-ai-model") && $("hf-user-ai-model").value || "").trim(),
      temperature: parseFloat(($("hf-user-ai-temperature") && $("hf-user-ai-temperature").value) || "0.1"),
      vision_api_base_url: ($("hf-user-ai-vision-base-url") && $("hf-user-ai-vision-base-url").value || "").trim(),
      vision_api_key: ($("hf-user-ai-vision-api-key") && $("hf-user-ai-vision-api-key").value || "").trim(),
      vision_model: ($("hf-user-ai-vision-model") && $("hf-user-ai-vision-model").value || "").trim(),
      cursor_api_key: cursorFields.cursor_api_key || "",
      agent_model: cursorFields.agent_model || "",
    };
    var saveBtn = $("hf-user-ai-save-btn");
    if (saveBtn) saveBtn.disabled = true;
    return fetch("/api/user-ai-config", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error((data && data.error) || ("HTTP " + r.status));
          return data;
        });
      })
      .then(function (data) {
        applyCache((data && data.saved) || payload);
        cache.configured = !!(data && data.configured);
        cache.vision_configured = !!(data && data.vision_configured);
        cache.cursor_agent_configured = !!(data && data.cursor_agent_configured);
        toast("AI 配置已保存");
        closeModal();
      })
      .catch(function (err) {
        toast((err && err.message) || "保存失败", true);
      })
      .finally(function () {
        if (saveBtn) saveBtn.disabled = false;
      });
  }

  function showRequireDialog() {
    var confirmFn = global.tcAppConfirm;
    if (typeof confirmFn === "function") {
      return confirmFn("使用 AI 功能前，请先在账户菜单中配置您的个人 AI。", {
        title: "请先配置 AI",
        variant: "warning",
        confirmText: "AI配置",
        cancelText: "取消",
      }).then(function (ok) {
        if (ok) return openModal();
        return false;
      });
    }
    if (confirm("请先配置 AI。是否现在打开 AI 配置？")) return openModal();
    return Promise.resolve(false);
  }

  function showLoginRequiredDialog() {
    var msg = "请先登录后再使用 AI 功能。";
    var confirmFn = global.tcAppConfirm;
    if (typeof confirmFn === "function") {
      return confirmFn(msg, {
        title: "请先登录",
        variant: "warning",
        confirmText: "去登录",
        cancelText: "取消",
      }).then(function (ok) {
        if (ok && global.HfAuthNav && global.HfAuthNav.loginUrl) {
          global.location.href = global.HfAuthNav.loginUrl();
        }
        return false;
      });
    }
    if (typeof global.tcAppAlert === "function") {
      return global.tcAppAlert(msg, { title: "请先登录", variant: "warning" }).then(function () {
        return false;
      });
    }
    alert(msg);
    return Promise.resolve(false);
  }

  function ensureConfigured(options) {
    options = options || {};
    return loadConfig(false).then(function () {
      return fetchMe().then(function (me) {
        if (!me || !me.authenticated) {
          return showLoginRequiredDialog();
        }
        return true;
      });
    });
  }

  function shouldGatePresetMode() {
    if (typeof global.getAiConfigMode === "function") return global.getAiConfigMode() === "preset";
    if (typeof global.getAiMode === "function") return global.getAiMode() === "preset";
    return true;
  }

  function ensurePresetAiConfigured(options) {
    if (!shouldGatePresetMode()) return Promise.resolve(true);
    return ensureConfigured(options);
  }

  function bindModal() {
    document.querySelectorAll("[data-hf-user-ai-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
    var modal = $("hf-user-ai-modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal();
      });
    }
    var saveBtn = $("hf-user-ai-save-btn");
    if (saveBtn) saveBtn.addEventListener("click", saveModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var m = $("hf-user-ai-modal");
        if (m && !m.classList.contains("hidden")) closeModal();
      }
    });
  }

  function setupUserMenu(data) {
    var authed = data && data.authenticated;
    var menuWrap = $("hf-auth-user-menu");
    var sheetAiBtn = $("hf-auth-sheet-ai-config");
    if (menuWrap) menuWrap.classList.toggle("is-hidden", !authed);
    if (sheetAiBtn) sheetAiBtn.classList.toggle("is-hidden", !authed);
    if (!authed) return;

    var btn = $("hf-auth-user-menu-btn");
    var panel = $("hf-auth-user-menu-panel");
    var openAi = $("hf-auth-open-ai-config");
    if (btn && panel && !btn._hfUserAiMenuBound) {
      btn._hfUserAiMenuBound = true;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = panel.classList.contains("is-open");
        closeUserMenu();
        if (!open) {
          panel.classList.add("is-open");
          btn.setAttribute("aria-expanded", "true");
        }
      });
      document.addEventListener("click", function (e) {
        if (!panel.contains(e.target) && e.target !== btn) closeUserMenu();
      });
    }
    if (openAi && !openAi._hfUserAiBound) {
      openAi._hfUserAiBound = true;
      openAi.addEventListener("click", function (e) {
        e.preventDefault();
        closeUserMenu();
        openModal();
      });
    }
    if (sheetAiBtn && !sheetAiBtn._hfUserAiBound) {
      sheetAiBtn._hfUserAiBound = true;
      sheetAiBtn.addEventListener("click", function () {
        openModal();
      });
    }
    loadConfig(false);
  }

  function init() {
    bindModal();
    fetchMe().then(setupUserMenu).catch(function () {});
    document.addEventListener("hf-auth-nav-updated", function (ev) {
      setupUserMenu(ev.detail);
    });
  }

  global.HfUserAiConfig = {
    loadConfig: loadConfig,
    openModal: openModal,
    closeModal: closeModal,
    ensureConfigured: ensureConfigured,
    ensurePresetAiConfigured: ensurePresetAiConfigured,
    isConfigured: function () { return !!cache.configured; },
    isVisionConfigured: function () { return !!cache.vision_configured; },
    isCursorAgentConfigured: function () { return !!cache.cursor_agent_configured; },
    getCursorAgentSettings: function () {
      return {
        cursor_api_key: cache.cursor_api_key || "",
        agent_model: cache.agent_model || "",
      };
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);

/* ---- hf_user_ai_cursor_agent.js ---- */
/**
 * AI 配置弹窗 — Agent 模型选择（个人 / 全站共用工厂）
 */
(function (global) {
  "use strict";

  var STATIC_MODELS = [
    { id: "auto", label: "Auto（自动）" },
    { id: "composer-2.5", label: "Composer 2.5（推荐 · 较快）" },
  ];

  var DOMESTIC_MODEL_PATTERNS = [
    /^auto$/i,
    /^composer/i,
    /^kimi/i,
    /^qwen/i,
    /^deepseek/i,
    /^doubao/i,
    /^glm/i,
    /^minimax/i,
    /^moonshot/i,
    /^baichuan/i,
    /^yi-/i,
    /^ernie/i,
    /^hunyuan/i,
    /^step-/i,
    /^abab/i,
  ];

  var OVERSEAS_MODEL_PATTERNS = [
    /^claude/i,
    /^gpt-/i,
    /^o[134](?:-|$)/i,
    /^gemini/i,
    /^anthropic/i,
    /sonnet/i,
    /opus/i,
  ];

  function isDomesticAgentModel(model) {
    var id = String((model && model.id) || "").trim();
    var label = String((model && model.label) || "").trim();
    if (!id) return false;
    var i;
    for (i = 0; i < OVERSEAS_MODEL_PATTERNS.length; i++) {
      if (OVERSEAS_MODEL_PATTERNS[i].test(id) || OVERSEAS_MODEL_PATTERNS[i].test(label)) return false;
    }
    for (i = 0; i < DOMESTIC_MODEL_PATTERNS.length; i++) {
      if (DOMESTIC_MODEL_PATTERNS[i].test(id) || DOMESTIC_MODEL_PATTERNS[i].test(label)) return true;
    }
    if (/[\u4e00-\u9fff]/.test(label)) return true;
    return false;
  }

  function filterDomesticAgentModels(models) {
    var src = models || [];
    var filtered = src.filter(isDomesticAgentModel);
    if (filtered.length) return filtered;
    return src.filter(function (m) {
      var id = String((m && m.id) || "").toLowerCase();
      return id === "auto" || id.indexOf("composer") === 0;
    });
  }

  function createCursorAgentModule(opts) {
    opts = opts || {};
    var idPrefix = String(opts.idPrefix || "hf-user-ai");
    var pickerClass = String(opts.pickerClass || "hf-user-ai-model-picker");

    var pickerEl, triggerEl, labelEl, panelEl, listEl, selectEl, statusEl, keyEl;
    var debounceTimer, fetchSeq = 0, fetchAbortCtrl = null;
    var lastKeyFetched = "", savedModelCache = "", selectedId = "";
    var modelItems = [], bound = false;
    var onTriggerClick, onDocumentClick;

    function $(suffix) {
      return global.document.getElementById(idPrefix + suffix);
    }

    function refreshElements() {
      pickerEl = $("-agent-model-picker");
      triggerEl = $("-agent-model-trigger");
      labelEl = $("-agent-model-label");
      panelEl = $("-agent-model-panel");
      listEl = $("-agent-model-list");
      selectEl = $("-agent-model");
      statusEl = $("-agent-model-status");
      keyEl = $("-cursor-api-key");
    }

    function resetPanelGeometry() {
      if (!panelEl) return;
      panelEl.classList.remove("is-floating");
      panelEl.style.position = "";
      panelEl.style.left = "";
      panelEl.style.width = "";
      panelEl.style.right = "";
      panelEl.style.top = "";
      panelEl.style.bottom = "";
      panelEl.style.maxHeight = "";
      panelEl.style.zIndex = "";
    }

    function updatePanelGeometry() {
      if (!panelEl || !triggerEl) return;
      var rect = triggerEl.getBoundingClientRect();
      var vh = global.innerHeight || global.document.documentElement.clientHeight || 800;
      var margin = 8;
      var spaceAbove = Math.max(0, rect.top - margin);
      var maxH = Math.max(120, Math.min(224, spaceAbove));

      panelEl.classList.add("is-floating");
      panelEl.style.position = "fixed";
      panelEl.style.left = Math.round(rect.left) + "px";
      panelEl.style.width = Math.round(rect.width) + "px";
      panelEl.style.right = "auto";
      panelEl.style.top = "auto";
      panelEl.style.bottom = Math.round(vh - rect.top + 4) + "px";
      panelEl.style.maxHeight = Math.floor(maxH) + "px";
      panelEl.style.zIndex = "10950";
    }

    function setStatus(text, isError) {
      if (!statusEl) return;
      statusEl.textContent = text || "";
      statusEl.style.color = isError ? "#dc2626" : "#64748b";
    }

    function readApiKey() {
      return keyEl ? String(keyEl.value || "").trim() : "";
    }

    function resetSelect(placeholder) {
      selectedId = "";
      modelItems = [];
      if (selectEl) {
        selectEl.innerHTML = "";
        var opt = global.document.createElement("option");
        opt.value = "";
        opt.textContent = placeholder || "请选择 Agent 模型";
        selectEl.appendChild(opt);
        selectEl.value = "";
        selectEl.disabled = true;
      }
      if (labelEl) {
        labelEl.textContent = placeholder || "请选择 Agent 模型";
        labelEl.classList.add("is-placeholder");
      }
      if (triggerEl) triggerEl.disabled = true;
      if (listEl) listEl.innerHTML = "";
      closePanel();
    }

    function populateSelect(models, pickId) {
      if (!selectEl) return;
      selectEl.innerHTML = "";
      modelItems = models || [];
      modelItems.forEach(function (m) {
        var opt = global.document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.label || m.id;
        selectEl.appendChild(opt);
        if (pickId && m.id === pickId) selectedId = pickId;
      });
      if (!selectedId && pickId) selectedId = pickId;
      if (!selectedId && modelItems.length) selectedId = modelItems[0].id;
      selectEl.value = selectedId || "";
      selectEl.disabled = modelItems.length === 0;
      if (triggerEl) triggerEl.disabled = modelItems.length === 0;
      updateLabel();
      renderList();
    }

    function useStaticModels(pickId, hint) {
      populateSelect(filterDomesticAgentModels(STATIC_MODELS.slice()), pickId || savedModelCache || "auto");
      if (hint) setStatus(hint, true);
    }

    function updateLabel() {
      if (!labelEl) return;
      var found = null;
      for (var i = 0; i < modelItems.length; i++) {
        if (modelItems[i].id === selectedId) { found = modelItems[i]; break; }
      }
      if (found) {
        labelEl.textContent = found.label || found.id;
        labelEl.classList.remove("is-placeholder");
      } else if (selectedId) {
        labelEl.textContent = selectedId;
        labelEl.classList.remove("is-placeholder");
      } else {
        labelEl.textContent = readApiKey() ? "请选择 Agent 模型" : "请先输入 Cursor API Key";
        labelEl.classList.add("is-placeholder");
      }
    }

    function closePanel() {
      if (!pickerEl || !panelEl) return;
      pickerEl.classList.remove("is-open");
      panelEl.classList.remove("is-open");
      panelEl.classList.add("is-hidden");
      resetPanelGeometry();
      if (triggerEl) triggerEl.setAttribute("aria-expanded", "false");
    }

    function openPanel() {
      refreshElements();
      if (!pickerEl || !panelEl || !triggerEl || triggerEl.disabled) return;
      updatePanelGeometry();
      pickerEl.classList.add("is-open");
      panelEl.classList.remove("is-hidden");
      panelEl.classList.add("is-open");
      triggerEl.setAttribute("aria-expanded", "true");
      renderList();
    }

    function renderList() {
      if (!listEl) return;
      listEl.innerHTML = "";
      modelItems.forEach(function (m) {
        var li = global.document.createElement("li");
        li.className = pickerClass + "__option" + (m.id === selectedId ? " is-selected" : "");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", m.id === selectedId ? "true" : "false");
        li.dataset.modelId = m.id;
        li.textContent = m.label || m.id;
        li.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          selectedId = m.id;
          if (selectEl) selectEl.value = selectedId;
          updateLabel();
          closePanel();
        });
        listEl.appendChild(li);
      });
    }

    function abortPendingFetch() {
      if (fetchAbortCtrl) {
        try { fetchAbortCtrl.abort(); } catch (e) { /* ignore */ }
        fetchAbortCtrl = null;
      }
    }

    function fetchModelsForKey(key, pickId) {
      key = String(key || "").trim();
      if (!key) {
        lastKeyFetched = "";
        resetSelect("请先输入 Cursor API Key");
        setStatus("");
        return Promise.resolve();
      }
      if (key === lastKeyFetched && modelItems.length) {
        populateSelect(modelItems, pickId || savedModelCache || selectedId);
        return Promise.resolve();
      }
      abortPendingFetch();
      fetchAbortCtrl = typeof global.AbortController !== "undefined" ? new global.AbortController() : null;
      var seq = ++fetchSeq;
      resetSelect("正在获取可用模型…");
      setStatus("正在从 Cursor 获取可用模型列表…");
      return fetch("/api/builtin-ai/cursor-models-unavailable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ cursor_api_key: key }),
        signal: fetchAbortCtrl ? fetchAbortCtrl.signal : undefined,
      })
        .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
        .then(function (pack) {
          if (seq !== fetchSeq) return;
          if (!pack.res.ok) throw new Error((pack.data && pack.data.error) || "获取模型列表失败");
          var models = filterDomesticAgentModels((pack.data && pack.data.models) || []);
          if (!models.length) throw new Error("未获取到国内可用模型");
          lastKeyFetched = key;
          populateSelect(models, pickId || savedModelCache || "");
          setStatus("已加载 " + models.length + " 个国内可用模型");
        })
        .catch(function (err) {
          if (seq !== fetchSeq) return;
          if (err && err.name === "AbortError") return;
          useStaticModels(pickId || savedModelCache || "auto", (err && err.message ? err.message + "；" : "") + "已改用预设模型列表");
        });
    }

    function onKeyInput() {
      if (debounceTimer) global.clearTimeout(debounceTimer);
      var key = readApiKey();
      if (!key) {
        lastKeyFetched = "";
        resetSelect("请先输入 Cursor API Key");
        setStatus("");
        return;
      }
      debounceTimer = global.setTimeout(function () {
        lastKeyFetched = "";
        fetchModelsForKey(key, savedModelCache || selectedId);
      }, 650);
    }

    function bindOnce() {
      refreshElements();
      if (!pickerEl || !panelEl) return;
      if (!bound) {
        bound = true;
        onTriggerClick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          refreshElements();
          if (!triggerEl || triggerEl.disabled) return;
          if (pickerEl && pickerEl.classList.contains("is-open")) closePanel();
          else openPanel();
        };
        onDocumentClick = function (e) {
          refreshElements();
          if (!pickerEl || !pickerEl.classList.contains("is-open")) return;
          if (pickerEl.contains(e.target)) return;
          closePanel();
        };
        if (triggerEl) triggerEl.addEventListener("click", onTriggerClick);
        if (keyEl) {
          keyEl.addEventListener("input", onKeyInput);
          keyEl.addEventListener("change", onKeyInput);
        }
        global.document.addEventListener("click", onDocumentClick);
        global.addEventListener("resize", function () {
          if (pickerEl && pickerEl.classList.contains("is-open")) updatePanelGeometry();
        });
      }
      if (!readApiKey()) resetSelect("请先输入 Cursor API Key");
    }

    function applySaved(key, model) {
      bindOnce();
      var normalizedKey = String(key || "").trim();
      if (keyEl) keyEl.value = normalizedKey;
      if (!normalizedKey) {
        savedModelCache = "";
        selectedId = "";
        lastKeyFetched = "";
        resetSelect("请先输入 Cursor API Key");
        setStatus("");
        return Promise.resolve();
      }
      savedModelCache = String(model || "").trim();
      selectedId = savedModelCache;
      return fetchModelsForKey(normalizedKey, savedModelCache);
    }

    function onModalOpen() {
      bindOnce();
      var key = readApiKey();
      if (key) return fetchModelsForKey(key, savedModelCache || selectedId);
      resetSelect("请先输入 Cursor API Key");
      return Promise.resolve();
    }

    function readForm() {
      bindOnce();
      var key = readApiKey();
      return {
        cursor_api_key: key,
        agent_model: key ? String(selectedId || (selectEl && selectEl.value) || "").trim() : "",
      };
    }

    return {
      init: bindOnce,
      applySaved: applySaved,
      onModalOpen: onModalOpen,
      readForm: readForm,
      fetchModelsForKey: fetchModelsForKey,
    };
  }

  global.HfUserAiCursorAgent = createCursorAgentModule({
    idPrefix: "hf-user-ai",
    pickerClass: "hf-user-ai-model-picker",
  });

  global.HfBuiltinAiCursorAgent = createCursorAgentModule({
    idPrefix: "hf-builtin-ai",
    pickerClass: "hf-builtin-ai-model-picker",
  });

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", function () {
      if (global.HfUserAiCursorAgent) global.HfUserAiCursorAgent.init();
      if (global.HfBuiltinAiCursorAgent) global.HfBuiltinAiCursorAgent.init();
    });
  } else {
    if (global.HfUserAiCursorAgent) global.HfUserAiCursorAgent.init();
    if (global.HfBuiltinAiCursorAgent) global.HfBuiltinAiCursorAgent.init();
  }
})(typeof window !== "undefined" ? window : this);

