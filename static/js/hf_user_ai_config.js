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
