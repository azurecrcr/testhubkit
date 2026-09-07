/**
 * TestHub TC Workbench — L4 DOMAIN
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
function updateTableHeader() {
    renderTableHeader();
    renderColumnHeaderTags();
}

function renderColumnHeaderTags() {
    const tagContainer = document.getElementById('column-header-tags');
    if (!tagContainer) return;
    if (!tableColumns.length) {
        tagContainer.innerHTML = '';
        return;
    }
    tagContainer.innerHTML = tableColumns
        .map(col => `<span class="px-2 py-1 text-xs rounded-md bg-white border border-slate-200 text-slate-700">${col}</span>`)
        .join('');
}

function openColumnSettingsModal() {
    if (!ensureTcTableTemplateApplied()) return;
    const modal = document.getElementById('column-settings-modal');
    if (!modal) return;
    columnSettingsDraft = [...tableColumns];
    renderColumnSettingsList();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function renderColumnSettingsList() {
    const list = document.getElementById('column-settings-list');
    if (!list) return;
    list.innerHTML = columnSettingsDraft.map((col, idx) => `
        <div class="grid grid-cols-12 gap-3 items-center">
            <label class="col-span-2 text-sm text-slate-600">第 ${idx + 1} 列</label>
            <input data-col-idx="${idx}" type="text" class="col-span-8 form-input column-setting-input" value="${col}">
            <button type="button" onclick="removeColumnSetting(${idx})" class="col-span-2 btn btn-secondary text-xs px-2 py-1 text-red-600 border-red-200 hover:bg-red-50">
                删除
            </button>
        </div>
    `).join('');
}

function closeColumnSettingsModal() {
    const modal = document.getElementById('column-settings-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function getTcResetColumnDefaults() {
    if (tcActiveTemplateId) {
        var tpl = TC_CASE_TEMPLATES.find(function(t) { return t.id === tcActiveTemplateId; });
        if (tpl && tpl.columns && tpl.columns.length) return tpl.columns.slice();
    }
    return defaultTableColumns.slice();
}

function resetColumnSettingsDraft() {
    columnSettingsDraft = getTcResetColumnDefaults();
    renderColumnSettingsList();
}

function addColumnSetting() {
    const inputs = document.querySelectorAll('.column-setting-input');
    columnSettingsDraft = Array.from(inputs).map(input => input.value.trim());
    columnSettingsDraft.push(`新列${columnSettingsDraft.length + 1}`);
    renderColumnSettingsList();
}

function removeColumnSetting(idx) {
    const inputs = document.querySelectorAll('.column-setting-input');
    columnSettingsDraft = Array.from(inputs).map(input => input.value.trim());
    if (columnSettingsDraft.length <= 1) {
        tcAppAlert('表格至少需要保留一列，无法继续删除。', { variant: 'info', title: '无法删除' });
        return;
    }
    columnSettingsDraft.splice(idx, 1);
    renderColumnSettingsList();
}

function saveColumnSettings() {
    const inputs = document.querySelectorAll('.column-setting-input');
    if (!inputs.length) return;

    const nextColumns = Array.from(inputs).map((input, idx) => {
        const value = input.value.trim();
        return value || `未命名列${idx + 1}`;
    });

    tableColumns = nextColumns;
    columnVisible = {};
    columnWidth = {};
    renderColumnHeaderTags();
    closeColumnSettingsModal();
    if (window.TcTableView && typeof window.TcTableView.syncFromData === 'function') {
        window.TcTableView.syncFromData({ reload: true, immediate: true });
    } else {
        renderTableHeader();
    }
    tcTableRecordAfterMutation();
}

function resetColumnSettings() {
    tableColumns = getTcResetColumnDefaults();
    columnVisible = {};
    columnWidth = {};
    renderTableHeader();
    renderColumnHeaderTags();
}

// 渲染表头（VxeTable 模式：同步数据到表格）
function renderTableHeader() {
    if (!tcTableTemplateApplied || !tableColumns.length) {
        if (window.TcTableView && typeof window.TcTableView.reset === 'function') window.TcTableView.reset();
        renderTableBody({ reload: true });
        return;
    }
    initColumnState();
    renderTableBody({ reload: true });
}

function bindTableSelectAllCheckbox() {
    const box = document.getElementById('select-all-rows');
    if (!box) return;
    const clone = box.cloneNode(true);
    box.parentNode.replaceChild(clone, box);
    clone.addEventListener('change', function() {
        var displayCount = getTcTableBodyRowCount();
        if (!displayCount) {
            this.checked = false;
            return;
        }
        if (this.checked) {
            for (var i = 0; i < displayCount; i++) selectedRows.add(i);
        } else {
            selectedRows.clear();
        }
        renderTableBody();
    });
}

function syncSelectAllCheckboxState() {
    const box = document.getElementById('select-all-rows');
    var displayCount = getTcTableBodyRowCount();
    if (!box || !displayCount) return;
    var allOn = true;
    var someOn = false;
    for (var i = 0; i < displayCount; i++) {
        if (selectedRows.has(i)) someOn = true;
        else allOn = false;
    }
    box.checked = allOn;
    box.indeterminate = someOn && !allOn;
}

function toggleRowSelect(index, checked) {
    if (checked && index >= testCasesData.length) {
        ensureTcTableRowMaterialized(index);
    }
    if (checked) {
        selectedRows.add(index);
    } else {
        selectedRows.delete(index);
    }
    syncSelectAllCheckboxState();
}

// 切换列显示/隐藏
function toggleColumn(colIndex) {
    columnVisible[colIndex] = !columnVisible[colIndex];
    renderTableHeader();
    updateRestoreButton();
    tcTableRecordAfterMutation();
}

function tcBuildRestoreColumnChip(idx, col) {
    var safeCol = String(col != null ? col : '').replace(/"/g, '&quot;');
    return '<button type="button" onclick="toggleColumn(' + idx + ')" title="恢复「' + safeCol + '」列">+ ' + safeCol + '</button>';
}

function tcResolveRestoreColumnsMount() {
    return document.getElementById('tc-restore-columns-slot')
        || document.getElementById('tc-table-toolbar-right')
        || document.getElementById('tc-table-toolbar-center')
        || document.getElementById('table-toolbar');
}

// 更新恢复按钮显示
function updateRestoreButton() {
    const toolbar = document.getElementById('table-toolbar');
    const centerWrap = tcResolveRestoreColumnsMount();
    if (!toolbar) return;

    let restoreDiv = document.getElementById('restore-columns');
    const hiddenList = [];
    tableColumns.forEach((col, idx) => {
        if (!columnVisible[idx]) hiddenList.push({ col: col, idx: idx });
    });

    if (hiddenList.length) {
        if (!restoreDiv) {
            restoreDiv = document.createElement('div');
            restoreDiv.id = 'restore-columns';
        }
        if (restoreDiv.parentElement !== centerWrap) {
            centerWrap.appendChild(restoreDiv);
        }
        restoreDiv.className = 'tc-restore-columns';
        restoreDiv.innerHTML = hiddenList.map(function (item) {
            return tcBuildRestoreColumnChip(item.idx, item.col);
        }).join('');
        if (toolbar) toolbar.classList.add('tc-table-toolbar--has-restore');
    } else {
        if (restoreDiv) {
            restoreDiv.remove();
        }
        if (toolbar) toolbar.classList.remove('tc-table-toolbar--has-restore');
    }
}

function getTableRowHeight(index) {
    return rowHeights[index] || TC_DEFAULT_ROW_HEIGHT;
}

function getTableRowHeightStyle(index) {
    var h = getTableRowHeight(index);
    return ' height: ' + h + 'px; min-height: ' + h + 'px; max-height: ' + h + 'px;';
}

function tcTableSnapshotFromState() {
    tcEnsureProvenanceLength();
    return {
        rows: testCasesData.map(function(r) { return r.slice(); }),
        provenance: testCasesProvenance.map(function(p) { return tcCloneProvenanceEntry(p); }),
        columns: tableColumns.slice(),
        columnVisible: Object.assign({}, columnVisible),
        columnWidth: Object.assign({}, columnWidth),
        rowHeights: Object.assign({}, rowHeights),
        markedRows: Array.from(markedRows),
        selectedRows: Array.from(selectedRows)
    };
}

function tcTableCloneSnapshot(snap) {
    if (!snap) return { rows: [], provenance: [], columns: [], columnVisible: {}, columnWidth: {}, rowHeights: {}, markedRows: [], selectedRows: [] };
    return {
        rows: (snap.rows || []).map(function(r) { return r.slice(); }),
        provenance: (snap.provenance || []).map(function(p) { return tcCloneProvenanceEntry(p); }),
        columns: (snap.columns || []).slice(),
        columnVisible: Object.assign({}, snap.columnVisible || {}),
        columnWidth: Object.assign({}, snap.columnWidth || {}),
        rowHeights: Object.assign({}, snap.rowHeights || {}),
        markedRows: (snap.markedRows || []).slice(),
        selectedRows: (snap.selectedRows || []).slice()
    };
}

function tcTableSnapshotsEqual(a, b) {
    if (!a || !b) return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
        return false;
    }
}

function tcTableResetUndoHistory() {
    tcTableUndoHistory = [];
    tcTableUndoHistoryIndex = -1;
}

function tcTableEnsureHistoryReady() {
    if (!tcTableTemplateApplied || !tableColumns.length) return;
    if (tcTableUndoHistory.length) return;
    var snap = tcTableCloneSnapshot(tcTableSnapshotFromState());
    tcTableUndoHistory = [snap];
    tcTableUndoHistoryIndex = 0;
}

function tcTableRecordAfterMutation() {
    if (tcTableInUndoSync || !tcTableTemplateApplied) return;
    tcTableEnsureHistoryReady();
    var snap = tcTableCloneSnapshot(tcTableSnapshotFromState());
    if (tcTableUndoHistoryIndex >= 0 && tcTableSnapshotsEqual(tcTableUndoHistory[tcTableUndoHistoryIndex], snap)) return;
    tcTableUndoHistory = tcTableUndoHistory.slice(0, tcTableUndoHistoryIndex + 1);
    tcTableUndoHistory.push(snap);
    tcTableUndoHistoryIndex = tcTableUndoHistory.length - 1;
    while (tcTableUndoHistory.length > TC_TABLE_UNDO_MAX) {
        tcTableUndoHistory.shift();
        tcTableUndoHistoryIndex -= 1;
    }
    if (typeof window.TcRequirementCaseStore !== 'undefined' && typeof window.TcRequirementCaseStore.onTableMutation === 'function') {
        window.TcRequirementCaseStore.onTableMutation();
    }
    syncTcExportFabSheetItemsChrome();
    syncTcQualityCheckButtonChrome();
}

function tcTableCanUndo() {
    return tcTableUndoHistoryIndex > 0;
}

function tcTableRestoreSnapshot(snap) {
    if (!snap) return;
    tcTableInUndoSync = true;
    try {
        testCasesData = (snap.rows || []).map(function(r) { return r.slice(); });
        testCasesProvenance = (snap.provenance || []).map(function(p) { return tcCloneProvenanceEntry(p); });
        tcEnsureProvenanceLength();
        tableColumns = (snap.columns || []).slice();
        columnVisible = Object.assign({}, snap.columnVisible || {});
        columnWidth = Object.assign({}, snap.columnWidth || {});
        rowHeights = Object.assign({}, snap.rowHeights || {});
        markedRows = new Set(snap.markedRows || []);
        selectedRows = new Set(snap.selectedRows || []);
        tcFocusedCell = null;
        tcEditingCell = null;
        renderTableHeader();
        renderTableBody({ reload: true });
        updateRestoreButton();
    } finally {
        tcTableInUndoSync = false;
    }
}

function tcTableUndo() {
    if (!tcTableCanUndo()) {
        if (typeof hfFloatToast === 'function') {
            hfFloatToast('没有可撤销的操作', { placement: 'top', variant: 'info', duration: 2000 });
        } else {
            tcAppToast('没有可撤销的操作', { variant: 'info', duration: 2000 });
        }
        return false;
    }
    tcTableUndoHistoryIndex -= 1;
    var snap = tcTableUndoHistory[tcTableUndoHistoryIndex];
    if (!snap) {
        tcTableUndoHistoryIndex += 1;
        return false;
    }
    tcTableRestoreSnapshot(snap);
    if (tcTableUndoHistoryIndex === 0) {
        tcAppToast('已恢复到初始状态', { variant: 'info', duration: 2200 });
    } else {
        tcAppToast('已撤销上一步', { variant: 'info', duration: 2200 });
    }
    return true;
}

function tcTableHandleKeydown(e) {
    if (tcRightViewMode !== 'table') return;
    if (!(e.ctrlKey || e.metaKey) || (e.key !== 'z' && e.key !== 'Z')) return;
    if (e.shiftKey) return;
    var active = document.activeElement;
    if (active && active.closest && active.closest('#edit-modal')) return;
    if (active && active.closest && active.closest('#left-panel')) return;
    if (active && active.classList && active.classList.contains('tc-cell-editor')) return;
    if (active && active.closest && active.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (tcTableUndoHandling) return;
    tcTableUndoHandling = true;
    try {
        if (tcEditingCell) cancelTableCellEdit();
        tcTableUndo();
    } finally {
        window.setTimeout(function() { tcTableUndoHandling = false; }, 0);
    }
}

function tcTableBindKeyboardShortcuts() {
    if (window._tcTableUndoKeysBound) return;
    window._tcTableUndoKeysBound = true;
    document.addEventListener('keydown', tcTableHandleKeydown, true);
}

function shiftRowHeightsAfterDelete(deletedIndex) {
    var next = {};
    Object.keys(rowHeights).forEach(function(k) {
        var i = parseInt(k, 10);
        if (isNaN(i)) return;
        if (i < deletedIndex) next[i] = rowHeights[k];
        else if (i > deletedIndex) next[i - 1] = rowHeights[k];
    });
    rowHeights = next;
}

function remapRowHeightsByIndexMap(oldToNew) {
    var next = {};
    Object.keys(rowHeights).forEach(function(k) {
        var i = parseInt(k, 10);
        if (oldToNew.has(i)) next[oldToNew.get(i)] = rowHeights[k];
    });
    rowHeights = next;
}

function applyRowHeight(rowIndex, height) {
    var tr = document.querySelector('#table-body tr[data-row-index="' + rowIndex + '"]');
    if (tr) {
        tr.style.height = height + 'px';
        tr.querySelectorAll('td').forEach(function(td) {
            td.style.height = height + 'px';
            td.style.minHeight = height + 'px';
            td.style.maxHeight = height + 'px';
        });
    }
    if (window.TcTableView && window.TcTableView._bridge && typeof window.TcTableView._bridge.applyRowHeightsFromGlobal === 'function') {
        window.TcTableView._bridge.applyRowHeightsFromGlobal();
    }
}

// 列宽度调整
let isResizing = false;
let resizeCol = -1;
let isRowResizing = false;
let resizeRow = -1;
let startY = 0;
let startRowHeight = 0;
let startX = 0;
let startWidth = 0;

function startResize(e, colIndex) {
    isResizing = true;
    resizeCol = colIndex;
    startX = e.pageX;
    startWidth = colIndex === -1 ? actionColumnWidth : (columnWidth[colIndex] || 150);
    e.preventDefault();
}

function startRowResize(e, rowIndex) {
    isRowResizing = true;
    resizeRow = rowIndex;
    startY = e.pageY;
    var tr = e.target.closest('tr[data-row-index]');
    startRowHeight = getTableRowHeight(rowIndex);
    document.body.classList.add('tc-table-row-resizing');
    e.preventDefault();
    e.stopPropagation();
}

document.addEventListener('mousemove', function(e) {
    if (isRowResizing) {
        var newHeight = Math.max(32, startRowHeight + (e.pageY - startY));
        rowHeights[resizeRow] = newHeight;
        applyRowHeight(resizeRow, newHeight);
        return;
    }
    if (!isResizing) return;
    if (resizeCol === -1) {
        actionColumnWidth = Math.max(44, startWidth + (e.pageX - startX));
    } else {
        const newWidth = Math.max(80, startWidth + (e.pageX - startX));
        columnWidth[resizeCol] = newWidth;
    }
    renderTableHeader();
});

document.addEventListener('mouseup', function() {
    if (isRowResizing) {
        isRowResizing = false;
        resizeRow = -1;
        document.body.classList.remove('tc-table-row-resizing');
    }
    isResizing = false;
    resizeCol = -1;
});

/** 最近一次生成写入的起始行（供批次条/溯源推断） */
var _tcLastGenerationWriteStart = -1;

