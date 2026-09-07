/**
 * Studio v2 · 启用树形壳层（左线程组 + 右步骤区，隔离模块）
 */
(function (global) {
    'use strict';

    function isStudioV2() {
        return !!(global.document && global.document.body &&
            global.document.body.classList.contains('lth-studio-v2'));
    }

    function isJmeterTab() {
        return !!(global.document && global.document.body &&
            global.document.body.classList.contains('lth-hub-jmeter-tab'));
    }

    function enableTreeForStudio() {
        if (!isStudioV2() || !isJmeterTab()) return;
        global.document.body.classList.add('lth-tg-view-tree');
        try {
            global.sessionStorage.setItem('lth_tg_view_mode', 'tree');
        } catch (e) { /* ignore */ }
        global.document.querySelectorAll('.jms-tg-tree-host').forEach(function (el) {
            el.style.removeProperty('display');
        });
        var Shell = global.JmsTgTreeShell;
        if (Shell) {
            if (typeof Shell.initForStudioV2 === 'function') {
                Shell.initForStudioV2();
            } else if (typeof Shell.setTreeView === 'function') {
                Shell.setTreeView(true);
            }
            if (typeof Shell.syncAll === 'function') Shell.syncAll(true);
        }
        if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.ensureBind === 'function') {
            global.JmsHttpContextUi.ensureBind();
        }
    }

    function boot() {
        if (!isStudioV2() || !isJmeterTab()) return;
        enableTreeForStudio();
        var tries = 0;
        var wait = global.setInterval(function () {
            tries += 1;
            if (global.JmsTgTreeShell || tries > 120) {
                global.clearInterval(wait);
                enableTreeForStudio();
            }
        }, 50);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    global.JmsTgTreeStudioV2Enable = { enable: enableTreeForStudio };
})(window);
