/**
 * 树形视图 · 阻止点击步骤卡片自动打开编辑抽屉（隔离模块）
 * 网格视图仍走 lth_studio_shell.js 原逻辑
 */
(function (global) {
    'use strict';

    function isTreeDetailView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function shouldAllowClick(target) {
        if (!target || !target.closest) return false;
        return !!target.closest(
            'button, a, input, select, textarea, label, .jms-tree-drag-handle,' +
            ' .jms-if-card__head, .jms-random-card__head, .jms-simple-card__head, .jms-transaction-card__head, .jms-loop-card__head,' +
            ' .jms-catalog-card__head, .jms-catalog-card__body, .jms-btn-edit-catalog,' +
            ' .jms-tg-tree-inline-actions, .jms-http-context, .jms-http-card, .jms-http-card__head, .jms-http-card__main, .jms-card-head-actions, .jms-card-head-badges,' +
            ' .jms-tree-node--http .jms-tree-node__body,' +
            ' .jms-tree-node--catalog .jms-tree-node__body,' +
            ' .jms-http-ctx-listener-more, .jms-http-context__listener-list,' +
            ' .jms-tg-listeners, .jms-tg-listener-more, .jms-tg-listener-menu, .jms-tg-logic-ctrl-more, .jms-tg-logic-ctrl-menu, .jms-tg-post-proc-more, .jms-tg-post-proc-menu, .jms-tg-sampler-more, .jms-tg-sampler-menu, .jms-tg-config-more, .jms-tg-config-menu, .jms-http-listeners, .jms-tg-config-btn, .jms-tg-tree-tools,' +
            ' .jms-if-mount-ctx-btn, .jms-if-mount-ctx-item, .jms-if-mount-ctx-menu,' +
            ' .jms-if-mount-ctx-sampler-more, .jms-if-mount-ctx-logic-more, .jms-if-mount-ctx-assert-more,' +
            ' .jms-if-mount-ctx-timer-more, .jms-if-mount-ctx-preproc-more, .jms-if-mount-ctx-proc-more,' +
            ' .jms-if-mount-ctx-config-more, .jms-if-mount-ctx-listener-more,' +
            ' .jms-catalog-mount-context, .jms-catalog-mount-ctx-more, .jms-catalog-mount-ctx-btn,' +
            ' .jms-tg-assert-more, .jms-tg-assert-menu, .jms-tg-assert-trigger,' +
            ' .jms-http-ctx-assert-more, .jms-http-ctx-assert-menu,' +
            ' .jms-http-context__assert-list, .jms-http-context__assert-row,' +
            ' .jms-tree-node--tg-assert, .jms-tree-node--http-mount-assert,' +
            ' .lth-step-actions, .lth-step-menu, .lth-step-menu-btn,' +
            ' .jms-tree-node--http-mount, .jms-aux-card--http-mount-preproc, .jms-aux-card--http-mount-timer, .jms-aux-card--http-mount-assert,' +
            ' .jms-aux-card--http-mount-catalog, .jms-tree-node--http-mount-catalog'
        );
    }

    function onRootClick(ev) {
        if (!isTreeDetailView()) return;
        var t = ev.target;

        if (t.closest('.jms-catalog-card')) {
            return;
        }

        if (shouldAllowClick(t)) return;

        var tgAssertCard = t.closest('.jms-aux-card--tg-assert, .jms-aux-card--http-mount-assert');
        if (tgAssertCard) {
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') {
                ev.stopImmediatePropagation();
            }
            if (global.JmsAssertCardEditClick &&
                typeof global.JmsAssertCardEditClick.openForCard === 'function') {
                global.JmsAssertCardEditClick.openForCard(tgAssertCard);
            }
            return;
        }
        var debugAux = t.closest('.jms-aux-card[data-step-kind="debug_sampler"]');
        if (debugAux && !t.closest('button, a, input, select, textarea, .lth-step-actions, .jms-tg-tree-inline-actions')) {
            debugAux.classList.toggle('jms-aux-card--collapsed');
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') {
                ev.stopImmediatePropagation();
            }
            return;
        }
        if (t.closest('.jms-http-card, .jms-aux-card, .jms-if-card__body, .jms-if-mount-context')) {
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') {
                ev.stopImmediatePropagation();
            }
        }
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsTgTreeCardGuardBound === '1') return;
        root.dataset.jmsTgTreeCardGuardBound = '1';
        root.addEventListener('click', onRootClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgTreeCardClickGuard = { bind: bind };
}(typeof window !== 'undefined' ? window : this));