function tcResetGenerationWriteTracking() {
    _tcLastGenerationWriteStart = -1;
}

function tcRecordGenerationWriteStart(startIndex) {
    if (startIndex == null || startIndex < 0) return;
    if (_tcLastGenerationWriteStart < 0 || startIndex < _tcLastGenerationWriteStart) {
        _tcLastGenerationWriteStart = startIndex;
    }
}

function tcGetLastGenerationWriteStart() {
    return _tcLastGenerationWriteStart;
}

var TC_TABLE_DEFAULT_EMPTY_ROWS = 8;

function createTcTableEmptyRow() {
    if (!tableColumns || !tableColumns.length) return [];
    return tableColumns.map(function() { return ''; });
}

/** 判断表格行是否已有用例内容（非占位空行） */
function tcTableRowHasCaseContent(row) {
    if (!row || !Array.isArray(row)) return false;
    var nameCol = typeof resolveTcCaseNameColumnIndex === 'function'
        ? resolveTcCaseNameColumnIndex()
        : (typeof getTcColumnIndex === 'function' ? getTcColumnIndex('用例名称', 0) : 0);
    if (String(row[nameCol] || '').trim()) return true;
    for (var i = 0; i < row.length; i++) {
        if (i === nameCol) continue;
        if (String(row[i] || '').trim()) return true;
    }
    return false;
}


/** 规范化表格行数：无内容时固定 8 行占位；有内容时裁掉尾部空行，禁止无限增长 */

function tcNormalizeTableRowsPreserveMin(rows) {
    var minKeep = (typeof window !== "undefined" && window._tcToolbarOpsPreserveMinRows > 0)
        ? window._tcToolbarOpsPreserveMinRows : 0;
    if (!minKeep || !rows || rows.length >= minKeep) return rows;
    var out = rows.slice();
    while (out.length < minKeep) {
        out.push(typeof createTcTableEmptyRow === "function" ? createTcTableEmptyRow() : []);
    }
    return out;
}

function tcNormalizeTableRowsForStorage(rows) {
    if (!rows || !Array.isArray(rows)) return [];
    if (!tableColumns || !tableColumns.length) return rows.slice();
    var normalized = rows.map(function (row) {
        return tableColumns.map(function (_, idx) {
            return Array.isArray(row) && row[idx] != null ? String(row[idx]) : '';
        });
    });
    var lastContent = -1;
    for (var i = 0; i < normalized.length; i++) {
        if (tcTableRowHasCaseContent(normalized[i])) lastContent = i;
    }
    if (lastContent < 0) {
        while (normalized.length < TC_TABLE_DEFAULT_EMPTY_ROWS) {
            normalized.push(createTcTableEmptyRow());
        }
        return tcNormalizeTableRowsPreserveMin(normalized);
    }
    var end = normalized.length;
    while (end > lastContent + 2) {
        end -= 1;
    }
    return tcNormalizeTableRowsPreserveMin(normalized.slice(0, end));
}

function tcTableMinDisplayRowCount() {
    return TC_TABLE_DEFAULT_EMPTY_ROWS;
}

/** 表格中是否仅有占位空行（无有效用例内容） */
function tcTableHasOnlyPlaceholderRows() {
    if (!testCasesData || !testCasesData.length) return true;
    for (var i = 0; i < testCasesData.length; i++) {
        if (tcTableRowHasCaseContent(testCasesData[i])) return false;
    }
    return true;
}

/** 统计表格中含用例内容的行数（不含占位空行） */
function tcCountTableCaseContentRows(fromIndex, limit) {
    fromIndex = fromIndex || 0;
    if (!testCasesData || !testCasesData.length) return 0;
    var end = limit != null ? Math.min(testCasesData.length, fromIndex + limit) : testCasesData.length;
    var count = 0;
    for (var i = fromIndex; i < end; i++) {
        if (tcTableRowHasCaseContent(testCasesData[i])) count++;
    }
    return count;
}

/**
 * 推断本次列表生成批次的起始行（0-based）。
 * 覆盖写入占位空行时数据落在表头区，而非表格末尾。
 */
function tcResolveListGenerationBatchStart(rowCount) {
    rowCount = parseInt(rowCount, 10) || 0;
    if (rowCount <= 0) return 0;
    if (_tcLastGenerationWriteStart >= 0) return _tcLastGenerationWriteStart;
    if (typeof tcFindGenerationInsertRowIndex === 'function') {
        var insertIdx = tcFindGenerationInsertRowIndex();
        if (insertIdx >= 0) return insertIdx;
    }
    var rows = typeof testCasesData !== 'undefined' ? testCasesData : null;
    var total = rows ? rows.length : 0;
    if (!total) return 0;
    return Math.max(0, total - rowCount);
}


/** 本次列表生成批次中已写入的有效用例行数（不含占位空行），供完成横幅统计。 */
function tcResolveListGenerationBatchContentRows() {
    if (typeof tcCountTableCaseContentRows !== 'function') return 0;
    var batchStart = -1;
    if (typeof tcGetLastGenerationWriteStart === 'function') {
        batchStart = parseInt(tcGetLastGenerationWriteStart(), 10);
    }
    if ((isNaN(batchStart) || batchStart < 0) && window.tcGenBatchCore && window.tcGenBatchCore.state) {
        batchStart = parseInt(window.tcGenBatchCore.state.batchRowStart, 10);
    }
    var batchLimit = 0;
    if (window.tcGenBatchCore && window.tcGenBatchCore.state) {
        batchLimit = parseInt(window.tcGenBatchCore.state.batchRowCount, 10) || 0;
    }
    if (isNaN(batchStart) || batchStart < 0) return 0;
    if (batchLimit > 0) {
        var limited = tcCountTableCaseContentRows(batchStart, batchLimit);
        if (limited > 0) return limited;
    }
    return tcCountTableCaseContentRows(batchStart) || 0;
}

function tcFindFirstEmptyTableRowIndex(fromIndex) {
    fromIndex = fromIndex || 0;
    if (!testCasesData) return -1;
    for (var i = fromIndex; i < testCasesData.length; i++) {
        if (!tcTableRowHasCaseContent(testCasesData[i])) return i;
    }
    return -1;
}

/** 最后一行含用例内容的行号（0-based）；无内容时返回 -1 */
function tcFindLastTableRowWithContentIndex() {
    if (!testCasesData || !testCasesData.length) return -1;
    var last = -1;
    for (var i = 0; i < testCasesData.length; i++) {
        if (tcTableRowHasCaseContent(testCasesData[i])) last = i;
    }
    return last;
}

/** 本次生成应写入的首行：紧跟最后一条已有用例的下一行；无空位则返回 -1（由调用方 push） */
function tcFindGenerationInsertRowIndex() {
    if (!testCasesData) return -1;
    var fromIndex = 0;
    var lastContent = tcFindLastTableRowWithContentIndex();
    if (lastContent >= 0) fromIndex = lastContent + 1;
    return tcFindFirstEmptyTableRowIndex(fromIndex);
}

/** 流式/批次条：记录本批写入起始行 */
function tcResolveGenerationBatchRowStart(mergeMode) {
    if (typeof tcFindGenerationInsertRowIndex === 'function') {
        var idx = tcFindGenerationInsertRowIndex();
        if (idx >= 0) return idx;
    }
    return testCasesData ? testCasesData.length : 0;
}

function seedTcTableDefaultEmptyRows() {
    if (!tableColumns || !tableColumns.length) return;
    testCasesData = [];
    testCasesProvenance = [];
    for (var i = 0; i < TC_TABLE_DEFAULT_EMPTY_ROWS; i++) {
        testCasesData.push(createTcTableEmptyRow());
        testCasesProvenance.push(null);
    }
}

// 添加空行
function addEmptyRow() {
    if (!ensureTcTableTemplateApplied()) return;
    const newRow = tableColumns.map(() => '');
    testCasesData.push(newRow);
    testCasesProvenance.push(null);
    renderTableBody({ reload: false, preserveScroll: true });
    tcTableRecordAfterMutation();
    if (typeof tcTemplateSwitchOnCurrentTemplateMutated === 'function') tcTemplateSwitchOnCurrentTemplateMutated();
}

