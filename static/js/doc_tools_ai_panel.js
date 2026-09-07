/**
 * 文档工具 · AI 悬浮助手面板（仅当前会话，无历史、无文件上传）
 * 与 column_fill / dtk-vxe-table 完全隔离。
 */
(function () {
    'use strict';

    var sessionMessages = [];
    var panelOpen = false;
    var hasImported = false;
    var sendRunning = false;
    var streamAbort = null;
    var msgSeq = 0;

    function getInputEl() {
        return document.getElementById('cf-doc-ai-panel-input');
    }

    function nextMsgId() {
        msgSeq += 1;
        return 'cf-doc-ai-msg-' + msgSeq;
    }

    var DOC_TOOLS_SEND_ICON = '<span class="cf-doc-ai-panel__send-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></span><span class="cf-doc-ai-panel__send-text">发送</span>';
    var DOC_TOOLS_PAUSE_ICON = '<span class="cf-doc-ai-panel__send-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></span>';

    function syncSendBtnState() {
        var sendBtn = document.getElementById('cf-doc-ai-panel-send');
        var input = getInputEl();
        if (!sendBtn) return;
        var hasText = !!(input && String(input.value || '').trim());
        if (sendRunning) {
            sendBtn.disabled = false;
            sendBtn.classList.add('is-pause');
            sendBtn.setAttribute('aria-label', '暂停');
            sendBtn.innerHTML = DOC_TOOLS_PAUSE_ICON;
        } else {
            sendBtn.classList.remove('is-pause');
            sendBtn.disabled = !hasText;
            sendBtn.setAttribute('aria-label', '发送');
            sendBtn.innerHTML = DOC_TOOLS_SEND_ICON;
        }
        sendBtn.setAttribute('aria-busy', sendRunning ? 'true' : 'false');
    }

    function abortDocToolsStream() {
        if (streamAbort) {
            try { streamAbort.abort(); } catch (e1) { /* ignore */ }
        }
    }

    function renderMessages() {
        var container = document.getElementById('cf-doc-ai-panel-messages');
        if (!container) return;
        container.innerHTML = '';
        sessionMessages.forEach(function (msg) {
            var row = document.createElement('div');
            row.className = 'cf-doc-ai-panel__msg cf-doc-ai-panel__msg--' + msg.role;
            if (msg.pending) row.classList.add('cf-doc-ai-panel__msg--pending');
            if (msg.variant === 'error') row.classList.add('cf-doc-ai-panel__msg--error');
            var bubble = document.createElement('div');
            bubble.className = 'cf-doc-ai-panel__bubble';
            if (msg.id) bubble.setAttribute('data-msg-id', msg.id);
            bubble.textContent = msg.text;
            row.appendChild(bubble);
            container.appendChild(row);
        });
        container.scrollTop = container.scrollHeight;
    }

    function findMessageById(id) {
        for (var i = 0; i < sessionMessages.length; i += 1) {
            if (sessionMessages[i].id === id) return sessionMessages[i];
        }
        return null;
    }

    function updateMessageById(id, patch) {
        var msg = findMessageById(id);
        if (!msg) return;
        Object.keys(patch || {}).forEach(function (key) {
            msg[key] = patch[key];
        });
        var bubble = document.querySelector('[data-msg-id="' + id + '"]');
        if (bubble && patch && Object.prototype.hasOwnProperty.call(patch, 'text')) {
            bubble.textContent = msg.text;
        }
        if (bubble && patch && Object.prototype.hasOwnProperty.call(patch, 'pending')) {
            var row = bubble.closest('.cf-doc-ai-panel__msg');
            if (row) row.classList.toggle('cf-doc-ai-panel__msg--pending', !!msg.pending);
        }
        if (bubble && patch && Object.prototype.hasOwnProperty.call(patch, 'variant')) {
            var row2 = bubble.closest('.cf-doc-ai-panel__msg');
            if (row2) row2.classList.toggle('cf-doc-ai-panel__msg--error', msg.variant === 'error');
        }
        var container = document.getElementById('cf-doc-ai-panel-messages');
        if (container) container.scrollTop = container.scrollHeight;
    }

    function appendMessage(role, text, options) {
        options = options || {};
        var content = String(text != null ? text : '').trim();
        if (!content && !options.allowEmpty) return null;
        var id = options.id || nextMsgId();
        var item = {
            role: role,
            text: content,
            ts: Date.now(),
            id: id,
            pending: !!options.pending,
            variant: options.variant || ''
        };
        sessionMessages.push(item);
        renderMessages();
        return id;
    }

    function resetSession() {
        if (streamAbort) {
            try { streamAbort.abort(); } catch (e1) { /* ignore */ }
        }
        streamAbort = null;
        sendRunning = false;
        sessionMessages = [];
        renderMessages();
        panelOpen = false;
        closePanel(false);
        var input = getInputEl();
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }
        syncSendBtnState();
    }

    function openPanel() {
        var panel = document.getElementById('cf-doc-ai-panel');
        var fab = document.getElementById('cf-doc-ai-fab');
        if (!panel) return;
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');
        panelOpen = true;
        if (fab) fab.setAttribute('aria-expanded', 'true');
        if (!sessionMessages.length) {
            appendMessage('assistant', '您好，请描述您希望对当前表格进行的 AI 编辑操作。');
        }
        var input = getInputEl();
        if (input) input.focus();
        syncSendBtnState();
    }

    function closePanel(updateFab) {
        if (typeof updateFab === 'undefined') updateFab = true;
        var panel = document.getElementById('cf-doc-ai-panel');
        var fab = document.getElementById('cf-doc-ai-fab');
        if (panel) {
            panel.classList.add('hidden');
            panel.setAttribute('aria-hidden', 'true');
        }
        panelOpen = false;
        if (updateFab && fab) fab.setAttribute('aria-expanded', 'false');
    }

    function togglePanel() {
        if (panelOpen) closePanel(true);
        else openPanel();
    }

    function fetchMe() {
        if (globalThis.HfAuthNav && typeof globalThis.HfAuthNav.fetchMe === 'function') {
            return globalThis.HfAuthNav.fetchMe();
        }
        return fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
    }

    function openDocToolsAiConfigModal() {
        var modal = document.getElementById('cf-doc-ai-config-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        var openBtn = document.getElementById('cf-doc-ai-config-open');
        if (openBtn) openBtn.focus();
    }

    function closeDocToolsAiConfigModal() {
        var modal = document.getElementById('cf-doc-ai-config-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }

    function ensureDocToolsAiReady() {
        return fetchMe().then(function (me) {
            if (!me || !me.authenticated) {
                if (globalThis.HfAuthNav && typeof globalThis.HfAuthNav.loginUrl === 'function') {
                    globalThis.location.href = globalThis.HfAuthNav.loginUrl();
                }
                return false;
            }
            return true;
        });
    }

    function readTableMatrix() {
        var reader = globalThis.readDocToolsTableMatrixFromGrid;
        if (typeof reader !== 'function') {
            return Promise.reject(new Error('表格读取功能未就绪'));
        }
        return reader();
    }

    function buildConversationHistory() {
        return sessionMessages
            .filter(function (msg) {
                return msg && (msg.role === 'user' || msg.role === 'assistant') && !msg.pending && msg.text;
            })
            .map(function (msg) {
                return { role: msg.role, text: msg.text };
            });
    }

    function parseSseBlock(block) {
        var lines = String(block || '').split('\n');
        for (var i = 0; i < lines.length; i += 1) {
            var line = lines[i];
            if (line.indexOf('data:') !== 0) continue;
            try {
                return JSON.parse(line.slice(5).trim());
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    function consumeChatStream(res, handlers) {
        handlers = handlers || {};
        if (!res.body || typeof res.body.getReader !== 'function') {
            return Promise.reject(new Error('浏览器不支持流式响应'));
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';
        function pump() {
            return reader.read().then(function (chunk) {
                if (chunk.done) return;
                buf += decoder.decode(chunk.value, { stream: true });
                var parts = buf.split('\n\n');
                buf = parts.pop() || '';
                parts.forEach(function (block) {
                    var ev = parseSseBlock(block);
                    if (!ev || !ev.type) return;
                    if (ev.type === 'content' && ev.delta && typeof handlers.onDelta === 'function') {
                        handlers.onDelta(String(ev.delta));
                    } else if (ev.type === 'reasoning' && ev.content && typeof handlers.onReasoning === 'function') {
                        handlers.onReasoning(String(ev.content), !!ev.replace);
                    } else if (ev.type === 'parsing' && ev.content && typeof handlers.onParsing === 'function') {
                        handlers.onParsing(String(ev.content), !!ev.replace);
                    } else if (ev.type === 'status' && ev.content && typeof handlers.onStatus === 'function') {
                        handlers.onStatus(String(ev.content), !!ev.replace);
                    } else if (ev.type === 'ai_quota' && ev.ai_quota &&
                        typeof globalThis.hfAiQuotaNotify === 'function') {
                        globalThis.hfAiQuotaNotify(ev.ai_quota);
                    } else if (ev.type === 'done' && typeof handlers.onDone === 'function') {
                        handlers.onDone(ev);
                    } else if (ev.type === 'error') {
                        throw new Error(ev.error || 'AI 请求失败');
                    }
                });
                return pump();
            });
        }
        return pump();
    }

    function requestDocToolsChatStream(payload, handlers, signal) {
        return fetch('/api/doc-tools/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
            signal: signal
        }).then(function (res) {
            if (!res.ok) {
                return res.json().then(function (data) {
                    if (typeof globalThis.hfAiQuotaFromErrorBody === 'function' && globalThis.hfAiQuotaFromErrorBody(data)) {
                        throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                    }
                    var err = (data && (data.error || data.message)) || ('HTTP ' + res.status);
                    if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(err)) {
                        throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                    }
                    throw new Error(err);
                }).catch(function (parseErr) {
                    if (parseErr && parseErr.message === (globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__')) {
                        throw parseErr;
                    }
                    if (parseErr && parseErr.message && parseErr.message.indexOf('HTTP') === 0) {
                        throw parseErr;
                    }
                    throw new Error('HTTP ' + res.status);
                });
            }
            return consumeChatStream(res, handlers || {});
        });
    }

    function applyAiMatrixToTable(matrix, sourceMatrix) {
        if (globalThis.applyDocToolsTableMatrixFromAi) {
            return globalThis.applyDocToolsTableMatrixFromAi(matrix, sourceMatrix);
        }
        var table = globalThis.DocToolsVxeTable;
        if (!table || typeof table.loadFromMatrix !== 'function') {
            return Promise.reject(new Error('表格组件未就绪'));
        }
        var normalized = matrix;
        if (globalThis.DocToolsAiResponse && typeof globalThis.DocToolsAiResponse.validateMatrixAgainstSource === 'function') {
            normalized = globalThis.DocToolsAiResponse.validateMatrixAgainstSource(matrix, sourceMatrix);
        }
        return table.ensureReady().then(function () {
            table.loadFromMatrix(normalized);
        });
    }

    var DOC_TOOLS_AI_MSG = {
        thinking: '正在思考…',
        parsing: '正在解析 AI 返回的表格数据…'
    };

    function showDocToolsAiPhaseMessage(assistantId, phase, customText) {
        var text = String(customText || '').trim();
        if (!text) {
            text = phase === 'parsing' ? DOC_TOOLS_AI_MSG.parsing : DOC_TOOLS_AI_MSG.thinking;
        }
        updateMessageById(assistantId, { text: text, pending: true, phase: phase });
    }

    function finishDocToolsAiTurn(assistantId, summary, matrix, sourceMatrix) {
        var text = String(summary || '').trim() || '已完成智能编辑';
        if (!Array.isArray(matrix) || !matrix.length) {
            updateMessageById(assistantId, { text: text, pending: false, phase: 'done' });
            return Promise.resolve();
        }
        showDocToolsAiPhaseMessage(assistantId, 'parsing', DOC_TOOLS_AI_MSG.parsing);
        return applyAiMatrixToTable(matrix, sourceMatrix)
            .then(function () {
                updateMessageById(assistantId, { text: text, pending: false, phase: 'done' });
            })
            .catch(function (err) {
                updateMessageById(assistantId, {
                    text: (err && err.message) || '表格更新失败',
                    pending: false,
                    phase: 'error',
                    variant: 'error'
                });
            });
    }

    function sendMessage() {
        if (sendRunning) {
            abortDocToolsStream();
            return;
        }
        var input = getInputEl();
        if (!input) return;
        var text = String(input.value || '').trim();
        if (!text) return;

        sendRunning = true;
        syncSendBtnState();

        ensureDocToolsAiReady().then(function (ready) {
            if (!ready) {
                sendRunning = false;
                syncSendBtnState();
                return;
            }

            return readTableMatrix().then(function (matrix) {
                var sourceMatrix = matrix || [];
                appendMessage('user', text);
                input.value = '';
                input.style.height = 'auto';
                syncSendBtnState();

                var assistantId = appendMessage('assistant', DOC_TOOLS_AI_MSG.thinking, { pending: true, allowEmpty: true, phase: 'thinking' });
                var assistantText = '';
                var reasoningText = '';
                var aiDisplayPhase = 'thinking';
                var pendingApply = null;

                streamAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;

                var payload = {
                    message: text,
                    table_matrix: sourceMatrix,
                    conversation_history: buildConversationHistory().slice(0, -1)
                };
                var handlers = {
                    onReasoning: function (content, replace) {
                        if (aiDisplayPhase === 'parsing') return;
                        aiDisplayPhase = 'thinking';
                        reasoningText = replace ? content : (reasoningText + content);
                        showDocToolsAiPhaseMessage(assistantId, 'thinking', reasoningText);
                    },
                    onParsing: function (content) {
                        aiDisplayPhase = 'parsing';
                        showDocToolsAiPhaseMessage(assistantId, 'parsing', content);
                    },
                    onStatus: function (content) {
                        if (aiDisplayPhase === 'parsing') {
                            showDocToolsAiPhaseMessage(assistantId, 'parsing', content);
                            return;
                        }
                        if (String(content || '').indexOf('解析') >= 0) {
                            aiDisplayPhase = 'parsing';
                            showDocToolsAiPhaseMessage(assistantId, 'parsing', content);
                            return;
                        }
                        if (aiDisplayPhase !== 'thinking') return;
                        if (reasoningText) {
                            showDocToolsAiPhaseMessage(assistantId, 'thinking', reasoningText);
                            return;
                        }
                        showDocToolsAiPhaseMessage(assistantId, 'thinking', content);
                    },
                    onDelta: function (delta) {
                        assistantText += delta;
                        if (assistantText.indexOf('{') >= 0 || assistantText.indexOf('```') >= 0) {
                            aiDisplayPhase = 'parsing';
                            showDocToolsAiPhaseMessage(assistantId, 'parsing', DOC_TOOLS_AI_MSG.parsing);
                            return;
                        }
                        if (aiDisplayPhase === 'parsing') return;
                        aiDisplayPhase = 'thinking';
                        if (reasoningText) {
                            showDocToolsAiPhaseMessage(assistantId, 'thinking', reasoningText);
                            return;
                        }
                        showDocToolsAiPhaseMessage(assistantId, 'thinking', assistantText);
                    },
                    onDone: function (ev) {
                        if (ev && ev.success && Array.isArray(ev.matrix)) {
                            pendingApply = finishDocToolsAiTurn(
                                assistantId,
                                ev.summary || ev.content,
                                ev.matrix,
                                sourceMatrix
                            );
                            return;
                        }
                        var parsed = null;
                        if (globalThis.DocToolsAiResponse && typeof globalThis.DocToolsAiResponse.parse === 'function') {
                            try {
                                parsed = globalThis.DocToolsAiResponse.parse(
                                    String((ev && ev.content) || assistantText || '')
                                );
                            } catch (parseErr) { /* fallback below */ }
                        }
                        if (parsed && parsed.matrix) {
                            pendingApply = finishDocToolsAiTurn(
                                assistantId,
                                parsed.summary,
                                parsed.matrix,
                                sourceMatrix
                            );
                            return;
                        }
                        var finalText = String((ev && (ev.summary || ev.content)) || assistantText || '').trim();
                        updateMessageById(assistantId, {
                            text: finalText || 'AI 未返回有效表格数据',
                            pending: false,
                            variant: 'error'
                        });
                    }
                };

                return requestDocToolsChatStream(
                    payload,
                    handlers,
                    streamAbort ? streamAbort.signal : undefined
                )
                    .catch(function (err) {
                        var errMsg = (err && err.message) ? err.message : 'AI 请求失败';
                        if (/登录|login/i.test(errMsg)) {
                            var idx = sessionMessages.findIndex(function (m) { return m.id === assistantId; });
                            if (idx >= 0) sessionMessages.splice(idx, 1);
                            renderMessages();
                            return;
                        }
                        if (errMsg === (globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__')) {
                            var qIdx = sessionMessages.findIndex(function (m) { return m.id === assistantId; });
                            if (qIdx >= 0) sessionMessages.splice(qIdx, 1);
                            renderMessages();
                            return;
                        }
                        if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(errMsg)) {
                            var qIdx2 = sessionMessages.findIndex(function (m) { return m.id === assistantId; });
                            if (qIdx2 >= 0) sessionMessages.splice(qIdx2, 1);
                            renderMessages();
                            return;
                        }
                        updateMessageById(assistantId, {
                            text: errMsg,
                            pending: false,
                            variant: 'error'
                        });
                    })
                    .then(function () {
                        if (pendingApply) return pendingApply;
                    })
                    .finally(function () {
                        sendRunning = false;
                        streamAbort = null;
                        syncSendBtnState();
                    });
            }).catch(function (err) {
                appendMessage('assistant', (err && err.message) || '无法读取表格数据', { variant: 'error' });
                sendRunning = false;
                streamAbort = null;
                syncSendBtnState();
            });
        });
    }

    function syncImportState(imported) {
        hasImported = !!imported;
        var fab = document.getElementById('cf-doc-ai-fab');
        if (fab) fab.classList.toggle('hidden', !hasImported);
        if (!hasImported) resetSession();
    }

    function initDocToolsAiConfigModal() {
        var modal = document.getElementById('cf-doc-ai-config-modal');
        if (!modal) return;

        var cancelBtn = document.getElementById('cf-doc-ai-config-cancel');
        var closeBtn = document.getElementById('cf-doc-ai-config-close');
        var openBtn = document.getElementById('cf-doc-ai-config-open');

        function close() { closeDocToolsAiConfigModal(); }

        if (cancelBtn) cancelBtn.addEventListener('click', close);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (openBtn) {
            openBtn.addEventListener('click', function () {
                close();
                if (globalThis.HfUserAiConfig && typeof globalThis.HfUserAiConfig.openModal === 'function') {
                    globalThis.HfUserAiConfig.openModal();
                }
            });
        }
        modal.addEventListener('click', function (e) {
            if (e.target === modal) close();
        });

        globalThis.addEventListener('hf-user-ai-config-updated', function (ev) {
            var detail = ev && ev.detail;
            if (detail && detail.configured) closeDocToolsAiConfigModal();
        });
    }

    function initDocToolsAiPanel() {
        if (!document.body.classList.contains('doc-tools-page')) return;
        if (!document.getElementById('cf-doc-ai-fab')) return;

        var fab = document.getElementById('cf-doc-ai-fab');
        var closeBtn = document.getElementById('cf-doc-ai-panel-close');
        var sendBtn = document.getElementById('cf-doc-ai-panel-send');
        var input = getInputEl();

        initDocToolsAiConfigModal();

        if (fab) fab.addEventListener('click', togglePanel);
        if (closeBtn) closeBtn.addEventListener('click', function () { closePanel(true); });
        if (sendBtn) sendBtn.addEventListener('click', sendMessage);
        if (input) {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            input.addEventListener('input', function () {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 120) + 'px';
                syncSendBtnState();
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && panelOpen) closePanel(true);
        });

        syncImportState(false);
        syncSendBtnState();
    }

    globalThis.DocToolsAiPanel = {
        syncImportState: syncImportState,
        resetSession: resetSession,
        open: openPanel,
        close: function () { closePanel(true); },
        appendMessage: appendMessage,
        getMessages: function () { return sessionMessages.slice(); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDocToolsAiPanel);
    } else {
        initDocToolsAiPanel();
    }
})();
