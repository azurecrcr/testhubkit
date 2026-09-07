/**
 * Studio v2 · 禁用树形壳层自动接管（legacy 网格为正确工作台）
 */
(function (global) {
    'use strict';

    function isStudioV2() {
        return !!(global.document && global.document.body &&
            global.document.body.classList.contains('lth-studio-v2'));
    }

    function disableTreeForStudio() {
        if (!isStudioV2()) return;
        global.document.body.classList.remove('lth-tg-view-tree');
        try {
            global.sessionStorage.setItem('lth_tg_view_mode', 'list');
        } catch (e) { /* ignore */ }
        global.document.querySelectorAll('.jms-tg-tree-host').forEach(function (el) {
            el.style.display = 'none';
        });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', disableTreeForStudio);
    } else {
        disableTreeForStudio();
    }

    var origInit = null;
    var tries = 0;
    var guard = global.setInterval(function () {
        tries += 1;
        var Shell = global.JmsTgTreeShell;
        if (Shell && !Shell.__studioV2GuardPatched) {
            Shell.__studioV2GuardPatched = true;
            var origSync = Shell.syncAll;
            if (typeof origSync === 'function') {
                Shell.syncAll = function (forceFull) {
                    if (isStudioV2()) {
                        disableTreeForStudio();
                        return;
                    }
                    return origSync.call(Shell, forceFull);
                };
            }
            global.clearInterval(guard);
        }
        if (tries > 120) global.clearInterval(guard);
    }, 50);

    global.JmsTgTreeStudioV2Guard = { disable: disableTreeForStudio };
})(window);
