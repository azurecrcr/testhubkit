/**
 * TestHub TC Workbench — 思维导图暂存（scope: mindmap）
 * 与表格暂存共用 FAB / 列表 UI，payload 含 mind 树与 viewTransform。
 */
var tcMindmapPendingViewTransform = null;

function tcMindmapStashPrepareCapture() {
    if (typeof tcMindmapCommitEditing === 'function') tcMindmapCommitEditing();
    if (window.TcSmmEditor && typeof TcSmmEditor.ensure === 'function') {
        try { TcSmmEditor.ensure(); } catch (e0) { /* ignore */ }
    }
    if (typeof tcMindmapSyncExternalMindFromInstance === 'function') {
        tcMindmapSyncExternalMindFromInstance();
    }
}

function tcMindmapStashMindHasUserNodes(mind) {
    if (!mind || !mind.data) return false;
    var root = mind.data;
    return !!(Array.isArray(root.children) && root.children.length);
}

function tcMindmapStashResolveMindSnapshot() {
    tcMindmapStashPrepareCapture();
    var mind = typeof tcMindmapCaptureMindSnapshot === 'function' ? tcMindmapCaptureMindSnapshot() : null;
    if (tcMindmapStashMindHasUserNodes(mind)) return mind;
    var ext = typeof tcMindmapExternalMindData !== 'undefined' ? tcMindmapExternalMindData : null;
    if ((!ext || !ext.data) && typeof tcMindmapCommittedExternalMind !== 'undefined') {
        ext = tcMindmapCommittedExternalMind;
    }
    if (ext && ext.data && tcMindmapStashMindHasUserNodes(ext)) {
        return tcMindmapStashCloneMind(ext);
    }
    return mind;
}

/** 导图编辑后同步快照与暂存按钮状态；自动暂存仅在刷新/离开页面时触发 */
function tcMindmapNotifyStashDirty() {
    window._tcMindmapSessionDirty = true;
    tcMindmapStashPrepareCapture();
    if (typeof syncTcStashSaveFabHint === 'function') syncTcStashSaveFabHint();
}
window.tcMarkMindmapSessionDirty = function () {
    window._tcMindmapSessionDirty = true;
};

function getTcStashPayloadScope(payload) {
    return payload && payload.scope === 'mindmap' ? 'mindmap' : 'table';
}

