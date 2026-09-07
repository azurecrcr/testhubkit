/* ---- tc_wb_enhancements_preamble.js ---- */
/**
 * 用例工作台增强：二次校验、导出报告
 * 依赖：HfLocalStash、tcAppToast、tcAppAlert、index.html 中的表格全局变量
 */
(function (global) {
    'use strict';

    var state = {
        batchId: null,
        batchRowCount: 0,
        batchRowStart: 0,
        lastRequirements: '',
        lastLanhuRequirements: '',
        lastUserContent: '',
        loggedIn: false,
        _inited: false
    };

    var TC_VALIDATE_LLM_TIMEOUT_MS = 600000;
    /** AI 对流式对照：全量表用例可能较久，单独放宽（仅 llm-stream 使用） */
    var TC_VALIDATE_LLM_STREAM_TIMEOUT_MS = 600000;
    var TC_VALIDATE_FORMAT_TIMEOUT_MS = 30000;
    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toast(msg, opts) {
        if (typeof global.tcAppToast === 'function') global.tcAppToast(msg, opts || { variant: 'info', duration: 3200 });
    }

    function alertBox(msg, opts) {
        if (typeof global.tcAppAlert === 'function') global.tcAppAlert(msg, opts || { variant: 'warning', title: '提示' });
    }

    function getTableColumns() {
        return typeof global.tableColumns !== 'undefined' && global.tableColumns ? global.tableColumns.slice() : [];
    }

    function getTableRows() {
        return typeof global.testCasesData !== 'undefined' && global.testCasesData ? global.testCasesData : [];
    }

    function collectRowsPayloadDirect() {
        var cols = getTableColumns();
        var tableRows = getTableRows();
        return {
            columns: cols,
            rows: tableRows.map(function (row) {
                return cols.map(function (_, i) { return String(row[i] != null ? row[i] : ''); });
            })
        };
    }

    function rowsPayloadHasCellContent(payload) {
        if (!payload || !payload.rows || !payload.rows.length) return false;
        var colCount = (payload.columns || []).length;
        if (!colCount && typeof global.tableColumns !== 'undefined' && global.tableColumns) {
            colCount = global.tableColumns.length;
        }
        if (!colCount) return false;
        for (var i = 0; i < payload.rows.length; i++) {
            var row = payload.rows[i];
            if (!row) continue;
            for (var j = 0; j < colCount; j++) {
                if (String(row[j] != null ? row[j] : '').trim()) return true;
            }
        }
        return false;
    }

    function batchPayloadHasCellContent(batchPayload) {
        if (!batchPayload || !batchPayload.rows || !batchPayload.rows.length) return false;
        return rowsPayloadHasCellContent({
            columns: batchPayload.columns || [],
            rows: batchPayload.rows
        });
    }

    function validationParsedRowHasCellContent(row, columns) {
        if (!row || !Array.isArray(row)) return false;
        columns = columns || [];
        if (typeof global.tcTableRowHasCaseContent === 'function') {
            var tableRow = columns.length
                ? columns.map(function (_, idx) { return String(row[idx] != null ? row[idx] : ''); })
                : row.map(function (cell) { return String(cell != null ? cell : ''); });
            return global.tcTableRowHasCaseContent(tableRow);
        }
        var cells = columns.length ? columns.map(function (_, idx) {
            return String(row[idx] != null ? row[idx] : '');
        }) : row;
        for (var i = 0; i < cells.length; i++) {
            if (String(cells[i] != null ? cells[i] : '').trim()) return true;
        }
        return false;
    }

    function filterValidationParsedRowsBundle(rows, columns, tableRowIndices) {
        rows = rows || [];
        columns = columns || [];
        tableRowIndices = tableRowIndices || null;
        var filteredRows = [];
        var filteredIndices = [];
        var hasIndexMap = tableRowIndices && tableRowIndices.length === rows.length;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row) continue;
            var normalized = columns.length
                ? columns.map(function (_, idx) { return String(row[idx] != null ? row[idx] : ''); })
                : row.map(function (cell) { return String(cell != null ? cell : ''); });
            if (!validationParsedRowHasCellContent(normalized, columns)) continue;
            filteredRows.push(normalized);
            if (hasIndexMap && tableRowIndices[i] != null && !isNaN(tableRowIndices[i])) {
                filteredIndices.push(parseInt(tableRowIndices[i], 10));
            }
        }
        return {
            rows: filteredRows,
            tableRowIndices: filteredIndices.length === filteredRows.length ? filteredIndices : []
        };
    }

    function collectRowsPayloadForValidation() {
        try {
            if (typeof global.commitTableCellEdit === 'function' &&
                typeof global.tcEditingCell !== 'undefined' && global.tcEditingCell) {
                global.commitTableCellEdit(true);
            }
        } catch (e0) { /* ignore */ }

        var fromGlobal = collectRowsPayloadDirect();
        if (global.TcTableView && typeof global.TcTableView.pullRows === 'function') {
            try {
                global.TcTableView.pullRows();
            } catch (ePull) { /* ignore */ }
            var fromPull = collectRowsPayloadDirect();
            var globalHas = rowsPayloadHasCellContent(fromGlobal);
            var pulledHas = rowsPayloadHasCellContent(fromPull);
            if (globalHas && !pulledHas) return fromGlobal;
            if (!globalHas && pulledHas) return fromPull;
            if (globalHas && pulledHas) return fromPull;
            return fromPull;
        }
        return fromGlobal;
    }

    function collectRowsPayload() {
        var cols = getTableColumns();
        var tableRows = getTableRows();
        var prov = [];
        if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
            prov = global.tcProvenanceArrayForStashPayload(tableRows.length);
        } else if (typeof global.testCasesProvenance !== 'undefined' && global.testCasesProvenance) {
            prov = global.testCasesProvenance.slice();
        }
        return {
            columns: cols,
            rows: tableRows.map(function (row) {
                return cols.map(function (_, i) { return String(row[i] != null ? row[i] : ''); });
            }),
            provenance: prov
        };
    }

    var VALIDATE_SCOPE_SINGLE = 'single';
    var VALIDATE_BATCH_SCOPE_HINT_LANHU = '（仅检查当前会话、相同蓝湖需求下的用例）';
    var VALIDATE_BATCH_SCOPE_HINT_BATCH = '（仅检查本次生成用例）';
    var LLM_SKIP_REASON = {
        NO_LANHU: 'no_lanhu',
        DISABLED: 'disabled',
        NO_CONTENT: 'no_content',
        ERROR: 'error',
        TIMEOUT: 'timeout'
    };
    var LLM_SKIP_DETAIL_NO_LANHU = '格式检查通过（未填写蓝湖 URL，未运行 AI 对照）';

    function validationHasActionableResults(stored) {
        if (!stored) return false;
        if (stored.llm_pending) return true;
        if ((stored.issues || []).length > 0) return true;
        if ((stored.gap_count || 0) > 0) return true;
        if ((stored.over_generated_count || 0) > 0) return true;
        if (stored.llm_done && !stored.llm_skipped) return true;
        return false;
    }

    function shouldHideValidateDetailForSkippedNoLanhu(stored) {
        if (!stored || stored.llm_skip_reason !== LLM_SKIP_REASON.NO_LANHU) return false;
        return true;
    }

    /** 未填蓝湖跳过 AI 对照时：不自动弹窗、不展示质量检查浮窗 reopen 按钮（子步骤仍展示）。 */
    function shouldSuppressValidateUiForSkippedNoLanhu(stored) {
        return shouldHideValidateDetailForSkippedNoLanhu(stored);
    }

    function dismissValidateUiForSkippedNoLanhu(stored, scope) {
        if (!shouldSuppressValidateUiForSkippedNoLanhu(stored)) return;
        closeValidateDrawer(normalizeValidateScope(scope));
    }

    function formatLlmSkippedMessage(stored) {
        if (!stored || !stored.llm_skipped) return '';
        var hasFormatIssues = (stored.issues || []).length > 0;
        var reason = stored.llm_skip_reason;
        if (reason === LLM_SKIP_REASON.NO_LANHU) {
            return hasFormatIssues
                ? ('共 ' + (stored.issue_count || stored.issues.length) + ' 项（仅格式 · 未填写蓝湖 URL，未运行 AI 对照）')
                : LLM_SKIP_DETAIL_NO_LANHU;
        }
        if (reason === LLM_SKIP_REASON.DISABLED) {
            return hasFormatIssues
                ? ('共 ' + (stored.issue_count || stored.issues.length) + ' 项（仅格式 · 未启用 AI 对照）')
                : '格式检查通过（未启用 AI 对照）';
        }
        if (reason === LLM_SKIP_REASON.NO_CONTENT) {
            return hasFormatIssues
                ? ('共 ' + (stored.issue_count || stored.issues.length) + ' 项（仅格式 · 缺少需求/用户内容，未运行 AI 对照）')
                : '格式检查通过（缺少需求或用户内容，未运行 AI 对照）';
        }
        if (reason === LLM_SKIP_REASON.TIMEOUT) {
            return hasFormatIssues
                ? ('共 ' + (stored.issue_count || stored.issues.length) + ' 项（仅格式 · AI 对照超时）')
                : '格式检查通过（AI 对照超时，未完成对照）';
        }
        if (reason === LLM_SKIP_REASON.ERROR) {
            return hasFormatIssues
                ? ('共 ' + (stored.issue_count || stored.issues.length) + ' 项（仅格式 · AI 对照失败）')
                : '格式检查通过（AI 对照失败，未完成对照）';
        }
        return hasFormatIssues
            ? ('共 ' + (stored.issue_count || stored.issues.length) + ' 项（仅格式 · 已跳过 AI 对照）')
            : '格式检查通过（未运行 AI 对照）';
    }


    /** 质量检查专用：识别浏览器 ReadableStream 读失败（如 Error in input stream） */
    function isQcLlmStreamInputError(err) {
        var msg = String((err && err.message) || err || '');
        return /Error in input stream|ERR_INCOMPLETE_CHUNKED_ENCODING|network error|Failed to fetch|Load failed|The network connection was lost/i.test(msg);
    }

    /** 质量检查专用：将流读取原始错误转为可读中文，不改动 AbortError */
    function normalizeQcLlmStreamReadError(err) {
        if (err && err.name === 'AbortError') return err;
        if (isQcLlmStreamInputError(err)) {
            var friendly = new Error('AI 对照连接中断，请稍后重试');
            friendly._qcStreamInputError = true;
            try { friendly.cause = err; } catch (eCause) { /* ignore */ }
            return friendly;
        }
        if (err instanceof Error) return err;
        return new Error(String((err && err.message) || err || 'AI 对照失败'));
    }

    /**
     * 质量检查专用：流读失败后尽量冲刷缓冲并回收已收到的 done 结果，
     * 避免因连接抖动直接丢掉几乎完成的对照结果。
     */
    function recoverQcLlmStreamAfterReadFailure(readErr, opts) {
        opts = opts || {};
        try {
            if (typeof opts.flush === 'function') opts.flush();
        } catch (eFlush) { /* ignore */ }
        if (opts.streamErr) throw opts.streamErr;
        if (opts.finalResult) return opts.finalResult;
        throw normalizeQcLlmStreamReadError(readErr);
    }

    function getValidateBatchScopeHint() {
        return VALIDATE_BATCH_SCOPE_HINT_BATCH;
    }

    function normalizeValidateScope(scope) {
        return scope === VALIDATE_SCOPE_SINGLE ? VALIDATE_SCOPE_SINGLE : VALIDATE_SCOPE_SINGLE;
    }

    function createValidateScopeData() {
        return {
            lastValidation: null,
            locateValidateRowIndex: null,
            validateRunId: 0,
            validateProgress: null,
            validationBatchSnapshot: null,
            batchSnapshot: {
                batchRowStart: 0,
                batchRowCount: 0,
                batchId: null,
                batchRequirements: '',
                batchUserContent: '',
                batchAiOutputText: '',
                batchRagContext: '',
                batchParsedColumns: [],
                batchParsedRows: [],
                batchParsedTableRowIndices: [],
                _batchTableLinked: true,
                _batchMode: 'list'
            },
            floatState: {
                sizeIndex: 2,
                maximized: false,
                customWidth: null,
                customHeight: null,
                left: null,
                top: null
            }
        };
    }

    var validateScopeStore = {
        single: createValidateScopeData(),
        agent: createValidateScopeData()
    };

    var batchValidationCache = {};
    var pendingValidationFlushQueue = [];
    var historicalValidateTurnId = null;
    var pendingValidationParsedRows = [];
    var pendingValidationParsedColumns = [];
    var pendingValidationTableRowIndices = [];

    function resetPendingValidationParsedRows(opts) {
        opts = opts || {};
        pendingValidationParsedRows = [];
        pendingValidationTableRowIndices = [];
        if (opts.clearColumns !== false) {
            pendingValidationParsedColumns = [];
        }
        if (opts.clearSnapshot !== false) {
            var snap = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
            snap.batchParsedRows = [];
            snap.batchParsedColumns = [];
            snap.batchParsedTableRowIndices = [];
        }
    }

    function appendPendingValidationParsedRows(rows, columns, opts) {
        opts = opts || {};
        rows = rows || [];
        if (!rows.length) return;
        if (columns && columns.length) {
            pendingValidationParsedColumns = columns.slice();
        } else if (typeof getTableColumns === 'function') {
            var tableCols = getTableColumns();
            if (tableCols && tableCols.length) pendingValidationParsedColumns = tableCols.slice();
        }
        var colCount = pendingValidationParsedColumns.length;
        if (opts.replace) {
            pendingValidationParsedRows = [];
            pendingValidationTableRowIndices = [];
        }
        var tableRowIndices = opts.tableRowIndices || null;
        var hasIndexMap = tableRowIndices && tableRowIndices.length === rows.length;
        rows.forEach(function (row, rowPos) {
            if (!row) return;
            var normalized = colCount
                ? pendingValidationParsedColumns.map(function (_, idx) {
                    return String(row[idx] != null ? row[idx] : '');
                })
                : row.map(function (cell) { return String(cell != null ? cell : ''); });
            if (!validationParsedRowHasCellContent(normalized, pendingValidationParsedColumns)) return;
            pendingValidationParsedRows.push(normalized);
            if (hasIndexMap && tableRowIndices[rowPos] != null && !isNaN(tableRowIndices[rowPos])) {
                pendingValidationTableRowIndices.push(parseInt(tableRowIndices[rowPos], 10));
            }
        });
    }

    function captureSingleBatchParsedRowsForValidation(meta) {
        meta = meta || {};
        var snap = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
        var cols = pendingValidationParsedColumns.length
            ? pendingValidationParsedColumns.slice()
            : (typeof getTableColumns === 'function' ? getTableColumns() : []);
        var bundle = filterValidationParsedRowsBundle(
            pendingValidationParsedRows,
            cols,
            pendingValidationTableRowIndices.length === pendingValidationParsedRows.length
                ? pendingValidationTableRowIndices
                : null
        );
        var rows = bundle.rows;
        var parsedTableRowIndices = bundle.tableRowIndices;
        var batchStart = meta.batchRowStart != null && !isNaN(meta.batchRowStart)
            ? Math.max(0, parseInt(meta.batchRowStart, 10))
            : Math.max(0, state.batchRowStart || snap.batchRowStart || 0);
        snap.batchParsedColumns = cols;
        snap.batchParsedRows = rows;
        snap.batchParsedTableRowIndices = parsedTableRowIndices.length === rows.length
            ? parsedTableRowIndices.slice()
            : [];
        if (rows.length) {
            snap.batchRowCount = rows.length;
            snap.batchRowStart = parsedTableRowIndices.length === rows.length
                ? parsedTableRowIndices[0]
                : batchStart;
            state.batchRowCount = rows.length;
            state.batchRowStart = snap.batchRowStart;
            if (global.tcGenBatchCore && global.tcGenBatchCore.state) {
                global.tcGenBatchCore.state.batchRowCount = rows.length;
                global.tcGenBatchCore.state.batchRowStart = snap.batchRowStart;
            }
        } else {
            snap.batchRowCount = 0;
            snap.batchRowStart = batchStart;
        }
        resetPendingValidationParsedRows({ clearColumns: false, clearSnapshot: false });
    }

    function finalizeSingleBatchValidationPayload(payload, batchMeta, mindmapBatch) {
        if (!payload || !payload.rows || !payload.rows.length) return null;
        batchMeta = batchMeta || {};
        var storedIndices = batchMeta.batchParsedTableRowIndices || payload.tableRowIndices || [];
        var rowCount = payload.rows.length;
        var indices = [];
        if (storedIndices.length === rowCount) {
            indices = storedIndices.slice();
        } else {
            var start = Math.max(0, batchMeta.batchRowStart || 0);
            for (var i = 0; i < rowCount; i++) indices.push(start + i);
        }
        payload.rowOffset = indices.length ? indices[0] : Math.max(0, batchMeta.batchRowStart || 0);
        payload.rowIndexMap = indices;
        payload.hasBatch = true;
        payload.currentDialogueBatch = true;
        payload.parseResultBatch = true;
        payload.parseRowCount = rowCount;
        if (mindmapBatch || isValidateMindmapBatch(batchMeta)) payload.mindmapBatch = true;
        return payload;
    }

    function buildValidationPayloadFromParsedSnapshot(snap, cols, batchMeta) {
        snap = snap || {};
        var parsedRows = snap.batchParsedRows || [];
        if (!parsedRows.length) return null;
        var useCols = (snap.batchParsedColumns && snap.batchParsedColumns.length)
            ? snap.batchParsedColumns.slice()
            : (cols || []).slice();
        var bundle = filterValidationParsedRowsBundle(
            parsedRows,
            useCols,
            snap.batchParsedTableRowIndices && snap.batchParsedTableRowIndices.length === parsedRows.length
                ? snap.batchParsedTableRowIndices
                : null
        );
        if (!bundle.rows.length) return null;
        return finalizeSingleBatchValidationPayload({
            columns: useCols,
            rows: bundle.rows,
            tableRowIndices: bundle.tableRowIndices,
            parseResultBatch: true
        }, Object.assign({}, batchMeta || snap, {
            batchParsedTableRowIndices: bundle.tableRowIndices
        }), isValidateMindmapBatch(batchMeta || snap));
    }

    global.tcResetValidationParsedRows = resetPendingValidationParsedRows;
    global.tcAppendValidationParsedRows = appendPendingValidationParsedRows;

    function cloneBatchSnapshot(snap) {
        snap = snap || {};
        return {
            batchRowStart: snap.batchRowStart || 0,
            batchRowCount: snap.batchRowCount || 0,
            batchId: snap.batchId || null,
            batchRequirements: snap.batchRequirements || '',
            batchUserContent: snap.batchUserContent || '',
            batchAiOutputText: snap.batchAiOutputText || '',
            batchRagContext: snap.batchRagContext || '',
            batchValidationKey: snap.batchValidationKey || '',
            batchParsedColumns: (snap.batchParsedColumns || []).slice(),
            batchParsedRows: (snap.batchParsedRows || []).map(function (row) {
                return row.slice();
            }),
            batchParsedTableRowIndices: (snap.batchParsedTableRowIndices || []).slice(),
            _batchTableLinked: snap._batchTableLinked !== false,
            _batchMode: snap._batchMode || 'list'
        };
    }

    function captureValidationBatchSnapshot(scope) {
        scope = normalizeValidateScope(scope);
        syncBatchStateFromCore();
        snapshotBatchForValidateScope(scope);
        vScopeData(scope).validationBatchSnapshot = cloneBatchSnapshot(vScopeData(scope).batchSnapshot);
    }

    function buildTurnScopedValidationKey(turnId) {
        turnId = String(turnId || '').trim();
        return turnId ? ('turn-' + turnId) : '';
    }

    function buildBatchValidationKey(snap) {
        snap = snap || {};
        var count = snap.batchRowCount || 0;
        if (count <= 0) return '';
        var start = snap.batchRowStart != null ? snap.batchRowStart : 0;
        var rowsKey = 'rows@' + start + '+' + count;
        var batchId = String(snap.batchId || '').trim();
        if (batchId) {
            return batchId + '@' + rowsKey;
        }
        return rowsKey;
    }

    function extractTurnIdFromScopedKey(key) {
        key = String(key || '').trim();
        if (key.indexOf('turn-') !== 0) return '';
        return key.slice(5).trim();
    }

    function bindPersistTurnIdToSnapshot(snap) {
        snap = snap || {};
        if (snap._persistTurnId) return String(snap._persistTurnId).trim();
        var keys = [];
        var snapKey = String(snap.batchValidationKey || '').trim();
        var batchKey = String(buildBatchValidationKey(snap)).trim();
        var tid = extractTurnIdFromScopedKey(snapKey) || extractTurnIdFromScopedKey(batchKey);
        if (tid) {
            snap._persistTurnId = tid;
            return tid;
        }
        var activeTurnId = resolveActiveTurnIdForPersist();
        if (activeTurnId) {
            snap._persistTurnId = activeTurnId;
            return activeTurnId;
        }
        if (batchKey) keys.push(batchKey);
        if (snapKey && keys.indexOf(snapKey) < 0) keys.push(snapKey);
        var i, key, cached;
        for (i = 0; i < keys.length; i++) {
            key = keys[i];
            cached = batchValidationCache[key];
            if (cached && cached.turnId) {
                snap._persistTurnId = String(cached.turnId).trim();
                return snap._persistTurnId;
            }
        }
        if (global.TcWorkbenchSession && typeof global.TcWorkbenchSession.getTurnIdForBatchKey === 'function') {
            for (i = 0; i < keys.length; i++) {
                tid = String(global.TcWorkbenchSession.getTurnIdForBatchKey(keys[i]) || '').trim();
                if (tid) {
                    snap._persistTurnId = tid;
                    return tid;
                }
            }
        }
        return '';
    }

    function resolvePersistedValidationKey(snap, turnId) {
        turnId = String(turnId || '').trim();
        if (turnId) return buildTurnScopedValidationKey(turnId);
        snap = snap || {};
        var key = String(snap.batchValidationKey || '').trim();
        if (!key) key = buildBatchValidationKey(snap);
        return key;
    }

    function migrateValidationCacheToTurn(sourceKey, turnId) {
        sourceKey = String(sourceKey || '').trim();
        turnId = String(turnId || '').trim();
        if (!turnId) return '';
        var turnKey = buildTurnScopedValidationKey(turnId);
        if (!turnKey) return '';
        if (sourceKey.indexOf('turn-') === 0 && sourceKey !== turnKey) {
            return turnKey;
        }
        var cached = sourceKey && sourceKey !== turnKey ? batchValidationCache[sourceKey] : null;
        if (cached) {
            batchValidationCache[turnKey] = {
                lastValidation: cached.lastValidation ? JSON.parse(JSON.stringify(cached.lastValidation)) : null,
                validateLlmReasoning: String(cached.validateLlmReasoning || ''),
                batchSnapshot: cloneBatchSnapshot(Object.assign({}, cached.batchSnapshot || {}, {
                    batchValidationKey: turnKey
                })),
                validateRequiredProfile: cached.validateRequiredProfile || null,
                turnId: turnId
            };
        } else if (batchValidationCache[turnKey]) {
            batchValidationCache[turnKey].turnId = turnId;
        }
        return turnKey;
    }

    function attachTurnIdToValidationCache(sourceKey, turnId) {
        sourceKey = String(sourceKey || '').trim();
        turnId = String(turnId || '').trim();
        if (!sourceKey || !turnId) return buildTurnScopedValidationKey(turnId);
        var turnKey = buildTurnScopedValidationKey(turnId);
        migrateValidationCacheToTurn(sourceKey, turnId);
        if (batchValidationCache[turnKey]) {
            batchValidationCache[turnKey].turnId = turnId;
        } else if (batchValidationCache[sourceKey]) {
            batchValidationCache[turnKey] = {
                lastValidation: batchValidationCache[sourceKey].lastValidation
                    ? JSON.parse(JSON.stringify(batchValidationCache[sourceKey].lastValidation)) : null,
                validateLlmReasoning: String(batchValidationCache[sourceKey].validateLlmReasoning || ''),
                batchSnapshot: cloneBatchSnapshot(Object.assign({}, batchValidationCache[sourceKey].batchSnapshot || {}, {
                    batchValidationKey: turnKey
                })),
                validateRequiredProfile: batchValidationCache[sourceKey].validateRequiredProfile || null,
                turnId: turnId
            };
        }
        var aliasKey = '';
        var snapForAlias = (batchValidationCache[turnKey] && batchValidationCache[turnKey].batchSnapshot) ||
            (batchValidationCache[sourceKey] && batchValidationCache[sourceKey].batchSnapshot) || null;
        if (snapForAlias) {
            snapForAlias._persistTurnId = turnId;
            aliasKey = buildBatchValidationKey(snapForAlias);
        }
        if (global.TcWorkbenchSession && typeof global.TcWorkbenchSession.registerTurnMapping === 'function') {
            global.TcWorkbenchSession.registerTurnMapping(turnId, null, sourceKey);
            global.TcWorkbenchSession.registerTurnMapping(turnId, null, turnKey);
            if (aliasKey && aliasKey !== sourceKey && aliasKey !== turnKey) {
                global.TcWorkbenchSession.registerTurnMapping(turnId, null, aliasKey);
            }
        }
        return turnKey;
    }

    function resolveTurnIdForPersist(batchKey, snap) {
        batchKey = String(batchKey || '').trim();
        snap = snap || {};
        if (snap._persistTurnId) return String(snap._persistTurnId).trim();
        bindPersistTurnIdToSnapshot(snap);
        if (snap._persistTurnId) return String(snap._persistTurnId).trim();
        return '';
    }

    function migrateBatchValidationCacheKey(scope, oldId, newId) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        oldId = String(oldId || '').trim();
        newId = String(newId || '').trim();
        if (!oldId || !newId || oldId === newId) return;
        syncBatchStateFromCore();
        snapshotBatchForValidateScope(scope);
        var snap = cloneBatchSnapshot(vScopeData(scope).batchSnapshot);
        snap.batchId = oldId;
        var oldKey = buildBatchValidationKey(snap);
        if (!oldKey || !batchValidationCache[oldKey]) {
            var suffix = '@' + (snap.batchRowStart || 0) + '+' + (snap.batchRowCount || 0);
            Object.keys(batchValidationCache).forEach(function (k) {
                if (k.indexOf('rows@') === 0 && k === buildBatchValidationKey(snap)) return;
                if (k.endsWith(suffix) && !batchValidationCache[oldKey]) oldKey = k;
            });
        }
        if (!oldKey || !batchValidationCache[oldKey]) return;
        snap.batchId = newId;
        var newKey = buildBatchValidationKey(snap);
        if (newKey === oldKey) return;
        batchValidationCache[newKey] = batchValidationCache[oldKey];
        batchValidationCache[newKey].batchSnapshot = cloneBatchSnapshot(
            Object.assign({}, batchValidationCache[newKey].batchSnapshot, { batchId: newId, batchValidationKey: newKey })
        );
        delete batchValidationCache[oldKey];
        var vData = vScopeData(scope);
        if (String(vData.batchSnapshot.batchValidationKey || '') === oldKey) {
            vData.batchSnapshot.batchValidationKey = newKey;
        }
    }

    function findBatchValidationCacheKey(scope, snap, turnId) {
        scope = normalizeValidateScope(scope);
        snap = snap || vScopeData(scope).batchSnapshot;
        turnId = String(turnId || (snap && snap.turnId) || '').trim();
        if (turnId) {
            var turnKey = buildTurnScopedValidationKey(turnId);
            if (turnKey && batchValidationCache[turnKey]) return turnKey;
        }
        var key = buildBatchValidationKey(snap);
        if (key && batchValidationCache[key]) {
            var hit = batchValidationCache[key];
            if (!turnId || !hit.turnId || String(hit.turnId) === turnId) return key;
        }
        var persisted = String(snap.batchValidationKey || '').trim();
        if (persisted && batchValidationCache[persisted]) {
            var hitPersisted = batchValidationCache[persisted];
            if (!turnId || !hitPersisted.turnId || String(hitPersisted.turnId) === turnId) return persisted;
        }
        if (turnId) return buildTurnScopedValidationKey(turnId);
        return key || persisted || '';
    }

    function getArchivedBatchValidationKey(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        syncBatchStateFromCore();
        snapshotBatchForValidateScope(scope);
        var snap = vScopeData(scope).batchSnapshot || {};
        var key = buildBatchValidationKey(snap);
        if (key && batchValidationCache[key]) return key;
        var draftKey = String(snap.batchValidationKey || '').trim();
        if (draftKey && draftKey.indexOf('turn-') !== 0 && batchValidationCache[draftKey]) return draftKey;
        return key || (draftKey.indexOf('turn-') === 0 ? '' : draftKey) || '';
    }

    function dispatchBatchValidationKeyReady(key, snap) {
        key = String(key || '').trim();
        if (!key) return;
        snap = snap || {};
        try {
            global.dispatchEvent(new CustomEvent('tc-gen-batch-validation-key-ready', {
                detail: {
                    key: key,
                    batchRowStart: snap.batchRowStart || 0,
                    batchRowCount: snap.batchRowCount || 0
                }
            }));
        } catch (e) { /* ignore */ }
    }

    function getCurrentBatchValidationKey(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        syncBatchStateFromCore();
        snapshotBatchForValidateScope(scope);
        return buildBatchValidationKey(vScopeData(scope).batchSnapshot);
    }

    function getValidationCacheTurnId() {
        if (!global.TcWorkbenchSession) return null;
        if (typeof global.TcWorkbenchSession.getCurrentTurnId === 'function') {
            var tid = String(global.TcWorkbenchSession.getCurrentTurnId() || '').trim();
            if (tid) return tid;
        }
        return null;
    }

    function resolveActiveTurnIdForPersist() {
        return getValidationCacheTurnId() || '';
    }

    function persistScopeValidationToSession(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (!vData.lastValidation) return '';
        var snap = cloneBatchSnapshot(vData.validationBatchSnapshot || vData.batchSnapshot);
        var draftKey = String(snap.batchValidationKey || '').trim();
        if (!draftKey) draftKey = buildBatchValidationKey(snap);
        var turnId = resolveTurnIdForPersistCache(snap, draftKey) || null;
        var key = resolvePersistedValidationKey(snap, turnId);
        if (!key) return '';
        snap.batchValidationKey = key;
        vData.batchSnapshot.batchValidationKey = key;
        batchValidationCache[key] = {
            lastValidation: JSON.parse(JSON.stringify(vData.lastValidation)),
            validateLlmReasoning: String(vData.validateLlmReasoning || ''),
            batchSnapshot: snap,
            validateRequiredProfile: state._validateRequiredProfile || null,
            turnId: turnId || null
        };
        if (!turnId) {
            queuePendingValidationFlush(key, snap, vData.lastValidation, vData.validateLlmReasoning);
        }
        dispatchBatchValidationKeyReady(key, snap);
        if (turnId && global.TcWorkbenchSession && typeof global.TcWorkbenchSession.onValidationCached === 'function') {
            global.TcWorkbenchSession.onValidationCached(key);
        }
        return key;
    }

    function clearBatchValidationCache() {
        Object.keys(batchValidationCache).forEach(function (k) {
            delete batchValidationCache[k];
        });
    }

    function persistSessionValidationBeforeLeave() {
                    }

    function hydrateSessionValidationFromTurns(turns, opts) {
        opts = opts || {};
                                        clearBatchValidationCache();
        historicalValidateTurnId = null;

        var planContext = String(opts.planContext || 'single').trim();
        var scope = VALIDATE_SCOPE_SINGLE;
        var lastKey = '';

        (turns || []).forEach(function (turn) {
            if (!turn || !turn.validation || typeof turn.validation !== 'object') return;
            var chain = turn.chain && typeof turn.chain === 'object' ? turn.chain : {};
            var batchKey = turn.id
                ? buildTurnScopedValidationKey(turn.id)
                : String(chain.batchValidationKey || '').trim();
            if (!batchKey && turn.batch_meta && turn.batch_meta.batchValidationKey) {
                batchKey = String(turn.batch_meta.batchValidationKey).trim();
            }
            if (!batchKey) batchKey = 'turn-' + String(turn.id || turn.turn_index || '');
            var snap = turn.batch_meta && typeof turn.batch_meta === 'object'
                ? cloneBatchSnapshot(turn.batch_meta)
                : {};
            snap.batchValidationKey = batchKey;
            batchValidationCache[batchKey] = {
                lastValidation: JSON.parse(JSON.stringify(turn.validation)),
                validateLlmReasoning: String(turn.validate_reasoning || ''),
                batchSnapshot: snap,
                validateRequiredProfile: null,
                turnId: turn.id || null
            };
            lastKey = batchKey;
        });

        if (lastKey) {
            /* 仅预热 batchValidationCache，勿把历史 turn 的 validation 覆盖到当前工作台状态 */
        }
                    }

    function persistBatchValidationToCache(scope, snapOverride) {
        scope = normalizeValidateScope(scope);
        if (scope !== VALIDATE_SCOPE_SINGLE) return '';
        var vData = vScopeData(scope);
        if (vData.standaloneQualityCheckSession) return '';
        if (!vData.lastValidation) return '';
        var normalized = normalizeValidationForDisplay(vData.lastValidation);
        if (!normalized) return '';
        if (!normalized.validate_run_id && vData.validateRunId) {
            normalized.validate_run_id = vData.validateRunId;
        }
        if (!normalized.validated_at) {
            normalized.validated_at = Date.now();
        }
        vData.lastValidation = normalized;
        var snap = snapOverride
            ? cloneBatchSnapshot(snapOverride)
            : cloneBatchSnapshot(vData.validationBatchSnapshot || vData.batchSnapshot);
        var draftKey = String(snap.batchValidationKey || '').trim();
        if (!draftKey) draftKey = buildBatchValidationKey(snap);
        var cacheTurnId = resolveTurnIdForPersistCache(snap, draftKey);
        var key = resolvePersistedValidationKey(snap, cacheTurnId);
        if (!key) return '';
        snap.batchValidationKey = key;
        vData.batchSnapshot.batchValidationKey = key;
        batchValidationCache[key] = {
            lastValidation: JSON.parse(JSON.stringify(vData.lastValidation)),
            validateLlmReasoning: String(vData.validateLlmReasoning || ''),
            batchSnapshot: snap,
            validateRequiredProfile: state._validateRequiredProfile || null,
            turnId: cacheTurnId || null
        };
        if (!cacheTurnId) {
            queuePendingValidationFlush(key, snap, vData.lastValidation, vData.validateLlmReasoning);
        }
        dispatchBatchValidationKeyReady(key, snap);
        if (cacheTurnId && global.TcWorkbenchSession && typeof global.TcWorkbenchSession.onValidationCached === 'function') {
            global.TcWorkbenchSession.onValidationCached(key);
        }
        return key;
    }

    function restoreBatchValidationFromCache(scope, batchKey) {
        scope = normalizeValidateScope(scope);
        batchKey = String(batchKey || '').trim();
        if (!batchKey) return false;
        var cached = batchValidationCache[batchKey];
        if (!cached || !cached.lastValidation) return false;
        var vData = vScopeData(scope);
        var normalized = normalizeValidationForDisplay(cached.lastValidation);
        if (!normalized) return false;
        vData.lastValidation = normalized;
        vData.validateLlmReasoning = String(cached.validateLlmReasoning || '');
        vData.batchSnapshot = cloneBatchSnapshot(cached.batchSnapshot);
        if (scope === VALIDATE_SCOPE_SINGLE && cached.validateRequiredProfile) {
            state._validateRequiredProfile = cached.validateRequiredProfile;
        }
        vData.locateValidateRowIndex = null;
        return true;
    }

    function switchDisplayedBatchValidation(scope, batchKey) {
        scope = normalizeValidateScope(scope);
        var key = String(batchKey || '').trim();
        if (!key) {
            key = getCurrentBatchValidationKey(scope);
        } else if (!batchValidationCache[key]) {
            var resolved = findBatchValidationCacheKey(scope, { batchValidationKey: key });
            if (resolved) key = resolved;
        }
        if (key && restoreBatchValidationFromCache(scope, key)) {
            var vData = vScopeData(scope);
            renderValidationIssues(vData.lastValidation, scope, {
                skipCoverageMerge: true,
                skipPersist: true,
                skipGenChatSync: true
            });
            syncValidationMatrixFromResult(vData.lastValidation, scope);
            return true;
        }
        return false;
    }

    function vScopeData(scope) {
        return validateScopeStore[normalizeValidateScope(scope)];
    }

    function vEl(baseId, scope) {
        return document.getElementById(baseId + '-' + normalizeValidateScope(scope));
    }

    function snapshotBatchForValidateScope(scope) {
        syncBatchStateFromCore();
        var snap = vScopeData(scope).batchSnapshot;
        snap.batchRowStart = state.batchRowStart || 0;
        snap.batchRowCount = state.batchRowCount || 0;
        snap.batchId = state.batchId || null;
        snap._batchTableLinked = state._batchTableLinked !== false;
        snap._batchMode = state._batchMode || 'list';
    }


    function getValidateBatchSnapshot(scope) {
        scope = normalizeValidateScope(scope);
        syncBatchStateFromCore();
        var snap = vScopeData(scope).batchSnapshot;
        return {
            batchRowStart: snap.batchRowStart || 0,
            batchRowCount: snap.batchRowCount || 0
        };
    }

    function extendValidateBatchSnapshot(scope, addCount) {
        scope = normalizeValidateScope(scope);
        addCount = parseInt(addCount, 10) || 0;
        if (addCount <= 0) return;
        syncBatchStateFromCore();
        var snap = vScopeData(scope).batchSnapshot;
        snap.batchRowCount = (snap.batchRowCount || 0) + addCount;
        state.batchRowCount = snap.batchRowCount;
        if (global.tcGenBatchCore && global.tcGenBatchCore.state) {
            global.tcGenBatchCore.state.batchRowCount = snap.batchRowCount;
        }
    }

    function collectMindmapNodesForValidation() {
        var nodes = [];
        if (typeof buildTcMindmapMindData !== 'function') return nodes;
        var mind;
        try {
            mind = buildTcMindmapMindData();
        } catch (e0) {
            return nodes;
        }
        if (!mind || !mind.data) return nodes;
        function walk(node, parentPath) {
            if (!node) return;
            var topic = String(node.topic != null ? node.topic : '').trim();
            nodes.push({ topic: topic, path: parentPath || '' });
            var nextPath = parentPath ? (parentPath + ' / ' + topic) : topic;
            (node.children || []).forEach(function (child) {
                walk(child, nextPath);
            });
        }
        walk(mind.data, '');
        return nodes;
    }

    function collectMindmapBatchRowsForValidation(snap, cols) {
        var mmRows = getMindmapCasesRows();
        var start = Math.max(0, snap.batchRowStart || 0);
        var count = Math.max(0, snap.batchRowCount || 0);
        var end = Math.min(mmRows.length, start + count);
        var sliced = mmRows.slice(start, end);
        var rows = sliced.map(function (row) {
            return cols.map(function (_, i) { return String(row[i] != null ? row[i] : ''); });
        });
        var indices = [];
        for (var i = start; i < end; i++) indices.push(i);
        return {
            columns: cols,
            rows: rows,
            rowOffset: start,
            rowIndexMap: indices,
            hasBatch: true,
            mindmapBatch: true,
            currentDialogueBatch: true
        };
    }

    function collectCurrentDialogueBatchSlice(snap, cols, base, mindmapBatch) {
        if (!snap || !(snap.batchRowCount > 0)) return null;
        if (mindmapBatch) {
            var mmPayload = collectMindmapBatchRowsForValidation(snap, cols);
            return (mmPayload && mmPayload.rows && mmPayload.rows.length) ? mmPayload : null;
        }
        var allRows = (base && base.rows) || [];
        var start = Math.max(0, snap.batchRowStart || 0);
        var end = Math.min(allRows.length, start + snap.batchRowCount);
        if (end <= start) return null;
        var sliced = allRows.slice(start, end);
        var indices = [];
        for (var i = start; i < end; i++) indices.push(i);
        return {
            columns: cols,
            rows: sliced,
            rowOffset: start,
            rowIndexMap: indices,
            hasBatch: true,
            currentDialogueBatch: true
        };
    }

    function getValidationScopeContext() {
        var sessionId = '';
        if (global.TcWorkbenchSession &&
            typeof global.TcWorkbenchSession.getCurrentSessionId === 'function') {
            sessionId = String(global.TcWorkbenchSession.getCurrentSessionId() || '').trim();
        }
        var lanhuUrl = '';
        if (typeof global.tcResolveValidationScopeLanhuUrl === 'function') {
            lanhuUrl = String(global.tcResolveValidationScopeLanhuUrl() || '').trim();
        }
        return { sessionId: sessionId, lanhuUrl: lanhuUrl };
    }

    function collectSingleParsedBatchPayloadForValidation(snap, cols) {
        snap = snap || {};
        cols = cols || [];
        if (pendingValidationParsedRows.length) {
            return buildValidationPayloadFromParsedSnapshot({
                batchParsedColumns: pendingValidationParsedColumns.length
                    ? pendingValidationParsedColumns
                    : cols,
                batchParsedRows: pendingValidationParsedRows,
                batchParsedTableRowIndices: pendingValidationTableRowIndices.length === pendingValidationParsedRows.length
                    ? pendingValidationTableRowIndices.slice()
                    : [],
                batchRowStart: snap.batchRowStart,
                batchRowCount: pendingValidationParsedRows.length,
                _batchMode: snap._batchMode
            }, cols, snap);
        }
        if (snap.batchParsedRows && snap.batchParsedRows.length) {
            return buildValidationPayloadFromParsedSnapshot(snap, cols, snap);
        }
        return null;
    }

    function collectMindmapLlmPayloadForValidation(scope, snap, cols) {
        snap = snap || {};
        cols = cols || [];
        var mmPayload = collectMindmapBatchRowsForValidation(snap, cols);
        if (!mmPayload || !mmPayload.rows || !mmPayload.rows.length) {
            mmPayload = buildValidationPayloadFromParsedSnapshot(snap, cols, snap);
        }
        if (!mmPayload || !mmPayload.rows || !mmPayload.rows.length) return null;
        mmPayload.parseResultBatch = true;
        mmPayload.mindmapBatch = true;
        mmPayload.currentDialogueBatch = true;
        return finalizeSingleBatchValidationPayload(mmPayload, snap, true);
    }

    function collectParseBatchPayloadForLlmValidation(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        if (scope !== VALIDATE_SCOPE_SINGLE) return null;
        var snap = vScopeData(scope).batchSnapshot;
        var cols = pendingValidationParsedColumns.length
            ? pendingValidationParsedColumns.slice()
            : (snap.batchParsedColumns && snap.batchParsedColumns.length
                ? snap.batchParsedColumns.slice()
                : (typeof getTableColumns === 'function' ? getTableColumns() : []));
        if (isValidateMindmapBatch(snap)) {
            return collectMindmapLlmPayloadForValidation(scope, snap, cols);
        }
        var payload = collectSingleParsedBatchPayloadForValidation(snap, cols);
        if (!payload || !payload.parseResultBatch || !payload.rows || !payload.rows.length) {
            return null;
        }
        return payload;
    }

    function collectStandaloneTablePayloadForValidation() {
        var base = collectRowsPayloadForValidation();
        var cols = base.columns || [];
        var rows = [];
        var indices = [];
        (base.rows || []).forEach(function (row, idx) {
            var normalized = cols.length
                ? cols.map(function (_, cidx) { return String(row[cidx] != null ? row[cidx] : ''); })
                : (row || []).map(function (cell) { return String(cell != null ? cell : ''); });
            var hasContent = false;
            if (typeof global.tcTableRowHasCaseContent === 'function') {
                hasContent = global.tcTableRowHasCaseContent(normalized);
            } else {
                hasContent = validationParsedRowHasCellContent(normalized, cols);
            }
            if (!hasContent) return;
            rows.push(normalized);
            indices.push(idx);
        });
        return {
            columns: cols,
            rows: rows,
            rowIndexMap: indices,
            standalonePage: true,
            hasBatch: false,
            parseResultBatch: false
        };
    }

    function collectBatchRowsPayloadForValidation(scope) {
        scope = normalizeValidateScope(scope);
        var snap = vScopeData(scope).batchSnapshot;
        var mindmapBatch = isValidateMindmapBatch(snap);
        var base = collectRowsPayloadForValidation();
        var cols = base.columns || [];

        if (scope === VALIDATE_SCOPE_SINGLE) {
            var parsedPayload = collectSingleParsedBatchPayloadForValidation(snap, cols);
            if (parsedPayload) return parsedPayload;
            return { columns: cols, rows: [], rowOffset: 0, hasBatch: false, parseResultBatch: true };
        }

        if (!snap.batchRowCount || snap.batchRowCount <= 0) {
            return { columns: cols, rows: [], rowOffset: 0, hasBatch: false };
        }
        if (mindmapBatch) {
            return collectMindmapBatchRowsForValidation(snap, cols);
        }
        var allRows = base.rows || [];
        var start = Math.max(0, snap.batchRowStart || 0);
        var end = start + snap.batchRowCount;
        var sliced = allRows.slice(start, end);
        var indices = [];
        for (var i = start; i < end; i++) indices.push(i);
        return {
            columns: cols,
            rows: sliced,
            rowOffset: start,
            rowIndexMap: indices,
            hasBatch: true
        };
    }

    function remapValidationIssueList(issues, rowOffset) {
        if (!rowOffset) return issues || [];
        return (issues || []).map(function (issue) {
            if (!issue || issue.row_index == null) return issue;
            return {
                row_index: issue.row_index + rowOffset,
                type: issue.type,
                message: issue.message
            };
        });
    }

    function remapValidationIssueListWithMap(issues, rowIndexMap) {
        rowIndexMap = rowIndexMap || [];
        return (issues || []).map(function (issue) {
            if (!issue || issue.row_index == null) return issue;
            var tableIdx = rowIndexMap[issue.row_index];
            if (tableIdx == null) tableIdx = issue.row_index;
            return {
                row_index: tableIdx,
                type: issue.type,
                message: issue.message
            };
        });
    }

    function remapValidationRowIndices(result, rowOffset) {
        if (!result || !rowOffset) return result;
        var merged = {};
        Object.keys(result).forEach(function (k) { merged[k] = result[k]; });
        merged.issues = remapValidationIssueList(result.issues, rowOffset);
        merged.over_generated_issues = remapValidationIssueList(result.over_generated_issues, rowOffset);
        merged.gap_issues = remapValidationIssueList(result.gap_issues, rowOffset);
        return merged;
    }

    function remapValidationRowIndicesWithMap(result, rowIndexMap) {
        if (!result || !rowIndexMap || !rowIndexMap.length) return result;
        var merged = {};
        Object.keys(result).forEach(function (k) { merged[k] = result[k]; });
        merged.issues = remapValidationIssueListWithMap(result.issues, rowIndexMap);
        merged.over_generated_issues = remapValidationIssueListWithMap(result.over_generated_issues, rowIndexMap);
        merged.gap_issues = remapValidationIssueListWithMap(result.gap_issues, rowIndexMap);
        return merged;
    }

    function remapValidationResultRows(result, batchPayload) {
        batchPayload = batchPayload || {};
        if (batchPayload.rowIndexMap && batchPayload.rowIndexMap.length) {
            return remapValidationRowIndicesWithMap(result, batchPayload.rowIndexMap);
        }
        return remapValidationRowIndices(result, batchPayload.rowOffset || 0);
    }

    function isRagOn() {
        if (typeof global.isTcRagEnabled === 'function') return global.isTcRagEnabled();
        var el = $('tc-rag-enabled');
        return !!(el && el.checked);
    }

    function getAiMode() {
        if (typeof global.getAiConfigMode === 'function') return global.getAiConfigMode();
        return 'preset';
    }

    function fetchJson(url, opts) {
        opts = opts || {};
        if (opts.credentials == null) opts.credentials = 'same-origin';
        if (opts.body && !opts.headers) {
            opts.headers = { 'Content-Type': 'application/json' };
        }
        return fetch(url, opts).then(function (r) {
            return r.json().catch(function () { return { error: 'HTTP ' + r.status }; }).then(function (d) {
                if (!r.ok && d && d.error) throw new Error(d.error);
                if (!r.ok) throw new Error('请求失败 HTTP ' + r.status);
                return d;
            });
        });
    }

    function fetchJsonWithTimeout(url, opts, timeoutMs) {
        var ms = timeoutMs || 90000;
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = ctrl ? window.setTimeout(function () { ctrl.abort(); }, ms) : null;
        opts = opts || {};
        if (ctrl) opts.signal = ctrl.signal;
        return fetchJson(url, opts).finally(function () {
            if (timer) window.clearTimeout(timer);
        });
    }

    function isLocalBatchId() {
        return !state.batchId || String(state.batchId).indexOf('local-') === 0;
    }

    function isBatchRow(idx) {
        if (!state.batchRowCount) return false;
        return idx >= state.batchRowStart && idx < state.batchRowStart + state.batchRowCount;
    }

    function syncGenBatchCoreState() {
        var core = global.tcGenBatchCore;
        if (!core || !core.state) return;
        var cs = core.state;
        cs.batchId = state.batchId;
        cs.batchRowStart = state.batchRowStart;
        cs.batchRowCount = state.batchRowCount;
        cs.batchMode = state._batchMode || 'list';
    }

    function getGenBatchCoreState() {
        var core = global.tcGenBatchCore;
        return core && core.state ? core.state : null;
    }

    function isMindmapBatchActive(st) {
        st = st || getGenBatchCoreState();
        return !!(st && st.batchMode === 'mindmap' && st.batchId && st.batchRowCount);
    }

    function isMindmapBatchRow(idx, st) {
        st = st || getGenBatchCoreState();
        if (!st || !st.batchRowCount) return false;
        return idx >= st.batchRowStart && idx < st.batchRowStart + st.batchRowCount;
    }


    function isValidateMindmapBatch(snap) {
        syncBatchStateFromCore();
        if (state._validateRequiredProfile === 'mindmap') return true;
        if (isMindmapBatchActive()) return true;
        if (state._batchMode === 'mindmap') return true;
        if (snap && snap._batchMode === 'mindmap') return true;
        return false;
    }

    function getMindmapCasesRows() {
        if (typeof global.tcMindmapCasesData !== 'undefined' && global.tcMindmapCasesData) {
            return global.tcMindmapCasesData;
        }
        if (typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData) {
            return tcMindmapCasesData;
        }
        return [];
    }

    function clearValidateLocateMindmapClasses() {
        document.querySelectorAll('.tc-mindmap-validate-locate-active, .tc-mindmap-validate-flash-on').forEach(function (el) {
            el.classList.remove('tc-mindmap-validate-locate-active', 'tc-mindmap-validate-flash-on');
        });
    }

    function findMindmapLeafNodeDom(rowIndex) {
        var uid = 'tc_leaf_' + rowIndex;
        if (window.TcSmmEditor && typeof TcSmmEditor.findNodeDomByUid === 'function') {
            return TcSmmEditor.findNodeDomByUid(uid);
        }
        return null;
    }

    function flashValidateLocateMindmapNode(nodeEl) {
        if (!nodeEl) return;
        nodeEl.classList.add('tc-mindmap-validate-locate-active');
        nodeEl.classList.remove('tc-mindmap-validate-flash-on');
        var cycles = 3;
        var stepIndex = 0;
        function step() {
            if (!nodeEl.isConnected) return;
            if (stepIndex >= cycles * 2) {
                nodeEl.classList.remove('tc-mindmap-validate-flash-on');
                return;
            }
            if (stepIndex % 2 === 0) nodeEl.classList.add('tc-mindmap-validate-flash-on');
            else nodeEl.classList.remove('tc-mindmap-validate-flash-on');
            stepIndex += 1;
            window.setTimeout(step, stepIndex % 2 === 1 ? 320 : 180);
        }
        step();
    }

    function applyValidateMindmapRowLocate(rowIndex, attempt) {
        attempt = attempt || 0;
        var maxAttempts = 24;
        var uid = 'tc_leaf_' + rowIndex;
        var nodeEl = findMindmapLeafNodeDom(rowIndex);
        if (nodeEl) {
            if (window.TcSmmEditor && typeof TcSmmEditor.focusNode === 'function') {
                TcSmmEditor.focusNode(uid);
            } else if (typeof global.tcMindmapFocusNodeById === 'function') {
                global.tcMindmapFocusNodeById(uid, { delay: 0 });
            }
            flashValidateLocateMindmapNode(nodeEl);
            return true;
        }
        if (attempt < maxAttempts) {
            window.setTimeout(function () {
                applyValidateMindmapRowLocate(rowIndex, attempt + 1);
            }, attempt < 4 ? 80 : 120);
            return false;
        }
        if (typeof global.tcAppToast === 'function') {
            global.tcAppToast('无法定位：第 ' + (rowIndex + 1) + ' 条用例不在当前导图中', { variant: 'warning', duration: 3200 });
        }
        return false;
    }

    function highlightValidateMindmapRow(rowIndex, scope) {
        rowIndex = parseInt(rowIndex, 10);
        if (isNaN(rowIndex)) return;
        var mmRows = getMindmapCasesRows();
        if (rowIndex < 0 || rowIndex >= mmRows.length) {
            if (typeof global.tcAppToast === 'function') {
                global.tcAppToast('无法定位：第 ' + (rowIndex + 1) + ' 条用例不在当前导图中', { variant: 'warning', duration: 3200 });
            }
            return;
        }
        document.querySelectorAll('#table-body tr.tc-row-validate-locate-active').forEach(function (tr) {
            tr.classList.remove('tc-row-validate-locate-active');
        });
        clearValidateLocateMindmapClasses();
        if (typeof global.switchTcRightView === 'function') global.switchTcRightView('mindmap');
        var alreadyOnMindmap = typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap';
        var delay = alreadyOnMindmap && findMindmapLeafNodeDom(rowIndex) ? 60 : 180;
        window.setTimeout(function () {
            applyValidateMindmapRowLocate(rowIndex, 0);
        }, delay);
    }


/* ---- tc_wb_gen_batch.js ---- */
    /* ---------- 生成批次与校验辅助 ---------- */

    function findWorkbenchTableRowEl(rowIndex) {
        if (rowIndex == null || isNaN(rowIndex)) return null;
        var idx = parseInt(rowIndex, 10);
        var legacy = document.querySelector('#table-body tr[data-row-index="' + idx + '"]');
        if (legacy) return legacy;
        var mount = document.getElementById('tc-vxe-table-mount');
        if (!mount) return null;
        return mount.querySelector('.vxe-body--row[rowid="r' + idx + '"]');
    }

    function clearValidateLocateRowClasses() {
        document.querySelectorAll('.tc-row-validate-locate-active, .tc-row-validate-flash-on, .tc-row-validate-flash').forEach(function (el) {
            el.classList.remove('tc-row-validate-locate-active', 'tc-row-validate-flash-on', 'tc-row-validate-flash');
        });
        if (typeof clearValidateLocateMindmapClasses === 'function') clearValidateLocateMindmapClasses();
    }

    function resolveTableScrollFn() {
        if (global.TcTableView && typeof global.TcTableView.scrollToRow === 'function') {
            return function (idx) { return global.TcTableView.scrollToRow(idx); };
        }
        if (global.TcTableBridge && typeof global.TcTableBridge.scrollToRow === 'function') {
            return function (idx) { return global.TcTableBridge.scrollToRow(idx); };
        }
        return null;
    }

    function flashValidateLocateRow(rowEl) {
        if (!rowEl) return;
        rowEl.classList.add('tc-row-validate-locate-active');
        rowEl.classList.remove('tc-row-validate-flash', 'tc-row-validate-flash-on');
        var cycles = 3;
        var stepIndex = 0;
        function step() {
            if (stepIndex >= cycles * 2) {
                rowEl.classList.remove('tc-row-validate-flash-on');
                return;
            }
            if (stepIndex % 2 === 0) rowEl.classList.add('tc-row-validate-flash-on');
            else rowEl.classList.remove('tc-row-validate-flash-on');
            stepIndex += 1;
            window.setTimeout(step, stepIndex % 2 === 1 ? 320 : 180);
        }
        step();
    }

    function applyValidateRowLocate(rowIndex) {
        var rowEl = findWorkbenchTableRowEl(rowIndex);
        if (!rowEl) return false;
        clearValidateLocateRowClasses();
        flashValidateLocateRow(rowEl);
        return true;
    }

        function syncRowHighlight() {
        if (isMindmapBatchActive()) return;
        document.querySelectorAll('#table-body tr[data-row-index]').forEach(function (tr) {
            tr.classList.remove('tc-row-validate-issue');
        });
        [VALIDATE_SCOPE_SINGLE].forEach(function (scopeKey) {
            var vData = vScopeData(scopeKey);
            document.querySelectorAll('.tc-row-validate-issue').forEach(function (el) {
                el.classList.remove('tc-row-validate-issue');
            });
            var allIssues = [];
            if (vData.lastValidation) {
                allIssues = (vData.lastValidation.issues || [])
                    .concat(vData.lastValidation.over_generated_issues || [])
                    .concat(vData.lastValidation.gap_issues || []);
            }
            allIssues.forEach(function (issue) {
                if (issue.row_index == null) return;
                var tr = findWorkbenchTableRowEl(issue.row_index);
                if (tr) tr.classList.add('tc-row-validate-issue');
            });
            if (vData.locateValidateRowIndex != null) {
                var activeTr = findWorkbenchTableRowEl(vData.locateValidateRowIndex);
                if (activeTr) activeTr.classList.add('tc-row-validate-locate-active');
            }
        });
    }

    function highlightValidateRow(rowIndex, scope) {
        scope = normalizeValidateScope(scope);
        if (rowIndex == null || isNaN(rowIndex)) return;
        var vData = vScopeData(scope);
        vData.locateValidateRowIndex = rowIndex;
        document.querySelectorAll('.tc-validate-drawer--scope-' + scope + ' .tc-validate-issue--active').forEach(function (el) {
            el.classList.remove('tc-validate-issue--active');
        });
        var drawer = vEl('tc-validate-drawer', scope);
        var locateBtn = drawer
            ? drawer.querySelector('.tc-validate-locate[data-row="' + rowIndex + '"]')
            : null;
        if (locateBtn) {
            var issueEl = locateBtn.closest('.tc-validate-issue');
            if (issueEl) issueEl.classList.add('tc-validate-issue--active');
        }
        if (isValidateMindmapBatch(vData.batchSnapshot)) {
            highlightValidateMindmapRow(rowIndex, scope);
            return;
        }
        clearValidateLocateRowClasses();
        if (typeof global.switchTcRightView === 'function') global.switchTcRightView('table');
        var scrollFn = resolveTableScrollFn();
        var finalizeLocate = function () {
            window.requestAnimationFrame(function () {
                if (!applyValidateRowLocate(rowIndex) && typeof global.tcAppToast === 'function') {
                    global.tcAppToast('请在表格中查看第 ' + (rowIndex + 1) + ' 行', { variant: 'info', duration: 3500 });
                }
            });
        };
        if (scrollFn) {
            scrollFn(rowIndex).then(finalizeLocate);
            return;
        }
        var rowEl = findWorkbenchTableRowEl(rowIndex);
        if (!rowEl) {
            if (typeof global.tcAppToast === 'function') {
                global.tcAppToast('请在表格中查看第 ' + (rowIndex + 1) + ' 行', { variant: 'info', duration: 3500 });
            }
            return;
        }
        if (typeof rowEl.scrollIntoView === 'function') {
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        applyValidateRowLocate(rowIndex);
    }

        function onGenerationSuccess(meta) {
        ensureInit();
        meta = meta || {};
        var rowCount = meta.rowCount || 0;
        if (rowCount <= 0) return;
        var batchMode = meta.outputTarget === 'mindmap' ? 'mindmap' : 'list';
        var tableLinked = batchMode !== 'mindmap';

        if (typeof global.tcShowGenBatchBar === 'function') {
            global.tcShowGenBatchBar(rowCount, batchMode);
        } else {
            showGenBatchInfo(rowCount, batchMode);
        }
        var mindmapLen = (typeof global.tcMindmapCasesData !== 'undefined' && global.tcMindmapCasesData)
            ? global.tcMindmapCasesData.length : 0;
        state.batchRowStart = tableLinked
            ? (typeof tcResolveListGenerationBatchStart === 'function'
                ? tcResolveListGenerationBatchStart(rowCount)
                : Math.max(0, getTableRows().length - rowCount))
            : Math.max(0, mindmapLen - rowCount);
        if (meta.batchRowStart != null && !isNaN(meta.batchRowStart)) {
            state.batchRowStart = Math.max(0, parseInt(meta.batchRowStart, 10));
        }
        state._batchTableLinked = tableLinked;
        state.batchId = 'local-' + Date.now();
        state.batchRowCount = rowCount;
        if (global.tcGenBatchCore && global.tcGenBatchCore.state) {
            global.tcGenBatchCore.state.batchId = state.batchId;
            global.tcGenBatchCore.state.batchRowStart = state.batchRowStart;
            global.tcGenBatchCore.state.batchRowCount = rowCount;
            global.tcGenBatchCore.state.batchMode = batchMode;
        }
        state._batchMode = batchMode;
        state._batchTableLinked = tableLinked;
        syncGenBatchCoreState();
        state._batchAiMode = getAiMode();
        state._batchRagUsed = isRagOn();
        state._batchCreatedAt = new Date().toISOString();
        state.lastRequirements = meta.requirements || state.lastRequirements || '';
        var validateScope = VALIDATE_SCOPE_SINGLE;
        if (meta.scope === 'agent_pipeline') {
            resetValidateTaskState(validateScope, { clearCoverage: true });
        }
        snapshotBatchForValidateScope(validateScope);
        vScopeData(validateScope).validationBatchSnapshot = cloneBatchSnapshot(vScopeData(validateScope).batchSnapshot);
        captureSingleBatchParsedRowsForValidation(meta);
        captureSingleBatchRequirementsForValidation();
        captureSingleBatchUserContentForValidation(meta);
        captureSingleBatchAiOutputForValidation();
        captureSingleBatchRagContextForValidation(meta);

        window.setTimeout(function () {
            if (!shouldRunSingleAutoValidateAfterGeneration(meta)) {
                if (typeof window.scheduleReleaseWorkbenchInteractionLocks === 'function') {
                    window.scheduleReleaseWorkbenchInteractionLocks();
                } else if (typeof window.releaseWorkbenchInteractionLocks === 'function') {
                    window.releaseWorkbenchInteractionLocks();
                }
            }
        }, 0);

    }

    function onBatchClose() {
        state.batchId = null;
        state.batchRowCount = 0;
    }

    function showGenBatchInfo(rowCount, batchMode) {
        // "本次生成"横幅不再展示
    }

    function syncBatchStateFromCore() {
        var core = global.tcGenBatchCore;
        if (!core || !core.state) return;
        var cs = core.state;
        state.batchId = cs.batchId;
        state.batchRowStart = cs.batchRowStart;
        state.batchRowCount = cs.batchRowCount;
        if (cs.batchMode) {
            state._batchMode = cs.batchMode;
            state._batchTableLinked = cs.batchMode !== 'mindmap';
        }
    }

    function isLanhuReadyForValidation() {
        if (typeof global.getTcLanhuCredentialsForMode !== 'function' || typeof global.getAiConfigMode !== 'function') {
            return false;
        }
        var creds = global.getTcLanhuCredentialsForMode(global.getAiConfigMode());
        return !!(creds && creds.cookie && creds.url);
    }

    function fetchLanhuRequirementsForValidation() {
        if (!isLanhuReadyForValidation()) return Promise.resolve('');
        var creds = global.getTcLanhuCredentialsForMode(global.getAiConfigMode());
        if (typeof global.fetchTcLanhuRequirementsSummary !== 'function') return Promise.resolve('');
        return global.fetchTcLanhuRequirementsSummary(creds.cookie, creds.url);
    }

    function isValidateUseLlmEnabled() {
        return true;
    }

    function isSingleGenAutoValidateBlocked(meta) {
        meta = meta || {};
        if (meta.skipAutoValidate) return true;
        if (meta.quickPlanModuleGen && meta.autoValidate === true) return false;
        if (typeof global.TcAgentOrchestrator !== 'undefined') {
            if (typeof global.TcAgentOrchestrator.isAgentJobRunning === 'function' &&
                global.TcAgentOrchestrator.isAgentJobRunning()) {
                return true;
            }
            if (typeof global.TcAgentOrchestrator.isAgentPostStepsRunning === 'function' &&
                global.TcAgentOrchestrator.isAgentPostStepsRunning()) {
                return true;
            }
            if (typeof global.TcAgentOrchestrator.isAgentModeEnabled === 'function' &&
                global.TcAgentOrchestrator.isAgentModeEnabled()) {
                return true;
            }
        }
        return false;
    }

    function captureGenAutoValidateForTask() {
        if (typeof global.tcCaptureGenAutoValidateForTask === 'function') {
            return !!global.tcCaptureGenAutoValidateForTask();
        }
        var el = $('tc-gen-auto-validate');
        return !!(el && el.checked);
    }

    function isGenChatPipelineFailed() {
        return !!(global.TcGenChatPipeline && typeof global.TcGenChatPipeline.isFailed === 'function' &&
            global.TcGenChatPipeline.isFailed());
    }

    function shouldRunSingleAutoValidateAfterGeneration(meta) {
        meta = meta || {};
        if (isGenChatPipelineFailed()) return false;
        if (meta.skipAutoValidate) return false;
        var autoValidate = meta.autoValidate === true;
        if (!autoValidate) return false;
        return !isSingleGenAutoValidateBlocked(meta);
    }

    function isAutoValidateFormatEnabled() {
        if (typeof global.TcAgentOrchestrator !== 'undefined' &&
            typeof global.TcAgentOrchestrator.isAgentModeEnabled === 'function' &&
            global.TcAgentOrchestrator.isAgentModeEnabled()) {
            return false;
        }
        var gen = $('tc-gen-auto-validate');
        return !!(gen && gen.checked);
    }

    function syncAutoValidateCheckboxes(source) {
        var gen = $('tc-gen-auto-validate');
        var panel = $('tc-auto-validate-enabled');
        if (!gen || !panel) return;
        if (source === 'gen') panel.checked = gen.checked;
        else if (source === 'panel') gen.checked = panel.checked;
    }

    function resetGenAutoValidateToggleDefault() {
        var autoVal = $('tc-gen-auto-validate');
        var autoBtn = $('tc-gen-auto-validate-btn');
        var panel = $('tc-auto-validate-enabled');
        if (autoVal) autoVal.checked = false;
        if (panel) panel.checked = false;
        if (autoBtn) {
            autoBtn.classList.remove('tc-gen-toggle-btn--on', 'tc-gen-toggle-btn--locked');
            autoBtn.classList.add('tc-gen-toggle-btn--off');
            autoBtn.setAttribute('aria-pressed', 'false');
        }
    }

    function shouldUseLanhuRequirementsForValidation() {
        if (typeof global.tcResolveValidationScopeLanhuUrl === 'function') {
            if (!String(global.tcResolveValidationScopeLanhuUrl() || '').trim()) {
                return false;
            }
        } else if (global.tcActiveGenerationLanhuReferenced) {
            if (!String(global.tcActiveGenerationLanhuUrl || '').trim()) {
                return false;
            }
        }
        return isLanhuReadyForValidation();
    }

    function resolveRequirementsForValidationBody(requirementsOverride) {
        if (!shouldUseLanhuRequirementsForValidation()) {
            return '';
        }
        if (requirementsOverride != null) {
            return String(requirementsOverride || '').trim();
        }
        return String(state.lastLanhuRequirements || state.lastRequirements || '').trim();
    }

    function filterLlmIssuesToParsedRowCount(issues, rowCount) {
        rowCount = Math.max(0, parseInt(rowCount, 10) || 0);
        if (!rowCount) return [];
        return (issues || []).filter(function (issue) {
            if (!issue) return false;
            if (issue.type === 'gap' && (issue.row_index == null || issue.row_index === '')) return true;
            if (issue.row_index == null || issue.row_index === '') return false;
            var ri = parseInt(issue.row_index, 10);
            if (isNaN(ri)) return false;
            return ri >= 0 && ri < rowCount;
        });
    }

    function sanitizeLlmResultForParseBatch(llmResult, batchPayload) {
        if (!llmResult || !batchPayload || !batchPayload.parseResultBatch) return llmResult;
        var rowCount = (batchPayload.rows || []).length;
        if (!rowCount) return Object.assign({}, llmResult, { issues: [] });
        var next = Object.assign({}, llmResult);
        next.issues = filterLlmIssuesToParsedRowCount(llmResult.issues || [], rowCount);
        return next;
    }

    function buildValidationRequestBody(payload, useLlm, formatCheck, requirementsOverride, llmScopeHint, userContentOverride) {
        var requirements = resolveRequirementsForValidationBody(requirementsOverride);
        var userContent = userContentOverride != null
            ? String(userContentOverride || '').trim()
            : resolveValidationUserContent();
        var body = {
            columns: payload.columns,
            rows: payload.rows,
            requirements: requirements,
            use_llm: !!useLlm,
            format_check: formatCheck !== false,
            use_builtin: getAiMode() === 'preset',
            batch_id: state.batchId && !isLocalBatchId() ? state.batchId : null
        };
        if (userContent) body.user_content = userContent;
        var tplId = (typeof global.getTcActiveTemplateId === 'function') ? global.getTcActiveTemplateId() : '';
        if (!tplId && typeof global.tcActiveTemplateId !== 'undefined' && global.tcActiveTemplateId) {
            tplId = String(global.tcActiveTemplateId);
        }
        if (tplId) body.template_id = String(tplId);
        if (llmScopeHint) body.llm_scope_hint = String(llmScopeHint);
        if (payload && payload.standalonePage) {
            body.validation_context = 'standalone_page';
            body.llm_scope_hint = llmScopeHint || 'full_table';
            body.batch_id = null;
        } else if (payload && payload.parseResultBatch) {
            body.validation_context = 'parse_batch';
            body.llm_scope_hint = 'current_batch';
            body.parse_row_count = (payload.rows || []).length;
        }
        var reqProfile = state._validateRequiredProfile;
        if (!reqProfile && isValidateMindmapBatch()) reqProfile = 'mindmap';
        if (reqProfile === 'mindmap') {
            body.required_profile = 'mindmap';
            body.validation_context = 'mindmap_batch';
            var aiText = payload && payload.aiOutputText != null
                ? String(payload.aiOutputText || '').trim()
                : '';
            if (!aiText) {
                var snapMm = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
                aiText = String((snapMm && snapMm.batchAiOutputText) || '').trim();
            }
            if (!aiText) aiText = resolveGenerationStreamTextForValidation();
            if (aiText) body.ai_output_text = aiText;
            var mmNodes = payload && payload.mindmapNodes;
            if ((!mmNodes || !mmNodes.length) && typeof collectMindmapNodesForValidation === 'function') {
                mmNodes = collectMindmapNodesForValidation();
            }
            if (mmNodes && mmNodes.length) body.mindmap_nodes = mmNodes;
            var ragCtx = payload && payload.ragContext != null
                ? String(payload.ragContext || '').trim()
                : '';
            if (!ragCtx && typeof resolveValidationRagContext === 'function') {
                ragCtx = resolveValidationRagContext();
            }
            if (ragCtx) body.rag_context = ragCtx;
        }
        if (getAiMode() !== 'preset') {
            body.base_url = ($('ai-base-url') || {}).value || '';
            body.api_key = ($('ai-api-key') || {}).value || '';
            body.model = ($('ai-model') || {}).value || '';
        }
        return body;
    }

    function requestValidationPhase(payload, useLlm, formatCheck, requirementsOverride, llmScopeHint) {
        var body = buildValidationRequestBody(payload, useLlm, formatCheck, requirementsOverride, llmScopeHint);
        return fetchJsonWithTimeout('/api/test-cases/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }, useLlm ? TC_VALIDATE_LLM_TIMEOUT_MS : TC_VALIDATE_FORMAT_TIMEOUT_MS);
    }

    function parseValidationSseEventBlock(block) {
        var lines = String(block || '').split('\n');
        var i;
        for (i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('data:') !== 0) continue;
            var jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;
            try {
                return JSON.parse(jsonStr);
            } catch (e1) {
                return null;
            }
        }
        return null;
    }

    function requestValidationLlmStream(payload, requirementsOverride, llmScopeHint, onReasoningChunk, userContentOverride) {
        var body = buildValidationRequestBody(payload, true, false, requirementsOverride, llmScopeHint, userContentOverride);
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = controller ? window.setTimeout(function () {
            try { controller.abort(); } catch (e0) { /* ignore */ }
        }, TC_VALIDATE_LLM_STREAM_TIMEOUT_MS) : null;
        return fetch('/api/test-cases/validate/llm-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller ? controller.signal : undefined
        }).then(function (res) {
            if (!res.ok) {
                return res.json().then(function (payloadErr) {
                    throw new Error((payloadErr && payloadErr.error) || ('HTTP ' + res.status));
                }).catch(function () {
                    throw new Error('HTTP ' + res.status);
                });
            }
            if (!res.body || typeof res.body.getReader !== 'function') {
                return requestValidationPhase(payload, true, false, requirementsOverride, llmScopeHint);
            }
            var reader = res.body.getReader();
            var decoder = new TextDecoder();
            var buf = '';
            var finalResult = null;
            var streamErr = null;
            function handleSseBlock(block) {
                if (streamErr) return;
                var ev = parseValidationSseEventBlock(block);
                if (!ev || !ev.type) return;
                if (ev.type === 'stream_chunk' &&
                    (ev.stream_kind || 'content') === 'reasoning' &&
                    ev.content &&
                    typeof onReasoningChunk === 'function') {
                    /* 思考区渲染异常（如 Firefox too much recursion）不得中断 SSE 对照 */
                    try {
                        onReasoningChunk(ev.content);
                    } catch (eReasoningUi) { /* ignore */ }
                } else if (ev.type === 'ai_quota' && ev.ai_quota &&
                    typeof global.hfAiQuotaNotify === 'function') {
                    global.hfAiQuotaNotify(ev.ai_quota);
                } else if (ev.type === 'done') {
                    finalResult = {
                        run_id: ev.run_id,
                        issues: ev.issues || [],
                        llm_count: ev.llm_count != null ? ev.llm_count : (ev.issues || []).length,
                        reasoning_text: ev.reasoning_text || ''
                    };
                } else if (ev.type === 'error') {
                    if (ev.ai_quota && typeof global.hfAiQuotaNotify === 'function') {
                        global.hfAiQuotaNotify(Object.assign({}, ev.ai_quota, {
                            exhausted: true,
                            remaining: 0
                        }));
                    } else if (typeof global.hfAiQuotaFromErrorBody === 'function') {
                        global.hfAiQuotaFromErrorBody({
                            error: ev.message,
                            code: ev.code,
                            ai_quota: ev.ai_quota
                        });
                    } else if (typeof global.hfAiQuotaFromErrorMsg === 'function') {
                        global.hfAiQuotaFromErrorMsg(ev.message);
                    }
                    streamErr = new Error(ev.message || 'AI 对照失败');
                    if (ev.code) streamErr.code = ev.code;
                    if (ev.ai_quota || (ev.code && /QUOTA/i.test(String(ev.code)))) {
                        streamErr._quotaToastShown = true;
                    }
                }
            }
            function consumeSseBuffer(flushAll) {
                var parts = buf.split('\n\n');
                if (flushAll) {
                    buf = '';
                } else {
                    buf = parts.pop() || '';
                }
                parts.forEach(handleSseBlock);
                if (flushAll && buf) {
                    handleSseBlock(buf);
                    buf = '';
                }
            }
            function flushStreamDecoderAndBuffer() {
                try {
                    buf += decoder.decode();
                } catch (eDecode) { /* ignore */ }
                consumeSseBuffer(true);
            }
            function pump() {
                return reader.read().then(function (chunk) {
                    if (chunk.done) {
                        flushStreamDecoderAndBuffer();
                        if (streamErr) throw streamErr;
                        if (finalResult) return finalResult;
                        throw new Error('AI 对照流中断');
                    }
                    buf += decoder.decode(chunk.value, { stream: true });
                    consumeSseBuffer(false);
                    if (streamErr) throw streamErr;
                    return pump();
                }, function (readErr) {
                    /* 仅捕获 reader.read 失败，避免吞掉业务 throw */
                    return recoverQcLlmStreamAfterReadFailure(readErr, {
                        flush: flushStreamDecoderAndBuffer,
                        streamErr: streamErr,
                        finalResult: finalResult
                    });
                });
            }
            return pump();
        }).finally(function () {
            if (timer) window.clearTimeout(timer);
        });
    }

    function resetValidateLlmReasoning(scope) {
        vScopeData(normalizeValidateScope(scope)).validateLlmReasoning = '';
    }

    function appendValidateLlmReasoning(scope, chunk) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        vData.validateLlmReasoning = (vData.validateLlmReasoning || '') + String(chunk || '');
        if (vData.validateProgress) {
            if (typeof syncValidationProgressReasoningStream === 'function') {
                syncValidationProgressReasoningStream(scope);
            } else if (typeof patchValidationReasoningDom === 'function' && patchValidationReasoningDom(scope)) {
                /* reasoning patched */
            } else if (typeof renderValidationProgressUI === 'function') {
                renderValidationProgressUI(scope, { updateSummary: false });
            }
        }
        if (global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.appendValidateReasoningContent === 'function') {
            global.TcGenChatPipeline.appendValidateReasoningContent(chunk);
        }
    }

    function setValidateLlmReasoning(scope, text) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        vData.validateLlmReasoning = String(text || '');
        if (vData.validateProgress) {
            if (typeof syncValidationProgressReasoningStream === 'function') {
                syncValidationProgressReasoningStream(scope);
            } else if (typeof patchValidationReasoningDom === 'function' && patchValidationReasoningDom(scope)) {
                /* reasoning patched */
            } else if (typeof renderValidationProgressUI === 'function') {
                renderValidationProgressUI(scope, { updateSummary: false });
            }
        }
        if (global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.setValidateReasoningContent === 'function') {
            global.TcGenChatPipeline.setValidateReasoningContent(text, { replace: true });
        }
    }

    function partitionValidationIssues(allIssues) {
        var listIssues = [];
        var overIssues = [];
        var gapIssues = [];
        (allIssues || []).forEach(function (i) {
            if (!i) return;
            if (i.type === 'hallucination') overIssues.push(i);
            else if (i.type === 'gap' || (i.type && String(i.type).indexOf('visual_') === 0)) gapIssues.push(i);
            else listIssues.push(i);
        });
        return { listIssues: listIssues, overIssues: overIssues, gapIssues: gapIssues };
    }

    function formatLlmValidationStepDetail(overCount, gapCount) {
        overCount = overCount || 0;
        gapCount = gapCount || 0;
        var total = overCount + gapCount;
        if (!total) return '检查通过';
        if (overCount && gapCount) {
            return '共 ' + total + ' 项（过度 ' + overCount + ' · 遗漏 ' + gapCount + '）';
        }
        if (overCount) return '发现 ' + overCount + ' 项过度生成';
        if (gapCount) return '发现 ' + gapCount + ' 项可能遗漏';
        return '检查通过';
    }

    function validationIssueDedupeKey(issue) {
        return String(issue.row_index != null ? issue.row_index : 'none') + '\0' +
            String(issue.message || '').trim().toLowerCase();
    }

    function formatValidationIssueDisplayText(issue) {
        if (!issue) return '';
        var msg = String(issue.message || '').trim();
        if (msg) return msg;
        var feature = String(issue.feature || '').trim();
        var desc = String(issue.description || '').trim();
        if (feature && desc) return '【' + feature + '】' + desc;
        return desc || feature;
    }

    function renderValidationIssueStatusBadge(issue) {
        var status = String((issue && issue.status) || 'open').trim().toLowerCase();
        if (!status || status === 'open') return '';
        var label = status === 'resolved' ? '已解决' : (status === 'ignored' ? '已忽略' : status);
        return '<span class="tc-validate-issue__status">' + esc(label) + '</span>';
    }

    function renderValidationIssueMeta(issue, scope, locateLabel) {
        var html = '<span class="tc-validate-issue__text">' + esc(formatValidationIssueDisplayText(issue)) + '</span>';
        html += renderValidationIssueStatusBadge(issue);
        if (issue.row_index != null) {
            html += '<button type="button" class="tc-validate-locate btn btn-secondary btn-sm" data-row="' +
                issue.row_index + '">' + locateLabel + '</button>';
        }
        return html;
    }

    function dedupeValidationIssues(issues, keyFn) {
        var seen = {};
        var out = [];
        (issues || []).forEach(function (issue) {
            if (!issue) return;
            var key = keyFn(issue);
            if (seen[key]) return;
            seen[key] = true;
            out.push(issue);
        });
        return out;
    }

    function filterIssuesWithinValidationBatch(issues, batchPayload) {
        issues = issues || [];
        batchPayload = batchPayload || {};
        if (!batchPayload.hasBatch || batchPayload.mindmapBatch) return issues;
        if (batchPayload.parseResultBatch) {
            return filterParseBatchIssuesByRowIndex(issues, batchPayload);
        }
        var allowedRows = {};
        var map = batchPayload.rowIndexMap;
        if (map && map.length) {
            map.forEach(function (idx) {
                var ri = parseInt(idx, 10);
                if (!isNaN(ri)) allowedRows[ri] = true;
            });
        } else {
            var start = Math.max(0, batchPayload.rowOffset || 0);
            var count = (batchPayload.rows || []).length;
            for (var i = 0; i < count; i++) allowedRows[start + i] = true;
        }
        return issues.filter(function (issue) {
            if (!issue) return false;
            if (issue.row_index == null || issue.row_index === '') return true;
            var ri = parseInt(issue.row_index, 10);
            if (isNaN(ri)) return false;
            return !!allowedRows[ri];
        });
    }

    function filterParseBatchIssuesByRowIndex(issues, batchPayload) {
        issues = issues || [];
        batchPayload = batchPayload || {};
        var rowCount = (batchPayload.rows || []).length;
        if (!rowCount) return [];
        return issues.filter(function (issue) {
            if (!issue) return false;
            if (issue.type === 'gap' && (issue.row_index == null || issue.row_index === '')) return true;
            if (issue.row_index == null || issue.row_index === '') return false;
            var ri = parseInt(issue.row_index, 10);
            if (isNaN(ri)) return false;
            return ri >= 0 && ri < rowCount;
        });
    }

    function remapValidationIssuesForBatch(issues, batchPayload) {
        if (!issues || !issues.length) return [];
        batchPayload = batchPayload || {};
        if (batchPayload.rowIndexMap && batchPayload.rowIndexMap.length) {
            return remapValidationIssueListWithMap(issues, batchPayload.rowIndexMap);
        }
        return remapValidationIssueList(issues, batchPayload.rowOffset || 0);
    }

    function isCodeValidationIssueType(type) {
        return type === 'format' || type === 'structure' || type === 'required';
    }

    function resolveParseRowCountForValidation(validation) {
        if (!validation || typeof validation !== 'object') return 0;
        var n = parseInt(validation.parse_row_count != null
            ? validation.parse_row_count
            : validation.parseRowCount, 10);
        return isNaN(n) || n <= 0 ? 0 : n;
    }

    function dedupeHallucinationOnePerRowIndex(issues) {
        var byRow = {};
        (issues || []).forEach(function (issue) {
            if (!issue) return;
            if (issue.row_index == null || issue.row_index === '') return;
            var ri = parseInt(issue.row_index, 10);
            if (isNaN(ri)) return;
            byRow[ri] = issue;
        });
        var ordered = [];
        Object.keys(byRow).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); }).forEach(function (k) {
            ordered.push(byRow[k]);
        });
        return ordered;
    }

    function clampAiIssuesForParseBatch(aiPool, parseRowCount) {
        parseRowCount = Math.max(0, parseInt(parseRowCount, 10) || 0);
        if (!parseRowCount || !aiPool || !aiPool.length) return aiPool || [];
        var batchPayload = { rows: new Array(parseRowCount) };
        var split = partitionValidationIssues(aiPool);
        split.overIssues = filterParseBatchIssuesByRowIndex(split.overIssues, batchPayload);
        split.overIssues = dedupeHallucinationOnePerRowIndex(split.overIssues);
        split.gapIssues = filterParseBatchIssuesByRowIndex(split.gapIssues, batchPayload);
        return split.overIssues.concat(split.gapIssues).concat(split.listIssues);
    }

    function buildAiIssuePoolFromValidation(validation) {
        if (!validation || typeof validation !== 'object') return [];
        var codeTypes = { format: 1, structure: 1, required: 1 };
        var aiPool = [];
        var seen = {};
        function pushAi(issue) {
            if (!issue) return;
            var key = validationIssueDedupeKey(issue);
            if (seen[key]) return;
            seen[key] = true;
            aiPool.push({
                row_index: issue.row_index,
                case_index: issue.case_index != null ? issue.case_index : issue.row_index,
                type: issue.type,
                message: issue.message,
                feature: issue.feature,
                status: issue.status,
                description: issue.description
            });
        }
        var hasStructured = ((validation.over_generated_issues || []).length > 0) ||
            ((validation.gap_issues || []).length > 0);
        (validation.over_generated_issues || []).forEach(pushAi);
        (validation.gap_issues || []).forEach(pushAi);
        if (!hasStructured) {
            (validation.issues || []).forEach(function (i) {
                if (!i || codeTypes[i.type]) return;
                if (i.type === 'hallucination' || i.type === 'gap' ||
                    (i.type && String(i.type).indexOf('visual_') === 0)) {
                    pushAi(i);
                }
            });
        }
        return aiPool;
    }

    function normalizeValidationForDisplay(validation) {
        if (!validation || typeof validation !== 'object') return null;
        var codeTypes = { format: 1, structure: 1, required: 1 };
        var formatIssues = dedupeValidationIssues(
            (validation.issues || []).filter(function (i) { return i && codeTypes[i.type]; }),
            validationIssueDedupeKey
        );
        var parseRowCount = resolveParseRowCountForValidation(validation);
        var aiPool = clampAiIssuesForParseBatch(
            buildAiIssuePoolFromValidation(validation),
            parseRowCount
        );
        var split = partitionValidationIssues(aiPool);
        split.overIssues = dedupeValidationIssues(split.overIssues, validationIssueDedupeKey);
        if (parseRowCount) {
            split.overIssues = dedupeHallucinationOnePerRowIndex(split.overIssues);
        }
        split.gapIssues = dedupeValidationIssues(split.gapIssues, function (issue) {
            return String(issue.message || '').trim().toLowerCase();
        });
        return Object.assign({}, validation, {
            issues: formatIssues,
            issue_count: formatIssues.length,
            format_count: formatIssues.length,
            over_generated_issues: split.overIssues,
            over_generated_count: split.overIssues.length,
            gap_issues: split.gapIssues,
            gap_count: split.gapIssues.length,
            parse_row_count: parseRowCount || validation.parse_row_count || validation.parseRowCount || null
        });
    }

    function batchKeysValidationMatch(expectedKey, actualKey) {
        expectedKey = String(expectedKey || '').trim();
        actualKey = String(actualKey || '').trim();
        if (!expectedKey || !actualKey) return true;
        if (expectedKey === actualKey) return true;
        if (expectedKey.indexOf('turn-') === 0 || actualKey.indexOf('turn-') === 0) {
            return false;
        }
        return expectedKey === actualKey;
    }

    function refreshValidationLlmStepFromResult(stored, scope) {
        scope = normalizeValidateScope(scope);
        if (!stored || stored.llm_pending || stored.llm_skipped) return;
        var detail = formatLlmValidationStepDetail(stored.over_generated_count, stored.gap_count);
        var vData = vScopeData(scope);
        if (vData.validateProgress && vData.validateProgress.steps && vData.validateProgress.steps.llm) {
            var st = vData.validateProgress.steps.llm;
            if (st.status === 'done' || st.status === 'running') {
                st.status = 'done';
                st.detail = detail;
            }
        }
        syncGenChatValidationStep(scope, 'llm', 'done', detail);
    }

    function buildIssueListBreakdownLine(formatCount, overCount, gapCount) {
        formatCount = formatCount || 0;
        overCount = overCount || 0;
        gapCount = gapCount || 0;
        var visibleTotal = formatCount + overCount + gapCount;
        if (!visibleTotal) return '';
        var parts = [];
        if (formatCount) parts.push('格式/必填 ' + formatCount + ' 项');
        if (overCount) parts.push('AI 过度 ' + overCount + ' 项');
        if (gapCount) parts.push('可能遗漏 ' + gapCount + ' 项');
        return '问题清单共 ' + visibleTotal + ' 项（' + parts.join(' · ') + '）';
    }

    function mergeValidationResults(formatResult, llmResult, opts, batchPayload) {
        opts = opts || {};
        batchPayload = batchPayload || {};
        var codeTypes = { format: 1, structure: 1, required: 1 };
        var formatIssues = [];
        if (formatResult && formatResult.issues) {
            formatIssues = formatResult.issues.filter(function (i) { return codeTypes[i.type]; });
        }
        var llmRaw = [];
        if (llmResult && llmResult.issues) {
            llmRaw = llmResult.issues.filter(function (i) { return !codeTypes[i.type]; });
        }
        var split = partitionValidationIssues(llmRaw);
        split.overIssues = dedupeValidationIssues(
            filterParseBatchIssuesByRowIndex(split.overIssues, batchPayload),
            validationIssueDedupeKey
        );
        split.gapIssues = dedupeValidationIssues(
            filterParseBatchIssuesByRowIndex(split.gapIssues, batchPayload),
            function (issue) { return String(issue.message || '').trim().toLowerCase(); }
        );
        split.overIssues = remapValidationIssuesForBatch(split.overIssues, batchPayload);
        split.gapIssues = remapValidationIssuesForBatch(split.gapIssues, batchPayload);
        var listIssues = formatIssues.concat(split.listIssues);
        var parseRowCount = (batchPayload.rows || []).length;
        return normalizeValidationForDisplay({
            run_id: (llmResult && llmResult.run_id) || (formatResult && formatResult.run_id) || null,
            issue_count: listIssues.length,
            issues: listIssues,
            format_count: formatIssues.length,
            llm_count: 0,
            gap_count: split.gapIssues.length,
            gap_issues: split.gapIssues,
            over_generated_count: split.overIssues.length,
            over_generated_issues: split.overIssues,
            parse_row_count: parseRowCount || null,
            format_done: true,
            llm_done: !!llmResult,
            llm_pending: !!opts.llm_pending,
            llm_skipped: !!opts.llm_skipped,
            llm_skip_reason: opts.llm_skip_reason || null,
            llm_reasoning: String(
                (llmResult && (llmResult.reasoning_text || llmResult.llm_reasoning)) ||
                opts.llm_reasoning ||
                ''
            ).trim() || null
        });
    }

    function ensureRequirementsForValidation() {
        if (!shouldUseLanhuRequirementsForValidation()) {
            return Promise.resolve('');
        }
        var req = String(state.lastLanhuRequirements || state.lastRequirements || '').trim();
        if (req) return Promise.resolve(req);
        if (!isLanhuReadyForValidation()) return Promise.resolve('');
        return fetchLanhuRequirementsForValidation().then(function (summary) {
            req = String(summary || '').trim();
            if (req) {
                state.lastLanhuRequirements = req;
                state.lastRequirements = req;
            }
            return req;
        });
    }

    function captureSingleBatchRequirementsForValidation() {
        var snap = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
        if (!shouldUseLanhuRequirementsForValidation()) {
            snap.batchRequirements = '';
            return '';
        }
        var req = String(state.lastLanhuRequirements || state.lastRequirements || '').trim();
        if (req) snap.batchRequirements = req;
        else snap.batchRequirements = '';
        return req;
    }

    function resolveValidationRagContext() {
        var snap = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
        if (typeof isTcRagEnabled === 'function' && !isTcRagEnabled()) return '';
        return String((snap && snap.batchRagContext) || '').trim();
    }

    function ensureRequirementsForMindmapLlmValidation() {
        var snap = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
        if (!isLanhuReadyForValidation()) {
            return Promise.resolve('');
        }
        var batchReq = String(snap.batchRequirements || '').trim();
        if (batchReq) return Promise.resolve(batchReq);
        return fetchLanhuRequirementsForValidation().then(function (summary) {
            summary = String(summary || '').trim();
            if (summary) snap.batchRequirements = summary;
            return summary;
        });
    }

    function resolveValidationUserContent() {
        var snap = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
        return String(snap.batchUserContent || '').trim();
    }

    function resolveGenerationStreamTextForValidation() {
        var text = '';
        if (global.TcGenerationStreamClient &&
            typeof global.TcGenerationStreamClient.getStreamText === 'function') {
            text = String(global.TcGenerationStreamClient.getStreamText() || '').trim();
        }
        if (!text && global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.getStreamText === 'function') {
            text = String(global.TcGenChatPipeline.getStreamText() || '').trim();
        }
        return text;
    }

    function captureSingleBatchRagContextForValidation(meta) {
        meta = meta || {};
        var snap = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
        var rag = '';
        if (typeof isTcRagEnabled === 'function' && isTcRagEnabled()) {
            if (meta.knowledgeBundle) {
                rag = String(meta.knowledgeBundle.publicContext || meta.knowledgeBundle.ragContext || '').trim();
            }
            if (!rag && meta.ragContext) rag = String(meta.ragContext || '').trim();
            if (!rag && global.TC_LAST_GENERATE_KNOWLEDGE_BUNDLE) {
                var bundle = global.TC_LAST_GENERATE_KNOWLEDGE_BUNDLE;
                rag = String(bundle.publicContext || bundle.ragContext || '').trim();
            }
        }
        snap.batchRagContext = rag;
        return rag;
    }

    function captureSingleBatchAiOutputForValidation() {
        var snap = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
        var text = resolveGenerationStreamTextForValidation();
        if (text) snap.batchAiOutputText = text;
        return text;
    }

    function captureSingleBatchUserContentForValidation(meta) {
        meta = meta || {};
        var snap = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
        var text = String(meta.userPrompt || meta.userIntent || '').trim();
        if (!text) {
            var el = $('ai-prompt');
            text = el ? String(el.value || '').trim() : '';
        }
        if (text) {
            snap.batchUserContent = text;
            state.lastUserContent = text;
        }
        return text;
    }


    function fetchRequirementTextFromDbForCurrentPage() {
        var docId = '';
        var pageId = '';
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta = global.getTcLanhuDocTreeMeta() || {};
            docId = String(meta.docId || '').trim();
            pageId = String(meta.selectedId || meta.focusPageId || '').trim();
        }
        if (global.TcRequirementCaseStore && typeof global.TcRequirementCaseStore.resolveContext === 'function') {
            var ctx = global.TcRequirementCaseStore.resolveContext({});
            if (ctx) {
                pageId = String(ctx.lanhu_page_id || ctx.page_id || pageId || '').trim();
            }
        }
        if (!pageId) return Promise.resolve('');
        if (typeof global.getTcLanhuPageCacheEntry === 'function') {
            var cached = global.getTcLanhuPageCacheEntry(pageId);
            if (cached && String(cached.text || '').trim()) {
                return Promise.resolve(String(cached.text).trim());
            }
        }
        if (!docId) return Promise.resolve('');
        return fetch('/api/test-cases/lanhu-page-cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ doc_id: docId })
        }).then(function (r) { return r.json(); }).then(function (d) {
            var items = (d && d.items) || [];
            for (var i = 0; i < items.length; i++) {
                if (items[i] && String(items[i].page_id || '') === pageId) {
                    var txt = String(items[i].content_text || '').trim();
                    if (txt) return txt;
                }
            }
            return '';
        }).catch(function () { return ''; });
    }

    function ensureRequirementsForSingleLlmValidation() {
        var snap = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
        if (!shouldUseLanhuRequirementsForValidation()) {
            snap.batchRequirements = '';
            return Promise.resolve('');
        }
        var batchReq = String(snap.batchRequirements || '').trim();
        if (batchReq) return Promise.resolve(batchReq);
        if (!isLanhuReadyForValidation()) return Promise.resolve('');
        return fetchLanhuRequirementsForValidation().then(function (summary) {
            summary = String(summary || '').trim();
            if (summary) snap.batchRequirements = summary;
            return summary;
        });
    }

/* ---- tc_qc_page_session.js ---- */
/**
 * 质量检测按需求页隔离：悬浮钮仅绑定当前页；切页/刷新/离开清空展示；页间不同步 QC 数据。
 */
    var _qcCompleteUiHandling = false;

    function getQcPageSessionPageId() {
        if (global.TcRequirementCaseStore &&
            typeof global.TcRequirementCaseStore.getActiveLanhuPageId === 'function') {
            return String(global.TcRequirementCaseStore.getActiveLanhuPageId() || '').trim();
        }
        return '';
    }

    function getQcFloatReopenBoundPageId(vData) {
        vData = vData || {};
        return String(vData.qcSessionPageId || vData.standaloneQualityCheckPageId || '').trim();
    }

    /** 当前需求页是否与 QC 悬浮钮/数据绑定页一致 */
    function isQcFloatReopenBoundToCurrentPage(vData, pageId) {
        pageId = String(pageId || getQcPageSessionPageId() || '').trim();
        if (!pageId) return false;
        var bound = getQcFloatReopenBoundPageId(vData);
        return !!(bound && bound === pageId);
    }

    /** 将 QC 悬浮钮与数据绑定到当前需求页 */
    function bindQcFloatReopenToCurrentPage(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        if (scope !== VALIDATE_SCOPE_SINGLE) return '';
        var pageId = getQcPageSessionPageId();
        if (pageId) {
            vScopeData(scope).qcSessionPageId = pageId;
        }
        return pageId;
    }

    /** 清空当前 scope 的质量检查 live 状态（不跨页恢复） */
    function clearQcPageScopedLiveState(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        if (typeof abortPendingValidation === 'function') {
            abortPendingValidation(scope);
        }
        vData.showStageBar = false;
        vData.lastValidation = null;
        vData.validateProgress = null;
        vData.validationBatchSnapshot = null;
        vData.validateLlmReasoning = '';
        vData.locateValidateRowIndex = null;
        vData.validateDrawerUserMinimized = false;
        vData.validateDrawerDismissedByClose = false;
        vData.qcSessionPageId = '';
        vData.standaloneQualityCheckSession = false;
        vData.standaloneQualityCheckPageId = '';
        if (typeof state !== 'undefined') {
            state._validateRequiredProfile = null;
        }
    }

    function clearStandaloneQcPageSessionForRerun(scope, pageId) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        pageId = String(pageId || getQcPageSessionPageId() || '').trim();
        var vData = vScopeData(scope);
        if (pageId && getQcFloatReopenBoundPageId(vData) === pageId) {
            vData.qcSessionPageId = '';
        }
    }


    function shouldHideValidateReopenBtnForMindmapTab(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        if (scope !== VALIDATE_SCOPE_SINGLE) return false;
        var mode = 'table';
        if (typeof global !== 'undefined' && typeof global.tcRightViewMode === 'string') {
            mode = global.tcRightViewMode;
        } else if (typeof window !== 'undefined' && typeof window.tcRightViewMode === 'string') {
            mode = window.tcRightViewMode;
        }
        return mode === 'mindmap';
    }

    function syncValidateReopenBtnOnRightViewTabSwitch() {
        if (typeof updateValidateReopenBtn !== 'function') return;
        updateValidateReopenBtn(VALIDATE_SCOPE_SINGLE);
    }

    function resolveValidateReopenForPageSession(scope, vData, panelHidden, inProgress) {
        scope = normalizeValidateScope(scope);
        if (scope !== VALIDATE_SCOPE_SINGLE) {
            var legacyHas = !!(vData.lastValidation && validationHasActionableResults(vData.lastValidation));
            return panelHidden && (legacyHas || inProgress);
        }
        var pageId = getQcPageSessionPageId();
        if (!pageId) return false;
        if (!isQcFloatReopenBoundToCurrentPage(vData, pageId)) return false;
        if (shouldHideValidateReopenBtnForMindmapTab(scope)) return false;
        if (vData.validateDrawerDismissedByClose && panelHidden) return false;
        if (vData.validateDrawerUserMinimized && panelHidden) return true;
        if (inProgress) return !!panelHidden;
        var stored = vData.lastValidation;
        if (shouldSuppressValidateUiForSkippedNoLanhu(stored)) return false;
        var hasResult = !!(stored && validationHasActionableResults(stored));
        return !!panelHidden && hasResult;
    }

    function shouldAutoShowQcDetailOnComplete(vData) {
        if (!vData || !vData.lastValidation || vData.lastValidation.llm_pending) return false;
        if (shouldSuppressValidateUiForSkippedNoLanhu(vData.lastValidation)) return false;
        if (vData.deferValidateDrawerForGenChat) return false;
        if (!isQcFloatReopenBoundToCurrentPage(vData)) return false;
        return true;
    }

    function revealQcDetailDrawerFromLiveState(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        if (typeof openValidateDrawerInner !== 'function') return false;
        openValidateDrawerInner({
            center: true,
            scope: scope,
            forceOpen: true,
            forceFetch: false,
            _skipCacheRestore: true,
            _skipTurnLoad: true
        });
        return true;
    }

    function autoShowQcDetailDrawerOnComplete(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        if (!shouldAutoShowQcDetailOnComplete(vData)) return false;
        var drawerOpen = typeof isValidateDrawerOpen === 'function' && isValidateDrawerOpen(scope);
        if (!drawerOpen) {
            revealQcDetailDrawerFromLiveState(scope);
        }
        var issueList = typeof document !== 'undefined' ? document.getElementById('tc-validate-issue-list') : null;
        var onIssuesTab = issueList && !issueList.classList.contains('hidden');
        if (!onIssuesTab && typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.switchValidateTab === 'function') {
            global.TcCoverageMatrix.switchValidateTab('issues', scope);
        }
        if (typeof global.syncTcQualityCheckButtonChrome === 'function') {
            global.syncTcQualityCheckButtonChrome();
        }
        return true;
    }

    function registerQcPageSessionOnComplete(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        if (scope !== VALIDATE_SCOPE_SINGLE) return;
        if (_qcCompleteUiHandling) return;
        var vData = vScopeData(scope);
        if (!vData.lastValidation || vData.lastValidation.llm_pending) return;
        _qcCompleteUiHandling = true;
        try {
            bindQcFloatReopenToCurrentPage(scope);
            if (!autoShowQcDetailDrawerOnComplete(scope)) {
                if (typeof closeValidateDrawer === 'function') {
                    closeValidateDrawer(scope);
                }
            }
            updateValidateReopenBtn(scope);
        } finally {
            _qcCompleteUiHandling = false;
        }
    }

    /** 切换需求页：取消悬浮钮展示并清空 live QC 数据（不跨页同步） */
    function swapQcPageSessionOnPageSwitch(prevPageId, nextPageId, scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        if (scope !== VALIDATE_SCOPE_SINGLE) return;
        clearQcPageScopedLiveState(scope);
        if (typeof closeValidateDrawer === 'function') {
            closeValidateDrawer(scope);
        }
        if (typeof global.resetValidateSingleSideDrawerLayoutSession === 'function') {
            global.resetValidateSingleSideDrawerLayoutSession();
        }
        if (typeof global.resetValidateSingleQcMiniPositionToDefault === 'function') {
            global.resetValidateSingleQcMiniPositionToDefault();
        }
        if (typeof hideQualityStageBar === 'function') {
            hideQualityStageBar(scope);
        }
        updateValidateReopenBtn(scope);
        if (typeof global.syncTcQualityCheckButtonChrome === 'function') {
            global.syncTcQualityCheckButtonChrome();
        }
    }

    /** 离开工作台/刷新/切换文档：取消悬浮钮并清空 QC 展示状态 */
    function clearQcPageSessionOnWorkbenchLeave(reason) {
        var scope = VALIDATE_SCOPE_SINGLE;
        clearQcPageScopedLiveState(scope);
        if (typeof hideQualityStageBar === 'function') {
            hideQualityStageBar(scope);
        }
        if (typeof resetValidateTaskState === 'function') {
            resetValidateTaskState(scope, { clearCoverage: true, skipPersist: true });
        }
        if (typeof closeValidateDrawer === 'function') {
            closeValidateDrawer(scope);
        }
        if (typeof global.resetValidateSingleSideDrawerLayoutSession === 'function') {
            global.resetValidateSingleSideDrawerLayoutSession();
        }
        if (typeof global.resetValidateSingleQcMiniPositionToDefault === 'function') {
            global.resetValidateSingleQcMiniPositionToDefault();
        }
        updateValidateReopenBtn(scope);
    }

    function initQcPageSessionLeaveHandlers() {
        if (global.__tcQcPageSessionLeaveBound) return;
        global.__tcQcPageSessionLeaveBound = true;
        function onLeave() {
            clearQcPageSessionOnWorkbenchLeave('page_leave');
        }
        global.addEventListener('pagehide', onLeave);
        global.addEventListener('beforeunload', onLeave);
    }

    initQcPageSessionLeaveHandlers();

    global.bindQcFloatReopenToCurrentPage = bindQcFloatReopenToCurrentPage;
    global.isQcFloatReopenBoundToCurrentPage = isQcFloatReopenBoundToCurrentPage;
    global.clearQcPageScopedLiveState = clearQcPageScopedLiveState;
    global.tcQcPageSessionOnPageSwitch = swapQcPageSessionOnPageSwitch;
    global.tcQcPageSessionClearOnLeave = clearQcPageSessionOnWorkbenchLeave;

/* ---- tc_wb_validation.js ---- */
    /* ---------- 二次校验（浮窗） ---------- */
    var VALIDATE_STEP_META = {
        structure: { index: 1, label: '格式 / 表头检查', running: '正在检查表头与列格式…' },
        required: { index: 2, label: '关键字段检查', running: '正在检查关键字段是否为空…' },
        llm: { index: 3, label: 'AI 对照检查', running: '正在对照需求检查胡编/遗漏…' }
    };
    var VALIDATE_STEP_ORDER = ['structure', 'required', 'llm'];
    var MINDMAP_VALIDATE_STEP_ORDER = ['structure', 'llm'];
    var MINDMAP_VALIDATE_STEP_META = {
        structure: { index: 1, label: '格式检查', running: '正在检查导图格式与节点是否为空…' },
        llm: { index: 2, label: 'AI 对照检查', running: '正在对照需求检查胡编/遗漏…' }
    };

    function isMindmapValidationProfile() {
        return state._validateRequiredProfile === 'mindmap';
    }

    function getValidateStepOrder(prog) {
        if (prog && prog.stepOrder && prog.stepOrder.length) return prog.stepOrder;
        return isMindmapValidationProfile() ? MINDMAP_VALIDATE_STEP_ORDER : VALIDATE_STEP_ORDER;
    }

    function getValidateStepTotal(prog) {
        return getValidateStepOrder(prog).length;
    }


    function shouldUseQualityStageBar(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        return !!(vData.showStageBar && global.TcGenStageUi);
    }

    function syncQualityStageBar(scope, stepId, status, detail) {
        if (!shouldUseQualityStageBar(scope)) return;
        if (typeof global.TcGenStageUi.syncQualityStage === 'function') {
            global.TcGenStageUi.syncQualityStage(stepId, status, detail);
        }
    }

    function openQualityStageBar(scope, detail) {
        if (!shouldUseQualityStageBar(scope)) return;
        if (typeof global.TcGenStageUi.showQualityCheck === 'function') {
            global.TcGenStageUi.showQualityCheck({ meta: detail || '准备中…' });
        }
    }

    function restoreQcTableAreaAfterAbort() {
        /** 超时/中断后立刻收起表格蒙层，避免残留「质量检查中」 */
        try {
            if (global.TcQcTableOverlay && typeof global.TcQcTableOverlay.hide === 'function') {
                global.TcQcTableOverlay.hide();
            }
        } catch (e0) { /* ignore */ }
    }

    function finishQualityStageBar(scope, stored) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (!vData.showStageBar || !global.TcGenStageUi) return;
        stored = stored || vData.lastValidation || {};
        var skipReason = stored.llm_skip_reason;
        if (skipReason === LLM_SKIP_REASON.TIMEOUT || skipReason === LLM_SKIP_REASON.ERROR) {
            var abortDetail = skipReason === LLM_SKIP_REASON.TIMEOUT
                ? 'AI 对照超时'
                : (formatLlmSkippedMessage(stored) || 'AI 对照未完成');
            if (typeof global.TcGenStageUi.cancelQualityCheck === 'function') {
                global.TcGenStageUi.cancelQualityCheck({ detail: abortDetail });
            } else if (typeof global.TcGenStageUi.hideQualityCheck === 'function') {
                global.TcGenStageUi.hideQualityCheck();
            }
            restoreQcTableAreaAfterAbort();
            vData.showStageBar = false;
            return;
        }
        var issueCount = stored.issue_count != null ? stored.issue_count : (stored.issues || []).length;
        var totalIssues = issueCount + (stored.gap_count || 0) + (stored.over_generated_count || 0);
        var detail = totalIssues
            ? ('共发现 ' + totalIssues + ' 项问题，详见质量检查浮窗')
            : '全部检查通过';
        if (typeof global.TcGenStageUi.completeQualityCheck === 'function') {
            global.TcGenStageUi.completeQualityCheck({ issueCount: totalIssues, detail: detail });
        }
        restoreQcTableAreaAfterAbort();
        vData.showStageBar = false;
    }

    function hideQualityStageBar(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (!vData.showStageBar || !global.TcGenStageUi) return;
        if (typeof global.TcGenStageUi.hideQualityCheck === 'function') {
            global.TcGenStageUi.hideQualityCheck();
        }
        vData.showStageBar = false;
    }


    function getValidateStepMeta(stepId, prog) {
        if ((prog && prog.isMindmap) || isMindmapValidationProfile()) {
            if (stepId === 'structure') return MINDMAP_VALIDATE_STEP_META.structure;
            if (stepId === 'llm') return MINDMAP_VALIDATE_STEP_META.llm;
            return null;
        }
        return VALIDATE_STEP_META[stepId];
    }


    var genChatValidateSyncPending = false;

    function shouldSyncValidateToGenChat(scope) {
        if (scope !== VALIDATE_SCOPE_SINGLE) return false;
        if (!genChatValidateSyncPending) return false;
        if (!global.TcGenChatPipeline || !global.TcGenChatPipeline.enabled || !global.TcGenChatPipeline.enabled()) {
            return false;
        }
        return typeof global.TcGenChatPipeline.syncQualityCheckProgress === 'function';
    }

    function syncGenChatQualityCheck(opts) {
        opts = opts || {};
        if (!opts.finish && isGenChatPipelineFailed()) return;
        if (!global.TcGenChatPipeline || typeof global.TcGenChatPipeline.syncQualityCheckProgress !== 'function') {
            return;
        }
        global.TcGenChatPipeline.syncQualityCheckProgress(opts || {});
    }

    function formatValidationChatReport(prog, result) {
        var lines = [];
        var reportOrder = getValidateStepOrder(prog);
        var reportTotal = getValidateStepTotal(prog);
        reportOrder.forEach(function (id) {
            var meta = getValidateStepMeta(id, prog);
            var st = prog && prog.steps && prog.steps[id];
            if (!meta || !st) return;
            var detail = String(st.detail || '').trim();
            if (!detail && st.status === 'pending') detail = '等待中…';
            if (!detail && st.status === 'running') detail = meta.running;
            if (!detail && st.status === 'skipped') detail = '已跳过';
            if (!detail && st.status === 'done') detail = '检查通过';
            if (!detail && st.status === 'error') detail = '检查失败';
            if (!detail && st.status === 'timeout') detail = 'AI 对照超时';
            lines.push('[' + meta.index + '/' + reportTotal + '] ' + meta.label + '：' + detail);
        });
        if (result) {
            lines.push('');
            lines.push('--- 检查结果 ---');
            var allIssues = (result.issues || []).slice(0, 25);
            if (allIssues.length) {
                allIssues.forEach(function (issue, i) {
                    var rowNo = issue.row_index != null ? ('第 ' + (issue.row_index + 1) + ' 行') : '';
                    lines.push((i + 1) + '. [' + (issue.type || 'issue') + '] ' + rowNo + ' ' + String(issue.message || '').trim());
                });
                if ((result.issues || []).length > allIssues.length) {
                    lines.push('… 另有 ' + ((result.issues || []).length - allIssues.length) + ' 项，详见质量检查浮窗');
                }
            } else if (result.llm_skipped) {
                lines.push(formatLlmSkippedMessage(result) || '格式检查通过（未运行 AI 对照）。');
            } else {
                lines.push('未发现问题 ✓');
            }
            var gapCount = result.gap_count || 0;
            var overCount = result.over_generated_count || 0;
            if (gapCount || overCount) {
                lines.push('');
                if (gapCount) lines.push('可能遗漏 ' + gapCount + ' 项');
                if (overCount) lines.push('可能过度生成 ' + overCount + ' 项');
            }
        }
        return lines.join('\n');
    }

    function syncGenChatValidationStep(scope, stepId, status, detail, extra) {
        if (!shouldSyncValidateToGenChat(scope)) return;
        if (isGenChatPipelineFailed()) return;
        extra = extra || {};
        var prog = vScopeData(scope).validateProgress;
        var meta = getValidateStepMeta(stepId, prog);
        if (!meta) return;
        var lineDetail = String(detail || '').trim();
        if (!lineDetail && status === 'running') lineDetail = meta.running;
        syncGenChatQualityCheck({
            subStep: stepId,
            subStatus: status,
            subDetail: lineDetail || meta.running || '检查进行中…',
            subSkipReason: extra.skipReason || '',
            detail: meta.label + ' · ' + (lineDetail || meta.running || '检查进行中…')
        });
    }

    function isLlmValidationPhaseSettled(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (vData.lastValidation && vData.lastValidation.llm_pending) return false;
        var prog = vData.validateProgress;
        if (prog && prog.steps && prog.steps.llm) {
            var llmSt = prog.steps.llm.status;
            if (llmSt === 'pending' || llmSt === 'running') return false;
        }
        return true;
    }

    function isLlmValidationPhaseInFlight(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (vData.lastValidation && vData.lastValidation.llm_pending) return true;
        var prog = vData.validateProgress;
        if (!prog || !prog.active) return false;
        var llm = prog.steps && prog.steps.llm;
        if (!llm) return true;
        return llm.status === 'pending' || llm.status === 'running';
    }

    function shouldDeferValidateDrawerForGenChatQC(scope, wantLlm) {
        if (normalizeValidateScope(scope) !== VALIDATE_SCOPE_SINGLE) return false;
        if (!wantLlm) return false;
        if (!genChatValidateSyncPending) return false;
        if (!global.TcGenChatPipeline || typeof global.TcGenChatPipeline.enabled !== 'function') {
            return false;
        }
        return !!global.TcGenChatPipeline.enabled();
    }

    function shouldSuppressValidateDrawerAutoOpen(opts, scope) {
        opts = opts || {};
        if (opts.userInitiated || opts.forceOpen || opts._fromTurnDb) return false;
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (!vData.deferValidateDrawerForGenChat && !genChatValidateSyncPending) return false;
        return isLlmValidationPhaseInFlight(scope);
    }

    function maybeAutoOpenDeferredValidateDrawer(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (!vData.deferValidateDrawerForGenChat) return;
        if (!isLlmValidationPhaseSettled(scope)) return;
        if (shouldSuppressValidateUiForSkippedNoLanhu(vData.lastValidation)) {
            vData.deferValidateDrawerForGenChat = false;
            dismissValidateUiForSkippedNoLanhu(vData.lastValidation, scope);
            return;
        }
        if (isValidateDrawerOpen(scope)) {
            vData.deferValidateDrawerForGenChat = false;
            return;
        }
        vData.deferValidateDrawerForGenChat = false;
        openValidateDrawer({ center: true, scope: scope });
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.switchValidateTab === 'function') {
            global.TcCoverageMatrix.switchValidateTab('issues', scope);
        }
    }

    function finishGenChatValidation(scope, prog, result, detail, isError) {
        var vData = vScopeData(scope);
        var canSync = shouldSyncValidateToGenChat(scope);
        if (!canSync && !(vData.deferValidateDrawerForGenChat && genChatValidateSyncPending)) {
            genChatValidateSyncPending = false;
            syncPromptSendBtnAfterValidationChange();
            return;
        }
        var finishDetail = String(detail || '').trim();
        if (!finishDetail && prog && prog.steps && prog.steps.llm) {
            finishDetail = String(prog.steps.llm.detail || '').trim();
        }
        if (!finishDetail) finishDetail = '质量检查完成';
        syncGenChatQualityCheck({
            finish: true,
            error: !!isError,
            detail: finishDetail
        });
        genChatValidateSyncPending = false;
        syncPromptSendBtnAfterValidationChange();
        maybeAutoOpenDeferredValidateDrawer(scope);
    }

    function getValidationProgressHeadline(prog) {
        var order = getValidateStepOrder(prog);
        var total = getValidateStepTotal(prog);
        var hasTimeout = order.some(function (id) {
            return !!(prog.steps[id] && prog.steps[id].status === 'timeout');
        });
        if (hasTimeout) {
            return { badge: '超时', caption: 'AI 对照超时，格式与必填结果已保留' };
        }
        var hasError = order.some(function (id) {
            return !!(prog.steps[id] && prog.steps[id].status === 'error');
        });
        if (hasError) {
            return { badge: '失败', caption: 'AI 对照出错，格式与必填结果已保留' };
        }
        if (prog._finishing) {
            return { badge: '完成', caption: '全部检查完毕，正在展示结果…' };
        }
        var activeId = null;
        order.forEach(function (id) {
            if (prog.steps[id] && prog.steps[id].status === 'running') activeId = id;
        });
        var finished = order.every(function (id) {
            return isValidateStepSettledStatus(prog.steps[id] && prog.steps[id].status);
        });
        if (finished) {
            return { badge: '完成', caption: '全部检查完毕，正在汇总结果…' };
        }
        if (activeId) {
            var activeMeta = getValidateStepMeta(activeId, prog);
            if (activeMeta) {
                var activeDetail = prog.steps[activeId].detail || activeMeta.running;
                return { badge: activeMeta.index + '/' + total, caption: activeDetail };
            }
        }
        var nextIdx = 1;
        order.forEach(function (id) {
            var st = prog.steps[id] && prog.steps[id].status;
            var stepMeta = getValidateStepMeta(id, prog);
            if (isValidateStepSettledStatus(st)) {
                nextIdx = Math.min(total, (stepMeta && stepMeta.index || nextIdx) + 1);
            }
        });
        return { badge: Math.min(nextIdx, total) + '/' + total, caption: '准备下一项检查…' };
    }

    function isValidateStepSettledStatus(status) {
        return status === 'done' || status === 'error' || status === 'skipped'
            || status === 'timeout' || status === 'cancelled';
    }

    function getValidationProgressPercent(prog) {
        var score = 0;
        var order = getValidateStepOrder(prog);
        var total = getValidateStepTotal(prog) || 1;
        var runningWeight = 1 / total;
        order.forEach(function (id) {
            var st = prog.steps[id] && prog.steps[id].status;
            if (st === 'running') score += runningWeight;
            else if (isValidateStepSettledStatus(st)) score += 1;
        });
        return Math.min(100, Math.round((score / total) * 100));
    }

    function delayMs(ms) {
        return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
    }

    function splitFormatIssuesByType(formatResult) {
        var issues = (formatResult && formatResult.issues) || [];
        return {
            structure: issues.filter(function (i) { return i.type === 'structure' || i.type === 'format'; }),
            required: issues.filter(function (i) { return i.type === 'required'; })
        };
    }

    function syncWorkbenchBusyChrome() {
        if (global.TcLeftPanelLock && typeof global.TcLeftPanelLock.applyLockUi === 'function') {
            global.TcLeftPanelLock.applyLockUi();
        }
        if (global.TcLeftPanelLock && typeof global.TcLeftPanelLock.syncLanhuRequirementNavLockUi === 'function') {
            global.TcLeftPanelLock.syncLanhuRequirementNavLockUi();
        }
        if (typeof global.syncTcQualityCheckButtonChrome === 'function') {
            global.syncTcQualityCheckButtonChrome();
        }
        syncQcWorkbenchInteractionLock();
    }

    /** 质量检查 / 补充用例 / 用例生成进行中：置灰并禁点表格操作 / 模板 / 视图切换 / 导出 FAB / 智能编辑 FAB */
    function isCoverageFillInteractionBusy() {
        if (global.TcLeftPanelLock && typeof global.TcLeftPanelLock.isCoverageFillDrawerBusy === 'function') {
            return !!global.TcLeftPanelLock.isCoverageFillDrawerBusy();
        }
        var cov = global.TcCoverageMatrix;
        if (cov && typeof cov.isCoverageFillJobBlockingLanhuNav === 'function' &&
            cov.isCoverageFillJobBlockingLanhuNav('single')) {
            return true;
        }
        if (cov && typeof cov.isValidateDrawerFillInProgress === 'function' &&
            cov.isValidateDrawerFillInProgress('single')) {
            return true;
        }
        return false;
    }

    /** 用例生成进行中（复用左栏生成锁信号，新方法，不改左栏锁本体） */
    function isCaseGenerationInteractionBusy() {
        if (global.TcLeftPanelLock &&
            typeof global.TcLeftPanelLock.isLanhuDocSwitchBlockedDuringGeneration === 'function') {
            return !!global.TcLeftPanelLock.isLanhuDocSwitchBlockedDuringGeneration();
        }
        if (typeof global.isTcLanhuDocSwitchBlockedDuringGeneration === 'function') {
            return !!global.isTcLanhuDocSwitchBlockedDuringGeneration();
        }
        if (global.TcLeftPanelLock && typeof global.TcLeftPanelLock.isAiGenerateLocked === 'function' &&
            global.TcLeftPanelLock.isAiGenerateLocked()) {
            return true;
        }
        if (typeof global.isTcLeftPanelAiGenerateLocked === 'function' &&
            global.isTcLeftPanelAiGenerateLocked()) {
            return true;
        }
        if (global.TcGenerationStreamClient &&
            typeof global.TcGenerationStreamClient.isActive === 'function' &&
            global.TcGenerationStreamClient.isActive()) {
            return true;
        }
        if (typeof global.isTcPageGenLockActive === 'function' && global.isTcPageGenLockActive()) {
            return true;
        }
        if (global.TcRequirementCaseStore &&
            typeof global.TcRequirementCaseStore.isWorkbenchGenerationStreamBusy === 'function' &&
            global.TcRequirementCaseStore.isWorkbenchGenerationStreamBusy()) {
            return true;
        }
        if (global.TcAgentOrchestrator) {
            if (typeof global.TcAgentOrchestrator.isGenModeLocked === 'function' &&
                global.TcAgentOrchestrator.isGenModeLocked()) {
                return true;
            }
            if (typeof global.TcAgentOrchestrator.isAgentJobRunning === 'function' &&
                global.TcAgentOrchestrator.isAgentJobRunning()) {
                return true;
            }
        }
        return false;
    }

    function isQcOnlyInteractionBusy() {
        if (global.TcLeftPanelLock && typeof global.TcLeftPanelLock.isQualityCheckBusy === 'function') {
            if (global.TcLeftPanelLock.isQualityCheckBusy()) return true;
        }
        if (typeof isSingleGenValidationInProgress === 'function' && isSingleGenValidationInProgress()) {
            return true;
        }
        /* 不含用例生成：生成态走 isCaseGenerationInteractionBusy，避免提示文案被当成「质量检查中」 */
        return false;
    }

    function isQcWorkbenchInteractionBusy() {
        if (isCoverageFillInteractionBusy()) return true;
        if (isQcOnlyInteractionBusy()) return true;
        if (isCaseGenerationInteractionBusy()) return true;
        return false;
    }

    function getQcWorkbenchInteractionLockTitle() {
        if (isCoverageFillInteractionBusy()) return '补充用例进行中，暂不可操作';
        if (isQcOnlyInteractionBusy()) return '质量检查进行中，暂不可操作';
        if (isCaseGenerationInteractionBusy()) return '用例生成进行中，暂不可操作';
        return '操作进行中，暂不可操作';
    }

    function applyQcInteractionLockEl(el, busy, titleBusy) {
        if (!el) return;
        el.classList.toggle('tc-qc-interaction-locked', !!busy);
        if (busy) {
            if (!el.hasAttribute('data-tc-qc-prev-title')) {
                el.setAttribute('data-tc-qc-prev-title', el.getAttribute('title') || '');
            }
            el.setAttribute('aria-disabled', 'true');
            if ('disabled' in el) el.disabled = true;
            el.title = titleBusy || getQcWorkbenchInteractionLockTitle();
            return;
        }
        el.removeAttribute('aria-disabled');
        if ('disabled' in el) el.disabled = false;
        if (el.hasAttribute('data-tc-qc-prev-title')) {
            var prev = el.getAttribute('data-tc-qc-prev-title') || '';
            if (prev) el.title = prev;
            else el.removeAttribute('title');
            el.removeAttribute('data-tc-qc-prev-title');
        }
    }

    function syncQcWorkbenchInteractionLock() {
        if (syncQcWorkbenchInteractionLock._reentry) return;
        syncQcWorkbenchInteractionLock._reentry = true;
        try {
            syncQcWorkbenchInteractionLockBody();
        } finally {
            syncQcWorkbenchInteractionLock._reentry = false;
        }
    }

    function syncQcWorkbenchInteractionLockBody() {
        var busy = isQcWorkbenchInteractionBusy();
        var lockTitle = getQcWorkbenchInteractionLockTitle();
        var scope = document.querySelector('.tc-workbench-scope');
        if (scope) scope.classList.toggle('tc-qc-workbench-interaction-lock', busy);
        if (document.body) document.body.classList.toggle('tc-qc-workbench-interaction-lock', busy);

        var floatWrap = document.getElementById('tc-left-input-float-wrap');
        var floatDock = document.getElementById('tc-left-float-dock');
        if (floatWrap) floatWrap.classList.toggle('tc-qc-ai-fab-lock', busy);
        if (floatDock) floatDock.classList.toggle('tc-qc-ai-fab-lock', busy);

        [
            'tc-gen-quality-btn',
            'tc-table-fab-toggle',
            'tc-switch-template-btn',
            'tc-choose-template-btn',
            'tc-right-view-mindmap-btn',
            'tc-right-view-table-btn',
            'tc-export-fab-toggle'
        ].forEach(function (id) {
            applyQcInteractionLockEl(document.getElementById(id), busy, lockTitle);
        });

        var opsAnchor = document.getElementById('tc-table-ops-anchor');
        if (opsAnchor) opsAnchor.classList.toggle('tc-qc-interaction-locked', busy);

        document.querySelectorAll(
            '#tc-left-float-dock [data-tc-float-open], #tc-left-float-dock .tc-left-float-dock__mode'
        ).forEach(function (btn) {
            applyQcInteractionLockEl(btn, busy, lockTitle);
        });

        if (busy) {
            if (typeof global.closeTcTableToolbarOpsSheet === 'function') {
                global.closeTcTableToolbarOpsSheet();
            } else if (typeof closeTcTableToolbarOpsSheet === 'function') {
                closeTcTableToolbarOpsSheet();
            }
            if (typeof global.closeTcExportFabSheet === 'function') {
                global.closeTcExportFabSheet();
            } else if (typeof closeTcExportFabSheet === 'function') {
                closeTcExportFabSheet();
            }
            if (typeof global.closeTcTableFabSheet === 'function') {
                global.closeTcTableFabSheet();
            }
        } else {
            if (typeof global.syncTcRightPanelMeta === 'function') {
                global.syncTcRightPanelMeta();
            } else if (typeof syncTcRightPanelMeta === 'function') {
                syncTcRightPanelMeta();
            }
            if (typeof global.syncTcTableTemplateChrome === 'function') {
                global.syncTcTableTemplateChrome();
            } else if (typeof syncTcTableTemplateChrome === 'function') {
                syncTcTableTemplateChrome();
            }
        }

        /* 质量检测钮 chrome 与交互锁对齐（生成中置灰禁用） */
        if (typeof global.syncTcQualityCheckButtonChrome === 'function' &&
            !syncQcWorkbenchInteractionLockBody._syncingQualityBtn) {
            syncQcWorkbenchInteractionLockBody._syncingQualityBtn = true;
            try {
                global.syncTcQualityCheckButtonChrome();
            } finally {
                syncQcWorkbenchInteractionLockBody._syncingQualityBtn = false;
            }
        }
    }

    function installQcWorkbenchInteractionLockHooks() {
        if (global._tcQcInteractionLockHooksInstalled) return;
        global._tcQcInteractionLockHooksInstalled = true;
        global.syncQcWorkbenchInteractionLock = syncQcWorkbenchInteractionLock;

        var lock = global.TcLeftPanelLock;
        if (lock && typeof lock.applyLockUi === 'function' && !lock._qcInteractionChromeHooked) {
            var origApply = lock.applyLockUi;
            lock.applyLockUi = function () {
                var ret = origApply.apply(lock, arguments);
                syncQcWorkbenchInteractionLock();
                return ret;
            };
            lock._qcInteractionChromeHooked = true;
        }
        if (lock && typeof lock.syncLanhuRequirementNavLockUi === 'function' &&
            !lock._qcInteractionLanhuHooked) {
            var origLanhu = lock.syncLanhuRequirementNavLockUi;
            lock.syncLanhuRequirementNavLockUi = function () {
                var ret = origLanhu.apply(lock, arguments);
                syncQcWorkbenchInteractionLock();
                return ret;
            };
            lock._qcInteractionLanhuHooked = true;
        }

        if (typeof global.scheduleReleaseWorkbenchInteractionLocks === 'function' &&
            !global.scheduleReleaseWorkbenchInteractionLocks._qcInteractionHooked) {
            var origRelease = global.scheduleReleaseWorkbenchInteractionLocks;
            global.scheduleReleaseWorkbenchInteractionLocks = function () {
                var ret = origRelease.apply(this, arguments);
                syncQcWorkbenchInteractionLock();
                if (typeof global.setTimeout === 'function') {
                    global.setTimeout(function () {
                        syncQcWorkbenchInteractionLock();
                    }, 0);
                    global.setTimeout(function () {
                        syncQcWorkbenchInteractionLock();
                    }, 320);
                }
                return ret;
            };
            global.scheduleReleaseWorkbenchInteractionLocks._qcInteractionHooked = true;
        }

        if (!global._tcQcInteractionClickGuardBound) {
            global._tcQcInteractionClickGuardBound = true;
            document.addEventListener('click', function (e) {
                if (!isQcWorkbenchInteractionBusy()) return;
                var t = e.target && e.target.closest
                    ? e.target.closest(
                        '#tc-gen-quality-btn, #tc-table-fab-toggle, #tc-table-ops-anchor, #tc-table-fab-sheet, ' +
                        '#tc-switch-template-btn, #tc-choose-template-btn, ' +
                        '#tc-right-view-mindmap-btn, #tc-right-view-table-btn, ' +
                        '#tc-export-fab-toggle, #tc-export-fab-wrap, #tc-export-fab-sheet, ' +
                        '#tc-left-float-dock [data-tc-float-open], #tc-left-float-dock .tc-left-float-dock__mode'
                    )
                    : null;
                if (!t) return;
                e.preventDefault();
                e.stopPropagation();
                if (typeof global.tcAppToast === 'function') {
                    global.tcAppToast(getQcWorkbenchInteractionLockTitle(), {
                        variant: 'warning',
                        duration: 2400
                    });
                }
            }, true);
        }

        syncQcWorkbenchInteractionLock();
    }

    function failPendingGenChatQualityCheck(detail) {
        detail = String(detail || '质量检查未能启动').trim();
        if (global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.isQualityCheckPending === 'function' &&
            global.TcGenChatPipeline.isQualityCheckPending()) {
            syncGenChatQualityCheck({
                finish: true,
                error: true,
                detail: detail
            });
        }
        genChatValidateSyncPending = false;
        syncPromptSendBtnAfterValidationChange();
    }

    function releaseWorkbenchLocksIfIdle() {
        if (isSingleGenValidationInProgress()) return;
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.isQualityCheckPending === 'function' &&
            global.TcGenChatPipeline.isQualityCheckPending()) {
            return;
        }
        if (typeof global.setTcLeftPanelAiGenerateLock === 'function') {
            global.setTcLeftPanelAiGenerateLock(false);
        }
        if (typeof global.scheduleReleaseWorkbenchInteractionLocks === 'function') {
            global.scheduleReleaseWorkbenchInteractionLocks();
        } else if (typeof global.releaseWorkbenchInteractionLocks === 'function') {
            global.releaseWorkbenchInteractionLocks();
        }
    }

    function isSingleGenValidationInProgress() {
        var vData = vScopeData(VALIDATE_SCOPE_SINGLE);
        if (vData.validateProgress && vData.validateProgress.active) return true;
        if (genChatValidateSyncPending) return true;
        return false;
    }

    function syncPromptSendBtnAfterValidationChange() {
        if (typeof global.syncTcPromptSendBtnState === 'function') {
            global.syncTcPromptSendBtnState();
        }
    }

    function shouldHideValidateDrawerTabsDuringQcRun(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        if (vData.validateProgress && vData.validateProgress.active) return true;
        if (scope === VALIDATE_SCOPE_SINGLE && genChatValidateSyncPending) return true;
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.isValidateDrawerFillInProgress === 'function' &&
            global.TcCoverageMatrix.isValidateDrawerFillInProgress(scope)) {
            return true;
        }
        return false;
    }

    function syncValidateDrawerTabsChromeDuringQcRun(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var drawer = getValidatePanel(scope);
        if (!drawer) return;
        drawer.classList.toggle('tc-validate-drawer--qc-running', shouldHideValidateDrawerTabsDuringQcRun(scope));
    }

    function beginValidationProgress(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        var mmProfile = isMindmapValidationProfile();
        var stepOrder = mmProfile ? MINDMAP_VALIDATE_STEP_ORDER.slice() : VALIDATE_STEP_ORDER.slice();
        var steps = {
            structure: { status: 'pending', detail: '' },
            llm: { status: 'pending', detail: '' }
        };
        if (!mmProfile) steps.required = { status: 'pending', detail: '' };
        vData.validateProgress = {
            active: true,
            isMindmap: mmProfile,
            stepOrder: stepOrder,
            steps: steps
        };
        if (scope === VALIDATE_SCOPE_SINGLE && typeof bindQcFloatReopenToCurrentPage === 'function') {
            bindQcFloatReopenToCurrentPage(scope);
        }
        clearValidationProgressShell(scope);
        clearValidateDrawerCleanPassLayout(scope);
        qcReasoningStreamReset(scope);
        renderValidationProgressUI(scope);
        syncValidateDrawerTabsChromeDuringQcRun(scope);
        openQualityStageBar(scope, '正在执行质量检查…');
        syncWorkbenchBusyChrome();
                if (shouldSyncValidateToGenChat(scope)) {
            if (global.TcGenChatPipeline &&
                typeof global.TcGenChatPipeline.captureQualityCheckEnabled === 'function') {
                global.TcGenChatPipeline.captureQualityCheckEnabled();
            }
            syncGenChatQualityCheck({
                begin: true,
                detail: '正在执行质量检查…',
                resetSubSteps: true
            });
        }
    }

    function setValidationProgressStep(stepId, status, detail, scope, extra) {
        scope = normalizeValidateScope(scope);
        var prog = vScopeData(scope).validateProgress;
        if (!prog || !prog.steps[stepId]) return;
        prog.steps[stepId].status = status;
        if (detail != null) prog.steps[stepId].detail = String(detail);
        renderValidationProgressUI(scope);
        syncQualityStageBar(scope, stepId, status, detail);
        if (status === 'running' || status === 'done' || status === 'error'
            || status === 'skipped' || status === 'timeout') {
            syncGenChatValidationStep(scope, stepId, status, detail, extra);
        }
    }

    function endValidationProgress(scope) {
        scope = normalizeValidateScope(scope);
        var prog = vScopeData(scope).validateProgress;
        if (prog) prog.active = false;
        if (scope === VALIDATE_SCOPE_SINGLE) {
            syncPromptSendBtnAfterValidationChange();
            releaseWorkbenchLocksIfIdle();
        }
        syncWorkbenchBusyChrome();
        syncValidateDrawerTabsChromeDuringQcRun(scope);
    }

    function getValidationProgressSummaryText(prog) {
        var headline = getValidationProgressHeadline(prog);
        if (headline.badge === '完成') return '质量检查完成';
        if (headline.badge === '失败') return '质量检查失败';
        if (headline.badge === '超时') return '质量检查超时';
        var runningId = getValidateStepOrder(prog).filter(function (id) {
            return prog.steps[id] && prog.steps[id].status === 'running';
        })[0];
        var runningMeta = getValidateStepMeta(runningId, prog) || getValidateStepMeta('structure', prog);
        return '质量检查 ' + headline.badge + ' · ' + (runningMeta ? runningMeta.label : '格式检查');
    }

    function buildValidateStepIconHtml(st, meta) {
        if (st.status === 'running') {
            return '<span class="tc-validate-step__spinner" aria-hidden="true"></span>';
        }
        if (st.status === 'done') {
            return '<span class="tc-validate-step__icon tc-validate-step__icon--done" aria-hidden="true">✓</span>';
        }
        if (st.status === 'error') {
            return '<span class="tc-validate-step__icon tc-validate-step__icon--error" aria-hidden="true">!</span>';
        }
        if (st.status === 'timeout') {
            return '<span class="tc-validate-step__icon tc-validate-step__icon--timeout" aria-hidden="true" title="超时">⏱</span>';
        }
        if (st.status === 'skipped') {
            return '<span class="tc-validate-step__icon tc-validate-step__icon--skip" aria-hidden="true">–</span>';
        }
        return '<span class="tc-validate-step__icon tc-validate-step__icon--pending" aria-hidden="true">' + meta.index + '</span>';
    }

    function getValidateStepDisplayDetail(st, meta) {
        var stepText = st.detail;
        if (!stepText && st.status === 'running') stepText = meta.running;
        if (!stepText && st.status === 'pending') stepText = '等待中…';
        return stepText || '';
    }

    function clearValidationProgressShell(scope) {
        var list = vEl('tc-validate-issue-list', scope);
        if (!list) return;
        list.innerHTML = '';
    }

    /** 质量检查进度 UI：一次性挂载稳定 DOM 壳（顶部 loader 不再随 reasoning 流式重绘）。 */
    function ensureValidationProgressShell(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        var list = vEl('tc-validate-issue-list', scope);
        var prog = vData.validateProgress;
        if (!list || !prog) return false;
        if (list.querySelector('[data-tc-validate-progress-root="1"]')) return true;
        var stepTotal = getValidateStepTotal(prog);
        var html = '<div class="tc-validate-progress" data-tc-validate-progress-root="1" aria-live="polite">';
        html += '<div class="tc-validate-progress__center" data-tc-validate-progress-center="1">';
        html += '<div class="tc-validate-progress__loader" data-tc-validate-progress-loader="1" aria-hidden="true">';
        html += '<div class="tc-validate-progress__orbit tc-validate-progress__orbit--outer"></div>';
        html += '<div class="tc-validate-progress__orbit tc-validate-progress__orbit--inner"></div>';
        html += '<div class="tc-validate-progress__core"></div>';
        html += '<span class="tc-validate-progress__badge" data-tc-validate-progress-badge="1"></span>';
        html += '</div>';
        html += '<p class="tc-validate-progress__caption" data-tc-validate-progress-caption="1"></p>';
        html += '<div class="tc-validate-progress__bar" data-tc-validate-progress-bar="1" role="progressbar" aria-valuemin="0" aria-valuemax="100">';
        html += '<div class="tc-validate-progress__bar-fill" data-tc-validate-progress-bar-fill="1"></div>';
        html += '</div></div>';
        html += '<div class="tc-validate-progress__steps" data-tc-validate-progress-steps="1">';
        getValidateStepOrder(prog).forEach(function (id) {
            var meta = getValidateStepMeta(id, prog);
            if (!meta) return;
            html += '<div class="tc-validate-step tc-validate-step--pending" data-tc-validate-step-id="' + esc(id) + '">';
            html += '<div class="tc-validate-step__head">';
            html += '<span class="tc-validate-step__index" data-tc-validate-step-index="1">' + meta.index + '/' + stepTotal + '</span>';
            html += '<span class="tc-validate-step__icon-slot" data-tc-validate-step-icon="1"></span>';
            html += '<span class="tc-validate-step__label">' + esc(meta.label) + '</span></div>';
            html += '<p class="tc-validate-step__detail hidden" data-tc-validate-step-detail="1"></p>';
            if (id === 'llm') {
                html += '<div class="tc-validate-step__reasoning-wrap hidden" data-tc-validate-llm-reasoning-wrap="1">';
                html += '<div class="tc-qc-reason-perf" data-tc-qc-reason-perf="1">';
                html += '<button type="button" class="tc-qc-reason-perf__toggle" data-tc-qc-reason-toggle="1" aria-expanded="false">';
                html += '<span class="tc-qc-reason-perf__status" data-tc-qc-reason-status="1">AI 思考</span>';
                html += '<span class="tc-qc-reason-perf__count" data-tc-qc-reason-count="1">0 字</span>';
                html += '<span class="tc-qc-reason-perf__action" data-tc-qc-reason-action="1">展开</span>';
                html += '</button>';
                html += '<div class="tc-qc-reason-perf__body hidden" data-tc-qc-reason-body="1">';
                html += '<p class="tc-qc-reason-perf__omit hidden" data-tc-qc-reason-omit="1">上方已省略，仅显示最近内容</p>';
                html += '<pre class="tc-validate-step__reasoning" data-tc-validate-llm-reasoning="1"></pre>';
                html += '<button type="button" class="tc-qc-reason-perf__full hidden" data-tc-qc-reason-full="1">查看全文</button>';
                html += '</div></div></div>';
                html += '<div class="tc-validate-step__timeout-panel hidden" data-tc-validate-llm-timeout-panel="1" role="status">';
                html += '<p class="tc-validate-step__timeout-title">等待超时，已中止对照</p>';
                html += '<p class="tc-validate-step__timeout-desc">为保护服务稳定，AI 对照设有时限。格式与必填结果已保留，可稍后重试。</p>';
                html += '</div>';
            }
            html += '</div>';
        });
        html += '</div></div>';
        list.innerHTML = html;
        return true;
    }

    /** 质量检查进度 UI：分区同步 chrome（summary / loader 文案 / 步骤状态），不重建顶部动画节点。 */
    function syncValidationProgressChrome(scope, opts) {
        opts = opts || {};
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        var list = vEl('tc-validate-issue-list', scope);
        var summary = vEl('tc-validate-drawer-summary', scope);
        var prog = vData.validateProgress;
        var root = list && list.querySelector('[data-tc-validate-progress-root="1"]');
        if (!root || !prog) return false;
        var headline = getValidationProgressHeadline(prog);
        var pct = getValidationProgressPercent(prog);
        if (summary && opts.updateSummary !== false) {
            summary.textContent = getValidationProgressSummaryText(prog);
        }
        syncValidateDrawerTabsChromeDuringQcRun(scope);
        var badgeEl = root.querySelector('[data-tc-validate-progress-badge="1"]');
        var captionEl = root.querySelector('[data-tc-validate-progress-caption="1"]');
        var barEl = root.querySelector('[data-tc-validate-progress-bar="1"]');
        var barFillEl = root.querySelector('[data-tc-validate-progress-bar-fill="1"]');
        if (badgeEl) badgeEl.textContent = headline.badge;
        if (captionEl) captionEl.textContent = headline.caption;
        if (barEl) barEl.setAttribute('aria-valuenow', String(pct));
        if (barFillEl) barFillEl.style.width = pct + '%';
        root.classList.toggle('tc-validate-progress--failed', headline.badge === '失败');
        root.classList.toggle('tc-validate-progress--timeout', headline.badge === '超时');
        root.classList.toggle('tc-validate-progress--done', headline.badge === '完成');
        getValidateStepOrder(prog).forEach(function (id) {
            var meta = getValidateStepMeta(id, prog);
            if (!meta) return;
            var st = prog.steps[id] || { status: 'pending', detail: '' };
            var stepEl = root.querySelector('[data-tc-validate-step-id="' + id + '"]');
            if (!stepEl) return;
            stepEl.className = 'tc-validate-step tc-validate-step--' + st.status;
            var iconSlot = stepEl.querySelector('[data-tc-validate-step-icon="1"]');
            if (iconSlot) iconSlot.innerHTML = buildValidateStepIconHtml(st, meta);
            var detailEl = stepEl.querySelector('[data-tc-validate-step-detail="1"]');
            var detailText = getValidateStepDisplayDetail(st, meta);
            if (detailEl) {
                detailEl.textContent = detailText;
                detailEl.classList.toggle('hidden', !detailText);
            }
            if (id === 'llm') {
                var wrap = stepEl.querySelector('[data-tc-validate-llm-reasoning-wrap="1"]');
                var tip = stepEl.querySelector('[data-tc-validate-llm-timeout-panel="1"]');
                var reasoning = String(vData.validateLlmReasoning || '');
                var isTimeout = st.status === 'timeout';
                var showReasoning = !isTimeout && !!(reasoning.trim() || st.status === 'running');
                if (wrap) wrap.classList.toggle('hidden', !showReasoning);
                if (tip) tip.classList.toggle('hidden', !isTimeout);
            }
        });
        return true;
    }

    function renderValidationProgressUI(scope, opts) {
        opts = opts || {};
        scope = normalizeValidateScope(scope);
        if (!ensureValidationProgressShell(scope)) return;
        syncValidationProgressChrome(scope, opts);
        if (opts.syncReasoning === false) return;
        /* QC 流旁路：增量追加展示完整思考，禁止旧 patch 全文重写 */
        var vData = vScopeData(scope);
        if (vData && vData.qcReasoningStream) {
            qcReasoningStreamPaintDom(scope);
            return;
        }
        patchValidationReasoningDom(scope);
    }

    /** 质量检查 reasoning 流式更新入口（gen_batch 调用；仅 patch 思考区，不刷新顶部 chrome）。 */
    function syncValidationProgressReasoningStream(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (!vData.validateProgress) return;
        if (vData.qcReasoningStream) {
            ensureValidationProgressShell(scope);
            qcReasoningStreamSchedulePaint(scope);
            return;
        }
        if (typeof patchValidationReasoningDom === 'function' && patchValidationReasoningDom(scope)) {
            return;
        }
        ensureValidationProgressShell(scope);
        syncValidationProgressChrome(scope, { updateSummary: false, syncReasoning: false });
        patchValidationReasoningDom(scope);
    }

    /** 质量检查 AI 思考区：是否贴近底部（用于流式追加时决定是否自动滚底）。 */
    function isQcReasoningScrollNearBottom(pre, threshold) {
        if (!pre) return true;
        threshold = threshold != null ? threshold : 24;
        if (pre.scrollHeight <= pre.clientHeight) return true;
        return (pre.scrollHeight - pre.clientHeight - pre.scrollTop) <= threshold;
    }

    /** 流式 reasoning 增量更新：仅 patch AI 思考区，避免整段 progress 重绘导致顶部动画闪烁。 */
    function patchValidationReasoningDom(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        var list = vEl('tc-validate-issue-list', scope);
        var prog = vData.validateProgress;
        if (!list || !prog) return false;
        var wrap = list.querySelector('[data-tc-validate-llm-reasoning-wrap="1"]');
        var pre = list.querySelector('pre[data-tc-validate-llm-reasoning="1"]');
        if (!pre) return false;
        var llmStepGate = prog.steps && prog.steps.llm ? prog.steps.llm : null;
        if (llmStepGate && llmStepGate.status === 'timeout') {
            if (wrap) wrap.classList.add('hidden');
            return false;
        }
        if (wrap) wrap.classList.remove('hidden');
        var stickToBottom = isQcReasoningScrollNearBottom(pre);
        var reasoning = String(vData.validateLlmReasoning || '');
        var llmStep = llmStepGate;
        var llmStatus = llmStep ? llmStep.status : '';
        var cursor = pre.querySelector('.tc-validate-step__reasoning-cursor');
        if (cursor) cursor.parentNode.removeChild(cursor);
        pre.textContent = reasoning;
        if (llmStatus === 'running') {
            var cursorEl = document.createElement('span');
            cursorEl.className = 'tc-validate-step__reasoning-cursor';
            cursorEl.setAttribute('aria-hidden', 'true');
            cursorEl.textContent = '▍';
            pre.appendChild(cursorEl);
        }
        if (stickToBottom && pre.scrollHeight > pre.clientHeight) {
            pre.scrollTop = pre.scrollHeight;
        }
        return true;
    }

    /* ---------- QC 思考流旁路：完整展示；只把「本步新增」追加到屏幕，禁止全文重写（防 Firefox too much recursion） ---------- */
    var QC_REASONING_PAINT_MS = 120;
    var QC_REASONING_APPEND_CHUNK = 512;
    var QC_REASONING_PAINT_BUDGET = 1024;
    /* perf 模式：更松节流 + 视口尾长（不影响 legacy 全文追加路径） */
    var QC_REASONING_PERF_PAINT_MS = 280;
    var QC_REASONING_PERF_MIN_CHARS = 100;
    var QC_REASONING_PERF_VIEWPORT_CHARS = 3000;

    /**
     * 思考流性能模式开关（新方法）。
     * window.TC_QC_REASONING_PERF_MODE = false 可回退现行全文直播。
     */
    function qcReasoningPerfIsEnabled() {
        if (global.TC_QC_REASONING_PERF_MODE === false) return false;
        return true;
    }

    function ensureQcReasoningStreamState(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (!vData.qcReasoningStream) {
            vData.qcReasoningStream = {
                paintTimer: null,
                paintRaf: 0,
                dirty: false,
                paintedLen: 0,
                pendingDelta: '',
                genChatSyncedLen: 0,
                uiMode: 'collapsed',
                lastPaintAt: 0,
                charsSincePaint: 0,
                genChatMode: 'off_during_stream',
                genChatDoneSynced: false,
                viewportAppliedLen: 0
            };
        }
        if (vData.qcReasoningStream.uiMode == null) vData.qcReasoningStream.uiMode = 'collapsed';
        if (vData.qcReasoningStream.genChatMode == null) {
            vData.qcReasoningStream.genChatMode = 'off_during_stream';
        }
        if (vData.qcReasoningStream.charsSincePaint == null) vData.qcReasoningStream.charsSincePaint = 0;
        if (vData.qcReasoningStream.lastPaintAt == null) vData.qcReasoningStream.lastPaintAt = 0;
        if (vData.qcReasoningStream.genChatDoneSynced == null) {
            vData.qcReasoningStream.genChatDoneSynced = false;
        }
        if (vData.qcReasoningStream.viewportAppliedLen == null) {
            vData.qcReasoningStream.viewportAppliedLen = 0;
        }
        return vData.qcReasoningStream;
    }

    /** perf：确保折叠壳存在并绑定展开（新方法，不改旧 label 路径语义） */
    function qcReasoningPerfEnsureChrome(wrap) {
        if (!wrap) return null;
        var root = wrap.querySelector('[data-tc-qc-reason-perf="1"]');
        if (!root) {
            var preOld = wrap.querySelector('pre[data-tc-validate-llm-reasoning="1"]');
            root = document.createElement('div');
            root.className = 'tc-qc-reason-perf';
            root.setAttribute('data-tc-qc-reason-perf', '1');
            root.innerHTML =
                '<button type="button" class="tc-qc-reason-perf__toggle" data-tc-qc-reason-toggle="1" aria-expanded="false">' +
                    '<span class="tc-qc-reason-perf__status" data-tc-qc-reason-status="1">AI 思考</span>' +
                    '<span class="tc-qc-reason-perf__count" data-tc-qc-reason-count="1">0 字</span>' +
                    '<span class="tc-qc-reason-perf__action" data-tc-qc-reason-action="1">展开</span>' +
                '</button>' +
                '<div class="tc-qc-reason-perf__body hidden" data-tc-qc-reason-body="1">' +
                    '<p class="tc-qc-reason-perf__omit hidden" data-tc-qc-reason-omit="1">上方已省略，仅显示最近内容</p>' +
                    '<pre class="tc-validate-step__reasoning" data-tc-validate-llm-reasoning="1"></pre>' +
                    '<button type="button" class="tc-qc-reason-perf__full hidden" data-tc-qc-reason-full="1">查看全文</button>' +
                '</div>';
            wrap.innerHTML = '';
            wrap.appendChild(root);
            if (preOld && preOld.textContent) {
                var preNew = root.querySelector('pre[data-tc-validate-llm-reasoning="1"]');
                if (preNew) preNew.textContent = preOld.textContent;
            }
        }
        if (!wrap._tcQcReasonPerfBound) {
            wrap._tcQcReasonPerfBound = true;
            wrap.addEventListener('click', function (ev) {
                var t = ev.target;
                if (!t) return;
                var toggle = t.closest ? t.closest('[data-tc-qc-reason-toggle]') : null;
                var fullBtn = t.closest ? t.closest('[data-tc-qc-reason-full]') : null;
                var aside = wrap.closest('[id^="tc-validate-drawer-"]');
                var scope = VALIDATE_SCOPE_SINGLE;
                if (aside && aside.id && aside.id.indexOf('tc-validate-drawer-') === 0) {
                    scope = normalizeValidateScope(aside.id.slice('tc-validate-drawer-'.length));
                }
                var st = ensureQcReasoningStreamState(scope);
                if (toggle) {
                    ev.preventDefault();
                    if (st.uiMode === 'collapsed') st.uiMode = 'viewport';
                    else st.uiMode = 'collapsed';
                    st.viewportAppliedLen = -1;
                    qcReasoningPaintDomPerf(scope);
                    return;
                }
                if (fullBtn) {
                    ev.preventDefault();
                    st.uiMode = 'full';
                    st.viewportAppliedLen = -1;
                    qcReasoningPaintDomPerf(scope);
                }
            });
        }
        return root;
    }

    function qcReasoningPerfShouldPaintNow(st, force) {
        if (force) return true;
        if (!st) return true;
        var now = Date.now();
        if (!st.lastPaintAt) return true;
        if ((now - st.lastPaintAt) >= QC_REASONING_PERF_PAINT_MS) return true;
        if ((st.charsSincePaint || 0) >= QC_REASONING_PERF_MIN_CHARS) return true;
        return false;
    }

    /** perf 绘制入口（新方法）：折叠只更新计数；展开只画尾部视口或可选全文 */
    function qcReasoningPaintDomPerf(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        var st = ensureQcReasoningStreamState(scope);
        var list = vEl('tc-validate-issue-list', scope);
        var prog = vData.validateProgress;
        if (!list || !prog) return false;
        var wrap = list.querySelector('[data-tc-validate-llm-reasoning-wrap="1"]');
        if (!wrap) return false;
        var root = qcReasoningPerfEnsureChrome(wrap);
        var pre = wrap.querySelector('pre[data-tc-validate-llm-reasoning="1"]');
        if (!pre || !root) return false;

        var llmStep = prog.steps && prog.steps.llm ? prog.steps.llm : null;
        var llmStatus = llmStep ? llmStep.status : '';
        if (llmStatus === 'timeout') {
            wrap.classList.add('hidden');
            st.dirty = false;
            st.pendingDelta = '';
            return false;
        }

        /* 消费 pending 进内存指针，perf 不依赖 paintedLen 追加 */
        if (st.pendingDelta) {
            st.charsSincePaint = (st.charsSincePaint || 0) + st.pendingDelta.length;
            st.pendingDelta = '';
        }
        var full = String(vData.validateLlmReasoning || '');
        if (!full.trim() && llmStatus !== 'running') {
            wrap.classList.add('hidden');
            st.dirty = false;
            return false;
        }
        wrap.classList.remove('hidden');

        var force = llmStatus !== 'running' || st.uiMode !== 'collapsed' || st.viewportAppliedLen < 0;
        if (!qcReasoningPerfShouldPaintNow(st, force) && llmStatus === 'running' && st.uiMode === 'collapsed') {
            var countQuick = root.querySelector('[data-tc-qc-reason-count="1"]');
            var statusQuick = root.querySelector('[data-tc-qc-reason-status="1"]');
            if (countQuick) countQuick.textContent = full.length + ' 字';
            if (statusQuick) statusQuick.textContent = 'AI 思考中…';
            st.dirty = true;
            qcReasoningStreamSchedulePaint(scope);
            return true;
        }

        var statusEl = root.querySelector('[data-tc-qc-reason-status="1"]');
        var countEl = root.querySelector('[data-tc-qc-reason-count="1"]');
        var actionEl = root.querySelector('[data-tc-qc-reason-action="1"]');
        var bodyEl = root.querySelector('[data-tc-qc-reason-body="1"]');
        var omitEl = root.querySelector('[data-tc-qc-reason-omit="1"]');
        var fullBtn = root.querySelector('[data-tc-qc-reason-full="1"]');
        var toggleBtn = root.querySelector('[data-tc-qc-reason-toggle="1"]');

        var n = full.length;
        if (countEl) countEl.textContent = n + ' 字';
        if (statusEl) {
            statusEl.textContent = llmStatus === 'running'
                ? 'AI 思考中…'
                : (llmStatus === 'done' || llmStatus === 'success' ? '思考完成' : 'AI 思考');
        }

        var mode = st.uiMode || 'collapsed';
        if (mode === 'collapsed') {
            if (bodyEl) bodyEl.classList.add('hidden');
            if (actionEl) actionEl.textContent = '展开';
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
            try { pre.textContent = ''; } catch (eClear) { /* ignore */ }
            st.paintedLen = 0;
            st.viewportAppliedLen = 0;
        } else {
            if (bodyEl) bodyEl.classList.remove('hidden');
            if (actionEl) actionEl.textContent = '收起';
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
            var showFull = mode === 'full';
            var text = showFull ? full : full.slice(-QC_REASONING_PERF_VIEWPORT_CHARS);
            var omitted = !showFull && full.length > QC_REASONING_PERF_VIEWPORT_CHARS;
            if (omitEl) omitEl.classList.toggle('hidden', !omitted);
            if (fullBtn) fullBtn.classList.toggle('hidden', showFull || !omitted);
            /* 用全文长度作版本号：尾部视口内容会滑动，不能用 text.length（常恒为 W） */
            if (st.viewportAppliedLen !== full.length || st.viewportAppliedLen < 0) {
                try {
                    pre.textContent = text;
                    if (llmStatus === 'running') {
                        var cursorEl = document.createElement('span');
                        cursorEl.className = 'tc-validate-step__reasoning-cursor';
                        cursorEl.setAttribute('aria-hidden', 'true');
                        cursorEl.textContent = '▍';
                        pre.appendChild(cursorEl);
                    }
                } catch (eSet) { /* ignore */ }
                st.viewportAppliedLen = full.length;
                st.paintedLen = text.length;
                if (isQcReasoningScrollNearBottom(pre) && pre.scrollHeight > pre.clientHeight) {
                    pre.scrollTop = pre.scrollHeight;
                }
            } else {
                try { qcReasoningStreamSyncCursor(pre, llmStatus); } catch (eCur) { /* ignore */ }
            }
        }

        st.lastPaintAt = Date.now();
        st.charsSincePaint = 0;
        st.dirty = false;

        if (llmStatus !== 'running') {
            qcReasoningPerfSyncGenChatOnDone(scope);
        }
        return true;
    }

    /** perf：流式结束后一次性同步 GenChat（新方法，避免流式双通道卡顿） */
    function qcReasoningPerfSyncGenChatOnDone(scope) {
        scope = normalizeValidateScope(scope);
        var st = ensureQcReasoningStreamState(scope);
        if (st.genChatDoneSynced) return;
        if (st.genChatMode === 'legacy') return;
        if (!shouldSyncValidateToGenChat(scope)) return;
        var full = String(vScopeData(scope).validateLlmReasoning || '');
        if (!full) {
            st.genChatDoneSynced = true;
            return;
        }
        try {
            if (global.TcGenChatPipeline &&
                typeof global.TcGenChatPipeline.appendValidateReasoningContent === 'function') {
                var already = st.genChatSyncedLen || 0;
                if (already < full.length) {
                    global.TcGenChatPipeline.appendValidateReasoningContent(full.slice(already));
                    st.genChatSyncedLen = full.length;
                }
            }
        } catch (eSync) { /* ignore */ }
        st.genChatDoneSynced = true;
    }

    function qcReasoningStreamReset(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        var st = ensureQcReasoningStreamState(scope);
        if (st.paintTimer) {
            global.clearTimeout(st.paintTimer);
            st.paintTimer = null;
        }
        if (st.paintRaf && typeof global.cancelAnimationFrame === 'function') {
            global.cancelAnimationFrame(st.paintRaf);
            st.paintRaf = 0;
        }
        st.dirty = false;
        st.paintedLen = 0;
        st.pendingDelta = '';
        st.genChatSyncedLen = 0;
        st.uiMode = 'collapsed';
        st.lastPaintAt = 0;
        st.charsSincePaint = 0;
        st.genChatDoneSynced = false;
        st.viewportAppliedLen = 0;
        vData.validateLlmReasoning = '';
        var list = vEl('tc-validate-issue-list', scope);
        if (list) {
            var pre = list.querySelector('pre[data-tc-validate-llm-reasoning="1"]');
            if (pre) {
                try { pre.textContent = ''; } catch (e0) { /* ignore */ }
            }
            var wrap = list.querySelector('[data-tc-validate-llm-reasoning-wrap="1"]');
            var omit = wrap && wrap.querySelector('[data-tc-qc-reasoning-omit="1"]');
            var btn = wrap && wrap.querySelector('[data-tc-qc-reasoning-expand="1"]');
            if (omit && omit.parentNode) omit.parentNode.removeChild(omit);
            if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
            var countEl = wrap && wrap.querySelector('[data-tc-qc-reason-count="1"]');
            if (countEl) countEl.textContent = '0 字';
            var bodyEl = wrap && wrap.querySelector('[data-tc-qc-reason-body="1"]');
            if (bodyEl) bodyEl.classList.add('hidden');
        }
        if (global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.resetValidateReasoning === 'function' &&
            shouldSyncValidateToGenChat(scope)) {
            global.TcGenChatPipeline.resetValidateReasoning();
        }
    }

    function qcReasoningStreamEnsureTextNode(pre) {
        var cursor = pre.querySelector('.tc-validate-step__reasoning-cursor');
        var textNode = null;
        var i;
        for (i = 0; i < pre.childNodes.length; i++) {
            if (pre.childNodes[i].nodeType === 3) {
                textNode = pre.childNodes[i];
                break;
            }
        }
        if (!textNode) {
            textNode = document.createTextNode('');
            if (cursor) pre.insertBefore(textNode, cursor);
            else pre.appendChild(textNode);
        }
        return { textNode: textNode, cursor: cursor };
    }

    function qcReasoningStreamAppendTextNode(textNode, delta) {
        if (!textNode || !delta) return;
        var i = 0;
        while (i < delta.length) {
            var piece = delta.slice(i, i + QC_REASONING_APPEND_CHUNK);
            if (typeof textNode.appendData === 'function') textNode.appendData(piece);
            else textNode.nodeValue = String(textNode.nodeValue || '') + piece;
            i += QC_REASONING_APPEND_CHUNK;
        }
    }

    function qcReasoningStreamReadShownText(pre) {
        if (!pre) return '';
        try {
            return String(qcReasoningStreamEnsureTextNode(pre).textNode.nodeValue || '');
        } catch (eRead) {
            return '';
        }
    }

    function qcReasoningStreamSyncCursor(pre, llmStatus) {
        var cursor = pre.querySelector('.tc-validate-step__reasoning-cursor');
        if (llmStatus === 'running') {
            if (!cursor) {
                cursor = document.createElement('span');
                cursor.className = 'tc-validate-step__reasoning-cursor';
                cursor.setAttribute('aria-hidden', 'true');
                cursor.textContent = '▍';
                pre.appendChild(cursor);
            }
        } else if (cursor && cursor.parentNode) {
            cursor.parentNode.removeChild(cursor);
        }
    }

    function qcReasoningStreamSyncGenChatDelta(scope, delta) {
        if (!delta) return;
        if (!shouldSyncValidateToGenChat(scope)) return;
        if (!global.TcGenChatPipeline) return;
        /* perf：流式中默认不同步，避免双通道卡顿；结束时由 qcReasoningPerfSyncGenChatOnDone 补一次 */
        if (qcReasoningPerfIsEnabled()) {
            var st = ensureQcReasoningStreamState(scope);
            var vData = vScopeData(scope);
            var prog = vData && vData.validateProgress;
            var llm = prog && prog.steps && prog.steps.llm ? prog.steps.llm : null;
            if (st.genChatMode !== 'legacy' && llm && llm.status === 'running') {
                return;
            }
        }
        try {
            if (typeof global.TcGenChatPipeline.appendValidateReasoningContent === 'function') {
                global.TcGenChatPipeline.appendValidateReasoningContent(delta);
            }
        } catch (eSync) { /* GenChat 增量失败不影响 QC 抽屉 */ }
    }

    /** 只把尚未抄到屏幕上的新增内容追加到 pre；绝不整本 textContent 重写；大段分帧追加 */
    function qcReasoningStreamPaintDom(scope) {
        scope = normalizeValidateScope(scope);
        if (qcReasoningPerfIsEnabled()) {
            return qcReasoningPaintDomPerf(scope);
        }
        var vData = vScopeData(scope);
        var st = ensureQcReasoningStreamState(scope);
        var list = vEl('tc-validate-issue-list', scope);
        var prog = vData.validateProgress;
        if (!list || !prog) return false;
        var wrap = list.querySelector('[data-tc-validate-llm-reasoning-wrap="1"]');
        var pre = list.querySelector('pre[data-tc-validate-llm-reasoning="1"]');
        if (!pre) return false;
        /* legacy：若存在 perf 壳，强制展开正文区，保持旧全文追加行为 */
        var bodyLegacy = wrap && wrap.querySelector('[data-tc-qc-reason-body="1"]');
        if (bodyLegacy) bodyLegacy.classList.remove('hidden');
        var llmStep = prog.steps && prog.steps.llm ? prog.steps.llm : null;
        var llmStatus = llmStep ? llmStep.status : '';
        if (llmStatus === 'timeout') {
            if (wrap) wrap.classList.add('hidden');
            return false;
        }
        var full = String(vData.validateLlmReasoning || '');
        if (!full.trim() && llmStatus !== 'running') {
            if (wrap) wrap.classList.add('hidden');
            try { qcReasoningStreamSyncCursor(pre, llmStatus); } catch (eCur) { /* ignore */ }
            st.dirty = false;
            return false;
        }
        if (wrap) wrap.classList.remove('hidden');

        var delta = st.pendingDelta || '';
        st.pendingDelta = '';
        /* DOM 被重建时 paintedLen 可能失真：按实际文本节点长度对齐后再追加 */
        try {
            var shownLen = qcReasoningStreamReadShownText(pre).length;
            if (shownLen !== st.paintedLen) st.paintedLen = shownLen;
        } catch (eProbe) { /* ignore */ }
        if (!delta && full.length > st.paintedLen) {
            delta = full.slice(st.paintedLen);
        }
        if (!delta && full.length < st.paintedLen) {
            /* 缓冲缩短：只对齐指针，禁止清空后整段回写（Firefox too much recursion） */
            st.paintedLen = full.length;
            delta = '';
        }

        var morePending = false;
        try {
            if (delta) {
                if (delta.length > QC_REASONING_PAINT_BUDGET) {
                    morePending = true;
                    st.pendingDelta = delta.slice(QC_REASONING_PAINT_BUDGET) + (st.pendingDelta || '');
                    delta = delta.slice(0, QC_REASONING_PAINT_BUDGET);
                }
                var stickToBottom = isQcReasoningScrollNearBottom(pre);
                var parts = qcReasoningStreamEnsureTextNode(pre);
                qcReasoningStreamAppendTextNode(parts.textNode, delta);
                st.paintedLen += delta.length;
                if (st.genChatSyncedLen < st.paintedLen) {
                    var genDelta = full.slice(st.genChatSyncedLen, st.paintedLen);
                    st.genChatSyncedLen = st.paintedLen;
                    qcReasoningStreamSyncGenChatDelta(scope, genDelta);
                }
                qcReasoningStreamSyncCursor(pre, llmStatus);
                if (stickToBottom && pre.scrollHeight > pre.clientHeight) {
                    pre.scrollTop = pre.scrollHeight;
                }
            } else {
                qcReasoningStreamSyncCursor(pre, llmStatus);
            }
        } catch (paintErr) {
            /* 绘制失败时丢弃剩余 pending，保留已上屏内容，避免递归把整次 QC 打成失败 */
            st.pendingDelta = '';
            morePending = false;
            try { qcReasoningStreamSyncCursor(pre, llmStatus); } catch (eCur2) { /* ignore */ }
        }
        st.dirty = false;
        if (morePending || st.pendingDelta) {
            qcReasoningStreamSchedulePaint(scope);
        }
        return true;
    }

    function qcReasoningStreamSchedulePaint(scope) {
        scope = normalizeValidateScope(scope);
        var st = ensureQcReasoningStreamState(scope);
        st.dirty = true;
        if (st.paintTimer) return;
        st.paintTimer = global.setTimeout(function () {
            st.paintTimer = null;
            if (typeof global.requestAnimationFrame === 'function') {
                st.paintRaf = global.requestAnimationFrame(function () {
                    st.paintRaf = 0;
                    if (st.dirty || st.pendingDelta) qcReasoningStreamPaintDom(scope);
                });
            } else if (st.dirty || st.pendingDelta) {
                qcReasoningStreamPaintDom(scope);
            }
        }, qcReasoningPerfIsEnabled() ? QC_REASONING_PERF_PAINT_MS : QC_REASONING_PAINT_MS);
    }

    function qcReasoningStreamFlush(scope) {
        scope = normalizeValidateScope(scope);
        var st = ensureQcReasoningStreamState(scope);
        if (st.paintTimer) {
            global.clearTimeout(st.paintTimer);
            st.paintTimer = null;
        }
        if (st.paintRaf && typeof global.cancelAnimationFrame === 'function') {
            global.cancelAnimationFrame(st.paintRaf);
            st.paintRaf = 0;
        }
        qcReasoningStreamPaintDom(scope);
    }

    /** 质量检查专用：流式追加思考（旁路，不影响旧 appendValidateLlmReasoning） */
    function qcReasoningStreamAppend(scope, chunk) {
        scope = normalizeValidateScope(scope);
        var piece = String(chunk || '');
        if (!piece) return;
        var vData = vScopeData(scope);
        var st = ensureQcReasoningStreamState(scope);
        vData.validateLlmReasoning = (vData.validateLlmReasoning || '') + piece;
        st.pendingDelta += piece;
        if (vData.validateProgress) {
            ensureValidationProgressShell(scope);
            qcReasoningStreamSchedulePaint(scope);
        }
    }

    /**
     * 质量检查专用：整段回写思考。
     * 若新文本是旧文本的延长，只追加后缀；若不一致则保留已流式上屏内容，禁止清空后整段回写。
     */
    function qcReasoningStreamSet(scope, text) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        var st = ensureQcReasoningStreamState(scope);
        var next = String(text || '');
        var prev = String(vData.validateLlmReasoning || '');
        if (next === prev) {
            qcReasoningStreamSchedulePaint(scope);
            return;
        }
        if (prev && next.length >= prev.length && next.slice(0, prev.length) === prev) {
            var suffix = next.slice(prev.length);
            vData.validateLlmReasoning = next;
            if (suffix) st.pendingDelta += suffix;
        } else {
            /* 与流式稿不一致：只更新内存，绝不 textContent='' 后整段重灌（Firefox too much recursion） */
            vData.validateLlmReasoning = next;
            var list = vEl('tc-validate-issue-list', scope);
            var pre = list && list.querySelector('pre[data-tc-validate-llm-reasoning="1"]');
            var shown = qcReasoningStreamReadShownText(pre);
            if (shown && next.length >= shown.length && next.slice(0, shown.length) === shown) {
                st.paintedLen = shown.length;
                st.pendingDelta = next.slice(shown.length);
                if (st.genChatSyncedLen > shown.length) st.genChatSyncedLen = shown.length;
            } else if (shown) {
                st.paintedLen = shown.length;
                st.pendingDelta = '';
                if (st.genChatSyncedLen > shown.length) st.genChatSyncedLen = shown.length;
            } else {
                st.paintedLen = 0;
                st.pendingDelta = next;
                st.genChatSyncedLen = 0;
            }
        }
        if (vData.validateProgress) {
            ensureValidationProgressShell(scope);
            qcReasoningStreamSchedulePaint(scope);
        }
    }

    /** 质量检查专用：done 后安全应用思考稿（绘制失败不影响对照结果） */
    function qcReasoningStreamApplyDoneReasoning(scope, text) {
        scope = normalizeValidateScope(scope);
        try {
            if (text) qcReasoningStreamSet(scope, text);
            else qcReasoningStreamFlush(scope);
            if (qcReasoningPerfIsEnabled()) {
                try { qcReasoningPerfSyncGenChatOnDone(scope); } catch (eDone) { /* ignore */ }
            }
        } catch (eApply) {
            try {
                var vData = vScopeData(scope);
                if (text) vData.validateLlmReasoning = String(text);
            } catch (eBuf) { /* ignore */ }
        }
    }

    function finishQcLlmStepUi(scope, status, detail, extra) {
        try {
            qcReasoningStreamFlush(scope);
            if (qcReasoningPerfIsEnabled() && status && status !== 'running' && status !== 'timeout') {
                try { qcReasoningPerfSyncGenChatOnDone(scope); } catch (eDone2) { /* ignore */ }
            }
        } catch (eFlush) { /* 思考区刷新失败不阻断步骤收尾 */ }
        setValidationProgressStep('llm', status, detail, scope, extra);
    }

    /** 质量检查专用：超时收尾 — 清空并隐藏 AI 思考区，改用超时提示样式，并恢复表格区 */
    function finishQcLlmStepUiTimedOut(scope, detail) {
        scope = normalizeValidateScope(scope);
        qcReasoningStreamReset(scope);
        var list = vEl('tc-validate-issue-list', scope);
        if (list) {
            var wrap = list.querySelector('[data-tc-validate-llm-reasoning-wrap="1"]');
            var pre = list.querySelector('pre[data-tc-validate-llm-reasoning="1"]');
            if (pre) {
                try { pre.textContent = ''; } catch (e0) { /* ignore */ }
            }
            if (wrap) wrap.classList.add('hidden');
        }
        setValidationProgressStep(
            'llm',
            'timeout',
            detail || 'AI 对照超时',
            scope,
            { skipReason: LLM_SKIP_REASON.TIMEOUT }
        );
        restoreQcTableAreaAfterAbort();
        /* 同步抽屉摘要，避免短暂显示「未发现问题」 */
        var summary = vEl('tc-validate-drawer-summary', scope);
        if (summary) {
            summary.textContent = 'AI 对照超时，格式结果已保留';
        }
    }

    /** 质量检查专用：AI 对照失败收尾 — 保留思考区便于排查，立即恢复表格区蒙层 */
    function finishQcLlmStepUiErrored(scope, detail) {
        scope = normalizeValidateScope(scope);
        try {
            qcReasoningStreamFlush(scope);
        } catch (eFlush) { /* ignore */ }
        setValidationProgressStep(
            'llm',
            'error',
            detail || 'AI 对照失败',
            scope,
            { skipReason: LLM_SKIP_REASON.ERROR }
        );
        restoreQcTableAreaAfterAbort();
        var summary = vEl('tc-validate-drawer-summary', scope);
        if (summary) {
            summary.textContent = 'AI 对照失败，格式结果已保留';
        }
    }

    function isQcLlmAbortTimeout(err) {
        if (err && err.name === 'AbortError') return true;
        var msg = String((err && err.message) || '');
        return /超时|timeout/i.test(msg);
    }

    function scheduleAutoValidationAfterTablePaint(meta) {
        meta = meta || {};
        if (isGenChatPipelineFailed()) {
            releaseWorkbenchLocksIfIdle();
            return Promise.resolve();
        }
        if (isSingleGenAutoValidateBlocked(meta)) {
            releaseWorkbenchLocksIfIdle();
            return Promise.resolve();
        }
        return new Promise(function (resolve) {
            function startValidation() {
                if (isSingleGenAutoValidateBlocked(meta)) {
                    releaseWorkbenchLocksIfIdle();
                    resolve();
                    return;
                }
                genChatValidateSyncPending = true;
                syncPromptSendBtnAfterValidationChange();
                syncWorkbenchBusyChrome();
                Promise.resolve(runValidation(true)).then(resolve).catch(resolve).finally(function () {
                    var vData = vScopeData(VALIDATE_SCOPE_SINGLE);
                    if (genChatValidateSyncPending && !vData.deferValidateDrawerForGenChat) {
                        genChatValidateSyncPending = false;
                    }
                    syncPromptSendBtnAfterValidationChange();
                    releaseWorkbenchLocksIfIdle();
                    syncWorkbenchBusyChrome();
                });
            }

            function tryRun(attempt) {
                if (isSingleGenAutoValidateBlocked(meta)) {
                    releaseWorkbenchLocksIfIdle();
                    resolve();
                    return;
                }
                syncBatchStateFromCore();
                var batchPayload = collectBatchRowsPayloadForValidation(VALIDATE_SCOPE_SINGLE);
                var hasContent = batchPayloadHasCellContent(batchPayload);
                if (batchPayload.parseResultBatch && batchPayload.rows.length && hasContent) {
                    startValidation();
                    return;
                }
                if (!batchPayload.rows.length || !hasContent) {
                    if (batchPayload.mindmapBatch || isMindmapBatchActive()) {
                        if (typeof global.switchTcRightView === 'function') {
                            global.switchTcRightView('mindmap');
                        }
                        if (typeof global.renderTcMindmap === 'function') {
                            global.renderTcMindmap();
                        }
                    } else if (typeof global.switchTcRightView === 'function') {
                        global.switchTcRightView('table');
                        if (typeof global.renderTableBody === 'function') {
                            global.renderTableBody({ reload: true });
                        }
                    }
                    if (attempt < 40) {
                        window.setTimeout(function () { tryRun(attempt + 1); }, 100);
                        return;
                    }
                    failPendingGenChatQualityCheck('用例解析未产出可检查的用例');
                    releaseWorkbenchLocksIfIdle();
                    resolve();
                    return;
                }
                if (batchPayload.mindmapBatch || isMindmapBatchActive()) {
                    if (typeof global.switchTcRightView === 'function') {
                        global.switchTcRightView('mindmap');
                    }
                    if (typeof global.renderTcMindmap === 'function') {
                        global.renderTcMindmap();
                    }
                    requestAnimationFrame(function () {
                        requestAnimationFrame(startValidation);
                    });
                    return;
                }
                if (typeof global.switchTcRightView === 'function') {
                    global.switchTcRightView('table');
                }
                var paintPromise = typeof global.renderTableBody === 'function'
                    ? Promise.resolve(global.renderTableBody({ reload: true }))
                    : Promise.resolve();
                paintPromise.then(function () {
                    requestAnimationFrame(function () {
                        requestAnimationFrame(startValidation);
                    });
                }).catch(function () {
                    requestAnimationFrame(function () {
                        requestAnimationFrame(startValidation);
                    });
                });
            }
            tryRun(0);
        });
    }



    var TC_FLOAT_STACK_BASE = 10200;
    var tcFloatStackCounter = 0;

    function findTcFloatPanelFromTarget(target) {
        if (!target || typeof target.closest !== 'function') return null;
        var validateSingle = target.closest('#tc-validate-drawer-single');
        if (validateSingle) return validateSingle;
        var validateAgent = target.closest('#tc-validate-drawer-agent');
        if (validateAgent) return validateAgent;
        var agent = target.closest('#tc-agent-drawer');
        if (agent) return agent;
        return null;
    }

    function bringTcFloatPanelToFront(el) {
        if (!el) return;
        if (el.id === 'left-panel') {
            el.style.removeProperty('z-index');
            el.classList.add('tc-workbench-float--active');
            return;
        }
        tcFloatStackCounter += 1;
        var z = TC_FLOAT_STACK_BASE + tcFloatStackCounter;
        el.style.setProperty('z-index', String(z), 'important');
        el.classList.add('tc-workbench-float--active');
    }

    function shouldBringTcFloatPanelToFront(panel, target) {
        if (!panel || !target) return false;
        if (panel.id === 'tc-agent-drawer') {
            if (global.TcAgentOrchestrator && typeof global.TcAgentOrchestrator.isAgentJobRunning === 'function' &&
                global.TcAgentOrchestrator.isAgentJobRunning()) {
                if (!target.closest('[data-agent-drag-handle]')) return false;
            }
        }
        return true;
    }

    function bindTcFloatPanelStack() {
        if (bindTcFloatPanelStack._done) return;
        bindTcFloatPanelStack._done = true;
        document.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            var panel = findTcFloatPanelFromTarget(e.target);
            if (!panel || !shouldBringTcFloatPanelToFront(panel, e.target)) return;
            bringTcFloatPanelToFront(panel);
        }, true);
    }

    function ensureValidateDrawerCoverageSize(scope) {
        scope = normalizeValidateScope(scope);
        if (isValidateSingleSideDrawer(scope)) {
            syncValidateSingleSideCoverageFitLayout(scope);
            return;
        }
        ensureValidateDrawerDefaultSize(scope);
    }

    function ensureValidateDrawerDefaultSize(scope) {
        scope = normalizeValidateScope(scope);
        if (isValidateSingleSideDrawer(scope)) return;
        var floatState = vScopeData(scope).floatState;
        if (floatState.maximized) return;
        var preset = validateFloatSizes[2] || validateFloatSizes[1];
        if (floatState.sizeIndex < 2) floatState.sizeIndex = 2;
        if (!floatState.customWidth || floatState.customWidth < preset.w) {
            floatState.customWidth = preset.w;
        }
        if (!floatState.customHeight || floatState.customHeight < preset.h) {
            floatState.customHeight = preset.h;
        }
        applyValidateFloatLayout(scope);
    }

    function getFloatPanelStackZIndex() {
        return TC_FLOAT_STACK_BASE + tcFloatStackCounter;
    }

    var validateFloatSizes = [
        { w: 320, h: 380 },
        { w: 400, h: 480 },
        { w: 600, h: 620 },
        { w: 680, h: 780 }
    ];

    var TC_VALIDATE_SINGLE_DRAWER_GAP = 12;
    var TC_VALIDATE_SINGLE_MINI_SIZE = 48;
    var TC_VALIDATE_SINGLE_DEFAULT_W = 360;
    var TC_VALIDATE_SINGLE_MIN_W = 280;
    var TC_VALIDATE_SINGLE_MAX_W = 720;
    var TC_VALIDATE_SINGLE_MIN_H = 200;
    var validateSingleSideState = { left: null, top: null, height: null, width: null };
    var validateSingleMiniState = { left: null, top: null, offsetX: null, offsetY: null };
    var validateSingleSidePinnedLayout = null;
    /** 用户是否手动改过侧边抽屉宽高（仅当前页会话；切页重置） */
    var validateSingleSideUserResized = false;

    /** 质量检查侧边抽屉：记录固定布局（首次打开/用户调整后），重开时不随悬浮钮位置变化 */
    function captureValidateSingleSidePinnedLayout(source) {
        source = source || validateSingleSideState;
        if (source.left == null || source.top == null) return;
        validateSingleSidePinnedLayout = {
            left: source.left,
            top: source.top,
            height: source.height,
            width: source.width
        };
    }

    function markValidateSingleSideUserResized() {
        validateSingleSideUserResized = true;
        captureValidateSingleSidePinnedLayout();
    }

    /** 切需求页/离开工作台：恢复默认抽屉尺寸会话态 */
    function resetValidateSingleSideDrawerLayoutSession() {
        validateSingleSideState = { left: null, top: null, height: null, width: null };
        validateSingleSidePinnedLayout = null;
        validateSingleSideUserResized = false;
    }

    function restoreValidateSingleSidePinnedLayoutForReopen() {
        if (!validateSingleSidePinnedLayout) return false;
        validateSingleSideState.left = validateSingleSidePinnedLayout.left;
        validateSingleSideState.top = validateSingleSidePinnedLayout.top;
        validateSingleSideState.height = validateSingleSidePinnedLayout.height;
        validateSingleSideState.width = validateSingleSidePinnedLayout.width;
        return true;
    }

    function snapshotValidateSingleSideDrawerLayoutFromDom() {
        var drawer = getValidatePanel(VALIDATE_SCOPE_SINGLE);
        if (drawer && isValidateSingleSideDrawerEl(drawer) &&
            drawer.classList.contains('tc-validate-drawer--open')) {
            var rect = drawer.getBoundingClientRect();
            if (rect.width && rect.height) {
                validateSingleSideState.left = Math.round(rect.left);
                validateSingleSideState.top = Math.round(rect.top);
                validateSingleSideState.height = Math.round(rect.height);
                validateSingleSideState.width = Math.round(rect.width);
            }
        }
        captureValidateSingleSidePinnedLayout();
    }

    function getValidateSingleMiniMetrics(mini) {
        if (!mini) {
            return { width: TC_VALIDATE_SINGLE_MINI_SIZE, height: TC_VALIDATE_SINGLE_MINI_SIZE };
        }
        var rect = mini.getBoundingClientRect();
        var width = rect.width || mini.offsetWidth || TC_VALIDATE_SINGLE_MINI_SIZE;
        var height = rect.height || mini.offsetHeight || TC_VALIDATE_SINGLE_MINI_SIZE;
        return {
            width: Math.max(32, Math.round(width)),
            height: Math.max(32, Math.round(height))
        };
    }

    function clampValidateSingleMiniPosition(left, top, metrics) {
        metrics = metrics || { width: TC_VALIDATE_SINGLE_MINI_SIZE, height: TC_VALIDATE_SINGLE_MINI_SIZE };
        var gap = 8;
        var maxLeft = window.innerWidth - metrics.width - gap;
        var maxTop = window.innerHeight - metrics.height - gap;
        left = Math.max(gap, Math.min(left, maxLeft));
        top = Math.max(gap, Math.min(top, maxTop));
        return { left: Math.round(left), top: Math.round(top) };
    }

    function applyValidateSingleMiniInlinePosition(mini, left, top, metrics) {
        if (!mini) return null;
        var clamped = clampValidateSingleMiniPosition(left, top, metrics);
        mini.style.setProperty('bottom', 'auto', 'important');
        mini.style.setProperty('right', 'auto', 'important');
        mini.style.setProperty('left', clamped.left + 'px', 'important');
        mini.style.setProperty('top', clamped.top + 'px', 'important');
        mini.classList.add('tc-validate-drawer-mini--positioned');
        validateSingleMiniState.left = clamped.left;
        validateSingleMiniState.top = clamped.top;
        return clamped;
    }

    function pinValidateSingleMiniVisual(mini) {
        if (!mini || mini.classList.contains('hidden')) return null;
        var rect = mini.getBoundingClientRect();
        if (!rect.width) return null;
        return applyValidateSingleMiniInlinePosition(mini, rect.left, rect.top, getValidateSingleMiniMetrics(mini));
    }

    /** 质量检查悬浮钮：沉底 + transform 偏移（松手不切换 left/top，避免下沉） */
    function applyValidateSingleQcMiniDockOffset(mini) {
        if (!mini) return;
        var ox = validateSingleMiniState.offsetX || 0;
        var oy = validateSingleMiniState.offsetY || 0;
        mini.style.removeProperty('left');
        mini.style.removeProperty('top');
        mini.style.removeProperty('right');
        mini.style.removeProperty('bottom');
        mini.classList.remove('tc-validate-drawer-mini--positioned');
        if (!ox && !oy) {
            mini.classList.remove('tc-validate-drawer-mini--offset');
            mini.style.removeProperty('transform');
            return;
        }
        mini.classList.add('tc-validate-drawer-mini--offset');
        mini.style.setProperty('transform', 'translate3d(' + ox + 'px,' + oy + 'px,0)', 'important');
    }

    function persistValidateSingleQcMiniDragOffset(mini, dx, dy) {
        if (!mini) return;
        validateSingleMiniState.left = null;
        validateSingleMiniState.top = null;
        validateSingleMiniState.offsetX = Math.round(dx);
        validateSingleMiniState.offsetY = Math.round(dy);
        applyValidateSingleQcMiniDockOffset(mini);
        mini._tcValidateSingleQcMiniJustCommitted = true;
        global.setTimeout(function () {
            mini._tcValidateSingleQcMiniJustCommitted = false;
        }, 120);
    }

    function clearValidateSingleQcMiniDockOffset(mini) {
        validateSingleMiniState.offsetX = null;
        validateSingleMiniState.offsetY = null;
        if (!mini) return;
        mini.classList.remove('tc-validate-drawer-mini--offset');
        mini.style.removeProperty('transform');
    }

    /** 质量检查悬浮钮：重置为默认沉底位置（刷新/切页/离开页面时调用；同页内拖动仅用内存 offset） */
    function resetValidateSingleQcMiniPositionToDefault() {
        validateSingleMiniState.left = null;
        validateSingleMiniState.top = null;
        validateSingleMiniState.offsetX = null;
        validateSingleMiniState.offsetY = null;
        var mini = vEl('tc-validate-float-reopen-btn', VALIDATE_SCOPE_SINGLE);
        if (mini) {
            clearValidateSingleQcMiniDockOffset(mini);
            mini.style.removeProperty('left');
            mini.style.removeProperty('top');
            mini.style.removeProperty('right');
            mini.style.removeProperty('bottom');
            mini.classList.remove('tc-validate-drawer-mini--positioned');
        }
    }

    global.resetValidateSingleQcMiniPositionToDefault = resetValidateSingleQcMiniPositionToDefault;
    global.resetValidateSingleSideDrawerLayoutSession = resetValidateSingleSideDrawerLayoutSession;

    (function purgeLegacyQcMiniPosStorageOnce() {
        if (!global.sessionStorage) return;
        try {
            var prefix = 'tc_qc_single_mini_pos:';
            for (var i = global.sessionStorage.length - 1; i >= 0; i--) {
                var k = global.sessionStorage.key(i);
                if (k && k.indexOf(prefix) === 0) global.sessionStorage.removeItem(k);
            }
        } catch (e) { /* ignore */ }
    })();

    /** 质量检查悬浮钮：拖拽松手后提交位置（隔离；先解除沉底锚点再落位，避免松手下滑） */
    function commitValidateSingleQcMiniDragPosition(mini, left, top, metrics) {
        if (!mini) return null;
        metrics = metrics || getValidateSingleMiniMetrics(mini);
        var gap = 8;
        var maxLeft = window.innerWidth - metrics.width - gap;
        var maxTop = window.innerHeight - metrics.height - gap;
        var leftPx = Math.max(gap, Math.min(left, maxLeft));
        var topPx = Math.max(gap, Math.min(top, maxTop));
        leftPx = Math.round(leftPx);
        topPx = Math.round(topPx);
        mini.classList.add('tc-validate-drawer-mini--positioned');
        mini.style.setProperty('bottom', 'auto', 'important');
        mini.style.setProperty('right', 'auto', 'important');
        mini.style.setProperty('left', leftPx + 'px', 'important');
        mini.style.setProperty('top', topPx + 'px', 'important');
        mini.style.removeProperty('transform');
        validateSingleMiniState.left = leftPx;
        validateSingleMiniState.top = topPx;
        mini._tcValidateSingleQcMiniJustCommitted = true;
        global.setTimeout(function () {
            mini._tcValidateSingleQcMiniJustCommitted = false;
        }, 120);
        return { left: leftPx, top: topPx };
    }

    function isValidateSingleSideDrawer(scope) {
        return normalizeValidateScope(scope) === VALIDATE_SCOPE_SINGLE;
    }

    function isValidateSingleSideDrawerEl(drawer) {
        return !!(drawer && drawer.classList.contains('tc-validate-drawer--side'));
    }

    function isValidateSingleSideDrawerPanelHidden(panel) {
        if (!panel) return true;
        if (panel.classList.contains('hidden')) return true;
        return panel.getAttribute('aria-hidden') === 'true';
    }

    function getValidateSingleSideDefaultLayout(drawerW) {
        var gap = TC_VALIDATE_SINGLE_DRAWER_GAP;
        var top = 76;
        drawerW = drawerW || TC_VALIDATE_SINGLE_DEFAULT_W;
        return {
            left: Math.max(gap, window.innerWidth - drawerW - 20),
            top: top,
            height: Math.max(240, window.innerHeight - top - gap),
            width: drawerW
        };
    }

    function clampValidateSingleSideSize(width, height, topHint) {
        var gap = TC_VALIDATE_SINGLE_DRAWER_GAP;
        var maxW = Math.max(TC_VALIDATE_SINGLE_MIN_W, Math.min(TC_VALIDATE_SINGLE_MAX_W, window.innerWidth - gap * 2));
        var top = topHint != null ? topHint : gap;
        var maxH = Math.max(TC_VALIDATE_SINGLE_MIN_H, window.innerHeight - top - gap);
        width = Math.max(TC_VALIDATE_SINGLE_MIN_W, Math.min(width, maxW));
        height = Math.max(TC_VALIDATE_SINGLE_MIN_H, Math.min(height, maxH));
        return { width: Math.round(width), height: Math.round(height) };
    }

    function clampValidateSingleSideLayout(left, top, height, drawerW) {
        var gap = TC_VALIDATE_SINGLE_DRAWER_GAP;
        drawerW = drawerW || TC_VALIDATE_SINGLE_DEFAULT_W;
        var sized = clampValidateSingleSideSize(drawerW, height, top);
        drawerW = sized.width;
        height = sized.height;
        left = Math.max(gap, Math.min(left, window.innerWidth - drawerW - gap));
        top = Math.max(gap, Math.min(top, window.innerHeight - TC_VALIDATE_SINGLE_MIN_H - gap));
        height = Math.max(TC_VALIDATE_SINGLE_MIN_H, Math.min(height, window.innerHeight - top - gap));
        return { left: Math.round(left), top: Math.round(top), height: Math.round(height), width: Math.round(drawerW) };
    }

    /** 质量检查侧边抽屉：左上角/左边缘缩放计算（独立于 tcLeftFloatComputeResize） */
    function computeValidateSingleSideResize(mode, startW, startH, startLeft, startTop, dx, dy) {
        var nw = startW;
        var nh = startH;
        var nl = startLeft;
        var nt = startTop;
        if (mode === 'w') {
            nw = startW - dx;
            nl = startLeft + dx;
        } else if (mode === 'nw') {
            nw = startW - dx;
            nl = startLeft + dx;
            nh = startH - dy;
            nt = startTop + dy;
        }
        var sized = clampValidateSingleSideSize(nw, nh, nt);
        if (mode === 'w' || mode === 'nw') {
            nl = startLeft + (startW - sized.width);
        }
        if (mode === 'nw') {
            nt = startTop + (startH - sized.height);
        }
        return clampValidateSingleSideLayout(nl, nt, sized.height, sized.width);
    }

    function applyValidateSingleSideResizeToDom(panel, layout) {
        if (!panel || !layout) return;
        validateSingleSideState.left = layout.left;
        validateSingleSideState.top = layout.top;
        validateSingleSideState.height = layout.height;
        validateSingleSideState.width = layout.width;
        panel.style.setProperty('left', layout.left + 'px', 'important');
        panel.style.setProperty('top', layout.top + 'px', 'important');
        panel.style.setProperty('height', layout.height + 'px', 'important');
        panel.style.setProperty('width', layout.width + 'px', 'important');
        panel.style.setProperty('max-width', 'calc(100vw - 24px)', 'important');
        panel.style.setProperty('right', 'auto', 'important');
    }

    function syncValidateSingleSideStateFromMini() {
        var mini = vEl('tc-validate-float-reopen-btn', VALIDATE_SCOPE_SINGLE);
        if (!mini || mini.classList.contains('hidden')) return false;
        var rect = mini.getBoundingClientRect();
        if (!rect.width) return false;
        var layout = clampValidateSingleSideLayout(
            rect.left,
            rect.top,
            Math.max(240, window.innerHeight - rect.top - TC_VALIDATE_SINGLE_DRAWER_GAP),
            360
        );
        validateSingleSideState.left = layout.left;
        validateSingleSideState.top = layout.top;
        validateSingleSideState.height = layout.height;
        return true;
    }

    function syncValidateSingleMiniFromExpandedDrawer() {
        var drawer = getValidatePanel(VALIDATE_SCOPE_SINGLE);
        if (!drawer) return;
        var mini = vEl('tc-validate-float-reopen-btn', VALIDATE_SCOPE_SINGLE);
        var rect = drawer.getBoundingClientRect();
        if (!rect.width) return;
        var clamped = clampValidateSingleMiniPosition(rect.left, rect.top, getValidateSingleMiniMetrics(mini));
        validateSingleMiniState.left = clamped.left;
        validateSingleMiniState.top = clamped.top;
    }

    function applyValidateSingleMiniPosition() {
        var mini = vEl('tc-validate-float-reopen-btn', VALIDATE_SCOPE_SINGLE);
        if (!mini) return;
        if (mini._tcValidateSingleQcMiniJustCommitted) return;
        if (validateSingleMiniState.offsetX != null || validateSingleMiniState.offsetY != null) {
            applyValidateSingleQcMiniDockOffset(mini);
            return;
        }
        if (validateSingleMiniState.left != null && validateSingleMiniState.top != null) {
            applyValidateSingleMiniInlinePosition(
                mini,
                validateSingleMiniState.left,
                validateSingleMiniState.top,
                getValidateSingleMiniMetrics(mini)
            );
            return;
        }
        clearValidateSingleQcMiniDockOffset(mini);
        mini.style.removeProperty('left');
        mini.style.removeProperty('top');
        mini.style.removeProperty('right');
        mini.style.removeProperty('bottom');
        mini.classList.remove('tc-validate-drawer-mini--positioned');
    }

    function applyValidateSingleSideLayout() {
        var drawer = getValidatePanel(VALIDATE_SCOPE_SINGLE);
        if (!drawer || !isValidateSingleSideDrawerEl(drawer)) return;
        var drawerW = validateSingleSideState.width || drawer.offsetWidth || TC_VALIDATE_SINGLE_DEFAULT_W;
        var layout;
        if (validateSingleSideState.left != null && validateSingleSideState.top != null) {
            layout = clampValidateSingleSideLayout(
                validateSingleSideState.left,
                validateSingleSideState.top,
                validateSingleSideState.height || Math.max(240, window.innerHeight - validateSingleSideState.top - TC_VALIDATE_SINGLE_DRAWER_GAP),
                drawerW
            );
        } else {
            layout = getValidateSingleSideDefaultLayout(drawerW);
            validateSingleSideState.left = layout.left;
            validateSingleSideState.top = layout.top;
            validateSingleSideState.height = layout.height;
        }
        validateSingleSideState.left = layout.left;
        validateSingleSideState.top = layout.top;
        validateSingleSideState.height = layout.height;
        validateSingleSideState.width = layout.width;
        drawer.style.setProperty('left', layout.left + 'px', 'important');
        drawer.style.setProperty('top', layout.top + 'px', 'important');
        drawer.style.setProperty('height', layout.height + 'px', 'important');
        drawer.style.setProperty('width', layout.width + 'px', 'important');
        drawer.style.setProperty('max-width', 'calc(100vw - 24px)', 'important');
        drawer.style.setProperty('right', 'auto', 'important');
    }

    /**
     * 侧边质量检查抽屉 · 问题清单矩阵：
     * 保持默认/用户已调尺寸，不再按矩阵内容自动改宽高；仅切换内部滚动。
     */
    function syncValidateSingleSideCoverageFitLayout(scope) {
        scope = normalizeValidateScope(scope);
        if (!isValidateSingleSideDrawer(scope)) return;
        var drawer = getValidatePanel(scope);
        if (!drawer || !isValidateSingleSideDrawerEl(drawer)) return;
        if (!drawer.classList.contains('tc-validate-drawer--open')) return;
        if (!drawer.classList.contains('tc-validate-drawer--coverage')) return;
        // 切矩阵前先钉住当前布局，避免历史 auto-fit 污染；用户已缩放则沿用 pinned
        if (validateSingleSidePinnedLayout) {
            restoreValidateSingleSidePinnedLayoutForReopen();
        } else {
            captureValidateSingleSidePinnedLayout(validateSingleSideState);
        }
        applyValidateSingleSideLayout();
        syncValidateSingleSideCoverageOverflowClass(drawer);
    }

    /** 仅根据当前抽屉高度决定矩阵区是否内部滚动，不改写宽高 */
    function syncValidateSingleSideCoverageOverflowClass(drawer) {
        if (!drawer) return;
        drawer.classList.remove('tc-validate-drawer--coverage-overflow');
        var body = drawer.querySelector('.tc-side-drawer__body.tc-validate-float-panel__body');
        var panel = drawer.querySelector('[id^="tc-validate-coverage-panel"]');
        var list = drawer.querySelector('.tc-coverage-matrix-list');
        var contentH = 0;
        if (list && list.scrollHeight) contentH = Math.max(contentH, list.scrollHeight);
        if (panel && panel.scrollHeight) contentH = Math.max(contentH, panel.scrollHeight);
        if (body && body.scrollHeight) contentH = Math.max(contentH, body.scrollHeight);
        var avail = drawer.clientHeight || validateSingleSideState.height || 0;
        var chrome = 0;
        var header = drawer.querySelector('.tc-side-drawer__header, .tc-validate-float-panel__header');
        var tabs = drawer.querySelector('.tc-validate-tabs, .tc-validate-drawer__tabs');
        if (header) chrome += header.offsetHeight || 0;
        if (tabs) chrome += tabs.offsetHeight || 0;
        var room = Math.max(120, avail - chrome);
        if (contentH > room + 2) {
            drawer.classList.add('tc-validate-drawer--coverage-overflow');
        }
    }

    function restoreValidateSingleSideLayoutAfterCoverageTab(scope) {
        scope = normalizeValidateScope(scope);
        if (!isValidateSingleSideDrawer(scope)) return;
        var drawer = getValidatePanel(scope);
        if (!drawer || !isValidateSingleSideDrawerEl(drawer)) return;
        drawer.classList.remove('tc-validate-drawer--coverage-overflow');
        if (validateSingleSidePinnedLayout) {
            restoreValidateSingleSidePinnedLayoutForReopen();
        }
        applyValidateSingleSideLayout();
    }

    function isDrawerExpanded(el, openClass) {
        return !!(el && !el.classList.contains('hidden') && (!openClass || el.classList.contains(openClass)));
    }

    function isValidateDrawerPanelOpen(scope) {
        scope = normalizeValidateScope(scope);
        var panel = getValidatePanel(scope);
        if (!panel) return false;
        if (isValidateSingleSideDrawer(scope) && isValidateSingleSideDrawerEl(panel)) {
            return panel.classList.contains('tc-validate-drawer--open');
        }
        return !panel.classList.contains('hidden');
    }

    var validateSingleCloseTimer = null;

    function closeValidateDrawerForHandoff(scope) {
        scope = normalizeValidateScope(scope);
        var panel = getValidatePanel(scope);
        if (!panel || !isValidateDrawerPanelOpen(scope)) return;
        if (isValidateSingleSideDrawer(scope) && isValidateSingleSideDrawerEl(panel)) {
            if (validateSingleCloseTimer) {
                global.clearTimeout(validateSingleCloseTimer);
                validateSingleCloseTimer = null;
            }
            syncValidateSingleMiniFromExpandedDrawer();
            panel.classList.remove('tc-validate-drawer--open');
            panel.classList.add('hidden');
            panel.setAttribute('aria-hidden', 'true');
            return;
        }
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
    }

    function collapseOtherValidateDrawerBeforeOpen(activeScope) {
        activeScope = normalizeValidateScope(activeScope);
        if (activeScope === VALIDATE_SCOPE_SINGLE) {
            var agentDrawer = $('tc-agent-drawer');
            if (isDrawerExpanded(agentDrawer, 'tc-agent-drawer--open')) {
                var agentMinBtn = $('tc-agent-drawer-minimize');
                if (agentMinBtn) agentMinBtn.click();
            }
        }
    }

    function syncValidateReopenButtonsLayout() {
        var topBase = 20;
        var agentBtn = $('tc-validate-float-reopen-btn-agent');
        if (agentBtn && !agentBtn.classList.contains('hidden')) {
            agentBtn.style.setProperty('left', 'auto', 'important');
            agentBtn.style.setProperty('right', '20px', 'important');
            agentBtn.style.setProperty('bottom', 'auto', 'important');
            agentBtn.style.setProperty('top', topBase + 'px', 'important');
        }
    }

    function collapseExpandedDrawersBeforeValidateSingle() {
        collapseOtherValidateDrawerBeforeOpen(VALIDATE_SCOPE_SINGLE);
    }

    function forceCloseValidateSingleSideDrawerImmediate() {
        var panel = getValidatePanel(VALIDATE_SCOPE_SINGLE);
        if (!panel || !isValidateSingleSideDrawerEl(panel)) return false;
        var isOpen = panel.classList.contains('tc-validate-drawer--open') ||
            panel.getAttribute('aria-hidden') === 'false';
        if (!isOpen) return false;
        if (validateSingleCloseTimer) {
            global.clearTimeout(validateSingleCloseTimer);
            validateSingleCloseTimer = null;
        }
        syncValidateSingleMiniFromExpandedDrawer();
        panel.classList.remove('tc-validate-drawer--open');
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
        panel.style.setProperty('transition', 'none', 'important');
        panel.style.setProperty('transform', 'translateX(calc(100% + 12px))', 'important');
        panel.style.setProperty('visibility', 'hidden', 'important');
        panel.style.setProperty('pointer-events', 'none', 'important');
        sealValidateSingleDrawerClosedChrome(VALIDATE_SCOPE_SINGLE);
        global.requestAnimationFrame(function () {
            panel.style.removeProperty('transition');
        });
        return true;
    }

    function collapseValidateDrawerBeforeAgentPlanningOpen() {
        if (!forceCloseValidateSingleSideDrawerImmediate()) {
            closeValidateDrawerForHandoff(VALIDATE_SCOPE_SINGLE);
        }
                syncValidateReopenButtonsLayout();
    }

    function openValidateSingleSideDrawer(opts) {
        opts = opts || {};
        bindValidateSingleSideDrawer(VALIDATE_SCOPE_SINGLE);
        var drawer = getValidatePanel(VALIDATE_SCOPE_SINGLE);
        if (!drawer) return;
        if (validateSingleCloseTimer) {
            global.clearTimeout(validateSingleCloseTimer);
            validateSingleCloseTimer = null;
        }
        if (opts._inPlaceUpdate && isValidateDrawerOpen(VALIDATE_SCOPE_SINGLE) &&
            drawer.classList.contains('tc-validate-drawer--open')) {
            bringTcFloatPanelToFront(drawer);
            var reopenSkip = vEl('tc-validate-float-reopen-btn', VALIDATE_SCOPE_SINGLE);
            if (reopenSkip) reopenSkip.classList.add('hidden');
            return;
        }
        if (restoreValidateSingleSidePinnedLayoutForReopen()) {
            /* 使用已固定的抽屉布局 */
        } else if (validateSingleSideState.left == null || validateSingleSideState.top == null) {
            var def = getValidateSingleSideDefaultLayout(drawer.offsetWidth || 360);
            validateSingleSideState.left = def.left;
            validateSingleSideState.top = def.top;
            validateSingleSideState.height = def.height;
            captureValidateSingleSidePinnedLayout(validateSingleSideState);
        } else if (!validateSingleSidePinnedLayout) {
            captureValidateSingleSidePinnedLayout(validateSingleSideState);
        }
        var reopenEarly = vEl('tc-validate-float-reopen-btn', VALIDATE_SCOPE_SINGLE);
        if (reopenEarly) reopenEarly.classList.add('hidden');
        drawer.classList.remove('hidden');
        drawer.classList.remove('tc-validate-drawer--open');
        drawer.setAttribute('aria-hidden', 'false');
        drawer.style.removeProperty('transform');
        drawer.style.removeProperty('visibility');
        drawer.style.removeProperty('pointer-events');
        drawer.style.removeProperty('opacity');
        unsealValidateSingleDrawerClosedChrome(VALIDATE_SCOPE_SINGLE);
        applyValidateSingleSideLayout();
        void drawer.offsetWidth;
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                drawer.classList.add('tc-validate-drawer--open');
            });
        });
        bringTcFloatPanelToFront(drawer);
        if (opts.forceFront) bringTcFloatPanelToFront(drawer);
        var reopen = vEl('tc-validate-float-reopen-btn', VALIDATE_SCOPE_SINGLE);
        if (reopen) reopen.classList.add('hidden');
        vScopeData(VALIDATE_SCOPE_SINGLE).validateDrawerUserMinimized = false;
        vScopeData(VALIDATE_SCOPE_SINGLE).validateDrawerDismissedByClose = false;
    }

    /**
     * 侧边抽屉是否处于用户可见的打开态（新方法）。
     * 缩小/关闭后不得再刷通过态强制可见样式。
     */
    function isValidateSingleDrawerVisiblyOpen(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var drawer = getValidatePanel(scope);
        if (!drawer) return false;
        if (drawer.classList.contains('hidden')) return false;
        if (isValidateSingleSideDrawer(scope) && isValidateSingleSideDrawerEl(drawer)) {
            return drawer.classList.contains('tc-validate-drawer--open');
        }
        return true;
    }

    /**
     * 清除通过态写入的 inline !important 可见性（新方法）。
     * 解决：缩小后子节点 visibility:visible !important 穿透父级 hidden，右侧留白块。
     */
    function stripValidateCleanPassInlineForceStyles(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var issuesList = vEl('tc-validate-issue-list', scope);
        if (!issuesList) return;
        try {
            issuesList.style.removeProperty('visibility');
            issuesList.style.removeProperty('opacity');
            issuesList.style.removeProperty('display');
        } catch (e0) { /* ignore */ }
        var nodes = issuesList.querySelectorAll(
            '.tc-validate-clean-pass-resolved, .tc-validate-clean-pass-hero, .tc-validate-noissue, .tc-validate-pass, [style]'
        );
        for (var i = 0; i < nodes.length; i++) {
            try {
                nodes[i].style.removeProperty('visibility');
                nodes[i].style.removeProperty('opacity');
                nodes[i].style.removeProperty('display');
                nodes[i].style.removeProperty('transform');
            } catch (e1) { /* ignore */ }
        }
    }

    /**
     * 缩小/关闭时密封侧边抽屉（新方法）：立刻不可见，防止通过态卡片/空白底穿透。
     */
    function sealValidateSingleDrawerClosedChrome(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var drawer = getValidatePanel(scope);
        if (!drawer || !isValidateSingleSideDrawerEl(drawer)) return;
        drawer.classList.remove('tc-validate-drawer--clean-pass');
        stripValidateCleanPassInlineForceStyles(scope);
        try {
            drawer.style.setProperty('opacity', '0', 'important');
            drawer.style.setProperty('visibility', 'hidden', 'important');
            drawer.style.setProperty('pointer-events', 'none', 'important');
        } catch (e0) { /* ignore */ }
    }

    /** 重新打开侧边抽屉时解除密封（新方法） */
    function unsealValidateSingleDrawerClosedChrome(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var drawer = getValidatePanel(scope);
        if (!drawer) return;
        try {
            drawer.style.removeProperty('opacity');
            drawer.style.removeProperty('visibility');
            drawer.style.removeProperty('pointer-events');
        } catch (e0) { /* ignore */ }
    }

    function closeValidateSingleSideDrawer(opts) {
        opts = opts || {};
        var vDataSingle = vScopeData(VALIDATE_SCOPE_SINGLE);
        if (opts.suppressFloatReopen) {
            vDataSingle.validateDrawerDismissedByClose = true;
            vDataSingle.validateDrawerUserMinimized = false;
        } else if (opts.dockToBottom) {
            vDataSingle.validateDrawerDismissedByClose = false;
        } else if (!opts.dockToBottom) {
            vDataSingle.validateDrawerUserMinimized = false;
        }
        var drawer = getValidatePanel(VALIDATE_SCOPE_SINGLE);
        if (!drawer) return;
        if (opts.dockToBottom) {
            validateSingleMiniState.left = null;
            validateSingleMiniState.top = null;
            applyValidateSingleMiniPosition();
        } else {
            syncValidateSingleMiniFromExpandedDrawer();
        }
        drawer.classList.remove('tc-validate-drawer--open');
        /* 立刻去掉 clean-pass + 密封，避免关闭动画期间通过态/空白块仍可见 */
        drawer.classList.remove('tc-validate-drawer--clean-pass');
        sealValidateSingleDrawerClosedChrome(VALIDATE_SCOPE_SINGLE);
        if (validateSingleCloseTimer) global.clearTimeout(validateSingleCloseTimer);
        validateSingleCloseTimer = global.setTimeout(function () {
            validateSingleCloseTimer = null;
            if (drawer.classList.contains('tc-validate-drawer--open')) return;
            clearValidateDrawerCleanPassChromeOnClose(VALIDATE_SCOPE_SINGLE);
            sealValidateSingleDrawerClosedChrome(VALIDATE_SCOPE_SINGLE);
            drawer.classList.add('hidden');
            drawer.setAttribute('aria-hidden', 'true');
            restoreCurrentBatchValidationView(VALIDATE_SCOPE_SINGLE);
            updateValidateReopenBtn(VALIDATE_SCOPE_SINGLE);
            syncValidateReopenButtonsLayout();
            syncStandaloneQualityCheckButtonChromeIfNeeded();
        }, 300);
    }

    function minimizeValidateSingleDrawer(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        vScopeData(VALIDATE_SCOPE_SINGLE).validateDrawerUserMinimized = true;
        snapshotValidateSingleSideDrawerLayoutFromDom();
        closeValidateSingleSideDrawer({ dockToBottom: true });
    }

    function bindValidateSingleSideDrawerDrag(scope) {
        var panel = getValidatePanel(scope);
        if (!panel || panel._tcValidateSingleSideDragBound) return;
        panel._tcValidateSingleSideDragBound = true;
        if (!isValidateSingleSideDrawerEl(panel)) return;
        var dragHandle = panel.querySelector('[data-validate-drag-handle="' + scope + '"]');
        if (!dragHandle) return;
        dragHandle.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (e.target.closest('.tc-validate-float-panel__winbtn') ||
                e.target.closest('.tc-validate-drawer-minimize-btn') ||
                e.target.closest('.tc-validate-single-resize')) return;
            e.preventDefault();
            var rect = panel.getBoundingClientRect();
            var startX = e.clientX;
            var startY = e.clientY;
            var origLeft = rect.left;
            var origTop = rect.top;
            var origHeight = rect.height;
            var origWidth = validateSingleSideState.width || rect.width;
            panel.classList.add('tc-validate-drawer--dragging');
            panel.style.transition = 'none';
            function onMove(ev) {
                var left = origLeft + (ev.clientX - startX);
                var top = origTop + (ev.clientY - startY);
                var layout = clampValidateSingleSideLayout(left, top, origHeight, origWidth);
                applyValidateSingleSideResizeToDom(panel, layout);
            }
            function onUp() {
                panel.classList.remove('tc-validate-drawer--dragging');
                panel.style.transition = '';
                if (scope === VALIDATE_SCOPE_SINGLE) {
                    captureValidateSingleSidePinnedLayout();
                }
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    /** 质量检查侧边抽屉：左上角/左边缘缩放绑定（独立于 initTcLeftFloatResize） */
    function bindValidateSingleSideDrawerResize(scope) {
        scope = normalizeValidateScope(scope);
        if (scope !== VALIDATE_SCOPE_SINGLE) return;
        var panel = getValidatePanel(scope);
        if (!panel || panel._tcValidateSingleSideResizeBound) return;
        if (!isValidateSingleSideDrawerEl(panel)) return;
        panel._tcValidateSingleSideResizeBound = true;
        panel.querySelectorAll('[data-validate-single-resize]').forEach(function (handle) {
            handle.addEventListener('pointerdown', function (e) {
                if (!panel.classList.contains('tc-validate-drawer--open')) return;
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                var mode = handle.getAttribute('data-validate-single-resize') || 'w';
                var rect = panel.getBoundingClientRect();
                var startX = e.clientX;
                var startY = e.clientY;
                var startW = rect.width;
                var startH = rect.height;
                var startLeft = rect.left;
                var startTop = rect.top;
                var activePointerId = e.pointerId;
                panel.classList.add('tc-validate-drawer--resizing');
                document.body.classList.add('tc-validate-single-resizing');
                document.body.setAttribute('data-validate-single-resize-cursor', mode);
                panel.style.transition = 'none';
                function onMove(ev) {
                    if (activePointerId !== null && ev.pointerId !== activePointerId) return;
                    var layout = computeValidateSingleSideResize(
                        mode, startW, startH, startLeft, startTop,
                        ev.clientX - startX, ev.clientY - startY
                    );
                    applyValidateSingleSideResizeToDom(panel, layout);
                    ev.preventDefault();
                }
                function endResize(ev) {
                    if (activePointerId !== null && ev && ev.pointerId !== activePointerId) return;
                    document.removeEventListener('pointermove', onMove);
                    document.removeEventListener('pointerup', endResize);
                    document.removeEventListener('pointercancel', endResize);
                    panel.classList.remove('tc-validate-drawer--resizing');
                    document.body.classList.remove('tc-validate-single-resizing');
                    document.body.removeAttribute('data-validate-single-resize-cursor');
                    panel.style.transition = '';
                    markValidateSingleSideUserResized();
                }
                if (handle.setPointerCapture) {
                    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                }
                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup', endResize);
                document.addEventListener('pointercancel', endResize);
            });
        });
    }

    /** 质量检查悬浮钮专用拖拽：拖动阶段仅用 transform，避免 right/bottom 与 left/top 切换导致位移 */
    function bindValidateSingleQcFloatReopenDrag(scope) {
        scope = normalizeValidateScope(scope);
        if (scope !== VALIDATE_SCOPE_SINGLE) return;
        var mini = vEl('tc-validate-float-reopen-btn', scope);
        if (!mini || mini._tcValidateSingleQcMiniDragBound) return;
        mini._tcValidateSingleQcMiniDragBound = true;
        var threshold = 4;
        mini.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            var startX = e.clientX;
            var startY = e.clientY;
            var moved = false;
            var lastDx = 0;
            var lastDy = 0;
            var baseOffsetX = validateSingleMiniState.offsetX || 0;
            var baseOffsetY = validateSingleMiniState.offsetY || 0;
            if (!mini.getBoundingClientRect().width) return;
            function applyQcMiniDragTransform(dx, dy) {
                mini.style.setProperty(
                    'transform',
                    'translate3d(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px,0)',
                    'important'
                );
            }
            function onMove(ev) {
                lastDx = ev.clientX - startX;
                lastDy = ev.clientY - startY;
                if (!moved) {
                    if (Math.abs(lastDx) <= threshold && Math.abs(lastDy) <= threshold) {
                        return;
                    }
                    moved = true;
                    mini.classList.add('tc-validate-drawer-mini--dragging');
                }
                ev.preventDefault();
                applyQcMiniDragTransform(baseOffsetX + lastDx, baseOffsetY + lastDy);
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                mini.classList.remove('tc-validate-drawer-mini--dragging');
                if (moved) {
                    persistValidateSingleQcMiniDragOffset(mini, baseOffsetX + lastDx, baseOffsetY + lastDy);
                    mini._tcValidateSingleMiniJustDragged = true;
                    global.setTimeout(function () { mini._tcValidateSingleMiniJustDragged = false; }, 0);
                } else {
                    applyValidateSingleQcMiniDockOffset(mini);
                }
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    function bindValidateSingleDrawerMiniDrag(scope) {
        var mini = vEl('tc-validate-float-reopen-btn', scope);
        if (!mini || mini._tcValidateSingleMiniDragBound) return;
        mini._tcValidateSingleMiniDragBound = true;
        var threshold = 4;
        mini.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            var startX = e.clientX;
            var startY = e.clientY;
            var moved = false;
            var metrics = null;
            var offsetX = 0;
            var offsetY = 0;
            function onMove(ev) {
                if (!moved) {
                    if (Math.abs(ev.clientX - startX) <= threshold && Math.abs(ev.clientY - startY) <= threshold) {
                        return;
                    }
                    moved = true;
                    mini.classList.add('tc-validate-drawer-mini--dragging');
                    pinValidateSingleMiniVisual(mini);
                    metrics = getValidateSingleMiniMetrics(mini);
                    offsetX = ev.clientX - validateSingleMiniState.left;
                    offsetY = ev.clientY - validateSingleMiniState.top;
                }
                ev.preventDefault();
                if (!metrics) metrics = getValidateSingleMiniMetrics(mini);
                applyValidateSingleMiniInlinePosition(mini, ev.clientX - offsetX, ev.clientY - offsetY, metrics);
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                mini.classList.remove('tc-validate-drawer-mini--dragging');
                if (moved) {
                    mini._tcValidateSingleMiniJustDragged = true;
                    global.setTimeout(function () { mini._tcValidateSingleMiniJustDragged = false; }, 0);
                }
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    function bindValidateSingleSideDrawer(scope) {
        scope = normalizeValidateScope(scope);
        var panel = getValidatePanel(scope);
        if (!panel || panel._tcValidateSingleSideBound) return;
        panel._tcValidateSingleSideBound = true;
        bindValidateSingleSideDrawerDrag(scope);
        bindValidateSingleSideDrawerResize(scope);
        if (scope === VALIDATE_SCOPE_SINGLE) {
            bindValidateSingleQcFloatReopenDrag(scope);
        } else {
            bindValidateSingleDrawerMiniDrag(scope);
        }

        var minimizeBtn = vEl('tc-validate-drawer-minimize', scope);
        var reopenBtn = vEl('tc-validate-float-reopen-btn', scope);
        var closeBtn = vEl('tc-validate-drawer-close', scope);

        if (minimizeBtn) minimizeBtn.addEventListener('click', minimizeValidateSingleDrawer);
        if (closeBtn) closeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            handleValidateDrawerCloseRequest(scope);
        });
        if (reopenBtn) reopenBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (reopenBtn._tcValidateSingleMiniJustDragged) return;
            openValidateDrawer({
                scope: scope,
                syncFromMini: false,
                userInitiated: true,
                forceFetch: false
            });
        });

        panel.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            bringTcFloatPanelToFront(panel);
        }, true);

        if (!global._tcValidateSingleSideResizeBound) {
            global._tcValidateSingleSideResizeBound = true;
            global.addEventListener('resize', function () {
                var drawer = getValidatePanel(VALIDATE_SCOPE_SINGLE);
                if (drawer && drawer.classList.contains('tc-validate-drawer--open')) {
                    applyValidateSingleSideLayout();
                }
            });
        }
    }

    function getValidatePanel(scope) {
        return vEl('tc-validate-drawer', scope);
    }

    function getValidatePanelRectSize(panel, scope) {
        var floatState = vScopeData(scope).floatState;
        var preset = validateFloatSizes[floatState.sizeIndex] || validateFloatSizes[1];
        var w = floatState.customWidth || preset.w;
        var h = floatState.customHeight || preset.h;
        return {
            w: Math.min(w, window.innerWidth - 24),
            h: Math.min(h, window.innerHeight - 48)
        };
    }

    function getValidateFloatCenterPos(panel, scope, offsetIndex) {
        var size = getValidatePanelRectSize(panel, scope);
        var rect = panel ? panel.getBoundingClientRect() : null;
        var w = rect && rect.width > 0 ? rect.width : size.w;
        var h = rect && rect.height > 0 ? rect.height : size.h;
        var margin = 12;
        var offset = (offsetIndex || 0) * 36;
        return {
            left: Math.max(margin, Math.round((window.innerWidth - w) / 2) + offset),
            top: Math.max(margin, Math.round((window.innerHeight - h) / 2) + offset)
        };
    }

    function centerValidateFloatPanel(scope, offsetIndex) {
        scope = normalizeValidateScope(scope);
        var floatState = vScopeData(scope).floatState;
        var panel = getValidatePanel(scope);
        if (!panel || floatState.maximized) return;
        applyValidateFloatLayout(scope);
        var pos = getValidateFloatCenterPos(panel, scope, offsetIndex);
        floatState.left = pos.left;
        floatState.top = pos.top;
        panel.style.left = pos.left + 'px';
        panel.style.top = pos.top + 'px';
    }

    function resetValidateFloatPosition(scope) {
        scope = normalizeValidateScope(scope);
        var floatState = vScopeData(scope).floatState;
        floatState.left = null;
        floatState.top = null;
        var panel = getValidatePanel(scope);
        if (!panel) return;
        panel.style.left = '';
        panel.style.top = '';
    }

    function applyValidateFloatLayout(scope) {
        scope = normalizeValidateScope(scope);
        if (isValidateSingleSideDrawer(scope)) {
            applyValidateSingleSideLayout();
            return;
        }
        var floatState = vScopeData(scope).floatState;
        var panel = getValidatePanel(scope);
        if (!panel) return;
        panel.classList.toggle('tc-validate-float-panel--maximized', !!floatState.maximized);
        if (floatState.maximized) {
            panel.style.width = '';
            panel.style.height = '';
            panel.style.left = '';
            panel.style.top = '';
            return;
        }
        var preset = validateFloatSizes[floatState.sizeIndex] || validateFloatSizes[1];
        var w = floatState.customWidth || preset.w;
        var h = floatState.customHeight || preset.h;
        panel.style.width = Math.min(w, window.innerWidth - 24) + 'px';
        panel.style.height = Math.min(h, window.innerHeight - 48) + 'px';
        if (floatState.left != null) {
            panel.style.left = floatState.left + 'px';
        } else {
            panel.style.left = '';
        }
        if (floatState.top != null) {
            panel.style.top = floatState.top + 'px';
        } else {
            panel.style.top = '';
        }
    }

    function updateValidateReopenBtn(scope) {
        if (scope) {
            updateValidateReopenBtnForScope(scope);
            return;
        }
        updateValidateReopenBtnForScope(VALIDATE_SCOPE_SINGLE);
    }

    function updateValidateReopenBtnForScope(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        var btn = vEl('tc-validate-float-reopen-btn', scope);
        var badge = vEl('tc-validate-float-reopen-badge', scope);
        if (!btn) return;
        var panel = getValidatePanel(scope);
        var panelHidden;
        if (isValidateSingleSideDrawer(scope) && panel) {
            panelHidden = isValidateSingleSideDrawerPanelHidden(panel);
        } else {
            panelHidden = !panel || panel.classList.contains('hidden');
        }
        var inProgress = !!(vData.validateProgress && vData.validateProgress.active);
        var hasResult = !!(vData.lastValidation && validationHasActionableResults(vData.lastValidation));
        if (typeof shouldHideValidateReopenBtnForMindmapTab === 'function' &&
            shouldHideValidateReopenBtnForMindmapTab(scope)) {
            btn.classList.add('hidden');
            if (badge) badge.classList.add('hidden');
            syncValidateReopenButtonsLayout();
            return;
        }
        if (shouldSuppressValidateUiForSkippedNoLanhu(vData.lastValidation)) {
            btn.classList.add('hidden');
            if (badge) badge.classList.add('hidden');
            syncValidateReopenButtonsLayout();
            return;
        }
        var show;
        if (typeof resolveValidateReopenForPageSession === 'function') {
            show = resolveValidateReopenForPageSession(scope, vData, panelHidden, inProgress);
        } else {
            show = panelHidden && (hasResult || inProgress);
        }
        btn.classList.toggle('hidden', !show);
        if (show && isValidateSingleSideDrawer(scope) && !btn._tcValidateSingleQcMiniJustCommitted) {
            applyValidateSingleMiniPosition();
        }
        if (!badge) {
            syncValidateReopenButtonsLayout();
            return;
        }
        var stored = vData.lastValidation;
        var count = stored
            ? ((stored.issues || []).length +
                (stored.over_generated_count || 0) +
                (stored.gap_count || 0))
            : 0;
        if (count > 0) {
            badge.textContent = String(count);
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
        syncValidateReopenButtonsLayout();
    }

    function isValidateDrawerOpen(scope) {
        scope = normalizeValidateScope(scope);
        var drawer = getValidatePanel(scope);
        if (!drawer) return false;
        if (isValidateSingleSideDrawer(scope) && isValidateSingleSideDrawerEl(drawer)) {
            return drawer.classList.contains('tc-validate-drawer--open');
        }
        return !drawer.classList.contains('hidden') &&
            drawer.getAttribute('aria-hidden') !== 'true';
    }

    function isValidateDrawerVisible(scope) {
        scope = normalizeValidateScope(scope);
        var drawer = getValidatePanel(scope);
        if (!drawer) return false;
        return !drawer.classList.contains('hidden') &&
            drawer.getAttribute('aria-hidden') !== 'true';
    }

    function toggleValidateDrawer(opts) {
        opts = opts || {};
        var scope = normalizeValidateScope(opts.scope);
        var turnId = resolveTurnIdForValidation(opts);
        if (turnId) {
            if (isValidateDrawerOpen(scope) && historicalValidateTurnId === turnId) {
                closeValidateDrawer(scope);
                historicalValidateTurnId = null;
                return false;
            }
            loadTurnValidationAndOpen(Object.assign({}, opts, {
                turnId: turnId,
                scope: scope,
                forceFetch: opts.forceFetch !== false
            }));
            return true;
        }
        if (isValidateDrawerOpen(scope)) {
            closeValidateDrawer(scope);
            return false;
        }
        openValidateDrawerInner(opts);
        return true;
    }

    function getCachedBatchValidation(batchKey) {
        batchKey = String(batchKey || '').trim();
        if (!batchKey) return null;
        return batchValidationCache[batchKey] || null;
    }

    function resolveTurnIdForValidation(opts) {
        opts = opts || {};
        var turnId = String(opts.turnId || '').trim();
        if (turnId) return turnId;

        var batchKey = String(opts.batchKey || '').trim();
        if (batchKey) {
            var cached = batchValidationCache[batchKey];
            if (cached && cached.turnId) return String(cached.turnId).trim();
            if (global.TcWorkbenchSession &&
                typeof global.TcWorkbenchSession.getTurnIdForBatchKey === 'function') {
                turnId = String(global.TcWorkbenchSession.getTurnIdForBatchKey(batchKey) || '').trim();
                if (turnId) return turnId;
            }
        }

        var liveScope = normalizeValidateScope(opts.scope);
        var liveSnap = vScopeData(liveScope).validationBatchSnapshot || vScopeData(liveScope).batchSnapshot;
        if (liveSnap && liveSnap._persistTurnId) {
            turnId = String(liveSnap._persistTurnId).trim();
            if (turnId) return turnId;
        }

        if (global.TcWorkbenchSession) {
            if (typeof global.TcWorkbenchSession.getCurrentTurnId === 'function') {
                turnId = String(global.TcWorkbenchSession.getCurrentTurnId() || '').trim();
                if (turnId) return turnId;
            }
            if (typeof global.TcWorkbenchSession.getLatestValidatedTurnId === 'function') {
                turnId = String(global.TcWorkbenchSession.getLatestValidatedTurnId(opts.scope) || '').trim();
                if (turnId) return turnId;
            }
        }
        return '';
    }

    function getLatestSessionTurnId(scope) {
        var session = global.TcWorkbenchSession;
        if (session && typeof session.getLatestSessionTurnId === 'function') {
            return String(session.getLatestSessionTurnId() || '').trim();
        }
        if (session && typeof session.getCurrentTurnId === 'function') {
            return String(session.getCurrentTurnId() || '').trim();
        }
        if (session && typeof session.getLatestValidatedTurnId === 'function') {
            return String(session.getLatestValidatedTurnId(scope) || '').trim();
        }
        return '';
    }

    function resolveViewingTurnIdForValidation(scope) {
        scope = normalizeValidateScope(scope);
        if (historicalValidateTurnId) {
            return String(historicalValidateTurnId).trim();
        }
        var vData = vScopeData(scope);
        var snap = vData.validationBatchSnapshot || vData.batchSnapshot;
        if (snap && snap._persistTurnId) {
            return String(snap._persistTurnId).trim();
        }
        var batchKey = snap && snap.batchValidationKey ? String(snap.batchValidationKey).trim() : '';
        if (!batchKey) batchKey = buildBatchValidationKey(snap);
        if (batchKey) {
            var cached = batchValidationCache[batchKey];
            if (cached && cached.turnId) return String(cached.turnId).trim();
            if (global.TcWorkbenchSession &&
                typeof global.TcWorkbenchSession.getTurnIdForBatchKey === 'function') {
                var mapped = String(global.TcWorkbenchSession.getTurnIdForBatchKey(batchKey) || '').trim();
                if (mapped) return mapped;
            }
        }
        return '';
    }

    /** 质量检查抽屉是否正在查看当前会话最新轮次（非历史轮次）。 */
    function isValidateViewingLatestSessionTurn(scope) {
        scope = normalizeValidateScope(scope);
        var latestId = getLatestSessionTurnId(scope);
        if (!latestId) return true;
        var viewingId = resolveViewingTurnIdForValidation(scope);
        if (!viewingId) return true;
        return viewingId === latestId;
    }

    /** 落库/缓存专用：禁止回退 currentTurnId，避免第二轮 QC 写入第一轮 turn */
    function resolveTurnIdForPersistCache(snap, draftKey) {
        snap = snap || {};
        draftKey = String(draftKey || '').trim();
        if (snap._persistTurnId) return String(snap._persistTurnId).trim();
        bindPersistTurnIdToSnapshot(snap);
        if (snap._persistTurnId) return String(snap._persistTurnId).trim();
        if (draftKey.indexOf('turn-') === 0) return draftKey.slice(5);
        if (draftKey) {
            var cached = batchValidationCache[draftKey];
            if (cached && cached.turnId) {
                var cachedTurnId = String(cached.turnId).trim();
                if (global.TcWorkbenchSession &&
                    typeof global.TcWorkbenchSession.getTurnIdForBatchKey === 'function') {
                    var mapped = String(global.TcWorkbenchSession.getTurnIdForBatchKey(draftKey) || '').trim();
                    if (mapped && mapped === cachedTurnId) return cachedTurnId;
                }
            }
            if (global.TcWorkbenchSession &&
                typeof global.TcWorkbenchSession.getTurnIdForBatchKey === 'function') {
                var explicit = String(global.TcWorkbenchSession.getTurnIdForBatchKey(draftKey) || '').trim();
                if (explicit) return explicit;
            }
        }
        return '';
    }

    function ensureUniqueBatchIdForValidationRun(snap, runToken) {
        snap = snap || {};
        if (String(snap.batchId || '').trim()) return snap;
        var token = parseInt(runToken, 10) || 0;
        snap.batchId = 'qc-run-' + token + '-' + Date.now();
        if (state && !String(state.batchId || '').trim()) {
            state.batchId = snap.batchId;
        }
        return snap;
    }


    function queuePendingValidationFlush(batchKey, snap, validation, reasoning) {
        batchKey = String(batchKey || '').trim();
        if (!batchKey || !validation) return;
        var normalized = normalizeValidationForDisplay(validation) || validation;
        if (!normalized || !validationHasActionableResults(normalized)) return;
        var entry = {
            batchKey: batchKey,
            snap: cloneBatchSnapshot(snap || {}),
            validation: JSON.parse(JSON.stringify(normalized)),
            reasoning: String(reasoning || ''),
            ts: Date.now()
        };
        pendingValidationFlushQueue = pendingValidationFlushQueue.filter(function (item) {
            return String(item.batchKey || '') !== batchKey;
        });
        pendingValidationFlushQueue.push(entry);
    }

    function takePendingValidationFlush(batchKey, turnId) {
        batchKey = String(batchKey || '').trim();
        turnId = String(turnId || '').trim();
        var i, item, picked = null, pickedIdx = -1;
        if (batchKey) {
            for (i = pendingValidationFlushQueue.length - 1; i >= 0; i--) {
                item = pendingValidationFlushQueue[i];
                if (!item) continue;
                if (String(item.batchKey || '') === batchKey || batchKeysValidationMatch(batchKey, item.batchKey)) {
                    picked = item;
                    pickedIdx = i;
                    break;
                }
                var itemSuffix = String(item.batchKey || '').split('@').pop();
                var wantSuffix = String(batchKey || '').split('@').pop();
                if (itemSuffix && wantSuffix && itemSuffix === wantSuffix) {
                    picked = item;
                    pickedIdx = i;
                    break;
                }
            }
        }
        if (!picked && turnId) {
            var turnKey = buildTurnScopedValidationKey(turnId);
            for (i = pendingValidationFlushQueue.length - 1; i >= 0; i--) {
                item = pendingValidationFlushQueue[i];
                if (!item) continue;
                if (String(item.batchKey || '') === turnKey) {
                    picked = item;
                    pickedIdx = i;
                    break;
                }
            }
        }
        if (pickedIdx >= 0) pendingValidationFlushQueue.splice(pickedIdx, 1);
        return picked;
    }

    function resolveTurnValidationPayloadFromState(turnId) {
        turnId = String(turnId || '').trim();
        if (!turnId || !global.TcWorkbenchSession ||
            typeof global.TcWorkbenchSession.getTurnFromState !== 'function') {
            return null;
        }
        var row = global.TcWorkbenchSession.getTurnFromState(turnId);
        if (!row || !row.validation || typeof row.validation !== 'object') return null;
        var normalized = normalizeValidationForDisplay(row.validation);
        if (!normalized || !validationHasActionableResults(normalized)) return null;
        return {
            validation: normalized,
            validate_reasoning: String(row.validate_reasoning || ''),
            batch_meta: row.batch_meta && typeof row.batch_meta === 'object'
                ? cloneBatchSnapshot(row.batch_meta) : null
        };
    }

    function flushPendingValidationForTurn(turnId, batchKey, scope) {
        turnId = String(turnId || '').trim();
        batchKey = String(batchKey || '').trim();
        if (!turnId) return Promise.resolve(null);
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var pending = takePendingValidationFlush(batchKey, turnId);
        if (!pending) return Promise.resolve(null);
        var snap = pending.snap || {};
        snap._persistTurnId = turnId;
        snap.batchValidationKey = buildTurnScopedValidationKey(turnId);
        attachTurnIdToValidationCache(pending.batchKey || batchKey, turnId);
        batchValidationCache[snap.batchValidationKey] = {
            lastValidation: JSON.parse(JSON.stringify(pending.validation)),
            validateLlmReasoning: String(pending.reasoning || ''),
            batchSnapshot: cloneBatchSnapshot(snap),
            validateRequiredProfile: state._validateRequiredProfile || null,
            turnId: turnId
        };
        return flushTurnValidationToDatabase(scope, pending.validation, pending.reasoning, snap);
    }

    function scoreValidationPayload(validation) {
        if (!validation || typeof validation !== 'object') return 0;
        var score = 0;
        if (validation.llm_done && !validation.llm_skipped) score += 100000;
        if (validation.llm_pending) score -= 50000;
        var runId = parseInt(validation.validate_run_id, 10) || 0;
        score += runId * 100;
        var validatedAt = parseInt(validation.validated_at, 10) || 0;
        score += validatedAt / 1e6;
        var gapCount = parseInt(validation.gap_count, 10);
        if (isNaN(gapCount)) gapCount = (validation.gap_issues || []).length;
        var overCount = parseInt(validation.over_generated_count, 10);
        if (isNaN(overCount)) overCount = (validation.over_generated_issues || []).length;
        score += gapCount * 1000;
        score += overCount * 1000;
        var parseRowCount = resolveParseRowCountForValidation(validation);
        if (parseRowCount) {
            if (overCount > parseRowCount) score -= 50000;
        }
        return score;
    }

    function cloneValidationPayload(validation) {
        return validation ? JSON.parse(JSON.stringify(validation)) : null;
    }

    function pickPreferredValidationPayload(primary, fallback) {
        if (!primary) return cloneValidationPayload(fallback);
        if (!fallback) return cloneValidationPayload(primary);
        return cloneValidationPayload(
            scoreValidationPayload(primary) >= scoreValidationPayload(fallback) ? primary : fallback
        );
    }

    function buildBatchMetaForTurnFlush(turnId, cachedSnap) {
        turnId = String(turnId || '').trim();
        var turnKey = buildTurnScopedValidationKey(turnId);
        var base = cachedSnap && typeof cachedSnap === 'object' ? cloneBatchSnapshot(cachedSnap) : {};
        var meta = Object.assign({}, base, {
            batchValidationKey: turnKey,
            batchId: base.batchId || null,
            batchRowStart: base.batchRowStart != null ? base.batchRowStart : 0,
            batchRowCount: base.batchRowCount || 0
        });
        if (base.batchParsedRows && base.batchParsedRows.length) meta.batchParsedRows = base.batchParsedRows;
        if (base.batchParsedColumns && base.batchParsedColumns.length) meta.batchParsedColumns = base.batchParsedColumns;
        if (base.batchParsedTableRowIndices && base.batchParsedTableRowIndices.length) {
            meta.batchParsedTableRowIndices = base.batchParsedTableRowIndices;
        }
        if (base.batchRequirements) meta.batchRequirements = base.batchRequirements;
        if (base.batchUserContent) meta.batchUserContent = base.batchUserContent;
        return meta;
    }

    function persistStaleValidationRun(scope, merged, runToken, runSnap, reasoning) {
        scope = normalizeValidateScope(scope);
        if (isStandaloneQualityCheckActive(scope)) return Promise.resolve(null);
        runToken = parseInt(runToken, 10) || 0;
        if (!runToken || !merged) return Promise.resolve(null);
        var vData = vScopeData(scope);
        var normalized = normalizeValidationForDisplay(merged) || merged;
        if (!normalized || !validationHasActionableResults(normalized)) return Promise.resolve(null);
        if (normalized.llm_pending) return Promise.resolve(null);
        if (!normalized.llm_done && !normalized.llm_skipped) return Promise.resolve(null);
        runSnap = cloneBatchSnapshot(
            runSnap ||
            (vData._validationRunSnapshots && vData._validationRunSnapshots[runToken]) ||
            vData._validationRunSnapshot
        );
        if (!runSnap || !(runSnap.batchRowCount || (runSnap.batchParsedRows && runSnap.batchParsedRows.length))) {
            if (vData._validationRunSnapshots) delete vData._validationRunSnapshots[runToken];
            return Promise.resolve(null);
        }
        bindPersistTurnIdToSnapshot(runSnap);
        var batchKey = String(runSnap.batchValidationKey || buildBatchValidationKey(runSnap)).trim();
        if (batchKey) runSnap.batchValidationKey = batchKey;
        var reasoningText = String(reasoning || '');
        var turnId = resolveTurnIdForPersist(batchKey, runSnap);
        var cacheKey = resolvePersistedValidationKey(runSnap, turnId) || batchKey;
        if (cacheKey) {
            runSnap.batchValidationKey = cacheKey;
            batchValidationCache[cacheKey] = {
                lastValidation: JSON.parse(JSON.stringify(normalized)),
                validateLlmReasoning: reasoningText,
                batchSnapshot: cloneBatchSnapshot(runSnap),
                validateRequiredProfile: state._validateRequiredProfile || null,
                turnId: turnId || null
            };
            if (!turnId) {
                queuePendingValidationFlush(cacheKey, runSnap, normalized, reasoningText);
            }
            if (turnId) attachTurnIdToValidationCache(batchKey, turnId);
            if (turnId && global.TcWorkbenchSession && typeof global.TcWorkbenchSession.onValidationCached === 'function') {
                global.TcWorkbenchSession.onValidationCached(cacheKey);
            }
        }
        return flushTurnValidationToDatabase(scope, normalized, reasoningText, runSnap).finally(function () {
            if (vData._validationRunSnapshots) delete vData._validationRunSnapshots[runToken];
        });
    }

    function flushTurnValidationToDatabase(scope, validation, reasoning, batchMeta) {
        scope = normalizeValidateScope(scope);
        if (isStandaloneQualityCheckActive(scope)) return Promise.resolve(null);
        if (!validation || typeof validation !== 'object') return Promise.resolve(null);
        if (!global.TcWorkbenchSession) return Promise.resolve(null);
        var vDataFlush = vScopeData(scope);
        var reasoningText = String(reasoning || vDataFlush.validateLlmReasoning || '');
        var normalized = normalizeValidationForDisplay(validation) || validation;
        if (!normalized || !validationHasActionableResults(normalized)) return Promise.resolve(null);
        if (!normalized.llm_done || normalized.llm_skipped || normalized.llm_pending) {
            return Promise.resolve(null);
        }
        var snap = batchMeta && typeof batchMeta === 'object'
            ? cloneBatchSnapshot(batchMeta)
            : cloneBatchSnapshot(vDataFlush._validationRunSnapshot || vDataFlush.validationBatchSnapshot || vDataFlush.batchSnapshot);
        bindPersistTurnIdToSnapshot(snap);
        var batchKey = String(snap.batchValidationKey || buildBatchValidationKey(snap)).trim();
        if (batchKey) snap.batchValidationKey = batchKey;
        var resolvedTurnId = resolveTurnIdForPersist(batchKey, snap);
        if (snap._persistTurnId) {
            resolvedTurnId = String(snap._persistTurnId).trim();
        }
        function persistToTurn(turnId) {
            turnId = String(snap._persistTurnId || turnId || '').trim();
            if (!turnId || typeof global.TcWorkbenchSession.saveTurnValidation !== 'function') {
                return Promise.resolve(null);
            }
            var persistKey = resolvePersistedValidationKey(snap, turnId);
            if (persistKey) {
                snap.batchValidationKey = persistKey;
                attachTurnIdToValidationCache(batchKey, turnId);
            }
            var scopeCtx = getValidationScopeContext();
            return global.TcWorkbenchSession.saveTurnValidation(
                turnId,
                normalized,
                reasoningText,
                typeof global.TcWorkbenchEnhancements.buildBatchMetaForTurnFlush === 'function'
                    ? global.TcWorkbenchEnhancements.buildBatchMetaForTurnFlush(turnId, snap)
                    : snap,
                scopeCtx.sessionId
            ).then(function (turn) {
                if (global.TcWorkbenchSession &&
                    typeof global.TcWorkbenchSession.mergeTurnValidationInState === 'function') {
                    global.TcWorkbenchSession.mergeTurnValidationInState(turnId, {
                        validation: normalized,
                        validate_reasoning: reasoningText,
                        batch_meta: snap
                    });
                }
                if (global.TcWorkbenchSession &&
                    typeof global.TcWorkbenchSession.patchTurnChainValidationKey === 'function') {
                    global.TcWorkbenchSession.patchTurnChainValidationKey(turnId, persistKey || ('turn-' + turnId));
                }
                vDataFlush._validationRunSnapshot = null;
                return turn;
            });
        }
        if (!resolvedTurnId && global.TcWorkbenchSession) {
            if (typeof global.TcWorkbenchSession.getTurnIdForBatchKey === "function" && batchKey) {
                resolvedTurnId = String(global.TcWorkbenchSession.getTurnIdForBatchKey(batchKey) || "").trim();
            }
            if (!resolvedTurnId && batchKey.indexOf("turn-") === 0) {
                resolvedTurnId = batchKey.slice(5);
            }
        }
        if (resolvedTurnId) {
            return persistToTurn(resolvedTurnId).catch(function () { return null; });
        }
        if (global.TcWorkbenchSession && typeof global.TcWorkbenchSession.ensureTurnForValidation === "function") {
            return global.TcWorkbenchSession.ensureTurnForValidation({
                batchValidationKey: batchKey,
                batchMeta: snap,
                chain: { batchValidationKey: batchKey }
            }).then(function (tid) {
                tid = String(tid || "").trim();
                if (!tid) return null;
                snap._persistTurnId = tid;
                return persistToTurn(tid);
            }).catch(function () { return null; });
        }
        return Promise.resolve(null);
    }

    function resolveLocalValidationFallback(scope, batchKey) {
        scope = normalizeValidateScope(scope);
        batchKey = String(batchKey || '').trim();
        var vData = vScopeData(scope);
        var local = vData.lastValidation;
        if (!local || !validationHasActionableResults(local)) return null;
        var snap = vData.validationBatchSnapshot || vData.batchSnapshot;
        var localKey = String(snap.batchValidationKey || buildBatchValidationKey(snap)).trim();
        if (batchKey && localKey && !batchKeysValidationMatch(batchKey, localKey)) {
            return null;
        }
        var normalized = normalizeValidationForDisplay(local);
        if (!normalized || !validationHasActionableResults(normalized)) return null;
        return {
            validation: normalized,
            validate_reasoning: String(vData.validateLlmReasoning || ''),
            batch_meta: cloneBatchSnapshot(snap)
        };
    }


    function resolveTurnScopedValidationFallback(scope, turnId, batchKey) {
        scope = normalizeValidateScope(scope);
        turnId = String(turnId || '').trim();
        batchKey = String(batchKey || '').trim();
        if (!batchKey && turnId) batchKey = 'turn-' + turnId;

        function packFromCache(cached) {
            if (!cached || !cached.lastValidation || !validationHasActionableResults(cached.lastValidation)) {
                return null;
            }
            var normalized = normalizeValidationForDisplay(cached.lastValidation);
            if (!normalized || !validationHasActionableResults(normalized)) return null;
            return {
                validation: normalized,
                validate_reasoning: String(cached.validateLlmReasoning || ''),
                batch_meta: cloneBatchSnapshot(cached.batchSnapshot)
            };
        }

        if (turnId) {
            var turnScopedKey = buildTurnScopedValidationKey(turnId);
            var cachedByTurnKey = getCachedBatchValidation(turnScopedKey);
            if (cachedByTurnKey) {
                var fromTurnKey = packFromCache(cachedByTurnKey);
                if (fromTurnKey) return fromTurnKey;
            }
        }
        if (batchKey) {
            var cachedByKey = getCachedBatchValidation(batchKey);
            if (cachedByKey && (!turnId || !cachedByKey.turnId || String(cachedByKey.turnId) === turnId)) {
                var fromKey = packFromCache(cachedByKey);
                if (fromKey) return fromKey;
            }
        }
        if (turnId) {
            var cacheKeys = Object.keys(batchValidationCache);
            for (var i = 0; i < cacheKeys.length; i++) {
                var cachedByTurn = batchValidationCache[cacheKeys[i]];
                if (!cachedByTurn || String(cachedByTurn.turnId || '') !== turnId) continue;
                var fromTurn = packFromCache(cachedByTurn);
                if (fromTurn) return fromTurn;
            }
        }
        var pending = takePendingValidationFlush(batchKey, turnId);
        if (pending) {
            var fromPending = packFromCache({
                lastValidation: pending.validation,
                validateLlmReasoning: pending.reasoning,
                batchSnapshot: pending.snap
            });
            if (fromPending) return fromPending;
        }
        var fromState = resolveTurnValidationPayloadFromState(turnId);
        if (fromState) return fromState;
        if (!turnId) return resolveLocalValidationFallback(scope, batchKey);
        return null;
    }

    function resolveLiveValidationFallback(scope, turnId, batchKey) {
        scope = normalizeValidateScope(scope);
        turnId = String(turnId || '').trim();
        batchKey = String(batchKey || '').trim();
        var vData = vScopeData(scope);
        if (!vData.lastValidation || !validationHasActionableResults(vData.lastValidation)) {
            return null;
        }
        var normalized = normalizeValidationForDisplay(vData.lastValidation);
        if (!normalized || !validationHasActionableResults(normalized)) return null;
        var snap = cloneBatchSnapshot(vData.validationBatchSnapshot || vData.batchSnapshot || {});
        if (turnId) snap._persistTurnId = turnId;
        if (batchKey) snap.batchValidationKey = batchKey;
        return {
            validation: normalized,
            validate_reasoning: String(vData.validateLlmReasoning || ''),
            batch_meta: snap
        };
    }

    function applyValidationPayloadToScope(scope, payload, renderOpts) {
        renderOpts = renderOpts || {};
        scope = normalizeValidateScope(scope);
        payload = payload || {};
        var validation = payload.validation;
        if (!validation || !validationHasActionableResults(validation)) return false;
        validation = normalizeValidationForDisplay(validation);
        if (!validation) return false;

        var turnId = String(payload.turnId || '').trim();
        var batchKey = String(payload.batchKey || '').trim();
        if (!batchKey && payload.batch_meta && payload.batch_meta.batchValidationKey) {
            batchKey = String(payload.batch_meta.batchValidationKey).trim();
        }
        if (!batchKey && turnId) batchKey = 'turn-' + turnId;

        var snap = payload.batch_meta && typeof payload.batch_meta === 'object'
            ? cloneBatchSnapshot(payload.batch_meta)
            : cloneBatchSnapshot(vScopeData(scope).batchSnapshot);
        if (batchKey) snap.batchValidationKey = batchKey;

        if (batchKey) {
            batchValidationCache[batchKey] = {
                lastValidation: cloneValidationPayload(validation),
                validateLlmReasoning: String(payload.validate_reasoning || ''),
                batchSnapshot: snap,
                validateRequiredProfile: state._validateRequiredProfile || null,
                turnId: turnId || null
            };
        }

        var vData = vScopeData(scope);
        vData.lastValidation = cloneValidationPayload(validation);
        vData.validateLlmReasoning = String(payload.validate_reasoning || '');
        if (payload.batch_meta && typeof payload.batch_meta === 'object') {
            vData.batchSnapshot = cloneBatchSnapshot(payload.batch_meta);
            vData.validationBatchSnapshot = cloneBatchSnapshot(payload.batch_meta);
        } else if (batchKey) {
            vData.batchSnapshot = snap;
            vData.validationBatchSnapshot = cloneBatchSnapshot(snap);
        }

        renderValidationIssues(vData.lastValidation, scope, Object.assign({
            skipCoverageMerge: false,
            skipPersist: true,
            skipGenChatSync: true,
            skipPersistDb: true,
            skipCompleteOutcome: true
        }, renderOpts));
        syncValidationMatrixFromResult(vData.lastValidation, scope);
        refreshValidationLlmStepFromResult(vData.lastValidation, scope);
        updateValidateReopenBtn(scope);
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.refreshCoveragePanel === 'function') {
            global.TcCoverageMatrix.refreshCoveragePanel(scope);
        }
        return true;
    }


    function resolveSessionIdForTurnValidation(opts) {
        opts = opts || {};
        var sessionId = String(opts.sessionId || '').trim();
        if (sessionId) return sessionId;
        if (global.TcWorkbenchSession &&
            typeof global.TcWorkbenchSession.getCurrentSessionId === 'function') {
            sessionId = String(global.TcWorkbenchSession.getCurrentSessionId() || '').trim();
        }
        return sessionId || '';
    }

    function fetchTurnValidationFromApi(turnId, forceFetch, sessionId) {
        turnId = String(turnId || '').trim();
        if (!turnId) return Promise.reject(new Error('缺少 turnId'));
        if (global.TcWorkbenchSession &&
            typeof global.TcWorkbenchSession.loadTurnValidation === 'function') {
            return global.TcWorkbenchSession.loadTurnValidation(turnId, !!forceFetch, sessionId);
        }
        sessionId = resolveSessionIdForTurnValidation({ sessionId: sessionId });
        var url = sessionId
            ? ('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId) + '/turns/' + encodeURIComponent(turnId) + '/validation')
            : ('/api/test-cases/workbench-sessions/turns/' + encodeURIComponent(turnId) + '/validation');
        if (forceFetch) url += (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
        return fetchJson(url);
    }

    function enrichValidationWithBatchMeta(validation, batchMeta) {
        if (!validation || typeof validation !== 'object') return validation;
        var out = Object.assign({}, validation);
        if (!resolveParseRowCountForValidation(out) && batchMeta && batchMeta.batchRowCount) {
            var rc = parseInt(batchMeta.batchRowCount, 10);
            if (!isNaN(rc) && rc > 0) out.parse_row_count = rc;
        }
        return out;
    }

    function loadTurnValidationAndOpen(opts) {
        opts = opts || {};
        var scope = normalizeValidateScope(opts.scope);
        var turnId = String(opts.turnId || resolveTurnIdForValidation(opts) || '').trim();
        if (!turnId) {
            openValidateDrawerFromLiveState(opts);
            return;
        }
        historicalValidateTurnId = turnId;
        var batchKey = buildTurnScopedValidationKey(turnId) || String(opts.batchKey || '').trim();
        var forceFetch = opts.forceFetch !== false;
        var sessionId = resolveSessionIdForTurnValidation(opts);
        var isHistoricalTurnView = !!turnId;
        var localFallback = isHistoricalTurnView ? null : resolveTurnScopedValidationFallback(scope, turnId, batchKey);

        fetchTurnValidationFromApi(turnId, forceFetch, sessionId).then(function (data) {
            var metaBatchKey = data && data.batch_meta && data.batch_meta.batchValidationKey
                ? String(data.batch_meta.batchValidationKey).trim() : '';
            if ((!localFallback || !localFallback.validation) && metaBatchKey) {
                localFallback = resolveTurnScopedValidationFallback(scope, turnId, metaBatchKey) || localFallback;
            }
            var batchMetaRaw = (data && data.batch_meta && typeof data.batch_meta === 'object')
                ? data.batch_meta
                : ((localFallback && localFallback.batch_meta) ? localFallback.batch_meta : {});
            var apiValidation = data && data.validation
                ? normalizeValidationForDisplay(enrichValidationWithBatchMeta(data.validation, batchMetaRaw))
                : null;
            var localValidation = localFallback && localFallback.validation
                ? localFallback.validation
                : null;
            var mergedValidation = null;
            var apiHasObject = !!(data && data.validation && typeof data.validation === 'object');
            if (isHistoricalTurnView) {
                if (apiHasObject && apiValidation && validationHasActionableResults(apiValidation)) {
                    mergedValidation = cloneValidationPayload(apiValidation);
                } else {
                    var stateOnly = resolveTurnValidationPayloadFromState(turnId);
                    if (stateOnly && stateOnly.validation && validationHasActionableResults(stateOnly.validation)) {
                        mergedValidation = cloneValidationPayload(stateOnly.validation);
                        localFallback = stateOnly;
                    }
                }
            } else if (apiHasObject) {
                mergedValidation = apiValidation
                    ? cloneValidationPayload(apiValidation)
                    : normalizeValidationForDisplay(enrichValidationWithBatchMeta(data.validation, batchMetaRaw));
            } else if (localValidation && validationHasActionableResults(localValidation)) {
                mergedValidation = cloneValidationPayload(localValidation);
            }

            if (!mergedValidation || !validationHasActionableResults(mergedValidation)) {
                var healFallback = resolveTurnScopedValidationFallback(scope, turnId, batchKey) ||
                    resolveTurnValidationPayloadFromState(turnId) ||
                    resolveLiveValidationFallback(scope, turnId, batchKey);
                if (healFallback && healFallback.validation && validationHasActionableResults(healFallback.validation)) {
                    mergedValidation = cloneValidationPayload(healFallback.validation);
                    localFallback = healFallback;
                } else if (opts.userInitiated) {
                    historicalValidateTurnId = turnId;
                    openValidateDrawerFromLiveState(Object.assign({}, opts, { turnId: turnId, batchKey: batchKey }));
                    return;
                } else {
                    historicalValidateTurnId = null;
                    if (typeof global.showToast === 'function') {
                        global.showToast('该轮次暂无质量检查结果', 'info');
                    }
                    return;
                }
            }

            historicalValidateTurnId = turnId;
            if (!batchKey && data && data.batch_meta && data.batch_meta.batchValidationKey) {
                batchKey = String(data.batch_meta.batchValidationKey).trim();
            }
            if (!batchKey) batchKey = 'turn-' + turnId;

            var reasoning = String(
                (data && data.validate_reasoning) ||
                (localFallback && localFallback.validate_reasoning) ||
                ''
            );
            var batchMeta = (data && data.batch_meta && typeof data.batch_meta === 'object')
                ? cloneBatchSnapshot(data.batch_meta)
                : ((localFallback && localFallback.batch_meta) ? cloneBatchSnapshot(localFallback.batch_meta) : {});
            batchMeta.batchValidationKey = batchKey;

            var apiScore = scoreValidationPayload(apiValidation);
            var mergedScore = scoreValidationPayload(mergedValidation);
            if (!isHistoricalTurnView && mergedScore > apiScore && global.TcWorkbenchSession &&
                typeof global.TcWorkbenchSession.saveTurnValidation === 'function') {
                global.TcWorkbenchSession.saveTurnValidation(
                    turnId,
                    mergedValidation,
                    reasoning,
                    batchMeta,
                    sessionId
                );
            }

            if (global.TcWorkbenchSession &&
                typeof global.TcWorkbenchSession.mergeTurnValidationInState === 'function') {
                global.TcWorkbenchSession.mergeTurnValidationInState(turnId, {
                    validation: mergedValidation,
                    validate_reasoning: reasoning,
                    batch_meta: batchMeta
                });
            }

            applyValidationPayloadToScope(scope, {
                validation: mergedValidation,
                validate_reasoning: reasoning,
                batch_meta: batchMeta,
                batchKey: batchKey,
                turnId: turnId
            });

            openValidateDrawerInner(Object.assign({}, opts, {
                turnId: '',
                batchKey: '',
                _fromTurnDb: true,
                _skipCacheRestore: true
            }));
        }).catch(function (err) {
            historicalValidateTurnId = null;
            if (!batchKey) batchKey = 'turn-' + turnId;
            var cachedFallback = localFallback || resolveTurnScopedValidationFallback(scope, turnId, batchKey) ||
                resolveLiveValidationFallback(scope, turnId, batchKey);
            if (cachedFallback && applyValidationPayloadToScope(scope, {
                validation: cachedFallback.validation,
                validate_reasoning: cachedFallback.validate_reasoning,
                batch_meta: cachedFallback.batch_meta,
                batchKey: batchKey,
                turnId: turnId
            })) {
                openValidateDrawerInner(Object.assign({}, opts, {
                    turnId: '',
                    batchKey: '',
                    _skipCacheRestore: true
                }));
                if (typeof global.showToast === 'function') {
                    global.showToast('无法拉取服务端检查结果，已展示本地最新结果', 'warning');
                }
                return;
            }
            if (typeof global.showToast === 'function') {
                global.showToast((err && err.message) || '拉取质量检查结果失败', 'warning');
            }
        });
    }

    function openValidateDrawerFromLiveState(opts) {
        opts = opts || {};
        var scope = normalizeValidateScope(opts.scope);
        var batchKey = String(opts.batchKey || '').trim();
        var localFallback = resolveLocalValidationFallback(scope, batchKey);
        if (!localFallback || !applyValidationPayloadToScope(scope, {
            validation: localFallback.validation,
            validate_reasoning: localFallback.validate_reasoning,
            batch_meta: localFallback.batch_meta,
            batchKey: batchKey,
            turnId: resolveTurnIdForValidation(opts)
        })) {
            if (typeof global.showToast === 'function') {
                global.showToast('暂无质量检查结果', 'info');
            }
            return;
        }
        openValidateDrawerInner(Object.assign({}, opts, {
            _skipCacheRestore: true
        }));
    }

    function openValidateDrawerInner(opts) {
        opts = opts || {};
        var scope = normalizeValidateScope(opts.scope);
        if (shouldSuppressValidateDrawerAutoOpen(opts, scope)) return;
        var restoredFromCache = false;
        if (scope === VALIDATE_SCOPE_SINGLE && !opts._fromTurnDb && !opts._skipCacheRestore) {
            restoredFromCache = switchDisplayedBatchValidation(scope, opts.batchKey || '');
        }
        collapseOtherValidateDrawerBeforeOpen(scope);
        var drawer = getValidatePanel(scope);
        if (isValidateSingleSideDrawer(scope) && isValidateSingleSideDrawerEl(drawer)) {
            if (opts._inPlaceUpdate && isValidateDrawerOpen(scope)) {
                bringTcFloatPanelToFront(drawer);
                syncValidateReopenButtonsLayout();
                return;
            }
            openValidateSingleSideDrawer(Object.assign({ syncFromMini: !!opts.syncFromMini }, opts));
            if (opts._standaloneQcRun && typeof global.TcCoverageMatrix !== 'undefined' &&
                typeof global.TcCoverageMatrix.resetFillUiBeforeStandaloneQc === 'function') {
                global.TcCoverageMatrix.resetFillUiBeforeStandaloneQc(scope);
            }
            if (reconcileValidateDrawerFillProgressOnOpen(scope) === 'fill' && !opts._standaloneQcRun) {
                syncValidateReopenButtonsLayout();
                return;
            }
            var vDataSingle = vScopeData(scope);
            if (vDataSingle.validateProgress && vDataSingle.validateProgress.active) {
                renderValidationProgressUI(scope);
            } else if (vDataSingle.lastValidation && !restoredFromCache && !opts.batchKey && !opts._fromTurnDb) {
                refreshValidationIssuesView(scope);
            }
            syncValidateReopenButtonsLayout();
            return;
        }
        ensureValidateDrawerDefaultSize(scope);
        if (opts.center) {
            resetValidateFloatPosition(scope);
        }
        if (drawer) {
            drawer.classList.remove('hidden');
            drawer.setAttribute('aria-hidden', 'false');
            applyValidateFloatLayout(scope);
            if (opts.center) {
                var offsetIndex = 0;
                centerValidateFloatPanel(scope, offsetIndex);
            }
            bringTcFloatPanelToFront(drawer);
        }
        var vData = vScopeData(scope);
        if (vData.validateProgress && vData.validateProgress.active) {
            renderValidationProgressUI(scope);
        } else if (vData.lastValidation && !restoredFromCache && !opts.batchKey && !opts._fromTurnDb) {
            refreshValidationIssuesView(scope);
        }
        var reopen = vEl('tc-validate-float-reopen-btn', scope);
        if (reopen) reopen.classList.add('hidden');
        syncValidateReopenButtonsLayout();
    }

    function restoreCurrentBatchValidationView(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        if (!historicalValidateTurnId) return;
        historicalValidateTurnId = null;
        refreshValidationIssuesView(scope);
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.refreshCoveragePanel === 'function') {
            global.TcCoverageMatrix.refreshCoveragePanel(scope);
        }
    }

    function openValidateDrawer(opts) {
        opts = opts || {};
        var scope = normalizeValidateScope(opts.scope);
        if (opts._skipTurnLoad) {
            openValidateDrawerInner(opts);
            return;
        }
        var forceFetch = opts.forceFetch !== false;
        var turnId = resolveTurnIdForValidation(opts);
        if (forceFetch && turnId) {
            loadTurnValidationAndOpen(Object.assign({}, opts, {
                turnId: turnId,
                scope: scope,
                forceFetch: true
            }));
            return;
        }
        if (turnId) {
            loadTurnValidationAndOpen(Object.assign({}, opts, { turnId: turnId, scope: scope }));
            return;
        }
        openValidateDrawerInner(opts);
    }

    function closeValidateDrawer(scope) {
        if (!scope) {
                                    syncValidateReopenButtonsLayout();
            return;
        }
        scope = normalizeValidateScope(scope);
        if (scope === VALIDATE_SCOPE_SINGLE) {
            notifyValidateDrawerFillProgressOnClose(scope);
        }
        var drawer = getValidatePanel(scope);
        if (isValidateSingleSideDrawer(scope) && isValidateSingleSideDrawerEl(drawer)) {
            if (drawer && isValidateDrawerOpen(scope)) {
                if (drawer.classList.contains('tc-validate-drawer--open')) {
                    closeValidateSingleSideDrawer();
                } else {
                    forceCloseValidateSingleSideDrawerImmediate();
                }
            } else if (drawer) {
                if (validateSingleCloseTimer) {
                    global.clearTimeout(validateSingleCloseTimer);
                    validateSingleCloseTimer = null;
                }
                drawer.classList.add('hidden');
                drawer.setAttribute('aria-hidden', 'true');
                if (scope === VALIDATE_SCOPE_SINGLE) {
                    restoreCurrentBatchValidationView(scope);
                }
                updateValidateReopenBtn(scope);
            }
            syncValidateReopenButtonsLayout();
            if (scope === VALIDATE_SCOPE_SINGLE) {
                syncStandaloneQualityCheckButtonChromeIfNeeded();
            }
            return;
        }
        if (drawer) {
            drawer.classList.add('hidden');
            drawer.setAttribute('aria-hidden', 'true');
        }
        if (scope === VALIDATE_SCOPE_SINGLE) {
            restoreCurrentBatchValidationView(scope);
        }
        updateValidateReopenBtn(scope);
        syncValidateReopenButtonsLayout();
        if (scope === VALIDATE_SCOPE_SINGLE) {
            syncStandaloneQualityCheckButtonChromeIfNeeded();
        }
    }

    function shrinkValidatePanel(scope) {
        scope = normalizeValidateScope(scope);
        var floatState = vScopeData(scope).floatState;
        if (floatState.maximized) {
            floatState.maximized = false;
            floatState.customWidth = null;
            floatState.customHeight = null;
        }
        floatState.sizeIndex = Math.max(0, floatState.sizeIndex - 1);
        floatState.customWidth = validateFloatSizes[floatState.sizeIndex].w;
        floatState.customHeight = validateFloatSizes[floatState.sizeIndex].h;
        applyValidateFloatLayout(scope);
    }

    function expandValidatePanel(scope) {
        scope = normalizeValidateScope(scope);
        var floatState = vScopeData(scope).floatState;
        if (floatState.sizeIndex >= validateFloatSizes.length - 1) {
            floatState.maximized = !floatState.maximized;
            if (!floatState.maximized) {
                floatState.customWidth = validateFloatSizes[floatState.sizeIndex].w;
                floatState.customHeight = validateFloatSizes[floatState.sizeIndex].h;
            }
        } else {
            floatState.maximized = false;
            floatState.sizeIndex = Math.min(validateFloatSizes.length - 1, floatState.sizeIndex + 1);
            floatState.customWidth = validateFloatSizes[floatState.sizeIndex].w;
            floatState.customHeight = validateFloatSizes[floatState.sizeIndex].h;
        }
        applyValidateFloatLayout(scope);
    }

    function bindValidateFloatPanel(scope) {
        scope = normalizeValidateScope(scope);
        if (isValidateSingleSideDrawer(scope)) {
            bindValidateSingleSideDrawer(scope);
            return;
        }
        var panel = getValidatePanel(scope);
        if (!panel || panel._tcValidateFloatBound) return;
        panel._tcValidateFloatBound = true;
        resetValidateFloatPosition(scope);
        panel.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            bringTcFloatPanelToFront(panel);
        }, true);

        var dragHandle = panel.querySelector('[data-validate-drag-handle="' + scope + '"]');
        var resizeHandle = panel.querySelector('.tc-validate-float-resize');
        var shrinkBtn = vEl('tc-validate-float-shrink', scope);
        var expandBtn = vEl('tc-validate-float-expand', scope);
        var reopenBtn = vEl('tc-validate-float-reopen-btn', scope);
        var closeBtn = vEl('tc-validate-drawer-close', scope);

        if (shrinkBtn) shrinkBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            shrinkValidatePanel(scope);
        });
        if (expandBtn) expandBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            expandValidatePanel(scope);
        });
        if (reopenBtn) reopenBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleValidateDrawer({ scope: scope });
        });
        if (closeBtn) closeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            handleValidateDrawerCloseRequest(scope);
        });

        if (dragHandle) {
            dragHandle.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                if (e.target.closest('.tc-validate-float-panel__winbtn')) return;
                var floatState = vScopeData(scope).floatState;
                if (floatState.maximized) return;
                e.preventDefault();
                var rect = panel.getBoundingClientRect();
                var startX = e.clientX;
                var startY = e.clientY;
                var origLeft = rect.left;
                var origTop = rect.top;
                panel.style.transition = 'none';
                function onMove(ev) {
                    var left = origLeft + (ev.clientX - startX);
                    var top = origTop + (ev.clientY - startY);
                    left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
                    top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8));
                    floatState.left = left;
                    floatState.top = top;
                    panel.style.left = left + 'px';
                    panel.style.top = top + 'px';
                }
                function onUp() {
                    panel.style.transition = '';
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        }

        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', function (e) {
                var floatState = vScopeData(scope).floatState;
                if (e.button !== 0 || floatState.maximized) return;
                e.preventDefault();
                e.stopPropagation();
                var rect = panel.getBoundingClientRect();
                var startX = e.clientX;
                var startY = e.clientY;
                var origW = rect.width;
                var origH = rect.height;
                panel.style.transition = 'none';
                function onMove(ev) {
                    var w = Math.max(280, Math.min(origW + (ev.clientX - startX), window.innerWidth - rect.left - 8));
                    var h = Math.max(240, Math.min(origH + (ev.clientY - startY), window.innerHeight - rect.top - 8));
                    floatState.customWidth = w;
                    floatState.customHeight = h;
                    floatState.maximized = false;
                    panel.style.width = w + 'px';
                    panel.style.height = h + 'px';
                }
                function onUp() {
                    panel.style.transition = '';
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        }
    }


    function formatPostFillCoverageLine(result) {
        if (!result || result.coverage_rate == null) return '';
        var parts = ['补全后覆盖率 ' + result.coverage_rate + '%'];
        if (result.coverage_uncovered != null) parts.push('未覆盖 ' + result.coverage_uncovered);
        if (result.coverage_partial != null) parts.push('部分覆盖 ' + result.coverage_partial);
        return parts.join(' · ');
    }

    /**
     * 抽屉顶部摘要的覆盖率后缀（新方法）。
     * 有「可能遗漏」时不拼接「补全后覆盖率 / 未覆盖」，避免出现「遗漏 18 · 未覆盖 0」矛盾。
     * 不修改 formatPostFillCoverageLine，其它路径不受影响。
     */
    function formatValidateDrawerSummaryCoverageSuffix(stored, counts) {
        if (!stored || stored.coverage_rate == null) return '';
        counts = counts || getValidationProblemCounts(stored);
        if (counts.gap > 0) return '';
        return formatPostFillCoverageLine(stored);
    }


    function syncValidateDrawerSummary(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        var summary = vEl('tc-validate-drawer-summary', scope);
        if (!summary) return;
        if (vData.validateProgress && vData.validateProgress.active) return;
        if (vData.lastValidation) {
            summary.textContent = buildValidateResultSummaryText(vData.lastValidation, scope);
        }
    }

    function reconcileValidateDrawerFillProgressOnOpen(scope) {
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.onValidateDrawerOpened === 'function') {
            return global.TcCoverageMatrix.onValidateDrawerOpened(scope);
        }
        return null;
    }

    function notifyValidateDrawerFillProgressOnClose(scope) {
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.onValidateDrawerClosed === 'function') {
            global.TcCoverageMatrix.onValidateDrawerClosed(scope);
        }
    }

    function buildValidateResultSummaryText(stored, scope) {
        if (!stored) return '';
        scope = normalizeValidateScope(scope);
        var counts = getValidationProblemCounts(stored);
        var issues = counts.formatIssues;
        var fmt = counts.format;
        var gapCount = counts.gap;
        var overCount = counts.over;
        var text = '';
        if (stored.llm_pending) {
            text = issues.length
                ? '格式 ' + fmt + ' 项 · AI 对照中…'
                : '格式已通过 · AI 对照中（约 1～3 分钟）…';
        } else if (stored.llm_skipped) {
            // 超时/失败/跳过都展示真实原因，避免无问题时误写「问题已全部解决」
            text = formatLlmSkippedMessage(stored) || '格式检查通过（已跳过 AI 对照）';
        } else if (counts.total > 0) {
            var summaryParts = [];
            if (issues.length || fmt) summaryParts.push('格式/必填 ' + (issues.length || fmt) + ' 项');
            if (overCount) summaryParts.push('AI 过度 ' + overCount + ' 项');
            if (gapCount) summaryParts.push('可能遗漏 ' + gapCount + ' 项');
            text = '问题清单 ' + counts.total + ' 项（' + summaryParts.join(' · ') + '）';
        } else {
            text = '问题已全部解决 ✓';
        }
        /* 通过英雄区已展示覆盖指标时，摘要行保持短句，避免与矩阵工具栏抢视线 */
        if (validationResultIsCleanPass(stored)) {
            return text;
        }
        var covLine = formatValidateDrawerSummaryCoverageSuffix(stored, counts);
        if (covLine && text) text = text + ' · ' + covLine;
        return text;
    }

    function mergeCoverageIntoValidationResult(payload, base) {
        base = base || {};
        var out = Object.assign({}, base);
        (payload.steps || []).forEach(function (st) {
            if (st.step_key === 'coverage' && st.status === 'done' && st.output) {
                var cov = st.output;
                if (cov.coverage_rate != null) out.coverage_rate = cov.coverage_rate;
                if (cov.uncovered != null) out.coverage_uncovered = cov.uncovered;
                if (cov.partial != null) out.coverage_partial = cov.partial;
                if (cov.over_generated != null) out.coverage_over_generated = cov.over_generated;
            }
        });
        if (out.coverage_rate == null && payload.result && payload.result.coverage_matrix) {
            var summary = payload.result.coverage_matrix.summary || {};
            if (summary.coverage_rate != null) {
                out.coverage_rate = summary.coverage_rate;
                out.coverage_uncovered = summary.uncovered;
                out.coverage_partial = summary.partial;
                out.coverage_over_generated = summary.over_generated;
            }
        }
        return out;
    }



    /**
     * 矩阵/问题清单过度项补 type（新方法）。
     * 不影响 partition/normalize 原逻辑；仅补缺省 hallucination，避免回写后被清空。
     */
    function ensureOverGeneratedIssuesTypedForDisplay(result) {
        if (!result || typeof result !== 'object') return result;
        var overs = Array.isArray(result.over_generated_issues)
            ? result.over_generated_issues : [];
        if (!overs.length) return result;
        var changed = false;
        overs.forEach(function (issue) {
            if (!issue) return;
            if (!issue.type) {
                issue.type = 'hallucination';
                changed = true;
            }
        });
        if (!changed) return result;
        result.over_generated_issues = overs;
        if (result.over_generated_count == null) {
            result.over_generated_count = overs.length;
        }
        return result;
    }

    /** 统一统计问题数量，避免 count / issues 数组不一致导致摘要与列表错位 */
    function getValidationProblemCounts(stored) {
        stored = stored || {};
        var formatIssues = stored.issues || [];
        var gapIssues = stored.gap_issues || [];
        var overIssues = stored.over_generated_issues || [];
        var format = stored.format_count != null ? Number(stored.format_count) || 0 : formatIssues.length;
        var gap = stored.gap_count != null ? Number(stored.gap_count) || 0 : gapIssues.length;
        var over = stored.over_generated_count != null ? Number(stored.over_generated_count) || 0 : overIssues.length;
        /* 以数组长度为准兜底，防止 count=0 但仍有条目 */
        if (formatIssues.length > format) format = formatIssues.length;
        if (gapIssues.length > gap) gap = gapIssues.length;
        if (overIssues.length > over) over = overIssues.length;
        return {
            format: format,
            gap: gap,
            over: over,
            total: format + gap + over,
            formatIssues: formatIssues,
            gapIssues: gapIssues,
            overIssues: overIssues
        };
    }

    /** 定位目标行是否仍在当前表格/导图中（问题清单专用，不改公共 locate） */
    function isValidationIssueRowAvailable(rowIndex, scope) {
        var ri = parseInt(rowIndex, 10);
        if (isNaN(ri) || ri < 0) return false;
        scope = normalizeValidateScope(scope);
        try {
            if (isValidateMindmapBatch(vScopeData(scope).batchSnapshot)) {
                if (typeof getMindmapCasesRows === 'function') {
                    var mm = getMindmapCasesRows() || [];
                    return ri < mm.length;
                }
                return false;
            }
        } catch (e0) { /* ignore */ }
        if (typeof global.testCasesData !== 'undefined' && Array.isArray(global.testCasesData)) {
            return ri < global.testCasesData.length;
        }
        return false;
    }

    /**
     * 按行指纹校对过度生成项（新方法，替代「仅凭行号越界就删除」）。
     * - 有指纹且全表找不到：才视为该用例已删，移除
     * - 无指纹：一律保留；行号越界则清空 row_index（不显示定位），绝不误删其余问题
     */
    function pruneStaleOverGeneratedIssuesForIssueList(stored, scope) {
        if (!stored) return { stored: stored, changed: false, removed: 0 };
        scope = normalizeValidateScope(scope);
        var overs = Array.isArray(stored.over_generated_issues) ? stored.over_generated_issues.slice() : [];
        if (!overs.length) {
            stored.over_generated_count = 0;
            return { stored: stored, changed: false, removed: 0 };
        }

        var tableLen = 0;
        try {
            if (isValidateMindmapBatch(vScopeData(scope).batchSnapshot) && typeof getMindmapCasesRows === 'function') {
                tableLen = (getMindmapCasesRows() || []).length;
            } else if (typeof global.testCasesData !== 'undefined' && Array.isArray(global.testCasesData)) {
                tableLen = global.testCasesData.length;
            }
        } catch (eLen) { tableLen = 0; }

        /* 表格暂时为空时不裁剪，避免误清空 */
        if (!tableLen) {
            return { stored: stored, changed: false, removed: 0 };
        }

        function buildFpAt(absIndex) {
            if (typeof global.testCasesData === 'undefined' || !Array.isArray(global.testCasesData)) return '';
            if (absIndex < 0 || absIndex >= global.testCasesData.length) return '';
            var row = global.testCasesData[absIndex];
            if (!Array.isArray(row)) return '';
            return row.map(function (c) {
                return String(c == null ? '' : c).replace(/\s+/g, ' ').trim();
            }).join('\u0001');
        }

        function findByFp(fp, preferred) {
            if (!fp || typeof global.testCasesData === 'undefined') return null;
            var rows = global.testCasesData;
            var pref = preferred != null ? parseInt(preferred, 10) : NaN;
            if (!isNaN(pref) && pref >= 0 && pref < rows.length && buildFpAt(pref) === fp) return pref;
            for (var i = 0; i < rows.length; i++) {
                if (buildFpAt(i) === fp) return i;
            }
            return null;
        }

        var kept = [];
        var removed = 0;
        var changed = false;
        overs.forEach(function (issue) {
            if (!issue) return;
            var fp = String(issue.row_fingerprint || '');
            var ri = issue.row_index;
            if (fp) {
                var found = findByFp(fp, ri);
                if (found == null) {
                    /* 保留过度生成问题文案，仅去掉定位；避免删 1 行误清空清单 */
                    if (issue.row_index != null && issue.row_index !== '') {
                        issue.row_index = null;
                        changed = true;
                    }
                    kept.push(issue);
                    return;
                }
                if (issue.row_index !== found) {
                    issue.row_index = found;
                    changed = true;
                }
                kept.push(issue);
                return;
            }
            /* 无指纹：保留问题文案 */
            if (ri != null && ri !== '') {
                var n = parseInt(ri, 10);
                if (!isNaN(n) && n >= tableLen) {
                    issue.row_index = null;
                    changed = true;
                }
            }
            kept.push(issue);
        });

        if (!changed && removed === 0 && kept.length === overs.length) {
            stored.over_generated_count = kept.length;
            return { stored: stored, changed: false, removed: 0 };
        }
        stored.over_generated_issues = kept;
        stored.over_generated_count = kept.length;
        if (stored.coverage_over_generated != null) {
            stored.coverage_over_generated = kept.length;
        }
        return { stored: stored, changed: true, removed: removed };
    }

    /** 问题清单过度项渲染（新方法）：仅当行号有效时显示定位；越界不删条目、不给定位 */
    function renderValidationOverIssueItemHtml(issue, scope, locateLabel) {
        var text = '';
        if (typeof formatValidationIssueDisplayText === 'function') {
            text = formatValidationIssueDisplayText(issue);
        } else {
            text = String((issue && issue.message) || '');
        }
        var html = '<span class="tc-validate-issue__text">' + esc(text) + '</span>';
        if (typeof renderValidationIssueStatusBadge === 'function') {
            html += renderValidationIssueStatusBadge(issue);
        }
        html += '<span class="tc-validate-issue__actions">';
        if (issue && issue.row_index != null && issue.row_index !== '' &&
            isValidationIssueRowAvailable(issue.row_index, scope)) {
            var rowNo = parseInt(issue.row_index, 10) + 1;
            var btnLabel = (locateLabel || '定位行') + ' ' + rowNo;
            html += '<button type="button" class="tc-validate-locate btn btn-secondary btn-sm" data-row="' +
                issue.row_index + '" title="定位到第 ' + rowNo + ' 条">' + esc(btnLabel) + '</button>';
            /* 行内删过度：新按钮 class，委托矩阵删除引擎，不影响矩阵卡片绑定 */
            html += '<button type="button" class="tc-issues-delete-over-one btn btn-secondary btn-sm" data-row="' +
                issue.row_index + '" title="删除此过度生成用例">删除</button>';
        } else if (issue && (issue.row_index == null || issue.row_index === '')) {
            html += '<span class="tc-validate-issue__gone">待重新定位</span>';
        }
        html += '</span>';
        return html;
    }

    /**
     * 问题清单过度行内删除绑定（新方法）：委托 TcIssueMatrix.deleteOverGeneratedFromIssueList。
     * 不改 bindValidateLocateButtons / 矩阵卡片删除绑定。
     */
    function bindIssueListOverDeleteButtons(list, scope) {
        if (!list) return;
        scope = normalizeValidateScope(scope);
        list.querySelectorAll('.tc-issues-delete-over-one').forEach(function (btn) {
            if (btn._tcIssuesDelBound) return;
            btn._tcIssuesDelBound = true;
            btn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var ri = parseInt(btn.getAttribute('data-row'), 10);
                var matrix = global.TcIssueMatrix || global.TcCoverageMatrix;
                if (!matrix || typeof matrix.deleteOverGeneratedFromIssueList !== 'function') {
                    if (matrix && typeof matrix.deleteOverGeneratedFromMatrix === 'function') {
                        matrix.deleteOverGeneratedFromMatrix({ mode: 'one', absIndex: ri }, scope);
                        return;
                    }
                    return;
                }
                matrix.deleteOverGeneratedFromIssueList({ mode: 'one', absIndex: ri }, scope);
            });
        });
    }

    /**
     * 问题清单渲染后挂载交互（新方法）：定位 + 删过度 + 刷新动作条。
     * 替代在多处重复 bind，避免漏挂；不改 bindValidateLocateButtons 本身。
     */
    function bindValidationIssueListInteractions(list, scope) {
        bindValidateLocateButtons(list, scope);
        bindIssueListOverDeleteButtons(list, scope);
        syncIssueListActionsToolbarAfterRender(scope);
        if (global.TcIssueMatrix &&
            typeof global.TcIssueMatrix.applyIssueListPrimaryActionsChrome === 'function') {
            try {
                global.TcIssueMatrix.applyIssueListPrimaryActionsChrome(scope);
            } catch (e0) { /* ignore */ }
        }
    }

    /** 刷新问题清单动作条（新方法）：委托矩阵模块，无矩阵时本地隐藏 */
    function syncIssueListActionsToolbarAfterRender(scope) {
        scope = normalizeValidateScope(scope);
        var matrix = global.TcIssueMatrix || global.TcCoverageMatrix;
        if (matrix && typeof matrix.renderIssueListActionsToolbar === 'function') {
            try {
                matrix.renderIssueListActionsToolbar(scope);
                return;
            } catch (e0) { /* fall through */ }
        }
        var bar = vEl('tc-issues-actions-toolbar', scope);
        if (bar) {
            bar.classList.add('hidden');
            bar.setAttribute('aria-hidden', 'true');
        }
    }

    function renderOverGeneratedIssueSection(overIssues, scope) {
        if (!overIssues.length) return '';
        scope = normalizeValidateScope(scope);
        var locateLabel = isValidateMindmapBatch(vScopeData(scope).batchSnapshot) ? '定位用例' : '定位行';
        var html = '<section class="tc-validate-group tc-validate-group--over">' +
            '<div class="tc-validate-group__head">' +
            '<h4 class="tc-validate-group__title">过度生成</h4>' +
            '<span class="tc-validate-group__hint">需求未提及</span>' +
            '<span class="tc-validate-group__count">' + overIssues.length + '</span>' +
            '</div><ul class="tc-validate-group__list">';
        overIssues.forEach(function (issue) {
            html += '<li class="tc-validate-issue tc-validate-issue--over">' +
                renderValidationOverIssueItemHtml(issue, scope, locateLabel) + '</li>';
        });
        html += '</ul></section>';
        return html;
    }

    /**
     * 问题清单为空时的通过态展示（独立卡片，不影响有问题列表渲染）。
     */

    /**
     * 无可列问题时的状态卡（新方法）：格式通过/未跑 AI/跳过等，不复用有问题列表布局。
     */
    function renderValidateNoIssueStatusHtml(stored, passParts, passMod) {
        stored = stored || {};
        passParts = passParts || buildValidatePassEmptyParts(stored);
        var title = passParts.title || '问题已全部解决';
        var detail = passParts.detail || '';
        /* 未跑 AI 但格式无问题：文案更清晰，避免像「失败空态」 */
        if (stored.llm_skipped &&
            stored.llm_skip_reason !== LLM_SKIP_REASON.TIMEOUT &&
            stored.llm_skip_reason !== LLM_SKIP_REASON.ERROR) {
            title = '格式检查已通过';
            detail = formatLlmSkippedMessage(stored) || '未运行 AI 对照，当前没有可列问题';
        }
        if (validationResultIsCleanPass(stored)) {
            return renderValidateCleanPassHeroHtml(stored);
        }
        return (
            '<div class="tc-validate-noissue" role="status">' +
                '<div class="tc-validate-noissue__mark" aria-hidden="true">' +
                    '<svg viewBox="0 0 56 56" fill="none">' +
                        '<circle cx="28" cy="28" r="26" stroke="currentColor" stroke-width="1.25" opacity="0.18"/>' +
                        '<circle cx="28" cy="28" r="18.5" fill="currentColor" opacity="0.09"/>' +
                        '<path d="M18.5 28.5l6.2 6.2 13-14.2" stroke="currentColor" stroke-width="2.6" ' +
                        'stroke-linecap="round" stroke-linejoin="round"/>' +
                    '</svg>' +
                '</div>' +
                '<p class="tc-validate-noissue__kicker">Quality Check</p>' +
                '<p class="tc-validate-noissue__title">' + esc(title) + '</p>' +
                (detail ? ('<p class="tc-validate-noissue__detail">' + esc(detail) + '</p>') : '') +
            '</div>'
        );
    }

    function renderValidatePassEmptyHtml(title, detail, modClass) {
        title = String(title || '检查通过').trim() || '检查通过';
        detail = String(detail || '').trim();
        modClass = String(modClass || '').trim();
        var cls = 'tc-validate-pass' + (modClass ? (' ' + modClass) : '');
        return (
            '<div class="' + cls + '" role="status">' +
                '<div class="tc-validate-pass__icon" aria-hidden="true">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
                        'd="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
                    '</svg>' +
                '</div>' +
                '<div class="tc-validate-pass__body">' +
                    '<p class="tc-validate-pass__title">' + esc(title) + '</p>' +
                    (detail
                        ? ('<p class="tc-validate-pass__detail">' + esc(detail) + '</p>')
                        : '') +
                '</div>' +
            '</div>'
        );
    }

    /**
     * 质量检查「全部通过」专用英雄区（新方法，不影响 renderValidatePassEmptyHtml / 有问题列表）。
     * 用于补充后 QC 无问题时：隐藏选项按钮，展示简约专业通过态。
     */
    function renderValidateCleanPassHeroHtml(stored) {
        /* 统一走更清晰的通过态面板，避免旧英雄区动画/空白导致中间一片空 */
        return renderValidateCleanPassResolvedPanelHtml(stored);
    }

    /**
     * 质量检查「问题已全部解决」中间面板（新方法）。
     * 仅用于 clean-pass 抽屉中间区；不改动有问题列表 / 旧 pass 卡片。
     */
    function renderValidateCleanPassResolvedPanelHtml(stored) {
        stored = stored || {};
        var parts = buildValidatePassEmptyParts(stored);
        var items = buildValidateCleanPassResolvedItems(stored);
        var title = parts.title || '问题已全部解决';
        var detail = parts.detail || '格式、必填与 AI 对照均已通过，当前没有待处理问题';
        var itemsHtml = '<ul class="tc-validate-clean-pass-resolved__list" aria-label="已通过检查项">';
        items.forEach(function (item) {
            itemsHtml +=
                '<li class="tc-validate-clean-pass-resolved__item">' +
                    '<span class="tc-validate-clean-pass-resolved__ok" aria-hidden="true">✓</span>' +
                    '<span class="tc-validate-clean-pass-resolved__item-body">' +
                        '<span class="tc-validate-clean-pass-resolved__item-label">' + esc(item.label) + '</span>' +
                        '<span class="tc-validate-clean-pass-resolved__item-hint">' + esc(item.hint) + '</span>' +
                    '</span>' +
                '</li>';
        });
        itemsHtml += '</ul>';
        var tip = buildValidateCleanPassResolvedTip(stored);
        return (
            '<div class="tc-validate-clean-pass-resolved" role="status">' +
                '<div class="tc-validate-clean-pass-resolved__badge" aria-hidden="true">' +
                    '<svg viewBox="0 0 56 56" fill="none">' +
                        '<circle cx="28" cy="28" r="26" stroke="currentColor" stroke-width="1.25" opacity="0.18"/>' +
                        '<circle cx="28" cy="28" r="18.5" fill="currentColor" opacity="0.1"/>' +
                        '<path d="M18.5 28.5l6.2 6.2 13-14.2" stroke="currentColor" stroke-width="2.6" ' +
                        'stroke-linecap="round" stroke-linejoin="round"/>' +
                    '</svg>' +
                '</div>' +
                '<p class="tc-validate-clean-pass-resolved__eyebrow">质量检查结果</p>' +
                '<p class="tc-validate-clean-pass-resolved__title">' + esc(title) + '</p>' +
                '<p class="tc-validate-clean-pass-resolved__detail">' + esc(detail) + '</p>' +
                itemsHtml +
                (tip
                    ? ('<p class="tc-validate-clean-pass-resolved__tip">' + esc(tip) + '</p>')
                    : '') +
            '</div>'
        );
    }

    /** 通过态检查项（新方法，仅供 resolved 面板） */
    function buildValidateCleanPassResolvedItems(stored) {
        stored = stored || {};
        var items = [
            { label: '格式 / 表头', hint: '表头与字段格式检查已通过' },
            { label: '必填字段', hint: '必要字段均已填写完整' }
        ];
        if (stored.llm_done && !stored.llm_skipped) {
            items.push({ label: 'AI 对照', hint: '未发现胡编或需求遗漏' });
        } else if (stored.llm_pending) {
            items.push({ label: 'AI 对照', hint: '对照进行中，完成后自动更新' });
        } else if (stored.llm_skipped) {
            items.push({
                label: 'AI 对照',
                hint: formatLlmSkippedMessage(stored) || '本次未运行 AI 对照'
            });
        } else {
            items.push({ label: '问题清单', hint: '当前没有待处理问题' });
        }
        return items;
    }

    /** 通过态底部提示（新方法） */
    function buildValidateCleanPassResolvedTip(stored) {
        stored = stored || {};
        if (stored.llm_done && !stored.llm_skipped) {
            return '本批用例已通过格式、必填与 AI 对照，可继续编辑、导出或进入下一流程。';
        }
        if (stored.llm_skipped) {
            return '当前没有可列问题。如需 AI 对照，请补全需求上下文后重新检查。';
        }
        return '当前没有待处理问题，可继续后续流程。';
    }

    /** 通过态检查项清单（仅展示文案，不改检查逻辑） */
    function buildValidateCleanPassCheckItems(stored) {
        return buildValidateCleanPassResolvedItems(stored);
    }

    /** 问题清单为空时的通过态文案 */
    function buildValidatePassEmptyParts(stored) {
        stored = stored || {};
        if (stored.llm_pending) {
            return {
                title: '格式检查通过',
                detail: 'AI 对照检查进行中，完成后将自动更新…'
            };
        }
        if (stored.llm_skip_reason === LLM_SKIP_REASON.TIMEOUT) {
            return {
                title: 'AI 对照超时',
                detail: '格式与必填结果已保留，可稍后重试'
            };
        }
        if (stored.llm_skip_reason === LLM_SKIP_REASON.ERROR) {
            return {
                title: 'AI 对照未完成',
                detail: formatLlmSkippedMessage(stored) || '格式结果已保留，可稍后重试'
            };
        }
        if (stored.llm_done && !stored.llm_skipped) {
            return {
                title: '问题已全部解决',
                detail: '格式、必填与 AI 对照均已通过，当前没有待处理问题'
            };
        }
        if (stored.llm_skipped) {
            return {
                title: '格式检查已通过',
                detail: formatLlmSkippedMessage(stored) || '未运行 AI 对照，当前没有可列问题'
            };
        }
        return {
            title: '问题已全部解决',
            detail: '相关问题已处理完毕，当前问题清单为空'
        };
    }

    /** 无格式/遗漏/过度问题，且 AI 对照完整通过 → 完整通过（保留原语义，供补充收尾等使用） */
    function validationResultIsCleanPass(stored) {
        if (!stored || stored.llm_pending) return false;
        if (stored.llm_skipped) return false;
        if (stored.llm_skip_reason === LLM_SKIP_REASON.TIMEOUT) return false;
        var counts = getValidationProblemCounts(stored);
        return counts.total === 0;
    }

    /**
     * 问题清单无可列问题（新方法）：用于隐藏「问题清单/矩阵」Tab。
     * 包含：全部通过、仅格式通过未跑 AI、AI 跳过/超时但无格式问题等；有任一条问题则返回 false。
     */
    function validationResultHasNoActionableIssues(stored) {
        if (!stored || stored.llm_pending) return false;
        var counts = getValidationProblemCounts(stored);
        return counts.total === 0;
    }

    /**
     * 无问题时隐藏 Tab / 矩阵工具栏 / 补充按钮，并强制回到问题清单区展示通过态内容。
     * 使用 HasNoActionableIssues，避免「未跑 AI 但无问题」时仍露出双 Tab。
     */
    /** 通过态中间内容（新方法）：保证始终有可见卡片，禁止空白 */
    function buildValidateCleanPassBodyHtml(stored) {
        stored = stored || {};
        var parts = buildValidatePassEmptyParts(stored);
        var html = '';
        try {
            if (validationResultIsCleanPass(stored)) {
                html = renderValidateCleanPassHeroHtml(stored);
            } else if (typeof renderValidateNoIssueStatusHtml === 'function') {
                html = renderValidateNoIssueStatusHtml(stored, parts, '');
            }
        } catch (eHero) { html = ''; }
        if (!html || !String(html).trim()) {
            html = renderValidatePassEmptyHtml(
                parts.title || '问题已全部解决',
                parts.detail || '当前问题清单已清空，可继续后续流程'
            );
        }
        if (!html || !String(html).trim()) {
            html = '<div class="tc-validate-noissue" role="status">' +
                '<p class="tc-validate-noissue__title">问题已全部解决</p>' +
                '<p class="tc-validate-noissue__detail">当前没有待处理问题</p></div>';
        }
        return html;
    }

    function applyValidateCleanPassDrawerChrome(scope, stored) {
        scope = normalizeValidateScope(scope);
        var drawer = getValidatePanel(scope);
        if (!drawer) return false;
        /* 抽屉已缩小/关闭：禁止再刷通过态强制可见，避免右侧空白块 */
        if (!isValidateSingleDrawerVisiblyOpen(scope)) {
            drawer.classList.remove('tc-validate-drawer--clean-pass');
            stripValidateCleanPassInlineForceStyles(scope);
            return false;
        }
        var clean = validationResultHasNoActionableIssues(stored);
        drawer.classList.toggle('tc-validate-drawer--clean-pass', clean);
        if (!clean) return false;

        drawer.classList.remove('tc-validate-drawer--coverage');
        drawer.classList.remove('tc-validate-drawer--fill-active');

        if (global.TcCoverageMatrix &&
            typeof global.TcCoverageMatrix.switchValidateTab === 'function') {
            global.TcCoverageMatrix.switchValidateTab('issues', scope);
        }

        var issuesList = vEl('tc-validate-issue-list', scope);
        var covPanel = vEl('tc-validate-coverage-panel', scope);
        var fillPanel = vEl('tc-validate-fill-progress', scope);
        if (issuesList) {
            issuesList.classList.remove('hidden');
            issuesList.setAttribute('aria-hidden', 'false');
            /* 无可列问题：重绘居中状态区，避免双 Tab + 中间空白 */
            paintValidateCleanPassIssueList(issuesList, stored);
        }
        if (covPanel) {
            covPanel.classList.add('hidden');
            covPanel.setAttribute('aria-hidden', 'true');
        }
        if (fillPanel) {
            fillPanel.classList.add('hidden');
            fillPanel.setAttribute('aria-hidden', 'true');
        }

        var toolbar = vEl('tc-coverage-toolbar', scope);
        if (toolbar) toolbar.setAttribute('aria-hidden', 'true');
        var fillBtn = vEl('tc-coverage-fill-all-btn', scope);
        if (fillBtn) {
            fillBtn.disabled = true;
            fillBtn.setAttribute('aria-hidden', 'true');
        }
        var filterEl = vEl('tc-coverage-filter', scope);
        if (filterEl) filterEl.setAttribute('aria-hidden', 'true');
        var issuesActions = vEl('tc-issues-actions-toolbar', scope);
        if (issuesActions) {
            issuesActions.classList.add('hidden');
            issuesActions.setAttribute('aria-hidden', 'true');
        }
        return true;
    }

    /**
     * 通过态中间内容强制可见（新方法）：写入 HTML 后去掉动画残留 opacity，禁止空白。
     * 不影响有问题列表的渲染路径。
     */
    function paintValidateCleanPassIssueList(issuesList, stored) {
        if (!issuesList) return;
        var html = buildValidateCleanPassBodyHtml(stored);
        if (!html || !String(html).trim()) {
            html = renderValidatePassEmptyHtml('问题已全部解决', '当前没有待处理问题，可继续后续流程');
        }
        issuesList.innerHTML = html;
        try {
            issuesList.style.removeProperty('visibility');
            issuesList.style.removeProperty('opacity');
            issuesList.style.removeProperty('display');
        } catch (e0) { /* ignore */ }
        var nodes = issuesList.querySelectorAll(
            '.tc-validate-clean-pass-resolved, .tc-validate-clean-pass-hero, .tc-validate-noissue, .tc-validate-pass'
        );
        for (var i = 0; i < nodes.length; i++) {
            try {
                nodes[i].style.setProperty('opacity', '1', 'important');
                nodes[i].style.setProperty('visibility', 'visible', 'important');
                nodes[i].style.setProperty('display', 'block', 'important');
            } catch (e1) { /* ignore */ }
        }
        if (!issuesList.childElementCount) {
            issuesList.innerHTML =
                '<div class="tc-validate-noissue" role="status">' +
                '<p class="tc-validate-noissue__title">问题已全部解决</p>' +
                '<p class="tc-validate-noissue__detail">当前没有待处理问题</p></div>';
        }
    }

    /**
     * 补充用例收尾后再次对齐通过态（新方法）：避免 dismiss 切回覆盖率 Tab 把英雄区藏空。
     */
    function ensureValidateCleanPassUiAfterFill(scope) {
        scope = normalizeValidateScope(scope);
        if (!isValidateSingleDrawerVisiblyOpen(scope)) return false;
        var vData = vScopeData(scope);
        var stored = vData && vData.lastValidation;
        if (!validationResultIsCleanPass(stored)) return false;
        return applyValidateCleanPassDrawerChrome(scope, stored);
    }

    /**
     * 删除过度生成后再次对齐通过态（新方法，不影响补充收尾 ensureValidateCleanPassUiAfterFill）。
     * 矩阵 Tab 删光过度项后，强制切回问题清单并绘制「已全部解决」面板，避免中间空白。
     */
    function ensureValidateCleanPassUiAfterOverDelete(scope) {
        scope = normalizeValidateScope(scope);
        if (!isValidateSingleDrawerVisiblyOpen(scope)) return false;
        var vData = vScopeData(scope);
        var stored = vData && vData.lastValidation;
        if (!validationResultHasNoActionableIssues(stored)) return false;
        var drawer = getValidatePanel(scope);
        if (!drawer) return false;
        drawer.classList.add('tc-validate-drawer--clean-pass');
        drawer.classList.remove('tc-validate-drawer--coverage');
        drawer.classList.remove('tc-validate-drawer--fill-active');
        if (global.TcCoverageMatrix &&
            typeof global.TcCoverageMatrix.switchValidateTab === 'function') {
            try {
                global.TcCoverageMatrix.switchValidateTab('issues', scope);
            } catch (eTab) { /* ignore */ }
        }
        var issuesList = vEl('tc-validate-issue-list', scope);
        var covPanel = vEl('tc-validate-coverage-panel', scope);
        var fillPanel = vEl('tc-validate-fill-progress', scope);
        if (issuesList) {
            issuesList.classList.remove('hidden');
            issuesList.setAttribute('aria-hidden', 'false');
            try {
                issuesList.style.removeProperty('display');
                issuesList.style.removeProperty('visibility');
                issuesList.style.removeProperty('opacity');
            } catch (eStyle) { /* ignore */ }
            paintValidateCleanPassIssueList(issuesList, stored);
        }
        if (covPanel) {
            covPanel.classList.add('hidden');
            covPanel.setAttribute('aria-hidden', 'true');
        }
        if (fillPanel) {
            fillPanel.classList.add('hidden');
            fillPanel.setAttribute('aria-hidden', 'true');
        }
        var summary = vEl('tc-validate-drawer-summary', scope);
        if (summary) {
            summary.textContent = buildValidateResultSummaryText(stored, scope) || '问题已全部解决 ✓';
        }
        return applyValidateCleanPassDrawerChrome(scope, stored);
    }

    /**
     * 无问题时隐藏问题清单/矩阵 Tab；再次检查出现问题后恢复现有布局。
     * 仅改侧边质量检查抽屉，不影响补充进度、Agent 等其它路径。
     */
    function syncValidateDrawerCleanPassLayout(scope, stored) {
        scope = normalizeValidateScope(scope);
        var drawer = getValidatePanel(scope);
        if (!drawer) return false;
        if (!validationResultHasNoActionableIssues(stored)) {
            drawer.classList.remove('tc-validate-drawer--clean-pass');
            return false;
        }
        return applyValidateCleanPassDrawerChrome(scope, stored);
    }

    /** 关闭抽屉专用：去掉 clean-pass 外壳，避免关闭后右侧仍透出通过态卡片 */
    function clearValidateDrawerCleanPassChromeOnClose(scope) {
        scope = normalizeValidateScope(scope);
        var drawer = getValidatePanel(scope);
        if (!drawer) return;
        drawer.classList.remove('tc-validate-drawer--clean-pass');
        stripValidateCleanPassInlineForceStyles(scope);
        try { drawer.style.removeProperty('visibility'); } catch (e0) { /* ignore */ }
        var issuesList = vEl('tc-validate-issue-list', scope);
        if (issuesList) {
            try {
                issuesList.style.removeProperty('visibility');
                issuesList.style.removeProperty('display');
                issuesList.style.removeProperty('opacity');
            } catch (e1) { /* ignore */ }
        }
        clearValidateDrawerCleanPassLayout(scope);
    }

    function clearValidateDrawerCleanPassLayout(scope) {
        scope = normalizeValidateScope(scope);
        var drawer = getValidatePanel(scope);
        if (!drawer) return;
        drawer.classList.remove('tc-validate-drawer--clean-pass');
        var toolbar = vEl('tc-coverage-toolbar', scope);
        if (toolbar) toolbar.removeAttribute('aria-hidden');
        var fillBtn = vEl('tc-coverage-fill-all-btn', scope);
        if (fillBtn) fillBtn.removeAttribute('aria-hidden');
        var filterEl = vEl('tc-coverage-filter', scope);
        if (filterEl) filterEl.removeAttribute('aria-hidden');
    }

    function renderGapIssueSection(gapIssues, scope) {
        if (!gapIssues.length) return '';
        scope = normalizeValidateScope(scope);
        var locateLabel = isValidateMindmapBatch(vScopeData(scope).batchSnapshot) ? '定位用例' : '定位行';
        var html = '<section class="tc-validate-group tc-validate-group--gap">' +
            '<h4 class="tc-validate-group__title">可能遗漏（需求未覆盖）</h4><ul class="tc-validate-group__list">';
        gapIssues.forEach(function (issue) {
            html += '<li class="tc-validate-issue tc-validate-issue--gap">' +
                renderValidationIssueMeta(issue, scope, locateLabel) + '</li>';
        });
        html += '</ul></section>';
        return html;
    }


    /**
     * 仅供问题清单矩阵：更新过度生成列表行号/条目，不重跑矩阵同步（避免冲掉指纹校正）。
     * 不影响通用 renderValidationIssues 默认行为。
     */

    /**
     * 表格删行后重映射问题清单里过度生成的 row_index（新方法）。
     * 只改过度项行号/定位按钮，不影响格式/遗漏项原有逻辑。
     */
    function remapLastValidationOverRowIndexesAfterDeletes(scope, deletedIndexes, opts) {
        opts = opts || {};
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        if (!vData || !vData.lastValidation) return false;
        var dels = [];
        var seen = {};
        (deletedIndexes || []).forEach(function (x) {
            var n = parseInt(x, 10);
            if (isNaN(n) || n < 0 || seen[n]) return;
            seen[n] = true;
            dels.push(n);
        });
        dels.sort(function (a, b) { return a - b; });
        if (!dels.length) return false;

        function mapIndex(ri) {
            var n = parseInt(ri, 10);
            if (isNaN(n) || n < 0) return { remove: false, index: ri };
            for (var i = 0; i < dels.length; i++) {
                if (n === dels[i]) return { remove: true, index: null };
                if (n > dels[i]) n -= 1;
            }
            return { remove: false, index: n };
        }

        var overs = Array.isArray(vData.lastValidation.over_generated_issues)
            ? vData.lastValidation.over_generated_issues.slice()
            : [];
        if (!overs.length) return false;
        var next = [];
        var changed = false;
        var removeBudget = {};
        dels.forEach(function (d) { removeBudget[d] = (removeBudget[d] || 0) + 1; });
        overs.forEach(function (issue) {
            if (!issue) return;
            if (issue.row_index == null || issue.row_index === '') {
                next.push(issue);
                return;
            }
            var ri = parseInt(issue.row_index, 10);
            if (!isNaN(ri) && removeBudget[ri]) {
                removeBudget[ri] -= 1;
                changed = true;
                return;
            }
            var mapped = mapIndex(issue.row_index);
            if (mapped.remove) {
                /* 同下标多余项：保留问题，清空定位，禁止整组删光 */
                issue.row_index = null;
                changed = true;
                next.push(issue);
                return;
            }
            if (issue.row_index !== mapped.index) {
                issue.row_index = mapped.index;
                changed = true;
            }
            next.push(issue);
        });
        if (!changed && next.length === overs.length) return false;
        vData.lastValidation.over_generated_issues = next;
        vData.lastValidation.over_generated_count = next.length;
        if (vData.lastValidation.coverage_over_generated != null) {
            vData.lastValidation.coverage_over_generated = next.length;
        }
        var summaryEl = vEl('tc-validate-drawer-summary', scope);
        if (summaryEl) {
            summaryEl.textContent = buildValidateResultSummaryText(vData.lastValidation, scope);
        }
        if (opts.refreshList !== false) {
            renderValidationIssues(vData.lastValidation, scope, {
                skipCoverageMerge: true,
                skipPersist: true,
                skipGenChatSync: true,
                skipStaleOverPrune: true,
                skipNormalizeDisplay: true
            });
        }
        /* 问题清单行号更新后，同步矩阵 Tab 过度项定位（新方法，不影响其它 merge 路径） */
        if (global.TcCoverageMatrix &&
            typeof global.TcCoverageMatrix.alignMatrixOverGeneratedFromValidation === 'function') {
            try {
                global.TcCoverageMatrix.alignMatrixOverGeneratedFromValidation(
                    vData.lastValidation,
                    scope,
                    { render: true }
                );
            } catch (eAlign) { /* ignore */ }
        }
        return true;
    }

    function patchLastValidationOverGeneratedForMatrix(scope, nextOverIssues, opts) {
        opts = opts || {};
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        if (!vData || !vData.lastValidation) return false;
        var issues = Array.isArray(nextOverIssues) ? nextOverIssues.slice() : [];
        issues = issues.map(function (it) {
            if (!it) return it;
            if (!it.type) it.type = 'hallucination';
            return it;
        }).filter(Boolean);
        /* 矩阵删除路径可跳过指纹 prune，避免与表格位移竞态误清空其余过度项 */
        if (!opts.skipPrune) {
            var tmp = {
                over_generated_issues: issues,
                over_generated_count: issues.length
            };
            pruneStaleOverGeneratedIssuesForIssueList(tmp, scope);
            issues = tmp.over_generated_issues || [];
        }
        vData.lastValidation.over_generated_issues = issues;
        vData.lastValidation.over_generated_count = issues.length;
        if (vData.lastValidation.coverage_over_generated != null) {
            vData.lastValidation.coverage_over_generated = issues.length;
        }
        var summaryEl = vEl('tc-validate-drawer-summary', scope);
        if (summaryEl && typeof buildValidateResultSummaryText === 'function') {
            summaryEl.textContent = buildValidateResultSummaryText(vData.lastValidation, scope);
        }
        if (opts.refreshList !== false) {
            renderValidationIssues(vData.lastValidation, scope, {
                skipCoverageMerge: true,
                skipPersist: opts.skipPersist !== false,
                skipGenChatSync: true,
                skipStaleOverPrune: !!opts.skipPrune,
                /* 矩阵回写已带完整过度列表，禁止 normalize 按 type 重建时丢掉 */
                skipNormalizeDisplay: true
            });
        }
        return true;
    }

    function syncValidationMatrixFromResult(stored, scope) {
        if (!stored || typeof global.TcCoverageMatrix === 'undefined') return;
        if (typeof global.TcCoverageMatrix.syncValidationMatrixFromStored === 'function') {
            global.TcCoverageMatrix.syncValidationMatrixFromStored(stored, scope);
        }
    }

    function bindValidateLocateButtons(list, scope) {
        if (!list) return;
        list.querySelectorAll('.tc-validate-locate').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var row = parseInt(btn.getAttribute('data-row'), 10);
                highlightValidateRow(row, scope);
            });
        });
    }

    function renderValidationIssues(result, scope, renderOpts) {
        renderOpts = renderOpts || {};
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (renderOpts.replacePreviousStandalone && isStandaloneQualityCheckActive(scope) &&
            typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.prepareForValidationRun === 'function') {
            global.TcCoverageMatrix.prepareForValidationRun(scope);
        }
        var progBeforeEnd = vData.validateProgress ? {
            steps: Object.assign({}, vData.validateProgress.steps || {})
        } : null;
        if (!renderOpts.skipCoverageMerge) {
            endValidationProgress(scope);
        }
        if (!renderOpts.skipNormalizeDisplay) {
            /* 矩阵删除回写路径跳过：normalize 会因缺 type=hallucination 把过度项清成 0 */
            result = ensureOverGeneratedIssuesTypedForDisplay(result);
            result = normalizeValidationForDisplay(result) || result;
        } else {
            result = ensureOverGeneratedIssuesTypedForDisplay(result);
        }
        var issues = result.issues || [];
        var displayOverIssues = (result.over_generated_issues || []).slice();
        var displayGapIssues = (result.gap_issues || []).slice();
        var llmReasoning = String(result.llm_reasoning || vData.validateLlmReasoning || '').trim();
        var stored = Object.assign({}, result, {
            issues: issues,
            issue_count: issues.length,
            format_count: result.format_count != null ? result.format_count : issues.length,
            gap_count: displayGapIssues.length,
            gap_issues: displayGapIssues,
            over_generated_count: displayOverIssues.length,
            over_generated_issues: displayOverIssues,
            llm_reasoning: llmReasoning || null
        });
        vData.lastValidation = stored;
        /* 表格删行后清掉无效过度项，避免摘要已通过仍残留定位行 */
        if (!renderOpts.skipStaleOverPrune) {
            var pruned = pruneStaleOverGeneratedIssuesForIssueList(stored, scope);
            if (pruned.changed) {
                stored = pruned.stored;
                vData.lastValidation = stored;
                displayOverIssues = (stored.over_generated_issues || []).slice();
            }
        }
        if (!renderOpts.skipCoverageMerge) {
            syncValidationMatrixFromResult(stored, scope);
        }
        var list = vEl('tc-validate-issue-list', scope);
        var summary = vEl('tc-validate-drawer-summary', scope);
        function finishRenderPersist() {
            if (!renderOpts.skipPersist && !stored.llm_pending) {
                if (!isStandaloneQualityCheckActive(scope)) {
                    captureValidationBatchSnapshot(scope);
                    persistBatchValidationToCache(scope);
                }
            }
        }
        function emitGenChatValidationOutcome(isPartial) {
            if (renderOpts.skipGenChatSync) return;
            if (!isPartial && !(stored && stored.llm_pending)) {
                dismissValidateUiForSkippedNoLanhu(stored, scope);
            }
            var summaryText = buildValidateResultSummaryText(stored, scope) ||
                (summary ? (summary.textContent || '') : '');
            if (shouldSyncValidateToGenChat(scope)) {
                if (isPartial || (stored && stored.llm_pending)) {
                    syncGenChatQualityCheck({
                        detail: summaryText || 'AI 对照检查进行中…'
                    });
                } else {
                    finishGenChatValidation(scope, progBeforeEnd, stored, summaryText, false);
                }
                return;
            }
            if (!isPartial && !(stored && stored.llm_pending) && vData.deferValidateDrawerForGenChat) {
                syncGenChatQualityCheck({
                    finish: true,
                    detail: summaryText || '质量检查完成'
                });
                genChatValidateSyncPending = false;
                syncPromptSendBtnAfterValidationChange();
                maybeAutoOpenDeferredValidateDrawer(scope);
            }
        }
        function completeValidationRenderOutcome(isPartial) {
            if (renderOpts.skipCompleteOutcome) return;
            if (!isPartial && !(stored && stored.llm_pending)) {
                finishQualityStageBar(scope, stored);
                if (typeof registerQcPageSessionOnComplete === 'function') {
                    registerQcPageSessionOnComplete(scope);
                }
            }
            refreshValidationLlmStepFromResult(stored, scope);
            var shouldPersistDb = !renderOpts.skipPersistDb &&
                scope === VALIDATE_SCOPE_SINGLE &&
                !isStandaloneQualityCheckActive(scope) &&
                stored &&
                stored.llm_done &&
                !stored.llm_skipped &&
                !stored.llm_pending;
            if (!shouldPersistDb) {
                emitGenChatValidationOutcome(isPartial);
                return;
            }
            var flushSnap = cloneBatchSnapshot(vData._validationRunSnapshot || vData.validationBatchSnapshot || vData.batchSnapshot);
            flushTurnValidationToDatabase(scope, stored, vData.validateLlmReasoning, flushSnap).finally(function () {
                emitGenChatValidationOutcome(isPartial);
            });
        }
        if (!list) {
            finishRenderPersist();
            completeValidationRenderOutcome(false);
            return;
        }
        var _probCounts = getValidationProblemCounts(stored);
        var fmt = _probCounts.format;
        var gapCount = _probCounts.gap;
        var overCount = _probCounts.over;
        displayOverIssues = _probCounts.overIssues.slice();
        displayGapIssues = _probCounts.gapIssues.slice();
        if (summary) {
            summary.textContent = buildValidateResultSummaryText(stored, scope);
        }
        syncValidateDrawerCleanPassLayout(scope, stored);
        if (stored.llm_pending && !issues.length) {
            var pendingPass = buildValidatePassEmptyParts(stored);
            list.innerHTML = renderValidatePassEmptyHtml(pendingPass.title, pendingPass.detail);
            syncRowHighlight();
            updateValidateReopenBtn();
            emitGenChatValidationOutcome(true);
            return;
        }
        var groups = { structure: '表头/列格式', required: '必填字段', format: '格式问题' };
        var html = '';
        if (!issues.length && !stored.llm_pending) {
            var passParts = buildValidatePassEmptyParts(stored);
            var passMsg = stored.llm_skipped
                ? (formatLlmSkippedMessage(stored) || '格式检查通过（未运行 AI 对照）。')
                : '格式与必填检查通过。';
            if (gapCount) {
                passMsg += ' ' + gapCount + ' 条可能遗漏见下方列表。';
            }
            if (overCount) {
                html += renderOverGeneratedIssueSection(displayOverIssues, scope);
            }
            if (gapCount) {
                html += renderGapIssueSection(displayGapIssues, scope);
            }
            if (overCount || gapCount) {
                clearValidateDrawerCleanPassLayout(scope);
                if (issues.length || gapCount || overCount) {
                    html = (passMsg
                        ? ('<p class="tc-validate-issue-lead">' + esc(passMsg) + '</p>')
                        : '') + html;
                }
                list.innerHTML = html;
                bindValidationIssueListInteractions(list, scope);
                syncRowHighlight();
                updateValidateReopenBtn();
                finishRenderPersist();
                completeValidationRenderOutcome(false);
                return;
            }
            var passMod = '';
            if (stored.llm_skip_reason === LLM_SKIP_REASON.TIMEOUT ||
                stored.llm_skip_reason === LLM_SKIP_REASON.ERROR) {
                passMod = 'tc-validate-pass--partial';
            }
            /* 无可列问题：统一走居中通过态（隐藏双 Tab）；完整 AI 通过用英雄区，其余用精简卡片 */
            if (validationResultHasNoActionableIssues(stored)) {
                paintValidateCleanPassIssueList(list, stored);
            } else {
                html = renderValidatePassEmptyHtml(passParts.title, passParts.detail, passMod);
                if (!html || !String(html).trim()) {
                    paintValidateCleanPassIssueList(list, stored);
                } else {
                    list.innerHTML = html;
                }
            }
            applyValidateCleanPassDrawerChrome(scope, stored);
            bindValidationIssueListInteractions(list, scope);
            syncRowHighlight();
            updateValidateReopenBtn();
            finishRenderPersist();
            completeValidationRenderOutcome(false);
            return;
        }
        clearValidateDrawerCleanPassLayout(scope);
        var breakdownLine = buildIssueListBreakdownLine(issues.length, displayOverIssues.length, gapCount);
        if (breakdownLine) {
            html += '<p class="tc-validate-issue-breakdown">' + esc(breakdownLine) + '</p>';
        }
        ['structure', 'required', 'format'].forEach(function (type) {
            var items = issues.filter(function (i) { return i.type === type; });
            if (!items.length) return;
            html += '<section class="tc-validate-group"><h4 class="tc-validate-group__title">' + groups[type] + '</h4><ul class="tc-validate-group__list">';
            var locateLabel = isValidateMindmapBatch(vData.batchSnapshot) ? '定位用例' : '定位行';
            items.forEach(function (issue) {
                html += '<li class="tc-validate-issue"><span class="tc-validate-issue__text">' + esc(issue.message) + '</span>';
                if (issue.row_index != null) {
                    html += '<button type="button" class="tc-validate-locate btn btn-secondary btn-sm" data-row="' + issue.row_index + '">' + locateLabel + '</button>';
                }
                html += '</li>';
            });
            html += '</ul></section>';
        });
        if (displayOverIssues.length) {
            html += renderOverGeneratedIssueSection(displayOverIssues, scope);
        }
        if (displayGapIssues.length) {
            html += renderGapIssueSection(displayGapIssues, scope);
        }
        if (result.llm_pending) {
            html += '<p class="p-4 text-slate-500">AI 对照检查进行中…</p>';
        }
        list.innerHTML = html;
        bindValidationIssueListInteractions(list, scope);
        syncRowHighlight();
        updateValidateReopenBtn();
        finishRenderPersist();
        completeValidationRenderOutcome(!!result.llm_pending);
    }

    function extractAgentValidateOutput(payload) {
        if (!payload) return null;
        var out = null;
        (payload.steps || []).forEach(function (st) {
            if (st.step_key === 'validate' && st.status === 'done' && st.output) {
                out = st.output;
            }
        });
        if (!out && payload.result && payload.result.validation && payload.result.validation.issues) {
            out = payload.result.validation;
        }
        return out;
    }


    function applyAgentValidationFromJobInPlace(payload, scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var validateOut = extractAgentValidateOutput(payload);
        if (!validateOut) return;
        var issues = validateOut.issues || [];
        renderValidationIssues(mergeCoverageIntoValidationResult(payload, {
            issues: issues,
            issue_count: validateOut.issue_count != null ? validateOut.issue_count : issues.length,
            format_count: validateOut.format_count || 0,
            llm_count: validateOut.llm_count || 0,
            coverage_rate: validateOut.coverage_rate,
            coverage_uncovered: validateOut.coverage_uncovered,
            coverage_partial: validateOut.coverage_partial,
            coverage_over_generated: validateOut.coverage_over_generated,
            format_done: true,
            llm_done: true
        }), scope);
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.switchValidateTab === 'function') {
            global.TcCoverageMatrix.switchValidateTab('issues', scope);
        }
        /* 补充后无问题：再次钉住通过英雄区，防止后续 dismiss 切 Tab 留白 */
        ensureValidateCleanPassUiAfterFill(scope);
    }

    function applyAgentValidationFromJob(payload, scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var validateOut = extractAgentValidateOutput(payload);
        if (!validateOut) return;
        var issues = validateOut.issues || [];
        renderValidationIssues(mergeCoverageIntoValidationResult(payload, {
            issues: issues,
            issue_count: validateOut.issue_count != null ? validateOut.issue_count : issues.length,
            format_count: validateOut.format_count || 0,
            llm_count: validateOut.llm_count || 0,
            coverage_rate: validateOut.coverage_rate,
            coverage_uncovered: validateOut.coverage_uncovered,
            coverage_partial: validateOut.coverage_partial,
            coverage_over_generated: validateOut.coverage_over_generated,
            format_done: true,
            llm_done: true
        }), scope);
        openValidateDrawer({ scope: scope, center: true });
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.switchValidateTab === 'function') {
            global.TcCoverageMatrix.switchValidateTab('issues', scope);
        }
    }

    function refreshValidationIssuesView(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        var list = vEl('tc-validate-issue-list', scope);
        if (!list) return;
        var drawer = getValidatePanel(scope);
        var cleanPass = !!(drawer && drawer.classList.contains('tc-validate-drawer--clean-pass'));
        /* 通过态时即使仍带 hidden（刚从矩阵 Tab 切回），也必须重绘，避免中间空白 */
        if (list.classList.contains('hidden') && !cleanPass) return;
        if (cleanPass) {
            list.classList.remove('hidden');
            list.setAttribute('aria-hidden', 'false');
        }
        var prog = vData.validateProgress;
        if (prog && prog.active) {
            renderValidationProgressUI(scope);
            return;
        }
        if (!vData.lastValidation) return;
        if (validationResultHasNoActionableIssues(vData.lastValidation)) {
            paintValidateCleanPassIssueList(list, vData.lastValidation);
            applyValidateCleanPassDrawerChrome(scope, vData.lastValidation);
            return;
        }
        renderValidationIssues(vData.lastValidation, scope, {
            skipCoverageMerge: true,
            skipPersist: true,
            skipGenChatSync: true,
            skipCompleteOutcome: true
        });
    }


    function isValidateDrawerCloseCancelPromptNeeded(scope) {
        scope = normalizeValidateScope(scope);
        if (scope === VALIDATE_SCOPE_SINGLE && isSingleGenValidationInProgress()) return true;
        var vData = vScopeData(scope);
        return !!(vData.validateProgress && vData.validateProgress.active);
    }

    function cancelQualityStageBarAsCancelled(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (!vData.showStageBar || !global.TcGenStageUi) return;
        if (typeof global.TcGenStageUi.cancelQualityCheck === 'function') {
            global.TcGenStageUi.cancelQualityCheck({ detail: '已取消' });
        } else if (typeof global.TcGenStageUi.hideQualityCheck === 'function') {
            global.TcGenStageUi.hideQualityCheck();
        }
        vData.showStageBar = false;
    }

    function cancelRunningQualityCheckFromDrawer(scope) {
        scope = normalizeValidateScope(scope);
        abortStandaloneValidationFetch(scope);
        var vData = vScopeData(scope);
        vData.validateRunId = (vData.validateRunId || 0) + 1;
        if (vData.validateProgress && vData.validateProgress.active) {
            endValidationProgress(scope);
        }
        if (vData.validateProgress) {
            vData.validateProgress._finishing = false;
        }
        vData.validateProgress = null;
        vData.lastValidation = null;
        vData.validateLlmReasoning = '';
        vData.locateValidateRowIndex = null;
        syncValidateDrawerTabsChromeDuringQcRun(scope);
        if (scope === VALIDATE_SCOPE_SINGLE) {
            vData.standaloneQualityCheckSession = false;
            vData.standaloneQualityCheckPageId = '';
        }
        cancelQualityStageBarAsCancelled(scope);
        if (shouldSyncValidateToGenChat(scope)) {
            syncGenChatQualityCheck({ finish: true, detail: '质量检测已取消' });
            genChatValidateSyncPending = false;
        }
        syncPromptSendBtnAfterValidationChange();
        syncWorkbenchBusyChrome();
        syncStandaloneQualityCheckButtonChromeIfNeeded();
    }

    function resolveValidationPayloadForIssueListCloseCheck(stored) {
        if (!stored) return null;
        if (typeof normalizeValidationForDisplay === 'function') {
            return normalizeValidationForDisplay(stored) || stored;
        }
        return stored;
    }

    function validationStoredHasAnyIssueListProblem(stored) {
        if (!stored || stored.llm_pending) return false;
        var normalized = resolveValidationPayloadForIssueListCloseCheck(stored);
        var issues = normalized.issues || [];
        var gapIssues = normalized.gap_issues || [];
        var overIssues = normalized.over_generated_issues || [];
        var issueCount = Math.max(
            normalized.issue_count != null ? Number(normalized.issue_count) || 0 : 0,
            issues.length
        );
        var gapCount = Math.max(
            normalized.gap_count != null ? Number(normalized.gap_count) || 0 : 0,
            gapIssues.length
        );
        var overCount = Math.max(
            normalized.over_generated_count != null ? Number(normalized.over_generated_count) || 0 : 0,
            overIssues.length
        );
        if (issueCount > 0 || gapCount > 0 || overCount > 0) return true;
        var codeTypes = { format: 1, structure: 1, required: 1 };
        for (var i = 0; i < issues.length; i++) {
            var issue = issues[i];
            if (!issue) continue;
            if (!codeTypes[issue.type]) return true;
        }
        if ((normalized.coverage_over_generated || 0) > 0) return true;
        if ((normalized.coverage_uncovered || 0) > 0) return true;
        return false;
    }

    function validationIssueListDomHasAnyProblem(scope) {
        scope = normalizeValidateScope(scope);
        var list = vEl('tc-validate-issue-list', scope);
        if (!list) return false;
        if (list.querySelector('.tc-validate-issue, .tc-validate-group__list .tc-validate-issue, .tc-validate-group--over, .tc-validate-group--gap')) {
            return true;
        }
        var issuesTab = vEl('tc-validate-tab-issues', scope) || document.getElementById('tc-validate-tab-issues');
        if (issuesTab) {
            var tabText = String(issuesTab.textContent || '').trim();
            if (/^问题清单\s+\d+/.test(tabText)) return true;
        }
        return false;
    }

    function validationCoverageMatrixHasAnyIssueListProblem(scope) {
        if (typeof global.TcCoverageMatrix === 'undefined') return false;
        scope = normalizeValidateScope(scope);
        var matrix = null;
        if (typeof global.TcCoverageMatrix.getMatrix === 'function') {
            matrix = global.TcCoverageMatrix.getMatrix(scope);
        }
        if (!matrix) return false;
        var overRows = (matrix.over_generated_rows || []).length;
        if (overRows > 0) return true;
        var summary = matrix.summary || {};
        if ((summary.over_generated || 0) > 0) return true;
        if ((summary.uncovered || 0) > 0) return true;
        return false;
    }

    function validationIssueListHasAnyProblem(stored, scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (validationStoredHasAnyIssueListProblem(stored)) return true;
        if (stored !== vData.lastValidation && validationStoredHasAnyIssueListProblem(vData.lastValidation)) {
            return true;
        }
        if (validationIssueListDomHasAnyProblem(scope)) return true;
        if (validationCoverageMatrixHasAnyIssueListProblem(scope)) return true;
        return false;
    }

    function isValidateDrawerQcRunCompletedForClose(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        if (vData.validateProgress && vData.validateProgress.active) return false;
        if (vData.validateProgress && vData.validateProgress._finishing) return false;
        if (scope === VALIDATE_SCOPE_SINGLE && isSingleGenValidationInProgress()) return false;
        if (vData.lastValidation && vData.lastValidation.llm_pending) return false;
        if (vData.lastValidation) return true;
        return validationIssueListHasAnyProblem(null, scope);
    }

    function isValidateDrawerCloseConfirmPanelVisible(scope) {
        scope = normalizeValidateScope(scope);
        if (isValidateDrawerOpen(scope)) return true;
        if (isValidateDrawerVisible(scope)) return true;
        var panel = getValidatePanel(scope);
        return !!(panel && !panel.classList.contains('hidden') &&
            panel.getAttribute('aria-hidden') !== 'true');
    }

    function handleValidateDrawerAlwaysCloseConfirmRequest(scope) {
        scope = normalizeValidateScope(scope);
        if (!isValidateDrawerCloseConfirmPanelVisible(scope)) return null;
        var msg = '确认要关闭质量检测结果窗口吗？';
        var confirmFn = typeof global.tcAppConfirm === 'function' ? global.tcAppConfirm : null;
        function onAlwaysCloseConfirmed() {
            finishValidateDrawerCloseByUserDismiss(scope);
            return true;
        }
        if (!confirmFn) {
            if (window.confirm(msg)) return Promise.resolve(onAlwaysCloseConfirmed());
            return Promise.resolve(false);
        }
        return confirmFn(msg, {
            title: '关闭质量检测结果？',
            variant: 'warning',
            confirmText: '确认关闭',
            cancelText: '留在窗口'
        }).then(function (ok) {
            if (!ok) return false;
            return onAlwaysCloseConfirmed();
        });
    }

    function handleValidateDrawerFillCloseRequest(scope) {
        scope = normalizeValidateScope(scope);
        var cov = global.TcCoverageMatrix;
        if (!cov || typeof cov.isValidateDrawerFillCloseCancelPromptNeeded !== 'function' ||
            !cov.isValidateDrawerFillCloseCancelPromptNeeded(scope)) {
            return null;
        }
        var msg = '用例补充正在进行中，确认要取消补充吗？';
        var confirmFn = typeof global.tcAppConfirm === 'function' ? global.tcAppConfirm : null;
        function onFillConfirmed() {
            if (typeof cov.cancelCoverageFillFromDrawerClose === 'function') {
                cov.cancelCoverageFillFromDrawerClose(scope);
            }
            return false;
        }
        if (!confirmFn) {
            if (window.confirm(msg)) return Promise.resolve(onFillConfirmed());
            return Promise.resolve(false);
        }
        return confirmFn(msg, {
            title: '取消用例补充？',
            variant: 'warning',
            confirmText: '确认取消',
            cancelText: '继续补充'
        }).then(function (ok) {
            if (!ok) return false;
            return onFillConfirmed();
        });
    }


    /** × 关闭质量检查侧边抽屉：收起抽屉且不展示悬浮 reopen 钮（与收回按钮隔离） */
    function closeValidateSingleSideDrawerByDismissButton(scope) {
        scope = normalizeValidateScope(scope);
        if (scope === VALIDATE_SCOPE_SINGLE) {
            notifyValidateDrawerFillProgressOnClose(scope);
        }
        var drawer = getValidatePanel(scope);
        if (isValidateSingleSideDrawer(scope) && drawer && isValidateSingleSideDrawerEl(drawer)) {
            if (drawer.classList.contains('tc-validate-drawer--open') || isValidateDrawerOpen(scope)) {
                closeValidateSingleSideDrawer({ suppressFloatReopen: true });
            } else {
                if (validateSingleCloseTimer) {
                    global.clearTimeout(validateSingleCloseTimer);
                    validateSingleCloseTimer = null;
                }
                drawer.classList.add('hidden');
                drawer.setAttribute('aria-hidden', 'true');
                vScopeData(VALIDATE_SCOPE_SINGLE).validateDrawerDismissedByClose = true;
                vScopeData(VALIDATE_SCOPE_SINGLE).validateDrawerUserMinimized = false;
                restoreCurrentBatchValidationView(scope);
                updateValidateReopenBtn(scope);
            }
            syncValidateReopenButtonsLayout();
            if (scope === VALIDATE_SCOPE_SINGLE) {
                syncStandaloneQualityCheckButtonChromeIfNeeded();
            }
            return Promise.resolve(true);
        }
        closeValidateDrawer(scope);
        return Promise.resolve(true);
    }

    function finishValidateDrawerCloseByUserDismiss(scope) {
        scope = normalizeValidateScope(scope);
        if (isValidateSingleSideDrawer(scope)) {
            return closeValidateSingleSideDrawerByDismissButton(scope);
        }
        closeValidateDrawer(scope);
        return Promise.resolve(true);
    }

    function handleValidateDrawerCloseRequest(scope) {
        scope = normalizeValidateScope(scope);
        var fillResult = handleValidateDrawerFillCloseRequest(scope);
        if (fillResult !== null) return fillResult;
        if (isValidateDrawerCloseCancelPromptNeeded(scope)) {
        var msg = '质量检测正在进行中，确认要取消检测吗？';
        var confirmFn = typeof global.tcAppConfirm === 'function' ? global.tcAppConfirm : null;
        function onConfirmed() {
            cancelRunningQualityCheckFromDrawer(scope);
            finishValidateDrawerCloseByUserDismiss(scope);
            return true;
        }
        if (!confirmFn) {
            if (window.confirm(msg)) return Promise.resolve(onConfirmed());
            return Promise.resolve(false);
        }
        return confirmFn(msg, {
            title: '取消质量检测？',
            variant: 'warning',
            confirmText: '确认取消',
            cancelText: '继续检测'
        }).then(function (ok) {
            if (!ok) return false;
            return onConfirmed();
        });
        }
        var alwaysClose = handleValidateDrawerAlwaysCloseConfirmRequest(scope);
        if (alwaysClose !== null) return alwaysClose;
        return finishValidateDrawerCloseByUserDismiss(scope);
    }

    function abortPendingValidation(scope) {
        var scopes = scope ? [normalizeValidateScope(scope)] : [VALIDATE_SCOPE_SINGLE];
        scopes.forEach(function (scopeKey) {
            var vData = vScopeData(scopeKey);
            vData.validateRunId = (vData.validateRunId || 0) + 1;
            if (vData.validateProgress && vData.validateProgress.active) {
                endValidationProgress(scopeKey);
            }
            hideQualityStageBar(scopeKey);
        });
    }


    function resetValidateTaskState(scope, opts) {
        opts = opts || {};
        scope = normalizeValidateScope(scope);
        abortPendingValidation(scope);
        var vData = vScopeData(scope);
        if (!opts.skipPersist && vData.lastValidation && scope === VALIDATE_SCOPE_SINGLE) {
            persistBatchValidationToCache(scope);
        }
        vData.lastValidation = null;
        vData.validateProgress = null;
        vData.validationBatchSnapshot = null;
        syncValidateDrawerTabsChromeDuringQcRun(scope);
        vData.locateValidateRowIndex = null;
        if (scope === VALIDATE_SCOPE_SINGLE) state._validateRequiredProfile = null;
        if (opts.clearCoverage !== false && typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.resetScopeState === 'function') {
            global.TcCoverageMatrix.resetScopeState(scope);
        }
        updateValidateReopenBtn(scope);
    }


    function syncValidationMatrixAfterCheck(scope) {
        if (typeof global.TcCoverageMatrix === 'undefined') return;
        window.setTimeout(function () {
            if (typeof global.TcCoverageMatrix.markValidationCoverageReady === 'function') {
                global.TcCoverageMatrix.markValidationCoverageReady(scope);
            }
            if (typeof global.TcCoverageMatrix.refreshCoveragePanel === 'function') {
                global.TcCoverageMatrix.refreshCoveragePanel(scope);
            }
        }, 0);
    }



    function getActiveStandaloneQcPageId() {
        if (global.TcRequirementCaseStore &&
            typeof global.TcRequirementCaseStore.getActiveLanhuPageId === 'function') {
            return String(global.TcRequirementCaseStore.getActiveLanhuPageId() || '').trim();
        }
        return '';
    }

    function isStandaloneQualityCheckForCurrentPage(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        var bound = String(vData.standaloneQualityCheckPageId || '').trim();
        if (!bound) return true;
        var current = getActiveStandaloneQcPageId();
        return !current || bound === current;
    }

    function syncStandaloneQualityCheckButtonChromeIfNeeded() {
        var vData = vScopeData(VALIDATE_SCOPE_SINGLE);
        if (!vData.standaloneQualityCheckSession) return;
        if (typeof global.syncTcQualityCheckButtonChrome === 'function') {
            global.syncTcQualityCheckButtonChrome();
        }
    }


    function isStandaloneQualityCheckActive(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        return !!vScopeData(scope).standaloneQualityCheckSession;
    }

    function standaloneQualityCheckHasDisplayableState(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        if (vData.validateProgress && vData.validateProgress.active) return true;
        if (vData.validateProgress && vData.validateProgress._finishing) return true;
        if (vData.lastValidation && vData.lastValidation.llm_pending) return true;
        if (vData.lastValidation && validationHasActionableResults(vData.lastValidation)) return true;
        return false;
    }

    function clearStaleStandaloneQualityCheckSessionIfNeeded(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        if (!vData.standaloneQualityCheckSession) return false;
        if (!isStandaloneQualityCheckForCurrentPage(scope) ||
            !standaloneQualityCheckHasDisplayableState(scope)) {
            vData.standaloneQualityCheckSession = false;
            vData.standaloneQualityCheckPageId = '';
            if (vData.showStageBar) hideQualityStageBar(scope);
            if (typeof global.syncTcQualityCheckButtonChrome === 'function') {
                global.syncTcQualityCheckButtonChrome();
            }
            return true;
        }
        return false;
    }

    function hasStandaloneQualityCheckDrawerSession(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        if (!vData.standaloneQualityCheckSession) return false;
        if (!isStandaloneQualityCheckForCurrentPage(scope)) return false;
        return standaloneQualityCheckHasDisplayableState(scope);
    }

    function openStandaloneQualityCheckDrawer(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        if (typeof revealQcDetailDrawerFromLiveState === 'function') {
            revealQcDetailDrawerFromLiveState(scope);
        } else {
            openValidateDrawerInner({
                center: true,
                scope: scope,
                forceFetch: false,
                _skipTurnLoad: true,
                _skipCacheRestore: true
            });
        }
        if (reconcileValidateDrawerFillProgressOnOpen(scope) !== 'fill' &&
            typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.switchValidateTab === 'function') {
            global.TcCoverageMatrix.switchValidateTab('issues', scope);
        }
        syncStandaloneQualityCheckButtonChromeIfNeeded();
        return true;
    }



    function isStandaloneCoverageFillJobRunning() {
        if (global.TcCoverageMatrix &&
            typeof global.TcCoverageMatrix.isValidateDrawerFillInProgress === 'function' &&
            global.TcCoverageMatrix.isValidateDrawerFillInProgress(VALIDATE_SCOPE_SINGLE)) {
            return true;
        }
        var orch = global.TcAgentOrchestrator;
        if (!orch || typeof orch.isAgentJobRunning !== 'function' || !orch.isAgentJobRunning()) return false;
        return typeof orch.getLastJobMode === 'function' && orch.getLastJobMode() === 'fill_gaps_only';
    }

    function resolveStandaloneQualityCheckBusyKind() {
        if (isStandaloneCoverageFillJobRunning()) return 'fill';
        if (isSingleGenValidationInProgress()) return 'validation';
        if (isCaseGenerationInteractionBusy()) return 'generation';
        return null;
    }

    function getStandaloneQualityCheckBusyMessage(kind) {
        kind = kind || resolveStandaloneQualityCheckBusyKind();
        if (kind === 'fill') {
            return '正在补充用例中，请补充完毕后再进行质量检测';
        }
        if (kind === 'validation') {
            return '已有质量检测进行中，请完毕后再试';
        }
        if (kind === 'generation') {
            return '用例生成进行中，请完成后再进行质量检测';
        }
        return '';
    }

    function showStandaloneQualityCheckBusyTip() {
        var busyMsg = getStandaloneQualityCheckBusyMessage();
        if (!busyMsg) busyMsg = '已有质量检测进行中，请完毕后再试';
        var alertTitle = resolveStandaloneQualityCheckBusyKind() === 'fill' ? '补充用例' : '质量检测';
        if (typeof global.tcAppAlert === 'function') {
            global.tcAppAlert(busyMsg, { title: alertTitle, variant: 'warning' });
        } else if (typeof alertBox === 'function') {
            alertBox(busyMsg, { title: alertTitle });
        } else {
            window.alert(busyMsg);
        }
    }

    function isStandaloneQualityCheckButtonBusy() {
        return !!resolveStandaloneQualityCheckBusyKind();
    }

    function handleStandaloneQualityCheckButtonClick() {
        var scope = VALIDATE_SCOPE_SINGLE;
        clearStaleStandaloneQualityCheckSessionIfNeeded(scope);
        if (isStandaloneQualityCheckButtonBusy()) {
            showStandaloneQualityCheckBusyTip();
            return Promise.resolve(false);
        }
        var msg = '将对当前需求页表格内的全部用例进行质量检测。\n\n是否开始检测？';
        var confirmFn = typeof global.tcAppConfirm === 'function' ? global.tcAppConfirm : null;
        function onConfirmed() {
            return runStandaloneQualityCheck(undefined, { forceRestart: false });
        }
        if (!confirmFn) {
            if (window.confirm(msg)) return onConfirmed();
            return Promise.resolve(false);
        }
        return confirmFn(msg, {
            title: '确认质量检测？',
            variant: 'info',
            confirmText: '开始检测',
            cancelText: '取消'
        }).then(function (ok) {
            if (!ok) return false;
            return onConfirmed();
        });
    }

    function tryToggleStandaloneQualityCheckDrawer(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        clearStaleStandaloneQualityCheckSessionIfNeeded(scope);
        if (!hasStandaloneQualityCheckDrawerSession(scope)) return null;
        var drawerShown = isValidateDrawerOpen(scope) ||
            (isStandaloneQualityCheckActive(scope) && isValidateDrawerVisible(scope));
        if (drawerShown) {
            closeValidateDrawer(scope);
            syncStandaloneQualityCheckButtonChromeIfNeeded();
            return 'closed';
        }
        if (!standaloneQualityCheckHasDisplayableState(scope)) return null;
        openStandaloneQualityCheckDrawer(scope);
        return 'opened';
    }


    function abortStandaloneValidationFetch(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        if (vData._standaloneValidateAbortController) {
            try { vData._standaloneValidateAbortController.abort(); } catch (eAbort) { /* ignore */ }
            vData._standaloneValidateAbortController = null;
        }
    }

    function preflightStandaloneQualityCheckRun(scope) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        if (typeof clearStandaloneQcPageSessionForRerun === 'function') {
            clearStandaloneQcPageSessionForRerun(scope);
        }
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.resetFillUiBeforeStandaloneQc === 'function') {
            global.TcCoverageMatrix.resetFillUiBeforeStandaloneQc(scope);
        }
        if (global.TcTableView && typeof global.TcTableView.pullRows === 'function') {
            try { global.TcTableView.pullRows(); } catch (ePull) { /* ignore */ }
        }
        abortStandaloneValidationFetch(scope);
        var vData = vScopeData(scope);
        vData.lastValidation = null;
        vData.validationBatchSnapshot = null;
        vData.validateLlmReasoning = '';
        vData.locateValidateRowIndex = null;
        if (vData.validateProgress) {
            vData.validateProgress._finishing = false;
            if (vData.validateProgress.active) endValidationProgress(scope);
            vData.validateProgress = null;
        }
    }

    function beginStandaloneValidationRunToken(scope, forceRestart) {
        scope = normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE);
        var vData = vScopeData(scope);
        abortStandaloneValidationFetch(scope);
        if (vData.validateProgress && vData.validateProgress.active) {
            if (!forceRestart) return 0;
            abortPendingValidation(scope);
            return vData.validateRunId;
        }
        if (vData.validateProgress && vData.validateProgress._finishing) {
            vData.validateProgress._finishing = false;
            endValidationProgress(scope);
        }
        vData.validateProgress = null;
        vData.validateRunId = (vData.validateRunId || 0) + 1;
        return vData.validateRunId;
    }

    function isStandaloneValidationRunCurrent(scope, runToken) {
        return runToken === vScopeData(normalizeValidateScope(scope)).validateRunId;
    }

    function abandonStaleStandaloneValidationStep(scope, runToken, stepId, detail) {
        if (isStandaloneValidationRunCurrent(scope, runToken)) return;
        var prog = vScopeData(scope).validateProgress;
        if (!prog || !prog.active || !prog.steps[stepId]) return;
        if (prog.steps[stepId].status !== 'running') return;
        setValidationProgressStep(stepId, 'error', detail || '检查已中断', scope);
    }

    function requestStandaloneValidationPhase(payload, useLlm, formatCheck) {
        var scope = VALIDATE_SCOPE_SINGLE;
        abortStandaloneValidationFetch(scope);
        var vData = vScopeData(scope);
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        vData._standaloneValidateAbortController = controller;
        var attempts = 0;
        function attempt() {
            attempts += 1;
            var body = buildValidationRequestBody(payload, !!useLlm, formatCheck !== false);
            var ms = useLlm ? TC_VALIDATE_LLM_TIMEOUT_MS : TC_VALIDATE_FORMAT_TIMEOUT_MS;
            var opts = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                credentials: 'same-origin'
            };
            if (controller) opts.signal = controller.signal;
            var timer = controller ? window.setTimeout(function () {
                try { controller.abort(); } catch (eTimer) { /* ignore */ }
            }, ms) : null;
            return fetch('/api/test-cases/validate', opts).then(function (res) {
                return res.json().catch(function () { return { error: 'HTTP ' + res.status }; }).then(function (d) {
                    if (!res.ok && d && d.error) throw new Error(d.error);
                    if (!res.ok) throw new Error('请求失败 HTTP ' + res.status);
                    return d;
                });
            }).finally(function () {
                if (timer) window.clearTimeout(timer);
            }).catch(function (err) {
                var msg = err && err.message ? String(err.message) : String(err || '');
                var retriable = err && err.name === 'AbortError';
                if (!retriable) retriable = /deadlock|timeout|HTTP 5|try again|锁/i.test(msg);
                if (retriable && attempts < 3 && vData._standaloneValidateAbortController === controller) {
                    return delayMs(400 * attempts).then(attempt);
                }
                throw err;
            });
        }
        return attempt().finally(function () {
            if (vData._standaloneValidateAbortController === controller) {
                vData._standaloneValidateAbortController = null;
            }
        });
    }

    function runStandaloneQualityCheck(userAiGatePassed, runOpts) {
        var scope = VALIDATE_SCOPE_SINGLE;
        runOpts = runOpts || {};
        preflightStandaloneQualityCheckRun(scope);
        state._validateRequiredProfile = 'default';
        var batchPayload = collectStandaloneTablePayloadForValidation();
        if (!batchPayload.rows.length) {
            alertBox('当前表格暂无可检测的用例，请先填写用例内容。', { title: '无法检测' });
            return Promise.resolve();
        }
        var payload = {
            columns: batchPayload.columns,
            rows: batchPayload.rows,
            standalonePage: true,
            rowIndexMap: batchPayload.rowIndexMap || []
        };
        var wantLlm = isValidateUseLlmEnabled();
        if (!userAiGatePassed && wantLlm && typeof getAiMode === 'function' && getAiMode() === 'preset' &&
            global.HfUserAiConfig && typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {
                if (!ok) return Promise.resolve();
                return runStandaloneQualityCheck(true, runOpts);
            });
        }
        var vData = vScopeData(scope);
        var runToken = beginStandaloneValidationRunToken(scope, !!runOpts.forceRestart);
        if (!runToken) return Promise.resolve();
        vData.standaloneQualityCheckSession = true;
        vData.standaloneQualityCheckPageId = getActiveStandaloneQcPageId();
        vData.lastValidation = null;
        vData.deferValidateDrawerForGenChat = false;
        vData.locateValidateRowIndex = null;
        vData.showStageBar = true;
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.prepareForValidationRun === 'function') {
            global.TcCoverageMatrix.prepareForValidationRun(scope);
        }
        beginValidationProgress(scope);
        resetValidateLlmReasoning(scope);
        openValidateDrawer({
            center: true,
            scope: scope,
            forceFetch: false,
            _skipTurnLoad: true,
            _standaloneQcRun: true
        });
        syncStandaloneQualityCheckButtonChromeIfNeeded();
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.switchValidateTab === 'function') {
            global.TcCoverageMatrix.switchValidateTab('issues', scope);
        }
        var acc = { formatResult: null };
        function validationErrMsg(err) {
            return err && err.name === 'AbortError' ? '检查超时' : (err.message || '检查失败');
        }
        function fetchFormatResult() {
            return requestStandaloneValidationPhase(payload, false, true).then(function (formatResult) {
                if (!isStandaloneValidationRunCurrent(scope, runToken)) {
                    abandonStaleStandaloneValidationStep(scope, runToken, 'structure', '检查已取消');
                    return null;
                }
                return remapValidationResultRows(formatResult, batchPayload);
            });
        }
        function renderFinal(formatResult, llmResult, extra) {
            var fr = formatResult || acc.formatResult || { issues: [] };
            var merged = mergeValidationResults(fr, llmResult || null, extra || {}, batchPayload);
            merged.validate_run_id = runToken;
            merged.validated_at = Date.now();
            if (runToken !== vData.validateRunId) return merged;
            if (vData.validateProgress) vData.validateProgress._finishing = true;
            if (extra && (extra.llm_skip_reason === LLM_SKIP_REASON.ERROR ||
                extra.llm_skip_reason === LLM_SKIP_REASON.TIMEOUT)) {
                restoreQcTableAreaAfterAbort();
            }
            renderValidationProgressUI(scope);
            return delayMs(220).then(function () {
                if (runToken !== vData.validateRunId) return merged;
                if (vData.validateProgress && vData.validateProgress.active) {
                    endValidationProgress(scope);
                }
                renderValidationIssues(merged, scope, { replacePreviousStandalone: true });
                syncValidationMatrixAfterCheck(scope);
                return merged;
            });
        }
        function runStructureStep() {
            setValidationProgressStep('structure', 'running', getValidateStepMeta('structure').running, scope);
            return fetchFormatResult().then(function (formatResult) {
                if (!isStandaloneValidationRunCurrent(scope, runToken)) {
                    abandonStaleStandaloneValidationStep(scope, runToken, 'structure', '检查已取消');
                    return null;
                }
                if (!formatResult) return null;
                acc.formatResult = formatResult;
                var split = splitFormatIssuesByType(formatResult);
                var structCount = split.structure.length;
                setValidationProgressStep('structure', 'done',
                    structCount ? ('发现 ' + structCount + ' 项格式问题') : '检查通过', scope);
                return formatResult;
            }).catch(function (err) {
                if (!isStandaloneValidationRunCurrent(scope, runToken)) {
                    abandonStaleStandaloneValidationStep(scope, runToken, 'structure', '检查已取消');
                    return null;
                }
                setValidationProgressStep('structure', 'error', validationErrMsg(err), scope);
                return null;
            });
        }
        function runRequiredStep(formatResult) {
            setValidationProgressStep('required', 'running', getValidateStepMeta('required').running, scope);
            return delayMs(300).then(function () {
                if (runToken !== vData.validateRunId) return null;
                var source = formatResult || acc.formatResult;
                if (!source) {
                    return fetchFormatResult().then(function (fr) {
                        acc.formatResult = fr;
                        var reqCount = splitFormatIssuesByType(fr).required.length;
                        setValidationProgressStep('required', 'done',
                            reqCount ? ('发现 ' + reqCount + ' 项必填问题') : '检查通过', scope);
                        return fr;
                    }).catch(function (err) {
                        setValidationProgressStep('required', 'error', validationErrMsg(err), scope);
                        return acc.formatResult;
                    });
                }
                var reqCount = splitFormatIssuesByType(source).required.length;
                setValidationProgressStep('required', 'done',
                    reqCount ? ('发现 ' + reqCount + ' 项必填问题') : '检查通过', scope);
                return source;
            });
        }
        function runLlmStep(formatResult) {
            var fr = formatResult || acc.formatResult || { issues: [] };
            if (!wantLlm) {
                setValidationProgressStep('llm', 'skipped', '未启用 AI 对照', scope, { skipReason: LLM_SKIP_REASON.DISABLED });
                return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.DISABLED });
            }
            if (!batchPayload.rows.length) {
                setValidationProgressStep('llm', 'skipped', '表格无有效用例', scope, { skipReason: LLM_SKIP_REASON.NO_CONTENT });
                return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.NO_CONTENT });
            }
            setValidationProgressStep('llm', 'running', getValidateStepMeta('llm').running, scope);
            resetValidateLlmReasoning(scope);
            qcReasoningStreamReset(scope);
            return fetchRequirementTextFromDbForCurrentPage().then(function (req) {
                req = String(req || '').trim();
                if (!req) {
                    setValidationProgressStep('llm', 'skipped', '未找到当前需求页的需求缓存，请先加载需求页', scope, {
                        skipReason: LLM_SKIP_REASON.NO_CONTENT
                    });
                    toast('未找到当前需求页的需求缓存，已跳过 AI 对照（格式结果已保留）', { variant: 'info', duration: 4200 });
                    return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.NO_CONTENT });
                }
                state.lastLanhuRequirements = req;
                state.lastRequirements = req;
                return requestValidationLlmStream(payload, req, 'full_table', function (chunk) {
                    qcReasoningStreamAppend(scope, chunk);
                }).then(function (llmResult) {
                    qcReasoningStreamApplyDoneReasoning(
                        scope,
                        llmResult && llmResult.reasoning_text ? llmResult.reasoning_text : ''
                    );
                    var mergedPreview = mergeValidationResults(fr, llmResult, {}, batchPayload);
                    var llmDetail = formatLlmValidationStepDetail(
                        mergedPreview.over_generated_count,
                        mergedPreview.gap_count
                    );
                    var llmTotal = (mergedPreview.over_generated_count || 0) + (mergedPreview.gap_count || 0);
                    finishQcLlmStepUi(scope, 'done', llmTotal ? llmDetail : '检查通过');
                    return renderFinal(fr, llmResult, {});
                }).catch(function (err) {
                    var timedOut = isQcLlmAbortTimeout(err);
                    var msg = timedOut ? 'AI 对照超时' : (err.message || 'AI 对照失败');
                    if (timedOut) {
                        finishQcLlmStepUiTimedOut(scope, msg);
                    } else {
                        finishQcLlmStepUiErrored(scope, msg);
                    }
                    if (!(err && err._quotaToastShown)) {
                        toast(msg + '（格式结果已保留）', { variant: 'warning', duration: 4200 });
                    }
                    return renderFinal(fr, null, {
                        llm_skipped: true,
                        llm_skip_reason: timedOut ? LLM_SKIP_REASON.TIMEOUT : LLM_SKIP_REASON.ERROR
                    });
                });
            });
        }
        syncWorkbenchBusyChrome();
        return runStructureStep()
            .then(runRequiredStep)
            .then(runLlmStep)
            .catch(function (err) {
                toast(validationErrMsg(err), { variant: 'warning', duration: 3600 });
                return renderFinal(acc.formatResult || { issues: [] }, null, {
                    llm_skipped: true,
                    llm_skip_reason: LLM_SKIP_REASON.ERROR
                });
            })
            .finally(function () {
                syncWorkbenchBusyChrome();
            });
    }


    function runValidation(useLlmOverride, userAiGatePassed) {
        var scope = VALIDATE_SCOPE_SINGLE;
        vScopeData(scope).standaloneQualityCheckSession = false;
        if (isGenChatPipelineFailed()) return Promise.resolve();
        if (isSingleGenAutoValidateBlocked()) {
            return Promise.resolve();
        }
        syncBatchStateFromCore();
        snapshotBatchForValidateScope(scope);
        captureValidationBatchSnapshot(scope);
        var batchPayload = collectBatchRowsPayloadForValidation(scope);
        var llmParsePayload = collectParseBatchPayloadForLlmValidation(scope);
        state._validateRequiredProfile = batchPayload.mindmapBatch ? 'mindmap' : 'default';
        if (!batchPayload.hasBatch && !batchPayload.rows.length) {
            alertBox('暂无当次生成批次，无法检查。请先生成用例。', { title: '无法检查' });
            return Promise.resolve();
        }
        if (!batchPayload.rows.length) {
            alertBox('本次生成未从「用例解析」得到可检查的用例，无法检查。', { title: '无法检查' });
            return Promise.resolve();
        }
        if (!batchPayload.parseResultBatch) {
            alertBox('质量检查仅支持「用例解析」步骤产出的本批用例。', { title: '无法检查' });
            return Promise.resolve();
        }
        var payload = {
            columns: batchPayload.columns,
            rows: batchPayload.rows,
            parseResultBatch: true,
            parseRowCount: batchPayload.rows.length,
            rowIndexMap: batchPayload.rowIndexMap || []
        };
        if (batchPayload.mindmapBatch) {
            var snapMm = vScopeData(VALIDATE_SCOPE_SINGLE).batchSnapshot;
            payload.aiOutputText = String((snapMm && snapMm.batchAiOutputText) || '').trim();
            if (!payload.aiOutputText && typeof resolveGenerationStreamTextForValidation === 'function') {
                payload.aiOutputText = resolveGenerationStreamTextForValidation();
            }
            if (typeof collectMindmapNodesForValidation === 'function') {
                payload.mindmapNodes = collectMindmapNodesForValidation();
            }
        }
        var wantLlm;
        if (useLlmOverride === true) wantLlm = true;
        else if (useLlmOverride === false) wantLlm = false;
        else wantLlm = isValidateUseLlmEnabled();

        if (!userAiGatePassed && wantLlm && typeof getAiMode === 'function' && getAiMode() === 'preset' && global.HfUserAiConfig && typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {
                if (!ok) return Promise.resolve();
                return runValidation(useLlmOverride, true);
            });
        }

        var vData = vScopeData(scope);
        vData.validateRunId = (vData.validateRunId || 0) + 1;
        var runToken = vData.validateRunId;
        var runSnap = cloneBatchSnapshot(vData.validationBatchSnapshot || vData.batchSnapshot);
        var activePersistTurnId = '';
        if (global.TcWorkbenchSession && typeof global.TcWorkbenchSession.getCurrentTurnId === 'function') {
            activePersistTurnId = String(global.TcWorkbenchSession.getCurrentTurnId() || '').trim();
        }
        if (activePersistTurnId) {
            runSnap._persistTurnId = activePersistTurnId;
            runSnap.batchValidationKey = 'turn-' + activePersistTurnId;
        }
        ensureUniqueBatchIdForValidationRun(runSnap, runToken);
        bindPersistTurnIdToSnapshot(runSnap);
        vData._validationRunSnapshot = runSnap;
        if (!vData._validationRunSnapshots) vData._validationRunSnapshots = {};
        vData._validationRunSnapshots[runToken] = runSnap;
        vData.lastValidation = null;
        var pendingBatchKey = buildBatchValidationKey(vData.batchSnapshot);
        if (pendingBatchKey && batchValidationCache[pendingBatchKey]) {
            delete batchValidationCache[pendingBatchKey];
        }
        vData.deferValidateDrawerForGenChat =
            shouldSyncValidateToGenChat(scope) ||
            shouldDeferValidateDrawerForGenChatQC(scope, wantLlm);

        if (!vData.deferValidateDrawerForGenChat) {
            openValidateDrawer({ center: true, scope: scope });
            if (typeof global.TcCoverageMatrix !== 'undefined' &&
                typeof global.TcCoverageMatrix.switchValidateTab === 'function') {
                global.TcCoverageMatrix.switchValidateTab('issues', scope);
            }
        }
        vData.locateValidateRowIndex = null;
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.prepareForValidationRun === 'function') {
            global.TcCoverageMatrix.prepareForValidationRun(scope);
        }
        beginValidationProgress(scope);
        resetValidateLlmReasoning(scope);
        if (shouldSyncValidateToGenChat(scope) &&
            global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.resetValidateReasoning === 'function') {
            global.TcGenChatPipeline.resetValidateReasoning();
        }

        var acc = { formatResult: null };

        function validationErrMsg(err) {
            return err && err.name === 'AbortError' ? '检查超时' : (err.message || '检查失败');
        }

        function fetchFormatResult() {
            return requestValidationPhase(payload, false, true).then(function (formatResult) {
                return remapValidationResultRows(formatResult, batchPayload);
            });
        }

        function renderFinal(formatResult, llmResult, extra) {
            var fr = formatResult || acc.formatResult || { issues: [] };
            var merged = mergeValidationResults(fr, llmResult || null, extra || {}, llmParsePayload || batchPayload);
            merged.validate_run_id = runToken;
            merged.validated_at = Date.now();
            merged.parse_row_count = (llmParsePayload.rows || batchPayload.rows || []).length || null;
            if (runToken !== vData.validateRunId) {
                var staleSnap = (vData._validationRunSnapshots && vData._validationRunSnapshots[runToken]) || runSnap;
                var staleReasoning = String((llmResult && llmResult.reasoning_text) || vData.validateLlmReasoning || '');
                return persistStaleValidationRun(scope, merged, runToken, staleSnap, staleReasoning);
            }
            if (vData.validateProgress) vData.validateProgress._finishing = true;
            if (extra && (extra.llm_skip_reason === LLM_SKIP_REASON.ERROR ||
                extra.llm_skip_reason === LLM_SKIP_REASON.TIMEOUT)) {
                restoreQcTableAreaAfterAbort();
            }
            renderValidationProgressUI(scope);
            return delayMs(220).then(function () {
                if (runToken !== vData.validateRunId) {
                    var lateSnap = (vData._validationRunSnapshots && vData._validationRunSnapshots[runToken]) || runSnap;
                    var lateReasoning = String((llmResult && llmResult.reasoning_text) || vData.validateLlmReasoning || '');
                    return persistStaleValidationRun(scope, merged, runToken, lateSnap, lateReasoning);
                }
                if (vData.validateProgress && vData.validateProgress.active) {
                    endValidationProgress(scope);
                }
                renderValidationIssues(merged, scope);
                syncValidationMatrixAfterCheck(scope);
                if (vData._validationRunSnapshots) delete vData._validationRunSnapshots[runToken];
                return merged;
            });
        }

        function runStructureStep() {
            setValidationProgressStep('structure', 'running', getValidateStepMeta('structure').running, scope);
            return fetchFormatResult().then(function (formatResult) {
                if (runToken !== vData.validateRunId) return null;
                acc.formatResult = formatResult;
                var split = splitFormatIssuesByType(formatResult);
                var structCount = isMindmapValidationProfile()
                    ? (split.structure.length + split.required.length)
                    : split.structure.length;
                setValidationProgressStep('structure', 'done',
                    structCount ? ('发现 ' + structCount + ' 项格式问题') : '检查通过', scope);
                return formatResult;
            }).catch(function (err) {
                if (runToken !== vData.validateRunId) return null;
                setValidationProgressStep('structure', 'error', validationErrMsg(err), scope);
                return null;
            });
        }

        function runRequiredStep(formatResult) {
            if (isMindmapValidationProfile()) {
                return Promise.resolve(formatResult || acc.formatResult);
            }
            setValidationProgressStep('required', 'running', getValidateStepMeta('required').running, scope);
            return delayMs(300).then(function () {
                if (runToken !== vData.validateRunId) return null;
                var source = formatResult || acc.formatResult;
                if (!source) {
                    return fetchFormatResult().then(function (fr) {
                        if (runToken !== vData.validateRunId) return null;
                        acc.formatResult = fr;
                        var reqCount = splitFormatIssuesByType(fr).required.length;
                        setValidationProgressStep('required', 'done',
                            reqCount ? ('发现 ' + reqCount + ' 项必填问题') : '检查通过', scope);
                        return fr;
                    }).catch(function (err) {
                        if (runToken !== vData.validateRunId) return null;
                        setValidationProgressStep('required', 'error', validationErrMsg(err), scope);
                        return acc.formatResult;
                    });
                }
                var reqCount = splitFormatIssuesByType(source).required.length;
                setValidationProgressStep('required', 'done',
                    reqCount ? ('发现 ' + reqCount + ' 项必填问题') : '检查通过', scope);
                return source;
            });
        }

        function runLlmStep(formatResult) {
            var fr = formatResult || acc.formatResult || { issues: [] };
            if (!wantLlm) {
                setValidationProgressStep('llm', 'skipped', '未启用 AI 对照', scope, {
                    skipReason: LLM_SKIP_REASON.DISABLED
                });
                return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.DISABLED });
            }
            if (!isMindmapValidationProfile() && !shouldUseLanhuRequirementsForValidation()) {
                setValidationProgressStep('llm', 'skipped', LLM_SKIP_DETAIL_NO_LANHU, scope, {
                    skipReason: LLM_SKIP_REASON.NO_LANHU
                });
                return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.NO_LANHU });
            }
            if (!llmParsePayload || !llmParsePayload.rows.length) {
                setValidationProgressStep('llm', 'skipped', '用例解析未产出可对照用例，已跳过 AI 对照', scope, {
                    skipReason: LLM_SKIP_REASON.NO_CONTENT
                });
                toast('用例解析未产出可对照用例，已跳过 AI 对照（格式结果已保留）', { variant: 'info', duration: 3600 });
                return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.NO_CONTENT });
            }
            var llmPayload = {
                columns: llmParsePayload.columns,
                rows: llmParsePayload.rows,
                parseResultBatch: true,
                parseRowCount: llmParsePayload.rows.length,
                rowIndexMap: llmParsePayload.rowIndexMap || []
            };
            setValidationProgressStep('llm', 'running', getValidateStepMeta('llm').running, scope);
            resetValidateLlmReasoning(scope);
            qcReasoningStreamReset(scope);
            if (shouldSyncValidateToGenChat(scope) &&
                global.TcGenChatPipeline &&
                typeof global.TcGenChatPipeline.resetValidateReasoning === 'function') {
                global.TcGenChatPipeline.resetValidateReasoning();
            }
            var reqPromise = isMindmapValidationProfile()
                ? ensureRequirementsForMindmapLlmValidation()
                : ensureRequirementsForSingleLlmValidation();
            return reqPromise.then(function (req) {
                if (runToken !== vData.validateRunId) {
                    return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.NO_CONTENT });
                }
                var userContent = resolveValidationUserContent();
                var ragContext = typeof resolveValidationRagContext === 'function'
                    ? resolveValidationRagContext() : '';
                if (isMindmapValidationProfile()) {
                    if (!req && !userContent && !ragContext) {
                        setValidationProgressStep('llm', 'skipped', '缺少用户内容、蓝湖需求与知识库上下文', scope, {
                            skipReason: LLM_SKIP_REASON.NO_CONTENT
                        });
                        toast('缺少用户内容、蓝湖需求与知识库上下文，已跳过 AI 对照（格式结果已保留）', { variant: 'info', duration: 3600 });
                        return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.NO_CONTENT });
                    }
                    llmPayload.ragContext = ragContext;
                } else if (!req && !userContent) {
                    setValidationProgressStep('llm', 'skipped', '缺少用户内容与需求摘要', scope, {
                        skipReason: LLM_SKIP_REASON.NO_CONTENT
                    });
                    toast('缺少用户内容与需求摘要，已跳过 AI 对照（格式结果已保留）', { variant: 'info', duration: 3600 });
                    return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.NO_CONTENT });
                }
                return requestValidationLlmStream(llmPayload, req, 'current_batch', function (chunk) {
                    qcReasoningStreamAppend(scope, chunk);
                }, userContent).then(function (llmResult) {
                    if (runToken !== vData.validateRunId) {
                        llmResult = sanitizeLlmResultForParseBatch(llmResult, llmParsePayload);
                        return renderFinal(fr, llmResult, {});
                    }
                    llmResult = sanitizeLlmResultForParseBatch(llmResult, llmParsePayload);
                    qcReasoningStreamApplyDoneReasoning(
                        scope,
                        llmResult && llmResult.reasoning_text ? llmResult.reasoning_text : ''
                    );
                    var mergedPreview = mergeValidationResults(fr, llmResult, {}, llmParsePayload);
                    var llmDetail = formatLlmValidationStepDetail(
                        mergedPreview.over_generated_count,
                        mergedPreview.gap_count
                    );
                    var llmTotal = (mergedPreview.over_generated_count || 0) + (mergedPreview.gap_count || 0);
                    finishQcLlmStepUi(scope, 'done', llmTotal ? llmDetail : '检查通过');
                    if (llmTotal > 0) {
                        toast('AI 对照完成，' + llmDetail, { variant: 'warning', duration: 3200 });
                    } else {
                        toast('AI 对照完成，问题已全部解决', { variant: 'success', duration: 2600 });
                    }
                    return renderFinal(fr, llmResult, {});
                }).catch(function (err) {
                    if (runToken !== vData.validateRunId) {
                        return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.ERROR });
                    }
                    var timedOut = isQcLlmAbortTimeout(err);
                    var msg = timedOut ? 'AI 对照超时' : (err.message || 'AI 对照失败');
                    if (timedOut) {
                        finishQcLlmStepUiTimedOut(scope, msg);
                    } else {
                        finishQcLlmStepUiErrored(scope, msg);
                    }
                    if (!(err && err._quotaToastShown)) {
                        toast(msg + '（格式结果已保留）', { variant: 'warning', duration: 4200 });
                    }
                    return renderFinal(fr, null, {
                        llm_skipped: true,
                        llm_skip_reason: timedOut ? LLM_SKIP_REASON.TIMEOUT : LLM_SKIP_REASON.ERROR
                    });
                });
            });
        }

        return runStructureStep()
            .then(function (formatResult) {
                if (isMindmapValidationProfile()) return formatResult;
                return runRequiredStep(formatResult);
            })
            .then(runLlmStep)
            .catch(function (err) {
                if (runToken !== vData.validateRunId) return;
                var msg = validationErrMsg(err);
                toast(msg, { variant: 'warning', duration: 3600 });
                return renderFinal(acc.formatResult || { issues: [] }, null, {
                    llm_skipped: true,
                    llm_skip_reason: LLM_SKIP_REASON.ERROR
                });
            });
    }



/* ---- tc_wb_export_report.js ---- */
/* ---------- 导出报告 ---------- */

var lastExportReport = null;

function normalizeExportProfileKey(raw) {
    var key = String(raw != null ? raw : '').trim();
    if (!key) return 'metersphere';
    if (key.charAt(0) === '{') {
        try {
            var obj = JSON.parse(key);
            if (obj && obj.templateId) return String(obj.templateId);
        } catch (e0) { /* ignore */ }
    }
    return key;
}

function getExportProfileDisplayName(profileKey) {
    var key = normalizeExportProfileKey(profileKey);
    var templates = (typeof global.TC_CASE_TEMPLATES !== 'undefined' && global.TC_CASE_TEMPLATES) ? global.TC_CASE_TEMPLATES : [];
    for (var i = 0; i < templates.length; i++) {
        if (String(templates[i].id) === key) return String(templates[i].name || key);
    }
    var fallback = {
        current: '当前表格',
        metersphere: 'MeterSphere',
        zentao: '禅道',
        jira: 'Jira / Xray',
        testrail: 'TestRail',
        excel: 'Excel 通用'
    };
    return fallback[key] || key;
}

function formatExportReportSubtitle(report) {
    if (!report) return '';
    var parts = ['模板：' + getExportProfileDisplayName(report.profile)];
    if (report.exported_at) parts.push('导出时间：' + String(report.exported_at).replace('T', ' '));
    return parts.join(' · ');
}

function columnsMatchTemplateColumns(columns, templateColumns) {
    var cols = columns || [];
    var tc = templateColumns || [];
    if (!tc.length || tc.length !== cols.length) return false;
    for (var i = 0; i < tc.length; i++) {
        if (String(cols[i]) !== String(tc[i])) return false;
    }
    return true;
}

function getActiveExportProfileKey() {
    var cols = getTableColumns();
    var templates = (typeof global.TC_CASE_TEMPLATES !== 'undefined' && global.TC_CASE_TEMPLATES) ? global.TC_CASE_TEMPLATES : [];
    if (cols.length && templates.length) {
        for (var i = 0; i < templates.length; i++) {
            if (columnsMatchTemplateColumns(cols, templates[i].columns || [])) {
                return String(templates[i].id);
            }
        }
    }
    return 'current';
}

function buildExportReportSummaryText(report) {
    if (!report) return '';
    return [
        '导出 ' + (report.exported_rows || 0) + ' 条',
        '跳过 ' + (report.skipped_count != null ? report.skipped_count : (report.skipped || []).length) + ' 条',
        '重复 ' + (report.duplicate_count != null ? report.duplicate_count : (report.duplicates || []).length) + ' 条',
        '模板：' + getExportProfileDisplayName(report.profile),
        '导出时间：' + String(report.exported_at || '').replace('T', ' ')
    ].join('\n');
}


function ensureExportReportModalMounted() {
    if (typeof global.ensureTcWorkbenchOverlaysMounted === 'function') {
        global.ensureTcWorkbenchOverlaysMounted();
    }
    var modal = $('tc-export-report-modal');
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    return modal;
}

function renderExportReportModal(report) {
    var modal = ensureExportReportModalMounted();
    var subtitle = $('tc-export-report-subtitle');
    var summary = $('tc-export-report-summary');
    var tableWrap = $('tc-export-report-table-wrap');
    if (!modal || !summary || !tableWrap) return;
    var skipped = report.skipped || [];
    var duplicates = report.duplicates || [];
    if (subtitle) {
        subtitle.textContent = formatExportReportSubtitle(report);
    }
    summary.innerHTML =
        '<div class="tc-export-report-stats">' +
        '<div class="tc-export-report-stat"><div class="tc-export-report-stat__label">总行数</div><div class="tc-export-report-stat__value">' + esc(report.total_rows || 0) + '</div></div>' +
        '<div class="tc-export-report-stat"><div class="tc-export-report-stat__label">已导出</div><div class="tc-export-report-stat__value">' + esc(report.exported_rows || 0) + '</div></div>' +
        '<div class="tc-export-report-stat"><div class="tc-export-report-stat__label">跳过</div><div class="tc-export-report-stat__value">' + esc(report.skipped_count != null ? report.skipped_count : skipped.length) + '</div></div>' +
        '<div class="tc-export-report-stat"><div class="tc-export-report-stat__label">重复</div><div class="tc-export-report-stat__value">' + esc(report.duplicate_count != null ? report.duplicate_count : duplicates.length) + '</div></div>' +
        '</div>';

    function renderIssueTable(title, items) {
        if (!items.length) {
            return '<div class="tc-export-report-section"><div class="tc-export-report-section__title">' + esc(title) + '</div><div class="tc-export-report-empty">无</div></div>';
        }
        var rows = items.map(function(item) {
            return '<tr><td>' + esc((item.row_index != null ? item.row_index + 1 : '')) + '</td><td>' + esc(item.reason || '') + '</td></tr>';
        }).join('');
        return '<div class="tc-export-report-section"><div class="tc-export-report-section__title">' + esc(title) + '</div><table class="tc-export-report-table"><thead><tr><th>行号</th><th>原因</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    tableWrap.innerHTML = renderIssueTable('跳过明细', skipped) + renderIssueTable('重复明细', duplicates);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
}

function closeExportReportModal() {
    var modal = $('tc-export-report-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (!document.querySelector('#tc-export-report-modal.flex')) {
        document.body.style.overflow = '';
    }
}

function openExportReportModal(report) {
    lastExportReport = report;
    renderExportReportModal(report);
}

function copyExportReportSummary(report) {
    report = report || lastExportReport;
    if (!report) return Promise.resolve(false);
    var text = buildExportReportSummaryText(report);
    if (typeof global.tcAppDialogCopyToClipboard === 'function') {
        return global.tcAppDialogCopyToClipboard(text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('copy unsupported'));
}

function showExportReportToast(report) {
    var wrap = document.getElementById('hf-float-toast');
    if (!wrap) {
        toast('已导出 ' + (report.exported_rows || 0) + ' 条', { variant: 'success', duration: 4200 });
        return;
    }
    if (wrap.parentElement !== document.body) document.body.appendChild(wrap);
    var inner = document.getElementById('hf-float-toast-inner');
    if (!inner) return;
    if (wrap._tcExportToastHideTimer) {
        clearTimeout(wrap._tcExportToastHideTimer);
        wrap._tcExportToastHideTimer = null;
    }
    wrap.classList.remove('hf-float-toast--top', 'hf-float-toast--bottom', 'hf-float-toast--visible', 'hf-float-toast--interactive');
    wrap.classList.add('hf-float-toast--bottom', 'hf-float-toast--interactive');
    wrap.style.pointerEvents = 'auto';
    inner.className = 'hf-float-toast__inner hf-float-toast__inner--success';
    inner.innerHTML = '已导出 ' + esc(report.exported_rows || 0) + ' 条' +
        '<button type="button" class="tc-export-report-toast-link">查看导出报告</button>';
    if (!wrap._tcExportToastClickBound) {
        wrap._tcExportToastClickBound = true;
        wrap.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('.tc-export-report-toast-link') : null;
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            if (wrap._tcExportToastHideTimer) {
                clearTimeout(wrap._tcExportToastHideTimer);
                wrap._tcExportToastHideTimer = null;
            }
            wrap.classList.remove('hf-float-toast--visible', 'hf-float-toast--interactive');
            wrap.style.pointerEvents = '';
            openExportReportModal(lastExportReport || report);
        });
    }
    wrap.classList.add('hf-float-toast--visible');
    wrap._tcExportToastHideTimer = setTimeout(function () {
        wrap.classList.remove('hf-float-toast--visible', 'hf-float-toast--interactive');
        wrap.style.pointerEvents = '';
        wrap._tcExportToastHideTimer = null;
    }, 8000);
}

var TC_XLSX_VENDOR_URL = '/static/vendor/xlsx.full.min.js?v=0.18.5';
var tcXlsxScriptPromise = null;

function ensureTcXlsxLoaded() {
    if (typeof global.XLSX !== 'undefined') {
        return Promise.resolve();
    }
    if (tcXlsxScriptPromise) {
        return tcXlsxScriptPromise;
    }
    tcXlsxScriptPromise = new Promise(function(resolve, reject) {
        var pending = document.querySelector('script[data-tc-xlsx="1"]');
        if (pending) {
            pending.addEventListener('load', function() {
                if (typeof global.XLSX !== 'undefined') resolve();
                else reject(new Error('XLSX 组件未加载'));
            });
            pending.addEventListener('error', function() {
                reject(new Error('无法加载 XLSX 组件'));
            });
            return;
        }
        var script = document.createElement('script');
        script.src = TC_XLSX_VENDOR_URL;
        script.async = true;
        script.defer = true;
        script.setAttribute('data-tc-xlsx', '1');
        script.onload = function() {
            if (typeof global.XLSX !== 'undefined') {
                resolve();
                return;
            }
            tcXlsxScriptPromise = null;
            reject(new Error('XLSX 组件未加载'));
        };
        script.onerror = function() {
            tcXlsxScriptPromise = null;
            reject(new Error('无法加载 XLSX 组件（请确认已部署 static/vendor/xlsx.full.min.js）'));
        };
        document.head.appendChild(script);
    });
    return tcXlsxScriptPromise;
}

function downloadExportXlsx(columns, rows) {
    if (typeof global.XLSX === 'undefined') {
        throw new Error('XLSX 组件未加载');
    }
    var aoa = [columns.slice()].concat((rows || []).map(function(row) {
        return (row || []).map(function(cell) {
            if (cell === null || cell === undefined) return '';
            return String(cell);
        });
    }));
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, '测试用例');
    var wbout = global.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '测试用例_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadExportSpreadsheet(columns, rows) {
    return ensureTcXlsxLoaded().then(function() {
        downloadExportXlsx(columns, rows);
    });
}



var TC_PROVENANCE_COLUMN_BY_PROFILE = {
    metersphere: ['备注'],
    zentao: ['相关需求'],
    jira: ['关联需求'],
    testrail: ['引用'],
    excel: ['备用', '备注']
};
var TC_PROVENANCE_COLUMN_AUTO_DETECT = ['相关需求', '关联需求', '引用', '备用', '备注'];
var tcExportProvenanceChoiceResolve = null;

function findExportColumnIndex(columns, name) {
    var target = String(name || '').trim().toLowerCase();
    for (var i = 0; i < columns.length; i++) {
        if (String(columns[i] || '').trim().toLowerCase() === target) return i;
    }
    return null;
}

function provenanceArrayHasSources(provenance) {
    if (typeof global.tcProvenanceArrayHasSources === 'function') {
        return global.tcProvenanceArrayHasSources(provenance);
    }
    if (!Array.isArray(provenance)) return false;
    for (var i = 0; i < provenance.length; i++) {
        var p = provenance[i];
        if (p && p.sources && p.sources.length) return true;
    }
    return false;
}

function resolveProvenanceExportColumnIndex(profileKey, profileColumns) {
    var key = normalizeExportProfileKey(profileKey);
    if (key === 'current' && typeof global.tcActiveTemplateId !== 'undefined' && global.tcActiveTemplateId) {
        key = String(global.tcActiveTemplateId);
    }
    var prefs = TC_PROVENANCE_COLUMN_BY_PROFILE[key] || TC_PROVENANCE_COLUMN_BY_PROFILE.metersphere;
    var pi;
    for (pi = 0; pi < prefs.length; pi++) {
        var idx = findExportColumnIndex(profileColumns, prefs[pi]);
        if (idx != null) return idx;
    }
    for (pi = 0; pi < TC_PROVENANCE_COLUMN_AUTO_DETECT.length; pi++) {
        var idx2 = findExportColumnIndex(profileColumns, TC_PROVENANCE_COLUMN_AUTO_DETECT[pi]);
        if (idx2 != null) return idx2;
    }
    return null;
}


function tcExportFormatProvenanceTextForExcel(entry) {
    if (typeof global.tcFormatProvenanceForExport === 'function') {
        var t = global.tcFormatProvenanceForExport(entry);
        if (t) return t;
    }
    if (!entry || !entry.sources || !entry.sources.length) return '';
    var parts = [];
    for (var i = 0; i < entry.sources.length; i++) {
        var s = entry.sources[i];
        if (!s) continue;
        var label = String(s.label || s.type || '').trim();
        var section = String(s.section || '').trim();
        if (label && section) parts.push(label + ' § ' + section);
        else if (label) parts.push(label);
        else if (section) parts.push(section);
    }
    return parts.join('；');
}

function tcExportPrependProvenanceToCellForExcel(cellValue, provText) {
    if (typeof global.tcPrependProvenanceToCell === 'function') {
        return global.tcPrependProvenanceToCell(cellValue, provText);
    }
    var prefix = '来源：' + provText;
    var cell = cellValue != null ? String(cellValue).trim() : '';
    return cell ? prefix + '\n' + cell : prefix;
}

function buildRequirementItemProvenanceEntry(item) {
    if (!item) return null;
    var section = String(item.page_name || '').trim();
    if (!section) return null;
    return {
        sources: [{ type: 'lanhu', label: '蓝湖需求', section: section, expandable: false }]
    };
}

function normalizeExportProvenanceRows(provenance, rowCount, item) {
    var out = [];
    var raw = Array.isArray(provenance) ? provenance : [];
    var fallback = buildRequirementItemProvenanceEntry(item);
    for (var i = 0; i < rowCount; i++) {
        var p = raw[i];
        if (p && p.sources && p.sources.length) {
            out.push(p);
        } else if (fallback) {
            out.push(fallback);
        } else {
            out.push(p || null);
        }
    }
    return out;
}

function resolveExportProvenanceOpts(profileKey, exportColumns, rows, provenance, item) {
    var normalized = normalizeExportProvenanceRows(provenance, rows.length, item);
    if (!provenanceArrayHasSources(normalized)) return null;
    var colIdx = resolveProvenanceExportColumnIndex(profileKey, exportColumns);
    if (colIdx == null) return null;
    return { provenance: normalized, provenanceColIndex: colIdx };
}

function closeTcExportProvenanceModal(result) {
    var modal = $('tc-export-provenance-modal');
    if (modal) hideModal(modal);
    var fn = tcExportProvenanceChoiceResolve;
    tcExportProvenanceChoiceResolve = null;
    if (fn) fn(result || { action: 'cancel' });
}

function askTcExportProvenanceColumnChoice(profileColumns) {
    return new Promise(function(resolve) {
        tcExportProvenanceChoiceResolve = resolve;
        var modal = $('tc-export-provenance-modal');
        var select = $('tc-export-provenance-col-select');
        if (!modal || !select) {
            resolve({ action: 'skip' });
            return;
        }
        select.innerHTML = (profileColumns || []).map(function(col, idx) {
            return '<option value="' + idx + '">' + esc(String(col)) + '</option>';
        }).join('');
        if (typeof global.ensureTcWorkbenchOverlaysMounted === 'function') global.ensureTcWorkbenchOverlaysMounted();
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        showModal(modal);
    });
}

function finishTcTableExportDownload(built, report) {
    downloadExportSpreadsheet(built.export_columns, built.export_rows).then(function() {
        lastExportReport = report;
        showExportReportToast(report);
        persistExportReportAudit(report);
    }).catch(function(err) {
        alertBox('Excel 导出失败：' + (err && err.message ? err.message : '未知错误'), {
            variant: 'warning',
            title: '导出失败'
        });
    }).finally(function() {
        if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
    });
}

function buildExportReportClient(profileKey, columns, rows, opts) {
    opts = opts || {};
    var provenanceRows = opts.provenance || null;
    var provenanceColIndex = opts.provenanceColIndex != null ? opts.provenanceColIndex : null;
    var sourceColumns = (columns || []).slice();
    var normalizedProfileKey = normalizeExportProfileKey(profileKey);
    var templates = (typeof global.TC_CASE_TEMPLATES !== 'undefined' && global.TC_CASE_TEMPLATES) ? global.TC_CASE_TEMPLATES : [];
    var tpl = null;
    if (normalizedProfileKey !== 'current') {
        for (var i = 0; i < templates.length; i++) {
            if (templates[i].id === normalizedProfileKey) { tpl = templates[i]; break; }
        }
    }
    var useCurrentColumns = normalizedProfileKey === 'current'
        || !tpl
        || !columnsMatchTemplateColumns(sourceColumns, tpl.columns || []);
    var profileColumns = useCurrentColumns
        ? sourceColumns.slice()
        : (tpl.columns || sourceColumns).slice();
    var colMap = {};
    function findExact(cols, name) {
        var target = String(name || '').trim().toLowerCase();
        for (var ci = 0; ci < cols.length; ci++) {
            if (String(cols[ci] || '').trim().toLowerCase() === target) return ci;
        }
        return null;
    }
    if (useCurrentColumns) {
        for (var pi = 0; pi < profileColumns.length; pi++) colMap[pi] = pi;
    } else {
        for (var pi2 = 0; pi2 < profileColumns.length; pi2++) {
            colMap[pi2] = findExact(sourceColumns, profileColumns[pi2]);
        }
    }
    var required = [
        ['用例名称', ['用例名称', '用例名', '用例标题', '用例摘要', '标题', '摘要']],
        ['步骤描述', ['步骤描述', '步骤', '测试步骤', '操作步骤']],
        ['预期结果', ['预期结果', '预期']]
    ];
    function profileColIndex(label, keywords) {
        for (var p = 0; p < profileColumns.length; p++) {
            if (profileColumns[p] === label) return p;
        }
        for (var p2 = 0; p2 < profileColumns.length; p2++) {
            var txt = String(profileColumns[p2] || '').toLowerCase();
            for (var k = 0; k < keywords.length; k++) {
                if (txt.indexOf(String(keywords[k]).toLowerCase()) >= 0) return p2;
            }
        }
        return null;
    }
    var requiredIdx = required.map(function(spec) {
        return { label: spec[0], idx: profileColIndex(spec[0], spec[1]) };
    }).filter(function(item) { return item.idx != null; });
    var nameIdx = profileColIndex('用例名称', ['用例名称', '用例名', '标题']);
    if (nameIdx == null) nameIdx = 0;
    var skipped = [];
    var duplicates = [];
    var exportRows = [];
    var seen = {};
    for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri] || [];
        var mapped = profileColumns.map(function(_, idx) {
            var si = colMap[idx];
            if (si == null || si >= row.length) return '';
            return String(row[si] != null ? row[si] : '').trim();
        });
        var missingLabel = null;
        for (var r = 0; r < requiredIdx.length; r++) {
            if (!mapped[requiredIdx[r].idx]) { missingLabel = requiredIdx[r].label; break; }
        }
        if (missingLabel) {
            skipped.push({ row_index: ri, reason: '缺少' + missingLabel });
            continue;
        }
        var norm = String(mapped[nameIdx] || '').trim().toLowerCase();
        if (seen[norm]) {
            duplicates.push({ row_index: ri, reason: '用例名称重复' });
            continue;
        }
        seen[norm] = true;
        if (provenanceColIndex != null && provenanceRows && provenanceRows[ri]) {
            var provText = tcExportFormatProvenanceTextForExcel(provenanceRows[ri]);
            if (provText) {
                mapped[provenanceColIndex] = tcExportPrependProvenanceToCellForExcel(mapped[provenanceColIndex], provText);
            }
        }
        exportRows.push(mapped);
    }
    var report = {
        exported_at: new Date().toISOString().slice(0, 19),
        profile: useCurrentColumns ? 'current' : normalizedProfileKey,
        total_rows: rows.length,
        exported_rows: exportRows.length,
        skipped_count: skipped.length,
        duplicate_count: duplicates.length,
        skipped: skipped,
        duplicates: duplicates
    };
    return { report: report, export_columns: profileColumns, export_rows: exportRows };
}

function persistExportReportAudit(report) {
    return fetch('/api/test-cases/export-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: report })
    }).catch(function() { return null; });
}

function tcExportTableWithReport() {
    var payload = collectRowsPayloadForValidation();
    var columns = payload.columns || [];
    var rows = payload.rows || [];
    var provenance = [];
    if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
        provenance = global.tcProvenanceArrayForStashPayload(rows.length);
    } else if (typeof global.testCasesProvenance !== 'undefined' && global.testCasesProvenance) {
        provenance = global.testCasesProvenance.slice();
    }
    if (!columns.length || !rowsPayloadHasCellContent(payload)) {
        alertBox('当前表格暂无数据，请先添加用例后再导出。', { variant: 'info', title: '暂无可导出数据' });
        if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
        return;
    }
    var profileKey = getActiveExportProfileKey();
    var hasProv = provenanceArrayHasSources(provenance);
    var previewBuilt = buildExportReportClient(profileKey, columns, rows);
    var previewReport = previewBuilt.report;
    if (!previewReport.exported_rows) {
        alertBox('没有可导出的有效用例。请检查必填字段（用例名称、步骤描述、预期结果）或重复项。', {
            variant: 'warning',
            title: '导出失败'
        });
        if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
        return;
    }

    function runExport(provenanceColIndex) {
        var opts = null;
        if (hasProv && provenanceColIndex != null) {
            opts = { provenance: provenance, provenanceColIndex: provenanceColIndex };
        }
        var built = buildExportReportClient(profileKey, columns, rows, opts);
        finishTcTableExportDownload(built, built.report);
    }

    if (!hasProv) {
        runExport(null);
        return;
    }

    var autoCol = resolveProvenanceExportColumnIndex(profileKey, previewBuilt.export_columns);
    if (autoCol != null) {
        runExport(autoCol);
        return;
    }

    askTcExportProvenanceColumnChoice(previewBuilt.export_columns).then(function(choice) {
        if (!choice || choice.action === 'cancel') {
            if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
            return;
        }
        if (choice.action === 'skip') {
            runExport(null);
            return;
        }
        if (choice.action === 'apply') {
            var colIdx = choice.colIndex;
            if (colIdx == null || colIdx < 0 || colIdx >= previewBuilt.export_columns.length) {
                alertBox('请选择要写入来源的列。', { variant: 'warning', title: '请选择列' });
                if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
                return;
            }
            runExport(colIdx);
        }
    });
}


/* ---------- 导出需求选择弹窗 ---------- */

var tcExportRequirementPickerItems = [];
var tcExportRequirementPickerSelectionOrder = [];
var tcExportRequirementPickerCurrentKey = '';

function buildRequirementExportKey(item) {
    if (!item) return '';
    return [
        String(item.lanhu_pid || ''),
        String(item.lanhu_doc_id || ''),
        String(item.lanhu_page_id || item.page_id || '')
    ].join(':');
}



function resolveExportRequirementActiveDocId() {
    if (typeof global.getTcLanhuDocTreeMeta === 'function') {
        var meta = global.getTcLanhuDocTreeMeta() || {};
        var docId = String(meta.docId || '').trim();
        if (docId) return docId;
    }
    var ctx = resolveCurrentRequirementExportContext();
    if (ctx && ctx.lanhu_doc_id) return String(ctx.lanhu_doc_id).trim();
    return '';
}

function filterExportRequirementItemsForActiveDoc(items) {
    items = items || [];
    var activeDocId = resolveExportRequirementActiveDocId();
    if (!activeDocId) return items.slice();
    return items.filter(function(item) {
        if (!item) return false;
        return String(item.lanhu_doc_id || '').trim() === activeDocId;
    });
}

function resolveExportRequirementItemFolderPath(item) {
    item = item || {};
    var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
    if (!pageId) return '';
    var itemDocId = String(item.lanhu_doc_id || '').trim();
    var treeDocId = '';
    if (typeof global.getTcLanhuDocTreeMeta === 'function') {
        treeDocId = String((global.getTcLanhuDocTreeMeta() || {}).docId || '').trim();
    }
    if (treeDocId && itemDocId && treeDocId !== itemDocId) return '';
    var rawPath = '';
    if (typeof global.findTcLanhuPageNodePath === 'function') {
        rawPath = String(global.findTcLanhuPageNodePath(pageId) || '').trim();
    }
    if (!rawPath && item.is_current && typeof global.getTcLanhuDocTreeMeta === 'function') {
        var meta = global.getTcLanhuDocTreeMeta() || {};
        if (String(meta.selectedId || '').trim() === pageId) {
            rawPath = String(meta.selectedPagePath || '').trim();
        }
    }
    if (!rawPath) return '';
    if (typeof tcNormalizeWorkbenchPageDisplayName === 'function') {
        rawPath = tcNormalizeWorkbenchPageDisplayName(rawPath);
    }
    if (!rawPath) return '';
    var parts = rawPath.split('/').map(function(part) {
        return String(part || '').trim();
    }).filter(Boolean);
    if (parts.length <= 1) return '';
    parts.pop();
    return parts.join(' / ');
}

function formatRequirementExportUpdatedAt(raw) {
    var text = String(raw || '').trim();
    if (!text) return '';
    return text.replace('T', ' ').slice(0, 16);
}

function resolveCurrentRequirementExportContext() {
    if (global.TcRequirementCaseStore && typeof global.TcRequirementCaseStore.resolveContext === 'function') {
        return global.TcRequirementCaseStore.resolveContext({});
    }
    return null;
}

function countLiveExportableRows() {
    var payload = collectRowsPayloadForValidation();
    if (!rowsPayloadHasCellContent(payload)) return 0;
    return (payload.rows || []).length;
}

function mergeCurrentPageIntoRequirementList(items) {
    items = (items || []).slice();
    var ctx = resolveCurrentRequirementExportContext();
    if (!ctx) return items;
    var activeDocId = resolveExportRequirementActiveDocId();
    if (activeDocId && String(ctx.lanhu_doc_id || '').trim() !== activeDocId) return items;
    var liveCount = countLiveExportableRows();
    if (!liveCount) return items;
    var key = buildRequirementExportKey(ctx);
    var pageName = String(ctx.page_name || '').trim() || '未命名需求';
    var found = false;
    for (var i = 0; i < items.length; i++) {
        if (buildRequirementExportKey(items[i]) === key) {
            items[i] = Object.assign({}, items[i], {
                page_name: pageName || items[i].page_name,
                row_count: liveCount,
                is_current: true
            });
            found = true;
            break;
        }
    }
    if (!found) {
        items.unshift({
            requirement_id: ctx.requirement_id || ctx.lanhu_page_id || '',
            lanhu_pid: ctx.lanhu_pid || '',
            lanhu_doc_id: ctx.lanhu_doc_id || '',
            lanhu_page_id: ctx.lanhu_page_id || ctx.page_id || '',
            lanhu_url: ctx.lanhu_url || '',
            page_name: pageName,
            row_count: liveCount,
            updated_at: '',
            is_current: true
        });
    }
    return items;
}

function fetchDesignedRequirementList() {
    return fetch('/api/test-cases/requirement-cases/list', { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data || !data.ok) {
                throw new Error((data && data.error) || '加载需求列表失败');
            }
            return mergeCurrentPageIntoRequirementList(
                filterExportRequirementItemsForActiveDoc(data.items || [])
            );
        });
}

function ensureExportRequirementPickerMounted() {
    if (typeof global.ensureTcWorkbenchOverlaysMounted === 'function') {
        global.ensureTcWorkbenchOverlaysMounted();
    }
    var modal = $('tc-export-requirement-modal');
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    return modal;
}

function closeTcExportRequirementPickerModal() {
    var modal = $('tc-export-requirement-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (!document.querySelector('#tc-export-requirement-modal.flex')) {
        document.body.style.overflow = '';
    }
}

function updateTcExportRequirementPickerSummary() {
    var summary = $('tc-export-requirement-summary');
    var submit = $('tc-export-requirement-submit');
    if (!summary && !submit) return;
    var selected = getSelectedExportRequirementItems();
    var count = selected.length;
    var rows = 0;
    selected.forEach(function(item) {
        rows += parseInt(item.row_count, 10) || 0;
    });
    if (summary) {
        summary.textContent = count
            ? ('已选 ' + count + ' 个需求，共约 ' + rows + ' 条用例（按勾选顺序导出）')
            : '请勾选需要导出的需求';
    }
    if (submit) submit.disabled = count === 0;
    syncTcExportRequirementPickerModeVisibility(count);
    syncTcExportRequirementPickerOrderBadges();
}

function renderTcExportRequirementPickerList(items) {
    tcExportRequirementPickerItems = items || [];
    var listEl = $('tc-export-requirement-list');
    var emptyEl = $('tc-export-requirement-empty');
    var loadingEl = $('tc-export-requirement-loading');
    if (loadingEl) loadingEl.classList.add('hidden');
    if (!listEl) return;
    if (!items.length) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        updateTcExportRequirementPickerSummary();
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    var html = items.map(function(item, idx) {
        var name = String(item.page_name || item.requirement_id || '未命名需求').trim();
        var meta = (parseInt(item.row_count, 10) || 0) + ' 条用例';
        var updated = formatRequirementExportUpdatedAt(item.updated_at);
        if (updated) meta += ' · 更新 ' + updated;
        if (item.is_current) meta += ' · 当前页面';
        var checked = item.is_current || buildRequirementExportKey(item) === tcExportRequirementPickerCurrentKey;
        var folderPath = resolveExportRequirementItemFolderPath(item);
        var pathHtml = folderPath
            ? ('<span class="tc-export-requirement-item__path" title="' + esc(folderPath) + '">' + esc(folderPath) + '</span>')
            : '';
        return '<label class="tc-export-requirement-item">' +
            '<input type="checkbox" class="tc-export-requirement-check" data-index="' + idx + '"' +
            (checked ? ' checked' : '') + '>' +
            '<span class="tc-export-requirement-item__order hidden" aria-hidden="true"></span>' +
            '<span class="tc-export-requirement-item__body">' +
            '<span class="tc-export-requirement-item__head">' +
            '<span class="tc-export-requirement-item__title">' + esc(name) + '</span>' +
            pathHtml +
            '</span>' +
            '<span class="tc-export-requirement-item__meta">' + esc(meta) + '</span>' +
            '</span></label>';
    }).join('');
    listEl.innerHTML = html;
    tcExportRequirementPickerSelectionOrder = [];
    items.forEach(function(item, idx) {
        if (item.is_current || buildRequirementExportKey(item) === tcExportRequirementPickerCurrentKey) {
            tcExportRequirementPickerSelectionOrder.push(idx);
        }
    });
    listEl.querySelectorAll('.tc-export-requirement-check').forEach(function(el) {
        el.addEventListener('change', onTcExportRequirementCheckChange);
    });
    updateTcExportRequirementPickerSummary();
}

function setTcExportRequirementPickerLoading(isLoading) {
    var loadingEl = $('tc-export-requirement-loading');
    var listEl = $('tc-export-requirement-list');
    var emptyEl = $('tc-export-requirement-empty');
    if (loadingEl) loadingEl.classList.toggle('hidden', !isLoading);
    if (isLoading) {
        if (listEl) listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.add('hidden');
    }
}

function openTcExportRequirementPickerModal() {
    var modal = ensureExportRequirementPickerMounted();
    if (!modal) {
        alertBox('导出弹窗未就绪，请刷新页面后重试。', { variant: 'warning', title: '导出失败' });
        if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
        return;
    }
    var ctx = resolveCurrentRequirementExportContext();
    tcExportRequirementPickerCurrentKey = ctx ? buildRequirementExportKey(ctx) : '';
    setTcExportRequirementPickerLoading(true);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    fetchDesignedRequirementList()
        .then(function(items) {
            renderTcExportRequirementPickerList(items);
        })
        .catch(function(err) {
            setTcExportRequirementPickerLoading(false);
            renderTcExportRequirementPickerList([]);
            alertBox((err && err.message) || '加载需求列表失败', { variant: 'warning', title: '加载失败' });
        })
        .finally(function() {
            if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
        });
}

function getSelectedExportRequirementItems() {
    var selected = [];
    var seen = {};
    tcExportRequirementPickerSelectionOrder.forEach(function(idx) {
        var el = document.querySelector('.tc-export-requirement-check[data-index="' + idx + '"]');
        var item = tcExportRequirementPickerItems[idx];
        if (!el || !el.checked || !item || seen[idx]) return;
        seen[idx] = true;
        selected.push(item);
    });
    document.querySelectorAll('.tc-export-requirement-check:checked').forEach(function(el) {
        var idx = parseInt(el.getAttribute('data-index'), 10);
        if (isNaN(idx) || seen[idx] || !tcExportRequirementPickerItems[idx]) return;
        seen[idx] = true;
        selected.push(tcExportRequirementPickerItems[idx]);
    });
    return selected;
}

function fetchRequirementCasePayload(item) {
    var lanhuUrl = String(item.lanhu_url || '').trim();
    var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
    if (!lanhuUrl || !pageId) {
        return Promise.reject(new Error('需求链接不完整'));
    }
    var url = '/api/test-cases/requirement-cases?lanhu_url=' +
        encodeURIComponent(lanhuUrl) + '&page_id=' + encodeURIComponent(pageId);
    return fetch(url, { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data || !data.ok || !data.found || !data.data) {
                throw new Error('未找到用例数据');
            }
            return data.data;
        });
}

function getLivePayloadForRequirementItem(item) {
    var payload = collectRowsPayloadForValidation();
    if (!rowsPayloadHasCellContent(payload)) {
        return Promise.reject(new Error('当前页面暂无可导出用例'));
    }
    var rows = payload.rows || [];
    var provenance = [];
    if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
        provenance = global.tcProvenanceArrayForStashPayload(rows.length);
    } else if (typeof global.testCasesProvenance !== 'undefined' && global.testCasesProvenance) {
        provenance = global.testCasesProvenance.slice();
    }
    return Promise.resolve({
        payload: {
            columns: payload.columns || [],
            rows: rows,
            provenance: provenance
        },
        page_name: item.page_name,
        template_id: (typeof global.tcActiveTemplateId !== 'undefined') ? global.tcActiveTemplateId : null
    });
}

function resolveRequirementExportPayload(item) {
    var ctx = resolveCurrentRequirementExportContext();
    var isCurrent = item.is_current || (ctx && buildRequirementExportKey(item) === buildRequirementExportKey(ctx));
    if (isCurrent && countLiveExportableRows() > 0) {
        return getLivePayloadForRequirementItem(item);
    }
    return fetchRequirementCasePayload(item).then(function(doc) {
        return {
            payload: doc.payload || {},
            page_name: doc.page_name || item.page_name,
            template_id: doc.template_id
        };
    });
}

function sanitizeExcelSheetName(name, usedNames) {
    usedNames = usedNames || {};
    var base = String(name || '需求').replace(/[\\/*?:\[\]]/g, '_').trim();
    if (!base) base = '需求';
    if (base.length > 31) base = base.slice(0, 31);
    var candidate = base;
    var n = 2;
    while (usedNames[candidate]) {
        var suffix = '_' + n;
        candidate = base.slice(0, Math.max(1, 31 - suffix.length)) + suffix;
        n += 1;
    }
    usedNames[candidate] = true;
    return candidate;
}

function downloadMultiSheetExportXlsx(sheets) {
    if (typeof global.XLSX === 'undefined') {
        throw new Error('XLSX 组件未加载');
    }
    var wb = global.XLSX.utils.book_new();
    var usedNames = {};
    (sheets || []).forEach(function(spec) {
        var columns = spec.columns || [];
        var rows = spec.rows || [];
        var aoa = [columns.slice()].concat(rows.map(function(row) {
            return (row || []).map(function(cell) {
                if (cell === null || cell === undefined) return '';
                return String(cell);
            });
        }));
        var ws = global.XLSX.utils.aoa_to_sheet(aoa);
        global.XLSX.utils.book_append_sheet(wb, ws, sanitizeExcelSheetName(spec.sheetName, usedNames));
    });
    var wbout = global.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '测试用例_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


function onTcExportRequirementCheckChange(e) {
    var el = e && e.target;
    if (!el) return;
    var idx = parseInt(el.getAttribute('data-index'), 10);
    if (isNaN(idx)) return;
    if (el.checked) {
        if (tcExportRequirementPickerSelectionOrder.indexOf(idx) === -1) {
            tcExportRequirementPickerSelectionOrder.push(idx);
        }
    } else {
        tcExportRequirementPickerSelectionOrder = tcExportRequirementPickerSelectionOrder.filter(function(i) {
            return i !== idx;
        });
    }
    updateTcExportRequirementPickerSummary();
}

function resetTcExportRequirementPickerSelectionOrderFromChecks() {
    tcExportRequirementPickerSelectionOrder = [];
    document.querySelectorAll('.tc-export-requirement-check:checked').forEach(function(el) {
        var idx = parseInt(el.getAttribute('data-index'), 10);
        if (!isNaN(idx) && tcExportRequirementPickerSelectionOrder.indexOf(idx) === -1) {
            tcExportRequirementPickerSelectionOrder.push(idx);
        }
    });
}

function syncTcExportRequirementPickerOrderBadges() {
    document.querySelectorAll('.tc-export-requirement-item').forEach(function(label) {
        var badge = label.querySelector('.tc-export-requirement-item__order');
        if (!badge) return;
        badge.textContent = '';
        badge.classList.add('hidden');
    });
    tcExportRequirementPickerSelectionOrder.forEach(function(idx, order) {
        var el = document.querySelector('.tc-export-requirement-check[data-index="' + idx + '"]');
        if (!el || !el.checked) return;
        var label = el.closest('.tc-export-requirement-item');
        if (!label) return;
        var badge = label.querySelector('.tc-export-requirement-item__order');
        if (!badge) return;
        badge.textContent = String(order + 1);
        badge.classList.remove('hidden');
    });
}

function syncTcExportRequirementPickerModeVisibility(selectedCount) {
    var wrap = $('tc-export-requirement-mode-wrap');
    if (!wrap) return;
    wrap.classList.toggle('hidden', selectedCount < 2);
    wrap.setAttribute('aria-hidden', selectedCount < 2 ? 'true' : 'false');
}

function getTcExportRequirementExportMode() {
    var checked = document.querySelector('input[name="tc-export-requirement-mode"]:checked');
    return checked ? String(checked.value || 'merge') : 'merge';
}

function findExportColumnIndexInsensitive(columns, name) {
    var target = String(name || '').trim().toLowerCase();
    for (var i = 0; i < (columns || []).length; i++) {
        if (String(columns[i] || '').trim().toLowerCase() === target) return i;
    }
    return null;
}

function remapExportRowsToTargetColumns(targetColumns, sourceColumns, sourceRows) {
    targetColumns = targetColumns || [];
    sourceColumns = sourceColumns || [];
    sourceRows = sourceRows || [];
    if (!targetColumns.length) return sourceRows.slice();
    var sameShape = targetColumns.length === sourceColumns.length;
    if (sameShape) {
        var allMatch = true;
        for (var i = 0; i < targetColumns.length; i++) {
            if (String(targetColumns[i] || '').trim().toLowerCase() !==
                String(sourceColumns[i] || '').trim().toLowerCase()) {
                allMatch = false;
                break;
            }
        }
        if (allMatch) return sourceRows.map(function(row) { return (row || []).slice(); });
    }
    return sourceRows.map(function(row) {
        row = row || [];
        return targetColumns.map(function(colName) {
            var si = findExportColumnIndexInsensitive(sourceColumns, colName);
            if (si == null || si >= row.length) return '';
            var cell = row[si];
            return cell === null || cell === undefined ? '' : String(cell);
        });
    });
}

function mergeRequirementExportReports(reports) {
    var aggregate = {
        exported_at: new Date().toISOString().slice(0, 19),
        profile: getActiveExportProfileKey(),
        total_rows: 0,
        exported_rows: 0,
        skipped_count: 0,
        duplicate_count: 0,
        skipped: [],
        duplicates: []
    };
    (reports || []).forEach(function(report) {
        if (!report) return;
        aggregate.total_rows += report.total_rows || 0;
        aggregate.exported_rows += report.exported_rows || 0;
        aggregate.skipped_count += report.skipped_count != null
            ? report.skipped_count
            : (report.skipped || []).length;
        aggregate.duplicate_count += report.duplicate_count != null
            ? report.duplicate_count
            : (report.duplicates || []).length;
    });
    return aggregate;
}

function mergeRequirementExportSheetsOrdered(sheets) {
    sheets = sheets || [];
    if (!sheets.length) return null;
    var first = sheets[0];
    var mergedColumns = (first.columns || []).slice();
    var mergedRows = (first.rows || []).slice();
    var reports = [first.report];
    for (var i = 1; i < sheets.length; i++) {
        var spec = sheets[i];
        var remapped = remapExportRowsToTargetColumns(mergedColumns, spec.columns, spec.rows);
        mergedRows = mergedRows.concat(remapped);
        reports.push(spec.report);
    }
    return {
        export_columns: mergedColumns,
        export_rows: mergedRows,
        report: mergeRequirementExportReports(reports)
    };
}

function sanitizeRequirementExportFileName(pageName, dateStr, index) {
    var base = String(pageName || '需求').replace(/[\\/*?:\[\]"<>|]/g, '_').trim();
    if (!base) base = '需求';
    if (base.length > 40) base = base.slice(0, 40);
    var suffix = typeof index === 'number' ? '_' + (index + 1) : '';
    return '测试用例_' + base + suffix + '_' + dateStr + '.xlsx';
}

function downloadExportXlsxWithFilename(columns, rows, filename) {
    if (typeof global.XLSX === 'undefined') {
        throw new Error('XLSX 组件未加载');
    }
    var aoa = [columns.slice()].concat((rows || []).map(function(row) {
        return (row || []).map(function(cell) {
            if (cell === null || cell === undefined) return '';
            return String(cell);
        });
    }));
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, '测试用例');
    var wbout = global.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || ('测试用例_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadSeparateRequirementExportFiles(sheets) {
    return ensureTcXlsxLoaded().then(function() {
        var dateStr = new Date().toISOString().slice(0, 10);
        var aggregate = mergeRequirementExportReports((sheets || []).map(function(s) { return s.report; }));
        (sheets || []).forEach(function(spec, index) {
            (function(i, item) {
                setTimeout(function() {
                    downloadExportXlsxWithFilename(
                        item.columns || [],
                        item.rows || [],
                        sanitizeRequirementExportFileName(item.sheetName, dateStr, i)
                    );
                }, i * 320);
            })(index, spec);
        });
        lastExportReport = aggregate;
        showExportReportToast(aggregate);
        persistExportReportAudit(aggregate);
    });
}


function buildRequirementExportSheet(item, doc) {
    var payload = doc.payload || {};
    var columns = payload.columns || [];
    var rows = payload.rows || [];
    if (!columns.length || !rows.length) {
        return null;
    }
    var profileKey = doc.template_id || getActiveExportProfileKey();
    var previewBuilt = buildExportReportClient(profileKey, columns, rows);
    var provOpts = resolveExportProvenanceOpts(
        profileKey,
        previewBuilt.export_columns,
        rows,
        payload.provenance,
        item
    );
    var built = buildExportReportClient(profileKey, columns, rows, provOpts);
    if (!built.export_rows || !built.export_rows.length) return null;
    return {
        sheetName: String(item.page_name || item.requirement_id || '需求').trim() || '需求',
        columns: built.export_columns,
        rows: built.export_rows,
        report: built.report
    };
}

function runExportForSelectedRequirements(selectedItems) {
    if (!selectedItems.length) {
        alertBox('请至少选择一个需求。', { variant: 'info', title: '请选择需求' });
        return;
    }
    if (typeof global.beginTcExportExcelLoading === 'function' && !global.beginTcExportExcelLoading()) {
        return;
    }
    closeTcExportRequirementPickerModal();

    function syncBeforeExport() {
        if (global.TcRequirementCaseStore && typeof global.TcRequirementCaseStore.flushIfDirty === 'function') {
            return Promise.resolve(global.TcRequirementCaseStore.flushIfDirty('export_excel')).catch(function() {});
        }
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            return Promise.resolve(global.TcTableBridge.commitAll()).catch(function() {});
        }
        return Promise.resolve();
    }

    syncBeforeExport().then(function() {
        return Promise.all(selectedItems.map(function(item) {
            return resolveRequirementExportPayload(item).then(function(doc) {
                return buildRequirementExportSheet(item, doc);
            }).catch(function(err) {
                return { error: err, item: item };
            });
        }));
    }).then(function(results) {
        var sheets = [];
        var aggregate = {
            exported_at: new Date().toISOString().slice(0, 19),
            profile: getActiveExportProfileKey(),
            total_rows: 0,
            exported_rows: 0,
            skipped_count: 0,
            duplicate_count: 0,
            skipped: [],
            duplicates: []
        };
        var errors = [];
        results.forEach(function(result) {
            if (!result) return;
            if (result.error) {
                errors.push(String(result.item && result.item.page_name || '需求') + '：' +
                    (result.error.message || '导出失败'));
                return;
            }
            sheets.push(result);
            if (result.report) {
                aggregate.total_rows += result.report.total_rows || 0;
                aggregate.exported_rows += result.report.exported_rows || 0;
                aggregate.skipped_count += result.report.skipped_count != null
                    ? result.report.skipped_count
                    : (result.report.skipped || []).length;
                aggregate.duplicate_count += result.report.duplicate_count != null
                    ? result.report.duplicate_count
                    : (result.report.duplicates || []).length;
            }
        });
        if (!sheets.length) {
            alertBox(errors.length ? errors.join('\n') : '没有可导出的有效用例。', {
                variant: 'warning',
                title: '导出失败'
            });
            return;
        }
        var exportMode = sheets.length > 1 ? getTcExportRequirementExportMode() : 'single';
        return ensureTcXlsxLoaded().then(function() {
            if (sheets.length === 1) {
                finishTcTableExportDownload({ export_columns: sheets[0].columns, export_rows: sheets[0].rows }, sheets[0].report || aggregate);
                return;
            }
            if (exportMode === 'separate') {
                return downloadSeparateRequirementExportFiles(sheets);
            }
            var merged = mergeRequirementExportSheetsOrdered(sheets);
            if (!merged || !merged.export_rows || !merged.export_rows.length) {
                alertBox('合并导出失败：没有可导出的有效用例。', { variant: 'warning', title: '导出失败' });
                return;
            }
            finishTcTableExportDownload(merged, merged.report || aggregate);
        }).then(function() {
            if (errors.length) {
                toast('部分需求导出失败：' + errors.join('；'), { variant: 'warning', duration: 5200 });
            }
        });
    }).catch(function(err) {
        alertBox('导出失败：' + (err && err.message ? err.message : '未知错误'), {
            variant: 'warning',
            title: '导出失败'
        });
    }).finally(function() {
        if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
    });
}

function tcOpenExportRequirementPicker() {
    openTcExportRequirementPickerModal();
}

function initTcExportRequirementPickerUi() {
    if (global._tcExportRequirementPickerInited) return;
    global._tcExportRequirementPickerInited = true;
    $('tc-export-requirement-close') && $('tc-export-requirement-close').addEventListener('click', function() {
        closeTcExportRequirementPickerModal();
    });
    $('tc-export-requirement-cancel') && $('tc-export-requirement-cancel').addEventListener('click', function() {
        closeTcExportRequirementPickerModal();
    });
    $('tc-export-requirement-select-all') && $('tc-export-requirement-select-all').addEventListener('click', function() {
        tcExportRequirementPickerSelectionOrder = tcExportRequirementPickerItems.map(function(_, idx) { return idx; });
        document.querySelectorAll('.tc-export-requirement-check').forEach(function(el) { el.checked = true; });
        updateTcExportRequirementPickerSummary();
    });
    $('tc-export-requirement-select-none') && $('tc-export-requirement-select-none').addEventListener('click', function() {
        tcExportRequirementPickerSelectionOrder = [];
        document.querySelectorAll('.tc-export-requirement-check').forEach(function(el) { el.checked = false; });
        updateTcExportRequirementPickerSummary();
    });
    document.querySelectorAll('input[name="tc-export-requirement-mode"]').forEach(function(el) {
        el.addEventListener('change', function() {
            syncTcExportRequirementPickerModeVisibility(getSelectedExportRequirementItems().length);
        });
    });
    $('tc-export-requirement-submit') && $('tc-export-requirement-submit').addEventListener('click', function() {
        runExportForSelectedRequirements(getSelectedExportRequirementItems());
    });
    $('tc-export-requirement-modal') && $('tc-export-requirement-modal').addEventListener('click', function(e) {
        if (e.target === $('tc-export-requirement-modal')) closeTcExportRequirementPickerModal();
    });
}

initTcExportRequirementPickerUi();

global.tcExportTableWithReport = tcExportTableWithReport;
global.tcOpenExportRequirementPicker = tcOpenExportRequirementPicker;
global.tcOpenExportReportModal = openExportReportModal;
global.tcDownloadExportSpreadsheet = downloadExportSpreadsheet;


/* ---- tc_wb_export_xmind.js ---- */
(function tcExportXmindPicker(global) {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function esc(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    var tcExportXmindPickerItems = [];
    var tcExportXmindPickerSelectionOrder = [];
    var tcExportXmindPickerCurrentKey = '';

    function buildXmindExportKey(item) {
        item = item || {};
        return [
            String(item.lanhu_url || '').trim(),
            String(item.lanhu_page_id || item.page_id || '').trim()
        ].join('|');
    }

    function resolveXmindExportActiveDocId() {
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            return String((global.getTcLanhuDocTreeMeta() || {}).docId || '').trim();
        }
        return '';
    }

    function filterXmindExportItemsForActiveDoc(items) {
        items = items || [];
        var activeDocId = resolveXmindExportActiveDocId();
        if (!activeDocId) return items;
        return items.filter(function (item) {
            return String(item.lanhu_doc_id || '').trim() === activeDocId;
        });
    }

    function resolveCurrentMindmapExportContext() {
        if (global.TcRequirementCaseStore && typeof global.TcRequirementCaseStore.resolveContext === 'function') {
            return global.TcRequirementCaseStore.resolveContext({});
        }
        return null;
    }

    function resolvePageFullPathForXmindExport(item) {
        item = item || {};
        var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
        if (pageId && typeof global.findTcLanhuPageNodePath === 'function') {
            var path = String(global.findTcLanhuPageNodePath(pageId) || '').trim();
            if (path) return path;
        }
        return String(item.page_name || item.requirement_id || '未命名需求').trim() || '未命名需求';
    }

    function resolveLanhuDocDisplayNameForXmindExport() {
        var nameInput = $('tc-lanhu-connect-doc-name');
        if (nameInput && String(nameInput.value || '').trim()) {
            return String(nameInput.value || '').trim();
        }
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta = global.getTcLanhuDocTreeMeta() || {};
            if (String(meta.docName || '').trim()) return String(meta.docName).trim();
        }
        var titleEl = $('tc-lanhu-tree-doc-title');
        var title = titleEl ? String(titleEl.textContent || '').trim() : '';
        if (title && title !== '蓝湖需求树' && title !== '蓝湖需求') return title;
        if (typeof global.getTcLanhuActiveSavedDocName === 'function') {
            var saved = String(global.getTcLanhuActiveSavedDocName() || '').trim();
            if (saved) return saved;
        }
        return '需求文档';
    }

    function mindmapPayloadHasExportableContent(payload) {
        if (!payload || typeof payload !== 'object') return false;
        var mind = payload.mind;
        if (mind && mind.data) {
            var ch = mind.data.children;
            if (Array.isArray(ch) && ch.length) return true;
        }
        var rows = payload.rows;
        if (Array.isArray(rows) && rows.length) {
            return rows.some(function (row) {
                if (!Array.isArray(row)) return false;
                return row.some(function (cell) { return String(cell != null ? cell : '').trim(); });
            });
        }
        return false;
    }

    function buildMindRootNodeFromPayload(payload) {
        payload = payload || {};
        if (payload.mind && payload.mind.data) {
            try {
                return JSON.parse(JSON.stringify(payload.mind.data));
            } catch (eClone) { /* fallback below */ }
        }
        if (typeof global.buildTcMindmapMindData !== 'function') return null;
        var savedCases = global.tcMindmapCasesData;
        var savedCols = global.tableColumns;
        var savedRoot = global.tcMindmapRootTopic;
        var savedApplied = global.tcTableTemplateApplied;
        try {
            global.tableColumns = (payload.columns || []).map(function (c) { return String(c); });
            global.tcMindmapCasesData = (payload.rows || []).map(function (row) {
                return Array.isArray(row) ? row.map(function (v) { return String(v != null ? v : ''); }) : [];
            });
            global.tcTableTemplateApplied = true;
            if (payload.rootTopic) global.tcMindmapRootTopic = String(payload.rootTopic);
            var built = global.buildTcMindmapMindData();
            return built && built.data ? built.data : null;
        } finally {
            global.tcMindmapCasesData = savedCases;
            global.tableColumns = savedCols;
            global.tcMindmapRootTopic = savedRoot;
            global.tcTableTemplateApplied = savedApplied;
        }
    }

    function mindRootChildrenToXmindTopics(mindRoot) {
        if (!mindRoot || typeof global.tcJsmindNodeToXmindTopic !== 'function') return [];
        var children = mindRoot.children || [];
        if (!children.length) {
            var single = global.tcJsmindNodeToXmindTopic(mindRoot);
            if (!single) return [];
            delete single.children;
            return [single];
        }
        if (typeof global.tcJsmindNodeToXmindZenTopic === 'function') {
            return children.map(global.tcJsmindNodeToXmindZenTopic).filter(Boolean);
        }
        return children.map(global.tcJsmindNodeToXmindTopic).filter(Boolean);
    }

    function downloadXmindBlob(rootTopic, filenameStem, sheetTitle) {
        if (!rootTopic) return false;
        if (typeof global.tcDownloadXmindZenBlob === 'function') {
            return global.tcDownloadXmindZenBlob(rootTopic, filenameStem, { sheetTitle: sheetTitle || '测试用例' });
        }
        if (typeof global.tcBuildXmindZenWorkbookBlob !== 'function') return false;
        var blob = global.tcBuildXmindZenWorkbookBlob(rootTopic, { sheetTitle: sheetTitle || '测试用例' });
        if (!blob) return false;
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (filenameStem || '测试用例') + '_' + new Date().toISOString().slice(0, 10) + '.xmind';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    }

    function collectLiveMindmapPayloadForCurrentPage() {
        if (typeof global.collectTcMindmapStashPayload === 'function') {
            try {
                var payload = global.collectTcMindmapStashPayload();
                if (mindmapPayloadHasExportableContent(payload)) return payload;
            } catch (eLive) { /* ignore */ }
        }
        if (global.tcMindmapInstance && typeof global.tcMindmapInstance.get_data === 'function') {
            try {
                var mindData = global.tcMindmapInstance.get_data('node_tree');
                if (mindData && mindData.data) {
                    return { mind: mindData, columns: global.tableColumns || [], rows: global.tcMindmapCasesData || [] };
                }
            } catch (eInst) { /* ignore */ }
        }
        if (typeof global.buildTcMindmapMindData === 'function') {
            var built = global.buildTcMindmapMindData();
            if (built && built.data) {
                return { mind: built, columns: global.tableColumns || [], rows: global.tcMindmapCasesData || [] };
            }
        }
        return null;
    }

    function isCurrentMindmapExportItem(item) {
        var ctx = resolveCurrentMindmapExportContext();
        if (!ctx || !item) return false;
        return buildXmindExportKey(ctx) === buildXmindExportKey(item);
    }

    function fetchMindmapPayloadForExportItem(item) {
        if (isCurrentMindmapExportItem(item)) {
            var live = collectLiveMindmapPayloadForCurrentPage();
            if (live) return Promise.resolve(live);
        }
        var lanhuUrl = String(item.lanhu_url || '').trim();
        var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
        if (!lanhuUrl || !pageId) return Promise.resolve(null);
        var q = '/api/test-cases/requirement-mindmaps?lanhu_url=' +
            encodeURIComponent(lanhuUrl) + '&page_id=' + encodeURIComponent(pageId) + '&_ts=' + Date.now();
        return fetch(q, { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d || !d.ok || !d.found || !d.data || !d.data.payload) return null;
                return d.data.payload;
            })
            .catch(function () { return null; });
    }

    function mergeCurrentPageIntoMindmapExportList(items) {
        items = (items || []).slice();
        var ctx = resolveCurrentMindmapExportContext();
        if (!ctx) return items;
        var activeDocId = resolveXmindExportActiveDocId();
        if (activeDocId && String(ctx.lanhu_doc_id || '').trim() !== activeDocId) return items;
        var live = collectLiveMindmapPayloadForCurrentPage();
        if (!mindmapPayloadHasExportableContent(live)) return items;
        var key = buildXmindExportKey(ctx);
        var pageName = String(ctx.page_name || '').trim() || '未命名需求';
        var caseCount = Array.isArray(live.rows) ? live.rows.length : 0;
        var found = false;
        for (var i = 0; i < items.length; i++) {
            if (buildXmindExportKey(items[i]) === key) {
                items[i] = Object.assign({}, items[i], {
                    page_name: pageName || items[i].page_name,
                    case_count: Math.max(parseInt(items[i].case_count, 10) || 0, caseCount),
                    is_current: true
                });
                found = true;
                break;
            }
        }
        if (!found) {
            items.unshift({
                requirement_id: ctx.requirement_id || ctx.lanhu_page_id || '',
                lanhu_pid: ctx.lanhu_pid || '',
                lanhu_doc_id: ctx.lanhu_doc_id || '',
                lanhu_page_id: ctx.lanhu_page_id || ctx.page_id || '',
                lanhu_url: ctx.lanhu_url || '',
                page_name: pageName,
                case_count: caseCount,
                updated_at: '',
                is_current: true
            });
        }
        return items;
    }

    function fetchDesignedMindmapList() {
        return fetch('/api/test-cases/requirement-mindmaps/list', { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || !data.ok) throw new Error((data && data.error) || '加载思维导图列表失败');
                return mergeCurrentPageIntoMindmapExportList(
                    filterXmindExportItemsForActiveDoc(data.items || [])
                );
            });
    }

    function ensureExportXmindPickerMounted() {
        if (typeof global.ensureTcWorkbenchOverlaysMounted === 'function') {
            global.ensureTcWorkbenchOverlaysMounted();
        }
        var modal = $('tc-export-xmind-modal');
        if (modal && modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        return modal;
    }

    function closeTcExportXmindPickerModal() {
        var modal = $('tc-export-xmind-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('#tc-export-xmind-modal.flex')) {
            document.body.style.overflow = '';
        }
    }

    function getSelectedXmindExportItems() {
        var selected = [];
        (tcExportXmindPickerSelectionOrder || []).forEach(function (idx) {
            if (tcExportXmindPickerItems[idx]) selected.push(tcExportXmindPickerItems[idx]);
        });
        return selected;
    }

    function syncXmindExportOrderBadges() {
        var orderMap = {};
        (tcExportXmindPickerSelectionOrder || []).forEach(function (idx, order) {
            orderMap[idx] = order + 1;
        });
        document.querySelectorAll('#tc-export-xmind-list .tc-export-xmind-check').forEach(function (el) {
            var idx = parseInt(el.getAttribute('data-index'), 10);
            var badge = el.closest('.tc-export-xmind-item');
            if (!badge) return;
            var orderEl = badge.querySelector('.tc-export-xmind-item__order');
            if (!orderEl) return;
            var n = orderMap[idx];
            if (n) {
                orderEl.textContent = String(n);
                orderEl.classList.remove('hidden');
            } else {
                orderEl.textContent = '';
                orderEl.classList.add('hidden');
            }
        });
    }

    function updateTcExportXmindPickerSummary() {
        var summary = $('tc-export-xmind-summary');
        var submit = $('tc-export-xmind-submit');
        var selected = getSelectedXmindExportItems();
        var count = selected.length;
        var cases = 0;
        selected.forEach(function (item) {
            cases += parseInt(item.case_count, 10) || 0;
        });
        if (summary) {
            summary.textContent = count
                ? ('已选 ' + count + ' 个需求页，共约 ' + cases + ' 条导图用例（按勾选顺序导出）')
                : '请勾选需要导出的需求页';
        }
        if (submit) {
            submit.disabled = count === 0;
            submit.textContent = count > 1 ? '导出合并 XMind' : '导出 XMind';
        }
        syncXmindExportOrderBadges();
    }

    function onTcExportXmindCheckChange(ev) {
        var el = ev.target;
        var idx = parseInt(el.getAttribute('data-index'), 10);
        if (isNaN(idx)) return;
        if (el.checked) {
            if (tcExportXmindPickerSelectionOrder.indexOf(idx) < 0) {
                tcExportXmindPickerSelectionOrder.push(idx);
            }
        } else {
            tcExportXmindPickerSelectionOrder = tcExportXmindPickerSelectionOrder.filter(function (i) { return i !== idx; });
        }
        updateTcExportXmindPickerSummary();
    }

    function renderTcExportXmindPickerList(items) {
        tcExportXmindPickerItems = items || [];
        var listEl = $('tc-export-xmind-list');
        var emptyEl = $('tc-export-xmind-empty');
        var loadingEl = $('tc-export-xmind-loading');
        if (loadingEl) loadingEl.classList.add('hidden');
        if (!listEl) return;
        if (!items.length) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            updateTcExportXmindPickerSummary();
            return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');
        listEl.innerHTML = items.map(function (item, idx) {
            var name = String(item.page_name || item.requirement_id || '未命名需求').trim();
            var meta = (parseInt(item.case_count, 10) || 0) + ' 条导图用例';
            if (item.is_current) meta += ' · 当前页面';
            var pagePath = resolvePageFullPathForXmindExport(item);
            var pathHtml = pagePath
                ? ('<span class="tc-export-xmind-item__path" title="' + esc(pagePath) + '">' + esc(pagePath) + '</span>')
                : '';
            var checked = item.is_current || buildXmindExportKey(item) === tcExportXmindPickerCurrentKey;
            return '<label class="tc-export-xmind-item">' +
                '<input type="checkbox" class="tc-export-xmind-check" data-index="' + idx + '"' + (checked ? ' checked' : '') + '>' +
                '<span class="tc-export-xmind-item__order hidden" aria-hidden="true"></span>' +
                '<span class="tc-export-xmind-item__body">' +
                '<span class="tc-export-xmind-item__head">' +
                '<span class="tc-export-xmind-item__title">' + esc(name) + '</span>' +
                pathHtml +
                '</span>' +
                '<span class="tc-export-xmind-item__meta">' + esc(meta) + '</span>' +
                '</span></label>';
        }).join('');
        tcExportXmindPickerSelectionOrder = [];
        items.forEach(function (item, idx) {
            if (item.is_current || buildXmindExportKey(item) === tcExportXmindPickerCurrentKey) {
                tcExportXmindPickerSelectionOrder.push(idx);
            }
        });
        listEl.querySelectorAll('.tc-export-xmind-check').forEach(function (el) {
            el.addEventListener('change', onTcExportXmindCheckChange);
        });
        updateTcExportXmindPickerSummary();
    }

    function exportTcMindmapMultiToXmind(selectedItems) {
        var docName = resolveLanhuDocDisplayNameForXmindExport();
        return Promise.all(selectedItems.map(function (item) {
            return fetchMindmapPayloadForExportItem(item).then(function (payload) {
                return { item: item, payload: payload };
            });
        })).then(function (results) {
            var pageTopics = [];
            var errors = [];
            results.forEach(function (result) {
                var item = result.item;
                var payload = result.payload;
                if (!mindmapPayloadHasExportableContent(payload)) {
                    errors.push(resolvePageFullPathForXmindExport(item) + '：无可导出的导图用例');
                    return;
                }
                var mindRoot = buildMindRootNodeFromPayload(payload);
                var attached = mindRootChildrenToXmindTopics(mindRoot);
                if (!attached.length) {
                    errors.push(resolvePageFullPathForXmindExport(item) + '：导图结构为空');
                    return;
                }
                pageTopics.push({
                    id: 'page_' + String(item.lanhu_page_id || item.page_id || pageTopics.length),
                    title: resolvePageFullPathForXmindExport(item),
                    children: { attached: attached }
                });
            });
            if (!pageTopics.length) {
                throw new Error(errors.length ? errors.join('\n') : '没有可导出的导图用例');
            }
            var rootTopic = {
                id: 'doc_' + Date.now(),
                title: docName,
                children: { attached: pageTopics }
            };
            if (!downloadXmindBlob(rootTopic, docName.replace(/[\\/:*?"<>|]/g, '_'), docName)) {
                throw new Error('生成 XMind 文件失败');
            }
            if (typeof global.tcAppToast === 'function') {
                global.tcAppToast('已导出合并 XMind 文件（' + pageTopics.length + ' 个需求页）', {
                    variant: 'success',
                    duration: 3200
                });
            }
            if (errors.length && typeof global.tcAppToast === 'function') {
                global.tcAppToast('部分页面跳过：' + errors.join('；'), { variant: 'warning', duration: 5200 });
            }
        });
    }

    function syncBeforeXmindExport() {
        if (global.TcRequirementMindmapStore && typeof global.TcRequirementMindmapStore.persistNow === 'function') {
            return Promise.resolve(global.TcRequirementMindmapStore.persistNow('manual_edit', {})).catch(function () {});
        }
        return Promise.resolve();
    }

    function runExportForSelectedXmindPages(selectedItems) {
        if (!selectedItems.length) {
            if (typeof global.tcAppAlert === 'function') {
                global.tcAppAlert('请至少选择一个需求页。', { variant: 'info', title: '请选择需求页' });
            }
            return;
        }
        closeTcExportXmindPickerModal();
        syncBeforeXmindExport().then(function () {
            if (selectedItems.length === 1 && isCurrentMindmapExportItem(selectedItems[0])) {
                if (typeof global.exportTcMindmapToXmind === 'function') {
                    global.exportTcMindmapToXmind();
                    return;
                }
            }
            if (selectedItems.length === 1) {
                return fetchMindmapPayloadForExportItem(selectedItems[0]).then(function (payload) {
                    if (!mindmapPayloadHasExportableContent(payload)) {
                        throw new Error('该需求页暂无可导出的导图用例');
                    }
                    var mindRoot = buildMindRootNodeFromPayload(payload);
                    var rootTopic = typeof global.tcJsmindNodeToXmindZenTopic === 'function'
                        ? global.tcJsmindNodeToXmindZenTopic(mindRoot)
                        : (typeof global.tcJsmindNodeToXmindTopic === 'function' ? global.tcJsmindNodeToXmindTopic(mindRoot) : null);
                    if (!rootTopic) throw new Error('无法读取思维导图结构');
                    if (!downloadXmindBlob(rootTopic, '测试用例')) {
                        throw new Error('生成 XMind 文件失败');
                    }
                    if (typeof global.tcAppToast === 'function') {
                        global.tcAppToast('已导出 XMind 文件，可用 XMind / Zen 打开。', {
                            variant: 'success',
                            duration: 3200
                        });
                    }
                });
            }
            return exportTcMindmapMultiToXmind(selectedItems);
        }).catch(function (err) {
            if (typeof global.tcAppAlert === 'function') {
                global.tcAppAlert((err && err.message) || '导出失败', { variant: 'warning', title: '导出失败' });
            }
        });
    }

    function openTcExportXmindPickerModal() {
        if (typeof global.ensureTcTableTemplateApplied === 'function' && !global.ensureTcTableTemplateApplied()) {
            return;
        }
        var modal = ensureExportXmindPickerMounted();
        if (!modal) {
            if (typeof global.tcAppAlert === 'function') {
                global.tcAppAlert('导出弹窗未就绪，请刷新页面后重试。', { variant: 'warning', title: '导出失败' });
            }
            return;
        }
        var ctx = resolveCurrentMindmapExportContext();
        tcExportXmindPickerCurrentKey = ctx ? buildXmindExportKey(ctx) : '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        var loadingEl = $('tc-export-xmind-loading');
        var listEl = $('tc-export-xmind-list');
        var emptyEl = $('tc-export-xmind-empty');
        if (loadingEl) loadingEl.classList.remove('hidden');
        if (listEl) listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.add('hidden');
        fetchDesignedMindmapList()
            .then(renderTcExportXmindPickerList)
            .catch(function (err) {
                if (loadingEl) loadingEl.classList.add('hidden');
                if (typeof global.tcAppAlert === 'function') {
                    global.tcAppAlert((err && err.message) || '加载失败', { variant: 'warning', title: '导出失败' });
                }
                closeTcExportXmindPickerModal();
            });
    }

    function initTcExportXmindPickerUi() {
        if (global._tcExportXmindPickerInited) return;
        global._tcExportXmindPickerInited = true;
        $('tc-export-xmind-close') && $('tc-export-xmind-close').addEventListener('click', closeTcExportXmindPickerModal);
        $('tc-export-xmind-cancel') && $('tc-export-xmind-cancel').addEventListener('click', closeTcExportXmindPickerModal);
        $('tc-export-xmind-select-all') && $('tc-export-xmind-select-all').addEventListener('click', function () {
            tcExportXmindPickerSelectionOrder = tcExportXmindPickerItems.map(function (_, idx) { return idx; });
            document.querySelectorAll('.tc-export-xmind-check').forEach(function (el) { el.checked = true; });
            updateTcExportXmindPickerSummary();
        });
        $('tc-export-xmind-select-none') && $('tc-export-xmind-select-none').addEventListener('click', function () {
            tcExportXmindPickerSelectionOrder = [];
            document.querySelectorAll('.tc-export-xmind-check').forEach(function (el) { el.checked = false; });
            updateTcExportXmindPickerSummary();
        });
        $('tc-export-xmind-submit') && $('tc-export-xmind-submit').addEventListener('click', function () {
            runExportForSelectedXmindPages(getSelectedXmindExportItems());
        });
        $('tc-export-xmind-modal') && $('tc-export-xmind-modal').addEventListener('click', function (e) {
            if (e.target === $('tc-export-xmind-modal')) closeTcExportXmindPickerModal();
        });
    }

    initTcExportXmindPickerUi();
    global.openTcExportXmindPickerModal = openTcExportXmindPickerModal;
    global.exportTcMindmapMultiToXmind = exportTcMindmapMultiToXmind;
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- tc_wb_export_fab_mindmap_review.js ---- */
/**
 * 思维导图 Tab · 导出 FAB 评审按钮启用逻辑（与表格 Tab 隔离）
 * 当前需求文档下任意需求页的表格或思维导图有用例 → 用例评审/我的评审 可点
 */
(function tcWbExportFabMindmapReview(global) {
    'use strict';

    var _mindmapListByDoc = Object.create(null);
    var _mindmapListLoadedDocIds = Object.create(null);
    var _refreshScheduled = false;
    var _refreshPromise = null;

    function resolveActiveDocId() {
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            return String((global.getTcLanhuDocTreeMeta() || {}).docId || '').trim();
        }
        return '';
    }

    function countContentRows(rows) {
        if (!Array.isArray(rows) || !rows.length) return 0;
        var n = 0;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row && row.some(function (c) { return String(c || '').trim(); })) n++;
        }
        return n;
    }

    function currentPageMindmapHasCases() {
        if (typeof global.tcMindmapCaptureMindSnapshot === 'function') {
            try {
                var snap = global.tcMindmapCaptureMindSnapshot();
                if (snap && snap.data && Array.isArray(snap.data.children) && snap.data.children.length) return true;
            } catch (e0) { /* ignore */ }
        }
        if (typeof global.tcMindmapCasesData !== 'undefined' && global.tcMindmapCasesData) {
            return countContentRows(global.tcMindmapCasesData) > 0;
        }
        return false;
    }

    function currentPageTableHasCases() {
        if (typeof global.tcCountTableCaseContentRows === 'function') {
            return global.tcCountTableCaseContentRows() > 0;
        }
        return false;
    }

    function docHasDesignedTableCases(docId) {
        if (currentPageTableHasCases()) return true;
        if (!docId || !global.TcLanhuTreeCaseStatus || typeof global.TcLanhuTreeCaseStatus.getSummary !== 'function') {
            return false;
        }
        var summary = global.TcLanhuTreeCaseStatus.getSummary(docId);
        return !!(summary && summary.designed > 0);
    }

    function mindmapListItemHasCases(item) {
        if (!item) return false;
        var cc = parseInt(item.case_count, 10);
        if (isNaN(cc)) cc = parseInt(item.row_count, 10);
        return (cc || 0) > 0;
    }

    function docHasDesignedMindmapCases(docId) {
        if (currentPageMindmapHasCases()) return true;
        if (!docId) return false;
        var items = _mindmapListByDoc[docId];
        if (!Array.isArray(items)) return false;
        for (var i = 0; i < items.length; i++) {
            if (mindmapListItemHasCases(items[i])) return true;
        }
        return false;
    }

    function tcExportFabMindmapReviewItemsEnabled() {
        var docId = resolveActiveDocId();
        if (!docId) {
            return currentPageTableHasCases() || currentPageMindmapHasCases();
        }
        return docHasDesignedTableCases(docId) || docHasDesignedMindmapCases(docId);
    }

    function applyMindmapListForDoc(docId, items) {
        docId = String(docId || '').trim();
        if (!docId) return;
        _mindmapListByDoc[docId] = (items || []).filter(function (item) {
            return String(item && item.lanhu_doc_id || '').trim() === docId;
        });
        _mindmapListLoadedDocIds[docId] = true;
    }

    function tcScheduleExportFabMindmapReviewStatusRefresh() {
        var docId = resolveActiveDocId();
        if (!docId) return;
        if (_refreshScheduled || _refreshPromise) return;

        var needTableLoad = global.TcLanhuTreeCaseStatus &&
            typeof global.TcLanhuTreeCaseStatus.loadForDoc === 'function';
        var needMindmapLoad = !_mindmapListLoadedDocIds[docId];
        if (!needTableLoad && !needMindmapLoad) return;

        _refreshScheduled = true;
        var tasks = [];
        if (needTableLoad) {
            tasks.push(global.TcLanhuTreeCaseStatus.loadForDoc(docId).catch(function () { return false; }));
        }
        if (needMindmapLoad) {
            tasks.push(
                fetch('/api/test-cases/requirement-mindmaps/list', { credentials: 'same-origin', cache: 'no-store' })
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        if (data && data.ok) applyMindmapListForDoc(docId, data.items || []);
                        else _mindmapListLoadedDocIds[docId] = true;
                        return true;
                    })
                    .catch(function () {
                        _mindmapListLoadedDocIds[docId] = true;
                        return false;
                    })
            );
        }

        _refreshPromise = Promise.all(tasks).finally(function () {
            _refreshScheduled = false;
            _refreshPromise = null;
            if (typeof global.syncTcExportFabSheetItemsChrome === 'function') {
                global.syncTcExportFabSheetItemsChrome(undefined, {
                    skipTreeStatusRefresh: true,
                    skipMindmapReviewRefresh: true
                });
            }
        });
    }

    global.tcExportFabMindmapReviewItemsEnabled = tcExportFabMindmapReviewItemsEnabled;
    global.tcScheduleExportFabMindmapReviewStatusRefresh = tcScheduleExportFabMindmapReviewStatusRefresh;
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- tc_wb_bootstrap.js ---- */
    /* ---------- 增强模块引导 ---------- */

    function fetchAuthStatus() {
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            return global.HfAuthNav.fetchMe();
        }
        return fetch('/api/auth/me', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .catch(function () { return { authenticated: false, user: null }; });
    }

    function syncAuthStatus() {
        return fetchAuthStatus().then(function (data) {
            state.loggedIn = !!(data && data.authenticated && data.user);
            return state.loggedIn;
        }).catch(function () {
            state.loggedIn = false;
            return false;
        });
    }

    function wrapLanhuSummary() {
        if (typeof global.fetchTcLanhuRequirementsSummary !== 'function' || global.fetchTcLanhuRequirementsSummary._tcEnhWrapped) return;
        var orig = global.fetchTcLanhuRequirementsSummary;
        global.fetchTcLanhuRequirementsSummary = function () {
            return orig.apply(this, arguments).then(function (summary) {
                if (summary) {
                    state.lastRequirements = String(summary).trim();
                    state.lastLanhuRequirements = String(summary).trim();
                    try {
                        global.dispatchEvent(new CustomEvent('tc-wb-requirements-updated'));
                    } catch (e) { /* ignore */ }
                }
                return summary;
            });
        };
        global.fetchTcLanhuRequirementsSummary._tcEnhWrapped = true;
    }

    function bindBatchBarButtons() {
        if (global._tcEnhBatchBarBtnsBound) return;
        global._tcEnhBatchBarBtnsBound = true;
        global._tcBatchBarBtnBound = global._tcBatchBarBtnBound || {};
        function once(id, handler) {
            if (global._tcBatchBarBtnBound[id]) return;
            var el = $(id);
            if (!el) return;
            global._tcBatchBarBtnBound[id] = true;
            el.addEventListener('click', handler);
        }
        once('tc-gen-batch-close-btn', function () {
            if (typeof global.tcHideGenBatchBar === 'function') global.tcHideGenBatchBar();
            onBatchClose();
        });
        once('tc-gen-batch-validate-btn', function () {
            ensureInit();
            runValidation(isValidateUseLlmEnabled());
        });
        once('tc-standalone-validate-btn', function () {
            ensureInit();
            runValidation(isValidateUseLlmEnabled());
        });
    }

    function bindUi() {
        bindBatchBarButtons();
        if (!window._tcExportProvenanceModalInited) {
            window._tcExportProvenanceModalInited = true;
            $('tc-export-provenance-cancel') && $('tc-export-provenance-cancel').addEventListener('click', function() {
                closeTcExportProvenanceModal({ action: 'cancel' });
            });
            $('tc-export-provenance-skip') && $('tc-export-provenance-skip').addEventListener('click', function() {
                closeTcExportProvenanceModal({ action: 'skip' });
            });
            $('tc-export-provenance-apply') && $('tc-export-provenance-apply').addEventListener('click', function() {
                var select = $('tc-export-provenance-col-select');
                var colIndex = select ? parseInt(select.value, 10) : NaN;
                closeTcExportProvenanceModal({ action: 'apply', colIndex: isNaN(colIndex) ? null : colIndex });
            });
            $('tc-export-provenance-modal') && $('tc-export-provenance-modal').addEventListener('click', function(e) {
                if (e.target === $('tc-export-provenance-modal')) closeTcExportProvenanceModal({ action: 'cancel' });
            });
        }
        $('tc-export-report-close') && $('tc-export-report-close').addEventListener('click', closeExportReportModal);
        $('tc-export-report-copy') && $('tc-export-report-copy').addEventListener('click', function () {
            copyExportReportSummary(lastExportReport).then(function () {
                toast('摘要已复制', { variant: 'success', duration: 2400 });
            }).catch(function () {
                toast('复制失败', { variant: 'warning', duration: 2600 });
            });
        });
        $('tc-export-report-modal') && $('tc-export-report-modal').addEventListener('click', function (e) {
            if (e.target === $('tc-export-report-modal')) closeExportReportModal();
        });
        var autoVal = $('tc-gen-auto-validate');
        var autoBtn = $('tc-gen-auto-validate-btn');
        resetGenAutoValidateToggleDefault();
        function paintValidateToggleBtn() {
            if (!autoBtn || !autoVal) return;
            var on = !!autoVal.checked;
            autoBtn.classList.remove('tc-gen-toggle-btn--locked');
            autoBtn.classList.toggle('tc-gen-toggle-btn--on', on);
            autoBtn.classList.toggle('tc-gen-toggle-btn--off', !on);
            autoBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        bindValidateGenButtonDelegation();
        bindValidateFloatPanel(VALIDATE_SCOPE_SINGLE);
        if (autoBtn && autoVal) {
            paintValidateToggleBtn();
        }
        if (autoVal) {
            autoVal.addEventListener('change', function () {
                paintValidateToggleBtn();
            });
        }
        bindGenOptionHelpTips();
    }


    function bindValidateGenButtonDelegation() {
        if (global._tcValidateGenBtnDelegate) return;
        global._tcValidateGenBtnDelegate = true;
        document.addEventListener('click', function (ev) {
            if (!document.querySelector('.tc-workbench-scope')) return;
            if (typeof global.isTcHubExcelTabActive === 'function' && global.isTcHubExcelTabActive()) return;
            var btn = ev.target && ev.target.closest ? ev.target.closest('#tc-gen-auto-validate-btn') : null;
            if (!btn) return;
            if (typeof global.TcAgentOrchestrator !== 'undefined' &&
                typeof global.TcAgentOrchestrator.isAgentModeEnabled === 'function' &&
                global.TcAgentOrchestrator.isAgentModeEnabled()) {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            ensureInit();
            var autoVal = $('tc-gen-auto-validate');
            if (!autoVal) return;
            autoVal.checked = !autoVal.checked;
            autoVal.dispatchEvent(new Event('change', { bubbles: true }));
        }, true);
    }

    function syncGenOptionHelpDataTips() {
        document.querySelectorAll('.tc-gen-option-help-wrap').forEach(function (wrap) {
            var store = wrap.querySelector('.tc-gen-option-hint-store');
            if (!store) return;
            var text = String(store.textContent || '').trim();
            if (text) wrap.setAttribute('data-tip', text);
        });
    }

    function bindGenOptionHelpTips() {
        document.querySelectorAll('.tc-gen-option-help-wrap').forEach(function (wrap) {
            if (wrap._tcHelpTipBound) return;
            wrap._tcHelpTipBound = true;
            var btn = wrap.querySelector('.tc-gen-option-help-btn');
            var store = wrap.querySelector('.tc-gen-option-hint-store');
            if (!btn || !store) return;

            var floatTip = document.createElement('div');
            floatTip.className = 'tc-gen-option-help-tip';
            floatTip.setAttribute('role', 'tooltip');
            floatTip.style.display = 'none';
            if (store.id) {
                floatTip.id = store.id + '-float';
                btn.setAttribute('aria-describedby', floatTip.id);
            }

            function getTipText() {
                var wrapTip = wrap.getAttribute('data-tip');
                if (wrapTip) return String(wrapTip).trim();
                return String(store.textContent || '').trim();
            }

            function syncWrapDataTip() {
                var text = String(store.textContent || '').trim();
                if (text) wrap.setAttribute('data-tip', text);
            }
            syncWrapDataTip();

            function placeTip() {
                syncWrapDataTip();
                floatTip.textContent = getTipText();
                if (!floatTip.parentElement) document.body.appendChild(floatTip);
                var tipZ = typeof tcWorkbenchModalZIndex === 'function' ? tcWorkbenchModalZIndex() + 1 : 10460;
                floatTip.style.setProperty('z-index', String(tipZ), 'important');
                floatTip.style.display = 'block';
                floatTip.style.visibility = 'hidden';
                floatTip.style.opacity = '0';
                floatTip.style.left = '-9999px';
                floatTip.style.top = '0';
                var width = floatTip.offsetWidth || floatTip.scrollWidth;
                var rect = btn.getBoundingClientRect();
                var left = rect.left + rect.width / 2 - width / 2;
                left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
                floatTip.style.left = left + 'px';
                floatTip.style.top = (rect.bottom + 6) + 'px';
            }

            function showTip() {
                if (!getTipText()) return;
                placeTip();
                floatTip.style.visibility = 'visible';
                floatTip.style.opacity = '1';
                floatTip.classList.add('tc-gen-option-help-tip--open');
            }

            function hideTip() {
                floatTip.classList.remove('tc-gen-option-help-tip--open');
                floatTip.style.display = 'none';
                floatTip.style.visibility = 'hidden';
                floatTip.style.opacity = '0';
                floatTip.style.left = '';
                floatTip.style.top = '';
            }

            wrap.addEventListener('mouseenter', showTip);
            wrap.addEventListener('mouseleave', hideTip);
            btn.addEventListener('mouseenter', showTip);
            btn.addEventListener('mouseleave', hideTip);
            btn.addEventListener('focus', showTip);
            btn.addEventListener('blur', hideTip);
            store.addEventListener('tc-hint-updated', syncWrapDataTip);
        });
    }

    function mountLanhuTooldeckControls() {
        bindGenOptionHelpTips();
        syncGenOptionHelpDataTips();
    }

    function mountBatchBar() {
        mountLanhuTooldeckControls();
        ['tc-validate-drawer-single',
            'tc-validate-float-reopen-btn-agent', 'tc-validate-drawer-agent',
            'tc-agent-drawer',
            'tc-validate-drawer-single'].forEach(function (id) {
            var el = $(id);
            if (el && el.parentElement !== document.body) document.body.appendChild(el);
        });
    }

    function ensureInit() {
        if (!state._inited) init();
    }

    function init() {
        if (state._inited) return;
        if (!document.querySelector('.tc-workbench-scope')) return;
        state._inited = true;
        mountBatchBar();
        bindUi();
        wrapLanhuSummary();
        if (typeof installQcWorkbenchInteractionLockHooks === 'function') {
            installQcWorkbenchInteractionLockHooks();
        }
        syncAuthStatus();
        if (!global._tcEnhAuthNavBound) {
            global._tcEnhAuthNavBound = true;
            global.addEventListener('hf-auth-nav-updated', function (ev) {
                var detail = ev && ev.detail ? ev.detail : {};
                state.loggedIn = !!(detail.authenticated && detail.user);
            });
        }
        if (!global._tcGenAutoValidatePageshowBound) {
            global._tcGenAutoValidatePageshowBound = true;
            global.addEventListener('pageshow', function (ev) {
                if (!document.querySelector('.tc-workbench-scope')) return;
                if (ev.persisted) resetGenAutoValidateToggleDefault();
            });
        }
    }


    global.TcWorkbenchEnhancements = {
        init: init,
        ensureInit: ensureInit,
        remountLanhuTooldeckControls: mountLanhuTooldeckControls,
        bindBatchBarButtons: bindBatchBarButtons,
        syncBatchStateFromCore: syncBatchStateFromCore,
        collectBatchRowsPayloadForValidation: collectBatchRowsPayloadForValidation,
        isValidateMindmapBatch: isValidateMindmapBatch,
        getValidateBatchSnapshot: getValidateBatchSnapshot,
        extendValidateBatchSnapshot: extendValidateBatchSnapshot,
        captureGenAutoValidateForTask: captureGenAutoValidateForTask,
        shouldRunSingleAutoValidateAfterGeneration: shouldRunSingleAutoValidateAfterGeneration,
        onGenerationSuccess: onGenerationSuccess,
        getLastRequirementsSummary: function () {
            return String(state.lastLanhuRequirements || state.lastRequirements || '').trim();
        },
        getCurrentBatchValidationKey: function () {
            return getCurrentBatchValidationKey(VALIDATE_SCOPE_SINGLE);
        },
        getArchivedBatchValidationKey: function () {
            return getArchivedBatchValidationKey(VALIDATE_SCOPE_SINGLE);
        },
        getCachedBatchValidation: getCachedBatchValidation,
        buildTurnScopedValidationKey: buildTurnScopedValidationKey,
        buildBatchValidationKey: buildBatchValidationKey,
        migrateValidationCacheToTurn: migrateValidationCacheToTurn,
        buildBatchMetaForTurnFlush: buildBatchMetaForTurnFlush,
        resolveTurnScopedValidationFallback: resolveTurnScopedValidationFallback,
        attachTurnIdToValidationCache: attachTurnIdToValidationCache,
        persistStaleValidationRun: persistStaleValidationRun,
        resolveTurnIdForPersist: resolveTurnIdForPersist,
        bindPersistTurnIdToSnapshot: bindPersistTurnIdToSnapshot,
        extractTurnIdFromScopedKey: extractTurnIdFromScopedKey,
        persistSessionValidationBeforeLeave: persistSessionValidationBeforeLeave,
        hydrateSessionValidationFromTurns: hydrateSessionValidationFromTurns,
        setLastRequirements: function (text) {
            var val = String(text || '').trim();
            state.lastRequirements = val;
            state.lastLanhuRequirements = val;
        },
        runValidation: runValidation,
        runStandaloneQualityCheck: runStandaloneQualityCheck,
        hasStandaloneQualityCheckDrawerSession: hasStandaloneQualityCheckDrawerSession,
        clearStaleStandaloneQualityCheckSessionIfNeeded: clearStaleStandaloneQualityCheckSessionIfNeeded,
        isStandaloneQualityCheckButtonBusy: isStandaloneQualityCheckButtonBusy,
        getStandaloneQualityCheckBusyMessage: getStandaloneQualityCheckBusyMessage,
        isCaseGenerationInteractionBusy: isCaseGenerationInteractionBusy,
        getQcWorkbenchInteractionLockTitle: getQcWorkbenchInteractionLockTitle,
        handleStandaloneQualityCheckButtonClick: handleStandaloneQualityCheckButtonClick,
        tryToggleStandaloneQualityCheckDrawer: tryToggleStandaloneQualityCheckDrawer,
        openStandaloneQualityCheckDrawer: openStandaloneQualityCheckDrawer,
        isSingleGenValidationInProgress: isSingleGenValidationInProgress,
        applyAgentValidationFromJob: applyAgentValidationFromJob,
        applyAgentValidationFromJobInPlace: applyAgentValidationFromJobInPlace,
        ensureValidateCleanPassUiAfterFill: ensureValidateCleanPassUiAfterFill,
        ensureValidateCleanPassUiAfterOverDelete: ensureValidateCleanPassUiAfterOverDelete,
        refreshValidationIssuesView: refreshValidationIssuesView,
        ensureRequirementsForValidation: ensureRequirementsForValidation,
        ensureRequirementsForSingleLlmValidation: ensureRequirementsForSingleLlmValidation,
        highlightValidateRow: highlightValidateRow,
        resolveTurnIdForValidation: resolveTurnIdForValidation,
        isValidateViewingLatestSessionTurn: isValidateViewingLatestSessionTurn,
        resolveTurnIdForPersistCache: resolveTurnIdForPersistCache,
        flushPendingValidationForTurn: flushPendingValidationForTurn,
        queuePendingValidationFlush: queuePendingValidationFlush,
        openValidateDrawer: openValidateDrawer,
        toggleValidateDrawer: toggleValidateDrawer,
        isValidateDrawerOpen: isValidateDrawerOpen,
        syncValidateDrawerTabsChromeDuringQcRun: syncValidateDrawerTabsChromeDuringQcRun,
        syncValidateDrawerSummary: syncValidateDrawerSummary,
        bringFloatPanelToFront: bringTcFloatPanelToFront,
        abortPendingValidation: abortPendingValidation,
        resetValidateTaskState: resetValidateTaskState,
        getFloatPanelStackZIndex: getFloatPanelStackZIndex,
        ensureValidateDrawerCoverageSize: ensureValidateDrawerCoverageSize,
        restoreValidateSingleSideLayoutAfterCoverageTab: restoreValidateSingleSideLayoutAfterCoverageTab,
        closeValidateDrawer: closeValidateDrawer,
        syncValidateReopenButtonsLayout: syncValidateReopenButtonsLayout,
        collapseValidateDrawerBeforeAgentPlanningOpen: collapseValidateDrawerBeforeAgentPlanningOpen,
        openExportReportModal: openExportReportModal,
        shouldHideValidateDetailForSkippedNoLanhu: shouldHideValidateDetailForSkippedNoLanhu,
        shouldSuppressValidateUiForSkippedNoLanhu: shouldSuppressValidateUiForSkippedNoLanhu,
        validationHasActionableResults: validationHasActionableResults,
        TcQcPageSession: {
            clearOnWorkbenchLeave: clearQcPageSessionOnWorkbenchLeave,
            onPageSwitch: swapQcPageSessionOnPageSwitch,
            registerOnComplete: registerQcPageSessionOnComplete,
            syncReopenOnViewSwitch: syncValidateReopenBtnOnRightViewTabSwitch
        },
        patchLastValidationOverGeneratedForMatrix: patchLastValidationOverGeneratedForMatrix,
        remapLastValidationOverRowIndexesAfterDeletes: remapLastValidationOverRowIndexesAfterDeletes,
        getLastValidation: function (scope) {
            var vData = vScopeData(normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE));
            return vData.lastValidation ? JSON.parse(JSON.stringify(vData.lastValidation)) : null;
        },
        getLastExportReport: function () { return lastExportReport; }
    };

    function bootTcEnhancements() {
        bindTcFloatPanelStack();
        if (!document.querySelector('.tc-workbench-scope')) return;
        init();
    }
    bindTcFloatPanelStack();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootTcEnhancements);
    } else {
        bootTcEnhancements();
    }
})(window);


