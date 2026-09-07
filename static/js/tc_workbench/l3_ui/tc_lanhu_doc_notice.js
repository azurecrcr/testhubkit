/**
 * 蓝湖需求文档：配额已满 / 重复添加 — 简约专业弹窗
 */
(function (global) {
  "use strict";

  var overlay = null;
  var titleEl = null;
  var msgEl = null;
  var confirmBtn = null;
  var bound = false;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.getElementById("tc-lanhu-doc-notice");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "tc-lanhu-doc-notice";
      overlay.className = "tc-lanhu-doc-notice is-hidden";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "tc-lanhu-doc-notice-title");
      overlay.innerHTML =
        '<div class="tc-lanhu-doc-notice__backdrop" data-tc-lanhu-doc-notice-close></div>' +
        '<div class="tc-lanhu-doc-notice__panel">' +
        '  <div class="tc-lanhu-doc-notice__accent"></div>' +
        '  <div class="tc-lanhu-doc-notice__body">' +
        '    <h2 id="tc-lanhu-doc-notice-title" class="tc-lanhu-doc-notice__title"></h2>' +
        '    <p id="tc-lanhu-doc-notice-message" class="tc-lanhu-doc-notice__message"></p>' +
        "  </div>" +
        '  <div class="tc-lanhu-doc-notice__actions">' +
        '    <button type="button" class="tc-lanhu-doc-notice__btn" data-tc-lanhu-doc-notice-confirm>知道了</button>' +
        "  </div>" +
        "</div>";
      document.body.appendChild(overlay);
    }
    titleEl = overlay.querySelector("#tc-lanhu-doc-notice-title");
    msgEl = overlay.querySelector("#tc-lanhu-doc-notice-message");
    confirmBtn = overlay.querySelector("[data-tc-lanhu-doc-notice-confirm]");
    return overlay;
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    var el = ensureOverlay();
    el.addEventListener("click", function (ev) {
      if (ev.target && ev.target.hasAttribute("data-tc-lanhu-doc-notice-close")) hide();
    });
    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        hide();
      });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && overlay && overlay.classList.contains("is-open")) hide();
    });
  }

  function hide() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.classList.add("is-hidden");
    document.body.classList.remove("tc-lanhu-doc-notice-open");
  }

  function show(opts) {
    opts = opts || {};
    bindOnce();
    var el = ensureOverlay();
    var variant = String(opts.variant || "info").trim();
    el.classList.remove("tc-lanhu-doc-notice--duplicate", "tc-lanhu-doc-notice--quota");
    if (variant === "duplicate") el.classList.add("tc-lanhu-doc-notice--duplicate");
    if (variant === "quota") el.classList.add("tc-lanhu-doc-notice--quota");
    if (titleEl) titleEl.textContent = String(opts.title || "提示").trim();
    if (msgEl) msgEl.textContent = String(opts.message || "").trim();
    if (confirmBtn) confirmBtn.textContent = String(opts.confirmText || "知道了").trim();
    el.classList.remove("is-hidden");
    el.classList.add("is-open");
    document.body.classList.add("tc-lanhu-doc-notice-open");
    global.setTimeout(function () {
      if (confirmBtn) confirmBtn.focus();
    }, 80);
  }

  function showDuplicate() {
    show({
      variant: "duplicate",
      title: "文档已存在",
      message: "该蓝湖需求文档已在您的账户下添加，无需重复添加。\n\n如需更新 Cookie 或文档信息，请在文档列表中选择该文档后重新连接。",
      confirmText: "知道了",
    });
  }

  function showQuota(opts) {
    opts = opts || {};
    var max = Number(opts.max) > 0 ? Number(opts.max) : 3;
    var count = Number(opts.count) >= 0 ? Number(opts.count) : max;
    show({
      variant: "quota",
      title: "已达文档上限",
      message:
        "每位用户最多可添加 " +
        max +
        " 个需求文档，您当前已添加 " +
        count +
        " 个。\n\n如需添加新文档，请先删除现有文档。删除后该文档下的所有用例都会丢失，请务必先导出用例后再删除。",
      confirmText: "知道了",
    });
  }

  global.TcLanhuDocNotice = {
    show: show,
    hide: hide,
    showDuplicate: showDuplicate,
    showQuota: showQuota,
  };
})(typeof window !== "undefined" ? window : this);
