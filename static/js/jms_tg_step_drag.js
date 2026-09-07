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

    function isDropContainer(el) {
        return !!(el && el.classList &&
            (el.classList.contains('jms-tg-tree-steps') || el.classList.contains('jms-tree-if-children')));
    }

    function isTgRootStepsContainer(el) {
        return !!(el && el.classList && el.classList.contains('jms-tg-tree-steps') &&
            !el.closest('.jms-tree-if-children'));
    }

    function getNodeDragId(node) {
        if (!node) return '';
        if (node.classList && node.classList.contains('jms-tree-node--tg-assert')) {
            return 'assert:' + node.getAttribute('data-tg-assert-index');
        }
        if (isListenerNode(node)) {
            return 'listener:' + (node.getAttribute('data-tg-listener-key') || '');
        }
        if (isVariablesNode(node)) {
            return 'tg-variables:block';
        }
        if (isProcessorNode(node)) {
            return 'processor:' + (node.getAttribute('data-proc-index') || '0');
        }
        return node.getAttribute('data-step-id') || node.getAttribute('data-config-id') || '';
    }

    function isAssertNode(node) {
        return !!(node && node.classList && node.classList.contains('jms-tree-node--tg-assert'));
    }

    function isListenerNode(node) {
        return !!(node && node.classList && node.classList.contains('jms-tree-node--tg-listener'));
    }

    function isVariablesNode(node) {
        return !!(node && node.classList && node.classList.contains('jms-tree-node--tg-variables'));
    }

    function isProcessorNode(node) {
        return !!(node && node.classList && node.classList.contains('jms-tree-node--tg-processor'));
    }

    function isTopLevelTimelineNode(node) {
        if (!node) return false;
        if (node.classList.contains('jms-tree-node--config-nested')) return false;
        if (isAssertNode(node)) return true;
        if (isListenerNode(node)) return true;
        if (isVariablesNode(node)) return true;
        if (isProcessorNode(node)) return true;
        if (node.classList.contains('jms-tree-node--config')) return true;
        var depth = parseInt(node.getAttribute('data-depth') || '0', 10);
        return depth === 0;
    }

    function getTimelineSiblingNodes(container) {
        return getSiblingNodes(container).filter(isTopLevelTimelineNode);
    }

    function findTgFromDragState(dragStateRef) {
        if (!dragStateRef) return null;
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.findTg !== 'function') return null;
        var model = typeof vb.getModel === 'function' ? vb.getModel() : null;
        if (!model) return null;
        var plan = (model.test_plans || []).find(function (p) { return p.id === dragStateRef.planId; });
        if (!plan) return null;
        return vb.findTg(plan, dragStateRef.tgId);
    }

    function shouldUseTimelineReorder(container, dragStateRef) {
        if (!isTgRootStepsContainer(container) || !dragStateRef) return false;
        if (dragStateRef.dragKind === 'config' || dragStateRef.dragKind === 'assert' || dragStateRef.dragKind === 'listener' ||
            dragStateRef.dragKind === 'tg-variables' || dragStateRef.dragKind === 'processor') return true;
        var tg = findTgFromDragState(dragStateRef);
        if (global.JmsTgDetailTimeline && typeof global.JmsTgDetailTimeline.canUse === 'function' &&
            global.JmsTgDetailTimeline.canUse(tg)) {
            return true;
        }
        var siblings = getSiblingNodes(container);
        for (var i = 0; i < siblings.length; i++) {
            if (siblings[i].classList.contains('jms-tree-node--config')) return true;
        }
        return false;
    }

    function getListContainer(nodeEl) {
        if (!nodeEl) return null;
        var ifBody = nodeEl.closest('.jms-tree-if-children');
        if (ifBody) return ifBody;
        return nodeEl.closest('.jms-tg-tree-steps');
    }

    function getSiblingNodes(container) {
        if (!container) return [];
        return Array.prototype.filter.call(container.children, function (el) {
            return el.classList && el.classList.contains('jms-tree-node');
        });
    }

    function clearDropMarks() {
        global.document.querySelectorAll('.jms-tree-node--drop-before, .jms-tree-node--drop-after, .jms-tree-node--dragging').forEach(function (el) {
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

    function findDropContainerAtPoint(clientX, clientY) {
        var el = global.document.elementFromPoint(clientX, clientY);
        while (el) {
            if (isDropContainer(el)) return el;
            el = el.parentElement;
        }
        return null;
    }

    function findTreeNodeAtPoint(container, clientX, clientY) {
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

    function computeTimelineToIndex(container, clientY, draggedId) {
        var siblings = getTimelineSiblingNodes(container);
        if (!siblings.length) return 0;
        var fromIndex = -1;
        for (var i = 0; i < siblings.length; i++) {
            if (getNodeDragId(siblings[i]) === draggedId) fromIndex = i;
        }
        var insertBefore = siblings.length;
        for (var j = 0; j < siblings.length; j++) {
            if (getNodeDragId(siblings[j]) === draggedId) continue;
            var rect = siblings[j].getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) {
                insertBefore = j;
                break;
            }
        }
        var toIndex = insertBefore;
        if (fromIndex >= 0 && fromIndex < toIndex) toIndex -= 1;
        return Math.max(0, Math.min(toIndex, siblings.length - 1));
    }

    function computeToIndex(container, clientY, draggedId) {
        var siblings = getSiblingNodes(container);
        if (!siblings.length) return 0;
        var fromIndex = -1;
        for (var i = 0; i < siblings.length; i++) {
            if (getNodeDragId(siblings[i]) === draggedId) fromIndex = i;
        }
        var insertBefore = siblings.length;
        for (var j = 0; j < siblings.length; j++) {
            if (getNodeDragId(siblings[j]) === draggedId) continue;
            var rect = siblings[j].getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) {
                insertBefore = j;
                break;
            }
        }
        var toIndex = insertBefore;
        if (fromIndex >= 0 && fromIndex < toIndex) toIndex -= 1;
        return Math.max(0, Math.min(toIndex, siblings.length - 1));
    }

    function performReorder(clientX, clientY) {
        if (!dragState || !dragState.active) return false;
        var srcContainer = getListContainer(dragState.node);
        var dropContainer = findDropContainerAtPoint(clientX, clientY);
        if (!srcContainer || !dropContainer || srcContainer !== dropContainer) return false;

        var useTimeline = shouldUseTimelineReorder(dropContainer, dragState);
        var siblings = useTimeline ? getTimelineSiblingNodes(dropContainer) : getSiblingNodes(dropContainer);
        var fromIndex = -1;
        for (var i = 0; i < siblings.length; i++) {
            if (getNodeDragId(siblings[i]) === dragState.itemId) fromIndex = i;
        }
        if (fromIndex < 0) return false;
        var toIndex = useTimeline
            ? computeTimelineToIndex(dropContainer, clientY, dragState.itemId)
            : computeToIndex(dropContainer, clientY, dragState.itemId);
        if (fromIndex === toIndex) return true;
        if (useTimeline) {
            if (global.JmsVisualBuilder && typeof global.JmsVisualBuilder.reorderTreeTimelineByIndex === 'function') {
                global.JmsVisualBuilder.reorderTreeTimelineByIndex(
                    dragState.planId,
                    dragState.tgId,
                    fromIndex,
                    toIndex
                );
            }
        } else if (global.JmsVisualBuilder && typeof global.JmsVisualBuilder.reorderTreeStepByIndex === 'function') {
            global.JmsVisualBuilder.reorderTreeStepByIndex(
                dragState.planId,
                dragState.tgId,
                fromIndex,
                toIndex,
                dragState.parentStepId || null
            );
        }
        return true;
    }

    function updateDropPreview(clientX, clientY) {
        if (!dragState || !dragState.active) return;
        var srcContainer = getListContainer(dragState.node);
        var dropContainer = findDropContainerAtPoint(clientX, clientY);
        if (!srcContainer || !dropContainer || srcContainer !== dropContainer) {
            clearDropMarks();
            if (dragState.node) dragState.node.classList.add('jms-tree-node--dragging');
            return;
        }
        var useTimeline = shouldUseTimelineReorder(dropContainer, dragState);
        var siblings = useTimeline ? getTimelineSiblingNodes(dropContainer) : getSiblingNodes(dropContainer);
        var targetNode = findTreeNodeAtPoint(dropContainer, clientX, clientY);
        if (targetNode && targetNode !== dragState.node) {
            if (!useTimeline || isTopLevelTimelineNode(targetNode)) {
                markDropTarget(targetNode, clientY);
                return;
            }
        }
        var marked = false;
        for (var i = 0; i < siblings.length; i++) {
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
        global.document.body.classList.remove('jms-tree-step-dragging');
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
            global.document.body.classList.add('jms-tree-step-dragging');
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

    function onClickAfterDrag(ev) {
        if (!recentDragEnd || Date.now() - recentDragEnd > 450) return;
        if (!ev.target.closest('.jms-tree-drag-handle, .jms-if-card, .jms-http-card, .jms-aux-card')) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        recentDragEnd = 0;
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
        var handle = ev.target.closest('.jms-tree-drag-handle');
        if (!handle) return;
        if (handle.classList.contains('jms-http-mount-drag-handle')) return;
        if (handle.classList.contains('jms-if-mount-drag-handle')) return;
        if (handle.closest('.jms-tree-if-children')) return;
        var node = handle.closest('.jms-tree-node');
        if (!node) return;
        if (node.classList.contains('jms-tree-node--http-mount')) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        var configId = handle.getAttribute('data-config-id') || '';
        var stepId = handle.getAttribute('data-step-id') || '';
        var assertIndex = handle.getAttribute('data-tg-assert-index');
        var listenerKey = handle.getAttribute('data-tg-listener-key');
        var auxKind = handle.getAttribute('data-tg-aux-kind');
        var procIndex = handle.getAttribute('data-tg-proc-index');
        var dragKind = 'step';
        var itemId = stepId;
        if (configId) {
            dragKind = 'config';
            itemId = configId;
        } else if (auxKind === 'tg-variables') {
            dragKind = 'tg-variables';
            itemId = 'tg-variables:block';
        } else if (procIndex !== null && procIndex !== '') {
            dragKind = 'processor';
            itemId = 'processor:' + procIndex;
        } else if (listenerKey) {
            dragKind = 'listener';
            itemId = 'listener:' + listenerKey;
        } else if (assertIndex !== null && assertIndex !== '') {
            dragKind = 'assert';
            itemId = 'assert:' + assertIndex;
        }
        dragState = {
            planId: handle.getAttribute('data-plan-id'),
            tgId: handle.getAttribute('data-tg-id'),
            itemId: itemId,
            dragKind: dragKind,
            parentStepId: handle.getAttribute('data-parent-step-id') || '',
            node: node,
            startX: ev.clientX,
            startY: ev.clientY,
            active: false
        };
        armDocListeners();
    }

    function init() {
        if (global.__jmsStepDragDocBound) return;
        global.__jmsStepDragDocBound = true;
        global.document.addEventListener('mousedown', onPointerDown, true);
        global.document.addEventListener('click', onClickAfterDrag, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsTgStepDrag = { init: init };
}(typeof window !== 'undefined' ? window : this));