/** 清空内网预设模块（蓝湖 + 提示词草稿） */
function clearTcAiPresetForm() {
    tcAppConfirm('将清空蓝湖 Cookie/URL 与提示词；右侧用例表格不受影响。', {
        title: '清空内网预设？',
        variant: 'warning',
        confirmText: '清空',
        cancelText: '保留'
    }).then(function(ok) {
        if (!ok) return;
        ['lanhu-cookie', 'lanhu-url'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        if (typeof clearTcAiPromptDraftForMode === 'function') clearTcAiPromptDraftForMode('preset');
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-cookie'));
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-url'));
        var statusEl = document.getElementById('lanhu-fetch-status');
        if (statusEl) statusEl.textContent = '';
        tcAppToast('内网预设已清空。', { variant: 'success', duration: 2600 });
    });
}

// 清空列表表格
function clearTable() {
    tcAppConfirm('将删除当前列表中的全部用例行（表头配置可随后在「表头配置」中调整）。此操作不可撤销。', {
        title: '清空全部用例？',
        variant: 'warning',
        confirmText: '清空',
        cancelText: '取消'
    }).then(function (ok) {
        if (!ok) return;
        testCasesData = [];
        testCasesProvenance = [];
        markedRows = new Set();
        selectedRows.clear();
        rowHeights = {};
        tcTableResetUndoHistory();
        renderTableBody({ reload: true });
        tcTableEnsureHistoryReady();
        tcTableRecordAfterMutation();
        if (window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.onTableRowsRemoved === 'function') {
            window.TcRequirementCaseStore.onTableRowsRemoved();
        }
        tcAppToast('列表用例数据已全部清空。', { variant: 'info', duration: 2600 });
    });
}

function clearMindmapData() {
    tcAppConfirm('将删除思维导图中的全部用例节点。此操作不可撤销。', {
        title: '清空导图用例？',
        variant: 'warning',
        confirmText: '清空',
        cancelText: '取消'
    }).then(function(ok) {
        if (!ok) return;
        tcMindmapExternalMindData = null;
        tcMindmapCommittedExternalMind = null;
        tcMindmapCasesData = [];
        tcMindmapCasesProvenance = [];
        tcMindmapUndoStack = [];
        tcMindmapHistory = [];
        tcMindmapHistoryIndex = -1;
        tcMindmapUndoBaseline = null;
        tcMindmapMetaById = {};
        tcMindmapClearCache();
        if (tcRightViewMode === 'mindmap') renderTcMindmap();
        tcAppToast('导图用例数据已全部清空。', { variant: 'info', duration: 2600 });
    });
}

function escapeTcHtml(text) {
    return String(text != null ? text : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isTcExplicitTemplateApplied() {
    return !!(tableColumns.length && tcActiveTemplateId);
}

function ensureTcTableTemplateApplied(opts) {
    opts = opts || {};
    if (tableColumns.length && (tcTableTemplateApplied || tcActiveTemplateId)) return true;
    if (isTcExplicitTemplateApplied()) return true;
    if (typeof window.isTcRequirementPageGenBusy === 'function' && window.isTcRequirementPageGenBusy()) {
        if (typeof window.restoreGenerationTableSnapshot === 'function' &&
            window.restoreGenerationTableSnapshot()) {
            return true;
        }
        return tableColumns.length > 0;
    }
    if (typeof isTcLeftPanelNavLocked === 'function' && isTcLeftPanelNavLocked()) {
        if (typeof window.restoreGenerationTableSnapshot === 'function' &&
            window.restoreGenerationTableSnapshot()) {
            return true;
        }
        return tableColumns.length > 0;
    }
    var onMindmap = typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap';
    if ((onMindmap || opts.fromMindmap) && !(typeof window !== 'undefined' && window.tcAiTableToMindmapConverting)) {
        if (typeof switchTcRightView === 'function') switchTcRightView('table');
    }
    function revealTemplateModal() {
        openTcTemplateModal();
    }
    if (onMindmap && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function() {
            requestAnimationFrame(revealTemplateModal);
        });
    } else {
        revealTemplateModal();
    }
    return false;
}

/** 导图解析兜底：仅在已有列配置时补齐默认列（不视为用户已选模板） */
function ensureTcMindmapGenerateColumns() {
    if (tableColumns.length) return true;
    tableColumns = defaultTableColumns.slice();
    columnVisible = {};
    columnWidth = {};
    initColumnState();
    renderTableHeader();
    syncTcTableTemplateChrome();
    return true;
}

var TC_TABLE_FAB_POS_KEY = 'tc_table_fab_pos_v7';
var TC_EXPORT_FAB_POS_KEY = 'tc_export_fab_pos_v1';

function tcFabEmptySlot() {
    return { moved: false, x: null, y: null };
}

var tcFabViewPosState = {
    table: { edit: tcFabEmptySlot(), export: tcFabEmptySlot() },
    mindmap: { edit: tcFabEmptySlot(), export: tcFabEmptySlot() }
};

function tcFabNormalizeViewScope(view) {
    return view === 'mindmap' ? 'mindmap' : 'table';
}

function isTcEditFabUserMoved(view) {
    var scope = tcFabNormalizeViewScope(view != null ? view : tcRightViewMode);
    return !!(tcFabViewPosState[scope] && tcFabViewPosState[scope].edit.moved);
}

function isTcExportFabUserMoved(view) {
    var scope = tcFabNormalizeViewScope(view != null ? view : tcRightViewMode);
    return !!(tcFabViewPosState[scope] && tcFabViewPosState[scope].export.moved);
}

function tcFabCaptureToggleSlot(toggle, slot) {
    if (!toggle || !slot) return;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    slot.x = r.left;
    slot.y = r.top;
}

function tcFabPersistViewFabPositions(view) {
    view = tcFabNormalizeViewScope(view);
    var state = tcFabViewPosState[view];
    if (!state) return;
    if (state.edit.moved) {
        tcFabCaptureToggleSlot(document.getElementById('tc-table-fab-toggle'), state.edit);
    }
    if (state.export.moved) {
        tcFabCaptureToggleSlot(document.getElementById('tc-export-fab-toggle'), state.export);
    }
}

function tcFabApplyViewFabPositions(view) {
    view = tcFabNormalizeViewScope(view);
    var editWrap = document.getElementById('tc-table-fab-wrap');
    var exportWrap = document.getElementById('tc-export-fab-wrap');
    if (!editWrap && !exportWrap) return;
    var editState = tcFabViewPosState[view].edit;
    var exportState = tcFabViewPosState[view].export;
    if (editState.moved && editState.x != null && editState.y != null) {
        applyTcTableFabPosition(editState.x, editState.y);
    } else {
        var editDef = getDefaultTcTableFabPosition();
        applyTcTableFabPosition(editDef.x, editDef.y);
    }
    if (exportState.moved && exportState.x != null && exportState.y != null) {
        applyTcExportFabPosition(exportState.x, exportState.y);
    } else {
        var exportDef = getDefaultTcExportFabPosition();
        applyTcExportFabPosition(exportDef.x, exportDef.y);
    }
    if (typeof ensureTcTableFabOnScreen === 'function') ensureTcTableFabOnScreen();
    if (typeof ensureTcExportFabOnScreen === 'function') ensureTcExportFabOnScreen();
    if (typeof refreshOpenTcFabSheetPlacements === 'function') {
        window.requestAnimationFrame(function () { refreshOpenTcFabSheetPlacements(); });
    }
}

function tcFabResetAllViewFabPositions() {
    tcFabViewPosState.table.edit = tcFabEmptySlot();
    tcFabViewPosState.table.export = tcFabEmptySlot();
    tcFabViewPosState.mindmap.edit = tcFabEmptySlot();
    tcFabViewPosState.mindmap.export = tcFabEmptySlot();
}

window.tcFabPersistViewFabPositions = tcFabPersistViewFabPositions;
window.tcFabApplyViewFabPositions = tcFabApplyViewFabPositions;
window.isTcEditFabUserMoved = isTcEditFabUserMoved;
window.isTcExportFabUserMoved = isTcExportFabUserMoved;

function ensureTcExportFabMounted() {
    var wrap = document.getElementById('tc-export-fab-wrap');
    if (!wrap) return null;
    if (wrap.parentElement !== document.body) document.body.appendChild(wrap);
    wrap._tcFabMountedToBody = true;
    return wrap;
}

function getTcExportFabDragSize() {
    var toggle = document.getElementById('tc-export-fab-toggle');
    if (toggle) {
        var r = toggle.getBoundingClientRect();
        if (r.width > 0) return { w: r.width, h: r.height };
    }
    return { w: 44, h: 44 };
}

function getDefaultTcExportFabPosition() {
    var editDef = getDefaultTcTableFabPosition();
    var editSize = getTcTableFabDragSize();
    var size = getTcExportFabDragSize();
    var gap = 8;
    var zone = getTcTableFabViewportZone();
    var searchRect = getTcTableFabSearchAnchorRect();
    var x = editDef.x + editSize.w + gap;
    var y = editDef.y;
    if (searchRect) {
        var maxX = searchRect.left - gap - size.w;
        x = Math.min(x, maxX);
    }
    if (x + size.w > zone.maxX) {
        x = Math.max(zone.minX, editDef.x);
        y = Math.min(zone.maxY, editDef.y + editSize.h + gap);
    }
    if (x < zone.minX) x = zone.minX;
    return clampTcTableFabToggleXY(x, y);
}

function applyTcExportFabPosition(toggleX, toggleY, prevToggleY) {
    var wrap = ensureTcExportFabMounted();
    if (!wrap) return;
    var p = clampTcTableFabToggleXY(toggleX, toggleY, prevToggleY);
    wrap.style.left = p.x + 'px';
    wrap.style.top = p.y + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
}

/** 表格 ↔ 思维导图切换：按目标视图恢复 FAB 位置（各视图独立记忆） */
function syncTcWorkbenchFabPositionsOnViewSwitch() {
    var view = typeof tcRightViewMode !== 'undefined' ? tcRightViewMode : 'table';
    tcFabApplyViewFabPositions(view);
}
window.syncTcWorkbenchFabPositionsOnViewSwitch = syncTcWorkbenchFabPositionsOnViewSwitch;

function resetTcWorkbenchFabPositionsToDefault() {
    tcFabResetAllViewFabPositions();
    if (typeof resetTcTableFabToDefault === 'function') resetTcTableFabToDefault();
    if (typeof resetTcExportFabToDefault === 'function') resetTcExportFabToDefault();
}
window.resetTcWorkbenchFabPositionsToDefault = resetTcWorkbenchFabPositionsToDefault;

(function initTcWorkbenchFabSessionReset() {
    function onPageShow() {
        if (!document.getElementById('tc-table-fab-wrap')) return;
        resetTcWorkbenchFabPositionsToDefault();
    }
    function boot() {
        if (window._tcFabSessionResetBound) return;
        window._tcFabSessionResetBound = true;
        window.addEventListener('pageshow', onPageShow);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

function resetTcExportFabToDefault() {
    var view = tcFabNormalizeViewScope(tcRightViewMode);
    tcFabViewPosState[view].export = tcFabEmptySlot();
    try { localStorage.removeItem(TC_EXPORT_FAB_POS_KEY); } catch (e) { /* ignore */ }
    var wrap = document.getElementById('tc-export-fab-wrap');
    if (!wrap) return;
    var def = getDefaultTcExportFabPosition();
    applyTcExportFabPosition(def.x, def.y);
}

function ensureTcExportFabOnScreen() {
    var toggle = document.getElementById('tc-export-fab-toggle');
    if (!toggle) return;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    var ceilingY = getTcTableFabPageCeilingY();
    if (r.top < ceilingY - 1) {
        applyTcExportFabPosition(r.left, ceilingY);
        return;
    }
    if (!isTcFabToggleOnScreen(toggle)) {
        resetTcExportFabToDefault();
    }
}


function mountTcFabSheetToBody(sheet) {
    if (!sheet) return;
    if (!sheet._tcFabSheetHomeParent && sheet.parentElement) {
        sheet._tcFabSheetHomeParent = sheet.parentElement;
        sheet._tcFabSheetHomeNext = sheet.nextSibling;
    }
    if (sheet.parentElement !== document.body) {
        document.body.appendChild(sheet);
    }
}

function restoreTcFabSheetToWrap(sheet) {
    if (!sheet || !sheet._tcFabSheetHomeParent) return;
    if (sheet.parentElement !== document.body) return;
    var parent = sheet._tcFabSheetHomeParent;
    if (!parent.isConnected) return;
    if (sheet._tcFabSheetHomeNext && sheet._tcFabSheetHomeNext.parentElement === parent) {
        parent.insertBefore(sheet, sheet._tcFabSheetHomeNext);
    } else {
        parent.appendChild(sheet);
    }
}

function resetTcFabSheetPlacement(sheet) {
    if (!sheet) return;
    sheet.classList.remove('tc-fab-sheet--placed');
    ['position', 'left', 'top', 'right', 'bottom', 'transform', 'margin', 'z-index'].forEach(function (prop) {
        sheet.style.removeProperty(prop);
    });
    restoreTcFabSheetToWrap(sheet);
}

function applyTcFabSheetPlacement(sheet, toggle) {
    if (!sheet || !toggle) return;
    var gap = 8;
    var margin = 8;
    mountTcFabSheetToBody(sheet);
    /* 大数据量表格下避免反复 getBoundingClientRect 触发整页强制布局 */
    var btnRect = toggle.getBoundingClientRect();
    var sheetW = sheet._tcFabCachedW || 160;
    var sheetH = sheet._tcFabCachedH || 220;
    var cx = btnRect.left + btnRect.width / 2;
    var cy = btnRect.top + btnRect.height / 2;
    var onLeft = cx < window.innerWidth * 0.5;
    var onTop = cy < window.innerHeight * 0.5;
    var left = onLeft ? (btnRect.right + gap) : (btnRect.left - sheetW - gap);
    var top = onTop ? (btnRect.bottom + gap) : (btnRect.top - sheetH - gap);
    left = Math.max(margin, Math.min(left, window.innerWidth - sheetW - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - sheetH - margin));
    sheet.classList.add('tc-fab-sheet--placed');
    sheet.style.setProperty('position', 'fixed', 'important');
    sheet.style.setProperty('left', left + 'px', 'important');
    sheet.style.setProperty('top', top + 'px', 'important');
    sheet.style.setProperty('right', 'auto', 'important');
    sheet.style.setProperty('bottom', 'auto', 'important');
    sheet.style.setProperty('transform', 'none', 'important');
    sheet.style.setProperty('margin', '0', 'important');
    sheet.style.setProperty('z-index', '130', 'important');

    if (!sheet.classList.contains('hidden') && !sheet._tcFabSizeWarm) {
        sheet._tcFabSizeWarm = true;
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(function () {
                if (sheet.classList.contains('hidden')) return;
                var sheetRect = sheet.getBoundingClientRect();
                if (sheetRect.width > 8) sheet._tcFabCachedW = sheetRect.width;
                if (sheetRect.height > 8) sheet._tcFabCachedH = sheetRect.height;
            });
        }
    }
}

function refreshOpenTcFabSheetPlacements() {
    var pairs = [
        ['tc-table-fab-sheet', 'tc-table-fab-toggle'],
        ['tc-export-fab-sheet', 'tc-export-fab-toggle']
    ];
    pairs.forEach(function (ids) {
        var sheet = document.getElementById(ids[0]);
        var toggle = document.getElementById(ids[1]);
        if (sheet && toggle && !sheet.classList.contains('hidden')) {
            applyTcFabSheetPlacement(sheet, toggle);
        }
    });
}

function closeTcExportFabSheet() {
    var sheet = document.getElementById('tc-export-fab-sheet');
    var toggle = document.getElementById('tc-export-fab-toggle');
    if (sheet) {
        resetTcFabSheetPlacement(sheet);
        sheet.classList.add('hidden');
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    syncTcFabOpenBodyClass();
}

function syncTcFabOpenBodyClass() {
    var exportOpen = isTcExportFabSheetOpen();
    var editSheet = document.getElementById('tc-table-fab-sheet');
    var editOpen = !!(editSheet && !editSheet.classList.contains('hidden'));
    document.body.classList.toggle('tc-fab-open', exportOpen || editOpen);
}




function isTcExportFabSheetOpen() {
    var sheet = document.getElementById('tc-export-fab-sheet');
    return !!(sheet && !sheet.classList.contains('hidden'));
}

/** 绿色导出 FAB：点击页面其它区域自动收起（隔离于编辑 FAB / 顶栏下拉） */
function bindTcExportFabSheetDismissOnOutsideClick() {
    if (window._tcExportFabOutsideDismissBound) return;
    window._tcExportFabOutsideDismissBound = true;
    document.addEventListener('click', function (e) {
        if (!document.body.classList.contains('tc-fab-open') && !isTcExportFabSheetOpen()) return;
        if (!isTcExportFabSheetOpen()) return;
        var target = e.target;
        if (!target || !target.closest) return;
        if (target.id === 'tc-export-fab-toggle' || target.id === 'tc-export-fab-sheet') return;
        if (target.closest('#tc-export-fab-wrap')) return;
        if (target.closest('#tc-export-fab-sheet')) return;
        if (typeof closeTcExportFabSheet === 'function') closeTcExportFabSheet();
    });
}

/** 绿色导出 FAB：点击菜单项后自动收起（document 捕获委托，隔离于编辑 FAB / 顶栏下拉） */
function bindTcExportFabSheetAutoCloseOnMenuItemClick() {
    if (window._tcExportFabMenuAutoCloseBound) return;
    window._tcExportFabMenuAutoCloseBound = true;
    document.addEventListener('click', function (e) {
        var item = e.target.closest('#tc-export-fab-sheet .tc-workbench-fab-sheet__item, #tc-export-fab-sheet .tc-table-fab-sheet__item');
        if (!item || item.disabled) return;
        var sheet = document.getElementById('tc-export-fab-sheet');
        if (!sheet || sheet.classList.contains('hidden')) return;
        window.setTimeout(function () {
            if (typeof closeTcExportFabSheet === 'function') closeTcExportFabSheet();
        }, 0);
    }, true);
}

function bindTcFabSheetKeepOpen(sheetId) {
    var sheet = document.getElementById(sheetId);
    if (!sheet || sheet._tcKeepOpenBound) return;
    sheet._tcKeepOpenBound = true;
    sheet.addEventListener('click', function(e) {
        e.stopPropagation();
    });
}

function closeTcEditFabSheetOnly() {
    var sheet = document.getElementById('tc-table-fab-sheet');
    var toggle = document.getElementById('tc-table-fab-toggle');
    if (sheet) {
        if (typeof isTcTableToolbarOpsMode === 'function' && isTcTableToolbarOpsMode()) {
            if (typeof resetTcFabSheetPlacement === 'function') resetTcFabSheetPlacement(sheet);
            sheet.classList.add('hidden');
            if (toggle) {
                toggle.setAttribute('aria-expanded', 'false');
                toggle.classList.remove('tc-table-ops-trigger--open');
            }
            syncTcFabOpenBodyClass();
            return;
        }
        resetTcFabSheetPlacement(sheet);
        sheet.classList.add('hidden');
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    syncTcFabOpenBodyClass();
}

function toggleTcExportFabSheet() {
    var sheet = document.getElementById('tc-export-fab-sheet');
    var toggle = document.getElementById('tc-export-fab-toggle');
    if (!sheet || !toggle) return;
    var open = sheet.classList.contains('hidden');
    if (open) closeTcEditFabSheetOnly();
    sheet.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
        /* 同步定位一次即可，避免 rAF 二次测量拖慢大数据量表格 */
        applyTcFabSheetPlacement(sheet, toggle);
    } else {
        resetTcFabSheetPlacement(sheet);
    }
    syncTcFabOpenBodyClass();
}

function initTcExportFabUi() {
    bindTcExportFabSheetAutoCloseOnMenuItemClick();
    bindTcExportFabSheetDismissOnOutsideClick();
    if (typeof bindTcFabSheetKeepOpen === 'function') bindTcFabSheetKeepOpen('tc-export-fab-sheet');
    var toggle = document.getElementById('tc-export-fab-toggle');
    var wrap = ensureTcExportFabMounted();
    if (!toggle || toggle._tcFabBound) return;
    toggle._tcFabBound = true;
    var pointerDown = false;
    var dragging = false;
    var activePointerId = null;
    var dragThreshold = 5;
    var startX = 0, startY = 0, startLeft = 0, startTop = 0, lastFabY = 0;
    function onFabPointerMove(e) {
        if (!pointerDown || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!dragging) {
            if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
            dragging = true;
            closeTcExportFabSheet();
            if (wrap) wrap.classList.add('tc-workbench-fab-wrap--dragging');
            document.body.classList.add('tc-workbench-fab-dragging');
            lastFabY = startTop;
        }
        applyTcExportFabPosition(startLeft + dx, startTop + dy, lastFabY);
        lastFabY = toggle.getBoundingClientRect().top;
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
        if (wrap) wrap.classList.remove('tc-workbench-fab-wrap--dragging');
        document.body.classList.remove('tc-workbench-fab-dragging');
        if (wasDrag) {
            var exportView = tcFabNormalizeViewScope(tcRightViewMode);
            var exportSlot = tcFabViewPosState[exportView].export;
            exportSlot.moved = true;
            tcFabCaptureToggleSlot(toggle, exportSlot);
            refreshOpenTcFabSheetPlacements();
        } else toggleTcExportFabSheet();
    }
    toggle.addEventListener('pointerdown', function(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        pointerDown = true;
        dragging = false;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        var tRect = toggle.getBoundingClientRect();
        startLeft = tRect.left;
        startTop = tRect.top;
        lastFabY = tRect.top;
        if (toggle.setPointerCapture) { try { toggle.setPointerCapture(e.pointerId); } catch (err) {} }
        document.addEventListener('pointermove', onFabPointerMove);
        document.addEventListener('pointerup', endFabPointer);
        document.addEventListener('pointercancel', endFabPointer);
    });
}


function ensureTcTableFabMounted() {
    var wrap = document.getElementById('tc-table-fab-wrap');
    if (!wrap) return null;
    if (wrap.parentElement !== document.body) {
        document.body.appendChild(wrap);
    }
    wrap._tcFabMountedToBody = true;
    return wrap;
}

function getTcTableFabSize() {
    var toggle = document.getElementById('tc-table-fab-toggle');
    if (toggle) {
        var r = toggle.getBoundingClientRect();
        if (r.width > 0) return { w: r.width, h: r.height };
    }
    return { w: 44, h: 44 };
}

/** 拖动边界：以圆形按钮为准（收起菜单不占布局高度） */
function getTcTableFabDragSize() {
    return getTcTableFabSize();
}

function getTcTableFabToolbarRect() {
    var toolbar = document.getElementById('table-toolbar');
    if (!toolbar || toolbar.offsetParent === null) return null;
    var r = toolbar.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return r;
}

/** 搜索框区域（默认 FAB 落点锚定在搜索框左侧） */
function measureTcTableFabHiddenSearchAnchorRect() {
    var bar = document.getElementById('tc-table-filter-bar');
    if (!bar || getComputedStyle(bar).display !== 'none') return null;
    var prevDisplay = bar.style.display;
    var prevVis = bar.style.visibility;
    var prevPe = bar.style.pointerEvents;
    bar.style.display = 'inline-flex';
    bar.style.visibility = 'hidden';
    bar.style.pointerEvents = 'none';
    var rect = null;
    var search = document.getElementById('tc-table-filter-search');
    var wrap = bar.querySelector('.tc-table-filter-bar__search-wrap');
    var target = search || wrap || bar;
    if (target) {
        var sr = target.getBoundingClientRect();
        if (sr.width >= 8 && sr.height >= 8) rect = sr;
    }
    bar.style.display = prevDisplay;
    bar.style.visibility = prevVis;
    bar.style.pointerEvents = prevPe;
    return rect;
}

function getTcTableFabSearchAnchorRect() {
    var search = document.getElementById('tc-table-filter-search');
    if (search && search.offsetParent !== null) {
        var sr = search.getBoundingClientRect();
        if (sr.width >= 8 && sr.height >= 8) return sr;
    }
    var wrap = document.querySelector('#tc-table-filter-bar .tc-table-filter-bar__search-wrap');
    if (wrap && wrap.offsetParent !== null) {
        var wr = wrap.getBoundingClientRect();
        if (wr.width >= 8 && wr.height >= 8) return wr;
    }
    var bar = document.getElementById('tc-table-filter-bar');
    if (bar && bar.offsetParent !== null) {
        var br = bar.getBoundingClientRect();
        if (br.width >= 8 && br.height >= 8) return br;
    }
    if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap') {
        var hiddenRect = measureTcTableFabHiddenSearchAnchorRect();
        if (hiddenRect) return hiddenRect;
    }
    var toolbarRight = document.getElementById('tc-table-toolbar-right');
    if (toolbarRight && toolbarRight.offsetParent !== null) {
        var tr = toolbarRight.getBoundingClientRect();
        if (tr.width >= 8 && tr.height >= 8) return tr;
    }
    return getTcTableFabToolbarRect();
}

/** 全站顶栏底边：仅用于默认落点（避免首屏压住导航），拖动不再受此限制 */
function getTcTableFabNavFloorY() {
    var gap = 6;
    var floorY = 8;
    var gnav = document.querySelector('.hf-gnav');
    if (gnav) {
        var gr = gnav.getBoundingClientRect();
        if (gr.height >= 4) floorY = Math.max(floorY, gr.bottom + gap);
    }
    return floorY;
}

/** 页面顶部天花板：可拖入导航栏，但不得拖出当前视口上沿 */
function getTcTableFabPageCeilingY() {
    return 8;
}

function getTcTableFabStashReserveBottom() { return 24; }

/** 实际表格卡片区域（默认落点需避开；拖动时可进入） */
function getTcTableFabTableRect() {
    var panel = document.getElementById('tc-table-view-panel');
    if (!panel || panel.offsetParent === null) return null;
    var r = panel.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return r;
}

function getTcTableFabWorkspaceRect() {
    var ws = document.getElementById('table-workspace');
    if (!ws || ws.offsetParent === null) return null;
    var r = ws.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return r;
}



function isTcFabNearDefaultPosition(toggle, getDefaultFn) {
    if (!toggle || typeof getDefaultFn !== 'function') return false;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    var def = getDefaultFn();
    return Math.abs(r.left - def.x) <= 8 && Math.abs(r.top - def.y) <= 8;
}

function shouldResetTcFabToDefault(toggle, getDefaultFn) {
    if (!toggle) return true;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return true;
    if (!isTcFabToggleOnScreen(toggle)) return true;
    if (!isTcFabNearDefaultPosition(toggle, getDefaultFn)) return true;
    return false;
}

function intersectTcFabRectWithViewport(rect) {
    if (!rect) return null;
    var margin = 8;
    var top = Math.max(rect.top, margin);
    var bottom = Math.min(rect.bottom, window.innerHeight - margin);
    var left = Math.max(rect.left, margin);
    var right = Math.min(rect.right, window.innerWidth - margin);
    if (bottom - top < 8 || right - left < 8) return null;
    return {
        top: top,
        left: left,
        bottom: bottom,
        right: right,
        width: right - left,
        height: bottom - top
    };
}

function isTcFabToggleOnScreen(toggle) {
    if (!toggle) return false;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    var margin = 6;
    return r.right > margin && r.bottom > margin &&
        r.left < window.innerWidth - margin && r.top < window.innerHeight - margin;
}

function tcTableFabRectOverlaps(x, y, size, rect, gap) {
    if (!rect) return false;
    gap = gap != null ? gap : 8;
    return !(
        x + size.w + gap <= rect.left ||
        x >= rect.right + gap ||
        y + size.h + gap <= rect.top ||
        y >= rect.bottom + gap
    );
}

/** 拖动范围：视口内；可进入导航栏区域，但不得超出页面上沿 */
function getTcTableFabViewportZone() {
    var margin = 8;
    var size = getTcTableFabDragSize();
    var minY = getTcTableFabPageCeilingY();
    var maxY = window.innerHeight - size.h - getTcTableFabStashReserveBottom();
    return {
        minX: margin,
        maxX: Math.max(margin, window.innerWidth - size.w - margin),
        minY: minY,
        maxY: Math.max(minY, maxY)
    };
}

function clampTcTableFabToggleXY(toggleX, toggleY, prevToggleY) {
    var zone = getTcTableFabViewportZone();
    var ceilingY = getTcTableFabPageCeilingY();
    var x = Math.max(zone.minX, Math.min(toggleX, zone.maxX));
    var y = Math.max(zone.minY, Math.min(toggleY, zone.maxY));
    if (y < ceilingY) y = ceilingY;
    return { x: x, y: y };
}

/** x/y 为圆形按钮左上角（菜单面板绝对定位，不占布局） */
function applyTcTableFabPosition(toggleX, toggleY, prevToggleY) {
    var wrap = ensureTcTableFabMounted();
    if (!wrap) return;
    var p = clampTcTableFabToggleXY(toggleX, toggleY, prevToggleY);
    wrap.style.left = p.x + 'px';
    wrap.style.top = p.y + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
}

function isTcTableFabToggleOnScreen() {
    var toggle = document.getElementById('tc-table-fab-toggle');
    var wrap = document.getElementById('tc-table-fab-wrap');
    if (!toggle || !wrap || wrap.classList.contains('hidden')) return false;
    return isTcFabToggleOnScreen(toggle);
}

function isTcTableFabPositionVisible(x, y) {
    var size = getTcTableFabDragSize();
    if (y < getTcTableFabPageCeilingY() - 1) return false;
    if (x + size.w < 0 || y + size.h < 0) return false;
    if (x > window.innerWidth + 4 || y > window.innerHeight + 4) return false;
    return true;
}

function ensureTcTableFabOnScreen() {
    var toggle = document.getElementById('tc-table-fab-toggle');
    if (!toggle) return;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    var ceilingY = getTcTableFabPageCeilingY();
    if (r.top < ceilingY - 1) {
        applyTcTableFabPosition(r.left, ceilingY);
        return;
    }
    if (!isTcTableFabToggleOnScreen()) {
        resetTcTableFabToDefault();
    }
}

/** 恢复默认位置（刷新、切换表格/导图视图时；不跨页面刷新记忆） */
function resetTcTableFabToDefault() {
    var view = tcFabNormalizeViewScope(tcRightViewMode);
    tcFabViewPosState[view].edit = tcFabEmptySlot();
    try { localStorage.removeItem(TC_TABLE_FAB_POS_KEY); } catch (e) { /* ignore */ }
    var wrap = document.getElementById('tc-table-fab-wrap');
    if (!wrap) return;
    var def = getDefaultTcTableFabPosition();
    applyTcTableFabPosition(def.x, def.y);
}

/** 工作区主内容区（表格或导图卡片），用于默认落点 */
function getTcTableFabContentRect() {
    var tableRect = getTcTableFabTableRect();
    if (tableRect) return tableRect;
    var mindmapPanel = document.getElementById('tc-mindmap-view-panel');
    if (mindmapPanel && !mindmapPanel.classList.contains('hidden') && mindmapPanel.offsetParent !== null) {
        var mr = mindmapPanel.getBoundingClientRect();
        if (mr.width >= 8 && mr.height >= 8) return mr;
    }
    return getTcTableFabWorkspaceRect();
}

/** 默认：搜索框左侧（导出钮紧贴搜索框左缘，编辑钮在其左侧） */
function getDefaultTcTableFabPosition() {
    var size = getTcTableFabDragSize();
    var exportSize = getTcExportFabDragSize();
    var gap = 8;
    var zone = getTcTableFabViewportZone();
    var searchRect = getTcTableFabSearchAnchorRect();
    var x;
    var y;
    if (searchRect) {
        var exportX = searchRect.left - gap - exportSize.w;
        x = exportX - gap - size.w;
        y = searchRect.top + (searchRect.height - size.h) / 2;
    } else {
        var toolbarRect = getTcTableFabToolbarRect();
        if (toolbarRect) {
            x = toolbarRect.right - gap - exportSize.w - gap - size.w;
            y = toolbarRect.top + (toolbarRect.height - size.h) / 2;
        } else {
            x = zone.maxX - exportSize.w - gap - size.w - 12;
            y = zone.minY + 48;
        }
    }
    x = Math.max(zone.minX, Math.min(x, zone.maxX));
    y = Math.max(getTcTableFabNavFloorY(), Math.min(y, zone.maxY));
    return clampTcTableFabToggleXY(x, y);
}

function saveTcTableFabPosition() {
    var view = tcFabNormalizeViewScope(tcRightViewMode);
    var slot = tcFabViewPosState[view].edit;
    slot.moved = true;
    tcFabCaptureToggleSlot(document.getElementById('tc-table-fab-toggle'), slot);
}

function closeTcTableFabSheet() {
    closeTcEditFabSheetOnly();
    closeTcExportFabSheet();
}

function toggleTcTableFabSheet() {
    var sheet = document.getElementById('tc-table-fab-sheet');
    var toggle = document.getElementById('tc-table-fab-toggle');
    if (!sheet || !toggle) return;
    var open = sheet.classList.contains('hidden');
    if (open) closeTcExportFabSheet();
    sheet.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
        applyTcFabSheetPlacement(sheet, toggle);
    } else {
        resetTcFabSheetPlacement(sheet);
    }
    syncTcFabOpenBodyClass();
}

function initTcTableFabUi() {
    if (typeof isTcTableToolbarOpsMode === 'function' && isTcTableToolbarOpsMode()) return;
    var toggle = document.getElementById('tc-table-fab-toggle');
    var sheet = document.getElementById('tc-table-fab-sheet');
    var wrap = ensureTcTableFabMounted();
    if (!toggle || toggle._tcFabBound) return;
    toggle._tcFabBound = true;

    var pointerDown = false;
    var dragging = false;
    var activePointerId = null;
    var dragThreshold = 5;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;
    var lastFabY = 0;

    function onFabPointerMove(e) {
        if (!pointerDown || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!dragging) {
            if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
            dragging = true;
            closeTcTableFabSheet();
            if (wrap) wrap.classList.add('tc-table-fab-wrap--dragging', 'tc-workbench-fab-wrap--dragging');
            document.body.classList.add('tc-table-fab-dragging', 'tc-workbench-fab-dragging');
            lastFabY = startTop;
        }
        var nextY = startTop + dy;
        applyTcTableFabPosition(startLeft + dx, nextY, lastFabY);
        lastFabY = toggle.getBoundingClientRect().top;
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
        if (wrap) wrap.classList.remove('tc-table-fab-wrap--dragging', 'tc-workbench-fab-wrap--dragging');
        document.body.classList.remove('tc-table-fab-dragging', 'tc-workbench-fab-dragging');
        if (wasDrag) {
            saveTcTableFabPosition();
            refreshOpenTcFabSheetPlacements();
        } else {
            toggleTcTableFabSheet();
        }
    }

    toggle.addEventListener('pointerdown', function(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        pointerDown = true;
        dragging = false;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        var tRect = toggle.getBoundingClientRect();
        startLeft = tRect.left;
        startTop = tRect.top;
        lastFabY = tRect.top;
        if (toggle.setPointerCapture) {
            try { toggle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
        document.addEventListener('pointermove', onFabPointerMove);
        document.addEventListener('pointerup', endFabPointer);
        document.addEventListener('pointercancel', endFabPointer);
    });

    bindTcFabSheetKeepOpen('tc-table-fab-sheet');
    bindTcFabSheetKeepOpen('tc-export-fab-sheet');

    document.addEventListener('click', function(e) {
        if (!wrap || wrap.classList.contains('hidden')) return;
        if (e.target.closest('#tc-table-fab-wrap') || e.target.closest('#tc-export-fab-wrap')) return;
        if (e.target.closest('#tc-table-fab-sheet') || e.target.closest('#tc-export-fab-sheet')) return;
        closeTcTableFabSheet();
    });
    window.addEventListener('resize', function() {
        if (!wrap || wrap.classList.contains('hidden')) return;
        var tRect = toggle.getBoundingClientRect();
        applyTcTableFabPosition(tRect.left, tRect.top);
        ensureTcTableFabOnScreen();
        refreshOpenTcFabSheetPlacements();
    });
}

function syncTcRightPanelMeta() {
    var tpl = tcActiveTemplateId ? TC_CASE_TEMPLATES.find(function(t) { return t.id === tcActiveTemplateId; }) : null;
    var emptyArea = document.getElementById('tc-table-template-empty');
    var switchBtn = document.getElementById('tc-switch-template-btn');
    var tplLabel = document.getElementById('tc-active-template-label');
    var mmTag1 = document.getElementById('tc-mindmap-meta-tag-1');
    var mmTag2 = document.getElementById('tc-mindmap-meta-tag-2');
    var applied = tcTableTemplateApplied && tableColumns.length > 0;
    var isTable = tcRightViewMode === 'table';
    var isMindmap = tcRightViewMode === 'mindmap';
    var bootPending = typeof isTcTableBootHydratePending === 'function' && isTcTableBootHydratePending();
    if (emptyArea) {
        var showTemplateEmpty = !applied && isTable && !bootPending;
        emptyArea.classList.toggle('hidden', !showTemplateEmpty);
        emptyArea.setAttribute('aria-hidden', showTemplateEmpty ? 'false' : 'true');
    }
    if (switchBtn) {
        switchBtn.classList.toggle('hidden', !(applied && isTable));
        switchBtn.setAttribute('aria-hidden', applied && isTable ? 'false' : 'true');
    }
    if (tplLabel) {
        if (applied && isTable && tpl) {
            tplLabel.textContent = tpl.name;
            tplLabel.classList.remove('hidden');
            tplLabel.setAttribute('aria-hidden', 'false');
        } else {
            tplLabel.textContent = '';
            tplLabel.classList.add('hidden');
            tplLabel.setAttribute('aria-hidden', 'true');
        }
    }
    if (mmTag1) {
        mmTag1.classList.toggle('hidden', !(applied && isMindmap));
        mmTag1.setAttribute('aria-hidden', applied && isMindmap ? 'false' : 'true');
    }
    if (mmTag2) {
        mmTag2.classList.toggle('hidden', !(applied && isMindmap));
        mmTag2.setAttribute('aria-hidden', applied && isMindmap ? 'false' : 'true');
    }
}

/** 确保「选择模板」可点击；与暂存/批处理条初始化隔离，避免其它 boot 抛错时按钮失效 */
function ensureTcTemplateChooserUiReady() {
    if (typeof initTcWorkbenchClickDelegate === 'function') initTcWorkbenchClickDelegate();
    if (typeof initTcTemplateModalUi === 'function') initTcTemplateModalUi();
}


function syncTcQualityCheckButtonChrome() {
    var btn = document.getElementById('tc-gen-quality-btn');
    if (!btn) return;
    var onMindmapView = typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap';
    if (onMindmapView) {
        btn.classList.add('hidden');
        btn.setAttribute('aria-hidden', 'true');
        btn.disabled = true;
        return;
    }
    var hasCaseContent = typeof tcCountTableCaseContentRows === 'function' && tcCountTableCaseContentRows() > 0;
    var enh = window.TcWorkbenchEnhancements;
    var busy = enh && typeof enh.isStandaloneQualityCheckButtonBusy === 'function' &&
        enh.isStandaloneQualityCheckButtonBusy();
    if (!busy && typeof window.isTcGenQualityCheckInProgress === 'function') {
        busy = window.isTcGenQualityCheckInProgress();
    }
    if (!busy && enh && typeof enh.isCaseGenerationInteractionBusy === 'function') {
        busy = !!enh.isCaseGenerationInteractionBusy();
    }
    if (!busy && window.TcLeftPanelLock &&
        typeof window.TcLeftPanelLock.isLanhuDocSwitchBlockedDuringGeneration === 'function') {
        busy = !!window.TcLeftPanelLock.isLanhuDocSwitchBlockedDuringGeneration();
    }

    btn.classList.toggle('hidden', !hasCaseContent);
    btn.setAttribute('aria-hidden', hasCaseContent ? 'false' : 'true');
    btn.disabled = !hasCaseContent || !!busy;
    btn.classList.toggle('tc-quality-toggle-btn--busy', !!busy);
    btn.classList.remove('tc-quality-toggle-btn--on');
    btn.classList.toggle('tc-quality-toggle-btn--off', hasCaseContent && !busy);
    if (busy) {
        btn.setAttribute('aria-disabled', 'true');
    } else {
        btn.removeAttribute('aria-disabled');
    }

    if (!hasCaseContent) {
        btn.title = '检测当前需求页表格内的全部用例';
    } else if (busy) {
        var busyTitle = '质量检测进行中，请完毕后再试';
        if (enh && typeof enh.getStandaloneQualityCheckBusyMessage === 'function') {
            busyTitle = enh.getStandaloneQualityCheckBusyMessage() || busyTitle;
        } else if (enh && typeof enh.getQcWorkbenchInteractionLockTitle === 'function') {
            busyTitle = enh.getQcWorkbenchInteractionLockTitle() || busyTitle;
        }
        btn.title = busyTitle;
    } else {
        btn.title = '检测当前需求页表格内的全部用例';
    }
}

var TC_EXPORT_FAB_TREE_WIDE_ITEM_IDS = [
    'table-to-mindmap-btn',
    'tc-share-create-btn',
    'tc-share-list-open-btn'
];

var _tcExportFabTreeStatusRefreshScheduled = false;
var _tcExportFabTreeStatusLoadedDocIds = Object.create(null);

function tcExportFabRequirementTreeHasAnyDesignedCases() {
    if (typeof tcCountTableCaseContentRows === 'function' && tcCountTableCaseContentRows() > 0) {
        return true;
    }
    if (!window.TcLanhuTreeCaseStatus || typeof getTcLanhuDocTreeMeta !== 'function') {
        return false;
    }
    var meta = getTcLanhuDocTreeMeta();
    var docId = meta && meta.docId ? String(meta.docId).trim() : '';
    if (!docId) return false;
    var summary = window.TcLanhuTreeCaseStatus.getSummary(docId);
    return !!(summary && summary.designed > 0);
}

function tcScheduleExportFabTreeCaseStatusRefresh() {
    if (_tcExportFabTreeStatusRefreshScheduled) return;
    if (!window.TcLanhuTreeCaseStatus || typeof getTcLanhuDocTreeMeta !== 'function') return;
    var meta = getTcLanhuDocTreeMeta();
    var docId = meta && meta.docId ? String(meta.docId).trim() : '';
    if (!docId) return;
    if (_tcExportFabTreeStatusLoadedDocIds[docId]) return;
    _tcExportFabTreeStatusRefreshScheduled = true;
    window.TcLanhuTreeCaseStatus.loadForDoc(docId).finally(function () {
        _tcExportFabTreeStatusRefreshScheduled = false;
        _tcExportFabTreeStatusLoadedDocIds[docId] = true;
        if (typeof syncTcExportFabSheetItemsChrome === 'function') {
            syncTcExportFabSheetItemsChrome(undefined, { skipTreeStatusRefresh: true });
        }
    });
}

var TC_EXPORT_FAB_MENU_ITEM_IDS = [
    'export-excel-btn',
    'table-to-mindmap-btn',
    'export-xmind-btn',
    'clear-mindmap-btn',
    'tc-share-create-btn',
    'tc-share-list-open-btn'
];

function syncTcExportFabSheetItemsChrome(appliedOpt, syncOpts) {
    syncOpts = syncOpts || {};
    var applied = appliedOpt;
    if (applied === undefined) {
        applied = !!(typeof tcTableTemplateApplied !== 'undefined' && tcTableTemplateApplied && tableColumns.length > 0);
    }
    var hasCaseContent = typeof tcCountTableCaseContentRows === 'function' && tcCountTableCaseContentRows() > 0;
    var hasTreeWideCases = tcExportFabRequirementTreeHasAnyDesignedCases();
    var inMindmapView = typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap';
    var enabledMindmapReview = inMindmapView &&
        typeof window.tcExportFabMindmapReviewItemsEnabled === 'function' &&
        window.tcExportFabMindmapReviewItemsEnabled();
    if (inMindmapView) {
        if (!enabledMindmapReview && !syncOpts.skipMindmapReviewRefresh &&
            typeof window.tcScheduleExportFabMindmapReviewStatusRefresh === 'function') {
            window.tcScheduleExportFabMindmapReviewStatusRefresh();
        }
    } else if (!hasTreeWideCases && !syncOpts.skipTreeStatusRefresh) {
        tcScheduleExportFabTreeCaseStatusRefresh();
    }
    var enabledCurrentPage = !!applied && hasCaseContent;
    var enabledTreeWide = !!hasTreeWideCases;
    TC_EXPORT_FAB_MENU_ITEM_IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (id === 'export-excel-btn' && window.tcExportExcelBusy) {
            el.disabled = true;
            el.setAttribute('aria-disabled', 'true');
            return;
        }
        if (id === 'table-to-mindmap-btn' && window.tcExportExcelFabBusy) {
            el.disabled = true;
            el.setAttribute('aria-disabled', 'true');
            return;
        }
        var useTreeWide = TC_EXPORT_FAB_TREE_WIDE_ITEM_IDS.indexOf(id) >= 0;
        var isReviewFab = id === 'tc-share-create-btn' || id === 'tc-share-list-open-btn';
        var itemEnabled;
        if (isReviewFab && inMindmapView) {
            itemEnabled = !!enabledMindmapReview;
        } else if (useTreeWide) {
            itemEnabled = enabledTreeWide;
        } else {
            itemEnabled = enabledCurrentPage;
        }
        el.disabled = !itemEnabled;
        if (!itemEnabled) el.setAttribute('aria-disabled', 'true');
        else el.removeAttribute('aria-disabled');
    });
}

function syncTcTableTemplateChrome() {
    var listPanel = document.getElementById('tc-table-list-panel');
    var hasColumns = tableColumns.length > 0;
    var hasCaseRows = typeof testCasesData !== 'undefined' && testCasesData && testCasesData.length > 0;
    if (hasColumns && (tcTableTemplateApplied || hasCaseRows)) {
        tcTableTemplateApplied = true;
    }
    var applied = tcTableTemplateApplied && hasColumns;
    if (typeof syncTcTableBootLoadingChrome === 'function') {
        syncTcTableBootLoadingChrome(applied);
    }
    if (listPanel) listPanel.classList.toggle('tc-table-list-panel--locked', !applied);
    var vxePanel = document.getElementById('tc-vxe-table-view-panel');
    if (vxePanel) {
        vxePanel.classList.toggle('hidden', !applied);
        vxePanel.setAttribute('aria-hidden', applied ? 'false' : 'true');
    }
    if (!applied) ensureTcTemplateChooserUiReady();
    syncTcRightPanelMeta();
    var showFab = !isTcHubExcelTabActive();
    if (showFab) {
        ensureTcExportFabMounted();
        if (typeof isTcTableToolbarOpsMode === 'function' && isTcTableToolbarOpsMode()) {
            if (typeof initTcTableToolbarOpsUi === 'function') initTcTableToolbarOpsUi();
        } else {
            ensureTcTableFabMounted();
            if (typeof initTcTableFabUi === 'function') initTcTableFabUi();
        }
        if (typeof initTcExportFabUi === 'function') initTcExportFabUi();
    }
    function syncOneFabWrap(wrapId, userMoved, resetFn, ensureFn, getDefaultFn) {
        var fabWrap = document.getElementById(wrapId);
        if (!fabWrap) return;
        fabWrap.classList.toggle('hidden', !showFab);
        fabWrap.setAttribute('aria-hidden', showFab ? 'false' : 'true');
        if (!showFab) return;
        var toggleId = wrapId === 'tc-export-fab-wrap' ? 'tc-export-fab-toggle' : 'tc-table-fab-toggle';
        var toggle = document.getElementById(toggleId);
        if (!userMoved) {
            if (shouldResetTcFabToDefault(toggle, getDefaultFn)) resetFn();
        } else {
            ensureFn();
        }
        window.requestAnimationFrame(function() {
            ensureFn();
            if (typeof refreshOpenTcFabSheetPlacements === 'function') {
                refreshOpenTcFabSheetPlacements();
            }
        });
    }
    if (!showFab) {
        closeTcTableFabSheet();
    } else {
        if (typeof syncTcTableToolbarOpsAnchor === 'function' &&
            syncTcTableToolbarOpsAnchor({ showFab: showFab, applied: applied })) {
            /* 编辑 FAB 已收进顶栏下拉 */
        } else {
            syncOneFabWrap('tc-table-fab-wrap', isTcEditFabUserMoved(), resetTcTableFabToDefault, ensureTcTableFabOnScreen, getDefaultTcTableFabPosition);
        }
        syncOneFabWrap('tc-export-fab-wrap', isTcExportFabUserMoved(), resetTcExportFabToDefault, ensureTcExportFabOnScreen, getDefaultTcExportFabPosition);
        tcFabApplyViewFabPositions(tcRightViewMode);
    }
    ['table-column-settings-btn', 'add-row-btn', 'delete-selected-rows-btn', 'clear-table-btn'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.disabled = !applied;
    });
    syncTcExportFabSheetItemsChrome(applied);
    syncTcQualityCheckButtonChrome();
}

function renderTcTemplateModalGrid() {
    var grid = document.getElementById('tc-template-modal-grid');
    if (!grid) return;
    if (!tcCaseTemplatesLoaded) {
        grid.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">加载中</p>';
        return;
    }
    if (!TC_CASE_TEMPLATES.length) {
        grid.innerHTML = '<p class="text-sm text-rose-600 py-6 text-center">加载失败</p>';
        return;
    }
    grid.innerHTML = TC_CASE_TEMPLATES.map(function(tpl) {
        var colN = Array.isArray(tpl.columns) ? tpl.columns.length : 0;
        var active = tcActiveTemplateId === tpl.id ? ' tc-template-option--active' : '';
        return (
            '<button type="button" class="tc-template-option' + active + '" data-tc-template-id="' + escapeTcHtml(tpl.id) + '">' +
            '<span class="tc-template-option__icon tc-template-option__icon--' + escapeTcHtml(tpl.badgeClass) + '">' + escapeTcHtml(tpl.badge) + '</span>' +
            '<span class="tc-template-option__body">' +
            '<span class="tc-template-option__name">' + escapeTcHtml(tpl.name) + '</span>' +
            '<span class="tc-template-option__meta">' + colN + ' 列</span>' +
            '</span>' +
            '<span class="tc-template-option__tail">' +
            '<svg class="tc-template-option__chev" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7.5 5l5 5-5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</span></button>'
        );
    }).join('');
}

function openTcTemplateModal() {
    var modal = document.getElementById('tc-template-modal');
    if (!modal) return;
    if (typeof ensureTcWorkbenchOverlaysMounted === 'function') ensureTcWorkbenchOverlaysMounted();
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    if (typeof initTcTemplateModalUi === 'function') initTcTemplateModalUi();
    if (typeof tcEnsureModalTopLayer === 'function') tcEnsureModalTopLayer(modal);
    function reveal() {
        renderTcTemplateModalGrid();
        showModal(modal);
        document.body.style.overflow = 'hidden';
    }
    if (!tcCaseTemplatesLoaded) {
        fetchTcCaseTemplates().then(reveal).catch(function() {
            reveal();
        });
    } else {
        reveal();
    }
}

function closeTcTemplateModal() {
    var modal = document.getElementById('tc-template-modal');
    hideModal(modal);
    if (!document.querySelector('#tc-template-modal.flex, #tc-feature-unlock-modal.flex')) {
        document.body.style.overflow = '';
    }
    if (!isTcExplicitTemplateApplied() && window._tcPendingPageGenAfterTemplate) {
        window._tcPendingPageGenAfterTemplate = null;
    }
}

/** 工作台：悬浮钮 / 模板入口统一委托（挂 body 后仍有效） */
function initTcWorkbenchClickDelegate() {
    if (window._tcWorkbenchClickDelegate) return;
    window._tcWorkbenchClickDelegate = true;
    document.addEventListener('click', function(e) {
        if (!document.querySelector('.tc-workbench-scope')) return;
        if (isTcHubExcelTabActive()) return;
        if (false) return;
        if (document.body.classList.contains('tc-left-input-float-dragging')) return;

        var tplBtn = e.target && e.target.closest
            ? e.target.closest('#tc-choose-template-btn, #tc-switch-template-btn')
            : null;
        if (tplBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openTcTemplateModal === 'function') openTcTemplateModal();
            return;
        }

        var tplCloseBtn = e.target && e.target.closest
            ? e.target.closest('#tc-template-modal-close')
            : null;
        if (tplCloseBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcTemplateModal === 'function') closeTcTemplateModal();
            return;
        }

        var tplOptionBtn = e.target && e.target.closest
            ? e.target.closest('#tc-template-modal [data-tc-template-id]')
            : null;
        if (tplOptionBtn) {
            e.preventDefault();
            e.stopPropagation();
            var tplPickId = tplOptionBtn.getAttribute('data-tc-template-id');
            if (tplPickId && typeof applyTcCaseTemplate === 'function') applyTcCaseTemplate(tplPickId);
            return;
        }

        var tplModalRoot = document.getElementById('tc-template-modal');
        if (tplModalRoot && e.target === tplModalRoot && tplModalRoot.classList.contains('flex')) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcTemplateModal === 'function') closeTcTemplateModal();
            return;
        }

        var vcOverwriteBtn = e.target && e.target.closest
            ? e.target.closest('#tc-view-convert-overwrite')
            : null;
        if (vcOverwriteBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcViewConvertModal === 'function') closeTcViewConvertModal('overwrite');
            return;
        }

        var vcAppendBtn = e.target && e.target.closest
            ? e.target.closest('#tc-view-convert-append')
            : null;
        if (vcAppendBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcViewConvertModal === 'function') closeTcViewConvertModal('append');
            return;
        }

        var vcCancelBtn = e.target && e.target.closest
            ? e.target.closest('#tc-view-convert-cancel')
            : null;
        if (vcCancelBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcViewConvertModal === 'function') closeTcViewConvertModal('cancel');
            return;
        }

        var vcModalRoot = document.getElementById('tc-view-convert-modal');
        if (vcModalRoot && e.target === vcModalRoot && vcModalRoot.classList.contains('flex')) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcViewConvertModal === 'function') closeTcViewConvertModal('cancel');
            return;
        }

        var aiOpenBtn = e.target && e.target.closest
            ? e.target.closest('#tc-left-input-float-wrap [data-tc-float-open]')
            : null;
        if (aiOpenBtn) {
            if (aiOpenBtn._tcLeftFloatOpenSuppressClick) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof openTcLeftInputFloatFromFab === 'function') {
                openTcLeftInputFloatFromFab();
            } else if (typeof expandTcLeftFloatPanel === 'function') {
                expandTcLeftFloatPanel();
            }
            return;
        }

        var drawerBtn = e.target && e.target.closest
            ? e.target.closest('.tc-left-float-dock__mode[data-tc-float-drawer]')
            : null;
        if (drawerBtn) {
            e.preventDefault();
            e.stopPropagation();
            var n = parseInt(drawerBtn.getAttribute('data-tc-float-drawer'), 10);
            if (typeof expandTcLeftFloatPanel === 'function') {
                expandTcLeftFloatPanel(n === 2 ? 2 : 1);
            }
            return;
        }
    });
}


