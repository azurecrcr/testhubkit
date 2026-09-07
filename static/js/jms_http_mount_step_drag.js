/**
 * HTTP 请求挂载 · 树内拖动排序（隔离模块）
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

    function isMountDropContainer(el) {
        return !!(el && el.classList && el.classList.contains('jms-http-mount-children'));
    }

    function getMountSiblingNodes(container) {
        if (!container) return [];
        return Array.prototype.filter.call(container.children, function (el) {
            return el.classList && el.classList.contains('jms-tree-node--http-mount');
        });
    }

    function getNodeMountKey(node) {
        return node ? (node.getAttribute('data-http-mount-key') || '') : '';
    }

    function clearDropMarks() {
        global.document.querySelectorAll('.jms-tree-node--http-mount.jms-tree-node--drop-before,' +
            '.jms-tree-node--http-mount.jms-tree-node--drop-after,' +
            '.jms-tree-node--http-mount.jms-tree-node--dragging').forEach(function (el) {
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

    function findMountContainerAtPoint(clientX, clientY) {
        var el = global.document.elementFromPoint(clientX, clientY);
        while (el) {
            if (isMountDropContainer(el)) return el;
            el = el.parentElement;
        }
        return null;
    }

    function findMountNodeAtPoint(container, clientX, clientY) {
        if (!container) return null;
        var el = global.document.elementFromPoint(clientX, clientY);
        while (el && el !== container) {
            if (el.classList && el.classList.contains('jms-tree-node--http-mount') && container.contains(el)) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    function computeToIndex(container, clientY, draggedKey) {
        var siblings = getMountSiblingNodes(container);
        if (!siblings.length) return 0;
        var fromIndex = -1;
        var i;
        for (i = 0; i < siblings.length; i++) {
            if (getNodeMountKey(siblings[i]) === draggedKey) fromIndex = i;
        }
        var insertBefore = siblings.length;
        for (i = 0; i < siblings.length; i++) {
            if (getNodeMountKey(siblings[i]) === draggedKey) continue;
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

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findHttpStep(model, planId, tgId, stepId) {
        if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.findHttpStep === 'function') {
            return global.JmsHttpContextUi.findHttpStep(model, planId, tgId, stepId);
        }
        return null;
    }

    function applyReorder(planId, tgId, parentStepId, fromIndex, toIndex) {
        var Timeline = global.JmsHttpMountTimeline;
        if (!Timeline || typeof Timeline.reorderMountEntries !== 'function') return false;
        var step = findHttpStep(getModel(), planId, tgId, parentStepId);
        if (!step || !Timeline.reorderMountEntries(step, fromIndex, toIndex)) return false;
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        if (card && global.JmsHttpMountTreeRows &&
            typeof global.JmsHttpMountTreeRows.patchMountChildrenInDom === 'function') {
            var stepsEl = card.querySelector('.jms-tg-tree-steps');
            if (stepsEl) global.JmsHttpMountTreeRows.patchMountChildrenInDom(stepsEl, step, planId, tgId);
        }
        return true;
    }

    function performReorder(clientX, clientY) {
        if (!dragState || !dragState.active) return false;
        var srcContainer = dragState.container;
        var dropContainer = findMountContainerAtPoint(clientX, clientY);
        if (!srcContainer || !dropContainer || srcContainer !== dropContainer) return false;
        if (String(dropContainer.getAttribute('data-http-parent-step-id')) !== String(dragState.parentStepId)) {
            return false;
        }
        var siblings = getMountSiblingNodes(dropContainer);
        var fromIndex = -1;
        var i;
        for (i = 0; i < siblings.length; i++) {
            if (getNodeMountKey(siblings[i]) === dragState.mountKey) fromIndex = i;
        }
        if (fromIndex < 0) return false;
        var toIndex = computeToIndex(dropContainer, clientY, dragState.mountKey);
        if (fromIndex === toIndex) return true;
        return applyReorder(dragState.planId, dragState.tgId, dragState.parentStepId, fromIndex, toIndex);
    }

    function updateDropPreview(clientX, clientY) {
        if (!dragState || !dragState.active) return;
        var srcContainer = dragState.container;
        var dropContainer = findMountContainerAtPoint(clientX, clientY);
        if (!srcContainer || !dropContainer || srcContainer !== dropContainer ||
            String(dropContainer.getAttribute('data-http-parent-step-id')) !== String(dragState.parentStepId)) {
            clearDropMarks();
            if (dragState.node) dragState.node.classList.add('jms-tree-node--dragging');
            return;
        }
        var siblings = getMountSiblingNodes(dropContainer);
        var targetNode = findMountNodeAtPoint(dropContainer, clientX, clientY);
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
        global.document.body.classList.remove('jms-http-mount-dragging');
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
            global.document.body.classList.add('jms-http-mount-dragging');
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

    function onPointerDown(ev) {
        if (!isTreeView()) return;
        if (ev.button !== 0) return;
        var handle = ev.target.closest('.jms-http-mount-drag-handle');
        if (!handle) return;
        var node = handle.closest('.jms-tree-node--http-mount');
        if (!node) return;
        var container = node.closest('.jms-http-mount-children');
        if (!container) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        dragState = {
            planId: handle.getAttribute('data-plan-id'),
            tgId: handle.getAttribute('data-tg-id'),
            parentStepId: handle.getAttribute('data-http-parent-step-id'),
            mountKey: handle.getAttribute('data-http-mount-key'),
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
        if (!ev.target.closest('.jms-http-mount-drag-handle, .jms-aux-card--http-mount')) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        recentDragEnd = 0;
    }

    function init() {
        if (global.__jmsHttpMountDragDocBound) return;
        global.__jmsHttpMountDragDocBound = true;
        global.document.addEventListener('mousedown', onPointerDown, true);
        global.document.addEventListener('click', onClickAfterDrag, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsHttpMountStepDrag = {
        recentDragEnd: function () { return recentDragEnd; }
    };
}(typeof window !== 'undefined' ? window : this));
