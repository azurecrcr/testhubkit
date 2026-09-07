/**
 * 用例工作台：视口铺满高度（顶/底固定留白；仅窗口尺寸变化时重算，滚动不改变高度）
 */
(function tcTableAreaCompactLayoutModule() {
    'use strict';

    var MIN_GRID_H_FLOOR = 300;
    var FOOTER_HEIGHT_FALLBACK = 50;
    var TOP_GAP = 6;
    var PULL_UP_MAX = 14;
    var resizeTimer = null;
    var notifyTimer = null;
    var lastAvail = -1;
    var cachedSafeBottom = null;
    var cachedFooterHeight = null;
    var fixedScopeTop = null;
    var fixedPullUp = null;

    function getViewportHeight() {
        if (window.visualViewport && window.visualViewport.height > 0) {
            return window.visualViewport.height;
        }
        return window.innerHeight || document.documentElement.clientHeight || 0;
    }

    function getSafeBottom() {
        if (cachedSafeBottom !== null) return cachedSafeBottom;
        try {
            var probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom, 0px);';
            document.documentElement.appendChild(probe);
            cachedSafeBottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
            document.documentElement.removeChild(probe);
        } catch (e) {
            cachedSafeBottom = 0;
        }
        return cachedSafeBottom;
    }

    function getFooterHeight() {
        if (cachedFooterHeight !== null) return cachedFooterHeight;
        var footer = document.getElementById('hf-site-footer');
        if (!footer) {
            cachedFooterHeight = FOOTER_HEIGHT_FALLBACK;
            return cachedFooterHeight;
        }
        var height = Math.ceil(footer.offsetHeight) || FOOTER_HEIGHT_FALLBACK;
        if (height < 20) height = FOOTER_HEIGHT_FALLBACK;
        cachedFooterHeight = height;
        return cachedFooterHeight;
    }

    /** 工作台底边预留：页脚高度 + 小缝 + safe-area */
    function getBottomGap(vh) {
        if (vh < 720) return 6;
        if (vh < 1080) return 8;
        return 10;
    }

    function getEdgeInsets() {
        var vh = getViewportHeight();
        var gap = getBottomGap(vh);
        var safeBottom = getSafeBottom();
        var footerHeight = getFooterHeight();
        var bottom = footerHeight + gap + safeBottom;
        var minH = Math.max(MIN_GRID_H_FLOOR, Math.floor(vh * 0.38));
        return { bottom: bottom, footerHeight: footerHeight, gap: gap, minH: minH };
    }

    function getWorkbenchScope() {
        return document.querySelector('.tc-workbench-scope:has(#main-grid.tc-main-grid--with-lanhu-tree)');
    }

    /** 锁定工作台顶部位置（页面滚动时不更新） */
    function getFixedScopeTop(scope) {
        if (fixedScopeTop !== null) return fixedScopeTop;
        fixedScopeTop = scope.getBoundingClientRect().top;
        return fixedScopeTop;
    }

    /** 适度上拉：贴近导航栏但保留 TOP_GAP，最多 PULL_UP_MAX */
    function getFixedPullUp(scope) {
        if (fixedPullUp !== null) return fixedPullUp;
        var nav = document.querySelector('.hf-gnav');
        var scopeTop = getFixedScopeTop(scope);
        if (!nav) {
            fixedPullUp = 0;
            return 0;
        }
        var targetTop = nav.getBoundingClientRect().bottom + TOP_GAP;
        fixedPullUp = Math.min(PULL_UP_MAX, Math.max(0, Math.round(scopeTop - targetTop)));
        return fixedPullUp;
    }

    function applyPullUp(scope, pull) {
        if (pull > 0) scope.style.marginTop = (-pull) + 'px';
        else scope.style.removeProperty('margin-top');
    }

    function resetLayoutCache() {
        cachedSafeBottom = null;
        cachedFooterHeight = null;
        fixedScopeTop = null;
        fixedPullUp = null;
        lastAvail = -1;
    }

    function notifyResize() {
        if (notifyTimer) window.clearTimeout(notifyTimer);
        notifyTimer = window.setTimeout(function () {
            window.requestAnimationFrame(function () {
                if (window.tcVxeTableApi && typeof window.tcVxeTableApi.recalculate === 'function') {
                    try { window.tcVxeTableApi.recalculate(); } catch (e) { /* ignore */ }
                }
                if (typeof tcMindmapInstance !== 'undefined' && tcMindmapInstance && typeof tcMindmapInstance.resize === 'function') {
                    try { tcMindmapInstance.resize(); } catch (e) { /* ignore */ }
                }
            });
        }, 120);
    }

    function syncTcTableAreaCompactHeight() {
        if (!document.body.classList.contains('tc-hub-ai-tab')) return;
        var scope = getWorkbenchScope();
        if (!scope) return;

        var insets = getEdgeInsets();
        var vh = getViewportHeight();
        var pull = getFixedPullUp(scope);
        var scopeTop = getFixedScopeTop(scope) - pull;
        applyPullUp(scope, pull);
        var avail = Math.floor(vh - scopeTop - insets.bottom);
        if (avail < insets.minH) avail = insets.minH;

        if (Math.abs(avail - lastAvail) < 2) return;
        lastAvail = avail;

        document.documentElement.style.setProperty('--tc-wb-footer-safe', insets.footerHeight + 'px');
        document.documentElement.style.setProperty('--tc-wb-edge-bottom', insets.gap + 'px');
        document.documentElement.style.setProperty('--tc-wb-edge-top', TOP_GAP + 'px');

        scope.classList.add('tc-workbench-scope--lanhu-fill');
        scope.style.setProperty('--tc-wb-grid-h', avail + 'px');
        document.body.classList.add('tc-table-area-fill-active');
        notifyResize();
    }

    function installHeightOverride() {
        if (!document.body.classList.contains('tc-hub-ai-tab')) return;
        if (window.syncTcLanhuTreeFillHeight && window.syncTcLanhuTreeFillHeight._tcTableAreaCompactWrapped) return;

        window.syncTcLanhuTreeFillHeight = function syncTcLanhuTreeFillHeightCompact() {
            syncTcTableAreaCompactHeight();
        };
        window.syncTcLanhuTreeFillHeight._tcTableAreaCompactWrapped = true;
        window.scheduleTcLanhuTreeFillHeight = function scheduleTcLanhuTreeFillHeightCompact() {
            scheduleSync();
        };
    }

    function scheduleSync() {
        if (resizeTimer) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
            resetLayoutCache();
            installHeightOverride();
            syncTcTableAreaCompactHeight();
        }, 80);
    }

    function bindViewportListeners() {
        window.addEventListener('resize', scheduleSync, { passive: true });
        window.addEventListener('orientationchange', scheduleSync, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', scheduleSync, { passive: true });
        }
    }

    function boot() {
        resetLayoutCache();
        installHeightOverride();
        syncTcTableAreaCompactHeight();
        bindViewportListeners();
        window.setTimeout(function () {
            resetLayoutCache();
            installHeightOverride();
            syncTcTableAreaCompactHeight();
        }, 200);
    }

    window.syncTcTableAreaCompactHeight = syncTcTableAreaCompactHeight;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