function resetRequirementCaseTableUi() {
    if (typeof window.isTcRequirementPageGenBusy === 'function' && window.isTcRequirementPageGenBusy()) {
        return;
    }
    if (typeof window.isTcPageGenLockActive === 'function' && window.isTcPageGenLockActive()) {
        return;
    }
    if (typeof isTcLeftPanelNavLocked === 'function' && isTcLeftPanelNavLocked()) {
        return;
    }
    if (typeof isTcWorkbenchGenerationActive === 'function' &&
        isTcWorkbenchGenerationActive()) {
        return;
    }
    if (window.TcTableBridge && typeof window.TcTableBridge.commitAll === 'function') {
        try { window.TcTableBridge.commitAll(); } catch (e0) { /* ignore */ }
    }
    if (window.TcTableView && typeof window.TcTableView.reset === 'function') {
        try { window.TcTableView.reset(); } catch (eReset) { /* ignore */ }
    }
    tcTableTemplateApplied = false;
    tcActiveTemplateId = null;
    tableColumns = [];
    testCasesData = [];
    testCasesProvenance = [];
    if (typeof tcClearTableLayoutMaps === 'function') {
        tcClearTableLayoutMaps();
    } else {
        Object.keys(columnVisible).forEach(function (k) { delete columnVisible[k]; });
        Object.keys(columnWidth).forEach(function (k) { delete columnWidth[k]; });
        Object.keys(rowHeights).forEach(function (k) { delete rowHeights[k]; });
    }
    markedRows = new Set();
    selectedRows.clear();
    if (typeof tcTableResetUndoHistory === 'function') tcTableResetUndoHistory();
    if (typeof renderTableHeader === 'function') renderTableHeader();
    if (typeof renderTableBody === 'function') renderTableBody({ reload: true });
    if (typeof updateRestoreButton === 'function') updateRestoreButton();
    syncTcTableTemplateChrome();
    if (typeof syncTcRightPanelMeta === 'function') syncTcRightPanelMeta();
    if (typeof tcTableEnsureHistoryReady === 'function') tcTableEnsureHistoryReady();
}

