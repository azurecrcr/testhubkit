/**
 * BeanShell PostProcessor 步骤卡片 · 删除确认桥接（隔离模块，capture 优先于通用确认）
 */
(function (global) {
    'use strict';

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function closeStepMenu(delBtn) {
        var actions = delBtn && delBtn.closest('.lth-step-actions');
        if (actions) actions.classList.remove('is-open', 'is-hover', 'is-measuring');
    }

    function stepLabel(card) {
        var nameEl = card.querySelector('.jms-aux-name');
        return (nameEl && nameEl.textContent) ? nameEl.textContent.trim() : '未命名';
    }

    function performDelete(card) {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.deleteAuxStepCard === 'function') {
            vb.deleteAuxStepCard(card);
            return true;
        }
        return false;
    }

    function onRootClick(ev) {
        if (!isTreeView()) return;
        var delBtn = ev.target.closest('.jms-btn-del-aux-step');
        if (!delBtn) return;
        var card = delBtn.closest('.jms-aux-card[data-step-kind="beanshell_post"]');
        if (!card) return;

        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }
        closeStepMenu(delBtn);

        var label = stepLabel(card);
        var ConfirmUi = global.JmsTgBeanshellPpDeleteConfirmUi;
        if (ConfirmUi && typeof ConfirmUi.confirm === 'function') {
            ConfirmUi.confirm({ name: label }).then(function (ok) {
                if (ok) performDelete(card);
            });
            return;
        }
        if (global.confirm('确定删除「' + label + '」吗？')) performDelete(card);
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsBsppDelBridgeBound === '1') return;
        root.dataset.jmsBsppDelBridgeBound = '1';
        root.addEventListener('click', onRootClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
}(typeof window !== 'undefined' ? window : this));
