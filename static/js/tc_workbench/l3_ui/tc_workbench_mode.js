/**
 * 工作台左栏：仅保留智能编辑模式（智能生成已移除）
 */
(function (global) {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function notifyPlanContextChange() {
        global.setTimeout(function () {
            if (global.TcWorkbenchSession &&
                typeof global.TcWorkbenchSession.syncPlanContextFromWorkbench === 'function') {
                global.TcWorkbenchSession.syncPlanContextFromWorkbench();
            }
        }, 0);
    }

    function getCurrentMode() {
        return 'edit';
    }

    function isEditMode() {
        return true;
    }

    function syncTabChrome() {
        var editPanel = $('drawer-edit-content');
        if (editPanel) {
            editPanel.classList.remove('hidden');
            editPanel.setAttribute('aria-hidden', 'false');
        }

        if (document.body) {
            document.body.classList.add('tc-workbench-mode-edit');
            document.body.classList.remove('tc-workbench-mode-single');
        }

        var leftWrap = $('left-content-wrapper');
        if (leftWrap) leftWrap.setAttribute('data-active-gen-mode', 'edit');

        var title = document.querySelector('.tc-left-float-panel__title');
        if (title) title.textContent = '智能编辑';

        if (typeof global.initTcEditComposer === 'function') {
            global.initTcEditComposer();
        }
        if (global.TcEditAttachments && typeof global.TcEditAttachments.refreshOnPanelOpen === 'function') {
            global.TcEditAttachments.refreshOnPanelOpen();
        }
        if (typeof global.syncTcEditSendBtnState === 'function') {
            global.syncTcEditSendBtnState();
        }
        if (typeof global.tcLeftFloatRefreshContentHeights === 'function') {
            global.tcLeftFloatRefreshContentHeights();
        }
    }

    function switchTcWorkbenchMode(mode) {
        if (mode !== 'edit') return;
        syncTabChrome();
        notifyPlanContextChange();
    }

    function initTcWorkbenchMode() {
        syncTabChrome();
        notifyPlanContextChange();
    }

    global.switchTcWorkbenchMode = switchTcWorkbenchMode;
    global.getTcWorkbenchMode = getCurrentMode;
    global.isTcWorkbenchEditMode = isEditMode;
    global.initTcWorkbenchMode = initTcWorkbenchMode;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTcWorkbenchMode);
    } else {
        initTcWorkbenchMode();
    }
})(typeof window !== 'undefined' ? window : this);
