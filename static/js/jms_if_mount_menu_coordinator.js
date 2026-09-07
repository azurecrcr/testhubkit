/**
 * If 控制器挂载区 · 下拉菜单互斥（隔离模块）
 */
(function (global) {
    'use strict';

    var OPEN_SELECTOR =
        '.jms-if-mount-ctx-sampler-more.is-open,' +
        ' .jms-if-mount-ctx-logic-more.is-open,' +
        ' .jms-if-mount-ctx-assert-more.is-open,' +
        ' .jms-if-mount-ctx-timer-more.is-open,' +
        ' .jms-if-mount-ctx-preproc-more.is-open,' +
        ' .jms-if-mount-ctx-proc-more.is-open,' +
        ' .jms-if-mount-ctx-config-more.is-open,' +
        ' .jms-if-mount-ctx-listener-more.is-open';

    function closeAllExcept(exceptWrap) {
        global.document.querySelectorAll(OPEN_SELECTOR).forEach(function (el) {
            if (el !== exceptWrap) el.classList.remove('is-open');
        });
    }

    function closeAll() {
        closeAllExcept(null);
    }

    function toggleMenuWrap(wrap) {
        if (!wrap) return false;
        var willOpen = !wrap.classList.contains('is-open');
        closeAllExcept(wrap);
        wrap.classList.toggle('is-open', willOpen);
        return willOpen;
    }


    function closeMenusInIfCard(ifCard) {
        if (!ifCard) return;
        ifCard.querySelectorAll(OPEN_SELECTOR).forEach(function (el) {
            el.classList.remove('is-open');
        });
    }

    global.JmsIfMountMenuCoordinator = {
        closeAllExcept: closeAllExcept,
        closeAll: closeAll,
        toggleMenuWrap: toggleMenuWrap,
        closeMenusInIfCard: closeMenusInIfCard
    };
}(typeof window !== 'undefined' ? window : this));
