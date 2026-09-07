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
