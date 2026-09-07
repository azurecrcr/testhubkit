/**
 * TestHub TC Workbench — L4 DOMAIN
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
function tcClearTableLayoutMaps() {
    Object.keys(columnVisible).forEach(function (k) { delete columnVisible[k]; });
    Object.keys(columnWidth).forEach(function (k) { delete columnWidth[k]; });
    Object.keys(rowHeights).forEach(function (k) { delete rowHeights[k]; });
}

/** 从 vxe 表格同步行数据、列宽、行高到全局（自动/手动暂存前调用） */
function tcSyncTableLayoutBeforeStash() {
    try {
        if (typeof commitTableCellEdit === 'function' && typeof tcEditingCell !== 'undefined' && tcEditingCell) {
            commitTableCellEdit(true);
        }
    } catch (e0) { /* ignore */ }
    try {
        var bridge = window.TcTableView && window.TcTableView._bridge;
        if (bridge) {
            if (typeof bridge.syncToGlobalForStash === 'function') {
                bridge.syncToGlobalForStash();
            } else if (typeof bridge.pullToGlobal === 'function') {
                bridge.pullToGlobal({ skipVueSync: true });
            }
            if (typeof bridge.syncLayoutToGlobal === 'function') {
                bridge.syncLayoutToGlobal();
            }
        }
    } catch (e1) { /* ignore */ }
}

/** 将暂存 payload 中的列显隐、列宽、行高恢复到全局状态 */
function tcApplyStashTableLayoutFromPayload(p) {
    var n = tableColumns.length;
    tcClearTableLayoutMaps();
    if (p && p.columnVisible && typeof p.columnVisible === 'object') {
        Object.keys(p.columnVisible).forEach(function (k) {
            var i = parseInt(k, 10);
            if (Number.isNaN(i) || i < 0 || i >= n) return;
            columnVisible[i] = p.columnVisible[k] !== false;
        });
    }
    if (p && p.columnWidth && typeof p.columnWidth === 'object') {
        Object.keys(p.columnWidth).forEach(function (k) {
            var i = parseInt(k, 10);
            var w = parseInt(p.columnWidth[k], 10);
            if (Number.isNaN(i) || i < 0 || i >= n || Number.isNaN(w) || w <= 0) return;
            columnWidth[i] = w;
        });
    }
    if (p && p.rowHeights && typeof p.rowHeights === 'object') {
        Object.keys(p.rowHeights).forEach(function (k) {
            var i = parseInt(k, 10);
            var h = parseInt(p.rowHeights[k], 10);
            if (Number.isNaN(i) || i < 0 || Number.isNaN(h) || h <= 0) return;
            rowHeights[i] = h;
        });
    }
    initColumnState();
    if (typeof updateRestoreButton === 'function') updateRestoreButton();
}

function collectTcStashPayload() {
    if (typeof tcSyncTableLayoutBeforeStash === 'function') tcSyncTableLayoutBeforeStash();
    const cols = tableColumns.map(function(c) { return String(c); });
    const n = cols.length;
    const rows = testCasesData.map(function(row) {
        const out = [];
        for (let i = 0; i < n; i++) {
            out.push(String(row[i] != null ? row[i] : ''));
        }
        return out;
    });
    return {
        scope: 'table',
        columns: cols,
        rows: rows,
        provenance: tcProvenanceArrayForStashPayload(rows.length),
        columnVisible: Object.assign({}, columnVisible),
        columnWidth: Object.assign({}, columnWidth),
        rowHeights: Object.assign({}, rowHeights)
    };
}

/** 暂存保存前置条件说明（按当前视图：表格 / 思维导图） */
function getTcStashSaveBlockReason() {
    if (typeof getTcStashActiveScope === 'function' && getTcStashActiveScope() === 'mindmap') {
        return typeof getTcMindmapStashSaveBlockReason === 'function' ? getTcMindmapStashSaveBlockReason() : '';
    }
    if (!tcTableTemplateApplied || !tableColumns || !tableColumns.length) {
        return '请先点击表格中的「选择模板」应用表头后再暂存。';
    }
    if (!testCasesData || !testCasesData.length) {
        return '当前表格没有用例行，请添加行或通过 AI / 导入写入用例后再暂存。';
    }
    return '';
}

function syncTcStashSaveFabHint() {
    var btn = document.getElementById('tc-stash-open-btn');
    if (!btn) return;
    var reason = getTcStashSaveBlockReason();
    if (reason) {
        btn.setAttribute('title', reason);
        btn.setAttribute('data-tc-stash-hint', reason);
        btn.setAttribute('aria-describedby', 'tc-stash-open-hint');
        btn.classList.add('tc-stash-open-btn--blocked');
    } else {
        var isMindmap = typeof getTcStashActiveScope === 'function' && getTcStashActiveScope() === 'mindmap';
        btn.setAttribute('title', isMindmap ? '将当前思维导图（含节点位置）保存为暂存' : '将当前测试用例表格（含列宽、行高、列显隐）保存为暂存');
        btn.removeAttribute('data-tc-stash-hint');
        btn.removeAttribute('aria-describedby');
        btn.classList.remove('tc-stash-open-btn--blocked');
    }
}

function tcTableRowsHaveCellContent(rows, colCount) {
    if (!rows || !rows.length) return false;
    var n = colCount;
    if (!n && typeof tableColumns !== 'undefined' && tableColumns) n = tableColumns.length;
    if (!n) return false;
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row) continue;
        for (var j = 0; j < n; j++) {
            if (String(row[j] != null ? row[j] : '').trim()) return true;
        }
    }
    return false;
}

function tcAutoRecoveryHasTableData() {
    if (typeof tableColumns === 'undefined' || !tableColumns || !tableColumns.length) return false;
    if (typeof testCasesData === 'undefined' || !testCasesData || !testCasesData.length) return false;
    return tcTableRowsHaveCellContent(testCasesData, tableColumns.length);
}

function tcAutoRecoveryHasMindmapData() {
    if (!tcTableTemplateApplied || !tableColumns || !tableColumns.length) return false;
    if (typeof tcMindmapStashHasContent === 'function' && tcMindmapStashHasContent()) return true;
    try {
        if (typeof tcMindmapSyncExternalMindFromInstance === 'function') {
            tcMindmapSyncExternalMindFromInstance();
        }
    } catch (e0) { /* ignore */ }
    var mind = typeof tcMindmapCaptureMindSnapshot === 'function' ? tcMindmapCaptureMindSnapshot() : null;
    return !!(mind && mind.data);
}

function saveTcAutoRecoveryPayload(payload) {
    if (!payload) return false;
    try {
        if (window.TcStashStorage && typeof TcStashStorage.saveAutoRecoveryOnLeave === 'function') {
            return !!TcStashStorage.saveAutoRecoveryOnLeave(payload);
        }
        if (window.TcStashStorage && typeof TcStashStorage.saveAutoRecovery === 'function') {
            TcStashStorage.saveAutoRecovery(payload);
            return true;
        }
        if (window.HfLocalStash && HfLocalStash.isAvailable) {
            HfLocalStash.tc.saveAutoRecovery(payload);
            return true;
        }
    } catch (e2) { /* ignore */ }
    return false;
}

/** 思维导图视图：刷新/离开页面时自动暂存（含节点位置，scope: mindmap） */
function flushTcMindmapAutoRecoverySnapshot() {
    if (!document.querySelector('.tc-workbench-scope, .tc-hub-scope, #tc-stash-open-btn')) return false;
    try {
        if (typeof tcMindmapCommitEditing === 'function') tcMindmapCommitEditing();
        if (typeof tcMindmapSyncExternalMindFromInstance === 'function') {
            tcMindmapSyncExternalMindFromInstance();
        }
    } catch (e0) { /* ignore */ }
    if (!tcAutoRecoveryHasMindmapData()) return false;
    if (typeof collectTcMindmapStashPayload !== 'function') return false;
    var payload;
    try {
        payload = collectTcMindmapStashPayload();
    } catch (e) {
        return false;
    }
    if (!payload || !payload.columns || !payload.columns.length) return false;
    payload.scope = 'mindmap';
    return saveTcAutoRecoveryPayload(payload);
}
window.flushTcMindmapAutoRecoverySnapshot = flushTcMindmapAutoRecoverySnapshot;

/** 登录用户：刷新/离开页面时若表格有数据则自动暂存（服务端自动保存-条目） */
function flushTcTableAutoRecoverySnapshot() {
    if (!document.querySelector('.tc-workbench-scope, .tc-hub-scope, #tc-stash-open-btn')) return false;
    try {
        if (typeof tcEditingCell !== 'undefined' && tcEditingCell &&
            typeof commitTableCellEdit === 'function') {
            commitTableCellEdit(true);
        }
    } catch (e0) { /* ignore */ }
    if (typeof tcSyncTableLayoutBeforeStash === 'function') tcSyncTableLayoutBeforeStash();
    if (!tcAutoRecoveryHasTableData()) return false;
    if (typeof collectTcStashPayload !== 'function') return false;
    var payload;
    try {
        payload = collectTcStashPayload();
    } catch (e) {
        return false;
    }
    if (!payload || !payload.columns || !payload.columns.length) return false;
    if (!payload.rows || !payload.rows.length) return false;
    if (!tcTableRowsHaveCellContent(payload.rows, payload.columns.length)) return false;
    payload.scope = 'table';
    return saveTcAutoRecoveryPayload(payload);
}

