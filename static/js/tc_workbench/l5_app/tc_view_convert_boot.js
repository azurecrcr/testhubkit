/**
 * TestHub TC Workbench — L5 APP
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */

function tcTablePullRowsFromView() {
    if (window.TcTableView && typeof window.TcTableView.pullRows === 'function') {
        return window.TcTableView.pullRows();
    }
    return Promise.resolve(true);
}

function resolveTcCaseNameColumnIndex() {
    var candidates = ['用例名称', '用例标题', '用例摘要', '标题'];
    for (var i = 0; i < candidates.length; i++) {
        var idx = tableColumns.indexOf(candidates[i]);
        if (idx >= 0) return idx;
    }
    return typeof getTcColumnIndex === 'function' ? getTcColumnIndex('用例名称', 0) : 0;
}

function tcTableHasCaseData() {
    return collectTableRowsForMindmapConvert().length > 0;
}

function tcMindmapHasCaseData() {
    var nameCol = getTcColumnIndex('用例名称', 0);
    var i;
    for (i = 0; i < tcMindmapCasesData.length; i++) {
        var row = tcMindmapCasesData[i];
        if (row && String(row[nameCol] || '').trim()) return true;
    }
    var mind = tcMindmapCaptureMindSnapshot() || tcMindmapExternalMindData;
    if (mind && mind.data && Array.isArray(mind.data.children) && mind.data.children.length) {
        return true;
    }
    return false;
}
function fetchTableToMindmapApi(columns, rows, rootTopic) {
    return fetch('/api/test-cases/table-to-mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            columns: columns,
            rows: rows,
            root_topic: rootTopic || '测试用例'
        })
    }).then(function(resp) {
        return resp.json().then(function(data) {
            if (!resp.ok || (data && data.error)) {
                throw new Error((data && data.error) || ('HTTP ' + resp.status));
            }
            return data;
        });
    });
}
function applyMindmapConvertResult(data, combinedRows) {
    var mind = data && data.mind;
    if (!mind || !mind.data) {
        throw new Error('服务端未返回有效的思维导图数据');
    }
    tcMindmapCasesData = combinedRows.map(function(r) { return r.slice(); });
    var mindClone;
    try {
        mindClone = JSON.parse(JSON.stringify(mind));
    } catch (cloneErr) {
        mindClone = mind;
    }
    tcMindmapExternalMindData = mindClone;
    tcMindmapCommittedExternalMind = mindClone;
    tcMindmapCachedMindPayload = null;
    tcMindmapSkipCacheRestore = true;
    if (typeof tcMindmapReleaseInstance === 'function') tcMindmapReleaseInstance();
    tcMindmapRootTopic = String(mind.data.topic || '测试用例');
    tcMindmapUndoStack = [];
    tcMindmapHistory = [];
    tcMindmapHistoryIndex = -1;
    tcMindmapUndoBaseline = null;
    tcMindmapMetaById = {};
    tcMindmapGenerating = false;
    tcMindmapPendingFitFocus = true;
    window.tcMindmapExternalMindData = mindClone;
    window.tcMindmapCommittedExternalMind = mindClone;
    if (typeof tcSyncWorkbenchGlobals === 'function') tcSyncWorkbenchGlobals();
    switchTcRightView('mindmap');
    if (typeof tcMindmapPersistCache === 'function') {
        window.setTimeout(function() {
            var snap = typeof tcMindmapCaptureMindSnapshot === 'function' ? tcMindmapCaptureMindSnapshot() : null;
            if (snap && snap.data && Array.isArray(snap.data.children) && snap.data.children.length) {
                tcMindmapPersistCache();
            }
        }, 500);
    }
}
/** 导图为空且表格有有效用例时，从表格同步行数据（不覆盖已有导图；默认关闭，仅显式转换时同步） */
function tcMindmapHydrateFromTableIfEmpty() {
    if (window.TcWorkbenchData && typeof window.TcWorkbenchData.shouldAutoHydrateMindmapFromTable === 'function' &&
        !window.TcWorkbenchData.shouldAutoHydrateMindmapFromTable()) {
        return false;
    }
    if (typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData.length) return false;
    var ext = typeof tcMindmapExternalMindData !== 'undefined' ? tcMindmapExternalMindData : null;
    if ((!ext || !ext.data) && typeof tcMindmapCommittedExternalMind !== 'undefined') {
        ext = tcMindmapCommittedExternalMind;
    }
    if (typeof tcMindmapMindHasUserNodes === 'function' && tcMindmapMindHasUserNodes(ext)) {
        return false;
    }
    if (typeof collectTableRowsForMindmapConvert !== 'function') return false;
    var rows = collectTableRowsForMindmapConvert();
    if (!rows.length) return false;
    tcMindmapCasesData = rows.map(function(r) { return r.slice(); });
    tcMindmapExternalMindData = null;
    tcMindmapCommittedExternalMind = null;
    window.tcMindmapExternalMindData = null;
    window.tcMindmapCommittedExternalMind = null;
    tcMindmapRootTopic = '测试用例';
    return true;
}

function collectTableRowsForMindmapConvert() {
    var nameCol = resolveTcCaseNameColumnIndex();
    var rows = [];
    var source = typeof testCasesData !== 'undefined' && testCasesData ? testCasesData : [];
    for (var i = 0; i < source.length; i++) {
        var row = source[i];
        if (!row) continue;
        var copy = tableColumns.map(function(_, idx) {
            return row[idx] !== undefined && row[idx] !== null ? String(row[idx]) : '';
        });
        if (!String(copy[nameCol] || '').trim()) continue;
        rows.push(copy);
    }
    return rows;
}

