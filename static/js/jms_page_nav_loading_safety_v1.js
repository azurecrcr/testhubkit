/**
 * 压测造数页 · 导航 loading 残留清理（隔离，不改 hf_page_nav_loading 主逻辑）
 */
(function (global) {
    "use strict";
    function clearNavLoading() {
        try {
            if (typeof global.hfHidePageNavLoading === "function") {
                global.hfHidePageNavLoading();
                return;
            }
        } catch (e1) { /* ignore */ }
        var el = document.getElementById("hf-page-nav-loading");
        if (el) {
            el.classList.remove("is-visible");
            el.setAttribute("aria-hidden", "true");
        }
        document.documentElement.classList.remove("hf-page-nav-loading-active");
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", clearNavLoading);
    } else {
        clearNavLoading();
    }
    global.addEventListener("load", clearNavLoading);
    global.addEventListener("pageshow", clearNavLoading);
})(typeof window !== "undefined" ? window : this);
