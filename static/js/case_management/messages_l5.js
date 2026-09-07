/**
 * 消息深链：已迁入 messages_ui.js（data-* + navigateMsgInbox）。
 * 本文件保留为空壳，避免旧缓存/脚本引用 404；若 Inbox 未就绪则回退 data-nav 跳转（不再二次请求列表）。
 */
(function () {
  if (window.__CM_MSG_INBOX_NAV__) return;

  function goFromCard(card) {
    var nav = card.getAttribute("data-nav") || "none";
    if (nav === "none") return;
    var pid = encodeURIComponent(card.getAttribute("data-project-id") || "");
    if (nav === "defect") {
      window.location.href =
        "/tool/defect-management?project_id=" +
        pid +
        "&defect_id=" +
        encodeURIComponent(card.getAttribute("data-defect-id") || "");
      return;
    }
    if (nav === "plan") {
      window.location.href =
        "/tool/case-management?project_id=" +
        pid +
        "&plan_id=" +
        encodeURIComponent(card.getAttribute("data-plan-id") || "");
      return;
    }
    if (nav === "case") {
      window.location.href =
        "/tool/case-management?project_id=" +
        pid +
        "&case_id=" +
        encodeURIComponent(card.getAttribute("data-case-id") || "");
      return;
    }
    if (nav === "project") {
      window.location.href = "/tool/case-management?project_id=" + pid;
    }
  }

  function enhance() {
    var box = document.getElementById("cm-messages-list");
    if (!box || box._l5MsgHookedFallback) return;
    box._l5MsgHookedFallback = true;
    box.addEventListener(
      "click",
      function (e) {
        if (window.__CM_MSG_INBOX_NAV__) return;
        var card = e.target.closest(".cm-msg-card");
        if (!card || e.target.closest("button")) return;
        goFromCard(card);
      },
      true
    );
  }

  function boot() {
    if (window.__CM_MSG_INBOX_NAV__) return;
    enhance();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
