/**
 * If 控制器挂载区 · HTTP 请求添加（弹窗选择后再写入 children）
 */
(function (global) {
    'use strict';

    var pending = null;

    function clearPending() {
        pending = null;
    }

    function closeHttpAddChoiceUi() {
        var studio = global.JmsScenarioStudio;
        if (studio && typeof studio.closeHttpAddChoiceModal === 'function') {
            studio.closeHttpAddChoiceModal();
            return;
        }
        var modal = global.document.getElementById('modal-http-add-choice');
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        ['btn-http-add-blank', 'btn-http-add-curl', 'btn-http-add-step'].forEach(function (id) {
            var el = global.document.getElementById(id);
            if (el) el.classList.remove('is-selected');
        });
    }

    function openImportUi(mode, target) {
        var studio = global.JmsScenarioStudio;
        if (studio && typeof studio.openImportModal === 'function') {
            studio.openImportModal(mode, target);
        }
    }

    function showErr(msg) {
        var studio = global.JmsScenarioStudio;
        if (studio && typeof studio.showMsg === 'function') {
            studio.showMsg(msg, false);
        }
    }

    function bindHttpChoiceIntercept() {
        if (global.document.body.dataset.jmsIfMountHttpBound === '1') return;
        global.document.body.dataset.jmsIfMountHttpBound = '1';
        global.document.addEventListener('click', function (ev) {
            if (!pending) return;
            var blankBtn = ev.target.closest('#btn-http-add-blank');
            var curlBtn = ev.target.closest('#btn-http-add-curl');
            var stepBtn = ev.target.closest('#btn-http-add-step');
            if (!blankBtn && !curlBtn && !stepBtn) return;
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            var p = pending;
            clearPending();
            var vb = global.JmsVisualBuilder;
            if (blankBtn && vb && typeof vb.addBlankHttpStepAt === 'function') {
                try {
                    var ns = vb.addBlankHttpStepAt(p.planId, p.tgId, p.ifStepId);
                    if (ns && ns.id && typeof vb.openStepEditor === 'function') {
                        vb.openStepEditor(p.planId, p.tgId, ns.id);
                    }
                    if (global.JmsIfMountModel && typeof global.JmsIfMountModel.markDirty === 'function') {
                        global.JmsIfMountModel.markDirty(p.planId, p.tgId, p.ifStepId);
                    }
                } catch (e) {
                    showErr(e.message || String(e));
                }
                closeHttpAddChoiceUi();
                return;
            }
            closeHttpAddChoiceUi();
            if (curlBtn) {
                openImportUi('curl', { planId: p.planId, tgId: p.tgId, ifStepId: p.ifStepId });
                return;
            }
            if (stepBtn) {
                openImportUi('step', { planId: p.planId, tgId: p.tgId, ifStepId: p.ifStepId });
            }
        }, true);
    }

    function openCreate(planId, tgId, ifStepId) {
        pending = { planId: planId, tgId: tgId, ifStepId: ifStepId };
        bindHttpChoiceIntercept();
        var studio = global.JmsScenarioStudio;
        if (studio && typeof studio.openHttpAddChoiceModal === 'function') {
            studio.openHttpAddChoiceModal({ planId: planId, tgId: tgId });
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.addBlankHttpStepAt === 'function') {
            try {
                var ns = vb.addBlankHttpStepAt(planId, tgId, ifStepId);
                if (ns && ns.id && typeof vb.openStepEditor === 'function') {
                    vb.openStepEditor(planId, tgId, ns.id);
                }
                if (global.JmsIfMountModel && typeof global.JmsIfMountModel.markDirty === 'function') {
                    global.JmsIfMountModel.markDirty(planId, tgId, ifStepId);
                }
            } catch (e) { /* ignore */ }
        }
        clearPending();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bindHttpChoiceIntercept);
    } else {
        bindHttpChoiceIntercept();
    }

    global.JmsIfMountHttpCreateUi = {
        openCreate: openCreate
    };
}(typeof window !== 'undefined' ? window : this));
