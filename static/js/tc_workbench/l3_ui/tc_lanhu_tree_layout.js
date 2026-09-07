/**
 * 蓝湖需求树 + 右侧用例区：仅在工作台卡片内铺满视口（不改动 body/main 布局）
 */
(function tcLanhuTreeLayoutModule() {
    'use strict';

    var MIN_GRID_H = 360;
    var resizeTimer = null;

    function getWorkbenchScope() {
        return document.querySelector('.tc-workbench-scope:has(#main-grid.tc-main-grid--with-lanhu-tree)');
    }

    function notifyWorkbenchResize() {
        window.requestAnimationFrame(function () {
            if (window.tcVxeTableApi && typeof window.tcVxeTableApi.recalculate === 'function') {
                try { window.tcVxeTableApi.recalculate(); } catch (e) { /* ignore */ }
            }
            if (typeof tcMindmapInstance !== 'undefined' && tcMindmapInstance && typeof tcMindmapInstance.resize === 'function') {
                try { tcMindmapInstance.resize(); } catch (e) { /* ignore */ }
            }
            if (typeof tcMindmapFitToView === 'function' && typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap') {
                try { tcMindmapFitToView(); } catch (e) { /* ignore */ }
            }
        });
    }

    function syncTcLanhuTreeFillHeight() {
        var scope = getWorkbenchScope();
        if (!scope) return;
        var top = scope.getBoundingClientRect().top;
        var avail = Math.floor(window.innerHeight - top - 14);
        if (avail < MIN_GRID_H) avail = MIN_GRID_H;
        scope.classList.add('tc-workbench-scope--lanhu-fill');
        scope.style.setProperty('--tc-wb-grid-h', avail + 'px');
        document.body.classList.remove('tc-lanhu-tree-fill-active');
        notifyWorkbenchResize();
    }

    function scheduleSync() {
        if (resizeTimer) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(syncTcLanhuTreeFillHeight, 80);
    }

    function bindTcLanhuTreeLayout() {
        if (!getWorkbenchScope() || window._tcLanhuTreeLayoutBound) return;
        window._tcLanhuTreeLayoutBound = true;
        syncTcLanhuTreeFillHeight();
        [120, 400].forEach(function (ms) {
            window.setTimeout(syncTcLanhuTreeFillHeight, ms);
        });
        window.addEventListener('resize', scheduleSync, { passive: true });
        window.addEventListener('orientationchange', scheduleSync, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            var scope = getWorkbenchScope();
            var ro = new ResizeObserver(scheduleSync);
            if (scope) ro.observe(scope);
        }
    }

    window.syncTcLanhuTreeFillHeight = syncTcLanhuTreeFillHeight;
    window.scheduleTcLanhuTreeFillHeight = scheduleSync;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindTcLanhuTreeLayout);
    } else {
        bindTcLanhuTreeLayout();
    }
})();
