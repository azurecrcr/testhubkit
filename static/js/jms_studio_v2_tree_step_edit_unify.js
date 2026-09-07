/**
 * Studio v2 · 编辑弹窗兜底：挂 body、Esc/遮罩关闭（JMeter Tab 全部配置弹窗）
 */
(function (global) {
    'use strict';

    var EDIT_MODAL_IDS = [
        'modal-tg-load', 'modal-tg-http-mgr',
        'modal-step-edit', 'modal-step-assert', 'modal-if-edit', 'modal-beanshell-edit', 'modal-debug-edit',
        'modal-http-jdbc-post-proc-edit', 'modal-tg-jdbc-post-edit', 'modal-tg-if-edit',
        'modal-if-mount-timer-edit', 'modal-http-if-edit', 'modal-http-step-user-params-edit',
        'modal-tg-transaction-edit', 'modal-tg-loop-edit', 'modal-tg-xpath-extract-edit',
        'modal-tg-json-extract-edit', 'modal-tg-regex-extract-edit', 'modal-tg-jsr223-post-edit'
    ];

    function isJmeterStudio() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function ensureOnBody(modal) {
        if (modal && modal.parentElement !== global.document.body) {
            global.document.body.appendChild(modal);
        }
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function bindModal(modal) {
        if (!modal || modal.dataset.jmsStudioEditModalBound === '1') return;
        modal.dataset.jmsStudioEditModalBound = '1';
        ensureOnBody(modal);
        modal.addEventListener('click', function (ev) {
            if (!isJmeterStudio()) return;
            if (ev.target === modal) closeModal(modal);
        });
    }

    function bindAll() {
        if (!isJmeterStudio()) return;
        EDIT_MODAL_IDS.forEach(function (id) {
            bindModal(global.document.getElementById(id));
        });
        global.document.querySelectorAll('[id^="modal-tg-"], [id^="modal-http-"]').forEach(function (el) {
            if (el.id) bindModal(el);
        });
    }

    function watchDynamicModals() {
        if (!isJmeterStudio()) return;
        if (global.document.body.dataset.jmsStudioEditModalObs === '1') return;
        global.document.body.dataset.jmsStudioEditModalObs = '1';
        new MutationObserver(function () { bindAll(); }).observe(global.document.body, { childList: true, subtree: true });
    }

    global.document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape' || !isJmeterStudio()) return;
        var closed = false;
        EDIT_MODAL_IDS.forEach(function (id) {
            var modal = global.document.getElementById(id);
            if (modal && modal.classList.contains('jms-modal-open')) {
                closeModal(modal);
                closed = true;
            }
        });
        if (!closed) {
            global.document.querySelectorAll('[id^="modal-tg-"].jms-modal-open, [id^="modal-http-"].jms-modal-open').forEach(function (modal) {
                closeModal(modal);
                closed = true;
            });
        }
        if (closed) ev.preventDefault();
    });

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', function () { bindAll(); watchDynamicModals(); });
    } else {
        bindAll();
        watchDynamicModals();
    }
    global.addEventListener('pageshow', bindAll);

    global.JmsStudioV2TreeStepEditUnify = { bind: bindAll, ensureOnBody: ensureOnBody };
})(window);
