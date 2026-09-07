/**
 * TestHub — 按蓝湖需求 ID（pageId/docId）持久化用例表格
 */
(function tcRequirementCaseStoreModule(global) {
    'use strict';

    var DEBOUNCE_MS = 800;
    var _debounceTimer = null;
    var _activeCtx = null;
    var _loading = false;
    var _lastLoadedKey = '';
    var _loadSeq = 0;
    var _pageSwitchToken = 0;
    var _targetPageId = '';
    var _persistSuspended = false;
    var _dirty = false;
    var _loadAbort = null;
    var _generationPinnedCtx = null;
    var _generationPersistPayload = null;
    var _genMergeMode = null;

    function $(id) { return document.getElementById(id); }

    function parseLanhuParams(url) {
        var raw = String(url || '').trim();
        if (!raw) return null;
        var q = raw;
        if (/^https?:/i.test(raw)) {
            var hashIdx = raw.indexOf('#');
            if (hashIdx >= 0) {
                var frag = raw.slice(hashIdx + 1);
                q = frag.indexOf('?') >= 0 ? frag.split('?')[1] : frag;
            } else {
                var qi = raw.indexOf('?');
                q = qi >= 0 ? raw.slice(qi + 1) : '';
            }
        }
        if (q.charAt(0) === '?') q = q.slice(1);
        if (q.charAt(0) === '#') q = q.slice(1);
        var params = {};
        q.split('&').forEach(function (part) {
            if (!part || part.indexOf('=') < 0) return;
            var kv = part.split('=');
            params[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join('='));
        });
        var pid = params.pid || '';
        var docId = params.docId || params.image_id || '';
        var pageId = params.pageId || params.page_id || '';
        if (!docId) return null;
        return {
            lanhu_pid: pid,
            lanhu_doc_id: docId,
            lanhu_page_id: pageId,
            requirement_id: pageId || docId
        };
    }


    var LAST_PAGE_LS_PREFIX = 'tc_req_case_last_page:';

    function rememberLastPage(docId, pageId) {
        if (!docId || !pageId) return;
        try {
            localStorage.setItem(LAST_PAGE_LS_PREFIX + docId, pageId);
        } catch (e) { /* ignore */ }
    }

    function readLastPage(docId) {
        if (!docId) return '';
        try {
            return localStorage.getItem(LAST_PAGE_LS_PREFIX + docId) || '';
        } catch (e) {
            return '';
        }
    }

    function stripPageIdFromLanhuUrl(url) {
        url = String(url || '').trim();
        if (!url) return '';
        return url
            .replace(/([?&])pageId=[^&]*/gi, '$1')
            .replace(/([?&])page_id=[^&]*/gi, '$1')
            .replace(/[?&]$/, '')
            .replace(/\?&/, '?');
    }

    function normalizeCtx(ctx) {
        if (!ctx) return null;
        var out = Object.assign({}, ctx);
        var pageId = String(out.lanhu_page_id || out.page_id || '').trim();
        if (pageId) {
            out.lanhu_page_id = pageId;
            out.page_id = pageId;
            out.requirement_id = pageId;
        }
        var baseUrl = stripPageIdFromLanhuUrl(out.lanhu_url || getLanhuUrlFromDom() || '');
        if (baseUrl && pageId && typeof global.buildTcLanhuPageUrl === 'function') {
            out.lanhu_url = global.buildTcLanhuPageUrl(baseUrl, pageId);
        } else if (baseUrl) {
            out.lanhu_url = baseUrl;
        }
        if (out.page_name == null) out.page_name = '';
        return out.lanhu_url ? out : null;
    }

    function isGenerationActive() {
        return typeof global.isTcWorkbenchGenerationActive === 'function' &&
            global.isTcWorkbenchGenerationActive();
    }



    function isWorkbenchGenerationStreamBusy() {
        if (global.TcGenerationStreamClient &&
            typeof global.TcGenerationStreamClient.isActive === 'function' &&
            global.TcGenerationStreamClient.isActive()) {
            return true;
        }
        if (global.TcAgentOrchestrator &&
            typeof global.TcAgentOrchestrator.isGenModeLocked === 'function' &&
            global.TcAgentOrchestrator.isGenModeLocked()) {
            return true;
        }
        if (typeof global.isTcPageGenLockActive === 'function' && global.isTcPageGenLockActive()) {
            return true;
        }
        return false;
    }

    function isWorkbenchGenerationInterruptible() {
        if (_generationPinnedCtx) return true;
        if (typeof global.tcIsGenerationRollbackSnapshotActive === 'function' &&
            global.tcIsGenerationRollbackSnapshotActive()) {
            return true;
        }
        if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.isActive === 'function' &&
            global.TcGenerationStreamClient.isActive()) {
            return true;
        }
        if (global.TcAgentOrchestrator && typeof global.TcAgentOrchestrator.isGenModeLocked === 'function' &&
            global.TcAgentOrchestrator.isGenModeLocked()) {
            return true;
        }
        if (typeof global.isTcRequirementPageGenBusy === 'function' && global.isTcRequirementPageGenBusy()) {
            return true;
        }
        if (isGenerationActive()) return true;
        return false;
    }

    function abortAndRollbackWorkbenchGeneration(opts) {
        opts = opts || {};
        if (!isWorkbenchGenerationInterruptible()) return false;
        var mergeMode = _genMergeMode || opts.mergeMode || 'overwrite';
        try {
            if (typeof global.abortActiveGenerationRun === 'function') global.abortActiveGenerationRun();
        } catch (eAbortRun) { /* ignore */ }
        try {
            if (global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.abortForPageLeave === 'function') {
                global.TcGenerationStreamClient.abortForPageLeave();
            }
        } catch (eStream) { /* ignore */ }
        try {
            if (global.TcAgentOrchestrator &&
                typeof global.TcAgentOrchestrator.abortForPageLeave === 'function') {
                global.TcAgentOrchestrator.abortForPageLeave();
            }
        } catch (eAgent) { /* ignore */ }
        if (typeof global.tcRestoreGenerationRollbackSnapshot === 'function') {
            global.tcRestoreGenerationRollbackSnapshot({ mergeMode: mergeMode });
        } else if (mergeMode === 'append' &&
            typeof global.tcForceRestoreAppendGenerationBaseline === 'function') {
            global.tcForceRestoreAppendGenerationBaseline();
        }
        clearDirty();
        cancelPendingPersist();
        clearGenerationPinnedContext();
        if (typeof global.tcClearGenerationRollbackSnapshot === 'function') {
            global.tcClearGenerationRollbackSnapshot();
        }
        if (typeof global.tcClearAppendGenerationBaseline === 'function') {
            global.tcClearAppendGenerationBaseline();
        }
        if (typeof global.clearOptimisticPageGenLock === 'function') {
            global.clearOptimisticPageGenLock();
        }
        if (typeof global.refreshTcPageGenLock === 'function') {
            global.refreshTcPageGenLock();
        }
        if (typeof global.restoreTcPromptComposerAfterStop === 'function') {
            global.restoreTcPromptComposerAfterStop({ releaseStreamUi: true, status: 'cancelled' });
        }
        return true;
    }

    function abortGenerationAndRestoreTable(opts) {
        opts = opts || {};
        var mergeMode = _genMergeMode || opts.mergeMode || 'overwrite';
        var hadRollback = typeof global.tcIsGenerationRollbackSnapshotActive === 'function' &&
            global.tcIsGenerationRollbackSnapshotActive();
        var hadPinned = !!_generationPinnedCtx;
        if (hadRollback || hadPinned) {
            if (typeof global.tcRestoreGenerationRollbackSnapshot === 'function') {
                global.tcRestoreGenerationRollbackSnapshot({ mergeMode: mergeMode });
            } else if (mergeMode === 'append' &&
                typeof global.tcForceRestoreAppendGenerationBaseline === 'function') {
                global.tcForceRestoreAppendGenerationBaseline();
            }
        }
        clearDirty();
        cancelPendingPersist();
        clearGenerationPinnedContext();
        return hadRollback || hadPinned;
    }

    function shouldBlockOverwriteDbPersistDuringGeneration(opts) {
        opts = opts || {};
        if (opts.source === 'generation' || opts.forGeneration || opts.forCoverageFill) return false;
        if (!_generationPinnedCtx || _genMergeMode !== 'overwrite') return false;
        return true;
    }

    function markDirty() {
        if (_persistSuspended) return;
        if (isGenerationActive()) return;
        if (shouldBlockOverwriteDbPersistDuringGeneration()) return;
        if (!resolveContext({})) return;
        _dirty = true;
    }

    function clearDirty() {
        _dirty = false;
    }


    function tcIsBenignFetchAbort(err) {
        if (!err) return false;
        if (err.name === 'AbortError') return true;
        var msg = String((err && err.message) || err || '');
        var lower = msg.toLowerCase();
        if (err.name === 'TypeError' && (lower.indexOf('networkerror') >= 0 || lower.indexOf('failed to fetch') >= 0)) {
            return true;
        }
        return lower.indexOf('networkerror') >= 0 || lower.indexOf('network error') >= 0 ||
            lower.indexOf('failed to fetch') >= 0 || lower.indexOf('aborted') >= 0 ||
            lower.indexOf('cancelled') >= 0 || lower.indexOf('the user aborted') >= 0 ||
            lower.indexOf('attempting to fetch resource') >= 0;
    }

    function cancelPendingPersist() {
        if (_debounceTimer) {
            clearTimeout(_debounceTimer);
            _debounceTimer = null;
        }
    }

    function shouldSkipGridPullForPersist() {
        if (_genMergeMode === 'append') return true;
        if (typeof global.tcShouldSkipGridPullForAppendGen === 'function' && global.tcShouldSkipGridPullForAppendGen()) {
            return true;
        }
        return false;
    }

    function collectPayloadWithoutGridPull() {
        var cols = (global.tableColumns || []).map(String);
        if (!cols.length) return null;
        var rows = (global.testCasesData || []).map(function (row) {
            var out = [];
            for (var i = 0; i < cols.length; i++) {
                out.push(String(row && row[i] != null ? row[i] : ''));
            }
            return out;
        });
        if (!rowsHaveContent(rows, cols.length)) return null;
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

    function buildAppendGenerationPersistPayload() {
        ensureGenerationPersistPayloadShell();
        if (typeof global.tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
            global.tcRestoreAppendGenerationBaselineIfNeeded();
        }
        var shell = _generationPersistPayload;
        var direct = collectPayloadWithoutGridPull();
        if (!shell || !shell.columns || !shell.columns.length) {
            return direct;
        }
        if (!direct || !direct.rows || !direct.rows.length) {
            return shell;
        }
        var shellRows = shell.rows ? shell.rows.length : 0;
        var directRows = direct.rows.length;
        if (directRows >= shellRows) {
            shell.rows = direct.rows.slice();
            shell.columnVisible = direct.columnVisible || shell.columnVisible;
            shell.columnWidth = direct.columnWidth || shell.columnWidth;
            shell.rowHeights = direct.rowHeights || shell.rowHeights;
            if (direct.provenance) shell.provenance = direct.provenance;
            return sanitizeRequirementCasePayloadForPersist(shell, { dedupe: true });
        }
        return shell;
    }

    function syncTableForPersist() {
        if (shouldSkipGridPullForPersist()) {
            return Promise.resolve(false);
        }
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            return Promise.resolve(global.TcTableBridge.commitAll());
        }
        if (typeof global.tcTablePullRowsFromView === 'function') {
            return global.tcTablePullRowsFromView();
        }
        return Promise.resolve(false);
    }

    function buildContextKey(ctx) {
        if (!ctx) return '';
        return [ctx.lanhu_pid || '', ctx.lanhu_doc_id || '', ctx.lanhu_page_id || ''].join(':');
    }

    function getLanhuUrlFromDom() {
        var el = $('lanhu-url');
        return el ? String(el.value || '').trim() : '';
    }

    /** 切换需求页时解析蓝湖 base URL（输入框 → 活跃上下文 → 会话 prefs → 已保存文档） */
    function resolveLanhuBaseUrlForPageLoad(opts) {
        opts = opts || {};
        var url = String(opts.lanhu_url || '').trim();
        if (url) return stripPageIdFromLanhuUrl(url) || url;
        url = getLanhuUrlFromDom();
        if (url) return stripPageIdFromLanhuUrl(url) || url;
        if (_activeCtx && _activeCtx.lanhu_url) {
            url = stripPageIdFromLanhuUrl(_activeCtx.lanhu_url) || String(_activeCtx.lanhu_url).trim();
            if (url) return url;
        }
        if (global.TcWorkbenchSession &&
            typeof global.TcWorkbenchSession.getCurrentLanhuUrlForGen === 'function') {
            url = global.TcWorkbenchSession.getCurrentLanhuUrlForGen();
            if (url) return stripPageIdFromLanhuUrl(url) || url;
        }
        if (typeof global.getTcLanhuSavedDocUrlForTreeDocId === 'function' &&
            typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta = global.getTcLanhuDocTreeMeta() || {};
            url = global.getTcLanhuSavedDocUrlForTreeDocId(meta.docId);
            if (url) return stripPageIdFromLanhuUrl(url) || url;
        }
        return '';
    }

    function isDisplayedCasesForPage(pageId) {
        pageId = String(pageId || '').trim();
        if (!pageId || !global.tcTableTemplateApplied) return false;
        if (getActiveLanhuPageId() !== pageId) return false;
        if (typeof global.tcCountTableCaseContentRows === 'function') {
            return global.tcCountTableCaseContentRows() > 0;
        }
        return !!(global.testCasesData && global.testCasesData.length);
    }

    function resolveContext(overrides) {
        overrides = overrides || {};
        if (_activeCtx && !overrides.forceUrl) {
            return normalizeCtx(Object.assign({}, _activeCtx, {
                lanhu_url: overrides.lanhu_url || _activeCtx.lanhu_url || getLanhuUrlFromDom(),
                lanhu_page_id: overrides.lanhu_page_id || overrides.page_id || _activeCtx.lanhu_page_id || _activeCtx.page_id,
                page_name: overrides.page_name != null ? overrides.page_name : _activeCtx.page_name
            }));
        }
        var url = String(overrides.lanhu_url || getLanhuUrlFromDom() || '').trim();
        if (!url) return null;
        var pageId = overrides.page_id || overrides.lanhu_page_id || '';
        if (!pageId && global.TC_PAGE_GEN_STATE && global.TC_PAGE_GEN_STATE.pageId) {
            pageId = global.TC_PAGE_GEN_STATE.pageId;
        }
        if (!pageId && typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta = global.getTcLanhuDocTreeMeta() || {};
            pageId = meta.selectedId || meta.focusPageId || '';
        }
        var keys = parseLanhuParams(url);
        if (!keys) return null;
        if (pageId) {
            keys.lanhu_page_id = pageId;
            keys.requirement_id = pageId;
        }
        var pageName = overrides.page_name || '';
        if (!pageName && global.TC_PAGE_GEN_STATE && global.TC_PAGE_GEN_STATE.pageName) {
            pageName = global.TC_PAGE_GEN_STATE.pageName;
        }
        if (!pageName && typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta2 = global.getTcLanhuDocTreeMeta() || {};
            pageName = meta2.selectedPageName || '';
        }
        return normalizeCtx({
            lanhu_url: url,
            lanhu_pid: keys.lanhu_pid,
            lanhu_doc_id: keys.lanhu_doc_id,
            lanhu_page_id: keys.lanhu_page_id,
            requirement_id: keys.requirement_id,
            page_name: pageName
        });
    }

    function setActiveContext(ctx) {
        if (!ctx) {
            _activeCtx = null;
            return;
        }
        _activeCtx = normalizeCtx(ctx);
    }


    function tcClearOverwriteListUiAfterSnapshot() {
        if (typeof global.tcHasAppendGenerationBaseline === 'function' && global.tcHasAppendGenerationBaseline()) {
            return;
        }
        if (typeof global.tcTableHasOnlyPlaceholderRows === 'function' && global.tcTableHasOnlyPlaceholderRows()) {
            return;
        }
        if (global.TcWorkbenchData && typeof global.TcWorkbenchData.resetStoreForGeneration === 'function') {
            global.TcWorkbenchData.resetStoreForGeneration('list');
        } else if (typeof global.testCasesData !== 'undefined') {
            global.testCasesData = [];
            if (typeof global.testCasesProvenance !== 'undefined') global.testCasesProvenance = [];
            if (typeof global.markedRows !== 'undefined') global.markedRows = new Set();
            if (typeof global.selectedRows !== 'undefined' && global.selectedRows && typeof global.selectedRows.clear === 'function') {
                global.selectedRows.clear();
            }
        }
        if (typeof global.requestAnimationFrame === 'function') {
            global.requestAnimationFrame(function () {
                if (window.TcTableView && typeof window.TcTableView.syncFromData === 'function') {
                    try { window.TcTableView.syncFromData({ reload: false, immediate: true }); } catch (eSync) { /* ignore */ }
                }
            });
        }
    }

    function captureGenerationTableSnapshot() {
        global.__tcGenerationTableSnapshot = {
            tableColumns: (global.tableColumns || []).slice(),
            tcActiveTemplateId: global.tcActiveTemplateId || null,
            tcTableTemplateApplied: !!global.tcTableTemplateApplied,
            columnVisible: Object.assign({}, global.columnVisible || {}),
            columnWidth: Object.assign({}, global.columnWidth || {}),
            rowHeights: Object.assign({}, global.rowHeights || {})
        };
    }

    function clearGenerationTableSnapshot() {
        global.__tcGenerationTableSnapshot = null;
    }

    function restoreGenerationTableSnapshot() {
        var snap = global.__tcGenerationTableSnapshot;
        if (!snap || !snap.tableColumns || !snap.tableColumns.length) return false;
        global.tableColumns = snap.tableColumns.slice();
        global.tcActiveTemplateId = snap.tcActiveTemplateId;
        global.tcTableTemplateApplied = !!snap.tcTableTemplateApplied;
        global.columnVisible = Object.assign({}, snap.columnVisible || {});
        global.columnWidth = Object.assign({}, snap.columnWidth || {});
        global.rowHeights = Object.assign({}, snap.rowHeights || {});
        if (typeof global.renderTableHeader === 'function') global.renderTableHeader();
        return true;
    }

    function resetLanhuNavBypassAfterCoverageFillForNewGeneration() {
        if (global.TcCoverageMatrix &&
            typeof global.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal === 'function') {
            global.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal();
        }
        if (typeof global.tcSyncLanhuTreePageSwitchLockUi === 'function') {
            global.tcSyncLanhuTreePageSwitchLockUi();
        }
        if (typeof global.tcSyncLanhuDocSwitcherLockUi === 'function') {
            global.tcSyncLanhuDocSwitcherLockUi();
        }
    }

    function captureGenerationContext(mergeMode) {
        resetLanhuNavBypassAfterCoverageFillForNewGeneration();
        var ctx = resolveContext({});
        if (ctx) {
            setActiveContext(ctx);
            _generationPinnedCtx = normalizeCtx(Object.assign({}, ctx));
            _genMergeMode = mergeMode || 'overwrite';
            if (typeof global.tcTemplateSwitchMarkUserEdited === 'function') {
                global.tcTemplateSwitchMarkUserEdited();
            }
            captureGenerationTableSnapshot();
            if (typeof global.tcCaptureGenerationRollbackSnapshot === 'function') {
                global.tcCaptureGenerationRollbackSnapshot();
            }
            if (_genMergeMode === 'overwrite') {
                clearDirty();
                cancelPendingPersist();
                tcClearOverwriteListUiAfterSnapshot();
            }
            if (_genMergeMode === 'append') {
                _generationPersistPayload = null;
                ensureGenerationPersistPayloadShell();
            }
        }
        return ctx;
    }

    function clearGenerationPinnedContext() {
        _generationPinnedCtx = null;
        _genMergeMode = null;
        clearGenerationTableSnapshot();
        _generationPersistPayload = null;
        if (typeof global.tcClearAppendGenerationBaseline === 'function') {
            global.tcClearAppendGenerationBaseline();
        }
        if (typeof global.tcClearGenerationRollbackSnapshot === 'function') {
            global.tcClearGenerationRollbackSnapshot();
        }
        if (typeof global.tcSyncLanhuNavLockUiAfterGenerationIdle === 'function') {
            global.tcSyncLanhuNavLockUiAfterGenerationIdle();
        }
    }

    function resolvePersistContext(opts) {
        opts = opts || {};
        if (opts.ctx) return normalizeCtx(opts.ctx);
        if (_generationPinnedCtx && (opts.forGeneration || opts.usePinnedContext || isGenerationActive())) {
            return normalizeCtx(Object.assign({}, _generationPinnedCtx));
        }
        return resolveContext(opts);
    }

    function getGenerationPinnedPageId() {
        return _generationPinnedCtx ? String(_generationPinnedCtx.lanhu_page_id || _generationPinnedCtx.page_id || '') : '';
    }

    function normalizeRowsForColumns(rows, cols) {
        return (rows || []).map(function (row) {
            var out = [];
            for (var i = 0; i < cols.length; i++) {
                out.push(String(row && row[i] != null ? row[i] : ''));
            }
            return out;
        });
    }

    function ensureGenerationPersistPayloadShell() {
        if (_generationPersistPayload && _generationPersistPayload.columns && _generationPersistPayload.columns.length) {
            return _generationPersistPayload;
        }
        if (!global.__tcGenerationTableSnapshot) {
            captureGenerationContext(_genMergeMode || 'overwrite');
        }
        restoreGenerationTableSnapshot();
        var fromTable = null;
        if (_genMergeMode !== 'append') {
            fromTable = collectPayload();
        }
        if (fromTable) {
            _generationPersistPayload = fromTable;
            return _generationPersistPayload;
        }
        var snap = global.__tcGenerationTableSnapshot;
        var cols = snap && snap.tableColumns ? snap.tableColumns.slice() : (global.tableColumns || []).slice();
        if (!cols.length) return null;
        var _baselineRows = (_genMergeMode === 'append' &&
            typeof global.tcGetAppendGenerationBaselineRows === 'function')
            ? global.tcGetAppendGenerationBaselineRows() : null;
        var _sourceRows = (_baselineRows && _baselineRows.length)
            ? _baselineRows
            : (global.testCasesData || []);
        _generationPersistPayload = {
            scope: 'table',
            columns: cols,
            rows: _sourceRows.map(function (row) {
                var out = [];
                for (var i = 0; i < cols.length; i++) {
                    out.push(String(row && row[i] != null ? row[i] : ''));
                }
                return out;
            }),
            columnVisible: Object.assign({}, (snap && snap.columnVisible) || global.columnVisible || {}),
            columnWidth: Object.assign({}, (snap && snap.columnWidth) || global.columnWidth || {}),
            rowHeights: Object.assign({}, (snap && snap.rowHeights) || global.rowHeights || {})
        };
        if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
            _generationPersistPayload.provenance = [];
        }
        return _generationPersistPayload;
    }

    function resyncGenerationPersistPayloadFromTable() {
        restoreGenerationTableSnapshot();
        var payload = collectPayloadWithoutGridPull();
        if (!payload) return null;
        var shell = ensureGenerationPersistPayloadShell();
        if (!shell) {
            _generationPersistPayload = payload;
            return _generationPersistPayload;
        }
        shell.columns = payload.columns;
        shell.rows = payload.rows;
        shell.columnVisible = payload.columnVisible || shell.columnVisible;
        shell.columnWidth = payload.columnWidth || shell.columnWidth;
        shell.rowHeights = payload.rowHeights || shell.rowHeights;
        if (payload.provenance) shell.provenance = payload.provenance;
        return shell;
    }

    function mergeGenerationPersistRows(rows) {
        if (!rows || !rows.length) return;
        if (_genMergeMode === 'append') {
            var shell = ensureGenerationPersistPayloadShell();
            if (!shell) return;
            var normalized = normalizeRowsForColumns(rows, shell.columns);
            shell.rows = shell.rows.concat(normalized);
            if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
                var prov = global.tcProvenanceArrayForStashPayload(normalized.length);
                shell.provenance = (shell.provenance || []).concat(prov || []);
            }
            return;
        }
        resyncGenerationPersistPayloadFromTable();
    }

    function refreshGenerationPersistPayload() {
        if (!_generationPinnedCtx) return null;
        restoreGenerationTableSnapshot();
        var payload = collectPayload();
        if (payload && payload.rows && payload.rows.length) {
            if (_genMergeMode === 'append') {
                var existingRows = _generationPersistPayload && _generationPersistPayload.rows ? _generationPersistPayload.rows.length : 0;
                if (existingRows > payload.rows.length) {
                    _generationPersistPayload.columns = payload.columns;
                    _generationPersistPayload.columnVisible = payload.columnVisible;
                    _generationPersistPayload.columnWidth = payload.columnWidth;
                } else {
                    _generationPersistPayload = payload;
                }
            } else {
                _generationPersistPayload = payload;
            }
        }
        return _generationPersistPayload;
    }


    function sanitizeRequirementCasePayloadForPersist(payload, opts) {
        opts = opts || {};
        if (!payload || !Array.isArray(payload.rows) || !payload.columns || !payload.columns.length) {
            return payload;
        }
        var dedupe = !!opts.dedupe;
        var cleaned = [];
        var seen = {};
        for (var i = 0; i < payload.rows.length; i++) {
            var row = payload.rows[i];
            if (typeof global.tcTableRowHasCaseContent === 'function') {
                if (!global.tcTableRowHasCaseContent(row)) continue;
            } else if (!rowsHaveContent([row], payload.columns.length)) {
                continue;
            }
            if (dedupe) {
                var key = JSON.stringify(row);
                if (seen[key]) continue;
                seen[key] = true;
            }
            cleaned.push(row);
        }
        var out = Object.assign({}, payload, { rows: cleaned });
        if (typeof global.tcNormalizeTableRowsForStorage === 'function') {
            out.rows = global.tcNormalizeTableRowsForStorage(out.rows);
        }
        if (out.provenance && out.provenance.length > cleaned.length) {
            out.provenance = out.provenance.slice(0, cleaned.length);
        }
        return out;
    }

    function rowsHaveContent(rows, colCount) {
        if (!rows || !rows.length) return false;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row) continue;
            for (var j = 0; j < colCount; j++) {
                if (String(row[j] != null ? row[j] : '').trim()) return true;
            }
        }
        return false;
    }

    function collectPayload() {
        if (typeof global.tcSyncTableLayoutBeforeStash === 'function') {
            global.tcSyncTableLayoutBeforeStash();
        }
        if (shouldSkipGridPullForPersist()) {
            return collectPayloadWithoutGridPull();
        }
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            try { global.TcTableBridge.commitAll(); } catch (eSync) { /* ignore */ }
        }
        if (global.TcTableView && typeof global.TcTableView.pullRows === 'function') {
            try { global.TcTableView.pullRows(); } catch (e) { /* ignore */ }
        }
        var cols = (global.tableColumns || []).map(String);
        if (!cols.length) return null;
        var rows = (global.testCasesData || []).map(function (row) {
            var out = [];
            for (var i = 0; i < cols.length; i++) {
                out.push(String(row && row[i] != null ? row[i] : ''));
            }
            return out;
        });
        if (!rowsHaveContent(rows, cols.length)) return null;
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

    function shouldApplyLoadForPage(pageId, opts) {
        opts = opts || {};
        pageId = String(pageId || '').trim();
        var target = String(opts.targetPageId || _targetPageId || '').trim();
        if (target && pageId && target !== pageId) return false;
        return true;
    }

    function resetToTemplateChooserState() {
        if (typeof global.isTcRequirementPageGenBusy === 'function' && global.isTcRequirementPageGenBusy()) {
            return;
        }
        if (typeof global.isTcPageGenLockActive === 'function' && global.isTcPageGenLockActive()) {
            return;
        }
        if (typeof global.isTcLeftPanelNavLocked === 'function' && global.isTcLeftPanelNavLocked()) {
            return;
        }
        if (typeof global.resetRequirementCaseTableUi === 'function') {
            global.resetRequirementCaseTableUi();
            return;
        }
        if (typeof global.isTcWorkbenchGenerationActive === 'function' &&
            global.isTcWorkbenchGenerationActive()) {
            return;
        }
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            try { global.TcTableBridge.commitAll(); } catch (e0) { /* ignore */ }
        }
        global.tcTableTemplateApplied = false;
        global.tcActiveTemplateId = null;
        global.tableColumns = [];
        global.testCasesData = [];
        global.testCasesProvenance = [];
        if (typeof global.tcClearTableLayoutMaps === 'function') {
            global.tcClearTableLayoutMaps();
        } else if (global.columnVisible && global.columnWidth && global.rowHeights) {
            Object.keys(global.columnVisible).forEach(function (k) { delete global.columnVisible[k]; });
            Object.keys(global.columnWidth).forEach(function (k) { delete global.columnWidth[k]; });
            Object.keys(global.rowHeights).forEach(function (k) { delete global.rowHeights[k]; });
        }
        if (global.markedRows) global.markedRows = new Set();
        if (global.selectedRows) global.selectedRows.clear();
        if (typeof global.tcTableResetUndoHistory === 'function') global.tcTableResetUndoHistory();
        if (typeof global.renderTableHeader === 'function') global.renderTableHeader();
        if (typeof global.renderTableBody === 'function') {
            global.renderTableBody({ reload: true });
        }
        if (typeof global.updateRestoreButton === 'function') global.updateRestoreButton();
        if (typeof global.syncTcTableTemplateChrome === 'function') global.syncTcTableTemplateChrome();
        if (typeof global.syncTcRightPanelMeta === 'function') global.syncTcRightPanelMeta();
        if (typeof global.tcTableEnsureHistoryReady === 'function') global.tcTableEnsureHistoryReady();
    }

    function applyPayloadSilent(payload, opts) {
        opts = opts || {};
        if (typeof global.applyRequirementCasePayload === 'function') {
            return global.applyRequirementCasePayload(payload, opts);
        }
        if (!payload || !payload.columns || !payload.columns.length) {
            return Promise.resolve(false);
        }
        return Promise.resolve(false);
    }

    function persistNow(source, opts) {
        opts = opts || {};
        if (shouldBlockOverwriteDbPersistDuringGeneration(opts)) return Promise.resolve(null);
        if (_persistSuspended && !opts.ctx && !opts.forCoverageFill) return Promise.resolve(null);
        var ctx = resolvePersistContext(opts);
        if (!ctx || !ctx.lanhu_url) return Promise.resolve(null);
        if (!ctx.lanhu_page_id) return Promise.resolve(null);
        var payload = opts.payload || collectPayload();
        if (!payload) {
            if (opts.allowEmpty) {
                payload = { scope: 'table', columns: (global.tableColumns || []).slice(), rows: [] };
            } else {
                return Promise.resolve(null);
            }
        }
        if (source === 'generation' || _genMergeMode === 'append') {
            payload = sanitizeRequirementCasePayloadForPersist(payload, {
                dedupe: source === 'generation' || _genMergeMode === 'append'
            });
        }
        var body = {
            lanhu_url: stripPageIdFromLanhuUrl(ctx.lanhu_url) || ctx.lanhu_url,
            page_id: ctx.lanhu_page_id || undefined,
            page_name: ctx.page_name || '',
            template_id: (source === 'generation' && global.__tcGenerationTableSnapshot &&
                global.__tcGenerationTableSnapshot.tcActiveTemplateId)
                ? global.__tcGenerationTableSnapshot.tcActiveTemplateId
                : (global.tcActiveTemplateId || null),
            payload: payload,
            source: source || 'manual_edit'
        };
        if (_genMergeMode === 'append') {
            body.merge_mode = 'append';
        }
        var _emptyRows = !rowsHaveContent(
            (payload && payload.rows) || [],
            ((payload && payload.columns) || []).length
        );
        if (!_emptyRows && payload && payload.rows && payload.rows.length) {
            try {
                var _san = sanitizeRequirementCasePayloadForPersist(payload || {}, { dedupe: false });
                _emptyRows = !rowsHaveContent((_san && _san.rows) || [], ((payload && payload.columns) || []).length);
            } catch (eEmptySan) { /* keep */ }
        }
        // 空表落库必须带 allow_clear；编辑清空路径会传 forceClear/allowEmpty
        var _allowClear = !!(opts.forceClear || opts.allowClear || opts.allowEmpty);
        if (_emptyRows && !_allowClear) {
            console.warn('[TcRequirementCaseStore] skip empty overwrite (no allow_clear)');
            return Promise.resolve(null);
        }
        if (_emptyRows && _allowClear) {
            body.allow_clear = true;
            body.force_clear = true;
            body.payload = Object.assign({}, payload, { rows: [] });
        }
        return fetch('/api/test-cases/requirement-cases', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body)
        }).then(function (r) {
            return r.json().then(function (d) {
                if (!r.ok || !d.ok) {
                    console.warn('[TcRequirementCaseStore] save failed', d && d.error);
                    return null;
                }
                // 服务端仍跳过空表覆盖时：补一次强制清空，且不清 dirty
                if (d.saved && d.saved.skipped_empty_overwrite && _emptyRows && !opts._retriedAllowClear) {
                    console.warn('[TcRequirementCaseStore] retry empty clear after skipped_empty_overwrite');
                    return persistNow(source, Object.assign({}, opts, {
                        payload: Object.assign({}, payload, { rows: [] }),
                        forceClear: true,
                        allowClear: true,
                        allowEmpty: true,
                        _retriedAllowClear: true
                    }));
                }
                if (d.saved && d.saved.skipped_empty_overwrite) {
                    console.warn('[TcRequirementCaseStore] empty clear still skipped');
                    return d.saved;
                }
                if (!opts.ctx) clearDirty();
                if (d.saved && window.TcLanhuTreeCaseStatus && typeof window.TcLanhuTreeCaseStatus.markPage === 'function') {
                    window.TcLanhuTreeCaseStatus.markPage(
                        d.saved.lanhu_doc_id,
                        d.saved.lanhu_page_id,
                        parseInt(d.saved.row_count, 10) || 0
                    );
                }
                return d.saved;
            });
        }).catch(function (e) {
            console.warn('[TcRequirementCaseStore] save error', e);
            return null;
        });
    }

    function buildEmptyTablePersistPayload() {
        var cols = (global.tableColumns || []).map(String);
        if (!cols.length) return null;
        var payload = {
            scope: 'table',
            columns: cols,
            rows: [],
            columnVisible: Object.assign({}, global.columnVisible || {}),
            columnWidth: Object.assign({}, global.columnWidth || {}),
            rowHeights: Object.assign({}, global.rowHeights || {})
        };
        if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
            payload.provenance = global.tcProvenanceArrayForStashPayload(0);
        }
        return payload;
    }

    /** 用户编辑/删行/清空后的落库：允许空表 forceClear，不影响通用 flushIfDirty 防误覆盖 */
    function flushIfDirtyAfterTableEdit(source, opts) {
        opts = opts || {};
        cancelPendingPersist();
        if (!_dirty && !opts.force) return Promise.resolve(null);
        if (isGenerationActive() && !opts.force) return Promise.resolve(null);
        if (shouldBlockOverwriteDbPersistDuringGeneration(opts)) return Promise.resolve(null);
        var ctx = opts.ctx || (_activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null);
        if (!ctx || !ctx.lanhu_page_id) {
            clearDirty();
            return Promise.resolve(null);
        }
        return syncTableForPersist().then(function () {
            var payload = opts.payload != null ? opts.payload : collectPayload();
            var persistOpts = { allowEmpty: true };
            if (opts.ctx) persistOpts.ctx = opts.ctx;
            if (!payload) {
                payload = buildEmptyTablePersistPayload();
                if (!payload) {
                    clearDirty();
                    return null;
                }
                persistOpts.forceClear = true;
                persistOpts.allowClear = true;
                persistOpts.payload = payload;
            } else {
                persistOpts.payload = payload;
                if (!rowsHaveContent(payload.rows, (payload.columns || []).length)) {
                    persistOpts.forceClear = true;
                    persistOpts.allowClear = true;
                }
            }
            return persistNow(source || 'manual_edit', persistOpts);
        });
    }


    /**
     * 删除行 / 清空表格专用落库（新方法，不影响通用 flushIfDirty）。
     * 不从 VXE 回拉行，避免删光后被表格组件把旧行又 pull 回来；
     * 空表时强制 allow_clear。
     */
    function persistAfterTableDeleteOrClear(source, opts) {
        opts = opts || {};
        source = source || 'manual_edit';
        markDirty();
        if (_persistSuspended && !opts.force) return Promise.resolve(null);
        if (isGenerationActive() && !opts.force) return Promise.resolve(null);
        if (shouldBlockOverwriteDbPersistDuringGeneration(opts)) return Promise.resolve(null);
        var ctx = opts.ctx || (_activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null);
        if (!ctx || !ctx.lanhu_page_id) {
            return Promise.resolve(null);
        }
        cancelPendingPersist();
        var payload = opts.payload != null ? opts.payload : collectPayloadWithoutGridPull();
        var persistOpts = {
            allowEmpty: true,
            forceClear: false,
            allowClear: false
        };
        if (opts.ctx) persistOpts.ctx = opts.ctx;
        if (!payload || !rowsHaveContent(payload.rows, (payload.columns || []).length)) {
            payload = buildEmptyTablePersistPayload();
            if (!payload) {
                // 无表头时无法组空包，仍标记 dirty，切页时再试
                return Promise.resolve(null);
            }
            persistOpts.forceClear = true;
            persistOpts.allowClear = true;
            persistOpts.payload = payload;
        } else {
            persistOpts.payload = payload;
        }
        return persistNow(source, persistOpts);
    }

    function onTableRowsRemoved() {
        return persistAfterTableDeleteOrClear('manual_edit', { force: true });
    }

    function schedulePersistAfterTableEdit(source) {
        /* 退出单元格编辑等表格变更后：防抖落库，避免连改多格时每次都打接口 */
        markDirty();
        if (_persistSuspended) return;
        if (isGenerationActive()) return;
        if (shouldBlockOverwriteDbPersistDuringGeneration()) return;
        var ctx = _activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null;
        if (!ctx || !ctx.lanhu_page_id) return;
        cancelPendingPersist();
        var src = source || 'manual_edit';
        _debounceTimer = setTimeout(function () {
            _debounceTimer = null;
            flushIfDirtyAfterTableEdit(src).catch(function () { /* ignore */ });
        }, DEBOUNCE_MS);
    }

    function persistDebounced(source) {
        schedulePersistAfterTableEdit(source);
    }

    function flushIfDirty(source, opts) {
        opts = opts || {};
        cancelPendingPersist();
        if (!_dirty && !opts.force) return Promise.resolve(null);
        if (isGenerationActive() && !opts.force) return Promise.resolve(null);
        if (shouldBlockOverwriteDbPersistDuringGeneration(opts)) return Promise.resolve(null);
        var ctx = opts.ctx || (_activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null);
        if (!ctx || !ctx.lanhu_page_id) {
            clearDirty();
            return Promise.resolve(null);
        }
        return syncTableForPersist().then(function () {
            var payload = opts.payload != null ? opts.payload : collectPayload();
            var persistOpts = {
                ctx: opts.ctx,
                payload: payload,
                allowEmpty: opts.allowEmpty
            };
            if (!opts.ctx) delete persistOpts.ctx;
            // 缺失 payload 时不要用空表落库，避免覆盖服务端已有用例
            if (!payload) return Promise.resolve(null);
            return persistNow(source || 'manual_edit', persistOpts);
        });
    }


    function collectPayloadForCoverageFillPersist() {
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            try { global.TcTableBridge.commitAll(); } catch (e0) { /* ignore */ }
        }
        if (global.TcTableView && typeof global.TcTableView.pullRows === 'function') {
            try { global.TcTableView.pullRows(); } catch (e1) { /* ignore */ }
        }
        if (typeof global.tcTablePullRowsFromView === 'function') {
            try { global.tcTablePullRowsFromView(); } catch (e2) { /* ignore */ }
        }
        if (typeof global.tcSyncTableLayoutBeforeStash === 'function') {
            try { global.tcSyncTableLayoutBeforeStash(); } catch (e3) { /* ignore */ }
        }
        return collectPayloadWithoutGridPull();
    }

    function resolvePersistContextForCoverageFill() {
        var ctx = _activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : resolveContext({});
        if (ctx && ctx.lanhu_page_id) return ctx;
        var pageId = getActiveLanhuPageId();
        if (pageId) {
            ctx = resolveContext({ lanhu_page_id: pageId, page_id: pageId });
            if (ctx && ctx.lanhu_page_id) return ctx;
        }
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta = global.getTcLanhuDocTreeMeta() || {};
            pageId = String(meta.selectedId || meta.focusPageId || '').trim();
            if (pageId) {
                ctx = resolveContext({ lanhu_page_id: pageId, page_id: pageId, page_name: meta.selectedPageName || '' });
                if (ctx && ctx.lanhu_page_id) return ctx;
            }
        }
        return ctx;
    }

    function persistAfterCoverageFillInDrawer(opts) {
        opts = opts || {};
        cancelPendingPersist();
        var tableSyncChain = syncTableForPersist();
        if (typeof global.renderTableBody === 'function') {
            tableSyncChain = tableSyncChain.then(function () {
                try {
                    return global.renderTableBody({ reload: true, immediate: true, forceTableSync: true });
                } catch (eRender) {
                    return null;
                }
            });
        }
        return tableSyncChain.then(function () {
            var payload = collectPayloadForCoverageFillPersist();
            if (!payload || !payload.rows || !payload.rows.length) {
                payload = collectPayload();
            }
            if (!payload || !payload.rows || !payload.rows.length) {
                if (!opts.allowEmpty) {
                    console.warn('[TcRequirementCaseStore] coverage fill persist skipped: empty table');
                    return null;
                }
            }
            var ctx = resolvePersistContextForCoverageFill();
            if (!ctx || !ctx.lanhu_url || !ctx.lanhu_page_id) {
                console.warn('[TcRequirementCaseStore] coverage fill persist skipped: missing page context');
                return null;
            }
            markDirty();
            return persistNow('manual_edit', {
                force: true,
                forCoverageFill: true,
                payload: payload,
                allowEmpty: !!opts.allowEmpty,
                ctx: ctx
            });
        }).catch(function (err) {
            console.warn('[TcRequirementCaseStore] coverage fill persist error', err);
            return null;
        });
    }

    function flushDebounced() {
        return flushIfDirty('manual_edit');
    }

    function persistAfterGeneration() {
        var pinnedCtx = _generationPinnedCtx ? normalizeCtx(Object.assign({}, _generationPinnedCtx)) : null;
        var isAppend = _genMergeMode === 'append';
        return (isAppend ? Promise.resolve() : syncTableForPersist()).then(function () {
            if (!isAppend) {
                refreshGenerationPersistPayload();
            } else {
                restoreGenerationTableSnapshot();
                if (typeof global.tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
                    global.tcRestoreAppendGenerationBaselineIfNeeded();
                }
                _generationPersistPayload = buildAppendGenerationPersistPayload();
            }
            var payload = null;
            if (isAppend) {
                payload = (_generationPersistPayload && _generationPersistPayload.rows &&
                    _generationPersistPayload.rows.length)
                    ? _generationPersistPayload
                    : buildAppendGenerationPersistPayload();
            } else {
                payload = collectPayload();
                if (!payload || !payload.rows || !payload.rows.length) {
                    payload = (_generationPersistPayload && _generationPersistPayload.rows &&
                        _generationPersistPayload.rows.length)
                        ? _generationPersistPayload
                        : collectPayload();
                }
            }
            if (!payload || !payload.rows || !payload.rows.length) {
                if (isAppend) {
                    console.warn('[TcRequirementCaseStore] append persist skipped: no payload');
                    return Promise.resolve(null);
                }
            }
            return persistNow('generation', {
                ctx: pinnedCtx,
                payload: payload,
                forGeneration: true,
                forceUrl: false
            });
        }).then(function (saved) {
            if (saved) clearDirty();
            if (saved && saved.lanhu_doc_id && saved.lanhu_page_id) {
                rememberLastPage(saved.lanhu_doc_id, saved.lanhu_page_id);
            }
            if (saved && window.TcLanhuTreeCaseStatus &&
                typeof window.TcLanhuTreeCaseStatus.markPage === 'function') {
                window.TcLanhuTreeCaseStatus.markPage(
                    saved.lanhu_doc_id,
                    saved.lanhu_page_id,
                    parseInt(saved.row_count, 10) || 0
                );
            }
            if (saved && typeof global.tcAppToast === 'function') {
                var savedPageLabel = '';
                if (_generationPinnedCtx && _generationPinnedCtx.page_name) {
                    savedPageLabel = String(_generationPinnedCtx.page_name).trim();
                }
                if (!savedPageLabel && typeof global.getTcLanhuDocTreeMeta === 'function') {
                    var _saveMeta = global.getTcLanhuDocTreeMeta() || {};
                    savedPageLabel = String(_saveMeta.selectedPageName || '').trim();
                }
                var savedToastMsg = savedPageLabel
                    ? ('用例已保存到需求页「' + savedPageLabel + '」')
                    : '用例已保存到需求页';
                global.tcAppToast(savedToastMsg, {
                    variant: 'success',
                    duration: 2400
                });
            }
            return saved;
        }).catch(function (err) {
            if (!tcIsBenignFetchAbort(err)) {
                console.warn('[TcRequirementCaseStore] persistAfterGeneration error', err);
            }
            return null;
        }).finally(function () {
            clearGenerationPinnedContext();
            if (typeof global.refreshTcPageGenLock === 'function') {
                global.refreshTcPageGenLock();
            }
        });
    }


    function isSamePageWithCasesDisplayed(ctx) {
        if (!ctx) return false;
        var key = buildContextKey(normalizeCtx(ctx));
        if (!key || key !== _lastLoadedKey) return false;
        var pageId = String(ctx.lanhu_page_id || ctx.page_id || '').trim();
        return isDisplayedCasesForPage(pageId);
    }

    function getActiveLanhuPageId() {
        return _activeCtx ? String(_activeCtx.lanhu_page_id || _activeCtx.page_id || '').trim() : '';
    }


    function persistActivePageBeforeLeave(source, opts) {
        opts = opts || {};
        source = source || 'manual_edit';
        if (_persistSuspended && !opts.force && !opts.ctx) return Promise.resolve(null);
        if (isGenerationActive() && !opts.force) return Promise.resolve(null);
        if (shouldBlockOverwriteDbPersistDuringGeneration(opts)) return Promise.resolve(null);
        var ctx = opts.ctx || (_activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null);
        if (!ctx || !ctx.lanhu_page_id || !ctx.lanhu_url) {
            return flushIfDirty(source, opts);
        }
        cancelPendingPersist();
        return syncTableForPersist().then(function () {
            var mindPersistChain = Promise.resolve(null);
            if (typeof global.TcRequirementMindmapStore !== 'undefined' &&
                typeof global.TcRequirementMindmapStore.persistActivePageBeforeLeave === 'function' && ctx) {
                mindPersistChain = global.TcRequirementMindmapStore.persistActivePageBeforeLeave({ ctx: ctx, source: source });
            }
            return mindPersistChain.then(function () {
            var decision = null;
            if (typeof global.tcTemplateSwitchEvaluateLeavePersist === 'function') {
                try {
                    decision = global.tcTemplateSwitchEvaluateLeavePersist();
                } catch (eEval) { decision = null; }
            }
            var shouldPersist = (decision && decision.shouldPersist) || (_dirty && opts.force);
            if (!shouldPersist && !_dirty) return null;
            if (!shouldPersist && _dirty) shouldPersist = true;
            if (!shouldPersist) return null;
            var leavePayload = decision && decision.payload ? decision.payload : collectPayload();
            var persistOpts = {
                ctx: ctx,
                force: true,
                payload: leavePayload
            };
            // 蓝湖树传入的 allowEmpty 需落到 forceClear，否则空表无法清库
            if (opts.forceClear || opts.allowClear || opts.allowEmpty) {
                persistOpts.forceClear = true;
                persistOpts.allowClear = true;
                persistOpts.allowEmpty = true;
            }
            // 用户删光用例后切页：必须带 forceClear；无 dirty 且调用方未允许空表时仍跳过
            if (!leavePayload) {
                if (!_dirty && !opts.forceClear && !opts.allowClear && !opts.allowEmpty) return null;
                leavePayload = buildEmptyTablePersistPayload();
                if (!leavePayload) return null;
                persistOpts.payload = leavePayload;
                persistOpts.forceClear = true;
                persistOpts.allowClear = true;
                persistOpts.allowEmpty = true;
            } else if (!rowsHaveContent(leavePayload.rows, (leavePayload.columns || []).length)) {
                if (!_dirty && !opts.forceClear && !opts.allowClear && !opts.allowEmpty) return null;
                persistOpts.forceClear = true;
                persistOpts.allowClear = true;
                persistOpts.allowEmpty = true;
            }
            return persistNow(source, persistOpts).then(function (saved) {
                if (saved && !opts.ctx) clearDirty();
                return saved;
            });
            });
        });
    }


    function switchRequirementPage(pageId, pageName, opts) {
        opts = opts || {};
        pageId = String(pageId || '').trim();
        pageName = pageName || '';
        if (!pageId) return Promise.resolve(false);
        if (typeof global.isTcQualityCheckLanhuNavBlocked === 'function' &&
            global.isTcQualityCheckLanhuNavBlocked()) {
            if (typeof global.toastTcQualityCheckNavBlocked === 'function') {
                global.toastTcQualityCheckNavBlocked();
            }
            return Promise.resolve(false);
        }
        if (typeof global.isTcLanhuRequirementPageSwitchBlocked === 'function' &&
            global.isTcLanhuRequirementPageSwitchBlocked()) {
            if (typeof global.toastTcLanhuRequirementPageSwitchBlocked === 'function') {
                global.toastTcLanhuRequirementPageSwitchBlocked();
            }
            return Promise.resolve(false);
        }

        var url = resolveLanhuBaseUrlForPageLoad(opts);
        if (!url) return Promise.resolve(false);

        cancelPendingPersist();
        var switchToken = ++_pageSwitchToken;
        _targetPageId = pageId;
        _persistSuspended = true;

        var prevCtx = _activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null;
        var prevPageIdForQc = prevCtx ? String(prevCtx.lanhu_page_id || prevCtx.page_id || '').trim() : '';
        var prevKey = prevCtx ? buildContextKey(prevCtx) : '';
        var nextCtx = resolveContext({
            page_id: pageId,
            page_name: pageName,
            forceUrl: true,
            lanhu_url: url
        });
        if (!nextCtx) {
            _persistSuspended = false;
            return Promise.resolve(false);
        }

        var nextKey = buildContextKey(nextCtx);
        if (prevKey && nextKey === prevKey && isSamePageWithCasesDisplayed(nextCtx)) {
            _persistSuspended = false;
            _targetPageId = pageId;
            return Promise.resolve(true);
        }
        if (prevKey && nextKey && prevKey !== nextKey && typeof global.tcTemplateSwitchClearPageSession === 'function') {
            global.tcTemplateSwitchClearPageSession(prevKey);
        }
        var leavingPrev = prevCtx && prevKey && prevCtx.lanhu_page_id && prevKey !== nextKey;

        if (_loadAbort) {
            try { _loadAbort.abort(); } catch (eAbort) { /* ignore */ }
            _loadAbort = null;
        }

        function continuePageSwitchAfterLeavePersist() {
            if (typeof global.TcRequirementMindmapStore !== 'undefined' &&
                typeof global.TcRequirementMindmapStore.clearSessionForPageSwitch === 'function') {
                global.TcRequirementMindmapStore.clearSessionForPageSwitch();
            }
            if (!opts.showTableLoading) {
                resetToTemplateChooserState();
            }
            _lastLoadedKey = '';

            if (opts.showTableLoading && typeof global.showTablePageLoading === 'function') {
                global.showTablePageLoading();
            }
            if (opts.showTableLoading && typeof global.switchTcRightView === 'function') {
                global.switchTcRightView('table');
            }

            setActiveContext(nextCtx);
            if (nextCtx.lanhu_doc_id && nextCtx.lanhu_page_id) {
                rememberLastPage(nextCtx.lanhu_doc_id, nextCtx.lanhu_page_id);
            }
            var mainUrl = document.getElementById('lanhu-url');
            if (mainUrl && nextCtx.lanhu_url) mainUrl.value = nextCtx.lanhu_url;

            return loadForContext(nextCtx, {
                force: true,
                fromPageSwitch: true,
                switchToken: switchToken,
                targetPageId: pageId
            }).then(function (loaded) {
                if (typeof global.tcQcPageSessionOnPageSwitch === 'function') {
                    global.tcQcPageSessionOnPageSwitch(prevPageIdForQc, pageId);
                }
                return loaded;
            }).finally(function () {
                if (switchToken === _pageSwitchToken) {
                    _persistSuspended = false;
                }
            });
        }

        if (leavingPrev) {
            return persistActivePageBeforeLeave('manual_edit', { ctx: prevCtx, force: true })
                .catch(function () { return null; })
                .then(continuePageSwitchAfterLeavePersist);
        }

        return continuePageSwitchAfterLeavePersist();
    }

    function loadForContext(ctx, opts) {
        opts = opts || {};
        ctx = ctx || resolveContext({});
        if (!ctx || !ctx.lanhu_url) return Promise.resolve(false);
        var key = buildContextKey(ctx);
        if (!opts.force && key && key === _lastLoadedKey) return Promise.resolve(false);
        if (_loadAbort) {
            try { _loadAbort.abort(); } catch (eAbort2) { /* ignore */ }
        }
        _loadAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var fetchSignal = _loadAbort ? _loadAbort.signal : undefined;
        _loading = true;
        var reqPageId = String(ctx.lanhu_page_id || ctx.page_id || '').trim();
        if (!reqPageId) {
            _loading = false;
            if (opts.fromPageSwitch) resetToTemplateChooserState();
            return Promise.resolve(false);
        }
        var seq = ++_loadSeq;
        var apiBaseUrl = stripPageIdFromLanhuUrl(ctx.lanhu_url) || ctx.lanhu_url;
        var q = '/api/test-cases/requirement-cases?lanhu_url=' +
            encodeURIComponent(apiBaseUrl) +
            '&page_id=' + encodeURIComponent(reqPageId) +
            '&_ts=' + Date.now();
        return fetch(q, { credentials: 'same-origin', cache: 'no-store', signal: fetchSignal })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (seq !== _loadSeq) return false;
                if (!shouldApplyLoadForPage(reqPageId, opts)) return false;
                if (!d.ok || !d.found || !d.data || !d.data.payload) {
                    if (opts.fromPageSwitch && shouldApplyLoadForPage(reqPageId, opts)) {
                        resetToTemplateChooserState();
                    }
                    if (opts.fromPageSwitch && typeof global.TcRequirementMindmapStore !== 'undefined' &&
                        typeof global.TcRequirementMindmapStore.onTablePageLoaded === 'function') {
                        global.TcRequirementMindmapStore.onTablePageLoaded(ctx);
                    }
                    return false;
                }
                var respPageId = String(d.data.lanhu_page_id || reqPageId || '').trim();
                if (respPageId && respPageId !== reqPageId) {
                    return false;
                }
                setActiveContext({
                    lanhu_url: d.data.lanhu_url || ctx.lanhu_url,
                    lanhu_pid: d.data.lanhu_pid,
                    lanhu_doc_id: d.data.lanhu_doc_id,
                    lanhu_page_id: d.data.lanhu_page_id || reqPageId,
                    requirement_id: d.data.requirement_id,
                    page_name: d.data.page_name || ctx.page_name
                });
                var loadedTemplateId = d.data.template_id ? String(d.data.template_id) : '';
                return applyPayloadSilent(d.data.payload, { templateId: loadedTemplateId || undefined }).then(function (ok) {
                    if (!ok || !shouldApplyLoadForPage(reqPageId, opts)) return false;
                    if (loadedTemplateId) {
                        if (typeof global.setTcActiveTemplateId === 'function') {
                            global.setTcActiveTemplateId(loadedTemplateId);
                        } else {
                            global.tcActiveTemplateId = loadedTemplateId;
                        }
                    }
                    if (loadedTemplateId && typeof global.tcTemplateSwitchRecordBaseline === 'function') {
                        global.setTimeout(function () {
                            global.tcTemplateSwitchRecordBaseline(loadedTemplateId);
                        }, 150);
                    }
                    if (typeof global.TcRequirementMindmapStore !== 'undefined' &&
                        typeof global.TcRequirementMindmapStore.onTablePageLoaded === 'function') {
                        global.TcRequirementMindmapStore.onTablePageLoaded({
                            lanhu_url: d.data.lanhu_url || ctx.lanhu_url,
                            lanhu_pid: d.data.lanhu_pid,
                            lanhu_doc_id: d.data.lanhu_doc_id,
                            lanhu_page_id: d.data.lanhu_page_id || reqPageId,
                            requirement_id: d.data.requirement_id,
                            page_name: d.data.page_name || ctx.page_name
                        });
                    }
                    clearDirty();
                    _lastLoadedKey = key;
                    _targetPageId = reqPageId;
                    if (typeof global.tcAppToast === 'function') {
                        var pn = d.data.page_name || ctx.page_name || '';
                        var hint = pn ? ('「' + pn + '」') : ('pageId=' + (d.data.lanhu_page_id || ctx.lanhu_page_id || ''));
                        global.tcAppToast('已加载该需求页历史用例 ' + hint, { variant: 'info', duration: 2200 });
                    }
                    // 页面切换后如存在待处理的生成请求且模板已从历史数据恢复，继续弹窗
                    if (global._tcPendingPageGenAfterTemplate && global.tcTableTemplateApplied) {
                        var pending = global._tcPendingPageGenAfterTemplate;
                        global._tcPendingPageGenAfterTemplate = null;
                        var pendingPageId = String(pending.pageId || '').trim();
                        if (!pendingPageId || pendingPageId === reqPageId) {
                            setTimeout(function () {
                                if (typeof global.openTcPageGenModal === 'function') {
                                    global.openTcPageGenModal(pending.pageId, pending.pageName);
                                }
                            }, 0);
                        }
                    }
                    return ok;
                });
            })
            .catch(function (err) {
                if (tcIsBenignFetchAbort(err)) return false;
                return false;
            })
            .finally(function () {
                _loading = false;
                if (opts.fromPageSwitch && typeof global.hideTablePageLoading === 'function') {
                    var st = opts.switchToken;
                    if (st == null || st === _pageSwitchToken) {
                        global.hideTablePageLoading();
                    }
                }
            });
    }

    function onPageSelected(pageId, pageName, opts) {
        return switchRequirementPage(pageId, pageName, opts);
    }

    function onTableMutation() {
        schedulePersistAfterTableEdit('manual_edit');
    }

    function hydrateSelectedPageCases(pageId, pageName, opts) {
        opts = opts || {};
        return switchRequirementPage(pageId, pageName, {
            lanhu_url: opts.lanhu_url,
            forceUrl: opts.forceUrl
        });
    }


    function persistBeforePageLeave() {
        if (_persistSuspended) return;
        if (isGenerationActive()) return;
        if (shouldBlockOverwriteDbPersistDuringGeneration()) return;
        var ctx = _activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null;
        if (!ctx || !ctx.lanhu_page_id) return;
        var shouldPersist = _dirty;
        var evaluatedPayload = null;
        if (typeof global.tcTemplateSwitchEvaluateLeavePersist === 'function') {
            try {
                if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
                    global.TcTableBridge.commitAll();
                }
                var decision = global.tcTemplateSwitchEvaluateLeavePersist();
                if (decision && decision.shouldPersist) {
                    shouldPersist = true;
                    evaluatedPayload = decision.payload;
                }
            } catch (eEvalLeave) { /* ignore */ }
        }
        if (!shouldPersist) return;
        cancelPendingPersist();
        try {
            if (!evaluatedPayload && global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
                global.TcTableBridge.commitAll();
            }
        } catch (eCommit) { /* ignore */ }
        var payload = evaluatedPayload || collectPayload();
        var allowClear = false;
        if (!payload || !payload.rows || !payload.rows.length) {
            // 仅在确有未保存变更（例如用户清空全部用例）时允许空表落库
            if (!_dirty) return;
            payload = buildEmptyTablePersistPayload();
            if (!payload) return;
            allowClear = true;
        } else if (!rowsHaveContent(payload.rows, (payload.columns || []).length)) {
            if (!_dirty) return;
            allowClear = true;
        }
        var body = {
            lanhu_url: stripPageIdFromLanhuUrl(ctx.lanhu_url) || ctx.lanhu_url,
            page_id: ctx.lanhu_page_id || undefined,
            page_name: ctx.page_name || '',
            template_id: (typeof global.getTcActiveTemplateId === 'function'
                ? global.getTcActiveTemplateId()
                : null) || global.tcActiveTemplateId || null,
            payload: payload,
            source: 'manual_edit'
        };
        if (allowClear) {
            body.allow_clear = true;
        }
        try {
            fetch('/api/test-cases/requirement-cases', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                keepalive: true,
                body: JSON.stringify(body)
            }).catch(function () { /* ignore leave persist */ });
            clearDirty();
        } catch (eLeave) { /* ignore */ }
    }


    function tcBindBenignFetchAbortGuard() {
        if (global._tcBenignFetchAbortGuardBound) return;
        global._tcBenignFetchAbortGuardBound = true;
        global.addEventListener('unhandledrejection', function (ev) {
            if (tcIsBenignFetchAbort(ev && ev.reason)) {
                ev.preventDefault();
            }
        });
    }

    function initLeaveHandlers() {
        if (global._tcReqCaseLeaveBound) return;
        global._tcReqCaseLeaveBound = true;
        global.addEventListener('pagehide', persistBeforePageLeave);
        global.addEventListener('beforeunload', persistBeforePageLeave);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') {
                persistActivePageBeforeLeave('manual_edit', { force: true })
                    .catch(function () { /* ignore */ });
            }
        });
    }
    tcBindBenignFetchAbortGuard();
    initLeaveHandlers();

    global.restoreGenerationTableSnapshot = restoreGenerationTableSnapshot;

    global.tcIsBenignFetchAbort = tcIsBenignFetchAbort;

    global.TcRequirementCaseStore = {
        captureGenerationContext: captureGenerationContext,
        clearGenerationPinnedContext: clearGenerationPinnedContext,
        isWorkbenchGenerationStreamBusy: isWorkbenchGenerationStreamBusy,
        isWorkbenchGenerationInterruptible: isWorkbenchGenerationInterruptible,
        abortAndRollbackWorkbenchGeneration: abortAndRollbackWorkbenchGeneration,
        abortGenerationAndRestoreTable: abortGenerationAndRestoreTable,
        restoreGenerationTableSnapshot: restoreGenerationTableSnapshot,
        refreshGenerationPersistPayload: refreshGenerationPersistPayload,
        mergeGenerationPersistRows: mergeGenerationPersistRows,
        getGenerationPinnedPageId: getGenerationPinnedPageId,
        setActiveContext: setActiveContext,
        resolveContext: resolveContext,
        persistAfterCoverageFillInDrawer: persistAfterCoverageFillInDrawer,
        persistAfterGeneration: persistAfterGeneration,
        persistDebounced: persistDebounced,
        schedulePersistAfterTableEdit: schedulePersistAfterTableEdit,
        flushIfDirtyAfterTableEdit: flushIfDirtyAfterTableEdit,
        buildEmptyTablePersistPayload: buildEmptyTablePersistPayload,
        persistAfterTableDeleteOrClear: persistAfterTableDeleteOrClear,
        onTableRowsRemoved: onTableRowsRemoved,
        persistNow: persistNow,
        flushDebounced: flushDebounced,
        flushIfDirty: flushIfDirty,
        persistActivePageBeforeLeave: persistActivePageBeforeLeave,
        isDirty: function () { return _dirty; },
        isLoading: function () { return _loading; },
        loadForContext: loadForContext,
        onPageSelected: onPageSelected,
        onTableMutation: onTableMutation,
        applyPayloadSilent: applyPayloadSilent,
        hydrateSelectedPageCases: hydrateSelectedPageCases,
        switchRequirementPage: switchRequirementPage,
        cancelPendingPersist: cancelPendingPersist,
        getActiveLanhuPageId: getActiveLanhuPageId,
        isDisplayedCasesForPage: isDisplayedCasesForPage,
        rememberLastPage: rememberLastPage,
        readLastPage: readLastPage
    };
})(typeof window !== 'undefined' ? window : globalThis);
