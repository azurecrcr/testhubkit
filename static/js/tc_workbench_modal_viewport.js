/**
 * 用例工作台弹窗视口辅助（隔离模块）
 * 动态测量顶栏高度，供 tc_workbench_modal_viewport.css 使用
 */
(function (global) {
    'use strict';

    var MODAL_IDS = [
        'tc-export-requirement-modal',
        'tc-export-xmind-modal',
        'tc-share-requirement-modal'
    ];

    function measureNavOffset() {
        var gnav = document.querySelector('.hf-gnav');
        var h = gnav ? Math.ceil(gnav.getBoundingClientRect().height) : 0;
        if (!h || h < 40) h = 56;
        document.documentElement.style.setProperty('--hf-gnav-height', h + 'px');
        document.documentElement.style.setProperty('--tc-wb-modal-nav-offset', h + 'px');
        return h;
    }

    function ensureModalInBody(id) {
        var el = document.getElementById(id);
        if (el && el.parentElement !== document.body) {
            document.body.appendChild(el);
        }
    }

    function prepareModals() {
        MODAL_IDS.forEach(ensureModalInBody);
    }

    function bindOpenSync() {
        MODAL_IDS.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el || el.__tcWbModalViewportBound) return;
            el.__tcWbModalViewportBound = true;
            var obs = new MutationObserver(function () {
                var open = !el.classList.contains('hidden') &&
                    (el.classList.contains('flex') || el.style.display === 'flex');
                if (open) {
                    measureNavOffset();
                    ensureModalInBody(id);
                }
            });
            obs.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
        });
    }

    function init() {
        measureNavOffset();
        prepareModals();
        bindOpenSync();
        global.addEventListener('resize', measureNavOffset, { passive: true });
        global.addEventListener('orientationchange', function () {
            setTimeout(measureNavOffset, 120);
        }, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.TcWorkbenchModalViewport = {
        measureNavOffset: measureNavOffset,
        prepareModals: prepareModals
    };
}(typeof window !== 'undefined' ? window : this));
