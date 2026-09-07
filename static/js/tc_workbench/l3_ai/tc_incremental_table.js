/**
 * TestHub — 表格增量追加行（流式生成 → VxeTable 同步）
 */
(function (global) {
    'use strict';

    function scrollTableToBottom() {
        var panel = document.getElementById('tc-vxe-table-view-panel') || document.getElementById('tc-table-list-panel');
        if (!panel) return;
        try { panel.scrollTop = panel.scrollHeight; } catch (e) { /* ignore */ }
    }

    function appendParsedRowsIncremental(rows, opts) {
        opts = opts || {};
        if (!rows || !rows.length) return 0;
        if (!tcTableTemplateApplied || !tableColumns.length) {
            if (!ensureTcTableTemplateApplied()) return 0;
        }
        if (typeof initColumnState === 'function') initColumnState();
        var streaming = !!opts.streaming;
        var writeOpts = {
            mergeMode: opts.mergeMode || 'overwrite',
            appendOnly: opts.appendOnly === true,
            provenance: opts.provenance || null
        };
        var result = typeof tcWriteParsedRowsToTable === 'function'
            ? tcWriteParsedRowsToTable(rows, writeOpts)
            : null;
        var added = result ? result.added : 0;
        var startIndex = result && result.startIndex >= 0 ? result.startIndex : testCasesData.length;
        if (added > 0) {
            if (window.TcRequirementCaseStore &&
                typeof window.TcRequirementCaseStore.mergeGenerationPersistRows === 'function') {
                window.TcRequirementCaseStore.mergeGenerationPersistRows(rows);
            }
            if (typeof global.tcAppendValidationParsedRows === 'function') {
                var prevSessionAdded = (global.TcGenerationStreamClient &&
                    typeof global.TcGenerationStreamClient.getSessionRowsAdded === 'function')
                    ? global.TcGenerationStreamClient.getSessionRowsAdded() : 0;
                global.tcAppendValidationParsedRows(rows, tableColumns, {
                    replace: writeOpts.mergeMode !== 'append' && prevSessionAdded === 0,
                    tableRowIndices: result && result.writtenIndices ? result.writtenIndices : null
                });
            }
            var usedServerProv = opts.provenance && opts.provenance.length;
            if (usedServerProv && typeof tcApplyServerProvenanceToRows === 'function') {
                tcApplyServerProvenanceToRows(startIndex, opts.provenance.slice(0, added));
            } else if (streaming && typeof tcFinalizeGenerationProvenanceForRows === 'function') {
                tcFinalizeGenerationProvenanceForRows(
                    startIndex,
                    added,
                    typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset'
                );
            }
            if (global.TcTableView && typeof global.TcTableView.syncFromData === 'function') {
                global.TcTableView.syncFromData({ reload: false, immediate: streaming });
            } else if (typeof renderTableBody === 'function') {
                renderTableBody();
            }
            if (typeof syncTcProvenanceRail === 'function') syncTcProvenanceRail();
            if (!streaming && typeof tcTableRecordAfterMutation === 'function') tcTableRecordAfterMutation();
            if (opts.autoScroll && !global._tcStreamScrollPaused) scrollTableToBottom();
        }
        return added;
    }

    function bindStreamScrollPause() {
        if (global._tcStreamScrollBound) return;
        var panel = document.getElementById('tc-vxe-table-view-panel') || document.getElementById('tc-table-list-panel');
        if (!panel) return;
        global._tcStreamScrollBound = true;
        panel.addEventListener('wheel', function () {
            global._tcStreamScrollPaused = true;
        }, { passive: true });
        panel.addEventListener('scroll', function () {
            global._tcStreamScrollPaused = true;
        }, { passive: true, capture: true });
    }

    function resetStreamScrollPause() {
        global._tcStreamScrollPaused = false;
    }

    function syncTableDomAfterStream() {
        if (global.tcAiTableToMindmapConverting) return;
        if (typeof switchTcRightView === 'function') switchTcRightView('table');
        if (typeof renderTableBody === 'function') renderTableBody({ reload: true });
        if (typeof syncTcTableTemplateChrome === 'function') syncTcTableTemplateChrome();
        if (typeof syncTcProvenanceRail === 'function') syncTcProvenanceRail();
    }

    function finalizeStreamingRows() {
        syncTableDomAfterStream();
        if (typeof tcTableRecordAfterMutation === 'function') tcTableRecordAfterMutation();
    }

    global.appendParsedRowsIncremental = appendParsedRowsIncremental;
    global.finalizeStreamingRows = finalizeStreamingRows;
    global.syncTableDomAfterStream = syncTableDomAfterStream;
    global.bindTcStreamScrollPause = bindStreamScrollPause;
    global.resetTcStreamScrollPause = resetStreamScrollPause;
    global.TcIncrementalTable = {
        append: appendParsedRowsIncremental,
        finalize: finalizeStreamingRows,
        bindScrollPause: bindStreamScrollPause,
        resetScrollPause: resetStreamScrollPause
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindStreamScrollPause);
    } else {
        bindStreamScrollPause();
    }
})(typeof window !== 'undefined' ? window : this);
