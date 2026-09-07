/**
 * JMeter 压测 · AI 时间线助手面板（Timeline JSON，仅文字输入）
 * 依赖 JmsVisualBuilder AI 桥接方法，与 doc_tools AI 完全隔离。
 */
(function (global) {
    'use strict';

    var API_URL = '/api/jmeter-scenario/ai/step-edit/stream';
    var sessionMessages = [];
    var panelOpen = false;
    var sendRunning = false;
    var streamAbort = null;
    var msgSeq = 0;
    var activeTgId = null;
    var tgSyncTimer = null;

    function isJmeterTab() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function getInputEl() {
        return global.document.getElementById('jms-ai-panel-input');
    }

    function getFabEl() {
        return global.document.getElementById('jms-ai-fab');
    }

    function nextMsgId() {
        msgSeq += 1;
        return 'jms-ai-msg-' + msgSeq;
    }

    function toast(text, ok) {
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast(text, { variant: ok ? 'success' : 'error', placement: 'bottom' });
        }
    }

    function syncSendBtnState() {
        var sendBtn = global.document.getElementById('jms-ai-panel-send');
        var input = getInputEl();
        if (!sendBtn) return;
        var hasText = !!(input && String(input.value || '').trim());
        sendBtn.disabled = sendRunning || !hasText;
        sendBtn.setAttribute('aria-busy', sendRunning ? 'true' : 'false');
    }

    function renderMessages() {
        var container = global.document.getElementById('jms-ai-panel-messages');
        if (!container) return;
        container.innerHTML = '';
        sessionMessages.forEach(function (msg) {
            var row = global.document.createElement('div');
            row.className = 'jms-ai-panel__msg jms-ai-panel__msg--' + msg.role;
            if (msg.pending) row.classList.add('jms-ai-panel__msg--pending');
            if (msg.variant === 'error') row.classList.add('jms-ai-panel__msg--error');
            if (msg.variant === 'system') row.classList.add('jms-ai-panel__msg--system');
            var bubble = global.document.createElement('div');
            bubble.className = 'jms-ai-panel__bubble';
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
        var bubble = global.document.querySelector('[data-msg-id="' + id + '"]');
        if (bubble && patch && Object.prototype.hasOwnProperty.call(patch, 'text')) {
            bubble.textContent = msg.text;
        }
        if (bubble && patch && Object.prototype.hasOwnProperty.call(patch, 'pending')) {
            var row = bubble.closest('.jms-ai-panel__msg');
            if (row) row.classList.toggle('jms-ai-panel__msg--pending', !!msg.pending);
        }
        if (bubble && patch && Object.prototype.hasOwnProperty.call(patch, 'variant')) {
            var row2 = bubble.closest('.jms-ai-panel__msg');
            if (row2) {
                row2.classList.toggle('jms-ai-panel__msg--error', msg.variant === 'error');
                row2.classList.toggle('jms-ai-panel__msg--system', msg.variant === 'system');
            }
        }
        var container = global.document.getElementById('jms-ai-panel-messages');
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

    function updateTitle(ctx) {
        var title = global.document.getElementById('jms-ai-panel-title');
        if (!title) return;
        if (ctx && ctx.tgName) {
            title.textContent = 'AI 步骤助手 · ' + ctx.tgName;
        } else {
            title.textContent = 'AI 步骤助手';
        }
    }

    function updateSubtitle(ctx) {
        var sub = global.document.getElementById('jms-ai-panel-subtitle');
        if (!sub) return;
        if (ctx && ctx.tgName) {
            var kindLabel = ctx.tgKind === 'setup' ? 'SetUp' : (ctx.tgKind === 'post' ? 'tearDown' : '主线程');
            sub.textContent = '当前线程组：' + ctx.tgName + '（' + kindLabel + '）· 基于时间线 + 嵌套步骤树编辑';
        } else {
            sub.textContent = '请先选择线程组 · 基于时间线 + 嵌套步骤树编辑';
        }
    }

    function getBuilder() {
        return global.JmsVisualBuilder || null;
    }

    function resolveContext() {
        var VB = getBuilder();
        if (!VB || typeof VB.resolveActiveThreadGroupContext !== 'function') return null;
        try {
            return VB.resolveActiveThreadGroupContext();
        } catch (e) {
            return null;
        }
    }

    function exportCurrentTgStepTree(ctx) {
        var VB = getBuilder();
        if (!VB || typeof VB.exportThreadGroupStepTreeForAi !== 'function') {
            throw new Error('可视化构建器未就绪（缺少 StepTree 导出）');
        }
        return VB.exportThreadGroupStepTreeForAi(ctx.planId, ctx.tgId);
    }

    function applyOperations(ctx, operations) {
        var VB = getBuilder();
        if (!VB) {
            throw new Error('可视化构建器未就绪（缺少 StepTree 应用）');
        }
        // 优先旁路路由：配置元件（http_defaults 等）不走 catalog_element 步骤解析
        if (typeof VB.applyAiStepTreeOperationsRoutedV1 === 'function') {
            return VB.applyAiStepTreeOperationsRoutedV1(ctx.planId, ctx.tgId, operations);
        }
        if (typeof VB.applyAiStepTreeOperations !== 'function') {
            throw new Error('可视化构建器未就绪（缺少 StepTree 应用）');
        }
        return VB.applyAiStepTreeOperations(ctx.planId, ctx.tgId, operations);
    }

    function abortPendingStream() {
        if (streamAbort) {
            try { streamAbort.abort(); } catch (e1) { /* ignore */ }
            streamAbort = null;
        }
        sendRunning = false;
        syncSendBtnState();
    }

    function notifyThreadGroupSwitched(ctx) {
        sessionMessages = sessionMessages.filter(function (m) { return m.pending; });
        renderMessages();
        appendMessage('assistant', '已切换至线程组「' + ctx.tgName + '」。对话已重置，后续将基于该线程组 StepTree 进行编辑。', {
            variant: 'system'
        });
    }

    function syncActiveThreadGroup() {
        if (!isJmeterTab()) return;
        var ctx = resolveContext();
        updateTitle(ctx);
        updateSubtitle(ctx);
        var newTgId = ctx ? ctx.tgId : null;
        if (panelOpen && activeTgId !== null && newTgId !== null && newTgId !== activeTgId) {
            abortPendingStream();
            notifyThreadGroupSwitched(ctx);
        }
        activeTgId = newTgId;
    }

    function scheduleThreadGroupSync() {
        if (tgSyncTimer) global.clearTimeout(tgSyncTimer);
        tgSyncTimer = global.setTimeout(function () {
            tgSyncTimer = null;
            syncActiveThreadGroup();
        }, 100);
    }

    function bindThreadGroupSync() {
        global.document.addEventListener('click', function (ev) {
            if (!isJmeterTab()) return;
            var t = ev.target;
            if (!t || !t.closest) return;
            if (t.closest('.jms-tg-tree-nav__item') || t.closest('.jms-tg-tree-nav__main')) {
                scheduleThreadGroupSync();
            }
        }, true);

        function attachNavObserver() {
            var list = global.document.querySelector('.jms-tg-tree-nav__list');
            if (!list || list.dataset.jmsAiTgObs === '1') return;
            list.dataset.jmsAiTgObs = '1';
            var obs = new MutationObserver(scheduleThreadGroupSync);
            obs.observe(list, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-current'] });
        }

        attachNavObserver();
        var scope = global.document.querySelector('.lth-hub-scope');
        if (scope) {
            var renderObs = new MutationObserver(function () {
                attachNavObserver();
            });
            renderObs.observe(scope, { childList: true, subtree: true });
        }

        global.setInterval(function () {
            if (panelOpen && isJmeterTab()) syncActiveThreadGroup();
        }, 400);
    }

    function openPanel() {
        var panel = global.document.getElementById('jms-ai-panel');
        var fab = getFabEl();
        if (!panel) return;
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');
        if (fab) fab.setAttribute('aria-expanded', 'true');
        panelOpen = true;
        var ctx = resolveContext();
        activeTgId = ctx ? ctx.tgId : null;
        updateTitle(ctx);
        updateSubtitle(ctx);
        var input = getInputEl();
        if (input) input.focus();
        var restored = global.JmsJmeterAiPanelDrag && typeof global.JmsJmeterAiPanelDrag.restorePosition === 'function'
            && global.JmsJmeterAiPanelDrag.restorePosition(panel);
        if (!restored) schedulePositionPanelAboveFab();
    }

    function closePanel(resetFocus) {
        var panel = global.document.getElementById('jms-ai-panel');
        var fab = getFabEl();
        if (!panel) return;
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
        if (fab) fab.setAttribute('aria-expanded', 'false');
        panelOpen = false;
        clearPanelDockPosition();
        if (resetFocus !== false && fab) fab.focus();
    }

    function togglePanel() {
        if (panelOpen) closePanel(false);
        else openPanel();
    }

    function buildHistory() {
        return sessionMessages
            .filter(function (m) { return !m.pending && m.variant !== 'error' && m.variant !== 'system'; })
            .slice(-8)
            .map(function (m) {
                return { role: m.role === 'user' ? 'user' : 'assistant', text: m.text };
            });
    }

    function notifyAiQuota(quota) {
        if (!quota) return;
        try {
            if (typeof global.hfAiQuotaNotify === 'function') {
                global.hfAiQuotaNotify(quota);
            }
        } catch (eQ) { /* ignore */ }
    }

    function notifyAiQuotaErrorBody(body) {
        try {
            if (typeof global.hfAiQuotaFromErrorBody === 'function' && global.hfAiQuotaFromErrorBody(body)) {
                return true;
            }
        } catch (e1) { /* ignore */ }
        try {
            if (typeof global.hfAiQuotaFromErrorMsg === 'function') {
                return !!global.hfAiQuotaFromErrorMsg((body && (body.error || body.message)) || '');
            }
        } catch (e2) { /* ignore */ }
        return false;
    }

    function parseSseChunk(text, onEvent) {
        // SSE_ERROR_PROPAGATE_V1: 仅吞 JSON 解析失败；error 事件中的 throw 必须冒泡
        text.split('\n').forEach(function (line) {
            line = line.trim();
            if (!line.startsWith('data:')) return;
            var payload = line.slice(5).trim();
            if (!payload) return;
            var event;
            try {
                event = JSON.parse(payload);
            } catch (e) {
                return;
            }
            onEvent(event);
        });
    }

    function handleDoneEvent(ctx, event, assistantMsgId) {
        var Ops = global.JmsJmeterAiPanelOps;
        var parsed = Ops && typeof Ops.parseDoneEvent === 'function'
            ? Ops.parseDoneEvent(event)
            : { summary: String(event.summary || '已完成').trim(), operations: event.operations || [] };
        var applyResult = null;
        if (parsed.operations.length) {
            applyResult = applyOperations(ctx, parsed.operations);
        }
        try {
            var LogClient = global.JmsAiChatLogClientV1;
            if (LogClient && typeof LogClient.reportApplyResult === 'function') {
                LogClient.reportApplyResult(applyResult);
            }
        } catch (eLogApply) { /* ignore */ }
        var detail = Ops && typeof Ops.formatResultMessage === 'function'
            ? Ops.formatResultMessage(parsed.summary, parsed.operations, applyResult)
            : parsed.summary;
        updateMessageById(assistantMsgId, {
            text: detail,
            pending: false,
            variant: (applyResult && applyResult.errors && applyResult.errors.length) ? 'error' : ''
        });
        toast(
            applyResult && applyResult.errors && applyResult.errors.length ? '部分变更未能应用' : 'AI 变更已应用',
            !(applyResult && applyResult.errors && applyResult.errors.length)
        );
    }

    
    function makeTwoPassHost() {
        return {
            getInputEl: getInputEl,
            resolveContext: resolveContext,
            exportCurrentTgStepTree: exportCurrentTgStepTree,
            appendMessage: appendMessage,
            updateMessageById: updateMessageById,
            buildHistory: buildHistory,
            handleDoneEvent: handleDoneEvent,
            toast: toast,
            syncSendBtnState: syncSendBtnState,
            updateTitle: updateTitle,
            updateSubtitle: updateSubtitle,
            isSendRunning: function () { return sendRunning; },
            setSendRunning: function (v) { sendRunning = !!v; },
            setStreamAbort: function (a) { streamAbort = a; },
            onContext: function (ctx) {
                activeTgId = ctx ? ctx.tgId : null;
                updateTitle(ctx);
                updateSubtitle(ctx);
            },
            sendLegacy: sendMessageLegacy
        };
    }

    function sendMessageLegacy() {
        if (sendRunning) return;
        var input = getInputEl();
        var text = input ? String(input.value || '').trim() : '';
        if (!text) return;

        var ctx = resolveContext();
        if (!ctx) {
            toast('请先选择线程组', false);
            return;
        }
        activeTgId = ctx.tgId;
        updateTitle(ctx);
        updateSubtitle(ctx);

        var timelineObj;
        try {
            timelineObj = exportCurrentTgStepTree(ctx);
        } catch (e1) {
            toast(e1.message || '无法导出线程组 StepTree', false);
            return;
        }

        appendMessage('user', text);
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }
        syncSendBtnState();

        var assistantMsgId = appendMessage('assistant', '正在思考…', { pending: true, allowEmpty: true });
        sendRunning = true;
        syncSendBtnState();

        streamAbort = new AbortController();
        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            signal: streamAbort.signal,
            body: JSON.stringify((function () {
                var body = {
                    message: text,
                    thread_group_timeline: timelineObj,
                    thread_group_name: ctx.tgName,
                    conversation_history: buildHistory()
                };
                try {
                    var LogClient = global.JmsAiChatLogClientV1;
                    if (LogClient && typeof LogClient.injectMeta === 'function') {
                        body = LogClient.injectMeta(body, { tgName: ctx.tgName });
                    }
                } catch (eLogMeta) { /* ignore */ }
                return body;
            })())
        }).then(function (resp) {
            if (!resp.ok) {
                return resp.json().catch(function () { return {}; }).then(function (body) {
                    notifyAiQuotaErrorBody(body);
                    throw new Error(body.error || body.message || ('请求失败 (' + resp.status + ')'));
                });
            }
            if (!resp.body || !resp.body.getReader) {
                throw new Error('浏览器不支持流式响应');
            }
            var reader = resp.body.getReader();
            var decoder = new TextDecoder();
            var buf = '';
            function pump() {
                return reader.read().then(function (chunk) {
                    if (chunk.done) return;
                    buf += decoder.decode(chunk.value, { stream: true });
                    var parts = buf.split('\n\n');
                    buf = parts.pop() || '';
                    parts.forEach(function (part) {
                        parseSseChunk(part, function (event) {
                            if (!event || !event.type) return;
                            if (event.type === 'ai_quota') {
                                notifyAiQuota(event.ai_quota);
                            } else if (event.type === 'reasoning' || event.type === 'status' || event.type === 'parsing') {
                                updateMessageById(assistantMsgId, { text: event.content || '处理中…', pending: true });
                            } else if (event.type === 'error') {
                                throw new Error(event.error || 'AI 处理失败');
                            } else if (event.type === 'done') {
                                handleDoneEvent(ctx, event, assistantMsgId);
                            }
                        });
                    });
                    return pump();
                });
            }
            return pump();
        }).catch(function (err) {
            if (err && err.name === 'AbortError') return;
            var msg = (err && err.message) ? err.message : String(err);
            try {
                if (typeof global.hfAiQuotaFromErrorMsg === 'function') {
                    global.hfAiQuotaFromErrorMsg(msg);
                }
            } catch (eQmsg) { /* ignore */ }
            updateMessageById(assistantMsgId, { text: msg, pending: false, variant: 'error' });
            toast(msg, false);
        }).finally(function () {
            sendRunning = false;
            streamAbort = null;
            syncSendBtnState();
        });
    }

function mountFabToDock() {
        var fab = getFabEl();
        var slot = global.document.getElementById('lth-studio-dock-ai-slot');
        if (!fab || !slot) return false;
        if (fab.parentElement !== slot) slot.appendChild(fab);
        fab.classList.add('jms-ai-fab--dock');
        slot.setAttribute('aria-hidden', 'false');
        return true;
    }

function isDockFab(fab) {
        return !!(fab && fab.classList.contains('jms-ai-fab--dock'));
    }

    function positionPanelAboveFab() {
        var panel = global.document.getElementById('jms-ai-panel');
        var fab = getFabEl();
        if (!panel || !fab || panel.classList.contains('hidden') || !isDockFab(fab)) return;

        if (panel.dataset.jmsAiPanelDragged === '1') {
            if (global.JmsJmeterAiPanelDrag && typeof global.JmsJmeterAiPanelDrag.clampPosition === 'function') {
                global.JmsJmeterAiPanelDrag.clampPosition(panel);
            }
            return;
        }

        var fabRect = fab.getBoundingClientRect();
        var panelRect = panel.getBoundingClientRect();
        var panelW = panelRect.width || panel.offsetWidth || 456;
        var gap = 10;
        var margin = 12;
        var left = fabRect.left;
        var maxLeft = global.innerWidth - panelW - margin;
        if (left > maxLeft) left = Math.max(margin, maxLeft);
        if (left < margin) left = margin;

        var bottom = global.innerHeight - fabRect.top + gap;
        var maxBottom = global.innerHeight - margin;
        if (bottom > maxBottom) bottom = maxBottom;

        panel.style.position = 'fixed';
        panel.style.left = Math.round(left) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = Math.round(bottom) + 'px';
        panel.style.top = 'auto';
        panel.classList.add('jms-ai-panel--dock-above');
    }

    function schedulePositionPanelAboveFab() {
        global.requestAnimationFrame(function () {
            positionPanelAboveFab();
            global.requestAnimationFrame(positionPanelAboveFab);
        });
    }

    function clearPanelDockPosition() {
        var panel = global.document.getElementById('jms-ai-panel');
        if (!panel) return;
        if (panel.dataset.jmsAiPanelDragged === '1') return;
        panel.classList.remove('jms-ai-panel--dock-above');
        panel.style.left = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.style.top = '';
    }

    function syncFabVisibility() {
        var fab = getFabEl();
        if (!fab) return;
        if (isJmeterTab()) fab.classList.remove('hidden');
        else {
            fab.classList.add('hidden');
            closePanel(false);
        }
    }

    function bindEvents() {
        var fab = getFabEl();
        var closeBtn = global.document.getElementById('jms-ai-panel-close');
        var sendBtn = global.document.getElementById('jms-ai-panel-send');
        var input = getInputEl();

        if (fab) fab.addEventListener('click', togglePanel);
        if (closeBtn) closeBtn.addEventListener('click', function () { closePanel(true); });
        if (sendBtn) sendBtn.addEventListener('click', sendMessage);
        if (input) {
            input.addEventListener('input', syncSendBtnState);
            input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                    ev.preventDefault();
                    sendMessage();
                }
            });
        }
    }

    function init() {
        if (global.__jmsAiPanelBound) return;
        global.__jmsAiPanelBound = true;
        bindEvents();
        bindThreadGroupSync();
        mountFabToDock();
        syncFabVisibility();
        syncSendBtnState();

        var dockObs = new MutationObserver(function () {
            mountFabToDock();
        });
        var scope = global.document.querySelector('.lth-hub-scope');
        if (scope) dockObs.observe(scope, { childList: true, subtree: true });

        var obs = new MutationObserver(function () {
            syncFabVisibility();
        });
        obs.observe(global.document.body, { attributes: true, attributeFilter: ['class'] });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function sendMessage() {
        var TwoPass = global.JmsJmeterAiPanelTwoPassV1;
        if (TwoPass && typeof TwoPass.isEnabled === 'function' && TwoPass.isEnabled()
            && typeof TwoPass.send === 'function') {
            return TwoPass.send(makeTwoPassHost());
        }
        return sendMessageLegacy();
    }

    global.JmsJmeterAiPanel = {
        open: openPanel,
        close: closePanel,
        send: sendMessage,
        syncActiveThreadGroup: syncActiveThreadGroup,
        positionPanelAboveFab: positionPanelAboveFab
    };
})(window);
