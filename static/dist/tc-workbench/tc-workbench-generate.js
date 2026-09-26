/* ---- tc_ai_generate.js ---- */
/**
 * TestHub TC Workbench — L3 AI
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
var tcWorkbenchGlobal = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
function tcAppendVisualPayload(body) {
    if (window.TcVisualAttachments && typeof window.TcVisualAttachments.appendPayload === 'function') {
        window.TcVisualAttachments.appendPayload(body);
    }
    return body;
}
function tcPrepareVisualPayload(body) {
    var mod = window.TcVisualAttachments;
    if (!mod || typeof mod.getAssets !== 'function' || !mod.getAssets().length) {
        tcAppendVisualPayload(body);
        return Promise.resolve(body);
    }
    var chain = typeof mod.rebuildContext === 'function' ? mod.rebuildContext() : Promise.resolve();
    return Promise.resolve(chain).then(function () {
        tcAppendVisualPayload(body);
        return body;
    });
}
function runAiTableToolbar(scope, loadingBtn, options) {
    options = options || {};
    var outputTarget = options.outputTarget === 'mindmap' ? 'mindmap' : 'list';
    const promptEl = document.getElementById('ai-prompt');
    if (!promptEl && options.promptText == null) return;
    if (outputTarget === 'mindmap') {
        if (typeof ensureTcMindmapGenerateColumns === 'function' && !ensureTcMindmapGenerateColumns()) return;
    } else if (!ensureTcTableTemplateApplied()) {
        tcAppAlert('请先选择用例模板后再生成。', { variant: 'warning', title: '缺少模板' });
        return;
    }

    if (!options._userAiGatePassed && window.HfUserAiConfig && typeof window.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
        window.HfUserAiConfig.ensurePresetAiConfigured().then(function(ok) {
            if (!ok) {
                if (typeof tcAppToast === 'function') {
                    /* login gate handled by HfUserAiConfig */
                }
                return;
            }
            options._userAiGatePassed = true;
            runAiTableToolbar(scope, loadingBtn, options);
        });
        return;
    }
    if (!isTcFeatureUnlocked('preset')) {
        requestTcFeatureUnlock('preset', function() {
            runAiTableToolbar(scope, loadingBtn, options);
        });
        return;
    }
    var presetCreds = getTcLanhuCredentialsForMode('preset');
    var lanhuCookie = (options.lanhuCookie && String(options.lanhuCookie).trim()) || presetCreds.cookie;
    var lanhuUrl = (options.lanhuUrl && String(options.lanhuUrl).trim()) || presetCreds.url;
    if (!validateTcLanhuCredentials(lanhuCookie, lanhuUrl)) return;
    if (lanhuCookie && lanhuUrl && window.TcAiFormPrefs &&
        typeof window.TcAiFormPrefs.persistLanhuAfterGenerate === 'function') {
        window.TcAiFormPrefs.persistLanhuAfterGenerate(lanhuCookie, lanhuUrl);
    }
    const userPrompt = String(options.promptText != null ? options.promptText : (promptEl ? promptEl.value : '')).trim();

    if (!userPrompt) {
        tcAppAlert('请先在提示词中描述要生成的用例范围、格式或约束。', { variant: 'warning', title: '缺少提示词' });
        return;
    }
    maybeCollapseTcLanhuSectionIfExpanded();

    var tempNum = parseFloat(TC_AI_PRESET.temperature);
    if (Number.isNaN(tempNum)) tempNum = 0.1;

    let fullPrompt = '';
    let replaceAt = null;
    var isListCaseGenerate = scope === 'legacy_freeform' && outputTarget === 'list';
    var isMindmapCaseGenerate = scope === 'legacy_freeform' && outputTarget === 'mindmap';
    if (!isMindmapCaseGenerate) {
        updateTableHeader();
    }


    function tcSyncListTableBeforeAiGenerate() {
        if (outputTarget !== 'list') return Promise.resolve(false);
        if (window.TcTableBridge && typeof window.TcTableBridge.commitAll === 'function') {
            return window.TcTableBridge.commitAll();
        }
        if (typeof tcTablePullRowsFromView === 'function') {
            return tcTablePullRowsFromView();
        }
        return Promise.resolve(false);
    }

    function resolveAiGenerateMergeMode() {
        if (scope !== 'legacy_freeform') return Promise.resolve('overwrite');
        if (options.skipMergeModePrompt) {
            return Promise.resolve(options.mergeMode === 'append' ? 'append' : 'overwrite');
        }
        if (outputTarget === 'list') {
            if (typeof tcTableHasCaseData === 'function' && !tcTableHasCaseData()) {
                return Promise.resolve('overwrite');
            }
            return askTcViewConvertChoice({
                title: '表格已有数据',
                message: '当前表格中已有用例。覆盖将清空现有数据并填入新生成结果；追加会优先填入表格中的空行（从最后一条已有用例的下一行起）；取消则不生成。'
            });
        }
        if (outputTarget === 'mindmap') {
            if (typeof tcMindmapHasCaseData === 'function' && !tcMindmapHasCaseData()) {
                return Promise.resolve('overwrite');
            }
            return askTcViewConvertChoice({
                title: '思维导图已有数据',
                message: '当前思维导图中已有用例。覆盖将替换全部导图内容；追加会将新生成用例添加到导图；取消则不生成。'
            });
        }
        return Promise.resolve('overwrite');
    }

    function prepareAiGenerateView(aiMergeMode) {
        if (scope !== 'legacy_freeform') return;
        if (outputTarget === 'list') {
            switchTcRightView('table');
            return;
        }
        if (outputTarget === 'mindmap') {
            if (aiMergeMode === 'overwrite') {
                if (typeof tcMindmapClearAppendBaseline === 'function') tcMindmapClearAppendBaseline();
                tcMindmapExternalMindData = null;
                tcMindmapUndoStack = [];
                tcMindmapHistory = [];
                tcMindmapHistoryIndex = -1;
                tcMindmapUndoBaseline = null;
            } else if (typeof tcMindmapPrepareAppendGeneration === 'function') {
                tcMindmapPrepareAppendGeneration();
            }
            showTcMindmapGenerating();
        }
    }
    if (scope === 'legacy_freeform' && (isListCaseGenerate || isMindmapCaseGenerate)) {
        fullPrompt = '';
    } else if (scope === 'append_selected') {
        const ix = Array.from(selectedRows).sort(function(a, b) { return a - b; });
        if (!ix.length) {
            tcAppAlert('「仅选中行追加」需要上下文：请先在右侧表格勾选至少一行。', {
                variant: 'warning',
                title: '未选择表格行',
                hint: '勾选行后，AI 会结合这些行的内容生成追加用例。'
            });
            return;
        }
        fullPrompt = '【选中行上下文】\n' + buildTableRowsSnippetFromIndices(ix) + '\n\n【用户指令】\n' + userPrompt;
    } else if (scope === 'append_whole') {
        const ix = testCasesData.map(function(_, i) { return i; });
        const ctx = ix.length ? buildTableRowsSnippetFromIndices(ix) : '(当前表格为空)';
        fullPrompt = '【整张表现状】\n' + ctx + '\n\n【用户指令】\n' + userPrompt;
    } else if (scope === 'rewrite_selected') {
        const ix = Array.from(selectedRows).sort(function(a, b) { return a - b; });
        if (!ix.length) {
            tcAppAlert('「改写选中行」需要目标行：请先在右侧表格勾选要改写的行。', {
                variant: 'warning',
                title: '未选择表格行'
            });
            return;
        }
        replaceAt = ix.slice();
        fullPrompt = '【以下行按顺序需要被改写，你必须返回恰好 ' + ix.length + ' 条内层数组，与下列顺序一一对应】\n' + buildTableRowsSnippetFromIndices(ix) + '\n\n【用户改写要求】\n' + userPrompt;
    } else {
        tcAppAlert('当前操作类型不被识别，可能是页面脚本未正确加载。', { variant: 'error', title: '出了点问题', hint: '请刷新页面后重试。' });
        return;
    }

    function runAiGeneratePipeline(aiMergeMode) {
    if (aiMergeMode === 'append' && typeof tcBeginAppendGenerationBaseline === 'function') {
        tcBeginAppendGenerationBaseline();
    } else if (typeof tcClearAppendGenerationBaseline === 'function') {
        tcClearAppendGenerationBaseline();
    }
    if (typeof resetTcLanhuFetchMeta === 'function') {
        resetTcLanhuFetchMeta();
    }
    if (options.commitPromptToChat && !options._promptCommittedToChat) {
        options._promptCommittedToChat = true;
        var chatMode = outputTarget === 'mindmap' ? '快速规划 · 导图' : '快速规划 · 列表';
        if (typeof tcGenChatAppendUserMessage === 'function') {
            tcGenChatAppendUserMessage(userPrompt, { mode: chatMode });
        }
        promptEl.value = '';
        if (typeof resizeTcAiPromptInput === 'function') resizeTcAiPromptInput(promptEl);
        if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
        if (typeof syncTcPromptBudgetBar === 'function') syncTcPromptBudgetBar(promptEl);
    }
    var genAutoValidateForTask = typeof tcCaptureGenAutoValidateForTask === 'function'
        ? tcCaptureGenAutoValidateForTask(scope)
        : !!(document.getElementById('tc-gen-auto-validate') && document.getElementById('tc-gen-auto-validate').checked);
    var generationRunToken = bumpGenerationRunToken();
    _tcGenerationFetchAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (options.suppressLeftPanelUi) {
        window.__tcSuppressLeftPanelUi = true;
        if (typeof ensureTcLeftPanelClosedForHeadlessGen === 'function') {
            ensureTcLeftPanelClosedForHeadlessGen();
        }
    }
    prepareAiGenerateView(aiMergeMode);
    if (options.suppressLeftPanelUi && window.TcGenStageUi &&
        typeof window.TcGenStageUi.show === 'function') {
        window.TcGenStageUi.show({ outputTarget: outputTarget });
    }
    if (typeof tcResetGenerationWriteTracking === 'function') {
        tcResetGenerationWriteTracking();
    }
    if (window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.captureGenerationContext === 'function') {
        window.TcRequirementCaseStore.captureGenerationContext(aiMergeMode);
    }
    var shouldLockNav = scope === 'legacy_freeform' && (isListCaseGenerate || isMindmapCaseGenerate);
    if (shouldLockNav && typeof setTcLeftPanelAiGenerateLock === 'function') {
        setTcLeftPanelAiGenerateLock(true);
    }
    const targetBtn = loadingBtn || null;
    const genButtons = getTcGenerateActionButtons();
    const oldBtnLabels = genButtons.map(function(btn) { return { el: btn, text: btn.textContent }; });
    genButtons.forEach(function(btn) {
        btn.disabled = true;
        if (btn === targetBtn) btn.textContent = '生成中...';
    });

    function finishBtn(extra) {
        extra = extra || {};
        if (!extra.skipRunTokenCheck && typeof isGenerationRunCurrent === 'function' && !isGenerationRunCurrent(generationRunToken)) {
            return;
        }
        var genCancelled = window.TcGenerationStreamClient &&
            typeof TcGenerationStreamClient.isCancelled === 'function' &&
            TcGenerationStreamClient.isCancelled();
        if (shouldLockNav && typeof setTcLeftPanelAiGenerateLock === 'function') {
            setTcLeftPanelAiGenerateLock(false);
        }
        if (typeof window.scheduleReleaseWorkbenchInteractionLocks === 'function') {
            window.scheduleReleaseWorkbenchInteractionLocks();
        } else if (typeof window.releaseWorkbenchInteractionLocks === 'function') {
            window.releaseWorkbenchInteractionLocks();
        }
        oldBtnLabels.forEach(function(item) {
            if (item.el && item.el.isConnected) {
                item.el.disabled = false;
                item.el.textContent = item.text;
            }
        });
        getTcGenerateActionButtons().forEach(function(btn) {
            btn.disabled = false;
        });
        var leftPanel = document.getElementById('left-panel');
        var genActions = document.getElementById('tc-ai-generate-actions');
        if (leftPanel) leftPanel.classList.remove('tc-left-panel--gen-streaming');
        if (genActions) genActions.classList.remove('tc-ai-generate-actions--streaming');
        if (window.TcGenerationStreamUi && typeof window.TcGenerationStreamUi.releaseAfterGenerate === 'function') {
            var sessionAdded = (window.TcGenerationStreamClient &&
                typeof TcGenerationStreamClient.getSessionRowsAdded === 'function')
                ? TcGenerationStreamClient.getSessionRowsAdded() : 0;
            var streamText = (window.TcGenerationStreamClient &&
                typeof TcGenerationStreamClient.getStreamText === 'function')
                ? String(TcGenerationStreamClient.getStreamText() || '').trim() : '';
            var reasoningText = (window.TcGenerationStreamClient &&
                typeof TcGenerationStreamClient.getReasoningText === 'function')
                ? String(TcGenerationStreamClient.getReasoningText() || '').trim() : '';
            var effectiveRows = sessionAdded > 0 ? sessionAdded : 0;
            if (effectiveRows <= 0 && window.tcGenBatchCore && window.tcGenBatchCore.state) {
                effectiveRows = parseInt(window.tcGenBatchCore.state.batchRowCount, 10) || 0;
            }
            if (effectiveRows <= 0 && typeof tcGetLastGenerationWriteStart === 'function') {
                var writeStart = tcGetLastGenerationWriteStart();
                if (writeStart >= 0 && typeof tcCountTableCaseContentRows === 'function') {
                    effectiveRows = tcCountTableCaseContentRows(writeStart);
                }
            }
            if (isMindmapCaseGenerate) {
                effectiveRows = sessionAdded > 0
                    ? sessionAdded
                    : ((typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData)
                        ? tcMindmapCasesData.length : 0);
            } else if (window.TcGenerationStreamClient &&
                typeof TcGenerationStreamClient.getSessionParsedRowCount === 'function') {
                var parsedCount = TcGenerationStreamClient.getSessionParsedRowCount();
                if (parsedCount > 0) effectiveRows = parsedCount;
            }
            if (genCancelled) {
                var pausedRows = typeof tcResolveGenerationPausedWrittenRows === 'function'
                    ? tcResolveGenerationPausedWrittenRows({ hint: effectiveRows })
                    : effectiveRows;
                window.TcGenerationStreamUi.releaseAfterGenerate({
                    immediate: true,
                    status: 'cancelled',
                    parsedRows: pausedRows
                });
            } else if (effectiveRows > 0 || streamText || reasoningText) {
                window.TcGenerationStreamUi.releaseAfterGenerate({ parsedRows: effectiveRows });
            } else if (extra.pipelineAlreadyFailed || (window.TcGenChatPipeline &&
                typeof window.TcGenChatPipeline.isFailed === 'function' &&
                window.TcGenChatPipeline.isFailed())) {
                window.TcGenerationStreamUi.releaseAfterGenerate({
                    immediate: true,
                    status: 'error',
                    detail: extra.detail || ''
                });
            } else if (window.TcGenChatPipeline && typeof window.TcGenChatPipeline.isFinished === 'function' &&
                !window.TcGenChatPipeline.isFinished()) {
                if (typeof window.TcGenChatPipeline.error === 'function') {
                    window.TcGenChatPipeline.error('未收到模型输出，请检查 AI 配置后重试');
                }
                window.TcGenerationStreamUi.releaseAfterGenerate({
                    immediate: true,
                    status: 'error',
                    detail: '未收到模型输出'
                });
            } else {
                window.TcGenerationStreamUi.releaseAfterGenerate({ immediate: true, status: 'cancelled' });
            }
        }
        if (isMindmapCaseGenerate) hideTcMindmapGenerating();
        if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
        if (typeof tcFinalizeAppendGenerationTable === 'function') tcFinalizeAppendGenerationTable();
        var _pipelineFailed = extra.pipelineAlreadyFailed || (window.TcGenChatPipeline &&
            typeof window.TcGenChatPipeline.isFailed === 'function' &&
            window.TcGenChatPipeline.isFailed());
        if (!genCancelled && !_pipelineFailed && window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.persistAfterGeneration === 'function') {
            window.TcRequirementCaseStore.persistAfterGeneration().catch(function () { /* handled in store */ });
        } else if ((genCancelled || _pipelineFailed) && window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.abortGenerationAndRestoreTable === 'function') {
            window.TcRequirementCaseStore.abortGenerationAndRestoreTable({ mergeMode: aiMergeMode });
        } else if (window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.clearGenerationPinnedContext === 'function') {
            window.TcRequirementCaseStore.clearGenerationPinnedContext();
        }
        if (options.suppressLeftPanelUi) {
            window.__tcSuppressLeftPanelUi = false;
            if (typeof ensureTcLeftPanelClosedForHeadlessGen === 'function') {
                ensureTcLeftPanelClosedForHeadlessGen();
            }
        }
    }


    function isPipelineFallbackSummary(text) {
        return /^已解析 \*\*\d+\*\* 条用例并写入右侧表格。$/.test(String(text || '').trim());
    }

    function getAccumulatedGenerationStreamText() {
        var text = '';
        if (window.TcGenerationStreamClient && typeof window.TcGenerationStreamClient.getStreamText === 'function') {
            text = window.TcGenerationStreamClient.getStreamText() || '';
        }
        if (!String(text).trim() && window.TcGenChatPipeline && typeof window.TcGenChatPipeline.getStreamText === 'function') {
            text = window.TcGenChatPipeline.getStreamText() || '';
        }
        return String(text || '');
    }

    function pushResultToPipelineChat(resultText) {
        if (!window.TcGenChatPipeline || !window.TcGenChatPipeline.enabled || !window.TcGenChatPipeline.enabled()) return;
        if (typeof window.TcGenChatPipeline.setPhase === 'function') {
            window.TcGenChatPipeline.setPhase('generate', 'active', '模型输出');
        }
        if (typeof window.TcGenChatPipeline.ingestStreamText === 'function') {
            var text = String(resultText || '').trim();
            if (text) window.TcGenChatPipeline.ingestStreamText(text, { replace: true });
        }
    }

    function getExistingGeneratedRowCount() {
        if (window.TcGenerationStreamClient) {
            if (typeof TcGenerationStreamClient.getSessionRowsAdded === 'function') {
                var sessionAdded = TcGenerationStreamClient.getSessionRowsAdded();
                if (sessionAdded > 0) return sessionAdded;
            }
            if (typeof TcGenerationStreamClient.getTotalRows === 'function') {
                var streamTotal = TcGenerationStreamClient.getTotalRows();
                if (streamTotal > 0) return streamTotal;
            }
        }
        if (window.tcGenBatchCore && window.tcGenBatchCore.state) {
            var batchCount = parseInt(window.tcGenBatchCore.state.batchRowCount, 10) || 0;
            if (batchCount > 0) return batchCount;
        }
        if (typeof tcGetLastGenerationWriteStart === 'function') {
            var writeStart = tcGetLastGenerationWriteStart();
            if (writeStart >= 0 && typeof tcCountTableCaseContentRows === 'function') {
                var scoped = tcCountTableCaseContentRows(writeStart);
                if (scoped > 0) return scoped;
            }
        }
        return 0;
    }

    function isLikelyReasoningOnlyText(text) {
        text = String(text || '').trim();
        if (!text) return false;
        if (/test_cases\s*=|\[\s*\[/.test(text)) return false;
        if (/(?:^|\n)\s*[-*+]?\s*TC\s*[:：]/im.test(text)) return false;
        if (/^Here'?s a thinking process:/i.test(text)) return true;
        if (/^\*\*Analyze User Input:\*\*/im.test(text)) return true;
        return false;
    }

    function applyAiResultText(resultText, opts) {
        opts = opts || {};
        var silent = !!opts.silent;
        resultText = String(resultText != null ? resultText : '');
        var existingRows = getExistingGeneratedRowCount();
        if (existingRows > 0) {
            if (!silent) pushResultToPipelineChat(resultText);
            return existingRows;
        }
        if (isLikelyReasoningOnlyText(resultText)) {
            return 0;
        }
        if (!resultText.trim() || resultText.trim() === '无法获取AI回复') {
            if (!silent && getExistingGeneratedRowCount() <= 0) {
                tcAppAlert('模型未返回可用的用例内容，请检查 AI 配置或稍后重试。', {
                    variant: 'warning',
                    title: '无法解析结果',
                    hint: '确认文本模型可用，且提示词能引导输出 test_cases = [[...]] 列表。'
                });
            }
            return 0;
        }
        if (!silent) pushResultToPipelineChat(resultText);
        if (!opts.skipOverwriteReset && scope === 'legacy_freeform' && aiMergeMode === 'overwrite' &&
            !(typeof tcHasAppendGenerationBaseline === 'function' && tcHasAppendGenerationBaseline())) {
            var onlyPlaceholderRows = typeof tcTableHasOnlyPlaceholderRows === 'function'
                && tcTableHasOnlyPlaceholderRows();
            if (!onlyPlaceholderRows) {
                if (window.TcWorkbenchData) {
                    TcWorkbenchData.resetStoreForGeneration(outputTarget);
                } else {
                    if (outputTarget === 'mindmap') {
                        if (typeof tcMindmapClearAppendBaseline === 'function') tcMindmapClearAppendBaseline();
                        tcMindmapExternalMindData = null;
                        tcMindmapCasesData = [];
                        tcMindmapCasesProvenance = [];
                    } else {
                        testCasesData = [];
                        testCasesProvenance = [];
                        markedRows = new Set();
                        selectedRows.clear();
                    }
                }
            }
        }
        if (!opts.skipOverwriteReset && scope === 'legacy_freeform' && aiMergeMode === 'append' && outputTarget === 'mindmap') {
            if (typeof tcMindmapPrepareAppendGeneration === 'function') {
                tcMindmapPrepareAppendGeneration();
            }
        }
        var n = 0;
        if (outputTarget === 'mindmap') {
            n = parseMindmapElementClassificationResult(resultText, false);
            if (n === 0 && /test_cases\s*=|\[\s*\[/.test(resultText)) {
                n = parseAndAddTestCases(resultText, false, replaceAt, {
                    allowMindmapWithoutTemplate: true,
                    useMindmapStore: true
                });
            }
        } else {
            if (lanhuCookie && lanhuUrl && typeof tcCaptureGenerationLanhuContext === 'function') {
                tcCaptureGenerationLanhuContext(
                    typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset',
                    typeof TcWorkbenchEnhancements !== 'undefined' && TcWorkbenchEnhancements.getLastRequirementsSummary
                        ? TcWorkbenchEnhancements.getLastRequirementsSummary() : ''
                );
            }
            if (typeof tcEnsurePendingGenerationProvenance === 'function') {
                tcEnsurePendingGenerationProvenance(typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
            }
            n = parseAndAddTestCases(resultText, false, replaceAt, {
                allowMindmapWithoutTemplate: false,
                serverProvenanceEntry: window._tcLastLanhuProvenanceFromServer || null,
                mergeMode: aiMergeMode
            });
            window._tcLastLanhuProvenanceFromServer = null;
            if (n === 0 && /(?:^|\n)\s*[-*+]?\s*TC\s*[:：]/im.test(resultText)) {
                n = parseMindmapElementClassificationResult(resultText, false, { useTableStore: true });
            }
        }
        if (n > 0) {
            if (outputTarget === 'mindmap') {
                hideTcMindmapGenerating();
                switchTcRightView('mindmap');
                renderTcMindmap();
                tcMindmapCaptureUndoBaseline();
                tcMindmapPersistCache();
                window.setTimeout(function() {
                    if (tcMindmapInstance && tcMindmapInstance.mind && tcMindmapInstance.mind.root) {
                        tcMindmapInstance.scroll_node_to_center(tcMindmapInstance.mind.root);
                    }
                }, 200);
                if (scope === 'legacy_freeform') {
                    tcNotifyListGenerationSuccess(n, 'mindmap', scope, {
                        autoValidate: genAutoValidateForTask,
                        userPrompt: userPrompt
                    });
                }
                if (!silent) {
                    tcAppToast(
                        aiMergeMode === 'append'
                            ? ('已追加 ' + n + ' 条导图用例，并在思维导图中展示。')
                            : ('已生成 ' + n + ' 条导图用例，并在思维导图中展示。'),
                        { variant: 'success', duration: 3600 }
                    );
                }
            } else if (replaceAt) {
                switchTcRightView('table');
                if (!silent) {
                    tcAppToast('已按你的指令改写 ' + n + ' 行，并写回表格。', { variant: 'success', duration: 3600 });
                }
            } else if (scope === 'legacy_freeform' && outputTarget === 'list') {
                switchTcRightView('table');
                if (!silent) {
                    tcAppToast(
                        aiMergeMode === 'append'
                            ? ('已追加 ' + n + ' 条列表用例到表格末尾。')
                            : ('已生成 ' + n + ' 条列表用例，并填入右侧表格。'),
                        { variant: 'success', duration: 3600 }
                    );
                }
                tcNotifyListGenerationSuccess(n, outputTarget, scope, {
                    autoValidate: genAutoValidateForTask,
                    userPrompt: userPrompt
                });
            } else {
                switchTcRightView('table');
                if (!silent) {
                    tcAppToast('已解析并追加 ' + n + ' 条用例到表格末尾。', { variant: 'success', duration: 3600 });
                }
            }
        } else if (!silent) {
            existingRows = getExistingGeneratedRowCount();
            if (existingRows > 0) return existingRows;
            if (isLikelyReasoningOnlyText(resultText)) return 0;
            if (outputTarget === 'mindmap') {
                hideTcMindmapGenerating();
                renderTcMindmap();
            }
            var parseHint = outputTarget === 'mindmap'
                ? '导图模式需四层缩进结构，且用例行以 TC: 开头；也支持 test_cases = [[...]] 或 JSON 数组。'
                : '列表模式需 test_cases = [[...]] 或 JSON 数组；若模型返回要素分类法（TC: 行），系统已尝试自动转换。';
            tcAppAlert(
                '模型返回的内容无法解析为' + (outputTarget === 'mindmap' ? '导图层级文本或表格列表' : '表格列表或要素分类法') + '。',
                { variant: 'warning', title: '无法解析结果', hint: parseHint }
            );
            console.warn('[TestHub] AI 解析失败，返回内容前 1200 字:', String(resultText || '').slice(0, 1200));
        }
        return n;
    }

    function handleAiResultText(resultText) {
        var existingRows = getExistingGeneratedRowCount();
        if (existingRows > 0) return existingRows;
        return applyAiResultText(resultText, {
            silent: false,
            skipOverwriteReset: !!_tcStreamFallbackActive
        });
    }

    /** 内网预设：由服务端读取 builtin_ai_config / 环境变量内置文本模型 */
    function runAiStreamGenerate(mergedPrompt, streamOpts) {
        streamOpts = streamOpts || {};
        if (!window.TcGenerationStreamClient || typeof TcGenerationStreamClient.start !== 'function') {
            runBuiltinGenerateWithPrompt(mergedPrompt);
            return;
        }
        var streamPayload = {
            prompt: mergedPrompt,
            useBuiltin: true,
            temperature: tempNum,
            images: [],
            lanhuCookie: lanhuCookie,
            lanhuUrl: lanhuUrl,
            skipLanhuSessionMerge: true,
            pageGen: options.pageGen,
            mergeMode: aiMergeMode,
            outputTarget: outputTarget,
            scope: scope,
            autoValidate: genAutoValidateForTask,
            userPrompt: userPrompt,
            onFallback: function (reason) {
                _tcStreamFallbackActive = true;
                var existingRows = getExistingGeneratedRowCount();
                if (existingRows > 0) {
                    _tcStreamFallbackActive = false;
                    finishBtn();
                    return;
                }
                var streamText = getAccumulatedGenerationStreamText();
                if (String(streamText).trim() && !isPipelineFallbackSummary(streamText) &&
                    !isLikelyReasoningOnlyText(streamText)) {
                    var recovered = applyAiResultText(streamText, { skipOverwriteReset: true, silent: true });
                    if (recovered > 0) {
                        _tcStreamFallbackActive = false;
                        finishBtn();
                        return;
                    }
                }
                existingRows = getExistingGeneratedRowCount();
                if (existingRows > 0) {
                    _tcStreamFallbackActive = false;
                    finishBtn();
                    return;
                }
                tcAppToast('已切换为标准生成', { variant: 'info', duration: 2800 });
                runBuiltinGenerateWithPrompt(mergedPrompt);
                _tcStreamFallbackActive = false;
            },
            onError: function (msg) {
                if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(msg)) {
                    finishBtn();
                    return;
                }
                tcAppAlert(msg || '流式生成失败', { variant: 'error', title: '生成失败' });
                finishBtn();
            },
            onFinish: function () {
                finishBtn();
            },
            onCancel: function () {
                finishBtn();
            },
            runToken: generationRunToken,
            suppressLeftPanelUi: !!options.suppressLeftPanelUi
        };
        TcGenerationStreamClient.start(streamPayload).catch(function (err) {
            if ((typeof tcWorkbenchGlobal.tcIsBenignFetchAbort === 'function' && tcWorkbenchGlobal.tcIsBenignFetchAbort(err)) ||
                (err && err.name === 'AbortError') ||
                String((err && err.message) || '').toLowerCase() === 'cancelled') {
                finishBtn();
                return;
            }
            var rateMsg = String((err && err.message) || err || '');
            if (rateMsg === (globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__') || (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(rateMsg))) {
                finishBtn();
                return;
            }
            if (rateMsg.indexOf('过于频繁') >= 0 || rateMsg.indexOf('正在进行') >= 0) {
                tcAppAlert(rateMsg, { variant: 'warning', title: '请稍后再试' });
                finishBtn();
                return;
            }
            _tcStreamFallbackActive = true;
            if (getExistingGeneratedRowCount() > 0) {
                _tcStreamFallbackActive = false;
                finishBtn();
                return;
            }
            tcAppToast('已切换为标准生成', { variant: 'info', duration: 2800 });
            runBuiltinGenerateWithPrompt(mergedPrompt);
            _tcStreamFallbackActive = false;
        });
    }

    var _tcStreamFallbackActive = false;

    function shouldUseStreamGenerate() {
        if (_tcStreamFallbackActive) return false;
        if (scope !== 'legacy_freeform') return false;
        if (!isListCaseGenerate && !isMindmapCaseGenerate) return false;
        if (typeof isTcStreamGenerationEnabled === 'function' && isTcStreamGenerationEnabled()) return true;
        if (window.TcGenerationStreamClient && TcGenerationStreamClient.isEnabled()) return true;
        return false;
    }

    /** 内网预设：由服务端读取 builtin_ai_config / 环境变量内置文本模型 */
    function runBuiltinGenerateWithPrompt(mergedPrompt) {
        if (_tcStreamFallbackActive && getExistingGeneratedRowCount() > 0) {
            _tcStreamFallbackActive = false;
            finishBtn();
            return;
        }
        if (shouldUseStreamGenerate()) {
            runAiStreamGenerate(mergedPrompt, { useBuiltin: true });
            return;
        }
        const requestData = {
            use_builtin: true,
            prompt: mergedPrompt
        };
        if (tempNum !== null && !Number.isNaN(tempNum)) {
            requestData.temperature = tempNum;
        }
        if (lanhuCookie && lanhuUrl) {
            requestData.lanhu_cookie = lanhuCookie;
            requestData.lanhu_url = lanhuUrl;
        }
        tcPrepareVisualPayload(requestData).then(function (payload) {
            if (!isGenerationRunCurrent(generationRunToken)) {
                finishBtn();
                return;
            }
            var fetchOpts = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            };
            if (_tcGenerationFetchAbort) fetchOpts.signal = _tcGenerationFetchAbort.signal;
            return fetch('/api/test-case-generator', fetchOpts)
                .then(function(response) {
                    return response.json().catch(function() {
                        throw new Error('请求未完成：服务返回非 JSON（HTTP ' + response.status + '），多为网关超时或 500');
                    }).then(function(data) {
                        if (!isGenerationRunCurrent(generationRunToken)) return;
                        if (response.status === 429) {
                            throw new Error((data && data.error) || '生成过于频繁，请稍后再试');
                        }
                        if (data.error) {
                            if (typeof globalThis.hfAiQuotaFromErrorBody === 'function' && globalThis.hfAiQuotaFromErrorBody(data)) {
                                return;
                            }
                            if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(data.error)) {
                                return;
                            }
                            tcAppAlert(data.error, { variant: 'error', title: '模型未返回结果', hint: '请检查内置模型配置或网络后重试。' });
                            return;
                        }
                        if (data.lanhu_provenance) window._tcLastLanhuProvenanceFromServer = data.lanhu_provenance;
                        if (data.ai_quota && typeof global.hfAiQuotaNotify === 'function') {
                            global.hfAiQuotaNotify(data.ai_quota);
                        }

                        handleAiResultText(data.result);
                    });
                })
                .catch(function(error) {
                    if (!isGenerationRunCurrent(generationRunToken) || (typeof tcWorkbenchGlobal.tcIsBenignFetchAbort === 'function' && tcWorkbenchGlobal.tcIsBenignFetchAbort(error)) || (error && error.name === 'AbortError')) return;
                    var errMsg = error.message || String(error);
                    if (errMsg === (globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__')) return;
                    if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(errMsg)) return;
                    tcAppAlert(errMsg, { variant: 'error', title: '请求未完成', hint: '请检查网络或稍后在网络稳定时重试。' });
                });
        }).finally(finishBtn);
    }

    function isQuickPlanModuleEligible() {
        return !!(isListCaseGenerate && scope === 'legacy_freeform' && outputTarget === 'list');
    }

    function getLanhuPageTextChars() {
        var chars = typeof window.TC_LAST_LANHU_PAGE_TEXT_CHARS === 'number'
            ? window.TC_LAST_LANHU_PAGE_TEXT_CHARS
            : parseInt(window.TC_LAST_LANHU_PAGE_TEXT_CHARS, 10);
        return (!isNaN(chars) && chars > 0) ? chars : 0;
    }

    function shouldUseQuickPlanModulePath() {
        if (!isQuickPlanModuleEligible()) return false;
        return !!window.TC_LAST_LANHU_USE_MODULE_PIPELINE;
    }

    function runQuickPlanModuleGeneration() {
        var orch = window.TcAgentOrchestrator;
        if (!orch || typeof orch.runQuickPlanModuleJob !== 'function') {
            tcAppAlert('分模块生成组件未加载，请刷新页面后重试。', { variant: 'error', title: '生成失败' });
            finishBtn();
            return;
        }
        var bundle = window.TC_LAST_GENERATE_KNOWLEDGE_BUNDLE || {};
        if (targetBtn) targetBtn.textContent = '分模块生成…';
        pipelinePhase('parse_rows', 'pending', '等待写入表格');
        orch.runQuickPlanModuleJob({
            userIntent: userPrompt,
            mergeMode: aiMergeMode,
            scope: scope,
            autoValidate: genAutoValidateForTask,
            requirements: bundle.requirements || '',
            ragContext: bundle.ragContext || '',
            knowledgeBundle: bundle,
            finishBtn: finishBtn
        }).catch(function (error) {
            var msg = error && error.message ? error.message : String(error || '分模块生成失败');
            var pipelineFailed = false;
            if (window.TcGenChatPipeline && typeof window.TcGenChatPipeline.failStep === 'function') {
                window.TcGenChatPipeline.failStep('split_modules', msg);
                pipelineFailed = true;
            } else {
                tcAppAlert(msg, { variant: 'error', title: '生成失败' });
            }
            finishBtn({ pipelineAlreadyFailed: pipelineFailed, detail: msg });
        });
    }

    var promptChain;
    function pipelinePhase(id, status, detail) {
        if (window.TcGenChatPipeline && typeof window.TcGenChatPipeline.setPhase === 'function') {
            window.TcGenChatPipeline.setPhase(id, status, detail);
        }
    }
    function pipelineContextPrep(status, detail) {
        pipelinePhase('parse_req', status, detail);
    }
    if (window.TcGenChatPipeline && window.TcGenChatPipeline.enabled && window.TcGenChatPipeline.enabled()) {
        if (typeof window.TcGenChatPipeline.prepareForNewGenerationRun === 'function') {
            window.TcGenChatPipeline.prepareForNewGenerationRun();
        } else if (typeof window.TcGenChatPipeline.reset === 'function') {
            window.TcGenChatPipeline.reset();
        }
        if (window.TcWorkbenchEnhancements &&
            typeof window.TcWorkbenchEnhancements.resetValidateTaskState === 'function') {
            window.TcWorkbenchEnhancements.resetValidateTaskState('single', { clearCoverage: true, skipPersist: true });
        }
        window.TcGenChatPipeline.begin();
        if (typeof window.tcResetValidationParsedRows === 'function') {
            window.tcResetValidationParsedRows({ replace: true });
        }
        if (typeof window.TcGenChatPipeline.setOutputTarget === 'function') {
            window.TcGenChatPipeline.setOutputTarget(outputTarget);
        }
        if (typeof window.TcGenChatPipeline.captureQualityCheckEnabled === 'function') {
            window.TcGenChatPipeline.captureQualityCheckEnabled();
        }
        pipelineContextPrep('active', '准备生成上下文…');
        pipelinePhase('lanhu', 'pending', '等待开始');
        pipelinePhase('generate', 'pending', '');
    }
    function qualityCheckDetailSuffix(validateEnabled) {
        if (validateEnabled == null) validateEnabled = genAutoValidateForTask;
        return validateEnabled ? '已开启质量检查' : '未开启质量检查';
    }
    function buildRagContextDetail(ragPart, validateEnabled) {
        ragPart = String(ragPart || '').trim();
        var qc = qualityCheckDetailSuffix(validateEnabled);
        return ragPart ? (ragPart + ' · ' + qc) : qc;
    }
    var ragHooks = {
        validateEnabled: genAutoValidateForTask,
        onLanhuStart: function() {
            pipelinePhase('lanhu', 'active', '正在拉取蓝湖文档…');
            if (targetBtn) targetBtn.textContent = '拉取需求…';
        },
        onLanhuDone: function(ok) {
            var detail = ok ? '需求文档已获取' : '未配置蓝湖，已跳过';
            if (ok && shouldUseQuickPlanModulePath() &&
                window.TcGenChatPipeline && typeof window.TcGenChatPipeline.configureModulePipeline === 'function') {
                window.TcGenChatPipeline.configureModulePipeline(getLanhuPageTextChars());
                detail = '需求文档已获取，当前需求较大，将采用分模块生成';
            }
            pipelinePhase('lanhu', ok ? 'done' : 'skip', detail);
            pipelineContextPrep('active', '解析与总结需求…');
        },
        onSummarizeStart: function() {
            pipelineContextPrep('active', '提炼检索关键词…');
            if (targetBtn) targetBtn.textContent = '总结需求…';
        },
        onSummarizeDone: function(ok) {
            pipelineContextPrep('active', ok ? '需求摘要已就绪' : '准备检索上下文…');
        },
        onRagContextCheck: function(ragEnabled, validateEnabled) {
            if (ragEnabled) {
                pipelineContextPrep('active', buildRagContextDetail('准备检索历史需求', validateEnabled));
            } else {
                pipelineContextPrep('done', buildRagContextDetail('未开启 RAG，跳过历史检索', validateEnabled));
            }
        },
        onRagContextDone: function(info) {
            info = info || {};
            if (!info.ragEnabled) return;
            var ragPart = info.hit ? '已命中相关历史案例' : '未命中相关内容';
            if (info.skipReason) ragPart = String(info.skipReason);
            pipelineContextPrep('done', buildRagContextDetail(ragPart, info.validateEnabled));
            if (!shouldUseQuickPlanModulePath()) {
                pipelinePhase('generate', 'active', '组装 Prompt，准备调用 AI…');
            }
        },
        onLegacyStart: function() {
            pipelineContextPrep('active', buildRagContextDetail('检索平台历史需求…'));
            if (targetBtn) targetBtn.textContent = '检索历史需求…';
        },
        onPrepareGenerate: function() {
            var snap = (window.TcGenChatPipeline && typeof window.TcGenChatPipeline.getStepPhaseSnapshot === 'function')
                ? window.TcGenChatPipeline.getStepPhaseSnapshot() : {};
            snap = snap || {};
            if (!snap.lanhu || snap.lanhu.status === 'pending') {
                pipelinePhase('lanhu', (lanhuCookie && lanhuUrl) ? 'done' : 'skip',
                    (lanhuCookie && lanhuUrl) ? '需求文档已就绪' : '未配置蓝湖，已跳过');
            }
            if (!snap.parse_req || snap.parse_req.status === 'pending' || snap.parse_req.status === 'active') {
                pipelineContextPrep('done', '需求上下文已就绪');
            }
            if (shouldUseQuickPlanModulePath()) {
                if (window.TcGenChatPipeline && typeof window.TcGenChatPipeline.configureModulePipeline === 'function') {
                    window.TcGenChatPipeline.configureModulePipeline(getLanhuPageTextChars());
                }
                pipelinePhase('split_modules', 'pending', '等待开始');
                return;
            }
            pipelinePhase('generate', 'active', '上下文就绪，即将调用 AI');
        }
    };
    if (isListCaseGenerate) {
        if (lanhuCookie && lanhuUrl && targetBtn) targetBtn.textContent = '拉取需求…';
        promptChain = resolveListCaseGeneratePrompt(userPrompt, 'preset', ragHooks);
    } else if (isMindmapCaseGenerate) {
        if (lanhuCookie && lanhuUrl && targetBtn) targetBtn.textContent = '拉取需求…';
        promptChain = resolveMindmapCaseGeneratePrompt(userPrompt, 'preset', ragHooks);
    } else {
        promptChain = Promise.resolve(fullPrompt);
    }
    promptChain
        .then(function(mergedPrompt) {
            if (!isGenerationRunCurrent(generationRunToken)) {
                return;
            }
            if (ragHooks.onPrepareGenerate) ragHooks.onPrepareGenerate();
            if (shouldUseQuickPlanModulePath()) {
                runQuickPlanModuleGeneration();
                return;
            }
            if (targetBtn) targetBtn.textContent = '生成中...';
            runBuiltinGenerateWithPrompt(mergedPrompt);
        })
        .catch(function(error) {
            if (!isGenerationRunCurrent(generationRunToken)) {
                return;
            }
            var msg = error.message || String(error);
            if (window.TcGenChatPipeline && typeof window.TcGenChatPipeline.setPhase === 'function') {
                window.TcGenChatPipeline.setPhase('parse_req', 'error', msg);
            }
            tcAppAlert(msg, { variant: 'error', title: '生成失败', hint: '可先点「预览需求摘要」确认蓝湖 Cookie 是否有效。' });
            finishBtn();
        });
    }

    resolveAiGenerateMergeMode().then(function(choice) {
        if (choice === 'cancel') return;
        var mergeMode = choice === 'append' ? 'append' : 'overwrite';
        var syncBeforeGen = mergeMode === 'append'
            ? Promise.resolve(false)
            : tcSyncListTableBeforeAiGenerate();
        syncBeforeGen.then(function() {
            runAiGeneratePipeline(mergeMode);
        });
    });
}

/** 批次条核心（内联）：跟踪生成批次范围，供质量检查使用 */
window.tcGenBatchCore = (function() {
    var state = { batchId: null, batchRowStart: 0, batchRowCount: 0, batchMode: 'list' };

    function callEnh(fnName, arg) {
        var E = window.TcWorkbenchEnhancements;
        if (!E) return false;
        try {
            if (typeof E.ensureInit === 'function') E.ensureInit();
            if (typeof E[fnName] !== 'function') return false;
            if (arg !== undefined) E[fnName](arg);
            else E[fnName]();
            return true;
        } catch (err) {
            console.warn('[tcGenBatchCore]', err);
            return false;
        }
    }

    function paintBatchMeta(rowCount, mode) {
        var title = document.getElementById('tc-gen-batch-title');
        var meta = document.getElementById('tc-gen-batch-meta');
        if (title) title.textContent = '本次生成 · ' + (mode === 'mindmap' ? '导图' : '列表');
        if (meta) meta.textContent = '共 ' + rowCount + ' 条';
    }

    function onGeneration(rowCount) {
        state.batchMode = 'list';
        state.batchRowStart = typeof tcResolveListGenerationBatchStart === 'function'
            ? tcResolveListGenerationBatchStart(rowCount)
            : Math.max(0, ((typeof testCasesData !== 'undefined' && testCasesData) ? testCasesData.length : 0) - rowCount);
        state.batchRowCount = rowCount;
        state.batchId = 'local-' + Date.now();
        tcShowGenBatchBar(rowCount, 'list');
        paintBatchMeta(rowCount, 'list');
        if (typeof syncTcProvenanceRail === 'function') syncTcProvenanceRail();
    }

    function onStreamingComplete(batchRowStart, rowCount, mode) {
        state.batchMode = mode || 'list';
        state.batchRowStart = batchRowStart;
        state.batchRowCount = rowCount;
        state.batchId = 'local-' + Date.now();
        tcShowGenBatchBar(rowCount, state.batchMode);
        paintBatchMeta(rowCount, state.batchMode);
        if (typeof syncTcProvenanceRail === 'function') syncTcProvenanceRail();
    }

    function onMindmapGeneration(rowCount) {
        var total = (typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData) ? tcMindmapCasesData.length : 0;
        state.batchMode = 'mindmap';
        state.batchRowStart = Math.max(0, total - rowCount);
        state.batchRowCount = rowCount;
        state.batchId = 'local-' + Date.now();
        tcShowGenBatchBar(rowCount, 'mindmap');
        paintBatchMeta(rowCount, 'mindmap');
    }

    function refreshMindmapGenerationBatch(rowCount) {
        var total = (typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData) ? tcMindmapCasesData.length : 0;
        state.batchMode = 'mindmap';
        state.batchRowStart = Math.max(0, total - rowCount);
        state.batchRowCount = rowCount;
        tcShowGenBatchBar(rowCount, 'mindmap');
        paintBatchMeta(rowCount, 'mindmap');
    }

    function refreshGenerationBatch(rowCount) {
        state.batchMode = 'list';
        state.batchRowCount = rowCount;
        if (typeof tcResolveListGenerationBatchStart === 'function') {
            state.batchRowStart = tcResolveListGenerationBatchStart(rowCount);
        } else {
            state.batchRowStart = Math.max(0, ((typeof testCasesData !== 'undefined' && testCasesData)
                ? testCasesData.length : 0) - rowCount);
        }
        tcShowGenBatchBar(rowCount, 'list');
        paintBatchMeta(rowCount, 'list');
    }

    function initDelegation() {
        if (window._tcGenBatchDelegation) return;
        window._tcGenBatchDelegation = true;
        document.addEventListener('click', function(e) {
            if (!e.target.closest || !e.target.closest('#tc-gen-batch-bar')) return;
            if (e.target.closest('#tc-gen-batch-close-btn')) {
                e.preventDefault();
                e.stopPropagation();
                tcHideGenBatchBar();
                callEnh('onBatchClose');
            }
        }, true);
    }

    return {
        state: state,
        onGeneration: onGeneration,
        onStreamingComplete: onStreamingComplete,
        onMindmapGeneration: onMindmapGeneration,
        refreshMindmapGenerationBatch: refreshMindmapGenerationBatch,
        refreshGenerationBatch: refreshGenerationBatch,
        initDelegation: initDelegation
    };
})();

function tcShowGenBatchBar(rowCount, mode) {
    // "本次生成"横幅已永久隐藏
}

function tcHideGenBatchBar() {
    // no-op
}

function tcInitGenBatchBarUi() {
    if (window._tcGenBatchBarUiBound) return;
    window._tcGenBatchBarUiBound = true;
    window.tcShowGenBatchBar = tcShowGenBatchBar;
    window.tcHideGenBatchBar = tcHideGenBatchBar;
    if (window.tcGenBatchCore) window.tcGenBatchCore.initDelegation();
    if (window.TcWorkbenchEnhancements && typeof TcWorkbenchEnhancements.ensureInit === 'function') {
        TcWorkbenchEnhancements.ensureInit();
    }
    initTcPromptEnterGenerate();
    initTcPromptSendBtn();
    syncTcPromptSendBtnState();
    syncTcLeftGenPanelLayout();
    syncTcPromptIntroLayout();
}

var TC_AI_PROMPT_DEFAULT_PLACEHOLDER = '描述要生成的用例范围、格式与约束…';
var TC_PROMPT_INTRO_STORAGE_KEY = 'tc_prompt_intro_dismissed';

function isTcPromptIntroDismissed() {
    try {
        return sessionStorage.getItem(TC_PROMPT_INTRO_STORAGE_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function syncTcPromptIntroLayout() {
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    panel.classList.remove('tc-prompt-intro');
}

function dismissTcPromptIntro() {
    if (isTcPromptIntroDismissed()) return;
    try {
        sessionStorage.setItem(TC_PROMPT_INTRO_STORAGE_KEY, '1');
    } catch (e) { /* ignore */ }
    syncTcPromptIntroLayout();
    if (typeof tcLeftFloatRefreshContentHeights === 'function') tcLeftFloatRefreshContentHeights();
    if (typeof tcLeftFloatAdaptContentToPanel === 'function') tcLeftFloatAdaptContentToPanel();
}

function maybeDismissTcPromptIntroOnGenerate(promptEl) {
    var el = promptEl || document.getElementById('ai-prompt');
    if (!el || !String(el.value || '').trim()) return;
    dismissTcPromptIntro();
}

function maybeCollapseTcLanhuSectionIfExpanded() {
    if (typeof window.isTcLanhuSectionExpanded === 'function') {
        if (!window.isTcLanhuSectionExpanded()) return;
    } else {
        var root = document.getElementById('ai-config-mode-root');
        if (!root || root.classList.contains('tc-lanhu-section--collapsed')) return;
    }
    if (typeof window.toggleTcLanhuSection === 'function') {
        window.toggleTcLanhuSection(false);
    }
}
window.maybeCollapseTcLanhuSectionIfExpanded = maybeCollapseTcLanhuSectionIfExpanded;

function maybeCollapseTcLanhuSectionOnGenerate() {
    maybeCollapseTcLanhuSectionIfExpanded();
}
window.maybeCollapseTcLanhuSectionOnGenerate = maybeCollapseTcLanhuSectionOnGenerate;

function syncTcLeftGenPanelLayout() {
    if (!document.querySelector('.tc-workbench-scope')) return;
    var isMindmap = typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap';
    var compact = true;
    document.body.classList.toggle('tc-left-gen-compact', compact);
    document.body.classList.toggle('tc-left-gen-compact--mindmap', compact && isMindmap);
    var promptEl = document.getElementById('ai-prompt');
    if (promptEl) {
        promptEl.placeholder = compact
            ? (isMindmap
                ? '描述要生成的用例范围、格式与约束…（Enter 生成导图用例）'
                : '描述要生成的用例范围、格式与约束…（Enter 生成列表用例）')
            : TC_AI_PROMPT_DEFAULT_PLACEHOLDER;
    }
    if (typeof tcLeftFloatRefreshContentHeights === 'function') {
        tcLeftFloatRefreshContentHeights();
    }
    if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
    syncTcPromptIntroLayout();
}
window.syncTcPromptIntroLayout = syncTcPromptIntroLayout;
window.dismissTcPromptIntro = dismissTcPromptIntro;
window.syncTcLeftGenPanelLayout = syncTcLeftGenPanelLayout;

function isTcGenQualityCheckInProgress() {
    if (window.TcGenChatPipeline &&
        typeof window.TcGenChatPipeline.isQualityCheckPending === 'function' &&
        window.TcGenChatPipeline.isQualityCheckPending()) {
        return true;
    }
    if (window.TcWorkbenchEnhancements &&
        typeof window.TcWorkbenchEnhancements.isSingleGenValidationInProgress === 'function' &&
        window.TcWorkbenchEnhancements.isSingleGenValidationInProgress()) {
        return true;
    }
    return false;
}

function isTcPromptSendLocked() {
    return isTcPromptStopAvailable();
}

function isTcPromptStopAvailable() {
    if (window.TcAgentOrchestrator && typeof TcAgentOrchestrator.isGenModeLocked === 'function' &&
        TcAgentOrchestrator.isGenModeLocked()) {
        return true;
    }
    if (typeof isTcLeftPanelAiGenerateLocked === 'function' && isTcLeftPanelAiGenerateLocked()) {
        return true;
    }
    if (window.TcGenerationStreamUi && typeof TcGenerationStreamUi.isOpen === 'function' &&
        TcGenerationStreamUi.isOpen()) {
        return true;
    }
    if (isTcGenQualityCheckInProgress()) {
        return true;
    }
    var leftPanel = document.getElementById('left-panel');
    return !!(leftPanel && leftPanel.classList.contains('tc-left-panel--gen-streaming'));
}

function restoreTcPromptComposerAfterStop(opts) {
    opts = opts || {};
    if (typeof setTcLeftPanelAiGenerateLock === 'function') {
        setTcLeftPanelAiGenerateLock(false);
    }
    var leftPanel = document.getElementById('left-panel');
    var genActions = document.getElementById('tc-ai-generate-actions');
    if (leftPanel) leftPanel.classList.remove('tc-left-panel--gen-streaming');
    if (genActions) genActions.classList.remove('tc-ai-generate-actions--streaming');
    if (opts.releaseStreamUi !== false && window.TcGenerationStreamUi &&
        typeof window.TcGenerationStreamUi.releaseAfterGenerate === 'function') {
        window.TcGenerationStreamUi.releaseAfterGenerate({
            immediate: true,
            status: opts.status || 'cancelled',
            detail: opts.detail || ''
        });
    }
    if (typeof abortTcMindmapStreamingIfActive === 'function') {
        abortTcMindmapStreamingIfActive();
    } else if (typeof tcMindmapGenerating !== 'undefined' && tcMindmapGenerating &&
        typeof hideTcMindmapGenerating === 'function') {
        hideTcMindmapGenerating();
        if (typeof renderTcMindmap === 'function') renderTcMindmap();
    }
    if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
}

function releaseTcPromptGenerationUi() {
    if (window.TcGenChatPipeline && typeof window.TcGenChatPipeline.cancel === 'function') {
        window.TcGenChatPipeline.cancel();
    }
    restoreTcPromptComposerAfterStop();
}

var _tcGenerationRunToken = 0;
var _tcGenerationFetchAbort = null;

function bumpGenerationRunToken() {
    _tcGenerationRunToken += 1;
    return _tcGenerationRunToken;
}

function abortActiveGenerationRun() {
    _tcGenerationRunToken += 1;
    if (_tcGenerationFetchAbort) {
        try { _tcGenerationFetchAbort.abort(); } catch (e) { /* ignore */ }
        _tcGenerationFetchAbort = null;
    }
}

function isGenerationRunCurrent(token) {
    return token === _tcGenerationRunToken;
}

function triggerTcPromptStop() {
    if (window.TcAgentOrchestrator && typeof TcAgentOrchestrator.isGenModeLocked === 'function' &&
        TcAgentOrchestrator.isGenModeLocked()) {
        if (typeof TcAgentOrchestrator.cancelAgentJob === 'function') {
            TcAgentOrchestrator.cancelAgentJob();
        }
        abortActiveGenerationRun();
        if (window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.abortGenerationAndRestoreTable === 'function') {
            window.TcRequirementCaseStore.abortGenerationAndRestoreTable();
        }
        restoreTcPromptComposerAfterStop();
        return;
    }
    if (isTcGenQualityCheckInProgress()) {
        if (window.TcWorkbenchEnhancements &&
            typeof window.TcWorkbenchEnhancements.abortPendingValidation === 'function') {
            window.TcWorkbenchEnhancements.abortPendingValidation('single');
        }
        if (window.TcGenChatPipeline &&
            typeof window.TcGenChatPipeline.syncQualityCheckProgress === 'function') {
            window.TcGenChatPipeline.syncQualityCheckProgress({
                finish: true,
                error: true,
                detail: '已停止质量检查'
            });
        }
        if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
        return;
    }

    abortActiveGenerationRun();

    var handled = false;
    var streamClient = window.TcGenerationStreamClient;
    if (streamClient && typeof streamClient.cancel === 'function' &&
        ((typeof streamClient.isActive === 'function' && streamClient.isActive()) ||
            (typeof streamClient.getSessionId === 'function' && streamClient.getSessionId()))) {
        streamClient.cancel();
        handled = true;
    }
    var pipelineActive = window.TcGenChatPipeline &&
        typeof window.TcGenChatPipeline.isSessionActive === 'function' &&
        window.TcGenChatPipeline.isSessionActive();
    if (pipelineActive && window.TcGenChatPipeline &&
        typeof window.TcGenChatPipeline.cancel === 'function') {
        if (!handled) window.TcGenChatPipeline.cancel();
        handled = true;
    }
    if (!handled) {
        releaseTcPromptGenerationUi();
        return;
    }
    restoreTcPromptComposerAfterStop();
}

function syncTcPromptSendBtnState() {
    var el = document.getElementById('ai-prompt');
    var btn = document.getElementById('tc-prompt-send-btn');
    if (!btn) return;
    var stopMode = isTcPromptStopAvailable();
    var hasText = !!(el && String(el.value || '').trim());
    var canSend = hasText && !stopMode;
    btn.disabled = stopMode ? false : !canSend;
    btn.classList.toggle('tc-prompt-composer__send-btn--active', canSend);
    btn.classList.toggle('tc-prompt-composer__send-btn--stop', stopMode);
    btn.title = stopMode ? '停止生成' : '发送生成';
    btn.setAttribute('aria-label', stopMode ? '停止生成' : '发送生成');
}

function triggerTcPromptSend() {
    var promptEl = document.getElementById('ai-prompt');
    if (!promptEl || !String(promptEl.value || '').trim()) return;
    if (isTcPromptSendLocked()) return;
    var promptText = String(promptEl.value || '').trim();
    var sendOpts = { promptText: promptText, commitPromptToChat: true };
    maybeDismissTcPromptIntroOnGenerate(promptEl);
    maybeCollapseTcLanhuSectionIfExpanded();
    var isMindmap = document.body.classList.contains('tc-left-gen-compact--mindmap') ||
        (typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap');
    if (isMindmap && typeof ensureTcMindmapGenerateColumns === 'function') {
        ensureTcMindmapGenerateColumns();
    }
    runAiTableToolbar('legacy_freeform', null, Object.assign({ outputTarget: isMindmap ? 'mindmap' : 'list' }, sendOpts));
}
window.isTcPromptSendLocked = isTcPromptSendLocked;
window.isTcPromptStopAvailable = isTcPromptStopAvailable;
window.isTcGenQualityCheckInProgress = isTcGenQualityCheckInProgress;
window.abortActiveGenerationRun = abortActiveGenerationRun;
window.isGenerationRunCurrent = isGenerationRunCurrent;
window.triggerTcPromptStop = triggerTcPromptStop;
window.restoreTcPromptComposerAfterStop = restoreTcPromptComposerAfterStop;
window.syncTcPromptSendBtnState = syncTcPromptSendBtnState;
window.triggerTcPromptSend = triggerTcPromptSend;

function initTcPromptEnterGenerate() {
    var el = document.getElementById('ai-prompt');
    if (!el || el.dataset.tcEnterGenBound === '1') return;
    el.dataset.tcEnterGenBound = '1';
    el.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.isComposing) return;
        if (typeof tcAppDialogIsOpen === 'function' && tcAppDialogIsOpen()) return;
        if (!document.body.classList.contains('tc-left-gen-compact')) return;
        if (typeof isTcPromptSendLocked === 'function' && isTcPromptSendLocked()) return;
        e.preventDefault();
        triggerTcPromptSend();
    });
    syncTcPromptSendBtnState();
}

function initTcPromptSendBtn() {
    var btn = document.getElementById('tc-prompt-send-btn');
    if (!btn || btn.dataset.tcSendBound === '1') return;
    btn.dataset.tcSendBound = '1';
    btn.addEventListener('click', function() {
        if (isTcPromptStopAvailable()) {
            triggerTcPromptStop();
            return;
        }
        if (btn.disabled) return;
        triggerTcPromptSend();
    });
}


/* ---- tc_incremental_table.js ---- */
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

/* ---- tc_incremental_mindmap.js ---- */
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

/* ---- tc_generation_stream_ui.js ---- */
/**
 * TestHub — 流式生成进度（对话区实时展示）
 */
(function (global) {
    'use strict';

    var STEP_LABELS = {
        connect: '连接模型',
        gen: '生成用例',
        parse: '解析',
        write: '写入表格',
        done: '完成',
        error: '生成出错',
        cancelled: '已取消'
    };

    var state = {
        open: false,
        suppressLeftPanelUi: false,
        parsedRows: 0,
        moduleName: '',
        step: 'connect',
        inParsePhase: false
    };

    var closeSchedule = { timer: null };
    var DONE_HOLD_MS = 3000;

    function $(id) { return document.getElementById(id); }

    function isHeadlessGenerationUi() {
        return !!(state.suppressLeftPanelUi || (global.__tcSuppressLeftPanelUi));
    }

    function ensureLeftPanelOpen() {
        if (isHeadlessGenerationUi()) return;
        var panel = $('left-panel');
        if (!panel || !panel.classList.contains('tc-left-float-panel--collapsed')) return;
        if (typeof toggleCollapse === 'function') toggleCollapse();
    }

    function currentStepLabel() {
        return STEP_LABELS[state.step] || STEP_LABELS.connect;
    }


    function progressDetailText() {
        var parts = [];
        if (state.inParsePhase || state.parsedRows > 0) {
            parts.push('已解析 ' + state.parsedRows + ' 条');
        }
        if (state.moduleName) parts.push(state.moduleName);
        return parts.join(' · ');
    }

    function progressStatus() {
        if (state.step === 'done') return 'done';
        if (state.step === 'error') return 'error';
        if (state.step === 'cancelled') return 'cancelled';
        return 'active';
    }

    function isActiveStep() {
        return state.step === 'connect' || state.step === 'gen' || state.step === 'parse' || state.step === 'write';
    }

    function clearCloseSchedule() {
        if (closeSchedule.timer) {
            window.clearTimeout(closeSchedule.timer);
            closeSchedule.timer = null;
        }
    }

    function scheduleStreamingClose() {
        clearCloseSchedule();
        closeSchedule.timer = window.setTimeout(function () {
            closeSchedule.timer = null;
            closePanel();
        }, DONE_HOLD_MS);
    }

    function setStreamingChrome(on) {
        var panel = $('left-panel');
        var actions = $('tc-ai-generate-actions');
        if (panel) panel.classList.toggle('tc-left-panel--gen-streaming', !!on);
        if (actions) actions.classList.toggle('tc-ai-generate-actions--streaming', !!on);
        if (typeof global.syncTcPromptSendBtnState === 'function') {
            global.syncTcPromptSendBtnState();
        }
    }

    function renderChatProgress() {
        var syncFn = global.TcGenChatPipeline && (
            global.TcGenChatPipeline.syncStreamProgressStep || global.TcGenChatPipeline.syncStreamStep
        );
        if (syncFn) {
            var payload = {
                step: state.step,
                parsedRows: state.parsedRows,
                detail: progressDetailText()
            };
            if (state.step === 'done' && global.TcGenChatPipeline.getStreamText) {
                payload.stream_text = global.TcGenChatPipeline.getStreamText();
            }
            if (global.TcGenChatPipeline.getThinkingText) {
                payload.reasoning_text = global.TcGenChatPipeline.getThinkingText();
            }
            if (!payload.reasoning_text && global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.getReasoningText === 'function') {
                payload.reasoning_text = global.TcGenerationStreamClient.getReasoningText();
            }
            syncFn(payload);
        }
    }


    function openPanel(label, opts) {
        opts = opts || {};
        clearCloseSchedule();
        state.suppressLeftPanelUi = !!opts.suppressLeftPanelUi;
        if (!state.suppressLeftPanelUi) {
            ensureLeftPanelOpen();
        }
        if (global.TcGenChatPipeline && global.TcGenChatPipeline.enabled && global.TcGenChatPipeline.enabled()) {
            var syncFn = global.TcGenChatPipeline.syncStreamProgressStep || global.TcGenChatPipeline.syncStreamStep;
            if (syncFn) syncFn({ step: 'connect' });
        }
        state.open = !state.suppressLeftPanelUi;
        if (!state.suppressLeftPanelUi) {
            setStreamingChrome(true);
        }
    }

    function completeChatProgressTerminal(opts) {
        opts = opts || {};
        if (global.TcGenChatPipeline && (
            global.TcGenChatPipeline.syncStreamProgressStep || global.TcGenChatPipeline.syncStreamStep
        )) {
            var terminalStep = opts.status === 'error' ? 'error' : (opts.status === 'cancelled' ? 'cancelled' : 'done');
            var payload = {
                step: terminalStep,
                parsedRows: state.parsedRows,
                detail: opts.detail || progressDetailText()
            };
            if (terminalStep === 'done' && global.TcGenChatPipeline.getStreamText) {
                payload.stream_text = global.TcGenChatPipeline.getStreamText();
            }
            if (global.TcGenChatPipeline.getThinkingText) {
                payload.reasoning_text = global.TcGenChatPipeline.getThinkingText();
            }
            if (!payload.reasoning_text && global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.getReasoningText === 'function') {
                payload.reasoning_text = global.TcGenerationStreamClient.getReasoningText();
            }
            var syncTerminal = global.TcGenChatPipeline.syncStreamProgressStep || global.TcGenChatPipeline.syncStreamStep;
            syncTerminal(payload);
        }
    }

    function closePanel() {
        clearCloseSchedule();
        if (state.open && isActiveStep()) {
            completeChatProgressTerminal({
                stepLabel: STEP_LABELS.cancelled,
                status: 'cancelled',
                detail: progressDetailText()
            });
        }
        state.open = false;
        if (!state.suppressLeftPanelUi) {
            setStreamingChrome(false);
        }
        state.suppressLeftPanelUi = false;
        if (typeof global.tcGenChatFinalizeProgress === 'function') {
            global.tcGenChatFinalizeProgress();
        }
    }

    function ensureStreamingFinished() {
        if (global.TcGenChatPipeline) {
            if (global.TcGenChatPipeline.isFinished && global.TcGenChatPipeline.isFinished()) {
                return;
            }
            if (global.TcGenChatPipeline.finish) {
                var streamText = global.TcGenChatPipeline.getStreamText
                    ? global.TcGenChatPipeline.getStreamText()
                    : '';
                var reasoningText = '';
                if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.getReasoningText === 'function') {
                    reasoningText = global.TcGenerationStreamClient.getReasoningText() || '';
                }
                if (!reasoningText && global.TcGenChatPipeline.getThinkingText) {
                    reasoningText = global.TcGenChatPipeline.getThinkingText() || '';
                }
                global.TcGenChatPipeline.finish({
                    total_rows: state.parsedRows,
                    stream_text: streamText,
                    reasoning_text: reasoningText
                });
                return;
            }
        }
        if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.finish === 'function') {
            global.TcGenChatStreaming.finish({ total_rows: state.parsedRows });
        }
    }

    function updateProgress(opts) {
        opts = opts || {};
        if (opts.parsedRows != null) state.parsedRows = opts.parsedRows;
        if (opts.moduleName != null) state.moduleName = opts.moduleName;
        if (opts.step) {
            state.step = opts.step;
            if (opts.step === 'parse' || opts.step === 'write') state.inParsePhase = true;
        }
        renderChatProgress();
        paintBatchBarStreaming();
        if (opts.step === 'done' || opts.step === 'cancelled' || opts.step === 'error') {
            scheduleStreamingClose();
        }
    }

    function isPanelOpen() {
        return !!state.open;
    }

    /** 生成流程结束：流式 UI 未进入终态时补全并收起（避免回退标准生成后卡在「连接模型」） */
    function releaseAfterGenerate(opts) {
        opts = opts || {};
        if (opts.immediate) {
            if (opts.status === 'error') {
                completeChatProgressTerminal({
                    stepLabel: STEP_LABELS.error,
                    status: 'error',
                    detail: opts.detail || ''
                });
            } else if (isActiveStep() || state.open) {
                completeChatProgressTerminal({
                    stepLabel: STEP_LABELS.cancelled,
                    status: 'cancelled',
                    detail: progressDetailText()
                });
            }
            ensureStreamingFinished();
            closePanel();
            reset();
            return;
        }
        if (opts.parsedRows != null) state.parsedRows = opts.parsedRows;
        if (state.step !== 'done' && state.step !== 'cancelled' && state.step !== 'error') {
            state.step = 'done';
        }
        completeChatProgressTerminal({
            stepLabel: currentStepLabel(),
            status: progressStatus(),
            detail: progressDetailText()
        });
        ensureStreamingFinished();
        if (!state.open) {
            setStreamingChrome(false);
            if (typeof global.tcGenChatFinalizeProgress === 'function') {
                global.tcGenChatFinalizeProgress();
            }
            reset();
            return;
        }
        if (state.step === 'done' || state.step === 'cancelled' || state.step === 'error') {
            renderChatProgress();
            if (!closeSchedule.timer) scheduleStreamingClose();
            return;
        }
        renderChatProgress();
        scheduleStreamingClose();
    }

    function paintBatchBarStreaming() {
        var meta = document.getElementById('tc-gen-batch-meta');
        if (meta) {
            meta.textContent = state.parsedRows > 0 ? ('已解析 ' + state.parsedRows + ' 条') : '';
        }
    }

    function reset() {
        state.suppressLeftPanelUi = false;
        state.parsedRows = 0;
        state.moduleName = '';
        state.step = 'connect';
        state.inParsePhase = false;
        clearCloseSchedule();
    }

    global.TcGenerationStreamUi = {
        open: openPanel,
        close: closePanel,
        update: updateProgress,
        reset: reset,
        releaseAfterGenerate: releaseAfterGenerate,
        isOpen: isPanelOpen,
        init: function () {},
        paintBatchBar: paintBatchBarStreaming
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_generation_stream_client.js ---- */
/**
 * TestHub — 流式生成 SSE 客户端
 */
(function (global) {
    'use strict';

    var clientState = {
        sessionId: null,
        eventSource: null,
        cancelled: false,
        finished: false,
        successHandled: false,
        streamText: '',
        reasoningText: '',
        reconciling: false,
        totalRows: 0,
        sessionRowsAdded: 0,
        lastRowProvenance: null,
        onFinish: null,
        onError: null,
        onCancel: null,
        mergeMode: 'overwrite',
        outputTarget: 'list',
        scope: 'legacy_freeform',
        starting: false,
        startAbortController: null
    };

    function isGenerationRunAllowed(opts) {
        opts = opts || {};
        if (opts.runToken == null) return true;
        if (typeof global.isGenerationRunCurrent === 'function') {
            return global.isGenerationRunCurrent(opts.runToken);
        }
        return true;
    }

    function isStreamEnabled() {
        try {
            if (global.TC_STREAM_GENERATION === true || global.TC_STREAM_GENERATION === 1) return true;
            return localStorage.getItem('TC_STREAM_GENERATION') === '1';
        } catch (e) {
            return false;
        }
    }

    function buildRequestBody(opts) {
        var body = {
            prompt: opts.prompt,
            mode: opts.outputTarget === 'mindmap' ? 'mindmap' : 'list',
            merge_mode: opts.mergeMode || 'overwrite',
            columns: typeof tableColumns !== 'undefined' && tableColumns ? tableColumns.slice() : [],
            use_builtin: opts.useBuiltin,
            base_url: opts.baseUrl,
            api_key: opts.apiKey,
            model: opts.model,
            temperature: opts.temperature,
            images: opts.images || []
        };
        if (opts.skipLanhuSessionMerge) {
            body.skip_lanhu_merge = true;
        }
        if (opts.lanhuCookie && opts.lanhuUrl && !opts.skipLanhuSessionMerge) {
            body.lanhu_cookie = opts.lanhuCookie;
            body.lanhu_url = opts.lanhuUrl;
        }
        if (opts.pageGen && typeof opts.pageGen === 'object') {
            body.page_gen = opts.pageGen;
        }
        return body;
    }


    function pushReasoningToPipeline(text, replace) {
        text = String(text || '');
        if (!text.trim()) return;
        syncThinkingToUi(text, replace);
        if (!global.TcGenChatPipeline) return;
        if (typeof global.TcGenChatPipeline.setReasoningContent === 'function') {
            global.TcGenChatPipeline.setReasoningContent(text, { replace: !!replace });
        } else if (typeof global.TcGenChatPipeline.appendReasoningContent === 'function') {
            global.TcGenChatPipeline.appendReasoningContent(text);
        }
    }

    function syncThinkingToUi(text, replace) {
        text = String(text || '');
        if (!text.trim() && !replace) return;
        if (replace) {
            global.__tcGenReasoningText = text;
        } else {
            global.__tcGenReasoningText = (global.__tcGenReasoningText || '') + text;
        }
        try {
            global.dispatchEvent(new CustomEvent('tc-gen-reasoning-update', {
                detail: { text: global.__tcGenReasoningText, piece: text, replace: !!replace }
            }));
        } catch (e) { /* ignore */ }
        if (global.TcGenChatXUi) {
            if (replace && typeof global.TcGenChatXUi.setThinkingContent === 'function') {
                global.TcGenChatXUi.setThinkingContent(text, { replace: true });
            } else if (typeof global.TcGenChatXUi.appendThinkingContent === 'function') {
                global.TcGenChatXUi.appendThinkingContent(text);
            } else if (typeof global.TcGenChatXUi.setThinkingContent === 'function') {
                global.TcGenChatXUi.setThinkingContent(global.__tcGenReasoningText, { replace: true });
            }
        }
    }

    function clearThinkingUi() {
        global.__tcGenReasoningText = '';
        try {
            global.dispatchEvent(new CustomEvent('tc-gen-reasoning-update', { detail: { clear: true } }));
        } catch (e) { /* ignore */ }
    }

    function ensurePipelineReasoning(extraText) {
        var merged = String(clientState.reasoningText || '').trim();
        if (extraText) {
            var piece = String(extraText || '').trim();
            if (piece && (!merged || piece.length > merged.length)) merged = piece;
        }
        if (merged) pushReasoningToPipeline(merged, true);
    }

    function resolveStreamTextForFinish(data) {
        var text = clientState.streamText || (data && data.full_text) || '';
        if (String(text || '').trim()) {
            return Promise.resolve(String(text));
        }
        var sid = clientState.sessionId;
        if (!sid) return Promise.resolve('');
        return fetch('/api/test-cases/generation-sessions/' + encodeURIComponent(sid))
            .then(function (res) {
                return res.json().then(function (body) {
                    if (!res.ok) throw new Error((body && body.error) || '读取会话失败');
                    return body;
                });
            })
            .then(function (session) {
                if (session && session.output_text) return String(session.output_text);
                return fetch('/api/test-cases/generation-sessions/' + encodeURIComponent(sid) + '/events?after=0')
                    .then(function (res2) {
                        return res2.json().then(function (body2) {
                            if (!res2.ok) return '';
                            return body2;
                        });
                    })
                    .then(function (body2) {
                        var events = (body2 && body2.events) || [];
                        var merged = '';
                        var reasoningMerged = '';
                        var i;
                        for (i = 0; i < events.length; i++) {
                            var ev = events[i];
                            if (!ev || !ev.type) continue;
                            if (ev.type === 'stream_chunk') {
                                if ((ev.stream_kind || 'content') === 'reasoning') {
                                    reasoningMerged += ev.content || '';
                                } else {
                                    merged += ev.content || '';
                                }
                            }
                            if (ev.type === 'stream_done') {
                                if (ev.reasoning_text) reasoningMerged = String(ev.reasoning_text);
                                if (ev.full_text) return String(ev.full_text);
                            }
                            if (ev.type === 'session_done') {
                                if (ev.reasoning_text) reasoningMerged = String(ev.reasoning_text);
                                if (ev.full_text) return String(ev.full_text);
                            }
                        }
                        if (reasoningMerged) {
                            clientState.reasoningText = reasoningMerged;
                            pushReasoningToPipeline(reasoningMerged, true);
                        }
                        return merged;
                    });
            })
            .catch(function () {
                return '';
            });
    }

    function buildStreamFinishPayload(ctx, data, finalStream, recovered) {
        var sessionAdded = clientState.sessionRowsAdded || 0;
        var serverRows = parseInt(data && data.total_rows, 10) || 0;
        var streamParsed = parseInt(clientState.totalRows, 10) || 0;
        var finishRows = Math.max(sessionAdded, recovered || 0);
        if (finishRows <= 0 && ctx.outputTarget !== 'mindmap') {
            if (global.tcGenBatchCore && global.tcGenBatchCore.state) {
                var coreCount = parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0;
                if (coreCount > 0) finishRows = coreCount;
            }
            if (finishRows <= 0 && typeof tcCountTableCaseContentRows === 'function') {
                var batchStart = clientState.batchRowStart != null ? parseInt(clientState.batchRowStart, 10) : -1;
                if (isNaN(batchStart) || batchStart < 0) {
                    if (typeof tcGetLastGenerationWriteStart === 'function') {
                        batchStart = tcGetLastGenerationWriteStart();
                    }
                }
                if ((isNaN(batchStart) || batchStart < 0) && global.tcGenBatchCore && global.tcGenBatchCore.state) {
                    batchStart = parseInt(global.tcGenBatchCore.state.batchRowStart, 10);
                }
                var batchLimit = global.tcGenBatchCore && global.tcGenBatchCore.state
                    ? parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0 : 0;
                if (!isNaN(batchStart) && batchStart >= 0) {
                    if (batchLimit > 0) {
                        finishRows = tcCountTableCaseContentRows(batchStart, batchLimit);
                    } else if (batchStart > 0) {
                        finishRows = tcCountTableCaseContentRows(batchStart);
                    }
                }
            }
        }
        if (finishRows <= 0 && serverRows > 0 && (sessionAdded > 0 || streamParsed > 0 || (recovered || 0) > 0)) {
            finishRows = serverRows;
        }
        if (finishRows <= 0 && serverRows > 0 && streamParsed > 0) {
            finishRows = serverRows;
        }
        if (ctx.outputTarget !== 'mindmap' &&
            typeof global.tcResolveListGenerationBatchContentRows === 'function') {
            var tableBatchRows = global.tcResolveListGenerationBatchContentRows();
            if (tableBatchRows > 0) finishRows = tableBatchRows;
        }
        if (finishRows > 0) {
            clientState.totalRows = Math.max(clientState.totalRows || 0, finishRows);
        }
        return {
            total_rows: finishRows,
            finish_row_count: finishRows,
            batch_row_start: clientState.batchRowStart != null ? clientState.batchRowStart : 0,
            trust_server_row_count: finishRows > 0 && serverRows > 0 && sessionAdded <= 0 && (recovered || 0) <= 0,
            stream_text: finalStream || clientState.streamText || '',
            reasoning_text: clientState.reasoningText || (data && data.reasoning_text) || ''
        };
    }

    function ensurePipelineParseWriteFinish(ctx, finishPayload) {
        if (!global.TcGenChatPipeline || !finishPayload) return;
        if (typeof global.TcGenChatPipeline.isFinished === 'function' &&
            global.TcGenChatPipeline.isFinished()) {
            return;
        }
        if (typeof global.TcGenChatPipeline.completeStreamParseWriteFinish === 'function') {
            global.TcGenChatPipeline.completeStreamParseWriteFinish(finishPayload);
            return;
        }
        if (typeof global.TcGenChatPipeline.finish === 'function') {
            global.TcGenChatPipeline.finish(finishPayload);
        }
    }

    function finalizeSessionDone(data, ctx) {
        if (clientState.cancelled) {
            if (ctx.onCancel) ctx.onCancel();
            return;
        }
        if (data && data.reasoning_text) {
            clientState.reasoningText = String(data.reasoning_text);
        }
        ensurePipelineReasoning(data && data.reasoning_text);
        resolveStreamTextForFinish(data).then(function (finalStream) {
            if (finalStream) clientState.streamText = finalStream;
            ensurePipelineReasoning(data && data.reasoning_text);
            var recovered = 0;
            var sessionAddedBeforeRecover = clientState.sessionRowsAdded || 0;
            if (sessionAddedBeforeRecover <= 0) {
                recovered = recoverRowsFromStreamText(ctx, finalStream || clientState.streamText || '');
            }
            if (recovered <= 0 && clientState.reasoningText && sessionAddedBeforeRecover <= 0) {
                recovered = recoverRowsFromStreamText(ctx, clientState.reasoningText);
            }
            var expectedRows = data && data.total_rows != null ? parseInt(data.total_rows, 10) : 0;
            if (expectedRows > (clientState.sessionRowsAdded || 0) && finalStream) {
                var tailRecovered = recoverMissingStreamRows(ctx, finalStream, clientState.sessionRowsAdded || 0);
                if (tailRecovered > 0) {
                    clientState.sessionRowsAdded = (clientState.sessionRowsAdded || 0) + tailRecovered;
                    recovered = Math.max(recovered, tailRecovered);
                }
            }
            var finishPayload = buildStreamFinishPayload(ctx, data, finalStream || clientState.streamText || '', recovered);
            if (ctx.outputTarget === 'mindmap') {
                if (typeof finalizeStreamingMindmap === 'function') finalizeStreamingMindmap();
            } else if (typeof finalizeStreamingRows === 'function') {
                finalizeStreamingRows();
            }
            if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.finish === 'function') {
                global.TcGenChatPipeline.finish(finishPayload);
            } else if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.finish === 'function') {
                global.TcGenChatStreaming.finish({ total_rows: finishPayload.total_rows });
            }
            if (global.TcGenerationStreamUi) {
                global.TcGenerationStreamUi.update({ step: 'done', parsedRows: finishPayload.total_rows });
            }
            if (typeof global.refreshTcPageGenLock === 'function') global.refreshTcPageGenLock();
            if (typeof global.clearOptimisticPageGenLock === 'function') global.clearOptimisticPageGenLock();
            finishSuccess(ctx, finishPayload);
        });
    }

    function handleEvent(ev, ctx) {
        if (clientState.cancelled) return;
        var data = ev;
        if (!data || !data.type) return;
        var ui = global.TcGenerationStreamUi;
        switch (data.type) {
            case 'ai_quota':
                if (typeof global.hfAiQuotaNotify === 'function' && data.ai_quota) {
                    global.hfAiQuotaNotify(data.ai_quota);
                }
                break;
            case 'session_start':
                if (ui) ui.update({ step: 'connect' });
                break;
            case 'stream_chunk':
                if ((data.stream_kind || 'content') === 'reasoning') {
                    clientState.reasoningText = (clientState.reasoningText || '') + (data.content || '');
                    syncThinkingToUi(data.content || '', false);
                    if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.setPhase === 'function') {
                        global.TcGenChatPipeline.setPhase('generate', 'active', '思考中…');
                    }
                    if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.appendReasoningContent === 'function') {
                        global.TcGenChatPipeline.appendReasoningContent(data.content || '');
                    }
                    if (ui) ui.update({ step: 'gen' });
                    break;
                }
                clientState.streamText = (clientState.streamText || '') + (data.content || '');
                if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.setPhase === 'function') {
                    global.TcGenChatPipeline.setPhase('generate', 'active', '正在输出…');
                }
                if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.appendContent === 'function') {
                    global.TcGenChatPipeline.appendContent(data.content || '');
                } else if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.appendContent === 'function') {
                    global.TcGenChatStreaming.appendContent(data.content || '');
                }
                if (ui) ui.update({ step: 'gen' });
                if (typeof ctx.onStreamChunk === 'function') {
                    ctx.onStreamChunk(data.content || '', data);
                }
                break;
            case 'stream_done':
                if (data.reasoning_text) {
                    clientState.reasoningText = String(data.reasoning_text);
                    pushReasoningToPipeline(data.reasoning_text, true);
                }
                if (data.full_text) {
                    clientState.streamText = String(data.full_text);
                }
                if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.ingestStreamText === 'function') {
                    global.TcGenChatPipeline.ingestStreamText(clientState.streamText || data.full_text || '', { replace: true });
                }
                if (typeof ctx.onStreamComplete === 'function') {
                    ctx.onStreamComplete(data);
                }
                break;
            case 'stream_error':
                if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.error === 'function') {
                    global.TcGenChatPipeline.error(data.message || '生成失败');
                } else if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.error === 'function') {
                    global.TcGenChatStreaming.error(data.message || '生成失败');
                }
                break;
            case 'stream_activity': {
                var actStep = 'gen';
                if (data.stage === 'connecting') actStep = 'connect';
                else if ((data.parsed_rows || 0) > 0) actStep = 'parse';
                if (ui) {
                    ui.update({
                        step: actStep,
                        parsedRows: data.parsed_rows != null ? data.parsed_rows : undefined
                    });
                }
                break;
            }
            case 'parse_progress':
                clientState.totalRows = data.parsed_rows || clientState.totalRows;
                if (ui) ui.update({
                    parsedRows: data.parsed_rows,
                    step: 'parse',
                    moduleName: data.module_name || ''
                });
                break;
            case 'rows_commit':
                if (ctx.outputTarget === 'mindmap' && data.rows && data.rows.length) {
                    if (typeof appendMindmapRowsIncremental === 'function') {
                        appendMindmapRowsIncremental(data.rows, {
                            streaming: true,
                            autoFit: false
                        });
                    }
                    clientState.sessionRowsAdded += data.rows.length;
                    clientState.totalRows = typeof tcMindmapCasesData !== 'undefined'
                        ? tcMindmapCasesData.length
                        : clientState.totalRows;
                } else if (ctx.outputTarget === 'list' && data.rows && data.rows.length) {
                    restoreListAppendBaselineIfNeeded(ctx);
                    if (typeof appendParsedRowsIncremental === 'function') {
                        var committed = appendParsedRowsIncremental(data.rows, {
                            streaming: true,
                            autoScroll: true,
                            provenance: data.provenance || null,
                            mergeMode: ctx.mergeMode || clientState.mergeMode || 'overwrite'
                        });
                        if (committed > 0) clientState.sessionRowsAdded += committed;
                    }
                    clientState.totalRows = Math.max(
                        clientState.sessionRowsAdded || 0,
                        clientState.totalRows || 0,
                        (data.rows && data.rows.length) || 0
                    );
                }
                if (ui) ui.update({ parsedRows: getSessionParsedRowCount(), step: 'write' });
                break;
            case 'module_done':
                if (ui) ui.update({
                    moduleName: data.module_name || '',
                    parsedRows: clientState.totalRows
                });
                break;
            case 'session_done':
                clientState.finished = true;
                clientState.totalRows = data.total_rows || clientState.totalRows;
                clientState.lastRowProvenance = data.row_provenance || null;
                if (data.reasoning_text) {
                    clientState.reasoningText = String(data.reasoning_text);
                    ensurePipelineReasoning(data.reasoning_text);
                }
                if (clientState.cancelled || data.cancelled) {
                    if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.cancel === 'function') {
                        global.TcGenChatPipeline.cancel();
                    } else if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.cancel === 'function') {
                        global.TcGenChatStreaming.cancel();
                    }
                    if (ctx.outputTarget === 'mindmap') {
                        if (typeof abortTcMindmapStreamingIfActive === 'function') {
                            abortTcMindmapStreamingIfActive();
                        } else if (typeof finalizeStreamingMindmap === 'function') {
                            finalizeStreamingMindmap();
                        }
                    }
                    if (global.TcGenerationStreamUi) {
                        global.TcGenerationStreamUi.update({ step: 'cancelled', parsedRows: clientState.totalRows });
                    }
                    if (ctx.onCancel) ctx.onCancel();
                    break;
                }
                finalizeSessionDone(data, ctx);
                break;
            case 'error':
                clientState.finished = true;
                var genErrMsg = data.message || '生成失败';
                if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(genErrMsg)) {
                    if (ui) ui.update({ step: 'error' });
                    if (typeof global.refreshTcPageGenLock === 'function') global.refreshTcPageGenLock();
                    if (typeof global.clearOptimisticPageGenLock === 'function') global.clearOptimisticPageGenLock();
                    break;
                }
                if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.error === 'function') {
                    global.TcGenChatStreaming.error(genErrMsg);
                }
                if (ui) ui.update({ step: 'error' });
                if (typeof global.refreshTcPageGenLock === 'function') global.refreshTcPageGenLock();
                if (typeof global.clearOptimisticPageGenLock === 'function') global.clearOptimisticPageGenLock();
                if (data.recoverable && ctx.onFallback) {
                    ctx.onFallback(genErrMsg);
                } else if (ctx.onError) {
                    ctx.onError(genErrMsg);
                }
                break;
            case 'stream_end':
                closeSource();
                if (!clientState.finished && !clientState.cancelled) {
                    reconcileSession(ctx);
                }
                break;
            default:
                break;
        }
    }

    function reconcileSession(ctx) {
        var sid = clientState.sessionId;
        if (!sid || clientState.finished || clientState.reconciling) return;
        clientState.reconciling = true;
        fetch('/api/test-cases/generation-sessions/' + encodeURIComponent(sid))
            .then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) throw new Error(data.error || '查询会话失败');
                    return data;
                });
            })
            .then(function (session) {
                if (clientState.finished) return;
                var status = session.status || '';
                if (status === 'done') {
                    handleEvent({
                        type: 'session_done',
                        total_rows: session.parsed_rows,
                        duration_ms: session.duration_ms,
                        full_text: clientState.streamText || ''
                    }, ctx);
                } else if (status === 'error') {
                    handleEvent({
                        type: 'error',
                        message: session.error_message || '生成失败',
                        recoverable: true
                    }, ctx);
                } else if (status === 'cancelled') {
                    handleEvent({ type: 'session_done', total_rows: session.parsed_rows || 0, cancelled: true }, ctx);
                } else if (ctx.onFallback) {
                    if (global.TcGenerationStreamUi) {
                        global.TcGenerationStreamUi.update({ step: 'gen' });
                    }
                    ctx.onFallback('流式连接已结束，会话仍在进行');
                }
            })
            .catch(function () {
                if (!clientState.finished && !clientState.cancelled && ctx.onFallback) {
                    if (global.TcGenerationStreamUi) {
                        global.TcGenerationStreamUi.update({ step: 'gen' });
                    }
                    ctx.onFallback('SSE 连接中断');
                }
            })
            .finally(function () {
                clientState.reconciling = false;
            });
    }

    function releaseStreamUiImmediate(opts) {
        opts = opts || {};
        if (global.TcGenerationStreamUi && typeof global.TcGenerationStreamUi.releaseAfterGenerate === 'function') {
            global.TcGenerationStreamUi.releaseAfterGenerate(Object.assign({ immediate: true }, opts));
        } else if (global.TcGenerationStreamUi && typeof global.TcGenerationStreamUi.close === 'function') {
            global.TcGenerationStreamUi.close();
        }
    }

    function getSessionParsedRowCount() {
        return clientState.sessionRowsAdded || 0;
    }

    function getEffectiveRowCount() {
        var sessionAdded = clientState.sessionRowsAdded || 0;
        if (clientState.outputTarget !== 'mindmap' &&
            typeof global.tcResolveListGenerationBatchContentRows === 'function') {
            var batchContentRows = global.tcResolveListGenerationBatchContentRows();
            if (batchContentRows > 0) return batchContentRows;
        }
        if (sessionAdded > 0) return sessionAdded;
        if (clientState.outputTarget === 'mindmap') {
            if (typeof global.tcMindmapCasesData !== 'undefined' && global.tcMindmapCasesData) {
                var mmBase = parseInt(window._tcMindmapAppendBaselineCount, 10);
                if (!isNaN(mmBase) && mmBase >= 0) {
                    return Math.max(0, global.tcMindmapCasesData.length - mmBase);
                }
            }
            return parseInt(clientState.totalRows, 10) || 0;
        }
        if (global.tcGenBatchCore && global.tcGenBatchCore.state) {
            var batchCount = parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0;
            if (batchCount > 0) return batchCount;
        }
        var batchStart = clientState.batchRowStart != null ? parseInt(clientState.batchRowStart, 10) : -1;
        if (isNaN(batchStart) || batchStart < 0) {
            if (typeof tcGetLastGenerationWriteStart === 'function') {
                batchStart = tcGetLastGenerationWriteStart();
            }
        }
        if ((isNaN(batchStart) || batchStart < 0) && global.tcGenBatchCore && global.tcGenBatchCore.state) {
            batchStart = parseInt(global.tcGenBatchCore.state.batchRowStart, 10);
        }
        var batchLimit = global.tcGenBatchCore && global.tcGenBatchCore.state
            ? parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0 : 0;
        if (typeof tcCountTableCaseContentRows === 'function' && !isNaN(batchStart) && batchStart >= 0) {
            if (batchLimit > 0) {
                var limited = tcCountTableCaseContentRows(batchStart, batchLimit);
                if (limited > 0) return limited;
            }
            if (batchStart > 0) {
                var scoped = tcCountTableCaseContentRows(batchStart);
                if (scoped > 0) return scoped;
            }
        }
        return parseInt(clientState.totalRows, 10) || 0;
    }

    function hasStreamGeneratedRows() {
        return getEffectiveRowCount() > 0;
    }

    function wrapStreamCallbacks(opts) {
        var next = Object.assign({}, opts);
        if (typeof next.onFallback === 'function') {
            var userFallback = next.onFallback;
            next.onFallback = function (reason) {
                if (global.TcGenerationStreamUi) {
                    global.TcGenerationStreamUi.update({ step: 'gen' });
                }
                userFallback(reason);
            };
        }
        if (typeof next.onError === 'function') {
            var userError = next.onError;
            next.onError = function (message) {
                releaseStreamUiImmediate({ status: 'error', detail: message || '' });
                userError(message);
            };
        }
        return next;
    }

    function getAccumulatedStreamText() {
        var text = String(clientState.streamText || '').trim();
        if (text) return text;
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.getStreamText === 'function') {
            text = String(global.TcGenChatPipeline.getStreamText() || '').trim();
        }
        return text;
    }

    function isPipelineFallbackSummary(text) {
        return /^已解析 \*\*\d+\*\* 条用例并写入右侧表格。$/.test(String(text || '').trim());
    }


    function recoverMissingStreamRows(ctx, sourceText, alreadyAdded) {
        alreadyAdded = parseInt(alreadyAdded, 10) || 0;
        if (!sourceText || alreadyAdded < 0) return 0;
        if (typeof parseTestCaseRowsFromAiText !== 'function') return 0;
        var payload = typeof extractAiPayloadText === 'function'
            ? extractAiPayloadText(sourceText)
            : String(sourceText || '');
        var rows = parseTestCaseRowsFromAiText(payload);
        if (rows.length <= alreadyAdded) return 0;
        var tail = rows.slice(alreadyAdded);
        if (!tail.length) return 0;
        if (ctx.outputTarget === 'mindmap') {
            if (typeof appendMindmapRowsIncremental === 'function') {
                appendMindmapRowsIncremental(tail, { streaming: false, autoFit: false });
                return tail.length;
            }
            return 0;
        }
        if (typeof appendParsedRowsIncremental === 'function') {
            return appendParsedRowsIncremental(tail, {
                streaming: false,
                autoScroll: true,
                mergeMode: ctx.mergeMode || clientState.mergeMode || 'overwrite',
                appendOnly: true
            }) || 0;
        }
        if (typeof parseAndAddTestCases === 'function') {
            return parseAndAddTestCases(sourceText, false, null, {
                mergeMode: 'append',
                appendOnly: true
            }) || 0;
        }
        return 0;
    }

    function recoverRowsFromStreamText(ctx, sourceText) {
        var text = String(sourceText != null ? sourceText : getAccumulatedStreamText());
        if (!text || isPipelineFallbackSummary(text)) return 0;
        if (ctx.outputTarget === 'mindmap' && typeof tcMindmapExtractParseableText === 'function') {
            text = tcMindmapExtractParseableText(text);
        }
        var mergeMode = ctx.mergeMode || clientState.mergeMode || 'overwrite';
        if (ctx.outputTarget === 'mindmap' && mergeMode === 'append') {
            if (typeof tcMindmapEnsureAppendBaselineIntact === 'function') {
                tcMindmapEnsureAppendBaselineIntact();
            }
            if ((clientState.sessionRowsAdded || 0) > 0) return clientState.sessionRowsAdded;
        }
        var added = 0;
        if (ctx.outputTarget === 'mindmap') {
            if (typeof parseMindmapElementClassificationResult === 'function') {
                added = parseMindmapElementClassificationResult(text, false);
            }
            if (added === 0 && /test_cases\s*=|\[\s*\[/.test(text) && typeof parseAndAddTestCases === 'function') {
                added = parseAndAddTestCases(text, false, null, {
                    allowMindmapWithoutTemplate: true,
                    useMindmapStore: true
                });
            }
            return added;
        }
        if (typeof parseAndAddTestCases === 'function') {
            if (typeof tcEnsurePendingGenerationProvenance === 'function') {
                tcEnsurePendingGenerationProvenance(typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
            }
            added = parseAndAddTestCases(text, false, null, {
                allowMindmapWithoutTemplate: false,
                serverProvenanceEntry: clientState.lastRowProvenance || null,
                mergeMode: ctx.mergeMode || clientState.mergeMode || 'overwrite'
            });
        }
        if (added === 0 && /(?:^|\n)\s*[-*+]?\s*TC\s*[:：]/im.test(text) &&
            typeof parseMindmapElementClassificationResult === 'function') {
            added = parseMindmapElementClassificationResult(text, false, { useTableStore: true });
        }
        if (added > 0) {
            clientState.sessionRowsAdded = (clientState.sessionRowsAdded || 0) + added;
            clientState.totalRows = Math.max(clientState.totalRows || 0, added);
        }
        return added;
    }

    function finishSuccess(ctx, initialFinishPayload) {
        clientState.finished = true;
        syncLanhuDocSwitcherLockUiAfterStream();
        var sessionAdded = clientState.sessionRowsAdded || 0;
        var n = getEffectiveRowCount();
        if (sessionAdded <= 0 && !getAccumulatedStreamText()) {
            var recoveredEarly = recoverRowsFromStreamText(ctx);
            if (recoveredEarly > 0) {
                sessionAdded = clientState.sessionRowsAdded || recoveredEarly;
                n = getEffectiveRowCount();
            }
        }
        if (n <= 0 && getAccumulatedStreamText()) {
            var recovered = recoverRowsFromStreamText(ctx);
            if (recovered > 0) {
                sessionAdded = clientState.sessionRowsAdded || recovered;
                n = getEffectiveRowCount();
            }
        }
        if (n <= 0 && clientState.reasoningText) {
            var recoveredFromReasoning = recoverRowsFromStreamText(ctx, clientState.reasoningText);
            if (recoveredFromReasoning > 0) {
                sessionAdded = clientState.sessionRowsAdded || recoveredFromReasoning;
                n = getEffectiveRowCount();
            }
        }
        if (n <= 0 && (clientState.totalRows || 0) > 0) {
            if (getAccumulatedStreamText()) {
                var retryFromStream = recoverRowsFromStreamText(ctx);
                if (retryFromStream > 0) {
                    sessionAdded = clientState.sessionRowsAdded || retryFromStream;
                    n = getEffectiveRowCount();
                }
            }
            if (n <= 0 && clientState.reasoningText) {
                var retryFromReasoning = recoverRowsFromStreamText(ctx, clientState.reasoningText);
                if (retryFromReasoning > 0) {
                    sessionAdded = clientState.sessionRowsAdded || retryFromReasoning;
                    n = getEffectiveRowCount();
                }
            }
        }
        if (n <= 0) {
            n = getEffectiveRowCount();
        }
        if (n <= 0) {
            releaseStreamUiImmediate({ status: 'error', detail: '未解析到有效用例' });
            if (ctx.onFallback) {
                ctx.onFallback('未解析到有效用例');
            } else if (ctx.onError) {
                ctx.onError('未解析到有效用例');
            } else if (ctx.onFinish) {
                ctx.onFinish(0);
            }
            return;
        }
        if (clientState.successHandled) {
            if (ctx.onFinish) ctx.onFinish(n);
            return;
        }
        clientState.successHandled = true;
        var finishPayload = initialFinishPayload || buildStreamFinishPayload(ctx, null, getAccumulatedStreamText(), sessionAdded);
        finishPayload.total_rows = Math.max(n, finishPayload.total_rows || 0);
        finishPayload.finish_row_count = finishPayload.total_rows;
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.isFinished === 'function' &&
            !global.TcGenChatPipeline.isFinished() && !global.TcGenChatPipeline.isFailed()) {
            ensurePipelineParseWriteFinish(ctx, finishPayload);
        }
        // 先恢复左栏按钮/锁，避免后续批次条、校验等逻辑抛错导致 UI 卡在「生成中…」
        if (ctx.onFinish) ctx.onFinish(n);
        try {
            if (ctx.outputTarget === 'mindmap') {
                if (typeof hideTcMindmapGenerating === 'function') hideTcMindmapGenerating();
                if (typeof switchTcRightView === 'function') switchTcRightView('mindmap');
                if (typeof renderTcMindmap === 'function') renderTcMindmap();
                if (typeof tcMindmapCaptureUndoBaseline === 'function') tcMindmapCaptureUndoBaseline();
                if (typeof tcMindmapClearAppendBaseline === 'function') tcMindmapClearAppendBaseline();
                if (typeof tcNotifyListGenerationSuccess === 'function') {
                    var mmBatchStart = ctx.batchRowStart != null ? ctx.batchRowStart : (parseInt(window._tcMindmapAppendBaselineCount, 10) || 0);
                    var mmBatchCount = sessionAdded > 0 ? sessionAdded : Math.max(0, n - mmBatchStart);
                    tcNotifyListGenerationSuccess(mmBatchCount, 'mindmap', ctx.scope, {
                        autoValidate: ctx.autoValidate,
                        userPrompt: ctx.userPrompt || '',
                        batchRowStart: mmBatchStart
                    });
                }
            } else {
                if (typeof syncTableDomAfterStream === 'function') {
                    syncTableDomAfterStream();
                } else {
                    if (typeof switchTcRightView === 'function') switchTcRightView('table');
                    if (typeof renderTableBody === 'function') renderTableBody({ reload: true });
                }
                var batchStart = ctx.batchRowStart != null ? ctx.batchRowStart : 0;
                var batchCount = sessionAdded > 0 ? sessionAdded : Math.max(0, n - batchStart);
                if (batchCount > 0 && ctx.batchRowStart == null && typeof tcResolveListGenerationBatchStart === 'function') {
                    batchStart = tcResolveListGenerationBatchStart(batchCount);
                    batchCount = sessionAdded > 0 ? sessionAdded : Math.max(0, n - batchStart);
                }
                if (typeof global.tcResolveListGenerationBatchContentRows === 'function') {
                    var bannerBatchRows = global.tcResolveListGenerationBatchContentRows();
                    if (bannerBatchRows > 0) batchCount = bannerBatchRows;
                }
                if (clientState.lastRowProvenance && typeof tcApplyServerProvenanceEntryToRows === 'function') {
                    tcApplyServerProvenanceEntryToRows(batchStart, batchCount, clientState.lastRowProvenance);
                } else {
                    if (typeof tcEnsurePendingGenerationProvenance === 'function') {
                        tcEnsurePendingGenerationProvenance(typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
                    }
                    if (typeof tcFinalizeGenerationProvenanceForRows === 'function') {
                        tcFinalizeGenerationProvenanceForRows(
                            batchStart,
                            batchCount,
                            typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset'
                        );
                    }
                }
                if (window.tcGenBatchCore && typeof window.tcGenBatchCore.onStreamingComplete === 'function') {
                    window.tcGenBatchCore.onStreamingComplete(batchStart, batchCount, 'list');
                } else if (window.tcGenBatchCore && typeof window.tcGenBatchCore.onGeneration === 'function') {
                    window.tcGenBatchCore.onGeneration(batchCount);
                }
                if (typeof tcNotifyListGenerationSuccess === 'function') {
                    tcNotifyListGenerationSuccess(batchCount, 'list', ctx.scope, {
                        autoValidate: ctx.autoValidate,
                        batchRowStart: batchStart,
                        userPrompt: ctx.userPrompt || ''
                    });
                }
            }
        } catch (err) {
            console.error('[TcGenerationStreamClient] finishSuccess side effects failed', err);
        }
    }

    function closeSource() {
        if (clientState.eventSource) {
            try { clientState.eventSource.close(); } catch (e) { /* ignore */ }
            clientState.eventSource = null;
        }
    }

    function subscribeStream(sessionId, ctx) {
        if (clientState.cancelled) return;
        closeSource();
        var es = new EventSource('/api/test-cases/generation-sessions/' + sessionId + '/stream');
        clientState.eventSource = es;
        es.onmessage = function (msg) {
            try {
                var data = JSON.parse(msg.data);
                handleEvent(data, ctx);
            } catch (e) { /* ignore */ }
        };
        es.onerror = function () {
            closeSource();
            if (!clientState.cancelled && !clientState.finished) {
                reconcileSession(ctx);
            }
        };
    }



    function syncListTableFromGridBeforeGeneration() {
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            return global.TcTableBridge.commitAll();
        }
        if (typeof global.tcTablePullRowsFromView === 'function') {
            return global.tcTablePullRowsFromView();
        }
        return Promise.resolve(false);
    }

    function finalizeListTableGenerationPrep(opts) {
        if (clientState.mergeMode !== 'append') clientState.listAppendBaseline = null;
        if (!clientState.listAppendBaseline && clientState.mergeMode === 'append' && typeof global.testCasesData !== 'undefined' && global.testCasesData) {
            clientState.listAppendBaseline = global.testCasesData.map(function (row) {
                return Array.isArray(row) ? row.slice() : row;
            });
        }
        if (opts.mergeMode === 'append') {
            opts.batchRowStart = typeof testCasesData !== 'undefined' ? testCasesData.length : 0;
        } else {
            opts.batchRowStart = typeof tcResolveGenerationBatchRowStart === 'function'
                ? tcResolveGenerationBatchRowStart(opts.mergeMode || 'overwrite')
                : (typeof testCasesData !== 'undefined' ? testCasesData.length : 0);
        }
        var _effectiveMergeMode = (opts.mergeMode === 'append' || clientState.mergeMode === 'append') ? 'append'
            : (opts.mergeMode || clientState.mergeMode || 'overwrite');
        if (_effectiveMergeMode === 'overwrite' &&
            !(typeof global.tcHasAppendGenerationBaseline === 'function' && global.tcHasAppendGenerationBaseline())) {
            opts.batchRowStart = 0;
            var onlyPlaceholderRows = typeof tcTableHasOnlyPlaceholderRows === 'function'
                && tcTableHasOnlyPlaceholderRows();
            if (!onlyPlaceholderRows) {
                if (window.TcWorkbenchData) {
                    TcWorkbenchData.resetStoreForGeneration('list');
                } else {
                    testCasesData = [];
                    testCasesProvenance = [];
                    markedRows = new Set();
                    selectedRows.clear();
                }
                if (typeof renderTableBody === 'function') renderTableBody({ reload: true });
            }
        }
    }

    function restoreListAppendBaselineIfNeeded(ctx) {
        if (typeof global.tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
            global.tcRestoreAppendGenerationBaselineIfNeeded();
        }
        var mergeMode = (ctx && ctx.mergeMode) || clientState.mergeMode || 'overwrite';
        if (mergeMode !== 'append') return;
        var baseline = clientState.listAppendBaseline;
        if (!baseline || !baseline.length || typeof global.testCasesData === 'undefined') return;
        var baseCount = 0;
        var nowCount = 0;
        for (var i = 0; i < baseline.length; i++) {
            if (typeof global.tcTableRowHasCaseContent === 'function') {
                if (global.tcTableRowHasCaseContent(baseline[i])) baseCount++;
            }
        }
        for (var j = 0; j < (global.testCasesData || []).length; j++) {
            if (typeof global.tcTableRowHasCaseContent === 'function') {
                if (global.tcTableRowHasCaseContent(global.testCasesData[j])) nowCount++;
            }
        }
        if (baseCount > nowCount || baseline.length > (global.testCasesData || []).length) {
            global.testCasesData = baseline.map(function (row) {
                return Array.isArray(row) ? row.slice() : row;
            });
            if (typeof global.tcEnsureProvenanceLength === 'function') {
                try { global.tcEnsureProvenanceLength(); } catch (eBase) { /* ignore */ }
            }
            if (typeof global.renderTableBody === 'function') {
                global.renderTableBody({ reload: true });
            }
        }
    }

    function isGenerationRateLimitError(err) {
        var msg = String((err && err.message) || err || '');
        return msg.indexOf('过于频繁') >= 0 || msg.indexOf('正在进行') >= 0 ||
            msg.indexOf('429') >= 0;
    }

    function cancelActiveSessionsForRetry() {
        return fetch('/api/test-cases/generation-sessions/active/cancel-all', {
            method: 'POST',
            credentials: 'same-origin'
        }).then(function (res) {
            return res.json().catch(function () { return {}; });
        }).catch(function () { return {}; });
    }


    function syncLanhuDocSwitcherLockUiAfterStream() {
        if (typeof global.tcSyncLanhuNavLockUiAfterGenerationIdle === 'function') {
            global.tcSyncLanhuNavLockUiAfterGenerationIdle();
        } else {
            if (typeof global.tcSyncLanhuDocSwitcherLockUi === 'function') {
                global.tcSyncLanhuDocSwitcherLockUi();
            }
            if (typeof global.tcSyncLanhuTreePageSwitchLockUi === 'function') {
                global.tcSyncLanhuTreePageSwitchLockUi();
            }
        }
    }

    function start(opts) {
        opts = wrapStreamCallbacks(opts || {});
        if (!isGenerationRunAllowed(opts)) {
            clientState.starting = false;
            if (opts.onCancel) opts.onCancel();
            return Promise.resolve();
        }
        clientState.cancelled = false;
        clientState.finished = false;
        clientState.starting = true;
        clientState.startAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
        clientState.sessionId = null;
        clientState.successHandled = false;
        clientState.streamText = '';
        clientState.reasoningText = '';
        clearThinkingUi();
        clientState.reconciling = false;
        clientState.totalRows = 0;
        clientState.sessionRowsAdded = 0;
        clientState.lastRowProvenance = null;
        clientState.mergeMode = opts.mergeMode || 'overwrite';
        clientState.listAppendBaseline = null;
        clientState.outputTarget = opts.outputTarget || 'list';
        clientState.scope = opts.scope || 'legacy_freeform';
        clientState.onFinish = opts.onFinish;
        clientState.onError = opts.onError;
        clientState.onCancel = opts.onCancel;
        syncLanhuDocSwitcherLockUiAfterStream();
        if (typeof tcResetGenerationWriteTracking === 'function') {
            tcResetGenerationWriteTracking();
        }
        if (opts.mergeMode === 'append' && opts.outputTarget === 'mindmap') {
            if (typeof tcMindmapPrepareAppendGeneration === 'function') {
                tcMindmapPrepareAppendGeneration();
            }
        } else if (typeof tcMindmapClearAppendBaseline === 'function') {
            tcMindmapClearAppendBaseline();
        }
        if (opts.outputTarget === 'mindmap' &&
            typeof tcResolveMindmapGenerationBatchRowStart === 'function') {
            opts.batchRowStart = tcResolveMindmapGenerationBatchRowStart(opts.mergeMode || 'overwrite');
        }

        if (global.TcGenerationStreamUi) {
            global.TcGenerationStreamUi.reset();
            var label = opts.outputTarget === 'mindmap' ? '导图用例生成' : '列表用例生成';
            global.TcGenerationStreamUi.open(label, {
                suppressLeftPanelUi: !!opts.suppressLeftPanelUi
            });
        }
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.setOutputTarget === 'function') {
            global.TcGenChatPipeline.setOutputTarget(opts.outputTarget === 'mindmap' ? 'mindmap' : 'list');
        }
        if (typeof resetTcStreamScrollPause === 'function') resetTcStreamScrollPause();
        if (typeof global.tcResetValidationParsedRows === 'function') {
            global.tcResetValidationParsedRows({ replace: true });
        }

        if (opts.lanhuCookie && opts.lanhuUrl && typeof tcCaptureGenerationLanhuContext === 'function') {
            tcCaptureGenerationLanhuContext(
                typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset',
                typeof TcWorkbenchEnhancements !== 'undefined' && TcWorkbenchEnhancements.getLastRequirementsSummary
                    ? TcWorkbenchEnhancements.getLastRequirementsSummary() : ''
            );
        }
        if (typeof tcEnsurePendingGenerationProvenance === 'function') {
            tcEnsurePendingGenerationProvenance(typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
        }

        if (opts.mergeMode === 'overwrite' && opts.outputTarget === 'mindmap') {
            if (typeof tcMindmapClearAppendBaseline === 'function') tcMindmapClearAppendBaseline();
            if (typeof resetStreamingMindmapState === 'function') resetStreamingMindmapState();
            tcMindmapExternalMindData = null;
            tcMindmapCasesData = [];
            tcMindmapCasesProvenance = [];
            tcMindmapUndoStack = [];
            tcMindmapHistory = [];
            tcMindmapHistoryIndex = -1;
            tcMindmapUndoBaseline = null;
            if (typeof showTcMindmapGenerating === 'function') showTcMindmapGenerating();
        }

        if (opts.outputTarget === 'list' && typeof tcShowGenBatchBar === 'function') {
            tcShowGenBatchBar(0, 'list');
            var title = document.getElementById('tc-gen-batch-title');
            if (title) title.textContent = '本次生成（进行中）';
        }
        if (opts.outputTarget === 'mindmap' && typeof tcShowGenBatchBar === 'function') {
            tcShowGenBatchBar(0, 'mindmap');
            var mmTitle = document.getElementById('tc-gen-batch-title');
            if (mmTitle) mmTitle.textContent = '本次生成（进行中）';
        }

        var body = buildRequestBody(opts);
        var prep = Promise.resolve();
        if ((opts.outputTarget || 'list') === 'list') {
            prep = prep.then(function () {
                if (clientState.mergeMode === 'append') {
                    if (typeof global.tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
                        global.tcRestoreAppendGenerationBaselineIfNeeded();
                    }
                    if (typeof global.tcGetAppendGenerationBaselineRows === 'function') {
                        var _appendBase = global.tcGetAppendGenerationBaselineRows();
                        if (_appendBase && _appendBase.length) {
                            clientState.listAppendBaseline = _appendBase;
                        }
                    }
                    if (!clientState.listAppendBaseline && typeof global.testCasesData !== 'undefined' && global.testCasesData) {
                        clientState.listAppendBaseline = global.testCasesData.map(function (row) {
                            return Array.isArray(row) ? row.slice() : row;
                        });
                    }
                    return Promise.resolve(false);
                }
                return syncListTableFromGridBeforeGeneration();
            }).then(function () {
                finalizeListTableGenerationPrep(opts);
                restoreListAppendBaselineIfNeeded({ mergeMode: clientState.mergeMode, outputTarget: 'list' });
                if (clientState.mergeMode === 'append' && typeof global.renderTableBody === 'function') {
                    global.renderTableBody({ reload: true });
                }
            });
        }
        if (global.TcVisualAttachments && typeof global.TcVisualAttachments.getAssets === 'function'
            && global.TcVisualAttachments.getAssets().length
            && typeof global.TcVisualAttachments.rebuildContext === 'function') {
            prep = prep.then(function () {
                return global.TcVisualAttachments.rebuildContext();
            });
        }
        return prep.then(function () {
            if (!isGenerationRunAllowed(opts)) {
                clientState.starting = false;
                if (opts.onCancel) opts.onCancel();
                return;
            }
            if (global.TcVisualAttachments && typeof global.TcVisualAttachments.appendPayload === 'function') {
                global.TcVisualAttachments.appendPayload(body);
            }
            if (clientState.cancelled) {
                clientState.starting = false;
                throw new Error('cancelled');
            }
            var fetchOpts = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            };
            if (clientState.startAbortController) {
                fetchOpts.signal = clientState.startAbortController.signal;
            }
            function createSessionOnce(retryAfterCancel) {
                return fetch('/api/test-cases/generation-sessions', fetchOpts)
                    .then(function (res) {
                        return res.json().then(function (data) {
                            if (res.status === 429) {
                                var rateErr = new Error(data.error || '生成过于频繁，请稍后再试');
                                rateErr.status = 429;
                                throw rateErr;
                            }
                            if (!res.ok) {
                                if (typeof globalThis.hfAiQuotaFromErrorBody === 'function' && globalThis.hfAiQuotaFromErrorBody(data)) {
                                    throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                                }
                                var createErr = data.error || '创建会话失败';
                                if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(createErr)) {
                                    throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                                }
                                throw new Error(createErr);
                            }
                            return data;
                        });
                    })
                    .catch(function (err) {
                        if (!retryAfterCancel && err && err.status === 429 &&
                            String(err.message || '').indexOf('正在进行') >= 0) {
                            return cancelActiveSessionsForRetry().then(function () {
                                return createSessionOnce(true);
                            });
                        }
                        throw err;
                    });
            }
            return createSessionOnce(false)
                .then(function (session) {
                    clientState.starting = false;
                    if (clientState.cancelled) {
                        clientState.sessionId = session.id;
                        return fetch('/api/test-cases/generation-sessions/' + encodeURIComponent(session.id) + '/cancel', { method: 'POST' })
                            .catch(function () { return null; })
                            .then(function () {
                                if (opts.onCancel) opts.onCancel();
                                return session;
                            });
                    }
                    clientState.sessionId = session.id;
                    subscribeStream(session.id, opts);
                    return session;
                })
                .catch(function (err) {
                    clientState.starting = false;
                    if (clientState.cancelled || (err && err.message === 'cancelled') ||
                        (typeof global.tcIsBenignFetchAbort === 'function' && global.tcIsBenignFetchAbort(err)) ||
                        (err && err.name === 'AbortError')) {
                        if (opts.onCancel) opts.onCancel();
                        return;
                    }
                    if (global.TcGenerationStreamUi) {
                        global.TcGenerationStreamUi.update({ step: 'gen' });
                    }
                    throw err;
                });
        });
    }

    function restoreMindmapUiAfterStreamStop() {
        if (clientState.outputTarget !== 'mindmap') return;
        if (typeof abortTcMindmapStreamingIfActive === 'function') {
            abortTcMindmapStreamingIfActive();
        } else if (typeof finalizeStreamingMindmap === 'function') {
            finalizeStreamingMindmap();
        } else if (typeof hideTcMindmapGenerating === 'function') {
            hideTcMindmapGenerating();
            if (typeof renderTcMindmap === 'function') renderTcMindmap();
        }
    }

    function cancel() {
        if (clientState.cancelled && clientState.finished) {
            return Promise.resolve();
        }
        clientState.cancelled = true;
        clientState.finished = true;
        syncLanhuDocSwitcherLockUiAfterStream();
        if (clientState.startAbortController) {
            try { clientState.startAbortController.abort(); } catch (e) { /* ignore */ }
        }
        clientState.starting = false;
        restoreMindmapUiAfterStreamStop();
        closeSource();
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.cancel === 'function') {
            global.TcGenChatPipeline.cancel();
        } else if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.cancel === 'function') {
            global.TcGenChatStreaming.cancel();
        }
        if (typeof global.restoreTcPromptComposerAfterStop === 'function') {
            global.restoreTcPromptComposerAfterStop({ releaseStreamUi: false });
        } else {
            releaseStreamUiImmediate({ status: 'cancelled' });
            if (typeof global.setTcLeftPanelAiGenerateLock === 'function') {
                global.setTcLeftPanelAiGenerateLock(false);
            }
            if (typeof global.syncTcPromptSendBtnState === 'function') {
                global.syncTcPromptSendBtnState();
            }
        }
        var sid = clientState.sessionId;
        var onCancel = clientState.onCancel;
        if (!sid) {
            if (onCancel) onCancel();
            return Promise.resolve();
        }
        return fetch('/api/test-cases/generation-sessions/' + sid + '/cancel', { method: 'POST' })
            .then(function () {
                restoreMindmapUiAfterStreamStop();
                if (clientState.outputTarget !== 'mindmap' && typeof finalizeStreamingRows === 'function') {
                    finalizeStreamingRows();
                }
                if (global.TcGenerationStreamUi) global.TcGenerationStreamUi.update({ step: 'cancelled' });
                if (typeof global.refreshTcPageGenLock === 'function') global.refreshTcPageGenLock();
                if (typeof global.clearOptimisticPageGenLock === 'function') global.clearOptimisticPageGenLock();
                if (onCancel) onCancel();
            })
            .catch(function () {
                restoreMindmapUiAfterStreamStop();
                if (onCancel) onCancel();
            });
    }

    function abortForPageLeave() {
        clientState.cancelled = true;
        clientState.finished = true;
        syncLanhuDocSwitcherLockUiAfterStream();
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.abortForPageLeave === 'function') {
            global.TcGenChatPipeline.abortForPageLeave();
        }
        closeSource();
        var sid = clientState.sessionId;
        if (sid) {
            try {
                fetch('/api/test-cases/generation-sessions/' + encodeURIComponent(sid) + '/cancel', {
                    method: 'POST',
                    credentials: 'same-origin',
                    keepalive: true
                });
            } catch (e) { /* ignore */ }
        }
    }

    function isCancelled() {
        return !!clientState.cancelled;
    }

    function isActive() {
        return !!(clientState.starting || (clientState.sessionId && !clientState.finished && !clientState.cancelled));
    }

    function getSessionId() {
        return clientState.sessionId || '';
    }

    global.TcGenerationStreamClient = {
        isEnabled: isStreamEnabled,
        start: start,
        cancel: cancel,
        abortForPageLeave: abortForPageLeave,
        isCancelled: isCancelled,
        isActive: isActive,
        getSessionId: getSessionId,
        getStreamText: getAccumulatedStreamText,
        getReasoningText: function () {
            return String(clientState.reasoningText || '').trim();
        },
        getTotalRows: function () {
            return getSessionParsedRowCount();
        },
        getSessionParsedRowCount: getSessionParsedRowCount,
        getSessionRowsAdded: function () {
            return clientState.sessionRowsAdded || 0;
        },
        getOutputTarget: function () {
            return clientState.outputTarget || 'list';
        },
        getMergeMode: function () {
            return clientState.mergeMode || 'overwrite';
        },

        hasGeneratedRows: hasStreamGeneratedRows
    };
    global.isTcStreamGenerationEnabled = isStreamEnabled;
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_agent_orchestrator.js ---- */
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

