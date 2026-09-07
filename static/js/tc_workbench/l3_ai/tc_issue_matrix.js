/**
 * 问题清单矩阵面板 — 质量检查浮窗 Tab2
 * 快速规划：仅展示问题清单（validation）同步的遗漏/过度项，不独立跑覆盖率 LLM。
 * Agent：可手动「跑问题清单矩阵」调用 /api/test-cases/coverage/analyze。
 */
(function (global) {
    'use strict';

    var COVERAGE_TIMEOUT_MS = 240000;
    var STATUS_LABELS = {
        covered: '已覆盖',
        partial: '部分覆盖',
        uncovered: '遗漏'
    };
    var TYPE_LABELS = {
        module: '模块',
        page: '页面',
        interaction: '交互',
        boundary: '边界',
        rule: '规则'
    };

    function createCoverageScopeState() {
        return {
            matrix: null,
            activeTab: 'issues',
            analyzing: false,
            filter: 'all',
            rowOffset: 0,
            pendingFillRefresh: false,
            fillProgressActive: false,
            fillProgressReturnTab: 'issues'
        };
    }

    var scopeStates = {
        single: createCoverageScopeState()
    };
    var _covScope = 'single';
    var _pendingCoverageFillScope = null;
    var _lanhuNavUnlockedAfterCoverageFillTerminal = false;

    function normalizeScope(scope) {
        return 'single';
    }

    function covState() {
        return scopeStates[_covScope];
    }

    function useCovScope(scope, fn) {
        var prev = _covScope;
        _covScope = normalizeScope(scope);
        try { return fn(); } finally { _covScope = prev; }
    }

    function $(id) { return document.getElementById(id + '-' + _covScope); }

    function globalEl(id) { return document.getElementById(id); }

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
        var text = String(msg || '');
        if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(text)) {
            return;
        }
        if (typeof global.tcAppAlert === 'function') global.tcAppAlert(msg, opts || { variant: 'warning', title: '提示' });
    }

    function getAiMode() {
        return typeof global.getAiConfigMode === 'function' ? global.getAiConfigMode() : 'preset';
    }

    function getLanhuCreds() {
        if (typeof global.getTcLanhuCredentialsForMode !== 'function') return { cookie: '', url: '' };
        return global.getTcLanhuCredentialsForMode(getAiMode());
    }

    function collectTablePayload() {
        if (typeof global.TcWorkbenchEnhancements !== 'undefined' &&
            typeof global.TcWorkbenchEnhancements.syncBatchStateFromCore === 'function') {
            global.TcWorkbenchEnhancements.syncBatchStateFromCore();
        }
        var cols = [];
        if (typeof tableColumns !== 'undefined' && tableColumns && tableColumns.length) {
            cols = tableColumns.slice().map(String);
        }
        if (typeof global.TcWorkbenchEnhancements !== 'undefined' &&
            typeof global.TcWorkbenchEnhancements.collectBatchRowsPayloadForValidation === 'function') {
            try {
                var batch = global.TcWorkbenchEnhancements.collectBatchRowsPayloadForValidation(_covScope || 'single');
                if (batch && batch.hasBatch) {
                    return {
                        columns: (batch.columns && batch.columns.length) ? batch.columns : cols,
                        rows: batch.rows || [],
                        rowOffset: batch.rowOffset || 0,
                        mindmapBatch: !!batch.mindmapBatch
                    };
                }
            } catch (eBatch) { /* ignore */ }
        }
        return { columns: cols, rows: [], rowOffset: 0, mindmapBatch: false };
    }

    function buildAnalyzeRequestBody(tablePayload) {
        var creds = getLanhuCreds();
        var requirements = '';
        if (global.TcWorkbenchEnhancements && typeof global.TcWorkbenchEnhancements.setLastRequirements === 'function') {
            /* read via ensureRequirements if available */
        }
        var promptEl = globalEl('ai-prompt');
        var userIntent = promptEl ? String(promptEl.value || '').trim() : '';
        var body = {
            columns: tablePayload.columns,
            rows: tablePayload.rows,
            user_intent: userIntent,
            lanhu_cookie: creds.cookie || '',
            lanhu_url: creds.url || '',
            use_builtin: getAiMode() === 'preset'
        };
        if (getAiMode() !== 'preset') {
            body.base_url = (globalEl('ai-base-url') || {}).value || '';
            body.api_key = (globalEl('ai-api-key') || {}).value || '';
            body.model = (globalEl('ai-model') || {}).value || '';
        }
        return body;
    }

    function fetchJsonWithTimeout(url, opts, timeoutMs) {
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = ctrl ? global.setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
        var fetchOpts = opts || {};
        if (ctrl) fetchOpts.signal = ctrl.signal;
        return fetch(url, fetchOpts).then(function (r) {
            return r.text().then(function (text) {
                var data = null;
                try {
                    data = text ? JSON.parse(text) : null;
                } catch (parseErr) {
                    var hint = (text && text.indexOf('<!doctype') !== -1) ? '服务返回异常页面' : '响应不是 JSON';
                    throw new Error(r.ok ? hint : ('HTTP ' + r.status + '：' + hint));
                }
                if (!r.ok) throw new Error((data && data.error) || r.statusText || '请求失败');
                return data;
            });
        }).finally(function () {
            if (timer) global.clearTimeout(timer);
        });
    }

    function ensureRequirementsForCoverage() {
        if (typeof global.TcWorkbenchEnhancements === 'undefined') return Promise.resolve('');
        var enh = global.TcWorkbenchEnhancements;
        if (typeof enh.ensureRequirementsForSingleLlmValidation === 'function') {
            return enh.ensureRequirementsForSingleLlmValidation();
        }
        if (typeof enh.ensureRequirementsForValidation === 'function') {
            return enh.ensureRequirementsForValidation();
        }
        return Promise.resolve('');
    }

    function setMatrix(matrix, rowOffset) {
        covState().matrix = matrix || null;
        if (rowOffset != null) covState().rowOffset = rowOffset;
        renderCoveragePanel();
        updateCoverageTabBadge();
    }

    function recomputeMatrixSummary() {
        var m = covState().matrix;
        if (!m) return;
        var points = m.points || [];
        var mappings = m.mappings || [];
        var byId = {};
        mappings.forEach(function (map) {
            byId[String(map.point_id)] = map.status;
        });
        var covered = 0;
        var partial = 0;
        var uncovered = 0;
        points.forEach(function (p) {
            var st = byId[String(p.id)] || 'uncovered';
            if (st === 'covered') covered += 1;
            else if (st === 'partial') partial += 1;
            else uncovered += 1;
        });
        var over = (m.over_generated_rows || []).length;
        var total = points.length;
        var rate = total ? Math.round((covered + 0.5 * partial) / total * 1000) / 10 : 0;
        m.summary = Object.assign({}, m.summary || {}, {
            total: total,
            covered: covered,
            partial: partial,
            uncovered: uncovered,
            over_generated: over,
            coverage_rate: rate
        });
    }



    function getMindmapRowCount() {
        if (typeof global.tcMindmapCasesData !== 'undefined' && global.tcMindmapCasesData) {
            return global.tcMindmapCasesData.length;
        }
        if (typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData) {
            return tcMindmapCasesData.length;
        }
        return 0;
    }

    function isCoverageMindmapBatch() {
        var enh = global.TcWorkbenchEnhancements;
        if (enh && typeof enh.isValidateMindmapBatch === 'function' && enh.isValidateMindmapBatch()) {
            return true;
        }
        if (!enh || typeof enh.collectBatchRowsPayloadForValidation !== 'function') return false;
        try {
            var batch = enh.collectBatchRowsPayloadForValidation(_covScope);
            return !!(batch && batch.mindmapBatch);
        } catch (e0) {
            return false;
        }
    }



    function coverageMatrixHasDisplayData(m) {
        if (!m) return false;
        return ((m.points || []).length > 0) || ((m.over_generated_rows || []).length > 0);
    }

    function mindmapValidationCoverageReady(m) {
        if (!m) return false;
        var overRows = (m.over_generated_rows || []).length;
        if (overRows > 0) return true;
        if (m.summary && (m.summary.over_generated || 0) > 0) return true;
        var points = m.points || [];
        for (var i = 0; i < points.length; i++) {
            if (String(points[i].id || '').indexOf('val_gap_') === 0) return true;
        }
        return !!covState().coverageFromValidation;
    }

    function getTableRowCount() {
        if (typeof global.testCasesData !== 'undefined' && global.testCasesData) {
            return global.testCasesData.length;
        }
        return 0;
    }

    function getValidationBatchRowCount() {
        var enh = global.TcWorkbenchEnhancements;
        if (!enh || typeof enh.collectBatchRowsPayloadForValidation !== 'function') return 0;
        try {
            var batch = enh.collectBatchRowsPayloadForValidation(_covScope);
            return batch && batch.hasBatch ? (batch.rows || []).length : 0;
        } catch (e0) {
            return 0;
        }
    }

    function resolveCoverageRowIndex(rowIndex) {
        var ri = parseInt(rowIndex, 10);
        if (isNaN(ri)) return null;
        if (isCoverageMindmapBatch()) {
            var mmCount = getMindmapRowCount();
            if (ri >= 0 && ri < mmCount) return ri;
            var mmBatchStart = getValidationBatchRowOffset();
            var mmBatchLen = getValidationBatchRowCount();
            if (mmBatchLen > 0 && ri >= 0 && ri < mmBatchLen) {
                var mmAbs = mmBatchStart + ri;
                if (mmAbs >= 0 && mmAbs < mmCount) return mmAbs;
            }
            return null;
        }
        var rowCount = getTableRowCount();
        if (ri >= 0 && ri < rowCount) return ri;
        var batchStart = getValidationBatchRowOffset();
        var batchLen = getValidationBatchRowCount();
        if (batchLen > 0 && ri >= 0 && ri < batchLen) {
            var abs = batchStart + ri;
            if (abs >= 0 && abs < rowCount) return abs;
        }
        return null;
    }

    function coverageRowDisplayNumber(rowIndex) {
        var abs = resolveCoverageRowIndex(rowIndex);
        return abs == null ? null : abs + 1;
    }

    function prepareForValidationRun() {
        resetValidationSyncMatrix();
        covState().coverageFromValidation = false;
        covState()._analyzePromise = null;
    }


    function resetFillUiBeforeStandaloneQc(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return useCovScope(scope, function () {
            if (isCoverageFillJobRunning()) return;
            covState().pendingFillRefresh = false;
            covState().fillProgressActive = false;
            var drawer = getValidateDrawerEl(scope);
            if (drawer) drawer.classList.remove('tc-validate-drawer--fill-active');
            hideFillProgressPanelOnly(scope);
            var fillInner = $('tc-validate-fill-progress-inner');
            if (fillInner) fillInner.innerHTML = '';
        });
    }

    function resetValidationSyncMatrix() {
        covState().matrix = {
            points: [],
            mappings: [],
            over_generated_rows: [],
            summary: {
                total: 0,
                covered: 0,
                partial: 0,
                uncovered: 0,
                over_generated: 0,
                coverage_rate: 0
            }
        };
        covState().rowOffset = 0;
    }

    function getStoredValidation(scope) {
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.getLastValidation === 'function') {
            return global.TcWorkbenchEnhancements.getLastValidation(scope || _covScope);
        }
        return null;
    }

    function computeValidationIssueTotals(stored) {
        if (!stored) return { format: 0, over: 0, gap: 0, total: 0 };
        var format = stored.format_count != null
            ? stored.format_count
            : (stored.issues || []).length;
        var over = stored.over_generated_count != null
            ? stored.over_generated_count
            : (stored.over_generated_issues || []).length;
        var gap = stored.gap_count != null
            ? stored.gap_count
            : (stored.gap_issues || []).length;
        return {
            format: format || 0,
            over: over || 0,
            gap: gap || 0,
            total: (format || 0) + (over || 0) + (gap || 0)
        };
    }

    function updateValidationTabBadges(stored) {
        stored = stored || getStoredValidation(_covScope);
        var totals = computeValidationIssueTotals(stored);
        var issuesTab = $('tc-validate-tab-issues');
        var covTab = $('tc-validate-tab-coverage');
        if (issuesTab) {
            issuesTab.textContent = totals.total > 0 ? ('问题清单 ' + totals.total) : '问题清单';
        }
        if (!covTab) return;
        if (covState().coverageFromValidation) {
            covTab.textContent = totals.total > 0 ? ('问题清单矩阵 ' + totals.total) : '问题清单矩阵';
            return;
        }
        updateCoverageTabBadge();
    }

    function syncValidationMatrixFromStored(stored, scope) {
        stored = stored || getStoredValidation(scope);
        if (!stored) return;
        scope = normalizeScope(scope || _covScope);
        return useCovScope(scope, function () {
            resetValidationSyncMatrix();
            var gapIssues = stored.gap_issues || [];
            var overIssues = stored.over_generated_issues || [];
            if (gapIssues.length) mergeGapIssuesToUncovered(gapIssues, true);
            if (overIssues.length) mergeOverGeneratedIssues(overIssues, true);
            covState().coverageFromValidation = true;
            recomputeMatrixSummary();
            updateValidationTabBadges(stored);
            if (covState().activeTab === 'coverage') renderCoveragePanel();
        });
    }

    function getValidationBatchRowOffset() {
        var enh = global.TcWorkbenchEnhancements;
        if (!enh || typeof enh.collectBatchRowsPayloadForValidation !== 'function') return 0;
        try {
            var batch = enh.collectBatchRowsPayloadForValidation(_covScope);
            return batch && batch.hasBatch ? (batch.rowOffset || 0) : 0;
        } catch (e0) {
            return 0;
        }
    }

    function normalizeValidationRowIndex(rowIndex, batchStart) {
        var ri = parseInt(rowIndex, 10);
        if (isNaN(ri)) return ri;
        if (batchStart > 0 && ri >= batchStart) return ri - batchStart;
        return ri;
    }

    function ensureMatrixForValidationSync() {
        if (covState().matrix) return;
        covState().matrix = {
            points: [],
            mappings: [],
            over_generated_rows: [],
            summary: {
                total: 0,
                covered: 0,
                partial: 0,
                uncovered: 0,
                over_generated: 0,
                coverage_rate: 0
            }
        };
    }

    function gapIssueKeywords(message) {
        return String(message || '')
            .replace(/^(可能遗漏|需求(中|里)?(的|明显有)?|缺少|未覆盖)[:：]?\s*/g, '')
            .replace(/(功能(点)?|模块|场景).*(无用例|未覆盖|缺少用例).*$/g, '')
            .trim();
    }

    function scorePointMatch(point, keywords) {
        if (!point || !keywords || keywords.length < 2) return 0;
        var hay = ((point.title || '') + ' ' + (point.path || '') + ' ' + (point.description || '')).toLowerCase();
        var kw = keywords.toLowerCase();
        var title = String(point.title || '').toLowerCase();
        if (title && (kw.indexOf(title) >= 0 || hay.indexOf(kw) >= 0)) return 100 + kw.length;
        var tokens = kw.split(/[\s，,、/\\>·]+/).filter(function (t) { return t.length >= 2; });
        var hits = 0;
        tokens.forEach(function (t) {
            if (hay.indexOf(t) >= 0) hits += 1;
        });
        return hits;
    }

    function upsertMappingUncovered(pointId, msg, mappings, rowIndex) {
        var found = null;
        for (var i = 0; i < mappings.length; i++) {
            if (String(mappings[i].point_id) === String(pointId)) {
                found = mappings[i];
                break;
            }
        }
        var rows = [];
        if (rowIndex != null) {
            var ri = parseInt(rowIndex, 10);
            if (!isNaN(ri)) rows = [ri];
        }
        if (found) {
            found.status = 'uncovered';
            found.evidence = msg;
            found._fromValidationGap = true;
            found.row_indices = rows;
        } else {
            mappings.push({
                point_id: pointId,
                row_indices: rows,
                status: 'uncovered',
                confidence: 0.6,
                evidence: msg,
                _fromValidationGap: true
            });
        }
    }

    function mergeGapIssuesToUncovered(issues, skipBadgeRefresh) {
        if (!issues || !issues.length) return;
        ensureMatrixForValidationSync();
        var points = covState().matrix.points = covState().matrix.points || [];
        var mappings = covState().matrix.mappings = covState().matrix.mappings || [];
        var gapKeys = {};
        points.forEach(function (p) {
            if (p._validationGapKey) gapKeys[p._validationGapKey] = p.id;
        });

        issues.forEach(function (issue, idx) {
            if (!issue || issue.type !== 'gap') return;
            var msg = String(issue.message || '').trim();
            if (!msg) return;
            var key = msg.toLowerCase();
            if (gapKeys[key]) {
                upsertMappingUncovered(gapKeys[key], msg, mappings, issue.row_index);
                return;
            }
            var keywords = gapIssueKeywords(msg);
            var bestPoint = null;
            var bestScore = 0;
            points.forEach(function (p) {
                if (String(p.id).indexOf('val_gap_') === 0) return;
                var sc = scorePointMatch(p, keywords || msg);
                if (sc > bestScore) {
                    bestScore = sc;
                    bestPoint = p;
                }
            });
            if (bestPoint && bestScore >= 2) {
                upsertMappingUncovered(bestPoint.id, msg, mappings, issue.row_index);
                gapKeys[key] = bestPoint.id;
                return;
            }
            var pid = 'val_gap_' + (idx + 1);
            var seq = 1;
            while (points.some(function (p) { return p.id === pid; })) {
                pid = 'val_gap_' + (idx + 1) + '_' + (seq++);
            }
            points.push({
                id: pid,
                type: 'interaction',
                path: '质量检查·遗漏',
                title: (keywords || msg).slice(0, 80),
                description: msg,
                priority: 'P1',
                _validationGapKey: key
            });
            gapKeys[key] = pid;
            mappings.push({
                point_id: pid,
                row_indices: issue.row_index != null && !isNaN(parseInt(issue.row_index, 10))
                    ? [parseInt(issue.row_index, 10)] : [],
                status: 'uncovered',
                confidence: 0.6,
                evidence: msg,
                _fromValidationGap: true
            });
        });

        recomputeMatrixSummary();
        if (!skipBadgeRefresh) {
            updateValidationTabBadges(getStoredValidation(_covScope));
            renderCoverageToolbar();
            if (covState().activeTab === 'coverage') renderCoveragePanel();
        }
    }

    function makeOverGeneratedRowKey(item) {
        var ri = item && item.row_index != null ? String(item.row_index) : 'none';
        return ri + '\0' + String((item && item.message) || '');
    }

    function resolveOverGeneratedRowIndex(issue) {
        if (!issue || issue.row_index == null) return null;
        var absRi = resolveCoverageRowIndex(issue.row_index);
        if (absRi != null) return absRi;
        var riRaw = parseInt(issue.row_index, 10);
        if (isNaN(riRaw) || riRaw < 0) return null;
        if (isCoverageMindmapBatch()) {
            return riRaw < getMindmapRowCount() ? riRaw : null;
        }
        return riRaw < getTableRowCount() ? riRaw : null;
    }

    function mergeOverGeneratedIssues(issues, replaceExisting, skipBadgeRefresh) {
        if (!issues || !issues.length) return;
        ensureMatrixForValidationSync();
        covState().rowOffset = 0;
        var rows = replaceExisting !== false ? [] : (covState().matrix.over_generated_rows || []).slice();
        var seen = {};
        rows.forEach(function (item) {
            seen[makeOverGeneratedRowKey(item)] = true;
        });
        issues.forEach(function (issue) {
            if (!issue) return;
            var msg = String(issue.message || '需求未提及相关内容').trim();
            var absRi = resolveOverGeneratedRowIndex(issue);
            var item = {
                row_index: absRi,
                message: msg,
                row_fingerprint: absRi != null ? buildMatrixRowFingerprint(absRi) : '',
                type: (issue && issue.type) || 'hallucination'
            };
            var key = makeOverGeneratedRowKey(item);
            if (seen[key]) return;
            seen[key] = true;
            rows.push(item);
        });
        covState().matrix.over_generated_rows = rows;
        recomputeMatrixSummary();
        if (!skipBadgeRefresh) {
            updateValidationTabBadges(getStoredValidation(_covScope));
            renderCoverageToolbar();
            if (covState().activeTab === 'coverage') renderCoveragePanel();
        }
    }

    function updateCoverageTabBadge() {
        var tab = $('tc-validate-tab-coverage');
        if (!tab) return;
        if (covState().coverageFromValidation) {
            updateValidationTabBadges(getStoredValidation(_covScope));
            return;
        }
        var summary = covState().matrix && covState().matrix.summary;
        if (summary && summary.total) {
            tab.textContent = '问题清单矩阵 ' + summary.coverage_rate + '%';
        } else {
            tab.textContent = '问题清单矩阵';
        }
    }

    function switchValidateTab(tabId) {
        if (shouldHideValidateDrawerTabsDuringFillPresentation(_covScope)) {
            return;
        }
        var active = tabId === 'coverage' ? 'coverage' : 'issues';
        covState().activeTab = active;
        var issuesTab = $('tc-validate-tab-issues');
        var covTab = $('tc-validate-tab-coverage');
        var issueList = $('tc-validate-issue-list');
        var covPanel = $('tc-validate-coverage-panel');
        var isCoverage = active === 'coverage';
        var isIssues = active === 'issues';

        if (issuesTab) {
            issuesTab.classList.toggle('tc-validate-tab--active', isIssues);
            issuesTab.setAttribute('aria-selected', isIssues ? 'true' : 'false');
        }
        if (covTab) {
            covTab.classList.toggle('tc-validate-tab--active', isCoverage);
            covTab.setAttribute('aria-selected', isCoverage ? 'true' : 'false');
        }
        if (issueList) issueList.classList.toggle('hidden', !isIssues);
        if (covPanel) {
            covPanel.classList.toggle('hidden', !isCoverage);
            covPanel.setAttribute('aria-hidden', isCoverage ? 'false' : 'true');
        }
        var fillPanel = getValidateDrawerFillProgressEl(_covScope);
        if (fillPanel) {
            if (!covState().fillProgressActive) {
                fillPanel.classList.add('hidden');
                fillPanel.setAttribute('aria-hidden', 'true');
                var fillInner = getValidateDrawerFillProgressInnerEl(_covScope);
                if (fillInner) fillInner.innerHTML = '';
            }
        }
        var drawer = $('tc-validate-drawer');
        if (drawer) drawer.classList.toggle('tc-validate-drawer--coverage', isCoverage);
        if (isCoverage) {
            if (global.TcWorkbenchEnhancements &&
                typeof global.TcWorkbenchEnhancements.getLastValidation === 'function') {
                var storedVal = global.TcWorkbenchEnhancements.getLastValidation(_covScope);
                if (storedVal && !coverageMatrixHasDisplayData(covState().matrix)) {
                    syncValidationMatrixFromStored(storedVal, _covScope);
                } else if (storedVal) {
                    /* 矩阵已有数据时也对齐过度行号，避免删行后切 Tab 仍显示旧序号 */
                    alignMatrixOverGeneratedFromValidation(storedVal, { render: false });
                }
            }
            renderCoveragePanel();
        } else {
            if (global.TcWorkbenchEnhancements &&
                typeof global.TcWorkbenchEnhancements.restoreValidateSingleSideLayoutAfterCoverageTab === 'function') {
                global.TcWorkbenchEnhancements.restoreValidateSingleSideLayoutAfterCoverageTab(_covScope);
            }
            if (global.TcWorkbenchEnhancements &&
                typeof global.TcWorkbenchEnhancements.refreshValidationIssuesView === 'function') {
                global.TcWorkbenchEnhancements.refreshValidationIssuesView(_covScope);
            }
        }
    }

    function openCoverageTab(scope) {
        scope = normalizeScope(scope || _covScope);
        if (global.TcWorkbenchEnhancements && typeof global.TcWorkbenchEnhancements.openValidateDrawer === 'function') {
            global.TcWorkbenchEnhancements.openValidateDrawer({ center: true, scope: scope });
        }
        useCovScope(scope, function () { switchValidateTab('coverage'); });
    }

    function formatCoverageRowRefText(text, rowIndices) {
        if (!text) return '';
        var s = String(text);
        var unique = [];
        (rowIndices || []).forEach(function (ri) {
            var n = parseInt(ri, 10);
            if (isNaN(n) || unique.indexOf(n) >= 0) return;
            unique.push(n);
        });
        unique.sort(function (a, b) { return b - a; });
        unique.forEach(function (n) {
            var displayNum = coverageRowDisplayNumber(n);
            if (displayNum == null) return;
            var display = displayNum;
            s = s.replace(new RegExp('用例\\s*' + n + '(?!\\d)', 'g'), '用例' + display);
            s = s.replace(new RegExp('第\\s*' + n + '\\s*行', 'g'), '第' + display + '行');
        });
        return s;
    }

    var COVERAGE_REQ_BTN_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"></circle></svg>';
    var covReqTipEl = null;

    function ensureCoverageReqTipEl() {
        if (covReqTipEl && document.body.contains(covReqTipEl)) return covReqTipEl;
        covReqTipEl = document.createElement('div');
        covReqTipEl.id = 'tc-coverage-req-tip';
        covReqTipEl.className = 'tc-coverage-req-tip hidden';
        covReqTipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(covReqTipEl);
        return covReqTipEl;
    }

    function hideCoverageReqTip() {
        var tip = ensureCoverageReqTipEl();
        tip.classList.add('hidden');
    }

    function formatCoverageReqTooltip(point, rowIndices, fallbackText) {
        var lines = ['相关需求：'];
        if (point) {
            if (point.title) lines.push('- ' + String(point.title));
            if (point.path) lines.push('  路径：' + String(point.path));
            if (point.description) lines.push('  ' + String(point.description));
        } else if (fallbackText) {
            lines.push('- ' + String(fallbackText));
        }
        (rowIndices || []).forEach(function (ri) {
            var tableIdx = resolveCoverageRowIndex(ri);
            if (tableIdx == null) return;
            if (typeof global.testCasesProvenance === 'undefined' || !global.testCasesProvenance[tableIdx]) return;
            var entry = global.testCasesProvenance[tableIdx];
            if (typeof global.tcFormatProvenanceTooltip === 'function') {
                var provText = global.tcFormatProvenanceTooltip(entry);
                if (provText) {
                    lines.push('');
                    lines.push(provText.replace(/^来源：/, '生成来源：'));
                }
            }
        });
        return lines.join('\n').replace(/\r/g, '');
    }

    function showCoverageReqTip(btn, tooltipText) {
        if (!tooltipText) return;
        var tip = ensureCoverageReqTipEl();
        tip.textContent = tooltipText;
        tip.classList.remove('hidden');
        tip.style.left = '-9999px';
        tip.style.top = '-9999px';
        var btnRect = btn.getBoundingClientRect();
        var tipW = tip.offsetWidth;
        var tipH = tip.offsetHeight;
        var left = btnRect.left - tipW - 8;
        if (left < 8) left = Math.min(btnRect.right + 8, window.innerWidth - tipW - 8);
        var top = btnRect.top + btnRect.height / 2 - tipH / 2;
        top = Math.max(8, Math.min(top, window.innerHeight - tipH - 8));
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
    }

    function buildCoverageReqBtn(pointId, rowIndices, fallbackText) {
        return '<button type="button" class="tc-coverage-req-btn" aria-label="查看相关需求"' +
            (pointId ? ' data-point-id="' + esc(pointId) + '"' : '') +
            ' data-row-indices="' + esc((rowIndices || []).join(',')) + '"' +
            (fallbackText ? ' data-req-fallback="' + esc(fallbackText) + '"' : '') +
            '>' + COVERAGE_REQ_BTN_SVG + '</button>';
    }

    function buildCoverageRowsCell(point, rowIndices, rowBtnsHtml) {
        if (!rowBtnsHtml) return '<span class="text-slate-400">—</span>';
        return '<span class="tc-coverage-rows-wrap">' + rowBtnsHtml + '</span>';
    }

    function resolveCoverageReqPoint(pointId) {
        if (!pointId || !covState().matrix || !covState().matrix.points) return null;
        for (var i = 0; i < covState().matrix.points.length; i++) {
            if (String(covState().matrix.points[i].id) === String(pointId)) return covState().matrix.points[i];
        }
        return null;
    }

    function bindCoverageReqButtons(list) {
        if (!list) return;
        list.querySelectorAll('.tc-coverage-req-btn').forEach(function (btn) {
            function showTip() {
                var rows = (btn.getAttribute('data-row-indices') || '').split(',').filter(function (v) {
                    return v !== '';
                }).map(function (v) { return parseInt(v, 10); }).filter(function (n) { return !isNaN(n); });
                var point = resolveCoverageReqPoint(btn.getAttribute('data-point-id'));
                var fallback = btn.getAttribute('data-req-fallback') || '';
                showCoverageReqTip(btn, formatCoverageReqTooltip(point, rows, fallback));
            }
            btn.addEventListener('mouseenter', showTip);
            btn.addEventListener('mouseleave', hideCoverageReqTip);
            btn.addEventListener('focus', showTip);
            btn.addEventListener('blur', hideCoverageReqTip);
        });
    }

    function getMappingByPointId(pointId) {
        var mappings = (covState().matrix && covState().matrix.mappings) || [];
        for (var i = 0; i < mappings.length; i++) {
            if (String(mappings[i].point_id) === String(pointId)) return mappings[i];
        }
        return null;
    }


    /* ========== 问题清单矩阵专用：行指纹校正 / 过度生成删除（不影响公共 deleteRow） ========== */

    function normalizeMatrixFpText(s) {
        return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    }

    function getMatrixTableRowsSnapshot() {
        if (typeof global.testCasesData !== 'undefined' && Array.isArray(global.testCasesData)) {
            return global.testCasesData;
        }
        return null;
    }

    function buildMatrixRowFingerprint(absIndex) {
        var rows = getMatrixTableRowsSnapshot();
        if (!rows || absIndex == null || absIndex < 0 || absIndex >= rows.length) return '';
        var row = rows[absIndex];
        if (!Array.isArray(row)) return '';
        var parts = [];
        for (var i = 0; i < row.length; i++) {
            parts.push(normalizeMatrixFpText(row[i]));
        }
        return parts.join('\u0001');
    }

    function findTableRowIndexByMatrixFingerprint(fp, preferredIndex) {
        if (!fp) return null;
        var rows = getMatrixTableRowsSnapshot();
        if (!rows || !rows.length) return null;
        var pref = preferredIndex != null ? parseInt(preferredIndex, 10) : NaN;
        if (!isNaN(pref) && pref >= 0 && pref < rows.length) {
            if (buildMatrixRowFingerprint(pref) === fp) return pref;
        }
        for (var i = 0; i < rows.length; i++) {
            if (buildMatrixRowFingerprint(i) === fp) return i;
        }
        return null;
    }

    /**
     * 问题清单矩阵专用：指纹匹配时跳过已占用行号（新方法）。
     * 避免多条内容相同的过度生成全部塌缩到同一 row_index，导致删 1 条误清空。
     */
    function findTableRowIndexByMatrixFingerprintExclusive(fp, preferredIndex, claimed) {
        claimed = claimed || {};
        if (!fp) return null;
        var rows = getMatrixTableRowsSnapshot();
        if (!rows || !rows.length) return null;
        var pref = preferredIndex != null ? parseInt(preferredIndex, 10) : NaN;
        if (!isNaN(pref) && pref >= 0 && pref < rows.length && !claimed[pref]) {
            if (buildMatrixRowFingerprint(pref) === fp) return pref;
        }
        for (var i = 0; i < rows.length; i++) {
            if (claimed[i]) continue;
            if (buildMatrixRowFingerprint(i) === fp) return i;
        }
        /* 无空闲行：返回 null，由调用方保留条目并清空 row_index，禁止塌缩到同一行 */
        return null;
    }

    function ensureOverGeneratedFingerprints() {
        var m = covState().matrix;
        if (!m || !m.over_generated_rows) return;
        m.over_generated_rows.forEach(function (item) {
            if (!item || item.row_fingerprint) return;
            if (item.row_index == null) return;
            var abs = resolveCoverageRowIndex(item.row_index);
            if (abs == null) {
                var raw = parseInt(item.row_index, 10);
                if (!isNaN(raw) && raw >= 0 && raw < getTableRowCount()) abs = raw;
            }
            if (abs != null) item.row_fingerprint = buildMatrixRowFingerprint(abs);
        });
    }


    var _matrixPrevRowCount = null;
    var _matrixPendingDeleteIndexes = null;
    var _matrixPendingDeleteAt = 0;
    var _matrixOverDeleteGuardUntil = 0;
    var _matrixDeleteCandidateIndexes = null;
    var _matrixDeleteCandidateAt = 0;

    /**
     * 新方法：以问题清单 lastValidation 的过度项为准，回写矩阵 over_generated_rows。
     * 专治「问题清单已位移、矩阵定位仍停在旧行号」；不改公共 merge/sync 逻辑。
     */
    function alignMatrixOverGeneratedFromValidation(stored, opts) {
        opts = opts || {};
        if (alignMatrixOverGeneratedFromValidation._reentry) return false;
        stored = stored || getStoredValidation(_covScope);
        if (!stored) return false;
        var overs = Array.isArray(stored.over_generated_issues)
            ? stored.over_generated_issues
            : [];
        ensureMatrixForValidationSync();
        var m = covState().matrix;
        if (!m) return false;

        var next = [];
        var changed = false;
        overs.forEach(function (issue) {
            if (!issue) return;
            var absRi = resolveOverGeneratedRowIndex(issue);
            if (absRi == null && issue.row_index != null && issue.row_index !== '') {
                var raw = parseInt(issue.row_index, 10);
                if (!isNaN(raw) && raw >= 0) absRi = raw;
            }
            var item = {
                row_index: absRi,
                message: String(issue.message || '需求未提及相关内容').trim(),
                row_fingerprint: String(issue.row_fingerprint || '') ||
                    (absRi != null ? buildMatrixRowFingerprint(absRi) : ''),
                type: issue.type || 'hallucination'
            };
            next.push(item);
        });

        var prev = m.over_generated_rows || [];
        if (prev.length !== next.length) {
            changed = true;
        } else {
            for (var i = 0; i < next.length; i++) {
                var a = prev[i] || {};
                var b = next[i] || {};
                if (a.row_index !== b.row_index ||
                    String(a.message || '') !== String(b.message || '') ||
                    String(a.row_fingerprint || '') !== String(b.row_fingerprint || '')) {
                    changed = true;
                    break;
                }
            }
        }
        if (!changed) {
            if (opts.render) {
                renderCoverageToolbar();
                updateValidationTabBadges(stored);
                renderCoverageMatrixList();
            }
            return false;
        }
        m.over_generated_rows = next;
        recomputeMatrixSummary();
        if (opts.render !== false) {
            alignMatrixOverGeneratedFromValidation._reentry = true;
            try {
                renderCoverageToolbar();
                updateValidationTabBadges(stored);
                /* 不论当前是否在矩阵 Tab，都刷新列表 DOM，避免切 Tab 仍显示旧行号 */
                renderCoverageMatrixList();
            } finally {
                alignMatrixOverGeneratedFromValidation._reentry = false;
            }
        }
        return true;
    }

    /**
     * 按「删除下标」重映射过度生成行号（新方法）。
     * 例：删第 22 条（0-based:21）后，原 33 条（0-based:32）→ 32 条（0-based:31）。
     * 不依赖指纹，专解决删行后标签不更新。
     */
    function remapOverGeneratedIndexesAfterDeletes(deletedIndexes) {
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

        var changed = false;
        var m = covState().matrix;
        if (m && Array.isArray(m.over_generated_rows)) {
            var next = [];
            m.over_generated_rows.forEach(function (item) {
                if (!item) return;
                if (item.row_index == null || item.row_index === '') {
                    next.push(item);
                    return;
                }
                var mapped = mapIndex(item.row_index);
                if (mapped.remove) {
                    changed = true;
                    return;
                }
                if (item.row_index !== mapped.index) {
                    item.row_index = mapped.index;
                    changed = true;
                }
                /* 仅补缺失指纹；已有指纹交给后续校正，避免二次位移时写错指纹导致误删 */
                if (!item.row_fingerprint && mapped.index != null && mapped.index >= 0) {
                    var fp = buildMatrixRowFingerprint(mapped.index);
                    if (fp) {
                        item.row_fingerprint = fp;
                        changed = true;
                    }
                }
                next.push(item);
            });
            if (next.length !== m.over_generated_rows.length) changed = true;
            if (changed) {
                m.over_generated_rows = next;
                recomputeMatrixSummary();
            }
        }

        /* 同步问题清单 stored 中的过度项行号（新方法调用，不改公共校验逻辑） */
        var enh = global.TcWorkbenchEnhancements;
        if (enh && typeof enh.remapLastValidationOverRowIndexesAfterDeletes === 'function') {
            enh.remapLastValidationOverRowIndexesAfterDeletes(_covScope, dels, {
                refreshList: true
            });
        } else {
            syncStoredOverGeneratedIssuesFromMatrix({ refreshList: true });
        }
        /* 问题清单位移后，强制矩阵与清单对齐，避免矩阵 Tab 仍显示旧行号 */
        alignMatrixOverGeneratedFromValidation(getStoredValidation(_covScope), { render: true });
        return changed;
    }

    function noteMatrixPendingDeleteIndexes(indexes) {
        var list = [];
        var seen = {};
        (indexes || []).forEach(function (x) {
            var n = parseInt(x, 10);
            if (isNaN(n) || n < 0 || seen[n]) return;
            seen[n] = true;
            list.push(n);
        });
        if (!list.length) return;
        list.sort(function (a, b) { return a - b; });
        _matrixPendingDeleteIndexes = list;
        _matrixPendingDeleteAt = Date.now();
        _matrixDeleteCandidateIndexes = list.slice();
        _matrixDeleteCandidateAt = _matrixPendingDeleteAt;
        /* 确认框打开时锁定删前行数，避免异步确认期间 prevCount 漂移 */
        if (_matrixPrevRowCount == null) {
            _matrixPrevRowCount = getTableRowCount();
        }
    }

    function consumeMatrixPendingDeleteIndexes(prevCount, newCount) {
        var pending = _matrixPendingDeleteIndexes;
        var pendingAt = _matrixPendingDeleteAt;
        _matrixPendingDeleteIndexes = null;
        _matrixPendingDeleteAt = 0;
        if (pending && pending.length && pendingAt && (Date.now() - pendingAt) <= 60000 &&
            prevCount != null && newCount != null &&
            newCount === prevCount - pending.length) {
            _matrixDeleteCandidateIndexes = null;
            _matrixDeleteCandidateAt = 0;
            return pending;
        }
        /* 确认框异步：pending 可能对不上，用候选下标兜底 */
        var cand = _matrixDeleteCandidateIndexes;
        var candAt = _matrixDeleteCandidateAt;
        _matrixDeleteCandidateIndexes = null;
        _matrixDeleteCandidateAt = 0;
        if (!cand || !cand.length) return null;
        if (!candAt || (Date.now() - candAt) > 60000) return null;
        if (prevCount == null || newCount == null) return null;
        if (newCount !== prevCount - cand.length) return null;
        return cand;
    }

    /**
     * 按行内容指纹校正过度生成 row_index；删除行后标签随表格重排更新。
     * 仅当「有指纹且全表找不到」时才移除该项；禁止因短暂空表/行号漂移误删其余问题。
     * @returns {boolean} 是否有变更
     */
    function syncMatrixRowLabelsFromTable() {
        var m = covState().matrix;
        if (!m) return false;
        var tableRows = getMatrixTableRowsSnapshot();
        /* 表格数据尚未就绪时绝不清理过度项，避免删 1 条却清空全部 */
        if (!tableRows || !tableRows.length) return false;
        ensureOverGeneratedFingerprints();
        var rows = m.over_generated_rows || [];
        if (!rows.length) return false;
        var changed = false;
        var next = [];
        var claimed = {};
        rows.forEach(function (item) {
            if (!item) return;
            var fp = String(item.row_fingerprint || '');
            var preferred = item.row_index;
            /* 使用独占匹配，防止相同内容塌缩到同一行号 */
            var found = fp
                ? findTableRowIndexByMatrixFingerprintExclusive(fp, preferred, claimed)
                : null;

            if (found == null && preferred != null) {
                var abs = resolveCoverageRowIndex(preferred);
                if (abs != null && abs < tableRows.length && !claimed[abs]) {
                    var curFp = buildMatrixRowFingerprint(abs);
                    if (!fp) {
                        /* 无指纹：保留并补指纹，不因删行漂移直接丢弃 */
                        found = abs;
                        if (curFp) {
                            item.row_fingerprint = curFp;
                            changed = true;
                        }
                    } else if (curFp === fp) {
                        found = abs;
                    }
                }
            }

            if (found == null) {
                /* 找不到行：保留问题条目，仅清空定位；禁止因指纹误匹配清空其余过度生成 */
                if (item.row_index != null && item.row_index !== '') {
                    item.row_index = null;
                    changed = true;
                }
                next.push(item);
                return;
            }

            claimed[found] = true;
            if (item.row_index !== found) {
                item.row_index = found;
                changed = true;
            }
            var latestFp = buildMatrixRowFingerprint(found);
            if (latestFp && item.row_fingerprint !== latestFp) {
                item.row_fingerprint = latestFp;
                changed = true;
            }
            next.push(item);
        });
        if (next.length !== rows.length) changed = true;
        if (changed) {
            m.over_generated_rows = next;
            recomputeMatrixSummary();
        }
        return changed;
    }

    function buildStoredOverIssuesFromMatrix() {
        var rows = (covState().matrix && covState().matrix.over_generated_rows) || [];
        return rows.map(function (item) {
            return {
                row_index: item.row_index,
                message: item.message || '',
                row_fingerprint: item.row_fingerprint || '',
                /* 必须带 hallucination，否则 normalizeValidationForDisplay 会丢掉全部过度项 */
                type: item.type || 'hallucination'
            };
        });
    }

    function syncStoredOverGeneratedIssuesFromMatrix(opts) {
        opts = opts || {};
        var enh = global.TcWorkbenchEnhancements;
        if (!enh || typeof enh.patchLastValidationOverGeneratedForMatrix !== 'function') {
            return false;
        }
        return !!enh.patchLastValidationOverGeneratedForMatrix(
            _covScope,
            buildStoredOverIssuesFromMatrix(),
            {
                refreshList: opts.refreshList !== false,
                skipPersist: opts.skipPersist !== false,
                skipPrune: !!opts.skipPrune
            }
        );
    }

    var _matrixRowSyncTimer = null;
    var _matrixRowSyncRunning = false;
    var _matrixOverDeleteInProgress = false;

    function scheduleMatrixRowLabelSyncFromTable() {
        if (_matrixOverDeleteInProgress) return;
        if (_matrixRowSyncTimer) {
            global.clearTimeout(_matrixRowSyncTimer);
        }
        _matrixRowSyncTimer = global.setTimeout(function () {
            _matrixRowSyncTimer = null;
            if (_matrixRowSyncRunning || _matrixOverDeleteInProgress) return;
            if (!covState().matrix || !coverageMatrixHasDisplayData(covState().matrix)) return;
            var tableRows = getMatrixTableRowsSnapshot();
            if (!tableRows || !tableRows.length) return;
            _matrixRowSyncRunning = true;
            try {
                useCovScope(_covScope || 'single', function () {
                    var newCount = tableRows.length;
                    var prevCount = _matrixPrevRowCount;
                    var deletedIndexes = consumeMatrixPendingDeleteIndexes(prevCount, newCount);
                    var m0 = covState().matrix;
                    var beforeRows = ((m0 && m0.over_generated_rows) || []).slice().map(function (it) {
                        return it ? {
                            row_index: it.row_index,
                            message: it.message,
                            row_fingerprint: it.row_fingerprint
                        } : null;
                    }).filter(Boolean);
                    var beforeOver = beforeRows.length;
                    var changed = false;

                    var inOverDeleteGuard = _matrixOverDeleteGuardUntil && Date.now() < _matrixOverDeleteGuardUntil;
                    if (deletedIndexes && deletedIndexes.length) {
                        /* 优先按删除下标位移：22 删掉后 33→32 */
                        changed = remapOverGeneratedIndexesAfterDeletes(deletedIndexes) || changed;
                        if (!inOverDeleteGuard) {
                            /* 再用指纹校正一次；删除守卫期内禁止，避免误清空 */
                            changed = syncMatrixRowLabelsFromTable() || changed;
                        }
                    } else if (!inOverDeleteGuard) {
                        changed = syncMatrixRowLabelsFromTable();
                    }
                    _matrixPrevRowCount = newCount;

                    var afterOver = ((covState().matrix && covState().matrix.over_generated_rows) || []).length;
                    if (!changed) {
                        /* 即使指纹未改，也用问题清单回写一次矩阵行号并刷新列表 */
                        alignMatrixOverGeneratedFromValidation(getStoredValidation(_covScope), {
                            render: true
                        });
                        renderCoverageToolbar();
                        return;
                    }
                    if (!_matrixOverDeleteInProgress && beforeOver > 1 && afterOver === 0 && tableRows.length > 0) {
                        console.warn('[TcIssueMatrix] restore over_generated after accidental wipe');
                        if (covState().matrix) {
                            covState().matrix.over_generated_rows = beforeRows;
                            recomputeMatrixSummary();
                        }
                        syncStoredOverGeneratedIssuesFromMatrix({
                            refreshList: true,
                            skipPrune: true
                        });
                        updateValidationTabBadges(getStoredValidation(_covScope));
                        renderCoverageToolbar();
                        renderCoverageMatrixList();
                        return;
                    }
                    /* 删除守卫期内强制 skipPrune，防止误进「问题已全部解决」 */
                    syncStoredOverGeneratedIssuesFromMatrix({
                        refreshList: true,
                        skipPrune: !!inOverDeleteGuard
                    });
                    alignMatrixOverGeneratedFromValidation(getStoredValidation(_covScope), {
                        render: false
                    });
                    updateValidationTabBadges(getStoredValidation(_covScope));
                    renderCoverageToolbar();
                    renderCoverageMatrixList();
                });
            } finally {
                _matrixRowSyncRunning = false;
            }
        }, 180);
    }

    function bindMatrixTableMutationSync() {
        if (bindMatrixTableMutationSync._done) return;
        bindMatrixTableMutationSync._done = true;

        /* 仅记录待删除下标，不改变原删除确认/采纳逻辑 */
        if (typeof global.deleteRow === 'function' && !global.deleteRow._tcMatrixIdxCapture) {
            var origDeleteRow = global.deleteRow;
            global.deleteRow = function (index) {
                var idx = parseInt(index, 10);
                if (!isNaN(idx) && idx >= 0) noteMatrixPendingDeleteIndexes([idx]);
                return origDeleteRow.apply(this, arguments);
            };
            global.deleteRow._tcMatrixIdxCapture = true;
        }
        if (typeof global.deleteSelectedRows === 'function' && !global.deleteSelectedRows._tcMatrixIdxCapture) {
            var origDeleteSelected = global.deleteSelectedRows;
            global.deleteSelectedRows = function () {
                try {
                    if (global.selectedRows && typeof global.selectedRows.forEach === 'function') {
                        var idxs = [];
                        global.selectedRows.forEach(function (i) { idxs.push(i); });
                        noteMatrixPendingDeleteIndexes(idxs);
                    }
                } catch (eSel) { /* ignore */ }
                return origDeleteSelected.apply(this, arguments);
            };
            global.deleteSelectedRows._tcMatrixIdxCapture = true;
        }

        if (typeof global.tcTableRecordAfterMutation === 'function' &&
            !global.tcTableRecordAfterMutation._tcMatrixSyncWrapped) {
            var origMut = global.tcTableRecordAfterMutation;
            global.tcTableRecordAfterMutation = function () {
                if (_matrixPrevRowCount == null) {
                    _matrixPrevRowCount = getTableRowCount();
                }
                var ret = origMut.apply(this, arguments);
                try { scheduleMatrixRowLabelSyncFromTable(); } catch (eSync) { /* ignore */ }
                return ret;
            };
            global.tcTableRecordAfterMutation._tcMatrixSyncWrapped = true;
        }
        if (global.TcWorkbenchStore && typeof global.TcWorkbenchStore.subscribe === 'function') {
            global.TcWorkbenchStore.subscribe(function (path) {
                if (path === 'table.rows' || path === '*') {
                    scheduleMatrixRowLabelSyncFromTable();
                }
            });
        }
        if (_matrixPrevRowCount == null) {
            _matrixPrevRowCount = getTableRowCount();
        }
    }

    function collectOverGeneratedAbsIndexes() {
        syncMatrixRowLabelsFromTable();
        var rows = (covState().matrix && covState().matrix.over_generated_rows) || [];
        var out = [];
        var seen = {};
        rows.forEach(function (item) {
            if (!item || item.row_index == null) return;
            var abs = parseInt(item.row_index, 10);
            if (isNaN(abs) || abs < 0) return;
            if (seen[abs]) return;
            seen[abs] = true;
            out.push(abs);
        });
        out.sort(function (a, b) { return a - b; });
        return out;
    }

    /**
     * 矩阵专用批量删行：不调用带确认的 deleteRow / deleteSelectedRows，避免双重确认与采纳 wrap 副作用。
     */
    function removeTableRowsForIssueMatrix(indexes) {
        var uniq = [];
        var seen = {};
        (indexes || []).forEach(function (ix) {
            var n = parseInt(ix, 10);
            if (isNaN(n) || n < 0 || seen[n]) return;
            seen[n] = true;
            uniq.push(n);
        });
        uniq.sort(function (a, b) { return a - b; });
        if (!uniq.length) return 0;
        noteMatrixPendingDeleteIndexes(uniq);

        var rows = getMatrixTableRowsSnapshot();
        if (!rows) return 0;
        var indexSet = {};
        uniq.forEach(function (n) { indexSet[n] = true; });

        var nextRows = [];
        var nextProv = [];
        var oldToNew = typeof Map !== 'undefined' ? new Map() : null;
        var oldToNewObj = {};
        var provSrc = (typeof global.testCasesProvenance !== 'undefined' && Array.isArray(global.testCasesProvenance))
            ? global.testCasesProvenance
            : [];

        rows.forEach(function (row, idx) {
            if (indexSet[idx]) return;
            if (oldToNew) oldToNew.set(idx, nextRows.length);
            oldToNewObj[idx] = nextRows.length;
            nextRows.push(row);
            nextProv.push(provSrc[idx] != null ? provSrc[idx] : null);
        });

        var store = global.TcWorkbenchStore;
        if (store && store.table && typeof store.table.applyBulkReplace === 'function') {
            var ok = store.table.applyBulkReplace(nextRows, nextProv, oldToNew || oldToNewObj, {
                source: 'issueMatrixOverDelete',
                recordUndo: true
            });
            if (ok) {
                if (global.TcRequirementCaseStore &&
                    typeof global.TcRequirementCaseStore.onTableRowsRemoved === 'function') {
                    global.TcRequirementCaseStore.onTableRowsRemoved();
                }
                return uniq.length;
            }
        }

        global.testCasesData = nextRows;
        if (typeof global.testCasesProvenance !== 'undefined') {
            global.testCasesProvenance = nextProv;
        }
        if (typeof global.markedRows !== 'undefined' && global.markedRows && typeof global.markedRows.forEach === 'function') {
            var nextMarked = new Set();
            global.markedRows.forEach(function (idx) {
                if (oldToNewObj[idx] != null) nextMarked.add(oldToNewObj[idx]);
            });
            global.markedRows = nextMarked;
        }
        if (typeof global.selectedRows !== 'undefined' && global.selectedRows && typeof global.selectedRows.clear === 'function') {
            global.selectedRows.clear();
        }
        if (typeof global.remapRowHeightsByIndexMap === 'function' && oldToNew) {
            global.remapRowHeightsByIndexMap(oldToNew);
        }
        if (typeof global.renderTableBody === 'function') {
            global.renderTableBody({ reload: true });
        }
        if (typeof global.tcTableRecordAfterMutation === 'function') {
            global.tcTableRecordAfterMutation();
        }
        if (global.TcRequirementCaseStore &&
            typeof global.TcRequirementCaseStore.onTableRowsRemoved === 'function') {
            global.TcRequirementCaseStore.onTableRowsRemoved();
        }
        return uniq.length;
    }

    function removeOverGeneratedEntriesByAbsIndexes(absIndexes) {
        var drop = {};
        (absIndexes || []).forEach(function (n) { drop[parseInt(n, 10)] = true; });
        var m = covState().matrix;
        if (!m) return;
        m.over_generated_rows = (m.over_generated_rows || []).filter(function (item) {
            if (!item || item.row_index == null) return false;
            return !drop[parseInt(item.row_index, 10)];
        });
        recomputeMatrixSummary();
    }

    /**
     * 矩阵单条删除专用（新方法）：每个删除下标只移除一条过度项。
     * 不改 removeOverGeneratedEntriesByAbsIndexes，避免「删全部」路径行为变化；
     * 解决相同 row_index 塌缩后删 1 条误清空全部的问题。
     */
    function removeOneOverGeneratedEntryPerAbsIndex(absIndexes) {
        var need = {};
        (absIndexes || []).forEach(function (n) {
            var k = parseInt(n, 10);
            if (isNaN(k) || k < 0) return;
            need[k] = (need[k] || 0) + 1;
        });
        var m = covState().matrix;
        if (!m) return 0;
        var removed = 0;
        m.over_generated_rows = (m.over_generated_rows || []).filter(function (item) {
            if (!item) return false;
            if (item.row_index == null || item.row_index === '') return true;
            var k = parseInt(item.row_index, 10);
            if (isNaN(k) || !need[k]) return true;
            need[k] -= 1;
            removed += 1;
            return false;
        });
        if (removed) recomputeMatrixSummary();
        return removed;
    }

    /** 矩阵删过度专用：仅按删除下标位移剩余项，不改指纹、不同步 stored */
    function shiftMatrixOverIndexesAfterDeletesOnly(deletedIndexes) {
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
        var m = covState().matrix;
        if (!m || !Array.isArray(m.over_generated_rows)) return false;
        var changed = false;
        m.over_generated_rows.forEach(function (item) {
            if (!item || item.row_index == null || item.row_index === '') return;
            var n = parseInt(item.row_index, 10);
            if (isNaN(n) || n < 0) return;
            var next = n;
            for (var i = 0; i < dels.length; i++) {
                if (n === dels[i]) return;
                if (n > dels[i]) next -= 1;
            }
            if (next !== item.row_index) {
                item.row_index = next;
                changed = true;
            }
        });
        if (changed) recomputeMatrixSummary();
        return changed;
    }

    /** 矩阵删过度专用：按「删除前快照 - 本次删除下标」恢复，防止误清空其余过度项 */
    function restoreMatrixOverRowsAfterAccidentalWipe(beforeRows, deletedIndexes) {
        var dropCount = {};
        (deletedIndexes || []).forEach(function (n) {
            var k = parseInt(n, 10);
            if (isNaN(k) || k < 0) return;
            dropCount[k] = (dropCount[k] || 0) + 1;
        });
        var dels = Object.keys(dropCount).map(function (k) { return parseInt(k, 10); })
            .filter(function (n) { return !isNaN(n) && n >= 0; })
            .sort(function (a, b) { return a - b; });
        function shiftIndex(n) {
            var next = n;
            for (var i = 0; i < dels.length; i++) {
                if (n === dels[i]) return null;
                if (n > dels[i]) next -= 1;
            }
            return next;
        }
        var restored = [];
        (beforeRows || []).forEach(function (item) {
            if (!item) return;
            /* 每个删除下标只跳过一条，避免相同 row_index 塌缩时恢复成空 */
            if (item.row_index != null && item.row_index !== '') {
                var rk = parseInt(item.row_index, 10);
                if (!isNaN(rk) && dropCount[rk]) {
                    dropCount[rk] -= 1;
                    return;
                }
            }
            var clone = {
                row_index: item.row_index,
                message: item.message || '',
                row_fingerprint: item.row_fingerprint || ''
            };
            if (clone.row_index != null && clone.row_index !== '') {
                var shifted = shiftIndex(parseInt(clone.row_index, 10));
                if (shifted == null) return;
                clone.row_index = shifted;
            }
            restored.push(clone);
        });
        var m = covState().matrix;
        if (!m) return 0;
        m.over_generated_rows = restored;
        recomputeMatrixSummary();
        return restored.length;
    }

    /**
     * 矩阵删过度专用（新方法）：以删除前快照重建剩余过度项。
     * 每个删除下标只去掉一条；其余项位移或保留（同 row_index 塌缩时不清空）。
     */
    function rebuildMatrixOverRowsFromDeleteSnapshot(beforeRows, deletedIndexes) {
        var dropCount = {};
        (deletedIndexes || []).forEach(function (n) {
            var k = parseInt(n, 10);
            if (isNaN(k) || k < 0) return;
            dropCount[k] = (dropCount[k] || 0) + 1;
        });
        var dels = Object.keys(dropCount).map(function (k) { return parseInt(k, 10); })
            .filter(function (n) { return !isNaN(n) && n >= 0; })
            .sort(function (a, b) { return a - b; });
        function shiftKeep(n) {
            var next = n;
            for (var i = 0; i < dels.length; i++) {
                if (n > dels[i]) next -= 1;
            }
            return next;
        }
        var out = [];
        (beforeRows || []).forEach(function (item) {
            if (!item) return;
            if (item.row_index != null && item.row_index !== '') {
                var rk = parseInt(item.row_index, 10);
                if (!isNaN(rk) && dropCount[rk]) {
                    dropCount[rk] -= 1;
                    return;
                }
                if (!isNaN(rk) && rk >= 0) {
                    var wasDeletedSlot = false;
                    for (var di = 0; di < dels.length; di++) {
                        if (rk === dels[di]) { wasDeletedSlot = true; break; }
                    }
                    if (wasDeletedSlot) {
                        /* 同下标多余条目：保留问题，暂不定位 */
                        out.push({
                            row_index: null,
                            message: item.message || '',
                            row_fingerprint: item.row_fingerprint || '',
                            type: item.type || 'hallucination'
                        });
                        return;
                    }
                    out.push({
                        row_index: shiftKeep(rk),
                        message: item.message || '',
                        row_fingerprint: item.row_fingerprint || '',
                        type: item.type || 'hallucination'
                    });
                    return;
                }
            }
            out.push({
                row_index: item.row_index,
                message: item.message || '',
                row_fingerprint: item.row_fingerprint || '',
                type: item.type || 'hallucination'
            });
        });
        return out;
    }

    /** 矩阵删过度专用收尾：快照重建为准，跳过指纹 prune，禁止误进通过态 */
    function finalizeIssueMatrixOverDelete(deletedIndexes, beforeRows) {
        var expectedKeep = Math.max(0, (beforeRows || []).length - (deletedIndexes || []).length);
        var rebuilt = rebuildMatrixOverRowsFromDeleteSnapshot(beforeRows, deletedIndexes);
        var m = covState().matrix;
        if (m) {
            m.over_generated_rows = rebuilt;
            recomputeMatrixSummary();
        }
        if (expectedKeep > 0 && rebuilt.length < expectedKeep) {
            console.warn('[TcIssueMatrix] snapshot rebuild short', {
                expectedKeep: expectedKeep,
                after: rebuilt.length
            });
            restoreMatrixOverRowsAfterAccidentalWipe(beforeRows, deletedIndexes);
        }
        /* 消费 pending，避免 180ms 后再位移/误删 */
        _matrixPendingDeleteIndexes = null;
        _matrixPendingDeleteAt = 0;
        _matrixPrevRowCount = getTableRowCount();
        _matrixOverDeleteGuardUntil = Date.now() + 4000;
        syncStoredOverGeneratedIssuesFromMatrix({
            refreshList: true,
            skipPrune: true
        });
        /* 再保险：若 stored 被清空但快照仍有剩余，强制写回问题清单 */
        forceKeepValidationOversAfterMatrixDelete(beforeRows, deletedIndexes);
        updateValidationTabBadges(getStoredValidation(_covScope));
        renderCoveragePanel();
        /* 删光过度后：强制刷通过态面板（补充收尾有 ensureValidateCleanPassUiAfterFill，删除路径需独立对齐） */
        scheduleValidateCleanPassUiAfterOverDelete();
    }

    /** 删除过度后异步钉住通过态（新方法，不改补充收尾） */
    function scheduleValidateCleanPassUiAfterOverDelete() {
        var scope = _covScope || 'single';
        function run() {
            var enh = global.TcWorkbenchEnhancements;
            if (!enh || typeof enh.ensureValidateCleanPassUiAfterOverDelete !== 'function') return;
            try {
                enh.ensureValidateCleanPassUiAfterOverDelete(scope);
            } catch (e0) { /* ignore */ }
        }
        if (typeof global.requestAnimationFrame === 'function') {
            global.requestAnimationFrame(function () {
                run();
                global.setTimeout(run, 80);
            });
        } else {
            global.setTimeout(run, 0);
            global.setTimeout(run, 80);
        }
    }

    /**
     * 删除过度后保底（新方法）：问题清单不得因同步竞态被清空为「已全部解决」。
     */
    function forceKeepValidationOversAfterMatrixDelete(beforeRows, deletedIndexes) {
        var expectedKeep = Math.max(0, (beforeRows || []).length - (deletedIndexes || []).length);
        if (expectedKeep <= 0) return;
        var enh = global.TcWorkbenchEnhancements;
        if (!enh) return;
        var stored = typeof enh.getLastValidation === 'function'
            ? enh.getLastValidation(_covScope)
            : null;
        var cur = (stored && stored.over_generated_issues) ? stored.over_generated_issues.length : 0;
        var matrixLen = ((covState().matrix && covState().matrix.over_generated_rows) || []).length;
        if (cur >= expectedKeep && matrixLen >= expectedKeep) return;
        var rebuilt = rebuildMatrixOverRowsFromDeleteSnapshot(beforeRows, deletedIndexes);
        if (covState().matrix) {
            covState().matrix.over_generated_rows = rebuilt;
            recomputeMatrixSummary();
        }
        if (typeof enh.patchLastValidationOverGeneratedForMatrix === 'function') {
            enh.patchLastValidationOverGeneratedForMatrix(_covScope, rebuilt, {
                refreshList: true,
                skipPersist: true,
                skipPrune: true
            });
        }
    }

    function deleteOverGeneratedFromMatrix(options) {
        options = options || {};
        var mode = options.mode || 'one';
        var targetAbs = options.absIndex != null ? parseInt(options.absIndex, 10) : null;
        /* 删除前不做指纹清理同步，避免误删其余过度项；仅补缺失指纹 */
        ensureOverGeneratedFingerprints();
        var indexes;
        if (mode === 'all') {
            indexes = collectOverGeneratedAbsIndexes();
        } else {
            if (isNaN(targetAbs) || targetAbs < 0) {
                toast('无法定位要删除的用例行', { variant: 'warning', duration: 2800 });
                return Promise.resolve(false);
            }
            indexes = [targetAbs];
        }
        if (!indexes.length) {
            toast('当前没有可删除的过度生成用例', { variant: 'info', duration: 2600 });
            return Promise.resolve(false);
        }

        var count = indexes.length;
        var msg = count === 1
            ? ('将删除第 ' + (indexes[0] + 1) + ' 条过度生成用例，且不可恢复。')
            : ('将删除全部 ' + count + ' 条过度生成用例，且不可恢复。');
        var confirmFn = typeof global.tcAppConfirm === 'function'
            ? global.tcAppConfirm
            : function () { return Promise.resolve(window.confirm(msg)); };

        return Promise.resolve(confirmFn(msg, {
            title: count === 1 ? '删除过度生成用例？' : '删除全部过度生成用例？',
            variant: 'warning',
            confirmText: count === 1 ? '删除' : ('删除 ' + count + ' 条'),
            cancelText: '取消'
        })).then(function (ok) {
            if (!ok) return false;
            _matrixOverDeleteInProgress = true;
            try {
                ensureOverGeneratedFingerprints();
                var beforeRows = ((covState().matrix && covState().matrix.over_generated_rows) || []).slice().map(function (it) {
                    return it ? {
                        row_index: it.row_index,
                        message: it.message || '',
                        row_fingerprint: it.row_fingerprint || '',
                        type: it.type || 'hallucination'
                    } : null;
                }).filter(Boolean);
                /* 单条：每下标只删一条矩阵项；全部：沿用原批量移除。避免同 row_index 误清空 */
                if (mode === 'all') {
                    removeOverGeneratedEntriesByAbsIndexes(indexes);
                } else {
                    removeOneOverGeneratedEntryPerAbsIndex(indexes);
                }
                var removed = removeTableRowsForIssueMatrix(indexes);
                if (!removed) {
                    toast('删除失败：表格数据不可用', { variant: 'error', duration: 3200 });
                    return false;
                }
                finalizeIssueMatrixOverDelete(indexes, beforeRows);
                toast(count === 1 ? '已删除 1 条过度生成用例。' : ('已删除 ' + count + ' 条过度生成用例。'), {
                    variant: 'success',
                    duration: 2400
                });
                return true;
            } finally {
                _matrixOverDeleteInProgress = false;
            }
        });
    }

    function bindCoverageMatrixDeleteButtons(list, scopeAtRender) {
        if (!list) return;
        list.querySelectorAll('.tc-coverage-delete-one').forEach(function (btn) {
            btn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var ri = parseInt(btn.getAttribute('data-row'), 10);
                useCovScope(scopeAtRender, function () {
                    deleteOverGeneratedFromMatrix({ mode: 'one', absIndex: ri });
                });
            });
        });
    }


    function normalizeCoverageCardText(s) {
        return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    }

    /** 卡片正文去重：标题与说明相同时只保留一处 */
    function pickCoverageCardBodyText(title, evidence, path) {
        var t = normalizeCoverageCardText(title);
        var e = normalizeCoverageCardText(evidence);
        var p = normalizeCoverageCardText(path);
        if (p && (p.indexOf('质量检查') === 0 || p === t || p === e)) p = '';
        if (t && e && t === e) e = '';
        if (!t && e) { t = e; e = ''; }
        return { title: t, evidence: e, path: p };
    }

    function renderCoverageMatrixList() {
        var list = $('tc-coverage-matrix-list');
        if (!list) return;
        var m = covState().matrix;
        if (m && coverageMatrixHasDisplayData(m)) {
            /* 先用问题清单行号对齐矩阵，再做指纹校正（不回退到旧行号） */
            if (!alignMatrixOverGeneratedFromValidation._reentry) {
                alignMatrixOverGeneratedFromValidation(getStoredValidation(_covScope), {
                    render: false
                });
            }
            syncMatrixRowLabelsFromTable();
            m = covState().matrix;
        }
        if (covState().analyzing && !coverageMatrixHasDisplayData(m)) {
            list.innerHTML = '<div class="tc-coverage-empty-state"><p class="tc-coverage-loading">正在分析覆盖率矩阵，约 1～3 分钟…</p></div>';
            return;
        }
        var points = (m && m.points) || [];
        var overRows = (m && m.over_generated_rows) || [];
        if (!m || (!points.length && !overRows.length)) {
            list.innerHTML = '<div class="tc-coverage-empty-state"><p class="tc-coverage-empty">暂无问题项</p></div>';
            return;
        }

        var filter = covState().filter || 'all';
        if (filter !== 'all' && filter !== 'uncovered' && filter !== 'over' &&
            filter !== 'partial' && filter !== 'covered') {
            filter = 'all';
            covState().filter = 'all';
        }
        if (!points.length && filter !== 'all' && filter !== 'over') {
            list.innerHTML = '<div class="tc-coverage-empty-state"><p class="tc-coverage-empty">暂无问题项</p></div>';
            return;
        }

        var cards = [];
        points.forEach(function (p) {
            var mapping = getMappingByPointId(p.id);
            var status = mapping ? mapping.status : 'uncovered';
            if (filter === 'uncovered' && status !== 'uncovered') return;
            if (filter === 'partial' && status !== 'partial') return;
            if (filter === 'covered' && status !== 'covered') return;
            if (filter === 'over') return;

            var rows = mapping && mapping.row_indices ? mapping.row_indices : [];
            var rowBtns = rows.length
                ? rows.map(function (ri) {
                    var abs = resolveCoverageRowIndex(ri);
                    if (abs == null) return '';
                    return '<button type="button" class="tc-coverage-locate" data-row="' + abs + '">' + (abs + 1) + '</button>';
                }).filter(Boolean).join('')
                : '';
            var evidence = formatCoverageRowRefText(
                (mapping && mapping.evidence) || p.description || '',
                rows
            );
            var typeLabel = TYPE_LABELS[p.type] || p.type || '';
            var body = pickCoverageCardBodyText(p.title || '未命名功能点', evidence, p.path || '');
            var hasLocate = !!(rowBtns && String(rowBtns).trim());
            var topActions = hasLocate
                ? ('<div class="tc-coverage-card__top-actions">' +
                    '<span class="tc-coverage-card__foot-label">定位</span>' +
                    '<span class="tc-coverage-rows-wrap">' + rowBtns + '</span></div>')
                : '';
            cards.push(
                '<article class="tc-coverage-card tc-coverage-card--compact tc-coverage-card--' + esc(status) + '">' +
                '<div class="tc-coverage-card__rail" aria-hidden="true"></div>' +
                '<div class="tc-coverage-card__main">' +
                '<div class="tc-coverage-card__top">' +
                '<span class="tc-coverage-badge tc-coverage-badge--' + esc(status) + '">' +
                esc(STATUS_LABELS[status] || status) + '</span>' +
                (typeLabel ? ('<span class="tc-coverage-card__type">' + esc(typeLabel) + '</span>') : '') +
                topActions +
                '</div>' +
                (body.title ? ('<p class="tc-coverage-card__body">' + esc(body.title) + '</p>') : '') +
                (body.evidence ? ('<p class="tc-coverage-card__sub">' + esc(body.evidence) + '</p>') : '') +
                '</div></article>'
            );
        });

        if (filter === 'all' || filter === 'over') {
            overRows.forEach(function (item) {
                var overAbs = item.row_index != null ? resolveCoverageRowIndex(item.row_index) : null;
                if (overAbs == null && item.row_index != null) {
                    var riRaw = parseInt(item.row_index, 10);
                    if (!isNaN(riRaw) && riRaw >= 0) overAbs = riRaw;
                }
                var rowIndices = overAbs != null ? [overAbs] : [];
                var overRowBtn = overAbs != null
                    ? ('<button type="button" class="tc-coverage-locate" data-row="' +
                        overAbs + '">' + (overAbs + 1) + '</button>')
                    : '<span class="tc-coverage-rows-empty">—</span>';
                var evidence = formatCoverageRowRefText(item.message || '', rowIndices);
                var delBtn = overAbs != null
                    ? ('<button type="button" class="tc-coverage-delete-one" data-row="' + overAbs +
                        '" title="删除该过度生成用例">删除</button>')
                    : '';
                cards.push(
                    '<article class="tc-coverage-card tc-coverage-card--compact tc-coverage-card--over">' +
                    '<div class="tc-coverage-card__rail" aria-hidden="true"></div>' +
                    '<div class="tc-coverage-card__main">' +
                    '<div class="tc-coverage-card__top">' +
                    '<span class="tc-coverage-badge tc-coverage-badge--over">过度生成</span>' +
                    '<span class="tc-coverage-card__type">用例</span>' +
                    '<div class="tc-coverage-card__top-actions">' +
                    '<span class="tc-coverage-card__foot-label">定位</span>' +
                    '<span class="tc-coverage-rows-wrap">' + overRowBtn + '</span>' +
                    (delBtn ? delBtn : '') +
                    '</div></div>' +
                    (evidence
                        ? ('<p class="tc-coverage-card__body">' + esc(evidence) + '</p>')
                        : '<p class="tc-coverage-card__body">用例过度生成</p>') +
                    '</div></article>'
                );
            });
        }

        if (!cards.length) {
            list.innerHTML = '<div class="tc-coverage-empty-state"><p class="tc-coverage-empty">当前筛选下暂无问题</p></div>';
            return;
        }

        var html = '<div class="tc-coverage-cards">' + cards.join('') + '</div>';
        if (covState().analyzing && coverageMatrixHasDisplayData(m)) {
            html = '<p class="tc-coverage-loading tc-coverage-analyzing-hint">完整覆盖率矩阵分析中，约 1～3 分钟…</p>' + html;
        }
        list.innerHTML = html;

        var scopeAtRender = _covScope;
        list.querySelectorAll('.tc-coverage-locate').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var ri = parseInt(btn.getAttribute('data-row'), 10);
                useCovScope(scopeAtRender, function () {
                    locateTableRow(ri);
                });
            });
        });
        bindCoverageMatrixDeleteButtons(list, scopeAtRender);
        bindCoverageReqButtons(list);
    }

    function locateTableRow(rowIndex) {
        var abs = resolveCoverageRowIndex(rowIndex);
        if (abs == null) {
            toast('对应用例已不在当前表格中（可能已删除或表格已变更）', { variant: 'warning', duration: 3200 });
            return;
        }
        if (global.TcWorkbenchEnhancements && typeof global.TcWorkbenchEnhancements.highlightValidateRow === 'function') {
            global.TcWorkbenchEnhancements.highlightValidateRow(abs, _covScope);
            return;
        }
        if (typeof global.switchTcRightView === 'function') global.switchTcRightView('table');
        var table = document.querySelector('#test-cases-table tbody');
        if (table && table.rows && table.rows[rowIndex]) {
            table.rows[rowIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            table.rows[rowIndex].classList.add('tc-row-validate-flash');
            global.setTimeout(function () {
                table.rows[rowIndex].classList.remove('tc-row-validate-flash');
            }, 2000);
        }
    }

    function shouldShowCoverageFillAllButton(scope) {
        var enh = global.TcWorkbenchEnhancements;
        if (enh && typeof enh.isValidateViewingLatestSessionTurn === 'function') {
            return enh.isValidateViewingLatestSessionTurn(scope || _covScope);
        }
        return true;
    }

    function syncCoverageFilterChips() {
        var seg = $('tc-coverage-filter');
        if (!seg) return;
        var cur = covState().filter || 'all';
        if (cur !== 'all' && cur !== 'uncovered' && cur !== 'over') {
            cur = 'all';
            covState().filter = 'all';
        }
        seg.querySelectorAll('.tc-coverage-filter-chip').forEach(function (chip) {
            var on = (chip.getAttribute('data-filter') || '') === cur;
            chip.classList.toggle('tc-coverage-filter-chip--active', on);
            chip.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function renderCoverageToolbar() {
        var toolbar = $('tc-coverage-toolbar');
        if (!toolbar) return;
        syncCoverageFilterChips();
        var fillAll = $('tc-coverage-fill-all-btn');
        if (fillAll) {
            var showFill = shouldShowCoverageFillAllButton(_covScope);
            fillAll.classList.toggle('hidden', !showFill);
            fillAll.hidden = !showFill;
            fillAll.setAttribute('aria-hidden', showFill ? 'false' : 'true');
        }
        var delOver = $('tc-coverage-delete-over-btn');
        var overCount = 0;
        if (covState().matrix) {
            overCount = ((covState().matrix.over_generated_rows || []).length) ||
                ((covState().matrix.summary && covState().matrix.summary.over_generated) || 0);
        }
        if (delOver) {
            delOver.disabled = !overCount;
            delOver.textContent = '删除过度生成 (' + overCount + ')';
        }
        if (!covState().matrix || !covState().matrix.summary) {
            renderIssueListActionsToolbar(_covScope);
            return;
        }
        var s = covState().matrix.summary;
        var fillAllCount = s.uncovered || 0;
        if (fillAll && shouldShowCoverageFillAllButton(_covScope)) {
            fillAll.disabled = !fillAllCount;
            fillAll.textContent = '补充用例 (' + fillAllCount + ')';
        }
        renderIssueListActionsToolbar(_covScope);
    }

    function renderCoveragePanel() {
        renderCoverageToolbar();
        renderCoverageMatrixList();
        updateCoverageTabBadge();
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.ensureValidateDrawerCoverageSize === 'function') {
            global.TcWorkbenchEnhancements.ensureValidateDrawerCoverageSize(_covScope);
        }
    }

    function runCoverageAnalyze(scopeOrOptions, maybeOptions) {
        var scope = null;
        var options = {};
        if (typeof scopeOrOptions === 'string') {
            scope = scopeOrOptions;
            options = maybeOptions || {};
        } else {
            options = scopeOrOptions || {};
        }
        if (scope) {
            return useCovScope(scope, function () {
                return runCoverageAnalyzeInner(options);
            });
        }
        return runCoverageAnalyzeInner(options);
    }

    function runCoverageAnalyzeInner(options) {
        options = options || {};
        if (_covScope === 'single') {
            if (!options.silent) {
                toast('快速规划已通过质量检查同步问题清单矩阵，无需单独分析。', { variant: 'info', duration: 3200 });
            }
            return Promise.resolve();
        }
        if (!options._userAiGatePassed && typeof getAiMode === 'function' && getAiMode() === 'preset' && global.HfUserAiConfig && typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {
                if (!ok) return;
                options._userAiGatePassed = true;
                return runCoverageAnalyzeInner(options);
            });
        }
        if (covState().analyzing) {
            return covState()._analyzePromise || Promise.resolve();
        }
        var tablePayload = collectTablePayload();
        if (!tablePayload.columns.length) {
            if (!options.silent) alertBox('请先应用表头模板。', { title: '缺少表头' });
            return Promise.resolve();
        }
        if (!tablePayload.rows.length) {
            if (!options.silent) alertBox('没有可检查的用例（请先从解析用例完成质量检查）。', { title: '无用例' });
            return Promise.resolve();
        }

        covState().analyzing = true;
        if (!options.silent) openCoverageTab();
        renderCoveragePanel();

        var pending = ensureRequirementsForCoverage().then(function (req) {
            var body = buildAnalyzeRequestBody(tablePayload);
            if (req) body.requirements = req;
            return fetchJsonWithTimeout('/api/test-cases/coverage/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }, COVERAGE_TIMEOUT_MS);
        }).then(function (data) {
            if (data && data.coverage_matrix) {
            if (data && data.ai_quota && typeof global.hfAiQuotaNotify === 'function') {
                global.hfAiQuotaNotify(data.ai_quota);
            }

                setMatrix(data.coverage_matrix, tablePayload.rowOffset);
                if (!options.silent) {
                    toast('问题清单矩阵分析完成：' + (data.coverage_matrix.summary || {}).coverage_rate + '%', { variant: 'success' });
                }
            }
        }).catch(function (err) {
            if (!options.silent) {
                alertBox(err.message || '问题清单矩阵分析失败', { variant: 'error', title: '分析失败' });
            }
        }).finally(function () {
            covState().analyzing = false;
            covState()._analyzePromise = null;
            renderCoveragePanel();
        });
        covState()._analyzePromise = pending;
        return pending;
    }

    function markValidationCoverageReady(scope) {
        scope = normalizeScope(scope || _covScope);
        return useCovScope(scope, function () {
            renderCoveragePanel();
            updateValidationTabBadges(getStoredValidation(scope));
        });
    }

    function refreshCoveragePanel(scope) {
        scope = normalizeScope(scope || _covScope);
        return useCovScope(scope, function () {
            renderCoveragePanel();
        });
    }




    /** 用例补充进度展示期（含 job 完成后等待问题清单/矩阵刷新）：隐藏 Tab、禁止切换 */
    function shouldHideValidateDrawerTabsDuringFillPresentation(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        var hide = false;
        useCovScope(scope, function () {
            hide = !!covState().fillProgressActive;
        });
        return hide;
    }

    function syncValidateDrawerTabsDuringFillProgress(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        var drawer = getValidateDrawerEl(scope);
        if (!drawer) return;
        var hide = shouldHideValidateDrawerTabsDuringFillPresentation(scope);
        drawer.classList.toggle('tc-validate-drawer--fill-active', hide);
        var tabs = drawer.querySelector('.tc-validate-drawer-tabs');
        if (tabs) {
            tabs.classList.toggle('hidden', hide);
            tabs.setAttribute('aria-hidden', hide ? 'true' : 'false');
        }
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.syncValidateDrawerTabsChromeDuringQcRun === 'function') {
            global.TcWorkbenchEnhancements.syncValidateDrawerTabsChromeDuringQcRun(scope);
        }
    }

    function getValidateDrawerFillProgressEl(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return document.getElementById('tc-validate-fill-progress-' + scope);
    }

    function getValidateDrawerFillProgressInnerEl(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return document.getElementById('tc-validate-fill-progress-inner-' + scope);
    }

    function getValidateDrawerEl(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return document.getElementById('tc-validate-drawer-' + scope);
    }

    function bindValidateFillCancelOnce(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        var btn = document.getElementById('tc-validate-fill-cancel-' + scope);
        if (!btn || btn._tcFillCancelBound) return;
        btn._tcFillCancelBound = true;
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (global.TcAgentOrchestrator && typeof global.TcAgentOrchestrator.cancelAgentJob === 'function') {
                global.TcAgentOrchestrator.cancelAgentJob(e);
            }
        });
    }

    function dismissValidateDrawerFillProgressPresentation(scope, opts) {
        opts = opts || {};
        scope = normalizeScope(scope || _covScope || 'single');
        return useCovScope(scope, function () {
            hideFillTableOverlay();
            if (global.TcFillProgressScrollLayout && typeof global.TcFillProgressScrollLayout.clear === 'function') {
                global.TcFillProgressScrollLayout.clear(scope);
            }
            covState().fillProgressActive = false;
            covState().pendingFillRefresh = false;
            var drawer = getValidateDrawerEl(scope);
            if (drawer) drawer.classList.remove('tc-validate-drawer--fill-active');
            var fill = getValidateDrawerFillProgressEl(scope);
            var inner = getValidateDrawerFillProgressInnerEl(scope);
            if (fill) {
                fill.classList.add('hidden');
                fill.setAttribute('aria-hidden', 'true');
            }
            if (inner) inner.innerHTML = '';
            syncValidateDrawerTabsDuringFillProgress(scope);
            if (opts.switchTab) {
                var returnTab = covState().fillProgressReturnTab || 'issues';
                switchValidateTab(returnTab === 'coverage' ? 'coverage' : 'issues');
            }
        });
    }


    /** 用例补充表格蒙层（TcFillTableOverlay 隔离） */
    function showFillTableOverlay(opts) {
        if (global.TcFillTableOverlay && typeof global.TcFillTableOverlay.show === 'function') {
            global.TcFillTableOverlay.show(opts || {});
        }
    }

    function hideFillTableOverlay() {
        if (global.TcFillTableOverlay && typeof global.TcFillTableOverlay.hide === 'function') {
            global.TcFillTableOverlay.hide();
        }
    }

    function updateFillTableOverlay(opts) {
        if (global.TcFillTableOverlay && typeof global.TcFillTableOverlay.update === 'function') {
            global.TcFillTableOverlay.update(opts || {});
        }
    }

    function enterValidateDrawerFillProgressMode(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return useCovScope(scope, function () {
            resetLanhuNavUnlockedAfterCoverageFillTerminal();
            covState().fillProgressReturnTab = isIssueListPrimaryActionsMode()
                ? 'issues'
                : (covState().activeTab || 'coverage');
            covState().fillProgressActive = true;
            var drawer = getValidateDrawerEl(scope);
            if (drawer) drawer.classList.add('tc-validate-drawer--fill-active');
            var issue = $('tc-validate-issue-list');
            var cov = $('tc-validate-coverage-panel');
            var fill = getValidateDrawerFillProgressEl(scope);
            if (issue) { issue.classList.add('hidden'); issue.setAttribute('aria-hidden', 'true'); }
            if (cov) { cov.classList.add('hidden'); cov.setAttribute('aria-hidden', 'true'); }
            if (fill) {
                fill.classList.remove('hidden');
                fill.setAttribute('aria-hidden', 'false');
            }
            bindValidateFillCancelOnce(scope);
            if (global.TcFillProgressScrollLayout && typeof global.TcFillProgressScrollLayout.apply === 'function') {
                global.TcFillProgressScrollLayout.apply(scope);
            }
            syncValidateDrawerTabsDuringFillProgress(scope);
            showFillTableOverlay({ stage: '准备中…', meta: '正在启动用例补充', percent: 0 });
        });
    }

    function exitValidateDrawerFillProgressMode(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return dismissValidateDrawerFillProgressPresentation(scope, { switchTab: true });
    }




    function markLanhuNavUnlockedAfterCoverageFillTerminal() {
        _lanhuNavUnlockedAfterCoverageFillTerminal = true;
    }

    function resetLanhuNavUnlockedAfterCoverageFillTerminal() {
        _lanhuNavUnlockedAfterCoverageFillTerminal = false;
    }

    function isLanhuNavPostCoverageFillBypassAllowed(scope) {
        if (!_lanhuNavUnlockedAfterCoverageFillTerminal || isCoverageFillJobRunning()) {
            return false;
        }
        if (typeof global.isTcRequirementPageGenBusy === 'function' && global.isTcRequirementPageGenBusy()) {
            return false;
        }
        if (global.TcGenerationStreamClient &&
            typeof global.TcGenerationStreamClient.isActive === 'function' &&
            global.TcGenerationStreamClient.isActive()) {
            return false;
        }
        if (global.TcAgentOrchestrator &&
            typeof global.TcAgentOrchestrator.isGenModeLocked === 'function' &&
            global.TcAgentOrchestrator.isGenModeLocked()) {
            return false;
        }
        if (global.TcLeftPanelLock &&
            typeof global.TcLeftPanelLock.isAiGenerateLocked === 'function' &&
            global.TcLeftPanelLock.isAiGenerateLocked()) {
            return false;
        }
        return true;
    }

    function shouldBypassLanhuGenLockAfterCoverageFillTerminal(scope) {
        return isLanhuNavPostCoverageFillBypassAllowed(scope);
    }

    function isCoverageFillJobBlockingLanhuNav(scope) {
        return isCoverageFillJobRunning();
    }

    function isValidateDrawerFillInProgress(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        var active = false;
        useCovScope(scope, function () {
            active = !!(covState().fillProgressActive && isCoverageFillJobRunning());
        });
        return active;
    }


    function isValidateDrawerFillCloseCancelPromptNeeded(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        var needed = false;
        useCovScope(scope, function () {
            needed = !!covState().fillProgressActive;
        });
        return needed;
    }

    function restoreValidateDrawerToQualityResultsAfterFillCancel(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return useCovScope(scope, function () {
            if (!covState().fillProgressActive) {
                switchValidateTab('issues');
                restoreValidateDrawerSummaryInPlace(scope);
                if (global.TcWorkbenchEnhancements &&
                    typeof global.TcWorkbenchEnhancements.refreshValidationIssuesView === 'function') {
                    global.TcWorkbenchEnhancements.refreshValidationIssuesView(scope);
                }
                return;
            }
            covState().fillProgressActive = false;
            covState().pendingFillRefresh = false;
            hideFillTableOverlay();
            var drawer = getValidateDrawerEl(scope);
            if (drawer) drawer.classList.remove('tc-validate-drawer--fill-active');
            var fill = $('tc-validate-fill-progress');
            var inner = $('tc-validate-fill-progress-inner-' + scope) || $('tc-validate-fill-progress-inner');
            if (fill) { fill.classList.add('hidden'); fill.setAttribute('aria-hidden', 'true'); }
            if (inner) inner.innerHTML = '';
            switchValidateTab('issues');
            restoreValidateDrawerSummaryInPlace(scope);
            if (global.TcWorkbenchEnhancements &&
                typeof global.TcWorkbenchEnhancements.refreshValidationIssuesView === 'function') {
                global.TcWorkbenchEnhancements.refreshValidationIssuesView(scope);
            }
        });
    }

    function cancelCoverageFillFromDrawerClose(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return useCovScope(scope, function () {
            if (isCoverageFillJobRunning() &&
                global.TcAgentOrchestrator &&
                typeof global.TcAgentOrchestrator.cancelAgentJob === 'function') {
                global.TcAgentOrchestrator.cancelAgentJob();
                return;
            }
            covState().pendingFillRefresh = false;
            restoreValidateDrawerToQualityResultsAfterFillCancel(scope);
            syncStandaloneQcButtonChromeAfterFillBusyChange();
        });
    }

    function forceReleaseLeftPanelLanhuNavAfterCoverageFillComplete(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        if (isCoverageFillJobRunning()) {
            if (global.TcLeftPanelLock &&
                typeof global.TcLeftPanelLock.syncLanhuRequirementNavLockUi === 'function') {
                global.TcLeftPanelLock.syncLanhuRequirementNavLockUi();
            }
            return;
        }
        dismissValidateDrawerFillProgressPresentation(scope, { switchTab: false });
        markLanhuNavUnlockedAfterCoverageFillTerminal();
        if (global.TcAgentOrchestrator) {
            if (typeof global.TcAgentOrchestrator.releaseGenModeLockIfIdle === 'function') {
                global.TcAgentOrchestrator.releaseGenModeLockIfIdle();
            }
        }
        if (typeof global.setTcLeftPanelAgentLock === 'function') {
            global.setTcLeftPanelAgentLock(false);
        }
        if (typeof global.clearOptimisticPageGenLock === 'function') {
            global.clearOptimisticPageGenLock();
        }
        if (global.TcLeftPanelLock &&
            typeof global.TcLeftPanelLock.forceUnlockLanhuNavAfterCoverageFillTerminal === 'function') {
            global.TcLeftPanelLock.forceUnlockLanhuNavAfterCoverageFillTerminal();
        } else if (global.TcLeftPanelLock) {
            if (typeof global.TcLeftPanelLock.applyLockUi === 'function') {
                global.TcLeftPanelLock.applyLockUi();
            }
            if (typeof global.TcLeftPanelLock.syncLanhuRequirementNavLockUi === 'function') {
                global.TcLeftPanelLock.syncLanhuRequirementNavLockUi();
            }
        }
        if (typeof global.syncTcSessionNavLockUi === 'function' &&
            global.TcLeftPanelLock && typeof global.TcLeftPanelLock.isLocked === 'function') {
            global.syncTcSessionNavLockUi(global.TcLeftPanelLock.isLocked());
        }
        if (typeof global.tcSyncLanhuTreePageSwitchLockUi === 'function') {
            global.tcSyncLanhuTreePageSwitchLockUi();
        }
        if (typeof global.tcSyncLanhuDocSwitcherLockUi === 'function') {
            global.tcSyncLanhuDocSwitcherLockUi();
        }
    }

    function scheduleLeftPanelLanhuNavUnlockAfterCoverageFillTerminal(scope) {
        forceReleaseLeftPanelLanhuNavAfterCoverageFillComplete(scope);
        if (typeof global.requestAnimationFrame === 'function') {
            global.requestAnimationFrame(function () {
                forceReleaseLeftPanelLanhuNavAfterCoverageFillComplete(scope);
            });
        }
        [0, 150, 500, 1200].forEach(function (ms) {
            global.setTimeout(function () {
                forceReleaseLeftPanelLanhuNavAfterCoverageFillComplete(scope);
            }, ms);
        });
    }

    function syncLeftPanelLanhuNavLockAfterCoverageFillBusyChange() {
        var scope = normalizeScope(_pendingCoverageFillScope || _covScope || 'single');
        if (isCoverageFillJobBlockingLanhuNav(scope)) {
            if (global.TcLeftPanelLock &&
                typeof global.TcLeftPanelLock.syncLanhuRequirementNavLockUi === 'function') {
                global.TcLeftPanelLock.syncLanhuRequirementNavLockUi();
            }
            return;
        }
        scheduleLeftPanelLanhuNavUnlockAfterCoverageFillTerminal(scope);
        if (typeof global.scheduleReleaseWorkbenchInteractionLocks === 'function') {
            global.scheduleReleaseWorkbenchInteractionLocks();
        }
    }

    function syncStandaloneQcButtonChromeAfterFillBusyChange() {
        if (typeof global.syncTcQualityCheckButtonChrome === 'function') {
            global.syncTcQualityCheckButtonChrome();
        }
        syncLeftPanelLanhuNavLockAfterCoverageFillBusyChange();
    }

    function isCoverageFillJobRunning() {
        var orch = global.TcAgentOrchestrator;
        if (!orch || typeof orch.isAgentJobRunning !== 'function' || !orch.isAgentJobRunning()) return false;
        return typeof orch.getLastJobMode === 'function' && orch.getLastJobMode() === 'fill_gaps_only';
    }

    function restoreValidateDrawerSummaryInPlace(scope) {
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.syncValidateDrawerSummary === 'function') {
            global.TcWorkbenchEnhancements.syncValidateDrawerSummary(scope);
        }
    }

    function hideFillProgressPanelOnly(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return dismissValidateDrawerFillProgressPresentation(scope, { switchTab: false });
    }

    function suspendValidateDrawerFillProgressPresentation(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return useCovScope(scope, function () {
            hideFillProgressPanelOnly(scope);
            var returnTab = covState().fillProgressReturnTab || 'coverage';
            switchValidateTab(returnTab === 'coverage' ? 'coverage' : 'issues');
            restoreValidateDrawerSummaryInPlace(scope);
        });
    }

    function onValidateDrawerClosed(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return useCovScope(scope, function () {
            if (!covState().fillProgressActive) return;
            if (isCoverageFillJobRunning()) {
                suspendValidateDrawerFillProgressPresentation(scope);
                return;
            }
            /* job 已结束、后台刷新问题清单/矩阵中：保持 fillProgressActive，等待 refreshValidateDrawerAfterFill dismiss */
            return;
        });
    }

    function onValidateDrawerOpened(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return useCovScope(scope, function () {
            if (covState().fillProgressActive) {
                enterValidateDrawerFillProgressMode(scope);
                var orch = global.TcAgentOrchestrator;
                if (orch && typeof orch.getAgentLastPayload === 'function') {
                    var payload = orch.getAgentLastPayload();
                    if (payload && typeof orch.renderCoverageFillProgressInValidateDrawer === 'function') {
                        orch.renderCoverageFillProgressInValidateDrawer(payload, scope);
                    }
                }
                return 'fill';
            }
            hideFillProgressPanelOnly(scope);
            restoreValidateDrawerSummaryInPlace(scope);
            return null;
        });
    }

    function isValidateDrawerOpenForFill(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return !!(global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.isValidateDrawerOpen === 'function' &&
            global.TcWorkbenchEnhancements.isValidateDrawerOpen(scope));
    }

    function onFillJobStartingInValidateDrawer(scope) {
        scope = normalizeScope(scope || _pendingCoverageFillScope || _covScope || 'single');
        useCovScope(scope, function () {
            covState().pendingFillRefresh = true;
            if (!isValidateDrawerOpenForFill(scope) &&
                global.TcWorkbenchEnhancements &&
                typeof global.TcWorkbenchEnhancements.openValidateDrawer === 'function') {
                global.TcWorkbenchEnhancements.openValidateDrawer({
                    center: true,
                    scope: scope,
                    forceFetch: false,
                    _skipTurnLoad: true
                });
            }
            enterValidateDrawerFillProgressMode(scope);
            syncStandaloneQcButtonChromeAfterFillBusyChange();
        });
    }

    function gapsForFill() {
        if (!covState().matrix) return { gaps: [], pointIds: [] };
        var points = covState().matrix.points || [];
        var mappings = covState().matrix.mappings || [];
        var gaps = [];
        points.forEach(function (p) {
            var m = getMappingByPointId(p.id);
            var status = m ? m.status : 'uncovered';
            if (status !== 'uncovered') return;
            gaps.push({
                point_id: p.id,
                module: (p.path || p.title || '').split('>')[0].trim(),
                scenario: p.title,
                priority: p.priority || 'P1',
                reason: p.description || '',
                coverage_status: status
            });
        });
        return {
            gaps: gaps,
            pointIds: gaps.map(function (g) { return g.point_id; })
        };
    }

    /**
     * 启动补充任务（新方法）：只把传入的 gaps 交给 AI。
     * 从 triggerFillFromMatrix 抽出，不改 Agent / 删过度等其它路径。
     */
    function launchFillGapsOnlyJob(gaps) {
        gaps = Array.isArray(gaps) ? gaps.slice() : [];
        if (!gaps.length) {
            toast('没有需要补全的功能点', { variant: 'info' });
            return;
        }
        if (!shouldShowCoverageFillAllButton(_covScope)) {
            return;
        }
        if (!covState().matrix) {
            alertBox('请先运行问题清单矩阵分析。', { title: '无矩阵数据' });
            return;
        }
        if (typeof global.TcAgentOrchestrator === 'undefined' ||
            typeof global.TcAgentOrchestrator.startAgentJob !== 'function') {
            alertBox('Agent 模块未加载，无法补全。', { variant: 'error' });
            return;
        }
        var pointIds = gaps.map(function (g) { return g && g.point_id; }).filter(Boolean);
        var intent = gaps.length === 1
            ? '补全以下这 1 个未覆盖的需求功能点，不要重复已有用例。'
            : ('补全以下这 ' + gaps.length + ' 个未覆盖的需求功能点，不要重复已有用例。');

        var fillScope = _covScope;
        _pendingCoverageFillScope = fillScope;
        covState().pendingFillRefresh = true;

        var fillJobOpts = {
            mode: 'fill_gaps_only',
            userIntent: intent,
            fill_gap_mode: 'both',
            fromCoverageFill: true,
            matrix_gaps: gaps,
            target_point_ids: pointIds,
            coverage_matrix: covState().matrix
        };
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.getValidateBatchSnapshot === 'function') {
            var batchSnap = global.TcWorkbenchEnhancements.getValidateBatchSnapshot(fillScope);
            if (batchSnap && batchSnap.batchRowCount > 0) {
                fillJobOpts.validate_batch_row_start = batchSnap.batchRowStart;
                fillJobOpts.validate_batch_row_count = batchSnap.batchRowCount;
            }
        }
        function launchFillJob() {
            global.TcAgentOrchestrator.startAgentJob(fillJobOpts);
        }
        if (typeof global.requestAnimationFrame === 'function') {
            global.requestAnimationFrame(function () {
                global.requestAnimationFrame(launchFillJob);
            });
            return;
        }
        launchFillJob();
    }

    /** 遗漏项勾选弹窗展示文案（新方法） */
    function formatGapChoiceLabelForFillPicker(gap, index) {
        gap = gap || {};
        var title = normalizeCoverageCardText(gap.scenario || gap.module || '');
        var reason = normalizeCoverageCardText(gap.reason || '');
        if (title && reason && title !== reason) return title + ' — ' + reason;
        if (title) return title;
        if (reason) return reason;
        return '遗漏项 ' + (index + 1);
    }

    /**
     * ≥2 条遗漏时弹出勾选框（新方法，独立 DOM，不改 tcAppDialog）。
     * resolve: 选中的 gaps 数组；取消 resolve null。
     */
    function promptSelectGapsForFill(gaps) {
        gaps = Array.isArray(gaps) ? gaps.slice() : [];
        function escHtml(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }
        return new Promise(function (resolve) {
            var existing = document.getElementById('tc-fill-gap-picker');
            if (existing) existing.remove();

            var root = document.createElement('div');
            root.id = 'tc-fill-gap-picker';
            root.className = 'tc-fill-gap-picker';
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-labelledby', 'tc-fill-gap-picker-title');

            var itemsHtml = gaps.map(function (g, i) {
                var id = 'tc-fill-gap-pick-' + i;
                var label = formatGapChoiceLabelForFillPicker(g, i);
                return (
                    '<label class="tc-fill-gap-picker__item" for="' + id + '">' +
                        '<input type="checkbox" id="' + id + '" class="tc-fill-gap-picker__cb" data-gap-idx="' + i + '" checked>' +
                        '<span class="tc-fill-gap-picker__text">' + escHtml(label) + '</span>' +
                    '</label>'
                );
            }).join('');

            root.innerHTML =
                '<div class="tc-fill-gap-picker__scrim" data-fill-picker-close="1"></div>' +
                '<div class="tc-fill-gap-picker__panel">' +
                    '<h3 id="tc-fill-gap-picker-title" class="tc-fill-gap-picker__title">选择要补充的遗漏项</h3>' +
                    '<p class="tc-fill-gap-picker__hint">共 ' + gaps.length + ' 项，请勾选需要补充的内容（至少选 1 项）</p>' +
                    '<div class="tc-fill-gap-picker__toolbar">' +
                        '<button type="button" class="btn btn-secondary btn-sm" data-fill-picker-all="1">全选</button>' +
                        '<button type="button" class="btn btn-secondary btn-sm" data-fill-picker-none="1">全不选</button>' +
                    '</div>' +
                    '<div class="tc-fill-gap-picker__list">' + itemsHtml + '</div>' +
                    '<div class="tc-fill-gap-picker__footer">' +
                        '<button type="button" class="btn btn-secondary" data-fill-picker-close="1">取消</button>' +
                        '<button type="button" class="btn btn-primary" data-fill-picker-ok="1">开始补充</button>' +
                    '</div>' +
                '</div>';

            function close(result) {
                document.removeEventListener('keydown', onKey);
                if (root.parentNode) root.parentNode.removeChild(root);
                document.body.classList.remove('overflow-hidden');
                resolve(result);
            }

            function selectedGaps() {
                var out = [];
                root.querySelectorAll('.tc-fill-gap-picker__cb:checked').forEach(function (cb) {
                    var idx = parseInt(cb.getAttribute('data-gap-idx'), 10);
                    if (!isNaN(idx) && gaps[idx]) out.push(gaps[idx]);
                });
                return out;
            }

            function syncOkBtn() {
                var ok = root.querySelector('[data-fill-picker-ok]');
                if (ok) ok.disabled = selectedGaps().length === 0;
            }

            function onKey(ev) {
                if (ev.key === 'Escape') {
                    ev.preventDefault();
                    close(null);
                }
            }

            root.addEventListener('click', function (ev) {
                var t = ev.target;
                if (!t) return;
                var closeEl = t.closest ? t.closest('[data-fill-picker-close]') : null;
                if (closeEl || (t.getAttribute && t.getAttribute('data-fill-picker-close'))) {
                    close(null);
                    return;
                }
                var allEl = t.closest ? t.closest('[data-fill-picker-all]') : null;
                if (allEl || (t.getAttribute && t.getAttribute('data-fill-picker-all'))) {
                    root.querySelectorAll('.tc-fill-gap-picker__cb').forEach(function (cb) { cb.checked = true; });
                    syncOkBtn();
                    return;
                }
                var noneEl = t.closest ? t.closest('[data-fill-picker-none]') : null;
                if (noneEl || (t.getAttribute && t.getAttribute('data-fill-picker-none'))) {
                    root.querySelectorAll('.tc-fill-gap-picker__cb').forEach(function (cb) { cb.checked = false; });
                    syncOkBtn();
                    return;
                }
                var okEl = t.closest ? t.closest('[data-fill-picker-ok]') : null;
                if (okEl || (t.getAttribute && t.getAttribute('data-fill-picker-ok'))) {
                    var picked = selectedGaps();
                    if (!picked.length) {
                        toast('请至少选择 1 项遗漏再补充', { variant: 'warning', duration: 2400 });
                        return;
                    }
                    close(picked);
                }
            });
            root.addEventListener('change', function (ev) {
                if (ev.target && ev.target.classList && ev.target.classList.contains('tc-fill-gap-picker__cb')) {
                    syncOkBtn();
                }
            });

            document.body.appendChild(root);
            document.body.classList.add('overflow-hidden');
            document.addEventListener('keydown', onKey);
            syncOkBtn();
            if (typeof global.tcEnsureModalTopLayer === 'function') {
                try { global.tcEnsureModalTopLayer(root); } catch (e0) { /* ignore */ }
            }
        });
    }

    /** 矩阵原入口：仍补全部遗漏（行为不变） */
    function triggerFillFromMatrix() {
        if (!shouldShowCoverageFillAllButton(_covScope)) {
            return;
        }
        if (!covState().matrix) {
            alertBox('请先运行问题清单矩阵分析。', { title: '无矩阵数据' });
            return;
        }
        var pack = gapsForFill();
        if (!pack.gaps.length) {
            toast('没有需要补全的功能点', { variant: 'info' });
            return;
        }
        launchFillGapsOnlyJob(pack.gaps);
    }

    function onFillJobStarting() {
        onFillJobStartingInValidateDrawer(_pendingCoverageFillScope || _covScope || 'single');
    }

    function onFillJobCancelled() {
        var fillScope = normalizeScope(_pendingCoverageFillScope || _covScope || 'single');
        useCovScope(fillScope, function () {
            covState().pendingFillRefresh = false;
            restoreValidateDrawerToQualityResultsAfterFillCancel(fillScope);
            syncStandaloneQcButtonChromeAfterFillBusyChange();
        });
    }

    function reopenCoverageAfterFill(matrix) {
        var tablePayload = collectTablePayload();
        setMatrix(matrix, tablePayload.rowOffset);
        if (global.TcAgentOrchestrator &&
            typeof global.TcAgentOrchestrator.syncAgentCoverageDisplay === 'function') {
            global.TcAgentOrchestrator.syncAgentCoverageDisplay(matrix);
        }
        /* 问题清单主导：补充后回问题清单，避免打开已隐藏的矩阵 Tab */
        if (isIssueListPrimaryActionsMode()) {
            switchValidateTab('issues');
            toast('补充完成，问题清单已更新', {
                variant: 'success',
                duration: 3200
            });
            return;
        }
        openCoverageTab();
        toast('问题清单矩阵已更新：' + ((matrix.summary && matrix.summary.coverage_rate) || '—') + '%', {
            variant: 'success',
            duration: 3200
        });
    }

    function applyFillValidationToDrawer(payload, fillScope) {
        var drawerScope = normalizeScope(fillScope || _pendingCoverageFillScope || _covScope || 'single');
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.applyAgentValidationFromJobInPlace === 'function') {
            global.TcWorkbenchEnhancements.applyAgentValidationFromJobInPlace(payload, drawerScope);
        } else if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.applyAgentValidationFromJob === 'function') {
            global.TcWorkbenchEnhancements.applyAgentValidationFromJob(payload, drawerScope);
        } else {
            openCoverageTab(drawerScope);
        }
    }

    function syncCoverageMatrixFromFillPayload(payload) {
        var matrix = (payload.result && payload.result.coverage_matrix) || null;
        if (!matrix && payload.steps) {
            payload.steps.forEach(function (st) {
                if (st.step_key === 'coverage' && st.output && st.output.coverage_matrix) {
                    matrix = st.output.coverage_matrix;
                }
            });
        }
        if (!matrix) return Promise.resolve(false);
        var tablePayload = collectTablePayload();
        setMatrix(matrix, tablePayload.rowOffset);
        if (global.TcAgentOrchestrator &&
            typeof global.TcAgentOrchestrator.syncAgentCoverageDisplay === 'function') {
            global.TcAgentOrchestrator.syncAgentCoverageDisplay(matrix);
        }
        return Promise.resolve(true);
    }


    function persistRequirementCasesAfterCoverageFillComplete(payload) {
        if (!payload || payload.status !== 'done' || payload.mode !== 'fill_gaps_only') {
            return Promise.resolve(null);
        }
        if (!global.TcRequirementCaseStore ||
            typeof global.TcRequirementCaseStore.persistAfterCoverageFillInDrawer !== 'function') {
            return Promise.resolve(null);
        }
        var newRows = (payload.result && payload.result.new_rows) || 0;
        return global.TcRequirementCaseStore.persistAfterCoverageFillInDrawer({ newRows: newRows });
    }

    function refreshValidateDrawerAfterFill(payload, capturedFillScope) {
        var fillScope = capturedFillScope || _pendingCoverageFillScope || _covScope || 'single';
        useCovScope(fillScope, function () {
            covState().pendingFillRefresh = false;
        });
        var fillNewRows = (payload.result && payload.result.new_rows) || 0;
        if (fillNewRows > 0 && global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.extendValidateBatchSnapshot === 'function') {
            global.TcWorkbenchEnhancements.extendValidateBatchSnapshot(fillScope, fillNewRows);
        }
        return syncCoverageMatrixFromFillPayload(payload).then(function (hasMatrix) {
            if (!hasMatrix) {
                return runCoverageAnalyze().then(function () {
                    if (global.TcAgentOrchestrator &&
                        typeof global.TcAgentOrchestrator.syncAgentCoverageDisplay === 'function' &&
                        covState().matrix) {
                        global.TcAgentOrchestrator.syncAgentCoverageDisplay(covState().matrix);
                    }
                    applyFillValidationToDrawer(payload, fillScope);
                    syncStandaloneQcButtonChromeAfterFillBusyChange();
                    return Promise.resolve().finally(function () {
                        dismissValidateDrawerFillProgressPresentation(fillScope, { switchTab: true });
                        if (global.TcWorkbenchEnhancements &&
                            typeof global.TcWorkbenchEnhancements.ensureValidateCleanPassUiAfterFill === 'function') {
                            global.TcWorkbenchEnhancements.ensureValidateCleanPassUiAfterFill(fillScope);
                        }
                        scheduleLeftPanelLanhuNavUnlockAfterCoverageFillTerminal(fillScope);
                    });
                });
            }
            applyFillValidationToDrawer(payload, fillScope);
            syncStandaloneQcButtonChromeAfterFillBusyChange();
            return Promise.resolve().finally(function () {
                dismissValidateDrawerFillProgressPresentation(fillScope, { switchTab: true });
                if (global.TcWorkbenchEnhancements &&
                    typeof global.TcWorkbenchEnhancements.ensureValidateCleanPassUiAfterFill === 'function') {
                    global.TcWorkbenchEnhancements.ensureValidateCleanPassUiAfterFill(fillScope);
                }
                scheduleLeftPanelLanhuNavUnlockAfterCoverageFillTerminal(fillScope);
            });
        });
    }

    function onAgentJobFinished(payload) {
        var scope = 'single';
        var capturedFillScope = null;
        if (payload && payload.mode === 'fill_gaps_only') {
            capturedFillScope = _pendingCoverageFillScope || _covScope || 'single';
            scope = capturedFillScope;
        }
        return useCovScope(scope, function () {
            try {
                return onAgentJobFinishedImpl(payload, capturedFillScope);
            } finally {
                if (payload && payload.mode === 'fill_gaps_only') {
                    _pendingCoverageFillScope = null;
                }
            }
        });
    }

    function onAgentJobFinishedImpl(payload, capturedFillScope) {
        if (!payload || payload.status !== 'done') {
            if (covState().pendingFillRefresh || covState().fillProgressActive) {
                covState().pendingFillRefresh = false;
                exitValidateDrawerFillProgressMode(capturedFillScope || _pendingCoverageFillScope || _covScope || 'single');
                syncStandaloneQcButtonChromeAfterFillBusyChange();
            }
            return;
        }
        var wasFillRefresh = covState().pendingFillRefresh || payload.mode === 'fill_gaps_only';
        if (wasFillRefresh) {
            refreshValidateDrawerAfterFill(payload, capturedFillScope);
            return;
        }
        var matrix = null;
        if (payload.result && payload.result.coverage_matrix) {
            matrix = payload.result.coverage_matrix;
        }
        if (!matrix && payload.steps) {
            payload.steps.forEach(function (st) {
                if (st.step_key === 'coverage' && st.output && st.output.coverage_matrix) {
                    matrix = st.output.coverage_matrix;
                }
            });
        }
        if (matrix) {
            var tablePayload = collectTablePayload();
            setMatrix(matrix, tablePayload.rowOffset);
            if (global.TcAgentOrchestrator &&
                typeof global.TcAgentOrchestrator.syncAgentCoverageDisplay === 'function') {
                global.TcAgentOrchestrator.syncAgentCoverageDisplay(matrix);
            }
        }
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.applyAgentValidationFromJob === 'function') {
            global.TcWorkbenchEnhancements.applyAgentValidationFromJob(payload);
        }
    }

    /**
     * 问题清单主导动作模式（新开关）：隐藏矩阵 Tab，动作入口迁到问题清单。
     * 不删除矩阵引擎 / coverage panel DOM，避免影响删过度与补充数据链。
     */
    function isIssueListPrimaryActionsMode() {
        if (global.TC_ISSUE_LIST_PRIMARY_ACTIONS === false) return false;
        return true;
    }

    /** 给抽屉打上 issues-only 标记并默认落在问题清单（新方法，不改 switchValidateTab 主体） */
    function applyIssueListPrimaryActionsChrome(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        if (!isIssueListPrimaryActionsMode()) return;
        var drawer = getValidateDrawerEl(scope);
        if (drawer) drawer.classList.add('tc-validate-drawer--issues-only');
        var covTab = document.getElementById('tc-validate-tab-coverage-' + scope);
        if (covTab) {
            covTab.classList.add('hidden');
            covTab.setAttribute('aria-hidden', 'true');
            covTab.tabIndex = -1;
        }
        useCovScope(scope, function () {
            if (covState().activeTab === 'coverage') {
                switchValidateTab('issues');
            }
        });
    }

    /**
     * 问题清单「补充用例」入口（新方法）：先同步 gap，≥2 条时勾选后再启动。
     * 不改 triggerFillFromMatrix 本体（矩阵仍默认补全部）。
     */
    function triggerFillFromIssueList() {
        var scope = _covScope || 'single';
        if (!shouldShowCoverageFillAllButton(scope)) {
            toast('历史会话仅可查看，不能补充用例', { variant: 'info', duration: 2800 });
            return;
        }
        var enh = global.TcWorkbenchEnhancements;
        var stored = enh && typeof enh.getLastValidation === 'function'
            ? enh.getLastValidation(scope)
            : null;
        if (stored) {
            syncValidationMatrixFromStored(stored, scope);
        }
        if (!covState().matrix) {
            alertBox('请先完成质量检查后再补充。', { title: '无矩阵数据' });
            return;
        }
        covState().activeTab = 'issues';
        var pack = gapsForFill();
        var gaps = pack.gaps.slice();
        if (!gaps.length) {
            toast('没有需要补全的功能点', { variant: 'info' });
            return;
        }
        if (gaps.length < 2) {
            launchFillGapsOnlyJob(gaps);
            return;
        }
        promptSelectGapsForFill(gaps).then(function (picked) {
            if (!picked || !picked.length) return;
            useCovScope(scope, function () {
                launchFillGapsOnlyJob(picked);
            });
        });
    }

    /**
     * 问题清单删过度入口（新方法）：委托现有 deleteOverGeneratedFromMatrix，不改删除引擎。
     */
    function deleteOverGeneratedFromIssueList(options) {
        return deleteOverGeneratedFromMatrix(options || { mode: 'all' });
    }

    /** 刷新问题清单动作条计数（新方法） */
    function renderIssueListActionsToolbar(scope) {
        scope = normalizeScope(scope || _covScope || 'single');
        return useCovScope(scope, function () {
            var bar = document.getElementById('tc-issues-actions-toolbar-' + scope);
            var delBtn = document.getElementById('tc-issues-delete-over-btn-' + scope);
            var fillBtn = document.getElementById('tc-issues-fill-all-btn-' + scope);
            if (!bar) return;

            var drawer = getValidateDrawerEl(scope);
            if (drawer && (
                drawer.classList.contains('tc-validate-drawer--clean-pass') ||
                drawer.classList.contains('tc-validate-drawer--fill-active')
            )) {
                bar.classList.add('hidden');
                bar.setAttribute('aria-hidden', 'true');
                return;
            }

            var overCount = 0;
            var gapCount = 0;
            var enh = global.TcWorkbenchEnhancements;
            var stored = enh && typeof enh.getLastValidation === 'function'
                ? enh.getLastValidation(scope)
                : null;
            if (stored) {
                overCount = (stored.over_generated_issues || []).length ||
                    (stored.over_generated_count || 0);
                gapCount = (stored.gap_issues || []).length || (stored.gap_count || 0);
            }
            if (covState().matrix) {
                var mOver = ((covState().matrix.over_generated_rows || []).length) ||
                    ((covState().matrix.summary && covState().matrix.summary.over_generated) || 0);
                var mGap = (covState().matrix.summary && covState().matrix.summary.uncovered) || 0;
                if (mOver > overCount) overCount = mOver;
                if (mGap > gapCount) gapCount = mGap;
            }

            var show = overCount > 0 || gapCount > 0;
            bar.classList.toggle('hidden', !show);
            bar.setAttribute('aria-hidden', show ? 'false' : 'true');

            if (delBtn) {
                delBtn.disabled = !overCount;
                delBtn.textContent = '删除过度生成 (' + overCount + ')';
            }
            if (fillBtn) {
                var showFill = shouldShowCoverageFillAllButton(scope);
                fillBtn.classList.toggle('hidden', !showFill);
                fillBtn.hidden = !showFill;
                fillBtn.setAttribute('aria-hidden', showFill ? 'false' : 'true');
                if (showFill) {
                    fillBtn.disabled = !gapCount;
                    fillBtn.textContent = '补充用例 (' + gapCount + ')';
                }
            }
        });
    }

    function bindIssueListActionsToolbar(scope) {
        scope = normalizeScope(scope);
        function runInScope(fn) {
            return function () { useCovScope(scope, fn); };
        }
        var fillBtn = document.getElementById('tc-issues-fill-all-btn-' + scope);
        if (fillBtn && !fillBtn._tcIssuesActBound) {
            fillBtn._tcIssuesActBound = true;
            fillBtn.addEventListener('click', runInScope(function () {
                triggerFillFromIssueList();
            }));
        }
        var delBtn = document.getElementById('tc-issues-delete-over-btn-' + scope);
        if (delBtn && !delBtn._tcIssuesActBound) {
            delBtn._tcIssuesActBound = true;
            delBtn.addEventListener('click', runInScope(function () {
                deleteOverGeneratedFromIssueList({ mode: 'all' });
            }));
        }
    }

    function bindUiForScope(scope) {
        scope = normalizeScope(scope);

        function runInScope(fn) {
            return function () { useCovScope(scope, fn); };
        }

        var issuesTab = document.getElementById('tc-validate-tab-issues-' + scope);
        var covTab = document.getElementById('tc-validate-tab-coverage-' + scope);
        if (issuesTab && !issuesTab._tcCovBound) {
            issuesTab._tcCovBound = true;
            issuesTab.addEventListener('click', runInScope(function () { switchValidateTab('issues'); }));
        }
        if (covTab && !covTab._tcCovBound) {
            covTab._tcCovBound = true;
            covTab.addEventListener('click', runInScope(function () {
                /* 问题清单主导：拦截切到矩阵，避免空白面板 */
                if (isIssueListPrimaryActionsMode()) {
                    switchValidateTab('issues');
                    return;
                }
                switchValidateTab('coverage');
            }));
        }
        var runMatrixBtn = document.getElementById('tc-issue-matrix-run-btn-' + scope);
        if (runMatrixBtn && !runMatrixBtn._tcCovBound) {
            runMatrixBtn._tcCovBound = true;
            runMatrixBtn.addEventListener('click', runInScope(function () {
                runCoverageAnalyzeInner({});
            }));
        }
        var fillAll = document.getElementById('tc-coverage-fill-all-btn-' + scope);
        if (fillAll && !fillAll._tcCovBound) {
            fillAll._tcCovBound = true;
            fillAll.addEventListener('click', runInScope(function () { triggerFillFromMatrix(); }));
        }
        var delOverBtn = document.getElementById('tc-coverage-delete-over-btn-' + scope);
        if (delOverBtn && !delOverBtn._tcCovBound) {
            delOverBtn._tcCovBound = true;
            delOverBtn.addEventListener('click', runInScope(function () {
                deleteOverGeneratedFromMatrix({ mode: 'all' });
            }));
        }
        var filterSeg = document.getElementById('tc-coverage-filter-' + scope);
        if (filterSeg && !filterSeg._tcCovBound) {
            filterSeg._tcCovBound = true;
            filterSeg.addEventListener('click', runInScope(function (ev) {
                var chip = ev.target && ev.target.closest
                    ? ev.target.closest('.tc-coverage-filter-chip')
                    : null;
                if (!chip || !filterSeg.contains(chip)) return;
                var next = chip.getAttribute('data-filter') || 'all';
                if (next !== 'all' && next !== 'uncovered' && next !== 'over') next = 'all';
                covState().filter = next;
                syncCoverageFilterChips();
                renderCoverageMatrixList();
            }));
        }
        bindIssueListActionsToolbar(scope);
        applyIssueListPrimaryActionsChrome(scope);
    }


    function resetScopeState(scopeKey) {
        var key = normalizeScope(scopeKey);
        var st = scopeStates[key];
        st.matrix = null;
        st.analyzing = false;
        st.filter = 'all';
        st.rowOffset = 0;
        st.activeTab = 'issues';
        useCovScope(key, function () {
            renderCoveragePanel();
            updateCoverageTabBadge();
        });
    }

    function init() {
        if (!document.querySelector('.tc-workbench-scope')) return;
        bindUiForScope('single');
        bindMatrixTableMutationSync();
        /* 延后一层包装，确保能捕获到最终 deleteRow 入参 */
        global.setTimeout(function () { bindMatrixTableMutationSync(); }, 0);
        useCovScope('single', function () { switchValidateTab('issues'); });
    }

    global.TcIssueMatrix = {
        init: init,
        setMatrix: function (matrix, rowOffset, scope) {
            return useCovScope(scope == null ? 'single' : scope, function () {
                setMatrix(matrix, rowOffset);
            });
        },
        mergeOverGeneratedIssues: function (issues, scope, replaceExisting) {
            return useCovScope(scope == null ? 'single' : scope, function () {
                mergeOverGeneratedIssues(issues, replaceExisting);
            });
        },
        mergeGapIssuesToUncovered: function (issues, scope) {
            return useCovScope(scope == null ? 'single' : scope, function () {
                mergeGapIssuesToUncovered(issues);
            });
        },
        syncValidationMatrixFromStored: function (stored, scope) {
            return syncValidationMatrixFromStored(stored, scope);
        },
        alignMatrixOverGeneratedFromValidation: function (stored, scope, opts) {
            return useCovScope(scope == null ? 'single' : scope, function () {
                return alignMatrixOverGeneratedFromValidation(stored, opts);
            });
        },
        openCoverageTab: function (scope) {
            if (isIssueListPrimaryActionsMode()) {
                applyIssueListPrimaryActionsChrome(scope || 'single');
                return useCovScope(scope || 'single', function () {
                    switchValidateTab('issues');
                });
            }
            openCoverageTab(scope || 'single');
        },
        switchValidateTab: function (tabId, scope) {
            return useCovScope(scope == null ? 'single' : scope, function () {
                if (isIssueListPrimaryActionsMode() && tabId === 'coverage') {
                    tabId = 'issues';
                }
                switchValidateTab(tabId);
            });
        },
        isIssueListPrimaryActionsMode: isIssueListPrimaryActionsMode,
        applyIssueListPrimaryActionsChrome: applyIssueListPrimaryActionsChrome,
        triggerFillFromIssueList: function (scope) {
            return useCovScope(scope == null ? 'single' : scope, function () {
                triggerFillFromIssueList();
            });
        },
        deleteOverGeneratedFromIssueList: function (options, scope) {
            return useCovScope(scope == null ? 'single' : scope, function () {
                return deleteOverGeneratedFromIssueList(options);
            });
        },
        deleteOverGeneratedFromMatrix: function (options, scope) {
            return useCovScope(scope == null ? 'single' : scope, function () {
                return deleteOverGeneratedFromMatrix(options);
            });
        },
        renderIssueListActionsToolbar: renderIssueListActionsToolbar,
        isValidateDrawerFillInProgress: isValidateDrawerFillInProgress,
        isCoverageFillJobBlockingLanhuNav: isCoverageFillJobBlockingLanhuNav,
        resetLanhuNavUnlockedAfterCoverageFillTerminal: resetLanhuNavUnlockedAfterCoverageFillTerminal,
        markLanhuNavUnlockedAfterCoverageFillTerminal: markLanhuNavUnlockedAfterCoverageFillTerminal,
        isLanhuNavPostCoverageFillBypassAllowed: isLanhuNavPostCoverageFillBypassAllowed,
        shouldBypassLanhuGenLockAfterCoverageFillTerminal: shouldBypassLanhuGenLockAfterCoverageFillTerminal,
        releaseLeftPanelLanhuNavAfterCoverageFillComplete: forceReleaseLeftPanelLanhuNavAfterCoverageFillComplete,
        isValidateDrawerFillCloseCancelPromptNeeded: isValidateDrawerFillCloseCancelPromptNeeded,
        cancelCoverageFillFromDrawerClose: cancelCoverageFillFromDrawerClose,
        restoreValidateDrawerToQualityResultsAfterFillCancel: restoreValidateDrawerToQualityResultsAfterFillCancel,
        onAgentJobFinished: onAgentJobFinished,
        onFillJobStarting: onFillJobStarting,
        syncValidateDrawerTabsDuringFillProgress: syncValidateDrawerTabsDuringFillProgress,
        onFillJobCancelled: onFillJobCancelled,
        enterValidateDrawerFillProgressMode: enterValidateDrawerFillProgressMode,
        dismissValidateDrawerFillProgressPresentation: dismissValidateDrawerFillProgressPresentation,
        exitValidateDrawerFillProgressMode: exitValidateDrawerFillProgressMode,
        onValidateDrawerClosed: onValidateDrawerClosed,
        onValidateDrawerOpened: onValidateDrawerOpened,
        renderFillProgressInValidateDrawer: function (payload, scope) {
            scope = normalizeScope(scope || _pendingCoverageFillScope || _covScope || 'single');
            return useCovScope(scope, function () {
                if (global.TcAgentOrchestrator &&
                    typeof global.TcAgentOrchestrator.renderCoverageFillProgressInValidateDrawer === 'function') {
                    global.TcAgentOrchestrator.renderCoverageFillProgressInValidateDrawer(payload, scope);
                }
            });
        },
        resetScopeState: resetScopeState,
        runIssueMatrixAnalyze: function (scope, options) { return runCoverageAnalyze(scope, options); },
        markValidationCoverageReady: markValidationCoverageReady,
        refreshCoveragePanel: refreshCoveragePanel,
        resetFillUiBeforeStandaloneQc: function (scope) {
            return useCovScope(scope == null ? 'single' : scope, resetFillUiBeforeStandaloneQc);
        },
        prepareForValidationRun: function (scope) {
            return useCovScope(scope == null ? 'single' : scope, prepareForValidationRun);
        },
        getMatrix: function (scope) {
            return useCovScope(scope == null ? 'single' : scope, function () {
                return covState().matrix;
            });
        }
    };
    global.TcCoverageMatrix = global.TcIssueMatrix;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