/** 按当前视图（表格 / 思维导图）写入对应 scope 的自动暂存 */
function flushTcAutoRecoverySnapshot() {
    if (!document.querySelector('.tc-workbench-scope, .tc-hub-scope, #tc-stash-open-btn')) return false;
    var scope = typeof getTcStashActiveScope === 'function' ? getTcStashActiveScope() : 'table';
    if (scope === 'mindmap') return flushTcMindmapAutoRecoverySnapshot();
    return flushTcTableAutoRecoverySnapshot();
}
window.flushTcAutoRecoverySnapshot = flushTcAutoRecoverySnapshot;

function initTcAutoRecoveryOnLeave() {
    if (window._tcAutoRecoveryBound) return;
    window._tcAutoRecoveryBound = true;
    var lastSent = 0;
    function sendAutoRecoverySnapshot() {
        var now = Date.now();
        if (now - lastSent < 200) return;
        lastSent = now;
        flushTcAutoRecoverySnapshot();
    }
    window.addEventListener('pagehide', sendAutoRecoverySnapshot);
    window.addEventListener('beforeunload', sendAutoRecoverySnapshot);
}

(function tcAutoRecoveryBoot() {
    function boot() {
        if (typeof initTcAutoRecoveryOnLeave === 'function') initTcAutoRecoveryOnLeave();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
    window.addEventListener('load', boot);
})();


function paintTcStashStorageHint(scope) {
    scope = scope || 'all';
    if (scope !== 'all' && scope !== 'save') return;
    var saveHint = document.getElementById('tc-stash-save-modal-hint');
    var blockReason = typeof getTcStashSaveBlockReason === 'function' ? getTcStashSaveBlockReason() : '';
    if (saveHint) {
        if (blockReason) {
            saveHint.textContent = blockReason;
            saveHint.classList.remove('hidden');
        } else if (window.TcStashStorage && typeof TcStashStorage.retentionHintHtml === 'function') {
            var stashHintHtml = TcStashStorage.retentionHintHtml();
            if (stashHintHtml && String(stashHintHtml).trim()) {
                saveHint.innerHTML = stashHintHtml;
                saveHint.classList.remove('hidden');
            } else {
                saveHint.textContent = '';
                saveHint.classList.add('hidden');
            }
        } else if (window.HfLocalStash && typeof HfLocalStash.retentionHintHtml === 'function') {
            saveHint.innerHTML = HfLocalStash.retentionHintHtml();
            saveHint.classList.remove('hidden');
        } else {
            saveHint.textContent = '';
            saveHint.classList.add('hidden');
        }
    }
    if (typeof syncTcStashSaveFabHint === 'function') syncTcStashSaveFabHint();
}

function applyTcStashDocument(doc) {
    if (typeof isTcWorkbenchGenerationActive === 'function' && isTcWorkbenchGenerationActive()) {
        if (typeof tcStashGenerationLockToast === 'function') tcStashGenerationLockToast();
        return;
    }
    if (!doc || !doc.payload) return;
    const p = doc.payload;
    const cols = Array.isArray(p.columns) ? p.columns.map(function(c) { return String(c); }) : [];
    if (!cols.length) {
        tcAppAlert('该暂存文件缺少列定义，无法恢复到表格。请尝试其它条目或重新保存。', {
            variant: 'error',
            title: '暂存无效',
            hint: '若问题持续出现，可删除该暂存后重新保存当前表格。'
        });
        return;
    }
    const rawRows = Array.isArray(p.rows) ? p.rows : [];
    const rows = rawRows.map(function(row) {
        const out = [];
        for (let i = 0; i < cols.length; i++) {
            out.push(Array.isArray(row) && row[i] != null ? String(row[i]) : '');
        }
        return out;
    });
    tableColumns = cols;
    testCasesData = rows;
    testCasesProvenance = tcProvenanceArrayFromStashPayload(p, rows.length);
    tcEnsureProvenanceLength();
    tcTableTemplateApplied = true;
    tcActiveTemplateId = null;
    markedRows = new Set();
    selectedRows.clear();
    tcTableResetUndoHistory();
    tcApplyStashTableLayoutFromPayload(p);
    renderTableHeader();
    renderTableBody({ reload: true });
    if (typeof updateRestoreButton === 'function') updateRestoreButton();
    syncTcTableTemplateChrome();
    closeTcStashPreviewModal();
    closeTcStashRestoreModal();
    tcTableEnsureHistoryReady();
    if (typeof initTcTableCellInteraction === 'function') initTcTableCellInteraction();
    if (typeof scheduleReleaseWorkbenchInteractionLocks === 'function') scheduleReleaseWorkbenchInteractionLocks();
    if (typeof flushTcAutoRecoverySnapshot === 'function') {
        window.setTimeout(flushTcAutoRecoverySnapshot, 300);
    }
    const t = doc.title || '未命名暂存';
    tcAppToast('已用「' + t + '」覆盖当前表格（含表头、行数据与列宽/行高/列显隐）。', { variant: 'success', duration: 3800 });
}

function appendTcStashDocument(doc) {
    if (typeof isTcWorkbenchGenerationActive === 'function' && isTcWorkbenchGenerationActive()) {
        if (typeof tcStashGenerationLockToast === 'function') tcStashGenerationLockToast();
        return;
    }
    if (!doc || !doc.payload) return;
    const p = doc.payload;
    const stashCols = Array.isArray(p.columns) ? p.columns.map(function(c) { return String(c); }) : [];
    const rawRows = Array.isArray(p.rows) ? p.rows : [];
    if (!stashCols.length) {
        tcAppAlert('该暂存文件缺少列定义，无法追加到表格。', { variant: 'error', title: '暂存无效' });
        return;
    }
    if (!tcTableTemplateApplied || !tableColumns.length) {
        tableColumns = stashCols.slice();
        tcTableTemplateApplied = true;
        tcActiveTemplateId = null;
        columnVisible = {};
        columnWidth = {};
        initColumnState();
        renderTableHeader();
        syncTcTableTemplateChrome();
    }
    const n = tableColumns.length;
    const sameHeaders = JSON.stringify(tableColumns.map(String)) === JSON.stringify(stashCols);
    function runAppendTcStashRows() {
        let added = 0;
        rawRows.forEach(function(row, ri) {
            if (!Array.isArray(row)) return;
            const out = [];
            for (let i = 0; i < n; i++) {
                out.push(i < row.length && row[i] != null ? String(row[i]) : '');
            }
            testCasesData.push(out);
            var provRaw = Array.isArray(p.provenance) ? p.provenance[ri] : null;
            testCasesProvenance.push(tcCloneProvenanceEntry(provRaw));
            added += 1;
        });
        tcEnsureProvenanceLength();
        closeTcStashPreviewModal();
        closeTcStashRestoreModal();
        renderTableBody({ reload: true });
        if (added > 0) tcTableRecordAfterMutation();
        tcAppToast('已从暂存追加 ' + added + ' 行到表格末尾。', { variant: 'success', duration: 3600 });
    }
    if (!sameHeaders) {
        tcAppConfirm('暂存中的列名与当前表格不完全一致。系统将按当前列顺序对齐单元格，并把各行追加到表格末尾。', {
            title: '表头不一致',
            variant: 'warning',
            confirmText: '继续追加',
            cancelText: '取消',
            hint: '不会修改您当前的表头，仅对齐每行数据。'
        }).then(function (ok) {
            if (!ok) return;
            runAppendTcStashRows();
        });
        return;
    }
    runAppendTcStashRows();
}

let tcStashRestoreDoc = null;
let tcStashPreviewDoc = null;
let tcStashRenameId = null;

function showModal(el) {
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
    el.style.display = 'flex';
    el.setAttribute('aria-hidden', 'false');
}

function hideModal(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
    el.style.display = '';
    el.setAttribute('aria-hidden', 'true');
}

function handleTcStashOpenClick(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    openTcStashSaveModal();
}

function openTcStashSaveModal() {
    if (typeof ensureTcWorkbenchOverlaysMounted === 'function') ensureTcWorkbenchOverlaysMounted();
    if (typeof ensureTcStashOverlaysMounted === 'function') ensureTcStashOverlaysMounted();
    setTcStashRailCollapsed(true);
    paintTcStashStorageHint('save');
    const m = document.getElementById('tc-stash-save-modal');
    const inp = document.getElementById('tc-stash-save-title');
    if (!m) {
        if (typeof tcAppAlert === 'function') {
            tcAppAlert('暂存弹窗未加载，请刷新页面后重试。', { variant: 'error', title: '暂存不可用' });
        }
        return;
    }
    if (m.parentElement !== document.body) document.body.appendChild(m);
    if (inp) inp.value = '';
    paintTcStashStorageHint('save');
    showModal(m);
    document.body.style.overflow = 'hidden';
    window.setTimeout(function() { if (inp) inp.focus(); }, 50);
}
window.openTcStashSaveModal = openTcStashSaveModal;
window.handleTcStashOpenClick = handleTcStashOpenClick;

function initTcStashSaveClickDelegate() {
    if (window._tcStashSaveClickDelegate) return;
    window._tcStashSaveClickDelegate = true;
    document.addEventListener('click', function(e) {
        if (isTcHubExcelTabActive()) return;
        var btn = e.target && e.target.closest ? e.target.closest('#tc-stash-open-btn') : null;
        if (!btn) return;
        handleTcStashOpenClick(e);
    });
}

function closeTcStashSaveModal() {
    hideModal(document.getElementById('tc-stash-save-modal'));
    if (!document.querySelector('#tc-stash-save-modal.flex, #tc-stash-preview-modal.flex, #tc-stash-restore-modal.flex, #tc-stash-rename-modal.flex, #tc-feature-unlock-modal.flex')) {
        document.body.style.overflow = '';
    }
}

function handleTcStashSaveSubmit() {
    const saveTitle = document.getElementById('tc-stash-save-title');
    const saveSubmit = document.getElementById('tc-stash-save-modal-submit');
    const title = saveTitle ? saveTitle.value.trim() : '';
    if (!title) {
        tcAppAlert('请为本次快照填写一个名称，便于在列表中识别与恢复。', {
            variant: 'warning',
            title: '需要名称',
            hint: '建议使用版本号、日期或需求简称。'
        });
        if (saveTitle) saveTitle.focus();
        return;
    }
    var blockReason = typeof getTcStashSaveBlockReason === 'function' ? getTcStashSaveBlockReason() : '';
    if (blockReason) {
        paintTcStashStorageHint('save');
        tcAppToast(blockReason, { variant: 'warning', duration: 4500 });
        return;
    }
    const payload = typeof collectTcStashPayloadForActiveView === 'function'
        ? collectTcStashPayloadForActiveView()
        : collectTcStashPayload();
    if (saveSubmit) saveSubmit.disabled = true;
    var stashPromise;
    if (window.TcStashStorage && typeof TcStashStorage.saveNew === 'function') {
        stashPromise = TcStashStorage.refreshAuth().then(function() {
            return TcStashStorage.saveNew(title, payload);
        });
    } else if (window.HfLocalStash && HfLocalStash.isAvailable) {
        stashPromise = Promise.resolve().then(function() {
            return HfLocalStash.tc.saveNew(title, payload);
        });
    } else {
        stashPromise = Promise.reject(new Error('当前浏览器无法使用本地暂存'));
    }
    stashPromise.then(function() {
        closeTcStashSaveModal();
        if (saveTitle) saveTitle.value = '';
        return refreshTcStashList();
    })
    .then(function() {
        var msg = (window.TcStashStorage && TcStashStorage.isServerMode())
            ? '已保存到您的账号。可在「暂存列表」中预览或恢复，换设备登录后仍可查看。'
            : '已保存到本机浏览器。可在「暂存列表」中预览或恢复。';
        tcAppToast(msg, { variant: 'success', duration: 3800 });
    })
    .catch(function(err) {
        tcAppAlert(err.message || '保存失败，请稍后重试。', { variant: 'error', title: '保存失败' });
    })
    .finally(function() {
        if (saveSubmit) saveSubmit.disabled = false;
    });
}

function initTcStashModalClickDelegate() {
    if (window._tcStashModalClickDelegate) return;
    window._tcStashModalClickDelegate = true;
    document.addEventListener('click', function(e) {
        if (isTcHubExcelTabActive()) return;
        var target = e.target;
        if (!target || !target.closest) return;

        if (target.closest('#tc-stash-rail-close-btn')) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof setTcStashRailCollapsed === 'function') setTcStashRailCollapsed(true);
            return;
        }
        if (target.closest('#tc-stash-save-modal-cancel')) {
            e.preventDefault();
            e.stopPropagation();
            closeTcStashSaveModal();
            return;
        }
    });
}

