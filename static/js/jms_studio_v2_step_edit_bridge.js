/**
 * Studio v2 · 统一步骤「编辑」路由（逻辑控制器 + TG 后置处理器等新组件）
 * 修复树形视图下新组件编辑按钮无法打开弹窗（桥接未接入 / visual-root 绑定失败）
 */
(function (global) {
    'use strict';

    var EDIT_ROUTES = {
        'jms-btn-edit-transaction': { mod: 'JmsTgTransactionControllerUi', cards: '.jms-transaction-card', method: 'openEditor' },
        'jms-btn-edit-loop': { mod: 'JmsTgLoopControllerUi', cards: '.jms-loop-card,.jms-aux-card', method: 'openEditor' },
        'jms-btn-edit-random': { mod: 'JmsTgRandomControllerUi', cards: '.jms-random-card', method: 'openEditor' },
        'jms-btn-edit-simple': { mod: 'JmsTgSimpleControllerUi', cards: '.jms-simple-card', method: 'openEditor' },
        'jms-btn-edit-beanshell': { mod: 'JmsTgBeanshellPostUi', cards: '.jms-aux-card', method: 'openEditor', extra: [false] },
        'jms-btn-edit-debug': { mod: 'JmsTgDebugSamplerUi', cards: '.jms-aux-card', method: 'openEditor' },
        'jms-btn-edit-tg-xpath-extract': { mod: 'JmsTgXpathExtractUi', cards: '.jms-aux-card', method: 'openEditor', extra: [false] },
        'jms-btn-edit-tg-regex-extract': { mod: 'JmsTgRegexExtractUi', cards: '.jms-aux-card', method: 'openEditor' },
        'jms-btn-edit-tg-jdbc-post': { mod: 'JmsTgJdbcPostUi', cards: '.jms-aux-card', method: 'openEditor', extra: [false, 0] },
        'jms-btn-edit-tg-json-extract': { mod: 'JmsTgJsonExtractUi', cards: '.jms-aux-card', method: 'openEditor' },
        'jms-btn-edit-tg-jsr223-post': { mod: 'JmsTgJsr223PostUi', cards: '.jms-aux-card', method: 'openEditor', extra: [false] }
    };

    function isJmeterStudio() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function resolveCard(btn, route) {
        var sels = (route.cards || '').split(',');
        for (var i = 0; i < sels.length; i++) {
            var card = btn.closest(sels[i].trim());
            if (card) return card;
        }
        return null;
    }

    function ensureModalOnBody(Ui) {
        if (!Ui) return;
        if (typeof Ui.ensureModal === 'function') {
            var modal = Ui.ensureModal();
            if (global.JmsStudioV2TreeStepEditUnify && typeof global.JmsStudioV2TreeStepEditUnify.ensureOnBody === 'function') {
                global.JmsStudioV2TreeStepEditUnify.ensureOnBody(modal);
            } else if (modal && modal.parentElement !== global.document.body) {
                global.document.body.appendChild(modal);
            }
            return;
        }
        if (Ui.MODAL_ID) {
            var el = global.document.getElementById(Ui.MODAL_ID);
            if (global.JmsStudioV2TreeStepEditUnify && typeof global.JmsStudioV2TreeStepEditUnify.ensureOnBody === 'function') {
                global.JmsStudioV2TreeStepEditUnify.ensureOnBody(el);
            } else if (el && el.parentElement !== global.document.body) {
                global.document.body.appendChild(el);
            }
        }
    }

    function modalIsOpen(modalId) {
        if (!modalId) return false;
        var modal = global.document.getElementById(modalId);
        return !!(modal && modal.classList.contains('jms-modal-open'));
    }

    function invokeOpen(route, planId, tgId, stepId) {
        var Ui = global[route.mod];
        ensureModalOnBody(Ui);
        if (Ui && typeof Ui[route.method] === 'function') {
            var args = [planId, tgId, stepId].concat(route.extra || []);
            Ui[route.method].apply(Ui, args);
            var mid = (Ui.MODAL_ID || route.modalId);
            if (modalIsOpen(mid)) return true;
        }
        if (route.fallback === 'openIfEditor' && global.JmsVisualBuilder &&
            typeof global.JmsVisualBuilder.openIfEditor === 'function') {
            global.JmsVisualBuilder.openIfEditor(planId, tgId, stepId);
            return modalIsOpen('modal-if-edit');
        }
        return false;
    }

    function onDocClick(ev) {
        if (!isJmeterStudio()) return;
        var btn = null;
        var route = null;
        var keys = Object.keys(EDIT_ROUTES);
        for (var i = 0; i < keys.length; i++) {
            var cls = keys[i];
            var hit = ev.target.closest('.' + cls);
            if (hit) {
                btn = hit;
                route = EDIT_ROUTES[cls];
                break;
            }
        }
        if (!btn || !route) return;

        var card = resolveCard(btn, route);
        if (!card) return;

        var planId = card.getAttribute('data-plan-id');
        var tgId = card.getAttribute('data-tg-id');
        var stepId = card.getAttribute('data-step-id');
        if (!tgId || !stepId) return;

        var actions = btn.closest('.lth-step-actions');
        if (actions) actions.classList.remove('is-open', 'is-hover');

        if (global.JmsVisualBuilder && typeof global.JmsVisualBuilder.readModelFromDom === 'function') {
            global.JmsVisualBuilder.readModelFromDom();
        }
        if (!planId) {
            var m0 = global.JmsVisualBuilder && global.JmsVisualBuilder.getModel ? global.JmsVisualBuilder.getModel() : null;
            if (m0 && m0.test_plans && m0.test_plans[0]) planId = m0.test_plans[0].id;
        }
        var opened = invokeOpen(route, planId, tgId, stepId);
        if (!opened) return;

        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }
    }

    function bind() {
        if (!isJmeterStudio()) return;
        if (global.document.body.dataset.jmsStepEditBridgeBound === '1') return;
        global.document.body.dataset.jmsStepEditBridgeBound = '1';
        global.document.addEventListener('click', onDocClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
    global.addEventListener('pageshow', bind);

    global.JmsStudioV2StepEditBridge = { bind: bind, invokeOpen: invokeOpen, EDIT_ROUTES: EDIT_ROUTES };
})(window);
