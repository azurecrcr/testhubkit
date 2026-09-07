(function () {
    if (window.__hfPageNavLoadingBound) return;
    window.__hfPageNavLoadingBound = true;

    var overlay = null;
    var safetyTimer = null;

    function ensureOverlay() {
        if (!overlay) overlay = document.getElementById("hf-page-nav-loading");
        return overlay;
    }

    function showPageNavLoading() {
        var el = ensureOverlay();
        if (!el) return;
        el.classList.add("is-visible");
        el.setAttribute("aria-hidden", "false");
        document.documentElement.classList.add("hf-page-nav-loading-active");
        if (safetyTimer) clearTimeout(safetyTimer);
        safetyTimer = setTimeout(hidePageNavLoading, 120000);
    }

    function hidePageNavLoading() {
        var el = ensureOverlay();
        if (!el) return;
        el.classList.remove("is-visible");
        el.setAttribute("aria-hidden", "true");
        document.documentElement.classList.remove("hf-page-nav-loading-active");
        if (safetyTimer) {
            clearTimeout(safetyTimer);
            safetyTimer = null;
        }
    }

    window.hfShowPageNavLoading = showPageNavLoading;
    window.hfHidePageNavLoading = hidePageNavLoading;

    function shouldInterceptLink(anchor, event) {
        if (!anchor || !anchor.getAttribute("href")) return false;
        if (anchor.hasAttribute("data-hf-no-nav-loading")) return false;
        if (anchor.hasAttribute("download")) return false;
        if (anchor.target && String(anchor.target).toLowerCase() === "_blank") return false;
        if (event) {
            if (event.defaultPrevented) return false;
            if (event.button !== 0) return false;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
        }

        var href = anchor.getAttribute("href");
        if (!href || href.charAt(0) === "#") return false;
        if (/^javascript:/i.test(href)) return false;
        if (/^(mailto:|tel:)/i.test(href)) return false;

        try {
            var next = new URL(anchor.href, window.location.origin);
            if (next.origin !== window.location.origin) return false;
            if (next.href === window.location.href) return false;
            if (
                next.pathname === window.location.pathname
                && next.search === window.location.search
                && next.hash
            ) {
                return false;
            }
            // 文件导出（CSV 等）不会真正换页，不应挂导航 loading
            if (/\.(csv|xlsx|xls|zip|json)(?:$|\?)/i.test(next.pathname + next.search)) return false;
            if (/\/export(?:\.csv)?$/i.test(next.pathname)) return false;
            return true;
        } catch (err) {
            return false;
        }
    }

    document.addEventListener(
        "click",
        function (event) {
            var anchor = event.target && event.target.closest ? event.target.closest("a[href]") : null;
            if (!shouldInterceptLink(anchor, event)) return;
            showPageNavLoading();
        },
        true
    );

    window.addEventListener("pageshow", hidePageNavLoading);
    window.addEventListener("load", hidePageNavLoading);

})();
