/**
 * 用例工作台 — 对话会话持久化（按规划模式隔离，每模式最多 5 条历史）
 */
(function (global) {
    'use strict';

    var MAX_HISTORY = 5;
    var PLAN_CONTEXT_LABELS = {
        edit: '智能编辑（表格）',
        edit_mindmap: '智能编辑（导图）'
    };

    var state = {
        sessionId: null,
        currentPlanContext: 'edit',
        initialized: false,
        initPromise: null,
        turnIdByUserKey: {},
        turnIdByBatchKey: {},
        currentTurnId: null,
        lastObservedContext: null,
        limitBannerTimer: null,
        awaitingFirstMessageTitle: false,
        titleAutoNaming: false,
        currentTurnCount: 0,
        currentSessionMeta: null,
        prefsSaveTimer: null,
        applyingPrefs: false,
        pendingTurnsRestore: null,
        pendingAutoNamePrompt: null,
        currentTurns: [],
        bootSyncing: false,
        planContextChangePromise: null,
        sessionIdByContext: Object.create(null)
    };

    function syncObservedPlanContext() {
        state.lastObservedContext = getPlanContext();
    }

    function rememberActiveSessionForContext(context, sessionId) {
        context = context || state.currentPlanContext;
        sessionId = String(sessionId || state.sessionId || '').trim();
        if (!context || !sessionId) return;
        state.sessionIdByContext[context] = sessionId;
    }

    function getRememberedSessionIdForContext(context) {
        context = String(context || '').trim();
        if (!context) return null;
        return state.sessionIdByContext[context] || null;
    }

    function forgetRememberedSessionId(sessionId) {
        sessionId = String(sessionId || '').trim();
        if (!sessionId) return;
        Object.keys(state.sessionIdByContext).forEach(function (ctx) {
            if (state.sessionIdByContext[ctx] === sessionId) {
                delete state.sessionIdByContext[ctx];
            }
        });
    }

    function restoreSessionForContextSwitch(sessionId, planContext) {
        sessionId = String(sessionId || '').trim();
        planContext = planContext || getPlanContext();
        if (!sessionId) return Promise.resolve(null);
        return sessionAppearsInHistory(sessionId, planContext).then(function (exists) {
            if (!exists) {
                forgetRememberedSessionId(sessionId);
                return null;
            }
            return loadSessionDetail(sessionId).then(function (detail) {
                var sess = detail && detail.session;
                if (!sess || !sess.id) {
                    forgetRememberedSessionId(sessionId);
                    return null;
                }
                var sessCtx = sess.plan_context || planContext;
                if (sessCtx !== planContext) {
                    forgetRememberedSessionId(sessionId);
                    return null;
                }
                var payload = applySessionDetail(detail);
                restoreChatFromTurns(payload.turns || [], { force: true });
                return payload;
            }).catch(function (err) {
                if (err && err.status === 404) {
                    forgetRememberedSessionId(sessionId);
                    return null;
                }
                forgetRememberedSessionId(sessionId);
                return null;
            });
        });
    }

    function sessionAppearsInHistory(sessionId, planContext) {
        sessionId = String(sessionId || '').trim();
        if (!sessionId) return Promise.resolve(false);
        return listSessions(MAX_HISTORY, planContext).then(function (items) {
            for (var i = 0; i < items.length; i++) {
                if (items[i] && items[i].id === sessionId) return true;
            }
            return false;
        }).catch(function () {
            return false;
        });
    }

    function fetchJson(url, opts) {
        opts = opts || {};
        var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
        return fetch(url, Object.assign({}, opts, { headers: headers, credentials: 'same-origin' }))
            .then(function (res) {
                return res.json().then(function (body) {
                    if (!res.ok) {
                        var err = new Error((body && body.error) || res.statusText || '请求失败');
                        err.status = res.status;
                        throw err;
                    }
                    return body;
                });
            });
    }

    function dispatch(name, detail) {
        try {
            global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
        } catch (e) { /* ignore */ }
        if (global.TcWorkbenchBus && typeof global.TcWorkbenchBus.emit === 'function') {
            global.TcWorkbenchBus.emit(name, detail || {});
        }
    }

    function isMindmapViewActiveForPlanContext() {
        return document.body.classList.contains('tc-left-gen-compact--mindmap') ||
            (typeof global.tcRightViewMode !== 'undefined' && global.tcRightViewMode === 'mindmap');
    }

    function isEditPlanContext(ctx) {
        ctx = String(ctx || '').trim();
        return ctx === 'edit' || ctx === 'edit_mindmap';
    }

    /** 智能编辑会话：不绑定蓝湖 prefs/turn lanhu_url，避免切历史污染当前需求页。其它 plan 走原逻辑。 */
    function shouldSkipLanhuSessionPrefsBinding(planContext) {
        return isEditPlanContext(planContext || getPlanContext());
    }

    function emptyLanhuPrefsForSessionPersist() {
        return { cookie: '', url: '', requirements_summary: '' };
    }

    function collectSessionPrefsForPersist(planContext) {
        var prefs = collectSessionPrefs();
        if (!shouldSkipLanhuSessionPrefsBinding(planContext)) {
            return prefs;
        }
        prefs.lanhu = emptyLanhuPrefsForSessionPersist();
        return prefs;
    }

    function getPlanContext() {
        if (typeof global.isTcWorkbenchEditMode === 'function' && global.isTcWorkbenchEditMode()) {
            return isMindmapViewActiveForPlanContext() ? 'edit_mindmap' : 'edit';
        }
        return isMindmapViewActiveForPlanContext() ? 'edit_mindmap' : 'edit';
    }

    function getPlanContextLabel(ctx) {
        return PLAN_CONTEXT_LABELS[ctx] || PLAN_CONTEXT_LABELS.edit;
    }

    function collectSessionPrefs() {
        var prefs = {
            lanhu: {
                cookie: (document.getElementById('lanhu-cookie') || {}).value || '',
                url: (document.getElementById('lanhu-url') || {}).value || '',
                requirements_summary: ''
            },
            quality: {
                auto_validate: false
            }
        };
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.getLastRequirementsSummary === 'function') {
            prefs.lanhu.requirements_summary =
                global.TcWorkbenchEnhancements.getLastRequirementsSummary();
        }
        if (typeof global.tcCaptureGenAutoValidateForTask === 'function') {
            prefs.quality.auto_validate = !!global.tcCaptureGenAutoValidateForTask();
        } else {
            var validateEl = document.getElementById('tc-gen-auto-validate');
            prefs.quality.auto_validate = !!(validateEl && validateEl.checked);
        }
        return prefs;
    }

    function paintValidateToggleFromPrefs(enabled) {
        var autoVal = document.getElementById('tc-gen-auto-validate');
        var autoBtn = document.getElementById('tc-gen-auto-validate-btn');
        var panel = document.getElementById('tc-auto-validate-enabled');
        if (autoVal) autoVal.checked = !!enabled;
        if (panel) panel.checked = !!enabled;
        if (!autoBtn || !autoVal) return;
        var on = !!autoVal.checked;
        autoBtn.classList.remove('tc-gen-toggle-btn--locked');
        autoBtn.classList.toggle('tc-gen-toggle-btn--on', on);
        autoBtn.classList.toggle('tc-gen-toggle-btn--off', !on);
        autoBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    function setLanhuInputValue(el, value) {
        if (!el) return;
        value = value != null ? String(value) : '';
        el.value = value;
        if ('defaultValue' in el) el.defaultValue = value;
    }

    function resetGenOptionTogglesForNewSession() {
        paintValidateToggleFromPrefs(false);
        if (typeof global.setTcRagToggleEnabled === 'function') {
            global.setTcRagToggleEnabled(false);
        } else {
            var ragEl = document.getElementById('tc-rag-enabled');
            if (ragEl) ragEl.checked = false;
            if (typeof global.paintTcRagToggleUi === 'function') global.paintTcRagToggleUi();
            if (typeof global.syncTcRagLockChrome === 'function') global.syncTcRagLockChrome();
        }
        if (typeof global.updateTcRagToggleHint === 'function') global.updateTcRagToggleHint('');
    }

    function applySessionPrefs(prefs, applyOpts) {
        applyOpts = applyOpts || {};
        if (!prefs || typeof prefs !== 'object') return;
        var skipLanhuPrefs = shouldSkipLanhuSessionPrefsBinding(applyOpts.planContext);
        state.applyingPrefs = true;
        try {
            if (!applyOpts.skipGenAreaPrefs && !skipLanhuPrefs) {
                var lanhu = prefs.lanhu || {};
                var cookieEl = document.getElementById('lanhu-cookie');
                var urlEl = document.getElementById('lanhu-url');
                if (cookieEl && lanhu.cookie != null) setLanhuInputValue(cookieEl, lanhu.cookie);
                if (urlEl && lanhu.url != null) setLanhuInputValue(urlEl, lanhu.url);
                if (urlEl && lanhu.url != null && typeof global.retryTcLanhuTreeHydrateIfNeeded === 'function') {
                    global.retryTcLanhuTreeHydrateIfNeeded();
                }
                if (typeof global.autoGrowTcPresetLanhuField === 'function') {
                    global.autoGrowTcPresetLanhuField(cookieEl);
                    global.autoGrowTcPresetLanhuField(urlEl);
                }
                if (global.TcWorkbenchEnhancements &&
                    typeof global.TcWorkbenchEnhancements.setLastRequirements === 'function') {
                    global.TcWorkbenchEnhancements.setLastRequirements(lanhu.requirements_summary || '');
                }
            }
            if (!applyOpts.skipGenAreaPrefs) {
                paintValidateToggleFromPrefs(!!(prefs.quality && prefs.quality.auto_validate));
            }
        } finally {
            state.applyingPrefs = false;
        }
    }

    function buildSessionPrefsForNewSession() {
        return {
            lanhu: {
                cookie: '',
                url: '',
                requirements_summary: ''
            },
            quality: {
                auto_validate: false
            }
        };
    }

    /** 新会话时清空蓝湖需求区全部配置（Cookie/URL/摘要/拉取状态/RAG/质量检查等）。 */
    function clearLanhuRequirementConfig() {
        state.applyingPrefs = true;
        try {
            ['lanhu-cookie', 'lanhu-url'].forEach(function (id) {
                setLanhuInputValue(document.getElementById(id), '');
            });
            var modalInput = document.getElementById('lanhu-cookie-modal-input');
            if (modalInput) modalInput.value = '';
            var statusEl = document.getElementById('lanhu-fetch-status');
            if (statusEl) statusEl.textContent = '';
            var cookieEl = document.getElementById('lanhu-cookie');
            var urlEl = document.getElementById('lanhu-url');
            if (typeof global.autoGrowTcPresetLanhuField === 'function') {
                global.autoGrowTcPresetLanhuField(cookieEl);
                global.autoGrowTcPresetLanhuField(urlEl);
            }
            if (typeof global.setTcLanhuFieldRevealed === 'function') {
                global.setTcLanhuFieldRevealed(cookieEl, false);
                global.setTcLanhuFieldRevealed(urlEl, false);
            }
            if (global.TcWorkbenchEnhancements &&
                typeof global.TcWorkbenchEnhancements.setLastRequirements === 'function') {
                global.TcWorkbenchEnhancements.setLastRequirements('');
            }
            resetGenOptionTogglesForNewSession();
            dispatch('tc-wb-requirements-updated', { cleared: true });
        } finally {
            state.applyingPrefs = false;
        }
    }

    function isSessionPrefsTargetActive(sessionId) {
        sessionId = String(sessionId || '').trim();
        return !!(sessionId && state.sessionId === sessionId);
    }

    function persistClearedLanhuSessionPrefs() {
        if (!state.sessionId) return Promise.resolve(null);
        var sid = state.sessionId;
        return fetchJson(
            '/api/test-cases/workbench-sessions/' + encodeURIComponent(sid) + '/prefs',
            {
                method: 'PUT',
                body: JSON.stringify({ session_prefs: buildSessionPrefsForNewSession() })
            }
        ).then(function (data) {
            if (!isSessionPrefsTargetActive(sid)) return null;
            return (data && data.session) || null;
        }).catch(function (err) {
            if (err && err.status === 404 && !isSessionPrefsTargetActive(sid)) return null;
            return null;
        });
    }

    function saveSessionPrefsNow() {
        if (!state.sessionId || state.applyingPrefs) return Promise.resolve(null);
        var sid = state.sessionId;
        return fetchJson(
            '/api/test-cases/workbench-sessions/' + encodeURIComponent(sid) + '/prefs',
            {
                method: 'PUT',
                body: JSON.stringify({ session_prefs: collectSessionPrefsForPersist(state.currentPlanContext || getPlanContext()) })
            }
        ).then(function (data) {
            if (!isSessionPrefsTargetActive(sid)) return null;
            return (data && data.session) || null;
        }).catch(function (err) {
            if (err && err.status === 404 && !isSessionPrefsTargetActive(sid)) return null;
            return null;
        });
    }

    function saveSessionPrefsDebounced() {
        if (!state.sessionId || state.applyingPrefs) return;
        if (state.prefsSaveTimer) global.clearTimeout(state.prefsSaveTimer);
        state.prefsSaveTimer = global.setTimeout(function () {
            state.prefsSaveTimer = null;
            saveSessionPrefsNow();
        }, 400);
    }

    function bindSessionPrefsHooks() {
        if (bindSessionPrefsHooks._bound) return;
        bindSessionPrefsHooks._bound = true;
        ['lanhu-cookie', 'lanhu-url'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el || el._tcWbPrefsBound) return;
            el._tcWbPrefsBound = true;
            el.addEventListener('input', saveSessionPrefsDebounced);
            el.addEventListener('change', saveSessionPrefsDebounced);
        });
        var validateEl = document.getElementById('tc-gen-auto-validate');
        if (validateEl && !validateEl._tcWbPrefsBound) {
            validateEl._tcWbPrefsBound = true;
            validateEl.addEventListener('change', saveSessionPrefsDebounced);
        }
        document.addEventListener('tc-wb-requirements-updated', saveSessionPrefsDebounced);
    }

    function resetTurnMappings() {
        state.turnIdByUserKey = {};
        state.turnIdByBatchKey = {};
        state.currentTurnId = null;
        state.currentTurns = [];
    }

    function normalizeLanhuUrl(url) {
        return String(url != null ? url : '').trim();
    }

    function getLanhuUrlFromSessionPrefs() {
        var meta = state.currentSessionMeta;
        var prefs = meta && meta.session_prefs;
        var lanhu = prefs && prefs.lanhu;
        if (!lanhu || lanhu.url == null) return '';
        return normalizeLanhuUrl(lanhu.url);
    }

    function getActiveGenerationLanhuUrl() {
        var url = global.tcActiveGenerationLanhuUrl;
        return normalizeLanhuUrl(url != null ? url : '');
    }

    /** 读取当前用于生成/过滤历史的蓝湖 URL（输入框 → 本轮生成快照 → 会话 prefs）。 */
    function getCurrentLanhuUrlForGen() {
        var url = '';
        if (typeof global.getTcLanhuCredentialsForMode === 'function') {
            url = normalizeLanhuUrl(global.getTcLanhuCredentialsForMode('preset').url);
        } else {
            var urlEl = document.getElementById('lanhu-url');
            url = normalizeLanhuUrl(urlEl ? urlEl.value : '');
        }
        if (url) return url;
        url = getActiveGenerationLanhuUrl();
        if (url) return url;
        return getLanhuUrlFromSessionPrefs();
    }

    /** 归档 turn 时写入的 URL：优先本轮生成开始时捕获的快照，避免表单已清空导致漏记。 */
    function resolveLanhuUrlForTurnArchive(opts) {
        opts = opts || {};
        if (opts.userMode === 'edit' || shouldSkipLanhuSessionPrefsBinding()) {
            return '';
        }
        if (opts.lanhuUrl != null) {
            var explicit = normalizeLanhuUrl(opts.lanhuUrl);
            if (explicit) return explicit;
        }
        var active = getActiveGenerationLanhuUrl();
        if (active) return active;
        return getCurrentLanhuUrlForGen();
    }

    function setCurrentTurns(turns) {
        state.currentTurns = Array.isArray(turns) ? turns.slice() : [];
    }

    function upsertTurnInState(turn) {
        if (!turn || !turn.id) return;
        var idx = -1;
        for (var i = 0; i < state.currentTurns.length; i++) {
            var row = state.currentTurns[i];
            if (!row) continue;
            if (row.id === turn.id || row.turn_index === turn.turn_index) {
                idx = i;
                break;
            }
        }
        if (idx >= 0) {
            state.currentTurns[idx] = turn;
        } else {
            state.currentTurns.push(turn);
        }
        state.currentTurns.sort(function (a, b) {
            return (a.turn_index || 0) - (b.turn_index || 0);
        });
    }

    function getPreviousUserPromptsForCurrentLanhu(opts) {
        opts = opts || {};
        var currentUrl = normalizeLanhuUrl(
            opts.lanhuUrl != null ? opts.lanhuUrl : getCurrentLanhuUrlForGen()
        );
        var items = [];
        (state.currentTurns || []).slice().sort(function (a, b) {
            return (a.turn_index || 0) - (b.turn_index || 0);
        }).forEach(function (turn) {
            if (!turn) return;
            if (normalizeLanhuUrl(turn.lanhu_url) !== currentUrl) return;
            var text = String(turn.user_prompt || '').trim();
            if (!text) return;
            items.push(text);
        });
        return items;
    }

    function applyActiveSession(session, planContext, activeOpts) {
        activeOpts = activeOpts || {};
        planContext = planContext || getPlanContext();
        state.sessionId = session && session.id ? session.id : null;
        state.currentPlanContext = planContext;
        state.currentSessionMeta = session || null;
        state.currentTurnCount = session && session.turn_count != null
            ? (parseInt(session.turn_count, 10) || 0)
            : 0;
        resetTurnMappings();
        applySessionPrefs(session && session.session_prefs, {
            skipGenAreaPrefs: !!activeOpts.skipGenAreaPrefs,
            planContext: planContext
        });
        dispatch('tc-wb-session-ready', {
            sessionId: state.sessionId,
            planContext: planContext
        });
        if (state.sessionId) rememberActiveSessionForContext(planContext, state.sessionId);
        return state.sessionId;
    }

    function applySessionTurnMappings(turns) {
        (turns || []).forEach(function (turn) {
            if (turn && turn.id) {
                registerTurnMapping(
                    turn.id,
                    'restored-' + turn.id,
                    turn.chain && turn.chain.batchValidationKey
                );
            }
        });
    }

    function hideSessionLimitBanner() {
        var banner = document.getElementById('tc-wb-session-limit-banner');
        if (!banner) return;
        banner.classList.add('hidden');
        banner.setAttribute('aria-hidden', 'true');
        if (state.limitBannerTimer) {
            global.clearTimeout(state.limitBannerTimer);
            state.limitBannerTimer = null;
        }
    }

    function showSessionLimitBanner(planContext) {
        var banner = document.getElementById('tc-wb-session-limit-banner');
        if (!banner) return;
        if (typeof ensureTcWorkbenchOverlaysMounted === 'function') {
            ensureTcWorkbenchOverlaysMounted();
        } else if (banner.parentElement !== document.body) {
            document.body.appendChild(banner);
        }
        var label = getPlanContextLabel(planContext || getPlanContext());
        var textEl = banner.querySelector('.tc-wb-session-limit-banner__text');
        if (textEl) {
            textEl.textContent =
                '「' + label + '」历史会话已达 ' + MAX_HISTORY +
                ' 条上限，已恢复最新会话。请打开「历史记录」删除不需要的会话后再新建。';
        }
        banner.classList.remove('hidden');
        banner.setAttribute('aria-hidden', 'false');
        if (state.limitBannerTimer) global.clearTimeout(state.limitBannerTimer);
        state.limitBannerTimer = global.setTimeout(hideSessionLimitBanner, 12000);
    }

    function isDefaultSessionTitle(title) {
        title = String(title || '').trim();
        if (title === '新会话') return true;
        return /^(快速规划|导图规划|智能编辑(?:（表格）|（导图）)?) \d{2}-\d{2} \d{2}:\d{2}$/.test(title);
    }

    function fallbackTitleFromPrompt(text) {
        var raw = String(text || '').replace(/\s+/g, ' ').trim();
        if (!raw) return '新会话';
        if (raw.length > 24) {
            var cut = raw.slice(0, 24).replace(/\s+\S*$/, '').trim();
            if (!cut) cut = raw.slice(0, 24);
            return (cut + '…').slice(0, 200);
        }
        return raw.slice(0, 200);
    }

    function shouldAutoNameFromFirstMessage() {
        if (state.titleAutoNaming || !state.sessionId) return false;
        if (!isDefaultSessionTitle(state.currentSessionMeta && state.currentSessionMeta.title)) {
            return false;
        }
        return (parseInt(state.currentTurnCount, 10) || 0) <= 1;
    }

    function syncAwaitingFirstMessageTitle(session, opts) {
        opts = opts || {};
        if (opts.limitReached) {
            state.awaitingFirstMessageTitle = false;
            return;
        }
        var turnCount = session && session.turn_count != null
            ? (parseInt(session.turn_count, 10) || 0)
            : (state.currentTurnCount || 0);
        state.awaitingFirstMessageTitle =
            turnCount <= 1 && isDefaultSessionTitle(session && session.title);
    }

    function patchHistoryListTitle(sessionId, title) {
        sessionId = String(sessionId || '').trim();
        title = String(title || '').trim();
        if (!sessionId || !title) return;
        var list = document.getElementById('tc-wb-history-list');
        if (!list) return;
        var li = list.querySelector('.tc-wb-history-list__item[data-session-id="' + sessionId + '"]');
        if (!li) return;
        var titleEl = li.querySelector('.tc-wb-history-list__title');
        if (titleEl) titleEl.textContent = title;
    }

    function applySessionTitleUpdate(session) {
        session = session || {};
        var sessionId = String(session.id || '').trim();
        var title = String(session.title || '').trim();
        if (!sessionId || !title) return;
        if (sessionId === state.sessionId) {
            state.currentSessionMeta = Object.assign({}, state.currentSessionMeta || {}, session, { title: title });
        }
        patchHistoryListTitle(sessionId, title);
        updateHistoryPanelHead();
    }

    function syncSessionValidationFromTurns(turns, planContext) {
        var enh = global.TcWorkbenchEnhancements;
        if (!enh || typeof enh.hydrateSessionValidationFromTurns !== 'function') return;
        enh.hydrateSessionValidationFromTurns(turns || [], {
            planContext: planContext || getPlanContext()
        });
    }

    function flushSessionStateBeforeLeave(opts) {
        opts = opts || {};
        var enh = global.TcWorkbenchEnhancements;
        if (enh && typeof enh.persistSessionValidationBeforeLeave === 'function') {
            enh.persistSessionValidationBeforeLeave();
        }
        var persistChat = Promise.resolve(null);
        if (global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.persistLiveStateBeforeLeave === 'function') {
            persistChat = global.TcGenChatXUi.persistLiveStateBeforeLeave(opts).catch(function () {
                return null;
            });
        }
        if (isCurrentSessionNew()) {
            return persistChat;
        }
        return persistChat.then(function () {
            return saveSessionPrefsNow().catch(function () {
                return null;
            });
        });
    }

    function isGenerationBusyForPageLeave() {
        if (typeof global.isTcPromptSendLocked === 'function' && global.isTcPromptSendLocked()) {
            return true;
        }
        if (typeof global.isTcLeftPanelNavLocked === 'function' && global.isTcLeftPanelNavLocked()) {
            return true;
        }
        return false;
    }

    function abortActiveGenerationForPageLeave() {
        try {
            if (global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.abortForPageLeave === 'function') {
                global.TcGenerationStreamClient.abortForPageLeave();
            }
        } catch (e1) { /* ignore */ }
        try {
            if (global.TcAgentOrchestrator &&
                typeof global.TcAgentOrchestrator.abortForPageLeave === 'function') {
                global.TcAgentOrchestrator.abortForPageLeave();
            }
        } catch (e2) { /* ignore */ }
    }

    function flushGenerationStateBeforePageLeave() {
        if (!isWorkbenchPage()) return;
        if (!isGenerationBusyForPageLeave()) return;
        abortActiveGenerationForPageLeave();
        if (global.TcRequirementCaseStore &&
            typeof global.TcRequirementCaseStore.abortAndRollbackWorkbenchGeneration === 'function') {
            try {
                global.TcRequirementCaseStore.abortAndRollbackWorkbenchGeneration({ reason: 'page_leave' });
            } catch (eRollback) { /* ignore */ }
        }
        var enh = global.TcWorkbenchEnhancements;
        if (enh && typeof enh.persistSessionValidationBeforeLeave === 'function') {
            try {
                enh.persistSessionValidationBeforeLeave();
            } catch (e3) { /* ignore */ }
        }
        if (global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.persistLiveStateBeforeLeave === 'function') {
            try {
                global.TcGenChatXUi.persistLiveStateBeforeLeave({ keepalive: true });
            } catch (e4) { /* ignore */ }
        }
        saveSessionPrefsKeepalive();
    }

    function saveSessionPrefsKeepalive() {
        if (!state.sessionId) return;
        var prefs = collectSessionPrefsForPersist(state.currentPlanContext || getPlanContext());
        try {
            fetch('/api/test-cases/workbench-sessions/' + encodeURIComponent(state.sessionId) + '/prefs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                keepalive: true,
                body: JSON.stringify({ session_prefs: prefs })
            });
        } catch (e) { /* ignore */ }
    }

    function initGenerationLeaveHandler() {
        if (global._tcGenLeaveHandlerBound) return;
        global._tcGenLeaveHandlerBound = true;
        global.addEventListener('pagehide', flushGenerationStateBeforePageLeave);
        global.addEventListener('beforeunload', flushGenerationStateBeforePageLeave);
    }

    function shouldResetGenAreaForSessionStart(data) {
        if (!data || data.limit_reached) return false;
        return !!(data.created || data.reused_draft);
    }

    function resetLiveGenerationUiForContextSwitch() {
        if (global.TcGenChatPipeline) {
            if (typeof global.TcGenChatPipeline.cancelScheduledArchive === 'function') {
                global.TcGenChatPipeline.cancelScheduledArchive();
            }
            if (typeof global.TcGenChatPipeline.reset === 'function') {
                global.TcGenChatPipeline.reset();
            }
        }
        if (global.TcGenChatXUi) {
            if (typeof global.TcGenChatXUi.clearLivePipeline === 'function') {
                global.TcGenChatXUi.clearLivePipeline();
            }
            if (typeof global.TcGenChatXUi.resetAgentPipeline === 'function') {
                global.TcGenChatXUi.resetAgentPipeline();
            }
        }
        if (global.TcEditChat && typeof global.TcEditChat.clearThread === 'function') {
            global.TcEditChat.clearThread();
        }
    }

    function buildChatRestoreOpts(sessionOpts) {
        sessionOpts = sessionOpts || {};
        if (sessionOpts.forceRestore === true) {
            return { force: true };
        }
        if (sessionOpts.forceRestore === false) {
            return { force: false };
        }
        return { force: sessionOpts.clearChat !== false };
    }

    function handleSessionStartResponse(data, opts) {
        opts = opts || {};
        var planContext = opts.planContext || getPlanContext();
        var session = data.session || null;
        var limitReached = !!data.limit_reached;
        var turns = data.turns || [];
        var restoreOpts = buildChatRestoreOpts(opts);
        var shouldResetLanhu = opts.resetLanhuConfig != null
            ? !!opts.resetLanhuConfig
            : shouldResetGenAreaForSessionStart(data);
        if (isEditPlanContext(planContext)) {
            shouldResetLanhu = false;
        }
        applyActiveSession(session, planContext, { skipGenAreaPrefs: shouldResetLanhu });
        setCurrentTurns(turns);
        if (shouldResetLanhu) {
            clearLanhuRequirementConfig();
            persistClearedLanhuSessionPrefs();
        }
        if (limitReached) {
            applySessionTurnMappings(turns);
            restoreChatFromTurns(turns, restoreOpts);
            syncSessionValidationFromTurns(turns, planContext);
            showSessionLimitBanner(planContext);
            state.awaitingFirstMessageTitle = false;
        } else if (opts.clearChat !== false || turns.length > 0) {
            applySessionTurnMappings(turns);
            restoreChatFromTurns(turns, restoreOpts);
            syncSessionValidationFromTurns(turns, planContext);
            syncAwaitingFirstMessageTitle(session, { limitReached: false });
        } else {
            syncAwaitingFirstMessageTitle(session, { limitReached: false });
        }
        dispatch('tc-wb-session-created', {
            session: session,
            planContext: planContext,
            limitReached: limitReached,
            created: !!data.created && !limitReached,
            reusedDraft: !!data.reused_draft
        });
        return session;
    }

    function chatHasConversationContent() {
        if (isEditPlanContext(getPlanContext())) {
            var editThread = document.getElementById('tc-edit-chat-thread');
            return !!(editThread && editThread.children.length > 0);
        }
        var thread = document.getElementById('tc-gen-chat-thread');
        if (!thread) return false;
        return !!thread.querySelector(
            '.tc-gen-chat-x-mount .ant-bubble, .tc-gen-chat-x-scroll .ant-thought-chain, ' +
            '.tc-gen-chat-x-scroll .tc-gen-chat-x-stream, .tc-gen-chat-x-scroll .tc-gen-chat-x-thinking, ' +
            '.tc-gen-chat-x-scroll .tc-gen-chat-x-thinking-block, .tc-gen-chat-msg, .tc-gen-chat-msg--pipeline'
        );
    }

    /** 当前会话是否为空草稿（规划模式切换时勿用 getPlanContext 比对，避免误记已删会话） */
    function isSessionEmptyDraft() {
        if (!state.sessionId) return false;
        if ((state.currentTurnCount || 0) > 0) return false;
        if (state.currentTurnId || Object.keys(state.turnIdByUserKey).length > 0) return false;
        if (state.currentPlanContext === getPlanContext() && chatHasConversationContent()) return false;
        return true;
    }

    function isCurrentSessionNew() {
        if (!state.sessionId || state.currentPlanContext !== getPlanContext()) return false;
        return isSessionEmptyDraft();
    }

    function getCurrentSessionSnapshot() {
        return {
            id: state.sessionId,
            plan_context: state.currentPlanContext,
            turn_count: state.currentTurnCount || 0
        };
    }

    function noopCurrentNewSession() {
        setHistoryPanelOpen(false);
        if (isEditPlanContext(getPlanContext())) {
            if (global.TcEditChat && typeof global.TcEditChat.clearThread === 'function') {
                global.TcEditChat.clearThread();
            }
            return Promise.resolve(getCurrentSessionSnapshot());
        }
        clearLanhuRequirementConfig();
        return persistClearedLanhuSessionPrefs().then(function () {
            return getCurrentSessionSnapshot();
        });
    }

    function createNewSession(opts) {
        opts = opts || {};
        var planContext = opts.planContext || getPlanContext();
        if (state.sessionId && state.currentPlanContext === planContext && isCurrentSessionNew()) {
            return noopCurrentNewSession();
        }
        if (!isEditPlanContext(planContext)) {
            clearLanhuRequirementConfig();
        }
        var body = {
            title: opts.title || '',
            plan_context: planContext,
            session_prefs: buildSessionPrefsForNewSession()
        };
        if (state.sessionId && state.currentPlanContext === planContext) {
            body.current_session_id = state.sessionId;
        }
        return fetchJson('/api/test-cases/workbench-sessions', {
            method: 'POST',
            body: JSON.stringify(body)
        }).then(function (data) {
            return handleSessionStartResponse(data, {
                planContext: planContext,
                clearChat: opts.clearChat,
                resetLanhuConfig: !data.limit_reached
            });
        });
    }

    function updateSessionTitle(sessionId, title) {
        sessionId = String(sessionId || '').trim();
        title = String(title || '').trim();
        if (!sessionId || !title) return Promise.reject(new Error('缺少参数'));
        return fetchJson('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId), {
            method: 'PATCH',
            body: JSON.stringify({ title: title })
        }).then(function (data) {
            if (data.session && data.session.id === state.sessionId) {
                applySessionTitleUpdate(data.session);
                dispatch('tc-wb-session-title-updated', { session: data.session });
            }
            return data.session || null;
        });
    }

    function tryAutoNameFromFirstMessage(text) {
        text = String(text || '').trim();
        if (!text) return Promise.resolve(null);
        state.pendingAutoNamePrompt = text;
        return flushPendingAutoNameFromFirstMessage();
    }

    function flushPendingAutoNameFromFirstMessage() {
        var prompt = String(state.pendingAutoNamePrompt || '').trim();
        if (!prompt || state.titleAutoNaming) {
            return Promise.resolve(null);
        }
        return ensureSession().then(function (sessionId) {
            if (!sessionId || !shouldAutoNameFromFirstMessage()) {
                return null;
            }
            state.pendingAutoNamePrompt = null;
            var previewTitle = fallbackTitleFromPrompt(prompt);
            if (!isDefaultSessionTitle(previewTitle)) {
                applySessionTitleUpdate({ id: state.sessionId, title: previewTitle });
            }
            state.titleAutoNaming = true;
            return fetchJson(
                '/api/test-cases/workbench-sessions/' + encodeURIComponent(state.sessionId) + '/generate-title',
                {
                    method: 'POST',
                    body: JSON.stringify({ user_prompt: prompt })
                }
            ).then(function (data) {
                if (data.error) return null;
                if (data.skipped) {
                    if (data.session && data.session.title && !isDefaultSessionTitle(data.session.title)) {
                        state.awaitingFirstMessageTitle = false;
                        applySessionTitleUpdate(data.session);
                    }
                    return null;
                }
                if (data.session && data.session.title && !isDefaultSessionTitle(data.session.title)) {
                    state.awaitingFirstMessageTitle = false;
                    applySessionTitleUpdate(data.session);
                    dispatch('tc-wb-session-title-updated', {
                        session: data.session,
                        generated: !!data.generated
                    });
                    refreshHistoryList();
                }
                return data;
            }).catch(function () {
                if (shouldAutoNameFromFirstMessage() && !isDefaultSessionTitle(previewTitle)) {
                    updateSessionTitle(state.sessionId, previewTitle).then(function (session) {
                        if (session) {
                            state.awaitingFirstMessageTitle = false;
                            applySessionTitleUpdate(session);
                            refreshHistoryList();
                        }
                    }).catch(function () { /* ignore */ });
                }
                return null;
            }).finally(function () {
                state.titleAutoNaming = false;
            });
        });
    }

    function beginEditHistoryTitle(item, titleEl) {
        if (!item || !titleEl || titleEl.dataset.editing === '1') return;
        titleEl.dataset.editing = '1';
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'tc-wb-history-list__title-input';
        input.value = item.title || '';
        input.maxLength = 200;
        titleEl.replaceWith(input);
        input.focus();
        input.select();
        var committed = false;
        function commit() {
            if (committed) return;
            committed = true;
            var val = String(input.value || '').trim();
            if (!val || val === (item.title || '')) {
                refreshHistoryList();
                return;
            }
            updateSessionTitle(item.id, val).then(function () {
                refreshHistoryList();
            }).catch(function () {
                refreshHistoryList();
            });
        }
        input.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                committed = true;
                refreshHistoryList();
            }
        });
        input.addEventListener('click', function (e) {
            e.stopPropagation();
        });
        input.addEventListener('blur', commit);
    }

    function deleteSession(sessionId, opts) {
        opts = opts || {};
        sessionId = String(sessionId || '').trim();
        if (!sessionId) return Promise.reject(new Error('缺少 sessionId'));
        return fetch('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId), {
            method: 'DELETE',
            credentials: 'same-origin'
        }).then(function (res) {
            if (res.status === 404 && opts.ignoreNotFound) {
                forgetRememberedSessionId(sessionId);
                return { ok: true, notFound: true };
            }
            return res.json().then(function (body) {
                if (!res.ok) {
                    var err = new Error((body && body.error) || res.statusText || '请求失败');
                    err.status = res.status;
                    throw err;
                }
                forgetRememberedSessionId(sessionId);
                return body;
            });
        });
    }

    function confirmDeleteHistorySession(item) {
        item = item || {};
        var title = String(item.title || '新会话').trim() || '新会话';
        var message = '将永久删除「' + title + '」，且无法恢复。';
        if (typeof global.tcAppConfirm === 'function') {
            return global.tcAppConfirm(message, {
                title: '删除会话？',
                variant: 'warning',
                confirmText: '删除',
                cancelText: '取消'
            });
        }
        return Promise.resolve(global.confirm(message));
    }

    function performHistorySessionDelete(item) {
        return deleteSession(item.id).then(function () {
            hideSessionLimitBanner();
            if (item.id === state.sessionId) {
                if (state.prefsSaveTimer) {
                    global.clearTimeout(state.prefsSaveTimer);
                    state.prefsSaveTimer = null;
                }
                state.sessionId = null;
                state.currentTurnCount = 0;
                state.currentSessionMeta = null;
                resetTurnMappings();
                return startNewSessionForCurrentContext(true);
            }
            return refreshHistoryList();
        }).catch(function () {
            refreshHistoryList();
        });
    }

    function discardEmptyDraftSessionIfNeeded() {
        if (!state.sessionId || !isCurrentSessionNew()) {
            return Promise.resolve(false);
        }
        var sid = state.sessionId;
        if (state.prefsSaveTimer) {
            global.clearTimeout(state.prefsSaveTimer);
            state.prefsSaveTimer = null;
        }
        state.sessionId = null;
        state.currentTurnCount = 0;
        state.currentSessionMeta = null;
        resetTurnMappings();
        return deleteSession(sid, { ignoreNotFound: true }).then(function () {
            forgetRememberedSessionId(sid);
            return true;
        }).catch(function () {
            forgetRememberedSessionId(sid);
            return false;
        });
    }

    function startNewSessionForCurrentContext(clearChat) {
        var planContext = getPlanContext();
        if (state.sessionId && state.currentPlanContext === planContext && isCurrentSessionNew()) {
            return noopCurrentNewSession();
        }
        return discardEmptyDraftSessionIfNeeded().then(function () {
            return flushSessionStateBeforeLeave();
        }).then(function () {
            return createNewSession({ planContext: planContext, clearChat: clearChat });
        }).then(function (session) {
            refreshHistoryList();
            return session;
        });
    }

    function bootstrapEntrySession(opts) {
        opts = opts || {};
        var planContext = opts.planContext || getPlanContext();
        var url = '/api/test-cases/workbench-sessions/entry?plan_context=' +
            encodeURIComponent(planContext);
        return fetchJson(url).then(function (data) {
            handleSessionStartResponse({
                session: data.session,
                turns: data.turns || [],
                created: !!data.created,
                limit_reached: !!data.limit_reached,
                reused_draft: !!data.reused_draft
            }, {
                planContext: planContext,
                clearChat: opts.clearChat !== false,
                forceRestore: opts.forceRestore != null ? !!opts.forceRestore : (opts.clearChat !== false),
                resetLanhuConfig: shouldResetGenAreaForSessionStart(data)
            });
            updateHistoryPanelHead();
            return refreshHistoryList().then(function () {
                dispatch('tc-wb-entry-session-ready', {
                    session: data.session || null,
                    planContext: planContext,
                    created: !!data.created,
                    reusedDraft: !!data.reused_draft,
                    limitReached: !!data.limit_reached,
                    historyEmpty: !(data.history_items && data.history_items.length)
                });
                return data.session || null;
            });
        }).catch(function (err) {
            if (opts.fallbackCreate === false) throw err;
            return createNewSession({
                planContext: planContext,
                clearChat: opts.clearChat !== false
            }).then(function (session) {
                return refreshHistoryList().then(function () {
                    return session;
                });
            });
        });
    }

    function ensureSession() {
        if (state.sessionId && state.currentPlanContext === getPlanContext()) {
            return Promise.resolve(state.sessionId);
        }
        if (state.initPromise) {
            return state.initPromise.then(function () {
                return state.sessionId || null;
            });
        }
        return bootstrapEntrySession({ clearChat: false });
    }

    function isWorkbenchPage() {
        return !!(document.getElementById('tc-wb-history-list') ||
            document.querySelector('.tc-workbench-scope'));
    }

    function init() {
        if (!isWorkbenchPage()) {
            return Promise.resolve(null);
        }
        if (state.initialized && state.sessionId) return Promise.resolve(state.sessionId);
        if (state.initPromise) return state.initPromise;
        syncObservedPlanContext();
        state.initPromise = bootstrapEntrySession({ clearChat: true }).then(function (session) {
            state.initialized = true;
            return flushPendingAutoNameFromFirstMessage().then(function () {
                return session && session.id ? session.id : state.sessionId;
            });
        }).finally(function () {
            state.initPromise = null;
        });
        return state.initPromise;
    }

    function onPlanContextChange(newContext, oldContext) {
        if (!newContext || newContext === oldContext) return Promise.resolve(state.sessionId);
        if (oldContext && state.sessionId && !isSessionEmptyDraft()) {
            rememberActiveSessionForContext(oldContext, state.sessionId);
        }
        return flushSessionStateBeforeLeave().then(function () {
            return discardEmptyDraftSessionIfNeeded();
        }).then(function () {
            resetLiveGenerationUiForContextSwitch();
            var rememberedId = getRememberedSessionIdForContext(newContext);
            if (rememberedId) {
                return restoreSessionForContextSwitch(rememberedId, newContext).then(function (payload) {
                    if (payload && payload.session && payload.session.id) {
                        return refreshHistoryList().then(function () {
                            return payload.session.id;
                        });
                    }
                    return bootstrapEntrySession({
                        planContext: newContext,
                        clearChat: false,
                        forceRestore: true
                    }).then(function (session) {
                        return refreshHistoryList().then(function () {
                            return session && session.id ? session.id : state.sessionId;
                        });
                    });
                });
            }
            return bootstrapEntrySession({
                planContext: newContext,
                clearChat: false,
                forceRestore: true
            }).then(function (session) {
                return refreshHistoryList().then(function () {
                    return session && session.id ? session.id : state.sessionId;
                });
            });
        });
    }

    function enqueuePlanContextChange(newContext, oldContext) {
        state.planContextChangePromise = (state.planContextChangePromise || Promise.resolve())
            .then(function () {
                return onPlanContextChange(newContext, oldContext);
            })
            .catch(function () {
                return null;
            });
        return state.planContextChangePromise;
    }

    function observePlanContext() {
        if (state.bootSyncing) return;
        var ctx = getPlanContext();
        if (state.lastObservedContext === null) {
            state.lastObservedContext = ctx;
            return;
        }
        if (ctx !== state.lastObservedContext) {
            var prev = state.lastObservedContext;
            state.lastObservedContext = ctx;
            enqueuePlanContextChange(ctx, prev);
        }
    }

    function hookPlanContextChanges() {
        if (typeof global.switchTcGenPlanMode === 'function' &&
            !global.switchTcGenPlanMode._tcWbSessionHooked) {
            var origMode = global.switchTcGenPlanMode;
            global.switchTcGenPlanMode = function (mode) {
                var ret = origMode.apply(this, arguments);
                global.setTimeout(observePlanContext, 0);
                return ret;
            };
            global.switchTcGenPlanMode._tcWbSessionHooked = true;
        }
        if (typeof global.switchTcRightView === 'function' &&
            !global.switchTcRightView._tcWbSessionHooked) {
            var origView = global.switchTcRightView;
            global.switchTcRightView = function (mode) {
                var ret = origView.apply(this, arguments);
                global.setTimeout(observePlanContext, 0);
                return ret;
            };
            global.switchTcRightView._tcWbSessionHooked = true;
        }
        if (typeof global.syncTcLeftGenPanelLayout === 'function' &&
            !global.syncTcLeftGenPanelLayout._tcWbSessionHooked) {
            var origLayout = global.syncTcLeftGenPanelLayout;
            global.syncTcLeftGenPanelLayout = function () {
                var ret = origLayout.apply(this, arguments);
                observePlanContext();
                return ret;
            };
            global.syncTcLeftGenPanelLayout._tcWbSessionHooked = true;
        }
        function hookWorkbenchModeSwitch() {
            if (typeof global.switchTcWorkbenchMode !== 'function' ||
                global.switchTcWorkbenchMode._tcWbSessionHooked) {
                return;
            }
            var origWb = global.switchTcWorkbenchMode;
            global.switchTcWorkbenchMode = function (mode) {
                var ret = origWb.apply(this, arguments);
                global.setTimeout(observePlanContext, 0);
                return ret;
            };
            global.switchTcWorkbenchMode._tcWbSessionHooked = true;
        }
        hookWorkbenchModeSwitch();
        global.setTimeout(hookWorkbenchModeSwitch, 0);
        global.setTimeout(hookWorkbenchModeSwitch, 800);
    }

    function getCurrentSessionId() {
        return state.sessionId;
    }

    function getCurrentPlanContext() {
        return state.currentPlanContext || getPlanContext();
    }

    function getCurrentTurnId() {
        return state.currentTurnId;
    }

    function getTurnIdForUserKey(userKey) {
        return state.turnIdByUserKey[userKey] || null;
    }

    function getTurnFromState(turnId) {
        turnId = String(turnId || '').trim();
        if (!turnId) return null;
        var i;
        for (i = 0; i < (state.currentTurns || []).length; i++) {
            var row = state.currentTurns[i];
            if (row && String(row.id || '') === turnId) return row;
        }
        return null;
    }

    function getTurnIdForBatchKey(batchKey) {
        batchKey = String(batchKey || '').trim();
        if (!batchKey) return null;
        return state.turnIdByBatchKey[batchKey] || null;
    }

    function getLatestValidatedTurnId(scope) {
        var turns = (state.currentTurns || []).slice().sort(function (a, b) {
            return (a.turn_index || 0) - (b.turn_index || 0);
        });
        var i;
        for (i = turns.length - 1; i >= 0; i--) {
            var row = turns[i];
            if (!row || !row.id) continue;
            if (row.validation && typeof row.validation === 'object') return row.id;
        }
        return turns.length ? (turns[turns.length - 1].id || null) : null;
    }

    /** 当前会话中 turn_index 最大的轮次（最新一轮）。 */
    function getLatestSessionTurnId() {
        var turns = (state.currentTurns || []).slice().sort(function (a, b) {
            return (a.turn_index || 0) - (b.turn_index || 0);
        });
        if (turns.length) {
            var last = turns[turns.length - 1];
            if (last && last.id) return last.id;
        }
        return state.currentTurnId || null;
    }

    function mergeTurnValidationInState(turnId, payload) {
        turnId = String(turnId || '').trim();
        if (!turnId || !payload) return;
        var idx;
        for (idx = 0; idx < state.currentTurns.length; idx++) {
            var row = state.currentTurns[idx];
            if (!row || row.id !== turnId) continue;
            state.currentTurns[idx] = Object.assign({}, row, {
                validation: payload.validation || null,
                validate_reasoning: payload.validate_reasoning || '',
                batch_meta: payload.batch_meta != null ? payload.batch_meta : row.batch_meta
            });
            break;
        }
    }

    function registerTurnMapping(turnId, userKey, batchValidationKey) {
        turnId = String(turnId || '').trim();
        if (!turnId) return;
        if (userKey) state.turnIdByUserKey[userKey] = turnId;
        state.currentTurnId = turnId;
        var batchKey = String(batchValidationKey || '').trim();
        if (batchKey) state.turnIdByBatchKey[batchKey] = turnId;
    }


    function stripEphemeralChainFields(chain) {
        if (!chain || typeof chain !== 'object') return chain;
        var out = Object.assign({}, chain);
        out.thinkingText = '';
        out.validateThinkingText = '';
        var mod = out.moduleStepThinking;
        if (mod && typeof mod === 'object') {
            out.moduleStepThinking = {
                split_modules: '',
                generate_modules: '',
                module_count: 0,
                generate_module_slots: []
            };
        }
        var stream = out.stream;
        if (stream && typeof stream === 'object') {
            out.stream = Object.assign({}, stream);
            if (!String(out.stream.buffer || '').trim()) {
                out.stream.visible = false;
            }
        }
        var steps = out.steps;
        if (steps && typeof steps === 'object') {
            out.steps = Object.assign({}, steps);
            Object.keys(out.steps).forEach(function (k) {
                var row = out.steps[k];
                if (!row || typeof row !== 'object' || !row.output) return;
                if (k !== 'split_modules') return;
                var output = Object.assign({}, row.output);
                delete output.reasoning_text;
                delete output.module_thinking_slots;
                out.steps[k] = Object.assign({}, row, { output: output });
            });
        }
        return out;
    }

    function saveTurn(opts) {
        opts = opts || {};
        if (opts.keepalive && state.sessionId) {
            saveTurnKeepalive(opts);
            return Promise.resolve(null);
        }
        return ensureSession().then(function (sessionId) {
            if (!sessionId) return null;
            return fetchJson('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId) + '/turns', {
                method: 'POST',
                body: JSON.stringify({
                    turn_index: opts.turnIndex != null ? opts.turnIndex : 0,
                    user_prompt: String(opts.userPrompt || ''),
                    user_mode: String(opts.userMode || ''),
                    lanhu_url: String(
                        opts.lanhuUrl != null ? opts.lanhuUrl : resolveLanhuUrlForTurnArchive(opts)
                    ),
                    chain: opts.chain ? stripEphemeralChainFields(opts.chain) : null,
                    agent_chain: opts.agentChain || null,
                    batch_meta: opts.batchMeta || null,
                    turn_id: opts.turnId || null
                })
            }).then(function (data) {
                var turn = data.turn || null;
                if (turn && turn.id) {
                    upsertTurnInState(turn);
                    registerTurnMapping(turn.id, opts.userKey, opts.batchValidationKey);
                    saveSessionPrefsDebounced();
                    dispatch('tc-wb-turn-saved', {
                        turnId: turn.id,
                        userKey: opts.userKey,
                        batchValidationKey: opts.batchValidationKey || ''
                    });
                    if ((opts.turnIndex != null ? opts.turnIndex : 0) === 0 && opts.userPrompt) {
                        tryAutoNameFromFirstMessage(opts.userPrompt);
                    }
                    state.currentTurnCount = Math.max(state.currentTurnCount || 0, 1);
                    refreshHistoryList();
                }
                return turn;
            });
        });
    }

    function saveTurnKeepalive(opts) {
        opts = opts || {};
        var sessionId = state.sessionId;
        if (!sessionId) return;
        var batchKey = opts.chain && opts.chain.batchValidationKey
            ? String(opts.chain.batchValidationKey)
            : '';
        try {
            fetch('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId) + '/turns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                keepalive: true,
                body: JSON.stringify({
                    turn_index: opts.turnIndex != null ? opts.turnIndex : 0,
                    user_prompt: String(opts.userPrompt || ''),
                    user_mode: String(opts.userMode || ''),
                    lanhu_url: String(
                        opts.lanhuUrl != null ? opts.lanhuUrl : resolveLanhuUrlForTurnArchive(opts)
                    ),
                    chain: opts.chain ? stripEphemeralChainFields(opts.chain) : null,
                    agent_chain: opts.agentChain || null,
                    batch_meta: opts.batchMeta || null,
                    turn_id: opts.turnId || null
                })
            });
        } catch (e) { /* ignore */ }
    }


    function resolveSessionIdForTurnApi(sessionId) {
        return String(sessionId || state.sessionId || '').trim();
    }

    function buildTurnValidationApiUrl(turnId, sessionId, opts) {
        opts = opts || {};
        turnId = String(turnId || '').trim();
        sessionId = resolveSessionIdForTurnApi(sessionId);
        if (!turnId) return '';
        var turnRow = getTurnFromState(turnId);
        var useSessionScoped = !!sessionId;
        if (turnRow && turnRow.id === turnId) {
            useSessionScoped = true;
        } else if (opts.preferTurnScoped || !turnRow) {
            useSessionScoped = false;
        }
        if (useSessionScoped && sessionId) {
            return '/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId) +
                '/turns/' + encodeURIComponent(turnId) + '/validation';
        }
        return '/api/test-cases/workbench-sessions/turns/' + encodeURIComponent(turnId) + '/validation';
    }

    function saveTurnValidation(turnId, validation, reasoning, batchMeta, sessionId) {
        turnId = String(turnId || '').trim();
        if (!turnId || !validation) return Promise.resolve(null);
        var url = buildTurnValidationApiUrl(turnId, sessionId, { preferTurnScoped: true });
        if (!url) return Promise.resolve(null);
        return fetchJson(url, {
            method: 'PUT',
            body: JSON.stringify({
                validation: validation,
                validate_reasoning: String(reasoning || ''),
                batch_meta: batchMeta || null
            })
        }).then(function (data) {
            dispatch('tc-wb-turn-validation-saved', { turnId: turnId });
            return data.turn || null;
        });
    }

    function loadTurnValidation(turnId, forceRefresh, sessionId) {
        turnId = String(turnId || '').trim();
        if (!turnId) return Promise.reject(new Error('缺少 turnId'));
        var url = buildTurnValidationApiUrl(turnId, sessionId, { preferTurnScoped: true });
        if (!url) return Promise.reject(new Error('缺少 turnId'));
        if (forceRefresh) url += (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
        return fetchJson(url);
    }

    /** 质量检查落库前确保当前会话轮次存在（按 session + turn_index upsert，不覆盖已有 validation）。 */
    function ensureTurnForValidation(opts) {
        opts = opts || {};
        var batchKey = String(opts.batchValidationKey || '').trim();
        var turnId = String(opts.turnId || state.currentTurnId || '').trim();
        if (!turnId && batchKey) {
            turnId = String(state.turnIdByBatchKey[batchKey] || '').trim();
        }
        if (turnId) return Promise.resolve(turnId);
        return ensureSession().then(function () {
            if (!state.sessionId) return null;
            var turnIndex = parseInt(state.currentTurnCount, 10);
            if (isNaN(turnIndex) || turnIndex < 0) turnIndex = 0;
            var userPrompt = String(opts.userPrompt || '').trim();
            if (!userPrompt) {
                var promptEl = document.getElementById('ai-prompt');
                userPrompt = promptEl ? String(promptEl.value || '').trim() : '';
            }
            var chain = opts.chain && typeof opts.chain === 'object' ? opts.chain : null;
            if (!chain && batchKey) {
                chain = { batchValidationKey: batchKey };
            }
            var batchMeta = opts.batchMeta && typeof opts.batchMeta === 'object' ? opts.batchMeta : null;
            return saveTurn({
                turnIndex: turnIndex,
                userPrompt: userPrompt,
                userMode: getPlanContext(),
                chain: chain,
                batchMeta: batchMeta,
                batchValidationKey: batchKey,
                turnId: null
            }).then(function (turn) {
                return turn && turn.id ? String(turn.id) : null;
            });
        });
    }

    function flushValidationForBatchKey(batchKey, turnId) {
        batchKey = String(batchKey || '').trim();
        turnId = String(turnId || '').trim();
        if (!turnId) return;
        var enh = global.TcWorkbenchEnhancements;
        if (!enh || typeof enh.getCachedBatchValidation !== 'function') return;
        var turnKey = typeof enh.buildTurnScopedValidationKey === 'function'
            ? enh.buildTurnScopedValidationKey(turnId)
            : ('turn-' + turnId);
        if (batchKey.indexOf('turn-') === 0 && batchKey !== turnKey) {
            batchKey = '';
        } else if (typeof enh.migrateValidationCacheToTurn === 'function' && batchKey) {
            enh.migrateValidationCacheToTurn(batchKey, turnId);
        }
        var cached = enh.getCachedBatchValidation(turnKey);
        if ((!cached || !cached.lastValidation) && batchKey && batchKey.indexOf('turn-') !== 0) {
            cached = enh.getCachedBatchValidation(batchKey);
        }
        if ((!cached || !cached.lastValidation) && typeof enh.resolveTurnScopedValidationFallback === 'function') {
            var payload = enh.resolveTurnScopedValidationFallback(null, turnId, turnKey);
            if (payload && payload.validation) {
                cached = {
                    lastValidation: payload.validation,
                    validateLlmReasoning: payload.validate_reasoning || '',
                    batchSnapshot: payload.batch_meta || null
                };
            }
        }
        if (!cached || !cached.lastValidation) return;
        var batchMeta = typeof enh.buildBatchMetaForTurnFlush === 'function'
            ? enh.buildBatchMetaForTurnFlush(turnId, cached.batchSnapshot)
            : (cached.batchSnapshot && typeof cached.batchSnapshot === 'object'
                ? Object.assign({}, cached.batchSnapshot, { batchValidationKey: turnKey })
                : { batchValidationKey: turnKey });
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.attachTurnIdToValidationCache === 'function' &&
            batchKey) {
            global.TcWorkbenchEnhancements.attachTurnIdToValidationCache(batchKey, turnId);
        }
        registerTurnMapping(turnId, null, turnKey);
        if (batchKey && batchKey !== turnKey) {
            registerTurnMapping(turnId, null, batchKey);
        }
        saveTurnValidation(
            turnId,
            cached.lastValidation,
            cached.validateLlmReasoning || '',
            batchMeta
        ).then(function () {
            patchTurnChainValidationKey(turnId, turnKey);
        });
    }

    function patchTurnChainValidationKey(turnId, turnKey) {
        turnId = String(turnId || '').trim();
        turnKey = String(turnKey || '').trim();
        if (!turnId || !turnKey || !state.sessionId) return Promise.resolve(null);
        var idx = -1;
        var row = null;
        for (var i = 0; i < state.currentTurns.length; i++) {
            if (state.currentTurns[i] && state.currentTurns[i].id === turnId) {
                idx = i;
                row = state.currentTurns[i];
                break;
            }
        }
        if (!row) {
            return Promise.resolve(null);
        }
        var chain = row.chain && typeof row.chain === 'object' ? Object.assign({}, row.chain) : {};
        chain.batchValidationKey = turnKey;
        chain.turnId = turnId;
        state.currentTurns[idx] = Object.assign({}, row, { chain: chain });
        return fetchJson('/api/test-cases/workbench-sessions/' + encodeURIComponent(state.sessionId) + '/turns', {
            method: 'POST',
            body: JSON.stringify({
                turn_index: row && row.turn_index != null ? row.turn_index : (idx >= 0 ? idx : 0),
                user_prompt: row ? String(row.user_prompt || '') : '',
                user_mode: row ? String(row.user_mode || '') : '',
                chain: row && row.chain ? row.chain : { batchValidationKey: turnKey, turnId: turnId },
                turn_id: turnId
            })
        }).then(function (data) { return data.turn || null; }).catch(function () { return null; });
    }

    function onValidationCached(batchKey) {
        batchKey = String(batchKey || '').trim();
        if (!batchKey) return;
        var turnId = state.turnIdByBatchKey[batchKey];
        if (!turnId && batchKey.indexOf('turn-') === 0) {
            turnId = batchKey.slice(5);
        }
        if (!turnId) return;
        var enh = global.TcWorkbenchEnhancements;
        if (enh && typeof enh.getCachedBatchValidation === 'function') {
            var cached = enh.getCachedBatchValidation(batchKey);
            if (!cached && batchKey.indexOf('turn-') === 0) {
                cached = enh.getCachedBatchValidation('turn-' + turnId);
            }
            if (cached && cached.turnId && String(cached.turnId) !== String(turnId)) {
                return;
            }
        }
        flushValidationForBatchKey(batchKey, turnId);
    }

    function onTurnArchived(opts) {
        opts = opts || {};
        var chain = opts.chain || null;
        var agentChain = opts.agentChain || null;
        var batchKey = chain && chain.batchValidationKey ? String(chain.batchValidationKey) : '';
        var turnId = opts.turnId ||
            (agentChain && agentChain.turnId ? String(agentChain.turnId) : '') ||
            (chain && chain.turnId ? String(chain.turnId) : '') ||
            null;
        return saveTurn({
            turnIndex: opts.turnIndex != null ? opts.turnIndex : 0,
            userPrompt: opts.userPrompt,
            userMode: opts.userMode,
            lanhuUrl: resolveLanhuUrlForTurnArchive(opts),
            chain: chain,
            agentChain: agentChain,
            batchMeta: chain && chain.batchValidationKey ? { batchValidationKey: batchKey } : null,
            userKey: opts.userKey,
            batchValidationKey: batchKey,
            turnId: turnId,
            keepalive: !!opts.keepalive
        }).then(function (turn) {
            if (turn && turn.id) {
                var turnKey = 'turn-' + turn.id;
                if (chain && typeof chain === 'object') {
                    chain.batchValidationKey = turnKey;
                    chain.turnId = turn.id;
                }
                registerTurnMapping(turn.id, opts.userKey, batchKey);
                registerTurnMapping(turn.id, null, turnKey);
                if (global.TcWorkbenchEnhancements &&
                    typeof global.TcWorkbenchEnhancements.attachTurnIdToValidationCache === 'function' &&
                    batchKey) {
                    global.TcWorkbenchEnhancements.attachTurnIdToValidationCache(batchKey, turn.id);
                }
                var flushPending = Promise.resolve(null);
                if (global.TcWorkbenchEnhancements &&
                    typeof global.TcWorkbenchEnhancements.flushPendingValidationForTurn === 'function') {
                    flushPending = global.TcWorkbenchEnhancements.flushPendingValidationForTurn(turn.id, batchKey || turnKey);
                }
                flushPending.finally(function () {
                    flushValidationForBatchKey(batchKey || turnKey, turn.id);
                    patchTurnChainValidationKey(turn.id, turnKey);
                });
            }
            return turn;
        });
    }

    function listSessions(limit, planContext) {
        planContext = planContext || getPlanContext();
        var qs = '?plan_context=' + encodeURIComponent(planContext) +
            '&limit=' + encodeURIComponent(limit != null ? limit : MAX_HISTORY);
        if (state.sessionId) {
            qs += '&current_session_id=' + encodeURIComponent(state.sessionId);
        }
        return fetchJson('/api/test-cases/workbench-sessions' + qs).then(function (data) {
            return data.items || [];
        });
    }

    function loadSessionDetail(sessionId) {
        sessionId = String(sessionId || '').trim();
        if (!sessionId) return Promise.reject(new Error('缺少 sessionId'));
        return fetchJson('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId));
    }

    function applySessionDetail(detail) {
        detail = detail || {};
        var sess = detail.session || {};
        var turns = detail.turns || [];
        var planContext = sess.plan_context || getPlanContext();
        applyActiveSession(sess, planContext);
        setCurrentTurns(turns);
        syncAwaitingFirstMessageTitle(sess, { limitReached: false });
        turns.forEach(function (turn) {
            if (turn && turn.id) {
                registerTurnMapping(
                    turn.id,
                    'restored-' + turn.id,
                    turn.chain && turn.chain.batchValidationKey
                );
            }
        });
        syncSessionValidationFromTurns(turns, planContext);
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.syncTurnValidationStepsFromSession === 'function') {
            global.TcWorkbenchEnhancements.syncTurnValidationStepsFromSession(turns);
        }
        dispatch('tc-wb-session-switched', { session: sess, turns: turns, planContext: planContext });
        return { session: sess, turns: turns };
    }

    function switchSession(sessionId) {
        return flushSessionStateBeforeLeave().then(function () {
            return discardEmptyDraftSessionIfNeeded();
        }).then(function () {
            return loadSessionDetail(sessionId);
        }).then(function (detail) {
            if (detail.session && detail.session.plan_context &&
                detail.session.plan_context !== getPlanContext()) {
                return detail;
            }
            return applySessionDetail(detail);
        });
    }

    function formatSessionTime(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return String(iso);
            var pad = function (n) { return n < 10 ? '0' + n : String(n); };
            return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch (e) {
            return String(iso);
        }
    }

    function updateHistoryPanelHead() {
        var titleEl = document.querySelector('#tc-wb-history-panel .tc-wb-history-panel__title');
        if (titleEl) {
            titleEl.textContent = '历史会话';
        }
        var hintEl = document.getElementById('tc-wb-history-limit-hint');
        if (hintEl) {
            hintEl.textContent = '最多保留 ' + MAX_HISTORY + ' 条';
        }
    }

    function buildHistoryDisplayItems(items) {
        items = sortHistoryItemsByCreatedAt(items).filter(function (item) {
            return (parseInt(item.turn_count, 10) || 0) > 0;
        });
        if (state.sessionId && state.currentPlanContext === getPlanContext()) {
            var hasCurrent = items.some(function (item) {
                return item && item.id === state.sessionId;
            });
            if (!hasCurrent && state.currentSessionMeta && state.currentSessionMeta.id === state.sessionId) {
                items.unshift(Object.assign({}, state.currentSessionMeta, {
                    turn_count: state.currentTurnCount || 0,
                    is_current_draft: (state.currentTurnCount || 0) === 0
                }));
            }
        }
        return items;
    }

    function sortHistoryItemsByCreatedAt(items) {
        return (items || []).slice().sort(function (a, b) {
            var ta = new Date(a && a.created_at ? a.created_at : 0).getTime();
            var tb = new Date(b && b.created_at ? b.created_at : 0).getTime();
            if (isNaN(ta)) ta = 0;
            if (isNaN(tb)) tb = 0;
            return tb - ta;
        });
    }

    function renderHistoryList(items) {
        var list = document.getElementById('tc-wb-history-list');
        if (!list) return;
        list.innerHTML = '';
        updateHistoryPanelHead();
        items = buildHistoryDisplayItems(items);
        if (!items || !items.length) {
            var empty = document.createElement('li');
            empty.className = 'tc-wb-history-list__empty';
            empty.textContent = '暂无历史会话';
            list.appendChild(empty);
            return;
        }
        items.forEach(function (item) {
            var li = document.createElement('li');
            li.className = 'tc-wb-history-list__item';
            if (item.id === state.sessionId) li.classList.add('tc-wb-history-list__item--active');
            li.setAttribute('data-session-id', item.id);

            var row = document.createElement('div');
            row.className = 'tc-wb-history-list__item-row';

            var main = document.createElement('div');
            main.className = 'tc-wb-history-list__item-main';

            var title = document.createElement('span');
            title.className = 'tc-wb-history-list__title';
            title.textContent = item.title || '新会话';
            title.title = '双击重命名';
            title.addEventListener('dblclick', function (e) {
                e.preventDefault();
                e.stopPropagation();
                beginEditHistoryTitle(item, title);
            });
            var meta = document.createElement('span');
            meta.className = 'tc-wb-history-list__meta';
            if (item.is_current_draft) {
                meta.textContent = '当前会话 · 0 轮';
            } else {
                meta.textContent = formatSessionTime(item.created_at || item.updated_at) +
                    ' · ' + (item.turn_count || 0) + ' 轮';
            }
            main.appendChild(title);
            main.appendChild(meta);

            var renameBtn = document.createElement('button');
            renameBtn.type = 'button';
            renameBtn.className = 'tc-wb-history-list__rename';
            renameBtn.setAttribute('aria-label', '重命名此会话');
            renameBtn.title = '重命名';
            renameBtn.textContent = '重命名';
            renameBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                beginEditHistoryTitle(item, title);
            });

            var delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'tc-wb-history-list__delete';
            delBtn.setAttribute('aria-label', '删除此会话');
            delBtn.title = '删除此会话';
            delBtn.textContent = '删除';
            delBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                confirmDeleteHistorySession(item).then(function (ok) {
                    if (!ok) return;
                    performHistorySessionDelete(item);
                });
            });

            row.appendChild(main);
            row.appendChild(renameBtn);
            row.appendChild(delBtn);
            li.appendChild(row);
            list.appendChild(li);
        });
    }

    function refreshHistoryList() {
        return listSessions(MAX_HISTORY, getPlanContext()).then(renderHistoryList).catch(function () {
            renderHistoryList([]);
        });
    }

    function setHistoryPanelOpen(open) {
        var panel = document.getElementById('tc-wb-history-panel');
        var btn = document.getElementById('tc-wb-history-toggle');
        if (!panel) return;
        panel.classList.toggle('hidden', !open);
        panel.setAttribute('aria-hidden', open ? 'false' : 'true');
        if (btn) {
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.classList.toggle('tc-wb-history-toggle--open', !!open);
        }
        if (open) {
            if (typeof global.maybeCollapseTcLanhuSectionIfExpanded === 'function') {
                global.maybeCollapseTcLanhuSectionIfExpanded();
            }
            refreshHistoryList();
        }
    }

    function shouldSkipTurnsRestore(turns) {
        if (!global.TcGenChatXUi ||
            typeof global.TcGenChatXUi.isRestoreBlockedByLiveActivity !== 'function') {
            return false;
        }
        if (global.TcGenChatXUi.isRestoreBlockedByLiveActivity(turns || [])) {
            return true;
        }
        if (global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.isSessionActive === 'function' &&
            global.TcGenChatPipeline.isSessionActive()) {
            return true;
        }
        return false;
    }

    function restoreChatFromTurns(turns, opts) {
        opts = opts || {};
        turns = turns || [];
        if (!opts.force && shouldSkipTurnsRestore(turns)) {
            state.pendingTurnsRestore = null;
            return;
        }
        var planContext = state.currentPlanContext || getPlanContext();
        if (isEditPlanContext(planContext)) {
            if (global.TcEditChat && typeof global.TcEditChat.restoreFromTurns === 'function') {
                global.TcEditChat.restoreFromTurns(turns, opts);
                state.pendingTurnsRestore = null;
                return;
            }
        }
        if (global.TcGenChatXUi && typeof global.TcGenChatXUi.restoreFromTurns === 'function') {
            global.TcGenChatXUi.restoreFromTurns(turns, { force: !!opts.force });
            state.pendingTurnsRestore = null;
            return;
        }
        state.pendingTurnsRestore = turns;
        dispatch('tc-wb-restore-turns', { turns: turns });
    }

    function flushPendingTurnsRestore() {
        if (state.pendingTurnsRestore === null) return;
        var planContext = state.currentPlanContext || getPlanContext();
        if (isEditPlanContext(planContext)) {
            if (global.TcEditChat && typeof global.TcEditChat.restoreFromTurns === 'function') {
                var pendingEdit = state.pendingTurnsRestore;
                if (shouldSkipTurnsRestore(pendingEdit)) {
                    state.pendingTurnsRestore = null;
                    return;
                }
                global.TcEditChat.restoreFromTurns(pendingEdit);
                state.pendingTurnsRestore = null;
                return;
            }
        }
        if (global.TcGenChatXUi && typeof global.TcGenChatXUi.restoreFromTurns === 'function') {
            var pending = state.pendingTurnsRestore;
            if (shouldSkipTurnsRestore(pending)) {
                state.pendingTurnsRestore = null;
                return;
            }
            global.TcGenChatXUi.restoreFromTurns(pending);
            state.pendingTurnsRestore = null;
        }
    }

    function isSessionInteractionBlocked() {
        if (typeof global.isTcLeftPanelNavLocked === 'function' && global.isTcLeftPanelNavLocked()) {
            return true;
        }
        if (typeof global.isTcPromptSendLocked === 'function' && global.isTcPromptSendLocked()) {
            return true;
        }
        return false;
    }

    function syncSessionNavLockUi(locked) {
        locked = !!locked;
        var lockTitle = '';
        if (locked && global.TcLeftPanelLock &&
            typeof global.TcLeftPanelLock.getSessionNavLockTitle === 'function') {
            lockTitle = global.TcLeftPanelLock.getSessionNavLockTitle();
        } else if (locked) {
            lockTitle = '用例生成进行中，请稍候';
        }
        var toggleBtn = document.getElementById('tc-wb-history-toggle');
        var newChatBtn = document.getElementById('tc-wb-new-chat-btn');
        var newBtn = document.getElementById('tc-wb-history-new');
        [
            { el: toggleBtn, openTitle: '查看历史会话' },
            { el: newChatBtn, openTitle: '开启新对话，清空当前对话区' },
            { el: newBtn, openTitle: '新建会话' }
        ].forEach(function (item) {
            var btn = item.el;
            if (!btn) return;
            btn.disabled = locked;
            btn.classList.toggle('tc-session-nav-btn--locked', locked);
            if (locked) {
                btn.setAttribute('aria-disabled', 'true');
                btn.title = lockTitle;
            } else {
                btn.removeAttribute('aria-disabled');
                btn.title = item.openTitle;
            }
        });
        if (locked) setHistoryPanelOpen(false);
    }

    global.syncTcSessionNavLockUi = syncSessionNavLockUi;

    function sessionInteractionBlockedToast() {
        if (typeof global.tcAppToast !== 'function') return;
        var qcBusy = global.TcLeftPanelLock && typeof global.TcLeftPanelLock.isQualityCheckBusy === 'function' &&
            global.TcLeftPanelLock.isQualityCheckBusy();
        var editBusy = global.TcLeftPanelLock && typeof global.TcLeftPanelLock.isEditLocked === 'function' &&
            global.TcLeftPanelLock.isEditLocked();
        var msg = qcBusy ? '质量检查进行中，请稍候'
            : (editBusy ? '智能编辑进行中，请稍候' : '用例生成进行中，请稍候');
        global.tcAppToast(msg, { variant: 'warning', duration: 2800 });
    }

    function startNewConversation() {
        if (isSessionInteractionBlocked()) {
            sessionInteractionBlockedToast();
            return Promise.resolve();
        }
        if (isCurrentSessionNew()) {
            return noopCurrentNewSession();
        }
        setHistoryPanelOpen(false);
        return startNewSessionForCurrentContext(true);
    }

    function bindHistoryUi() {
        var toggleBtn = document.getElementById('tc-wb-history-toggle');
        var panel = document.getElementById('tc-wb-history-panel');
        var closeBtn = document.getElementById('tc-wb-history-close');
        var newBtn = document.getElementById('tc-wb-history-new');
        var newChatBtn = document.getElementById('tc-wb-new-chat-btn');
        var list = document.getElementById('tc-wb-history-list');
        var limitClose = document.querySelector('#tc-wb-session-limit-banner .tc-wb-session-limit-banner__close');
        if (limitClose) {
            limitClose.addEventListener('click', function (e) {
                e.preventDefault();
                hideSessionLimitBanner();
            });
        }
        if (!toggleBtn || !panel) return;

        toggleBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (isSessionInteractionBlocked()) {
                sessionInteractionBlockedToast();
                return;
            }
            var open = panel.classList.contains('hidden');
            setHistoryPanelOpen(open);
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', function (e) {
                e.preventDefault();
                setHistoryPanelOpen(false);
            });
        }

        if (newBtn) {
            newBtn.addEventListener('click', function (e) {
                e.preventDefault();
                startNewConversation();
            });
        }

        if (newChatBtn) {
            newChatBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                startNewConversation();
            });
        }

        if (list) {
            list.addEventListener('click', function (e) {
                var li = e.target.closest('.tc-wb-history-list__item[data-session-id]');
                if (!li) return;
                if (isSessionInteractionBlocked()) {
                    sessionInteractionBlockedToast();
                    return;
                }
                var sid = li.getAttribute('data-session-id');
                if (!sid || sid === state.sessionId) {
                    setHistoryPanelOpen(false);
                    return;
                }
                switchSession(sid).then(function (payload) {
                    if (payload && payload.session && payload.session.id) {
                        restoreChatFromTurns(payload.turns || [], { force: true });
                    }
                    setHistoryPanelOpen(false);
                });
            });
        }

        document.addEventListener('click', function (e) {
            if (panel.classList.contains('hidden')) return;
            if (e.target.closest('#tc-wb-history-panel') || e.target.closest('#tc-wb-history-toggle')) return;
            setHistoryPanelOpen(false);
        });
    }

    function boot() {
        if (!isWorkbenchPage()) return;
        initGenerationLeaveHandler();
        bindSessionPrefsHooks();
        global.addEventListener('tc-gen-chat-x-ready', flushPendingTurnsRestore);
        hookPlanContextChanges();
        state.bootSyncing = true;
        state.lastObservedContext = getPlanContext();
        Promise.resolve().then(function () {
            syncObservedPlanContext();
            return init();
        }).then(function () {
            flushPendingTurnsRestore();
            bindHistoryUi();
            updateHistoryPanelHead();
            refreshHistoryList();
            if (typeof global.TcLeftPanelLock &&
                typeof global.TcLeftPanelLock.applyLockUi === 'function') {
                global.TcLeftPanelLock.applyLockUi();
            }
        }).catch(function () {
            bindHistoryUi();
        }).finally(function () {
            state.bootSyncing = false;
            syncObservedPlanContext();
        });
    }

    global.TcWorkbenchSession = {
        init: init,
        ensureSession: ensureSession,
        getCurrentSessionId: getCurrentSessionId,
        getCurrentPlanContext: getCurrentPlanContext,
        getPlanContext: getPlanContext,
        getCurrentTurnId: getCurrentTurnId,
        getTurnIdForUserKey: getTurnIdForUserKey,
        getTurnFromState: getTurnFromState,
        getTurnIdForBatchKey: getTurnIdForBatchKey,
        getLatestValidatedTurnId: getLatestValidatedTurnId,
        getLatestSessionTurnId: getLatestSessionTurnId,
        mergeTurnValidationInState: mergeTurnValidationInState,
        registerTurnMapping: registerTurnMapping,
        patchTurnChainValidationKey: patchTurnChainValidationKey,
        saveTurn: saveTurn,
        saveTurnValidation: saveTurnValidation,
        loadTurnValidation: loadTurnValidation,
        ensureTurnForValidation: ensureTurnForValidation,
        onTurnArchived: onTurnArchived,
        onValidationCached: onValidationCached,
        listSessions: listSessions,
        switchSession: switchSession,
        createNewSession: createNewSession,
        deleteSession: deleteSession,
        startNewSessionForCurrentContext: startNewSessionForCurrentContext,
        startNewConversation: startNewConversation,
        toggleHistoryPanel: function () {
            var panel = document.getElementById('tc-wb-history-panel');
            if (!panel) return;
            setHistoryPanelOpen(panel.classList.contains('hidden'));
        },
        showSessionLimitBanner: showSessionLimitBanner,
        hideSessionLimitBanner: hideSessionLimitBanner,
        refreshHistoryList: refreshHistoryList,
        updateSessionTitle: updateSessionTitle,
        tryAutoNameFromFirstMessage: tryAutoNameFromFirstMessage,
        collectSessionPrefs: collectSessionPrefs,
        applySessionPrefs: applySessionPrefs,
        clearLanhuRequirementConfig: clearLanhuRequirementConfig,
        saveSessionPrefsNow: saveSessionPrefsNow,
        bootstrapEntrySession: bootstrapEntrySession,
        getCurrentLanhuUrlForGen: getCurrentLanhuUrlForGen,
        resolveLanhuUrlForTurnArchive: resolveLanhuUrlForTurnArchive,
        getPreviousUserPromptsForCurrentLanhu: getPreviousUserPromptsForCurrentLanhu,
        setCurrentTurns: setCurrentTurns,
        getCurrentTurnCount: function () { return state.currentTurnCount || 0; },
        syncPlanContextFromWorkbench: observePlanContext
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(window));