function openTcStashPreviewModal(doc) {
    tcStashPreviewDoc = doc && doc.payload ? doc : null;
    const m = document.getElementById('tc-stash-preview-modal');
    const t = document.getElementById('tc-stash-preview-modal-title');
    const restoreBtn = document.getElementById('tc-stash-preview-restore-btn');
    const tableWrap = document.getElementById('tc-stash-preview-table-wrap');
    if (t) t.textContent = doc && doc.title ? doc.title : '暂存预览';
    if (restoreBtn) restoreBtn.disabled = !tcStashPreviewDoc;
    var isMindmap = doc && doc.payload && typeof getTcStashPayloadScope === 'function' &&
        getTcStashPayloadScope(doc.payload) === 'mindmap';
    if (isMindmap && typeof renderStashMindmapInto === 'function') {
        renderStashMindmapInto('tc-stash-preview-table-wrap', doc);
    } else {
        renderStashTableInto('tc-stash-preview-table-wrap', doc);
    }
    showModal(m);
}

function closeTcStashPreviewModal() {
    tcStashPreviewDoc = null;
    const restoreBtn = document.getElementById('tc-stash-preview-restore-btn');
    if (restoreBtn) restoreBtn.disabled = true;
    hideModal(document.getElementById('tc-stash-preview-modal'));
}

function openTcStashRestoreModal(doc) {
    tcStashRestoreDoc = doc;
    const m = document.getElementById('tc-stash-restore-modal');
    const d = document.getElementById('tc-stash-restore-modal-desc');
    const appendBtn = document.getElementById('tc-stash-restore-append');
    const overwriteBtn = document.getElementById('tc-stash-restore-overwrite');
    const name = doc && doc.title ? doc.title : '该暂存';
    var isMindmap = window._tcStashRestoreMindmapMode ||
        (doc && doc.payload && typeof getTcStashPayloadScope === 'function' &&
            getTcStashPayloadScope(doc.payload) === 'mindmap');
    if (d) {
        d.textContent = isMindmap
            ? '将「' + name + '」恢复到思维导图：覆盖会替换当前导图结构与节点位置。'
            : '将「' + name + '」恢复到测试用例列表：覆盖会替换当前表头与全部行；追加会在末尾增加行且不删除现有数据。';
    }
    if (appendBtn) {
        appendBtn.classList.toggle('hidden', !!isMindmap);
        appendBtn.setAttribute('aria-hidden', isMindmap ? 'true' : 'false');
    }
    if (overwriteBtn) {
        overwriteBtn.textContent = isMindmap ? '覆盖当前思维导图' : '覆盖当前表格';
    }
    showModal(m);
}

function closeTcStashRestoreModal() {
    tcStashRestoreDoc = null;
    window._tcStashRestoreMindmapMode = false;
    const appendBtn = document.getElementById('tc-stash-restore-append');
    if (appendBtn) {
        appendBtn.classList.remove('hidden');
        appendBtn.setAttribute('aria-hidden', 'false');
    }
    hideModal(document.getElementById('tc-stash-restore-modal'));
}

function openTcStashRenameModal(stashId) {
    tcStashRenameId = stashId || null;
    const m = document.getElementById('tc-stash-rename-modal');
    const inp = document.getElementById('tc-stash-rename-title');
    if (!m || !inp || !stashId) return;
    inp.value = '';
    showModal(m);
    fetchTcStashById(stashId)
        .then(function (doc) {
            inp.value = (doc && doc.title) ? String(doc.title) : '';
            window.setTimeout(function () {
                inp.focus();
                if (typeof inp.select === 'function') inp.select();
            }, 30);
        })
        .catch(function (err) {
            tcAppAlert(err.message || '无法加载该暂存', { variant: 'error', title: '加载失败' });
            closeTcStashRenameModal();
        });
}

function closeTcStashRenameModal() {
    tcStashRenameId = null;
    const inp = document.getElementById('tc-stash-rename-title');
    if (inp) inp.value = '';
    hideModal(document.getElementById('tc-stash-rename-modal'));
}

function applyStashRestoreFlow(doc) {
    if (typeof isTcWorkbenchGenerationActive === 'function' && isTcWorkbenchGenerationActive()) {
        if (typeof tcStashGenerationLockToast === 'function') tcStashGenerationLockToast();
        return;
    }
    if (!doc || !doc.payload) return;
    var stashScope = typeof getTcStashPayloadScope === 'function' ? getTcStashPayloadScope(doc.payload) : 'table';
    var activeScope = typeof getTcStashActiveScope === 'function' ? getTcStashActiveScope() : 'table';
    if (stashScope !== activeScope) {
        tcAppToast(
            stashScope === 'mindmap'
                ? '该暂存属于思维导图，请先切换到思维导图视图后再恢复。'
                : '该暂存属于表格，请先切换到表格视图后再恢复。',
            { variant: 'warning', duration: 4200 }
        );
        return;
    }
    if (stashScope === 'mindmap') {
        if (typeof applyTcMindmapStashRestoreFlow === 'function') {
            applyTcMindmapStashRestoreFlow(doc);
        }
        return;
    }
    if (!testCasesData.length) {
        applyTcStashDocument(doc);
        tcAppToast('当前表格为空，已直接恢复「' + ((doc.title || '暂存').slice(0, 40)) + '」。', { variant: 'success', duration: 3400 });
        return;
    }
    closeTcStashPreviewModal();
    openTcStashRestoreModal(doc);
}

