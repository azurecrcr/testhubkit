/**
 * 压测造数 AI 对话落库客户端（旁路）：session/turn id + apply 回写。
 * 不改 apply 核心，失败静默忽略。
 */
(function (global) {
    'use strict';

    var SESSION_KEY = 'jms_ai_chat_session_id_v1';
    var APPLY_URL = '/api/jmeter-scenario/ai/chat/apply-result';
    var _activeTurnId = null;

    function _uuid() {
        try {
            if (global.crypto && typeof global.crypto.randomUUID === 'function') {
                return global.crypto.randomUUID().replace(/-/g, '');
            }
        } catch (e1) { /* ignore */ }
        return 't' + String(Date.now()) + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
    }

    function getOrCreateSessionId() {
        try {
            var sid = global.localStorage && global.localStorage.getItem(SESSION_KEY);
            if (sid && String(sid).trim()) return String(sid).trim();
            sid = _uuid();
            if (global.localStorage) global.localStorage.setItem(SESSION_KEY, sid);
            return sid;
        } catch (e2) {
            return _uuid();
        }
    }

    function newTurnId() {
        _activeTurnId = _uuid();
        return _activeTurnId;
    }

    function getActiveTurnId() {
        return _activeTurnId;
    }

    function buildRequestMeta(extra) {
        var meta = {
            client_session_id: getOrCreateSessionId(),
            client_turn_id: getActiveTurnId() || newTurnId()
        };
        if (extra && typeof extra === 'object') {
            Object.keys(extra).forEach(function (k) {
                meta[k] = extra[k];
            });
        }
        return meta;
    }

    function injectMeta(body, opts) {
        opts = opts || {};
        var out = body && typeof body === 'object' ? Object.assign({}, body) : {};
        var turnId = opts.reuseTurn ? (getActiveTurnId() || newTurnId()) : newTurnId();
        out.client_session_id = getOrCreateSessionId();
        out.client_turn_id = turnId;
        if (opts.tgName) out.tg_name = String(opts.tgName);
        else if (out.thread_group_name && !out.tg_name) out.tg_name = String(out.thread_group_name);
        return out;
    }

    function summarizeApplyResult(applyResult) {
        if (!applyResult || typeof applyResult !== 'object') {
            return { added: 0, updated: 0, replaced: 0, errors: [] };
        }
        var errors = Array.isArray(applyResult.errors) ? applyResult.errors.slice(0, 40).map(function (e) {
            if (typeof e === 'string') return e.slice(0, 500);
            try { return JSON.stringify(e).slice(0, 500); } catch (e3) { return String(e).slice(0, 500); }
        }) : [];
        return {
            added: Number(applyResult.added || 0) || 0,
            updated: Number(applyResult.updated || 0) || 0,
            replaced: Number(applyResult.replaced || 0) || 0,
            errors: errors
        };
    }

    function reportApplyResult(applyResult, opts) {
        opts = opts || {};
        var turnId = opts.client_turn_id || getActiveTurnId();
        if (!turnId) return;
        var payload = {
            client_turn_id: turnId,
            apply_result: summarizeApplyResult(applyResult)
        };
        try {
            fetch(APPLY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            }).catch(function () { /* ignore */ });
        } catch (e4) { /* ignore */ }
    }

    global.JmsAiChatLogClientV1 = {
        SESSION_KEY: SESSION_KEY,
        APPLY_URL: APPLY_URL,
        getOrCreateSessionId: getOrCreateSessionId,
        newTurnId: newTurnId,
        getActiveTurnId: getActiveTurnId,
        buildRequestMeta: buildRequestMeta,
        injectMeta: injectMeta,
        reportApplyResult: reportApplyResult,
        summarizeApplyResult: summarizeApplyResult
    };
})(typeof window !== 'undefined' ? window : this);