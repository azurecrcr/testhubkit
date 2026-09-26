/**
 * 全站导航：管理员邮箱下拉 → 全站 AI 配置弹窗（文本 AI + 视觉 AI）
 */
(function (global) {
  "use strict";

  if (global.__hfBuiltinAiAdminBound) return;
  global.__hfBuiltinAiAdminBound = true;

  var configReady = false;
  var loadedImageModel = "dall-e-3";

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

  function closeUserMenu() {
    var panel = $("hf-auth-user-menu-panel");
    var btn = $("hf-auth-user-menu-btn");
    if (panel) panel.classList.remove("is-open");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function setSaveEnabled(on) {
    var saveBtn = $("hf-builtin-ai-save-btn");
    if (saveBtn) saveBtn.disabled = !on;
  }

  function isVisionPayloadConfigured(data) {
    if (!data) return false;
    return !!(
      String(data.vision_api_base_url || "").trim() &&
      String(data.vision_api_key || "").trim() &&
      String(data.vision_model || "").trim()
    );
  }

  function dispatchPresetChanged(data) {
    try {
      var detail = Object.assign({}, data || {}, {
        vision_configured: isVisionPayloadConfigured(data),
      });
      global.dispatchEvent(new CustomEvent("hf-builtin-ai-preset-changed", { detail: detail }));
    } catch (e) { /* ignore */ }
    if (global.TC_AI_PRESET && data) {
      global.TC_AI_PRESET.base_url = data.base_url || "";
      global.TC_AI_PRESET.api_key = data.api_key || "";
      global.TC_AI_PRESET.model = data.model || "";
      global.TC_AI_PRESET.temperature = data.temperature != null ? data.temperature : 0.1;
    }
  }

  function applyConfigToForm(data) {
    if ($("hf-builtin-ai-base-url")) $("hf-builtin-ai-base-url").value = data.base_url || "";
    if ($("hf-builtin-ai-api-key")) $("hf-builtin-ai-api-key").value = data.api_key || "";
    if ($("hf-builtin-ai-model")) $("hf-builtin-ai-model").value = data.model || "";
    if ($("hf-builtin-ai-temperature")) {
      $("hf-builtin-ai-temperature").value = data.temperature != null ? data.temperature : "0.1";
    }

    loadedImageModel = (data.image_model || "dall-e-3").trim() || "dall-e-3";
    if ($("hf-builtin-ai-image-model")) {
      $("hf-builtin-ai-image-model").value = loadedImageModel;
    }

    if ($("hf-builtin-ai-vision-base-url")) {
      $("hf-builtin-ai-vision-base-url").value = data.vision_api_base_url || "";
    }
    if ($("hf-builtin-ai-vision-api-key")) {
      $("hf-builtin-ai-vision-api-key").value = data.vision_api_key || "";
    }
    if ($("hf-builtin-ai-vision-model")) {
      $("hf-builtin-ai-vision-model").value = data.vision_model || "qwen-vl-max";
    }
    if (global.HfBuiltinAiCursorAgent && global.HfBuiltinAiCursorAgent.applySaved) {
      global.HfBuiltinAiCursorAgent.applySaved((data && data.cursor_api_key) || "", (data && data.agent_model) || "");
    } else if ($("hf-builtin-ai-cursor-api-key")) {
      $("hf-builtin-ai-cursor-api-key").value = (data && data.cursor_api_key) || "";
    }
  }


  function applySmsToForm(data) {
    data = data || {};
    if ($("hf-builtin-ai-sms-ak-id")) {
      $("hf-builtin-ai-sms-ak-id").value = data.access_key_id || "";
    }
    if ($("hf-builtin-ai-sms-ak-secret")) {
      $("hf-builtin-ai-sms-ak-secret").value = "";
      $("hf-builtin-ai-sms-ak-secret").placeholder = data.access_key_secret_configured
        ? "已配置，留空则保留原密钥"
        : "密钥";
    }
    var st = $("hf-builtin-ai-sms-status");
    if (st) {
      if (data.configured) {
        st.textContent = "当前已配置" + (data.access_key_id_masked ? "（" + data.access_key_id_masked + "）" : "") + (data.source ? " · " + data.source : "");
      } else {
        st.textContent = "尚未配置短信 AccessKey";
      }
    }
  }

  function loadSmsCredentials() {
    return fetch("/api/builtin-ai/sms-credentials", { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("加载短信密钥失败");
        return res.json();
      })
      .then(function (data) {
        if (data && data.error) throw new Error(data.error);
        applySmsToForm(data);
        return data;
      });
  }

  function saveSmsCredentials() {
    var idEl = $("hf-builtin-ai-sms-ak-id");
    var secretEl = $("hf-builtin-ai-sms-ak-secret");
    if (!idEl && !secretEl) return Promise.resolve(null);
    var payload = {
      access_key_id: (idEl && idEl.value || "").trim(),
      access_key_secret: (secretEl && secretEl.value || "").trim(),
    };
    // 未改动且未填：跳过，避免误报
    if (!payload.access_key_id && !payload.access_key_secret) {
      return Promise.resolve({ skipped: true });
    }
    return fetch("/api/builtin-ai/sms-credentials", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (d) {
        return { ok: res.ok, data: d };
      });
    }).then(function (r) {
      if (!r.ok) throw new Error((r.data && r.data.error) || "短信密钥保存失败");
      applySmsToForm(r.data);
      return r.data;
    });
  }

  function loadModalConfig() {
    configReady = false;
    setSaveEnabled(false);
    return fetch("/api/builtin-ai/config", { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("加载 AI 配置失败");
        return res.json();
      })
      .then(function (data) {
        applyConfigToForm(data);
        if (global.HfBuiltinAiCursorAgent && global.HfBuiltinAiCursorAgent.onModalOpen) {
          global.HfBuiltinAiCursorAgent.onModalOpen();
        }
        return loadSmsCredentials()
          .catch(function (err) {
            applySmsToForm({});
            var st = $("hf-builtin-ai-sms-status");
            if (st) st.textContent = (err && err.message) || "短信密钥加载失败";
          })
          .then(function () {
            configReady = true;
            setSaveEnabled(true);
            return data;
          });
      });
  }

  function openModal(options) {
    options = options || {};
    closeUserMenu();
    var modal = $("hf-builtin-ai-modal");
    if (!modal) return Promise.resolve();
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    return loadModalConfig()
      .then(function () {
        var focusEl = options.focusVision
          ? $("hf-builtin-ai-vision-base-url")
          : (options.focusCursor ? $("hf-builtin-ai-cursor-api-key") : $("hf-builtin-ai-base-url"));
        if (focusEl) focusEl.focus();
      })
      .catch(function (err) {
        toast((err && err.message) || "加载配置失败", true);
        setSaveEnabled(false);
      });
  }

  function closeModal() {
    var modal = $("hf-builtin-ai-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  function saveAiConfig() {
    var imageModelEl = $("hf-builtin-ai-image-model");
    var imageModel = (imageModelEl && imageModelEl.value || loadedImageModel || "dall-e-3").trim() || "dall-e-3";
    var cursorFields = (global.HfBuiltinAiCursorAgent && global.HfBuiltinAiCursorAgent.readForm)
      ? global.HfBuiltinAiCursorAgent.readForm()
      : {
          cursor_api_key: ($("hf-builtin-ai-cursor-api-key") && $("hf-builtin-ai-cursor-api-key").value || "").trim(),
          agent_model: ($("hf-builtin-ai-agent-model") && $("hf-builtin-ai-agent-model").value || "").trim(),
        };
    if (!cursorFields.cursor_api_key) {
      cursorFields.agent_model = "";
    }
    if (cursorFields.cursor_api_key && !cursorFields.agent_model) {
      return Promise.reject(new Error("已填写 Cursor API Key，请选择 Agent 模型"));
    }

    var payload = {
      base_url: ($("hf-builtin-ai-base-url") && $("hf-builtin-ai-base-url").value || "").trim(),
      api_key: ($("hf-builtin-ai-api-key") && $("hf-builtin-ai-api-key").value || "").trim(),
      model: ($("hf-builtin-ai-model") && $("hf-builtin-ai-model").value || "").trim(),
      temperature: parseFloat(($("hf-builtin-ai-temperature") && $("hf-builtin-ai-temperature").value) || "0.1"),
      image_model: imageModel,
      vision_api_base_url: ($("hf-builtin-ai-vision-base-url") && $("hf-builtin-ai-vision-base-url").value || "").trim(),
      vision_api_key: ($("hf-builtin-ai-vision-api-key") && $("hf-builtin-ai-vision-api-key").value || "").trim(),
      vision_model: ($("hf-builtin-ai-vision-model") && $("hf-builtin-ai-vision-model").value || "").trim(),
      cursor_api_key: cursorFields.cursor_api_key || "",
      agent_model: cursorFields.agent_model || "",
    };

    return fetch("/api/builtin-ai/config", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (d) {
        return { ok: res.ok, data: d };
      });
    }).then(function (r) {
      if (!r.ok) throw new Error((r.data && r.data.error) || "AI 配置保存失败");
      loadedImageModel = (r.data.image_model || imageModel).trim() || "dall-e-3";
      return r.data;
    });
  }

  function saveModal() {
    if (!configReady) {
      toast("配置尚未就绪，请稍候", true);
      return;
    }
    setSaveEnabled(false);
    saveAiConfig()
      .then(function (aiData) {
        return saveSmsCredentials().then(function (smsData) {
          return { aiData: aiData, smsData: smsData };
        });
      })
      .then(function (pack) {
        dispatchPresetChanged(pack.aiData);
        var smsMsg = "";
        if (pack.smsData && pack.smsData.updated) smsMsg = "，短信密钥已更新";
        else if (pack.smsData && pack.smsData.skipped) smsMsg = "";
        toast("全站 AI 配置已保存并生效" + smsMsg);
        closeModal();
      })
      .catch(function (err) {
        toast(err.message || "保存失败", true);
      })
      .finally(function () {
        setSaveEnabled(true);
      });
  }

  function bindModal() {
    document.querySelectorAll("[data-hf-builtin-ai-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
    var saveBtn = $("hf-builtin-ai-save-btn");
    if (saveBtn) saveBtn.addEventListener("click", saveModal);
    var modal = $("hf-builtin-ai-modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }

  function setupAdminMenu(data) {
    var canManage = data && data.can_manage_builtin_ai;
    var adminBtn = $("hf-auth-open-builtin-ai-config");
    if (adminBtn) adminBtn.classList.toggle("is-hidden", !canManage);
    if (!canManage) return;

    if (adminBtn && !adminBtn._hfBuiltinAiBound) {
      adminBtn._hfBuiltinAiBound = true;
      adminBtn.addEventListener("click", function (e) {
        e.preventDefault();
        closeUserMenu();
        openModal();
      });
    }
  }

  function init() {
    bindModal();
    var fetchMe = global.HfAuthNav && global.HfAuthNav.fetchMe;
    if (!fetchMe) return;
    fetchMe().then(setupAdminMenu).catch(function () {});
    document.addEventListener("hf-auth-nav-updated", function (ev) {
      setupAdminMenu(ev.detail);
    });
  }

  global.HfBuiltinAiAdmin = {
    openModal: openModal,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