/* ---- tc_issue_matrix.js ---- */
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
        if (!covState().matrix || !covState().matrix.summary) return;
        var s = covState().matrix.summary;
        var fillAllCount = s.uncovered || 0;
        if (fillAll && shouldShowCoverageFillAllButton(_covScope)) {
            fillAll.disabled = !fillAllCount;
            fillAll.textContent = '全部补充 (' + fillAllCount + ')';
        }
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
            covState().fillProgressReturnTab = covState().activeTab || 'coverage';
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

    function triggerFillFromMatrix() {
        if (!shouldShowCoverageFillAllButton(_covScope)) {
            return;
        }
        if (!covState().matrix) {
            alertBox('请先运行问题清单矩阵分析。', { title: '无矩阵数据' });
            return;
        }
        var pack = gapsForFill();
        var gaps = pack.gaps.slice();
        var pointIds = pack.pointIds.slice();
        if (!gaps.length) {
            toast('没有需要补全的功能点', { variant: 'info' });
            return;
        }
        if (typeof global.TcAgentOrchestrator === 'undefined' ||
            typeof global.TcAgentOrchestrator.startAgentJob !== 'function') {
            alertBox('Agent 模块未加载，无法补全。', { variant: 'error' });
            return;
        }
        var intent = '补全以下未覆盖的需求功能点，不要重复已有用例。';

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
            coverage_matrix: covState().matrix,
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
            covTab.addEventListener('click', runInScope(function () { switchValidateTab('coverage'); }));
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
        openCoverageTab: function (scope) { openCoverageTab(scope || 'single'); },
        switchValidateTab: function (tabId, scope) {
            return useCovScope(scope == null ? 'single' : scope, function () {
                switchValidateTab(tabId);
            });
        },
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

/* ---- tc_lanhu_drawer.js ---- */
/**
 * TestHub TC Workbench — L3 UI
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */

function autoGrowTcPresetLanhuField(el) {
    if (!el) return;
    if (el.tagName === 'INPUT') return;
    var style = window.getComputedStyle(el);
    var lineHeight = parseFloat(style.lineHeight);
    if (!lineHeight || isNaN(lineHeight)) lineHeight = 16;
    var padTop = parseFloat(style.paddingTop) || 0;
    var padBot = parseFloat(style.paddingBottom) || 0;
    var borderY = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    var oneLine = Math.ceil(lineHeight + padTop + padBot + borderY);
    var twoLine = Math.ceil(lineHeight * 2 + padTop + padBot + borderY);
    el.style.height = 'auto';
    var scrollH = el.scrollHeight;
    if (scrollH <= oneLine + 2) {
        el.style.height = oneLine + 'px';
        el.style.overflowY = 'hidden';
    } else if (scrollH <= twoLine + 2) {
        el.style.height = scrollH + 'px';
        el.style.overflowY = 'hidden';
    } else {
        el.style.height = twoLine + 'px';
        el.style.overflowY = 'auto';
    }
}

function getActiveLanhuCookieEl() {
    return document.getElementById('lanhu-cookie');
}

function openLanhuCookieModal() {
    var modal = document.getElementById('lanhu-cookie-modal');
    var main = getActiveLanhuCookieEl();
    var editor = document.getElementById('lanhu-cookie-modal-input');
    if (!modal || !editor) return;
    editor.value = main ? main.value : '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    editor.focus();
}

function closeLanhuCookieModal() {
    var modal = document.getElementById('lanhu-cookie-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    document.body.style.overflow = '';
}

function initTcPresetLanhuFields() {
    var cookieEl = document.getElementById('lanhu-cookie');
    var urlEl = document.getElementById('lanhu-url');
    [cookieEl, urlEl].forEach(function(el) {
        if (!el) return;
        el.addEventListener('input', function() { autoGrowTcPresetLanhuField(el); });
        autoGrowTcPresetLanhuField(el);
    });
    var modal = document.getElementById('lanhu-cookie-modal');
    var cancelBtn = document.getElementById('lanhu-cookie-modal-cancel');
    var saveBtn = document.getElementById('lanhu-cookie-modal-save');
    if (cookieEl) {
        cookieEl.addEventListener('dblclick', function(e) {
            e.preventDefault();
            openLanhuCookieModal();
        });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', closeLanhuCookieModal);
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeLanhuCookieModal();
        });
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            var editor = document.getElementById('lanhu-cookie-modal-input');
            var activeCookieEl = getActiveLanhuCookieEl();
            if (activeCookieEl && editor) activeCookieEl.value = editor.value;
            autoGrowTcPresetLanhuField(activeCookieEl);
            closeLanhuCookieModal();
        });
    }
    document.addEventListener('keydown', function lanhuCookieModalEsc(e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('flex')) closeLanhuCookieModal();
    });
    initTcLanhuSectionToggle();
    initTcLanhuConfigReveal();
}

