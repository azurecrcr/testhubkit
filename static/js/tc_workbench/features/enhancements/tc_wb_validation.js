    /* ---------- ???????? ---------- */
    var VALIDATE_STEP_META = {
        structure: { index: 1, label: '?? / ?????, running: '???????????? },
        required: { index: 2, label: '???????, running: '?????????????? },
        llm: { index: 3, label: 'AI ?????, running: '??????????????? }
    };
    var VALIDATE_STEP_ORDER = ['structure', 'required', 'llm'];
    var MINDMAP_VALIDATE_STEP_ORDER = ['structure', 'llm'];
    var MINDMAP_VALIDATE_STEP_META = {
        structure: { index: 1, label: '?????, running: '????????????????? },
        llm: { index: 2, label: 'AI ?????, running: '??????????????? }
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
            global.TcGenStageUi.showQualityCheck({ meta: detail || '????? });
        }
    }

    function restoreQcTableAreaAfterAbort() {
        /** ??/????????????????????????*/
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
                ? 'AI ????'
                : (formatLlmSkippedMessage(stored) || 'AI ??????);
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
            ? ('????' + totalIssues + ' ?????????????)
            : '??????';
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
            if (!detail && st.status === 'pending') detail = '?????;
            if (!detail && st.status === 'running') detail = meta.running;
            if (!detail && st.status === 'skipped') detail = '????;
            if (!detail && st.status === 'done') detail = '????';
            if (!detail && st.status === 'error') detail = '?????;
            if (!detail && st.status === 'timeout') detail = 'AI ????';
            lines.push('[' + meta.index + '/' + reportTotal + '] ' + meta.label + '?? + detail);
        });
        if (result) {
            lines.push('');
            lines.push('--- ?????---');
            var allIssues = (result.issues || []).slice(0, 25);
            if (allIssues.length) {
                allIssues.forEach(function (issue, i) {
                    var rowNo = issue.row_index != null ? ('??' + (issue.row_index + 1) + ' ??) : '';
                    lines.push((i + 1) + '. [' + (issue.type || 'issue') + '] ' + rowNo + ' ' + String(issue.message || '').trim());
                });
                if ((result.issues || []).length > allIssues.length) {
                    lines.push('???? ' + ((result.issues || []).length - allIssues.length) + ' ???????????);
                }
            } else if (result.llm_skipped) {
                lines.push(formatLlmSkippedMessage(result) || '?????????? AI ?????);
            } else {
                lines.push('????????);
            }
            var gapCount = result.gap_count || 0;
            var overCount = result.over_generated_count || 0;
            if (gapCount || overCount) {
                lines.push('');
                if (gapCount) lines.push('???? ' + gapCount + ' ??);
                if (overCount) lines.push('?????? ' + overCount + ' ??);
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
            subDetail: lineDetail || meta.running || '???????,
            subSkipReason: extra.skipReason || '',
            detail: meta.label + ' · ' + (lineDetail || meta.running || '???????)
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
        if (!finishDetail) finishDetail = '???????;
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
            return { badge: '??', caption: 'AI ???????????????? };
        }
        var hasError = order.some(function (id) {
            return !!(prog.steps[id] && prog.steps[id].status === 'error');
        });
        if (hasError) {
            return { badge: '??', caption: 'AI ???????????????? };
        }
        if (prog._finishing) {
            return { badge: '??', caption: '??????????????? };
        }
        var activeId = null;
        order.forEach(function (id) {
            if (prog.steps[id] && prog.steps[id].status === 'running') activeId = id;
        });
        var finished = order.every(function (id) {
            return isValidateStepSettledStatus(prog.steps[id] && prog.steps[id].status);
        });
        if (finished) {
            return { badge: '??', caption: '??????????????? };
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
        return { badge: Math.min(nextIdx, total) + '/' + total, caption: '????????? };
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

    /** ?????/ ???? / ??????????????????/ ?? / ???? / ?? FAB / ???? FAB */
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

    /** ?????????????????????????????? */
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
        /* ??????????? isCaseGenerationInteractionBusy??????????????????*/
        return false;
    }

    function isQcWorkbenchInteractionBusy() {
        if (isCoverageFillInteractionBusy()) return true;
        if (isQcOnlyInteractionBusy()) return true;
        if (isCaseGenerationInteractionBusy()) return true;
        return false;
    }

    function getQcWorkbenchInteractionLockTitle() {
        if (isCoverageFillInteractionBusy()) return '??????????????;
        if (isQcOnlyInteractionBusy()) return '?????????????';
        if (isCaseGenerationInteractionBusy()) return '??????????????;
        return '????????????;
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

        /* ????? chrome ????????????????*/
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
        detail = String(detail || '?????????).trim();
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
        openQualityStageBar(scope, '??????????);
        syncWorkbenchBusyChrome();
                if (shouldSyncValidateToGenChat(scope)) {
            if (global.TcGenChatPipeline &&
                typeof global.TcGenChatPipeline.captureQualityCheckEnabled === 'function') {
                global.TcGenChatPipeline.captureQualityCheckEnabled();
            }
            syncGenChatQualityCheck({
                begin: true,
                detail: '??????????,
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
        if (headline.badge === '??') return '???????;
        if (headline.badge === '??') return '???????;
        if (headline.badge === '??') return '???????;
        var runningId = getValidateStepOrder(prog).filter(function (id) {
            return prog.steps[id] && prog.steps[id].status === 'running';
        })[0];
        var runningMeta = getValidateStepMeta(runningId, prog) || getValidateStepMeta('structure', prog);
        return '?????' + headline.badge + ' · ' + (runningMeta ? runningMeta.label : '?????);
    }

    function buildValidateStepIconHtml(st, meta) {
        if (st.status === 'running') {
            return '<span class="tc-validate-step__spinner" aria-hidden="true"></span>';
        }
        if (st.status === 'done') {
            return '<span class="tc-validate-step__icon tc-validate-step__icon--done" aria-hidden="true">??/span>';
        }
        if (st.status === 'error') {
            return '<span class="tc-validate-step__icon tc-validate-step__icon--error" aria-hidden="true">!</span>';
        }
        if (st.status === 'timeout') {
            return '<span class="tc-validate-step__icon tc-validate-step__icon--timeout" aria-hidden="true" title="??">??/span>';
        }
        if (st.status === 'skipped') {
            return '<span class="tc-validate-step__icon tc-validate-step__icon--skip" aria-hidden="true">??/span>';
        }
        return '<span class="tc-validate-step__icon tc-validate-step__icon--pending" aria-hidden="true">' + meta.index + '</span>';
    }

    function getValidateStepDisplayDetail(st, meta) {
        var stepText = st.detail;
        if (!stepText && st.status === 'running') stepText = meta.running;
        if (!stepText && st.status === 'pending') stepText = '?????;
        return stepText || '';
    }

    function clearValidationProgressShell(scope) {
        var list = vEl('tc-validate-issue-list', scope);
        if (!list) return;
        list.innerHTML = '';
    }

    /** ???????UI?????????DOM ???? loader ????reasoning ???????*/
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
                html += '<div class="tc-validate-step__reasoning-label">AI ???/div>';
                html += '<pre class="tc-validate-step__reasoning" data-tc-validate-llm-reasoning="1"></pre>';
                html += '</div>';
                html += '<div class="tc-validate-step__timeout-panel hidden" data-tc-validate-llm-timeout-panel="1" role="status">';
                html += '<p class="tc-validate-step__timeout-title">??????????</p>';
                html += '<p class="tc-validate-step__timeout-desc">????????AI ?????????????????????????/p>';
                html += '</div>';
            }
            html += '</div>';
        });
        html += '</div></div>';
        list.innerHTML = html;
        return true;
    }

    /** ???????UI??????chrome?summary / loader ?? / ?????????????????*/
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
        root.classList.toggle('tc-validate-progress--failed', headline.badge === '??');
        root.classList.toggle('tc-validate-progress--timeout', headline.badge === '??');
        root.classList.toggle('tc-validate-progress--done', headline.badge === '??');
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
        /* QC ???????????????????patch ???? */
        var vData = vScopeData(scope);
        if (vData && vData.qcReasoningStream) {
            qcReasoningStreamPaintDom(scope);
            return;
        }
        patchValidationReasoningDom(scope);
    }

    /** ?????reasoning ???????gen_batch ???? patch ????????? chrome???*/
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

    /** ?????AI ?????????????????????????????*/
    function isQcReasoningScrollNearBottom(pre, threshold) {
        if (!pre) return true;
        threshold = threshold != null ? threshold : 24;
        if (pre.scrollHeight <= pre.clientHeight) return true;
        return (pre.scrollHeight - pre.clientHeight - pre.scrollTop) <= threshold;
    }

    /** ?? reasoning ?????? patch AI ?????????progress ????????????*/
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
            cursorEl.textContent = '??;
            pre.appendChild(cursorEl);
        }
        if (stickToBottom && pre.scrollHeight > pre.clientHeight) {
            pre.scrollTop = pre.scrollHeight;
        }
        return true;
    }

    /* ---------- QC ??????????????????????????????????Firefox too much recursion??---------- */
    var QC_REASONING_PAINT_MS = 120;
    var QC_REASONING_APPEND_CHUNK = 512;
    var QC_REASONING_PAINT_BUDGET = 1024;

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
                genChatSyncedLen: 0
            };
        }
        return vData.qcReasoningStream;
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
                cursor.textContent = '??;
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
        try {
            if (typeof global.TcGenChatPipeline.appendValidateReasoningContent === 'function') {
                global.TcGenChatPipeline.appendValidateReasoningContent(delta);
            }
        } catch (eSync) { /* GenChat ????????QC ?? */ }
    }

    /** ??????????????????pre??????textContent ??????????*/
    function qcReasoningStreamPaintDom(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        var st = ensureQcReasoningStreamState(scope);
        var list = vEl('tc-validate-issue-list', scope);
        var prog = vData.validateProgress;
        if (!list || !prog) return false;
        var wrap = list.querySelector('[data-tc-validate-llm-reasoning-wrap="1"]');
        var pre = list.querySelector('pre[data-tc-validate-llm-reasoning="1"]');
        if (!pre) return false;
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
        /* DOM ???? paintedLen ???????????????????? */
        try {
            var shownLen = qcReasoningStreamReadShownText(pre).length;
            if (shownLen !== st.paintedLen) st.paintedLen = shownLen;
        } catch (eProbe) { /* ignore */ }
        if (!delta && full.length > st.paintedLen) {
            delta = full.slice(st.paintedLen);
        }
        if (!delta && full.length < st.paintedLen) {
            /* ?????????????????????Firefox too much recursion??*/
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
            /* ??????????pending?????????????????QC ???? */
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
        }, QC_REASONING_PAINT_MS);
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

    /** ??????????????????????appendValidateLlmReasoning??*/
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
     * ???????????????
     * ????????????????????????????????????????????
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
            /* ???????????????? textContent='' ??????Firefox too much recursion??*/
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

    /** ???????done ??????????????????????*/
    function qcReasoningStreamApplyDoneReasoning(scope, text) {
        scope = normalizeValidateScope(scope);
        try {
            if (text) qcReasoningStreamSet(scope, text);
            else qcReasoningStreamFlush(scope);
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
        } catch (eFlush) { /* ???????????????*/ }
        setValidationProgressStep('llm', status, detail, scope, extra);
    }

    /** ??????????? ????????AI ??????????????????? */
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
            detail || 'AI ????',
            scope,
            { skipReason: LLM_SKIP_REASON.TIMEOUT }
        );
        restoreQcTableAreaAfterAbort();
        /* ?????????????????????*/
        var summary = vEl('tc-validate-drawer-summary', scope);
        if (summary) {
            summary.textContent = 'AI ????????????';
        }
    }

    /** ???????AI ?????? ????????????????????? */
    function finishQcLlmStepUiErrored(scope, detail) {
        scope = normalizeValidateScope(scope);
        try {
            qcReasoningStreamFlush(scope);
        } catch (eFlush) { /* ignore */ }
        setValidationProgressStep(
            'llm',
            'error',
            detail || 'AI ????',
            scope,
            { skipReason: LLM_SKIP_REASON.ERROR }
        );
        restoreQcTableAreaAfterAbort();
        var summary = vEl('tc-validate-drawer-summary', scope);
        if (summary) {
            summary.textContent = 'AI ????????????';
        }
    }

    function isQcLlmAbortTimeout(err) {
        if (err && err.name === 'AbortError') return true;
        var msg = String((err && err.message) || '');
        return /??|timeout/i.test(msg);
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
                    failPendingGenChatQualityCheck('?????????????');
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
    /** ????????????????????????????*/
    var validateSingleSideUserResized = false;

    /** ????????????????????/??????????????????? */
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

    /** ????/??????????????????*/
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

    /** ???????????+ transform ???????? left/top?????? */
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

    /** ???????????????????????/??????????????????offset??*/
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

    /** ??????????????????????????????????????? */
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

    /** ?????????????????????????tcLeftFloatComputeResize??*/
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
     * ?????????· ????????
     * ????/?????????????????????????????
     */
    function syncValidateSingleSideCoverageFitLayout(scope) {
        scope = normalizeValidateScope(scope);
        if (!isValidateSingleSideDrawer(scope)) return;
        var drawer = getValidatePanel(scope);
        if (!drawer || !isValidateSingleSideDrawerEl(drawer)) return;
        if (!drawer.classList.contains('tc-validate-drawer--open')) return;
        if (!drawer.classList.contains('tc-validate-drawer--coverage')) return;
        // ?????????????????auto-fit ????????????pinned
        if (validateSingleSidePinnedLayout) {
            restoreValidateSingleSidePinnedLayoutForReopen();
        } else {
            captureValidateSingleSidePinnedLayout(validateSingleSideState);
        }
        applyValidateSingleSideLayout();
        syncValidateSingleSideCoverageOverflowClass(drawer);
    }

    /** ?????????????????????????? */
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
            /* ?????????? */
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
        /* ???? clean-pass????????????????? */
        drawer.classList.remove('tc-validate-drawer--clean-pass');
        if (validateSingleCloseTimer) global.clearTimeout(validateSingleCloseTimer);
        validateSingleCloseTimer = global.setTimeout(function () {
            validateSingleCloseTimer = null;
            if (drawer.classList.contains('tc-validate-drawer--open')) return;
            clearValidateDrawerCleanPassChromeOnClose(VALIDATE_SCOPE_SINGLE);
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

    /** ?????????????????????????initTcLeftFloatResize??*/
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

    /** ???????????????????transform????right/bottom ??left/top ?????? */
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

    /** ?????????????????????????????*/
    function isValidateViewingLatestSessionTurn(scope) {
        scope = normalizeValidateScope(scope);
        var latestId = getLatestSessionTurnId(scope);
        if (!latestId) return true;
        var viewingId = resolveViewingTurnIdForValidation(scope);
        if (!viewingId) return true;
        return viewingId === latestId;
    }

    /** ??/????????? currentTurnId?????? QC ??????turn */
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
        if (!turnId) return Promise.reject(new Error('?? turnId'));
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
                        global.showToast('????????????, 'info');
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
                    global.showToast('??????????????????????, 'warning');
                }
                return;
            }
            if (typeof global.showToast === 'function') {
                global.showToast((err && err.message) || '???????????, 'warning');
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
                global.showToast('?????????, 'info');
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
        var parts = ['?????? ' + result.coverage_rate + '%'];
        if (result.coverage_uncovered != null) parts.push('????' + result.coverage_uncovered);
        if (result.coverage_partial != null) parts.push('???? ' + result.coverage_partial);
        return parts.join(' · ');
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
                ? '?? ' + fmt + ' ??· AI ?????
                : '????? · AI ??????1?? ?????;
        } else if (stored.llm_skipped) {
            // ??/??/????????????????????????????
            text = formatLlmSkippedMessage(stored) || '?????????? AI ????;
        } else if (counts.total > 0) {
            var summaryParts = [];
            if (issues.length || fmt) summaryParts.push('??/?? ' + (issues.length || fmt) + ' ??);
            if (overCount) summaryParts.push('AI ?? ' + overCount + ' ??);
            if (gapCount) summaryParts.push('???? ' + gapCount + ' ??);
            text = '???? ' + counts.total + ' ??' + summaryParts.join(' · ') + '??;
        } else {
            text = '??????????;
        }
        /* ??????????????????????????????????*/
        if (validationResultIsCleanPass(stored)) {
            return text;
        }
        var covLine = formatPostFillCoverageLine(stored);
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
     * ??/???????? type???????
     * ????partition/normalize ?????????hallucination???????????
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

    /** ????????????count / issues ?????????????? */
    function getValidationProblemCounts(stored) {
        stored = stored || {};
        var formatIssues = stored.issues || [];
        var gapIssues = stored.gap_issues || [];
        var overIssues = stored.over_generated_issues || [];
        var format = stored.format_count != null ? Number(stored.format_count) || 0 : formatIssues.length;
        var gap = stored.gap_count != null ? Number(stored.gap_count) || 0 : gapIssues.length;
        var over = stored.over_generated_count != null ? Number(stored.over_generated_count) || 0 : overIssues.length;
        /* ???????????? count=0 ??????*/
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

    /** ??????????????????????????????locate??*/
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
     * ????????????????????????????????
     * - ??????????????????????
     * - ?????????????????row_index????????????????
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

        /* ???????????????? */
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
                    /* ???????????????????? 1 ?????? */
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
            /* ?????????? */
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

    /** ???????????????????????????????????????*/
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
            var btnLabel = (locateLabel || '????) + ' ' + rowNo;
            html += '<button type="button" class="tc-validate-locate btn btn-secondary btn-sm" data-row="' +
                issue.row_index + '" title="???? ' + rowNo + ' ??>' + esc(btnLabel) + '</button>';
            html += '<button type="button" class="tc-issues-delete-over-one btn btn-secondary btn-sm" data-row="' +
                issue.row_index + '" title="??????????>??</button>';
        } else if (issue && (issue.row_index == null || issue.row_index === '')) {
            html += '<span class="tc-validate-issue__gone">??????/span>';
        }
        html += '</span>';
        return html;
    }

    /**
     * ???????????????????? TcIssueMatrix.deleteOverGeneratedFromIssueList??
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
        var locateLabel = isValidateMindmapBatch(vScopeData(scope).batchSnapshot) ? '????' : '????;
        var html = '<section class="tc-validate-group tc-validate-group--over">' +
            '<div class="tc-validate-group__head">' +
            '<h4 class="tc-validate-group__title">????</h4>' +
            '<span class="tc-validate-group__hint">?????</span>' +
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
     * ????????????????????????????????
     */

    /**
     * ????????????????????/?? AI/????????????????
     */
    function renderValidateNoIssueStatusHtml(stored, passParts, passMod) {
        stored = stored || {};
        passParts = passParts || buildValidatePassEmptyParts(stored);
        var title = passParts.title || '????????;
        var detail = passParts.detail || '';
        /* ?? AI ???????????????????????*/
        if (stored.llm_skipped &&
            stored.llm_skip_reason !== LLM_SKIP_REASON.TIMEOUT &&
            stored.llm_skip_reason !== LLM_SKIP_REASON.ERROR) {
            title = '???????';
            detail = formatLlmSkippedMessage(stored) || '????AI ????????????;
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
        title = String(title || '????').trim() || '????';
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
     * ??????????????????????? renderValidatePassEmptyHtml / ????????
     * ??????QC ???????????????????????
     */
    function renderValidateCleanPassHeroHtml(stored) {
        /* ?????????????????????/????????? */
        return renderValidateCleanPassResolvedPanelHtml(stored);
    }

    /**
     * ????????????????????????
     * ????clean-pass ?????????????? / ??pass ????
     */
    function renderValidateCleanPassResolvedPanelHtml(stored) {
        stored = stored || {};
        var parts = buildValidatePassEmptyParts(stored);
        var items = buildValidateCleanPassResolvedItems(stored);
        var title = parts.title || '????????;
        var detail = parts.detail || '?????? AI ????????????????';
        var itemsHtml = '<ul class="tc-validate-clean-pass-resolved__list" aria-label="??????">';
        items.forEach(function (item) {
            itemsHtml +=
                '<li class="tc-validate-clean-pass-resolved__item">' +
                    '<span class="tc-validate-clean-pass-resolved__ok" aria-hidden="true">??/span>' +
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
                '<p class="tc-validate-clean-pass-resolved__eyebrow">???????/p>' +
                '<p class="tc-validate-clean-pass-resolved__title">' + esc(title) + '</p>' +
                '<p class="tc-validate-clean-pass-resolved__detail">' + esc(detail) + '</p>' +
                itemsHtml +
                (tip
                    ? ('<p class="tc-validate-clean-pass-resolved__tip">' + esc(tip) + '</p>')
                    : '') +
            '</div>'
        );
    }

    /** ??????????????resolved ????*/
    function buildValidateCleanPassResolvedItems(stored) {
        stored = stored || {};
        var items = [
            { label: '?? / ??', hint: '????????????' },
            { label: '????', hint: '??????????' }
        ];
        if (stored.llm_done && !stored.llm_skipped) {
            items.push({ label: 'AI ??', hint: '??????????? });
        } else if (stored.llm_pending) {
            items.push({ label: 'AI ??', hint: '?????????????? });
        } else if (stored.llm_skipped) {
            items.push({
                label: 'AI ??',
                hint: formatLlmSkippedMessage(stored) || '??????AI ??'
            });
        } else {
            items.push({ label: '????', hint: '?????????? });
        }
        return items;
    }

    /** ???????????? */
    function buildValidateCleanPassResolvedTip(stored) {
        stored = stored || {};
        if (stored.llm_done && !stored.llm_skipped) {
            return '????????????? AI ????????????????????;
        }
        if (stored.llm_skipped) {
            return '??????????? AI ??????????????????;
        }
        return '???????????????????;
    }

    /** ???????????????????????*/
    function buildValidateCleanPassCheckItems(stored) {
        return buildValidateCleanPassResolvedItems(stored);
    }

    /** ??????????????*/
    function buildValidatePassEmptyParts(stored) {
        stored = stored || {};
        if (stored.llm_pending) {
            return {
                title: '??????',
                detail: 'AI ??????????????????
            };
        }
        if (stored.llm_skip_reason === LLM_SKIP_REASON.TIMEOUT) {
            return {
                title: 'AI ????',
                detail: '????????????????'
            };
        }
        if (stored.llm_skip_reason === LLM_SKIP_REASON.ERROR) {
            return {
                title: 'AI ??????,
                detail: formatLlmSkippedMessage(stored) || '??????????????
            };
        }
        if (stored.llm_done && !stored.llm_skipped) {
            return {
                title: '????????,
                detail: '?????? AI ????????????????'
            };
        }
        if (stored.llm_skipped) {
            return {
                title: '???????',
                detail: formatLlmSkippedMessage(stored) || '????AI ????????????
            };
        }
        return {
            title: '????????,
            detail: '??????????????????'
        };
    }

    /** ??????/?????? AI ?????? ?????????????????????? */
    function validationResultIsCleanPass(stored) {
        if (!stored || stored.llm_pending) return false;
        if (stored.llm_skipped) return false;
        if (stored.llm_skip_reason === LLM_SKIP_REASON.TIMEOUT) return false;
        var counts = getValidationProblemCounts(stored);
        return counts.total === 0;
    }

    /**
     * ????????????????????????????Tab??
     * ??????????????? AI?AI ??/??????????????????? false??
     */
    function validationResultHasNoActionableIssues(stored) {
        if (!stored || stored.llm_pending) return false;
        var counts = getValidationProblemCounts(stored);
        return counts.total === 0;
    }

    /**
     * ?????? Tab / ??????/ ????????????????????????
     * ?? HasNoActionableIssues???????AI ?????????? Tab??
     */
    /** ????????????????????????????*/
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
                parts.title || '????????,
                parts.detail || '??????????????????'
            );
        }
        if (!html || !String(html).trim()) {
            html = '<div class="tc-validate-noissue" role="status">' +
                '<p class="tc-validate-noissue__title">????????/p>' +
                '<p class="tc-validate-noissue__detail">??????????/p></div>';
        }
        return html;
    }

    function applyValidateCleanPassDrawerChrome(scope, stored) {
        scope = normalizeValidateScope(scope);
        var drawer = getValidatePanel(scope);
        if (!drawer) return false;
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
            /* ????????????????? Tab + ???? */
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
     * ????????????????????HTML ????????opacity???????
     * ???????????????
     */
    function paintValidateCleanPassIssueList(issuesList, stored) {
        if (!issuesList) return;
        var html = buildValidateCleanPassBodyHtml(stored);
        if (!html || !String(html).trim()) {
            html = renderValidatePassEmptyHtml('????????, '??????????????????);
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
                '<p class="tc-validate-noissue__title">????????/p>' +
                '<p class="tc-validate-noissue__detail">??????????/p></div>';
        }
    }

    /**
     * ???????????????????????dismiss ??????Tab ????????
     */
    function ensureValidateCleanPassUiAfterFill(scope) {
        scope = normalizeValidateScope(scope);
        var vData = vScopeData(scope);
        var stored = vData && vData.lastValidation;
        if (!validationResultIsCleanPass(stored)) return false;
        return applyValidateCleanPassDrawerChrome(scope, stored);
    }

    /**
     * ???????????????????????????ensureValidateCleanPassUiAfterFill???
     * ?? Tab ????????????????????????????????????
     */
    function ensureValidateCleanPassUiAfterOverDelete(scope) {
        scope = normalizeValidateScope(scope);
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
            summary.textContent = buildValidateResultSummaryText(stored, scope) || '??????????;
        }
        return applyValidateCleanPassDrawerChrome(scope, stored);
    }

    /**
     * ??????????/?? Tab??????????????????
     * ???????????????????Agent ???????
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

    /** ??????????clean-pass ???????????????????*/
    function clearValidateDrawerCleanPassChromeOnClose(scope) {
        scope = normalizeValidateScope(scope);
        var drawer = getValidatePanel(scope);
        if (!drawer) return;
        drawer.classList.remove('tc-validate-drawer--clean-pass');
        try { drawer.style.removeProperty('visibility'); } catch (e0) { /* ignore */ }
        var issuesList = vEl('tc-validate-issue-list', scope);
        if (issuesList) {
            try {
                issuesList.style.removeProperty('visibility');
                issuesList.style.removeProperty('display');
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
        var locateLabel = isValidateMindmapBatch(vScopeData(scope).batchSnapshot) ? '????' : '????;
        var html = '<section class="tc-validate-group tc-validate-group--gap">' +
            '<h4 class="tc-validate-group__title">????????????/h4><ul class="tc-validate-group__list">';
        gapIssues.forEach(function (issue) {
            html += '<li class="tc-validate-issue tc-validate-issue--gap">' +
                renderValidationIssueMeta(issue, scope, locateLabel) + '</li>';
        });
        html += '</ul></section>';
        return html;
    }


    /**
     * ??????????????????????????????????????????
     * ????? renderValidationIssues ??????
     */

    /**
     * ?????????????????? row_index???????
     * ??????????????????/?????????
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
                /* ????????????????????????*/
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
        /* ?????????????? Tab ????????????????merge ????*/
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
        /* ????????????prune???????????????????*/
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
                /* ????????????????normalize ??type ??????*/
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
            /* ???????????normalize ????type=hallucination ?????? 0 */
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
        /* ?????????????????????????? */
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
                        detail: summaryText || 'AI ?????????
                    });
                } else {
                    finishGenChatValidation(scope, progBeforeEnd, stored, summaryText, false);
                }
                return;
            }
            if (!isPartial && !(stored && stored.llm_pending) && vData.deferValidateDrawerForGenChat) {
                syncGenChatQualityCheck({
                    finish: true,
                    detail: summaryText || '???????
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
        var groups = { structure: '??/????, required: '????', format: '????' };
        var html = '';
        if (!issues.length && !stored.llm_pending) {
            var passParts = buildValidatePassEmptyParts(stored);
            var passMsg = stored.llm_skipped
                ? (formatLlmSkippedMessage(stored) || '?????????? AI ?????)
                : '???????????;
            if (gapCount) {
                passMsg += ' ' + gapCount + ' ????????????;
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
            /* ???????????????????Tab???? AI ?????????????? */
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
            var locateLabel = isValidateMindmapBatch(vData.batchSnapshot) ? '????' : '????;
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
            html += '<p class="p-4 text-slate-500">AI ?????????/p>';
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
        /* ????????????????????? dismiss ??Tab ?? */
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
        /* ???????? hidden??????Tab ???????????????? */
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
            global.TcGenStageUi.cancelQualityCheck({ detail: '???? });
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
            syncGenChatQualityCheck({ finish: true, detail: '???????' });
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
            if (/^????\s+\d+/.test(tabText)) return true;
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
        var msg = '????????????????;
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
            title: '?????????',
            variant: 'warning',
            confirmText: '????',
            cancelText: '????'
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
        var msg = '????????????????????;
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
            title: '????????,
            variant: 'warning',
            confirmText: '????',
            cancelText: '????'
        }).then(function (ok) {
            if (!ok) return false;
            return onFillConfirmed();
        });
    }


    /** × ????????????????????? reopen ?????????? */
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
        var msg = '????????????????????;
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
            title: '???????',
            variant: 'warning',
            confirmText: '????',
            cancelText: '?????
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
            return '??????????????????????;
        }
        if (kind === 'validation') {
            return '?????????????????;
        }
        if (kind === 'generation') {
            return '????????????????????;
        }
        return '';
    }

    function showStandaloneQualityCheckBusyTip() {
        var busyMsg = getStandaloneQualityCheckBusyMessage();
        if (!busyMsg) busyMsg = '?????????????????;
        var alertTitle = resolveStandaloneQualityCheckBusyKind() === 'fill' ? '????' : '?????;
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
        var msg = '??????????????????????\n\n???????';
        var confirmFn = typeof global.tcAppConfirm === 'function' ? global.tcAppConfirm : null;
        function onConfirmed() {
            return runStandaloneQualityCheck(undefined, { forceRestart: false });
        }
        if (!confirmFn) {
            if (window.confirm(msg)) return onConfirmed();
            return Promise.resolve(false);
        }
        return confirmFn(msg, {
            title: '???????',
            variant: 'info',
            confirmText: '?????,
            cancelText: '??'
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
        setValidationProgressStep(stepId, 'error', detail || '?????', scope);
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
                    if (!res.ok) throw new Error('???? HTTP ' + res.status);
                    return d;
                });
            }).finally(function () {
                if (timer) window.clearTimeout(timer);
            }).catch(function (err) {
                var msg = err && err.message ? String(err.message) : String(err || '');
                var retriable = err && err.name === 'AbortError';
                if (!retriable) retriable = /deadlock|timeout|HTTP 5|try again|??i.test(msg);
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
            alertBox('???????????????????????, { title: '????? });
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
            return err && err.name === 'AbortError' ? '????? : (err.message || '?????);
        }
        function fetchFormatResult() {
            return requestStandaloneValidationPhase(payload, false, true).then(function (formatResult) {
                if (!isStandaloneValidationRunCurrent(scope, runToken)) {
                    abandonStaleStandaloneValidationStep(scope, runToken, 'structure', '?????');
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
                    abandonStaleStandaloneValidationStep(scope, runToken, 'structure', '?????');
                    return null;
                }
                if (!formatResult) return null;
                acc.formatResult = formatResult;
                var split = splitFormatIssuesByType(formatResult);
                var structCount = split.structure.length;
                setValidationProgressStep('structure', 'done',
                    structCount ? ('?? ' + structCount + ' ??????) : '????', scope);
                return formatResult;
            }).catch(function (err) {
                if (!isStandaloneValidationRunCurrent(scope, runToken)) {
                    abandonStaleStandaloneValidationStep(scope, runToken, 'structure', '?????');
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
                            reqCount ? ('?? ' + reqCount + ' ??????) : '????', scope);
                        return fr;
                    }).catch(function (err) {
                        setValidationProgressStep('required', 'error', validationErrMsg(err), scope);
                        return acc.formatResult;
                    });
                }
                var reqCount = splitFormatIssuesByType(source).required.length;
                setValidationProgressStep('required', 'done',
                    reqCount ? ('?? ' + reqCount + ' ??????) : '????', scope);
                return source;
            });
        }
        function runLlmStep(formatResult) {
            var fr = formatResult || acc.formatResult || { issues: [] };
            if (!wantLlm) {
                setValidationProgressStep('llm', 'skipped', '????AI ??', scope, { skipReason: LLM_SKIP_REASON.DISABLED });
                return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.DISABLED });
            }
            if (!batchPayload.rows.length) {
                setValidationProgressStep('llm', 'skipped', '????????, scope, { skipReason: LLM_SKIP_REASON.NO_CONTENT });
                return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.NO_CONTENT });
            }
            setValidationProgressStep('llm', 'running', getValidateStepMeta('llm').running, scope);
            resetValidateLlmReasoning(scope);
            qcReasoningStreamReset(scope);
            return fetchRequirementTextFromDbForCurrentPage().then(function (req) {
                req = String(req || '').trim();
                if (!req) {
                    setValidationProgressStep('llm', 'skipped', '?????????????????????', scope, {
                        skipReason: LLM_SKIP_REASON.NO_CONTENT
                    });
                    toast('??????????????????AI ????????????, { variant: 'info', duration: 4200 });
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
                    finishQcLlmStepUi(scope, 'done', llmTotal ? llmDetail : '????');
                    return renderFinal(fr, llmResult, {});
                }).catch(function (err) {
                    var timedOut = isQcLlmAbortTimeout(err);
                    var msg = timedOut ? 'AI ????' : (err.message || 'AI ????');
                    if (timedOut) {
                        finishQcLlmStepUiTimedOut(scope, msg);
                    } else {
                        finishQcLlmStepUiErrored(scope, msg);
                    }
                    if (!(err && err._quotaToastShown)) {
                        toast(msg + '??????????, { variant: 'warning', duration: 4200 });
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
            alertBox('??????????????????????, { title: '????? });
            return Promise.resolve();
        }
        if (!batchPayload.rows.length) {
            alertBox('???????????????????????????, { title: '????? });
            return Promise.resolve();
        }
        if (!batchPayload.parseResultBatch) {
            alertBox('????????????????????????, { title: '????? });
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
            return err && err.name === 'AbortError' ? '????? : (err.message || '?????);
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
                    structCount ? ('?? ' + structCount + ' ??????) : '????', scope);
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
                            reqCount ? ('?? ' + reqCount + ' ??????) : '????', scope);
                        return fr;
                    }).catch(function (err) {
                        if (runToken !== vData.validateRunId) return null;
                        setValidationProgressStep('required', 'error', validationErrMsg(err), scope);
                        return acc.formatResult;
                    });
                }
                var reqCount = splitFormatIssuesByType(source).required.length;
                setValidationProgressStep('required', 'done',
                    reqCount ? ('?? ' + reqCount + ' ??????) : '????', scope);
                return source;
            });
        }

        function runLlmStep(formatResult) {
            var fr = formatResult || acc.formatResult || { issues: [] };
            if (!wantLlm) {
                setValidationProgressStep('llm', 'skipped', '????AI ??', scope, {
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
                setValidationProgressStep('llm', 'skipped', '???????????????? AI ??', scope, {
                    skipReason: LLM_SKIP_REASON.NO_CONTENT
                });
                toast('???????????????? AI ????????????, { variant: 'info', duration: 3600 });
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
                        setValidationProgressStep('llm', 'skipped', '??????????????????', scope, {
                            skipReason: LLM_SKIP_REASON.NO_CONTENT
                        });
                        toast('?????????????????????? AI ????????????, { variant: 'info', duration: 3600 });
                        return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.NO_CONTENT });
                    }
                    llmPayload.ragContext = ragContext;
                } else if (!req && !userContent) {
                    setValidationProgressStep('llm', 'skipped', '????????????, scope, {
                        skipReason: LLM_SKIP_REASON.NO_CONTENT
                    });
                    toast('????????????????AI ????????????, { variant: 'info', duration: 3600 });
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
                    finishQcLlmStepUi(scope, 'done', llmTotal ? llmDetail : '????');
                    if (llmTotal > 0) {
                        toast('AI ?????? + llmDetail, { variant: 'warning', duration: 3200 });
                    } else {
                        toast('AI ????????????', { variant: 'success', duration: 2600 });
                    }
                    return renderFinal(fr, llmResult, {});
                }).catch(function (err) {
                    if (runToken !== vData.validateRunId) {
                        return renderFinal(fr, null, { llm_skipped: true, llm_skip_reason: LLM_SKIP_REASON.ERROR });
                    }
                    var timedOut = isQcLlmAbortTimeout(err);
                    var msg = timedOut ? 'AI ????' : (err.message || 'AI ????');
                    if (timedOut) {
                        finishQcLlmStepUiTimedOut(scope, msg);
                    } else {
                        finishQcLlmStepUiErrored(scope, msg);
                    }
                    if (!(err && err._quotaToastShown)) {
                        toast(msg + '??????????, { variant: 'warning', duration: 4200 });
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


