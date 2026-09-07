/**
 * 用例评审预览页 · Simple Mind Map 只读画布（与工作台 TcSmmEditor 完全隔离）
 */
(function (global) {
    'use strict';

    var active = null;
    var sharePreviewActiveCaseNode = null;
    var sharePreviewSuppressDrawClickClear = false;
    var _uidSeq = 0;
    var sharePreviewDataReady = false;
    var sharePreviewAwaitingDataRender = false;
    var sharePreviewSmmDataRoot = null;
    var sharePreviewCollapsedMarkerRegistry = Object.create(null);


    function getMindMapCtor() {
        if (!global.simpleMindMap) return null;
        return global.simpleMindMap.default || global.simpleMindMap.MindMap || global.simpleMindMap;
    }

    function nextSharePreviewUid(prefix) {
        _uidSeq += 1;
        return String(prefix || 'share') + '_' + _uidSeq;
    }

    function stripHtmlToPlain(text) {
        return String(text == null ? '' : text)
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
    }

    function resolveSharePreviewNodeText(node) {
        node = node || {};
        var fromTopic = node.topic != null ? String(node.topic).trim() : '';
        if (fromTopic) return stripHtmlToPlain(fromTopic);
        var payload = node.data;
        if (!payload || typeof payload !== 'object') return '';
        if (payload.text != null && String(payload.text).trim()) {
            return stripHtmlToPlain(payload.text);
        }
        var nested = payload.data;
        if (nested && nested.text != null && String(nested.text).trim()) {
            return stripHtmlToPlain(nested.text);
        }
        return '';
    }

    function sharePreviewPlainNodeData(meta) {
        meta = meta && typeof meta === 'object' ? meta : {};
        var smmData = { richText: false };
        var textValue = meta.text;
        Object.keys(meta).forEach(function (k) {
            if (k === 'richText' || k === 'resetRichText' || k === 'text') return;
            smmData[k] = meta[k];
        });
        smmData.text = stripHtmlToPlain(textValue);
        smmData.richText = false;
        return smmData;
    }

    function sharePreviewJsMindNodeToSmm(node) {
        if (!node) return null;
        var meta = node.data || {};
        var smmData = sharePreviewPlainNodeData({
            text: resolveSharePreviewNodeText(node),
            uid: node.id || nextSharePreviewUid('share_node'),
            expand: node.expanded !== false,
            tcType: meta.tcType,
            moduleName: meta.moduleName,
            rowIndex: meta.rowIndex,
            _tcRowRef: meta._tcRowRef
        });
        if (meta.icon) smmData.icon = Array.isArray(meta.icon) ? meta.icon.slice() : meta.icon;
        return {
            data: smmData,
            children: (node.children || []).map(sharePreviewJsMindNodeToSmm).filter(Boolean)
        };
    }

    function findCaseNameColIndex(columns) {
        var cols = columns || [];
        var exact = ['用例名称', '用例名', '用例标题', '用例摘要', '标题'];
        for (var i = 0; i < cols.length; i++) {
            var c = String(cols[i] == null ? '' : cols[i]).trim();
            for (var j = 0; j < exact.length; j++) {
                if (c === exact[j]) return i;
            }
        }
        return 0;
    }

    function rowHasContent(row) {
        return (row || []).some(function (c) { return String(c || '').trim(); });
    }

    function isSharePreviewSmmBranchNode(node) {
        node = node || {};
        var d = node.data;
        return !!(d && d.text != null && String(d.text).trim() && node.topic == null && !d.tcType);
    }

    function sharePreviewSmmBranchToJsMind(smmNode, rowOffset, idPrefix) {
        smmNode = smmNode || {};
        var d = smmNode.data || {};
        var meta = {};
        ['tcType', 'moduleName', 'rowIndex', '_tcRowRef', 'icon'].forEach(function (k) {
            if (d[k] != null) meta[k] = d[k];
        });
        if (meta.tcType === 'leaf' && meta.rowIndex != null && meta.rowIndex !== '') {
            var localIdx = parseInt(meta.rowIndex, 10);
            if (!isNaN(localIdx) && localIdx >= 0) meta.rowIndex = rowOffset + localIdx;
        }
        return {
            id: String(d.uid || smmNode.id || nextSharePreviewUid(idPrefix)),
            topic: stripHtmlToPlain(d.text || ''),
            expanded: d.expand !== false,
            data: meta,
            children: (smmNode.children || []).map(function (child, idx) {
                return normalizeSharePreviewMindBranchNode(child, rowOffset, idPrefix + '_' + idx);
            })
        };
    }

    function cloneSharePreviewMindNode(mindNode, rowOffset, idPrefix) {
        mindNode = mindNode || {};
        var meta = Object.assign({}, mindNode.data || {});
        if (meta.tcType === 'leaf' && meta.rowIndex != null && meta.rowIndex !== '') {
            var localIdx = parseInt(meta.rowIndex, 10);
            if (!isNaN(localIdx) && localIdx >= 0) meta.rowIndex = rowOffset + localIdx;
        }
        return {
            id: String(mindNode.id || nextSharePreviewUid(idPrefix)),
            topic: resolveSharePreviewNodeText(mindNode),
            expanded: mindNode.expanded !== false,
            data: meta,
            children: (mindNode.children || []).map(function (child, idx) {
                return normalizeSharePreviewMindBranchNode(child, rowOffset, idPrefix + '_' + idx);
            })
        };
    }

    function normalizeSharePreviewMindBranchNode(node, rowOffset, idPrefix) {
        if (isSharePreviewSmmBranchNode(node)) {
            return sharePreviewSmmBranchToJsMind(node, rowOffset, idPrefix);
        }
        return cloneSharePreviewMindNode(node, rowOffset, idPrefix);
    }

    function resolveSharePreviewMindChildren(mindSource) {
        if (!mindSource) return [];
        var d = mindSource.data;
        if (d && Array.isArray(d.children) && d.children.length) return d.children;
        if (Array.isArray(mindSource.children) && mindSource.children.length) return mindSource.children;
        return [];
    }

    function appendSharePreviewRowsFallback(pageNode, snap, page, rowOffset) {
        var nameCol = findCaseNameColIndex(snap.columns);
        var start = parseInt(page.row_start, 10);
        if (isNaN(start) || start < 0) start = rowOffset;
        var count = parseInt(page.row_count, 10);
        if (isNaN(count) || count < 0) count = (snap.rows || []).length;
        var slice = (snap.rows || []).slice(start, start + count);
        slice.forEach(function (row, offset) {
            if (!rowHasContent(row)) return;
            var label = String((row || [])[nameCol] != null ? row[nameCol] : '').trim() || '未命名用例';
            pageNode.children.push({
                id: nextSharePreviewUid('share_case'),
                topic: label,
                expanded: true,
                data: { tcType: 'leaf', rowIndex: start + offset },
                children: []
            });
        });
    }

    function buildSharePreviewMindRoot(snap) {
        snap = snap || {};
        var docName = String(snap.review_doc_name || snap.title || snap.rootTopic || '需求文档').trim() || '需求文档';
        var pages = Array.isArray(snap.review_pages) ? snap.review_pages.slice() : [];
        if (!pages.length) {
            pages = [{
                page_path: String(snap.rootTopic || '需求页').trim() || '需求页',
                page_name: String(snap.rootTopic || '需求页').trim() || '需求页',
                mind: snap.mind || null,
                row_start: 0,
                row_count: (snap.rows || []).length
            }];
        }
        var root = {
            id: 'share_doc_root',
            topic: docName,
            expanded: true,
            data: { tcType: 'share_root', expand: true },
            children: []
        };
        pages.forEach(function (page, pageIdx) {
            var path = String(page.page_path || page.page_name || '需求页').trim() || '需求页';
            var pageNode = {
                id: 'share_page_' + pageIdx,
                topic: path,
                expanded: true,
                data: { tcType: 'share_page', expand: true },
                children: []
            };
            var start = parseInt(page.row_start, 10);
            if (isNaN(start) || start < 0) start = 0;
            var mindSource = page.mind || (pages.length === 1 ? (snap.mind || null) : null);
            var mindChildren = resolveSharePreviewMindChildren(mindSource);
            if (mindChildren.length) {
                mindChildren.forEach(function (child, ci) {
                    if (!child) return;
                    pageNode.children.push(normalizeSharePreviewMindBranchNode(child, start, 'share_p' + pageIdx + '_c' + ci));
                });
            } else {
                appendSharePreviewRowsFallback(pageNode, snap, page, start);
            }
            if (!pageNode.children.length) {
                pageNode.children.push({
                    id: nextSharePreviewUid('share_empty'),
                    topic: '暂无用例',
                    expanded: true,
                    data: { tcType: 'module' },
                    children: []
                });
            }
            root.children.push(pageNode);
        });
        if (!root.children.length) {
            root.children.push({
                id: 'share_page_empty',
                topic: '暂无需求页',
                expanded: true,
                data: { tcType: 'share_page' },
                children: []
            });
        }
        return root;
    }

    function buildSharePreviewSmmData(snap) {
        return sharePreviewJsMindNodeToSmm(buildSharePreviewMindRoot(snap));
    }

    function sharePreviewBootSmmRoot() {
        return {
            data: sharePreviewPlainNodeData({
                text: ' ',
                uid: 'share_preview_boot',
                expand: true
            }),
            children: []
        };
    }


    function destroyActive() {
        if (!active) return;
        if (active.cleanup) active.cleanup();
        if (active.rootEl && active.rootEl.parentNode) active.rootEl.parentNode.removeChild(active.rootEl);
        active = null;
        sharePreviewActiveCaseNode = null;
        sharePreviewAwaitingDataRender = false;
        sharePreviewSmmDataRoot = null;
        sharePreviewCollapsedMarkerRegistry = Object.create(null);
    }


    /** 预览页：SMM 默认不为根节点渲染展开/收起按钮（与工作台 tcSmmPatchRootExpandBtnSupport 隔离） */
    function sharePreviewCallExpandRender(fn, ctx) {
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

    function sharePreviewPatchRootExpandBtnSupport(smm) {
        if (global.__sharePreviewSmmExpandBtnPatched) return true;
        if (!smm || !smm.renderer || !smm.renderer.root) return false;
        var proto = Object.getPrototypeOf(smm.renderer.root);
        if (!proto || typeof proto.renderExpandBtn !== 'function') return false;
        var origRenderExpandBtn = proto.renderExpandBtn;
        var origRenderExpandBtnPlaceholderRect = proto.renderExpandBtnPlaceholderRect;
        proto.renderExpandBtn = function () {
            sharePreviewCallExpandRender(origRenderExpandBtn, this);
        };
        if (typeof origRenderExpandBtnPlaceholderRect === 'function') {
            proto.renderExpandBtnPlaceholderRect = function () {
                sharePreviewCallExpandRender(origRenderExpandBtnPlaceholderRect, this);
            };
        }
        global.__sharePreviewSmmExpandBtnPatched = true;
        return true;
    }

    function sharePreviewRefreshRootExpandBtn(smm) {
        if (!smm || !smm.renderer) return;
        var root = smm.renderer.root;
        if (!root || root.getChildrenLength() <= 0) return;
        try {
            if (typeof root.renderExpandBtn === 'function') root.renderExpandBtn();
            if (typeof root.renderExpandBtnPlaceholderRect === 'function') {
                root.renderExpandBtnPlaceholderRect();
            }
        } catch (e) { /* ignore */ }
    }

    /** 预览页：禁用 SMM Scrollbar 插件，避免 hide/remove 后 draw.rbox() 报错；预览页自有缩放/平移控件 */
    function sharePreviewDisableSmmScrollbar(smm) {
        if (!smm || !smm.scrollbar) return;
        try {
            if (typeof smm.scrollbar.unBindEvent === 'function') smm.scrollbar.unBindEvent();
        } catch (eUnbind) { /* ignore */ }
        try {
            smm.scrollbar.updateScrollbar = function () { /* preview noop */ };
        } catch (eNoop) { /* ignore */ }
    }

    /** 预览页：收起后 SMM 只读模式常不清理子节点 DOM，需手动同步（removeSelf + 清连线；Scrollbar 已禁用避免 rbox 报错） */
    function sharePreviewForceHideDomEl(el) {
        if (!el || !el.style) return;
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
        if (el.setAttribute) el.setAttribute('data-share-preview-collapsed-hidden', '1');
    }

    function sharePreviewForceShowDomEl(el) {
        if (!el || !el.style) return;
        el.style.display = '';
        el.style.visibility = '';
        el.style.pointerEvents = '';
        if (el.removeAttribute) el.removeAttribute('data-share-preview-collapsed-hidden');
    }

    function sharePreviewFindSmmDataNodeByUid(dataNode, uid) {
        if (!dataNode || uid == null || uid === '') return null;
        var d = dataNode.data || {};
        if (String(d.uid) === String(uid)) return dataNode;
        var ch = dataNode.children || [];
        for (var i = 0; i < ch.length; i++) {
            var found = sharePreviewFindSmmDataNodeByUid(ch[i], uid);
            if (found) return found;
        }
        return null;
    }

    function sharePreviewFindRendererNodeByUid(node, uid) {
        if (!node || uid == null || uid === '') return null;
        try {
            var d = node.getData ? node.getData() : null;
            if (d && String(d.uid) === String(uid)) return node;
        } catch (eUid) { /* ignore */ }
        var ch = node.children || [];
        for (var i = 0; i < ch.length; i++) {
            var found = sharePreviewFindRendererNodeByUid(ch[i], uid);
            if (found) return found;
        }
        return null;
    }

    function sharePreviewCollectHideMarkersFromDataNode(dataNode, out) {
        if (!dataNode) return;
        (dataNode.children || []).forEach(function (child) {
            var d = child.data || {};
            var text = sharePreviewNormalizeNodeText(d.text);
            if (text) out.texts.push(text);
            if (d.uid != null && String(d.uid).trim()) out.uids.push(String(d.uid));
            if (d.rowIndex != null && d.rowIndex !== '') {
                var ri = parseInt(d.rowIndex, 10);
                if (!isNaN(ri)) out.rowIndexes.push(ri);
            }
            sharePreviewCollectHideMarkersFromDataNode(child, out);
        });
    }

    function sharePreviewNormalizeNodeText(text) {
        return stripHtmlToPlain(String(text == null ? '' : text));
    }

    function sharePreviewResolveCollapsedMarkers(collapsedRendererNode) {
        var out = { texts: [], uids: [], rowIndexes: [] };
        if (!collapsedRendererNode) return out;
        var uid = null;
        try {
            uid = collapsedRendererNode.getData ? collapsedRendererNode.getData('uid') : null;
        } catch (eGet) { /* ignore */ }
        if (!uid && collapsedRendererNode.nodeData && collapsedRendererNode.nodeData.data) {
            uid = collapsedRendererNode.nodeData.data.uid;
        }
        if (uid && sharePreviewSmmDataRoot) {
            var dataNode = sharePreviewFindSmmDataNodeByUid(sharePreviewSmmDataRoot, uid);
            if (dataNode) sharePreviewCollectHideMarkersFromDataNode(dataNode, out);
        }
        if (!out.texts.length && collapsedRendererNode.nodeData) {
            sharePreviewCollectHideMarkersFromDataNode(collapsedRendererNode.nodeData, out);
        }
        return out;
    }

    function sharePreviewDomTextMatchesHideTargets(content, markers) {
        if (!content || !markers || !markers.texts.length) return false;
        for (var i = 0; i < markers.texts.length; i++) {
            var t = markers.texts[i];
            if (!t) continue;
            if (content === t) return true;
            if (t.length >= 4 && content.indexOf(t) >= 0) return true;
        }
        return false;
    }

    function sharePreviewHideDomByMarkers(markers) {
        var mount = sharePreviewGetSmmMountEl();
        if (!mount || !markers) return;
        if (markers.texts && markers.texts.length) {
            mount.querySelectorAll('g.smm-node').forEach(function (g) {
                var content = sharePreviewNormalizeNodeText(g.textContent || '');
                if (sharePreviewDomTextMatchesHideTargets(content, markers)) {
                    sharePreviewForceHideDomEl(g);
                }
            });
        }
    }

    function sharePreviewShowDomByMarkers(markers) {
        var mount = sharePreviewGetSmmMountEl();
        if (!mount || !markers || !markers.texts.length) return;
        mount.querySelectorAll('g.smm-node[data-share-preview-collapsed-hidden]').forEach(function (g) {
            var content = sharePreviewNormalizeNodeText(g.textContent || '');
            if (sharePreviewDomTextMatchesHideTargets(content, markers)) {
                sharePreviewForceShowDomEl(g);
            }
        });
    }

    function sharePreviewHideRendererNodesByRowIndexes(rootNode, rowIndexes, smm) {
        if (!rootNode || !rowIndexes || !rowIndexes.length) return;
        var wanted = Object.create(null);
        rowIndexes.forEach(function (ri) {
            if (!isNaN(ri)) wanted[ri] = true;
        });
        sharePreviewWalkRendererNodes(rootNode, function (node) {
            try {
                var d = node.getData ? node.getData() : null;
                if (!d || d.rowIndex == null || d.rowIndex === '') return;
                var idx = parseInt(d.rowIndex, 10);
                if (isNaN(idx) || !wanted[idx]) return;
                if (node === sharePreviewActiveCaseNode) {
                    sharePreviewDeactivateSmmNode(smm, node);
                    sharePreviewActiveCaseNode = null;
                }
                sharePreviewHideRendererNodeDom(node);
            } catch (eRow) { /* ignore */ }
        });
    }

    function sharePreviewHideRendererNodeDom(node) {
        if (!node) return;
        try {
            if (typeof node.removeLine === 'function') node.removeLine();
        } catch (eLine) { /* ignore */ }
        try {
            if (typeof node.removeSelf === 'function') node.removeSelf();
            else if (node.group && typeof node.group.remove === 'function') node.group.remove();
        } catch (eDom) { /* ignore */ }
        try {
            if (node.group && node.group.node) sharePreviewForceHideDomEl(node.group.node);
        } catch (eRaw) { /* ignore */ }
    }

    function sharePreviewHideRendererNodesByUids(rootNode, uids, smm) {
        if (!rootNode || !uids || !uids.length) return;
        for (var i = 0; i < uids.length; i++) {
            var rn = sharePreviewFindRendererNodeByUid(rootNode, uids[i]);
            if (!rn) continue;
            if (rn === sharePreviewActiveCaseNode) {
                sharePreviewDeactivateSmmNode(smm, rn);
                sharePreviewActiveCaseNode = null;
            }
            sharePreviewHideRendererNodeDom(rn);
        }
    }

    function sharePreviewRegisterCollapsedNode(node) {
        if (!node) return null;
        var uid = null;
        try {
            uid = node.getData ? node.getData('uid') : null;
        } catch (eGet) { /* ignore */ }
        if (!uid && node.nodeData && node.nodeData.data) uid = node.nodeData.data.uid;
        if (!uid) return null;
        var markers = sharePreviewResolveCollapsedMarkers(node);
        sharePreviewCollapsedMarkerRegistry[String(uid)] = markers;
        return markers;
    }

    function sharePreviewUnregisterCollapsedNode(node) {
        if (!node) return;
        var uid = null;
        try {
            uid = node.getData ? node.getData('uid') : null;
        } catch (eGet) { /* ignore */ }
        if (!uid && node.nodeData && node.nodeData.data) uid = node.nodeData.data.uid;
        if (uid != null) delete sharePreviewCollapsedMarkerRegistry[String(uid)];
    }

    function sharePreviewEnforceCollapsedRegistry(smm) {
        if (!smm || !smm.renderer) return;
        var root = smm.renderer.root;
        Object.keys(sharePreviewCollapsedMarkerRegistry).forEach(function (uidKey) {
            var markers = sharePreviewCollapsedMarkerRegistry[uidKey];
            if (!markers) return;
            sharePreviewHideRendererNodesByUids(root, markers.uids, smm);
            sharePreviewHideRendererNodesByRowIndexes(root, markers.rowIndexes, smm);
            sharePreviewHideDomByMarkers(markers);
        });
    }

    function sharePreviewHideCollapsedDescendants(parentNode, smm) {
        if (!parentNode) return;
        var ch = parentNode.children || [];
        for (var i = 0; i < ch.length; i++) {
            var child = ch[i];
            if (child === sharePreviewActiveCaseNode) {
                sharePreviewDeactivateSmmNode(smm, child);
                sharePreviewActiveCaseNode = null;
            }
            sharePreviewHideRendererNodeDom(child);
            sharePreviewHideCollapsedDescendants(child, smm);
        }
    }

    function sharePreviewGetSmmMountEl() {
        if (!active || !active.rootEl) return null;
        return active.rootEl.querySelector('.tc-share-preview-smm-container');
    }

    function sharePreviewHideCollapsedDomFallback(collapsedRendererNode, smm) {
        var markers = sharePreviewResolveCollapsedMarkers(collapsedRendererNode);
        if (!markers.texts.length && !markers.uids.length) return markers;
        if (smm && smm.renderer) {
            sharePreviewHideRendererNodesByUids(smm.renderer.root, markers.uids, smm);
            sharePreviewHideRendererNodesByRowIndexes(smm.renderer.root, markers.rowIndexes, smm);
        }
        sharePreviewHideDomByMarkers(markers);
        return markers;
    }

    function sharePreviewRestoreExpandedDomFallback(expandedRendererNode, smm) {
        var markers = sharePreviewResolveCollapsedMarkers(expandedRendererNode);
        sharePreviewShowDomByMarkers(markers);
        if (smm && smm.renderer && markers.uids.length) {
            for (var i = 0; i < markers.uids.length; i++) {
                var rn = sharePreviewFindRendererNodeByUid(smm.renderer.root, markers.uids[i]);
                if (rn && rn.group && rn.group.node) sharePreviewForceShowDomEl(rn.group.node);
            }
        }
    }

    function sharePreviewApplyCollapsedNodeVisibility(node, smm) {
        if (!node || !node.getData || node.getData('expand') !== false) return;
        try {
            if (typeof node.removeLine === 'function') node.removeLine();
        } catch (eLine) { /* ignore */ }
        sharePreviewRegisterCollapsedNode(node);
        sharePreviewHideCollapsedDescendants(node, smm);
        sharePreviewHideCollapsedDomFallback(node, smm);
    }

    function sharePreviewScheduleCollapsedEnforce(smm) {
        if (!smm) return;
        global.requestAnimationFrame(function () {
            global.requestAnimationFrame(function () {
                if (!active || active.smm !== smm) return;
                sharePreviewSyncCollapsedVisibility(smm.renderer && smm.renderer.root, smm);
                sharePreviewEnforceCollapsedRegistry(smm);
            });
        });
    }

    function sharePreviewSyncCollapsedVisibility(rootNode, smm) {
        if (!rootNode) return;
        sharePreviewWalkRendererNodes(rootNode, function (node) {
            sharePreviewApplyCollapsedNodeVisibility(node, smm);
        });
        sharePreviewEnforceCollapsedRegistry(smm);
    }

    function sharePreviewIsNodeClickEvent(e) {
        var t = e && (e.target || e.srcElement);
        if (!t || !t.closest) return false;
        if (t.closest('.smm-expand-btn')) return true;
        var el = t;
        while (el) {
            if (el.classList && el.classList.contains('smm-node')) return true;
            el = el.parentNode;
        }
        return false;
    }

    function sharePreviewWalkRendererNodes(node, fn) {
        if (!node || typeof fn !== 'function') return;
        fn(node);
        var ch = node.children || [];
        for (var i = 0; i < ch.length; i++) sharePreviewWalkRendererNodes(ch[i], fn);
    }

    function sharePreviewDeactivateSmmNode(smm, node) {
        if (!smm || !node) return;
        try { smm.execCommand('SET_NODE_ACTIVE', node, false); } catch (eOff) { /* ignore */ }
        try {
            if (typeof node.updateNodeByActive === 'function') node.updateNodeByActive(false);
        } catch (eUi) { /* ignore */ }
    }

    function sharePreviewClearSmmActiveNodes(smm) {
        if (!smm || !smm.renderer) return;
        var renderer = smm.renderer;
        if (sharePreviewActiveCaseNode) {
            sharePreviewDeactivateSmmNode(smm, sharePreviewActiveCaseNode);
            sharePreviewActiveCaseNode = null;
        }
        sharePreviewWalkRendererNodes(renderer.root, function (node) {
            try {
                if (node.getData && node.getData('isActive')) {
                    sharePreviewDeactivateSmmNode(smm, node);
                }
            } catch (eWalk) { /* ignore */ }
        });
        try { smm.execCommand('CLEAR_ACTIVE_NODE'); } catch (eClear) { /* ignore */ }
        if (renderer.activeNodeList && renderer.activeNodeList.length) {
            var snapshot = renderer.activeNodeList.slice();
            for (var i = 0; i < snapshot.length; i++) {
                sharePreviewDeactivateSmmNode(smm, snapshot[i]);
            }
            renderer.activeNodeList = [];
        }
    }

    function sharePreviewActivateSmmCaseNode(smm, node) {
        if (!smm || !node) return;
        try { smm.execCommand('SET_NODE_ACTIVE', node, true); } catch (eOn) { /* ignore */ }
        try {
            if (typeof node.updateNodeByActive === 'function') node.updateNodeByActive(true);
        } catch (eUi) { /* ignore */ }
        sharePreviewActiveCaseNode = node;
    }

    function findSmmNodeByRowIndex(node, rowIndex) {
        if (!node) return null;
        var d = node.nodeData && node.nodeData.data;
        if (d && d.rowIndex != null && parseInt(d.rowIndex, 10) === rowIndex) return node;
        var ch = node.children || [];
        for (var i = 0; i < ch.length; i++) {
            var found = findSmmNodeByRowIndex(ch[i], rowIndex);
            if (found) return found;
        }
        return null;
    }


    function sharePreviewPrepareMountEl(el) {
        if (!el) return false;
        el.style.width = '100%';
        var stage = el.closest('.tc-share-preview-smm-shell__stage');
        if (stage) {
            var panelH = stage.clientHeight;
            if (panelH > 0) {
                el.style.height = panelH + 'px';
                el.style.minHeight = panelH + 'px';
            }
        }
        void el.offsetHeight;
        return el.clientWidth > 0 && el.clientHeight > 0;
    }

    function sharePreviewSmmThemeConfig() {
        // 预览页专用：加大 classic4 三级以下 node.marginY（默认 0），避免浅分支兄弟节点重叠
        return {
            second: { marginY: 64, marginX: 100 },
            node: { marginY: 52, marginX: 50, paddingY: 6, paddingX: 8 }
        };
    }


    function sharePreviewFitView(smm) {
        if (!smm || !smm.view) return;
        try {
            if (typeof smm.view.fit === 'function') smm.view.fit();
        } catch (eFit) { /* ignore */ }
    }

    function sharePreviewZoomStep(smm, delta) {
        if (!smm || !smm.view) return;
        try {
            var view = smm.view;
            if (typeof view.enlarge === 'function' && typeof view.narrow === 'function') {
                if (delta > 0) view.enlarge();
                else view.narrow();
                return;
            }
            if (typeof view.getScale === 'function' && typeof view.setScale === 'function') {
                var scale = view.getScale() || 1;
                view.setScale(Math.min(2.5, Math.max(0.35, scale + delta)));
            }
        } catch (eZoom) { /* ignore */ }
    }

    function mount(container, snap, opts) {
        opts = opts || {};
        destroyActive();
        _uidSeq = 0;
        sharePreviewDataReady = false;
        sharePreviewAwaitingDataRender = false;
        sharePreviewSmmDataRoot = null;
        sharePreviewCollapsedMarkerRegistry = Object.create(null);
        if (!container) return null;

        var Ctor = getMindMapCtor();
        if (!Ctor) {
            container.innerHTML = '<p class="tc-share-preview__empty">思维导图组件未加载，请刷新页面</p>';
            return null;
        }

        container.innerHTML = '';
        var wrap = document.createElement('div');
        wrap.className = 'tc-share-preview-smm-shell';
        wrap.innerHTML =
            '<div class="tc-share-preview-smm-shell__stage">' +
            '<div id="tc-share-preview-smm-mount" class="tc-share-preview-smm-container"></div>' +
            '<div class="tc-share-preview-smm-shell__zoom-float" aria-label="画布缩放">' +
            '<button type="button" class="tc-share-preview-smm-shell__zoom-btn" data-share-smm-zoom="out" title="缩小">−</button>' +
            '<button type="button" class="tc-share-preview-smm-shell__zoom-btn" data-share-smm-zoom="in" title="放大">+</button>' +
            '<button type="button" class="tc-share-preview-smm-shell__zoom-btn" data-share-smm-zoom="fit" title="适应画布">适应</button>' +
            '</div></div>';
        container.appendChild(wrap);

        var mountEl = wrap.querySelector('#tc-share-preview-smm-mount');
        sharePreviewPrepareMountEl(mountEl);
        var smmData = buildSharePreviewSmmData(snap);
        sharePreviewSmmDataRoot = smmData;
        var sharePreviewBooted = false;
        var smm = null;
        try {
            smm = new Ctor({
                el: mountEl,
                data: sharePreviewBootSmmRoot(),
                layout: 'logicalStructure',
                theme: 'classic4',
                themeConfig: sharePreviewSmmThemeConfig(),
                readonly: true,
                enableFreeDrag: false,
                isShowCreateChildBtnIcon: false,
                enableShortcutOnlyWhenMouseInSvg: false,
                disableMouseWheelZoom: false,
                mousewheelAction: 'move',
                mousewheelZoomActionReverse: true,
                hoverRectPadding: 6,
                fit: false
            });
        } catch (eInit) {
            console.error('[tc_share_preview_smm]', eInit);
            container.innerHTML = '<p class="tc-share-preview__empty">思维导图画布初始化失败，请刷新页面</p>';
            return null;
        }

        sharePreviewPatchRootExpandBtnSupport(smm);
        sharePreviewDisableSmmScrollbar(smm);

        var onNodeClick = function (node) {
            var d = node && node.nodeData && node.nodeData.data;
            if (!d || d.rowIndex == null || d.rowIndex === '') return;
            var idx = parseInt(d.rowIndex, 10);
            if (isNaN(idx)) return;
            sharePreviewSuppressDrawClickClear = true;
            if (typeof opts.onCaseClick === 'function') opts.onCaseClick(idx);
        };

        var sharePreviewInitialFitted = false;

        var onRenderEnd = function () {
            if (!active || active.smm !== smm) return;
            if (!sharePreviewBooted) {
                sharePreviewBooted = true;
                sharePreviewAwaitingDataRender = true;
                global.requestAnimationFrame(function () {
                    if (!active || active.smm !== smm) return;
                    try {
                        smm.setData(smmData);
                        try { smm.execCommand('EXPAND_ALL'); } catch (eExp) { /* ignore */ }
                    } catch (eBoot) {
                        console.error('[tc_share_preview_smm] boot setData failed', eBoot);
                        sharePreviewAwaitingDataRender = false;
                    }
                });
                return;
            }
            if (sharePreviewAwaitingDataRender) {
                sharePreviewAwaitingDataRender = false;
                sharePreviewDataReady = true;
            }
            try { smm.resize(); } catch (eResize) { /* ignore */ }
            sharePreviewPatchRootExpandBtnSupport(smm);
            sharePreviewRefreshRootExpandBtn(smm);
            if (sharePreviewDataReady) {
                sharePreviewSyncCollapsedVisibility(smm.renderer && smm.renderer.root, smm);
                if (sharePreviewActiveCaseNode) {
                    try {
                        if (!sharePreviewActiveCaseNode.getData ||
                            !sharePreviewActiveCaseNode.getData('isActive')) {
                            sharePreviewActivateSmmCaseNode(smm, sharePreviewActiveCaseNode);
                        } else if (typeof sharePreviewActiveCaseNode.updateNodeByActive === 'function') {
                            sharePreviewActiveCaseNode.updateNodeByActive(true);
                        }
                    } catch (eRehighlight) { /* ignore */ }
                }
            }
            if (sharePreviewDataReady && !sharePreviewInitialFitted) {
                sharePreviewInitialFitted = true;
                sharePreviewFitView(smm);
            }
        };

        var onDrawClick = function (e) {
            if (sharePreviewSuppressDrawClickClear) {
                sharePreviewSuppressDrawClickClear = false;
                return;
            }
            if (sharePreviewIsNodeClickEvent(e)) return;
            sharePreviewClearSmmActiveNodes(smm);
            if (typeof opts.onBlankClick === 'function') opts.onBlankClick();
        };

        var onExpandBtnClick = function (node) {
            if (node && node.getData && node.getData('expand') !== false) {
                sharePreviewUnregisterCollapsedNode(node);
            } else if (node) {
                sharePreviewRegisterCollapsedNode(node);
            }
            var onExpandRenderEnd = function () {
                smm.off('node_tree_render_end', onExpandRenderEnd);
                if (!active || active.smm !== smm) return;
                if (node && node.getData && node.getData('expand') !== false) {
                    sharePreviewRestoreExpandedDomFallback(node, smm);
                } else if (node) {
                    sharePreviewApplyCollapsedNodeVisibility(node, smm);
                }
                sharePreviewSyncCollapsedVisibility(smm.renderer && smm.renderer.root, smm);
                sharePreviewScheduleCollapsedEnforce(smm);
            };
            smm.on('node_tree_render_end', onExpandRenderEnd);
        };

        smm.on('node_click', onNodeClick);
        smm.on('draw_click', onDrawClick);
        smm.on('expand_btn_click', onExpandBtnClick);
        smm.on('node_tree_render_end', onRenderEnd);

        var onZoomClick = function (e) {
            var btn = e.target.closest('[data-share-smm-zoom]');
            if (!btn || !wrap.contains(btn)) return;
            var action = btn.getAttribute('data-share-smm-zoom');
            if (action === 'in') sharePreviewZoomStep(smm, 0.12);
            else if (action === 'out') sharePreviewZoomStep(smm, -0.12);
            else sharePreviewFitView(smm);
        };
        wrap.addEventListener('click', onZoomClick);

        active = {
            smm: smm,
            rootEl: wrap,
            cleanup: function () {
                smm.off('node_click', onNodeClick);
                smm.off('draw_click', onDrawClick);
                smm.off('expand_btn_click', onExpandBtnClick);
                smm.off('node_tree_render_end', onRenderEnd);
                wrap.removeEventListener('click', onZoomClick);
                var inst = smm;
                try { inst.destroy(); } catch (eDestroy) { /* ignore */ }
            },
            highlightRow: function (rowIndex) {
                if (!smm || !smm.renderer) return;
                sharePreviewClearSmmActiveNodes(smm);
                if (rowIndex == null) return;
                var root = smm.renderer.root;
                var target = findSmmNodeByRowIndex(root, parseInt(rowIndex, 10));
                if (!target) return;
                sharePreviewActivateSmmCaseNode(smm, target);
            }
        };
        return active;
    }

    global.TcSharePreviewSmmCanvas = {
        mount: mount,
        destroy: destroyActive,
        buildSharePreviewSmmData: buildSharePreviewSmmData
    };
})(typeof window !== 'undefined' ? window : this);