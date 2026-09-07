/**
 * 断言新建 · 取消回滚（隔离模块，对齐 Debug Sampler 取消逻辑）
 */
(function (global) {
    'use strict';

    function readModelFromDom() {
        if (global.JmsVisualBuilder && typeof global.JmsVisualBuilder.readModelFromDom === 'function') {
            global.JmsVisualBuilder.readModelFromDom();
        }
    }

    function clearPendingAttrs(modal) {
        if (!modal) return;
        modal.removeAttribute('data-assert-pending-index');
    }

    function markPending(modal, index) {
        if (!modal) return;
        modal.setAttribute('data-assert-pending-index', String(index));
    }

    function getPendingIndex(modal) {
        if (!modal) return -1;
        var raw = modal.getAttribute('data-assert-pending-index');
        if (raw == null || raw === '') return -1;
        var n = parseInt(raw, 10);
        return isNaN(n) ? -1 : n;
    }

    function removeAt(list, index, assertType) {
        if (!list || index < 0 || index >= list.length) return false;
        var item = list[index];
        if (!item || item.type !== assertType) return false;
        list.splice(index, 1);
        return true;
    }

    function rollbackPending(modal, opts) {
        if (!modal || !opts) return false;
        if (modal.getAttribute('data-assert-mode') !== 'create') return false;
        var idx = getPendingIndex(modal);
        if (idx < 0) return false;
        var list = opts.getList && opts.getList();
        if (!list) return false;
        if (!removeAt(list, idx, opts.assertType)) return false;
        clearPendingAttrs(modal);
        if (opts.afterRemove) opts.afterRemove();
        return true;
    }

    function appendDraft(modal, list, draft, opts) {
        if (!modal || !list || !draft) return -1;
        list.push(draft);
        var idx = list.length - 1;
        markPending(modal, idx);
        opts = opts || {};
        if (opts.assignTimeline && opts.tg && global.JmsTgDetailTimeline &&
            typeof global.JmsTgDetailTimeline.assignAppendTimelineOrder === 'function') {
            global.JmsTgDetailTimeline.assignAppendTimelineOrder(opts.tg, draft);
        }
        if (opts.notifyIfMount && opts.ifStep) {
            var H = global.JmsIfMountSaveHelper;
            if (H && typeof H.notifyMountAdded === 'function') {
                H.notifyMountAdded(opts.ifStep, 'ifas:' + idx);
            }
        }
        return idx;
    }

    function resolvePendingItem(modal, list, assertType) {
        var idx = getPendingIndex(modal);
        if (idx < 0 || !list || idx >= list.length) return null;
        var item = list[idx];
        if (!item || item.type !== assertType) return null;
        return item;
    }

    function commitPending(modal) {
        clearPendingAttrs(modal);
    }

    global.JmsAssertCreateCancelRollback = {
        readModelFromDom: readModelFromDom,
        clearPendingAttrs: clearPendingAttrs,
        markPending: markPending,
        getPendingIndex: getPendingIndex,
        rollbackPending: rollbackPending,
        appendDraft: appendDraft,
        resolvePendingItem: resolvePendingItem,
        commitPending: commitPending
    };
}(typeof window !== 'undefined' ? window : this));
