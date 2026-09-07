/**
 * 步骤区弹窗 · 内容自适应高度（隔离模块，不修改既有 open/close 逻辑）
 * 字段少时收缩弹窗，避免无意义留白与内滚。
 */
(function (global) {
    'use strict';

    var ROOT_SEL = 'body.lth-studio-v2.lth-hub-jmeter-tab';
    var SKIP_IDS = { 'modal-tg-load': 1, 'modal-tg-http-mgr': 1, 'modal-output': 1, 'modal-jmx-import': 1, 'modal-jms-confirm': 1, 'modal-scene-monitor': 1 };
    var PANEL_SEL = '.jms-step-modal, .jms-modal__panel, [class*="-drawer"], .jms-modal-card';
    var FIT_CLASS = 'jms-sg-fit-compact';
    var bound = false;
    var rafPending = 0;

    function inScope(modal) {
        if (!modal || !modal.id) return false;
        if (SKIP_IDS[modal.id]) return false;
        if (modal.id === 'jms-catalog-element-editor-modal') return true;
        if (modal.id.indexOf('modal-tg-') === 0 || modal.id.indexOf('modal-http-') === 0) return true;
        return /^(modal-step-|modal-if-|modal-bean|modal-debug|modal-import|modal-tg-add|modal-http-add)/.test(modal.id);
    }

    function getPanel(modal) {
        if (!modal) return null;
        if (modal.id === 'jms-catalog-element-editor-modal') {
            return modal.querySelector('.jms-modal__panel');
        }
        return modal.querySelector(PANEL_SEL);
    }

    function resetPanel(panel) {
        if (!panel) return;
        panel.classList.remove(FIT_CLASS);
        panel.style.removeProperty('max-height');
        panel.style.removeProperty('height');
        if (panel.parentElement && panel.parentElement === global.document.body) {
            /* appended modals */
        }
        var host = panel.closest('[id^="modal-"], #jms-catalog-element-editor-modal');
        if (host) host.style.removeProperty('--jms-sg-fit-max');
    }

    function fitPanel(modal) {
        var panel = getPanel(modal);
        if (!panel) return;
        resetPanel(panel);
        if (!modal.classList.contains('jms-modal-open')) return;

        var avail = Math.floor(global.innerHeight * 0.9);
        var natural = panel.scrollHeight;
        if (natural <= 0) return;

        if (natural + 24 < avail) {
            panel.classList.add(FIT_CLASS);
            panel.style.maxHeight = natural + 'px';
            modal.style.setProperty('--jms-sg-fit-max', natural + 'px');
        } else {
            modal.style.setProperty('--jms-sg-fit-max', avail + 'px');
        }
    }

    function scheduleFit(modal) {
        if (!inScope(modal)) return;
        if (rafPending) global.cancelAnimationFrame(rafPending);
        rafPending = global.requestAnimationFrame(function () {
            rafPending = 0;
            global.requestAnimationFrame(function () {
                fitPanel(modal);
            });
        });
    }

    function onClassMutation(mutations) {
        mutations.forEach(function (m) {
            if (m.type !== 'attributes' || m.attributeName !== 'class') return;
            var el = m.target;
            if (!el || !el.id || !inScope(el)) return;
            if (el.classList.contains('jms-modal-open')) scheduleFit(el);
            else resetPanel(getPanel(el));
        });
    }

    function bind() {
        if (bound || !global.document || !global.MutationObserver) return;
        var root = global.document.body;
        if (!root || !root.matches || !root.matches(ROOT_SEL.replace('body', 'body'))) return;
        var obs = new MutationObserver(onClassMutation);
        obs.observe(root, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        global.addEventListener('resize', function () {
            global.document.querySelectorAll('.jms-modal-open').forEach(function (el) {
                if (inScope(el)) scheduleFit(el);
            });
        });
        bound = true;
    }

    function init() {
        if (!global.document.body) return;
        bind();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsStepModalAutoFit = { fitPanel: fitPanel, scheduleFit: scheduleFit };
})(typeof window !== 'undefined' ? window : this);
