/**
 * 缺陷管理页专用对话框（不改动全站 / 用例工作台 / CmDialogs）。
 * 暴露 window.DmDialogs.confirmDanger — 返回 Promise<boolean>
 */
(function (global) {
  "use strict";

  var root = null;
  var titleEl = null;
  var descEl = null;
  var metaEl = null;
  var cancelBtn = null;
  var okBtn = null;
  var active = null;
  var prevFocus = null;

  function ensureDom() {
    if (root) return;
    root = document.getElementById("dm-dialog");
    if (!root) return;
    titleEl = document.getElementById("dm-dialog-title");
    descEl = document.getElementById("dm-dialog-desc");
    metaEl = document.getElementById("dm-dialog-meta");
    cancelBtn = document.getElementById("dm-dialog-cancel");
    okBtn = document.getElementById("dm-dialog-ok");

    root.addEventListener("click", function (e) {
      if (e.target === root) close(false);
    });
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        close(false);
      });
    }
    if (okBtn) {
      okBtn.addEventListener("click", function () {
        close(true);
      });
    }
    document.addEventListener("keydown", function (e) {
      if (!active || !root || root.classList.contains("is-hidden")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
      if (e.key === "Enter" && document.activeElement === okBtn) {
        e.preventDefault();
        close(true);
      }
    });
  }

  function openShell(opts) {
    ensureDom();
    if (!root || !active) return;
    prevFocus = document.activeElement;
    if (titleEl) titleEl.textContent = opts.title || "请确认";
    if (descEl) {
      descEl.textContent = opts.message || "";
      descEl.classList.toggle("is-hidden", !opts.message);
    }
    if (metaEl) {
      if (opts.meta) {
        metaEl.textContent = opts.meta;
        metaEl.classList.remove("is-hidden");
      } else {
        metaEl.textContent = "";
        metaEl.classList.add("is-hidden");
      }
    }
    if (cancelBtn) cancelBtn.textContent = opts.cancelText || "取消";
    if (okBtn) okBtn.textContent = opts.confirmText || "删除";
    root.classList.toggle("dm-dialog--danger", opts.danger !== false);
    root.classList.remove("is-hidden");
    root.setAttribute("aria-hidden", "false");
    setTimeout(function () {
      if (cancelBtn && typeof cancelBtn.focus === "function") cancelBtn.focus();
    }, 30);
  }

  function close(result) {
    if (!active) return;
    var resolver = active.resolve;
    active = null;
    if (root) {
      root.classList.add("is-hidden");
      root.setAttribute("aria-hidden", "true");
      root.classList.remove("dm-dialog--danger");
    }
    if (prevFocus && typeof prevFocus.focus === "function") {
      try {
        prevFocus.focus();
      } catch (e) { /* ignore */ }
    }
    prevFocus = null;
    resolver(!!result);
  }

  /**
   * 危险确认（删除等）。新方法，不影响 window.confirm。
   * @param {{title?:string,message?:string,meta?:string,confirmText?:string,cancelText?:string,danger?:boolean}} opts
   * @returns {Promise<boolean>}
   */
  function confirmDanger(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      ensureDom();
      if (!root) {
        resolve(window.confirm(opts.message || opts.title || "确认？"));
        return;
      }
      if (active) {
        resolve(false);
        return;
      }
      active = { resolve: resolve };
      openShell({
        title: opts.title || "确认删除",
        message: opts.message || "此操作不可恢复。",
        meta: opts.meta || "",
        confirmText: opts.confirmText || "删除",
        cancelText: opts.cancelText || "取消",
        danger: opts.danger !== false,
      });
    });
  }

  global.DmDialogs = {
    confirmDanger: confirmDanger,
  };
})(window);
