/**
 * 用例工作台首次进入/刷新：在文档树与用例状态恢复完成前，右侧表格展示 boot loading，
 * 避免短暂闪现「选择模板」。与页面切换 loading（showTablePageLoading）隔离。
 */
(function tcTableBootLoadingModule() {
    'use strict';

    var global = window;
    var _pending = false;
    var _finished = false;
    var _safetyTimer = null;

    function getPanel() {
        return document.getElementById('tc-table-list-panel');
    }

    function clearSafetyTimer() {
        if (_safetyTimer) {
            clearTimeout(_safetyTimer);
            _safetyTimer = null;
        }
    }

    function armBootSafetyTimer() {
        clearSafetyTimer();
        _safetyTimer = setTimeout(function () {
            finishTcTableBootHydrate();
        }, 30000);
    }

    function beginTcTableBootHydrate() {
        if (_finished) return;
        _pending = true;
        armBootSafetyTimer();
        syncTcTableBootLoadingChrome(false);
    }

    function finishTcTableBootHydrate() {
        if (_finished) return;
        _finished = true;
        _pending = false;
        clearSafetyTimer();
        var panel = getPanel();
        if (panel) {
            panel.classList.remove('tc-table-list-panel--boot-loading');
            panel.classList.add('tc-table-boot-ready');
        }
        if (typeof global.syncTcTableTemplateChrome === 'function') {
            global.syncTcTableTemplateChrome();
        }
    }

    function isTcTableBootHydratePending() {
        return (_pending || isDomBootLoading()) && !_finished;
    }

    function isDomBootLoading() {
        var panel = getPanel();
        return !!(panel && panel.classList.contains('tc-table-list-panel--boot-loading'));
    }

    function syncTcTableBootLoadingChrome(applied) {
        var panel = getPanel();
        if (!panel) return;
        if (_finished) {
            panel.classList.remove('tc-table-list-panel--boot-loading');
            return;
        }
        if (applied) {
            finishTcTableBootHydrate();
            return;
        }
        if (!_pending && !isDomBootLoading()) return;
        _pending = true;
        panel.classList.add('tc-table-list-panel--boot-loading');
    }

    function bootstrapWorkbenchBootLoading() {
        if (_finished || !document.querySelector('.tc-workbench-scope')) return;
        var panel = getPanel();
        if (!panel) return;
        _pending = true;
        panel.classList.add('tc-table-list-panel--boot-loading');
        armBootSafetyTimer();
    }

    global.beginTcTableBootHydrate = beginTcTableBootHydrate;
    global.finishTcTableBootHydrate = finishTcTableBootHydrate;
    global.isTcTableBootHydratePending = isTcTableBootHydratePending;
    global.syncTcTableBootLoadingChrome = syncTcTableBootLoadingChrome;

    bootstrapWorkbenchBootLoading();
})();
