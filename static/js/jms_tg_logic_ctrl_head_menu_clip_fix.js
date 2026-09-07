(function (global) {
    'use strict';

    var LOGIC_HEAD = '.jms-loop-card__head, .jms-transaction-card__head, .jms-random-card__head, .jms-simple-card__head';
    var LOGIC_CARD = '.jms-loop-card, .jms-transaction-card, .jms-random-card, .jms-simple-card';
    var COLLAPSED_CLS = [
        'jms-loop-card--collapsed',
        'jms-transaction-card--collapsed',
        'jms-random-card--collapsed',
        'jms-simple-card--collapsed'
    ];

    function isLogicHeadActions(actions) {
        return !!(actions && actions.closest && actions.closest(LOGIC_HEAD));
    }

    function isLogicCardCollapsed(actions) {
        var card = actions && actions.closest ? actions.closest(LOGIC_CARD) : null;
        if (!card) return false;
        return COLLAPSED_CLS.some(function (cls) { return card.classList.contains(cls); });
    }

    function extraClipBottom(actions) {
        var margin = 8;
        var clip = global.innerHeight - margin;
        [
            '.jms-tree-node__body',
            '.jms-loop-card__body', '.jms-transaction-card__body', '.jms-random-card__body', '.jms-simple-card__body',
            '.jms-loop-card', '.jms-transaction-card', '.jms-random-card', '.jms-simple-card',
            '.jms-if-mount-context', '.jms-tg-tree-steps', '.jms-tg-block--tree', '.jms-tg-tree-main'
        ].forEach(function (sel) {
            var el = actions.closest(sel);
            if (!el) return;
            var bottom = el.getBoundingClientRect().bottom - margin;
            if (bottom > 0) clip = Math.min(clip, bottom);
        });
        return clip;
    }

    function remeasureLogicHeadMenu(actions) {
        if (!global.document.body.classList.contains('lth-tg-view-tree')) return;
        if (!isLogicHeadActions(actions)) return;
        var menu = actions.querySelector('.lth-step-menu');
        if (!menu) return;
        menu.classList.remove('lth-step-menu--dropup');
        if (isLogicCardCollapsed(actions)) {
            menu.classList.add('lth-step-menu--dropup');
            actions.classList.remove('is-measuring');
            return;
        }
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
            remeasureLogicHeadMenu(actions);
            global.requestAnimationFrame(function () {
                remeasureLogicHeadMenu(actions);
            });
        });
    }

    function bind() {
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsLogicHeadMenuClipBound === '1') return;
        root.dataset.jmsLogicHeadMenuClipBound = '1';

        root.addEventListener('click', function (ev) {
            var btn = ev.target.closest('.lth-step-menu-btn');
            if (!btn) return;
            var actions = btn.closest('.lth-step-actions');
            if (!isLogicHeadActions(actions)) return;
            scheduleRemeasure(actions);
        });

        root.addEventListener('mouseover', function (ev) {
            var actions = ev.target.closest('.lth-step-actions');
            if (!isLogicHeadActions(actions)) return;
            var from = ev.relatedTarget;
            if (from && actions.contains(from)) return;
            scheduleRemeasure(actions);
        });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgLogicCtrlHeadMenuClipFix = { remeasureLogicHeadMenu: remeasureLogicHeadMenu };
}(typeof window !== 'undefined' ? window : this));