function getTcLanhuRevealInputForBtn(btn) {
    if (!btn) return null;
    var shell = btn.closest('.tc-preset-lanhu__input-shell');
    return shell ? shell.querySelector('.tc-preset-lanhu__input') : null;
}

function getTcLanhuRevealFieldLabel(input) {
    if (!input) return '内容';
    if (input.id === 'lanhu-cookie') return 'Cookie';
    if (input.id === 'lanhu-url') return 'URL';
    return '内容';
}

function syncTcLanhuRevealButton(btn) {
    var input = getTcLanhuRevealInputForBtn(btn);
    if (!input || !btn) return;
    var revealed = input.type === 'text';
    var label = getTcLanhuRevealFieldLabel(input);
    var title = revealed ? ('隐藏' + label) : ('显示' + label);
    btn.setAttribute('aria-pressed', revealed ? 'true' : 'false');
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.classList.toggle('tc-preset-lanhu__reveal-btn--active', revealed);
    var showIcon = btn.querySelector('.tc-preset-lanhu__reveal-icon--show');
    var hideIcon = btn.querySelector('.tc-preset-lanhu__reveal-icon--hide');
    if (showIcon) showIcon.classList.toggle('hidden', revealed);
    if (hideIcon) hideIcon.classList.toggle('hidden', !revealed);
}

