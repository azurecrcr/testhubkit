/**
 * 树形视图 · If 挂载区工具栏下拉 dropup 重算（隔离模块）
 */
(function (global) {
    'use strict';

    var WRAP_SELECTOR =
        '.jms-if-mount-ctx-sampler-more,' +
        ' .jms-if-mount-ctx-logic-more,' +
        ' .jms-if-mount-ctx-assert-more,' +
        ' .jms-if-mount-ctx-timer-more,' +
        ' .jms-if-mount-ctx-preproc-more,' +
        ' .jms-if-mount-ctx-proc-more,' +
        ' .jms-if-mount-ctx-config-more,' +
        ' .jms-if-mount-ctx-listener-more';

    function extraClipBottom(wrap) {
        var margin = 8;
        var clip = global.innerHeight - margin;
        [
            '.jms-if-card__body', '.jms-random-card__body', '.jms-simple-card__body',
            '.jms-transaction-card__body', '.jms-loop-card__body',
            '.jms-if-card', '.jms-random-card', '.jms-simple-card',
            '.jms-transaction-card', '.jms-loop-card',
            '.jms-if-mount-context', '.jms-tg-tree-steps', '.jms-tg-block--tree', '.jms-tg-tree-main'
        ].forEach(function (sel) {
            var el = wrap.closest(sel);
            if (!el) return;
            var bottom = el.getBoundingClientRect().bottom - margin;
            if (bottom > 0) clip = Math.min(clip, bottom);
        });
        return clip;
    }

    function remeasureMountMenu(wrap) {
        if (!global.document.body.classList.contains('lth-tg-view-tree')) return;
        if (!wrap || !wrap.closest('.jms-if-mount-context')) return;
        var menu = wrap.querySelector('.jms-if-mount-ctx-menu');
        if (!menu) return;
        menu.classList.remove('jms-if-mount-ctx-menu--dropup');
        wrap.classList.add('is-measuring');
        var menuRect = menu.getBoundingClientRect();
        var clipBottom = extraClipBottom(wrap);
        if (menuRect.height && menuRect.bottom > clipBottom) {
            menu.classList.add('jms-if-mount-ctx-menu--dropup');
        }
        wrap.classList.remove('is-measuring');
    }

    function scheduleRemeasure(wrap) {
        if (!wrap) return;
        global.requestAnimationFrame(function () {
            remeasureMountMenu(wrap);
        });
    }

    function bind() {
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsIfMountMenuClipBound === '1') return;
        root.dataset.jmsIfMountMenuClipBound = '1';

        root.addEventListener('click', function (ev) {
            var btn = ev.target.closest(
                '.jms-if-mount-ctx-btn-sampler, .jms-if-mount-ctx-btn-logic, .jms-if-mount-ctx-btn-assert,' +
                ' .jms-if-mount-ctx-btn-timer, .jms-if-mount-ctx-btn-preproc, .jms-if-mount-ctx-btn-processors, .jms-if-mount-ctx-btn-config,' +
                ' .jms-if-mount-ctx-btn-listeners'
            );
            if (!btn) return;
            var wrap = btn.closest(WRAP_SELECTOR);
            if (!wrap) return;
            global.requestAnimationFrame(function () {
                if (wrap.classList.contains('is-open')) scheduleRemeasure(wrap);
            });
        });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsIfMountMenuClipFix = { remeasureMountMenu: remeasureMountMenu };
}(typeof window !== 'undefined' ? window : this));
