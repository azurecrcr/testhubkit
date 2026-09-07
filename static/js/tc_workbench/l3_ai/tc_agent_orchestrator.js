/**
 * TestHub TC Workbench — L3 AI Agent 多步生成编排
 * 与 tc_ai_generate.js 并行，不修改单次生成链路。
 */
(function (global) {
    'use strict';

    var     state = {
        quotaToastKey: null,
        jobId: null,
        eventSource: null,
        pollTimer: null,
        running: false,
        genModeLocked: false,
        agentMergeMode: 'append',
        agentExistingRowsSnapshot: null,
        agentRagContext: '',
        agentKnowledgeBundle: null,
        terminalHandled: false,
        resultApplied: false,
        lastApplyRowCount: 0,
        lastPayload: null,
        cancelRequested: false,
        abortController: null,
        coverageFillInValidateDrawer: false
    };

    var agentSmoothProgress = {
        timer: null,
        displayed: {},
        targets: {},
        creepCeiling: {}
    };

    function shouldSmoothAgentStep(st) {
        if (!st || st.status !== 'running') return false;
        var key = st.step_key || '';
        if (key === 'generate_modules') return false;
        var out = st.output || {};
        return out.phase !== 'parallel_gen';
    }

    function agentStepServerPercent(st) {
        if (!st) return 0;
        var out = st.output || {};
        if (st.status === 'done') return 100;
        if (st.status === 'running') {
            if (out.phase === 'parallel_gen' && typeof out.progress_percent === 'number') {
                return Math.max(0, Math.min(100, Math.round(out.progress_percent)));
            }
            if (typeof out.progress_percent === 'number') {
                return Math.max(0, Math.min(100, Math.round(out.progress_percent)));
            }
            if (out.total && out.current) {
                return Math.max(0, Math.min(100, Math.round((Number(out.current) / Number(out.total)) * 100)));
            }
            return null;
        }
        return 0;
    }

    function syncAgentSmoothProgressTargets(steps) {
        (steps || []).forEach(function (st) {
            var key = st.step_key || ('idx_' + st.step_index);
            if (!key) return;
            if (st.status === 'done') {
                agentSmoothProgress.displayed[key] = 100;
                agentSmoothProgress.targets[key] = 100;
                agentSmoothProgress.creepCeiling[key] = 100;
                return;
            }
            if (!shouldSmoothAgentStep(st)) {
                var direct = agentStepServerPercent(st);
                if (direct != null) {
                    agentSmoothProgress.displayed[key] = direct;
                    agentSmoothProgress.targets[key] = direct;
                    agentSmoothProgress.creepCeiling[key] = direct;
                }
                return;
            }
            var target = agentStepServerPercent(st);
            if (target == null) target = 0;
            var prevTarget = agentSmoothProgress.targets[key];
            agentSmoothProgress.targets[key] = target;
            if (agentSmoothProgress.displayed[key] == null) {
                agentSmoothProgress.displayed[key] = target;
            }
            var out = st.output || {};
            var phase = String(out.phase || '');
            var waitPhase = phase === 'llm_request' || phase === 'lanhu_fetch' ||
                phase === 'extract_points' || phase === 'format_check' || phase === 'llm_validate';
            var ceiling = waitPhase ? Math.min(92, target + 24) : Math.min(98, target + 8);
            agentSmoothProgress.creepCeiling[key] = ceiling;
            // Do not snap displayed down to server target on poll refresh; creep may sit above target until next jump.
            if (typeof prevTarget === 'number' && target < prevTarget) {
                agentSmoothProgress.displayed[key] = Math.min(agentSmoothProgress.displayed[key], target);
            }
            if (agentSmoothProgress.displayed[key] > ceiling) {
                agentSmoothProgress.displayed[key] = ceiling;
            }
        });
    }

    function agentStepDisplayPercent(st) {
        var key = st.step_key || ('idx_' + st.step_index);
        if (st.status === 'done') return 100;
        if (!shouldSmoothAgentStep(st)) {
            var direct = agentStepServerPercent(st);
            return direct == null ? 0 : direct;
        }
        var cur = agentSmoothProgress.displayed[key];
        if (cur == null) cur = 0;
        return Math.max(0, Math.min(100, Math.round(cur)));
    }

    function patchAgentSmoothProgressBars() {
        var roots = [];
        var agentList = $('tc-agent-step-list');
        if (agentList) roots.push(agentList);
        if (state.coverageFillInValidateDrawer) {
            var fillInner = document.getElementById('tc-validate-fill-progress-inner-single');
            if (fillInner) roots.push(fillInner);
        }
        if (!roots.length || !state.lastPayload) return;
        (state.lastPayload.steps || []).forEach(function (st) {
            if (!st || !st.step_key) return;
            roots.forEach(function (root) {
                var el = root.querySelector('[data-step-key="' + st.step_key + '"]');
                if (!el) return;
                var pct = agentStepDisplayPercent(st);
                var fill = el.querySelector('.tc-agent-step__bar-fill');
                var pctEl = el.querySelector('.tc-agent-step__pct');
                var bar = el.querySelector('.tc-agent-step__bar');
                if (fill) fill.style.width = pct + '%';
                if (pctEl) pctEl.textContent = pct + '%';
                if (bar) bar.setAttribute('aria-valuenow', String(pct));
            });
        });
    }

    function tickAgentSmoothProgress() {
        var steps = (state.lastPayload && state.lastPayload.steps) || [];
        var changed = false;
        steps.forEach(function (st) {
            if (!shouldSmoothAgentStep(st)) return;
            var key = st.step_key;
            var cur = Number(agentSmoothProgress.displayed[key] || 0);
            var target = Number(agentSmoothProgress.targets[key] || 0);
            var ceiling = Number(agentSmoothProgress.creepCeiling[key] != null ? agentSmoothProgress.creepCeiling[key] : target);
            if (cur < target) {
                var delta = Math.max(1, Math.ceil((target - cur) / 5));
                agentSmoothProgress.displayed[key] = Math.min(target, cur + delta);
                changed = true;
            } else if (cur < ceiling && cur < 92) {
                agentSmoothProgress.displayed[key] = cur + 1;
                changed = true;
            }
        });
        if (changed) patchAgentSmoothProgressBars();
    }

    function startAgentSmoothProgressTimer() {
        stopAgentSmoothProgressTimer();
        agentSmoothProgress.timer = global.setInterval(tickAgentSmoothProgress, 420);
    }

    function stopAgentSmoothProgressTimer() {
        if (agentSmoothProgress.timer) {
            global.clearInterval(agentSmoothProgress.timer);
            agentSmoothProgress.timer = null;
        }
    }

    function resetAgentSmoothProgress() {
        stopAgentSmoothProgressTimer();
        agentSmoothProgress.displayed = {};
        agentSmoothProgress.targets = {};
        agentSmoothProgress.creepCeiling = {};
    }


    var FILL_GAPS_STEP_ORDER = [
        'summarize', 'fill_gaps', 'coverage', 'validate'
    ];

    var MODULE_GEN_STEP_ORDER = [
        'split_modules', 'generate_modules', 'dedupe'
    ];

    var QUICK_PLAN_MODULE_STEP_MAP = {
        split_modules: 'split_modules',
        generate_modules: 'generate_modules',
        dedupe: 'dedupe'
    };

    var STEP_LABELS = {
        summarize: '需求摘要',
        split_modules: '模块拆分',
        generate_modules: '分模块生成',
        dedupe: '交叉去重',
        coverage: '覆盖率检查',
        fill_gaps: '缺口补全',
        validate: '质量校验'
    };

    var agentFloatState = {
        left: null,
        top: null,
        width: 400,
        height: 480
    };

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
        var text = String(msg || '');
        if (text === (globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__')) return;
        if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(text)) {
            return;
        }
        if (/用例补充约需|FILL_GAPS_QUOTA/i.test(text)) {
            if (typeof globalThis.hfAiQuotaNotifyFillGapsBlock === 'function') {
                globalThis.hfAiQuotaNotifyFillGapsBlock(null);
            }
            return;
        }
        if (typeof global.tcAppAlert === 'function') global.tcAppAlert(msg, opts || { variant: 'warning', title: '提示' });
    }

    /**
     * 分模块生成在创建 Agent 任务前被额度/启动拦截时的专用收尾。
     * 不改动普通 Agent / 补充缺口路径；负责失败流水线、收起遮罩、恢复生成前表格。
     */
    function finishQuickPlanPipelineAfterStartBlocked(detail) {
        if (!state.quickPlanPipelineMode) return false;
        state.quickPlanPipelineMode = false;
        state.running = false;
        setGenModeLocked(false);
        setAgentButtonsDisabled(false);
        var msg = String(detail || '启动失败');
        if (msg === (globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__')) {
            msg = '今日文本模型免费额度已用完';
        }
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.failStep === 'function') {
            global.TcGenChatPipeline.failStep('split_modules', msg);
        }
        var finish = state.quickPlanFinishBtn;
        state.quickPlanFinishBtn = null;
        if (typeof finish === 'function') {
            finish({ pipelineAlreadyFailed: true, detail: msg });
        } else if (window.TcRequirementCaseStore &&
            typeof window.TcRequirementCaseStore.abortGenerationAndRestoreTable === 'function') {
            window.TcRequirementCaseStore.abortGenerationAndRestoreTable({
                mergeMode: state.agentMergeMode || 'overwrite'
            });
            if (global.TcGenerationStreamUi && typeof global.TcGenerationStreamUi.releaseAfterGenerate === 'function') {
                global.TcGenerationStreamUi.releaseAfterGenerate({
                    immediate: true,
                    status: 'error',
                    detail: msg
                });
            }
        }
        // finishBtn → releaseAfterGenerate(error) 会把顶部横幅留在错误态；额度拦截需同步收起
        hideQuickPlanStageChromeAfterStartBlocked();
        if (typeof global.clearOptimisticPageGenLock === 'function') {
            global.clearOptimisticPageGenLock();
        }
        if (typeof global.refreshTcPageGenLock === 'function') {
            try { global.refreshTcPageGenLock(); } catch (eLock) { /* ignore */ }
        }
        return true;
    }

    /** 仅用于启动拦截后收起生成横幅/遮罩，不改 TcGenStageUi 其它错误展示路径 */
    function hideQuickPlanStageChromeAfterStartBlocked() {
        if (global.TcGenStageUi && typeof global.TcGenStageUi.hide === 'function') {
            try { global.TcGenStageUi.hide(); } catch (eHide) { /* ignore */ }
        }
        if (global.TcGenTableOverlay && typeof global.TcGenTableOverlay.hide === 'function') {
            try { global.TcGenTableOverlay.hide(); } catch (eOv) { /* ignore */ }
        }
        if (global.TcGenStageUi && typeof global.TcGenStageUi.hideSummaryCard === 'function') {
            try { global.TcGenStageUi.hideSummaryCard(); } catch (eSum) { /* ignore */ }
        }
    }

    function isAgentModeEnabled() { return false; }

    function detectAgentPipelineMode(intent) {
        var t = String(intent || '').trim();
        if (/只生成缺失|缺失部分|仅补全|仅生成缺失|缺口补全/.test(t)) return 'fill_gaps_only';
        if (/^补全未覆盖|^补全以下|^仅补全以下/.test(t)) return 'fill_gaps_only';
        return '';
    }

    function getAgentColumns() {
        return getAgentWriteColumns();
    }

    /** 写入表格用列定义：避免 collectTcStashPayload 拉取网格副作用，与 tableColumns 对齐 */
    function getAgentWriteColumns() {
        try {
            if (typeof tableColumns !== 'undefined' && tableColumns && tableColumns.length) {
                return tableColumns.slice().map(String);
            }
        } catch (e1) { /* ignore */ }
        return [];
    }

    function cloneAgentTableRows(rows) {
        return (rows || []).map(function (row) {
            return Array.isArray(row) ? row.slice() : row;
        });
    }

    function countAgentTableContentRowsInData(rows) {
        rows = rows || [];
        var count = 0;
        for (var i = 0; i < rows.length; i++) {
            if (typeof global.tcTableRowHasCaseContent === 'function') {
                if (global.tcTableRowHasCaseContent(rows[i])) count++;
            } else if (Array.isArray(rows[i]) && rows[i].some(function (cell) { return String(cell || '').trim(); })) {
                count++;
            }
        }
        return count;
    }

    function restoreAgentAppendBaselineIfNeeded(mergeMode, baselineRows) {
        mergeMode = mergeMode === 'overwrite' ? 'overwrite' : 'append';
        if (mergeMode !== 'append' || !baselineRows || !baselineRows.length) return;
        if (typeof global.testCasesData === 'undefined') return;
        var baseCount = countAgentTableContentRowsInData(baselineRows);
        var nowCount = countAgentTableContentRowsInData(global.testCasesData);
        if (baseCount > nowCount || baselineRows.length > (global.testCasesData || []).length) {
            global.testCasesData = cloneAgentTableRows(baselineRows);
            if (typeof global.tcEnsureProvenanceLength === 'function') {
                try { global.tcEnsureProvenanceLength(); } catch (eRestore) { /* ignore */ }
            }
            if (typeof global.renderTableBody === 'function') {
                global.renderTableBody({ reload: true });
            }
        }
    }

    function ensureAgentTableDataSyncedBeforeJob(mergeMode) {
        mergeMode = mergeMode === 'overwrite' ? 'overwrite' : 'append';
        if (mergeMode === 'append') {
            if (typeof global.tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
                global.tcRestoreAppendGenerationBaselineIfNeeded();
            }
            return Promise.resolve(true);
        }
        var appendBaseline = null;
        if (mergeMode === 'append' && typeof global.testCasesData !== 'undefined' && global.testCasesData) {
            appendBaseline = cloneAgentTableRows(global.testCasesData);
        }
        function finalizePull(result) {
            restoreAgentAppendBaselineIfNeeded(mergeMode, appendBaseline);
            return result;
        }
        if (global.TcTableView && typeof global.TcTableView.pullRows === 'function') {
            try {
                return Promise.resolve(global.TcTableView.pullRows())
                    .then(finalizePull)
                    .catch(function () { return finalizePull(false); });
            } catch (ePull) { /* ignore */ }
        }
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            return global.TcTableBridge.commitAll()
                .then(finalizePull)
                .catch(function () { return finalizePull(false); });
        }
        return Promise.resolve(finalizePull(true));
    }

    function agentJobPayloadHasRows(payload) {
        if (!payload) return false;
        var result = payload.result;
        if (result && Array.isArray(result.new_rows_data) && result.new_rows_data.length) return true;
        if (extractRowsFromAgentSteps(payload).length) return true;
        return !!(result && Number(result.new_rows) > 0);
    }

    function countAgentTableContentRows() {
        if (typeof global.tcCountTableCaseContentRows === 'function') {
            return global.tcCountTableCaseContentRows();
        }
        if (typeof global.testCasesData === 'undefined' || !global.testCasesData) return 0;
        var count = 0;
        for (var i = 0; i < global.testCasesData.length; i++) {
            if (typeof global.tcTableRowHasCaseContent === 'function') {
                if (global.tcTableRowHasCaseContent(global.testCasesData[i])) count++;
            } else {
                var row = global.testCasesData[i];
                if (row && row.some(function (cell) { return String(cell || '').trim(); })) count++;
            }
        }
        return count;
    }

    function collectAgentPayload() {
        var cols = getAgentColumns();
        var rows = [];
        if (typeof global.testCasesData !== 'undefined' && global.testCasesData) {
            rows = global.testCasesData.map(function (row) {
                return cols.map(function (_, i) { return String(row[i] != null ? row[i] : ''); });
            });
        }
        return { columns: cols, existing_rows: rows };
    }

    function agentTemplateReady() {
        if (getAgentColumns().length) return true;
        if (typeof global.ensureTcTableTemplateApplied === 'function') {
            return global.ensureTcTableTemplateApplied();
        }
        alertBox('请先应用表头模板后再使用 Agent 生成。', { variant: 'warning', title: '缺少表头' });
        return false;
    }

    function getAiMode() {
        return typeof global.getAiConfigMode === 'function' ? global.getAiConfigMode() : 'preset';
    }

    function getLanhuCreds() {
        if (typeof global.getTcLanhuCredentialsForMode !== 'function') return { cookie: '', url: '' };
        return global.getTcLanhuCredentialsForMode(getAiMode());
    }

    function buildAgentRequestBody(userIntent, mode, extra) {
        extra = extra || {};
        var base = collectAgentPayload();
        var creds = getLanhuCreds();
        var body = {
            mode: mode || detectAgentPipelineMode(userIntent),
            user_intent: userIntent,
            prompt: userIntent,
            columns: base.columns,
            existing_rows: base.existing_rows,
            use_builtin: getAiMode() === 'preset',
            use_llm_validate: true,
            lanhu_cookie: creds.cookie || '',
            lanhu_url: creds.url || ''
        };
        body.validate_batch_row_start = (base.existing_rows || []).length;
        if (extra.target_point_ids) body.target_point_ids = extra.target_point_ids;
        if (extra.matrix_gaps) body.matrix_gaps = extra.matrix_gaps;
        if (extra.requirement_points) body.requirement_points = extra.requirement_points;
        if (extra.coverage_matrix) body.coverage_matrix = extra.coverage_matrix;
        if (extra.skip_coverage_reanalyze) body.skip_coverage_reanalyze = true;
        if (extra.fill_gap_mode) body.fill_gap_mode = extra.fill_gap_mode;
        if (extra.agent_prompt) body.agent_prompt = extra.agent_prompt;
        if (extra.validate_batch_row_start != null) body.validate_batch_row_start = extra.validate_batch_row_start;
        if (extra.validate_batch_row_count != null) body.validate_batch_row_count = extra.validate_batch_row_count;
        if (extra.requirements) body.requirements = extra.requirements;
        if (extra.rag_context) body.rag_context = extra.rag_context;
        if (getAiMode() !== 'preset') {
            body.base_url = ($('ai-base-url') || {}).value || '';
            body.api_key = ($('ai-api-key') || {}).value || '';
            body.model = ($('ai-model') || {}).value || '';
            body.temperature = ($('ai-temperature') || {}).value || '';
        }
        return body;
    }

    function isGenModeLocked() {
        return !!(state.genModeLocked || state.running);
    }

    function setGenModeLocked(locked) {
        state.genModeLocked = !!locked;
        if (!!locked && global.TcCoverageMatrix &&
            typeof global.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal === 'function') {
            global.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal();
        }
        if (typeof global.setTcLeftPanelAgentLock === 'function') {
            global.setTcLeftPanelAgentLock(isGenModeLocked());
        } else {
            applyLegacyGenModeLockUi();
        }
        if (typeof global.syncTcPromptSendBtnState === 'function') {
            global.syncTcPromptSendBtnState();
        }
    }

    function applyLegacyGenModeLockUi() {
        var singleBtn = $('tc-gen-mode-single');
        var seg = document.querySelector('.tc-gen-mode-seg');
        var isLocked = isGenModeLocked();
        if (singleBtn) {
            singleBtn.disabled = isLocked;
            singleBtn.classList.toggle('tc-gen-mode-btn--locked', isLocked);
            if (isLocked) {
                singleBtn.setAttribute('aria-disabled', 'true');
            } else {
                singleBtn.removeAttribute('aria-disabled');
            }
        }
        if (seg) seg.classList.toggle('tc-gen-mode-seg--locked', isLocked);
    }

    function releaseGenModeLockIfIdle() {
        if (!state.running) setGenModeLocked(false);
    }

    function updateAgentReopenBtn() {}

    function ensureAgentOverlaysMounted() {
        if (global.TcWorkbenchEnhancements && typeof global.TcWorkbenchEnhancements.ensureInit === 'function') {
            global.TcWorkbenchEnhancements.ensureInit();
        }
        if (typeof global.ensureTcWorkbenchOverlaysMounted === 'function') {
            global.ensureTcWorkbenchOverlaysMounted();
        }
        ['tc-agent-drawer'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.parentElement !== document.body) {
                document.body.appendChild(el);
            }
        });
    }

    function buildPendingAgentSteps(mode) {
        var order = mode === 'fill_gaps_only'
            ? FILL_GAPS_STEP_ORDER
            : MODULE_GEN_STEP_ORDER;
        return order.map(function (key, i) {
            return {
                step_key: key,
                step_index: i,
                label: STEP_LABELS[key] || key,
                status: 'pending',
                detail: '等待中…'
            };
        });
    }

    var TC_AGENT_DRAWER_GAP = 12;
    var TC_AGENT_MINI_SIZE = 48;
    var agentSideDrawerState = { left: null, top: null, height: null, userPositioned: false };
    function getAgentSideDrawerDefaultLayout(drawerW) {
        var gap = TC_AGENT_DRAWER_GAP;
        var top = 20;
        drawerW = drawerW || 360;
        var fullHeight = Math.max(240, window.innerHeight - top - gap);
        var height = Math.max(240, Math.round(fullHeight * 2 / 3));
        return {
            left: Math.max(gap, window.innerWidth - drawerW - 20),
            top: top,
            height: height
        };
    }

    function clampAgentSideDrawerLayout(left, top, height, drawerW) {
        var gap = TC_AGENT_DRAWER_GAP;
        drawerW = drawerW || 360;
        left = Math.max(gap, Math.min(left, window.innerWidth - drawerW - gap));
        top = Math.max(gap, Math.min(top, window.innerHeight - 120));
        height = Math.max(200, Math.min(height, window.innerHeight - top - gap));
        return { left: Math.round(left), top: Math.round(top), height: Math.round(height) };
    }

    function clampAgentSideDrawerDragPosition(left, top, height, drawerW) {
        var gap = TC_AGENT_DRAWER_GAP;
        drawerW = drawerW || 360;
        height = Math.max(200, height || 200);
        left = Math.max(gap, Math.min(left, window.innerWidth - drawerW - gap));
        var maxTop = Math.max(gap, window.innerHeight - height - gap);
        top = Math.max(gap, Math.min(top, maxTop));
        return { left: Math.round(left), top: Math.round(top), height: Math.round(height) };
    }

    function applyAgentSideDrawerLayout() {
        var drawer = $('tc-agent-drawer');
        if (!drawer || !drawer.classList.contains('tc-agent-drawer--side')) return;
        var drawerW = drawer.offsetWidth || 360;
        var layout;
        if (agentSideDrawerState.userPositioned &&
            agentSideDrawerState.left != null && agentSideDrawerState.top != null) {
            layout = clampAgentSideDrawerLayout(
                agentSideDrawerState.left,
                agentSideDrawerState.top,
                agentSideDrawerState.height || Math.max(240, window.innerHeight - agentSideDrawerState.top - TC_AGENT_DRAWER_GAP),
                drawerW
            );
            agentSideDrawerState.left = layout.left;
            agentSideDrawerState.top = layout.top;
            agentSideDrawerState.height = layout.height;
        } else {
            layout = getAgentSideDrawerDefaultLayout(drawerW);
        }
        drawer.style.setProperty('left', layout.left + 'px', 'important');
        drawer.style.setProperty('top', layout.top + 'px', 'important');
        drawer.style.setProperty('height', layout.height + 'px', 'important');
        drawer.style.setProperty('right', 'auto', 'important');
    }

    function collapseConflictingDrawersBeforeAgentOpen() {
        if (global.TcWorkbenchEnhancements && typeof global.TcWorkbenchEnhancements.ensureInit === 'function') {
            global.TcWorkbenchEnhancements.ensureInit();
        }
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.collapseValidateDrawerBeforeAgentPlanningOpen === 'function') {
            global.TcWorkbenchEnhancements.collapseValidateDrawerBeforeAgentPlanningOpen();
        }
    }

    function openAgentSideDrawer(opts) {
        opts = opts || {};
        collapseConflictingDrawersBeforeAgentOpen();
        var drawer = $('tc-agent-drawer');
        if (!drawer) return;
        drawer.classList.remove('hidden');
        drawer.classList.remove('tc-agent-drawer--open');
        drawer.setAttribute('aria-hidden', 'false');
        applyAgentSideDrawerLayout();
        void drawer.offsetWidth;
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                drawer.classList.add('tc-agent-drawer--open');
            });
        });
        if (global.TcWorkbenchEnhancements && typeof global.TcWorkbenchEnhancements.bringFloatPanelToFront === 'function') {
            global.TcWorkbenchEnhancements.bringFloatPanelToFront(drawer);
            if (opts.forceFront) global.TcWorkbenchEnhancements.bringFloatPanelToFront(drawer);
        }
        if (!drawer._tcAgentScrollGuardBound) bindAgentDrawerScrollGuard();
        if (!drawer._tcAgentSideDragBound) bindAgentSideDrawerDrag();
    }

    function minimizeAgentDrawer(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        var drawer = $('tc-agent-drawer');
        if (!drawer) return;
        if (drawer.classList.contains('tc-agent-drawer--side')) {
            closeAgentSideDrawer({ minimize: true });
            return;
        }
        closeAgentDrawer();
    }

    function closeAgentSideDrawer(opts) {
        opts = opts || {};
        var drawer = $('tc-agent-drawer');
        if (!drawer) return;
        drawer.classList.remove('tc-agent-drawer--open');
        global.setTimeout(function () {
            if (drawer.classList.contains('tc-agent-drawer--open')) return;
            drawer.classList.add('hidden');
            drawer.setAttribute('aria-hidden', 'true');
            updateAgentReopenBtn();
        }, 300);
    }

    function openAgentDrawer(opts) {
        opts = opts || {};
        var drawer = $('tc-agent-drawer');
        if (!drawer) return;
        if (drawer.classList.contains('tc-agent-drawer--side')) {
            openAgentSideDrawer(opts);
            return;
        }
        drawer.classList.remove('hidden');
        drawer.setAttribute('aria-hidden', 'false');
        applyAgentFloatLayout();
        if (global.TcWorkbenchEnhancements && typeof global.TcWorkbenchEnhancements.bringFloatPanelToFront === 'function') {
            global.TcWorkbenchEnhancements.bringFloatPanelToFront(drawer);
            if (opts.forceFront) {
                global.TcWorkbenchEnhancements.bringFloatPanelToFront(drawer);
            }
        }
        if (!drawer._tcAgentFloatBound) {
            bindAgentFloatPanel();
        }
        if (!drawer._tcAgentScrollGuardBound) {
            bindAgentDrawerScrollGuard();
        }
    }

    function closeAgentDrawer() {
        var drawer = $('tc-agent-drawer');
        if (!drawer) return;
        if (drawer.classList.contains('tc-agent-drawer--side')) {
            closeAgentSideDrawer();
            return;
        }
        drawer.classList.add('hidden');
        drawer.setAttribute('aria-hidden', 'true');
        updateAgentReopenBtn();
    }

    function setAgentButtonsDisabled(disabled) {
        var genBtns = typeof global.getTcGenerateActionButtons === 'function'
            ? global.getTcGenerateActionButtons() : [];
        genBtns.forEach(function (b) { b.disabled = !!disabled && false; });
    }

    function normalizeCancelledPayload(payload) {
        if (!payload) return { status: 'cancelled', steps: [] };
        var steps = (payload.steps || []).map(function (st) {
            if (st.status === 'running') {
                return Object.assign({}, st, { status: 'cancelled', detail: '已取消' });
            }
            return st;
        });
        return Object.assign({}, payload, { status: 'cancelled', steps: steps });
    }

    function agentStepStatusTerminal(status) {
        return status === 'done' || status === 'error' || status === 'skipped' || status === 'cancelled';
    }

    function agentStepsAllTerminal(payload) {
        var steps = (payload && payload.steps) || [];
        if (!steps.length) return false;
        return steps.every(function (st) {
            return agentStepStatusTerminal(st.status || 'pending');
        });
    }

    function syncAgentDrawerFootButtons(payload) {
        var cancelBtn = $('tc-agent-cancel-btn');
        var retryBtn = $('tc-agent-retry-btn');
        if (!cancelBtn || !retryBtn) return;
        var status = payload && payload.status ? payload.status : '';
        var stepsAllDone = agentStepsAllTerminal(payload);
        var running = (status === 'running' || !!state.running) && !stepsAllDone;
        var canRetry = status === 'cancelled' || status === 'error';
        cancelBtn.classList.toggle('hidden', !running);
        cancelBtn.disabled = !running;
        retryBtn.classList.toggle('hidden', !canRetry);
        retryBtn.disabled = !canRetry;
    }

    function agentStepProgressPercent(st) {
        return agentStepDisplayPercent(st);
    }

    var AGENT_STEP_PANEL = {
        split_modules: 'thinking',
        generate_modules: 'thinking',
        coverage: 'output',
        fill_gaps: 'thinking',
        validate: 'output'
    };

    function buildAgentStepThinkingText(st) {
        if (!st) return '';
        var out = st.output || {};
        return String(out.reasoning_text || '').trim();
    }

    function buildAgentStepOutputText(st) {
        if (!st) return '';
        var out = st.output || {};
        var key = st.step_key || '';
        if (key === 'split_modules') {
            var mods = out.modules;
            if (!Array.isArray(mods) || !mods.length) return '';
            return mods.map(function (m, i) {
                var name = m && m.name ? String(m.name) : '';
                var pri = m && m.priority ? String(m.priority) : 'P1';
                var desc = m && m.description ? String(m.description) : '';
                return (i + 1) + '. ' + name + ' (' + pri + ')' + (desc ? '\n   ' + desc : '');
            }).join('\n');
        }
        if (key === 'coverage') {
            var lines = [];
            if (out.skipped_reanalyze) lines.push('（复用已有覆盖率矩阵）');
            if (out.coverage_rate != null) {
                lines.push('覆盖率：' + out.coverage_rate + '%');
                if (out.point_count != null) lines.push('功能点：' + out.point_count);
                if (out.uncovered != null) lines.push('未覆盖：' + out.uncovered);
                if (out.partial != null) lines.push('部分覆盖：' + out.partial);
                if (out.over_generated != null) lines.push('过度生成：' + out.over_generated);
            } else if (out.gap_count != null) {
                lines.push('缺口：' + out.gap_count + ' 项');
            }
            var gaps = out.gaps || [];
            if (gaps.length) {
                lines.push('');
                lines.push('缺口明细（前 ' + Math.min(gaps.length, 12) + ' 项）：');
                gaps.slice(0, 12).forEach(function (g, i) {
                    var title = g.title || g.path || g.description || '';
                    var pid = g.point_id ? '[' + g.point_id + '] ' : '';
                    lines.push((i + 1) + '. ' + pid + title);
                });
            }
            if (st.status === 'running' && !lines.length) return '正在分析覆盖率…';
            return lines.join('\n');
        }
        if (key === 'validate') {
            if (out.skipped) return '（已跳过）';
            var vlines = [];
            if (out.format_count != null) vlines.push('格式问题：' + out.format_count);
            if (out.llm_count != null) vlines.push('AI 遗漏：' + out.llm_count);
            if (out.over_generated_count) vlines.push('过度生成：' + out.over_generated_count);
            var issues = out.issues || [];
            if (issues.length) {
                vlines.push('');
                issues.slice(0, 15).forEach(function (it, i) {
                    var row = it.row_index != null ? '行' + (Number(it.row_index) + 1) + ' ' : '';
                    vlines.push((i + 1) + '. ' + row + '[' + (it.type || '') + '] ' + (it.message || ''));
                });
                if (issues.length > 15) vlines.push('…另有 ' + (issues.length - 15) + ' 项');
            } else if (!vlines.length) {
                vlines.push('未发现问题');
            }
            if (st.status === 'running' && !issues.length && !out.format_count) return '正在校验…';
            return vlines.join('\n');
        }
        return '';
    }

    function renderAgentStepExtraPanel(st, opts) {
        opts = opts || {};
        if (!st) return '';
        var key = st.step_key || '';
        var panelType = AGENT_STEP_PANEL[key];
        if (!panelType) return '';
        if (st.status === 'pending' || st.status === 'skipped' || st.status === 'cancelled') return '';
        if (panelType === 'thinking') {
            var think = buildAgentStepThinkingText(st);
            if (!think) {
                if (st.status === 'running') think = '模型思考中…';
                else return '';
            }
            var fillReasonAttr = (opts.coverageFillDrawer && key === 'fill_gaps')
                ? ' data-tc-coverage-fill-llm-reasoning="1"'
                : '';
            var thinkHtml = '<div class="tc-validate-step__reasoning-wrap tc-agent-step__panel-wrap">';
            thinkHtml += '<div class="tc-validate-step__reasoning-label">AI 思考</div>';
            thinkHtml += '<pre class="tc-validate-step__reasoning tc-agent-step__panel" data-agent-panel="thinking"' + fillReasonAttr + '>' + esc(think);
            if (st.status === 'running') {
                thinkHtml += '<span class="tc-validate-step__reasoning-cursor" aria-hidden="true">▍</span>';
            }
            thinkHtml += '</pre></div>';
            return thinkHtml;
        }
        var outText = buildAgentStepOutputText(st);
        if (!outText) return '';
        return '<div class="tc-validate-step__output-wrap tc-agent-step__panel-wrap">' +
            '<div class="tc-validate-step__output-label">步骤输出</div>' +
            '<pre class="tc-validate-step__output tc-agent-step__panel" data-agent-panel="output">' +
            esc(outText) + '</pre></div>';
    }

    /** 用例补充·缺口补全 AI 思考区：是否贴近底部（流式重绘时决定是否自动滚底）。 */
    function isCoverageFillReasoningScrollNearBottom(pre, threshold) {
        if (!pre) return true;
        threshold = threshold != null ? threshold : 24;
        if (pre.scrollHeight <= pre.clientHeight) return true;
        return (pre.scrollHeight - pre.clientHeight - pre.scrollTop) <= threshold;
    }

    function captureAgentStepPanelScroll(list) {
        var snap = {};
        if (!list) return snap;
        list.querySelectorAll('[data-agent-panel]').forEach(function (el) {
            var stepEl = el.closest('[data-step-key]');
            var key = stepEl && stepEl.getAttribute('data-step-key');
            var kind = el.getAttribute('data-agent-panel');
            if (!key || !kind) return;
            snap[key + ':' + kind] = el.scrollTop;
        });
        return snap;
    }

    function restoreAgentStepPanelScroll(list, snap) {
        if (!list || !snap) return;
        Object.keys(snap).forEach(function (compound) {
            var parts = compound.split(':');
            if (parts.length !== 2) return;
            var stepEl = list.querySelector('[data-step-key="' + parts[0] + '"]');
            if (!stepEl) return;
            var panel = stepEl.querySelector('[data-agent-panel="' + parts[1] + '"]');
            if (panel) panel.scrollTop = snap[compound];
        });
    }


    function renderCoverageFillStepBar(st) {
        if (st.status !== 'running' && st.status !== 'done') return '';
        var pct = agentStepDisplayPercent(st);
        if (st.status === 'running' && pct === null) {
            return '<div class="tc-agent-step__track">' +
                '<div class="tc-agent-step__bar tc-agent-step__bar--indeterminate" aria-hidden="true"><span></span></div>' +
                '</div>';
        }
        var value = pct || 0;
        return '<div class="tc-agent-step__track">' +
            '<div class="tc-agent-step__bar" role="progressbar" aria-valuenow="' + value + '" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="tc-agent-step__bar-fill" style="width:' + value + '%"></div></div>' +
            '<span class="tc-agent-step__pct tc-qc-fill-progress__step-pct">' + value + '%</span></div>';
    }

    function coverageFillStepDetailFromRecord(st) {
        if (!st) return '';
        var status = st.status || 'pending';
        var key = st.step_key || '';
        var label = st.label || key;
        if (status === 'pending') return '等待中…';
        if (status === 'cancelled') return st.detail || '已取消';
        if (status === 'skipped') return st.detail || '已跳过';
        if (status === 'error') return st.error_message || st.detail || '执行失败';
        if (status === 'done') return agentStepDetailFromRecord(st);
        if (status !== 'running') return agentStepDetailFromRecord(st);
        var out = st.output || {};
        var phase = String(out.phase || '');
        if (key === 'coverage') {
            if (phase === 'extract_points') return '正在提取需求功能点…';
            if (phase === 'llm_request') return '正在分析用例与需求覆盖率…';
            if (phase === 'parse') return '正在汇总覆盖率结果…';
            if (out.skipped_reanalyze) return '复用已有覆盖率矩阵…';
            return '正在执行覆盖率检查…';
        }
        if (key === 'fill_gaps') {
            if (phase === 'parse' && out.parsed_rows != null) {
                return '正在解析补充用例 · 已解析 ' + out.parsed_rows + ' 条…';
            }
            if (phase === 'llm_request' || phase === 'parse') return '正在生成补充用例…';
            return '正在补全遗漏功能点…';
        }
        if (key === 'summarize') {
            if (phase === 'lanhu_fetch') return '正在拉取蓝湖需求文档…';
            if (phase === 'llm_request') return '正在提炼需求摘要…';
            return '正在整理需求上下文…';
        }
        if (key === 'validate') {
            if (phase === 'format_check') return '正在检查用例格式…';
            if (phase === 'llm_validate' || phase === 'llm_request') return '正在对照需求校验遗漏…';
            if (phase === 'parse') return '正在整理校验结果…';
            return '正在执行质量校验…';
        }
        if (phase === 'llm_request') return '正在执行：' + label + '…';
        return agentStepDetailFromRecord(st);
    }

    function renderAgentStepBar(st) {
        if (st.status !== 'running' && st.status !== 'done') return '';
        var pct = agentStepDisplayPercent(st);
        if (st.status === 'running' && pct === null) {
            return '<div class="tc-agent-step__track">' +
                '<div class="tc-agent-step__bar tc-agent-step__bar--indeterminate" aria-hidden="true"><span></span></div>' +
                '</div>';
        }
        var value = pct || 0;
        return '<div class="tc-agent-step__track">' +
            '<div class="tc-agent-step__bar" role="progressbar" aria-valuenow="' + value + '" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="tc-agent-step__bar-fill" style="width:' + value + '%"></div></div>' +
            '<span class="tc-agent-step__pct">' + value + '%</span></div>';
    }

    function getAgentStepListScrollState(list) {
        if (!list) return { el: null, top: 0 };
        var inner = list.querySelector('.tc-validate-progress');
        if (inner && inner.scrollHeight > inner.clientHeight + 1) {
            return { el: inner, top: inner.scrollTop || 0 };
        }
        return { el: list, top: list.scrollTop || 0 };
    }

    function restoreAgentStepListScroll(el, scrollTop) {
        if (!el || scrollTop <= 0) return;
        var apply = function () {
            var max = Math.max(0, el.scrollHeight - el.clientHeight);
            el.scrollTop = Math.min(scrollTop, max);
        };
        apply();
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(function () {
                apply();
                requestAnimationFrame(apply);
            });
        }
    }

    function resolveAgentCoverageMatrix(payload) {
        if (!payload) return null;
        var result = payload.result || {};
        if (result.coverage_matrix) return result.coverage_matrix;
        if (typeof global.TcCoverageMatrix !== 'undefined' &&
            typeof global.TcCoverageMatrix.getMatrix === 'function') {
            var live = global.TcCoverageMatrix.getMatrix('agent');
            if (live && live.summary) return live;
        }
        var covStep = (payload.steps || []).filter(function (s) { return s.step_key === 'coverage'; })[0];
        var covOut = covStep && covStep.output;
        if (covOut && covOut.coverage_matrix) return covOut.coverage_matrix;
        return null;
    }

    function resolveAgentCoverageRate(payload) {
        var matrix = resolveAgentCoverageMatrix(payload);
        if (matrix && matrix.summary && matrix.summary.coverage_rate != null) {
            return matrix.summary.coverage_rate;
        }
        var covStep = payload && (payload.steps || []).filter(function (s) {
            return s.step_key === 'coverage';
        })[0];
        var covOut = covStep && covStep.output;
        if (covOut && covOut.coverage_rate != null) return covOut.coverage_rate;
        return null;
    }

    function syncAgentCoverageDisplay(matrix) {
        if (!matrix || !state.lastPayload || state.lastPayload.status !== 'done') return;
        var prevResult = state.lastPayload.result || {};
        state.lastPayload = Object.assign({}, state.lastPayload, {
            result: Object.assign({}, prevResult, {
                coverage_matrix: matrix,
                coverage_matrix_refreshed: true
            })
        });
        renderAgentProgress(state.lastPayload);
    }

    function openAgentCoverageMatrix() {
        var payload = state.lastPayload;
        if (typeof global.TcCoverageMatrix === 'undefined') return;
        var matrix = resolveAgentCoverageMatrix(payload);
        if (matrix && typeof global.TcCoverageMatrix.setMatrix === 'function') {
            global.TcCoverageMatrix.setMatrix(matrix, 0, 'agent');
        }
        if (typeof global.TcCoverageMatrix.openCoverageTab === 'function') {
            global.TcCoverageMatrix.openCoverageTab('agent');
        }
    }

    function syncAgentCoverageHeadButton(payload) {
        var btn = $('tc-agent-open-coverage-btn');
        if (!btn) return;
        var show = !!(payload && payload.status === 'done' && payload.result &&
            resolveAgentCoverageRate(payload) != null);
        btn.classList.toggle('hidden', !show);
        if (show) {
            btn.textContent = '查看覆盖率矩阵（' + resolveAgentCoverageRate(payload) + '%）';
        }
    }

    var chatAgentProgressBuffer = null;

    function syncAgentProgressToChat(payload) {
        if (!payload) return;
        chatAgentProgressBuffer = payload;
        if (global.TcGenChatXUi && global.TcGenChatXUi.ready &&
            typeof global.TcGenChatXUi.paintAgentProgress === 'function') {
            global.TcGenChatXUi.paintAgentProgress(payload);
        }
    }

    function replayBufferedAgentProgressToChat() {
        if (!chatAgentProgressBuffer) return;
        syncAgentProgressToChat(chatAgentProgressBuffer);
    }

    function resetAgentChatPipeline() {
        if (global.TcGenChatXUi && global.TcGenChatXUi.ready &&
            typeof global.TcGenChatXUi.resetAgentPipeline === 'function') {
            global.TcGenChatXUi.resetAgentPipeline();
        }
    }

    function prepareAgentChatRun() {
        if (global.TcGenChatXUi && global.TcGenChatXUi.ready &&
            typeof global.TcGenChatXUi.prepareAgentRun === 'function') {
            global.TcGenChatXUi.prepareAgentRun();
        } else {
            resetAgentChatPipeline();
        }
    }

    function archiveAgentChatRun(payload) {
        if (!payload) return;
        if (global.TcGenChatXUi && global.TcGenChatXUi.ready &&
            typeof global.TcGenChatXUi.archiveAgentRun === 'function') {
            global.TcGenChatXUi.archiveAgentRun(payload);
        }
    }

    function failQuickPlanParseRows(message) {
        message = String(message || '解析并写入表格失败');
        if (!global.TcGenChatPipeline) return;
        if (typeof global.TcGenChatPipeline.setPhase === 'function') {
            global.TcGenChatPipeline.setPhase('parse_rows', 'active', '正在写入表格…');
        }
        if (typeof global.TcGenChatPipeline.failStep === 'function') {
            global.TcGenChatPipeline.failStep('parse_rows', message);
        }
    }


    function captureFinalModuleThinkingFromPayload(payload) {
        if (!payload || !global.TcGenChatPipeline) return;
        (payload.steps || []).forEach(function (st) {
            var pipelineId = QUICK_PLAN_MODULE_STEP_MAP[st.step_key || ''];
            if (pipelineId !== 'split_modules' && pipelineId !== 'generate_modules') return;
            if (pipelineId === 'split_modules') {
                var splitOut = st.output || {};
                if (Array.isArray(splitOut.modules) && splitOut.modules.length &&
                    typeof global.TcGenChatPipeline.setModuleGenPlan === 'function') {
                    global.TcGenChatPipeline.setModuleGenPlan(splitOut.modules, { replace: true });
                }
            }
            var thinkText = buildAgentStepThinkingText(st);
            if (!thinkText && (st.status === 'done' || st.status === 'error' || st.status === 'cancelled')) {
                if (pipelineId === 'split_modules') {
                    thinkText = buildAgentStepOutputText(st);
                } else if (pipelineId === 'generate_modules') {
                    var out = st.output || {};
                    if (Array.isArray(out.module_thinking_slots) && out.module_thinking_slots.length &&
                        typeof global.TcGenChatPipeline.setModuleGenSlots === 'function') {
                        global.TcGenChatPipeline.setModuleGenSlots(out.module_thinking_slots, { replace: true });
                        thinkText = '';
                    } else if (String(out.reasoning_text || '').trim()) {
                        thinkText = String(out.reasoning_text || '').trim();
                    }
                }
            }
            if (!thinkText) return;
            if (typeof global.TcGenChatPipeline.setModuleStepThinking === 'function') {
                global.TcGenChatPipeline.setModuleStepThinking(pipelineId, thinkText, { replace: true });
            }
        });
        if (typeof global.TcGenChatPipeline.prepareModuleThinkingArchive === 'function') {
            global.TcGenChatPipeline.prepareModuleThinkingArchive();
        }
    }

    function syncQuickPlanModuleThinking(st, pipelineId, status) {
        if (pipelineId === 'split_modules') {
            var splitOut = st.output || {};
            if (Array.isArray(splitOut.modules) && splitOut.modules.length &&
                typeof global.TcGenChatPipeline.setModuleGenPlan === 'function') {
                global.TcGenChatPipeline.setModuleGenPlan(splitOut.modules, { replace: true });
            }
        }
        if (pipelineId === 'generate_modules') {
            var genOut = st.output || {};
            if (Array.isArray(genOut.module_thinking_slots) && genOut.module_thinking_slots.length &&
                typeof global.TcGenChatPipeline.setModuleGenSlots === 'function') {
                global.TcGenChatPipeline.setModuleGenSlots(genOut.module_thinking_slots, { replace: true });
                return;
            }
        }
        var thinkText = buildAgentStepThinkingText(st);
        if (!thinkText && (status === 'done' || status === 'error' || status === 'cancelled')) {
            if (pipelineId === 'split_modules') {
                thinkText = buildAgentStepOutputText(st);
            } else {
                var outThink = st.output && st.output.reasoning_text;
                if (String(outThink || '').trim()) thinkText = String(outThink).trim();
            }
        }
        if (typeof global.TcGenChatPipeline.setModuleStepThinking === 'function' && thinkText) {
            global.TcGenChatPipeline.setModuleStepThinking(pipelineId, thinkText, { replace: true });
        }
    }

    function syncQuickPlanModuleStepsToPipeline(payload) {
        if (!payload || !state.quickPlanPipelineMode) return;
        if (!global.TcGenChatPipeline || typeof global.TcGenChatPipeline.setPhase !== 'function') return;
        (payload.steps || []).forEach(function (st) {
            var pipelineId = QUICK_PLAN_MODULE_STEP_MAP[st.step_key || ''];
            if (!pipelineId) return;
            var status = st.status || 'pending';
            if (status === 'pending') return;
            if (status === 'running') status = 'active';
            global.TcGenChatPipeline.setPhase(
                pipelineId,
                status,
                agentStepDetailFromRecord(st)
            );
            if (pipelineId === 'split_modules' || pipelineId === 'generate_modules') {
                syncQuickPlanModuleThinking(st, pipelineId, status);
            }
        });
    }


    function syncCoverageFillProgressFootButtons(payload) {
        var scope = 'single';
        var cancelBtn = document.getElementById('tc-validate-fill-cancel-' + scope);
        if (!cancelBtn) return;
        var status = payload && payload.status ? payload.status : '';
        var stepsAllDone = agentStepsAllTerminal(payload);
        var running = (status === 'running' || !!state.running) && !stepsAllDone;
        cancelBtn.classList.toggle('hidden', !running);
        cancelBtn.disabled = !running;
    }

    function buildCoverageFillProgressSummaryText(payload, doneCount, total) {
        if (!payload) return '准备中…';
        if (payload.status === 'running') {
            if (agentStepsAllTerminal(payload)) return '收尾中… ' + total + '/' + total;
            return '正在补充 ' + doneCount + '/' + total + ' 步';
        }
        if (payload.status === 'done') return '补充完成';
        if (payload.status === 'error') return '补充失败';
        if (payload.status === 'cancelled') return '已取消';
        return '准备中…';
    }

    function renderCoverageFillProgressInValidateDrawer(payload, scope) {
        if (!payload) return;
        scope = scope || 'single';
        if (global.TcCoverageMatrix) {
            if (typeof global.TcCoverageMatrix.enterValidateDrawerFillProgressMode === 'function') {
                global.TcCoverageMatrix.enterValidateDrawerFillProgressMode(scope);
            } else if (typeof global.TcCoverageMatrix.syncValidateDrawerTabsDuringFillProgress === 'function') {
                global.TcCoverageMatrix.syncValidateDrawerTabsDuringFillProgress(scope);
            }
        }
        var inner = document.getElementById('tc-validate-fill-progress-inner-' + scope);
        var drawerSummary = document.getElementById('tc-validate-drawer-summary-' + scope);
        if (!inner) return;
        var steps = payload.steps || [];
        var doneCount = steps.filter(function (s) {
            return s.status === 'done' || s.status === 'error' || s.status === 'skipped';
        }).length;
        var total = steps.length || 1;
        var pct = Math.min(100, Math.round((doneCount / total) * 100));
        var meta = buildCoverageFillProgressSummaryText(payload, doneCount, total);
        if (drawerSummary) drawerSummary.textContent = meta;

        if (global.TcFillTableOverlay) {
            var runningFillStep = steps.filter(function (s) { return s.status === 'running'; })[0];
            var fillStage = runningFillStep && runningFillStep.label
                ? runningFillStep.label
                : (meta || '用例补充中…');
            if (typeof global.TcFillTableOverlay.update === 'function') {
                global.TcFillTableOverlay.update({ stage: fillStage, meta: meta, percent: pct });
            }
            if ((payload.status === 'running' || payload.status === 'pending') &&
                typeof global.TcFillTableOverlay.show === 'function' &&
                !global.TcFillTableOverlay.isVisible()) {
                global.TcFillTableOverlay.show({ stage: fillStage, meta: meta, percent: pct });
            }
            if ((payload.status === 'done' || payload.status === 'error' || payload.status === 'cancelled') &&
                typeof global.TcFillTableOverlay.hide === 'function') {
                global.TcFillTableOverlay.hide();
            }
        }

        var panelScrollSnap = captureAgentStepPanelScroll(inner);
        var fillThinkPre = inner.querySelector('[data-step-key="fill_gaps"] pre[data-tc-coverage-fill-llm-reasoning="1"]');
        var stickFillThinkBottom = isCoverageFillReasoningScrollNearBottom(fillThinkPre);

        var html = '<div class="tc-qc-fill-progress__hero">';
        html += '<span class="tc-qc-fill-progress__badge">AI 用例补充</span>';
        html += '<h4 class="tc-qc-fill-progress__title">正在补充遗漏功能点</h4>';
        html += '<p class="tc-qc-fill-progress__meta">' + esc(meta) + '</p>';
        html += '<div class="tc-qc-fill-progress__bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">';
        html += '<div class="tc-qc-fill-progress__bar-fill" style="width:' + pct + '%"></div></div></div>';
        html += '<div class="tc-qc-fill-progress__steps">';
        steps.forEach(function (st) {
            var icon = '';
            if (st.status === 'running') icon = '<span class="tc-validate-step__spinner" aria-hidden="true"></span>';
            else if (st.status === 'done') icon = '<span class="tc-validate-step__icon tc-validate-step__icon--done">✓</span>';
            else if (st.status === 'error') icon = '<span class="tc-validate-step__icon tc-validate-step__icon--error">!</span>';
            else if (st.status === 'skipped') icon = '<span class="tc-validate-step__icon tc-validate-step__icon--skip">–</span>';
            else if (st.status === 'cancelled') icon = '<span class="tc-validate-step__icon tc-validate-step__icon--cancelled">✕</span>';
            else icon = '<span class="tc-validate-step__icon tc-validate-step__icon--pending">' + (st.step_index + 1) + '</span>';
            html += '<div class="tc-validate-step tc-validate-step--' + st.status + '" data-step-key="' + esc(st.step_key || '') + '">';
            html += '<div class="tc-validate-step__head tc-agent-step__head">' + icon + '<span class="tc-validate-step__label">' + esc(st.label) + '</span>' + renderCoverageFillStepBar(st) + '</div>';
            var detailText = coverageFillStepDetailFromRecord(st);
            if (detailText) html += '<p class="tc-validate-step__detail">' + esc(detailText) + '</p>';
            html += renderAgentStepExtraPanel(st, { coverageFillDrawer: true });
            html += '</div>';
        });
        html += '</div>';
        if (payload.status === 'error' && payload.error_message) {
            html += '<div class="tc-qc-fill-progress__result tc-qc-fill-progress__result--err">' + esc(payload.error_message) + '</div>';
        }
        if (payload.status === 'done' && payload.result) {
            html += '<div class="tc-qc-fill-progress__result tc-qc-fill-progress__result--ok">新增 ' + esc(payload.result.new_rows || 0) + ' 条用例，正在更新质量检查结果…</div>';
        }
        if (payload.status === 'done' || payload.status === 'error' || payload.status === 'cancelled') {
            stopAgentSmoothProgressTimer();
            syncCoverageFillProgressFootButtons(payload);
            inner.innerHTML = html;
        if (global.TcFillProgressScrollLayout && typeof global.TcFillProgressScrollLayout.apply === 'function') {
            global.TcFillProgressScrollLayout.apply(scope);
        }
            return;
        }
        inner.innerHTML = html;
        restoreAgentStepPanelScroll(inner, panelScrollSnap);
        if (stickFillThinkBottom) {
            var newFillThinkPre = inner.querySelector('[data-step-key="fill_gaps"] pre[data-tc-coverage-fill-llm-reasoning="1"]');
            if (newFillThinkPre && newFillThinkPre.scrollHeight > newFillThinkPre.clientHeight) {
                newFillThinkPre.scrollTop = newFillThinkPre.scrollHeight;
            }
        }
        syncAgentSmoothProgressTargets(steps);
        if (payload.status === 'running' && steps.some(function (s) { return shouldSmoothAgentStep(s); })) {
            startAgentSmoothProgressTimer();
        }
        syncCoverageFillProgressFootButtons(payload);
        if (global.TcFillProgressScrollLayout && typeof global.TcFillProgressScrollLayout.apply === 'function') {
            global.TcFillProgressScrollLayout.apply(scope);
        }
    }


    function maybeNotifyAgentAiQuota(payload) {
        if (!payload || !payload.ai_quota || typeof global.hfAiQuotaNotify !== 'function') return;
        var key = String(payload.job_id || '') + ':' + JSON.stringify(payload.ai_quota);
        if (state.quotaToastKey === key) return;
        state.quotaToastKey = key;
        global.hfAiQuotaNotify(payload.ai_quota);
    }

    function renderAgentProgress(payload) {
        if (!payload) return;
        if (payload.status === 'cancelled') {
            payload = normalizeCancelledPayload(payload);
        }
        state.lastPayload = payload;
        maybeNotifyAgentAiQuota(payload);
        if (state.quickPlanPipelineMode) {
            syncQuickPlanModuleStepsToPipeline(payload);
            if (payload.status === 'done' || payload.status === 'error') {
                captureFinalModuleThinkingFromPayload(payload);
            }
            return;
        }
        syncAgentProgressToChat(payload);

        if (state.coverageFillInValidateDrawer) {
            renderCoverageFillProgressInValidateDrawer(payload);
            return;
        }

        var list = $('tc-agent-step-list');
        var summary = $('tc-agent-drawer-summary');
        if (!list) {
            syncAgentDrawerFootButtons(payload);
            updateAgentReopenBtn();
            return;
        }
        var scrollSnap = getAgentStepListScrollState(list);
        var panelScrollSnap = captureAgentStepPanelScroll(list);
        var preserveScroll = !!list._tcAgentUserScrolled || scrollSnap.top > 4;
        var prevScroll = scrollSnap.top;
        var steps = payload.steps || [];
        var doneCount = steps.filter(function (s) {
            return s.status === 'done' || s.status === 'error' || s.status === 'skipped';
        }).length;
        var total = steps.length || 1;
        var pct = Math.min(100, Math.round((doneCount / total) * 100));
        if (summary) {
            if (payload.status === 'running') {
                if (agentStepsAllTerminal(payload)) {
                    summary.textContent = 'Agent 生成 ' + total + '/' + total + ' · 收尾中…';
                } else {
                    summary.textContent = 'Agent 生成 ' + doneCount + '/' + total;
                }
            } else if (payload.status === 'pending') {
                summary.textContent = payload.summary_hint || '等待确认写入方式…';
            } else if (payload.status === 'done') {
                summary.textContent = 'Agent 生成完成';
            } else if (payload.status === 'error') {
                summary.textContent = 'Agent 生成失败';
            } else if (payload.status === 'cancelled') {
                summary.textContent = '已取消';
            } else {
                summary.textContent = '准备中…';
            }
        }
        var html = '<div class="tc-validate-progress" aria-live="off">';
        html += '<div class="tc-validate-progress__bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">';
        html += '<div class="tc-validate-progress__bar-fill" style="width:' + pct + '%"></div></div>';
        html += '<div class="tc-validate-progress__steps">';
        steps.forEach(function (st) {
            var icon = '';
            if (st.status === 'running') icon = '<span class="tc-validate-step__spinner" aria-hidden="true"></span>';
            else if (st.status === 'done') icon = '<span class="tc-validate-step__icon tc-validate-step__icon--done">✓</span>';
            else if (st.status === 'error') icon = '<span class="tc-validate-step__icon tc-validate-step__icon--error">!</span>';
            else if (st.status === 'skipped') icon = '<span class="tc-validate-step__icon tc-validate-step__icon--skip">–</span>';
            else if (st.status === 'cancelled') icon = '<span class="tc-validate-step__icon tc-validate-step__icon--cancelled">✕</span>';
            else icon = '<span class="tc-validate-step__icon tc-validate-step__icon--pending">' + (st.step_index + 1) + '</span>';
            html += '<div class="tc-validate-step tc-validate-step--' + st.status + '" data-step-key="' + esc(st.step_key || '') + '">';
            html += '<div class="tc-validate-step__head tc-agent-step__head">' + icon + '<span class="tc-validate-step__label">' + esc(st.label) + '</span>' + renderAgentStepBar(st) + '</div>';
            var detailText = agentStepDetailFromRecord(st);
            if (detailText) html += '<p class="tc-validate-step__detail">' + esc(detailText) + '</p>';
            html += renderAgentStepExtraPanel(st);
            html += '</div>';
        });
        html += '</div></div>';
        if (payload.status === 'error' && payload.error_message) {
            html += '<p class="p-3 text-red-600">' + esc(payload.error_message) + '</p>';
        }
        if (payload.status === 'done' && payload.result) {
            html += '<p class="p-3 text-emerald-700">新增 ' + esc(payload.result.new_rows || 0) + ' 条用例</p>';
        }
        syncAgentSmoothProgressTargets(steps);
        list.innerHTML = html;
        restoreAgentStepPanelScroll(list, panelScrollSnap);
        syncAgentCoverageHeadButton(payload);
        if (preserveScroll && prevScroll > 0) {
            var newSnap = getAgentStepListScrollState(list);
            restoreAgentStepListScroll(newSnap.el || list, prevScroll);
        }
        syncAgentDrawerFootButtons(payload);
        updateAgentReopenBtn();
        if (payload.status === 'running' && steps.some(function (s) { return shouldSmoothAgentStep(s); })) {
            startAgentSmoothProgressTimer();
        } else if (payload.status === 'done' || payload.status === 'error' || payload.status === 'cancelled') {
            stopAgentSmoothProgressTimer();
        }
    }

    function resolveAgentRequirementsSummary(jobPayload) {
        if (!jobPayload) return '';
        if (jobPayload.requirements_summary) {
            return String(jobPayload.requirements_summary).trim();
        }
        (jobPayload.steps || []).some(function (st) {
            if (st.step_key !== 'summarize' || st.status !== 'done' || !st.output) return false;
            var out = st.output;
            var text = out.requirements_summary || out.summary || out.requirements || '';
            if (text) {
                jobPayload._resolvedReqSummary = String(text).trim();
                return true;
            }
            return false;
        });
        if (jobPayload._resolvedReqSummary) return jobPayload._resolvedReqSummary;
        return '';
    }

    function prepareAgentGenerationProvenance(jobPayload) {
        if (typeof global.tcBuildGenerationProvenance !== 'function') return;
        var reqSummary = resolveAgentRequirementsSummary(jobPayload);
        if (!reqSummary && global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.getLastRequirementsSummary === 'function') {
            reqSummary = global.TcWorkbenchEnhancements.getLastRequirementsSummary();
        }
        var bundle = state.agentKnowledgeBundle || {};
        var creds = typeof global.getTcLanhuCredentialsForMode === 'function'
            ? global.getTcLanhuCredentialsForMode(typeof getAiMode === 'function' ? getAiMode() : 'preset')
            : { url: '' };
        if (typeof global.tcCaptureGenerationLanhuContext === 'function') {
            global.tcCaptureGenerationLanhuContext(typeof getAiMode === 'function' ? getAiMode() : 'preset', reqSummary);
        }
        global.tcPendingGenerationProvenance = global.tcBuildGenerationProvenance(reqSummary, {
            personalContext: bundle.personalContext || '',
            publicContext: bundle.publicContext || '',
            publicChunks: bundle.publicChunks || [],
            personalChunks: bundle.personalChunks || [],
            ragContext: bundle.ragContext || state.agentRagContext || '',
            lanhuUrl: creds.url || ''
        });
        if (typeof global.tcEnsurePendingGenerationProvenance === 'function') {
            global.tcEnsurePendingGenerationProvenance(typeof getAiMode === 'function' ? getAiMode() : 'preset');
        }
    }

    function buildAgentKnowledgeHooks() {
        return {
            onLanhuStart: function () {
                var summary = $('tc-agent-drawer-summary');
                if (summary) summary.textContent = '正在获取蓝湖需求…';
            },
            onSummarizeStart: function () {
                var summary = $('tc-agent-drawer-summary');
                if (summary) summary.textContent = '正在总结检索问题…';
            },
            onLegacyStart: function () {
                var summary = $('tc-agent-drawer-summary');
                if (summary) summary.textContent = '正在检索知识库…';
            }
        };
    }

    function resolveAgentKnowledgeContext(mode) {
        if (typeof global.resolveTcGenerateKnowledgeContext !== 'function') {
            return Promise.resolve({ requirements: '', ragContext: '' });
        }
        return global.resolveTcGenerateKnowledgeContext(mode, buildAgentKnowledgeHooks());
    }

    function extractRowsFromAgentSteps(jobPayload) {
        var steps = (jobPayload && jobPayload.steps) || [];
        for (var i = steps.length - 1; i >= 0; i--) {
            var st = steps[i];
            if (!st || st.status !== 'done') continue;
            var key = st.step_key || '';
            if (key !== 'dedupe' && key !== 'generate_modules' && key !== 'fill_gaps') continue;
            var rows = st.output && st.output.rows;
            if (Array.isArray(rows) && rows.length) return rows;
        }
        return [];
    }

    function normalizeAgentRowsForTable(rawRows, cols) {
        if (!rawRows || !rawRows.length || !cols || !cols.length) return [];
        return rawRows.map(function (rawRow) {
            if (Array.isArray(rawRow)) {
                return cols.map(function (_, idx) {
                    var v = rawRow[idx];
                    return v !== undefined && v !== null ? String(v) : '';
                });
            }
            if (rawRow && typeof rawRow === 'object') {
                return cols.map(function (colName) {
                    if (rawRow[colName] !== undefined && rawRow[colName] !== null) {
                        return String(rawRow[colName]);
                    }
                    var stripped = String(colName).replace(/^\d+\.\s*/, '');
                    if (rawRow[stripped] !== undefined && rawRow[stripped] !== null) {
                        return String(rawRow[stripped]);
                    }
                    return '';
                });
            }
            return cols.map(function () { return ''; });
        });
    }

    function agentRowsHaveContent(normalizedRows) {
        return normalizedRows.some(function (row) {
            return row.some(function (cell) { return String(cell || '').trim(); });
        });
    }

    function resolveAgentResultRowData(result, jobPayload) {
        if (result && Array.isArray(result.new_rows_data) && result.new_rows_data.length) {
            return Promise.resolve(result.new_rows_data);
        }
        var fromSteps = extractRowsFromAgentSteps(jobPayload);
        if (fromSteps.length) return Promise.resolve(fromSteps);
        var expectCount = result && result.new_rows != null ? Number(result.new_rows) : 0;
        if (state.jobId && expectCount > 0) {
            return fetch('/api/test-cases/agent-jobs/' + encodeURIComponent(state.jobId))
                .then(function (r) { return r.json(); })
                .then(function (job) {
                    if (!job || job.error) return [];
                    var res = job.result || {};
                    if (Array.isArray(res.new_rows_data) && res.new_rows_data.length) {
                        return res.new_rows_data;
                    }
                    var payload = jobRecordToStreamPayload(job);
                    return extractRowsFromAgentSteps(payload);
                })
                .catch(function () { return []; });
        }
        return Promise.resolve([]);
    }

    function refreshAgentResultTable() {
        if (typeof global.switchTcRightView === 'function') {
            global.switchTcRightView('table');
        }
        function runTableSync(forceOpen) {
            if (forceOpen && global.TcTableView && typeof global.TcTableView.open === 'function') {
                return Promise.resolve(global.TcTableView.open({ reload: true, immediate: true }));
            }
            if (typeof global.renderTableBody === 'function') {
                return Promise.resolve(global.renderTableBody({
                    reload: true,
                    immediate: true,
                    forceTableSync: true
                }));
            }
            if (global.TcTableView && typeof global.TcTableView.syncFromData === 'function') {
                return global.TcTableView.syncFromData({ reload: true, immediate: true });
            }
            return Promise.resolve(false);
        }
        var contentBefore = countAgentTableContentRows();
        return runTableSync(false).then(function (synced) {
            var contentAfter = countAgentTableContentRows();
            if (contentBefore > 0 && !synced) {
                return runTableSync(true);
            }
            if (contentAfter > 0 && global.TcTableView && !synced) {
                return runTableSync(true);
            }
            return synced;
        }).then(function () {
            if (typeof global.syncTcTableTemplateChrome === 'function') {
                global.syncTcTableTemplateChrome();
            }
            if (typeof global.syncTcProvenanceRail === 'function') {
                global.syncTcProvenanceRail();
            }
            if (typeof global.tcTableRecordAfterMutation === 'function') {
                global.tcTableRecordAfterMutation();
            }
        });
    }


    /** 质量检查抽屉·缺口补全专用写入：不走通用 append 基线恢复，避免网格/生成基线竞态抹掉新行 */
    function applyCoverageFillResultRows(result, jobPayload) {
        return resolveAgentResultRowData(result, jobPayload).then(function (rawRows) {
            if (!rawRows || !rawRows.length) return 0;
            return pullAgentGridIntoTestCasesData().then(function () {
                var cols = getAgentWriteColumns();
                if (!cols.length) cols = getAgentColumns();
                if (!cols.length) return 0;

                if (typeof global.testCasesData !== 'undefined') {
                    var base = (state.agentExistingRowsSnapshot && state.agentExistingRowsSnapshot.length)
                        ? state.agentExistingRowsSnapshot
                        : (typeof global.testCasesData !== 'undefined' ? global.testCasesData : []);
                    global.testCasesData = (base || []).map(function (row) {
                        return Array.isArray(row) ? row.slice() : row;
                    });
                    if (typeof global.tcEnsureProvenanceLength === 'function') {
                        try { global.tcEnsureProvenanceLength(); } catch (eBase) { /* ignore */ }
                    }
                }

                prepareAgentGenerationProvenance(jobPayload || state.lastPayload);
                var normalizedRows = normalizeAgentRowsForTable(rawRows, cols);
                if (!normalizedRows.length || !agentRowsHaveContent(normalizedRows)) return 0;

                var parseOpts = {
                    allowMindmapWithoutTemplate: false,
                    mergeMode: 'append',
                    appendOnly: true
                };
                if (result && result.provenance && result.provenance.length) {
                    parseOpts.serverProvenanceList = result.provenance;
                } else if (result && result.lanhu_provenance) {
                    parseOpts.serverProvenanceEntry = result.lanhu_provenance;
                }

                var rowStart = typeof global.testCasesData !== 'undefined' ? global.testCasesData.length : 0;
                var added = 0;
                if (typeof global.applyNormalizedRowsToTable === 'function') {
                    added = global.applyNormalizedRowsToTable(normalizedRows, parseOpts);
                } else if (typeof global.parseAndAddTestCases === 'function') {
                    added = global.parseAndAddTestCases('test_cases = ' + JSON.stringify(rawRows), false, null, parseOpts);
                }
                if (added > 0 && !parseOpts.serverProvenanceList && !parseOpts.serverProvenanceEntry &&
                    typeof global.tcFinalizeGenerationProvenanceForRows === 'function') {
                    global.tcFinalizeGenerationProvenanceForRows(
                        rowStart,
                        added,
                        typeof getAiMode === 'function' ? getAiMode() : 'preset'
                    );
                }
                if (added > 0 && global.TcTableView && typeof global.TcTableView.syncFromData === 'function') {
                    try {
                        global.TcTableView.syncFromData({ reload: false, immediate: true });
                    } catch (eSync) { /* ignore */ }
                }
                if (typeof global.syncTcProvenanceRail === 'function') global.syncTcProvenanceRail();
                return added;
            });
        });
    }

    function refreshCoverageFillResultTable() {
        if (typeof global.switchTcRightView === 'function') {
            global.switchTcRightView('table');
        }
        if (global.TcTableView && typeof global.TcTableView.syncFromData === 'function') {
            return Promise.resolve(global.TcTableView.syncFromData({ reload: false, immediate: true }))
                .then(function () {
                    if (typeof global.syncTcTableTemplateChrome === 'function') global.syncTcTableTemplateChrome();
                    if (typeof global.syncTcProvenanceRail === 'function') global.syncTcProvenanceRail();
                    if (typeof global.tcTableRecordAfterMutation === 'function') global.tcTableRecordAfterMutation();
                });
        }
        return refreshAgentResultTable();
    }

    function applyAgentResultRows(result, jobPayload) {
        return resolveAgentResultRowData(result, jobPayload).then(function (rawRows) {
            if (!rawRows || !rawRows.length) return 0;
            var cols = getAgentWriteColumns();
            if (!cols.length) {
                cols = getAgentColumns();
            }
            if (!cols.length) return 0;

            var mergeMode = state.agentMergeMode || 'append';
            if (typeof global.testCasesData !== 'undefined') {
                if (mergeMode === 'append') {
                    if (typeof global.tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
                        global.tcRestoreAppendGenerationBaselineIfNeeded();
                    }
                    var _agentBase = (state.agentExistingRowsSnapshot && state.agentExistingRowsSnapshot.length)
                        ? state.agentExistingRowsSnapshot
                        : (typeof global.tcGetAppendGenerationBaselineRows === 'function'
                            ? global.tcGetAppendGenerationBaselineRows() : null);
                    if (_agentBase && _agentBase.length) {
                        global.testCasesData = _agentBase.map(function (row) {
                            return Array.isArray(row) ? row.slice() : row;
                        });
                        if (typeof global.testCasesProvenance !== 'undefined' && global.tcEnsureProvenanceLength) {
                            try { global.tcEnsureProvenanceLength(); } catch (e0) { /* ignore */ }
                        }
                    }
                } else if (mergeMode === 'overwrite') {
                    global.testCasesData = [];
                    if (global.testCasesProvenance) global.testCasesProvenance = [];
                }
            }

            prepareAgentGenerationProvenance(jobPayload || state.lastPayload);
            var normalizedRows = normalizeAgentRowsForTable(rawRows, cols);
            if (!normalizedRows.length) return 0;

            var parseOpts = { allowMindmapWithoutTemplate: false, mergeMode: mergeMode };
            if (result && result.provenance && result.provenance.length) {
                parseOpts.serverProvenanceList = result.provenance;
            } else if (result && result.lanhu_provenance) {
                parseOpts.serverProvenanceEntry = result.lanhu_provenance;
            }

            var rowStart = typeof global.tcResolveGenerationBatchRowStart === 'function'
                ? global.tcResolveGenerationBatchRowStart(mergeMode)
                : (typeof global.testCasesData !== 'undefined' ? global.testCasesData.length : 0);
            var added = 0;
            if (agentRowsHaveContent(normalizedRows) &&
                typeof global.applyNormalizedRowsToTable === 'function') {
                added = global.applyNormalizedRowsToTable(normalizedRows, parseOpts);
                if (added > 0 && typeof global.tcResolveListGenerationBatchStart === 'function') {
                    rowStart = global.tcResolveListGenerationBatchStart(added);
                }
            } else if (typeof global.parseAndAddTestCases === 'function') {
                var text = 'test_cases = ' + JSON.stringify(rawRows);
                added = global.parseAndAddTestCases(text, false, null, parseOpts);
            }
            if (added > 0 && !parseOpts.serverProvenanceList && !parseOpts.serverProvenanceEntry &&
                typeof global.tcFinalizeGenerationProvenanceForRows === 'function') {
                global.tcFinalizeGenerationProvenanceForRows(
                    rowStart,
                    added,
                    typeof getAiMode === 'function' ? getAiMode() : 'preset'
                );
            }
            if (added > 0 && mergeMode === 'append' && global.TcRequirementCaseStore &&
                typeof global.TcRequirementCaseStore.mergeGenerationPersistRows === 'function') {
                global.TcRequirementCaseStore.mergeGenerationPersistRows(normalizedRows);
            }
            if (typeof global.syncTcProvenanceRail === 'function') global.syncTcProvenanceRail();
            if (added > 0 && global.TcTableView && typeof global.TcTableView.syncFromData === 'function') {
                try {
                    global.TcTableView.syncFromData({ reload: true, immediate: true });
                } catch (eSync) { /* ignore */ }
            }
            return added;
        });
    }

    function postAgentJob(body) {
        var fetchOpts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        };
        if (state.abortController) fetchOpts.signal = state.abortController.signal;
        return fetch('/api/test-cases/agent-jobs', fetchOpts)
            .then(function (r) {
                return r.json().then(function (job) {
                    if (r.status === 429) {
                        throw new Error((job && job.error) || '生成过于频繁，请稍后再试');
                    }
                    return job;
                });
            })
            .then(function (job) {
                if (state.cancelRequested) {
                    if (job && job.id) {
                        fetch('/api/test-cases/agent-jobs/' + encodeURIComponent(job.id) + '/cancel', { method: 'POST' }).catch(function () {});
                    }
                    finishAgentJob({ status: 'cancelled', steps: (state.lastPayload && state.lastPayload.steps) || [] });
                    return;
                }
                if (job.error) {
                    if (typeof globalThis.hfAiQuotaFromErrorBody === 'function' && globalThis.hfAiQuotaFromErrorBody(job)) {
                        throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                    }
                    if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(job.error)) {
                        throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                    }
                    throw new Error(job.error);
                }
                state.jobId = job.id;
                subscribeJobStream(job.id);
            })
            .catch(function (err) {
                if (state.cancelRequested || (typeof global.tcIsBenignFetchAbort === 'function' && global.tcIsBenignFetchAbort(err)) || (err && err.name === 'AbortError')) {
                    finishAgentJob({ status: 'cancelled', steps: (state.lastPayload && state.lastPayload.steps) || [] });
                    return;
                }
                state.running = false;
                setGenModeLocked(false);
                setAgentButtonsDisabled(false);
                var startErrMsg = err.message || '启动 Agent 失败';
                if (startErrMsg === (globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__')) {
                    finishQuickPlanPipelineAfterStartBlocked(startErrMsg);
                    closeAgentDrawer();
                    updateAgentReopenBtn();
                    return;
                }
                if (state.quickPlanPipelineMode) {
                    finishQuickPlanPipelineAfterStartBlocked(startErrMsg);
                    return;
                }
                closeAgentDrawer();
                updateAgentReopenBtn();
                if (state.coverageFillInValidateDrawer || (state.lastPayload && state.lastPayload.mode === 'fill_gaps_only')) {
                    abortFillGapsStartup({ fromCoverageFill: !!state.coverageFillInValidateDrawer });
                    if (!(typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(startErrMsg)) &&
                        typeof globalThis.hfAiQuotaNotifyFillGapsBlock === 'function' &&
                        /用例补充约需|FILL_GAPS_QUOTA/i.test(startErrMsg)) {
                        globalThis.hfAiQuotaNotifyFillGapsBlock(null);
                    }
                    return;
                }
                alertBox(startErrMsg, { variant: 'error', title: 'Agent 失败' });
            });
    }



    function pullAgentGridIntoTestCasesData() {
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === "function") {
            return global.TcTableBridge.commitAll().catch(function () { return false; });
        }
        if (global.TcTableView && typeof global.TcTableView.pullRows === "function") {
            try {
                return Promise.resolve(global.TcTableView.pullRows()).catch(function () { return false; });
            } catch (ePull) { /* ignore */ }
        }
        return Promise.resolve(true);
    }

    function notifyCoverageMatrixAfterAgentApply(payload, wasCoverageFillDrawer) {
        if (typeof global.TcCoverageMatrix === "undefined") {
            return Promise.resolve();
        }
        var chain = Promise.resolve();
        if (typeof global.TcCoverageMatrix.onAgentJobFinished === "function") {
            chain = chain.then(function () {
                return global.TcCoverageMatrix.onAgentJobFinished(payload);
            });
        }
        if (wasCoverageFillDrawer && state.coverageFillInValidateDrawer) {
            state.coverageFillInValidateDrawer = false;
        }
        return chain;
    }

    function maybePersistAfterCoverageFillDrawer(appliedRows) {
        if (!global.TcRequirementCaseStore ||
            typeof global.TcRequirementCaseStore.persistAfterCoverageFillInDrawer !== 'function') {
            return Promise.resolve(null);
        }
        return global.TcRequirementCaseStore.persistAfterCoverageFillInDrawer({
            newRows: appliedRows != null ? appliedRows : 0
        });
    }

    function finishAgentJob(payload) {
        if (state.cancelRequested && payload && payload.status === 'running') {
            payload = Object.assign({}, payload, { status: 'cancelled' });
        }
        if (payload && payload.status === 'cancelled') {
            payload = normalizeCancelledPayload(payload);
        }
        var isTerminal = !!(payload && (payload.status === 'done' || payload.status === 'error' || payload.status === 'cancelled'));
        var isDone = !!(payload && payload.status === 'done');
        var needsRetryApply = isDone && state.lastApplyRowCount <= 0 && agentJobPayloadHasRows(payload);
        if (isTerminal && state.terminalHandled) {
            if (!needsRetryApply) {
                if (payload) {
                    state.lastPayload = payload;
                    renderAgentProgress(payload);
                    syncAgentDrawerFootButtons(payload);
                    updateAgentReopenBtn();
                }
                return;
            }
        }
        if (isTerminal && !isDone) state.terminalHandled = true;
        state.running = false;
        setGenModeLocked(false);
        setAgentButtonsDisabled(false);
        closeEventSource();
        clearPollTimer();
        stopAgentSmoothProgressTimer();
        state.abortController = null;
        if (payload) {
            state.lastPayload = payload;
            renderAgentProgress(payload);
            if (payload.status === 'done' || payload.status === 'error' || payload.status === 'cancelled') {
                if (!state.quickPlanPipelineMode) {
                    archiveAgentChatRun(payload);
                }
            }
        } else {
            syncAgentDrawerFootButtons(null);
        }
        updateAgentReopenBtn();
        if (!payload) return;
        if (payload.status === 'cancelled') {
            var wasCoverageFillDrawer = state.coverageFillInValidateDrawer;
            if (wasCoverageFillDrawer) {
                state.coverageFillInValidateDrawer = false;
                if (global.TcCoverageMatrix &&
                    typeof global.TcCoverageMatrix.onFillJobCancelled === 'function') {
                    global.TcCoverageMatrix.onFillJobCancelled();
                }
            }
            if (state.quickPlanPipelineMode && global.TcGenChatPipeline &&
                typeof global.TcGenChatPipeline.failStep === 'function') {
                global.TcGenChatPipeline.failStep('dedupe', '任务已取消');
            } else if (!wasCoverageFillDrawer) {
                toast('Agent 任务已取消', { variant: 'info', duration: 2600 });
            }
            state.quickPlanPipelineMode = false;
            return;
        }
        if (isDone && (payload.result || agentJobPayloadHasRows(payload))) {
            var wasCoverageFillDrawer = !!state.coverageFillInValidateDrawer;
            if (state.lastApplyRowCount <= 0) {
                state.resultApplied = true;
                var isQuickPlanModuleJob = !!state.quickPlanPipelineMode;
                if (isQuickPlanModuleJob && global.TcGenChatPipeline &&
                    typeof global.TcGenChatPipeline.setPhase === 'function') {
                    global.TcGenChatPipeline.setPhase('parse_rows', 'active', '正在写入表格…');
                }
                var applyRowsFn = wasCoverageFillDrawer ? applyCoverageFillResultRows : applyAgentResultRows;
                applyRowsFn(payload.result || {}, payload).then(function (n) {
                    state.lastApplyRowCount = n;
                    state.terminalHandled = true;
                    if (isQuickPlanModuleJob) {
                        state.quickPlanPipelineMode = false;
                        if (n > 0) {
                            return refreshAgentResultTable().then(function () {
                                var verified = countAgentTableContentRows();
                                if (verified <= 0) {
                                    failQuickPlanParseRows('生成完成但表格未写入用例');
                                    if (typeof state.quickPlanFinishBtn === 'function') {
                                        state.quickPlanFinishBtn();
                                    }
                                    return;
                                }
                                var finishCount = verified;
                                if (global.TcGenChatPipeline &&
                                    typeof global.TcGenChatPipeline.markModuleGenerationDone === 'function') {
                                    captureFinalModuleThinkingFromPayload(state.lastPayload || payload);
                                    global.TcGenChatPipeline.markModuleGenerationDone({
                                        finish_row_count: finishCount,
                                        parsed_detail: '已生成 ' + finishCount + ' 条'
                                    });
                                }
                                if (typeof global.tcNotifyListGenerationSuccess === 'function') {
                                    global.tcNotifyListGenerationSuccess(finishCount, 'list', state.quickPlanNotifyScope || 'legacy_freeform', {
                                        autoValidate: !!state.quickPlanAutoValidate,
                                        quickPlanModuleGen: true,
                                        userPrompt: state.quickPlanUserPrompt || ''
                                    });
                                }
                                if (typeof state.quickPlanFinishBtn === 'function') {
                                    state.quickPlanFinishBtn();
                                }
                            });
                        }
                        failQuickPlanParseRows('生成完成但解析入库失败');
                        if (typeof state.quickPlanFinishBtn === 'function') {
                            state.quickPlanFinishBtn();
                        }
                        return;
                    }
                    if (wasCoverageFillDrawer) {
                        var covTail = refreshCoverageFillResultTable().then(function () {
                            if (n <= 0) return null;
                            return maybePersistAfterCoverageFillDrawer(n).then(function (saved) {
                                if (!saved && n > 0) {
                                    return maybePersistAfterCoverageFillDrawer(n);
                                }
                                return saved;
                            });
                        }).then(function () {
                            return notifyCoverageMatrixAfterAgentApply(payload, wasCoverageFillDrawer);
                        });
                        if (n <= 0) {
                            if ((payload.result && payload.result.new_rows || 0) > 0) {
                                toast('生成完成但解析入库失败，请查看步骤详情', { variant: 'warning', duration: 4200 });
                            } else {
                                toast('Agent 流程完成，未新增用例', { variant: 'info', duration: 3200 });
                            }
                        }
                        return covTail;
                    }
                    if (n > 0) {
                        return refreshAgentResultTable().then(function () {
                            toast('Agent 已写入 ' + n + ' 条用例', { variant: 'success', duration: 3600 });
                            if (typeof global.tcNotifyListGenerationSuccess === 'function') {
                                global.tcNotifyListGenerationSuccess(n, 'list', 'agent_pipeline', {
                                    skipAutoValidate: true,
                                    agentJobMode: payload.mode || ''
                                });
                            }
                        });
                    }
                    if ((payload.result && payload.result.new_rows || 0) > 0) {
                        toast('生成完成但解析入库失败，请查看步骤详情', { variant: 'warning', duration: 4200 });
                    } else {
                        toast('Agent 流程完成，未新增用例', { variant: 'info', duration: 3200 });
                    }
                }).catch(function (err) {
                    state.terminalHandled = true;
                    console.error('[Agent] apply result failed:', err);
                    if (wasCoverageFillDrawer) {
                        return notifyCoverageMatrixAfterAgentApply(payload, wasCoverageFillDrawer);
                    }
                    if (isQuickPlanModuleJob) {
                        state.quickPlanPipelineMode = false;
                        failQuickPlanParseRows((err && err.message) || '写入表格失败');
                        if (typeof state.quickPlanFinishBtn === 'function') {
                            state.quickPlanFinishBtn();
                        }
                    } else {
                        toast('生成完成但写入表格失败', { variant: 'warning', duration: 4200 });
                    }
                }).finally(function () {
                    if (typeof window.scheduleReleaseWorkbenchInteractionLocks === 'function') {
                        window.scheduleReleaseWorkbenchInteractionLocks();
                    } else if (typeof global.releaseWorkbenchInteractionLocks === 'function') {
                        global.releaseWorkbenchInteractionLocks();
                    }
                });
            } else {
                state.terminalHandled = true;
                if (wasCoverageFillDrawer) {
                    refreshCoverageFillResultTable().then(function () {
                        return maybePersistAfterCoverageFillDrawer(state.lastApplyRowCount).then(function (saved) {
                            if (!saved) {
                                return maybePersistAfterCoverageFillDrawer(state.lastApplyRowCount);
                            }
                            return saved;
                        });
                    }).then(function () {
                        return notifyCoverageMatrixAfterAgentApply(payload, wasCoverageFillDrawer);
                    });
                } else if (typeof global.TcCoverageMatrix !== 'undefined' &&
                    typeof global.TcCoverageMatrix.onAgentJobFinished === 'function') {
                    global.TcCoverageMatrix.onAgentJobFinished(payload);
                }
            }
            /* coverage matrix notified after apply completes */
        } else if (isDone) {
            state.terminalHandled = true;
        } else if (payload.status === 'error') {
            var wasCoverageFillErr = !!state.coverageFillInValidateDrawer;
            var isFillGapsErr = wasCoverageFillErr || payload.mode === 'fill_gaps_only';
            if (wasCoverageFillErr) {
                state.coverageFillInValidateDrawer = false;
                if (global.TcCoverageMatrix &&
                    typeof global.TcCoverageMatrix.onFillJobCancelled === 'function') {
                    global.TcCoverageMatrix.onFillJobCancelled();
                }
            }
            if (state.quickPlanPipelineMode) {
                state.quickPlanPipelineMode = false;
                var errStep = 'split_modules';
                (payload.steps || []).some(function (st) {
                    if (st.status === 'error' && QUICK_PLAN_MODULE_STEP_MAP[st.step_key]) {
                        errStep = QUICK_PLAN_MODULE_STEP_MAP[st.step_key];
                        return true;
                    }
                    return false;
                });
                var _agentErrMsg = payload.error_message || '分模块生成失败';
                if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.failStep === 'function') {
                    global.TcGenChatPipeline.failStep(errStep, _agentErrMsg);
                }
                if (typeof state.quickPlanFinishBtn === 'function') {
                    state.quickPlanFinishBtn({ pipelineAlreadyFailed: true, detail: _agentErrMsg });
                } else if (typeof global.toast === 'function') {
                    global.toast(_agentErrMsg, { variant: 'error', duration: 5200 });
                }
            } else if (isFillGapsErr) {
                var fillErrMsg = payload.error_message || '补充失败';
                if (!(typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(fillErrMsg)) &&
                    typeof globalThis.hfAiQuotaNotifyFillGapsBlock === 'function' &&
                    /用例补充约需|FILL_GAPS_QUOTA/i.test(fillErrMsg)) {
                    globalThis.hfAiQuotaNotifyFillGapsBlock(null);
                }
            } else {
                alertBox(payload.error_message || 'Agent 生成失败', { variant: 'error', title: 'Agent 失败' });
            }
        }
        if (payload.status === 'done' || payload.status === 'error' || payload.status === 'cancelled') {
            if (typeof window.scheduleReleaseWorkbenchInteractionLocks === 'function') {
                window.scheduleReleaseWorkbenchInteractionLocks();
            } else if (typeof global.releaseWorkbenchInteractionLocks === 'function') {
                global.releaseWorkbenchInteractionLocks();
            }
        }
    }

    function closeEventSource() {
        if (state.eventSource) {
            try { state.eventSource.close(); } catch (e0) { /* ignore */ }
            state.eventSource = null;
        }
    }

    function clearPollTimer() {
        if (state.pollTimer) {
            global.clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    function agentStepDetailFromRecord(st) {
        if (!st) return '';
        var status = st.status || 'pending';
        if (status === 'pending') return '等待中…';
        if (status === 'cancelled') return st.detail || '已取消';
        if (status === 'skipped') return st.detail || '已跳过';
        if (status === 'running') {
            var out = st.output || {};
            var label = st.label || st.step_key || '';
            var current = out.current;
            var total = out.total;
            var moduleName = out.module_name;
            var phase = String(out.phase || '');
            var completed = out.completed;
            if (phase === 'parallel_gen' && total) {
                var doneN = completed != null ? Number(completed) : 0;
                var parsedHint = out.parsed_rows != null ? (' · 已解析 ' + out.parsed_rows + ' 条') : '';
                var activeMods = Array.isArray(out.active_modules) ? out.active_modules : [];
                if (activeMods.length) {
                    var names = activeMods.filter(function (n) { return String(n || '').trim(); }).slice(0, 3).join('、');
                    return '并行生成 ' + doneN + '/' + total + parsedHint + ' · 进行中：' + names + '…';
                }
                if (doneN > 0) {
                    return '并行生成 ' + doneN + '/' + total + ' 个模块已完成' + parsedHint + '…';
                }
                if (out.parsed_rows != null) {
                    return '并行生成 0/' + total + parsedHint + '…';
                }
                return '并行生成 0/' + total + ' 个模块…';
            }
            if (moduleName && current && total && phase !== 'parallel_gen') {
                var modParsed = out.parsed_rows != null ? (' · 已解析 ' + out.parsed_rows + ' 条') : '';
                if (phase === 'parse') return '正在解析：' + moduleName + '（' + current + '/' + total + '）' + modParsed + '…';
                return '正在生成：' + moduleName + '（' + current + '/' + total + '）' + modParsed + '…';
            }
            if (out.parsed_rows != null && (phase === 'llm_request' || phase === 'parse')) {
                return '正在执行：' + label + ' · 已解析 ' + out.parsed_rows + ' 条…';
            }
            if (current && total) return '正在执行：' + label + '（' + current + '/' + total + '）…';
            if (phase === 'lanhu_fetch') return '正在执行：' + label + '（拉取蓝湖需求）…';
            if (phase === 'llm_request') return '正在执行：' + label + '（等待模型响应）…';
            if (phase === 'parse') return '正在执行：' + label + '（解析结果）…';
            if (phase === 'format_check') return '正在执行：' + label + '（格式检查）…';
            if (phase === 'llm_validate') return '正在执行：' + label + '（AI 质量对照）…';
            return '正在执行：' + label + '…';
        }
        if (status === 'error') {
            return st.error_message || st.detail || '执行失败';
        }
        if (status !== 'done') return '等待中…';
        if (st.detail) return String(st.detail);
        var out = st.output || {};
        var key = st.step_key;
        if (key === 'summarize') return '需求摘要 ' + (out.requirements_length || 0) + ' 字';
        if (key === 'split_modules') return '拆分 ' + (out.module_count || 0) + ' 个模块';
        if (key === 'generate_modules') return '生成 ' + (out.row_count || 0) + ' 条用例';
        if (key === 'dedupe') {
            var removed = out.removed_count || 0;
            var remain = out.remaining_new != null ? out.remaining_new : 0;
            var inputN = out.input_new_count != null ? out.input_new_count : remain + removed;
            if (removed > 0) {
                return '新生成 ' + inputN + ' 条 · 去重移除 ' + removed + ' 条 · 保留 ' + remain + ' 条';
            }
            return '去重完成，保留 ' + remain + ' 条';
        }
        if (key === 'coverage') {
            var rate = out.coverage_rate;
            if (rate != null) {
                return '覆盖 ' + rate + '% · 缺 ' + (out.uncovered != null ? out.uncovered : out.gap_count || 0) + ' 项';
            }
            return '发现 ' + (out.gap_count || 0) + ' 个缺口';
        }
        if (key === 'fill_gaps') {
            if (out.skipped) return '无缺口，已跳过';
            return '补全 ' + (out.row_count || 0) + ' 条';
        }
        if (key === 'validate') {
            var gapN = out.issue_count || 0;
            var overN = out.over_generated_count || 0;
            if (overN && !gapN) return '过度生成 ' + overN + ' 条（见覆盖率矩阵）';
            if (overN) return '遗漏 ' + gapN + ' 项 · 过度 ' + overN + ' 条';
            if (gapN) return '发现 ' + gapN + ' 项问题';
            return '未发现问题';
        }
        return st.label || '';
    }

    function jobRecordToStreamPayload(job) {
        if (!job) return null;
        return {
            type: 'job_update',
            job_id: job.id,
            status: job.status,
            mode: job.mode,
            requirements_summary: job.requirements_summary || '',
            error_message: job.error_message,
            result: job.result,
            steps: (job.steps || []).map(function (st) {
                return {
                    step_key: st.step_key,
                    step_index: st.step_index,
                    label: st.label,
                    status: st.status,
                    detail: agentStepDetailFromRecord(st),
                    output: st.output,
                    error_message: st.error_message
                };
            })
        };
    }

    function shouldPollAgentJob(payload) {
        if (!state.jobId || !state.running) return false;
        var status = payload && payload.status ? payload.status : '';
        return status === 'running' || status === 'pending';
    }

    function resumeAgentJobTracking(reason) {
        if (!state.jobId || !shouldPollAgentJob(state.lastPayload)) return;
        if (reason && typeof console !== 'undefined' && console.info) {
            console.info('[Agent] SSE 结束，改轮询任务进度', reason, state.jobId);
        }
        pollJob(state.jobId);
    }

    function subscribeJobStream(jobId) {
        closeEventSource();
        if (!global.EventSource) {
            pollJob(jobId);
            return;
        }
        var es = new EventSource('/api/test-cases/agent-jobs/' + encodeURIComponent(jobId) + '/stream');
        state.eventSource = es;
        es.onmessage = function (ev) {
            try {
                var data = JSON.parse(ev.data);
                if (data.type === 'stream_end') {
                    closeEventSource();
                    resumeAgentJobTracking('stream_end');
                    return;
                }
                if (data.type === 'job_update') {
                    renderAgentProgress(data);
                    if (data.status === 'done' || data.status === 'error' || data.status === 'cancelled') {
                        finishAgentJob(data);
                        closeEventSource();
                    }
                }
            } catch (e1) { /* ignore */ }
        };
        es.onerror = function () {
            closeEventSource();
            pollJob(jobId);
        };
    }

    function pollJob(jobId) {
        clearPollTimer();
        var tries = 0;
        state.pollTimer = global.setInterval(function () {
            tries += 1;
            fetch('/api/test-cases/agent-jobs/' + encodeURIComponent(jobId))
                .then(function (r) { return r.json(); })
                .then(function (job) {
                    if (!job || job.error) return;
                    var payload = jobRecordToStreamPayload(job);
                    if (!payload) return;
                    renderAgentProgress(payload);
                    if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
                        clearPollTimer();
                        finishAgentJob(payload);
                    }
                })
                .catch(function () { /* ignore */ });
            if (tries >= 600) clearPollTimer();
        }, 800);
    }

    function resolveAgentMergeMode() {
        if (typeof global.tcTableHasCaseData === 'function' && !global.tcTableHasCaseData()) {
            return Promise.resolve('overwrite');
        }
        if (typeof global.askTcViewConvertChoice !== 'function') return Promise.resolve('append');
        return global.askTcViewConvertChoice({
            title: '表格已有数据',
            message: 'Agent 生成将追加新用例到表格末尾；覆盖将先清空表格再写入。取消则不启动 Agent。'
        }).then(function (choice) {
            if (choice === 'overwrite' && typeof global.testCasesData !== 'undefined') {
                global.testCasesData = [];
                if (global.testCasesProvenance) global.testCasesProvenance = [];
                if (global.markedRows) global.markedRows = new Set();
                if (global.selectedRows) global.selectedRows.clear();
                if (typeof global.renderTableBody === 'function') global.renderTableBody({ reload: true });
            }
            return choice;
        });
    }

    function resolveCoverageFillMergeMode(options) {
        options = options || {};
        var fillMode = options.fill_gap_mode || 'both';
        var count = Array.isArray(options.matrix_gaps) ? options.matrix_gaps.length : 0;
        var scopeLabel = fillMode === 'partial' ? '部分覆盖' : '遗漏';
        var message = count > 0
            ? ('确认是否补充 ' + count + ' 个' + scopeLabel + '的功能点？')
            : ('确认是否补充' + scopeLabel + '的功能点？');
        if (typeof global.tcAppConfirm !== 'function') return Promise.resolve('append');
        function openConfirmDialog() {
            if (typeof document !== 'undefined' && document.body) {
                document.body.classList.add('tc-wb-supplement-confirm-open');
            }
            return global.tcAppConfirm(message, {
                title: '补充用例',
                confirmText: '确认',
                cancelText: '取消',
                variant: 'warning'
            }).then(function (ok) {
                return ok ? 'append' : 'cancel';
            }).finally(function () {
                if (typeof document !== 'undefined' && document.body) {
                    document.body.classList.remove('tc-wb-supplement-confirm-open');
                }
            });
        }
        if (typeof global.requestAnimationFrame === 'function') {
            return new Promise(function (resolve, reject) {
                global.requestAnimationFrame(function () {
                    openConfirmDialog().then(resolve, reject);
                });
            });
        }
        return openConfirmDialog();
    }

    function runQuickPlanModuleJob(options) {
        options = options || {};
        if (!agentTemplateReady()) return Promise.resolve();
        var userIntent = String(options.userIntent || '').trim();
        if (!userIntent) {
            return Promise.reject(new Error('缺少生成指令'));
        }
        if (getAgentColumns().length === 0) {
            return Promise.reject(new Error('请先应用表头模板'));
        }
        var mergeMode = options.mergeMode === 'overwrite' ? 'overwrite' : 'append';
        if (mergeMode === 'append' && typeof global.tcBeginAppendGenerationBaseline === 'function') {
            global.tcBeginAppendGenerationBaseline();
        } else if (typeof global.tcClearAppendGenerationBaseline === 'function') {
            global.tcClearAppendGenerationBaseline();
        }
        state.quickPlanPipelineMode = true;
        state.quickPlanNotifyScope = options.scope || 'legacy_freeform';
        state.quickPlanAutoValidate = !!options.autoValidate;
        state.quickPlanUserPrompt = userIntent;
        state.quickPlanFinishBtn = typeof options.finishBtn === 'function' ? options.finishBtn : null;
        state.agentMergeMode = mergeMode;
        state.terminalHandled = false;
        state.resultApplied = false;
        state.lastApplyRowCount = 0;
        state.cancelRequested = false;
        state.agentExistingRowsSnapshot = null;
        state.jobId = null;
        state.abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
        state.running = true;
        resetAgentSmoothProgress();
        var bundle = options.knowledgeBundle || global.TC_LAST_GENERATE_KNOWLEDGE_BUNDLE || {};
        state.agentKnowledgeBundle = bundle;
        state.agentRagContext = bundle.ragContext || options.ragContext || '';
        var preSyncAppendSnapshot = null;
        if (mergeMode === 'append' && typeof global.testCasesData !== 'undefined' && global.testCasesData) {
            preSyncAppendSnapshot = cloneAgentTableRows(global.testCasesData);
        }
        return ensureAgentTableDataSyncedBeforeJob(mergeMode).then(function () {
            if (mergeMode === 'overwrite' && typeof global.testCasesData !== 'undefined') {
                var onlyPlaceholder = typeof global.tcTableHasOnlyPlaceholderRows === 'function'
                    && global.tcTableHasOnlyPlaceholderRows();
                if (!onlyPlaceholder) {
                    global.testCasesData = [];
                    if (global.testCasesProvenance) global.testCasesProvenance = [];
                    if (global.markedRows) global.markedRows = new Set();
                    if (global.selectedRows) global.selectedRows.clear();
                }
            }
            if (mergeMode === 'append') {
                if (preSyncAppendSnapshot && preSyncAppendSnapshot.length) {
                    restoreAgentAppendBaselineIfNeeded(mergeMode, preSyncAppendSnapshot);
                    state.agentExistingRowsSnapshot = cloneAgentTableRows(preSyncAppendSnapshot);
                } else if (typeof global.testCasesData !== 'undefined') {
                    state.agentExistingRowsSnapshot = cloneAgentTableRows(global.testCasesData);
                }
            }
            var body = buildAgentRequestBody(userIntent, 'module_gen_only', options);
            body.requirements = String(options.requirements || bundle.requirements || '').trim();
            if (!body.requirements) {
                state.quickPlanPipelineMode = false;
                return Promise.reject(new Error('缺少蓝湖需求文本'));
            }
            body.context_layers = {
                requirements: body.requirements,
                personal: bundle.personalContext || '',
                public: bundle.publicContext || ''
            };
            if (state.agentRagContext) {
                body.rag_context = state.agentRagContext;
            }
            body.use_llm_validate = false;
            body.validate_batch_row_start = mergeMode === 'append'
                ? (state.agentExistingRowsSnapshot ? state.agentExistingRowsSnapshot.length : (global.testCasesData || []).length)
                : 0;
            return postAgentJob(body);
        });
    }

    var HF_FILL_GAPS_MIN_FREE_QUOTA = 3;

    function abortFillGapsStartup(options) {
        options = options || {};
        if (options.fromCoverageFill) {
            state.coverageFillInValidateDrawer = false;
            if (global.TcCoverageMatrix &&
                typeof global.TcCoverageMatrix.onFillJobCancelled === 'function') {
                global.TcCoverageMatrix.onFillJobCancelled();
            }
        } else {
            closeAgentDrawer();
        }
        setGenModeLocked(false);
        updateAgentReopenBtn();
    }

    function ensureFillGapsQuotaAvailable() {
        var cfg = global.HfUserAiConfig;
        var loadP = (cfg && typeof cfg.loadConfig === 'function') ? cfg.loadConfig(false) : Promise.resolve();
        return loadP.then(function () {
            if (cfg && typeof cfg.isConfigured === 'function' && cfg.isConfigured()) {
                return true;
            }
            return fetch('/api/user-ai-daily-quota', { credentials: 'same-origin' })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var q = data && data.quota && data.quota.text;
                    if (q && q.has_own_config) return true;
                    var remaining = q && q.remaining != null ? parseInt(q.remaining, 10) : 0;
                    if (isNaN(remaining)) remaining = 0;
                    if (remaining >= HF_FILL_GAPS_MIN_FREE_QUOTA) return true;
                    if (typeof globalThis.hfAiQuotaNotifyFillGapsBlock === 'function') {
                        globalThis.hfAiQuotaNotifyFillGapsBlock(remaining);
                    }
                    return false;
                })
                .catch(function () { return true; });
        });
    }

    function startAgentJob(options) {
        options = options || {};
        if (!agentTemplateReady()) return Promise.resolve();
        var promptEl = $('ai-prompt');
        var userIntent = String(options.userIntent || (promptEl && promptEl.value) || '').trim();
        if (!userIntent) {
            alertBox('请先填写 Agent 指令或提示词。', { variant: 'warning', title: '缺少指令' });
            return Promise.resolve();
        }
        if (typeof global.maybeCollapseTcLanhuSectionIfExpanded === 'function') {
            global.maybeCollapseTcLanhuSectionIfExpanded();
        }
        if (getAgentColumns().length === 0) {
            alertBox('请先应用表头模板后再使用 Agent 生成。', { variant: 'warning', title: '缺少表头' });
            return Promise.resolve();
        }
        if (!options._userAiGatePassed && getAiMode() === 'preset' && global.HfUserAiConfig && typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {
                if (!ok) return;
                options._userAiGatePassed = true;
                return startAgentJob(options);
            });
        }
        if (getAiMode() === 'preset' && typeof global.isTcFeatureUnlocked === 'function' && !global.isTcFeatureUnlocked('preset')) {
            if (typeof global.requestTcFeatureUnlock === 'function') {
                global.requestTcFeatureUnlock('preset', function () { startAgentJob(options); });
            }
            return Promise.resolve();
        }
        var creds = getLanhuCreds();
        if (typeof global.validateTcLanhuCredentials === 'function' && getAiMode() === 'preset') {
            if (!global.validateTcLanhuCredentials(creds.cookie, creds.url)) return Promise.resolve();
        }
        if (getAiMode() === 'preset' && creds.cookie && creds.url && global.TcAiFormPrefs &&
            typeof global.TcAiFormPrefs.persistLanhuAfterGenerate === 'function') {
            global.TcAiFormPrefs.persistLanhuAfterGenerate(creds.cookie, creds.url);
        }
        var mode = options.mode || detectAgentPipelineMode(userIntent);
        if (mode !== 'fill_gaps_only') {
            alertBox('请使用快速规划进行用例生成。', { variant: 'warning', title: '提示' });
            return Promise.resolve();
        }
        var mergePromise;
        if (options.fromCoverageFill) {
            state.coverageFillInValidateDrawer = true;
            mergePromise = resolveCoverageFillMergeMode(options);
        } else {
            ensureAgentOverlaysMounted();
            openAgentDrawer({ forceFront: true });
            var summary = $('tc-agent-drawer-summary');
            if (summary) summary.textContent = '等待确认写入方式…';
            mergePromise = resolveAgentMergeMode();
        }
        return mergePromise.then(function (choice) {
            if (choice === 'cancel') {
                if (options.fromCoverageFill) {
                    state.coverageFillInValidateDrawer = false;
                } else {
                    closeAgentDrawer();
                }
                setGenModeLocked(false);
                updateAgentReopenBtn();
                if (options.fromCoverageFill && global.TcCoverageMatrix &&
                    typeof global.TcCoverageMatrix.onFillJobCancelled === 'function') {
                    global.TcCoverageMatrix.onFillJobCancelled();
                }
                return;
            }
            return ensureFillGapsQuotaAvailable().then(function (quotaOk) {
                if (!quotaOk) {
                    abortFillGapsStartup(options);
                    return;
                }
            if (global.TcWorkbenchEnhancements &&
                typeof global.TcWorkbenchEnhancements.abortPendingValidation === 'function') {
                global.TcWorkbenchEnhancements.abortPendingValidation('single');
            }
            if (mode !== 'fill_gaps_only' && !options.fromCoverageFill &&
                global.TcWorkbenchEnhancements &&
                typeof global.TcWorkbenchEnhancements.resetValidateTaskState === 'function') {
                global.TcWorkbenchEnhancements.resetValidateTaskState('agent', { clearCoverage: true });
            }
            if (options.fromCoverageFill && global.TcCoverageMatrix &&
                typeof global.TcCoverageMatrix.onFillJobStarting === 'function') {
                global.TcCoverageMatrix.onFillJobStarting();
            }
            if (options.commitPromptToChat && !options._promptCommittedToChat) {
                options._promptCommittedToChat = true;
                prepareAgentChatRun();
                if (typeof global.tcGenChatAppendUserMessage === 'function') {
                    global.tcGenChatAppendUserMessage(userIntent, { mode: '缺口补全' });
                }
                if (promptEl) {
                    promptEl.value = '';
                    if (typeof global.resizeTcAiPromptInput === 'function') global.resizeTcAiPromptInput(promptEl);
                    if (typeof global.syncTcPromptSendBtnState === 'function') global.syncTcPromptSendBtnState();
                    if (typeof global.syncTcPromptBudgetBar === 'function') global.syncTcPromptBudgetBar(promptEl);
                }
            }
            setGenModeLocked(true);
            ensureAgentOverlaysMounted();
            if (!options.fromCoverageFill) {
                openAgentDrawer({ forceFront: true });
            }
            state.terminalHandled = false;
            state.resultApplied = false;
            state.lastApplyRowCount = 0;
            state.cancelRequested = false;
            state.jobId = null;
            state.abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
            state.running = true;
            resetAgentSmoothProgress();
            var stepList = $('tc-agent-step-list');
            if (stepList) stepList._tcAgentUserScrolled = false;
            setAgentButtonsDisabled(true);
            renderAgentProgress({ status: 'running', mode: mode, steps: buildPendingAgentSteps(mode) });
            syncAgentDrawerFootButtons({ status: 'running' });
            var aiMode = getAiMode();
            var preJobSync = options.fromCoverageFill
                ? pullAgentGridIntoTestCasesData()
                : ensureAgentTableDataSyncedBeforeJob(choice);
            return preJobSync.then(function () {
            state.agentMergeMode = choice;
            if (choice === 'append' && typeof global.testCasesData !== 'undefined') {
                state.agentExistingRowsSnapshot = global.testCasesData.map(function (row) {
                    return Array.isArray(row) ? row.slice() : row;
                });
            } else {
                state.agentExistingRowsSnapshot = null;
            }
            return resolveAgentKnowledgeContext(aiMode).then(function (bundle) {
                bundle = bundle || {};
                state.agentKnowledgeBundle = bundle;
                state.agentRagContext = bundle.ragContext || '';
                var body = buildAgentRequestBody(userIntent, mode, options);
                if (bundle.requirements) {
                    body.requirements = bundle.requirements;
                } else if (options.requirements && !body.requirements) {
                    body.requirements = options.requirements;
                }
                body.context_layers = {
                    requirements: bundle.requirements || '',
                    personal: bundle.personalContext || '',
                    public: bundle.publicContext || ''
                };
                if (state.agentRagContext) {
                    body.rag_context = state.agentRagContext;
                }
                var summary = $('tc-agent-drawer-summary');
                if (summary) summary.textContent = 'Agent 任务启动中…';
                return postAgentJob(body);
            });
            });
            });
        });
    }

    function cancelAgentJob(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        state.cancelRequested = true;
        if (state.abortController) {
            try { state.abortController.abort(); } catch (e0) { /* ignore */ }
        }
        if (state.jobId) {
            fetch('/api/test-cases/agent-jobs/' + encodeURIComponent(state.jobId) + '/cancel', { method: 'POST' })
                .catch(function () { /* ignore */ });
        }
        closeEventSource();
        var cancelledPayload = state.lastPayload
            ? normalizeCancelledPayload(Object.assign({}, state.lastPayload, { status: 'cancelled' }))
            : { status: 'cancelled', steps: [] };
        finishAgentJob(cancelledPayload);
    }

    function abortForPageLeave() {
        state.cancelRequested = true;
        if (state.abortController) {
            try { state.abortController.abort(); } catch (e0) { /* ignore */ }
        }
        closeEventSource();
        if (state.jobId) {
            try {
                fetch('/api/test-cases/agent-jobs/' + encodeURIComponent(state.jobId) + '/cancel', {
                    method: 'POST',
                    credentials: 'same-origin',
                    keepalive: true
                }).catch(function () { /* ignore leave cancel */ });
            } catch (e1) { /* ignore */ }
        }
    }

    function retryAgentJob(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        startAgentJob();
    }

    function syncGenModeTabChrome() {
        if (typeof global.initTcWorkbenchMode === 'function') {
            global.initTcWorkbenchMode();
        }
    }

    function syncGenModeUi() {
        if (document.body) {
            document.body.classList.remove('tc-workbench-gen-mode-agent');
        }
        syncGenModeTabChrome();
        if (typeof global.syncTcLeftGenPanelLayout === 'function') {
            global.syncTcLeftGenPanelLayout();
        }
    }

    function switchTcGenPlanMode(mode) {
        if (mode === 'agent') return;
        if (isGenModeLocked()) {
            toast('生成任务进行中，无法切换生成模式', { variant: 'warning' });
            return;
        }
        if (typeof global.isTcLeftPanelNavLocked === 'function' && global.isTcLeftPanelNavLocked()) {
            toast(global.TcLeftPanelLock && typeof global.TcLeftPanelLock.isQualityCheckBusy === 'function' &&
                global.TcLeftPanelLock.isQualityCheckBusy()
                ? '质量检查进行中，无法切换生成模式'
                : 'AI 生成进行中，无法切换生成模式', { variant: 'warning' });
            return;
        }
        syncGenModeUi();
    }
    global.switchTcGenPlanMode = switchTcGenPlanMode;

    function applyAgentFloatLayout() {
        var panel = $('tc-agent-drawer');
        if (!panel) return;
        if (panel.classList.contains('tc-agent-drawer--side')) {
            applyAgentSideDrawerLayout();
            return;
        }
        var w = agentFloatState.width || 400;
        var h = agentFloatState.height || 480;
        panel.style.width = Math.min(w, window.innerWidth - 24) + 'px';
        panel.style.height = Math.min(h, window.innerHeight - 48) + 'px';
        if (agentFloatState.left != null) panel.style.left = agentFloatState.left + 'px';
        if (agentFloatState.top != null) panel.style.top = agentFloatState.top + 'px';
    }

    function bindAgentSideDrawerDrag() {
        var panel = $('tc-agent-drawer');
        if (!panel || panel._tcAgentSideDragBound) return;
        panel._tcAgentSideDragBound = true;
        if (!panel.classList.contains('tc-agent-drawer--side')) return;
        var dragHandle = panel.querySelector('[data-agent-drag-handle]');
        if (!dragHandle) return;
        dragHandle.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (e.target.closest('.tc-validate-float-panel__winbtn') ||
                e.target.closest('.tc-agent-drawer-minimize-btn') ||
                e.target.closest('.tc-agent-coverage-head-btn')) return;
            e.preventDefault();
            var rect = panel.getBoundingClientRect();
            var startX = e.clientX;
            var startY = e.clientY;
            var origLeft = rect.left;
            var origTop = rect.top;
            var origHeight = rect.height;
            panel.classList.add('tc-agent-drawer--dragging');
            panel.style.transition = 'none';
            function onMove(ev) {
                var left = origLeft + (ev.clientX - startX);
                var top = origTop + (ev.clientY - startY);
                var layout = clampAgentSideDrawerDragPosition(left, top, origHeight, rect.width);
                agentSideDrawerState.left = layout.left;
                agentSideDrawerState.top = layout.top;
                agentSideDrawerState.height = layout.height;
                panel.style.setProperty('left', layout.left + 'px', 'important');
                panel.style.setProperty('top', layout.top + 'px', 'important');
                panel.style.setProperty('height', layout.height + 'px', 'important');
            }
            function onUp() {
                agentSideDrawerState.userPositioned = true;
                panel.classList.remove('tc-agent-drawer--dragging');
                panel.style.transition = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    function bindAgentFloatPanel() {}

    function bindAgentDrawerScrollGuard() {
        var drawer = $('tc-agent-drawer');
        if (!drawer || drawer._tcAgentScrollGuardBound) return;
        drawer._tcAgentScrollGuardBound = true;
        var body = $('tc-agent-step-list');
        var foot = drawer.querySelector('.tc-side-drawer__foot');
        var scrolling = false;
        var scrollTimer = null;
        if (body) {
            var markUserScrolled = function () {
                body._tcAgentUserScrolled = true;
            };
            body.addEventListener('scroll', function () {
                markUserScrolled();
                scrolling = true;
                if (scrollTimer) global.clearTimeout(scrollTimer);
                scrollTimer = global.setTimeout(function () { scrolling = false; }, 220);
            }, { passive: true });
            body.addEventListener('wheel', markUserScrolled, { passive: true });
            body.addEventListener('touchmove', markUserScrolled, { passive: true });
        }
        if (foot) {
            foot.addEventListener('click', function (e) {
                if (!scrolling) return;
                e.preventDefault();
                e.stopImmediatePropagation();
            }, true);
        }
    }

    function reconcileStaleClientAgentState() {
        if (!state.jobId && !state.eventSource) {
            state.running = false;
            setGenModeLocked(false);
        }
    }

    function initTcAgentUi() {
        if (window._tcAgentUiBound) return;
        window._tcAgentUiBound = true;
        var singleBtn = $('tc-gen-mode-single');
        var minimizeBtn = $('tc-agent-drawer-minimize');
        var closeBtn = $('tc-agent-drawer-close');
        var cancelBtn = $('tc-agent-cancel-btn');
        var retryBtn = $('tc-agent-retry-btn');
        if (singleBtn) singleBtn.addEventListener('click', function () {
            switchTcGenPlanMode('single');
        });
        if (minimizeBtn) minimizeBtn.addEventListener('click', minimizeAgentDrawer);
        if (closeBtn) closeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            closeAgentDrawer();
        });
        if (cancelBtn) cancelBtn.addEventListener('click', cancelAgentJob);
        if (retryBtn) retryBtn.addEventListener('click', retryAgentJob);
        if (!window._tcAgentSideDrawerResizeBound) {
            window._tcAgentSideDrawerResizeBound = true;
            global.addEventListener('resize', function () {
                var drawer = $('tc-agent-drawer');
                if (drawer && drawer.classList.contains('tc-agent-drawer--open')) {
                    applyAgentSideDrawerLayout();
                }
            });
        }
        syncGenModeUi();
        syncAgentDrawerFootButtons(state.lastPayload);
        bindAgentFloatPanel();
        bindAgentSideDrawerDrag();
        bindAgentDrawerScrollGuard();
        applyAgentFloatLayout();
        ensureAgentOverlaysMounted();
        if (!global.__tcAgentChatProgressReadyBound) {
            global.__tcAgentChatProgressReadyBound = true;
            global.addEventListener('tc-gen-chat-x-ready', replayBufferedAgentProgressToChat);
        }
        replayBufferedAgentProgressToChat();
        if (state.running && !state.coverageFillInValidateDrawer) openAgentDrawer();
        var covHeadBtn = $('tc-agent-open-coverage-btn');
        if (covHeadBtn && !covHeadBtn._tcCovHeadBound) {
            covHeadBtn._tcCovHeadBound = true;
            covHeadBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
            covHeadBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                openAgentCoverageMatrix();
            });
        }
        syncAgentCoverageHeadButton(state.lastPayload);
        reconcileStaleClientAgentState();
    }


    global.TcAgentOrchestrator = {
        startAgentJob: startAgentJob,
        runQuickPlanModuleJob: runQuickPlanModuleJob,
        cancelAgentJob: cancelAgentJob,
        abortForPageLeave: abortForPageLeave,
        retryAgentJob: retryAgentJob,
        initTcAgentUi: initTcAgentUi,
        switchGenPlanMode: switchTcGenPlanMode,
        isAgentModeEnabled: isAgentModeEnabled,
        isAgentJobRunning: function () { return !!state.running; },
        getLastJobMode: function () {
            return (state.lastPayload && state.lastPayload.mode) || '';
        },
        getAgentLastPayload: function () {
            return state.lastPayload || null;
        },
        isAgentPostStepsRunning: function () {
            return !!state.running && agentStepsAllTerminal(state.lastPayload);
        },
        releaseGenModeLockIfIdle: releaseGenModeLockIfIdle,
        renderCoverageFillProgressInValidateDrawer: renderCoverageFillProgressInValidateDrawer,
        isGenModeLocked: isGenModeLocked,
        syncAgentCoverageDisplay: syncAgentCoverageDisplay,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTcAgentUi);
    } else {
        initTcAgentUi();
    }
})(typeof window !== 'undefined' ? window : this);