function setTcLanhuFieldRevealed(input, revealed) {
    if (!input) return;
    input.type = revealed ? 'text' : 'password';
    var shell = input.closest('.tc-preset-lanhu__input-shell');
    var btn = shell ? shell.querySelector('.tc-preset-lanhu__reveal-btn') : null;
    if (btn) syncTcLanhuRevealButton(btn);
}

function toggleTcLanhuFieldReveal(btn) {
    var input = getTcLanhuRevealInputForBtn(btn);
    if (!input) return;
    setTcLanhuFieldRevealed(input, input.type !== 'text');
}

function initTcLanhuConfigReveal() {
    var buttons = document.querySelectorAll('.tc-preset-lanhu__reveal-btn');
    if (!buttons.length) return;
    buttons.forEach(function(btn) {
        if (btn.dataset.tcLanhuRevealBound === '1') return;
        btn.dataset.tcLanhuRevealBound = '1';
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleTcLanhuFieldReveal(btn);
        });
        var input = getTcLanhuRevealInputForBtn(btn);
        if (input) setTcLanhuFieldRevealed(input, false);
    });
}

function toggleTcLanhuSection(forceExpand) {
    var root = document.getElementById('ai-config-mode-root');
    var btn = document.getElementById('tc-lanhu-section-toggle');
    if (!root || !btn) return;
    var expand = typeof forceExpand === 'boolean'
        ? forceExpand
        : root.classList.contains('tc-lanhu-section--collapsed');
    root.classList.toggle('tc-lanhu-section--collapsed', !expand);
    btn.setAttribute('aria-expanded', expand ? 'true' : 'false');
    btn.title = expand ? '收起蓝湖需求' : '展开蓝湖需求';
    btn.classList.toggle('tc-lanhu-section-toggle--collapsed', !expand);
    var zone = document.getElementById('tc-gen-instruction-zone');
    var drawerContent = document.getElementById('drawer-1-content');
    if (zone) zone.classList.toggle('tc-gen-lanhu-open', expand);
    if (drawerContent) drawerContent.classList.toggle('tc-gen-lanhu-open', expand);
    if (typeof syncTcGenLanhuOverlayLayout === 'function') {
        syncTcGenLanhuOverlayLayout();
    }
    refreshTcGenChatAfterLanhuToggle(expand);
}
window.toggleTcLanhuSection = toggleTcLanhuSection;

