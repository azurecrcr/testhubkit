/**
 * 全站导航：个人资料入口（跳转子页面）
 */
(function (global) {
  "use strict";

  if (global.__hfUserProfileBound) return;
  global.__hfUserProfileBound = true;

  var PROFILE_URL = "/account/profile";

  function $(id) {
    return document.getElementById(id);
  }

  function closeUserMenu() {
    var panel = $("hf-auth-user-menu-panel");
    var btn = $("hf-auth-user-menu-btn");
    if (panel) panel.classList.remove("is-open");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function goProfilePage() {
    closeUserMenu();
    global.location.href = PROFILE_URL;
  }

  function bindMenuTriggers() {
    var openProfile = $("hf-auth-open-profile");
    var sheetProfile = $("hf-auth-sheet-profile");
    if (openProfile && !openProfile._hfProfileBound) {
      openProfile._hfProfileBound = true;
      openProfile.addEventListener("click", function (e) {
        e.preventDefault();
        goProfilePage();
      });
    }
    if (sheetProfile && !sheetProfile._hfProfileBound) {
      sheetProfile._hfProfileBound = true;
      sheetProfile.addEventListener("click", function (e) {
        e.preventDefault();
        goProfilePage();
      });
    }
  }

  function init() {
    bindMenuTriggers();
  }

  global.HfUserProfile = {
    openPage: goProfilePage,
    profileUrl: PROFILE_URL,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
