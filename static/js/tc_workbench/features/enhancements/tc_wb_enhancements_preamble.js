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