/** 蓝湖 overlay 切换后仅同步穿透层与滚动，不触发整页高度重算（避免对话区闪动） */
function refreshTcGenChatAfterLanhuToggle(lanhuExpanded) {
    var scrollState = typeof captureTcGenChatScrollState === 'function'
        ? captureTcGenChatScrollState()
        : null;
    if (scrollState && typeof restoreTcGenChatScrollState === 'function') {
        restoreTcGenChatScrollState(scrollState);
    }
}

/** 用例生成弹窗展开时默认打开蓝湖需求区（已展开则跳过） */
function openTcLanhuSectionOnGenPanel() {
    if (!document.querySelector('.tc-workbench-scope')) return;
    var root = document.getElementById('ai-config-mode-root');
    if (!root || !root.classList.contains('tc-lanhu-section--collapsed')) return;
    toggleTcLanhuSection(true);
}
window.openTcLanhuSectionOnGenPanel = openTcLanhuSectionOnGenPanel;

function isTcLanhuSectionExpanded() {
    var root = document.getElementById('ai-config-mode-root');
    return !!(root && !root.classList.contains('tc-lanhu-section--collapsed'));
}

function isTcLanhuDismissExemptTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!(
        target.closest('#ai-config-mode-root') ||
        target.closest('#tc-lanhu-section-toggle') ||
        target.closest('#tc-wb-history-toggle') ||
        target.closest('#tc-wb-new-chat-btn') ||
        target.closest('#tc-wb-history-panel') ||
        target.closest('#tc-drawer-tabs-root') ||
        target.closest('#lanhu-cookie-modal')
    );
}

function maybeCollapseTcLanhuSectionOnOutsideClick(ev) {
    if (!document.querySelector('.tc-workbench-scope')) return;
    if (!isTcLanhuSectionExpanded()) return;
    var panel = document.getElementById('left-panel');
    if (!panel || !panel.contains(ev.target)) return;
    if (isTcLanhuDismissExemptTarget(ev.target)) return;
    toggleTcLanhuSection(false);
}
window.maybeCollapseTcLanhuSectionOnOutsideClick = maybeCollapseTcLanhuSectionOnOutsideClick;

function maybeCollapseTcLanhuSectionOnGenChatPointer() {
    if (!isTcLanhuSectionExpanded()) return;
    toggleTcLanhuSection(false);
}

function initTcGenChatLanhuDismiss() {
    var chatPanel = document.getElementById('tc-gen-chat-panel');
    if (!chatPanel || chatPanel.dataset.tcLanhuChatDismissBound === '1') return;
    chatPanel.dataset.tcLanhuChatDismissBound = '1';
    chatPanel.addEventListener('mousedown', maybeCollapseTcLanhuSectionOnGenChatPointer, true);
}

function initTcLanhuClickOutsideDismiss() {
    if (window._tcLanhuClickOutsideBound) return;
    window._tcLanhuClickOutsideBound = true;
    document.addEventListener('mousedown', maybeCollapseTcLanhuSectionOnOutsideClick, true);
    initTcGenChatLanhuDismiss();
}

function initTcLanhuSectionToggle() {
    var btn = document.getElementById('tc-lanhu-section-toggle');
    if (!btn || btn.dataset.tcLanhuToggleBound === '1') return;
    btn.dataset.tcLanhuToggleBound = '1';
    btn.addEventListener('click', function() {
        toggleTcLanhuSection();
    });
    var root = document.getElementById('ai-config-mode-root');
    if (root) {
        var expanded = !root.classList.contains('tc-lanhu-section--collapsed');
        var zone = document.getElementById('tc-gen-instruction-zone');
        var drawerContent = document.getElementById('drawer-1-content');
        if (zone) zone.classList.toggle('tc-gen-lanhu-open', expanded);
        if (drawerContent) drawerContent.classList.toggle('tc-gen-lanhu-open', expanded);
    }
    initTcLanhuClickOutsideDismiss();
}


function tcStripLanhuPageId(text) {
    return String(text || '')
        .replace(/[\uFF08(]\s*pageId\s*=\s*[^\uFF09)\n]*[\uFF09)]/gi, '')
        .trim();
}

function tcEscapeLanhuPreviewHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function tcBuildLanhuPageSummarySnippet(pageName, lines, knownPageNames) {
    var name = String(pageName || '').trim();
    var known = {};
    (knownPageNames || []).forEach(function (n) {
        var key = String(n || '').trim();
        if (key) known[key] = true;
    });
    if (name) known[name] = true;
    var filtered = (lines || []).filter(function (line) {
        var t = String(line || '').trim();
        if (!t) return false;
        if (/^#{1,6}\s*\d+\.\s*/.test(t)) return false;
        if (known[t]) return false;
        if (name && t === name) return false;
        return true;
    });
    if (!filtered.length) return '';
    var text = filtered.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 72) text = text.slice(0, 72) + '…';
    return text;
}

function tcExtractLanhuPageTags(pageName, lines, knownPageNames) {
    var name = String(pageName || '').trim();
    var known = {};
    (knownPageNames || []).forEach(function (n) {
        var key = String(n || '').trim();
        if (key) known[key] = true;
    });
    if (name) known[name] = true;
    var filtered = (lines || []).filter(function (line) {
        var t = String(line || '').trim();
        if (!t) return false;
        if (/^#{1,6}\s*\d+\.\s*/.test(t)) return false;
        if (known[t]) return false;
        if (name && t === name) return false;
        return true;
    });
    for (var i = 0; i < filtered.length; i++) {
        var t = String(filtered[i] || '').trim();
        if (t.indexOf('标签：') === 0) return t.slice(3).trim();
        if (t.indexOf('·') >= 0 || t.indexOf('•') >= 0) return t;
    }
    return tcBuildLanhuPageSummarySnippet(pageName, lines, knownPageNames);
}

function tcParseLanhuSummaryForPreview(summary) {
    var raw = tcStripLanhuPageId(summary);
    if (!raw) return null;
    var lines = raw.split(/\r?\n/);
    var docName = '';
    var currentPage = '';
    var pageCount = '';
    var pageNames = [];
    var pageSummaries = [];
    var pageSections = [];
    var inBody = false;
    var sectionName = '';
    var sectionLines = [];
    function flushSection() {
        if (sectionName) {
            var tags = tcExtractLanhuPageTags(sectionName, sectionLines, pageNames);
            pageSections.push({ name: sectionName, tags: tags });
        }
        var snippet = tcBuildLanhuPageSummarySnippet(sectionName, sectionLines, pageNames);
        if (snippet) pageSummaries.push(snippet);
        sectionName = '';
        sectionLines = [];
    }
    lines.forEach(function (line) {
        var t = String(line || '').trim();
        if (!t) return;
        if (t === '【蓝湖需求摘要】') return;
        if (t === '【各页面要点】') {
            inBody = true;
            return;
        }
        if (/^\|/.test(t)) {
            if (/^\|\s*[-—:|\s]+\|\s*$/.test(t)) return;
            var cells = t.split('|').map(function (c) { return c.trim(); }).filter(Boolean);
            if (cells.length >= 2 && cells[0] !== '序号') {
                pageNames.push(cells[cells.length - 1]);
            }
            return;
        }
        if (t.indexOf('文档：') === 0) {
            docName = t.slice(3).trim();
            return;
        }
        if (t.indexOf('当前页面：') === 0) {
            currentPage = t.slice(5).trim();
            return;
        }
        if (t.indexOf('页面数：') === 0) {
            var countMatch = t.match(/^页面数：(\d+)/);
            pageCount = countMatch ? countMatch[1] : t.slice(4).trim();
            return;
        }
        if (!inBody) return;
        var headerMatch = t.match(/^#{1,6}\s*\d+\.\s*(.+)$/);
        if (headerMatch) {
            flushSection();
            sectionName = headerMatch[1].trim();
            return;
        }
        sectionLines.push(t);
    });
    flushSection();
    if (!docName && !currentPage && !pageNames.length && !pageSummaries.length) {
        var flat = raw
            .replace(/\|/g, ' ')
            .replace(/-{3,}/g, ' ')
            .replace(/#{1,6}/g, '')
            .replace(/【[^】]+】/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return flat ? { fallback: flat.slice(0, 120) } : null;
    }
    return {
        docName: docName,
        currentPage: currentPage,
        pageCount: pageCount,
        pageNames: pageNames,
        pageSections: pageSections,
        bodySnippet: pageSummaries.join(' · ').slice(0, 180)
    };
}



// 下载最后一次导入的文件
function downloadLastFile() {
    if (window.lastDownloadUrl && window.lastDownloadName) {
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = window.lastDownloadUrl;
        a.download = window.lastDownloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else {
        tcAppAlert('当前没有可用的下载链接。请先完成一次可下载的导入或生成流程。', {
            variant: 'info',
            title: '暂无可下载文件',
            hint: '例如：从 Excel 导入并生成下载后，再使用下载入口。'
        });
    }
}

// 测试用例导入功能
let currentExcelFile = null;

// Excel文件上传监听
const excelFileInput = document.getElementById('excel-file-input');
if (excelFileInput) {
    excelFileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            currentExcelFile = file;
            const fileInfo = document.getElementById('excel-file-info');
            const fileName = document.getElementById('excel-file-name');
            if (fileInfo && fileName) {
                fileName.textContent = file.name;
                fileInfo.classList.remove('hidden');
            }
        }
    });
}

// Excel文件拖拽上传
const excelUploadSection = document.getElementById('excel-upload-section');
if (excelUploadSection) {
    excelUploadSection.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.style.borderColor = '#10b981';
        this.style.background = 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)';
    });

    excelUploadSection.addEventListener('dragleave', function(e) {
        this.style.borderColor = '#91d5ff';
        this.style.background = 'linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%)';
    });

    excelUploadSection.addEventListener('drop', function(e) {
        e.preventDefault();
        this.style.borderColor = '#91d5ff';
        this.style.background = 'linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%)';
        
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                document.getElementById('excel-file-input').files = e.dataTransfer.files;
                const event = new Event('change');
                document.getElementById('excel-file-input').dispatchEvent(event);
            }
        }
    });
}

// 导入测试用例按钮点击事件
const importBtn = document.getElementById('import-test-cases-btn');
if (importBtn) {
    importBtn.addEventListener('click', function() {
        const btn = this;
        const resultDiv = document.getElementById('import-result');
        const testCasesText = document.getElementById('import-test-cases').value;
        
        // 验证参数
        if (!currentExcelFile) {
            tcAppAlert('请先选择要导入的 Excel 文件（.xlsx / .xls）。', { variant: 'warning', title: '缺少文件' });
            return;
        }
        if (!testCasesText) {
            tcAppAlert('请在输入框中粘贴或填写与模板对应的测试用例数据。', { variant: 'warning', title: '缺少数据' });
            return;
        }

        // 显示加载状态
        btn.disabled = true;
        btn.textContent = '导入中...';
        resultDiv.innerHTML = `
            <div class="text-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
                <p class="text-gray-600">正在导入测试用例...</p>
            </div>
        `;

        // 构建表单数据
        const formData = new FormData();
        formData.append('excel_file', currentExcelFile);
        formData.append('test_cases', testCasesText);

        // 发送请求
        fetch('/api/test-case-importer', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            // 检查响应类型
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                // 如果是JSON响应，表示出错
                return response.json().then(data => {
                    throw new Error(data.error || '导入失败');
                });
            }
            
            // 如果是文件响应，处理下载
            const filledCount = response.headers.get('X-Filled-Count');
            
            return response.blob().then(blob => {
                // 创建下载链接但不自动下载
                const url = window.URL.createObjectURL(blob);
                return { filledCount, blobUrl: url };
            });
        })
        .then(result => {
            btn.disabled = false;
            btn.textContent = '导入并保存';
            
            if (result) {
                // 保存blob URL以便用户可以下载
                window.lastDownloadUrl = result.blobUrl;
                window.lastDownloadName = currentExcelFile.name;
                
                // 在前端构造成功消息
                const message = result.filledCount 
                    ? `成功导入 ${result.filledCount} 条测试用例到Excel文件` 
                    : '成功导入测试用例到Excel文件';
                
                resultDiv.innerHTML = `
                    <div class="text-green-600 p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-2xl">✓</span>
                            <strong class="text-lg">导入成功!</strong>
                        </div>
                        <p class="text-gray-600 mb-3">${message}</p>
                        <button onclick="downloadLastFile()" class="btn btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                            📥 下载Excel文件
                        </button>
                    </div>
                `;
            }
        })
        .catch(error => {
            btn.disabled = false;
            btn.textContent = '导入并保存';
            resultDiv.innerHTML = `
                <div class="p-4">
                    <div class="ds-alert ds-alert--error"><strong>导入失败</strong> — ${error.message}</div>
                </div>
            `;
        });
    });
}

// 图片格式转换逻辑
let uploadedFile = null;
let currentOriginalFormat = null;
let selectedTargetFormat = null;

// 格式转换映射
const formatOptions = {
    'png': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'bmp', label: 'BMP', lossy: false },
        { value: 'tiff', label: 'TIFF', lossy: false },
        { value: 'webp-lossless', label: 'WebP (无损)', lossy: false },
        { value: 'jpg', label: 'JPG', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true },
        { value: 'heic', label: 'HEIC', lossy: true }
    ],
    'bmp': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'tiff', label: 'TIFF', lossy: false },
        { value: 'webp-lossless', label: 'WebP (无损)', lossy: false },
        { value: 'jpg', label: 'JPG', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true }
    ],
    'tiff': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'bmp', label: 'BMP', lossy: false },
        { value: 'webp-lossless', label: 'WebP (无损)', lossy: false },
        { value: 'jpg', label: 'JPG', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true }
    ],
    'webp': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'bmp', label: 'BMP', lossy: false },
        { value: 'jpg', label: 'JPG', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true }
    ],
    'jpg': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'bmp', label: 'BMP', lossy: false },
        { value: 'webp-lossless', label: 'WebP (无损)', lossy: false },
        { value: 'jpg', label: 'JPG (再次保存)', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true },
        { value: 'heic', label: 'HEIC', lossy: true }
    ],
    'jpeg': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'bmp', label: 'BMP', lossy: false },
        { value: 'webp-lossless', label: 'WebP (无损)', lossy: false },
        { value: 'jpg', label: 'JPG (再次保存)', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true },
        { value: 'heic', label: 'HEIC', lossy: true }
    ]
};

// 监听图片上传
const formatImageInput = document.getElementById('format-image-input');
if (formatImageInput) {
    formatImageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            handleFormatImageUpload(file);
        }
    });
}

// 处理图片上传
function handleFormatImageUpload(file) {
    console.log("=== 处理文件上传 ===");
    console.log("文件对象:", file);
    console.log("文件名:", file.name);
    console.log("文件大小:", file.size, "字节");
    console.log("文件类型:", file.type);
    
    if (!file || file.size === 0) {
        tcAppAlert("上传的文件为空，请重新选择文件！", { variant: 'warning', title: '提示' });
        return;
    }
    const sizeErr = getImageFileSizeError(file);
    if (sizeErr) {
        tcAppAlert(sizeErr, { variant: 'warning', title: '提示' });
        const fin = document.getElementById('format-image-input');
        if (fin) fin.value = '';
        return;
    }
    
    // 保存文件对象
    uploadedFile = file;
    
    // 获取文件扩展名
    const ext = file.name.split('.').pop().toLowerCase();
    currentOriginalFormat = ext;
    
    // 显示文件名和格式
    document.getElementById('format-original-name').textContent = file.name;
    document.getElementById('format-original-format').textContent = ext.toUpperCase();
    
    // 预览图片
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('format-preview-img').src = e.target.result;
        document.getElementById('format-image-preview').style.display = 'block';
        console.log("图片预览加载完成");
    };
    reader.onerror = function(e) {
        console.error("图片预览失败:", e);
        tcAppAlert("无法预览该图片，请检查文件是否有效！", { variant: 'warning', title: '提示' });
    };
    reader.readAsDataURL(file);
    
    // 生成格式选项
    generateFormatOptions(ext);
    
    // 重置选择
    selectedTargetFormat = null;
    document.getElementById('convert-format-btn').disabled = true;
    document.getElementById('quality-section').style.display = 'none';
    document.getElementById('format-result').innerHTML = `
        <div class="ds-empty">
            <span class="ds-empty__icon" aria-hidden="true">⏳</span>
            <div class="ds-empty__title">等待转换</div>
            <div class="ds-empty__desc">已上传图片，请选择目标格式后点击「转换格式」</div>
        </div>
    `;
}

// 生成格式选项
function generateFormatOptions(originalFormat) {
    const optionsContainer = document.getElementById('format-options');
    const options = formatOptions[originalFormat] || [];
    
    optionsContainer.innerHTML = options.map(opt => `
        <button type="button" 
            class="format-option p-3 border-2 rounded-lg text-center transition-all hover:border-orange-400 hover:bg-orange-50"
            data-format="${opt.value}"
            data-lossy="${opt.lossy}"
            onclick="selectFormat(this)">
            <div class="text-lg font-semibold">${opt.label}</div>
            <div class="text-xs text-gray-500">${opt.lossy ? '有损' : '无损'}</div>
        </button>
    `).join('');
}

// 选择格式
function selectFormat(button) {
    // 移除其他选中状态
    document.querySelectorAll('.format-option').forEach(btn => {
        btn.classList.remove('border-orange-500', 'bg-orange-100');
    });
    
    // 添加选中状态
    button.classList.add('border-orange-500', 'bg-orange-100');
    
    // 保存选中的格式
    selectedTargetFormat = button.dataset.format;
    const isLossy = button.dataset.lossy === 'true';
    
    // 启用转换按钮
    document.getElementById('convert-format-btn').disabled = false;
    
    // 显示/隐藏质量选项
    const qualitySection = document.getElementById('quality-section');
    if (isLossy) {
        qualitySection.style.display = 'block';
    } else {
        qualitySection.style.display = 'none';
    }
}

// 质量滑块更新
const formatQuality = document.getElementById('format-quality');
if (formatQuality) {
    formatQuality.addEventListener('input', function() {
        document.getElementById('quality-value').textContent = this.value;
    });
}

