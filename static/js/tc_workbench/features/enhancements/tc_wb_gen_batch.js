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
