/**
 * 用例工作台暂存浮层挂载（独立模块，不修改 tc_lanhu_drawer.js 内 stub）
 */
(function (global) {
    'use strict';
    var STASH_BODY_IDS = [
        'tc-stash-float-root',
        'tc-stash-rail-float-wrap',
        'tc-stash-save-fab-wrap',
        'tc-stash-rail-col',
        'tc-stash-save-modal',
        'tc-stash-preview-modal',
        'tc-stash-restore-modal',
        'tc-stash-rename-modal'
    ];
    function mountToBody(id) {
        var el = document.getElementById(id);
        if (el && el.parentElement !== document.body) {
            document.body.appendChild(el);
        }
    }
    function ensureTcStashOverlaysMountedImpl() {
        STASH_BODY_IDS.forEach(mountToBody);
    }
    function syncTcStashFloatChromeImpl() {
        if (typeof global.isTcHubExcelTabActive === 'function' && global.isTcHubExcelTabActive()) {
            return;
        }
        ensureTcStashOverlaysMountedImpl();
    }
    global.ensureTcStashOverlaysMounted = ensureTcStashOverlaysMountedImpl;
    global.syncTcStashFloatChrome = syncTcStashFloatChromeImpl;
})(typeof window !== 'undefined' ? window : this);
