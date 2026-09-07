/**
 * JMeter 压测 · 下拉菜单滚动时保持展开（隔离模块）
 * 场景1：滚轮导致页面/步骤区滚动时不收回已打开的下拉菜单。
 */
(function (global) {
    'use strict';

    var OPEN_MORE_SEL = '.jms-v2-native-fallback.is-open,' +
        ' .jms-tg-config-more.is-open, .jms-tg-logic-ctrl-more.is-open, .jms-tg-sampler-more.is-open,' +
        ' .jms-tg-post-proc-more.is-open, .jms-tg-assert-more.is-open, .jms-tg-listener-more.is-open,' +
        ' .jms-http-ctx-proc-more.is-open, .jms-http-ctx-preproc-more.is-open, .jms-http-ctx-timer-more.is-open,' +
        ' .jms-http-ctx-config-more.is-open, .jms-http-ctx-assert-more.is-open, .jms-http-ctx-listener-more.is-open, .jms-http-ctx-logic-more.is-open,' +
        ' .jms-if-mount-ctx-sampler-more.is-open, .jms-if-mount-ctx-logic-more.is-open, .jms-if-mount-ctx-assert-more.is-open,' +
        ' .jms-if-mount-ctx-timer-more.is-open, .jms-if-mount-ctx-preproc-more.is-open, .jms-if-mount-ctx-proc-more.is-open,' +
        ' .jms-if-mount-ctx-config-more.is-open, .jms-if-mount-ctx-listener-more.is-open';

    function isJmeterTab() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function hasOpenDropdownMenu() {
        if (global.document.getElementById('jms-v2-catalog-popup')) return true;
        if (global.document.body.classList.contains('jms-v2-catalog-popup-open')) return true;
        if (global.document.querySelector(OPEN_MORE_SEL)) return true;
        return false;
    }

    function shouldKeepOpenOnScroll(ev) {
        if (!isJmeterTab()) return false;
        if (hasOpenDropdownMenu()) return true;
        if (!ev || !ev.target || !ev.target.closest) return false;
        if (ev.target.closest('#jms-v2-catalog-popup')) return true;
        if (ev.target.closest('[role="menu"]:not([aria-hidden="true"])')) return true;
        return false;
    }

    global.JmsJmeterDropdownScrollGuard = {
        hasOpenDropdownMenu: hasOpenDropdownMenu,
        shouldKeepOpenOnScroll: shouldKeepOpenOnScroll
    };
}(typeof window !== 'undefined' ? window : this));