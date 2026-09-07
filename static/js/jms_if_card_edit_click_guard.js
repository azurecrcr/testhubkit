/**
 * If 控制器 · 阻止点击下方空白区域误开编辑弹窗（隔离模块，仅树形视图）
 */
(function (global) {
    'use strict';

    function isTreeDetailView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isInteractiveTarget(t) {
        if (!t || !t.closest) return false;
        return !!t.closest(
            'button, a, input, select, textarea, label, [role="menuitem"],' +
            ' .lth-step-actions, .lth-step-menu, .lth-step-menu-btn,' +
            ' .jms-btn-edit-if, .jms-btn-del-if,' +
            ' .jms-tree-drag-handle, .jms-if-mount-drag-handle,' +
            ' .jms-if-mount-ctx-btn, .jms-if-mount-ctx-item, .jms-if-mount-ctx-menu,' +
            ' .jms-if-mount-ctx-sampler-more, .jms-if-mount-ctx-logic-more, .jms-if-mount-ctx-assert-more,' +
            ' .jms-if-mount-ctx-timer-more, .jms-if-mount-ctx-preproc-more, .jms-if-mount-ctx-proc-more,' +
            ' .jms-if-mount-ctx-config-more, .jms-if-mount-ctx-listener-more,' +
            ' .jms-if-mount-row-edit, .jms-if-mount-row-del,' +
            ' .jms-config-card-toolbar, .jms-logic-enable-seg,' +
            ' .jms-http-card, .jms-tree-node--http .jms-tree-node__body,' +
            ' .jms-http-context, .jms-http-ctx-btn, .jms-http-ctx-config-more'
        );
    }

    /** 仅拦截 If 卡片下方非交互空白，不影响 ⋮ 编辑与其它挂载操作 */
    function shouldBlockAutoEdit(t) {
        if (!t || !t.closest) return false;
        if (isInteractiveTarget(t)) return false;
        if (t.closest('.jms-if-mount-context')) return true;
        if (t.closest('.jms-if-card__body')) return true;
        if (t.closest('.jms-if-card__empty') || t.closest('.jms-empty-hint.jms-if-card__empty')) return true;
        return false;
    }

    function onRootClick(ev) {
        if (!isTreeDetailView()) return;
        if (!shouldBlockAutoEdit(ev.target)) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsIfCardEditGuardBound === '1') return;
        root.dataset.jmsIfCardEditGuardBound = '1';
        root.addEventListener('click', onRootClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsIfCardEditClickGuard = { bind: bind };
}(typeof window !== 'undefined' ? window : this));