function applyRequirementCasePayload(payload, opts) {
    opts = opts || {};
    if (!payload || !payload.columns || !payload.columns.length) {
        return Promise.resolve(false);
    }
    if (typeof isTcWorkbenchGenerationActive === 'function' &&
        isTcWorkbenchGenerationActive()) {
        return Promise.resolve(false);
    }
    var cols = payload.columns.map(String);
    var rows = (payload.rows || []).map(function (row) {
        var out = [];
        for (var i = 0; i < cols.length; i++) {
            out.push(Array.isArray(row) && row[i] != null ? String(row[i]) : '');
        }
        return out;
    });
    tableColumns = cols;
    testCasesData = rows;
    if (typeof tcProvenanceArrayFromStashPayload === 'function') {
        testCasesProvenance = tcProvenanceArrayFromStashPayload(payload, rows.length);
    } else {
        testCasesProvenance = [];
    }
    if (typeof tcEnsureProvenanceLength === 'function') tcEnsureProvenanceLength();
    tcTableTemplateApplied = true;
    if (opts.templateId && typeof setTcActiveTemplateId === 'function') {
        setTcActiveTemplateId(opts.templateId);
    } else if (opts.templateId) {
        tcActiveTemplateId = String(opts.templateId);
        if (typeof syncTcActiveTemplateIdToWindow === 'function') syncTcActiveTemplateIdToWindow();
    } else {
        tcActiveTemplateId = null;
        if (typeof syncTcActiveTemplateIdToWindow === 'function') syncTcActiveTemplateIdToWindow();
    }
    markedRows = new Set();
    selectedRows.clear();
    if (typeof tcTableResetUndoHistory === 'function') tcTableResetUndoHistory();
    if (typeof tcApplyStashTableLayoutFromPayload === 'function') {
        tcApplyStashTableLayoutFromPayload(payload);
    } else {
        tcClearTableLayoutMaps();
        var n = cols.length;
        if (payload.columnVisible && typeof payload.columnVisible === 'object') {
            Object.keys(payload.columnVisible).forEach(function (k) {
                var i = parseInt(k, 10);
                if (Number.isNaN(i) || i < 0 || i >= n) return;
                columnVisible[i] = payload.columnVisible[k] !== false;
            });
        }
        if (payload.columnWidth && typeof payload.columnWidth === 'object') {
            Object.keys(payload.columnWidth).forEach(function (k) {
                var i = parseInt(k, 10);
                var w = parseInt(payload.columnWidth[k], 10);
                if (Number.isNaN(i) || i < 0 || i >= n || Number.isNaN(w) || w <= 0) return;
                columnWidth[i] = w;
            });
        }
        if (payload.rowHeights && typeof payload.rowHeights === 'object') {
            Object.keys(payload.rowHeights).forEach(function (k) {
                var i = parseInt(k, 10);
                var h = parseInt(payload.rowHeights[k], 10);
                if (Number.isNaN(i) || i < 0 || Number.isNaN(h) || h <= 0) return;
                rowHeights[i] = h;
            });
        }
        if (typeof initColumnState === 'function') initColumnState();
        if (typeof updateRestoreButton === 'function') updateRestoreButton();
    }
    if (typeof switchTcRightView === 'function') switchTcRightView('table');
    var openP = Promise.resolve(true);
    if (window.TcTableView && typeof window.TcTableView.open === 'function') {
        openP = Promise.resolve(window.TcTableView.open({
            keepRows: true,
            layoutColumns: true,
            resetColumnLayout: true,
            fitColumns: true
        }));
    } else if (typeof renderTableHeader === 'function') {
        renderTableHeader();
    }
    return openP.then(function () {
        if (typeof updateRestoreButton === 'function') updateRestoreButton();
        syncTcTableTemplateChrome();
        if (typeof syncTcRightPanelMeta === 'function') syncTcRightPanelMeta();
        if (typeof tcTableEnsureHistoryReady === 'function') tcTableEnsureHistoryReady();
        return true;
    }).catch(function () {
        if (typeof updateRestoreButton === 'function') updateRestoreButton();
        syncTcTableTemplateChrome();
        return true;
    });
}

