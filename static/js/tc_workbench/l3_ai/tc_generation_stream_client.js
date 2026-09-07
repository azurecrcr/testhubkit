/**
 * TestHub — 流式生成 SSE 客户端
 */
(function (global) {
    'use strict';

    var clientState = {
        sessionId: null,
        eventSource: null,
        cancelled: false,
        finished: false,
        successHandled: false,
        streamText: '',
        reasoningText: '',
        reconciling: false,
        totalRows: 0,
        sessionRowsAdded: 0,
        lastRowProvenance: null,
        onFinish: null,
        onError: null,
        onCancel: null,
        mergeMode: 'overwrite',
        outputTarget: 'list',
        scope: 'legacy_freeform',
        starting: false,
        startAbortController: null
    };

    function isGenerationRunAllowed(opts) {
        opts = opts || {};
        if (opts.runToken == null) return true;
        if (typeof global.isGenerationRunCurrent === 'function') {
            return global.isGenerationRunCurrent(opts.runToken);
        }
        return true;
    }

    function isStreamEnabled() {
        try {
            if (global.TC_STREAM_GENERATION === true || global.TC_STREAM_GENERATION === 1) return true;
            return localStorage.getItem('TC_STREAM_GENERATION') === '1';
        } catch (e) {
            return false;
        }
    }

    function buildRequestBody(opts) {
        var body = {
            prompt: opts.prompt,
            mode: opts.outputTarget === 'mindmap' ? 'mindmap' : 'list',
            merge_mode: opts.mergeMode || 'overwrite',
            columns: typeof tableColumns !== 'undefined' && tableColumns ? tableColumns.slice() : [],
            use_builtin: opts.useBuiltin,
            base_url: opts.baseUrl,
            api_key: opts.apiKey,
            model: opts.model,
            temperature: opts.temperature,
            images: opts.images || []
        };
        if (opts.skipLanhuSessionMerge) {
            body.skip_lanhu_merge = true;
        }
        if (opts.lanhuCookie && opts.lanhuUrl && !opts.skipLanhuSessionMerge) {
            body.lanhu_cookie = opts.lanhuCookie;
            body.lanhu_url = opts.lanhuUrl;
        }
        if (opts.pageGen && typeof opts.pageGen === 'object') {
            body.page_gen = opts.pageGen;
        }
        return body;
    }


    function pushReasoningToPipeline(text, replace) {
        text = String(text || '');
        if (!text.trim()) return;
        syncThinkingToUi(text, replace);
        if (!global.TcGenChatPipeline) return;
        if (typeof global.TcGenChatPipeline.setReasoningContent === 'function') {
            global.TcGenChatPipeline.setReasoningContent(text, { replace: !!replace });
        } else if (typeof global.TcGenChatPipeline.appendReasoningContent === 'function') {
            global.TcGenChatPipeline.appendReasoningContent(text);
        }
    }

    function syncThinkingToUi(text, replace) {
        text = String(text || '');
        if (!text.trim() && !replace) return;
        if (replace) {
            global.__tcGenReasoningText = text;
        } else {
            global.__tcGenReasoningText = (global.__tcGenReasoningText || '') + text;
        }
        try {
            global.dispatchEvent(new CustomEvent('tc-gen-reasoning-update', {
                detail: { text: global.__tcGenReasoningText, piece: text, replace: !!replace }
            }));
        } catch (e) { /* ignore */ }
        if (global.TcGenChatXUi) {
            if (replace && typeof global.TcGenChatXUi.setThinkingContent === 'function') {
                global.TcGenChatXUi.setThinkingContent(text, { replace: true });
            } else if (typeof global.TcGenChatXUi.appendThinkingContent === 'function') {
                global.TcGenChatXUi.appendThinkingContent(text);
            } else if (typeof global.TcGenChatXUi.setThinkingContent === 'function') {
                global.TcGenChatXUi.setThinkingContent(global.__tcGenReasoningText, { replace: true });
            }
        }
    }

    function clearThinkingUi() {
        global.__tcGenReasoningText = '';
        try {
            global.dispatchEvent(new CustomEvent('tc-gen-reasoning-update', { detail: { clear: true } }));
        } catch (e) { /* ignore */ }
    }

    function ensurePipelineReasoning(extraText) {
        var merged = String(clientState.reasoningText || '').trim();
        if (extraText) {
            var piece = String(extraText || '').trim();
            if (piece && (!merged || piece.length > merged.length)) merged = piece;
        }
        if (merged) pushReasoningToPipeline(merged, true);
    }

    function resolveStreamTextForFinish(data) {
        var text = clientState.streamText || (data && data.full_text) || '';
        if (String(text || '').trim()) {
            return Promise.resolve(String(text));
        }
        var sid = clientState.sessionId;
        if (!sid) return Promise.resolve('');
        return fetch('/api/test-cases/generation-sessions/' + encodeURIComponent(sid))
            .then(function (res) {
                return res.json().then(function (body) {
                    if (!res.ok) throw new Error((body && body.error) || '读取会话失败');
                    return body;
                });
            })
            .then(function (session) {
                if (session && session.output_text) return String(session.output_text);
                return fetch('/api/test-cases/generation-sessions/' + encodeURIComponent(sid) + '/events?after=0')
                    .then(function (res2) {
                        return res2.json().then(function (body2) {
                            if (!res2.ok) return '';
                            return body2;
                        });
                    })
                    .then(function (body2) {
                        var events = (body2 && body2.events) || [];
                        var merged = '';
                        var reasoningMerged = '';
                        var i;
                        for (i = 0; i < events.length; i++) {
                            var ev = events[i];
                            if (!ev || !ev.type) continue;
                            if (ev.type === 'stream_chunk') {
                                if ((ev.stream_kind || 'content') === 'reasoning') {
                                    reasoningMerged += ev.content || '';
                                } else {
                                    merged += ev.content || '';
                                }
                            }
                            if (ev.type === 'stream_done') {
                                if (ev.reasoning_text) reasoningMerged = String(ev.reasoning_text);
                                if (ev.full_text) return String(ev.full_text);
                            }
                            if (ev.type === 'session_done') {
                                if (ev.reasoning_text) reasoningMerged = String(ev.reasoning_text);
                                if (ev.full_text) return String(ev.full_text);
                            }
                        }
                        if (reasoningMerged) {
                            clientState.reasoningText = reasoningMerged;
                            pushReasoningToPipeline(reasoningMerged, true);
                        }
                        return merged;
                    });
            })
            .catch(function () {
                return '';
            });
    }

    function buildStreamFinishPayload(ctx, data, finalStream, recovered) {
        var sessionAdded = clientState.sessionRowsAdded || 0;
        var serverRows = parseInt(data && data.total_rows, 10) || 0;
        var streamParsed = parseInt(clientState.totalRows, 10) || 0;
        var finishRows = Math.max(sessionAdded, recovered || 0);
        if (finishRows <= 0 && ctx.outputTarget !== 'mindmap') {
            if (global.tcGenBatchCore && global.tcGenBatchCore.state) {
                var coreCount = parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0;
                if (coreCount > 0) finishRows = coreCount;
            }
            if (finishRows <= 0 && typeof tcCountTableCaseContentRows === 'function') {
                var batchStart = clientState.batchRowStart != null ? parseInt(clientState.batchRowStart, 10) : -1;
                if (isNaN(batchStart) || batchStart < 0) {
                    if (typeof tcGetLastGenerationWriteStart === 'function') {
                        batchStart = tcGetLastGenerationWriteStart();
                    }
                }
                if ((isNaN(batchStart) || batchStart < 0) && global.tcGenBatchCore && global.tcGenBatchCore.state) {
                    batchStart = parseInt(global.tcGenBatchCore.state.batchRowStart, 10);
                }
                var batchLimit = global.tcGenBatchCore && global.tcGenBatchCore.state
                    ? parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0 : 0;
                if (!isNaN(batchStart) && batchStart >= 0) {
                    if (batchLimit > 0) {
                        finishRows = tcCountTableCaseContentRows(batchStart, batchLimit);
                    } else if (batchStart > 0) {
                        finishRows = tcCountTableCaseContentRows(batchStart);
                    }
                }
            }
        }
        if (finishRows <= 0 && serverRows > 0 && (sessionAdded > 0 || streamParsed > 0 || (recovered || 0) > 0)) {
            finishRows = serverRows;
        }
        if (finishRows <= 0 && serverRows > 0 && streamParsed > 0) {
            finishRows = serverRows;
        }
        if (ctx.outputTarget !== 'mindmap' &&
            typeof global.tcResolveListGenerationBatchContentRows === 'function') {
            var tableBatchRows = global.tcResolveListGenerationBatchContentRows();
            if (tableBatchRows > 0) finishRows = tableBatchRows;
        }
        if (finishRows > 0) {
            clientState.totalRows = Math.max(clientState.totalRows || 0, finishRows);
        }
        return {
            total_rows: finishRows,
            finish_row_count: finishRows,
            batch_row_start: clientState.batchRowStart != null ? clientState.batchRowStart : 0,
            trust_server_row_count: finishRows > 0 && serverRows > 0 && sessionAdded <= 0 && (recovered || 0) <= 0,
            stream_text: finalStream || clientState.streamText || '',
            reasoning_text: clientState.reasoningText || (data && data.reasoning_text) || ''
        };
    }

    function ensurePipelineParseWriteFinish(ctx, finishPayload) {
        if (!global.TcGenChatPipeline || !finishPayload) return;
        if (typeof global.TcGenChatPipeline.isFinished === 'function' &&
            global.TcGenChatPipeline.isFinished()) {
            return;
        }
        if (typeof global.TcGenChatPipeline.completeStreamParseWriteFinish === 'function') {
            global.TcGenChatPipeline.completeStreamParseWriteFinish(finishPayload);
            return;
        }
        if (typeof global.TcGenChatPipeline.finish === 'function') {
            global.TcGenChatPipeline.finish(finishPayload);
        }
    }

    function finalizeSessionDone(data, ctx) {
        if (clientState.cancelled) {
            if (ctx.onCancel) ctx.onCancel();
            return;
        }
        if (data && data.reasoning_text) {
            clientState.reasoningText = String(data.reasoning_text);
        }
        ensurePipelineReasoning(data && data.reasoning_text);
        resolveStreamTextForFinish(data).then(function (finalStream) {
            if (finalStream) clientState.streamText = finalStream;
            ensurePipelineReasoning(data && data.reasoning_text);
            var recovered = 0;
            var sessionAddedBeforeRecover = clientState.sessionRowsAdded || 0;
            if (sessionAddedBeforeRecover <= 0) {
                recovered = recoverRowsFromStreamText(ctx, finalStream || clientState.streamText || '');
            }
            if (recovered <= 0 && clientState.reasoningText && sessionAddedBeforeRecover <= 0) {
                recovered = recoverRowsFromStreamText(ctx, clientState.reasoningText);
            }
            var expectedRows = data && data.total_rows != null ? parseInt(data.total_rows, 10) : 0;
            if (expectedRows > (clientState.sessionRowsAdded || 0) && finalStream) {
                var tailRecovered = recoverMissingStreamRows(ctx, finalStream, clientState.sessionRowsAdded || 0);
                if (tailRecovered > 0) {
                    clientState.sessionRowsAdded = (clientState.sessionRowsAdded || 0) + tailRecovered;
                    recovered = Math.max(recovered, tailRecovered);
                }
            }
            var finishPayload = buildStreamFinishPayload(ctx, data, finalStream || clientState.streamText || '', recovered);
            if (ctx.outputTarget === 'mindmap') {
                if (typeof finalizeStreamingMindmap === 'function') finalizeStreamingMindmap();
            } else if (typeof finalizeStreamingRows === 'function') {
                finalizeStreamingRows();
            }
            if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.finish === 'function') {
                global.TcGenChatPipeline.finish(finishPayload);
            } else if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.finish === 'function') {
                global.TcGenChatStreaming.finish({ total_rows: finishPayload.total_rows });
            }
            if (global.TcGenerationStreamUi) {
                global.TcGenerationStreamUi.update({ step: 'done', parsedRows: finishPayload.total_rows });
            }
            if (typeof global.refreshTcPageGenLock === 'function') global.refreshTcPageGenLock();
            if (typeof global.clearOptimisticPageGenLock === 'function') global.clearOptimisticPageGenLock();
            finishSuccess(ctx, finishPayload);
        });
    }

    function handleEvent(ev, ctx) {
        if (clientState.cancelled) return;
        var data = ev;
        if (!data || !data.type) return;
        var ui = global.TcGenerationStreamUi;
        switch (data.type) {
            case 'ai_quota':
                if (typeof global.hfAiQuotaNotify === 'function' && data.ai_quota) {
                    global.hfAiQuotaNotify(data.ai_quota);
                }
                break;
            case 'session_start':
                if (ui) ui.update({ step: 'connect' });
                break;
            case 'stream_chunk':
                if ((data.stream_kind || 'content') === 'reasoning') {
                    clientState.reasoningText = (clientState.reasoningText || '') + (data.content || '');
                    syncThinkingToUi(data.content || '', false);
                    if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.setPhase === 'function') {
                        global.TcGenChatPipeline.setPhase('generate', 'active', '思考中…');
                    }
                    if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.appendReasoningContent === 'function') {
                        global.TcGenChatPipeline.appendReasoningContent(data.content || '');
                    }
                    if (ui) ui.update({ step: 'gen' });
                    break;
                }
                clientState.streamText = (clientState.streamText || '') + (data.content || '');
                if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.setPhase === 'function') {
                    global.TcGenChatPipeline.setPhase('generate', 'active', '正在输出…');
                }
                if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.appendContent === 'function') {
                    global.TcGenChatPipeline.appendContent(data.content || '');
                } else if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.appendContent === 'function') {
                    global.TcGenChatStreaming.appendContent(data.content || '');
                }
                if (ui) ui.update({ step: 'gen' });
                if (typeof ctx.onStreamChunk === 'function') {
                    ctx.onStreamChunk(data.content || '', data);
                }
                break;
            case 'stream_done':
                if (data.reasoning_text) {
                    clientState.reasoningText = String(data.reasoning_text);
                    pushReasoningToPipeline(data.reasoning_text, true);
                }
                if (data.full_text) {
                    clientState.streamText = String(data.full_text);
                }
                if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.ingestStreamText === 'function') {
                    global.TcGenChatPipeline.ingestStreamText(clientState.streamText || data.full_text || '', { replace: true });
                }
                if (typeof ctx.onStreamComplete === 'function') {
                    ctx.onStreamComplete(data);
                }
                break;
            case 'stream_error':
                if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.error === 'function') {
                    global.TcGenChatPipeline.error(data.message || '生成失败');
                } else if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.error === 'function') {
                    global.TcGenChatStreaming.error(data.message || '生成失败');
                }
                break;
            case 'stream_activity': {
                var actStep = 'gen';
                if (data.stage === 'connecting') actStep = 'connect';
                else if ((data.parsed_rows || 0) > 0) actStep = 'parse';
                if (ui) {
                    ui.update({
                        step: actStep,
                        parsedRows: data.parsed_rows != null ? data.parsed_rows : undefined
                    });
                }
                break;
            }
            case 'parse_progress':
                clientState.totalRows = data.parsed_rows || clientState.totalRows;
                if (ui) ui.update({
                    parsedRows: data.parsed_rows,
                    step: 'parse',
                    moduleName: data.module_name || ''
                });
                break;
            case 'rows_commit':
                if (ctx.outputTarget === 'mindmap' && data.rows && data.rows.length) {
                    if (typeof appendMindmapRowsIncremental === 'function') {
                        appendMindmapRowsIncremental(data.rows, {
                            streaming: true,
                            autoFit: false
                        });
                    }
                    clientState.sessionRowsAdded += data.rows.length;
                    clientState.totalRows = typeof tcMindmapCasesData !== 'undefined'
                        ? tcMindmapCasesData.length
                        : clientState.totalRows;
                } else if (ctx.outputTarget === 'list' && data.rows && data.rows.length) {
                    restoreListAppendBaselineIfNeeded(ctx);
                    if (typeof appendParsedRowsIncremental === 'function') {
                        var committed = appendParsedRowsIncremental(data.rows, {
                            streaming: true,
                            autoScroll: true,
                            provenance: data.provenance || null,
                            mergeMode: ctx.mergeMode || clientState.mergeMode || 'overwrite'
                        });
                        if (committed > 0) clientState.sessionRowsAdded += committed;
                    }
                    clientState.totalRows = Math.max(
                        clientState.sessionRowsAdded || 0,
                        clientState.totalRows || 0,
                        (data.rows && data.rows.length) || 0
                    );
                }
                if (ui) ui.update({ parsedRows: getSessionParsedRowCount(), step: 'write' });
                break;
            case 'module_done':
                if (ui) ui.update({
                    moduleName: data.module_name || '',
                    parsedRows: clientState.totalRows
                });
                break;
            case 'session_done':
                clientState.finished = true;
                clientState.totalRows = data.total_rows || clientState.totalRows;
                clientState.lastRowProvenance = data.row_provenance || null;
                if (data.reasoning_text) {
                    clientState.reasoningText = String(data.reasoning_text);
                    ensurePipelineReasoning(data.reasoning_text);
                }
                if (clientState.cancelled || data.cancelled) {
                    if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.cancel === 'function') {
                        global.TcGenChatPipeline.cancel();
                    } else if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.cancel === 'function') {
                        global.TcGenChatStreaming.cancel();
                    }
                    if (ctx.outputTarget === 'mindmap') {
                        if (typeof abortTcMindmapStreamingIfActive === 'function') {
                            abortTcMindmapStreamingIfActive();
                        } else if (typeof finalizeStreamingMindmap === 'function') {
                            finalizeStreamingMindmap();
                        }
                    }
                    if (global.TcGenerationStreamUi) {
                        global.TcGenerationStreamUi.update({ step: 'cancelled', parsedRows: clientState.totalRows });
                    }
                    if (ctx.onCancel) ctx.onCancel();
                    break;
                }
                finalizeSessionDone(data, ctx);
                break;
            case 'error':
                clientState.finished = true;
                var genErrMsg = data.message || '生成失败';
                if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(genErrMsg)) {
                    if (ui) ui.update({ step: 'error' });
                    if (typeof global.refreshTcPageGenLock === 'function') global.refreshTcPageGenLock();
                    if (typeof global.clearOptimisticPageGenLock === 'function') global.clearOptimisticPageGenLock();
                    break;
                }
                if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.error === 'function') {
                    global.TcGenChatStreaming.error(genErrMsg);
                }
                if (ui) ui.update({ step: 'error' });
                if (typeof global.refreshTcPageGenLock === 'function') global.refreshTcPageGenLock();
                if (typeof global.clearOptimisticPageGenLock === 'function') global.clearOptimisticPageGenLock();
                if (data.recoverable && ctx.onFallback) {
                    ctx.onFallback(genErrMsg);
                } else if (ctx.onError) {
                    ctx.onError(genErrMsg);
                }
                break;
            case 'stream_end':
                closeSource();
                if (!clientState.finished && !clientState.cancelled) {
                    reconcileSession(ctx);
                }
                break;
            default:
                break;
        }
    }

    function reconcileSession(ctx) {
        var sid = clientState.sessionId;
        if (!sid || clientState.finished || clientState.reconciling) return;
        clientState.reconciling = true;
        fetch('/api/test-cases/generation-sessions/' + encodeURIComponent(sid))
            .then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) throw new Error(data.error || '查询会话失败');
                    return data;
                });
            })
            .then(function (session) {
                if (clientState.finished) return;
                var status = session.status || '';
                if (status === 'done') {
                    handleEvent({
                        type: 'session_done',
                        total_rows: session.parsed_rows,
                        duration_ms: session.duration_ms,
                        full_text: clientState.streamText || ''
                    }, ctx);
                } else if (status === 'error') {
                    handleEvent({
                        type: 'error',
                        message: session.error_message || '生成失败',
                        recoverable: true
                    }, ctx);
                } else if (status === 'cancelled') {
                    handleEvent({ type: 'session_done', total_rows: session.parsed_rows || 0, cancelled: true }, ctx);
                } else if (ctx.onFallback) {
                    if (global.TcGenerationStreamUi) {
                        global.TcGenerationStreamUi.update({ step: 'gen' });
                    }
                    ctx.onFallback('流式连接已结束，会话仍在进行');
                }
            })
            .catch(function () {
                if (!clientState.finished && !clientState.cancelled && ctx.onFallback) {
                    if (global.TcGenerationStreamUi) {
                        global.TcGenerationStreamUi.update({ step: 'gen' });
                    }
                    ctx.onFallback('SSE 连接中断');
                }
            })
            .finally(function () {
                clientState.reconciling = false;
            });
    }

    function releaseStreamUiImmediate(opts) {
        opts = opts || {};
        if (global.TcGenerationStreamUi && typeof global.TcGenerationStreamUi.releaseAfterGenerate === 'function') {
            global.TcGenerationStreamUi.releaseAfterGenerate(Object.assign({ immediate: true }, opts));
        } else if (global.TcGenerationStreamUi && typeof global.TcGenerationStreamUi.close === 'function') {
            global.TcGenerationStreamUi.close();
        }
    }

    function getSessionParsedRowCount() {
        return clientState.sessionRowsAdded || 0;
    }

    function getEffectiveRowCount() {
        var sessionAdded = clientState.sessionRowsAdded || 0;
        if (clientState.outputTarget !== 'mindmap' &&
            typeof global.tcResolveListGenerationBatchContentRows === 'function') {
            var batchContentRows = global.tcResolveListGenerationBatchContentRows();
            if (batchContentRows > 0) return batchContentRows;
        }
        if (sessionAdded > 0) return sessionAdded;
        if (clientState.outputTarget === 'mindmap') {
            if (typeof global.tcMindmapCasesData !== 'undefined' && global.tcMindmapCasesData) {
                var mmBase = parseInt(window._tcMindmapAppendBaselineCount, 10);
                if (!isNaN(mmBase) && mmBase >= 0) {
                    return Math.max(0, global.tcMindmapCasesData.length - mmBase);
                }
            }
            return parseInt(clientState.totalRows, 10) || 0;
        }
        if (global.tcGenBatchCore && global.tcGenBatchCore.state) {
            var batchCount = parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0;
            if (batchCount > 0) return batchCount;
        }
        var batchStart = clientState.batchRowStart != null ? parseInt(clientState.batchRowStart, 10) : -1;
        if (isNaN(batchStart) || batchStart < 0) {
            if (typeof tcGetLastGenerationWriteStart === 'function') {
                batchStart = tcGetLastGenerationWriteStart();
            }
        }
        if ((isNaN(batchStart) || batchStart < 0) && global.tcGenBatchCore && global.tcGenBatchCore.state) {
            batchStart = parseInt(global.tcGenBatchCore.state.batchRowStart, 10);
        }
        var batchLimit = global.tcGenBatchCore && global.tcGenBatchCore.state
            ? parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0 : 0;
        if (typeof tcCountTableCaseContentRows === 'function' && !isNaN(batchStart) && batchStart >= 0) {
            if (batchLimit > 0) {
                var limited = tcCountTableCaseContentRows(batchStart, batchLimit);
                if (limited > 0) return limited;
            }
            if (batchStart > 0) {
                var scoped = tcCountTableCaseContentRows(batchStart);
                if (scoped > 0) return scoped;
            }
        }
        return parseInt(clientState.totalRows, 10) || 0;
    }

    function hasStreamGeneratedRows() {
        return getEffectiveRowCount() > 0;
    }

    function wrapStreamCallbacks(opts) {
        var next = Object.assign({}, opts);
        if (typeof next.onFallback === 'function') {
            var userFallback = next.onFallback;
            next.onFallback = function (reason) {
                if (global.TcGenerationStreamUi) {
                    global.TcGenerationStreamUi.update({ step: 'gen' });
                }
                userFallback(reason);
            };
        }
        if (typeof next.onError === 'function') {
            var userError = next.onError;
            next.onError = function (message) {
                releaseStreamUiImmediate({ status: 'error', detail: message || '' });
                userError(message);
            };
        }
        return next;
    }

    function getAccumulatedStreamText() {
        var text = String(clientState.streamText || '').trim();
        if (text) return text;
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.getStreamText === 'function') {
            text = String(global.TcGenChatPipeline.getStreamText() || '').trim();
        }
        return text;
    }

    function isPipelineFallbackSummary(text) {
        return /^已解析 \*\*\d+\*\* 条用例并写入右侧表格。$/.test(String(text || '').trim());
    }


    function recoverMissingStreamRows(ctx, sourceText, alreadyAdded) {
        alreadyAdded = parseInt(alreadyAdded, 10) || 0;
        if (!sourceText || alreadyAdded < 0) return 0;
        if (typeof parseTestCaseRowsFromAiText !== 'function') return 0;
        var payload = typeof extractAiPayloadText === 'function'
            ? extractAiPayloadText(sourceText)
            : String(sourceText || '');
        var rows = parseTestCaseRowsFromAiText(payload);
        if (rows.length <= alreadyAdded) return 0;
        var tail = rows.slice(alreadyAdded);
        if (!tail.length) return 0;
        if (ctx.outputTarget === 'mindmap') {
            if (typeof appendMindmapRowsIncremental === 'function') {
                appendMindmapRowsIncremental(tail, { streaming: false, autoFit: false });
                return tail.length;
            }
            return 0;
        }
        if (typeof appendParsedRowsIncremental === 'function') {
            return appendParsedRowsIncremental(tail, {
                streaming: false,
                autoScroll: true,
                mergeMode: ctx.mergeMode || clientState.mergeMode || 'overwrite',
                appendOnly: true
            }) || 0;
        }
        if (typeof parseAndAddTestCases === 'function') {
            return parseAndAddTestCases(sourceText, false, null, {
                mergeMode: 'append',
                appendOnly: true
            }) || 0;
        }
        return 0;
    }

    function recoverRowsFromStreamText(ctx, sourceText) {
        var text = String(sourceText != null ? sourceText : getAccumulatedStreamText());
        if (!text || isPipelineFallbackSummary(text)) return 0;
        if (ctx.outputTarget === 'mindmap' && typeof tcMindmapExtractParseableText === 'function') {
            text = tcMindmapExtractParseableText(text);
        }
        var mergeMode = ctx.mergeMode || clientState.mergeMode || 'overwrite';
        if (ctx.outputTarget === 'mindmap' && mergeMode === 'append') {
            if (typeof tcMindmapEnsureAppendBaselineIntact === 'function') {
                tcMindmapEnsureAppendBaselineIntact();
            }
            if ((clientState.sessionRowsAdded || 0) > 0) return clientState.sessionRowsAdded;
        }
        var added = 0;
        if (ctx.outputTarget === 'mindmap') {
            if (typeof parseMindmapElementClassificationResult === 'function') {
                added = parseMindmapElementClassificationResult(text, false);
            }
            if (added === 0 && /test_cases\s*=|\[\s*\[/.test(text) && typeof parseAndAddTestCases === 'function') {
                added = parseAndAddTestCases(text, false, null, {
                    allowMindmapWithoutTemplate: true,
                    useMindmapStore: true
                });
            }
            return added;
        }
        if (typeof parseAndAddTestCases === 'function') {
            if (typeof tcEnsurePendingGenerationProvenance === 'function') {
                tcEnsurePendingGenerationProvenance(typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
            }
            added = parseAndAddTestCases(text, false, null, {
                allowMindmapWithoutTemplate: false,
                serverProvenanceEntry: clientState.lastRowProvenance || null,
                mergeMode: ctx.mergeMode || clientState.mergeMode || 'overwrite'
            });
        }
        if (added === 0 && /(?:^|\n)\s*[-*+]?\s*TC\s*[:：]/im.test(text) &&
            typeof parseMindmapElementClassificationResult === 'function') {
            added = parseMindmapElementClassificationResult(text, false, { useTableStore: true });
        }
        if (added > 0) {
            clientState.sessionRowsAdded = (clientState.sessionRowsAdded || 0) + added;
            clientState.totalRows = Math.max(clientState.totalRows || 0, added);
        }
        return added;
    }

    function finishSuccess(ctx, initialFinishPayload) {
        clientState.finished = true;
        syncLanhuDocSwitcherLockUiAfterStream();
        var sessionAdded = clientState.sessionRowsAdded || 0;
        var n = getEffectiveRowCount();
        if (sessionAdded <= 0 && !getAccumulatedStreamText()) {
            var recoveredEarly = recoverRowsFromStreamText(ctx);
            if (recoveredEarly > 0) {
                sessionAdded = clientState.sessionRowsAdded || recoveredEarly;
                n = getEffectiveRowCount();
            }
        }
        if (n <= 0 && getAccumulatedStreamText()) {
            var recovered = recoverRowsFromStreamText(ctx);
            if (recovered > 0) {
                sessionAdded = clientState.sessionRowsAdded || recovered;
                n = getEffectiveRowCount();
            }
        }
        if (n <= 0 && clientState.reasoningText) {
            var recoveredFromReasoning = recoverRowsFromStreamText(ctx, clientState.reasoningText);
            if (recoveredFromReasoning > 0) {
                sessionAdded = clientState.sessionRowsAdded || recoveredFromReasoning;
                n = getEffectiveRowCount();
            }
        }
        if (n <= 0 && (clientState.totalRows || 0) > 0) {
            if (getAccumulatedStreamText()) {
                var retryFromStream = recoverRowsFromStreamText(ctx);
                if (retryFromStream > 0) {
                    sessionAdded = clientState.sessionRowsAdded || retryFromStream;
                    n = getEffectiveRowCount();
                }
            }
            if (n <= 0 && clientState.reasoningText) {
                var retryFromReasoning = recoverRowsFromStreamText(ctx, clientState.reasoningText);
                if (retryFromReasoning > 0) {
                    sessionAdded = clientState.sessionRowsAdded || retryFromReasoning;
                    n = getEffectiveRowCount();
                }
            }
        }
        if (n <= 0) {
            n = getEffectiveRowCount();
        }
        if (n <= 0) {
            releaseStreamUiImmediate({ status: 'error', detail: '未解析到有效用例' });
            if (ctx.onFallback) {
                ctx.onFallback('未解析到有效用例');
            } else if (ctx.onError) {
                ctx.onError('未解析到有效用例');
            } else if (ctx.onFinish) {
                ctx.onFinish(0);
            }
            return;
        }
        if (clientState.successHandled) {
            if (ctx.onFinish) ctx.onFinish(n);
            return;
        }
        clientState.successHandled = true;
        var finishPayload = initialFinishPayload || buildStreamFinishPayload(ctx, null, getAccumulatedStreamText(), sessionAdded);
        finishPayload.total_rows = Math.max(n, finishPayload.total_rows || 0);
        finishPayload.finish_row_count = finishPayload.total_rows;
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.isFinished === 'function' &&
            !global.TcGenChatPipeline.isFinished() && !global.TcGenChatPipeline.isFailed()) {
            ensurePipelineParseWriteFinish(ctx, finishPayload);
        }
        // 先恢复左栏按钮/锁，避免后续批次条、校验等逻辑抛错导致 UI 卡在「生成中…」
        if (ctx.onFinish) ctx.onFinish(n);
        try {
            if (ctx.outputTarget === 'mindmap') {
                if (typeof hideTcMindmapGenerating === 'function') hideTcMindmapGenerating();
                if (typeof switchTcRightView === 'function') switchTcRightView('mindmap');
                if (typeof renderTcMindmap === 'function') renderTcMindmap();
                if (typeof tcMindmapCaptureUndoBaseline === 'function') tcMindmapCaptureUndoBaseline();
                if (typeof tcMindmapClearAppendBaseline === 'function') tcMindmapClearAppendBaseline();
                if (typeof tcNotifyListGenerationSuccess === 'function') {
                    var mmBatchStart = ctx.batchRowStart != null ? ctx.batchRowStart : (parseInt(window._tcMindmapAppendBaselineCount, 10) || 0);
                    var mmBatchCount = sessionAdded > 0 ? sessionAdded : Math.max(0, n - mmBatchStart);
                    tcNotifyListGenerationSuccess(mmBatchCount, 'mindmap', ctx.scope, {
                        autoValidate: ctx.autoValidate,
                        userPrompt: ctx.userPrompt || '',
                        batchRowStart: mmBatchStart
                    });
                }
            } else {
                if (typeof syncTableDomAfterStream === 'function') {
                    syncTableDomAfterStream();
                } else {
                    if (typeof switchTcRightView === 'function') switchTcRightView('table');
                    if (typeof renderTableBody === 'function') renderTableBody({ reload: true });
                }
                var batchStart = ctx.batchRowStart != null ? ctx.batchRowStart : 0;
                var batchCount = sessionAdded > 0 ? sessionAdded : Math.max(0, n - batchStart);
                if (batchCount > 0 && ctx.batchRowStart == null && typeof tcResolveListGenerationBatchStart === 'function') {
                    batchStart = tcResolveListGenerationBatchStart(batchCount);
                    batchCount = sessionAdded > 0 ? sessionAdded : Math.max(0, n - batchStart);
                }
                if (typeof global.tcResolveListGenerationBatchContentRows === 'function') {
                    var bannerBatchRows = global.tcResolveListGenerationBatchContentRows();
                    if (bannerBatchRows > 0) batchCount = bannerBatchRows;
                }
                if (clientState.lastRowProvenance && typeof tcApplyServerProvenanceEntryToRows === 'function') {
                    tcApplyServerProvenanceEntryToRows(batchStart, batchCount, clientState.lastRowProvenance);
                } else {
                    if (typeof tcEnsurePendingGenerationProvenance === 'function') {
                        tcEnsurePendingGenerationProvenance(typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
                    }
                    if (typeof tcFinalizeGenerationProvenanceForRows === 'function') {
                        tcFinalizeGenerationProvenanceForRows(
                            batchStart,
                            batchCount,
                            typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset'
                        );
                    }
                }
                if (window.tcGenBatchCore && typeof window.tcGenBatchCore.onStreamingComplete === 'function') {
                    window.tcGenBatchCore.onStreamingComplete(batchStart, batchCount, 'list');
                } else if (window.tcGenBatchCore && typeof window.tcGenBatchCore.onGeneration === 'function') {
                    window.tcGenBatchCore.onGeneration(batchCount);
                }
                if (typeof tcNotifyListGenerationSuccess === 'function') {
                    tcNotifyListGenerationSuccess(batchCount, 'list', ctx.scope, {
                        autoValidate: ctx.autoValidate,
                        batchRowStart: batchStart,
                        userPrompt: ctx.userPrompt || ''
                    });
                }
            }
        } catch (err) {
            console.error('[TcGenerationStreamClient] finishSuccess side effects failed', err);
        }
    }

    function closeSource() {
        if (clientState.eventSource) {
            try { clientState.eventSource.close(); } catch (e) { /* ignore */ }
            clientState.eventSource = null;
        }
    }

    function subscribeStream(sessionId, ctx) {
        if (clientState.cancelled) return;
        closeSource();
        var es = new EventSource('/api/test-cases/generation-sessions/' + sessionId + '/stream');
        clientState.eventSource = es;
        es.onmessage = function (msg) {
            try {
                var data = JSON.parse(msg.data);
                handleEvent(data, ctx);
            } catch (e) { /* ignore */ }
        };
        es.onerror = function () {
            closeSource();
            if (!clientState.cancelled && !clientState.finished) {
                reconcileSession(ctx);
            }
        };
    }



    function syncListTableFromGridBeforeGeneration() {
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            return global.TcTableBridge.commitAll();
        }
        if (typeof global.tcTablePullRowsFromView === 'function') {
            return global.tcTablePullRowsFromView();
        }
        return Promise.resolve(false);
    }

    function finalizeListTableGenerationPrep(opts) {
        if (clientState.mergeMode !== 'append') clientState.listAppendBaseline = null;
        if (!clientState.listAppendBaseline && clientState.mergeMode === 'append' && typeof global.testCasesData !== 'undefined' && global.testCasesData) {
            clientState.listAppendBaseline = global.testCasesData.map(function (row) {
                return Array.isArray(row) ? row.slice() : row;
            });
        }
        if (opts.mergeMode === 'append') {
            opts.batchRowStart = typeof testCasesData !== 'undefined' ? testCasesData.length : 0;
        } else {
            opts.batchRowStart = typeof tcResolveGenerationBatchRowStart === 'function'
                ? tcResolveGenerationBatchRowStart(opts.mergeMode || 'overwrite')
                : (typeof testCasesData !== 'undefined' ? testCasesData.length : 0);
        }
        var _effectiveMergeMode = (opts.mergeMode === 'append' || clientState.mergeMode === 'append') ? 'append'
            : (opts.mergeMode || clientState.mergeMode || 'overwrite');
        if (_effectiveMergeMode === 'overwrite' &&
            !(typeof global.tcHasAppendGenerationBaseline === 'function' && global.tcHasAppendGenerationBaseline())) {
            opts.batchRowStart = 0;
            var onlyPlaceholderRows = typeof tcTableHasOnlyPlaceholderRows === 'function'
                && tcTableHasOnlyPlaceholderRows();
            if (!onlyPlaceholderRows) {
                if (window.TcWorkbenchData) {
                    TcWorkbenchData.resetStoreForGeneration('list');
                } else {
                    testCasesData = [];
                    testCasesProvenance = [];
                    markedRows = new Set();
                    selectedRows.clear();
                }
                if (typeof renderTableBody === 'function') renderTableBody({ reload: true });
            }
        }
    }

    function restoreListAppendBaselineIfNeeded(ctx) {
        if (typeof global.tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
            global.tcRestoreAppendGenerationBaselineIfNeeded();
        }
        var mergeMode = (ctx && ctx.mergeMode) || clientState.mergeMode || 'overwrite';
        if (mergeMode !== 'append') return;
        var baseline = clientState.listAppendBaseline;
        if (!baseline || !baseline.length || typeof global.testCasesData === 'undefined') return;
        var baseCount = 0;
        var nowCount = 0;
        for (var i = 0; i < baseline.length; i++) {
            if (typeof global.tcTableRowHasCaseContent === 'function') {
                if (global.tcTableRowHasCaseContent(baseline[i])) baseCount++;
            }
        }
        for (var j = 0; j < (global.testCasesData || []).length; j++) {
            if (typeof global.tcTableRowHasCaseContent === 'function') {
                if (global.tcTableRowHasCaseContent(global.testCasesData[j])) nowCount++;
            }
        }
        if (baseCount > nowCount || baseline.length > (global.testCasesData || []).length) {
            global.testCasesData = baseline.map(function (row) {
                return Array.isArray(row) ? row.slice() : row;
            });
            if (typeof global.tcEnsureProvenanceLength === 'function') {
                try { global.tcEnsureProvenanceLength(); } catch (eBase) { /* ignore */ }
            }
            if (typeof global.renderTableBody === 'function') {
                global.renderTableBody({ reload: true });
            }
        }
    }

    function isGenerationRateLimitError(err) {
        var msg = String((err && err.message) || err || '');
        return msg.indexOf('过于频繁') >= 0 || msg.indexOf('正在进行') >= 0 ||
            msg.indexOf('429') >= 0;
    }

    function cancelActiveSessionsForRetry() {
        return fetch('/api/test-cases/generation-sessions/active/cancel-all', {
            method: 'POST',
            credentials: 'same-origin'
        }).then(function (res) {
            return res.json().catch(function () { return {}; });
        }).catch(function () { return {}; });
    }


    function syncLanhuDocSwitcherLockUiAfterStream() {
        if (typeof global.tcSyncLanhuNavLockUiAfterGenerationIdle === 'function') {
            global.tcSyncLanhuNavLockUiAfterGenerationIdle();
        } else {
            if (typeof global.tcSyncLanhuDocSwitcherLockUi === 'function') {
                global.tcSyncLanhuDocSwitcherLockUi();
            }
            if (typeof global.tcSyncLanhuTreePageSwitchLockUi === 'function') {
                global.tcSyncLanhuTreePageSwitchLockUi();
            }
        }
    }

    function start(opts) {
        opts = wrapStreamCallbacks(opts || {});
        if (!isGenerationRunAllowed(opts)) {
            clientState.starting = false;
            if (opts.onCancel) opts.onCancel();
            return Promise.resolve();
        }
        clientState.cancelled = false;
        clientState.finished = false;
        clientState.starting = true;
        clientState.startAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
        clientState.sessionId = null;
        clientState.successHandled = false;
        clientState.streamText = '';
        clientState.reasoningText = '';
        clearThinkingUi();
        clientState.reconciling = false;
        clientState.totalRows = 0;
        clientState.sessionRowsAdded = 0;
        clientState.lastRowProvenance = null;
        clientState.mergeMode = opts.mergeMode || 'overwrite';
        clientState.listAppendBaseline = null;
        clientState.outputTarget = opts.outputTarget || 'list';
        clientState.scope = opts.scope || 'legacy_freeform';
        clientState.onFinish = opts.onFinish;
        clientState.onError = opts.onError;
        clientState.onCancel = opts.onCancel;
        syncLanhuDocSwitcherLockUiAfterStream();
        if (typeof tcResetGenerationWriteTracking === 'function') {
            tcResetGenerationWriteTracking();
        }
        if (opts.mergeMode === 'append' && opts.outputTarget === 'mindmap') {
            if (typeof tcMindmapPrepareAppendGeneration === 'function') {
                tcMindmapPrepareAppendGeneration();
            }
        } else if (typeof tcMindmapClearAppendBaseline === 'function') {
            tcMindmapClearAppendBaseline();
        }
        if (opts.outputTarget === 'mindmap' &&
            typeof tcResolveMindmapGenerationBatchRowStart === 'function') {
            opts.batchRowStart = tcResolveMindmapGenerationBatchRowStart(opts.mergeMode || 'overwrite');
        }

        if (global.TcGenerationStreamUi) {
            global.TcGenerationStreamUi.reset();
            var label = opts.outputTarget === 'mindmap' ? '导图用例生成' : '列表用例生成';
            global.TcGenerationStreamUi.open(label, {
                suppressLeftPanelUi: !!opts.suppressLeftPanelUi
            });
        }
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.setOutputTarget === 'function') {
            global.TcGenChatPipeline.setOutputTarget(opts.outputTarget === 'mindmap' ? 'mindmap' : 'list');
        }
        if (typeof resetTcStreamScrollPause === 'function') resetTcStreamScrollPause();
        if (typeof global.tcResetValidationParsedRows === 'function') {
            global.tcResetValidationParsedRows({ replace: true });
        }

        if (opts.lanhuCookie && opts.lanhuUrl && typeof tcCaptureGenerationLanhuContext === 'function') {
            tcCaptureGenerationLanhuContext(
                typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset',
                typeof TcWorkbenchEnhancements !== 'undefined' && TcWorkbenchEnhancements.getLastRequirementsSummary
                    ? TcWorkbenchEnhancements.getLastRequirementsSummary() : ''
            );
        }
        if (typeof tcEnsurePendingGenerationProvenance === 'function') {
            tcEnsurePendingGenerationProvenance(typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
        }

        if (opts.mergeMode === 'overwrite' && opts.outputTarget === 'mindmap') {
            if (typeof tcMindmapClearAppendBaseline === 'function') tcMindmapClearAppendBaseline();
            if (typeof resetStreamingMindmapState === 'function') resetStreamingMindmapState();
            tcMindmapExternalMindData = null;
            tcMindmapCasesData = [];
            tcMindmapCasesProvenance = [];
            tcMindmapUndoStack = [];
            tcMindmapHistory = [];
            tcMindmapHistoryIndex = -1;
            tcMindmapUndoBaseline = null;
            if (typeof showTcMindmapGenerating === 'function') showTcMindmapGenerating();
        }

        if (opts.outputTarget === 'list' && typeof tcShowGenBatchBar === 'function') {
            tcShowGenBatchBar(0, 'list');
            var title = document.getElementById('tc-gen-batch-title');
            if (title) title.textContent = '本次生成（进行中）';
        }
        if (opts.outputTarget === 'mindmap' && typeof tcShowGenBatchBar === 'function') {
            tcShowGenBatchBar(0, 'mindmap');
            var mmTitle = document.getElementById('tc-gen-batch-title');
            if (mmTitle) mmTitle.textContent = '本次生成（进行中）';
        }

        var body = buildRequestBody(opts);
        var prep = Promise.resolve();
        if ((opts.outputTarget || 'list') === 'list') {
            prep = prep.then(function () {
                if (clientState.mergeMode === 'append') {
                    if (typeof global.tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
                        global.tcRestoreAppendGenerationBaselineIfNeeded();
                    }
                    if (typeof global.tcGetAppendGenerationBaselineRows === 'function') {
                        var _appendBase = global.tcGetAppendGenerationBaselineRows();
                        if (_appendBase && _appendBase.length) {
                            clientState.listAppendBaseline = _appendBase;
                        }
                    }
                    if (!clientState.listAppendBaseline && typeof global.testCasesData !== 'undefined' && global.testCasesData) {
                        clientState.listAppendBaseline = global.testCasesData.map(function (row) {
                            return Array.isArray(row) ? row.slice() : row;
                        });
                    }
                    return Promise.resolve(false);
                }
                return syncListTableFromGridBeforeGeneration();
            }).then(function () {
                finalizeListTableGenerationPrep(opts);
                restoreListAppendBaselineIfNeeded({ mergeMode: clientState.mergeMode, outputTarget: 'list' });
                if (clientState.mergeMode === 'append' && typeof global.renderTableBody === 'function') {
                    global.renderTableBody({ reload: true });
                }
            });
        }
        if (global.TcVisualAttachments && typeof global.TcVisualAttachments.getAssets === 'function'
            && global.TcVisualAttachments.getAssets().length
            && typeof global.TcVisualAttachments.rebuildContext === 'function') {
            prep = prep.then(function () {
                return global.TcVisualAttachments.rebuildContext();
            });
        }
        return prep.then(function () {
            if (!isGenerationRunAllowed(opts)) {
                clientState.starting = false;
                if (opts.onCancel) opts.onCancel();
                return;
            }
            if (global.TcVisualAttachments && typeof global.TcVisualAttachments.appendPayload === 'function') {
                global.TcVisualAttachments.appendPayload(body);
            }
            if (clientState.cancelled) {
                clientState.starting = false;
                throw new Error('cancelled');
            }
            var fetchOpts = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            };
            if (clientState.startAbortController) {
                fetchOpts.signal = clientState.startAbortController.signal;
            }
            function createSessionOnce(retryAfterCancel) {
                return fetch('/api/test-cases/generation-sessions', fetchOpts)
                    .then(function (res) {
                        return res.json().then(function (data) {
                            if (res.status === 429) {
                                var rateErr = new Error(data.error || '生成过于频繁，请稍后再试');
                                rateErr.status = 429;
                                throw rateErr;
                            }
                            if (!res.ok) {
                                if (typeof globalThis.hfAiQuotaFromErrorBody === 'function' && globalThis.hfAiQuotaFromErrorBody(data)) {
                                    throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                                }
                                var createErr = data.error || '创建会话失败';
                                if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(createErr)) {
                                    throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                                }
                                throw new Error(createErr);
                            }
                            return data;
                        });
                    })
                    .catch(function (err) {
                        if (!retryAfterCancel && err && err.status === 429 &&
                            String(err.message || '').indexOf('正在进行') >= 0) {
                            return cancelActiveSessionsForRetry().then(function () {
                                return createSessionOnce(true);
                            });
                        }
                        throw err;
                    });
            }
            return createSessionOnce(false)
                .then(function (session) {
                    clientState.starting = false;
                    if (clientState.cancelled) {
                        clientState.sessionId = session.id;
                        return fetch('/api/test-cases/generation-sessions/' + encodeURIComponent(session.id) + '/cancel', { method: 'POST' })
                            .catch(function () { return null; })
                            .then(function () {
                                if (opts.onCancel) opts.onCancel();
                                return session;
                            });
                    }
                    clientState.sessionId = session.id;
                    subscribeStream(session.id, opts);
                    return session;
                })
                .catch(function (err) {
                    clientState.starting = false;
                    if (clientState.cancelled || (err && err.message === 'cancelled') ||
                        (typeof global.tcIsBenignFetchAbort === 'function' && global.tcIsBenignFetchAbort(err)) ||
                        (err && err.name === 'AbortError')) {
                        if (opts.onCancel) opts.onCancel();
                        return;
                    }
                    if (global.TcGenerationStreamUi) {
                        global.TcGenerationStreamUi.update({ step: 'gen' });
                    }
                    throw err;
                });
        });
    }

    function restoreMindmapUiAfterStreamStop() {
        if (clientState.outputTarget !== 'mindmap') return;
        if (typeof abortTcMindmapStreamingIfActive === 'function') {
            abortTcMindmapStreamingIfActive();
        } else if (typeof finalizeStreamingMindmap === 'function') {
            finalizeStreamingMindmap();
        } else if (typeof hideTcMindmapGenerating === 'function') {
            hideTcMindmapGenerating();
            if (typeof renderTcMindmap === 'function') renderTcMindmap();
        }
    }

    function cancel() {
        if (clientState.cancelled && clientState.finished) {
            return Promise.resolve();
        }
        clientState.cancelled = true;
        clientState.finished = true;
        syncLanhuDocSwitcherLockUiAfterStream();
        if (clientState.startAbortController) {
            try { clientState.startAbortController.abort(); } catch (e) { /* ignore */ }
        }
        clientState.starting = false;
        restoreMindmapUiAfterStreamStop();
        closeSource();
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.cancel === 'function') {
            global.TcGenChatPipeline.cancel();
        } else if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.cancel === 'function') {
            global.TcGenChatStreaming.cancel();
        }
        if (typeof global.restoreTcPromptComposerAfterStop === 'function') {
            global.restoreTcPromptComposerAfterStop({ releaseStreamUi: false });
        } else {
            releaseStreamUiImmediate({ status: 'cancelled' });
            if (typeof global.setTcLeftPanelAiGenerateLock === 'function') {
                global.setTcLeftPanelAiGenerateLock(false);
            }
            if (typeof global.syncTcPromptSendBtnState === 'function') {
                global.syncTcPromptSendBtnState();
            }
        }
        var sid = clientState.sessionId;
        var onCancel = clientState.onCancel;
        if (!sid) {
            if (onCancel) onCancel();
            return Promise.resolve();
        }
        return fetch('/api/test-cases/generation-sessions/' + sid + '/cancel', { method: 'POST' })
            .then(function () {
                restoreMindmapUiAfterStreamStop();
                if (clientState.outputTarget !== 'mindmap' && typeof finalizeStreamingRows === 'function') {
                    finalizeStreamingRows();
                }
                if (global.TcGenerationStreamUi) global.TcGenerationStreamUi.update({ step: 'cancelled' });
                if (typeof global.refreshTcPageGenLock === 'function') global.refreshTcPageGenLock();
                if (typeof global.clearOptimisticPageGenLock === 'function') global.clearOptimisticPageGenLock();
                if (onCancel) onCancel();
            })
            .catch(function () {
                restoreMindmapUiAfterStreamStop();
                if (onCancel) onCancel();
            });
    }

    function abortForPageLeave() {
        clientState.cancelled = true;
        clientState.finished = true;
        syncLanhuDocSwitcherLockUiAfterStream();
        if (global.TcGenChatPipeline && typeof global.TcGenChatPipeline.abortForPageLeave === 'function') {
            global.TcGenChatPipeline.abortForPageLeave();
        }
        closeSource();
        var sid = clientState.sessionId;
        if (sid) {
            try {
                fetch('/api/test-cases/generation-sessions/' + encodeURIComponent(sid) + '/cancel', {
                    method: 'POST',
                    credentials: 'same-origin',
                    keepalive: true
                });
            } catch (e) { /* ignore */ }
        }
    }

    function isCancelled() {
        return !!clientState.cancelled;
    }

    function isActive() {
        return !!(clientState.starting || (clientState.sessionId && !clientState.finished && !clientState.cancelled));
    }

    function getSessionId() {
        return clientState.sessionId || '';
    }

    global.TcGenerationStreamClient = {
        isEnabled: isStreamEnabled,
        start: start,
        cancel: cancel,
        abortForPageLeave: abortForPageLeave,
        isCancelled: isCancelled,
        isActive: isActive,
        getSessionId: getSessionId,
        getStreamText: getAccumulatedStreamText,
        getReasoningText: function () {
            return String(clientState.reasoningText || '').trim();
        },
        getTotalRows: function () {
            return getSessionParsedRowCount();
        },
        getSessionParsedRowCount: getSessionParsedRowCount,
        getSessionRowsAdded: function () {
            return clientState.sessionRowsAdded || 0;
        },
        getOutputTarget: function () {
            return clientState.outputTarget || 'list';
        },
        getMergeMode: function () {
            return clientState.mergeMode || 'overwrite';
        },

        hasGeneratedRows: hasStreamGeneratedRows
    };
    global.isTcStreamGenerationEnabled = isStreamEnabled;
})(typeof window !== 'undefined' ? window : this);