// 重新上传按钮
const formatReuploadBtn = document.getElementById('format-reupload-btn');
if (formatReuploadBtn) {
    formatReuploadBtn.addEventListener('click', function() {
        document.getElementById('format-image-input').value = '';
        document.getElementById('format-image-preview').style.display = 'none';
        document.getElementById('format-options').innerHTML = '';
        document.getElementById('convert-format-btn').disabled = true;
        document.getElementById('quality-section').style.display = 'none';
        uploadedFile = null;
        currentOriginalFormat = null;
        selectedTargetFormat = null;
        document.getElementById('format-result').innerHTML = `
            <div class="ds-empty">
                <span class="ds-empty__icon" aria-hidden="true">🖼</span>
                <div class="ds-empty__title">尚无转换结果</div>
                <div class="ds-empty__desc">选择目标格式并点击「转换格式」后，在此下载文件</div>
            </div>
        `;
    });
}

// 转换按钮
const convertFormatBtn = document.getElementById('convert-format-btn');
if (convertFormatBtn) {
    convertFormatBtn.addEventListener('click', async function() {
        console.log("=== 点击转换按钮 ===");
        console.log("uploadedFile:", uploadedFile);
        console.log("selectedTargetFormat:", selectedTargetFormat);
        
        if (!uploadedFile || uploadedFile.size === 0) {
            tcAppAlert('请先上传有效的图片文件！', { variant: 'warning', title: '提示' });
            return;
        }
        const upErr = getImageFileSizeError(uploadedFile);
        if (upErr) {
            tcAppAlert(upErr, { variant: 'warning', title: '提示' });
            return;
        }
        
        if (!selectedTargetFormat) {
            tcAppAlert('请先选择目标格式！', { variant: 'warning', title: '提示' });
            return;
        }
        
        const btn = this;
        const resultDiv = document.getElementById('format-result');
        const quality = document.getElementById('format-quality').value;
        
        console.log("准备发送请求...");
        console.log("文件信息:", {
            name: uploadedFile.name,
            size: uploadedFile.size,
            type: uploadedFile.type
        });
        console.log("目标格式:", selectedTargetFormat);
        console.log("质量:", quality);
        
        btn.disabled = true;
        btn.textContent = '转换中...';
        resultDiv.innerHTML = `
            <div class="ds-loading-inline">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" aria-hidden="true"></div>
                <div class="font-medium text-slate-700">正在转换图片格式</div>
                <div class="text-sm text-slate-500">超时或异常时将自动重试，请稍候</div>
            </div>
        `;
        
        const formData = new FormData();
        formData.append('file', uploadedFile);
        formData.append('target_format', selectedTargetFormat);
        formData.append('quality', quality);
        
        console.log("FormData内容:");
        for (let [key, value] of formData.entries()) {
            console.log(key, value);
        }
        
        try {
            const blob = await postImageBinaryWithRetry('/api/image-format-converter', formData);
            console.log("转换成功，blob大小:", blob.size);
            btn.disabled = false;
            btn.textContent = '转换格式';
            const blobUrl = URL.createObjectURL(blob);
            const extension = selectedTargetFormat.replace('-lossless', '').replace('-lossy', '');
            resultDiv.innerHTML = `
                <div class="p-6 text-center space-y-4">
                    <div class="ds-alert ds-alert--success text-center">转换成功</div>
                    <a href="${blobUrl}" download="converted.${extension}" class="btn btn-primary inline-block">
                        下载图片
                    </a>
                </div>
            `;
        } catch (error) {
            console.error("转换失败:", error);
            btn.disabled = false;
            btn.textContent = '转换格式';
            const msg = (error && error.message) ? error.message : '转换失败';
            resultDiv.innerHTML = `
                <div class="p-4">
                    <div class="ds-alert ds-alert--error"><strong>转换失败</strong> — ${msg}</div>
                </div>
            `;
        }
    });
}

// 格式转换工具的拖拽上传
const formatUploadSection = document.getElementById('format-upload-section');
if (formatUploadSection) {
    formatUploadSection.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.style.borderColor = '#f97316';
        this.style.background = 'linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)';
    });

    formatUploadSection.addEventListener('dragleave', function(e) {
        this.style.borderColor = '#91d5ff';
        this.style.background = 'linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%)';
    });

    formatUploadSection.addEventListener('drop', function(e) {
        e.preventDefault();
        this.style.borderColor = '#91d5ff';
        this.style.background = 'linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%)';
        
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                const sizeErr = getImageFileSizeError(file);
                if (sizeErr) {
                    tcAppAlert(sizeErr, { variant: 'warning', title: '提示' });
                    return;
                }
                document.getElementById('format-image-input').files = e.dataTransfer.files;
                handleFormatImageUpload(file);
            }
        }
    });
}

// ==================== 测试用例表格管理功能 ====================

let isCollapsed = true;
/** 抽屉位置/尺寸仅当前页会话有效，刷新或离开页面后恢复默认 */
var tcLeftFloatSessionPos = null;
var tcLeftFloatSessionSize = null;
var TC_LEFT_FLOAT_MIN_W = 300;
var TC_LEFT_FLOAT_MIN_H = 260;
var TC_LEFT_FLOAT_DEFAULT_W = 608;
var TC_LEFT_FLOAT_DEFAULT_H = 560;
var TC_LEFT_FLOAT_LAYOUT_KEY = 'tc_left_float_layout_v1';

function getTcLeftFloatViewportInsets() {
    var margin = 12;
    var top = margin;
    var nav = document.querySelector('.hf-gnav');
    if (nav) {
        var nr = nav.getBoundingClientRect();
        top = Math.max(top, Math.round(nr.bottom) + margin);
    }
    var tcHeader = document.getElementById('tc-header-shell');
    if (tcHeader) {
        var hr = tcHeader.getBoundingClientRect();
        if (hr.bottom > top - margin) {
            top = Math.max(top, Math.round(hr.bottom) + margin);
        }
    }
    var toolHeader = document.querySelector('.ds-tool-header-shell');
    if (toolHeader) {
        var tr = toolHeader.getBoundingClientRect();
        if (tr.bottom > top - margin) {
            top = Math.max(top, Math.round(tr.bottom) + margin);
        }
    }
    return { margin: margin, top: top, bottom: margin };
}

function getTcLeftFloatAdaptiveDefaultSize() {
    var insets = getTcLeftFloatViewportInsets();
    var lim = getTcLeftFloatSizeLimits();
    var availH = Math.max(TC_LEFT_FLOAT_MIN_H, window.innerHeight - insets.top - insets.bottom);
    var availW = Math.max(TC_LEFT_FLOAT_MIN_W, window.innerWidth - insets.margin * 2);
    var ratioH = window.innerHeight < 820 ? 0.78 : (window.innerHeight < 920 ? 0.84 : 0.88);
    var ratioW = window.innerWidth < 1280 ? 0.9 : 0.94;
    var targetH = Math.min(TC_LEFT_FLOAT_DEFAULT_H, Math.round(availH * ratioH));
    var targetW = Math.min(TC_LEFT_FLOAT_DEFAULT_W, Math.round(Math.min(availW * ratioW, TC_LEFT_FLOAT_DEFAULT_W)));
    return clampTcLeftFloatSize(targetW, targetH);
}

function ensureTcLeftFloatFitsViewport() {
    var panel = document.getElementById('left-panel');
    if (!panel || panel.classList.contains('tc-left-float-panel--collapsed')) return;
    var insets = getTcLeftFloatViewportInsets();
    var lim = getTcLeftFloatSizeLimits();
    var r = panel.getBoundingClientRect();
    var w = r.width > 0 ? r.width : TC_LEFT_FLOAT_DEFAULT_W;
    var h = r.height > 0 ? r.height : TC_LEFT_FLOAT_DEFAULT_H;
    var x = r.left;
    var y = r.top;
    w = Math.min(w, lim.maxW);
    h = Math.min(h, lim.maxH);
    if (y < insets.top) y = insets.top;
    if (y + h > window.innerHeight - insets.bottom) {
        y = Math.max(insets.top, window.innerHeight - insets.bottom - h);
    }
    if (x < insets.margin) x = insets.margin;
    if (x + w > window.innerWidth - insets.margin) {
        x = Math.max(insets.margin, window.innerWidth - insets.margin - w);
    }
    applyTcLeftFloatBounds(w, h, x, y);
    panel.style.setProperty('--tc-float-safe-top', insets.top + 'px');
}

function loadTcLeftFloatLayoutFromStorage() {
    try {
        var raw = localStorage.getItem(TC_LEFT_FLOAT_LAYOUT_KEY);
        if (!raw) return;
        var d = JSON.parse(raw);
        if (d && typeof d.w === 'number' && typeof d.h === 'number') {
            tcLeftFloatSessionSize = { w: d.w, h: d.h };
        }
        /* 位置 x/y 不跨刷新恢复，仅当前页拖动会话内有效 */
    } catch (e) { /* ignore */ }
}

function persistTcLeftFloatLayout() {
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    var r = panel.getBoundingClientRect();
    var w = Math.round(r.width);
    var h = Math.round(r.height);
    tcLeftFloatSessionSize = { w: w, h: h };
    tcLeftFloatSessionPos = { x: Math.round(r.left), y: Math.round(r.top) };
    try {
        localStorage.setItem(TC_LEFT_FLOAT_LAYOUT_KEY, JSON.stringify({ w: w, h: h }));
    } catch (e) { /* ignore */ }
}

var TC_COLLAPSE_ICON_COLLAPSE = 'M15 19l-7-7 7-7';
var TC_COLLAPSE_ICON_EXPAND = 'M9 5l7 7-7 7';

function syncLeftPanelCollapseBtn() {
    var collapseBtn = document.getElementById('collapse-btn');
    if (!collapseBtn) return;
    var path = collapseBtn.querySelector('#collapse-icon path');
    if (isCollapsed) {
        collapseBtn.title = '展开智能编辑';
        collapseBtn.setAttribute('aria-label', '展开智能编辑');
        collapseBtn.setAttribute('aria-expanded', 'false');
        if (path) path.setAttribute('d', TC_COLLAPSE_ICON_EXPAND);
    } else {
        collapseBtn.title = '收起智能编辑';
        collapseBtn.setAttribute('aria-label', '收起智能编辑');
        collapseBtn.setAttribute('aria-expanded', 'true');
        if (path) path.setAttribute('d', TC_COLLAPSE_ICON_COLLAPSE);
    }
}

function tcLeftFloatNotifyLayoutChange() {
    window.requestAnimationFrame(function() {
        if (tcMindmapInstance && typeof tcMindmapInstance.resize === 'function') {
            try { tcMindmapInstance.resize(); } catch (e) { /* ignore */ }
        }
        if (typeof tcMindmapFitToView === 'function' && tcRightViewMode === 'mindmap') {
            tcMindmapFitToView();
        }
    });
}

function isTcHubExcelTabActive() {
    var panel = document.getElementById('tc-hub-panel-excel');
    if (!panel) return false;
    return !panel.classList.contains('hidden');
}

/** Hub：Excel Tab 与 AI 生成 Tab 悬浮控件隔离（勿互通） */
function syncTcHubAiChrome() {
    if (!document.querySelector('.tc-hub-scope')) return;
    var excel = isTcHubExcelTabActive();
    document.body.classList.toggle('tc-hub-excel-tab', excel);
    document.body.classList.toggle('tc-hub-ai-tab', !excel);

    var pageFloat = document.getElementById('tc-page-float-wrap');
    var leftWrap = document.getElementById('tc-left-input-float-wrap');
    var fabWrap = document.getElementById('tc-table-fab-wrap');
    var exportFabWrap = document.getElementById('tc-export-fab-wrap');

    if (excel) {
        if (leftWrap) {
            leftWrap.classList.add('hidden');
            leftWrap.setAttribute('aria-hidden', 'true');
        }
        if (fabWrap) {
            fabWrap.classList.add('hidden');
            fabWrap.setAttribute('aria-hidden', 'true');
        }
        if (exportFabWrap) {
            exportFabWrap.classList.add('hidden');
            exportFabWrap.setAttribute('aria-hidden', 'true');
        }
        if (typeof closeTcTableFabSheet === 'function') closeTcTableFabSheet();
    } else {
        if (leftWrap) {
            leftWrap.classList.remove('hidden');
            leftWrap.setAttribute('aria-hidden', 'false');
        }
        if (typeof syncTcLeftInputFloatChrome === 'function') syncTcLeftInputFloatChrome();
    }
}

/** 表格 / 思维导图视图均展示暂存 FAB / 列表（按 scope 过滤条目） */
function syncTcStashFloatChrome() {}

function getTcLeftFloatDefaultPos() {
    var insets = getTcLeftFloatViewportInsets();
    var wrap = document.getElementById('tc-left-input-float-wrap');
    var dock = document.getElementById('tc-left-float-dock');
    var anchor = wrap || dock;
    if (anchor) {
        var dr = anchor.getBoundingClientRect();
        var y = Math.max(insets.top, dr.top);
        var panel = document.getElementById('left-panel');
        var ph = panel && panel.offsetHeight > 0 ? panel.offsetHeight : TC_LEFT_FLOAT_DEFAULT_H;
        if (y + ph > window.innerHeight - insets.bottom) {
            y = Math.max(insets.top, window.innerHeight - insets.bottom - ph);
        }
        return { x: dr.right + 12, y: y };
    }
    return { x: 56, y: insets.top };
}

function ensureTcLeftInputFloatMounted() {
    if (isTcHubExcelTabActive()) return null;
    var wrap = document.getElementById('tc-left-input-float-wrap');
    if (!wrap) return null;
    if (wrap.parentElement !== document.body) {
        document.body.appendChild(wrap);
    }
    wrap.classList.remove('hidden');
    wrap.setAttribute('aria-hidden', 'false');
    return wrap;
}

/** 用例录入悬浮窗、遮罩挂到 body，避免落在带 backdrop-filter/overflow 的工作台内被裁切 */
function ensureTcLeftFloatPanelMounted() {
    var backdrop = document.getElementById('tc-left-float-backdrop');
    var panel = document.getElementById('left-panel');
    if (backdrop && backdrop.parentElement !== document.body) {
        document.body.appendChild(backdrop);
    }
    if (panel && panel.parentElement !== document.body) {
        document.body.appendChild(panel);
    }
}

function ensureTcWorkbenchOverlaysMounted() {
    ensureTcLeftFloatPanelMounted();
    [
        'tc-wb-session-limit-banner',
        'edit-modal',
        'column-settings-modal',
        'tc-feature-unlock-modal',
        'tc-template-modal',
        'tc-view-convert-modal',
                'lanhu-cookie-modal',
        'tc-lanhu-tree-connect-modal',
        'tc-validate-drawer-single',
        'tc-agent-drawer',
        'tc-validate-drawer-single',
        'tc-export-report-modal'
    ].forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.parentElement !== document.body) {
            document.body.appendChild(el);
        }
    });
}

/** 暂存列表 / FAB 分列挂 body，拖拽互不影响 */
function ensureTcStashOverlaysMounted() {}

function ensureTcLeftFloatLayersMounted() {
    if (isTcHubExcelTabActive()) {
        syncTcHubAiChrome();
        return;
    }
    ensureTcLeftInputFloatMounted();
    ensureTcWorkbenchOverlaysMounted();
}

function syncTcLeftInputFloatChrome() {
    ensureTcLeftFloatLayersMounted();
    var wrap = document.getElementById('tc-left-input-float-wrap');
    if (!wrap) return;
    var show = !isTcHubExcelTabActive();
    wrap.classList.toggle('hidden', !show);
    wrap.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (show) {
        ensureTcLeftInputFloatOnScreen();
        if (typeof initTcLeftInputFloatDrag === 'function') initTcLeftInputFloatDrag();
    }
}

function getTcLeftInputFloatDragSize() {
    var btn = document.querySelector('#tc-left-input-float-wrap [data-tc-float-open]');
    var r = btn ? btn.getBoundingClientRect() : null;
    return {
        w: r && r.width > 0 ? r.width : 44,
        h: r && r.height > 0 ? r.height : 44
    };
}

function clampTcLeftInputFloatPos(left, top) {
    var size = getTcLeftInputFloatDragSize();
    var margin = 8;
    return {
        left: Math.max(margin, Math.min(left, window.innerWidth - size.w - margin)),
        top: Math.max(margin, Math.min(top, window.innerHeight - size.h - margin))
    };
}

function applyTcLeftInputFloatPosition(left, top) {
    var wrap = ensureTcLeftInputFloatMounted();
    if (!wrap) return;
    var p = clampTcLeftInputFloatPos(left, top);
    wrap.classList.add('tc-left-input-float-wrap--positioned');
    wrap.style.left = p.left + 'px';
    wrap.style.top = p.top + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
    wrap.style.transform = 'none';
}

function resetTcLeftInputFloatToDefault() {
    try { localStorage.removeItem('tc_left_input_float_pos_v1'); } catch (e) { /* ignore legacy */ }
    var wrap = document.getElementById('tc-left-input-float-wrap');
    if (!wrap) return;
    wrap.classList.remove('tc-left-input-float-wrap--positioned');
    wrap.style.left = '';
    wrap.style.top = '';
    wrap.style.right = '';
    wrap.style.bottom = '';
    wrap.style.transform = '';
}

function ensureTcLeftInputFloatOnScreen() {
    var wrap = document.getElementById('tc-left-input-float-wrap');
    if (!wrap || wrap.classList.contains('hidden')) return;
    if (!wrap.classList.contains('tc-left-input-float-wrap--positioned')) return;
    var r = wrap.getBoundingClientRect();
    applyTcLeftInputFloatPosition(r.left, r.top);
}

function openTcLeftInputFloatFromFab() {
    if (window.__tcSuppressLeftPanelUi) return;
    if (typeof ensureTcLeftFloatLayersMounted === 'function') {
        ensureTcLeftFloatLayersMounted();
    }
    if (typeof switchTcWorkbenchMode === 'function') {
        switchTcWorkbenchMode('edit');
    }
    if (typeof expandTcLeftFloatPanel === 'function') {
        expandTcLeftFloatPanel(2);
    }
}

function initTcLeftInputFloatDrag() {
    var wrap = document.getElementById('tc-left-input-float-wrap');
    var toggle = wrap && wrap.querySelector('[data-tc-float-open]');
    if (!toggle || toggle._tcLeftInputFloatDragBound) return;
    toggle._tcLeftInputFloatDragBound = true;

    var pointerDown = false;
    var dragging = false;
    var activePointerId = null;
    var dragThreshold = 5;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;
    var suppressOpenClick = false;

    function markOpenClickHandled() {
        suppressOpenClick = true;
        toggle._tcLeftFloatOpenSuppressClick = true;
        window.setTimeout(function() {
            suppressOpenClick = false;
            toggle._tcLeftFloatOpenSuppressClick = false;
        }, 450);
    }

    function onFabPointerMove(e) {
        if (!pointerDown || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!dragging) {
            if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
            dragging = true;
            suppressOpenClick = true;
            if (wrap) wrap.classList.add('tc-left-input-float-wrap--dragging');
            document.body.classList.add('tc-left-input-float-dragging');
        }
        applyTcLeftInputFloatPosition(startLeft + dx, startTop + dy);
        e.preventDefault();
    }

    function endFabPointer(e) {
        if (activePointerId !== null && e && e.pointerId !== activePointerId) return;
        document.removeEventListener('pointermove', onFabPointerMove);
        document.removeEventListener('pointerup', endFabPointer);
        document.removeEventListener('pointercancel', endFabPointer);
        if (!pointerDown) return;
        var wasDrag = dragging;
        pointerDown = false;
        dragging = false;
        activePointerId = null;
        if (wrap) wrap.classList.remove('tc-left-input-float-wrap--dragging');
        document.body.classList.remove('tc-left-input-float-dragging');
        if (wasDrag) {
            window.setTimeout(function() { suppressOpenClick = false; }, 400);
        } else {
            markOpenClickHandled();
            openTcLeftInputFloatFromFab();
        }
    }

    toggle.addEventListener('click', function(e) {
        if (!suppressOpenClick && !toggle._tcLeftFloatOpenSuppressClick) return;
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);

    toggle.addEventListener('pointerdown', function(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.stopPropagation();
        pointerDown = true;
        dragging = false;
        suppressOpenClick = false;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        var rect = wrap.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        if (!wrap.classList.contains('tc-left-input-float-wrap--positioned')) {
            applyTcLeftInputFloatPosition(startLeft, startTop);
        }
        if (toggle.setPointerCapture) {
            try { toggle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
        document.addEventListener('pointermove', onFabPointerMove);
        document.addEventListener('pointerup', endFabPointer);
        document.addEventListener('pointercancel', endFabPointer);
    });

    if (!window._tcLeftInputFloatResizeBound) {
        window._tcLeftInputFloatResizeBound = true;
        window.addEventListener('resize', function() {
            ensureTcLeftInputFloatOnScreen();
        });
    }
}

function getTcLeftFloatSizeLimits() {
    var insets = getTcLeftFloatViewportInsets();
    return {
        minW: TC_LEFT_FLOAT_MIN_W,
        minH: TC_LEFT_FLOAT_MIN_H,
        maxW: Math.max(TC_LEFT_FLOAT_MIN_W, window.innerWidth - insets.margin * 2),
        maxH: Math.max(TC_LEFT_FLOAT_MIN_H, window.innerHeight - insets.top - insets.bottom)
    };
}

function clampTcLeftFloatSize(w, h) {
    var lim = getTcLeftFloatSizeLimits();
    return {
        w: Math.round(Math.max(lim.minW, Math.min(w, lim.maxW))),
        h: Math.round(Math.max(lim.minH, Math.min(h, lim.maxH)))
    };
}

function applyTcLeftFloatSize(w, h) {
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    var s = clampTcLeftFloatSize(w, h);
    panel.style.width = s.w + 'px';
    panel.style.height = s.h + 'px';
    panel.style.maxWidth = 'none';
    panel.style.maxHeight = 'none';
    panel.dataset.tcFloatW = String(s.w);
    panel.dataset.tcFloatH = String(s.h);
    return s;
}

function applyTcLeftFloatBounds(w, h, left, top) {
    var panel = document.getElementById('left-panel');
    if (!panel) return null;
    var s = applyTcLeftFloatSize(w, h);
    if (!s) return null;
    var p = clampTcLeftFloatPos(left, top);
    panel.style.left = p.x + 'px';
    panel.style.top = p.y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    return { w: s.w, h: s.h, left: p.x, top: p.y };
}

/** 根据抽屉当前宽高缩放内部字号/间距，并限制输入区高度 */
function tcLeftFloatAdaptContentToPanel() {
    var panel = document.getElementById('left-panel');
    if (!panel || isCollapsed) return;
    var w = panel.offsetWidth || TC_LEFT_FLOAT_DEFAULT_W;
    var h = panel.offsetHeight || TC_LEFT_FLOAT_DEFAULT_H;
    var scale = Math.max(0.72, Math.min(1.1, Math.min(w / TC_LEFT_FLOAT_DEFAULT_W, h / TC_LEFT_FLOAT_DEFAULT_H)));
    panel.style.setProperty('--tc-float-scale', scale.toFixed(3));

    var prompt = document.getElementById('ai-prompt');
    if (prompt && typeof resizeTcAiPromptInput === 'function') {
        resizeTcAiPromptInput(prompt);
    }
    if (typeof autoGrowTcPresetLanhuField === 'function') {
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-cookie'));
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-url'));
    }
}

function tcLeftFloatComputeResize(mode, startW, startH, startLeft, startTop, dx, dy) {
    var nw = startW;
    var nh = startH;
    var nl = startLeft;
    var nt = startTop;
    if (mode === 'e') {
        nw = startW + dx;
    } else if (mode === 'w') {
        nw = startW - dx;
        nl = startLeft + dx;
    } else if (mode === 's') {
        nh = startH + dy;
    } else if (mode === 'n') {
        nh = startH - dy;
        nt = startTop + dy;
    } else if (mode === 'se') {
        nw = startW + dx;
        nh = startH + dy;
    } else if (mode === 'sw') {
        nw = startW - dx;
        nl = startLeft + dx;
        nh = startH + dy;
    } else if (mode === 'ne') {
        nw = startW + dx;
        nh = startH - dy;
        nt = startTop + dy;
    } else if (mode === 'nw') {
        nw = startW - dx;
        nl = startLeft + dx;
        nh = startH - dy;
        nt = startTop + dy;
    } else {
        nw = startW + dx;
        nh = startH + dy;
    }
    var s = clampTcLeftFloatSize(nw, nh);
    if (mode === 'w' || mode === 'sw' || mode === 'nw') {
        nl = startLeft + (startW - s.w);
    }
    if (mode === 'n' || mode === 'ne' || mode === 'nw') {
        nt = startTop + (startH - s.h);
    }
    return applyTcLeftFloatBounds(s.w, s.h, nl, nt);
}

function measureTcLeftFloatDefaultSize() {
    var panel = document.getElementById('left-panel');
    if (!panel) {
        return { w: TC_LEFT_FLOAT_DEFAULT_W, h: TC_LEFT_FLOAT_DEFAULT_H };
    }
    var prevW = panel.style.width;
    var prevH = panel.style.height;
    panel.style.visibility = 'hidden';
    panel.style.pointerEvents = 'none';
    panel.style.opacity = '0';
    panel.style.width = TC_LEFT_FLOAT_DEFAULT_W + 'px';
    panel.style.height = 'auto';
    panel.style.maxHeight = 'none';
    var scroll = panel.querySelector('.tc-left-float-panel__scroll');
    if (scroll) scroll.style.overflowY = 'visible';
    var measuredH = panel.offsetHeight;
    var lim = getTcLeftFloatSizeLimits();
    var h = Math.max(TC_LEFT_FLOAT_MIN_H, Math.min(measuredH + 8, lim.maxH, TC_LEFT_FLOAT_DEFAULT_H + 120));
    panel.style.width = prevW;
    panel.style.height = prevH;
    panel.style.visibility = '';
    panel.style.pointerEvents = '';
    panel.style.opacity = '';
    if (scroll) scroll.style.overflowY = '';
    return { w: TC_LEFT_FLOAT_DEFAULT_W, h: h };
}

function resetTcLeftFloatSessionLayout() {
    tcLeftFloatSessionPos = null;
    tcLeftFloatSessionSize = null;
}

function ensureTcLeftFloatSize() {
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    loadTcLeftFloatLayoutFromStorage();
    if (tcLeftFloatSessionSize && typeof tcLeftFloatSessionSize.w === 'number' && typeof tcLeftFloatSessionSize.h === 'number') {
        var stored = clampTcLeftFloatSize(tcLeftFloatSessionSize.w, tcLeftFloatSessionSize.h);
        applyTcLeftFloatSize(stored.w, stored.h);
        return;
    }
    var def = getTcLeftFloatAdaptiveDefaultSize();
    applyTcLeftFloatSize(def.w, def.h);
}

function saveTcLeftFloatSize() {
    persistTcLeftFloatLayout();
}

function clampTcLeftFloatPos(x, y) {
    var panel = document.getElementById('left-panel');
    if (!panel) return { x: x, y: y };
    var insets = getTcLeftFloatViewportInsets();
    var r = panel.getBoundingClientRect();
    var w = r.width > 0 ? r.width : TC_LEFT_FLOAT_DEFAULT_W;
    var h = r.height > 0 ? r.height : TC_LEFT_FLOAT_DEFAULT_H;
    return {
        x: Math.max(insets.margin, Math.min(x, window.innerWidth - w - insets.margin)),
        y: Math.max(insets.top, Math.min(y, window.innerHeight - h - insets.bottom))
    };
}

function applyTcLeftFloatPosition(x, y) {
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    var p = clampTcLeftFloatPos(x, y);
    panel.style.left = p.x + 'px';
    panel.style.top = p.y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
}

function ensureTcLeftFloatPosition() {
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    loadTcLeftFloatLayoutFromStorage();
    if (tcLeftFloatSessionPos && typeof tcLeftFloatSessionPos.x === 'number' && typeof tcLeftFloatSessionPos.y === 'number') {
        applyTcLeftFloatPosition(tcLeftFloatSessionPos.x, tcLeftFloatSessionPos.y);
        return;
    }
    var def = getTcLeftFloatDefaultPos();
    applyTcLeftFloatPosition(def.x, def.y);
}

function saveTcLeftFloatPosition() {
    persistTcLeftFloatLayout();
}

function tcLeftFloatRefreshContentHeights() {
    var panel = document.getElementById('left-panel');
    if (!panel || isCollapsed) return;
    var prompt = document.getElementById('ai-prompt');
    if (prompt && typeof resizeTcAiPromptInput === 'function') {
        resizeTcAiPromptInput(prompt);
    }
    if (typeof syncTcManualImportTextareaHeights === 'function') {
        syncTcManualImportTextareaHeights();
    }
    if (typeof autoGrowTcPresetLanhuField === 'function') {
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-cookie'));
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-url'));
    }
    window.requestAnimationFrame(function() {
        ensureTcLeftFloatPosition();
        tcLeftFloatAdaptContentToPanel();
    });
}

/** 左侧录入区：悬浮抽屉展开/收起（右侧工作区始终铺满） */
function applyDrawerLayout(drawerNum) {
    var shell = document.getElementById('tc-main-content-shell');
    var leftPanel = document.getElementById('left-panel');
    var dock = document.getElementById('tc-left-float-dock');
    var backdrop = document.getElementById('tc-left-float-backdrop');
    var drawerTabsRoot = document.getElementById('tc-drawer-tabs-root');
    var leftContentWrapper = document.getElementById('left-content-wrapper');
    if (!shell || !leftPanel) return;

    ensureTcLeftFloatPanelMounted();

    shell.classList.toggle('tc-left-float--collapsed', isCollapsed);
    shell.classList.toggle('tc-left-float--open', !isCollapsed);
    leftPanel.classList.toggle('tc-left-float-panel--collapsed', isCollapsed);
    if (isCollapsed) {
        if (typeof tcReleaseFocusWithin === 'function') tcReleaseFocusWithin(leftPanel);
    }
    // 收起时标题栏关闭按钮仍可聚焦：整块 aside 不可 aria-hidden
    leftPanel.setAttribute('aria-hidden', 'false');
    var leftScrollEl = leftPanel.querySelector('.tc-left-float-panel__scroll');
    if (leftScrollEl) {
        leftScrollEl.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');
    }
    if (dock) dock.classList.toggle('hidden', !isCollapsed);
    if (backdrop) {
        backdrop.classList.toggle('hidden', isCollapsed);
        backdrop.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');
    }
    if (drawerTabsRoot) drawerTabsRoot.classList.toggle('hidden', isCollapsed);
    if (leftContentWrapper) leftContentWrapper.classList.toggle('hidden', isCollapsed);
    if (!isCollapsed) {
        ensureTcLeftFloatSize();
        ensureTcLeftFloatPosition();
        ensureTcLeftFloatFitsViewport();
        tcLeftFloatRefreshContentHeights();
        tcLeftFloatAdaptContentToPanel();
        if (typeof initTcEditComposer === 'function') initTcEditComposer();
        if (typeof ensureTcLeftFloatDrag === 'function') ensureTcLeftFloatDrag();
        if (window.TcWorkbenchEnhancements && typeof window.TcWorkbenchEnhancements.bringFloatPanelToFront === 'function') {
            window.TcWorkbenchEnhancements.bringFloatPanelToFront(leftPanel);
        }
    }
    syncLeftPanelCollapseBtn();
    if (typeof syncTcLeftGenPanelLayout === 'function') syncTcLeftGenPanelLayout();
    tcLeftFloatNotifyLayoutChange();
}

function expandTcLeftFloatPanel(drawerNum) {
    if (window.__tcSuppressLeftPanelUi) return;
    if (typeof ensureTcLeftFloatLayersMounted === 'function') {
        ensureTcLeftFloatLayersMounted();
    }
    var needOpen = isCollapsed;
    if (needOpen) {
        isCollapsed = false;
    }
    if (drawerNum === 1 || drawerNum === 2) {
        switchDrawer(drawerNum);
    } else if (needOpen) {
        applyDrawerLayout(getTcActiveDrawerNum());
    }
}

/** 进入用例工作台时不再默认展开「用例生成」浮层（保留空实现，避免外部引用报错） */
function autoOpenTcGenPanelOnPageEnter() {
    /* 默认收起，由用户点击 dock / 展开按钮打开 */
}

function ensureTcLeftPanelClosedForHeadlessGen() {
    if (!window.__tcSuppressLeftPanelUi) return;
    var panel = document.getElementById('left-panel');
    if (!panel || panel.classList.contains('tc-left-float-panel--collapsed')) return;
    if (typeof toggleCollapse === 'function') toggleCollapse();
}

function toggleCollapse() {
    if (!document.getElementById('left-panel') || !document.getElementById('right-panel')) return;
    isCollapsed = !isCollapsed;
    applyDrawerLayout(getTcActiveDrawerNum());
}

function initTcLeftFloatDrag() {
    if (!window._tcLeftFloatViewportResizeBound) {
        window._tcLeftFloatViewportResizeBound = true;
        window.addEventListener('resize', function() {
            ensureTcLeftFloatFitsViewport();
            tcLeftFloatAdaptContentToPanel();
        });
    }
    var panel = document.getElementById('left-panel');
    var handle = document.getElementById('tc-left-float-drag-handle');
    var closeBtn = document.getElementById('collapse-btn');
    if (!panel || !handle) return;
    if (handle._tcFloatDragBound) return;
    handle._tcFloatDragBound = true;

    var pointerDown = false;
    var dragging = false;
    var activePointerId = null;
    var dragThreshold = 5;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;

    function detachDragListeners() {
        document.removeEventListener('pointermove', onPanelPointerMove);
        document.removeEventListener('pointerup', endPanelPointer);
        document.removeEventListener('pointercancel', endPanelPointer);
        handle.removeEventListener('pointermove', onPanelPointerMove);
        handle.removeEventListener('pointerup', endPanelPointer);
        handle.removeEventListener('pointercancel', endPanelPointer);
    }

    function onPanelPointerMove(e) {
        if (!pointerDown || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!dragging) {
            if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
            dragging = true;
            panel.classList.add('tc-left-float-panel--dragging');
            document.body.classList.add('tc-left-float-dragging');
        }
        applyTcLeftFloatPosition(startLeft + dx, startTop + dy);
        e.preventDefault();
    }

    function endPanelPointer(e) {
        if (activePointerId !== null && e && e.pointerId !== activePointerId) return;
        detachDragListeners();
        if (!pointerDown) return;
        pointerDown = false;
        if (dragging) saveTcLeftFloatPosition();
        dragging = false;
        activePointerId = null;
        panel.classList.remove('tc-left-float-panel--dragging');
        document.body.classList.remove('tc-left-float-dragging');
    }

    function beginPanelDrag(clientX, clientY, pointerId) {
        if (panel.classList.contains('tc-left-float-panel--collapsed')) return;
        if (window.TcWorkbenchEnhancements && typeof window.TcWorkbenchEnhancements.bringFloatPanelToFront === 'function') {
            window.TcWorkbenchEnhancements.bringFloatPanelToFront(panel);
        }
        pointerDown = true;
        dragging = false;
        activePointerId = pointerId != null ? pointerId : null;
        startX = clientX;
        startY = clientY;
        var rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        document.addEventListener('pointermove', onPanelPointerMove);
        document.addEventListener('pointerup', endPanelPointer);
        document.addEventListener('pointercancel', endPanelPointer);
        handle.addEventListener('pointermove', onPanelPointerMove);
        handle.addEventListener('pointerup', endPanelPointer);
        handle.addEventListener('pointercancel', endPanelPointer);
    }

    handle.addEventListener('pointerdown', function(e) {
        if (closeBtn && (e.target === closeBtn || closeBtn.contains(e.target))) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (panel.classList.contains('tc-left-float-panel--collapsed')) return;
        e.preventDefault();
        e.stopPropagation();
        beginPanelDrag(e.clientX, e.clientY, e.pointerId);
    });
}

function ensureTcLeftFloatDrag() {
    initTcLeftFloatDrag();
}

function initTcLeftFloatUi() {
    if (window._tcLeftFloatUiBound) return;
    window._tcLeftFloatUiBound = true;
    var isWorkbench = !!document.querySelector('.tc-workbench-scope');
    ensureTcLeftFloatLayersMounted();
    loadTcLeftFloatLayoutFromStorage();
    if (typeof applyDrawerLayout === 'function') {
        applyDrawerLayout(typeof getTcActiveDrawerNum === 'function' ? getTcActiveDrawerNum() : 1);
    }
    syncTcHubAiChrome();
    resetTcLeftInputFloatToDefault();
    syncTcLeftInputFloatChrome();
    initTcLeftInputFloatDrag();
    document.querySelectorAll('[data-tc-float-drawer]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var n = parseInt(btn.getAttribute('data-tc-float-drawer'), 10);
            expandTcLeftFloatPanel(n === 2 ? 2 : 1);
        });
    });
    var backdrop = document.getElementById('tc-left-float-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', function() {
            if (!isCollapsed) toggleCollapse();
        });
    }
    initTcLeftFloatDrag();
    initTcLeftFloatResize();
    initTcLeftFloatPanelStack();
    var leftWrap = document.getElementById('left-content-wrapper');
    if (leftWrap) leftWrap.setAttribute('data-active-drawer', String(getTcActiveDrawerNum()));
    if (typeof syncTcPromptIntroLayout === 'function') syncTcPromptIntroLayout();
    if (typeof syncTcGenChatLayout === 'function') syncTcGenChatLayout();
    if (isWorkbench && document.body) {
        document.body.classList.add('tc-left-gen-ui-ready');
    }
}