if (typeof window !== 'undefined') {
    window.resetRequirementCaseTableUi = resetRequirementCaseTableUi;
    window.applyRequirementCasePayload = applyRequirementCasePayload;
}

function showTablePageLoading() {
    var panel = document.getElementById('tc-table-list-panel');
    if (!panel) return;
    panel.classList.add('tc-table-list-panel--page-loading');
}

function hideTablePageLoading() {
    var panel = document.getElementById('tc-table-list-panel');
    if (!panel) return;
    panel.classList.remove('tc-table-list-panel--page-loading');
}

if (typeof window !== 'undefined') {
    window.showTablePageLoading = showTablePageLoading;
    window.hideTablePageLoading = hideTablePageLoading;
}

function applyTcCaseTemplate(templateId, opts) {
    opts = opts || {};
    var tpl = TC_CASE_TEMPLATES.find(function(t) { return t.id === templateId; });
    if (!tpl) return;
    if (typeof window !== 'undefined') window._tcTemplateSwitchApplyInProgress = true;
    try {
    if (typeof tcTemplateSwitchBeforeApply === 'function') {
        tcTemplateSwitchBeforeApply(tcActiveTemplateId, templateId);
    }
    if (!opts.skipTemplateSwitchRestore && typeof tcTemplateSwitchTryRestore === 'function') {
        if (tcTemplateSwitchTryRestore(templateId, { silent: opts.silent })) {
            if (typeof setTcActiveTemplateId === 'function') setTcActiveTemplateId(templateId); else tcActiveTemplateId = templateId;
            tcTableTemplateApplied = true;
            return;
        }
    }
    if (typeof setTcActiveTemplateId === 'function') setTcActiveTemplateId(templateId); else tcActiveTemplateId = templateId;
    tcTableTemplateApplied = true;
    tableColumns = tpl.columns.slice();
    tcMindmapRootTopic = typeof resolveTcMindmapFixedRootTopic === 'function'
        ? resolveTcMindmapFixedRootTopic()
        : '测试用例';
    if (!opts.keepRows) {
        if (window.TcTableView && typeof window.TcTableView.reset === 'function') {
            try { window.TcTableView.reset(); } catch (eResetTpl) { /* ignore */ }
        }
        markedRows = new Set();
        selectedRows.clear();
        seedTcTableDefaultEmptyRows();
    }
    columnVisible = {};
    columnWidth = {};
    rowHeights = {};
    tcTableResetUndoHistory();
    initColumnState();
    saveTcDailyTemplateChoice(templateId);
    if (window.TcTableView && typeof window.TcTableView.open === 'function') {
        window.TcTableView.open({ keepRows: true, layoutColumns: true, resetColumnLayout: true, fitColumns: true });
    } else {
        renderTableHeader();
    }
    syncTcTableTemplateChrome();
    closeTcTemplateModal();
    switchTcRightView('table');
    tcTableEnsureHistoryReady();
    if (!opts.silent) {
        tcAppToast('已应用 ' + tpl.name, { variant: 'success', duration: 2200 });
    }
    if (window._tcPendingPageGenAfterTemplate) {
        var pendingPageGen = window._tcPendingPageGenAfterTemplate;
        window._tcPendingPageGenAfterTemplate = null;
        // 仅当 pending 目标页面就是当前选中页时才触发
        var pendingPageId = String(pendingPageGen.pageId || '').trim();
        if (pendingPageId) {
            var curPageId = '';
            if (window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.resolveContext === 'function') {
                var curCtx = window.TcRequirementCaseStore.resolveContext({});
                if (curCtx) {
                    curPageId = String(curCtx.lanhu_page_id || curCtx.page_id || '').trim();
                }
            }
            if (curPageId && curPageId !== pendingPageId) {
                return;
            }
        }
        setTimeout(function() {
            if (typeof window.openTcPageGenModal === 'function') {
                window.openTcPageGenModal(pendingPageGen.pageId, pendingPageGen.pageName);
            }
        }, 0);
    }
    } finally {
        if (typeof syncTcActiveTemplateIdToWindow === 'function') syncTcActiveTemplateIdToWindow();
        if (typeof window !== 'undefined') window._tcTemplateSwitchApplyInProgress = false;
        if (typeof tcTemplateSwitchAfterApply === 'function') tcTemplateSwitchAfterApply(templateId);
    }
}