function convertTableToMindmap() {
    if (typeof closeTcTableFabSheet === 'function') closeTcTableFabSheet();
    if (!ensureTcTableTemplateApplied()) return;
    if (tcTableToMindmapConverting) return;

    var btn = null; /* table-to-mindmap-btn 已用于导出 Excel FAB */

    tcTablePullRowsFromView().then(function() {
        var rows = collectTableRowsForMindmapConvert();
        if (!rows.length) {
            tcAppAlert('表格中还没有有效用例。请确保至少一行包含「用例名称」或同类标题列。', {
                variant: 'info',
                title: '暂无可转换数据'
            });
            return;
        }
        return Promise.resolve().then(function() {
        if (!tcMindmapHasCaseData()) return 'overwrite';
        return askTcViewConvertChoice({
            title: '思维导图已有数据',
            message: '当前思维导图中已有用例。覆盖将替换全部导图内容；追加会把现有用例与表格用例合并后重新生成导图；取消则不执行转换。'
        });
    }).then(function(choice) {
        if (choice === 'cancel') return null;
        var mode = choice === 'append' ? 'append' : 'overwrite';
        var apiRows = rows;
        if (mode === 'append') {
            var existing = [];
            var nameCol = resolveTcCaseNameColumnIndex();
            tcMindmapCasesData.forEach(function(row) {
                if (!row) return;
                var copy = tableColumns.map(function(_, idx) {
                    return row[idx] !== undefined && row[idx] !== null ? String(row[idx]) : '';
                });
                if (!String(copy[nameCol] || '').trim()) return;
                existing.push(copy);
            });
            apiRows = existing.concat(rows);
        }
        tcTableToMindmapConverting = true;
        if (btn) btn.disabled = true;
        return fetchTableToMindmapApi(tableColumns, apiRows, '测试用例').then(function(data) {
            applyMindmapConvertResult(data, apiRows);
            var total = (data.stats && data.stats.total) || apiRows.length;
            if (data.stats && data.stats.total < apiRows.length) {
                console.warn('[TestHub] table-to-mindmap: submitted ' + apiRows.length + ' rows, parsed ' + data.stats.total);
            }
            var toastMsg = mode === 'append'
                ? '已追加并转为思维导图，共 ' + total + ' 条用例。'
                : '已转为思维导图，共 ' + total + ' 条用例。';
            tcAppToast(toastMsg, { variant: 'success', duration: 3200 });
        });
    }).catch(function(err) {
        if (err && err.message) {
            tcAppAlert(err.message, { variant: 'error', title: '转思维导图失败' });
        }
    });
    }).catch(function(err) {
        if (err && err.message) {
            tcAppAlert(err.message, { variant: 'error', title: '转思维导图失败' });
        }
    }).finally(function() {
        tcTableToMindmapConverting = false;
        if (btn) btn.disabled = !(tcTableTemplateApplied && tableColumns.length);
    });
}
// 页面加载时初始化（模板从 MySQL API 加载）
document.addEventListener('DOMContentLoaded', function() {
    if (document.querySelector('.tc-workbench-scope')) {
        if (typeof ensureTcTemplateChooserUiReady === 'function') ensureTcTemplateChooserUiReady();
    }
    // 媒体工具箱复用了 tc-hub-scope 类名，但不应走用例 Hub Chrome / 提示词拉取
    if (document.querySelector('.tc-hub-scope') && !document.body.classList.contains('mdh-hub-page')) {
        syncTcHubAiChrome();
    }
    if (document.querySelector('.tc-workbench-scope')) {
        if (typeof tcInitGenBatchBarUi === 'function') tcInitGenBatchBarUi();
        if (typeof initTcEditComposer === 'function') initTcEditComposer();
    }
    if (document.querySelector('.tc-workbench-scope')) {
        if (typeof ensureTcTemplateChooserUiReady === 'function') ensureTcTemplateChooserUiReady();
        if (typeof initTcViewConvertModalUi === 'function') initTcViewConvertModalUi();
    }
    function bootTcWorkbench() {
        // 非用例工作台页面（如媒体工具箱）不拉取系统提示词/模板，避免控制台 NetworkError
        if (!document.querySelector('.tc-workbench-scope')) {
            return;
        }
        function bootCore() {
            if (typeof tcInitGenBatchBarUi === 'function') tcInitGenBatchBarUi();
            if (typeof initTcEditComposer === 'function') initTcEditComposer();
            if (document.querySelector('.tc-workbench-scope')) {
                try {
                    initTestCaseTable();
                } finally {
                    if (typeof ensureTcRightViewUiInited === 'function') ensureTcRightViewUiInited();
                }
                if (window.TcWorkbenchEnhancements && typeof TcWorkbenchEnhancements.init === 'function') {
                    TcWorkbenchEnhancements.init();
                }
            }
            if (document.getElementById('tc-gen-mode-single')) {
                switchDrawer(1);
            }
        }
        Promise.all([fetchTcCaseTemplates(), fetchTcSystemPrompts()])
            .then(bootCore)
            .catch(function() { bootCore(); });
    }
    if (typeof hfReloadToolkitLock === 'function') {
        hfReloadToolkitLock()
            .then(function() {
                if (typeof initTcFeatureUnlockLockedState === 'function') initTcFeatureUnlockLockedState();
                if (typeof syncTcRagLockChrome === 'function') syncTcRagLockChrome();
            })
            .catch(function() { /* keep SSR flag */ })
            .finally(bootTcWorkbench);
    } else {
        bootTcWorkbench();
    }
});

