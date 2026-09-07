    /* ---------- 增强模块引导 ---------- */

    function fetchAuthStatus() {
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            return global.HfAuthNav.fetchMe();
        }
        return fetch('/api/auth/me', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .catch(function () { return { authenticated: false, user: null }; });
    }

    function syncAuthStatus() {
        return fetchAuthStatus().then(function (data) {
            state.loggedIn = !!(data && data.authenticated && data.user);
            return state.loggedIn;
        }).catch(function () {
            state.loggedIn = false;
            return false;
        });
    }

    function wrapLanhuSummary() {
        if (typeof global.fetchTcLanhuRequirementsSummary !== 'function' || global.fetchTcLanhuRequirementsSummary._tcEnhWrapped) return;
        var orig = global.fetchTcLanhuRequirementsSummary;
        global.fetchTcLanhuRequirementsSummary = function () {
            return orig.apply(this, arguments).then(function (summary) {
                if (summary) {
                    state.lastRequirements = String(summary).trim();
                    state.lastLanhuRequirements = String(summary).trim();
                    try {
                        global.dispatchEvent(new CustomEvent('tc-wb-requirements-updated'));
                    } catch (e) { /* ignore */ }
                }
                return summary;
            });
        };
        global.fetchTcLanhuRequirementsSummary._tcEnhWrapped = true;
    }

    function bindBatchBarButtons() {
        if (global._tcEnhBatchBarBtnsBound) return;
        global._tcEnhBatchBarBtnsBound = true;
        global._tcBatchBarBtnBound = global._tcBatchBarBtnBound || {};
        function once(id, handler) {
            if (global._tcBatchBarBtnBound[id]) return;
            var el = $(id);
            if (!el) return;
            global._tcBatchBarBtnBound[id] = true;
            el.addEventListener('click', handler);
        }
        once('tc-gen-batch-close-btn', function () {
            if (typeof global.tcHideGenBatchBar === 'function') global.tcHideGenBatchBar();
            onBatchClose();
        });
        once('tc-gen-batch-validate-btn', function () {
            ensureInit();
            runValidation(isValidateUseLlmEnabled());
        });
        once('tc-standalone-validate-btn', function () {
            ensureInit();
            runValidation(isValidateUseLlmEnabled());
        });
    }

    function bindUi() {
        bindBatchBarButtons();
        if (!window._tcExportProvenanceModalInited) {
            window._tcExportProvenanceModalInited = true;
            $('tc-export-provenance-cancel') && $('tc-export-provenance-cancel').addEventListener('click', function() {
                closeTcExportProvenanceModal({ action: 'cancel' });
            });
            $('tc-export-provenance-skip') && $('tc-export-provenance-skip').addEventListener('click', function() {
                closeTcExportProvenanceModal({ action: 'skip' });
            });
            $('tc-export-provenance-apply') && $('tc-export-provenance-apply').addEventListener('click', function() {
                var select = $('tc-export-provenance-col-select');
                var colIndex = select ? parseInt(select.value, 10) : NaN;
                closeTcExportProvenanceModal({ action: 'apply', colIndex: isNaN(colIndex) ? null : colIndex });
            });
            $('tc-export-provenance-modal') && $('tc-export-provenance-modal').addEventListener('click', function(e) {
                if (e.target === $('tc-export-provenance-modal')) closeTcExportProvenanceModal({ action: 'cancel' });
            });
        }
        $('tc-export-report-close') && $('tc-export-report-close').addEventListener('click', closeExportReportModal);
        $('tc-export-report-copy') && $('tc-export-report-copy').addEventListener('click', function () {
            copyExportReportSummary(lastExportReport).then(function () {
                toast('摘要已复制', { variant: 'success', duration: 2400 });
            }).catch(function () {
                toast('复制失败', { variant: 'warning', duration: 2600 });
            });
        });
        $('tc-export-report-modal') && $('tc-export-report-modal').addEventListener('click', function (e) {
            if (e.target === $('tc-export-report-modal')) closeExportReportModal();
        });
        var autoVal = $('tc-gen-auto-validate');
        var autoBtn = $('tc-gen-auto-validate-btn');
        resetGenAutoValidateToggleDefault();
        function paintValidateToggleBtn() {
            if (!autoBtn || !autoVal) return;
            var on = !!autoVal.checked;
            autoBtn.classList.remove('tc-gen-toggle-btn--locked');
            autoBtn.classList.toggle('tc-gen-toggle-btn--on', on);
            autoBtn.classList.toggle('tc-gen-toggle-btn--off', !on);
            autoBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        bindValidateGenButtonDelegation();
        bindValidateFloatPanel(VALIDATE_SCOPE_SINGLE);
        if (autoBtn && autoVal) {
            paintValidateToggleBtn();
        }
        if (autoVal) {
            autoVal.addEventListener('change', function () {
                paintValidateToggleBtn();
            });
        }
        bindGenOptionHelpTips();
    }


    function bindValidateGenButtonDelegation() {
        if (global._tcValidateGenBtnDelegate) return;
        global._tcValidateGenBtnDelegate = true;
        document.addEventListener('click', function (ev) {
            if (!document.querySelector('.tc-workbench-scope')) return;
            if (typeof global.isTcHubExcelTabActive === 'function' && global.isTcHubExcelTabActive()) return;
            var btn = ev.target && ev.target.closest ? ev.target.closest('#tc-gen-auto-validate-btn') : null;
            if (!btn) return;
            if (typeof global.TcAgentOrchestrator !== 'undefined' &&
                typeof global.TcAgentOrchestrator.isAgentModeEnabled === 'function' &&
                global.TcAgentOrchestrator.isAgentModeEnabled()) {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            ensureInit();
            var autoVal = $('tc-gen-auto-validate');
            if (!autoVal) return;
            autoVal.checked = !autoVal.checked;
            autoVal.dispatchEvent(new Event('change', { bubbles: true }));
        }, true);
    }

    function syncGenOptionHelpDataTips() {
        document.querySelectorAll('.tc-gen-option-help-wrap').forEach(function (wrap) {
            var store = wrap.querySelector('.tc-gen-option-hint-store');
            if (!store) return;
            var text = String(store.textContent || '').trim();
            if (text) wrap.setAttribute('data-tip', text);
        });
    }

    function bindGenOptionHelpTips() {
        document.querySelectorAll('.tc-gen-option-help-wrap').forEach(function (wrap) {
            if (wrap._tcHelpTipBound) return;
            wrap._tcHelpTipBound = true;
            var btn = wrap.querySelector('.tc-gen-option-help-btn');
            var store = wrap.querySelector('.tc-gen-option-hint-store');
            if (!btn || !store) return;

            var floatTip = document.createElement('div');
            floatTip.className = 'tc-gen-option-help-tip';
            floatTip.setAttribute('role', 'tooltip');
            floatTip.style.display = 'none';
            if (store.id) {
                floatTip.id = store.id + '-float';
                btn.setAttribute('aria-describedby', floatTip.id);
            }

            function getTipText() {
                var wrapTip = wrap.getAttribute('data-tip');
                if (wrapTip) return String(wrapTip).trim();
                return String(store.textContent || '').trim();
            }

            function syncWrapDataTip() {
                var text = String(store.textContent || '').trim();
                if (text) wrap.setAttribute('data-tip', text);
            }
            syncWrapDataTip();

            function placeTip() {
                syncWrapDataTip();
                floatTip.textContent = getTipText();
                if (!floatTip.parentElement) document.body.appendChild(floatTip);
                var tipZ = typeof tcWorkbenchModalZIndex === 'function' ? tcWorkbenchModalZIndex() + 1 : 10460;
                floatTip.style.setProperty('z-index', String(tipZ), 'important');
                floatTip.style.display = 'block';
                floatTip.style.visibility = 'hidden';
                floatTip.style.opacity = '0';
                floatTip.style.left = '-9999px';
                floatTip.style.top = '0';
                var width = floatTip.offsetWidth || floatTip.scrollWidth;
                var rect = btn.getBoundingClientRect();
                var left = rect.left + rect.width / 2 - width / 2;
                left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
                floatTip.style.left = left + 'px';
                floatTip.style.top = (rect.bottom + 6) + 'px';
            }

            function showTip() {
                if (!getTipText()) return;
                placeTip();
                floatTip.style.visibility = 'visible';
                floatTip.style.opacity = '1';
                floatTip.classList.add('tc-gen-option-help-tip--open');
            }

            function hideTip() {
                floatTip.classList.remove('tc-gen-option-help-tip--open');
                floatTip.style.display = 'none';
                floatTip.style.visibility = 'hidden';
                floatTip.style.opacity = '0';
                floatTip.style.left = '';
                floatTip.style.top = '';
            }

            wrap.addEventListener('mouseenter', showTip);
            wrap.addEventListener('mouseleave', hideTip);
            btn.addEventListener('mouseenter', showTip);
            btn.addEventListener('mouseleave', hideTip);
            btn.addEventListener('focus', showTip);
            btn.addEventListener('blur', hideTip);
            store.addEventListener('tc-hint-updated', syncWrapDataTip);
        });
    }

    function mountLanhuTooldeckControls() {
        bindGenOptionHelpTips();
        syncGenOptionHelpDataTips();
    }

    function mountBatchBar() {
        mountLanhuTooldeckControls();
        ['tc-validate-drawer-single',
            'tc-validate-float-reopen-btn-agent', 'tc-validate-drawer-agent',
            'tc-agent-drawer',
            'tc-validate-drawer-single'].forEach(function (id) {
            var el = $(id);
            if (el && el.parentElement !== document.body) document.body.appendChild(el);
        });
    }

    function ensureInit() {
        if (!state._inited) init();
    }

    function init() {
        if (state._inited) return;
        if (!document.querySelector('.tc-workbench-scope')) return;
        state._inited = true;
        mountBatchBar();
        bindUi();
        wrapLanhuSummary();
        if (typeof installQcWorkbenchInteractionLockHooks === 'function') {
            installQcWorkbenchInteractionLockHooks();
        }
        syncAuthStatus();
        if (!global._tcEnhAuthNavBound) {
            global._tcEnhAuthNavBound = true;
            global.addEventListener('hf-auth-nav-updated', function (ev) {
                var detail = ev && ev.detail ? ev.detail : {};
                state.loggedIn = !!(detail.authenticated && detail.user);
            });
        }
        if (!global._tcGenAutoValidatePageshowBound) {
            global._tcGenAutoValidatePageshowBound = true;
            global.addEventListener('pageshow', function (ev) {
                if (!document.querySelector('.tc-workbench-scope')) return;
                if (ev.persisted) resetGenAutoValidateToggleDefault();
            });
        }
    }


    global.TcWorkbenchEnhancements = {
        init: init,
        ensureInit: ensureInit,
        remountLanhuTooldeckControls: mountLanhuTooldeckControls,
        bindBatchBarButtons: bindBatchBarButtons,
        syncBatchStateFromCore: syncBatchStateFromCore,
        collectBatchRowsPayloadForValidation: collectBatchRowsPayloadForValidation,
        isValidateMindmapBatch: isValidateMindmapBatch,
        getValidateBatchSnapshot: getValidateBatchSnapshot,
        extendValidateBatchSnapshot: extendValidateBatchSnapshot,
        captureGenAutoValidateForTask: captureGenAutoValidateForTask,
        shouldRunSingleAutoValidateAfterGeneration: shouldRunSingleAutoValidateAfterGeneration,
        onGenerationSuccess: onGenerationSuccess,
        getLastRequirementsSummary: function () {
            return String(state.lastLanhuRequirements || state.lastRequirements || '').trim();
        },
        getCurrentBatchValidationKey: function () {
            return getCurrentBatchValidationKey(VALIDATE_SCOPE_SINGLE);
        },
        getArchivedBatchValidationKey: function () {
            return getArchivedBatchValidationKey(VALIDATE_SCOPE_SINGLE);
        },
        getCachedBatchValidation: getCachedBatchValidation,
        buildTurnScopedValidationKey: buildTurnScopedValidationKey,
        buildBatchValidationKey: buildBatchValidationKey,
        migrateValidationCacheToTurn: migrateValidationCacheToTurn,
        buildBatchMetaForTurnFlush: buildBatchMetaForTurnFlush,
        resolveTurnScopedValidationFallback: resolveTurnScopedValidationFallback,
        attachTurnIdToValidationCache: attachTurnIdToValidationCache,
        persistStaleValidationRun: persistStaleValidationRun,
        resolveTurnIdForPersist: resolveTurnIdForPersist,
        bindPersistTurnIdToSnapshot: bindPersistTurnIdToSnapshot,
        extractTurnIdFromScopedKey: extractTurnIdFromScopedKey,
        persistSessionValidationBeforeLeave: persistSessionValidationBeforeLeave,
        hydrateSessionValidationFromTurns: hydrateSessionValidationFromTurns,
        setLastRequirements: function (text) {
            var val = String(text || '').trim();
            state.lastRequirements = val;
            state.lastLanhuRequirements = val;
        },
        runValidation: runValidation,
        runStandaloneQualityCheck: runStandaloneQualityCheck,
        hasStandaloneQualityCheckDrawerSession: hasStandaloneQualityCheckDrawerSession,
        clearStaleStandaloneQualityCheckSessionIfNeeded: clearStaleStandaloneQualityCheckSessionIfNeeded,
        isStandaloneQualityCheckButtonBusy: isStandaloneQualityCheckButtonBusy,
        getStandaloneQualityCheckBusyMessage: getStandaloneQualityCheckBusyMessage,
        isCaseGenerationInteractionBusy: isCaseGenerationInteractionBusy,
        getQcWorkbenchInteractionLockTitle: getQcWorkbenchInteractionLockTitle,
        handleStandaloneQualityCheckButtonClick: handleStandaloneQualityCheckButtonClick,
        tryToggleStandaloneQualityCheckDrawer: tryToggleStandaloneQualityCheckDrawer,
        openStandaloneQualityCheckDrawer: openStandaloneQualityCheckDrawer,
        isSingleGenValidationInProgress: isSingleGenValidationInProgress,
        applyAgentValidationFromJob: applyAgentValidationFromJob,
        applyAgentValidationFromJobInPlace: applyAgentValidationFromJobInPlace,
        ensureValidateCleanPassUiAfterFill: ensureValidateCleanPassUiAfterFill,
        ensureValidateCleanPassUiAfterOverDelete: ensureValidateCleanPassUiAfterOverDelete,
        refreshValidationIssuesView: refreshValidationIssuesView,
        ensureRequirementsForValidation: ensureRequirementsForValidation,
        ensureRequirementsForSingleLlmValidation: ensureRequirementsForSingleLlmValidation,
        highlightValidateRow: highlightValidateRow,
        resolveTurnIdForValidation: resolveTurnIdForValidation,
        isValidateViewingLatestSessionTurn: isValidateViewingLatestSessionTurn,
        resolveTurnIdForPersistCache: resolveTurnIdForPersistCache,
        flushPendingValidationForTurn: flushPendingValidationForTurn,
        queuePendingValidationFlush: queuePendingValidationFlush,
        openValidateDrawer: openValidateDrawer,
        toggleValidateDrawer: toggleValidateDrawer,
        isValidateDrawerOpen: isValidateDrawerOpen,
        syncValidateDrawerTabsChromeDuringQcRun: syncValidateDrawerTabsChromeDuringQcRun,
        syncValidateDrawerSummary: syncValidateDrawerSummary,
        bringFloatPanelToFront: bringTcFloatPanelToFront,
        abortPendingValidation: abortPendingValidation,
        resetValidateTaskState: resetValidateTaskState,
        getFloatPanelStackZIndex: getFloatPanelStackZIndex,
        ensureValidateDrawerCoverageSize: ensureValidateDrawerCoverageSize,
        restoreValidateSingleSideLayoutAfterCoverageTab: restoreValidateSingleSideLayoutAfterCoverageTab,
        closeValidateDrawer: closeValidateDrawer,
        syncValidateReopenButtonsLayout: syncValidateReopenButtonsLayout,
        collapseValidateDrawerBeforeAgentPlanningOpen: collapseValidateDrawerBeforeAgentPlanningOpen,
        openExportReportModal: openExportReportModal,
        shouldHideValidateDetailForSkippedNoLanhu: shouldHideValidateDetailForSkippedNoLanhu,
        shouldSuppressValidateUiForSkippedNoLanhu: shouldSuppressValidateUiForSkippedNoLanhu,
        validationHasActionableResults: validationHasActionableResults,
        TcQcPageSession: {
            clearOnWorkbenchLeave: clearQcPageSessionOnWorkbenchLeave,
            onPageSwitch: swapQcPageSessionOnPageSwitch,
            registerOnComplete: registerQcPageSessionOnComplete,
            syncReopenOnViewSwitch: syncValidateReopenBtnOnRightViewTabSwitch
        },
        patchLastValidationOverGeneratedForMatrix: patchLastValidationOverGeneratedForMatrix,
        remapLastValidationOverRowIndexesAfterDeletes: remapLastValidationOverRowIndexesAfterDeletes,
        getLastValidation: function (scope) {
            var vData = vScopeData(normalizeValidateScope(scope || VALIDATE_SCOPE_SINGLE));
            return vData.lastValidation ? JSON.parse(JSON.stringify(vData.lastValidation)) : null;
        },
        getLastExportReport: function () { return lastExportReport; }
    };

    function bootTcEnhancements() {
        bindTcFloatPanelStack();
        if (!document.querySelector('.tc-workbench-scope')) return;
        init();
    }
    bindTcFloatPanelStack();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootTcEnhancements);
    } else {
        bootTcEnhancements();
    }
})(window);

