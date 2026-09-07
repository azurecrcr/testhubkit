/**
 * TestHub — Simple Mind Map 编辑器（替换 jsMind 渲染层）
 */
(function (global) {
    'use strict';

    var _showApplyLock = false;
    var _showPendingMindData = null;
    var _showApplyRaf = null;

    var state = {
        smm: null,
        facade: null,
        zoom: 1,
        dataBound: false,
        suppressExternalMindClear: false,
        ctxMenuBridgeBound: false,
        smmApplyToken: 0
    };

    function getMindMapCtor() {
        if (!global.simpleMindMap) return null;
        return global.simpleMindMap.default || global.simpleMindMap.MindMap || global.simpleMindMap;
    }

    function tcSmmIsContainerSized(el) {
        if (global.TcSmmCanvasShell && typeof global.TcSmmCanvasShell.isContainerSized === 'function') {
            return global.TcSmmCanvasShell.isContainerSized(el);
        }
        if (!el) return false;
        var w = el.offsetWidth || el.clientWidth;
        var h = el.offsetHeight || el.clientHeight;
        return w > 0 && h > 0;
    }

    function tcSmmPrepareContainerForInit(el) {
        if (global.TcSmmCanvasShell && typeof global.TcSmmCanvasShell.prepareContainerForInit === 'function') {
            return global.TcSmmCanvasShell.prepareContainerForInit(el);
        }
        return tcSmmIsContainerSized(el);
    }

    function tcSmmGetZoomStepDelta() {
        if (global.TcSmmCanvasShell && typeof global.TcSmmCanvasShell.getZoomStepDelta === 'function') {
            return global.TcSmmCanvasShell.getZoomStepDelta();
        }
        return 0.12;
    }

    function tcSmmGetZoomRatioDefaults() {
        if (global.TcSmmCanvasShell && typeof global.TcSmmCanvasShell.getZoomMinRatioDefault === 'function') {
            return {
                minRatio: global.TcSmmCanvasShell.getZoomMinRatioDefault(),
                maxRatio: global.TcSmmCanvasShell.getZoomMaxRatioDefault()
            };
        }
        return { minRatio: 20, maxRatio: 400 };
    }

    function tcSmmBuildMindMapOptions(el, hooks) {
        if (global.TcSmmCanvasShell && typeof global.TcSmmCanvasShell.buildMindMapCtorOptions === 'function') {
            return global.TcSmmCanvasShell.buildMindMapCtorOptions(el, hooks);
        }
        return { el: el, data: hooks && hooks.resolveInitialData ? hooks.resolveInitialData() : null };
    }

    function isMindmapPanelTarget(target) {
        if (!target) return false;
        if (target === document.body) return true;
        var panel = document.getElementById('tc-mindmap-view-panel');
        var container = document.getElementById('tc-smm-container');
        if (panel && (target === panel || panel.contains(target))) return true;
        if (container && container.contains(target)) return true;
        return false;
    }

    function isSmmEditTarget(target) {
        if (!target) return false;
        if (state.smm && state.smm.editNodeClassList) {
            for (var i = 0; i < state.smm.editNodeClassList.length; i++) {
                var cls = state.smm.editNodeClassList[i];
                if (target.classList && target.classList.contains(cls)) return true;
            }
        }
        if (target.closest && (
            target.closest('.smm-node-edit') ||
            target.closest('.smm-text-edit-wrap')
        )) return true;
        return false;
    }

    function tcMindmapShortcutEnableCheck(e) {
        var target = e.target;
        if (isMindmapPanelTarget(target)) return true;
        if (isSmmEditTarget(target)) return true;
        return false;
    }

    function isTcMindmapViewActive() {
        return typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap';
    }

    function tcMindmapShortcutBlockedByOverlay() {
        if (typeof tcAppDialogIsOpen === 'function' && tcAppDialogIsOpen()) return true;
        var appDlg = document.getElementById('tc-app-dialog');
        if (appDlg && !appDlg.classList.contains('hidden')) return true;
        return false;
    }

    function isTcMindmapBlockedInput() {
        if (tcMindmapShortcutBlockedByOverlay()) return true;
        if (!isTcMindmapViewActive()) return true;
        var panel = document.getElementById('tc-mindmap-view-panel');
        if (!panel || panel.classList.contains('hidden')) return true;
        if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) return true;
        var active = document.activeElement;
        if (!active) return false;
        if (isSmmEditTarget(active)) return false;
        if (active.closest) {
            if (active.closest('#edit-modal')) return true;
            if (active.closest('#left-panel')) return true;
            if (active.closest('.tc-table-fab-sheet')) return true;
            if (active.closest('.tc-provenance-panel:not(.hidden)')) return true;
        }
        var tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (active.isContentEditable && !isSmmEditTarget(active)) return true;
        return false;
    }

    function isSmmTextEditing() {
        if (!state.smm || !state.smm.renderer || !state.smm.renderer.textEdit) return false;
        try {
            return state.smm.renderer.textEdit.isShowTextEdit();
        } catch (e) {
            return false;
        }
    }

    function smmCommitTextEdit() {
        if (!state.smm || !state.smm.renderer || !state.smm.renderer.textEdit) return;
        var wasEditing = false;
        try {
            wasEditing = state.smm.renderer.textEdit.isShowTextEdit();
            if (wasEditing) {
                state.smm.renderer.textEdit.hideEditTextBox();
            }
        } catch (e) { /* ignore */ }
        if (wasEditing) {
            syncExternalMindFromFacade();
        }
    }

    function ensureSmmHasActiveNode() {
        if (!state.smm || !state.smm.renderer) return;
        try {
            var list = state.smm.renderer.activeNodeList;
            if (list && list.length) return;
            var root = state.smm.renderer.root;
            if (root) state.smm.execCommand('SET_NODE_ACTIVE', root, true);
        } catch (e) { /* ignore */ }
    }

    function smmExec(cmd) {
        if (!state.smm) return false;
        ensureSmmHasActiveNode();
        try {
            if (cmd === 'INSERT_CHILD_NODE') {
                var activeList = state.smm.renderer && state.smm.renderer.activeNodeList;
                var parent = activeList && activeList.length ? activeList[0] : state.smm.renderer.root;
                if (!parent) return false;
                state.smm.execCommand('SET_NODE_ACTIVE', parent, true);
                state.smm.execCommand('INSERT_CHILD_NODE', true, [parent]);
            } else {
                state.smm.execCommand(cmd);
            }
            syncExternalMindFromFacade();
            return true;
        } catch (e) {
            return false;
        }
    }

    function isRootNode(node) {
        if (!node) return false;
        if (node.isRoot) return true;
        try {
            return node.getData && node.getData('uid') === 'tc_root';
        } catch (e) {
            return false;
        }
    }

    function hasClipboardData() {
        return !!(state.smm && state.smm.renderer && state.smm.renderer.beingCopyData);
    }

    function activateNode(node) {
        if (!state.smm || !node) return false;
        try {
            state.smm.execCommand('SET_NODE_ACTIVE', node, true);
            return true;
        } catch (e) {
            return false;
        }
    }

    function copySelection() {
        if (!state.smm || !state.smm.renderer) return false;
        smmCommitTextEdit();
        try {
            state.smm.renderer.copy();
            return true;
        } catch (e) {
            return false;
        }
    }

    function cutSelection() {
        if (!state.smm || !state.smm.renderer) return false;
        smmCommitTextEdit();
        var activeList = state.smm.renderer.activeNodeList;
        if (activeList && activeList.length && activeList.some(isRootNode)) return false;
        try {
            state.smm.renderer.cut();
            return true;
        } catch (e) {
            return false;
        }
    }

    function pasteToActive() {
        if (!state.smm || !state.smm.renderer || !state.smm.renderer.beingCopyData) return false;
        smmCommitTextEdit();
        ensureSmmHasActiveNode();
        try {
            state.smm.execCommand('PASTE_NODE', state.smm.renderer.beingCopyData);
            return true;
        } catch (e) {
            return false;
        }
    }

    function pasteToRoot() {
        if (!state.smm || !state.smm.renderer || !state.smm.renderer.beingCopyData) return false;
        smmCommitTextEdit();
        try {
            var root = state.smm.renderer.root;
            if (root) state.smm.execCommand('SET_NODE_ACTIVE', root, true);
            state.smm.execCommand('PASTE_NODE', state.smm.renderer.beingCopyData);
            return true;
        } catch (e) {
            return false;
        }
    }

    function selectAllNodes() {
        return smmExec('SELECT_ALL');
    }

    function insertChildNode() {
        smmCommitTextEdit();
        return smmExec('INSERT_CHILD_NODE');
    }

    function insertSiblingNode() {
        smmCommitTextEdit();
        var activeList = state.smm && state.smm.renderer && state.smm.renderer.activeNodeList;
        if (activeList && activeList.length && isRootNode(activeList[0])) return false;
        return smmExec('INSERT_NODE');
    }

    function insertParentNode() {
        smmCommitTextEdit();
        var activeList = state.smm && state.smm.renderer && state.smm.renderer.activeNodeList;
        if (activeList && activeList.length && isRootNode(activeList[0])) return false;
        return smmExec('INSERT_PARENT_NODE');
    }

    function removeActiveNodes() {
        smmCommitTextEdit();
        var activeList = state.smm && state.smm.renderer && state.smm.renderer.activeNodeList;
        if (activeList && activeList.length && activeList.some(isRootNode)) return false;
        return smmExec('REMOVE_NODE');
    }

    function insertAssociativeLine() {
        if (!state.smm) return false;
        smmCommitTextEdit();
        ensureSmmHasActiveNode();
        try {
            if (state.smm.associativeLine &&
                typeof state.smm.associativeLine.createLineFromActiveNode === 'function') {
                state.smm.associativeLine.createLineFromActiveNode();
                return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function insertFreeTopicAt(clientX, clientY) {
        if (!state.smm || !state.smm.renderer) return false;
        smmCommitTextEdit();
        var root = state.smm.renderer.root;
        if (!root) return false;
        try {
            state.smm.execCommand('SET_NODE_ACTIVE', root, true);
            state.smm.execCommand('INSERT_CHILD_NODE', true, [root]);
            var newNode = state.smm.renderer.activeNodeList && state.smm.renderer.activeNodeList[0];
            if (newNode && typeof state.smm.toPos === 'function') {
                var pos = state.smm.toPos(clientX, clientY);
                state.smm.execCommand('SET_NODE_CUSTOM_POSITION', newNode, pos.x, pos.y);
            }
            syncExternalMindFromFacade();
            return true;
        } catch (e) {
            return false;
        }
    }

    function isMindmapNodeDomTarget(target) {
        if (!target || !target.closest) return false;
        return !!(
            target.closest('.smm-node') ||
            target.closest('.smm-hover-node') ||
            target.closest('.smm-text-node-wrap') ||
            target.closest('.smm-expand-btn')
        );
    }

    function walkSmmNodes(node, visit) {
        if (!node) return null;
        if (visit(node) === true) return node;
        var children = node.children;
        if (!children || !children.length) return null;
        for (var i = 0; i < children.length; i++) {
            var found = walkSmmNodes(children[i], visit);
            if (found) return found;
        }
        return null;
    }

    function resolveNodeFromDomTarget(target) {
        if (!state.smm || !state.smm.renderer || !target) return null;
        var el = target.closest && (
            target.closest('.smm-node') ||
            target.closest('.smm-hover-node') ||
            target.closest('.smm-text-node-wrap')
        );
        if (!el) return null;
        var domEl = el.closest ? (el.closest('.smm-node') || el) : el;
        return walkSmmNodes(state.smm.renderer.root, function (node) {
            try {
                return !!(node.group && node.group.node === domEl);
            } catch (e) {
                return false;
            }
        });
    }

    function clearActiveNodeText() {
        if (!state.smm || !state.smm.renderer) return false;
        smmCommitTextEdit();
        var activeList = state.smm.renderer.activeNodeList;
        if (!activeList || !activeList.length) return false;
        if (activeList.some(isRootNode)) return false;
        try {
            activeList.forEach(function (node) {
                state.smm.execCommand('SET_NODE_TEXT', node, ' ', false, true);
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    function bindContextMenuBridge() {
        if (!state.smm || state.ctxMenuBridgeBound) return;
        state.ctxMenuBridgeBound = true;
        state.smm.on('node_contextmenu', function (e, node) {
            if (typeof global.tcMindmapShowContextMenu !== 'function') return;
            if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode !== 'mindmap') return;
            if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) return;
            e.preventDefault();
            e.stopPropagation();
            global._tcMindmapCtxFromNode = true;
            global.tcMindmapShowContextMenu('node', e.clientX, e.clientY, node);
            global.setTimeout(function () { global._tcMindmapCtxFromNode = false; }, 0);
        });
    }


    function smmExtractNodeTree(payload) {
        if (!payload) return null;
        if (payload.root && payload.root.data) return payload.root;
        if (payload.data) return payload;
        return null;
    }

    function tcSmmStripHtmlToPlainText(text) {
        var s = String(text != null ? text : '').replace(/\u200b/g, '').trim();
        if (!s) return ' ';
        if (!/[<&]/.test(s)) return s;
        try {
            var el = document.createElement('div');
            var prev = s;
            el.innerHTML = prev;
            s = String(el.textContent || el.innerText || '').trim();
            for (var i = 0; i < 3 && /[<&]/.test(s) && s !== prev; i++) {
                prev = s;
                el.innerHTML = prev;
                s = String(el.textContent || el.innerText || '').trim();
            }
        } catch (e) { /* keep s */ }
        return s || ' ';
    }


    function tcSmmInstanceAttached(smm) {
        if (!smm || !smm.el) return false;
        var mount = document.getElementById('tc-smm-container');
        if (!mount || mount.classList.contains('hidden')) return false;
        if (smm.el !== mount) return false;
        return document.body.contains(mount);
    }

    function tcSmmCanApplyData(smm) {
        return tcSmmInstanceAttached(smm) && !!(smm.renderer);
    }

    function tcSmmResolveLiveInstance(preferred) {
        if (tcSmmCanApplyData(state.smm)) return state.smm;
        if (tcSmmCanApplyData(preferred)) return preferred;
        return null;
    }

    function tcSmmSafeSetData(smm, root) {
        if (!tcSmmCanApplyData(smm) || !root) return false;
        try {
            smm.setData(root);
            return true;
        } catch (eSet) {
            console.warn('[TestHub] SMM setData failed:', eSet && eSet.message ? eSet.message : eSet);
            return false;
        }
    }

    function tcSmmSafeExecCommand(smm, command) {
        if (!tcSmmCanApplyData(smm)) return false;
        try {
            smm.execCommand(command);
            return true;
        } catch (eCmd) { /* ignore */ }
        return false;
    }

    function tcSmmDeferExpandAllAfterRender(smm, applyToken) {
        if (!smm || typeof smm.on !== 'function') return;
        var handler = function () {
            if (applyToken !== state.smmApplyToken) {
                try { smm.off('node_tree_render_end', handler); } catch (eOff) { /* ignore */ }
                return;
            }
            if (!tcSmmCanApplyData(smm)) {
                try { smm.off('node_tree_render_end', handler); } catch (eOff2) { /* ignore */ }
                return;
            }
            try { smm.off('node_tree_render_end', handler); } catch (eOff3) { /* ignore */ }
            tcSmmSafeExecCommand(smm, 'EXPAND_ALL');
        };
        smm.on('node_tree_render_end', handler);
    }

    function tcSmmPlainNodeData(meta) {
        var smmData = { richText: false };
        if (meta && typeof meta === 'object') {
            Object.keys(meta).forEach(function (k) {
                if (k === 'richText' || k === 'resetRichText') return;
                smmData[k] = meta[k];
            });
        }
        smmData.richText = false;
        return smmData;
    }

    function syncExternalMindFromFacade(sourceMeta) {
        if (!state.facade || state.suppressExternalMindClear) return null;
        try {
            var snap = state.facade.get_data('node_tree');
            if (!snap || !snap.data) return null;
            if (sourceMeta) {
                snap.meta = sourceMeta;
            }
            var mindClone = JSON.parse(JSON.stringify(snap));
            tcMindmapExternalMindData = mindClone;
            tcMindmapCommittedExternalMind = mindClone;
            window.tcMindmapExternalMindData = mindClone;
            window.tcMindmapCommittedExternalMind = mindClone;
            if (typeof tcSyncWorkbenchGlobals === 'function') tcSyncWorkbenchGlobals();
            return mindClone;
        } catch (e) {
            return null;
        }
    }

    function jsMindNodeToSmm(node) {
        if (!node) return null;
        var meta = node.data || {};
        var text = tcSmmStripHtmlToPlainText(node.topic);
        var smmData = tcSmmPlainNodeData({
            text: text,
            uid: node.id || tcMindmapNewNodeId('tc'),
            expand: node.expanded !== false,
            tcType: meta.tcType,
            moduleName: meta.moduleName,
            rowIndex: meta.rowIndex,
            _tcRowRef: meta._tcRowRef
        });
        if (meta.icon) smmData.icon = Array.isArray(meta.icon) ? meta.icon.slice() : meta.icon;
        if (meta.image) smmData.image = meta.image;
        if (meta.imageSize) smmData.imageSize = meta.imageSize;
        if (meta.imageTitle) smmData.imageTitle = meta.imageTitle;
        if (meta.customLeft != null) smmData.customLeft = meta.customLeft;
        if (meta.customTop != null) smmData.customTop = meta.customTop;
        return {
            data: smmData,
            children: (node.children || []).map(jsMindNodeToSmm).filter(Boolean)
        };
    }

    function smmNodeToJsMind(node) {
        if (!node) return null;
        var d = node.data || {};
        var meta = {
            tcType: d.tcType,
            moduleName: d.moduleName,
            rowIndex: d.rowIndex,
            _tcRowRef: d._tcRowRef
        };
        Object.keys(d).forEach(function (k) {
            if (k.indexOf('border') === 0 || k.indexOf('fill') === 0) meta[k] = d[k];
        });
        if (d.icon) meta.icon = Array.isArray(d.icon) ? d.icon.slice() : d.icon;
        if (d.image) meta.image = d.image;
        if (d.imageSize) meta.imageSize = d.imageSize;
        if (d.imageTitle) meta.imageTitle = d.imageTitle;
        if (d.customLeft != null) meta.customLeft = d.customLeft;
        if (d.customTop != null) meta.customTop = d.customTop;
        return {
            id: d.uid || tcMindmapNewNodeId('tc'),
            topic: tcSmmStripHtmlToPlainText(d.text),
            expanded: d.expand !== false,
            data: meta,
            children: (node.children || []).map(smmNodeToJsMind).filter(Boolean)
        };
    }

    function mindToSmmRoot(mindData) {
        if (!mindData || !mindData.data) {
            var rootMeta = tcSmmPlainNodeData({
                text: typeof resolveTcMindmapFixedRootTopic === 'function' ? resolveTcMindmapFixedRootTopic() : (tcMindmapRootTopic || '测试用例'),
                uid: 'tc_root',
                tcType: 'root',
                expand: true
            });
            if (typeof tcMindmapShouldApplyDefaultRootIcon === 'function' && tcMindmapShouldApplyDefaultRootIcon()) {
                rootMeta.icon = [typeof resolveTcMindmapDefaultRootIcon === 'function'
                    ? resolveTcMindmapDefaultRootIcon()
                    : 'progress_1'];
            }
            return { data: rootMeta, children: [] };
        }
        return jsMindNodeToSmm(mindData.data);
    }

    function buildFacade(smm) {
        var facade = {
            _smm: smm,
            mind: { root: null },
            show: function (mindData) {
                if (!mindData || !mindData.data) return;
                _showPendingMindData = mindData;
                if (_showApplyRaf) return;
                _showApplyRaf = window.requestAnimationFrame(function () {
                    _showApplyRaf = null;
                    var pending = _showPendingMindData;
                    _showPendingMindData = null;
                    if (!pending || !pending.data) return;
                    if (_showApplyLock) {
                        _showPendingMindData = pending;
                        facade.show(pending);
                        return;
                    }
                    if (!tcSmmCanApplyData(smm)) {
                        _showPendingMindData = pending;
                        if (typeof ensureInstance === 'function') ensureInstance();
                        if (!tcSmmCanApplyData(state.smm)) {
                            window.setTimeout(function () { facade.show(pending); }, 32);
                            return;
                        }
                        smm = state.smm;
                    }
                    smm = tcSmmResolveLiveInstance(smm);
                    if (!smm) {
                        _showPendingMindData = pending;
                        window.setTimeout(function () { facade.show(pending); }, 32);
                        return;
                    }
                    var applyToken = state.smmApplyToken = (state.smmApplyToken || 0) + 1;
                    var root = mindToSmmRoot(pending);
                    var expectedChildren = (pending.data.children || []).length;
                    state.suppressExternalMindClear = true;
                    _showApplyLock = true;
                    try {
                        if (applyToken !== state.smmApplyToken || !tcSmmSafeSetData(smm, root)) {
                            return;
                        }
                        tcSmmDeferExpandAllAfterRender(smm, applyToken);
                    } finally {
                        _showApplyLock = false;
                        state.suppressExternalMindClear = false;
                    }
                    if (applyToken !== state.smmApplyToken || !tcSmmCanApplyData(smm)) {
                        return;
                    }
                var snapTree = null;
                try {
                    snapTree = smmExtractNodeTree(smm.getData(true));
                    if (!snapTree) snapTree = smm.getData(false);
                } catch (snapErr) { /* ignore */ }
                var jsRoot = snapTree ? smmNodeToJsMind(snapTree) : smmNodeToJsMind(root);
                facade.mind.root = jsRoot;
                syncTcMindmapMetaCache();
                syncExternalMindFromFacade(pending && pending.meta);
                var actualChildren = (jsRoot.children || []).length;
                if (expectedChildren > 0 && actualChildren === 0) {
                    console.warn('[TestHub] SMM tree missing children after setData, retrying');
                    if (applyToken === state.smmApplyToken && tcSmmCanApplyData(smm)) {
                        try {
                            if (tcSmmSafeSetData(smm, mindToSmmRoot(pending))) {
                                tcSmmDeferExpandAllAfterRender(smm, applyToken);
                            }
                            snapTree = smmExtractNodeTree(smm.getData(true)) || smm.getData(false);
                            facade.mind.root = smmNodeToJsMind(snapTree);
                            syncTcMindmapMetaCache();
                            syncExternalMindFromFacade(pending && pending.meta);
                        } catch (retryErr) { /* ignore */ }
                    }
                }
                tcSmmPatchRootExpandBtnSupport();
                window.setTimeout(function () { tcSmmRefreshRootExpandBtn(); }, 0);
                });
            },
            get_data: function (format) {
                if (format !== 'node_tree') return null;
                var payload = smm.getData(true);
                var nodeTree = smmExtractNodeTree(payload);
                if (!nodeTree) {
                    try { nodeTree = smm.getData(false); } catch (e) { nodeTree = null; }
                }
                var root = smmNodeToJsMind(nodeTree);
                facade.mind.root = root;
                return {
                    meta: { name: 'TestHub', author: 'TestHub', version: '1.0' },
                    format: 'node_tree',
                    data: root
                };
            },
            expand_all: function () {
                var live = tcSmmResolveLiveInstance(smm);
                if (live) tcSmmSafeExecCommand(live, 'EXPAND_ALL');
                tcSmmSetRootExpanded(true);
            },
            collapse_all: function () {
                var live = tcSmmResolveLiveInstance(smm);
                if (live) tcSmmSafeExecCommand(live, 'UNEXPAND_ALL');
                tcSmmSetRootExpanded(false);
            },
            resize: function () {
                var live = tcSmmResolveLiveInstance(smm);
                if (!live) return;
                try { live.resize(); } catch (e) { /* ignore */ }
            },
            _reset: function () {
                destroyInstance();
            },
            view: {
                zoom_current: 1,
                enlarge: function () { zoomStep(tcSmmGetZoomStepDelta()); },
                narrow: function () { zoomStep(-0.12); }
            }
        };
        return facade;
    }


    function tcSmmPrepareViewForZoom() {
        if (!state.smm) return false;
        try {
            if (typeof state.smm.resize === 'function') state.smm.resize();
            return !!(state.smm.view && state.smm.width > 0 && state.smm.height > 0);
        } catch (e) {
            return false;
        }
    }

    function tcSmmResolveViewZoomCenter(smm, clientX, clientY) {
        if (smm && typeof clientX === 'number' && typeof clientY === 'number' && typeof smm.toPos === 'function') {
            try {
                var pos = smm.toPos(clientX, clientY);
                if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                    return { cx: pos.x, cy: pos.y };
                }
            } catch (ePos) { /* ignore */ }
        }
        if (smm && smm.width > 0 && smm.height > 0) {
            return { cx: smm.width / 2, cy: smm.height / 2 };
        }
        return { cx: undefined, cy: undefined };
    }

    function tcSmmGetViewScale() {
        if (!state.smm || !state.smm.view) return 1;
        var z = state.smm.view.scale;
        return z != null && Number.isFinite(Number(z)) && Number(z) > 0 ? Number(z) : 1;
    }

    function tcSmmClampViewScale(view, scale) {
        var next = Number(scale);
        if (!Number.isFinite(next) || next <= 0) next = 1;
        var ratioDefaults = tcSmmGetZoomRatioDefaults();
        var minRatio = ratioDefaults.minRatio;
        var maxRatio = ratioDefaults.maxRatio;
        if (view && view.minZoomRatio != null) minRatio = Number(view.minZoomRatio);
        if (view && view.maxZoomRatio != null && Number(view.maxZoomRatio) > 0) maxRatio = Number(view.maxZoomRatio);
        var minS = minRatio > 0 ? minRatio / 100 : 0.2;
        var maxS = maxRatio > 0 ? maxRatio / 100 : 4;
        return Math.max(minS, Math.min(maxS, next));
    }

    function tcSmmApplyViewZoomStep(view, step, clientX, clientY) {
        var center = tcSmmResolveViewZoomCenter(state.smm, clientX, clientY);
        var cx = center.cx;
        var cy = center.cy;
        if (typeof view.enlarge === 'function' && typeof view.narrow === 'function') {
            var loops = Math.max(1, Math.round(Math.abs(step) / tcSmmGetZoomStepDelta()));
            var i;
            for (i = 0; i < loops; i++) {
                if (step > 0) view.enlarge(cx, cy);
                else view.narrow(cx, cy);
            }
            return true;
        }
        var cur = view.scale != null ? Number(view.scale) : 1;
        if (!Number.isFinite(cur) || cur <= 0) cur = 1;
        var next = tcSmmClampViewScale(view, cur + step);
        if (Math.abs(next - cur) < 0.0001) return false;
        if (typeof view.setScale === 'function') {
            view.setScale(next, cx, cy);
            return true;
        }
        return false;
    }

    function zoomStep(delta, clientX, clientY) {
        if (!state.smm || !state.smm.view) return false;
        try {
            tcSmmPrepareViewForZoom();
            var view = state.smm.view;
            var step = Number(delta) || 0;
            if (!step) return false;
            if (!tcSmmApplyViewZoomStep(view, step, clientX, clientY)) return false;
            updateZoomFromSmm();
            return true;
        } catch (e) {
            return false;
        }
    }

    function updateZoomFromSmm() {
        if (!state.smm || !state.smm.view) return;
        var z = state.smm.view.scale != null ? state.smm.view.scale : 1;
        state.zoom = z;
        if (state.facade && state.facade.view) state.facade.view.zoom_current = z;
        if (typeof tcMindmapUpdateZoomChrome === 'function') tcMindmapUpdateZoomChrome();
    }

    /** SMM 默认不为根节点渲染展开/收起按钮；临时取消 isRoot 标记以复用内置按钮 */
    function tcSmmCallExpandRender(fn, ctx) {
        if (!fn || !ctx || ctx.getChildrenLength() <= 0) return;
        if (!ctx.isRoot) {
            fn.call(ctx);
            return;
        }
        var wasRoot = ctx.isRoot;
        ctx.isRoot = false;
        try {
            fn.call(ctx);
        } finally {
            ctx.isRoot = wasRoot;
        }
    }

    function tcSmmPatchRootExpandBtnSupport() {
        if (global.__tcSmmRootExpandBtnPatched) return true;
        if (!state.smm || !state.smm.renderer || !state.smm.renderer.root) return false;
        var proto = Object.getPrototypeOf(state.smm.renderer.root);
        if (!proto || typeof proto.renderExpandBtn !== 'function') return false;
        var origRenderExpandBtn = proto.renderExpandBtn;
        var origRenderExpandBtnPlaceholderRect = proto.renderExpandBtnPlaceholderRect;
        proto.renderExpandBtn = function () {
            tcSmmCallExpandRender(origRenderExpandBtn, this);
        };
        if (typeof origRenderExpandBtnPlaceholderRect === 'function') {
            proto.renderExpandBtnPlaceholderRect = function () {
                tcSmmCallExpandRender(origRenderExpandBtnPlaceholderRect, this);
            };
        }
        global.__tcSmmRootExpandBtnPatched = true;
        return true;
    }

    function tcSmmRefreshRootExpandBtn() {
        if (!state.smm || !state.smm.renderer) return;
        var root = state.smm.renderer.root;
        if (!root || root.getChildrenLength() <= 0) return;
        try {
            if (typeof root.renderExpandBtn === 'function') root.renderExpandBtn();
            if (typeof root.renderExpandBtnPlaceholderRect === 'function') root.renderExpandBtnPlaceholderRect();
        } catch (e) { /* ignore */ }
    }

    function tcSmmSetRootExpanded(expand) {
        if (!state.smm || !state.smm.renderer) return;
        var root = state.smm.renderer.root;
        if (!root || root.getChildrenLength() <= 0) return;
        try {
            var current = root.getData ? root.getData('expand') : true;
            if (current !== false) current = true;
            if (!!current === !!expand) return;
            state.smm.execCommand('SET_NODE_DATA', root, { expand: !!expand });
        } catch (e) {
            try { state.smm.render(); } catch (e2) { /* ignore */ }
        }
    }

    function bindSmmEvents(smm) {
        if (state.dataBound) return;
        state.dataBound = true;
        smm.on('data_change', function () {
            if (state.facade) {
                var snap = state.facade.get_data('node_tree');
                if (snap && snap.data) state.facade.mind.root = snap.data;
            }
            syncTcMindmapMetaCache();
            syncExternalMindFromFacade();
            if (typeof tcMindmapSchedulePersistCache === 'function') tcMindmapSchedulePersistCache(false);
        });
        smm.on('view_data_change', function () {
            updateZoomFromSmm();
            if (typeof scheduleSyncTcMindmapProvenanceOverlay === 'function') scheduleSyncTcMindmapProvenanceOverlay();
        });
        smm.on('node_tree_render_end', function () {
            try { smm.resize(); } catch (eRenderResize) { /* ignore */ }
            tcSmmPatchRootExpandBtnSupport();
            tcSmmRefreshRootExpandBtn();
            if (typeof scheduleSyncTcMindmapProvenanceOverlay === 'function') scheduleSyncTcMindmapProvenanceOverlay();
        });
        if (global.TcSmmWorkbenchDragGuard && typeof global.TcSmmWorkbenchDragGuard.bind === 'function') {
            global.TcSmmWorkbenchDragGuard.bind(smm);
        }
    }

    function destroyInstance() {
        state.smmApplyToken = (state.smmApplyToken || 0) + 1;
        if (_showApplyRaf) {
            try { window.cancelAnimationFrame(_showApplyRaf); } catch (e0) { /* ignore */ }
            _showApplyRaf = null;
        }
        _showPendingMindData = null;
        _showApplyLock = false;
        if (state.smm) {
            try { state.smm.destroy(); } catch (e) { /* ignore */ }
        }
        state.smm = null;
        state.facade = null;
        state.dataBound = false;
        state.ctxMenuBridgeBound = false;
        global.tcMindmapInstance = null;
        tcSyncWorkbenchGlobals();
    }

    function ensureInstance() {
        var Ctor = getMindMapCtor();
        var el = document.getElementById('tc-smm-container');
        if (!Ctor || !el) return null;
        if (state.smm && state.facade) {
            if (tcSmmInstanceAttached(state.smm)) {
                global.tcMindmapInstance = state.facade;
                tcSyncWorkbenchGlobals();
                return state.facade;
            }
            destroyInstance();
        }
        if (!tcSmmIsContainerSized(el)) {
            tcSmmPrepareContainerForInit(el);
        }
        if (!tcSmmIsContainerSized(el)) return null;
        el.innerHTML = '';
        var smm;
        try {
            smm = new Ctor(tcSmmBuildMindMapOptions(el, {
                resolveInitialData: function () {
                    var ext = typeof tcMindmapExternalMindData !== 'undefined' ? tcMindmapExternalMindData : null;
                    if (!ext || !ext.data) {
                        ext = typeof tcMindmapCommittedExternalMind !== 'undefined' ? tcMindmapCommittedExternalMind : null;
                    }
                    if (ext && ext.data) return mindToSmmRoot(ext);
                    var emptyRootMeta = tcSmmPlainNodeData({
                        text: typeof resolveTcMindmapFixedRootTopic === 'function' ? resolveTcMindmapFixedRootTopic() : (tcMindmapRootTopic || '测试用例'),
                        uid: 'tc_root',
                        tcType: 'root',
                        expand: true
                    });
                    if (typeof tcMindmapShouldApplyDefaultRootIcon === 'function' && tcMindmapShouldApplyDefaultRootIcon()) {
                        emptyRootMeta.icon = [typeof resolveTcMindmapDefaultRootIcon === 'function'
                            ? resolveTcMindmapDefaultRootIcon()
                            : 'progress_1'];
                    }
                    return { data: emptyRootMeta, children: [] };
                },
                customCheckEnableShortcut: tcMindmapShortcutEnableCheck,
                beforeShortcutRun: function (key, activeNodeList) {
                    if (!activeNodeList || !activeNodeList.length) ensureSmmHasActiveNode();
                    return false;
                }
            }));
        } catch (e) {
            console.warn('[TestHub] SMM init deferred:', e && e.message ? e.message : e);
            return null;
        }
        state.smm = smm;
        state.facade = buildFacade(smm);
        bindSmmEvents(smm);
        tcSmmPatchRootExpandBtnSupport();
        tcSmmRefreshRootExpandBtn();
        bindContextMenuBridge();
        global.tcMindmapInstance = state.facade;
        tcSyncWorkbenchGlobals();
        return state.facade;
    }

    function captureMindSnapshot() {
        if (!state.facade) return buildTcMindmapMindData();
        try {
            return state.facade.get_data('node_tree');
        } catch (e) {
            return buildTcMindmapMindData();
        }
    }

    function captureViewTransform() {
        if (!state.smm || !state.smm.view || typeof state.smm.view.getTransformData !== 'function') return null;
        try {
            return state.smm.view.getTransformData();
        } catch (e) {
            return null;
        }
    }

    function restoreViewTransform(viewData) {
        if (!state.smm || !state.smm.view || !viewData) return false;
        try {
            if (typeof state.smm.view.setTransformData === 'function') {
                state.smm.view.setTransformData(viewData);
                updateZoomFromSmm();
                return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function findNodeDomByUid(uid) {
        if (!state.smm || !state.smm.renderer || !uid) return null;
        try {
            var node = state.smm.renderer.findNodeByUid(String(uid));
            if (node && node.group && node.group.node) return node.group.node;
        } catch (e) { /* ignore */ }
        return null;
    }

    function focusNode(nodeId) {
        if (!state.smm || !nodeId) return;
        try {
            var node = state.smm.renderer.findNodeByUid(nodeId);
            if (node) {
                state.smm.execCommand('GO_TARGET_NODE', node);
            }
        } catch (e) { /* ignore */ }
    }

    function fitView() {
        if (!state.smm || !state.smm.view) return false;
        try {
            tcSmmPrepareViewForZoom();
            state.smm.view.fit();
            updateZoomFromSmm();
            return true;
        } catch (e) {
            return false;
        }
    }

    function bindKeyboardShortcuts() {
        if (window._tcMindmapKeysBound) return;
        window._tcMindmapKeysBound = true;
        document.addEventListener('keydown', function (e) {
            if (tcMindmapShortcutBlockedByOverlay()) return;
            if (!isTcMindmapViewActive()) return;
            if (isTcMindmapBlockedInput()) return;
            if (!state.smm) return;

            var isEditing = isSmmTextEditing();

            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                if (isEditing) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                if (e.shiftKey) smmExec('FORWARD');
                else smmExec('BACK');
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
                if (isEditing) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                smmExec('FORWARD');
                return;
            }

            if (isEditing) return;

            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                e.stopImmediatePropagation();
                smmExec('INSERT_CHILD_NODE');
                if (typeof tcMindmapFocusPanel === 'function') tcMindmapFocusPanel();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopImmediatePropagation();
                smmExec('INSERT_NODE');
                if (typeof tcMindmapFocusPanel === 'function') tcMindmapFocusPanel();
                return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                var activeList = state.smm.renderer && state.smm.renderer.activeNodeList;
                if (!activeList || !activeList.length) return;
                var node = activeList[0];
                var uid = node && node.getData ? node.getData('uid') : null;
                if (uid === 'tc_root') return;
                e.preventDefault();
                e.stopImmediatePropagation();
                smmExec('REMOVE_NODE');
            }
        }, true);
    }

    function bindPanelCommitEdit() {
        var panel = document.getElementById('tc-mindmap-view-panel');
        if (!panel || panel._tcMindmapPanelCommitBound) return;
        panel._tcMindmapPanelCommitBound = true;
        panel.addEventListener('mousedown', function (e) {
            if (!isTcMindmapViewActive()) return;
            if (e.target.closest && (
                e.target.closest('.smm-node-edit') ||
                e.target.closest('.smm-text-edit-wrap') ||
                e.target.closest('#tc-mindmap-context-menu')
            )) return;
            smmCommitTextEdit();
        }, true);
    }

    function bindEditorCommit() {
        if (window._tcMindmapEditorCommitBound) return;
        window._tcMindmapEditorCommitBound = true;
        document.addEventListener('focusin', function (e) {
            if (!isTcMindmapViewActive()) return;
            if (!isSmmTextEditing()) return;
            var t = e.target;
            if (!t || isSmmEditTarget(t)) return;
            smmCommitTextEdit();
        }, true);
    }

    function expandAllNodes() {
        var inst = ensureInstance();
        if (inst && typeof inst.expand_all === 'function') inst.expand_all();
    }

    function collapseAllNodes() {
        var inst = ensureInstance();
        if (inst && typeof inst.collapse_all === 'function') inst.collapse_all();
    }

    global.TcSmmEditor = {
        ensure: ensureInstance,
        destroy: destroyInstance,
        getMindMapCtor: getMindMapCtor,
        isLibraryReady: function () { return !!getMindMapCtor(); },
        isInstanceReady: function () { return !!(state.smm && state.facade); },
        isContainerReady: tcSmmIsContainerSized,
        captureMindSnapshot: captureMindSnapshot,
        captureViewTransform: captureViewTransform,
        restoreViewTransform: restoreViewTransform,
        focusNode: focusNode,
        findNodeDomByUid: findNodeDomByUid,
        fitView: fitView,
        zoomStep: zoomStep,
        prepareViewForZoom: tcSmmPrepareViewForZoom,
        getViewScale: tcSmmGetViewScale,
        updateZoom: updateZoomFromSmm,
        commitTextEdit: smmCommitTextEdit,
        expandAll: expandAllNodes,
        collapseAll: collapseAllNodes,
        hasClipboardData: hasClipboardData,
        isRootNode: isRootNode,
        activateNode: activateNode,
        copySelection: copySelection,
        cutSelection: cutSelection,
        pasteToActive: pasteToActive,
        pasteToRoot: pasteToRoot,
        selectAllNodes: selectAllNodes,
        insertChildNode: insertChildNode,
        insertSiblingNode: insertSiblingNode,
        insertParentNode: insertParentNode,
        removeActiveNodes: removeActiveNodes,
        insertAssociativeLine: insertAssociativeLine,
        insertFreeTopicAt: insertFreeTopicAt,
        isMindmapNodeDomTarget: isMindmapNodeDomTarget,
        resolveNodeFromDomTarget: resolveNodeFromDomTarget,
        clearActiveNodeText: clearActiveNodeText,
        syncExternalMind: function () { return syncExternalMindFromFacade(); },
        stripHtmlToPlainText: tcSmmStripHtmlToPlainText
    };

    global.ensureTcMindmapInstance = ensureInstance;
    global.tcMindmapReleaseInstance = destroyInstance;

    global.tcMindmapBindPanelCommitEdit = bindPanelCommitEdit;
    global.tcMindmapBindNodeClickSelect = function () { /* SMM 原生处理节点选中 */ };
    global.tcMindmapBindKeyboardShortcuts = bindKeyboardShortcuts;
    global.tcMindmapBindEditorCommit = bindEditorCommit;
    global.tcMindmapBindNodeDeleteHover = function () {};
    global.tcMindmapBindDragGuard = function () {
        if (state.smm && global.TcSmmWorkbenchDragGuard && typeof global.TcSmmWorkbenchDragGuard.bind === 'function') {
            global.TcSmmWorkbenchDragGuard.bind(state.smm);
        }
    };
    global.tcMindmapBindFreeDrag = function () {};
})(typeof window !== 'undefined' ? window : this);
