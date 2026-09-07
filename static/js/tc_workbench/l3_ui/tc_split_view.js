/**
 * TestHub — 分栏视图切换（Plan B 布局）
 * 独立模块，不影响现有功能
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'tc_split_view_mode';

    function isSplitView() {
        return document.body.classList.contains('tc-split-view-mode');
    }

    function enableSplitView() {
        document.body.classList.add('tc-split-view-mode');
        // 确保左面板展开
        var panel = document.getElementById('left-panel');
        if (panel && panel.classList.contains('tc-left-float-panel--collapsed')) {
            if (typeof global.toggleCollapse === 'function') {
                global.toggleCollapse();
            }
        }
        // 更新按钮状态
        updateButtonState();
        // 刷新布局
        global.setTimeout(function () {
            if (typeof global.syncTcGenChatLayout === 'function') global.syncTcGenChatLayout();
            if (typeof global.tcLeftFloatRefreshContentHeights === 'function') global.tcLeftFloatRefreshContentHeights();
        }, 200);
        savePreference(true);
    }

    function disableSplitView() {
        document.body.classList.remove('tc-split-view-mode');
        updateButtonState();
        global.setTimeout(function () {
            if (typeof global.syncTcGenChatLayout === 'function') global.syncTcGenChatLayout();
            if (typeof global.tcLeftFloatRefreshContentHeights === 'function') global.tcLeftFloatRefreshContentHeights();
        }, 200);
        savePreference(false);
    }

    function toggleSplitView() {
        if (isSplitView()) {
            disableSplitView();
        } else {
            enableSplitView();
        }
    }

    function savePreference(enabled) {
        try {
            localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
        } catch (e) { /* ignore */ }
    }

    function loadPreference() {
        try {
            return localStorage.getItem(STORAGE_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function updateButtonState() {
        var btn = document.getElementById('tc-split-view-toggle');
        if (!btn) return;
        if (isSplitView()) {
            btn.classList.add('tc-split-view-toggle--active');
            btn.title = '退出分栏视图';
        } else {
            btn.classList.remove('tc-split-view-toggle--active');
            btn.title = '切换到分栏视图（左侧面板与右侧表格并排显示）';
        }
    }

    function createToggleButton() {
        // 分栏按钮已移除
    }

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                global.setTimeout(createToggleButton, 1000);
            });
        } else {
            global.setTimeout(createToggleButton, 1000);
        }
    }

    // ===== 对外 API =====
    global.TcSplitView = {
        enable: enableSplitView,
        disable: disableSplitView,
        toggle: toggleSplitView,
        isActive: isSplitView
    };

    init();

})(typeof window !== 'undefined' ? window : this);
