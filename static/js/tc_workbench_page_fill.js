/**
 * 用例工作台页面铺满高度（仅 test-cases Hub，与 lanhu_tree_layout 隔离）
 * 复用 --tc-wb-grid-h / tc-workbench-scope--lanhu-fill，不修改 bundle 内逻辑
 */
(function tcWorkbenchPageFillModule() {
    'use strict';

    var BOTTOM_GAP = 18;
    var MIN_H = 380;
    var resizeTimer = null;

    function isTestCasesHub() {
        return document.body.classList.contains('tc-hub-ai-tab');
    }

    function getAiScope() {
        return document.querySelector('body.tc-hub-ai-tab .tc-workbench-scope--page-fill');
    }


    function notifyResize() {
        window.requestAnimationFrame(function () {
            if (window.tcVxeTableApi && typeof window.tcVxeTableApi.recalculate === 'function') {
                try { window.tcVxeTableApi.recalculate(); } catch (e) { /* ignore */ }
            }
            if (typeof window.syncTcLanhuTreeFillHeight === 'function') {
                try { window.syncTcLanhuTreeFillHeight(); } catch (e) { /* ignore */ }
            }
        });
    }

    function syncAiFill() {
        var scope = getAiScope();
        if (!scope) return;
        var top = scope.getBoundingClientRect().top;
        var avail = Math.floor(window.innerHeight - top - BOTTOM_GAP);
        if (avail < MIN_H) avail = MIN_H;
        scope.classList.add('tc-workbench-scope--lanhu-fill');
        scope.style.setProperty('--tc-wb-grid-h', avail + 'px');
    }


    function syncAll() {
        if (!isTestCasesHub()) return;
        syncAiFill();
        notifyResize();
    }

    function scheduleSync() {
        if (resizeTimer) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(syncAll, 80);
    }

    function bind() {
        if (!isTestCasesHub() || window._tcWorkbenchPageFillBound) return;
        window._tcWorkbenchPageFillBound = true;
        syncAll();
        [120, 350, 700].forEach(function (ms) {
            window.setTimeout(syncAll, ms);
        });
        window.addEventListener('resize', scheduleSync, { passive: true });
        window.addEventListener('orientationchange', scheduleSync, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            var ro = new ResizeObserver(scheduleSync);
            var ai = getAiScope();
        }
    }

    window.syncTcWorkbenchPageFill = syncAll;
    window.scheduleTcWorkbenchPageFill = scheduleSync;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})();
