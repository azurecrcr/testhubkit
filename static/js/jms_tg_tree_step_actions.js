/**
 * 树形视图 · 步骤 ⋯ 菜单操作（隔离模块，仅 lth-tg-view-tree）
 */
(function (global) {
    'use strict';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function renderMenuActions(opts) {
        opts = opts || {};
        var menuLabel = opts.menuLabel || '步骤操作';
        var editClass = opts.editClass || 'jms-btn-edit-step';
        var delClass = opts.delClass || 'jms-btn-del-step';
        var editLabel = opts.editLabel || '编辑';
        var delLabel = opts.delLabel || '删除';
        var extraMenuItems = opts.extraMenuItems || '';
        var editAttrs = opts.editAttrs || '';
        var delAttrs = opts.delAttrs || '';
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="' + esc(menuLabel) + '" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost ' + esc(editClass) + '" role="menuitem"' + editAttrs + '>' + esc(editLabel) + '</button>' +
            '<button type="button" class="jms-btn-ghost ' + esc(delClass) + '" role="menuitem"' + delAttrs + '>' + esc(delLabel) + '</button>' +
            extraMenuItems +
            '</div></div>';
    }

    function renderHttpActions() {
        return renderMenuActions({
            extraMenuItems: '<button type="button" class="jms-btn-edit-assert jms-http-assert-trigger-sr" hidden aria-hidden="true" tabindex="-1">断言</button>'
        });
    }

    function renderAuxActions(editClass, delClass, editLabel, delLabel) {
        return renderMenuActions({
            editClass: editClass,
            delClass: delClass,
            editLabel: editLabel,
            delLabel: delLabel
        });
    }

    function renderProcessorActions(planId, tgId, index) {
        var attrs = ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-proc-index="' + index + '"';
        return renderMenuActions({
            menuLabel: '处理器操作',
            editClass: 'jms-btn-edit-tg-processor',
            delClass: 'jms-btn-del-tg-processor',
            editAttrs: attrs,
            delAttrs: attrs
        });
    }

    global.JmsTgTreeStepActions = {
        renderHttpActions: renderHttpActions,
        renderAuxActions: renderAuxActions,
        renderProcessorActions: renderProcessorActions
    };
}(typeof window !== 'undefined' ? window : this));
