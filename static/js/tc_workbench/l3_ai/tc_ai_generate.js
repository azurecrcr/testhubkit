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

