/**
 * AI 两轮编排：计划(targets) → 格式包 → 原逻辑编辑流（隔离，可开关）
 */
(function (global) {
    'use strict';

    var PLAN_URL = '/api/jmeter-scenario/ai/step-plan/stream';
    var EDIT_URL = '/api/jmeter-scenario/ai/step-edit/two-pass/stream';
    var ENABLED_KEY = 'jms_ai_two_pass_v1';

    function isEnabled() {
        try {
            var v = global.localStorage && global.localStorage.getItem(ENABLED_KEY);
            if (v === '0' || v === 'false') return false;
        } catch (e1) { /* ignore */ }
        return true; // 默认开启两轮
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
        // SSE_ERROR_PROPAGATE_V1: 仅吞 JSON 解析失败；onEvent 抛错必须冒泡，否则 error 事件被静默丢弃、UI 卡在 parsing
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

    function readSse(resp, onEvent, signal) {
        if (!resp.body || !resp.body.getReader) {
            return Promise.reject(new Error('浏览器不支持流式响应'));
        }
        var reader = resp.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';
        function pump() {
            return reader.read().then(function (chunk) {
                if (signal && signal.aborted) return;
                if (chunk.done) return;
                buf += decoder.decode(chunk.value, { stream: true });
                var parts = buf.split('\n\n');
                buf = parts.pop() || '';
                parts.forEach(function (part) {
                    parseSseChunk(part, onEvent);
                });
                return pump();
            });
        }
        return pump();
    }

    function fetchStream(url, body, signal) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            signal: signal,
            body: JSON.stringify(body)
        }).then(function (resp) {
            if (!resp.ok) {
                return resp.json().catch(function () { return {}; }).then(function (b) {
                    notifyAiQuotaErrorBody(b);
                    throw new Error(b.error || b.message || ('请求失败 (' + resp.status + ')'));
                });
            }
            return resp;
        });
    }

    function formatTargets(targets) {
        if (!targets || !targets.length) return '未识别到可编辑组件';
        return targets.map(function (t, i) {
            return (i + 1) + '. ' + (t.action || 'add') + ' · ' + (t.alias || '?') +
                (t.note ? ('（' + t.note + '）') : '');
        }).join('\n');
    }

    /**
     * host: 由旧面板注入的桥接能力
     */
    function send(host) {
        if (!host || host.isSendRunning()) return;
        var Pack = global.JmsAiComponentSchemaPackV1;
        if (!Pack) {
            host.toast('两轮 AI 格式包模块未加载，已回退单轮', false);
            return host.sendLegacy();
        }

        var input = host.getInputEl();
        var text = input ? String(input.value || '').trim() : '';
        if (!text) return;

        var ctx = host.resolveContext();
        if (!ctx) {
            host.toast('请先选择线程组', false);
            return;
        }
        host.onContext(ctx);

        var timelineObj;
        try {
            timelineObj = host.exportCurrentTgStepTree(ctx);
        } catch (e1) {
            host.toast(e1.message || '无法导出线程组 StepTree', false);
            return;
        }

        var brief = Pack.buildBriefTimeline(timelineObj);
        host.appendMessage('user', text);
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }
        host.syncSendBtnState();

        var assistantMsgId = host.appendMessage('assistant', '第1步：识别要改动的组件…', {
            pending: true,
            allowEmpty: true
        });
        host.setSendRunning(true);
        host.syncSendBtnState();

        var abort = new AbortController();
        host.setStreamAbort(abort);

        var planSummary = '';
        var targets = [];

        var planBody = {
            message: text,
            thread_group_brief: brief,
            thread_group_name: ctx.tgName
        };
        try {
            var LogClient = global.JmsAiChatLogClientV1;
            if (LogClient && typeof LogClient.injectMeta === 'function') {
                planBody = LogClient.injectMeta(planBody, { tgName: ctx.tgName });
            }
        } catch (eLogPlan) { /* ignore */ }

        fetchStream(PLAN_URL, planBody, abort.signal).then(function (resp) {
            var planStreamError = null;
            return readSse(resp, function (event) {
                if (!event || !event.type) return;
                if (event.type === 'ai_quota') {
                    notifyAiQuota(event.ai_quota);
                } else if (event.type === 'reasoning' || event.type === 'status' || event.type === 'parsing') {
                    host.updateMessageById(assistantMsgId, {
                        text: '第1步：' + (event.content || '识别中…'),
                        pending: true
                    });
                } else if (event.type === 'error') {
                    planStreamError = event.error || '组件识别失败';
                    throw new Error(planStreamError);
                } else if (event.type === 'done') {
                    planSummary = String(event.summary || '').trim();
                    targets = Array.isArray(event.targets) ? event.targets : [];
                }
            }, abort.signal).then(function () {
                if (planStreamError) throw new Error(planStreamError);
            });
        }).then(function () {
            if (!targets.length) {
                host.updateMessageById(assistantMsgId, {
                    text: planSummary || '未能识别需要改动的组件，请换种说法再试。',
                    pending: false,
                    variant: 'error'
                });
                host.toast('未识别到可编辑组件', false);
                return null;
            }
            var pack = Pack.buildSchemaPack(targets);
            host.updateMessageById(assistantMsgId, {
                text: '第1步完成：\n' + formatTargets(targets) + '\n\n第2步：按字段格式生成修改…',
                pending: true
            });
            var editBody = {
                message: text,
                thread_group_timeline: timelineObj,
                thread_group_name: ctx.tgName,
                conversation_history: host.buildHistory(),
                component_plan: targets,
                schema_pack: pack
            };
            try {
                var LogClient2 = global.JmsAiChatLogClientV1;
                if (LogClient2 && typeof LogClient2.injectMeta === 'function') {
                    editBody = LogClient2.injectMeta(editBody, { reuseTurn: true, tgName: ctx.tgName });
                }
            } catch (eLogEdit) { /* ignore */ }
            return fetchStream(EDIT_URL, editBody, abort.signal).then(function (resp2) {
                var editStreamError = null;
                var gotDone = false;
                return readSse(resp2, function (event) {
                    if (!event || !event.type) return;
                    if (event.type === 'ai_quota') {
                        notifyAiQuota(event.ai_quota);
                    } else if (event.type === 'reasoning' || event.type === 'status' || event.type === 'parsing') {
                        host.updateMessageById(assistantMsgId, {
                            text: '第2步：' + (event.content || '生成中…'),
                            pending: true
                        });
                    } else if (event.type === 'error') {
                        editStreamError = event.error || '生成修改失败';
                        throw new Error(editStreamError);
                    } else if (event.type === 'done') {
                        gotDone = true;
                        host.handleDoneEvent(ctx, event, assistantMsgId);
                    }
                }, abort.signal).then(function () {
                    if (editStreamError) throw new Error(editStreamError);
                    if (!gotDone) {
                        throw new Error('第2步未返回完成事件，请重试');
                    }
                });
            });
        }).catch(function (err) {
            if (err && err.name === 'AbortError') return;
            var msg = (err && err.message) ? err.message : String(err);
            try {
                if (typeof global.hfAiQuotaFromErrorMsg === 'function') {
                    global.hfAiQuotaFromErrorMsg(msg);
                }
            } catch (eQmsg) { /* ignore */ }
            host.updateMessageById(assistantMsgId, { text: msg, pending: false, variant: 'error' });
            host.toast(msg, false);
        }).finally(function () {
            host.setSendRunning(false);
            host.setStreamAbort(null);
            host.syncSendBtnState();
        });
    }

    global.JmsJmeterAiPanelTwoPassV1 = {
        ENABLED_KEY: ENABLED_KEY,
        isEnabled: isEnabled,
        send: send,
        PLAN_URL: PLAN_URL,
        EDIT_URL: EDIT_URL
    };
})(typeof window !== 'undefined' ? window : this);