function tcLeftFloatWorkbenchBootLayout() {
    if (!document.querySelector('.tc-workbench-scope')) return;
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    isCollapsed = true;
    if (typeof ensureTcLeftFloatPanelMounted === 'function') ensureTcLeftFloatPanelMounted();
    if (typeof ensureTcLeftFloatSize === 'function') ensureTcLeftFloatSize();
    if (typeof ensureTcLeftFloatPosition === 'function') ensureTcLeftFloatPosition();
    if (typeof applyDrawerLayout === 'function') {
        applyDrawerLayout(typeof getTcActiveDrawerNum === 'function' ? getTcActiveDrawerNum() : 2);
    }
    if (typeof initTcLeftFloatUi === 'function') initTcLeftFloatUi();
}

(function tcLeftFloatWorkbenchBoot() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tcLeftFloatWorkbenchBootLayout);
    } else {
        tcLeftFloatWorkbenchBootLayout();
    }
})();

function initTcLeftFloatPanelStack() {
    var panel = document.getElementById('left-panel');
    if (!panel || panel._tcWorkbenchFloatStackBound) return;
    panel._tcWorkbenchFloatStackBound = true;
    panel.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        if (panel.classList.contains('tc-left-float-panel--collapsed')) return;
        if (window.TcWorkbenchEnhancements && typeof window.TcWorkbenchEnhancements.bringFloatPanelToFront === 'function') {
            window.TcWorkbenchEnhancements.bringFloatPanelToFront(panel);
        }
    }, true);
}

function initTcLeftFloatResize() {
    var panel = document.getElementById('left-panel');
    if (!panel || panel._tcFloatResizeBound) return;
    panel._tcFloatResizeBound = true;

    panel.querySelectorAll('[data-tc-resize]').forEach(function(handle) {
        handle.addEventListener('pointerdown', function(e) {
            if (panel.classList.contains('tc-left-float-panel--collapsed')) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            var mode = handle.getAttribute('data-tc-resize') || 'se';
            var rect = panel.getBoundingClientRect();
            var startX = e.clientX;
            var startY = e.clientY;
            var startW = rect.width;
            var startH = rect.height;
            var startLeft = rect.left;
            var startTop = rect.top;
            var activePointerId = e.pointerId;

            function onResizeMove(ev) {
                if (activePointerId !== null && ev.pointerId !== activePointerId) return;
                tcLeftFloatComputeResize(
                    mode, startW, startH, startLeft, startTop,
                    ev.clientX - startX, ev.clientY - startY
                );
                tcLeftFloatAdaptContentToPanel();
                ev.preventDefault();
            }

            function endResize(ev) {
                if (activePointerId !== null && ev && ev.pointerId !== activePointerId) return;
                document.removeEventListener('pointermove', onResizeMove);
                document.removeEventListener('pointerup', endResize);
                document.removeEventListener('pointercancel', endResize);
                panel.classList.remove('tc-left-float-panel--resizing');
                document.body.classList.remove('tc-left-float-resizing');
                document.body.removeAttribute('data-tc-resize-cursor');
                saveTcLeftFloatSize();
                saveTcLeftFloatPosition();
                tcLeftFloatAdaptContentToPanel();
                tcLeftFloatNotifyLayoutChange();
            }

            panel.classList.add('tc-left-float-panel--resizing');
            document.body.classList.add('tc-left-float-resizing');
            document.body.setAttribute('data-tc-resize-cursor', mode);
            if (handle.setPointerCapture) {
                try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            }
            document.addEventListener('pointermove', onResizeMove);
            document.addEventListener('pointerup', endResize);
            document.addEventListener('pointercancel', endResize);
        });
    });
}

function getTcActiveDrawerNum() {
    return 2;
}

function switchDrawer(drawerNum) {
    drawerNum = 2;
    var editLeftWrap = document.getElementById('left-content-wrapper');
    if (editLeftWrap) editLeftWrap.setAttribute('data-active-drawer', '2');
    applyDrawerLayout(drawerNum);
    if (!isCollapsed && typeof tcLeftFloatRefreshContentHeights === 'function') {
        tcLeftFloatRefreshContentHeights();
    }
    if (!isCollapsed && typeof tcLeftFloatAdaptContentToPanel === 'function') {
        tcLeftFloatAdaptContentToPanel();
    }
}

if (typeof window !== 'undefined') {
    window.toggleCollapse = toggleCollapse;
    window.ensureTcLeftPanelClosedForHeadlessGen = ensureTcLeftPanelClosedForHeadlessGen;
}

/* ---- tc_lanhu_doc_tree.js ---- */
/**
 * TestHub TC Workbench — 蓝湖需求文档树（左侧栏，独立于生成浮层蓝湖逻辑）
 */