function initTcTemplateModalUi() {
    var openIds = ['tc-choose-template-btn', 'tc-switch-template-btn'];
    openIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (el && !el._tcTplBound) {
            el._tcTplBound = true;
            el.addEventListener('click', openTcTemplateModal);
        }
    });
    var modal = document.getElementById('tc-template-modal');
    var closeBtn = document.getElementById('tc-template-modal-close');
    if (closeBtn && !closeBtn._tcTplBound) {
        closeBtn._tcTplBound = true;
        closeBtn.addEventListener('click', closeTcTemplateModal);
    }
    if (modal && !modal._tcTplBound) {
        modal._tcTplBound = true;
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeTcTemplateModal();
        });
    }
    var grid = document.getElementById('tc-template-modal-grid');
    if (grid && !grid._tcTplClickBound) {
        grid._tcTplClickBound = true;
        grid.addEventListener('click', function(e) {
            var btn = e.target && e.target.closest ? e.target.closest('[data-tc-template-id]') : null;
            if (!btn) return;
            var id = btn.getAttribute('data-tc-template-id');
            if (id) applyTcCaseTemplate(id);
        });
    }
}

// 渲染表格内容
function formatTableCellDisplay(cell) {
    let displayText = cell || '';
    displayText = String(displayText);
    displayText = displayText.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, '');
    displayText = displayText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    displayText = displayText.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
    return displayText;
}

function getTableDataCellEl(rowIndex, colIndex) {
    return document.querySelector('#test-case-table td.tc-td-data[data-row-index="' + rowIndex + '"][data-col-index="' + colIndex + '"]');
}

function clearTableCellFocus() {
    document.querySelectorAll('#test-case-table td.tc-cell-focused').forEach(function(el) {
        el.classList.remove('tc-cell-focused', 'tc-cell-editing');
    });
    tcFocusedCell = null;
}

function focusTableCell(rowIndex, colIndex, cellEl) {
    if (tcEditingCell) return;
    clearTableCellFocus();
    tcFocusedCell = { row: rowIndex, col: colIndex };
    var cell = cellEl || getTableDataCellEl(rowIndex, colIndex);
    if (cell) cell.classList.add('tc-cell-focused');
}

function startTableCellEdit(rowIndex, colIndex, cellEl, initialValue) {
    if (tcEditingCell && tcEditingCell.row === rowIndex && tcEditingCell.col === colIndex) {
        if (initialValue !== undefined) {
            var sameCell = getTableDataCellEl(rowIndex, colIndex);
            var sameEditor = sameCell && sameCell.querySelector('.tc-cell-editor');
            if (sameEditor) {
                sameEditor.value = String(sameEditor.value || '') + String(initialValue);
                sameEditor.focus();
                var endPos = sameEditor.value.length;
                sameEditor.setSelectionRange(endPos, endPos);
            }
        }
        return;
    }
    commitTableCellEdit(true);
    var cell = cellEl || getTableDataCellEl(rowIndex, colIndex);
    if (!cell) return;
    if (!testCasesData[rowIndex]) {
        ensureTcTableRowMaterialized(rowIndex);
    }
    if (!testCasesData[rowIndex]) return;
    var rawValue = testCasesData[rowIndex][colIndex] || '';
    var startValue = initialValue !== undefined ? String(initialValue) : String(rawValue);
    var cellHeight = getTableRowHeight(rowIndex);
    var cellWidth = Math.max(cell.offsetWidth, 80);
    tcEditingCell = { row: rowIndex, col: colIndex };
    tcFocusedCell = { row: rowIndex, col: colIndex };
    cell.classList.add('tc-cell-focused', 'tc-cell-editing');
    cell.style.boxSizing = 'border-box';
    cell.style.height = cellHeight + 'px';
    cell.style.minHeight = cellHeight + 'px';
    cell.style.width = cellWidth + 'px';
    cell.style.minWidth = cellWidth + 'px';
    cell.innerHTML = '';
    var textarea = document.createElement('textarea');
    textarea.className = 'tc-cell-editor';
    textarea.value = startValue;
    cell.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(startValue.length, startValue.length);
    textarea.addEventListener('blur', function() {
        window.setTimeout(function() {
            if (!tcEditingCell || tcEditingCell.row !== rowIndex || tcEditingCell.col !== colIndex) return;
            var active = document.activeElement;
            if (active && active.classList && active.classList.contains('tc-cell-editor')) return;
            commitTableCellEdit();
        }, 0);
    });
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cancelTableCellEdit();
            e.preventDefault();
            return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            commitTableCellEdit();
            e.preventDefault();
            return;
        }
        e.stopPropagation();
    });
}

function shouldHandleTcCellTypeInput() {
    if (typeof tcAppDialogIsOpen === 'function' && tcAppDialogIsOpen()) return false;
    if (tcEditingCell) return false;
    if (!tcFocusedCell || !tcTableTemplateApplied || !getTcTableBodyRowCount()) return false;
    var active = document.activeElement;
    if (active && active.closest && active.closest('input, textarea, select, [contenteditable="true"]')) {
        if (!active.classList.contains('tc-cell-editor')) return false;
    }
    return true;
}

var tcCellImeComposing = false;

function beginTcCellEditFromInput(initialValue) {
    if (!tcFocusedCell) return;
    startTableCellEdit(tcFocusedCell.row, tcFocusedCell.col, null, initialValue);
}

function isTcVxeTableActive() {
    var mount = document.getElementById('tc-vxe-table-mount');
    return !!(mount && mount.querySelector('.vxe-table'));
}

function onTcTableCellKeydown(e) {
    if (isTcVxeTableActive()) return;
    var activeEl = document.activeElement;
    if (activeEl && activeEl.closest) {
        if (activeEl.classList && activeEl.classList.contains('tc-cell-editor')) return;
        if (activeEl.closest('.vxe-cell--edit')) return;
    }
    if (!shouldHandleTcCellTypeInput()) return;
    if (tcCellImeComposing) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        beginTcCellEditFromInput('');
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        startTableCellEdit(tcFocusedCell.row, tcFocusedCell.col);
        return;
    }
    if (e.key.length === 1) {
        e.preventDefault();
        beginTcCellEditFromInput(e.key);
    }
}

function onTcTableCellPaste(e) {
    if (isTcVxeTableActive()) return;
    if (!shouldHandleTcCellTypeInput()) return;
    var text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (text === '') return;
    e.preventDefault();
    beginTcCellEditFromInput(text);
}

function onTcTableCellCompositionStart() {
    if (isTcVxeTableActive()) return;
    if (shouldHandleTcCellTypeInput()) tcCellImeComposing = true;
}

function onTcTableCellCompositionEnd(e) {
    if (isTcVxeTableActive()) return;
    if (!tcCellImeComposing) return;
    tcCellImeComposing = false;
    if (tcEditingCell || !tcFocusedCell) return;
    if (e.data) {
        e.preventDefault();
        beginTcCellEditFromInput(e.data);
    }
}

function initTcTableCellKeyboardInput() {
    if (document.documentElement.dataset.tcCellKeyboardBound === '1') return;
    document.documentElement.dataset.tcCellKeyboardBound = '1';
    document.addEventListener('keydown', onTcTableCellKeydown);
    document.addEventListener('paste', onTcTableCellPaste);
    document.addEventListener('compositionstart', onTcTableCellCompositionStart);
    document.addEventListener('compositionend', onTcTableCellCompositionEnd);
}

function commitTableCellEdit(skipRender) {
    if (!tcEditingCell) return;
    var row = tcEditingCell.row;
    var col = tcEditingCell.col;
    var cell = getTableDataCellEl(row, col);
    var editor = cell && cell.querySelector('.tc-cell-editor');
    var changed = false;
    if (editor && testCasesData[row]) {
        var newVal = editor.value;
        if (newVal !== String(testCasesData[row][col] || '')) {
            testCasesData[row][col] = newVal;
            changed = true;
        }
    }
    var focusAfter = tcFocusedCell ? { row: tcFocusedCell.row, col: tcFocusedCell.col } : null;
    tcEditingCell = null;
    if (skipRender) return;
    renderTableBody();
    if (changed) {
        tcTableRecordAfterMutation();
        if (typeof tcTemplateSwitchOnCurrentTemplateMutated === 'function') tcTemplateSwitchOnCurrentTemplateMutated();
    }
    if (focusAfter) focusTableCell(focusAfter.row, focusAfter.col);
}

function cancelTableCellEdit() {
    if (!tcEditingCell) return;
    var row = tcEditingCell.row;
    var col = tcEditingCell.col;
    tcEditingCell = null;
    renderTableBody();
    focusTableCell(row, col);
}


function scheduleReleaseWorkbenchInteractionLocks() {
    if (typeof window.releaseWorkbenchInteractionLocks === 'function') {
        window.releaseWorkbenchInteractionLocks();
    }
    window.requestAnimationFrame(function() {
        if (typeof window.releaseWorkbenchInteractionLocks === 'function') {
            window.releaseWorkbenchInteractionLocks();
        }
    });
    window.setTimeout(function() {
        if (typeof window.releaseWorkbenchInteractionLocks === 'function') {
            window.releaseWorkbenchInteractionLocks();
        }
    }, 120);
}

