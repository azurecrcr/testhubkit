/**
 * RAG 召回 · 非管理员私有化能力提示弹窗（独立模块，不改动密码解锁 / 管理员开关逻辑）
 */
(function (global) {
  "use strict";

  var overlay = null;
  var confirmBtn = null;
  var bound = false;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.getElementById("tc-rag-private-notice");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "tc-rag-private-notice";
      overlay.className = "tc-rag-private-notice is-hidden";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "tc-rag-private-notice-title");
      overlay.innerHTML =
        '<div class="tc-rag-private-notice__backdrop" data-tc-rag-private-notice-close></div>' +
        '<div class="tc-rag-private-notice__panel">' +
        '  <div class="tc-rag-private-notice__hero">' +
        '    <div class="tc-rag-private-notice__icon" aria-hidden="true">' +
        '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">' +
        '        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/>' +
        '        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>' +
        "      </svg>" +
        "    </div>" +
        "    <div>" +
        '      <p class="tc-rag-private-notice__eyebrow">知识增强</p>' +
        '      <h2 id="tc-rag-private-notice-title" class="tc-rag-private-notice__title">RAG 召回 · 企业专属能力</h2>' +
        "    </div>" +
        "  </div>" +
        '  <div class="tc-rag-private-notice__body">' +
        '    <p class="tc-rag-private-notice__lead">' +
        "生成用例时，可检索系统当前功能与业务知识，让用例更贴近真实场景，减少空泛描述与关键路径遗漏。" +
        "</p>" +
        '    <p class="tc-rag-private-notice__note">' +
        "该能力面向<strong>私有化部署</strong>开放。如需开通或了解方案，可通过顶部导航「投稿 / 建议」联系我们。" +
        "</p>" +
        '    <div class="tc-rag-private-notice__metric">' +
        '      <div class="tc-rag-private-notice__metric-value">+50%</div>' +
        '      <div class="tc-rag-private-notice__metric-label">结合系统现有功能生成时，可用性最高约可提升 50%（视业务与知识库完整度而定）</div>' +
        "    </div>" +
        "  </div>" +
        '  <div class="tc-rag-private-notice__actions">' +
        '    <button type="button" class="tc-rag-private-notice__btn" data-tc-rag-private-notice-confirm>我知道了</button>' +
        "  </div>" +
        "</div>";
      document.body.appendChild(overlay);
    }
    confirmBtn = overlay.querySelector("[data-tc-rag-private-notice-confirm]");
    return overlay;
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    var el = ensureOverlay();
    el.addEventListener("click", function (ev) {
      if (ev.target && ev.target.hasAttribute("data-tc-rag-private-notice-close")) hide();
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
    document.body.classList.remove("tc-rag-private-notice-open");
  }

  function show() {
    bindOnce();
    var el = ensureOverlay();
    el.classList.remove("is-hidden");
    el.classList.add("is-open");
    document.body.classList.add("tc-rag-private-notice-open");
    global.setTimeout(function () {
      if (confirmBtn) confirmBtn.focus();
    }, 80);
  }

  global.TcRagPrivateNotice = {
    show: show,
    hide: hide,
  };
  global.showTcRagPrivateDeployNotice = show;
})(typeof window !== "undefined" ? window : this);
