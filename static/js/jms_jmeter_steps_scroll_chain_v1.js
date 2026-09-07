/**
 * JMeter 压测 · 步骤区滚轮链式传递至页面（隔离模块）
 * 场景2：步骤区滚到顶/底后继续滚轮时，将剩余滚动传递给 window。
 */
(function (global) {
    'use strict';

    var STEPS_SEL = '.jms-tg-tree-steps';
    var MENU_SKIP_SEL = '#jms-v2-catalog-popup, .jms-if-mount-ctx-menu, .lth-step-menu, .jms-step-modal, .jms-modal-open,' +
        ' .jms-tg-sampler-menu, .jms-tg-post-proc-menu, .jms-tg-logic-ctrl-menu, .jms-tg-assert-menu, .jms-tg-listener-menu,' +
        ' .jms-http-ctx-proc-menu, .jms-http-ctx-preproc-menu, .jms-http-ctx-timer-menu, .jms-http-ctx-config-menu,' +
        ' .jms-http-ctx-assert-menu, .jms-http-ctx-listener-menu, .jms-http-ctx-logic-menu';

    function isJmeterTab() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isScrollableEl(el) {
        if (!el) return false;
        var style = global.getComputedStyle(el);
        var oy = style.overflowY;
        if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
        return el.scrollHeight > el.clientHeight + 1;
    }

    function canScrollEl(el, deltaY) {
        if (!isScrollableEl(el)) return false;
        if (deltaY < 0) return el.scrollTop > 0;
        if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
        return false;
    }

    function canScrollWindow(deltaY) {
        var doc = global.document.documentElement;
        if (deltaY > 0) return global.window.scrollY + global.innerHeight < doc.scrollHeight - 1;
        if (deltaY < 0) return global.window.scrollY > 0;
        return false;
    }

    function onWheel(ev) {
        if (!isJmeterTab()) return;
        if (!ev.target || !ev.target.closest) return;
        if (ev.target.closest(MENU_SKIP_SEL)) return;
        if (global.JmsJmeterDropdownScrollGuard &&
            typeof global.JmsJmeterDropdownScrollGuard.hasOpenDropdownMenu === 'function' &&
            global.JmsJmeterDropdownScrollGuard.hasOpenDropdownMenu()) {
            return;
        }

        var stepsEl = ev.target.closest(STEPS_SEL);
        if (!stepsEl) return;

        var deltaY = ev.deltaY;
        if (!deltaY) return;

        if (canScrollEl(stepsEl, deltaY)) return;

        if (!canScrollWindow(deltaY)) return;

        ev.preventDefault();
        global.window.scrollBy({ top: deltaY, left: 0, behavior: 'auto' });
    }

    function init() {
        if (global.__jmsJmeterStepsScrollChainBound) return;
        global.__jmsJmeterStepsScrollChainBound = true;
        global.document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}(typeof window !== 'undefined' ? window : this));