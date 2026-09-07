/**
 * 用例管理页专用对话框（不改动全站 alert/prompt/confirm）。
 * 暴露 window.CmDialogs：prompt / confirm，返回 Promise。
 */
(function (global) {
  "use strict";

  var root = null;
  var titleEl = null;
  var descEl = null;
  var fieldWrap = null;
  var labelEl = null;
  var inputEl = null;
  var selectEl = null;
  var errEl = null;
  var cancelBtn = null;
  var okBtn = null;
  var active = null;
  var prevFocus = null;

  function ensureDom() {
    if (root) return;
    root = document.getElementById("cm-dialog");
    if (!root) return;
    titleEl = document.getElementById("cm-dialog-title");
    descEl = document.getElementById("cm-dialog-desc");
    fieldWrap = document.getElementById("cm-dialog-field");
    labelEl = document.getElementById("cm-dialog-label");
    inputEl = document.getElementById("cm-dialog-input");
    selectEl = document.getElementById("cm-dialog-select");
    errEl = document.getElementById("cm-dialog-error");
    cancelBtn = document.getElementById("cm-dialog-cancel");
    okBtn = document.getElementById("cm-dialog-ok");

    root.addEventListener("click", function (e) {
      if (e.target === root) close(null);
    });
    cancelBtn.addEventListener("click", function () {
      close(null);
    });
    okBtn.addEventListener("click", function () {
      submit();
    });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });
    if (selectEl) {
      selectEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });
    }
    document.addEventListener("keydown", function (e) {
      if (!active) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
      }
    });
  }

  function setError(msg) {
    if (!errEl) return;
    if (msg) {
      errEl.textContent = msg;
      errEl.classList.remove("is-hidden");
    } else {
      errEl.textContent = "";
      errEl.classList.add("is-hidden");
    }
  }

  function openShell(opts) {
    ensureDom();
    if (!root || !active) return;
    prevFocus = document.activeElement;
    titleEl.textContent = opts.title || "提示";
    if (opts.message) {
      descEl.textContent = opts.message;
      descEl.classList.remove("is-hidden");
    } else {
      descEl.textContent = "";
      descEl.classList.add("is-hidden");
    }
    setError("");
    root.classList.toggle("cm-dialog--danger", !!opts.danger);
    root.classList.toggle("cm-dialog--prompt", opts.mode === "prompt");
    root.classList.toggle("cm-dialog--confirm", opts.mode === "confirm");
    cancelBtn.textContent = opts.cancelText || "取消";
    okBtn.textContent = opts.confirmText || (opts.mode === "confirm" ? "确认" : "确定");
    root.classList.remove("is-hidden");
    root.setAttribute("aria-hidden", "false");
  }

  function close(result) {
    if (!active) return;
    var resolver = active.resolve;
    active = null;
    if (root) {
      root.classList.add("is-hidden");
      root.setAttribute("aria-hidden", "true");
      root.classList.remove(
        "cm-dialog--danger",
        "cm-dialog--prompt",
        "cm-dialog--confirm",
        "cm-dialog--alert"
      );
      if (inputEl) inputEl.classList.remove("is-hidden");
      if (selectEl) {
        selectEl.classList.add("is-hidden");
        selectEl.innerHTML = "";
      }
      if (cancelBtn) cancelBtn.classList.remove("is-hidden");
    }
    if (prevFocus && typeof prevFocus.focus === "function") {
      try {
        prevFocus.focus();
      } catch (e) { /* ignore */ }
    }
    prevFocus = null;
    resolver(result);
  }

  function submit() {
    if (!active) return;
    if (active.mode === "prompt") {
      var val = (inputEl.value || "").trim();
      if (!val) {
        setError(active.requiredMessage || "请输入内容");
        inputEl.focus();
        return;
      }
      close(val);
      return;
    }
    if (active.mode === "choose") {
      var chosen = selectEl ? String(selectEl.value || "").trim() : "";
      if (!chosen) {
        setError(active.requiredMessage || "请选择一项");
        if (selectEl) selectEl.focus();
        return;
      }
      close(chosen);
      return;
    }
    close(true);
  }

  function prompt(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (active) {
        resolve(null);
        return;
      }
      active = { mode: "prompt", resolve: resolve, requiredMessage: opts.requiredMessage };
      openShell({
        mode: "prompt",
        title: opts.title || "请输入",
        message: opts.message || "",
        confirmText: opts.confirmText || "确定",
        cancelText: opts.cancelText || "取消",
        danger: !!opts.danger,
      });
      fieldWrap.classList.remove("is-hidden");
      labelEl.textContent = opts.label || "名称";
      if (inputEl) inputEl.classList.remove("is-hidden");
      if (selectEl) selectEl.classList.add("is-hidden");
      inputEl.value = opts.defaultValue != null ? String(opts.defaultValue) : "";
      inputEl.placeholder = opts.placeholder || "";
      inputEl.maxLength = opts.maxLength || 200;
      setTimeout(function () {
        inputEl.focus();
        inputEl.select();
      }, 30);
    });
  }

  function choose(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (active) {
        resolve(null);
        return;
      }
      ensureDom();
      if (!selectEl) {
        resolve(null);
        return;
      }
      active = { mode: "choose", resolve: resolve, requiredMessage: opts.requiredMessage };
      openShell({
        mode: "prompt",
        title: opts.title || "请选择",
        message: opts.message || "",
        confirmText: opts.confirmText || "确定",
        cancelText: opts.cancelText || "取消",
        danger: !!opts.danger,
      });
      fieldWrap.classList.remove("is-hidden");
      labelEl.textContent = opts.label || "选项";
      if (inputEl) inputEl.classList.add("is-hidden");
      selectEl.classList.remove("is-hidden");
      selectEl.innerHTML = "";
      (opts.options || []).forEach(function (opt) {
        var o = document.createElement("option");
        o.value = opt.value != null ? String(opt.value) : "";
        o.textContent = opt.label != null ? String(opt.label) : o.value;
        selectEl.appendChild(o);
      });
      if (opts.defaultValue != null) selectEl.value = String(opts.defaultValue);
      setTimeout(function () {
        selectEl.focus();
      }, 30);
    });
  }

  function confirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (active) {
        resolve(false);
        return;
      }
      active = { mode: "confirm", resolve: resolve };
      openShell({
        mode: "confirm",
        title: opts.title || "请确认",
        message: opts.message || "",
        confirmText: opts.confirmText || "确认",
        cancelText: opts.cancelText || "取消",
        danger: opts.danger !== false,
      });
      fieldWrap.classList.add("is-hidden");
      if (inputEl) inputEl.classList.remove("is-hidden");
      if (selectEl) selectEl.classList.add("is-hidden");
      cancelBtn.classList.remove("is-hidden");
      setTimeout(function () {
        okBtn.focus();
      }, 30);
    });
  }

  function alert(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (active) {
        resolve(false);
        return;
      }
      active = { mode: "alert", resolve: resolve };
      openShell({
        mode: "confirm",
        title: opts.title || "提示",
        message: opts.message || "",
        confirmText: opts.confirmText || "知道了",
        cancelText: "取消",
        danger: false,
      });
      fieldWrap.classList.add("is-hidden");
      if (inputEl) inputEl.classList.remove("is-hidden");
      if (selectEl) selectEl.classList.add("is-hidden");
      cancelBtn.classList.add("is-hidden");
      root.classList.add("cm-dialog--alert");
      setTimeout(function () {
        okBtn.focus();
      }, 30);
    });
  }

  global.CmDialogs = {
    prompt: prompt,
    choose: choose,
    confirm: confirm,
    alert: alert,
  };
})(window);
