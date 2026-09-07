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
