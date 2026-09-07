/**
 * 树形视图 · If 控制器内步骤菜单 dropup 重算（隔离，不修改 lth_studio_shell.js）
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

    function remeasureIfMenu(actions) {
        if (!document.body.classList.contains('lth-tg-view-tree')) return;
        if (!actions || !actions.closest('.jms-if-card')) return;
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
            remeasureIfMenu(actions);
        });
    }

    function bind() {
        var root = document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsTgIfMenuClipBound === '1') return;
        root.dataset.jmsTgIfMenuClipBound = '1';

        root.addEventListener('click', function (ev) {
            var btn = ev.target.closest('.lth-step-menu-btn');
            if (!btn) return;
            scheduleRemeasure(btn.closest('.lth-step-actions'));
        });

        root.addEventListener('mouseover', function (ev) {
            var actions = ev.target.closest('.lth-step-actions');
            if (!actions || !actions.closest('.jms-if-card')) return;
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

    global.JmsTgIfMenuClipFix = { remeasureIfMenu: remeasureIfMenu };
}(typeof window !== 'undefined' ? window : this));