function getTcStashActiveScope() {
    return (typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap') ? 'mindmap' : 'table';
}

function collectTcMindmapStashPayload(opts) {
    opts = opts || {};
    var mind = tcMindmapStashResolveMindSnapshot();
    var cols = tableColumns.map(function (c) { return String(c); });
    var n = cols.length;
    var sourceRows = (tcMindmapCasesData && tcMindmapCasesData.length)
        ? tcMindmapCasesData
        : (opts.allowTableRowFallback !== false ? testCasesData : []);
    var rows = (sourceRows || []).map(function (row) {
        var out = [];
        for (var i = 0; i < n; i++) {
            out.push(String(row[i] != null ? row[i] : ''));
        }
        return out;
    });
    var viewTransform = null;
    if (window.TcSmmEditor && typeof TcSmmEditor.captureViewTransform === 'function') {
        viewTransform = TcSmmEditor.captureViewTransform();
    }
    var tplMeta = typeof tcGetActiveTemplateMeta === 'function'
        ? tcGetActiveTemplateMeta()
        : { template_id: null, template_name: null };
    return {
        scope: 'mindmap',
        template_id: tplMeta.template_id,
        template_name: tplMeta.template_name,
        columns: cols,
        rows: rows,
        provenance: tcProvenanceArrayForStashPayload(rows.length),
        rootTopic: typeof tcMindmapRootTopic !== 'undefined' ? String(tcMindmapRootTopic || '') : '',
        mind: mind,
        viewTransform: viewTransform
    };
}

function collectTcStashPayloadForActiveView() {
    if (getTcStashActiveScope() === 'mindmap') {
        return collectTcMindmapStashPayload();
    }
    var payload = collectTcStashPayload();
    payload.scope = 'table';
    return payload;
}

function getTcMindmapStashSaveBlockReason() {
    if (!tcTableTemplateApplied || !tableColumns || !tableColumns.length) {
        return '请先点击表格中的「选择模板」应用表头后再暂存。';
    }
    var mind = tcMindmapStashResolveMindSnapshot();
    var hasNodes = tcMindmapStashMindHasUserNodes(mind);
    var hasRows = !!(tcMindmapCasesData && tcMindmapCasesData.length);
    if (!hasNodes && !hasRows) {
        return '当前思维导图为空，请添加节点或用例后再暂存。';
    }
    return '';
}

function tcMindmapStashHasContent() {
    var mind = tcMindmapStashResolveMindSnapshot();
    if (tcMindmapStashMindHasUserNodes(mind)) return true;
    if (tcMindmapCasesData && tcMindmapCasesData.length) return true;
    return false;
}

function tcMindmapStashCloneMind(mind) {
    if (!mind) return null;
    try {
        return JSON.parse(JSON.stringify(mind));
    } catch (e) {
        return null;
    }
}

function applyTcMindmapStashDocument(doc) {
    if (typeof isTcWorkbenchGenerationActive === 'function' && isTcWorkbenchGenerationActive()) {
        if (typeof tcStashGenerationLockToast === 'function') tcStashGenerationLockToast();
        return;
    }
    if (!doc || !doc.payload) return;
    var p = doc.payload;
    var cols = Array.isArray(p.columns) ? p.columns.map(function (c) { return String(c); }) : [];
    if (!cols.length) {
        tcAppAlert('该暂存缺少列定义，无法恢复思维导图。', {
            variant: 'error',
            title: '暂存无效'
        });
        return;
    }
    var rawRows = Array.isArray(p.rows) ? p.rows : [];
    var rows = rawRows.map(function (row) {
        var out = [];
        for (var i = 0; i < cols.length; i++) {
            out.push(Array.isArray(row) && row[i] != null ? String(row[i]) : '');
        }
        return out;
    });

    tableColumns = cols;
    tcTableTemplateApplied = true;
    if (typeof tcApplyStashTemplateMetaFromPayload === 'function') {
        tcApplyStashTemplateMetaFromPayload(p);
    } else {
        tcActiveTemplateId = null;
    }
    tcMindmapCasesData = rows.map(function (r) { return r.slice(); });
    testCasesData = rows.map(function (r) { return r.slice(); });
    testCasesProvenance = tcProvenanceArrayFromStashPayload(p, rows.length);
    tcEnsureProvenanceLength();
    markedRows = new Set();
    selectedRows.clear();
    if (typeof tcApplyStashTableLayoutFromPayload === 'function') {
        tcApplyStashTableLayoutFromPayload(p);
    } else {
        columnVisible = {};
        columnWidth = {};
        rowHeights = {};
        initColumnState();
    }
    if (typeof syncTcTableTemplateChrome === 'function') syncTcTableTemplateChrome();

    if (p.rootTopic) tcMindmapRootTopic = String(p.rootTopic);

    var mindClone = tcMindmapStashCloneMind(p.mind);
    if (mindClone && mindClone.data) {
        tcMindmapExternalMindData = mindClone;
        tcMindmapCommittedExternalMind = tcMindmapStashCloneMind(mindClone);
        window.tcMindmapExternalMindData = tcMindmapExternalMindData;
        window.tcMindmapCommittedExternalMind = tcMindmapCommittedExternalMind;
    } else if (typeof buildTcMindmapMindData === 'function') {
        var built = buildTcMindmapMindData();
        tcMindmapExternalMindData = built;
        tcMindmapCommittedExternalMind = tcMindmapStashCloneMind(built);
        window.tcMindmapExternalMindData = built;
        window.tcMindmapCommittedExternalMind = tcMindmapCommittedExternalMind;
    }

    tcMindmapPendingViewTransform = p.viewTransform || null;
    tcMindmapSkipCacheRestore = true;
    tcMindmapHistory = [];
    tcMindmapHistoryIndex = 0;
    tcMindmapUndoStack = [];

    if (typeof closeTcStashPreviewModal === 'function') closeTcStashPreviewModal();
    if (typeof closeTcStashRestoreModal === 'function') closeTcStashRestoreModal();

    if (typeof switchTcRightView === 'function') {
        switchTcRightView('mindmap');
    } else if (typeof renderTcMindmap === 'function') {
        if (typeof tcMindmapReleaseInstance === 'function') tcMindmapReleaseInstance();
        renderTcMindmap();
    }
    if (typeof renderTableHeader === 'function') {
        renderTableHeader();
    }

    if (typeof tcSyncWorkbenchGlobals === 'function') tcSyncWorkbenchGlobals();
    if (typeof tcMindmapPersistCache === 'function') {
        window.setTimeout(function () { tcMindmapPersistCache(); }, 200);
    }

    var title = doc.title || '未命名暂存';
    tcAppToast('已用「' + title + '」恢复思维导图（含节点位置）。', { variant: 'success', duration: 3800 });
}

function applyTcMindmapStashRestoreFlow(doc) {
    if (typeof isTcWorkbenchGenerationActive === 'function' && isTcWorkbenchGenerationActive()) {
        if (typeof tcStashGenerationLockToast === 'function') tcStashGenerationLockToast();
        return;
    }
    if (!doc || !doc.payload) return;
    if (!tcMindmapStashHasContent()) {
        applyTcMindmapStashDocument(doc);
        tcAppToast('当前导图为空，已直接恢复「' + ((doc.title || '暂存').slice(0, 40)) + '」。', {
            variant: 'success',
            duration: 3400
        });
        return;
    }
    if (typeof closeTcStashPreviewModal === 'function') closeTcStashPreviewModal();
    if (typeof openTcMindmapStashRestoreModal === 'function') {
        openTcMindmapStashRestoreModal(doc);
    } else {
        applyTcMindmapStashDocument(doc);
    }
}

function openTcMindmapStashRestoreModal(doc) {
    window._tcStashRestoreMindmapMode = true;
    if (typeof openTcStashRestoreModal === 'function') {
        openTcStashRestoreModal(doc);
    }
}

function renderStashMindmapInto(containerId, doc) {
    var wrap = document.getElementById(containerId);
    if (!wrap || !doc || !doc.payload) return;
    var p = doc.payload;
    var lines = [];
    var nodeCount = 0;

    function walk(node, depth) {
        if (!node || depth > 40) return;
        var topic = '';
        if (node.topic != null) topic = String(node.topic);
        else if (node.data && node.data.text != null) topic = String(node.data.text);
        topic = topic.replace(/\u200b/g, '').trim();
        if (topic && depth > 0) {
            lines.push(Array(depth).join('  ') + '• ' + topic);
            nodeCount += 1;
        }
        var children = node.children;
        if (!Array.isArray(children)) return;
        children.forEach(function (ch) { walk(ch, depth + 1); });
    }

    if (p.mind && p.mind.data) {
        walk(p.mind.data, 0);
    }

    var metaHtml = '<div class="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-slate-600">' +
        '思维导图暂存 · 用例行 ' + (Array.isArray(p.rows) ? p.rows.length : 0) +
        (nodeCount ? ' · 节点 ' + nodeCount : '') +
        (p.viewTransform ? ' · 含画布位置' : '') +
        '</div>';

    if (!lines.length) {
        wrap.innerHTML = metaHtml + '<p class="text-sm text-gray-500">暂无节点预览，恢复后将按用例数据重建导图。</p>';
        return;
    }

    wrap.innerHTML = metaHtml + '<pre class="whitespace-pre-wrap font-sans text-xs leading-relaxed text-gray-700">' +
        lines.map(function (line) { return escapeHtml(line); }).join('\n') +
        '</pre>';
}

function syncTcMindmapStashChrome() {
    var isMindmap = getTcStashActiveScope() === 'mindmap';
    var openBtn = document.getElementById('tc-stash-open-btn');
    var openLabel = document.getElementById('tc-stash-open-label');
    var listHint = document.getElementById('tc-stash-list-scope-hint');
    var previewRestoreBtn = document.getElementById('tc-stash-preview-restore-btn');

    if (openLabel) openLabel.textContent = '暂存';
    if (openBtn) {
        openBtn.setAttribute('aria-label', isMindmap ? '保存当前思维导图为暂存' : '保存当前表格为暂存');
    }
    if (listHint) {
        listHint.textContent = isMindmap
            ? '悬浮行右侧可恢复、编辑或删除；点击名称预览。右下角「暂存」保存当前思维导图（含节点位置）；离开页面时会自动写入「自动保存-」快照。数据仅存本机浏览器或您的账号。'
            : '悬浮行右侧可恢复、编辑或删除；点击名称预览。右下角「暂存」保存当前表格；离开页面时会自动写入「自动保存-」快照。数据仅存本机浏览器，不上传服务器。';
    }
    if (previewRestoreBtn) {
        previewRestoreBtn.setAttribute('title', isMindmap ? '恢复到当前思维导图' : '恢复到当前表格（覆盖或追加）');
    }
    if (typeof syncTcStashSaveFabHint === 'function') syncTcStashSaveFabHint();
}

window.getTcStashPayloadScope = getTcStashPayloadScope;
window.getTcStashActiveScope = getTcStashActiveScope;
window.collectTcMindmapStashPayload = collectTcMindmapStashPayload;
window.collectTcStashPayloadForActiveView = collectTcStashPayloadForActiveView;
window.getTcMindmapStashSaveBlockReason = getTcMindmapStashSaveBlockReason;
window.applyTcMindmapStashDocument = applyTcMindmapStashDocument;
window.applyTcMindmapStashRestoreFlow = applyTcMindmapStashRestoreFlow;
window.renderStashMindmapInto = renderStashMindmapInto;
window.syncTcMindmapStashChrome = syncTcMindmapStashChrome;
window.tcMindmapStashHasContent = tcMindmapStashHasContent;
window.tcMindmapStashPrepareCapture = tcMindmapStashPrepareCapture;
window.tcMindmapNotifyStashDirty = tcMindmapNotifyStashDirty;