function releaseWorkbenchInteractionLocks() {
    if (window.TcLeftPanelLock && typeof window.TcLeftPanelLock.isQualityCheckBusy === 'function' &&
        window.TcLeftPanelLock.isQualityCheckBusy()) {
        return;
    }
    if (typeof window.isTcGenQualityCheckInProgress === 'function' &&
        window.isTcGenQualityCheckInProgress()) {
        return;
    }
    if (typeof window.setTcLeftPanelAiGenerateLock === 'function') {
        window.setTcLeftPanelAiGenerateLock(false);
    }
    if (window.TcAgentOrchestrator && typeof window.TcAgentOrchestrator.releaseGenModeLockIfIdle === 'function') {
        window.TcAgentOrchestrator.releaseGenModeLockIfIdle();
    }
    if (typeof tcEditingCell !== 'undefined' && tcEditingCell) {
        if (typeof commitTableCellEdit === 'function') commitTableCellEdit(true);
        else if (typeof cancelTableCellEdit === 'function') cancelTableCellEdit();
    }
    if (typeof clearTableCellFocus === 'function') clearTableCellFocus();
    document.body.classList.remove('tc-table-row-resizing', 'tc-table-fab-dragging', 'tc-workbench-fab-dragging');
    if (typeof syncTcTableTemplateChrome === 'function') syncTcTableTemplateChrome();
    if (typeof initTcTableCellInteraction === 'function') initTcTableCellInteraction();
}
window.releaseWorkbenchInteractionLocks = releaseWorkbenchInteractionLocks;
window.scheduleReleaseWorkbenchInteractionLocks = scheduleReleaseWorkbenchInteractionLocks;

function resolveTcTableDataCellFromEvent(e) {
    if (e && e.target && e.target.closest && e.target.closest(".tc-vxe-table-mount, .vxe-grid, .vxe-table")) return null;
    if (!e || !e.target || !e.target.closest) return null;
    if (!document.querySelector('.tc-workbench-scope')) return null;
    if (typeof isTcHubExcelTabActive === 'function' && isTcHubExcelTabActive()) return null;
    var panel = e.target.closest('#tc-table-view-panel');
    if (!panel) return null;
    var listPanel = document.getElementById('tc-table-list-panel');
    if (listPanel && listPanel.classList.contains('tc-table-list-panel--locked')) return null;
    if (!tcTableTemplateApplied || !tableColumns || !tableColumns.length) return null;
    if (e.target.closest('.tc-td-actions')) return null;
    if (e.target.closest('.tc-row-resize-handle')) return null;
    if (e.target.closest('.tc-cell-editor')) return null;
    return e.target.closest('td.tc-td-data');
}

function initTcTableCellInteraction() {
    initTcTableCellKeyboardInput();
    if (window._tcTableCellInteractionBound) return;
    window._tcTableCellInteractionBound = true;
    document.addEventListener('click', function(e) {
        var td = resolveTcTableDataCellFromEvent(e);
        if (!td) return;
        focusTableCell(parseInt(td.dataset.rowIndex, 10), parseInt(td.dataset.colIndex, 10), td);
    }, true);
    document.addEventListener('dblclick', function(e) {
        var td = resolveTcTableDataCellFromEvent(e);
        if (!td) return;
        e.preventDefault();
        e.stopPropagation();
        startTableCellEdit(parseInt(td.dataset.rowIndex, 10), parseInt(td.dataset.colIndex, 10), td);
    }, true);
    if (!window._tcTableOutsideClickBound) {
        window._tcTableOutsideClickBound = true;
        document.addEventListener('click', function(e) {
            if (e.target.closest('#tc-table-view-panel')) return;
            if (tcEditingCell) commitTableCellEdit();
            else clearTableCellFocus();
        });
    }
}

function getTcTableBodyRowCount() {
    return testCasesData.length;
}

function getTcTableRowData(index) {
    if (testCasesData[index]) return testCasesData[index];
    return tableColumns.map(function() { return ''; });
}

/** 用户编辑/勾选占位空行时，将其写入 testCasesData */


window.tcNormalizeTableRowsForStorage = tcNormalizeTableRowsForStorage;
window.tcTableMinDisplayRowCount = tcTableMinDisplayRowCount;
window.syncTcExportFabSheetItemsChrome = syncTcExportFabSheetItemsChrome;
window.syncTcQualityCheckButtonChrome = syncTcQualityCheckButtonChrome;
window.isTcExplicitTemplateApplied = isTcExplicitTemplateApplied;
window.ensureTcTableTemplateApplied = ensureTcTableTemplateApplied;

/** 追加生成专用：锁定生成开始时的表格快照，防止 grid pull / reset 清空已有用例 */
var _tcAppendGenBaselineRows = null;
var _tcAppendGenBaselineProv = null;

function tcCloneAppendGenBaselineRows(rows) {
    if (!rows || !rows.length) return [];
    return rows.map(function (row) {
        return Array.isArray(row) ? row.slice() : row;
    });
}

function tcCountContentRowsInData(rows) {
    if (!rows || !rows.length) return 0;
    var count = 0;
    for (var i = 0; i < rows.length; i++) {
        if (typeof tcTableRowHasCaseContent === 'function') {
            if (tcTableRowHasCaseContent(rows[i])) count++;
        } else if (Array.isArray(rows[i]) && rows[i].some(function (c) { return String(c || '').trim(); })) {
            count++;
        }
    }
    return count;
}

function tcBeginAppendGenerationBaseline() {
    if (typeof testCasesData === 'undefined' || !testCasesData || !testCasesData.length) {
        _tcAppendGenBaselineRows = null;
        _tcAppendGenBaselineProv = null;
        return false;
    }
    _tcAppendGenBaselineRows = tcCloneAppendGenBaselineRows(testCasesData);
    _tcAppendGenBaselineProv = (typeof testCasesProvenance !== 'undefined' && testCasesProvenance)
        ? testCasesProvenance.slice() : null;
    return true;
}

function tcClearAppendGenerationBaseline() {
    _tcAppendGenBaselineRows = null;
    _tcAppendGenBaselineProv = null;
}

function tcHasAppendGenerationBaseline() {
    return !!(_tcAppendGenBaselineRows && _tcAppendGenBaselineRows.length);
}

function tcGetAppendGenerationBaselineRows() {
    if (!_tcAppendGenBaselineRows || !_tcAppendGenBaselineRows.length) return null;
    return tcCloneAppendGenBaselineRows(_tcAppendGenBaselineRows);
}

function tcRestoreAppendGenerationBaselineIfNeeded() {
    if (!_tcAppendGenBaselineRows || !_tcAppendGenBaselineRows.length) return false;
    if (typeof testCasesData === 'undefined') return false;
    var baseCount = tcCountContentRowsInData(_tcAppendGenBaselineRows);
    var nowCount = typeof tcCountTableCaseContentRows === 'function'
        ? tcCountTableCaseContentRows()
        : tcCountContentRowsInData(testCasesData);
    if (baseCount > nowCount || _tcAppendGenBaselineRows.length > (testCasesData || []).length) {
        testCasesData = tcCloneAppendGenBaselineRows(_tcAppendGenBaselineRows);
        if (_tcAppendGenBaselineProv && typeof testCasesProvenance !== 'undefined') {
            testCasesProvenance = _tcAppendGenBaselineProv.slice();
            if (typeof tcEnsureProvenanceLength === 'function') {
                try { tcEnsureProvenanceLength(); } catch (eProv) { /* ignore */ }
            }
        }
        if (typeof renderTableBody === 'function') {
            renderTableBody({ reload: true });
        }
        return true;
    }
    return false;
}

/** 暂停/取消横幅：仅统计本次生成会话实际写入的行数（追加模式不计入已有用例）。 */
function tcResolveGenerationPausedWrittenRows(opts) {
    opts = opts || {};
    if (window.TcGenerationStreamClient && typeof window.TcGenerationStreamClient.getSessionRowsAdded === 'function') {
        var sessionAdded = parseInt(window.TcGenerationStreamClient.getSessionRowsAdded(), 10) || 0;
        if (sessionAdded > 0) return sessionAdded;
    }
    if (typeof tcHasAppendGenerationBaseline === 'function' && tcHasAppendGenerationBaseline()) {
        var baseline = typeof tcGetAppendGenerationBaselineRows === 'function'
            ? tcGetAppendGenerationBaselineRows() : null;
        if (baseline && baseline.length) {
            var baseCount = tcCountContentRowsInData(baseline);
            var nowCount = typeof tcCountTableCaseContentRows === 'function' ? tcCountTableCaseContentRows() : 0;
            return Math.max(0, nowCount - baseCount);
        }
    }
    var batchRowCount = 0;
    var batchRowStart = -1;
    if (window.tcGenBatchCore && window.tcGenBatchCore.state) {
        batchRowCount = parseInt(window.tcGenBatchCore.state.batchRowCount, 10) || 0;
        batchRowStart = parseInt(window.tcGenBatchCore.state.batchRowStart, 10);
    }
    if (typeof tcGetLastGenerationWriteStart === 'function') {
        var writeStart = parseInt(tcGetLastGenerationWriteStart(), 10);
        if (!isNaN(writeStart) && writeStart >= 0) batchRowStart = writeStart;
    }
    if (batchRowCount > 0) {
        if (typeof tcCountTableCaseContentRows === 'function' && !isNaN(batchRowStart) && batchRowStart >= 0) {
            return tcCountTableCaseContentRows(batchRowStart, batchRowCount) || batchRowCount;
        }
        return batchRowCount;
    }
    if (!isNaN(batchRowStart) && batchRowStart > 0 && typeof tcCountTableCaseContentRows === 'function') {
        return tcCountTableCaseContentRows(batchRowStart) || 0;
    }
    return 0;
}

window.tcResolveGenerationPausedWrittenRows = tcResolveGenerationPausedWrittenRows;

window.tcResolveListGenerationBatchContentRows = tcResolveListGenerationBatchContentRows;
window.tcBeginAppendGenerationBaseline = tcBeginAppendGenerationBaseline;
window.tcClearAppendGenerationBaseline = tcClearAppendGenerationBaseline;
window.tcHasAppendGenerationBaseline = tcHasAppendGenerationBaseline;
window.tcGetAppendGenerationBaselineRows = tcGetAppendGenerationBaselineRows;
window.tcRestoreAppendGenerationBaselineIfNeeded = tcRestoreAppendGenerationBaselineIfNeeded;

function tcShouldSkipGridPullForAppendGen() {
    return typeof tcHasAppendGenerationBaseline === 'function' && tcHasAppendGenerationBaseline();
}

function tcFinalizeAppendGenerationTable() {
    if (typeof tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
        tcRestoreAppendGenerationBaselineIfNeeded();
    }
    if (typeof renderTableBody === 'function') {
        renderTableBody({ reload: true });
    }
}

window.tcShouldSkipGridPullForAppendGen = tcShouldSkipGridPullForAppendGen;
window.tcFinalizeAppendGenerationTable = tcFinalizeAppendGenerationTable;

var _tcGenerationRollbackSnapshot = null;

function tcCaptureGenerationRollbackSnapshot() {
    if (typeof testCasesData === 'undefined') {
        _tcGenerationRollbackSnapshot = null;
        return false;
    }
    _tcGenerationRollbackSnapshot = tcTableCloneSnapshot(tcTableSnapshotFromState());
    _tcGenerationRollbackSnapshot.tcActiveTemplateId = tcActiveTemplateId || null;
    _tcGenerationRollbackSnapshot.tcTableTemplateApplied = !!tcTableTemplateApplied;
    return true;
}

function tcClearGenerationRollbackSnapshot() {
    _tcGenerationRollbackSnapshot = null;
}

function tcIsGenerationRollbackSnapshotActive() {
    return !!_tcGenerationRollbackSnapshot;
}

function tcForceRestoreAppendGenerationBaseline() {
    if (!_tcAppendGenBaselineRows || !_tcAppendGenBaselineRows.length) return false;
    if (typeof testCasesData === 'undefined') return false;
    testCasesData = tcCloneAppendGenBaselineRows(_tcAppendGenBaselineRows);
    if (_tcAppendGenBaselineProv && typeof testCasesProvenance !== 'undefined') {
        testCasesProvenance = _tcAppendGenBaselineProv.map(function (p) {
            return typeof tcCloneProvenanceEntry === 'function' ? tcCloneProvenanceEntry(p) : p;
        });
        if (typeof tcEnsureProvenanceLength === 'function') {
            try { tcEnsureProvenanceLength(); } catch (eProv) { /* ignore */ }
        }
    }
    if (typeof renderTableHeader === 'function') renderTableHeader();
    if (typeof renderTableBody === 'function') renderTableBody({ reload: true });
    if (window.TcTableView && typeof window.TcTableView.syncFromData === 'function') {
        try { window.TcTableView.syncFromData({ reload: true, immediate: true }); } catch (eSync) { /* ignore */ }
    }
    if (typeof syncTcTableTemplateChrome === 'function') syncTcTableTemplateChrome();
    return true;
}

function tcRestoreGenerationRollbackSnapshot(opts) {
    opts = opts || {};
    if (opts.mergeMode === 'append' && tcForceRestoreAppendGenerationBaseline()) {
        return true;
    }
    if (!_tcGenerationRollbackSnapshot) return false;
    var snap = _tcGenerationRollbackSnapshot;
    tcTableRestoreSnapshot(snap);
    if (snap.tcActiveTemplateId != null) tcActiveTemplateId = snap.tcActiveTemplateId;
    tcTableTemplateApplied = !!snap.tcTableTemplateApplied;
    if (typeof syncTcTableTemplateChrome === 'function') syncTcTableTemplateChrome();
    if (typeof syncTcProvenanceRail === 'function') syncTcProvenanceRail();
    if (window.TcTableView && typeof window.TcTableView.syncFromData === 'function') {
        try { window.TcTableView.syncFromData({ reload: true, immediate: true }); } catch (eSync2) { /* ignore */ }
    }
    return true;
}

window.tcCaptureGenerationRollbackSnapshot = tcCaptureGenerationRollbackSnapshot;
window.tcClearGenerationRollbackSnapshot = tcClearGenerationRollbackSnapshot;
window.tcIsGenerationRollbackSnapshotActive = tcIsGenerationRollbackSnapshotActive;
window.tcRestoreGenerationRollbackSnapshot = tcRestoreGenerationRollbackSnapshot;
window.tcForceRestoreAppendGenerationBaseline = tcForceRestoreAppendGenerationBaseline;




window.seedTcTableDefaultEmptyRows = seedTcTableDefaultEmptyRows;
