/**
 * 用例工作台 SMM 画布 · 自由拖拽改挂增强（与工作台其它模块隔离）
 * - 指针落入目标节点区域时显示改挂提示
 * - 松手前同步 overlapNode；dragend 兜底 MOVE_NODE_TO
 * - 改挂后清理旧父节点残留连线、清除自定义坐标，避免多次拖动后连线堆积
 */
(function (global) {
    'use strict';

    var POINTER_PAD_PX = 10;
    var REPART_HINT = {
        stroke: 'rgb(94, 200, 248)',
        fill: 'rgba(94, 200, 248, 0.14)',
        lineWidth: 2,
        pad: 8,
        label: '松手移入此节点',
        rootLabel: '松手移入主节点'
    };
    var boundMap = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    var boundIds = Object.create(null);

    function isBound(smm) {
        if (!smm) return false;
        if (boundMap) return boundMap.has(smm);
        return !!boundIds[smm.id || 'default'];
    }

    function markBound(smm) {
        if (!smm) return;
        if (boundMap) boundMap.set(smm, true);
        else boundIds[smm.id || 'default'] = true;
    }

    function getDragNodeList(drag) {
        if (!drag) return [];
        if (drag.beingDragNodeList && drag.beingDragNodeList.length) return drag.beingDragNodeList;
        if (drag.mousedownNode && !drag.mousedownNode.isRoot && !drag.mousedownNode.isGeneralization) {
            return [drag.mousedownNode];
        }
        return [];
    }

    function getSingleDraggedNode(drag) {
        var list = getDragNodeList(drag);
        if (list.length !== 1) return null;
        var node = list[0];
        if (!node || node.isRoot || node.isGeneralization) return null;
        return node;
    }

    function hasPassedDragOffset(drag) {
        if (!drag || drag.mouseMoveX == null || drag.mouseDownX == null) return false;
        var threshold = drag.checkDragOffset != null ? drag.checkDragOffset : 10;
        return Math.abs(drag.mouseMoveX - drag.mouseDownX) > threshold ||
            Math.abs(drag.mouseMoveY - drag.mouseDownY) > threshold;
    }

    function isSingleFreeDrag(smm, drag) {
        if (!smm || !smm.opt || !smm.opt.enableFreeDrag) return false;
        if (!drag) return false;
        if (drag.beingDragNodeList && drag.beingDragNodeList.length > 1) return false;
        if (!getSingleDraggedNode(drag)) return false;
        return !!(drag.isDragging || (drag.isMousedown && hasPassedDragOffset(drag)));
    }

    function refreshReparentNodeCache(smm) {
        if (!smm) return;
        var root = smm.renderer && smm.renderer.root;
        if (!root) {
            smm._tcReparentNodeCache = [];
            return;
        }
        var list = [];
        walkAllNodes(root, function (node) {
            if (!node || node.isGeneralization) return;
            list.push(node);
        });
        smm._tcReparentNodeCache = list;
    }

    function getReparentCandidateNodes(smm) {
        if (!smm) return [];
        var cached = smm._tcReparentNodeCache;
        if (cached && cached.length) return cached;
        refreshReparentNodeCache(smm);
        return smm._tcReparentNodeCache || [];
    }

    function getCanvasTransform(smm, drag) {
        var tr = null;
        try {
            if (drag && drag.drawTransform) tr = drag.drawTransform;
            else if (smm && smm.draw) tr = smm.draw.transform();
        } catch (e) { /* ignore */ }
        return {
            scaleX: (tr && tr.scaleX) || 1,
            scaleY: (tr && tr.scaleY) || 1,
            translateX: (tr && tr.translateX) || 0,
            translateY: (tr && tr.translateY) || 0
        };
    }

    function getCanvasNodeRect(smm, node, drag) {
        if (!node) return null;
        var t = getCanvasTransform(smm, drag);
        var left = node.left * t.scaleX + t.translateX;
        var top = node.top * t.scaleY + t.translateY;
        var width = node.width * t.scaleX;
        var height = node.height * t.scaleY;
        return {
            left: left,
            top: top,
            right: left + width,
            bottom: top + height,
            originWidth: node.width,
            originHeight: node.height,
            area: Math.max(node.width, 1) * Math.max(node.height, 1)
        };
    }

    function getNativeReparentTarget(drag) {
        if (!drag || !drag.overlapNode || drag.prevNode || drag.nextNode) return null;
        return drag.overlapNode;
    }

    function isInCanvasReparentZone(rect, mx, my, node) {
        if (!rect || mx == null || my == null) return false;
        if (mx < rect.left || mx > rect.right) return false;
        if (node && node.isRoot) {
            return my >= rect.top && my <= rect.bottom;
        }
        var edge = Math.max((rect.originHeight || 0) / 4, 4);
        var topBound = rect.top + edge;
        var bottomBound = rect.bottom - edge;
        if (bottomBound <= topBound) {
            topBound = rect.top;
            bottomBound = rect.bottom;
        }
        return my >= topBound && my <= bottomBound;
    }

    function findReparentTargetByCanvasPointer(smm, drag) {
        if (!isSingleFreeDrag(smm, drag)) return null;
        if (drag.mouseMoveX == null || drag.mouseMoveY == null) return null;
        var mx = drag.mouseMoveX;
        var my = drag.mouseMoveY;
        var rootNode = smm.renderer && smm.renderer.root;
        if (rootNode && !isInvalidReparentTarget(drag, rootNode)) {
            var rootRect = getCanvasNodeRect(smm, rootNode, drag);
            if (rootRect && isInCanvasReparentZone(rootRect, mx, my, rootNode)) {
                return rootNode;
            }
        }
        var best = null;
        var bestArea = Infinity;
        var nodes = getReparentCandidateNodes(smm);
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (!node || node.isRoot) continue;
            if (isInvalidReparentTarget(drag, node)) continue;
            var rect = getCanvasNodeRect(smm, node, drag);
            if (!rect || !isInCanvasReparentZone(rect, mx, my, node)) continue;
            if (rect.area < bestArea) {
                bestArea = rect.area;
                best = node;
            }
        }
        return best;
    }

    function getDragPointer(drag) {
        if (!drag || drag.mouseMoveX == null || drag.mouseMoveY == null) return null;
        return { x: drag.mouseMoveX, y: drag.mouseMoveY };
    }

    function getNodeRect(node) {
        if (!node) return null;
        return {
            left: node.left,
            top: node.top,
            width: node.width,
            height: node.height,
            right: node.left + node.width,
            bottom: node.top + node.height,
            cx: node.left + node.width / 2,
            cy: node.top + node.height / 2,
            area: Math.max(node.width, 1) * Math.max(node.height, 1)
        };
    }

    function getCloneAnchor(drag) {
        if (!drag || !drag.clone) return getDragPointer(drag);
        var dragged = getSingleDraggedNode(drag);
        if (!dragged) return getDragPointer(drag);
        var t = drag.clone.transform();
        return {
            x: t.translateX + dragged.width / 2,
            y: t.translateY + dragged.height / 2
        };
    }

    function getNodeUid(node) {
        if (!node) return '';
        var uid = node.uid;
        if (uid == null || uid === '') {
            try {
                if (node.getData) uid = node.getData('uid');
            } catch (e1) { /* ignore */ }
        }
        return uid == null || uid === '' ? '' : String(uid);
    }

    function isSameNode(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        var aUid = getNodeUid(a);
        var bUid = getNodeUid(b);
        return !!(aUid && bUid && aUid === bUid);
    }

    function isDescendantOf(ancestor, node) {
        if (!ancestor || !node) return false;
        var p = node.parent;
        while (p) {
            if (p === ancestor) return true;
            p = p.parent;
        }
        return false;
    }

    function isInvalidReparentTarget(drag, target) {
        if (!drag || !target || target.isGeneralization) return true;
        var list = getDragNodeList(drag);
        if (target.isRoot) {
            for (var r = 0; r < list.length; r++) {
                var draggedRoot = list[r];
                if (!draggedRoot) continue;
                if (draggedRoot.isRoot || isSameNode(draggedRoot, target)) return true;
                if (draggedRoot.parent === target) return true;
            }
            return false;
        }
        for (var i = 0; i < list.length; i++) {
            var dn = list[i];
            if (!dn) continue;
            if (isSameNode(dn, target)) return true;
            if (dn.parent === target) return true;
            if (isDescendantOf(dn, target)) return true;
        }
        return false;
    }

    function getReparentHintLabel(target) {
        return (target && target.isRoot) ? REPART_HINT.rootLabel : REPART_HINT.label;
    }

    function measureHintLabelWidth(label) {
        return (label ? label.length : 0) * 12 + 16;
    }

    function applyHintLabel(hint, targetRect, target, boxTop) {
        if (!hint.labelText || !hint.labelBg || !targetRect || !target) return;
        var label = getReparentHintLabel(target);
        var labelY = boxTop - 10;
        var textWidth = measureHintLabelWidth(label);
        var textHeight = 22;
        var labelX = targetRect.cx - textWidth / 2;
        if (hint._tcHintLabel !== label) {
            try {
                if (typeof hint.labelText.text === 'function') {
                    hint.labelText.text(label);
                } else if (typeof hint.labelText.clear === 'function') {
                    hint.labelText.clear();
                    hint.labelText.text(function (add) { add.tspan(label); });
                }
            } catch (eLabel) { /* ignore */ }
            hint._tcHintLabel = label;
        }
        hint.labelBg.move(labelX, labelY - textHeight).size(textWidth, textHeight).opacity(1);
        hint.labelText.move(targetRect.cx, labelY - textHeight / 2 - 1).opacity(1);
    }

    function walkAllNodes(root, cb) {
        if (!root || typeof cb !== 'function') return;
        var stack = [root];
        while (stack.length) {
            var node = stack.pop();
            if (!node) continue;
            cb(node);
            var children = node.children || [];
            for (var i = children.length - 1; i >= 0; i--) stack.push(children[i]);
        }
    }

    function findNodeByUid(smm, uid) {
        if (!smm || !uid) return null;
        var root = smm.renderer && smm.renderer.root;
        if (!root) return null;
        var found = null;
        walkAllNodes(root, function (node) {
            if (found) return;
            if (node.uid === uid || (node.getData && node.getData('uid') === uid)) found = node;
        });
        return found;
    }

    function pointInExpandedRect(p, rect, pad) {
        return p.x >= rect.left - pad && p.x <= rect.right + pad &&
            p.y >= rect.top - pad && p.y <= rect.bottom + pad;
    }

    function findReparentTargetByPointer(smm, drag) {
        return findReparentTargetByCanvasPointer(smm, drag);
    }

    function stageReparentTarget(drag, target) {
        if (!drag || !target) return false;
        drag._tcReparentTarget = target;
        drag._tcReparentTargetUid = getNodeUid(target);
        return true;
    }

    function commitReparentOverlapState(drag, target) {
        if (!stageReparentTarget(drag, target)) return false;
        drag.overlapNode = target;
        drag.prevNode = null;
        drag.nextNode = null;
        return true;
    }

    function captureDragStartSnapshot(drag, smm) {
        if (!drag) return;
        var list = getDragNodeList(drag);
        if (!list.length && drag.mousedownNode) list = [drag.mousedownNode];
        drag._tcDragStartSnapshot = list.map(function (node) {
            if (!node) return null;
            return {
                node: node,
                left: node._left != null ? node._left : node.left,
                top: node._top != null ? node._top : node.top,
                customLeft: node.customLeft,
                customTop: node.customTop
            };
        }).filter(function (item) { return !!item; });
        if (smm && drag._tcDragStartSnapshot && drag._tcDragStartSnapshot.length) {
            smm._tcWorkbenchDragSnapshot = drag._tcDragStartSnapshot.map(function (item) {
                return {
                    node: item.node,
                    left: item.left,
                    top: item.top,
                    customLeft: item.customLeft,
                    customTop: item.customTop
                };
            });
        }
    }

    function clearDragStartSnapshot(drag, smm) {
        if (drag) drag._tcDragStartSnapshot = null;
        if (smm) smm._tcWorkbenchDragSnapshot = null;
    }

    function hadStructuralDragResult(info, movedByFallback) {
        if (movedByFallback) return true;
        if (!info) return false;
        return !!(info.overlapNodeUid || info.prevNodeUid || info.nextNodeUid);
    }

    function hadReparentIntentAtDrop(drag, smm) {
        if (!drag) return false;
        if (drag._tcPendingReparentUid || drag._tcStickyDropTarget || drag._tcReparentTarget) return true;
        var hint = smm && smm._tcReparentHint;
        return !!(hint && hint.targetUid);
    }

    function shouldRestoreAfterCancelledDrag(smm, info, drag, movedByFallback) {
        if (!smm || !drag || !smm.opt || !smm.opt.enableFreeDrag) return false;
        if (hadStructuralDragResult(info, movedByFallback)) return false;
        return !!(drag._tcDragStartSnapshot && drag._tcDragStartSnapshot.length);
    }

    function getDragEndMovedList(drag) {
        if (!drag) return [];
        if (drag.beingDragNodeList && drag.beingDragNodeList.length) {
            return drag.beingDragNodeList.slice();
        }
        return getDragNodeList(drag).slice();
    }

    function temporarilySuppressWorkbenchFreeDragPosition(smm, drag) {
        if (!smm || !smm.opt || !smm.opt.enableFreeDrag || !drag) return null;
        if (!hasPassedDragOffset(drag) && !drag.isDragging) return null;
        if (!drag._tcDragStartSnapshot || !drag._tcDragStartSnapshot.length) {
            captureDragStartSnapshot(drag, smm);
        }
        if (!drag._tcDragStartSnapshot || !drag._tcDragStartSnapshot.length) return null;
        drag._tcSuppressingFreeDragDrop = true;
        var saved = smm.opt.enableFreeDrag;
        smm.opt.enableFreeDrag = false;
        return saved;
    }

    function restoreFreeDragOpt(smm, drag, saved) {
        if (drag) drag._tcSuppressingFreeDragDrop = false;
        if (smm && smm.opt && saved != null) smm.opt.enableFreeDrag = saved;
    }

    function shouldSettleWorkbenchDrag(drag) {
        if (!drag || !drag._tcDragStartSnapshot || !drag._tcDragStartSnapshot.length) return false;
        if (hasPassedDragOffset(drag) || drag.isDragging) return true;
        var list = getDragNodeList(drag);
        if (drag.mousedownNode && list.indexOf(drag.mousedownNode) < 0) {
            list = list.concat([drag.mousedownNode]);
        }
        for (var i = 0; i < list.length; i++) {
            var node = list[i];
            if (!node) continue;
            if (node.customLeft != null || node.customTop != null) return true;
        }
        return false;
    }

    function attemptWorkbenchReparentMove(smm, drag, info) {
        if (commitQuickDropReparentIfNeeded(smm, drag, info)) return true;
        return tryFallbackReparentMove(smm, drag, info);
    }

    function settleWorkbenchDragAfterDrop(smm, drag, info) {
        if (!smm || !drag || drag._tcDragSettled) return;
        drag._tcDragSettled = true;
        if (!drag._tcPendingReparentUid && hadReparentIntentAtDrop(drag, smm)) {
            var lateTarget = resolveDropReparentTarget(smm, drag);
            if (lateTarget && !isInvalidReparentTarget(drag, lateTarget)) {
                commitReparentOverlapState(drag, lateTarget);
                drag._tcPendingReparentUid = drag._tcReparentTargetUid || null;
            }
        }
        var oldParent = drag._tcReparentOldParent;
        var movedList = getDragEndMovedList(drag);
        var movedByFallback = attemptWorkbenchReparentMove(smm, drag, info);
        if (hadStructuralDragResult(info, movedByFallback) || drag._tcReparentMoveApplied) {
            if (movedList.length) {
                repairReparentLineArtifacts(smm, movedList, oldParent);
            } else if (drag._tcReparentMovedUid) {
                repairReparentLineArtifacts(smm, [], oldParent);
            }
            schedulePostReparentLineRepair(smm, drag);
            clearDragStartSnapshot(drag, smm);
            return;
        }
        restoreCancelledFreeDrag(smm, drag);
        enforceWorkbenchDragCancelSafetyNet(smm, drag, info, movedByFallback);
    }

    function resetDraggedNodeVisualState(node) {
        if (!node) return;
        try {
            if (typeof node.setOpacity === 'function') node.setOpacity(1);
            if (typeof node.showChildren === 'function') node.showChildren();
            if (typeof node.endDrag === 'function') node.endDrag();
            if (typeof node.show === 'function') node.show();
            if (node.group && typeof node.group.opacity === 'function') node.group.opacity(1);
            if (node.group && typeof node.group.show === 'function') node.group.show();
        } catch (eVis) { /* ignore */ }
    }

    function getNodesNeedingVisualReset(drag, snapshot) {
        var nodes = [];
        function pushNode(node) {
            if (!node || nodes.indexOf(node) >= 0) return;
            nodes.push(node);
        }
        if (snapshot && snapshot.length) {
            for (var si = 0; si < snapshot.length; si++) {
                pushNode(snapshot[si] && snapshot[si].node);
            }
        }
        if (drag) {
            var dragList = getDragNodeList(drag);
            for (var di = 0; di < dragList.length; di++) pushNode(dragList[di]);
            pushNode(drag.mousedownNode);
            if (drag.beingDragNodeList && drag.beingDragNodeList.length) {
                for (var bi = 0; bi < drag.beingDragNodeList.length; bi++) {
                    pushNode(drag.beingDragNodeList[bi]);
                }
            }
        }
        return nodes;
    }

    function rebuildNodeLinesFromScratch(node) {
        if (!node) return;
        try {
            if (typeof node.removeLine === 'function') node.removeLine();
            else trimNodeLineCache(node);
            if (typeof node.renderLine === 'function') node.renderLine(true);
        } catch (eLine) { /* ignore */ }
    }

    function cleanupDragOverlayArtifacts(smm) {
        try {
            var dragObj = smm && smm.drag;
            if (!dragObj) return;
            if (typeof dragObj.removeExtraLines === 'function') dragObj.removeExtraLines();
            if (dragObj.placeHolderLine && typeof dragObj.placeHolderLine.hide === 'function') {
                dragObj.placeHolderLine.hide();
            }
            if (dragObj.placeholder && typeof dragObj.placeholder.size === 'function') {
                dragObj.placeholder.size(0, 0);
            }
        } catch (eExtra) { /* ignore */ }
    }

    function isWorkbenchSmmRenderReady(smm) {
        if (!smm || !smm.el || !smm.renderer) return false;
        try {
            return document.body.contains(smm.el);
        } catch (eDom) { return false; }
    }

    function refreshWorkbenchMindmapLayout(smm) {
        if (!isWorkbenchSmmRenderReady(smm)) return;
        try {
            if (typeof smm.render === 'function') smm.render();
        } catch (eRender) { /* ignore */ }
    }

    function resetWorkbenchDraggedNodesLayout(smm, snapshot, drag) {
        if (!smm || !snapshot || !snapshot.length) return;
        var dragRef = drag || smm.drag;
        var visualNodes = getNodesNeedingVisualReset(dragRef, snapshot);
        for (var v = 0; v < visualNodes.length; v++) {
            resetDraggedNodeVisualState(visualNodes[v]);
        }
        for (var i = 0; i < snapshot.length; i++) {
            var item = snapshot[i];
            if (!item || !item.node) continue;
            clearSubtreeCustomPositions(smm, item.node);
        }
        cleanupDragOverlayArtifacts(smm);
        clearReparentHint(smm);
        refreshWorkbenchMindmapLayout(smm);
    }

    function purgeAndRefreshNodeLines(node) {
        if (!node) return;
        trimNodeLineCache(node);
        refreshNodeLines(node, true);
    }

    function repairCancelledFreeDragLines(smm, snapshot, drag) {
        resetWorkbenchDraggedNodesLayout(smm, snapshot, drag);
    }

    function getWorkbenchDragSnapshot(smm, drag) {
        if (drag && drag._tcDragStartSnapshot && drag._tcDragStartSnapshot.length) {
            return drag._tcDragStartSnapshot;
        }
        if (smm && smm._tcWorkbenchDragSnapshot && smm._tcWorkbenchDragSnapshot.length) {
            return smm._tcWorkbenchDragSnapshot;
        }
        return null;
    }

    function nodeDriftedFromSnapshot(item) {
        if (!item || !item.node) return false;
        var node = item.node;
        return node.customLeft != null || node.customTop != null;
    }

    function enforceWorkbenchDragCancelSafetyNet(smm, drag, info, movedByFallback) {
        if (!smm) return false;
        if (hadStructuralDragResult(info, movedByFallback) || (drag && drag._tcReparentMoveApplied)) {
            return false;
        }
        var snapshot = getWorkbenchDragSnapshot(smm, drag);
        if (!snapshot || !snapshot.length) return false;
        var drifted = false;
        for (var i = 0; i < snapshot.length; i++) {
            if (nodeDriftedFromSnapshot(snapshot[i])) {
                drifted = true;
                break;
            }
        }
        if (!drifted) return false;
        repairCancelledFreeDragLines(smm, snapshot, drag);
        clearDragStartSnapshot(drag, smm);
        return true;
    }

    function restoreCancelledFreeDrag(smm, drag) {
        var snapshot = getWorkbenchDragSnapshot(smm, drag);
        if (!snapshot || !snapshot.length) return false;
        repairCancelledFreeDragLines(smm, snapshot, drag);
        clearDragStartSnapshot(drag, smm);
        return true;
    }

    function clearStickyDropTarget(drag) {
        if (drag) drag._tcStickyDropTarget = null;
    }

    function clearReparentOverlapState(drag) {
        if (!drag) return;
        drag._tcReparentTarget = null;
        drag._tcReparentTargetUid = null;
        drag._tcReparentOldParent = null;
    }

    function captureReparentOldParent(drag) {
        var list = getDragNodeList(drag);
        if (!drag || !list.length) return null;
        var dn = list[0];
        drag._tcReparentOldParent = dn && dn.parent ? dn.parent : null;
        drag._tcReparentOldParentUid = drag._tcReparentOldParent ? getNodeUid(drag._tcReparentOldParent) : null;
        drag._tcReparentMovedUid = dn ? getNodeUid(dn) : null;
        return drag._tcReparentOldParent;
    }

    function resolveReparentOldParent(smm, drag) {
        if (!drag) return null;
        if (drag._tcReparentOldParent) return drag._tcReparentOldParent;
        if (drag._tcReparentOldParentUid && smm) {
            return findNodeByUid(smm, drag._tcReparentOldParentUid);
        }
        return null;
    }

    function getReparentHintState(smm) {
        if (!smm._tcReparentHint) {
            smm._tcReparentHint = {
                targetUid: null,
                highlightRect: null,
                connectorLine: null,
                labelBg: null,
                labelText: null
            };
        }
        return smm._tcReparentHint;
    }

    function ensureReparentHintElements(smm) {
        var hint = getReparentHintState(smm);
        if (hint.highlightRect || !smm || !smm.otherDraw) return hint;
        try {
            hint.highlightRect = smm.otherDraw.rect()
                .fill({ color: REPART_HINT.fill })
                .stroke({ color: REPART_HINT.stroke, width: REPART_HINT.lineWidth, dasharray: '7,4' })
                .radius(8)
                .opacity(0);
            hint.connectorLine = smm.otherDraw.path()
                .stroke({ color: REPART_HINT.stroke, width: REPART_HINT.lineWidth, dasharray: '6,5' })
                .fill({ color: 'none' })
                .opacity(0);
            hint.labelBg = smm.otherDraw.rect()
                .fill({ color: 'rgba(255, 255, 255, 0.96)' })
                .stroke({ color: REPART_HINT.stroke, width: 1 })
                .radius(4)
                .opacity(0);
            hint.labelText = smm.otherDraw.text(function (add) {
                add.tspan(REPART_HINT.label);
            }).font({
                size: 12,
                weight: 600,
                family: 'Microsoft YaHei, PingFang SC, sans-serif'
            }).fill({ color: REPART_HINT.stroke }).opacity(0);
            var layers = [hint.highlightRect, hint.connectorLine, hint.labelBg, hint.labelText];
            for (var i = 0; i < layers.length; i++) {
                if (layers[i] && typeof layers[i].css === 'function') {
                    layers[i].css('pointer-events', 'none');
                    layers[i].css('z-index', 100000);
                }
            }
            if (typeof smm.otherDraw.front === 'function') smm.otherDraw.front();
        } catch (e) { /* ignore */ }
        return hint;
    }

    function hideReparentHintVisuals(hint) {
        if (!hint) return;
        var layers = [hint.highlightRect, hint.connectorLine, hint.labelBg, hint.labelText];
        for (var i = 0; i < layers.length; i++) {
            if (layers[i] && typeof layers[i].opacity === 'function') layers[i].opacity(0);
        }
        hint.targetUid = null;
    }

    function clearReparentHint(smm) {
        if (!smm || !smm._tcReparentHint) return;
        hideReparentHintVisuals(smm._tcReparentHint);
        if (smm.drag) clearStickyDropTarget(smm.drag);
    }

    function updateReparentHint(smm, drag, target) {
        if (!smm || !drag || !target) {
            clearReparentHint(smm);
            return;
        }
        var hint = getReparentHintState(smm);
        var anchor = getCloneAnchor(drag);
        var targetRect = getNodeRect(target);
        var targetUid = getNodeUid(target);
        if (hint.targetUid === targetUid && hint.highlightRect) {
            hint.highlightRect.opacity(1);
            if (anchor && targetRect && hint.connectorLine) {
                hint.connectorLine.plot(
                    'M ' + anchor.x + ' ' + anchor.y + ' L ' + targetRect.cx + ' ' + targetRect.cy
                ).opacity(0.9);
            }
            if (hint.labelText && hint.labelBg) {
                applyHintLabel(hint, targetRect, target, target.top - REPART_HINT.pad);
            }
            return;
        }
        hint = ensureReparentHintElements(smm);
        if (!hint.highlightRect || !targetRect) return;

        var pad = REPART_HINT.pad;
        var left = target.left - pad;
        var top = target.top - pad;
        var width = target.width + pad * 2;
        var height = target.height + pad * 2;

        hint.highlightRect.move(left, top).size(width, height).opacity(1);

        if (anchor && hint.connectorLine) {
            hint.connectorLine.plot(
                'M ' + anchor.x + ' ' + anchor.y + ' L ' + targetRect.cx + ' ' + targetRect.cy
            ).opacity(0.9);
        }

        applyHintLabel(hint, targetRect, target, top);

        hint.targetUid = targetUid;
    }

    function hidePlaceholderVisuals(drag) {
        if (!drag) return;
        try {
            if (drag.placeholder && typeof drag.placeholder.size === 'function') drag.placeholder.size(0, 0);
            if (drag.placeHolderLine && typeof drag.placeHolderLine.hide === 'function') drag.placeHolderLine.hide();
            if (typeof drag.removeExtraLines === 'function') drag.removeExtraLines();
        } catch (e) { /* ignore */ }
    }

    function resolveWorkbenchReparentTarget(smm, drag) {
        var nativeTarget = getNativeReparentTarget(drag);
        if (nativeTarget && !isInvalidReparentTarget(drag, nativeTarget)) return nativeTarget;
        var canvasTarget = findReparentTargetByCanvasPointer(smm, drag);
        if (canvasTarget) return canvasTarget;
        if (drag.overlapNode && !drag.prevNode && !drag.nextNode && !isInvalidReparentTarget(drag, drag.overlapNode)) {
            return drag.overlapNode;
        }
        return null;
    }

    function resolveDropReparentTarget(smm, drag) {
        var live = resolveWorkbenchReparentTarget(smm, drag);
        if (live && !isInvalidReparentTarget(drag, live)) return live;
        var sticky = drag && drag._tcStickyDropTarget;
        if (sticky && !isInvalidReparentTarget(drag, sticky)) return sticky;
        if (drag && drag._tcReparentTarget && !isInvalidReparentTarget(drag, drag._tcReparentTarget)) {
            return drag._tcReparentTarget;
        }
        var hintUid = smm && smm._tcReparentHint && smm._tcReparentHint.targetUid;
        if (hintUid) {
            var byHint = findNodeByUid(smm, hintUid);
            if (byHint && !isInvalidReparentTarget(drag, byHint)) return byHint;
        }
        return null;
    }

    function syncNativeOverlapBeforeDrop(drag) {
        if (!drag || typeof drag._tcOrigCheckOverlapNode !== 'function') return;
        try {
            drag._tcOrigCheckOverlapNode.call(drag);
        } catch (eSync) { /* ignore */ }
    }

    function syncReparentHintVisual(smm, drag, target) {
        if (!target) return;
        stageReparentTarget(drag, target);
        drag._tcStickyDropTarget = target;
        updateReparentHint(smm, drag, target);
        hidePlaceholderVisuals(drag);
    }

    function cancelScheduledFastReparentUi(drag) {
        if (!drag || !drag._tcFastReparentUiRaf) return;
        window.cancelAnimationFrame(drag._tcFastReparentUiRaf);
        drag._tcFastReparentUiRaf = 0;
    }

    function refreshReparentHintFromNativeOverlap(smm, drag) {
        if (!isSingleFreeDrag(smm, drag)) return null;
        var overlap = getNativeReparentTarget(drag);
        if (!overlap || isInvalidReparentTarget(drag, overlap)) return null;
        syncReparentHintVisual(smm, drag, overlap);
        return overlap;
    }

    function applyFastReparentUi(smm, drag) {
        var nativeOverlap = refreshReparentHintFromNativeOverlap(smm, drag);
        if (nativeOverlap) return nativeOverlap;
        if (!isSingleFreeDrag(smm, drag)) {
            clearReparentOverlapState(drag);
            clearReparentHint(smm);
            return null;
        }
        if ((drag.prevNode || drag.nextNode) && !drag.overlapNode) {
            clearReparentOverlapState(drag);
            clearReparentHint(smm);
            return null;
        }
        var target = resolveWorkbenchReparentTarget(smm, drag);
        if (target) {
            syncReparentHintVisual(smm, drag, target);
            return target;
        }
        clearReparentOverlapState(drag);
        if (!getNativeReparentTarget(drag)) clearReparentHint(smm);
        return null;
    }

    function finalizeReparentBeforeDrop(smm, drag) {
        if (!smm || !drag || !smm.opt || !smm.opt.enableFreeDrag) return null;
        if (!getSingleDraggedNode(drag) || !hasPassedDragOffset(drag)) return null;
        captureReparentOldParent(drag);
        syncNativeOverlapBeforeDrop(drag);
        var target = resolveDropReparentTarget(smm, drag);
        if (target && !isInvalidReparentTarget(drag, target)) {
            commitReparentOverlapState(drag, target);
            updateReparentHint(smm, drag, target);
            drag._tcPendingReparentUid = drag._tcReparentTargetUid || null;
            return target;
        }
        drag._tcPendingReparentUid = null;
        return null;
    }

    function commitQuickDropReparentIfNeeded(smm, drag, info) {
        if (!smm || !drag || !drag._tcPendingReparentUid) return false;
        if (drag._tcReparentMoveApplied) return false;
        if (info && info.overlapNodeUid) return false;
        var list = drag.beingDragNodeList && drag.beingDragNodeList.length
            ? drag.beingDragNodeList
            : getDragNodeList(drag);
        if (!list.length) return false;
        var target = drag._tcReparentTarget || drag._tcStickyDropTarget ||
            findNodeByUid(smm, drag._tcPendingReparentUid);
        if (!target || isInvalidReparentTarget(drag, target)) return false;
        if (list[0].parent === target) return false;
        try {
            prepareNodesBeforeWorkbenchReparent(smm, drag);
            smm.execCommand('MOVE_NODE_TO', list, target);
            drag._tcReparentMoveApplied = true;
            return true;
        } catch (eQuick) {
            return false;
        }
    }

    function walkNodeSubtree(node, cb) {
        if (!node || typeof cb !== 'function') return;
        cb(node);
        var children = node.children || [];
        for (var i = 0; i < children.length; i++) {
            walkNodeSubtree(children[i], cb);
        }
    }

    function collectAncestorChain(node) {
        var chain = [];
        var current = node;
        while (current) {
            chain.push(current);
            current = current.parent;
        }
        return chain;
    }

    function pushUniqueNode(list, node) {
        if (!node || list.indexOf(node) >= 0) return;
        list.push(node);
    }

    function clearSubtreeCustomPositions(smm, node) {
        if (!smm || !node) return;
        walkNodeSubtree(node, function (item) {
            clearNodeCustomPosition(smm, item);
        });
    }

    function prepareNodesBeforeWorkbenchReparent(smm, drag) {
        if (!smm || !drag) return;
        var list = drag.beingDragNodeList && drag.beingDragNodeList.length
            ? drag.beingDragNodeList
            : getDragNodeList(drag);
        for (var i = 0; i < list.length; i++) {
            if (list[i]) clearSubtreeCustomPositions(smm, list[i]);
        }
    }

    function clearNodeCustomPosition(smm, node) {
        if (!smm || !node) return;
        try {
            node.customLeft = undefined;
            node.customTop = undefined;
            if (typeof smm.execCommand === 'function') {
                smm.execCommand('SET_NODE_DATA', node, {
                    customLeft: undefined,
                    customTop: undefined
                });
            }
        } catch (e) { /* ignore */ }
    }

    function trimNodeLineCache(node) {
        if (!node) return;
        try {
            var childCount = typeof node.getChildrenLength === 'function'
                ? node.getChildrenLength()
                : ((node.children && node.children.length) || 0);
            if (node._lines && node._lines.length > childCount) {
                node._lines.slice(childCount).forEach(function (line) {
                    try { if (line && typeof line.remove === 'function') line.remove(); } catch (e1) { /* ignore */ }
                });
                node._lines = node._lines.slice(0, childCount);
            }
        } catch (e) { /* ignore */ }
    }

    function refreshNodeLines(node, deep) {
        if (!node || typeof node.renderLine !== 'function') return;
        try {
            trimNodeLineCache(node);
            node.renderLine(!!deep);
        } catch (e) { /* ignore */ }
    }

    function repairReparentLineArtifacts(smm, movedNodes, oldParent) {
        if (!smm) return;
        var node = movedNodes && movedNodes.length ? movedNodes[0] : null;
        if (!node && smm.drag && smm.drag._tcReparentMovedUid) {
            node = findNodeByUid(smm, smm.drag._tcReparentMovedUid);
        }
        if (!node) return;

        clearSubtreeCustomPositions(smm, node);
        resetDraggedNodeVisualState(node);
        walkNodeSubtree(node, function (item) {
            resetDraggedNodeVisualState(item);
        });

        cleanupDragOverlayArtifacts(smm);
        clearReparentHint(smm);
        refreshWorkbenchMindmapLayout(smm);
    }

    function schedulePostReparentLineRepair(smm, drag) {
        if (!smm || !drag) return;
        var movedUid = drag._tcReparentMovedUid;
        var oldParentUid = drag._tcReparentOldParentUid;
        if (!movedUid) return;
        window.requestAnimationFrame(function () {
            try {
                var moved = findNodeByUid(smm, movedUid);
                var oldParentNode = oldParentUid ? findNodeByUid(smm, oldParentUid) : null;
                if (moved) repairReparentLineArtifacts(smm, [moved], oldParentNode);
            } catch (ePost) { /* ignore */ }
        });
    }

    function didReparentOccur(info, movedByFallback) {
        return !!(movedByFallback || (info && info.overlapNodeUid));
    }

    function tryFallbackReparentMove(smm, drag, info) {
        if (!smm || !drag || !drag._tcPendingReparentUid) return false;
        if (info && info.overlapNodeUid) return false;
        if (drag._tcReparentMoveApplied) return false;
        var list = drag.beingDragNodeList && drag.beingDragNodeList.length
            ? drag.beingDragNodeList
            : getDragNodeList(drag);
        if (!list.length) return false;
        var target = drag._tcReparentTarget || drag._tcStickyDropTarget ||
            findNodeByUid(smm, drag._tcPendingReparentUid);
        if (!target || isInvalidReparentTarget(drag, target)) return false;
        if (list[0].parent === target) return false;
        try {
            prepareNodesBeforeWorkbenchReparent(smm, drag);
            smm.execCommand('MOVE_NODE_TO', list, target);
            drag._tcReparentMoveApplied = true;
            return true;
        } catch (e) {
            return false;
        }
    }

    function forceCleanupDragArtifacts(smm) {
        if (!smm) return;
        clearReparentHint(smm);
        var drag = smm.drag;
        if (!drag) return;
        if (drag.beingDragNodeList && drag.beingDragNodeList.length) {
            for (var fi = 0; fi < drag.beingDragNodeList.length; fi++) {
                resetDraggedNodeVisualState(drag.beingDragNodeList[fi]);
            }
        }
        resetDraggedNodeVisualState(drag.mousedownNode);
        cancelScheduledFastReparentUi(drag);
        clearReparentOverlapState(drag);
        drag._tcPendingReparentUid = null;
        drag._tcReparentMoveApplied = false;
        clearStickyDropTarget(drag);
        clearDragStartSnapshot(drag, smm);
        try {
            if (typeof drag.removeExtraLines === 'function') drag.removeExtraLines();
            if (drag.placeHolderLine && typeof drag.placeHolderLine.hide === 'function') drag.placeHolderLine.hide();
            if (drag.placeholder && typeof drag.placeholder.size === 'function') drag.placeholder.size(0, 0);
            if (drag.clone && typeof drag.removeCloneNode === 'function') drag.removeCloneNode();
        } catch (e) { /* ignore */ }
    }

    function runFastReparentUi(smm, drag) {
        applyFastReparentUi(smm, drag);
    }

    function patchDragRemoveCloneGuard(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchRemoveCloneGuard) return;
        drag._tcWorkbenchRemoveCloneGuard = true;
        var origRemoveClone = drag.removeCloneNode && drag.removeCloneNode.bind(drag);
        if (!origRemoveClone) return;
        drag.removeCloneNode = function () {
            origRemoveClone();
            this.clone = null;
            this.placeholder = null;
            this.placeHolderLine = null;
        };
    }

    function patchWorkbenchBeforeDragEnd(smm) {
        if (!smm || smm._tcWorkbenchBeforeDragEnd) return;
        smm._tcWorkbenchBeforeDragEnd = true;
        var origBeforeDragEnd = smm.opt.beforeDragEnd;
        smm.opt.beforeDragEnd = async function (info) {
            var drag = smm.drag;
            if (drag && drag._tcSuppressingFreeDragDrop) {
                if (!drag._tcPendingReparentUid) {
                    drag.overlapNode = null;
                    drag.prevNode = null;
                    drag.nextNode = null;
                } else if (drag._tcReparentTarget) {
                    prepareNodesBeforeWorkbenchReparent(smm, drag);
                    drag.overlapNode = drag._tcReparentTarget;
                    drag.prevNode = null;
                    drag.nextNode = null;
                }
            }
            if (typeof origBeforeDragEnd === 'function') {
                return await origBeforeDragEnd(info);
            }
        };
    }

    function patchDragPlaceholderVisualGuard(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchPlaceholderVisualGuard) return;
        drag._tcWorkbenchPlaceholderVisualGuard = true;
        var origSet = drag.setPlaceholderRect && drag.setPlaceholderRect.bind(drag);
        if (!origSet) return;
        drag.setPlaceholderRect = function (opts) {
            var res = origSet(opts);
            if (isSingleFreeDrag(smm, drag)) hidePlaceholderVisuals(drag);
            return res;
        };
    }

    function patchDragFastReparentUi(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchFastReparentUi) return;
        drag._tcWorkbenchFastReparentUi = true;
        var origOnMove = drag.onMove && drag.onMove.bind(drag);
        if (!origOnMove) return;
        drag.onMove = function (x, y, e) {
            drag.mouseMoveX = x;
            drag.mouseMoveY = y;
            var res = origOnMove(x, y, e);
            runFastReparentUi(smm, drag);
            return res;
        };
    }

    function patchDragMousemoveReparent(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchMousemoveReparent) return;
        drag._tcWorkbenchMousemoveReparent = true;
        var origMousemove = drag.onMousemove && drag.onMousemove.bind(drag);
        if (!origMousemove) return;
        drag.onMousemove = function (e) {
            var res = origMousemove(e);
            if (!smm.opt || !smm.opt.enableFreeDrag || !drag.isMousedown) return res;
            if (!drag.isDragging && !hasPassedDragOffset(drag)) return res;
            runFastReparentUi(smm, drag);
            return res;
        };
    }

    function patchDragPrewarmReparent(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchPrewarmReparent) return;
        drag._tcWorkbenchPrewarmReparent = true;
        var origHandleStartMove = drag.handleStartMove && drag.handleStartMove.bind(drag);
        if (!origHandleStartMove) return;
        drag.handleStartMove = async function () {
            if (!drag.isDragging && smm.opt && smm.opt.enableFreeDrag) {
                ensureReparentHintElements(smm);
                refreshReparentNodeCache(smm);
            }
            await origHandleStartMove();
            captureDragStartSnapshot(drag, smm);
            runFastReparentUi(smm, drag);
        };
        var origMousedown = drag.onNodeMousedown && drag.onNodeMousedown.bind(drag);
        if (origMousedown) {
            drag.onNodeMousedown = function (node, e) {
                drag._tcDragSettled = false;
                var res = origMousedown(node, e);
                if (smm.opt && smm.opt.enableFreeDrag) {
                    smm._tcReparentNodeCache = null;
                    captureDragStartSnapshot(drag, smm);
                }
                return res;
            };
        }
    }

    function patchDragFinalizeReparent(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchFinalizeReparent) return;
        drag._tcWorkbenchFinalizeReparent = true;
        var origMouseup = drag.onMouseup && drag.onMouseup.bind(drag);
        if (!origMouseup) return;
        drag.onMouseup = async function (e) {
            cancelScheduledFastReparentUi(drag);
            drag._tcReparentMoveApplied = false;
            finalizeReparentBeforeDrop(smm, drag);
            var savedFreeDrag = temporarilySuppressWorkbenchFreeDragPosition(smm, drag);
            var res = await origMouseup(e);
            if (shouldSettleWorkbenchDrag(drag)) {
                settleWorkbenchDragAfterDrop(smm, drag, null);
            }
            enforceWorkbenchDragCancelSafetyNet(smm, drag, null, false);
            restoreFreeDragOpt(smm, drag, savedFreeDrag);
            forceCleanupDragArtifacts(smm);
            schedulePostDragRender(smm);
            return res;
        };
    }

    function patchDragProximityReparent(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchProximityReparent) return;
        drag._tcWorkbenchProximityReparent = true;
        var origCheck = drag.checkOverlapNode && drag.checkOverlapNode.bind(drag);
        if (!origCheck) return;
        drag._tcOrigCheckOverlapNode = origCheck;
        drag.checkOverlapNode = function () {
            origCheck.apply(drag, arguments);
            if (!isSingleFreeDrag(smm, drag)) return;
            var target = resolveWorkbenchReparentTarget(smm, drag);
            if (target) {
                syncReparentHintVisual(smm, drag, target);
            } else if (!getNativeReparentTarget(drag) && !drag._tcReparentTarget) {
                clearReparentHint(smm);
            }
        };
    }

    function schedulePostDragRender(smm) {
        if (!smm || typeof smm.render !== 'function') return;
        window.requestAnimationFrame(function () {
            try {
                var drag = smm.drag;
                enforceWorkbenchDragCancelSafetyNet(smm, drag, null, false);
                refreshWorkbenchMindmapLayout(smm);
            } catch (e) { /* ignore */ }
        });
    }

    function bind(smm) {
        if (!smm || isBound(smm)) return true;
        markBound(smm);
        patchDragRemoveCloneGuard(smm);
        patchWorkbenchBeforeDragEnd(smm);
        patchDragPlaceholderVisualGuard(smm);
        patchDragFastReparentUi(smm);
        patchDragMousemoveReparent(smm);
        patchDragPrewarmReparent(smm);
        patchDragFinalizeReparent(smm);
        patchDragProximityReparent(smm);
        smm.on('node_dragend', function (info) {
            var drag = smm.drag;
            if (!drag || drag._tcDragSettled) {
                forceCleanupDragArtifacts(smm);
                return;
            }
            settleWorkbenchDragAfterDrop(smm, drag, info);
            forceCleanupDragArtifacts(smm);
            schedulePostDragRender(smm);
        });
        return true;
    }

    global.TcSmmWorkbenchDragGuard = {
        bind: bind,
        forceCleanupDragArtifacts: forceCleanupDragArtifacts,
        findReparentTargetByPointer: findReparentTargetByPointer,
        clearReparentHint: clearReparentHint,
        applyFastReparentUi: applyFastReparentUi,
        finalizeReparentBeforeDrop: finalizeReparentBeforeDrop,
        repairReparentLineArtifacts: repairReparentLineArtifacts,
        restoreCancelledFreeDrag: restoreCancelledFreeDrag,
        shouldRestoreAfterCancelledDrag: shouldRestoreAfterCancelledDrag,
        commitQuickDropReparentIfNeeded: commitQuickDropReparentIfNeeded,
        settleWorkbenchDragAfterDrop: settleWorkbenchDragAfterDrop
    };
})(typeof window !== 'undefined' ? window : this);
