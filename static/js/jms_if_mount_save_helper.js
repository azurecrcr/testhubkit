/**
 * If 控制器挂载区 · 保存辅助（隔离模块，供各弹窗复用）
 */
(function (global) {
    'use strict';

    function M() { return global.JmsIfMountModel; }

    function getIf(planId, tgId, ifStepId) {
        if (!M()) return null;
        var step = null;
        if (typeof M().findMountHostStep === 'function') {
            step = M().findMountHostStep(planId, tgId, ifStepId);
        } else if (typeof M().findLogicMountStep === 'function') {
            step = M().findLogicMountStep(planId, tgId, ifStepId);
        } else if (typeof M().findIfStep === 'function') {
            step = M().findIfStep(planId, tgId, ifStepId);
        }
        return step && typeof M().ensureMountFields === 'function' ? M().ensureMountFields(step) : step;
    }

    function markDirty(planId, tgId, ifStepId) {
        if (M() && typeof M().markDirty === 'function') M().markDirty(planId, tgId, ifStepId);
    }

    function parentIfId(modal) {
        return modal ? modal.getAttribute('data-if-mount-parent-id') : '';
    }

    function mountIfId(modal) {
        return modal ? modal.getAttribute('data-if-mount-if-step-id') : '';
    }

    function isIfMountCtx(modal) {
        return !!(parentIfId(modal) || mountIfId(modal));
    }

    function uid() {
        return 'step_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    }

    function appendIfChild(ifStep, data) {
        if (!ifStep) return null;
        if (!Array.isArray(ifStep.children)) ifStep.children = [];
        var ns = Object.assign({ id: uid(), children: [] }, data || {});
        if (!Array.isArray(ns.children)) ns.children = [];
        ifStep.children.push(ns);
        notifyMountAdded(ifStep, 'ifchild:' + ns.id);
        return ns;
    }

    function clearIfMountAttrs(modal) {
        if (!modal) return;
        modal.removeAttribute('data-if-mount-parent-id');
        modal.removeAttribute('data-if-mount-if-step-id');
        modal.removeAttribute('data-if-mount-aux-create');
    }

    function notifyMountAdded(ifStep, key) {
        var TL = global.JmsIfMountTimeline;
        if (TL && typeof TL.assignAppendMountKey === 'function') {
            TL.assignAppendMountKey(ifStep, key);
        }
    }

    function bindIfMountProcessorEditModal(modal, planId, tgId, ifStepId, mode, procIndex, fallbackName) {
        if (!modal) return;
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
        modal.removeAttribute('data-step-id');
        modal.setAttribute('data-if-mount-if-step-id', ifStepId);
        modal.setAttribute('data-proc-mode', mode);
        if (mode === 'create') {
            if (fallbackName) modal.setAttribute('data-proc-default-name', fallbackName);
            modal.removeAttribute('data-proc-index');
        } else {
            modal.setAttribute('data-proc-index', String(procIndex));
            modal.removeAttribute('data-proc-default-name');
        }
    }

    function trySaveIfMountProcessor(modal, opts) {
        if (!modal || !opts) return false;
        var ifStepId = mountIfId(modal);
        if (!ifStepId) return false;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var mode = modal.getAttribute('data-proc-mode') || 'edit';
        var ifStep = getIf(planId, tgId, ifStepId);
        if (!ifStep) return true;
        if (!Array.isArray(ifStep.processors)) ifStep.processors = [];
        var list = ifStep.processors;
        var expectedType = opts.expectedType || '';
        if (mode === 'create') {
            if (typeof opts.validateCreate === 'function' && !opts.validateCreate()) return true;
            var fallback = modal.getAttribute('data-proc-default-name') || '';
            if (typeof opts.isEmptyCreate === 'function' && opts.isEmptyCreate(fallback)) {
                if (typeof opts.onClose === 'function') opts.onClose();
                return true;
            }
            if (typeof opts.validateRequired === 'function' && !opts.validateRequired()) return true;
            var created = typeof opts.defaultProcessor === 'function'
                ? opts.defaultProcessor(list.length)
                : { type: expectedType, enabled: true };
            opts.applyFields(created, opts.fields, fallback);
            list.push(created);
            notifyMountAdded(ifStep, 'ifproc:' + (list.length - 1));
        } else {
            var idx = parseInt(modal.getAttribute('data-proc-index'), 10);
            var existing = list[idx];
            if (!existing || (expectedType && existing.type !== expectedType)) return true;
            if (typeof opts.validateRequired === 'function' && !opts.validateRequired()) return true;
            opts.applyFields(existing, opts.fields, existing.name || fallbackNameFromModal(modal));
        }
        if (typeof opts.onClose === 'function') opts.onClose();
        markDirty(planId, tgId, ifStepId);
        return true;
    }

    function fallbackNameFromModal(modal) {
        return (modal && modal.getAttribute('data-proc-default-name')) || '';
    }

    global.JmsIfMountSaveHelper = {
        getIf: getIf,
        markDirty: markDirty,
        parentIfId: parentIfId,
        mountIfId: mountIfId,
        isIfMountCtx: isIfMountCtx,
        uid: uid,
        appendIfChild: appendIfChild,
        notifyMountAdded: notifyMountAdded,
        notifyChildAdded: function (ifStep, childId) { notifyMountAdded(ifStep, 'ifchild:' + childId); },
        clearIfMountAttrs: clearIfMountAttrs,
        bindIfMountProcessorEditModal: bindIfMountProcessorEditModal,
        trySaveIfMountProcessor: trySaveIfMountProcessor
    };
}(typeof window !== 'undefined' ? window : this));
