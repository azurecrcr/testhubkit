/**
 * TestHub — 思维导图增量渲染（流式生成）
 */
(function (global) {
    'use strict';

    var _partialRendered = false;
    var _partialRenderRaf = null;
    var _partialRenderOpts = null;

    function normalizeMindmapRow(rawRow) {
        if (!Array.isArray(rawRow)) return null;
        if (typeof ensureTcMindmapGenerateColumns === 'function' && !ensureTcMindmapGenerateColumns()) {
            return null;
        }
        return tableColumns.map(function (_, idx) {
            var v = rawRow[idx];
            return v !== undefined && v !== null ? String(v) : '';
        });
    }

    function appendMindmapRowsIncremental(rows, opts) {
        opts = opts || {};
        if (!rows || !rows.length) return 0;
        if (typeof tcMindmapEnsureAppendBaselineIntact === 'function') {
            tcMindmapEnsureAppendBaselineIntact();
        }
        var added = 0;
        rows.forEach(function (rawRow) {
            var row = normalizeMindmapRow(rawRow);
            if (!row) return;
            tcMindmapCasesData.push(row);
            try {
                if (typeof tcMindmapCasesProvenance !== 'undefined') {
                    tcMindmapCasesProvenance.push(
                        typeof tcTakePendingProvenanceForNewRow === 'function'
                            ? tcTakePendingProvenanceForNewRow()
                            : null
                    );
                }
            } catch (e) { /* ignore */ }
            added++;
        });
        if (added > 0) {
            if (typeof global.tcAppendValidationParsedRows === 'function') {
                var prevSessionAdded = (global.TcGenerationStreamClient &&
                    typeof global.TcGenerationStreamClient.getSessionRowsAdded === 'function')
                    ? global.TcGenerationStreamClient.getSessionRowsAdded() : 0;
                var validationRows = [];
                rows.forEach(function (rawRow) {
                    var row = normalizeMindmapRow(rawRow);
                    if (row) validationRows.push(row);
                });
                if (validationRows.length) {
                    global.tcAppendValidationParsedRows(validationRows, typeof tableColumns !== 'undefined' ? tableColumns : null, {
                        replace: !(opts.mergeMode === 'append') && prevSessionAdded === 0
                    });
                }
            }
            try { tcEnsureMindmapProvenanceLength(); } catch (e2) { /* ignore */ }
            tcMindmapExternalMindData = null;
            tcMindmapCommittedExternalMind = null;
            window.tcMindmapExternalMindData = null;
            window.tcMindmapCommittedExternalMind = null;
            renderTcMindmapPartial(opts);
            if (typeof scheduleSyncTcMindmapProvenanceOverlay === 'function') scheduleSyncTcMindmapProvenanceOverlay();
        }
        return added;
    }

    function renderTcMindmapPartialNow(opts) {
        opts = opts || {};
        if (typeof switchTcRightView === 'function') switchTcRightView('mindmap');
        tcMindmapGenerating = false;
        if (typeof hideTcMindmapGenerating === 'function') hideTcMindmapGenerating();
        if (!_partialRendered) {
            _partialRendered = true;
        }
        if (typeof renderTcMindmap === 'function') {
            renderTcMindmap();
        }
        if (opts.autoFit && typeof tcMindmapFitToView === 'function') {
            try { tcMindmapFitToView(); } catch (e) { /* ignore */ }
        }
    }

    function renderTcMindmapPartial(opts) {
        _partialRenderOpts = opts || {};
        if (_partialRenderRaf) return;
        _partialRenderRaf = window.requestAnimationFrame(function () {
            _partialRenderRaf = null;
            var pendingOpts = _partialRenderOpts || {};
            _partialRenderOpts = null;
            renderTcMindmapPartialNow(pendingOpts);
        });
    }

    function finalizeStreamingMindmap() {
        _partialRendered = false;
        tcMindmapGenerating = false;
        if (typeof hideTcMindmapGenerating === 'function') hideTcMindmapGenerating();
        if (typeof tcMindmapEnsureAppendBaselineIntact === 'function') {
            tcMindmapEnsureAppendBaselineIntact();
        }
        tcMindmapExternalMindData = null;
        tcMindmapCommittedExternalMind = null;
        window.tcMindmapExternalMindData = null;
        window.tcMindmapCommittedExternalMind = null;
        if (typeof renderTcMindmap === 'function') renderTcMindmap();
        if (typeof tcMindmapCaptureUndoBaseline === 'function') tcMindmapCaptureUndoBaseline();
        if (typeof tcMindmapPersistCache === 'function') tcMindmapPersistCache();
    }

    /** 生成中断/取消时恢复导图区（清除 loading，保留已流式写入的部分用例） */
    function abortTcMindmapStreamingIfActive() {
        var loadingEl = typeof document !== 'undefined' ? document.getElementById('tc-mindmap-loading') : null;
        var loadingVisible = !!(loadingEl && !loadingEl.classList.contains('hidden'));
        if (typeof tcMindmapGenerating !== 'undefined' && !tcMindmapGenerating && !loadingVisible) return;
        finalizeStreamingMindmap();
    }

    function resetStreamingMindmapState() {
        _partialRendered = false;
    }

    global.appendMindmapRowsIncremental = appendMindmapRowsIncremental;
    global.renderTcMindmapPartial = renderTcMindmapPartial;
    global.finalizeStreamingMindmap = finalizeStreamingMindmap;
    global.abortTcMindmapStreamingIfActive = abortTcMindmapStreamingIfActive;
    global.resetStreamingMindmapState = resetStreamingMindmapState;
    global.TcIncrementalMindmap = {
        append: appendMindmapRowsIncremental,
        renderPartial: renderTcMindmapPartial,
        finalize: finalizeStreamingMindmap,
        abortIfActive: abortTcMindmapStreamingIfActive,
        reset: resetStreamingMindmapState
    };
})(typeof window !== 'undefined' ? window : this);
