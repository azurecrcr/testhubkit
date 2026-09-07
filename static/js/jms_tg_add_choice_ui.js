/**
 * 添加线程组 · 类型选择弹窗（隔离模块 · #modal-tg-add-choice）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-add-choice';
    var pendingPlanId = null;

    function getModal() {
        return global.document.getElementById(MODAL_ID);
    }

    function clearPending() {
        pendingPlanId = null;
    }

    function closeModal() {
        var modal = getModal();
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        clearPending();
    }

    function showErr(msg) {
        var studio = global.JmsScenarioStudio;
        if (studio && typeof studio.showMsg === 'function') {
            studio.showMsg(msg, false);
        }
    }

    function applyKind(kind) {
        if (!pendingPlanId) return;
        var planId = pendingPlanId;
        closeModal();
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.addThreadGroupByKind !== 'function') {
            showErr('线程组添加功能未就绪，请刷新页面后重试。');
            return;
        }
        try {
            vb.addThreadGroupByKind(planId, kind);
        } catch (e) {
            showErr(e.message || String(e));
        }
    }

    function bindEvents() {
        if (global.document.body.dataset.jmsTgAddChoiceBound === '1') return;
        global.document.body.dataset.jmsTgAddChoiceBound = '1';

        global.document.addEventListener('click', function (ev) {
            var setupBtn = ev.target.closest('#btn-tg-add-setup');
            var teardownBtn = ev.target.closest('#btn-tg-add-teardown');
            var threadBtn = ev.target.closest('#btn-tg-add-thread');
            if (setupBtn) {
                ev.preventDefault();
                applyKind('setup');
                return;
            }
            if (teardownBtn) {
                ev.preventDefault();
                applyKind('teardown');
                return;
            }
            if (threadBtn) {
                ev.preventDefault();
                applyKind('thread');
            }
        });

        var modal = getModal();
        if (modal) {
            modal.addEventListener('click', function (ev) {
                if (ev.target === modal) closeModal();
            });
        }

        global.document.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Escape') return;
            var m = getModal();
            if (m && m.classList.contains('jms-modal-open')) closeModal();
        });
    }

    function openModal(target) {
        var planId = target && target.planId;
        if (!planId) return;
        pendingPlanId = planId;
        var modal = getModal();
        if (!modal) {
            clearPending();
            showErr('线程组类型选择弹窗未加载，请刷新页面后重试。');
            return;
        }
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bindEvents);
    } else {
        bindEvents();
    }

    global.JmsTgAddChoiceUi = {
        openModal: openModal,
        closeModal: closeModal
    };
}(typeof window !== 'undefined' ? window : this));
