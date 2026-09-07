/**
 * 用例工作台 — 对话会话持久化（含各轮质量检查隔离）
 */
(function (global) {
    'use strict';

    var state = {
        sessionId: null,
        initialized: false,
        initPromise: null,
        turnIdByUserKey: {},
        turnIdByBatchKey: {},
        currentTurnId: null
    };

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
    }

    function ensureSession() {
        if (state.sessionId) return Promise.resolve(state.sessionId);
        if (state.initPromise) return state.initPromise;
        state.initPromise = fetchJson('/api/test-cases/workbench-sessions', {
            method: 'POST',
            body: JSON.stringify({})
        }).then(function (data) {
            state.sessionId = data.session && data.session.id ? data.session.id : null;
            state.initialized = true;
            dispatch('tc-wb-session-ready', { sessionId: state.sessionId });
            return state.sessionId;
        }).finally(function () {
            state.initPromise = null;
        });
        return state.initPromise;
    }

    function init() {
        if (state.initialized && state.sessionId) return Promise.resolve(state.sessionId);
        return ensureSession();
    }

    function getCurrentSessionId() {
        return state.sessionId;
    }

    function getCurrentTurnId() {
        return state.currentTurnId;
    }

    function getTurnIdForUserKey(userKey) {
        return state.turnIdByUserKey[userKey] || null;
    }

    function registerTurnMapping(turnId, userKey, batchValidationKey) {
        turnId = String(turnId || '').trim();
        if (!turnId) return;
        if (userKey) state.turnIdByUserKey[userKey] = turnId;
        state.currentTurnId = turnId;
        var batchKey = String(batchValidationKey || '').trim();
        if (batchKey) state.turnIdByBatchKey[batchKey] = turnId;
    }

    function saveTurn(opts) {
        opts = opts || {};
        return ensureSession().then(function (sessionId) {
            if (!sessionId) return null;
            return fetchJson('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId) + '/turns', {
                method: 'POST',
                body: JSON.stringify({
                    turn_index: opts.turnIndex != null ? opts.turnIndex : 0,
                    user_prompt: String(opts.userPrompt || ''),
                    user_mode: String(opts.userMode || ''),
                    chain: opts.chain || null,
                    batch_meta: opts.batchMeta || null,
                    turn_id: opts.turnId || null
                })
            }).then(function (data) {
                var turn = data.turn || null;
                if (turn && turn.id) {
                    registerTurnMapping(turn.id, opts.userKey, opts.batchValidationKey);
                    dispatch('tc-wb-turn-saved', {
                        turnId: turn.id,
                        userKey: opts.userKey,
                        batchValidationKey: opts.batchValidationKey || ''
                    });
                }
                return turn;
            });
        });
    }

    function saveTurnValidation(turnId, validation, reasoning, batchMeta) {
        turnId = String(turnId || '').trim();
        if (!turnId || !validation) return Promise.resolve(null);
        return fetchJson('/api/test-cases/workbench-sessions/turns/' + encodeURIComponent(turnId) + '/validation', {
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

    function loadTurnValidation(turnId) {
        turnId = String(turnId || '').trim();
        if (!turnId) return Promise.reject(new Error('缺少 turnId'));
        return fetchJson('/api/test-cases/workbench-sessions/turns/' + encodeURIComponent(turnId) + '/validation');
    }

    function flushValidationForBatchKey(batchKey, turnId) {
        batchKey = String(batchKey || '').trim();
        turnId = String(turnId || '').trim();
        if (!batchKey || !turnId) return;
        var enh = global.TcWorkbenchEnhancements;
        if (!enh || typeof enh.getCachedBatchValidation !== 'function') return;
        var cached = enh.getCachedBatchValidation(batchKey);
        if (!cached || !cached.lastValidation) return;
        saveTurnValidation(
            turnId,
            cached.lastValidation,
            cached.validateLlmReasoning || '',
            cached.batchSnapshot || null
        );
    }

    function onValidationCached(batchKey) {
        batchKey = String(batchKey || '').trim();
        if (!batchKey) return;
        var turnId = state.turnIdByBatchKey[batchKey] || state.currentTurnId;
        if (!turnId) return;
        flushValidationForBatchKey(batchKey, turnId);
    }

    function onTurnArchived(opts) {
        opts = opts || {};
        var chain = opts.chain || null;
        var batchKey = chain && chain.batchValidationKey ? String(chain.batchValidationKey) : '';
        return saveTurn({
            turnIndex: opts.turnIndex != null ? opts.turnIndex : 0,
            userPrompt: opts.userPrompt,
            userMode: opts.userMode,
            chain: chain,
            batchMeta: chain && chain.batchValidationKey ? { batchValidationKey: batchKey } : null,
            userKey: opts.userKey,
            batchValidationKey: batchKey
        }).then(function (turn) {
            if (turn && turn.id && batchKey) {
                flushValidationForBatchKey(batchKey, turn.id);
            }
            return turn;
        });
    }

    function listSessions(limit) {
        var qs = limit ? '?limit=' + encodeURIComponent(limit) : '';
        return fetchJson('/api/test-cases/workbench-sessions' + qs).then(function (data) {
            return data.items || [];
        });
    }

    function loadSessionDetail(sessionId) {
        sessionId = String(sessionId || '').trim();
        if (!sessionId) return Promise.reject(new Error('缺少 sessionId'));
        return fetchJson('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId));
    }

    function resetTurnMappings() {
        state.turnIdByUserKey = {};
        state.turnIdByBatchKey = {};
        state.currentTurnId = null;
    }

    function applySessionDetail(detail) {
        detail = detail || {};
        var sess = detail.session || {};
        var turns = detail.turns || [];
        state.sessionId = sess.id || state.sessionId;
        resetTurnMappings();
        turns.forEach(function (turn, idx) {
            if (turn && turn.id) {
                registerTurnMapping(turn.id, 'restored-' + turn.id, turn.chain && turn.chain.batchValidationKey);
            }
        });
        dispatch('tc-wb-session-switched', { session: sess, turns: turns });
        return { session: sess, turns: turns };
    }

    function switchSession(sessionId) {
        return loadSessionDetail(sessionId).then(applySessionDetail);
    }

    function createNewSession(title) {
        return fetchJson('/api/test-cases/workbench-sessions', {
            method: 'POST',
            body: JSON.stringify({ title: title || '' })
        }).then(function (data) {
            state.sessionId = data.session && data.session.id ? data.session.id : null;
            resetTurnMappings();
            dispatch('tc-wb-session-created', { session: data.session });
            return data.session;
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

    function renderHistoryList(items) {
        var list = document.getElementById('tc-wb-history-list');
        if (!list) return;
        list.innerHTML = '';
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
            var title = document.createElement('span');
            title.className = 'tc-wb-history-list__title';
            title.textContent = item.title || '未命名会话';
            var meta = document.createElement('span');
            meta.className = 'tc-wb-history-list__meta';
            meta.textContent = formatSessionTime(item.updated_at) + ' · ' + (item.turn_count || 0) + ' 轮';
            li.appendChild(title);
            li.appendChild(meta);
            list.appendChild(li);
        });
    }

    function refreshHistoryList() {
        return listSessions(30).then(renderHistoryList).catch(function () {
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
        if (open) refreshHistoryList();
    }

    function restoreChatFromTurns(turns) {
        turns = turns || [];
        if (global.TcGenChatXUi && typeof global.TcGenChatXUi.restoreFromTurns === 'function') {
            global.TcGenChatXUi.restoreFromTurns(turns);
            return;
        }
        dispatch('tc-wb-restore-turns', { turns: turns });
    }

    function bindHistoryUi() {
        var toggleBtn = document.getElementById('tc-wb-history-toggle');
        var panel = document.getElementById('tc-wb-history-panel');
        var closeBtn = document.getElementById('tc-wb-history-close');
        var newBtn = document.getElementById('tc-wb-history-new');
        var list = document.getElementById('tc-wb-history-list');
        if (!toggleBtn || !panel) return;

        toggleBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
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
                createNewSession().then(function () {
                    restoreChatFromTurns([]);
                    setHistoryPanelOpen(false);
                });
            });
        }

        if (list) {
            list.addEventListener('click', function (e) {
                var li = e.target.closest('.tc-wb-history-list__item[data-session-id]');
                if (!li) return;
                var sid = li.getAttribute('data-session-id');
                if (!sid || sid === state.sessionId) {
                    setHistoryPanelOpen(false);
                    return;
                }
                switchSession(sid).then(function (payload) {
                    restoreChatFromTurns(payload.turns || []);
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
        init().then(function () {
            bindHistoryUi();
        });
    }

    global.TcWorkbenchSession = {
        init: init,
        ensureSession: ensureSession,
        getCurrentSessionId: getCurrentSessionId,
        getCurrentTurnId: getCurrentTurnId,
        getTurnIdForUserKey: getTurnIdForUserKey,
        saveTurn: saveTurn,
        saveTurnValidation: saveTurnValidation,
        loadTurnValidation: loadTurnValidation,
        onTurnArchived: onTurnArchived,
        onValidationCached: onValidationCached,
        listSessions: listSessions,
        switchSession: switchSession,
        createNewSession: createNewSession,
        refreshHistoryList: refreshHistoryList
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(window));