function renderStashTableInto(containerId, doc) {
    const wrap = document.getElementById(containerId);
    if (!wrap || !doc || !doc.payload) return;
    const cols = doc.payload.columns || [];
    const rows = doc.payload.rows || [];
    let html = '<table class="w-full border-collapse text-left text-xs"><thead><tr class="bg-slate-100">';
    cols.forEach(function(c) {
        html += '<th class="border border-gray-200 px-2 py-1.5 font-medium text-gray-700">' + escapeHtml(String(c)) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function(row) {
        html += '<tr>';
        cols.forEach(function(_, i) {
            const v = Array.isArray(row) && row[i] != null ? String(row[i]) : '';
            html += '<td class="border border-gray-200 px-2 py-1.5 align-top text-gray-700 whitespace-pre-wrap">' + escapeHtml(v) + '</td>';
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
}

function fetchTcStashById(sid) {
    if (window.TcStashStorage && typeof TcStashStorage.get === 'function') {
        return TcStashStorage.refreshAuth().then(function() {
            return TcStashStorage.get(sid);
        });
    }
    if (!window.HfLocalStash || !HfLocalStash.isAvailable) {
        return Promise.reject(new Error('当前浏览器无法使用本地暂存'));
    }
    return Promise.resolve(HfLocalStash.tc.get(sid));
}

function getTcStashMaxLimit() {
    if (window.TcStashStorage && typeof TcStashStorage.getMaxLimit === 'function') {
        return TcStashStorage.getMaxLimit();
    }
    if (window.HfLocalStash && typeof HfLocalStash.tcMaxItems === 'number') {
        return HfLocalStash.tcMaxItems;
    }
    return 10;
}
window.getTcStashMaxLimit = getTcStashMaxLimit;

function renderTcStashList(items, maxVal, scopeFilter) {
    const list = document.getElementById('tc-stash-list');
    scopeFilter = scopeFilter || (typeof getTcStashActiveScope === 'function' ? getTcStashActiveScope() : 'table');
    var filtered = (items || []).filter(function (it) {
        if (!it) return false;
        var itemScope = it.scope;
        if (!itemScope && it.payload && typeof getTcStashPayloadScope === 'function') {
            itemScope = getTcStashPayloadScope(it.payload);
        }
        if (!itemScope) itemScope = 'table';
        return itemScope === scopeFilter;
    });
    try { window._tcStashListCount = filtered.length; } catch (e0) { /* ignore */ }
    const badgeCount = document.getElementById('tc-stash-count-badge');
    const badgeMax = document.getElementById('tc-stash-max-badge');
    if (!list) return;
    const m = typeof maxVal === 'number' ? maxVal : getTcStashMaxLimit();
    if (badgeCount) badgeCount.textContent = String(filtered.length);
    if (badgeMax) badgeMax.textContent = String(m);
    if (!filtered.length) {
        list.innerHTML = '<p class="px-2 py-8 text-center text-sm text-gray-400">' +
            (scopeFilter === 'mindmap' ? '暂无思维导图暂存' : '暂无暂存') +
            '</p>';
        return;
    }
    const svgRestore = '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>';
    const svgEdit = '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>';
    const svgDel = '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>';
    list.innerHTML = filtered.map(function(it) {
        const title = escapeHtml(it.title || '未命名暂存');
        const id = it.id;
        var scopeBadge = scopeFilter === 'mindmap'
            ? '<span class="mr-1 inline-flex rounded bg-violet-100 px-1 py-0.5 text-[10px] font-medium text-violet-700">导图</span>'
            : '';
        return (
            '<div class="tc-stash-row group relative flex min-h-[2.5rem] items-stretch border-b border-gray-100 last:border-b-0">' +
            '<button type="button" class="tc-stash-preview flex-1 min-w-0 px-2 py-2 pr-[5.75rem] text-left text-sm font-medium text-gray-800 hover:bg-indigo-50/80 truncate" data-id="' + id + '">' + scopeBadge + title + '</button>' +
            '<div class="tc-stash-row-actions absolute right-0 top-0 bottom-0 z-10 flex items-center gap-0.5 bg-gradient-to-l from-white from-55% via-white/95 to-transparent pl-12 pr-1">' +
            '<button type="button" class="tc-stash-edit-btn flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-600 hover:bg-slate-100" data-id="' + id + '" title="重命名">' + svgEdit + '</button>' +
            '<button type="button" class="tc-stash-restore-btn flex h-8 w-8 shrink-0 items-center justify-center rounded text-emerald-600 hover:bg-emerald-50" data-id="' + id + '" title="恢复">' + svgRestore + '</button>' +
            '<button type="button" class="tc-stash-delete-btn flex h-8 w-8 shrink-0 items-center justify-center rounded text-red-600 hover:bg-red-50" data-id="' + id + '" title="删除">' + svgDel + '</button>' +
            '</div></div>'
        );
    }).join('');
}

function refreshTcStashList() {
    if (window.TcStashStorage && typeof TcStashStorage.list === 'function') {
        return TcStashStorage.refreshAuth().then(function() {
            return TcStashStorage.list();
        }).then(function(data) {
            var maxVal = typeof data.max === 'number' ? data.max : getTcStashMaxLimit();
            renderTcStashList(data.items || [], maxVal);
            return data;
        }).catch(function(err) {
            renderTcStashList([], getTcStashMaxLimit());
            return Promise.reject(err);
        });
    }
    if (!window.HfLocalStash || !HfLocalStash.isAvailable) {
        renderTcStashList([], getTcStashMaxLimit());
        return Promise.reject(new Error('当前浏览器无法使用本地暂存'));
    }
    try {
        var data = HfLocalStash.tc.list();
        var maxVal = typeof data.max === 'number' ? data.max : getTcStashMaxLimit();
        renderTcStashList(data.items || [], maxVal);
        return Promise.resolve(data);
    } catch (err) {
        renderTcStashList([], getTcStashMaxLimit());
        return Promise.reject(err);
    }
}
window.refreshTcStashList = refreshTcStashList;
window.paintTcStashStorageHint = paintTcStashStorageHint;

function isTcWorkbenchGenerationActive() {
    if (typeof window.isTcLeftPanelNavLocked === 'function' && window.isTcLeftPanelNavLocked()) {
        return true;
    }
    if (window.TcAgentOrchestrator && typeof window.TcAgentOrchestrator.isGenModeLocked === 'function') {
        return window.TcAgentOrchestrator.isGenModeLocked();
    }
    return false;
}

function tcStashGenerationLockToast() {
    if (typeof tcAppToast === 'function') {
        tcAppToast('用例生成中，暂不可使用暂存列表', { variant: 'warning', duration: 2600 });
    }
}

function syncTcStashRailGenerationLock() {
    var locked = isTcWorkbenchGenerationActive();
    var expandBtn = document.getElementById('tc-stash-rail-expand-btn');
    var floatWrap = document.getElementById('tc-stash-rail-float-wrap');
    var railCol = document.getElementById('tc-stash-rail-col');
    if (expandBtn) {
        expandBtn.disabled = locked;
        expandBtn.classList.toggle('tc-stash-rail-expand-btn--gen-locked', locked);
        if (locked) {
            expandBtn.setAttribute('aria-disabled', 'true');
            expandBtn.title = '用例生成中，暂不可使用暂存列表';
            expandBtn.setAttribute('aria-label', expandBtn.title);
        } else {
            expandBtn.removeAttribute('aria-disabled');
            if (typeof syncTcStashRailFabUi === 'function') syncTcStashRailFabUi();
        }
    }
    if (floatWrap) {
        floatWrap.classList.toggle('tc-stash-rail-float-wrap--gen-locked', locked);
    }
    if (railCol) {
        railCol.classList.toggle('tc-stash-rail-col--gen-locked', locked);
        if (locked) {
            railCol.setAttribute('inert', '');
        } else {
            railCol.removeAttribute('inert');
        }
    }
    if (locked) {
        var split = document.getElementById('tc-stash-split');
        if (split && !split.classList.contains('tc-stash-rail--collapsed') && typeof setTcStashRailCollapsed === 'function') {
            setTcStashRailCollapsed(true);
        }
    }
}
window.isTcWorkbenchGenerationActive = isTcWorkbenchGenerationActive;
window.syncTcStashRailGenerationLock = syncTcStashRailGenerationLock;

function syncTcStashRailFabUi() {
    var split = document.getElementById('tc-stash-split');
    var btn = document.getElementById('tc-stash-rail-expand-btn');
    var iconShow = document.getElementById('tc-stash-rail-fab-icon-show');
    var iconHide = document.getElementById('tc-stash-rail-fab-icon-hide');
    if (!split || !btn) return;
    var collapsed = split.classList.contains('tc-stash-rail--collapsed');
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    var openLabel = '展开暂存列表';
    var closeLabel = '收起暂存列表';
    btn.title = collapsed ? openLabel : closeLabel;
    btn.setAttribute('aria-label', collapsed ? openLabel : closeLabel);
    btn.classList.toggle('tc-stash-rail-expand-btn--active', !collapsed);
    if (iconShow && iconHide) {
        iconShow.classList.toggle('hidden', !collapsed);
        iconHide.classList.toggle('hidden', collapsed);
    }
}

function syncBackToTopButtonVisibility() {
    var btn = document.getElementById('tc-back-to-top-btn');
    if (!btn) return;
    if (isTcHubExcelTabActive()) {
        btn.classList.remove('tc-back-to-top-btn--visible');
        btn.setAttribute('aria-hidden', 'true');
        return;
    }
    var scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    var threshold = window.innerHeight || document.documentElement.clientHeight || 0;
    var visible = scrollTop > threshold;
    btn.classList.toggle('tc-back-to-top-btn--visible', visible);
    btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function initBackToTopButton() {
    var btn = document.getElementById('tc-back-to-top-btn');
    if (!btn) return;

    function update() {
        syncBackToTopButtonVisibility();
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    btn.addEventListener('click', function() {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        syncBackToTopButtonVisibility();
    });

    syncBackToTopButtonVisibility();
}

function syncTcStashListAnchorPosition() {
    var railCol = document.getElementById('tc-stash-rail-col');
    var expandBtn = document.getElementById('tc-stash-rail-expand-btn');
    if (!railCol || !expandBtn || railCol.classList.contains('tc-stash-rail-col--collapsed')) return;
    if (railCol.dataset.listUserMoved === '1') return;

    var margin = 8;
    var gap = 8;
    var btnRect = expandBtn.getBoundingClientRect();
    var listW = railCol.offsetWidth || Math.min(352, window.innerWidth - margin * 2);
    var listH = railCol.offsetHeight || 200;

    var cx = btnRect.left + btnRect.width / 2;
    var cy = btnRect.top + btnRect.height / 2;
    var onLeft = cx < window.innerWidth * 0.5;
    var onTop = cy < window.innerHeight * 0.5;
    var left = onLeft ? (btnRect.right + gap) : (btnRect.left - listW - gap);
    var top = onTop ? (btnRect.bottom + gap) : (btnRect.top - listH - gap);

    left = Math.max(margin, Math.min(left, window.innerWidth - listW - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - listH - margin));

    railCol.style.position = 'fixed';
    railCol.style.left = left + 'px';
    railCol.style.top = top + 'px';
    railCol.style.right = 'auto';
    railCol.style.bottom = 'auto';
    railCol.style.transform = '';
    railCol.dataset.dragTx = '0';
    railCol.dataset.dragTy = '0';
}

function setTcStashRailCollapsed(collapsed) {
    if (!collapsed && typeof isTcWorkbenchGenerationActive === 'function' && isTcWorkbenchGenerationActive()) {
        if (typeof tcStashGenerationLockToast === 'function') tcStashGenerationLockToast();
        return;
    }
    const split = document.getElementById('tc-stash-split');
    const railCol = document.getElementById('tc-stash-rail-col');
    if (!split) return;
    if (collapsed) {
        split.classList.add('tc-stash-rail--collapsed');
    } else {
        if (typeof ensureTcStashOverlaysMounted === 'function') ensureTcStashOverlaysMounted();
        resetTcStashRailAnchorPosition();
        split.classList.remove('tc-stash-rail--collapsed');
    }
    if (railCol) {
        railCol.classList.toggle('tc-stash-rail-col--collapsed', collapsed);
        railCol.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
    }
    syncTcStashRailFabUi();
    if (!collapsed) {
        window.requestAnimationFrame(function () {
            syncTcStashListAnchorPosition();
        });
    }
    if (!collapsed && typeof refreshTcStashList === 'function') {
        Promise.resolve(refreshTcStashList()).then(function () {
            syncTcStashListAnchorPosition();
        }).catch(function () {});
        paintTcStashStorageHint('list');
    } else if (collapsed) {
        paintTcStashStorageHint('list');
    }
}

function resetTcStashRailAnchorPosition() {
    const railCol = document.getElementById('tc-stash-rail-col');
    if (!railCol) return;
    railCol.style.left = '';
    railCol.style.top = '';
    railCol.style.right = '';
    railCol.style.bottom = '';
    railCol.style.transform = '';
    railCol.dataset.dragTx = '0';
    railCol.dataset.dragTy = '0';
    delete railCol.dataset.listUserMoved;
}

function initTcStashRailDrag() {
    const railCol = document.getElementById('tc-stash-rail-col');
    const dragHandle = document.getElementById('tc-stash-rail-drag-handle');
    if (!railCol || !dragHandle) return;

    let pointerDown = false;
    let dragging = false;
    let activePointerId = null;
    const dragThreshold = 4;
    let startX = 0;
    let startY = 0;
    let startTx = 0;
    let startTy = 0;
    let currentTx = 0;
    let currentTy = 0;
    let startRect = null;

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function applyTranslate(tx, ty) {
        currentTx = tx;
        currentTy = ty;
        railCol.style.transform = 'translate3d(' + tx + 'px, ' + ty + 'px, 0)';
        railCol.dataset.dragTx = String(tx);
        railCol.dataset.dragTy = String(ty);
    }

    function onPointerMove(e) {
        if (!pointerDown || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!dragging) {
            if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
            dragging = true;
            railCol.classList.add('tc-stash-rail--dragging');
            document.body.classList.add('tc-stash-dragging');
        }

        const minTx = 8 - startRect.left;
        const maxTx = window.innerWidth - 8 - (startRect.left + startRect.width);
        const minTy = 8 - startRect.top;
        const maxTy = window.innerHeight - 8 - (startRect.top + startRect.height);
        const nextTx = clamp(startTx + dx, minTx, maxTx);
        const nextTy = clamp(startTy + dy, minTy, maxTy);
        applyTranslate(nextTx, nextTy);
        railCol.dataset.listUserMoved = '1';
        e.preventDefault();
    }

    function endDrag() {
        pointerDown = false;
        activePointerId = null;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', endDrag);
        document.removeEventListener('pointercancel', endDrag);
        if (!dragging) return;
        dragging = false;
        railCol.classList.remove('tc-stash-rail--dragging');
        document.body.classList.remove('tc-stash-dragging');
        railCol.dataset.listUserMoved = '1';
    }

    dragHandle.addEventListener('pointerdown', function(e) {
        if (e.target.closest('#tc-stash-rail-close-btn')) return;
        if (railCol.classList.contains('tc-stash-rail-col--collapsed')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        startRect = railCol.getBoundingClientRect();
        pointerDown = true;
        dragging = false;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        startTx = Number(railCol.dataset.dragTx || '0');
        startTy = Number(railCol.dataset.dragTy || '0');
        currentTx = startTx;
        currentTy = startTy;
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', endDrag);
        document.addEventListener('pointercancel', endDrag);
    });
}

function initTcStashFabRootDrag(toggleRailFromUi) {
    var floatWrap = document.getElementById('tc-stash-rail-float-wrap');
    var handle = document.getElementById('tc-stash-rail-expand-btn');
    if (!floatWrap || !handle || handle._tcStashFabRootDragBound) return;
    handle._tcStashFabRootDragBound = true;

    var pointerDown = false;
    var dragging = false;
    var activePointerId = null;
    var dragThreshold = 5;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;
    var suppressExpandClick = false;

    function applyFabPosition(left, top) {
        floatWrap.style.position = 'fixed';
        floatWrap.style.left = left + 'px';
        floatWrap.style.top = top + 'px';
        floatWrap.style.right = 'auto';
        floatWrap.style.bottom = 'auto';
    }

    function clampFabPos(left, top) {
        var r = floatWrap.getBoundingClientRect();
        var w = r.width > 0 ? r.width : 56;
        var h = r.height > 0 ? r.height : 160;
        var margin = 8;
        return {
            left: Math.max(margin, Math.min(left, window.innerWidth - w - margin)),
            top: Math.max(margin, Math.min(top, window.innerHeight - h - margin))
        };
    }

    function onFabPointerMove(e) {
        if (!pointerDown || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!dragging) {
            if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
            dragging = true;
            suppressExpandClick = true;
            floatWrap.classList.add('tc-stash-fab-col--dragging');
            document.body.classList.add('tc-stash-fab-dragging');
        }
        var p = clampFabPos(startLeft + dx, startTop + dy);
        applyFabPosition(p.left, p.top);
        e.preventDefault();
    }

    function endFabPointer(e) {
        if (activePointerId !== null && e && e.pointerId !== activePointerId) return;
        document.removeEventListener('pointermove', onFabPointerMove);
        document.removeEventListener('pointerup', endFabPointer);
        document.removeEventListener('pointercancel', endFabPointer);
        if (!pointerDown) return;
        var wasDrag = dragging;
        pointerDown = false;
        dragging = false;
        activePointerId = null;
        floatWrap.classList.remove('tc-stash-fab-col--dragging');
        document.body.classList.remove('tc-stash-fab-dragging');
        if (wasDrag) {
            window.setTimeout(function() { suppressExpandClick = false; }, 400);
            if (typeof syncTcStashListAnchorPosition === 'function') {
                syncTcStashListAnchorPosition();
            }
        } else if (typeof toggleRailFromUi === 'function') {
            if (typeof isTcWorkbenchGenerationActive === 'function' && isTcWorkbenchGenerationActive()) {
                if (typeof tcStashGenerationLockToast === 'function') tcStashGenerationLockToast();
                suppressExpandClick = true;
                window.setTimeout(function() { suppressExpandClick = false; }, 450);
            } else {
                toggleRailFromUi();
                suppressExpandClick = true;
                window.setTimeout(function() { suppressExpandClick = false; }, 450);
            }
        }
    }

    handle.addEventListener('click', function(e) {
        if (!suppressExpandClick) return;
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);

    handle.addEventListener('pointerdown', function(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.stopPropagation();
        pointerDown = true;
        dragging = false;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        var rect = floatWrap.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        if (handle.setPointerCapture) {
            try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
        document.addEventListener('pointermove', onFabPointerMove);
        document.addEventListener('pointerup', endFabPointer);
        document.addEventListener('pointercancel', endFabPointer);
    });
}

function initTcStashSaveFabDrag() {
    var saveWrap = document.getElementById('tc-stash-save-fab-wrap');
    var handle = document.getElementById('tc-stash-open-btn');
    if (!saveWrap || !handle || handle._tcStashSaveFabDragBound) return;
    handle._tcStashSaveFabDragBound = true;

    var pointerDown = false;
    var dragging = false;
    var activePointerId = null;
    var dragThreshold = 5;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;
    var suppressOpenClick = false;

    function applySaveFabPosition(left, top) {
        saveWrap.style.position = 'fixed';
        saveWrap.style.left = left + 'px';
        saveWrap.style.top = top + 'px';
        saveWrap.style.right = 'auto';
        saveWrap.style.bottom = 'auto';
    }

    function clampSaveFabPos(left, top) {
        var r = saveWrap.getBoundingClientRect();
        var w = r.width > 0 ? r.width : 56;
        var h = r.height > 0 ? r.height : 56;
        var margin = 8;
        return {
            left: Math.max(margin, Math.min(left, window.innerWidth - w - margin)),
            top: Math.max(margin, Math.min(top, window.innerHeight - h - margin))
        };
    }

    function onSavePointerMove(e) {
        if (!pointerDown || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!dragging) {
            if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
            dragging = true;
            suppressOpenClick = true;
            saveWrap.classList.add('tc-stash-save-fab-wrap--dragging');
            document.body.classList.add('tc-stash-fab-dragging');
        }
        var p = clampSaveFabPos(startLeft + dx, startTop + dy);
        applySaveFabPosition(p.left, p.top);
        e.preventDefault();
    }

    function endSavePointer(e) {
        if (activePointerId !== null && e && e.pointerId !== activePointerId) return;
        document.removeEventListener('pointermove', onSavePointerMove);
        document.removeEventListener('pointerup', endSavePointer);
        document.removeEventListener('pointercancel', endSavePointer);
        if (!pointerDown) return;
        pointerDown = false;
        dragging = false;
        activePointerId = null;
        saveWrap.classList.remove('tc-stash-save-fab-wrap--dragging');
        document.body.classList.remove('tc-stash-fab-dragging');
        if (suppressOpenClick) {
            window.setTimeout(function() { suppressOpenClick = false; }, 400);
        }
    }

    handle.addEventListener('click', function(e) {
        if (!suppressOpenClick) return;
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);

    handle.addEventListener('pointerdown', function(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.stopPropagation();
        pointerDown = true;
        dragging = false;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        var rect = saveWrap.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        if (handle.setPointerCapture) {
            try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
        document.addEventListener('pointermove', onSavePointerMove);
        document.addEventListener('pointerup', endSavePointer);
        document.addEventListener('pointercancel', endSavePointer);
    });
}

function bindTcStashOpenButton() {
    initTcStashSaveClickDelegate();
    const openBtn = document.getElementById('tc-stash-open-btn');
    if (!openBtn || openBtn._tcStashOpenBound) return;
    openBtn._tcStashOpenBound = true;
    openBtn.addEventListener('click', handleTcStashOpenClick);
}

function initTestCaseStashUi() {
    initTcStashSaveClickDelegate();
    if (window._tcStashUiBound) {
        bindTcStashOpenButton();
        initTcStashSaveFabDrag();
        if (typeof syncTcStashRailGenerationLock === 'function') syncTcStashRailGenerationLock();
        return;
    }
    window._tcStashUiBound = true;
    if (typeof ensureTcWorkbenchOverlaysMounted === 'function') {
        ensureTcWorkbenchOverlaysMounted();
    }
    ensureTcStashOverlaysMounted();
    setTcStashRailCollapsed(true);
    const openBtn = document.getElementById('tc-stash-open-btn');
    const list = document.getElementById('tc-stash-list');
    const saveModal = document.getElementById('tc-stash-save-modal');
    const saveSubmit = document.getElementById('tc-stash-save-modal-submit');
    const saveCancel = document.getElementById('tc-stash-save-modal-cancel');
    const previewModal = document.getElementById('tc-stash-preview-modal');
    const previewClose = document.getElementById('tc-stash-preview-modal-close');
    const restoreModal = document.getElementById('tc-stash-restore-modal');
    const restoreOverwrite = document.getElementById('tc-stash-restore-overwrite');
    const restoreAppend = document.getElementById('tc-stash-restore-append');
    const restoreCancel = document.getElementById('tc-stash-restore-cancel');
    const railExpand = document.getElementById('tc-stash-rail-expand-btn');
    const railClose = document.getElementById('tc-stash-rail-close-btn');

    function toggleTcStashRailFromUi() {
        const split = document.getElementById('tc-stash-split');
        const collapsed = split && split.classList.contains('tc-stash-rail--collapsed');
        setTcStashRailCollapsed(!collapsed);
    }

    initTcStashFabRootDrag(toggleTcStashRailFromUi);
    initTcStashSaveFabDrag();
    if (railClose) {
        function closeTcStashRailPanel(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            setTcStashRailCollapsed(true);
        }
        railClose.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        railClose.addEventListener('click', closeTcStashRailPanel);
    }
    syncTcStashRailFabUi();
    initTcStashRailDrag();
    initBackToTopButton();
    if (!window._tcStashListAnchorResizeBound) {
        window._tcStashListAnchorResizeBound = true;
        window.addEventListener('resize', function () {
            syncTcStashListAnchorPosition();
        }, { passive: true });
    }
    paintTcStashStorageHint();

    bindTcStashOpenButton();

    if (saveCancel) saveCancel.addEventListener('click', closeTcStashSaveModal);
    if (saveModal) {
        saveModal.addEventListener('click', function(e) {
            if (e.target === saveModal) closeTcStashSaveModal();
        });
    }

    const renameModal = document.getElementById('tc-stash-rename-modal');
    const renameTitle = document.getElementById('tc-stash-rename-title');
    const renameSubmit = document.getElementById('tc-stash-rename-modal-submit');
    const renameCancel = document.getElementById('tc-stash-rename-modal-cancel');
    if (renameCancel) renameCancel.addEventListener('click', closeTcStashRenameModal);
    if (renameModal) {
        renameModal.addEventListener('click', function(e) {
            if (e.target === renameModal) closeTcStashRenameModal();
        });
    }
    if (renameSubmit) {
        renameSubmit.addEventListener('click', function() {
            const sid = tcStashRenameId;
            const title = renameTitle ? renameTitle.value.trim() : '';
            if (!sid) return;
            if (!title) {
                tcAppAlert('请填写新的暂存名称。', { variant: 'warning', title: '名称不能为空' });
                if (renameTitle) renameTitle.focus();
                return;
            }
            renameSubmit.disabled = true;
            var renamePromise;
            if (window.TcStashStorage && typeof TcStashStorage.updateTitle === 'function') {
                renamePromise = TcStashStorage.refreshAuth().then(function() {
                    return TcStashStorage.updateTitle(sid, title);
                });
            } else if (window.HfLocalStash && HfLocalStash.isAvailable) {
                renamePromise = Promise.resolve().then(function() {
                    return HfLocalStash.tc.updateTitle(sid, title);
                });
            } else {
                renamePromise = Promise.reject(new Error('当前浏览器无法使用本地暂存'));
            }
            renamePromise.then(function() {
                    closeTcStashRenameModal();
                    return refreshTcStashList();
                })
                .then(function() {
                    tcAppToast('暂存名称已更新', { variant: 'success', duration: 2600 });
                })
                .catch(function(err) {
                    tcAppAlert(err.message || '重命名失败', { variant: 'error', title: '保存失败' });
                })
                .finally(function() {
                    renameSubmit.disabled = false;
                });
        });
    }
    if (saveSubmit) {
        saveSubmit.addEventListener('click', function(e) {
            e.preventDefault();
            handleTcStashSaveSubmit();
        });
    }

    if (previewClose) previewClose.addEventListener('click', closeTcStashPreviewModal);
    const previewRestoreBtn = document.getElementById('tc-stash-preview-restore-btn');
    if (previewRestoreBtn) {
        previewRestoreBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof isTcWorkbenchGenerationActive === 'function' && isTcWorkbenchGenerationActive()) {
                if (typeof tcStashGenerationLockToast === 'function') tcStashGenerationLockToast();
                return;
            }
            if (!tcStashPreviewDoc) return;
            applyStashRestoreFlow(tcStashPreviewDoc);
        });
    }
    if (previewModal) {
        previewModal.addEventListener('click', function(e) {
            if (e.target === previewModal) closeTcStashPreviewModal();
        });
    }

    if (restoreCancel) restoreCancel.addEventListener('click', closeTcStashRestoreModal);
    if (restoreModal) {
        restoreModal.addEventListener('click', function(e) {
            if (e.target === restoreModal) closeTcStashRestoreModal();
        });
    }
    if (restoreOverwrite) {
        restoreOverwrite.addEventListener('click', function() {
            if (typeof isTcWorkbenchGenerationActive === 'function' && isTcWorkbenchGenerationActive()) {
                if (typeof tcStashGenerationLockToast === 'function') tcStashGenerationLockToast();
                return;
            }
            if (!tcStashRestoreDoc) return;
            if (window._tcStashRestoreMindmapMode || (tcStashRestoreDoc.payload &&
                typeof getTcStashPayloadScope === 'function' &&
                getTcStashPayloadScope(tcStashRestoreDoc.payload) === 'mindmap')) {
                if (typeof applyTcMindmapStashDocument === 'function') {
                    applyTcMindmapStashDocument(tcStashRestoreDoc);
                }
            } else {
                applyTcStashDocument(tcStashRestoreDoc);
            }
            closeTcStashRestoreModal();
        });
    }
    if (restoreAppend) {
        restoreAppend.addEventListener('click', function() {
            if (typeof isTcWorkbenchGenerationActive === 'function' && isTcWorkbenchGenerationActive()) {
                if (typeof tcStashGenerationLockToast === 'function') tcStashGenerationLockToast();
                return;
            }
            if (!tcStashRestoreDoc) return;
            appendTcStashDocument(tcStashRestoreDoc);
            closeTcStashRestoreModal();
        });
    }

    if (list) {
        list.addEventListener('click', function(e) {
            if (typeof isTcWorkbenchGenerationActive === 'function' && isTcWorkbenchGenerationActive()) {
                var blockedBtn = e.target.closest('.tc-stash-restore-btn, .tc-stash-preview');
                if (blockedBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof tcStashGenerationLockToast === 'function') tcStashGenerationLockToast();
                    return;
                }
            }
                    const delBtn = e.target.closest('.tc-stash-delete-btn');
            const resBtn = e.target.closest('.tc-stash-restore-btn');
            const editBtn = e.target.closest('.tc-stash-edit-btn');
            const prevBtn = e.target.closest('.tc-stash-preview');
            if (delBtn && delBtn.getAttribute('data-id')) {
                e.preventDefault();
                e.stopPropagation();
                const sid = delBtn.getAttribute('data-id');
                var delMsg = (window.TcStashStorage && TcStashStorage.isServerMode())
                    ? '将从您的账号永久删除该暂存，且无法恢复。'
                    : '将从本机浏览器永久删除该暂存，且无法恢复。';
                tcAppConfirm(delMsg, {
                    title: '删除暂存？',
                    variant: 'warning',
                    confirmText: '删除',
                    cancelText: '保留'
                }).then(function (okDel) {
                    if (!okDel) return;
                    var delPromise;
                    if (window.TcStashStorage && typeof TcStashStorage.remove === 'function') {
                        delPromise = TcStashStorage.refreshAuth().then(function() {
                            return TcStashStorage.remove(sid);
                        });
                    } else if (window.HfLocalStash && HfLocalStash.isAvailable) {
                        delPromise = Promise.resolve().then(function() {
                            return HfLocalStash.tc.remove(sid);
                        });
                    } else {
                        delPromise = Promise.reject(new Error('当前浏览器无法使用本地暂存'));
                    }
                    delPromise.then(function() {
                            return refreshTcStashList();
                        })
                        .then(function() {
                            var okMsg = (window.TcStashStorage && TcStashStorage.isServerMode())
                                ? '暂存已从账号删除。'
                                : '暂存已从浏览器本地删除。';
                            tcAppToast(okMsg, { variant: 'info', duration: 2800 });
                        })
                        .catch(function(err) {
                            tcAppAlert(err.message || '删除失败，请稍后重试。', { variant: 'error', title: '删除失败' });
                        });
                });
                return;
            }
            if (editBtn && editBtn.getAttribute('data-id')) {
                e.preventDefault();
                e.stopPropagation();
                openTcStashRenameModal(editBtn.getAttribute('data-id'));
                return;
            }
            if (resBtn && resBtn.getAttribute('data-id')) {
                e.preventDefault();
                e.stopPropagation();
                const sid = resBtn.getAttribute('data-id');
                fetchTcStashById(sid).then(function(stash) {
                    applyStashRestoreFlow(stash);
                }).catch(function(err) {
                    tcAppAlert(err.message || '无法加载该暂存，请稍后重试。', { variant: 'error', title: '加载失败' });
                });
                return;
            }
            if (prevBtn && prevBtn.getAttribute('data-id')) {
                const sid = prevBtn.getAttribute('data-id');
                fetchTcStashById(sid).then(function(stash) {
                    openTcStashPreviewModal(stash);
                }).catch(function(err) {
                    tcAppAlert(err.message || '无法加载该暂存，请稍后重试。', { variant: 'error', title: '加载失败' });
                });
            }
        });
    }

    if (typeof syncTcStashRailGenerationLock === 'function') syncTcStashRailGenerationLock();

}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function applyClearManualImportInput() {
    const importInput = document.getElementById('import-test-cases');
    if (importInput) {
        importInput.value = '';
        importInput.dispatchEvent(new Event('input'));
    }
    hideManualImportInlineResult('list');
    clearManualMindmapImportInput();
    tcManualImportClearCache();
}

/** 清空手动导入两个输入框及结果提示（二次确认，样式与 AI 清空一致） */
function clearManualImportInput() {
    tcAppConfirm('将清空「测试用例列表」与「思维导图」输入框及导入结果提示；右侧已导入的表格与导图数据不受影响。', {
        title: '清空手动导入？',
        variant: 'warning',
        confirmText: '清空',
        cancelText: '保留',
        hint: '仅作用于手动导入分栏中的输入内容。'
    }).then(function(ok) {
        if (!ok) return;
        applyClearManualImportInput();
        tcAppToast('手动导入内容已清空。', { variant: 'success', duration: 2600 });
    });
}

function clearManualMindmapImportInput() {
    var input = document.getElementById('import-mindmap-text');
    if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input'));
    }
    hideManualImportInlineResult('mindmap');
}

function hideManualImportInlineResult(which) {
    var id = which === 'mindmap' ? 'import-mindmap-result' : 'import-result';
    var el = document.getElementById(id);
    if (el) {
        el.innerHTML = '';
        el.classList.add('hidden');
    }
}

function tcManualImportFailToast(message) {
    tcAppToast(String(message != null ? message : '导入失败'), {
        variant: 'error',
        duration: 4200
    });
}

// 导入测试用例
function manualImportTestCases() {
    if (!ensureTcTableTemplateApplied()) return;
    const importInput = document.getElementById('import-test-cases');
    const importResult = document.getElementById('import-result');
    
    if (!importInput || !importInput.value.trim()) {
        tcAppAlert('请先在「测试用例列表」中粘贴 Python 列表格式数据，再点击「导入用例列表」。', {
            variant: 'warning',
            title: '测试用例列表未填写',
            hint: '可参考该输入框占位示例，确保最外层为 [ ... ]。'
        });
        if (importInput) importInput.focus();
        return;
    }
    
    try {
        let testCasesStr = importInput.value.trim();
        
        // 使用parseAndAddTestCases函数来解析，不显示alert
        const addedCount = parseAndAddTestCases(testCasesStr, false, null);
        
        if (addedCount > 0) {
            hideManualImportInlineResult('list');
            importInput.value = '';
            tcManualImportDraft.list = '';
            tcManualImportPersistCacheNow();
            tcAppToast('已导入 ' + addedCount + ' 条测试用例。', { variant: 'success', duration: 3200 });
        } else {
            throw new Error('未能解析到有效的测试用例');
        }
    } catch (e) {
        console.error('导入失败:', e);
        hideManualImportInlineResult('list');
        tcManualImportFailToast(e.message || '未能解析到有效的测试用例');
    }
}

function tcExtractMindmapImportPayload(text) {
    var t = String(text != null ? text : '').trim();
    t = t.replace(/^例子\s*[:：]\s*/i, '');
    if (t.indexOf('```') >= 0) {
        var fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence && fence[1]) t = fence[1].trim();
        else t = t.replace(/```[\w]*\n?/gi, '').replace(/```/g, '');
    }
    return t.trim();
}

function tcMindmapNodeLabel(node) {
    if (!node || typeof node !== 'object') return '';
    return String(node.label != null ? node.label : (node.title != null ? node.title : (node.name || ''))).trim();
}

/** 解析 { label, children } 树形 JSON，叶子节点为用例名称，路径写入所属模块 */
function parseMindmapLabelTreeImport(treeRoot, showAlert) {
    if (!tcTableTemplateApplied || !tableColumns.length) {
        if (!ensureTcMindmapGenerateColumns()) return 0;
    }
    if (!treeRoot || typeof treeRoot !== 'object') return 0;
    var nameCol = getTcColumnIndex('用例名称', 0);
    var modCol = getTcColumnIndex('所属模块', 1);
    var added = 0;
    var rootLabel = tcMindmapNodeLabel(treeRoot);
    if (rootLabel) tcMindmapRootTopic = rootLabel;

    function pushLeaf(caseName, pathParts) {
        var caseLabel = String(caseName || '').trim();
        if (!caseLabel) return;
        var row = tableColumns.map(function() { return ''; });
        row[nameCol] = caseLabel;
        if (modCol >= 0) {
            row[modCol] = pathParts.length ? pathParts.join(' / ') : '未分类';
        }
        tcMindmapCasesData.push(row);
        added += 1;
    }

    function walk(node, pathParts) {
        var label = tcMindmapNodeLabel(node);
        if (!label) return;
        var kids = node.children;
        if (Array.isArray(kids) && kids.length > 0) {
            var branchPath = pathParts.concat([label]);
            kids.forEach(function(child) {
                walk(child, branchPath);
            });
            return;
        }
        pushLeaf(label, pathParts);
    }

    var basePath = rootLabel ? [rootLabel] : [];
    if (Array.isArray(treeRoot.children) && treeRoot.children.length) {
        treeRoot.children.forEach(function(child) {
            walk(child, basePath);
        });
    } else if (!Array.isArray(treeRoot.children)) {
        walk(treeRoot, []);
    }

    if (added === 0 && showAlert) {
        tcAppAlert('树形 JSON 中未识别到用例叶子节点：无 children 的节点将作为用例导入。', {
            variant: 'warning',
            title: '无有效用例',
            hint: '请检查 label 字段与 children 嵌套结构。'
        });
    }
    return added;
}

function tcMindmapJsonFieldValue(item, colName) {
    if (!item || typeof item !== 'object') return '';
    if (item[colName] !== undefined && item[colName] !== null) return String(item[colName]);
    var aliasMap = {
        '用例名称': ['name', 'case_name', 'caseName', 'title', '用例'],
        '所属模块': ['module', 'module_path', 'modulePath', 'path', '模块', '所属模块路径'],
        '标签': ['tag', 'tags', 'label'],
        '前置条件': ['precondition', 'pre_condition', '前置'],
        '步骤描述': ['steps', 'step', '步骤'],
        '预期结果': ['expected', 'expect', '预期'],
        '备注': ['remark', 'note', 'comments'],
        '用例等级': ['priority', 'level', 'grade', 'P1', 'p1']
    };
    var keys = aliasMap[colName];
    if (keys) {
        for (var i = 0; i < keys.length; i++) {
            if (item[keys[i]] !== undefined && item[keys[i]] !== null) {
                return String(item[keys[i]]);
            }
        }
    }
    return '';
}

/**
 * 手动导入思维导图：JSON 对象数组 / test_cases 包装 / Python 二维列表
 * 写入 tcMindmapCasesData（与列表隔离）
 */
function parseMindmapJsonOrDictImport(text, showAlert) {
    if (!tcTableTemplateApplied || !tableColumns.length) {
        if (!ensureTcMindmapGenerateColumns()) return 0;
    }
    var payload = tcExtractMindmapImportPayload(text);
    if (!payload) return 0;
    var parsed = null;
    try {
        parsed = JSON.parse(payload);
    } catch (e1) {
        var jsonStart = payload.search(/[\[\{]/);
        if (jsonStart >= 0) {
            try {
                parsed = JSON.parse(payload.slice(jsonStart));
            } catch (e2) { /* ignore */ }
        }
    }
    if (parsed == null) return 0;

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        var isLabelTree = (parsed.label != null || parsed.title != null || parsed.name != null) &&
            !Array.isArray(parsed.test_cases) && !Array.isArray(parsed.cases);
        if (isLabelTree) {
            var treeAdded = parseMindmapLabelTreeImport(parsed, showAlert);
            if (treeAdded > 0) return treeAdded;
        }
    }

    var list = null;
    if (Array.isArray(parsed)) {
        if (parsed.length && parsed[0] && typeof parsed[0] === 'object' &&
            (parsed[0].label != null || parsed[0].title != null) && parsed[0].children != null) {
            var forestAdded = 0;
            parsed.forEach(function(rootNode) {
                forestAdded += parseMindmapLabelTreeImport(rootNode, false);
            });
            if (forestAdded > 0) return forestAdded;
        }
        list = parsed;
    } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.test_cases)) list = parsed.test_cases;
        else if (Array.isArray(parsed.cases)) list = parsed.cases;
        else if (Array.isArray(parsed.data)) list = parsed.data;
    }
    if (!list || !list.length) return 0;

    var nameCol = getTcColumnIndex('用例名称', 0);
    var modCol = getTcColumnIndex('所属模块', 1);
    var added = 0;

    list.forEach(function(item) {
        if (item == null) return;
        if (Array.isArray(item)) {
            var rowFromArr = tableColumns.map(function(_, idx) {
                return item[idx] !== undefined && item[idx] !== null ? String(item[idx]) : '';
            });
            if (!String(rowFromArr[nameCol] || '').trim()) return;
            if (modCol >= 0 && rowFromArr[modCol]) {
                var partsArr = tcMindmapSplitModulePath(rowFromArr[modCol]);
                if (partsArr.length) rowFromArr[modCol] = partsArr.join(' / ');
            }
            tcMindmapCasesData.push(rowFromArr);
            added += 1;
            return;
        }
        if (typeof item !== 'object') return;
        var row = tableColumns.map(function(col) {
            return tcMindmapJsonFieldValue(item, col);
        });
        if (!String(row[nameCol] || '').trim()) return;
        if (modCol >= 0 && row[modCol]) {
            var parts = tcMindmapSplitModulePath(row[modCol]);
            if (parts.length) row[modCol] = parts.join(' / ');
        }
        tcMindmapCasesData.push(row);
        added += 1;
    });

    if (added > 0) {
        tcMindmapRootTopic = '测试用例';
    } else if (showAlert) {
        tcAppAlert('JSON 中未找到有效用例：请确保每条记录包含「用例名称」且为对象或数组格式。', {
            variant: 'warning',
            title: '无有效用例',
            hint: '对象字段名需与当前表头一致，例如用例名称、所属模块。'
        });
    }
    return added;
}

/** 手动导入：解析 JSON / Python 列表并写入思维导图（与列表数据隔离） */
function manualImportMindmapText() {
    if (!ensureTcMindmapGenerateColumns()) return;
    var input = document.getElementById('import-mindmap-text');
    var text = input ? input.value.trim() : '';
    if (!text) {
        tcAppAlert('请先在「思维导图」中粘贴 JSON 或 Python 列表，再点击「导入思维导图」。', {
            variant: 'warning',
            title: '思维导图未填写',
            hint: '可参考输入框中的 JSON 示例，或使用与表头一致的 test_cases 列表。'
        });
        if (input) input.focus();
        return;
    }
    try {
        var added = parseMindmapJsonOrDictImport(text, true);
        if (added === 0 && (/test_cases\s*=/.test(text) || /\[\s*(\[|\{)/.test(text))) {
            added = parseAndAddTestCases(text, false, null, {
                allowMindmapWithoutTemplate: true,
                useMindmapStore: true,
            });
        }
        if (added > 0) {
            switchTcRightView('mindmap');
            renderTcMindmap();
            if (typeof tcMindmapPersistCache === 'function') tcMindmapPersistCache();
            window.setTimeout(function() {
                if (typeof tcMindmapFitToView === 'function') tcMindmapFitToView();
            }, 120);
            hideManualImportInlineResult('mindmap');
            if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input'));
            }
            tcManualImportDraft.mindmap = '';
            tcManualImportPersistCacheNow();
            tcAppToast('已导入 ' + added + ' 条导图用例。', { variant: 'success', duration: 3200 });
        } else {
            throw new Error('未能解析为有效的 JSON 数组或 Python 列表，请检查格式与字段名');
        }
    } catch (e) {
        console.error('导图导入失败:', e);
        hideManualImportInlineResult('mindmap');
        tcManualImportFailToast(e.message || '未能解析为有效的 JSON 数组或 Python 列表，请检查格式与字段名');
    }
}

// 更新表头
