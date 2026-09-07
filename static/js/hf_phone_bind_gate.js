/**
 * 全站手机实名引导（独立模块）：弹窗 + PHONE_BIND_REQUIRED 拦截。
 * 不改业务页逻辑；强制绑手机页自身不弹窗。
 */
(function (global) {
  "use strict";

  var MODAL_ID = "hf-phone-bind-gate-modal";
  var shownOnce = false;
  var fetchPatched = false;

  function onBindPhonePage() {
    return !!(document.body && document.body.getAttribute("data-hf-phone-bind-page") === "1");
  }

  function currentPath() {
    return global.location.pathname + global.location.search;
  }

  function isExemptPage() {
    var path = global.location.pathname || "";
    if (path.indexOf("/account/bind-phone") === 0) return true;
    if (path.indexOf("/auth") === 0) return true;
    if (path.indexOf("/legal/") === 0) return true;
    return false;
  }

  function bindUrl(nextPath) {
    var next = nextPath || currentPath();
    if (!next || next.indexOf("/account/bind-phone") === 0 || next.indexOf("/auth") === 0) {
      next = "/app";
    }
    return "/account/bind-phone?next=" + encodeURIComponent(next);
  }

  function ensureModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) return existing;
    var wrap = document.createElement("div");
    wrap.id = MODAL_ID;
    wrap.className = "hf-phone-bind-gate is-hidden";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "hf-phone-bind-gate-title");
    wrap.innerHTML =
      '<div class="hf-phone-bind-gate__panel">' +
      '<p class="hf-phone-bind-gate__badge">公安实名要求</p>' +
      '<h2 class="hf-phone-bind-gate__title" id="hf-phone-bind-gate-title">请绑定手机号</h2>' +
      '<p class="hf-phone-bind-gate__body">根据网络安全相关规定及公安实名核验要求，使用本平台前须通过手机短信验证码完成实名验证。未绑定手机号将无法继续使用业务功能。</p>' +
      '<div class="hf-phone-bind-gate__actions">' +
      '<button type="button" class="hf-phone-bind-gate__btn hf-phone-bind-gate__btn--ghost" data-hf-phone-bind-logout>退出登录</button>' +
      '<button type="button" class="hf-phone-bind-gate__btn hf-phone-bind-gate__btn--primary" data-hf-phone-bind-go>去绑定手机号</button>' +
      "</div></div>";
    document.body.appendChild(wrap);

    wrap.querySelector("[data-hf-phone-bind-go]").addEventListener("click", function () {
      global.location.href = bindUrl();
    });
    wrap.querySelector("[data-hf-phone-bind-logout]").addEventListener("click", function () {
      fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
        .then(function () { global.location.href = "/auth"; })
        .catch(function () { global.location.href = "/auth"; });
    });
    return wrap;
  }

  function openModal(forceRedirect) {
    if (onBindPhonePage() || isExemptPage()) {
      if (forceRedirect && !onBindPhonePage() && !isExemptPage()) {
        global.location.href = bindUrl();
      }
      return;
    }
    if (forceRedirect) {
      global.location.href = bindUrl();
      return;
    }
    var modal = ensureModal();
    modal.classList.remove("is-hidden");
    document.body.classList.add("hf-phone-bind-gate-open");
    shownOnce = true;
  }

  function maybePromptFromMe(data) {
    if (!data || !data.authenticated || !data.user) return;
    if (!data.user.phone_bind_required) return;
    if (onBindPhonePage() || isExemptPage()) return;
    openModal(false);
  }

  function handlePhoneBindRequired() {
    if (typeof global.hfFloatToast === "function") {
      global.hfFloatToast("请先绑定手机号（公安实名要求）", {
        variant: "warning",
        placement: "top",
        duration: 2200,
      });
    }
    openModal(true);
  }

  function patchFetch() {
    if (fetchPatched || typeof global.fetch !== "function") return;
    fetchPatched = true;
    var rawFetch = global.fetch.bind(global);
    global.fetch = function (input, init) {
      return rawFetch(input, init).then(function (res) {
        try {
          var url = typeof input === "string" ? input : (input && input.url) || "";
          if (url.indexOf("/api/") < 0) return res;
          if (res.status !== 403) return res;
          var clone = res.clone();
          clone.json().then(function (body) {
            if (body && body.code === "PHONE_BIND_REQUIRED") {
              handlePhoneBindRequired();
            }
          }).catch(function () { /* ignore */ });
        } catch (e) { /* ignore */ }
        return res;
      });
    };
  }

  function boot() {
    patchFetch();
    if (onBindPhonePage()) return;

    function onNav(detail) {
      maybePromptFromMe(detail || {});
    }

    global.addEventListener("hf-auth-nav-updated", function (ev) {
      onNav(ev && ev.detail);
    });

    if (global.HfAuthNav && global.HfAuthNav.fetchMe) {
      global.HfAuthNav.fetchMe().then(maybePromptFromMe).catch(function () { /* ignore */ });
    }
  }

  global.HfPhoneBindGate = {
    open: openModal,
    bindUrl: bindUrl,
    handleRequired: handlePhoneBindRequired,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : this);
