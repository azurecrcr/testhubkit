/**
 * JMeter 压测 · 添加 If / BeanShell / Debug 步骤（隔离模块）
 */
(function (global) {
    'use strict';

    var MENU_ITEMS = [
        { type: 'if_controller', cls: 'jms-add-chip--if', label: '+ If 控制器', btn: 'jms-btn-add-if' },
        { type: 'beanshell_post', cls: 'jms-add-chip--beanshell', label: '+ BeanShell 后置', btn: 'jms-btn-add-beanshell' },
        { type: 'debug_sampler', cls: 'jms-add-chip--debug', label: '+ Debug Sampler', btn: 'jms-btn-add-debug' }
    ];

    function renderMenuButtons(planId, tgId) {
        return MENU_ITEMS.map(function (item) {
            return '<button type="button" class="jms-add-chip jms-add-chip--aux ' + item.cls + ' ' + item.btn + '" data-aux-type="' + item.type + '" data-plan-id="' + planId + '" data-tg-id="' + tgId + '">' + item.label + '</button>';
        }).join('');
    }

function closeAddMoreMenu(wrap) {
        if (wrap) wrap.classList.remove('is-open');
    }

    function onContainerClick(ev) {
        var t = ev.target;
        var btn = t.closest('.jms-btn-add-if, .jms-btn-add-beanshell, .jms-btn-add-debug');
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        var planId = btn.getAttribute('data-plan-id');
        var tgId = btn.getAttribute('data-tg-id');
        var auxType = btn.getAttribute('data-aux-type');
        if (!planId || !tgId || !auxType) return;
        closeAddMoreMenu(btn.closest('.lth-tg-add-more'));
        if (global.JmsVisualBuilder && typeof global.JmsVisualBuilder.appendAuxStep === 'function') {
            global.JmsVisualBuilder.appendAuxStep(planId, tgId, auxType);
        }
    }

    function init() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var container = global.document.getElementById('jms-plans-container');
        if (!container || container.__jmsAuxStepAddBound) return;
        container.__jmsAuxStepAddBound = true;
        container.addEventListener('click', onContainerClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsAuxStepAdd = {
        renderMenuButtons: renderMenuButtons
    };
}(typeof window !== 'undefined' ? window : this));
