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