(function tcLanhuDocTreeModule() {
    'use strict';

    var STORAGE_KEY = 'tc_lanhu_doc_tree_meta_v1';
    var LOGOUT_TREE_CLEAR_FLAG = 'tc_logout_pending_tree_clear_v1';
    var state = {
        tree: null,
        docName: '',
        docId: '',
        focusPageId: '',
        expanded: {},
        selectedId: '',
        loading: false,
        collapsedRail: false,
        pageCache: {},
        lanhuBaseUrl: ''
    };

    function $(id) { return document.getElementById(id); }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getMainCookieEl() { return $('lanhu-cookie'); }
    function getMainUrlEl() { return $('lanhu-url'); }


    function stripLanhuBaseUrl(url) {
        url = String(url || '').trim();
        if (!url) return '';
        return url
            .replace(/([?&])pageId=[^&]*/gi, '$1')
            .replace(/([?&])page_id=[^&]*/gi, '$1')
            .replace(/[?&]$/, '')
            .replace(/\?&/, '?');
    }

    function syncToMainLanhuFields(cookie, url) {
        var cookieEl = getMainCookieEl();
        var urlEl = getMainUrlEl();
        if (cookieEl && cookie) cookieEl.value = cookie;
        if (urlEl && url) urlEl.value = url;
        if (url) state.lanhuBaseUrl = stripLanhuBaseUrl(url);
        if (typeof autoGrowTcPresetLanhuField === 'function') {
            autoGrowTcPresetLanhuField(cookieEl);
            autoGrowTcPresetLanhuField(urlEl);
        }
    }

    function readStoredMeta() {
        try {
            var raw = sessionStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function persistMeta() {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                docName: state.docName,
                docId: state.docId,
                focusPageId: state.focusPageId,
                tree: state.tree,
                expanded: state.expanded,
                selectedId: state.selectedId,
                pageCache: state.pageCache,
                lanhuBaseUrl: state.lanhuBaseUrl || stripLanhuBaseUrl((getMainUrlEl() || {}).value || '')
            }));
        } catch (e) { /* ignore */ }
    }

    function setStatus(text, kind) {
        var el = $('tc-lanhu-tree-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('tc-lanhu-tree-status--error', 'tc-lanhu-tree-status--ok', 'tc-lanhu-tree-status--loading');
        if (kind) el.classList.add('tc-lanhu-tree-status--' + kind);
    }
    var INVALID_LANHU_URL_MSG = (window.TcLanhuDocUrlValidator && window.TcLanhuDocUrlValidator.message) || '文档 URL 须以 https://lanhuapp.com 开头';

    function isValidLanhuDocUrl(url) {
        if (window.TcLanhuDocUrlValidator && typeof window.TcLanhuDocUrlValidator.isValid === 'function') {
            return window.TcLanhuDocUrlValidator.isValid(url);
        }
        return /^https:\/\/lanhuapp\.com/i.test(String(url || '').trim());
    }

    function showInvalidLanhuUrlTreeView(opts) {
        opts = opts || {};
        state.tree = null;
        state.docId = '';
        if (!opts.keepDocName) state.docName = '';
        state.focusPageId = '';
        state.expanded = {};
        state.selectedId = '';
        state.pageCache = {};
        state.loading = false;
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        setStatus('', '');
        if (typeof window.setTcInvalidLanhuDocWorkbenchLock === 'function') {
            window.setTcInvalidLanhuDocWorkbenchLock(true);
        }
        var mount = $('tc-lanhu-tree-mount');
        if (mount) {
            mount.innerHTML = '<div class="tc-lanhu-tree-empty tc-lanhu-tree-empty--invalid">' +
                '<p class="tc-lanhu-tree-empty__title">' + escapeHtml(INVALID_LANHU_URL_MSG) + '</p>' +
                '<p class="tc-lanhu-tree-empty__desc">请为该文档填写正确的蓝湖文档链接后重新连接</p>' +
                '<button type="button" class="tc-lanhu-tree-empty__btn" data-tc-lanhu-tree-connect>连接蓝湖</button>' +
            '</div>';
        }
        var rail = $('tc-lanhu-doc-tree-rail');
        if (rail) {
            rail.classList.remove('tc-lanhu-doc-tree-rail--has-data');
            rail.classList.toggle('tc-lanhu-doc-tree-rail--collapsed', !!state.collapsedRail);
        }
        if (typeof window.scheduleTcLanhuTreeFillHeight === 'function') {
            window.scheduleTcLanhuTreeFillHeight();
        }
    }



    function countPages(nodes) {
        var n = 0;
        (nodes || []).forEach(function (node) {
            if (node.type === 'page') n += 1;
            n += countPages(node.children);
        });
        return n;
    }

    function defaultExpandTree(nodes, depth, acc) {
        acc = acc || {};
        (nodes || []).forEach(function (node) {
            if (depth < 2) acc[node.id] = true;
            if (node.children && node.children.length) {
                defaultExpandTree(node.children, depth + 1, acc);
            }
        });
        return acc;
    }

    function filterTree(nodes, query) {
        var q = String(query || '').trim().toLowerCase();
        if (!q) return nodes;
        var out = [];
        (nodes || []).forEach(function (node) {
            var name = String(node.name || '').toLowerCase();
            var childFiltered = filterTree(node.children, q);
            if (name.indexOf(q) >= 0 || childFiltered.length) {
                out.push(Object.assign({}, node, { children: childFiltered }));
            }
        });
        return out;
    }

    function findPageNodeName(pageId) {
        var found = '';
        function walk(nodes) {
            (nodes || []).forEach(function (node) {
                if (found) return;
                if (node.type === 'page' && node.id === pageId) {
                    found = node.name || '';
                    return;
                }
                walk(node.children);
            });
        }
        walk(state.tree);
        return found;
    }

    function findPageNodePath(pageId) {
        pageId = String(pageId || '').trim();
        if (!pageId || !state.tree) return '';
        var found = null;
        function walk(nodes, trail) {
            (nodes || []).forEach(function (node) {
                if (found || !node) return;
                var name = String(node.name || '').trim();
                var nextTrail = trail.slice();
                if (name) nextTrail.push(name);
                if (node.type === 'page' && node.id === pageId) {
                    found = nextTrail;
                    return;
                }
                walk(node.children, nextTrail);
            });
        }
        walk(state.tree, []);
        return found && found.length ? found.join('/') : '';
    }

    function getPageCharsDisplay(pageId) {
        var entry = state.pageCache[pageId];
        if (!entry) {
            return {
                text: '',
                cls: 'tc-lanhu-tree-node__chars',
                title: ''
            };
        }
        if (entry.loading) {
            return {
                text: '',
                cls: 'tc-lanhu-tree-node__chars tc-lanhu-tree-node__chars--loading',
                title: '获取中…'
            };
        }
        if (entry.error) {
            return {
                text: String(entry.error).slice(0, 30),
                cls: 'tc-lanhu-tree-node__chars tc-lanhu-tree-node__chars--error',
                title: String(entry.error)
            };
        }
        var ch = parseInt(entry.chars, 10);
        if (isNaN(ch) || ch < 0) ch = 0;
        var label = ch >= 1000 ? (ch / 1000).toFixed(1) + 'k' : (ch + '字');
        return {
            text: label,
            cls: 'tc-lanhu-tree-node__chars tc-lanhu-tree-node__chars--ok',
            title: '共 ' + ch + ' 字'
        };
    }

    function mergePageCacheItems(items) {
        (items || []).forEach(function (item) {
            var pid = item.page_id;
            if (!pid) return;
            state.pageCache[pid] = {
                chars: parseInt(item.content_chars, 10) || 0,
                text: item.content_text || '',
                error: null
            };
        });
    }

    function loadPageCacheFromServer() {
        if (!state.docId) return Promise.resolve();
        return fetch('/api/lanhu-page-cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ doc_id: state.docId })
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.items && data.items.length) {
                    mergePageCacheItems(data.items);
                    persistMeta();
                    renderTree();
                }
            })
            .catch(function () { /* ignore */ });
    }


    function getPageCaseStatus(pageId) {
        if (!window.TcLanhuTreeCaseStatus || !state.docId || !pageId) return null;
        return window.TcLanhuTreeCaseStatus.getPageStatus(state.docId, pageId);
    }

    var _lanhuCaseStatusLoadPromise = null;
    var _lanhuCaseStatusLoadedDocId = '';

    function resetLanhuTreeCaseStatusCache() {
        _lanhuCaseStatusLoadPromise = null;
        _lanhuCaseStatusLoadedDocId = '';
    }

    function ensureLanhuTreeCaseStatusReady() {
        if (!window.TcLanhuTreeCaseStatus || !state.docId) return Promise.resolve(false);
        if (_lanhuCaseStatusLoadedDocId === state.docId) return Promise.resolve(true);
        if (_lanhuCaseStatusLoadPromise) return _lanhuCaseStatusLoadPromise;
        _lanhuCaseStatusLoadPromise = window.TcLanhuTreeCaseStatus.loadForDoc(state.docId)
            .then(function (ok) {
                if (ok) _lanhuCaseStatusLoadedDocId = state.docId;
                return ok;
            })
            .finally(function () {
                _lanhuCaseStatusLoadPromise = null;
            });
        return _lanhuCaseStatusLoadPromise;
    }

    /** 左侧树切换：判断目标需求页是否已有用例（多信号，避免 case 缓存未就绪时误判） */
    function lanhuTreeTargetPageHasDesignedCases(pageId, selectRowEl) {
        pageId = String(pageId || '').trim();
        if (!pageId) return false;
        if (getPageCaseStatus(pageId)) return true;
        if (window.TcLanhuTreeCaseStatus && state.docId &&
            typeof window.TcLanhuTreeCaseStatus.pageHasCases === 'function' &&
            window.TcLanhuTreeCaseStatus.pageHasCases(state.docId, pageId)) {
            return true;
        }
        if (selectRowEl) {
            var li = selectRowEl.closest('li[data-tree-type]');
            if (li && li.classList.contains('tc-lanhu-tree-node--designed')) return true;
        }
        return false;
    }

    function countFolderDesigned(nodes) {
        var designed = 0;
        var total = 0;
        function walk(list) {
            (list || []).forEach(function (node) {
                if (!node) return;
                if (node.type === 'page') {
                    total += 1;
                    if (getPageCaseStatus(node.id)) designed += 1;
                    return;
                }
                walk(node.children);
            });
        }
        walk(nodes);
        return { designed: designed, total: total };
    }

    function buildPageCaseBadgeHtml() { return ''; }

    function buildFolderCaseBadgeHtml() { return ''; }

    function renderTreeNodes(nodes, depth) {
        depth = depth || 0;
        if (!nodes || !nodes.length) return '';
        return nodes.map(function (node) {
            var hasChildren = node.children && node.children.length;
            var isExpanded = !!state.expanded[node.id];
            var isSelected = state.selectedId === node.id;
            var isPage = node.type === 'page';
            var caseStatus = isPage ? getPageCaseStatus(node.id) : null;
            var rowCls = [
                'tc-lanhu-tree-node',
                isPage ? 'tc-lanhu-tree-node--page' : 'tc-lanhu-tree-node--folder',
                isSelected ? 'tc-lanhu-tree-node--selected' : '',
                hasChildren && isExpanded ? 'tc-lanhu-tree-node--expanded' : '',
                caseStatus ? 'tc-lanhu-tree-node--designed' : ''
            ].filter(Boolean).join(' ');
            var toggleBtn = hasChildren
                ? '<button type="button" class="tc-lanhu-tree-node__toggle" data-tree-toggle="' + escapeHtml(node.id) + '" aria-label="' + (isExpanded ? '收起' : '展开') + '">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' +
                  '</button>'
                : '<span class="tc-lanhu-tree-node__toggle tc-lanhu-tree-node__toggle--spacer" aria-hidden="true"></span>';
            var icon = isPage
                ? '<span class="tc-lanhu-tree-node__icon tc-lanhu-tree-node__icon--page" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6M7 4h7l5 5v11a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg></span>'
                : '<span class="tc-lanhu-tree-node__icon tc-lanhu-tree-node__icon--folder" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg></span>';
            var childrenHtml = hasChildren && isExpanded
                ? '<ul class="tc-lanhu-tree-node__children" role="group">' + renderTreeNodes(node.children, depth + 1) + '</ul>'
                : '';
            var charsDisplay = isPage ? getPageCharsDisplay(node.id) : null;
            var charsHtml = isPage
                ? '<button type="button" class="tc-lanhu-tree-node__refresh" data-tree-refresh="' + escapeHtml(node.id) + '" title="获取页面需求" aria-label="获取页面需求">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006.34 6.34M4 15a8 8 0 0013.66 2.66"/></svg></button>' +
                    '<span class="' + charsDisplay.cls + '" data-tree-chars="' + escapeHtml(node.id) + '" title="' + escapeHtml(charsDisplay.title) + '" aria-live="polite">' + escapeHtml(charsDisplay.text) + '</span>'
                : '';
            return '<li class="' + rowCls + '" data-tree-id="' + escapeHtml(node.id) + '" data-tree-type="' + escapeHtml(node.type) + '" style="--tc-tree-depth:' + depth + '">' +
                '<div class="tc-lanhu-tree-node__row" data-tree-select="' + escapeHtml(node.id) + '">' +
                    toggleBtn + icon +
                    (isPage
                        ? ('<span class="tc-lanhu-tree-node__label" title="' + escapeHtml(node.name) + '">' +
                            '<span class="tc-lanhu-tree-node__label-text">' + escapeHtml(node.name) + '</span>' +
                            (caseStatus ? '<span class="tc-lanhu-tree-node__case-dot" aria-hidden="true" title="已设计用例"></span>' : '') +
                            '</span>')
                        : ('<span class="tc-lanhu-tree-node__label" title="' + escapeHtml(node.name) + '">' + escapeHtml(node.name) + '</span>')) +
                    charsHtml +
                '</div>' +
                childrenHtml +
            '</li>';
        }).join('');
    }

    var TC_LANHU_RAIL_ICON_COLLAPSE = 'M15 19l-7-7 7-7';
    var TC_LANHU_RAIL_ICON_EXPAND = 'M9 5l7 7-7 7';

    function syncRailCollapseChrome() {
        var rail = $('tc-lanhu-doc-tree-rail');
        var collapseBtn = $('tc-lanhu-tree-rail-collapse');
        if (!rail || !collapseBtn) return;
        var collapsed = !!state.collapsedRail;
        var path = collapseBtn.querySelector('svg path');
        if (path) path.setAttribute('d', collapsed ? TC_LANHU_RAIL_ICON_EXPAND : TC_LANHU_RAIL_ICON_COLLAPSE);
        collapseBtn.title = collapsed ? '展开需求树' : '收起需求树';
        collapseBtn.setAttribute('aria-label', collapsed ? '展开需求树' : '收起需求树');
        collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    function renderTree() {
        var mount = $('tc-lanhu-tree-mount');
        var titleEl = $('tc-lanhu-tree-doc-title');
        var countEl = $('tc-lanhu-tree-page-count');
        var rail = $('tc-lanhu-doc-tree-rail');
        if (!mount) return;

        var docTitleText = state.docName || '蓝湖需求';
        var docSubtitleText = '';
        if (titleEl) {
            titleEl.textContent = docTitleText;
            titleEl.setAttribute('title', docTitleText);
        }
        if (countEl) {
            var cnt = state.tree ? countPages(state.tree) : 0;
            if (cnt && window.TcLanhuTreeCaseStatus && state.docId) {
                var summary = window.TcLanhuTreeCaseStatus.getSummary(state.docId);
                if (summary.designed > 0) {
                    docSubtitleText = summary.designed + ' / ' + cnt + ' 页已设计';
                    countEl.textContent = docSubtitleText;
                    countEl.setAttribute('title', docSubtitleText);
                    countEl.classList.add('tc-lanhu-tree-rail__subtitle--progress');
                } else {
                    docSubtitleText = cnt + ' 个页面';
                    countEl.textContent = docSubtitleText;
                    countEl.setAttribute('title', docSubtitleText);
                    countEl.classList.remove('tc-lanhu-tree-rail__subtitle--progress');
                }
            } else {
                docSubtitleText = cnt ? cnt + ' 个页面' : '';
                countEl.textContent = docSubtitleText;
                if (docSubtitleText) countEl.setAttribute('title', docSubtitleText);
                else countEl.removeAttribute('title');
                countEl.classList.remove('tc-lanhu-tree-rail__subtitle--progress');
            }
        }
        if (titleEl) {
            var titleWrap = titleEl.closest ? titleEl.closest('.tc-lanhu-tree-rail__titles') : null;
            if (titleWrap) {
                titleWrap.removeAttribute('data-lanhu-title-tip');
                titleWrap.setAttribute('aria-label', docTitleText + (docSubtitleText ? '，' + docSubtitleText : ''));
            }
        }
        if (rail) {
            rail.classList.toggle('tc-lanhu-doc-tree-rail--has-data', !!(state.tree && state.tree.length));
            rail.classList.toggle('tc-lanhu-doc-tree-rail--collapsed', !!state.collapsedRail);
        }
        syncRailCollapseChrome();
        if (typeof window.scheduleTcLanhuTreeFillHeight === 'function') {
            window.scheduleTcLanhuTreeFillHeight();
        }

        var query = ($('tc-lanhu-tree-search') || {}).value || '';
        var nodes = filterTree(state.tree, query);
        if (!state.tree || !state.tree.length) {
            mount.innerHTML = '<div class="tc-lanhu-tree-empty">' +
                '<div class="tc-lanhu-tree-empty__icon" aria-hidden="true">🌲</div>' +
                '<p class="tc-lanhu-tree-empty__title">尚未连接蓝湖文档</p>' +
                '<p class="tc-lanhu-tree-empty__desc">配置 Cookie 与文档 URL 后，将在此展示完整页面需求树</p>' +
                '<button type="button" class="tc-lanhu-tree-empty__btn" data-tc-lanhu-tree-connect>连接蓝湖</button>' +
            '</div>';
            return;
        }
        if (!nodes.length) {
            mount.innerHTML = '<div class="tc-lanhu-tree-empty tc-lanhu-tree-empty--filter">' +
                '<p class="tc-lanhu-tree-empty__title">无匹配页面</p>' +
                '<p class="tc-lanhu-tree-empty__desc">尝试调整搜索关键词</p>' +
            '</div>';
            return;
        }
        mount.innerHTML = '<ul class="tc-lanhu-tree-root" role="tree">' + renderTreeNodes(nodes, 0) + '</ul>';
    }

    function openConnectModal() {
        if (typeof window.isTcLanhuTreeHeadActionsBlocked === 'function' && window.isTcLanhuTreeHeadActionsBlocked()) {
            if (typeof window.toastTcLanhuTreeHeadActionsBlocked === 'function') window.toastTcLanhuTreeHeadActionsBlocked();
            return;
        }
        if (typeof window.openTcConnectModal === 'function') {
            window.openTcConnectModal();
            return;
        }
        if (typeof window.ensureTcLanhuAuthOrPrompt === 'function') {
            window.ensureTcLanhuAuthOrPrompt().then(function (ok) {
                if (!ok) return;
                openConnectModalFallback();
            });
            return;
        }
        openConnectModalFallback();
    }

    function openConnectModalFallback() {
        var modal = $('tc-lanhu-tree-connect-modal');
        if (!modal) return;
        var cookieInput = $('tc-lanhu-tree-cookie');
        var urlInput = $('tc-lanhu-tree-url');
        var mainCookie = getMainCookieEl();
        var mainUrl = getMainUrlEl();
        if (cookieInput && mainCookie) cookieInput.value = mainCookie.value || '';
        if (urlInput && mainUrl) urlInput.value = mainUrl.value || '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
        if (cookieInput) cookieInput.focus();
    }

    function closeConnectModal(opts) {
        if (typeof window.closeTcConnectModal === 'function') {
            window.closeTcConnectModal(opts);
            return;
        }
        var modal = $('tc-lanhu-tree-connect-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }

    function fetchLanhuTree(cookie, url) {
        return fetch('/api/lanhu-sitemap-tree', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lanhu_cookie: cookie, lanhu_url: url })
        }).then(function (res) { return res.json(); });
    }

    function applyTreeResult(payload, opts) {
        opts = opts || {};
        var nextDocId = payload.doc_id || '';
        var docChanged = !!(nextDocId && state.docId && nextDocId !== state.docId);
        if (docChanged) {
            state.pageCache = {};
            resetLanhuTreeCaseStatusCache();
        }
        if (nextDocId) state.docId = nextDocId;
        state.tree = payload.tree || [];
        state.docName = opts.docName || payload.doc_name || '蓝湖需求';
        state.focusPageId = payload.focus_page_id || '';
        state.expanded = defaultExpandTree(state.tree, 0, state.expanded || {});
        var baseUrl = opts.lanhuBaseUrl || state.lanhuBaseUrl || '';
        if (!baseUrl) {
            var mainUrlEl = getMainUrlEl();
            baseUrl = mainUrlEl ? stripLanhuBaseUrl(String(mainUrlEl.value || '').trim()) : '';
        }
        if (baseUrl) state.lanhuBaseUrl = baseUrl;
        var prevSelected = docChanged ? '' : (state.selectedId || '');
        if (state.focusPageId) {
            state.selectedId = state.focusPageId;
        } else if (prevSelected && isPageNodeId(prevSelected)) {
            state.selectedId = prevSelected;
        } else if (state.docId && window.TcRequirementCaseStore &&
            typeof window.TcRequirementCaseStore.readLastPage === 'function') {
            var remembered = window.TcRequirementCaseStore.readLastPage(state.docId);
            if (remembered && isPageNodeId(remembered)) state.selectedId = remembered;
        } else {
            state.selectedId = '';
        }
        persistMeta();
        renderTree();
        if (typeof window.setTcInvalidLanhuDocWorkbenchLock === 'function') {
            window.setTcInvalidLanhuDocWorkbenchLock(false);
        }
        setStatus('已加载 ' + (payload.page_count || countPages(state.tree)) + ' 个页面', 'ok');
        loadPageCacheFromServer().finally(function () {
            var loadCases = window.TcLanhuTreeCaseStatus &&
                typeof window.TcLanhuTreeCaseStatus.loadForDoc === 'function' &&
                state.docId
                ? window.TcLanhuTreeCaseStatus.loadForDoc(state.docId)
                : Promise.resolve(false);
            loadCases.finally(function () {
                hydrateRequirementCasesForSelection(state.selectedId);
            });
        });
    }

    /**
     * 仅用于「连接蓝湖文档」确认：优先用户填写名，未填再用蓝湖返回名。
     * 独立方法，避免改动 applyTreeResult / saveCurrentAsDoc 等共用逻辑。
     */
    function resolveConnectDocNamePreferUser(userDocName, lanhuDocName) {
        var userName = String(userDocName || '').trim();
        if (userName) return userName;
        var lanhuName = String(lanhuDocName || '').trim();
        if (lanhuName) return lanhuName;
        return '蓝湖需求';
    }

    function confirmConnect() {
        var cookieInput = $('tc-lanhu-tree-cookie');
        var urlInput = $('tc-lanhu-tree-url');
        var docNameInput = $('tc-lanhu-connect-doc-name');
        var cookie = cookieInput ? String(cookieInput.value || '').trim() : '';
        var url = urlInput ? String(urlInput.value || '').trim() : '';
        var userDocName = docNameInput ? String(docNameInput.value || '').trim() : '';
        if (!cookie) {
            setStatus('请填写蓝湖 Cookie', 'error');
            if (typeof tcAppToast === 'function') tcAppToast('请填写蓝湖 Cookie', { variant: 'warning' });
            return;
        }
        if (!url) {
            setStatus('请填写蓝湖文档 URL', 'error');
            if (typeof tcAppToast === 'function') tcAppToast('请填写蓝湖文档 URL', { variant: 'warning' });
            return;
        }
        if (!isValidLanhuDocUrl(url)) {
            showInvalidLanhuUrlTreeView({ keepDocName: true });
            return;
        }
        if (typeof window.setTcInvalidLanhuDocWorkbenchLock === 'function') {
            window.setTcInvalidLanhuDocWorkbenchLock(false);
        }

        if (typeof window.TcRequirementCaseStore !== 'undefined' &&
            typeof window.TcRequirementCaseStore.persistActivePageBeforeLeave === 'function') {
            window.TcRequirementCaseStore.persistActivePageBeforeLeave('manual_edit', { force: true, allowEmpty: true });
        }
        syncToMainLanhuFields(cookie, url);
        state.loading = true;
        setStatus('正在拉取文档页面树…', 'loading');
        var confirmBtn = $('tc-lanhu-tree-connect-confirm');
        if (confirmBtn) confirmBtn.disabled = true;
        fetchLanhuTree(cookie, url)
            .then(function (data) {
                if (data.error) throw new Error(data.error);
                if (!data.tree || !data.tree.length) throw new Error('文档树为空');
                var resolvedDocName = resolveConnectDocNamePreferUser(userDocName, data && data.doc_name);
                applyTreeResult(data, { lanhuBaseUrl: stripLanhuBaseUrl(url) || url, docName: resolvedDocName });
                if (typeof window.setTcLanhuConnectDocName === 'function') window.setTcLanhuConnectDocName(resolvedDocName);
                if (typeof window.captureTcConnectModalSnapshot === 'function') {
                    window.captureTcConnectModalSnapshot();
                }
                closeConnectModal({ skipRestore: true });
                if (typeof tcAppToast === 'function') {
                    tcAppToast('蓝湖需求树已加载', { variant: 'success', duration: 2200 });
                }
            })
            .catch(function (err) {
                var msg = (err && err.message) ? err.message : '拉取失败';
                setStatus(msg, 'error');
                if (typeof tcAppToast === 'function') tcAppToast(msg, { variant: 'error', duration: 3600 });
            })
            .finally(function () {
                state.loading = false;
                if (confirmBtn) confirmBtn.disabled = false;
            });
    }

    function clearTcLanhuDocTreeView() {

        if (typeof window.TcRequirementCaseStore !== 'undefined' &&
            typeof window.TcRequirementCaseStore.persistActivePageBeforeLeave === 'function') {
            window.TcRequirementCaseStore.persistActivePageBeforeLeave('manual_edit', { force: true, allowEmpty: true });
        }
        state.tree = null;
        state.docName = '';
        state.docId = '';
        state.focusPageId = '';
        state.expanded = {};
        state.selectedId = '';
        state.pageCache = {};
        state.loading = false;
        resetLanhuTreeCaseStatusCache();
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        syncToMainLanhuFields('', '');
        var tc = $('tc-lanhu-tree-cookie');
        var tu = $('tc-lanhu-tree-url');
        if (tc) tc.value = '';
        if (tu) tu.value = '';
        setStatus('', '');
        if (typeof window.setTcInvalidLanhuDocWorkbenchLock === 'function') {
            window.setTcInvalidLanhuDocWorkbenchLock(false);
        }
        renderTree();
    }

    function refreshTreeFromMainFields() {
        var cookieEl = getMainCookieEl();
        var urlEl = getMainUrlEl();
        var cookie = cookieEl ? String(cookieEl.value || '').trim() : '';
        var url = urlEl ? String(urlEl.value || '').trim() : '';
        if (!cookie || !url) {
            if (typeof tcAppToast === 'function') tcAppToast('请先在连接面板填写 Cookie 与 URL', { variant: 'info' });
            openConnectModal();
            return;
        }

        if (typeof window.TcRequirementCaseStore !== 'undefined' &&
            typeof window.TcRequirementCaseStore.persistActivePageBeforeLeave === 'function') {
            window.TcRequirementCaseStore.persistActivePageBeforeLeave('manual_edit', { force: true, allowEmpty: true });
        }

        if (!isValidLanhuDocUrl(url)) {
            showInvalidLanhuUrlTreeView({ keepDocName: true });
            return;
        }
        if (typeof window.setTcInvalidLanhuDocWorkbenchLock === 'function') {
            window.setTcInvalidLanhuDocWorkbenchLock(false);
        }

        state.loading = true;
        setStatus('刷新中…', 'loading');
        var baseUrl = stripLanhuBaseUrl(url) || url;
        syncToMainLanhuFields(cookie, baseUrl);
        fetchLanhuTree(cookie, baseUrl)
            .then(function (data) {
                if (data.error) throw new Error(data.error);
                applyTreeResult(data, { lanhuBaseUrl: baseUrl });
            })
            .catch(function (err) {
                var msg = (err && err.message) || '刷新失败';
                if (msg.indexOf('lanhuapp.com') >= 0 || msg.indexOf('https://lanhuapp.com') >= 0) {
                    showInvalidLanhuUrlTreeView({ keepDocName: true });
                    return;
                }
                setStatus(msg, 'error');
            })
            .finally(function () { state.loading = false; });
    }


    function extractDocIdFromLanhuUrl(url) {
        url = String(url || '').trim();
        if (!url) return '';
        var m = url.match(/[?&](?:docId|image_id)=([^&]+)/i);
        return m ? decodeURIComponent(m[1]) : '';
    }

    function resolveLanhuCredsForTree() {
        var tc = $('tc-lanhu-tree-cookie');
        var tu = $('tc-lanhu-tree-url');
        var cookie = tc ? String(tc.value || '').trim() : '';
        var url = '';
        if (state.tree && state.tree.length && state.lanhuBaseUrl) {
            url = state.lanhuBaseUrl;
        } else if (tu && String(tu.value || '').trim()) {
            url = String(tu.value || '').trim();
        } else {
            var urlEl = getMainUrlEl();
            url = urlEl ? String(urlEl.value || '').trim() : '';
        }
        if (!cookie) {
            var cookieEl = getMainCookieEl();
            cookie = cookieEl ? String(cookieEl.value || '').trim() : '';
        }
        url = stripLanhuBaseUrl(url) || url;
        if (state.docId && url) {
            var urlDocId = extractDocIdFromLanhuUrl(url);
            if (urlDocId && urlDocId !== state.docId) {
                if (typeof window.getTcLanhuSavedDocUrlForTreeDocId === 'function') {
                    var saved = window.getTcLanhuSavedDocUrlForTreeDocId(state.docId);
                    if (saved) url = stripLanhuBaseUrl(saved) || saved;
                }
            }
        }
        return { cookie: cookie, url: url };
    }

    function buildTcLanhuPageUrl(baseUrl, pageId) {
        if (!baseUrl || !pageId) return baseUrl || '';
        var url = String(baseUrl).trim();
        if (/[?&]pageId=/.test(url)) {
            return url.replace(/([?&]pageId=)[^&]*/, '$1' + encodeURIComponent(pageId));
        }
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'pageId=' + encodeURIComponent(pageId);
    }

    function fetchPageContent(pageId, pageName) {
        if (!findPageNode(pageId)) {
            var missingMsg = '当前文档树中未找到该页面，请先点击顶部刷新文档树或重新连接蓝湖文档';
            return Promise.resolve({ page_text_chars: 0, page_text: '', error: missingMsg });
        }
        var creds = resolveLanhuCredsForTree();
        var cookie = creds.cookie;
        var url = creds.url;
        if (!cookie || !url) {
            return Promise.resolve({ page_text_chars: 0, page_text: '', error: '请先在连接面板填写蓝湖 Cookie 与 URL' });
        }
        var pageUrl = buildTcLanhuPageUrl(url, pageId);
        syncToMainLanhuFields(cookie, pageUrl);
        state.pageCache[pageId] = { loading: true, chars: null, text: '', error: null };
        persistMeta();
        renderTree();
        return fetch('/api/lanhu-page-chars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                lanhu_cookie: cookie,
                lanhu_url: url,
                page_id: pageId,
                doc_id: state.docId || '',
                page_name: pageName || findPageNodeName(pageId)
            })
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) {
                    state.pageCache[pageId] = { chars: 0, text: '', error: data.error };
                } else {
                    var ch = parseInt(data.page_text_chars, 10) || 0;
                    state.pageCache[pageId] = {
                        chars: ch,
                        text: data.page_text || '',
                        error: null
                    };
                }
                persistMeta();
                renderTree();
                return data;
            })
            .catch(function (err) {
                var errMsg = (err && err.message) ? err.message : '获取失败';
                state.pageCache[pageId] = { chars: 0, text: '', error: errMsg };
                persistMeta();
                renderTree();
                return { page_text_chars: 0, page_text: '', error: errMsg };
            });
    }

    function refreshSinglePage(pageId) {
        fetchPageContent(pageId).then(function (data) {
            if (data && data.error && typeof tcAppToast === 'function') {
                tcAppToast(data.error, { variant: 'error' });
            }
        });
    }


    /** 点击文件夹行时展开/收起（与页面选中、toggle 按钮逻辑隔离） */
    function tryToggleLanhuFolderExpandOnRowClick(nodeId, treeType) {
        if (treeType === 'page' || !nodeId) return false;
        var node = findPageNode(nodeId);
        if (!node || !node.children || !node.children.length) return false;
        state.expanded[nodeId] = !state.expanded[nodeId];
        persistMeta();
        renderTree();
        return true;
    }


    /** 左侧树切换需求页：仅当该页已有用例时，表格区展示 loading；无用例保持「选择模板」逻辑 */
    function buildLanhuTreePageSwitchOpts(hasDesignedCases) {
        return hasDesignedCases ? { showTableLoading: true } : undefined;
    }

    function onTreeClick(ev) {
        var refreshBtn = ev.target.closest('[data-tree-refresh]');
        if (refreshBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var pid = refreshBtn.getAttribute('data-tree-refresh');
            if (pid) refreshSinglePage(pid);
            return;
        }
        var toggle = ev.target.closest('[data-tree-toggle]');
        if (toggle) {
            ev.preventDefault();
            ev.stopPropagation();
            var tid = toggle.getAttribute('data-tree-toggle');
            if (!tid) return;
            state.expanded[tid] = !state.expanded[tid];
            persistMeta();
            renderTree();
            return;
        }
        var selectRow = ev.target.closest('[data-tree-select]');
        if (!selectRow) return;
        var sid = selectRow.getAttribute('data-tree-select');
        if (!sid) return;
        var selLi = selectRow.closest('li[data-tree-type]');
        var treeType = selLi ? (selLi.getAttribute('data-tree-type') || '') : '';
        var isPageNode = treeType === 'page';
        if (!isPageNode && tryToggleLanhuFolderExpandOnRowClick(sid, treeType)) {
            return;
        }
        if (isPageNode && sid !== state.selectedId &&
            typeof window.isTcQualityCheckLanhuNavBlocked === 'function' &&
            window.isTcQualityCheckLanhuNavBlocked()) {
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof window.toastTcQualityCheckNavBlocked === 'function') {
                window.toastTcQualityCheckNavBlocked();
            }
            return;
        }
        if (isPageNode && sid !== state.selectedId &&
            typeof window.isTcLanhuRequirementPageSwitchBlocked === 'function' &&
            window.isTcLanhuRequirementPageSwitchBlocked()) {
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof window.toastTcLanhuRequirementPageSwitchBlocked === 'function') {
                window.toastTcLanhuRequirementPageSwitchBlocked();
            }
            return;
        }
        var prevSelected = state.selectedId;
        if (isPageNode && sid === prevSelected) {
            var storeRef = window.TcRequirementCaseStore;
            var displayedForPage = storeRef &&
                typeof storeRef.isDisplayedCasesForPage === 'function' &&
                storeRef.isDisplayedCasesForPage(sid);
            if (displayedForPage) return;
        }
        state.selectedId = sid;
        persistMeta();
        renderTree();
        if (isPageNode &&
            window.TcRequirementCaseStore &&
            typeof window.TcRequirementCaseStore.onPageSelected === 'function') {
            var hasDesignedCases = lanhuTreeTargetPageHasDesignedCases(sid, selectRow);
            var nodeLi = document.querySelector('[data-tree-id="' + sid.replace(/"/g, '\\"') + '"]');
            if (hasDesignedCases && nodeLi) {
                nodeLi.classList.add('tc-lanhu-tree-node--loading');
            }
            var pageSwOpts = buildLanhuTreePageSwitchOpts(hasDesignedCases);
            var promise = window.TcRequirementCaseStore.onPageSelected(sid, findPageNodeName(sid), pageSwOpts);
            if (promise && typeof promise.then === 'function') {
                var done = function () {
                    if (nodeLi) nodeLi.classList.remove('tc-lanhu-tree-node--loading');
                };
                promise.then(done, done);
            }
        }
    }

    function findPageNode(pageId) {
        var found = null;
        function walk(nodes) {
            (nodes || []).forEach(function (node) {
                if (found || !node) return;
                if (node.id === pageId) {
                    found = node;
                    return;
                }
                walk(node.children);
            });
        }
        walk(state.tree);
        return found;
    }

    function isPageNodeId(pageId) {
        var node = findPageNode(pageId);
        return !!(node && node.type === 'page');
    }

    function finishTcTableBootAfterHydrate() {
        if (typeof window.finishTcTableBootHydrate === 'function') {
            window.finishTcTableBootHydrate();
        }
    }


    function resolveLanhuBaseUrlForTreeHydrate() {
        var urlEl = getMainUrlEl();
        var url = urlEl ? String(urlEl.value || '').trim() : '';
        if (url) return stripLanhuBaseUrl(url) || url;
        if (state.lanhuBaseUrl) return state.lanhuBaseUrl;
        if (window.TcWorkbenchSession &&
            typeof window.TcWorkbenchSession.getCurrentLanhuUrlForGen === 'function') {
            url = window.TcWorkbenchSession.getCurrentLanhuUrlForGen();
            if (url) return stripLanhuBaseUrl(url) || url;
        }
        if (typeof window.getTcLanhuSavedDocUrlForTreeDocId === 'function' && state.docId) {
            url = window.getTcLanhuSavedDocUrlForTreeDocId(state.docId);
            if (url) return url;
        }
        return '';
    }

    function hydrateRequirementCasesForSelection(pageId, pageName) {
        pageId = pageId || state.selectedId;
        if (!pageId || !isPageNodeId(pageId)) return Promise.resolve(false);
        pageName = pageName || findPageNodeName(pageId);
        var baseUrl = resolveLanhuBaseUrlForTreeHydrate();
        var swOpts = {};
        if (baseUrl) swOpts.lanhu_url = baseUrl;
        if (lanhuTreeTargetPageHasDesignedCases(pageId)) swOpts.showTableLoading = true;
        if (window.TcRequirementCaseStore &&
            typeof window.TcRequirementCaseStore.hydrateSelectedPageCases === 'function') {
            return Promise.resolve(window.TcRequirementCaseStore.hydrateSelectedPageCases(pageId, pageName, swOpts));
        }
        if (window.TcRequirementCaseStore &&
            typeof window.TcRequirementCaseStore.onPageSelected === 'function') {
            return Promise.resolve(window.TcRequirementCaseStore.onPageSelected(pageId, pageName, swOpts));
        }
        return Promise.resolve(false);
    }

    function consumeLogoutTreeClearBeforeRestore() {
        try {
            if (sessionStorage.getItem(LOGOUT_TREE_CLEAR_FLAG) !== '1') return false;
            sessionStorage.removeItem(LOGOUT_TREE_CLEAR_FLAG);
        } catch (e) {
            return false;
        }
        state.tree = null;
        state.docName = '';
        state.docId = '';
        state.focusPageId = '';
        state.expanded = {};
        state.selectedId = '';
        state.pageCache = {};
        state.loading = false;
        resetLanhuTreeCaseStatusCache();
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        syncToMainLanhuFields('', '');
        var tc = $('tc-lanhu-tree-cookie');
        var tu = $('tc-lanhu-tree-url');
        if (tc) tc.value = '';
        if (tu) tu.value = '';
        setStatus('', '');
        return true;
    }

    function restoreFromStorage() {
        if (consumeLogoutTreeClearBeforeRestore()) {
            finishTcTableBootAfterHydrate();
            return;
        }
        var meta = readStoredMeta();
        if (!meta || !meta.tree) {
            finishTcTableBootAfterHydrate();
            return;
        }
        if (typeof window.beginTcTableBootHydrate === 'function') {
            window.beginTcTableBootHydrate();
        }
        state.tree = meta.tree;
        state.docName = meta.docName || '';
        state.docId = meta.docId || '';
        state.focusPageId = meta.focusPageId || '';
        state.expanded = meta.expanded || defaultExpandTree(meta.tree, 0, {});
        state.selectedId = meta.selectedId || '';
        state.pageCache = meta.pageCache || {};
        state.lanhuBaseUrl = meta.lanhuBaseUrl || '';
        renderTree();
        if (state.tree.length) setStatus('已恢复上次文档树（会话内）', 'ok');
        loadPageCacheFromServer().finally(function () {
            var loadCases = window.TcLanhuTreeCaseStatus &&
                typeof window.TcLanhuTreeCaseStatus.loadForDoc === 'function' &&
                state.docId
                ? window.TcLanhuTreeCaseStatus.loadForDoc(state.docId)
                : Promise.resolve(false);
            loadCases.finally(function () {
                Promise.resolve(hydrateRequirementCasesForSelection(state.selectedId))
                    .finally(finishTcTableBootAfterHydrate);
            });
        });
    }

    function bindEvents() {
        var rail = $('tc-lanhu-doc-tree-rail');
        if (!rail || rail.dataset.tcLanhuTreeBound === '1') return;
        rail.dataset.tcLanhuTreeBound = '1';

        var connectBtn = $('tc-lanhu-tree-connect-btn');
        var refreshBtn = $('tc-lanhu-tree-refresh-btn');
        var collapseBtn = $('tc-lanhu-tree-rail-collapse');
        var searchInput = $('tc-lanhu-tree-search');
        var mount = $('tc-lanhu-tree-mount');
        var modal = $('tc-lanhu-tree-connect-modal');
        var cancelBtn = $('tc-lanhu-connect-cancel-btn') || $('tc-lanhu-tree-connect-cancel');
        var confirmBtn = $('tc-lanhu-tree-connect-confirm');

        if (connectBtn) connectBtn.addEventListener('click', openConnectModal);
        if (refreshBtn) refreshBtn.addEventListener('click', refreshTreeFromMainFields);
        if (collapseBtn) {
            collapseBtn.addEventListener('click', function () {
                state.collapsedRail = !state.collapsedRail;
                renderTree();
            });
        }
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                window.requestAnimationFrame(renderTree);
            });
        }
        if (mount) mount.addEventListener('click', onTreeClick);
        if (cancelBtn) cancelBtn.addEventListener('click', closeConnectModal);
        if (confirmBtn) confirmBtn.addEventListener('click', confirmConnect);
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeConnectModal();
            });
        }
        document.addEventListener('click', function (e) {
            if (e.target.closest('[data-tc-lanhu-tree-connect]')) {
                e.preventDefault();
                openConnectModal();
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal && modal.classList.contains('flex')) closeConnectModal();
        });
    }

    function initTcLanhuDocTree() {
        if (!document.querySelector('.tc-workbench-scope')) return;
        bindEvents();
        restoreFromStorage();
        renderTree();
    }

    window._tcLanhuDocTreeRerender = renderTree;

    function retryTcLanhuTreeHydrateIfNeeded() {
        if (!state.selectedId || !isPageNodeId(state.selectedId)) return;
        var storeRef = window.TcRequirementCaseStore;
        if (storeRef && typeof storeRef.isDisplayedCasesForPage === 'function' &&
            storeRef.isDisplayedCasesForPage(state.selectedId)) {
            return;
        }
        hydrateRequirementCasesForSelection(state.selectedId);
    }

    window.retryTcLanhuTreeHydrateIfNeeded = retryTcLanhuTreeHydrateIfNeeded;
    window.initTcLanhuDocTree = initTcLanhuDocTree;
    window.refreshTcLanhuDocTree = refreshTreeFromMainFields;
    window.clearTcLanhuDocTreeView = clearTcLanhuDocTreeView;
    window.tcLanhuDocTreeConfirmConnect = confirmConnect;
    window.fetchTcLanhuPageForGen = fetchPageContent;
    window.buildTcLanhuPageUrl = buildTcLanhuPageUrl;
    window.getTcLanhuPageCacheEntry = function (pageId) {
        return state.pageCache[pageId] || null;
    };
    window.findTcLanhuPageNodePath = findPageNodePath;
    window.getTcLanhuDocTreeMeta = function () {
        return {
            docId: state.docId,
            docName: state.docName,
            focusPageId: state.focusPageId,
            selectedId: state.selectedId,
            selectedPageName: findPageNodeName(state.selectedId),
            selectedPagePath: findPageNodePath(state.selectedId)
        };
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTcLanhuDocTree);
    } else {
        initTcLanhuDocTree();
    }
})();

/* ---- tc_lanhu_tree_layout.js ---- */
/**
 * 蓝湖需求树 + 右侧用例区：仅在工作台卡片内铺满视口（不改动 body/main 布局）
 */
(function tcLanhuTreeLayoutModule() {
    'use strict';

    var MIN_GRID_H = 360;
    var resizeTimer = null;

    function getWorkbenchScope() {
        return document.querySelector('.tc-workbench-scope:has(#main-grid.tc-main-grid--with-lanhu-tree)');
    }

    function notifyWorkbenchResize() {
        window.requestAnimationFrame(function () {
            if (window.tcVxeTableApi && typeof window.tcVxeTableApi.recalculate === 'function') {
                try { window.tcVxeTableApi.recalculate(); } catch (e) { /* ignore */ }
            }
            if (typeof tcMindmapInstance !== 'undefined' && tcMindmapInstance && typeof tcMindmapInstance.resize === 'function') {
                try { tcMindmapInstance.resize(); } catch (e) { /* ignore */ }
            }
            if (typeof tcMindmapFitToView === 'function' && typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap') {
                try { tcMindmapFitToView(); } catch (e) { /* ignore */ }
            }
        });
    }

    function syncTcLanhuTreeFillHeight() {
        var scope = getWorkbenchScope();
        if (!scope) return;
        var top = scope.getBoundingClientRect().top;
        var avail = Math.floor(window.innerHeight - top - 14);
        if (avail < MIN_GRID_H) avail = MIN_GRID_H;
        scope.classList.add('tc-workbench-scope--lanhu-fill');
        scope.style.setProperty('--tc-wb-grid-h', avail + 'px');
        document.body.classList.remove('tc-lanhu-tree-fill-active');
        notifyWorkbenchResize();
    }

    function scheduleSync() {
        if (resizeTimer) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(syncTcLanhuTreeFillHeight, 80);
    }

    function bindTcLanhuTreeLayout() {
        if (!getWorkbenchScope() || window._tcLanhuTreeLayoutBound) return;
        window._tcLanhuTreeLayoutBound = true;
        syncTcLanhuTreeFillHeight();
        [120, 400].forEach(function (ms) {
            window.setTimeout(syncTcLanhuTreeFillHeight, ms);
        });
        window.addEventListener('resize', scheduleSync, { passive: true });
        window.addEventListener('orientationchange', scheduleSync, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            var scope = getWorkbenchScope();
            var ro = new ResizeObserver(scheduleSync);
            if (scope) ro.observe(scope);
        }
    }

    window.syncTcLanhuTreeFillHeight = syncTcLanhuTreeFillHeight;
    window.scheduleTcLanhuTreeFillHeight = scheduleSync;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindTcLanhuTreeLayout);
    } else {
        bindTcLanhuTreeLayout();
    }
})();

