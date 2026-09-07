/**
 * 需求页内模板切换会话缓存：切走前保存快照，切回时恢复；若在其它模板上生成/加行则作废其它模板缓存。
 * 隔离模块，不影响需求页切换持久化与其它工作台逻辑。
 */
(function (global) {
    'use strict';

    var _sessions = {};

    function getPageKey() {
        var store = global.TcRequirementCaseStore;
        if (store && typeof store.resolveContext === 'function') {
            try {
                var ctx = store.resolveContext({});
                if (ctx) {
                    return [
                        String(ctx.lanhu_pid || ''),
                        String(ctx.lanhu_doc_id || ''),
                        String(ctx.lanhu_page_id || ctx.page_id || '')
                    ].join(':');
                }
            } catch (eCtx) { /* ignore */ }
        }
        if (store && typeof store.getActiveLanhuPageId === 'function') {
            var activePage = String(store.getActiveLanhuPageId() || '').trim();
            if (activePage) {
                var docId = '';
                if (typeof global.getTcLanhuDocTreeMeta === 'function') {
                    var meta = global.getTcLanhuDocTreeMeta() || {};
                    docId = String(meta.docId || meta.doc_id || '');
                }
                return ['', docId, activePage].join(':');
            }
        }
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            var m = global.getTcLanhuDocTreeMeta() || {};
            var pageId = String(m.selectedId || m.focusPageId || m.pageId || '').trim();
            var doc = String(m.docId || m.doc_id || '').trim();
            if (pageId || doc) {
                return ['', doc, pageId].join(':');
            }
        }
        return '__workbench__';
    }

    function ensureBucket(pageKey) {
        if (!_sessions[pageKey]) {
            _sessions[pageKey] = { byTemplate: {} };
        }
        return _sessions[pageKey];
    }



    function ensureBaselines(pageKey) {
        var bucket = ensureBucket(pageKey);
        if (!bucket.baselines) bucket.baselines = {};
        return bucket.baselines;
    }

    function payloadFingerprint(payload) {
        if (!payload || !payload.columns) return '';
        try {
            return JSON.stringify({
                columns: (payload.columns || []).map(String),
                rows: (payload.rows || []).map(function (row) {
                    return (row || []).map(function (cell) { return String(cell != null ? cell : ''); });
                })
            });
        } catch (eFp) {
            return '';
        }
    }

    function getTemplateBaselineKey(pageKey, templateId) {
        if (!pageKey || !templateId) return null;
        var baselines = ensureBaselines(pageKey);
        return baselines[templateId] != null ? baselines[templateId] : null;
    }

    function setTemplateBaselineKey(pageKey, templateId, payload) {
        if (!pageKey || !templateId || !payload) return;
        ensureBaselines(pageKey)[templateId] = payloadFingerprint(payload);
    }

    function tcTemplateSwitchRecordBaseline(templateId, opts) {
        opts = opts || {};
        templateId = templateId ? String(templateId) : resolveCurrentTemplateIdForSwitch();
        if (!templateId) return;
        if (!opts.skipCommit) commitTableForSnapshot();
        var payload = opts.payload || collectTemplateSwitchPayload();
        if (!payload) return;
        setTemplateBaselineKey(getPageKey(), templateId, payload);
    }

    function tcTemplateSwitchPersistPayload(payload) {
        if (!hasTemplateSwitchPersistContext()) return Promise.resolve(null);
        var store = global.TcRequirementCaseStore;
        if (!store || typeof store.persistNow !== 'function') return Promise.resolve(null);
        try {
            return store.persistNow('manual_edit', { force: true, payload: payload });
        } catch (ePersist) {
            return Promise.resolve(null);
        }
    }

    function tcTemplateSwitchAfterApply(templateId) {
        templateId = templateId ? String(templateId) : '';
        if (!templateId) return;
        var record = function () {
            tcTemplateSwitchRecordBaseline(templateId, { skipCommit: true });
        };
        if (typeof global.setTimeout === 'function') {
            global.setTimeout(record, 150);
        } else {
            record();
        }
    }


    function isTemplateSwitchSourceReady() {
        var cols = global.tableColumns || [];
        if (!cols.length) return false;
        if (global.tcTableTemplateApplied) return true;
        if (global.tcActiveTemplateId) return true;
        return true;
    }

    function mergeTemplateSwitchRowsPreservingCount(beforeRows, afterRows, cols) {
        var merged = (beforeRows || []).map(function (row) {
            return cols.map(function (_, i) {
                return String(row && row[i] != null ? row[i] : '');
            });
        });
        var after = afterRows || [];
        var overlap = Math.min(merged.length, after.length);
        for (var ri = 0; ri < overlap; ri++) {
            for (var ci = 0; ci < cols.length; ci++) {
                var v = after[ri] && after[ri][ci];
                if (String(v != null ? v : '').trim() !== '') {
                    merged[ri][ci] = String(v);
                }
            }
        }
        if (after.length > merged.length) {
            for (var j = merged.length; j < after.length; j++) {
                merged.push(cols.map(function (_, ci) {
                    return String(after[j] && after[j][ci] != null ? after[j][ci] : '');
                }));
            }
        }
        return merged;
    }

    function commitTableForSnapshot() {
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            try { global.TcTableBridge.commitAll(); } catch (e0) { /* ignore */ }
        } else if (global.TcTableView && typeof global.TcTableView.pullRows === 'function') {
            try { global.TcTableView.pullRows(); } catch (e1) { /* ignore */ }
        }
    }

    function rowHasCaseContent(row, colCount) {
        if (typeof global.tcTableRowHasCaseContent === 'function') {
            return global.tcTableRowHasCaseContent(row);
        }
        if (!row) return false;
        for (var i = 0; i < colCount; i++) {
            if (String(row[i] != null ? row[i] : '').trim()) return true;
        }
        return false;
    }

    function payloadHasCaseContent(payload) {
        if (!payload || !payload.columns || !payload.columns.length) return false;
        var cols = payload.columns.length;
        var rows = payload.rows || [];
        for (var i = 0; i < rows.length; i++) {
            if (rowHasCaseContent(rows[i], cols)) return true;
        }
        return false;
    }

    function collectTemplateSwitchPayload() {
        var cols = (global.tableColumns || []).map(String);
        if (!cols.length) return null;
        var rows = (global.testCasesData || []).map(function (row) {
            var out = [];
            for (var i = 0; i < cols.length; i++) {
                out.push(String(row && row[i] != null ? row[i] : ''));
            }
            return out;
        });
        var payload = {
            scope: 'table',
            columns: cols,
            rows: rows,
            columnVisible: Object.assign({}, global.columnVisible || {}),
            columnWidth: Object.assign({}, global.columnWidth || {}),
            rowHeights: Object.assign({}, global.rowHeights || {})
        };
        if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
            payload.provenance = global.tcProvenanceArrayForStashPayload(rows.length);
        }
        return payload;
    }

    function tcTemplateSwitchBeforeApply(fromTemplateId, toTemplateId) {
        fromTemplateId = fromTemplateId ? String(fromTemplateId) : '';
        toTemplateId = toTemplateId ? String(toTemplateId) : '';
        if (!fromTemplateId && typeof global.getTcActiveTemplateId === 'function') {
            fromTemplateId = global.getTcActiveTemplateId();
        }
        if (!fromTemplateId || fromTemplateId === toTemplateId) return;
        if (!isTemplateSwitchSourceReady()) return;
        var pageKey = getPageKey();
        if (!pageKey) return;
        var cols = (global.tableColumns || []).map(String);
        var rowsBefore = (global.testCasesData || []).slice();
        commitTableForSnapshot();
        var rowsAfter = (global.testCasesData || []).slice();
        var mergedRows = mergeTemplateSwitchRowsPreservingCount(rowsBefore, rowsAfter, cols);
        global.testCasesData = mergedRows.map(function (row) { return row.slice(); });
        if (typeof global.tcEnsureProvenanceLength === 'function') {
            try { global.tcEnsureProvenanceLength(); } catch (eProv) { /* ignore */ }
        }
        var payload = collectTemplateSwitchPayload();
        if (!payload) return;
        ensureBucket(pageKey).byTemplate[fromTemplateId] = {
            templateId: fromTemplateId,
            payload: payload,
            hasCaseContent: payloadHasCaseContent(payload)
        };
        var baselineKey = getTemplateBaselineKey(pageKey, fromTemplateId);
        var currentKey = payloadFingerprint(payload);
        var changed = baselineKey == null ? payloadHasCaseContent(payload) : (baselineKey !== currentKey);
        if (changed) {
            tcTemplateSwitchMarkUserEdited({ force: true });
            tcTemplateSwitchPersistPayload(payload);
        }
    }


    function tcTemplateSwitchEvaluateLeavePersist() {
        if (!isTemplateSwitchSourceReady()) {
            return { shouldPersist: false, payload: null, hasContent: false };
        }
        commitTableForSnapshot();
        var payload = collectTemplateSwitchPayload();
        if (!payload) return { shouldPersist: false, payload: null, hasContent: false };
        var templateId = resolveCurrentTemplateIdForSwitch();
        var pageKey = getPageKey();
        var baselineKey = (templateId && pageKey) ? getTemplateBaselineKey(pageKey, templateId) : null;
        var currentKey = payloadFingerprint(payload);
        var hasContent = payloadHasCaseContent(payload);
        var changed = baselineKey == null ? hasContent : (baselineKey !== currentKey);
        return { shouldPersist: changed, payload: payload, hasContent: hasContent };
    }

    function tcTemplateSwitchPersistOnPageLeave(opts) {
        opts = opts || {};
        if (!hasTemplateSwitchPersistContext()) return Promise.resolve(null);
        if (typeof global.isTcWorkbenchGenerationActive === 'function' &&
            global.isTcWorkbenchGenerationActive()) {
            return Promise.resolve(null);
        }
        if (global._tcTemplateSwitchApplyInProgress && !opts.force) return Promise.resolve(null);
        var decision = tcTemplateSwitchEvaluateLeavePersist();
        if (!decision.shouldPersist) return Promise.resolve(null);
        return tcTemplateSwitchPersistPayload(decision.payload);
    }

    function resolveCurrentTemplateIdForSwitch() {
        if (typeof global.getTcActiveTemplateId === 'function') {
            var fromGetter = global.getTcActiveTemplateId();
            if (fromGetter) return String(fromGetter);
        }
        return global.tcActiveTemplateId ? String(global.tcActiveTemplateId) : '';
    }


    var _tplSwitchPersistTimer = null;

    function hasTemplateSwitchPersistContext() {
        var store = global.TcRequirementCaseStore;
        if (!store || typeof store.resolveContext !== 'function') return false;
        try {
            var ctx = store.resolveContext({});
            return !!(ctx && ctx.lanhu_page_id && ctx.lanhu_url);
        } catch (eCtx) { return false; }
    }

    /** 模板切换场景：当前模板表格变更后 debounce 落库（覆盖需求页用例） */
    function tcTemplateSwitchPersistDebounced() {
        if (global._tcTemplateSwitchApplyInProgress) return;
        if (!hasTemplateSwitchPersistContext()) return;
        if (_tplSwitchPersistTimer) {
            try { global.clearTimeout(_tplSwitchPersistTimer); } catch (e0) { /* ignore */ }
        }
        _tplSwitchPersistTimer = global.setTimeout(function () {
            _tplSwitchPersistTimer = null;
            if (global._tcTemplateSwitchApplyInProgress) return;
            var store = global.TcRequirementCaseStore;
            if (!store || typeof store.flushIfDirty !== 'function') return;
            try {
                store.flushIfDirty('manual_edit', { force: true }).catch(function () { /* ignore */ });
            } catch (e1) { /* ignore */ }
        }, 650);
    }

    function tcTemplateSwitchPersistNow() {
        if (!hasTemplateSwitchPersistContext()) return;
        var store = global.TcRequirementCaseStore;
        if (!store || typeof store.flushIfDirty !== 'function') return;
        try {
            return store.flushIfDirty('manual_edit', { force: true });
        } catch (e2) {
            return Promise.resolve(null);
        }
    }

    /** 当前模板发生用户变更时，作废其它模板的内存缓存（切回时展示空表） */
    function tcTemplateSwitchMarkUserEdited(opts) {
        opts = opts || {};
        if (!opts.force && global._tcTemplateSwitchApplyInProgress) return;
        var pageKey = getPageKey();
        var currentId = resolveCurrentTemplateIdForSwitch();
        if (!pageKey || !currentId) return;
        var bucket = ensureBucket(pageKey);
        Object.keys(bucket.byTemplate).forEach(function (tid) {
            if (tid !== currentId) delete bucket.byTemplate[tid];
        });
    }


    /** 当前模板编辑/加行/生成后：作废其它模板缓存 + 需求页落库 */
    function tcTemplateSwitchOnCurrentTemplateMutated() {
        tcTemplateSwitchMarkUserEdited();
    }

    function tcTemplateSwitchClearPageSession(pageKey) {
        if (pageKey) {
            delete _sessions[pageKey];
            return;
        }
        _sessions = {};
    }



    function applyCachedTemplateSnapshot(entry, opts) {
        opts = opts || {};
        var payload = entry && entry.payload;
        var templateId = entry && entry.templateId;
        if (!payload || !payload.columns || !payload.columns.length || !templateId) return false;
        if (global.TcTableView && typeof global.TcTableView.reset === 'function') {
            try { global.TcTableView.reset(); } catch (eResetSnap) { /* ignore */ }
        }
        if (typeof global.applyRequirementCasePayload === 'function') {
            global.applyRequirementCasePayload(payload, { templateId: templateId });
        } else {
            return false;
        }
        if (typeof global.setTcActiveTemplateId === 'function') {
            global.setTcActiveTemplateId(templateId);
        } else {
            global.tcActiveTemplateId = templateId;
        }
        global.tcTableTemplateApplied = true;
        if (typeof global.saveTcDailyTemplateChoice === 'function') {
            global.saveTcDailyTemplateChoice(templateId);
        }
        if (typeof global.syncTcTableTemplateChrome === 'function') global.syncTcTableTemplateChrome();
        if (typeof global.syncTcRightPanelMeta === 'function') global.syncTcRightPanelMeta();
        if (typeof global.closeTcTemplateModal === 'function') global.closeTcTemplateModal();
        if (typeof global.switchTcRightView === 'function') global.switchTcRightView('table');
        if (typeof global.tcTableEnsureHistoryReady === 'function') global.tcTableEnsureHistoryReady();
        if (!opts.silent && typeof global.tcAppToast === 'function') {
            var tplName = templateId;
            if (typeof global.TC_CASE_TEMPLATES !== 'undefined' && global.TC_CASE_TEMPLATES.length) {
                var tpl = global.TC_CASE_TEMPLATES.find(function (t) { return t.id === templateId; });
                if (tpl && tpl.name) tplName = tpl.name;
            }
            global.tcAppToast('已恢复 ' + tplName + ' 的用例', { variant: 'success', duration: 2200 });
        }
        tcTemplateSwitchRecordBaseline(templateId, { payload: payload, skipCommit: true });
        return true;
    }

    function tcTemplateSwitchTryRestore(templateId, opts) {
        opts = opts || {};
        templateId = templateId ? String(templateId) : '';
        if (!templateId) return false;
        var pageKey = getPageKey();
        if (!pageKey) return false;
        var bucket = _sessions[pageKey];
        if (!bucket || !bucket.byTemplate) return false;
        var entry = bucket.byTemplate[templateId];
        if (!entry || !entry.payload) return false;
        return applyCachedTemplateSnapshot(entry, opts);
    }

    global.tcTemplateSwitchRecordBaseline = tcTemplateSwitchRecordBaseline;
    global.tcTemplateSwitchAfterApply = tcTemplateSwitchAfterApply;
    global.tcTemplateSwitchBeforeApply = tcTemplateSwitchBeforeApply;
    global.tcTemplateSwitchTryRestore = tcTemplateSwitchTryRestore;
    global.tcTemplateSwitchMarkUserEdited = tcTemplateSwitchMarkUserEdited;
    global.tcTemplateSwitchPersistDebounced = tcTemplateSwitchPersistDebounced;
    global.tcTemplateSwitchOnCurrentTemplateMutated = tcTemplateSwitchOnCurrentTemplateMutated;
    global.tcTemplateSwitchPersistNow = tcTemplateSwitchPersistNow;
    global.tcTemplateSwitchEvaluateLeavePersist = tcTemplateSwitchEvaluateLeavePersist;
    global.tcTemplateSwitchPersistOnPageLeave = tcTemplateSwitchPersistOnPageLeave;
    global.tcTemplateSwitchClearPageSession = tcTemplateSwitchClearPageSession;
})(typeof window !== 'undefined' ? window : this);
