/**
 * TestHub — 流式生成进度（对话区实时展示）
 */
(function (global) {
    'use strict';

    var STEP_LABELS = {
        connect: '连接模型',
        gen: '生成用例',
        parse: '解析',
        write: '写入表格',
        done: '完成',
        error: '生成出错',
        cancelled: '已取消'
    };

    var state = {
        open: false,
        suppressLeftPanelUi: false,
        parsedRows: 0,
        moduleName: '',
        step: 'connect',
        inParsePhase: false
    };

    var closeSchedule = { timer: null };
    var DONE_HOLD_MS = 3000;

    function $(id) { return document.getElementById(id); }

    function isHeadlessGenerationUi() {
        return !!(state.suppressLeftPanelUi || (global.__tcSuppressLeftPanelUi));
    }

    function ensureLeftPanelOpen() {
        if (isHeadlessGenerationUi()) return;
        var panel = $('left-panel');
        if (!panel || !panel.classList.contains('tc-left-float-panel--collapsed')) return;
        if (typeof toggleCollapse === 'function') toggleCollapse();
    }

    function currentStepLabel() {
        return STEP_LABELS[state.step] || STEP_LABELS.connect;
    }


    function progressDetailText() {
        var parts = [];
        if (state.inParsePhase || state.parsedRows > 0) {
            parts.push('已解析 ' + state.parsedRows + ' 条');
        }
        if (state.moduleName) parts.push(state.moduleName);
        return parts.join(' · ');
    }

    function progressStatus() {
        if (state.step === 'done') return 'done';
        if (state.step === 'error') return 'error';
        if (state.step === 'cancelled') return 'cancelled';
        return 'active';
    }

    function isActiveStep() {
        return state.step === 'connect' || state.step === 'gen' || state.step === 'parse' || state.step === 'write';
    }

    function clearCloseSchedule() {
        if (closeSchedule.timer) {
            window.clearTimeout(closeSchedule.timer);
            closeSchedule.timer = null;
        }
    }

    function scheduleStreamingClose() {
        clearCloseSchedule();
        closeSchedule.timer = window.setTimeout(function () {
            closeSchedule.timer = null;
            closePanel();
        }, DONE_HOLD_MS);
    }

    function setStreamingChrome(on) {
        var panel = $('left-panel');
        var actions = $('tc-ai-generate-actions');
        if (panel) panel.classList.toggle('tc-left-panel--gen-streaming', !!on);
        if (actions) actions.classList.toggle('tc-ai-generate-actions--streaming', !!on);
        if (typeof global.syncTcPromptSendBtnState === 'function') {
            global.syncTcPromptSendBtnState();
        }
    }

    function renderChatProgress() {
        var syncFn = global.TcGenChatPipeline && (
            global.TcGenChatPipeline.syncStreamProgressStep || global.TcGenChatPipeline.syncStreamStep
        );
        if (syncFn) {
            var payload = {
                step: state.step,
                parsedRows: state.parsedRows,
                detail: progressDetailText()
            };
            if (state.step === 'done' && global.TcGenChatPipeline.getStreamText) {
                payload.stream_text = global.TcGenChatPipeline.getStreamText();
            }
            if (global.TcGenChatPipeline.getThinkingText) {
                payload.reasoning_text = global.TcGenChatPipeline.getThinkingText();
            }
            if (!payload.reasoning_text && global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.getReasoningText === 'function') {
                payload.reasoning_text = global.TcGenerationStreamClient.getReasoningText();
            }
            syncFn(payload);
        }
    }


    function openPanel(label, opts) {
        opts = opts || {};
        clearCloseSchedule();
        state.suppressLeftPanelUi = !!opts.suppressLeftPanelUi;
        if (!state.suppressLeftPanelUi) {
            ensureLeftPanelOpen();
        }
        if (global.TcGenChatPipeline && global.TcGenChatPipeline.enabled && global.TcGenChatPipeline.enabled()) {
            var syncFn = global.TcGenChatPipeline.syncStreamProgressStep || global.TcGenChatPipeline.syncStreamStep;
            if (syncFn) syncFn({ step: 'connect' });
        }
        state.open = !state.suppressLeftPanelUi;
        if (!state.suppressLeftPanelUi) {
            setStreamingChrome(true);
        }
    }

    function completeChatProgressTerminal(opts) {
        opts = opts || {};
        if (global.TcGenChatPipeline && (
            global.TcGenChatPipeline.syncStreamProgressStep || global.TcGenChatPipeline.syncStreamStep
        )) {
            var terminalStep = opts.status === 'error' ? 'error' : (opts.status === 'cancelled' ? 'cancelled' : 'done');
            var payload = {
                step: terminalStep,
                parsedRows: state.parsedRows,
                detail: opts.detail || progressDetailText()
            };
            if (terminalStep === 'done' && global.TcGenChatPipeline.getStreamText) {
                payload.stream_text = global.TcGenChatPipeline.getStreamText();
            }
            if (global.TcGenChatPipeline.getThinkingText) {
                payload.reasoning_text = global.TcGenChatPipeline.getThinkingText();
            }
            if (!payload.reasoning_text && global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.getReasoningText === 'function') {
                payload.reasoning_text = global.TcGenerationStreamClient.getReasoningText();
            }
            var syncTerminal = global.TcGenChatPipeline.syncStreamProgressStep || global.TcGenChatPipeline.syncStreamStep;
            syncTerminal(payload);
        }
    }

    function closePanel() {
        clearCloseSchedule();
        if (state.open && isActiveStep()) {
            completeChatProgressTerminal({
                stepLabel: STEP_LABELS.cancelled,
                status: 'cancelled',
                detail: progressDetailText()
            });
        }
        state.open = false;
        if (!state.suppressLeftPanelUi) {
            setStreamingChrome(false);
        }
        state.suppressLeftPanelUi = false;
        if (typeof global.tcGenChatFinalizeProgress === 'function') {
            global.tcGenChatFinalizeProgress();
        }
    }

    function ensureStreamingFinished() {
        if (global.TcGenChatPipeline) {
            if (global.TcGenChatPipeline.isFinished && global.TcGenChatPipeline.isFinished()) {
                return;
            }
            if (global.TcGenChatPipeline.finish) {
                var streamText = global.TcGenChatPipeline.getStreamText
                    ? global.TcGenChatPipeline.getStreamText()
                    : '';
                var reasoningText = '';
                if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.getReasoningText === 'function') {
                    reasoningText = global.TcGenerationStreamClient.getReasoningText() || '';
                }
                if (!reasoningText && global.TcGenChatPipeline.getThinkingText) {
                    reasoningText = global.TcGenChatPipeline.getThinkingText() || '';
                }
                global.TcGenChatPipeline.finish({
                    total_rows: state.parsedRows,
                    stream_text: streamText,
                    reasoning_text: reasoningText
                });
                return;
            }
        }
        if (global.TcGenChatStreaming && typeof global.TcGenChatStreaming.finish === 'function') {
            global.TcGenChatStreaming.finish({ total_rows: state.parsedRows });
        }
    }

    function updateProgress(opts) {
        opts = opts || {};
        if (opts.parsedRows != null) state.parsedRows = opts.parsedRows;
        if (opts.moduleName != null) state.moduleName = opts.moduleName;
        if (opts.step) {
            state.step = opts.step;
            if (opts.step === 'parse' || opts.step === 'write') state.inParsePhase = true;
        }
        renderChatProgress();
        paintBatchBarStreaming();
        if (opts.step === 'done' || opts.step === 'cancelled' || opts.step === 'error') {
            scheduleStreamingClose();
        }
    }

    function isPanelOpen() {
        return !!state.open;
    }

    /** 生成流程结束：流式 UI 未进入终态时补全并收起（避免回退标准生成后卡在「连接模型」） */
    function releaseAfterGenerate(opts) {
        opts = opts || {};
        if (opts.immediate) {
            if (opts.status === 'error') {
                completeChatProgressTerminal({
                    stepLabel: STEP_LABELS.error,
                    status: 'error',
                    detail: opts.detail || ''
                });
            } else if (isActiveStep() || state.open) {
                completeChatProgressTerminal({
                    stepLabel: STEP_LABELS.cancelled,
                    status: 'cancelled',
                    detail: progressDetailText()
                });
            }
            ensureStreamingFinished();
            closePanel();
            reset();
            return;
        }
        if (opts.parsedRows != null) state.parsedRows = opts.parsedRows;
        if (state.step !== 'done' && state.step !== 'cancelled' && state.step !== 'error') {
            state.step = 'done';
        }
        completeChatProgressTerminal({
            stepLabel: currentStepLabel(),
            status: progressStatus(),
            detail: progressDetailText()
        });
        ensureStreamingFinished();
        if (!state.open) {
            setStreamingChrome(false);
            if (typeof global.tcGenChatFinalizeProgress === 'function') {
                global.tcGenChatFinalizeProgress();
            }
            reset();
            return;
        }
        if (state.step === 'done' || state.step === 'cancelled' || state.step === 'error') {
            renderChatProgress();
            if (!closeSchedule.timer) scheduleStreamingClose();
            return;
        }
        renderChatProgress();
        scheduleStreamingClose();
    }

    function paintBatchBarStreaming() {
        var meta = document.getElementById('tc-gen-batch-meta');
        if (meta) {
            meta.textContent = state.parsedRows > 0 ? ('已解析 ' + state.parsedRows + ' 条') : '';
        }
    }

    function reset() {
        state.suppressLeftPanelUi = false;
        state.parsedRows = 0;
        state.moduleName = '';
        state.step = 'connect';
        state.inParsePhase = false;
        clearCloseSchedule();
    }

    global.TcGenerationStreamUi = {
        open: openPanel,
        close: closePanel,
        update: updateProgress,
        reset: reset,
        releaseAfterGenerate: releaseAfterGenerate,
        isOpen: isPanelOpen,
        init: function () {},
        paintBatchBar: paintBatchBarStreaming
    };
})(typeof window !== 'undefined' ? window : this);
