/**
 * If 控制器 body · 统一拖动排序（挂载元件 + 子步骤，隔离模块）
 */
(function (global) {
    'use strict';

    var dragState = null;
    var MOVE_THRESHOLD = 4;
    var recentDragEnd = 0;
    var docListenersBound = false;

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isIfBodyContainer(el) {
        return !!(el && el.classList && el.classList.contains('jms-tree-if-children'));
    }

    function getBodySiblingNodes(container) {
        if (!container) return [];
        return Array.prototype.filter.call(container.children, function (el) {
            return el.classList && el.classList.contains('jms-tree-node');
        });
    }

    function getNodeBodyKey(node) {
        if (!node) return '';
        var k = node.getAttribute('data-if-body-key');
        if (k) return k;
        var stepId = node.getAttribute('data-step-id');
        if (stepId) return 'ifchild:' + stepId;
        return '';
    }

    function clearDropMarks() {
        global.document.querySelectorAll('.jms-tree-if-children .jms-tree-node.jms-tree-node--drop-before,' +
            '.jms-tree-if-children .jms-tree-node.jms-tree-node--drop-after,' +
            '.jms-tree-if-children .jms-tree-node.jms-tree-node--dragging').forEach(function (el) {
            el.classList.remove('jms-tree-node--drop-before', 'jms-tree-node--drop-after', 'jms-tree-node--dragging');
        });
    }

    function markDropTarget(targetNode, clientY) {
        clearDropMarks();
        if (!targetNode || !dragState) return;
        var rect = targetNode.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
            targetNode.classList.add('jms-tree-node--drop-before');
        } else {
            targetNode.classList.add('jms-tree-node--drop-after');
        }
        if (dragState.node) dragState.node.classList.add('jms-tree-node--dragging');
    }

    function findIfBodyContainerAtPoint(clientX, clientY) {
        var el = global.document.elementFromPoint(clientX, clientY);
        while (el) {
            if (isIfBodyContainer(el)) return el;
            el = el.parentElement;
        }
        return null;
    }

    function findBodyNodeAtPoint(container, clientX, clientY) {
        if (!container) return null;
        var el = global.document.elementFromPoint(clientX, clientY);
        while (el && el !== container) {
            if (el.classList && el.classList.contains('jms-tree-node') && container.contains(el)) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    function computeToIndex(container, clientY, draggedKey) {
        var siblings = getBodySiblingNodes(container);
        if (!siblings.length) return 0;
        var fromIndex = -1;
        var i;
        for (i = 0; i < siblings.length; i++) {
            if (getNodeBodyKey(siblings[i]) === draggedKey) fromIndex = i;
        }
        var insertBefore = siblings.length;
        for (i = 0; i < siblings.length; i++) {
            if (getNodeBodyKey(siblings[i]) === draggedKey) continue;
            var rect = siblings[i].getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) {
                insertBefore = i;
                break;
            }
        }
        var toIndex = insertBefore;
        if (fromIndex >= 0 && fromIndex < toIndex) toIndex -= 1;
        return Math.max(0, Math.min(toIndex, siblings.length - 1));
    }

    function resolveIfStepId(container, handle) {
        if (handle) {
            var fromHandle = handle.getAttribute('data-if-step-id') || handle.getAttribute('data-parent-step-id');
            if (fromHandle) return fromHandle;
        }
        if (!container) return '';
        var hostCard = container.closest('.jms-if-card, .jms-random-card, .jms-simple-card, .jms-transaction-card, .jms-loop-card');
        return hostCard ? (hostCard.getAttribute('data-step-id') || '') : '';
    }

    function applyReorder(planId, tgId, ifStepId, fromIndex, toIndex) {
        var TL = global.JmsIfMountTimeline;
        var M = global.JmsIfMountModel;
        if (!TL || typeof TL.reorderBodyKeys !== 'function' || !M || typeof M.findLogicMountStep !== 'function') return false;
        var ifStep = M.findLogicMountStep(planId, tgId, ifStepId);
        if (!ifStep || !TL.reorderBodyKeys(ifStep, fromIndex, toIndex)) return false;
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        if (card && global.JmsTgIfMountTreeRows &&
            typeof global.JmsTgIfMountTreeRows.patchIfBodyInDom === 'function') {
            var stepsEl = card.querySelector('.jms-tg-tree-steps');
            if (stepsEl) global.JmsTgIfMountTreeRows.patchIfBodyInDom(stepsEl, ifStep, planId, tgId, '');
        }
        return true;
    }

    function performReorder(clientX, clientY) {
        if (!dragState || !dragState.active) return false;
        var srcContainer = dragState.container;
        var dropContainer = findIfBodyContainerAtPoint(clientX, clientY);
        if (!srcContainer || !dropContainer || srcContainer !== dropContainer) return false;
        if (String(resolveIfStepId(dropContainer, null)) !== String(dragState.ifStepId)) return false;
        var siblings = getBodySiblingNodes(dropContainer);
        var fromIndex = -1;
        var i;
        for (i = 0; i < siblings.length; i++) {
            if (getNodeBodyKey(siblings[i]) === dragState.bodyKey) fromIndex = i;
        }
        if (fromIndex < 0) return false;
        var toIndex = computeToIndex(dropContainer, clientY, dragState.bodyKey);
        if (fromIndex === toIndex) return true;
        return applyReorder(dragState.planId, dragState.tgId, dragState.ifStepId, fromIndex, toIndex);
    }

    function updateDropPreview(clientX, clientY) {
        if (!dragState || !dragState.active) return;
        var srcContainer = dragState.container;
        var dropContainer = findIfBodyContainerAtPoint(clientX, clientY);
        if (!srcContainer || !dropContainer || srcContainer !== dropContainer ||
            String(resolveIfStepId(dropContainer, null)) !== String(dragState.ifStepId)) {
            clearDropMarks();
            if (dragState.node) dragState.node.classList.add('jms-tree-node--dragging');
            return;
        }
        var siblings = getBodySiblingNodes(dropContainer);
        var targetNode = findBodyNodeAtPoint(dropContainer, clientX, clientY);
        if (targetNode && targetNode !== dragState.node) {
            markDropTarget(targetNode, clientY);
            return;
        }
        var marked = false;
        var i;
        for (i = 0; i < siblings.length; i++) {
            var s = siblings[i];
            if (s === dragState.node) continue;
            var rect = s.getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) {
                markDropTarget(s, clientY);
                marked = true;
                break;
            }
        }
        if (!marked && siblings.length) {
            markDropTarget(siblings[siblings.length - 1], clientY + 9999);
        } else if (dragState.node) {
            dragState.node.classList.add('jms-tree-node--dragging');
        }
    }

    function teardownDocListeners() {
        if (!docListenersBound) return;
        docListenersBound = false;
        global.document.removeEventListener('mousemove', onPointerMove, true);
        global.document.removeEventListener('mouseup', onPointerUp, true);
        global.document.removeEventListener('keydown', onKeyDown, true);
        global.document.body.classList.remove('jms-if-mount-body-dragging');
    }

    function onKeyDown(ev) {
        if (!dragState) return;
        if (ev.key === 'Escape') {
            ev.preventDefault();
            clearDropMarks();
            dragState = null;
            teardownDocListeners();
        }
    }

    function onPointerMove(ev) {
        if (!dragState) return;
        if (!dragState.active) {
            var dx = ev.clientX - dragState.startX;
            var dy = ev.clientY - dragState.startY;
            if (Math.abs(dx) + Math.abs(dy) < MOVE_THRESHOLD) return;
            dragState.active = true;
            global.document.body.classList.add('jms-if-mount-body-dragging');
            if (dragState.node) dragState.node.classList.add('jms-tree-node--dragging');
        }
        ev.preventDefault();
        updateDropPreview(ev.clientX, ev.clientY);
    }

    function onPointerUp(ev) {
        if (!dragState) return;
        var wasActive = dragState.active;
        if (wasActive) {
            ev.preventDefault();
            ev.stopPropagation();
            performReorder(ev.clientX, ev.clientY);
            recentDragEnd = Date.now();
        }
        clearDropMarks();
        dragState = null;
        teardownDocListeners();
    }

    function armDocListeners() {
        if (docListenersBound) return;
        docListenersBound = true;
        global.document.addEventListener('mousemove', onPointerMove, true);
        global.document.addEventListener('mouseup', onPointerUp, true);
        global.document.addEventListener('keydown', onKeyDown, true);
    }

    function resolveDragHandle(ev) {
        var mountHandle = ev.target.closest('.jms-if-mount-drag-handle');
        if (mountHandle) return mountHandle;
        var treeHandle = ev.target.closest('.jms-tree-if-children .jms-tree-drag-handle');
        if (treeHandle && !treeHandle.classList.contains('jms-http-mount-drag-handle')) return treeHandle;
        return null;
    }

    function onPointerDown(ev) {
        if (!isTreeView()) return;
        if (ev.button !== 0) return;
        var handle = resolveDragHandle(ev);
        if (!handle) return;
        var node = handle.closest('.jms-tree-node');
        if (!node) return;
        var container = node.closest('.jms-tree-if-children');
        if (!container) return;
        var bodyKey = handle.getAttribute('data-if-body-key') || getNodeBodyKey(node);
        if (!bodyKey) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        dragState = {
            planId: handle.getAttribute('data-plan-id'),
            tgId: handle.getAttribute('data-tg-id'),
            ifStepId: resolveIfStepId(container, handle),
            bodyKey: bodyKey,
            node: node,
            container: container,
            startX: ev.clientX,
            startY: ev.clientY,
            active: false
        };
        armDocListeners();
    }

    function onClickAfterDrag(ev) {
        if (!recentDragEnd || Date.now() - recentDragEnd > 450) return;
        if (!ev.target.closest('.jms-if-mount-drag-handle, .jms-tree-if-children .jms-tree-drag-handle, .jms-tree-node--if-mount .jms-aux-card')) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        recentDragEnd = 0;
    }

    function init() {
        if (global.__jmsIfMountBodyDragDocBound) return;
        global.__jmsIfMountBodyDragDocBound = true;
        global.document.addEventListener('mousedown', onPointerDown, true);
        global.document.addEventListener('click', onClickAfterDrag, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsIfMountBodyDrag = {
        recentDragEnd: function () { return recentDragEnd; }
    };
}(typeof window !== 'undefined' ? window : this));
