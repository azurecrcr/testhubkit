/**
 * 树形视图 · Debug / BeanShell 步骤菜单 dropup 重算（隔离）
 */
(function (global) {
    'use strict';

    function extraClipBottom(actions) {
        var margin = 8;
        var clip = global.innerHeight - margin;
        ['.jms-if-card__body', '.jms-if-card', '.jms-tg-tree-steps', '.jms-tg-block--tree', '.jms-tg-tree-main'].forEach(function (sel) {
            var el = actions.closest(sel);
            if (!el) return;
            var bottom = el.getBoundingClientRect().bottom - margin;
            if (bottom > 0) clip = Math.min(clip, bottom);
        });
        return clip;
    }

    function remeasureAuxMenu(actions) {
        if (!document.body.classList.contains('lth-tg-view-tree')) return;
        if (!actions || !actions.closest('.jms-aux-card')) return;
        var menu = actions.querySelector('.lth-step-menu');
        if (!menu) return;
        menu.classList.remove('lth-step-menu--dropup');
        actions.classList.add('is-measuring');
        var menuRect = menu.getBoundingClientRect();
        var clipBottom = extraClipBottom(actions);
        if (menuRect.height && menuRect.bottom > clipBottom) {
            menu.classList.add('lth-step-menu--dropup');
        }
        actions.classList.remove('is-measuring');
    }

    function scheduleRemeasure(actions) {
        if (!actions) return;
        global.requestAnimationFrame(function () {
            remeasureAuxMenu(actions);
        });
    }

    function bind() {
        var root = document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsTgAuxMenuClipBound === '1') return;
        root.dataset.jmsTgAuxMenuClipBound = '1';

        root.addEventListener('click', function (ev) {
            var btn = ev.target.closest('.lth-step-menu-btn');
            if (!btn) return;
            var actions = btn.closest('.lth-step-actions');
            if (!actions || !actions.closest('.jms-aux-card')) return;
            scheduleRemeasure(actions);
        });

        root.addEventListener('mouseover', function (ev) {
            var actions = ev.target.closest('.lth-step-actions');
            if (!actions || !actions.closest('.jms-aux-card')) return;
            var from = ev.relatedTarget;
            if (from && actions.contains(from)) return;
            scheduleRemeasure(actions);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgAuxMenuClipFix = { remeasureAuxMenu: remeasureAuxMenu };
}(typeof window !== 'undefined' ? window : this));
