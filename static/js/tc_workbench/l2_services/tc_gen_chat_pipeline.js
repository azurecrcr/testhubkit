/**
 * 用例生成弹窗 — 流水线阶段（每步独立对话气泡）+ AI 流式输出
 */
(function (global) {
    'use strict';

    var STEPS_STANDARD = [
        { id: 'lanhu', label: '获取蓝湖需求' },
        { id: 'parse_req', label: '解析与检索需求' },
        { id: 'generate', label: 'AI 生成用例' },
        { id: 'parse_rows', label: '解析并写入表格' }
    ];

    var STEPS_MODULE = [
        { id: 'lanhu', label: '获取蓝湖需求' },
        { id: 'parse_req', label: '解析与检索需求' },
        { id: 'split_modules', label: '模块拆分' },
        { id: 'generate_modules', label: '分模块生成用例' },
        { id: 'dedupe', label: '交叉去重' },
        { id: 'parse_rows', label: '解析并写入表格' }
    ];

    var STEPS = STEPS_STANDARD.slice();

    var STEP_IDS = STEPS.map(function (s) { return s.id; });

    var state = {
        sessionActive: false,
        stepMsgs: {},
        streamEl: null,
        streamMsg: null,
        cancelBtn: null,
        buffer: '',
        thinkingBuffer: '',
        completed: false,
        cancelled: false,
        failed: false,
        failedStepId: '',
        activeStepId: '',
        expanded: false,
        rafPending: false,
        paintQueued: false,
        lastChunkAt: 0,
        qualityCheckEnabled: false,
        pendingQualityCheckInChat: false,
        validateReasoningBuffer: '',
        outputTarget: 'list',
        runToken: 0,
        stepPhaseSnapshot: {},
        useModulePipeline: false,
        moduleStepThinking: {
            split_modules: '',
            generate_modules: '',
            module_count: 0,
            generate_module_slots: []
        }
    };

    var scheduledArchiveHandles = { raf1: 0, raf2: 0, timeout: 0 };

    function setOutputTarget(target) {
        target = target === 'mindmap' ? 'mindmap' : 'list';
        state.outputTarget = target;
    }

    function detectPipelineOutputTarget() {
        if (state.outputTarget === 'mindmap' || state.outputTarget === 'list') {
            return state.outputTarget;
        }
        if (global.TcGenerationStreamClient && global.TcGenerationStreamClient.outputTarget) {
            var fromClient = global.TcGenerationStreamClient.outputTarget;
            if (fromClient === 'mindmap' || fromClient === 'list') return fromClient;
        }
        if (typeof global.tcRightViewMode !== 'undefined' && global.tcRightViewMode === 'mindmap') {
            return 'mindmap';
        }
        if (typeof document !== 'undefined' && document.body &&
            document.body.classList.contains('tc-left-gen-compact--mindmap')) {
            return 'mindmap';
        }
        return 'list';
    }

    function pipelineWriteStepLabel(target, phase) {
        target = target || detectPipelineOutputTarget();
        if (target === 'mindmap') {
            return phase === 'active' ? '写入导图…' : '已写入思维导图';
        }
        return phase === 'active' ? '写入表格…' : '已写入表格';
    }

    function pipelineParseWriteStepTitle(target) {
        target = target || detectPipelineOutputTarget();
        return target === 'mindmap' ? '解析并写入导图' : '解析并写入表格';
    }

    function pipelineParseWriteActiveDetail(target, phase) {
        target = target || detectPipelineOutputTarget();
        if (phase === 'write') {
            return pipelineWriteStepLabel(target, 'active');
        }
        if (phase === 'parse') {
            return '解析用例结构…';
        }
        return pipelineParseWriteStepTitle(target) + '…';
    }

    function pipelineParseWriteDoneDetail(target, rowCount, parsedDetail) {
        target = target || detectPipelineOutputTarget();
        rowCount = Math.max(0, parseInt(rowCount, 10) || 0);
        var parsed = String(parsedDetail || '').trim();
        var writeDone = pipelineWriteStepLabel(target, 'done');
        if (parsed && /写入/.test(parsed)) return parsed;
        if (parsed) {
            var writeTail = writeDone.replace(/^已/, '');
            return parsed + '并' + writeTail;
        }
        if (rowCount > 0) {
            return target === 'mindmap'
                ? ('已解析 ' + rowCount + ' 条并写入思维导图')
                : ('已解析 ' + rowCount + ' 条并写入表格');
        }
        return writeDone;
    }

    function normalizePipelineStepId(stepId) {
        if (stepId === 'write') return 'parse_rows';
        if (stepId === 'rag_context') return 'parse_req';
        return stepId;
    }

    function mergeParseWriteDetail(existingDetail, newDetail) {
        existingDetail = String(existingDetail || '').trim();
        newDetail = String(newDetail || '').trim();
        if (!existingDetail) return newDetail;
        if (!newDetail || existingDetail.indexOf(newDetail) >= 0) return existingDetail;
        if (newDetail.indexOf(existingDetail) >= 0) return newDetail;
        if (/写入/.test(newDetail) && /已解析/.test(existingDetail)) {
            return existingDetail.replace(/…$/, '') + '，' + newDetail;
        }
        return newDetail || existingDetail;
    }

    function pipelineFallbackSummaryText(rowCount, target) {
        target = target || detectPipelineOutputTarget();
        rowCount = Math.max(0, parseInt(rowCount, 10) || 0);
        if (target === 'mindmap') {
            return '已解析 **' + rowCount + '** 条导图用例并写入右侧思维导图。';
        }
        return '已解析 **' + rowCount + '** 条用例并写入右侧表格。';
    }

    function countListCaseContentRows() {
        return typeof global.tcCountTableCaseContentRows === 'function'
            ? global.tcCountTableCaseContentRows(0)
            : 0;
    }

    function countMindmapCaseContentRows() {
        var rows = typeof global.tcMindmapCasesData !== 'undefined' ? global.tcMindmapCasesData : null;
        if (rows && rows.length) {
            var n = 0;
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (!row) continue;
                if (typeof global.tcTableRowHasCaseContent === 'function') {
                    if (global.tcTableRowHasCaseContent(row)) n++;
                } else if (row.some(function (cell) { return String(cell != null ? cell : '').trim(); })) {
                    n++;
                }
            }
            if (n > 0) return n;
            return rows.length;
        }
        if (global.TcGenerationStreamClient) {
            var sessionAdded = typeof global.TcGenerationStreamClient.getSessionRowsAdded === 'function'
                ? global.TcGenerationStreamClient.getSessionRowsAdded() : 0;
            var totalRows = typeof global.TcGenerationStreamClient.getTotalRows === 'function'
                ? global.TcGenerationStreamClient.getTotalRows() : 0;
            return Math.max(sessionAdded, totalRows);
        }
        return 0;
    }

    function countPipelineContentRows(target) {
        target = target || detectPipelineOutputTarget();
        return target === 'mindmap' ? countMindmapCaseContentRows() : countListCaseContentRows();
    }

    function hasMeaningfulStreamOutput(text) {
        text = String(text || '').trim();
        if (!text) return false;
        return !isFallbackSummary(text) && !isMindmapFallbackSummary(text);
    }

    function getStepIndex(stepId) {
        stepId = normalizePipelineStepId(stepId);
        for (var i = 0; i < STEP_IDS.length; i++) {
            if (STEP_IDS[i] === stepId) return i;
        }
        return -1;
    }

    function isFailed() {
        return !!state.failed;
    }

    function resolveDefaultFailStepId() {
        if (state.useModulePipeline) return 'split_modules';
        return 'generate';
    }

    function abortSubsequentSteps(failedStepId, reason) {
        failedStepId = String(failedStepId || resolveDefaultFailStepId());
        var failIdx = getStepIndex(failedStepId);
        if (failIdx < 0) failIdx = 0;
        state.failed = true;
        state.failedStepId = failedStepId;
        state.pendingQualityCheckInChat = false;
        state.completed = true;
        var skipDetail = '因前序步骤失败已跳过';
        for (var i = failIdx + 1; i < STEP_IDS.length; i++) {
            paintStepMessage(STEP_IDS[i], 'skip', skipDetail);
        }
        resetValidateSubStepsInUi();
    }

    function enabled() {
        try {
            if (global.TC_GEN_CHAT_PIPELINE_ENABLED === false || global.TC_GEN_CHAT_PIPELINE_ENABLED === 0) return false;
            return global.TC_GEN_CHAT_PIPELINE_ENABLED === true || global.TC_GEN_CHAT_PIPELINE_ENABLED === 1
                || global.TC_GEN_CHAT_STATUS_ENABLED === true || global.TC_GEN_CHAT_STATUS_ENABLED === 1;
        } catch (e) {
            return false;
        }
    }

    function getThread() {
        return document.getElementById('tc-gen-chat-thread');
    }

    function getStepDef(id) {
        for (var i = 0; i < STEPS.length; i++) {
            if (STEPS[i].id === id) {
                if (id === 'parse_rows') {
                    return { id: id, label: pipelineParseWriteStepTitle() };
                }
                return STEPS[i];
            }
        }
        return null;
    }

    function thinkingPreview(text, maxLen) {
        text = String(text || '').trim();
        maxLen = maxLen || 80;
        if (!text) return '';
        if (text.length <= maxLen) return text;
        return text.slice(0, maxLen) + '…';
    }

    function isParseRowsDone() {
        var row = state.stepMsgs.parse_rows;
        if (!row || !row.isConnected) return false;
        return row.classList.contains('tc-gen-chat-msg--pipeline-step--done');
    }

    function bufferLooksLikeCaseOutput(buf) {
        buf = String(buf || '');
        if (!buf.trim()) return false;
        if (/test_cases\s*=|\[\s*\[|^\s*\[\s*\{/m.test(buf)) return true;
        return false;
    }

    function bufferLooksLikeMindmapOutput(buf) {
        buf = String(buf || '');
        if (!buf.trim()) return false;
        if (/(?:^|\n)\s*[-*+]?\s*TC\s*[:：]/im.test(buf)) return true;
        if (/^Here'?s a thinking process:/im.test(buf) && /[\u4e00-\u9fff]/.test(buf)) return true;
        return false;
    }

    function ensureParseRowsForOutput(detail) {
        if (state.completed || state.failed) return;
        if (!bufferLooksLikeCaseOutput(state.buffer)) return;
        if (isParseRowsDone()) return;
        paintStepMessage('parse_rows', 'active', detail || '正在接收模型输出…');
    }

    function paintGenerateThinkingDetail(status, detail) {
        if (!enabled()) return;
        var thinkLen = String(state.thinkingBuffer || '').trim().length;
        var msg = String(detail || '').trim();
        if (!msg) {
            msg = thinkLen > 0 ? ('思考中…（' + thinkLen + ' 字）') : '思考中…';
        }
        paintStepMessage('generate', status || 'active', msg);
    }

    function paintGenerateDetailDuringStream() {
        var thinkLen = String(state.thinkingBuffer || '').trim().length;
        if (thinkLen > 0) {
            paintStepMessage('generate', 'active', '思考中…');
            return;
        }
        paintStepMessage('generate', 'active', '模型生成中…');
    }

    function syncThinkingGlobals(text, replace) {
        text = String(text || '');
        if (!text.trim()) return;
        if (replace) {
            global.__tcGenReasoningText = text;
        } else {
            global.__tcGenReasoningText = (global.__tcGenReasoningText || '') + text;
        }
        try {
            global.dispatchEvent(new CustomEvent('tc-gen-reasoning-update', {
                detail: {
                    text: global.__tcGenReasoningText,
                    piece: text,
                    replace: !!replace
                }
            }));
        } catch (e) { /* ignore */ }
        if (global.TcGenChatXUi && typeof global.TcGenChatXUi.setThinkingContent === 'function') {
            global.TcGenChatXUi.setThinkingContent(global.__tcGenReasoningText, { replace: true });
        }
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatTime(date) {
        var h = date.getHours();
        var m = date.getMinutes();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    var TC_GEN_CHAT_SCROLL_EPS = 48;

    function getTcGenChatScrollEl() {
        var thread = getThread();
        if (!thread) return null;
        return thread.querySelector(".tc-gen-chat-x-scroll") || thread;
    }

    function isTcGenChatNearBottom(el) {
        el = el || getTcGenChatScrollEl();
        if (!el) return true;
        if (el.scrollHeight <= el.clientHeight + TC_GEN_CHAT_SCROLL_EPS) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight <= TC_GEN_CHAT_SCROLL_EPS;
    }

    function scrollBottom(opts) {
        opts = opts || {};
        if (!opts.force && !isTcGenChatNearBottom()) return;
        if (useXRenderer()) {
            if (typeof global.TcGenChatXUi.scrollBottom === "function") {
                global.TcGenChatXUi.scrollBottom(opts);
            }
            if (typeof global.syncTcGenChatLayout === "function") global.syncTcGenChatLayout();
            return;
        }
        var thread = getThread();
        if (thread) thread.scrollTop = thread.scrollHeight;
        if (typeof global.syncTcGenChatLayout === "function") global.syncTcGenChatLayout();
    }

    function useXRenderer() {
        try {
            return !!(global.TcGenChatXUi && global.TcGenChatXUi.ready);
        } catch (e) {
            return false;
        }
    }

    function xUpdateStream(showCursor) {
        if (!useXRenderer()) return false;
        global.TcGenChatXUi.updateStream({
            buffer: state.buffer,
            completed: state.completed,
            cancelled: state.cancelled,
            showCursor: showCursor !== false && !state.completed && !state.cancelled
        });
        var thinkingText = String(state.thinkingBuffer || '');
        if (thinkingText.trim()) {
            if (typeof global.TcGenChatXUi.setThinkingContent === 'function') {
                global.TcGenChatXUi.setThinkingContent(thinkingText, { replace: true });
            } else {
                try {
                    global.dispatchEvent(new CustomEvent('tc-gen-reasoning-update', {
                        detail: { text: thinkingText, piece: thinkingText, replace: true }
                    }));
                } catch (e) { /* ignore */ }
            }
        }
        return true;
    }

    /** 将 content 流中 test_cases 赋值前的分析文字拆到思考区（无 reasoning 字段的模型） */
    function maybeSplitContentThinking() {
        var buf = String(state.buffer || '');
        if (!buf.trim()) return;
        if (detectPipelineOutputTarget() === 'mindmap' && bufferLooksLikeMindmapOutput(buf)) {
            return;
        }
        var re = /(?:^|\n)\s*(?:```(?:python|json)?\s*\n)?\s*test_cases\s*=/m;
        var m = re.exec(buf);
        if (m && m.index > 0) {
            var prefix = buf.slice(0, m.index).trim();
            state.buffer = buf.slice(m.index).replace(/^\s+/, '');
            if (prefix && prefix.length >= 6) {
                state.thinkingBuffer = prefix;
                syncThinkingGlobals(state.thinkingBuffer, true);
                paintGenerateThinkingDetail('active');
            }
            return;
        }
        if (bufferLooksLikeCaseOutput(buf)) return;
        var preview = buf.trim();
        if (preview.length < 6) return;
        if (!String(state.thinkingBuffer || '').trim() || preview.length > String(state.thinkingBuffer || '').length) {
            state.thinkingBuffer = preview;
            syncThinkingGlobals(state.thinkingBuffer, true);
            paintGenerateThinkingDetail('active');
        }
    }

    function formatInlineRichText(text) {
        var escaped = escapeHtml(text);
        escaped = escaped.replace(/`([^`\n]+)`/g, '<code class="tc-chat-inline-code">$1</code>');
        escaped = escaped.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        return escaped.replace(/\n/g, '<br>');
    }

    function renderRichTextHtml(text) {
        var src = String(text || '');
        if (!src) return '';
        var parts = src.split('```');
        var html = '';
        for (var i = 0; i < parts.length; i++) {
            if (i % 2 === 1) {
                var code = parts[i].replace(/^\w*\n/, '');
                html += '<pre class="tc-chat-code-block"><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>';
            } else {
                html += formatInlineRichText(parts[i]);
            }
        }
        return html;
    }

    function bindCancel(btn) {
        if (!btn || btn._tcPipelineBound) return;
        btn._tcPipelineBound = true;
        btn.addEventListener('click', function () {
            if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.cancel === 'function') {
                global.TcGenerationStreamClient.cancel();
            }
        });
    }

    function bindGenerateStreamRefs(item) {
        if (!item) return;
        state.streamMsg = item;
        state.streamEl = item.querySelector('.tc-chat-streaming-content');
        state.cancelBtn = item.querySelector('.tc-pipeline-step__cancel');
        bindCancel(state.cancelBtn);
    }

    function paintStream(showCursor) {
        if (xUpdateStream(showCursor)) {
            scrollBottom();
            return;
        }
        if (!state.streamEl) return;
        var text = state.buffer;
        if (text.length > 50000) text = text.slice(-50000);
        var preview = text;
        var collapseAt = 1200;
        if (state.completed && text.length > collapseAt && !state.expanded) {
            preview = text.slice(0, collapseAt) + '\u2026';
        }
        state.streamEl.innerHTML = renderRichTextHtml(preview);
        if (showCursor && !state.completed && !state.cancelled) {
            state.streamEl.insertAdjacentHTML('beforeend', '<span class="tc-chat-streaming-cursor" aria-hidden="true"></span>');
        }
        if (state.streamMsg) {
            state.streamMsg.classList.toggle('tc-gen-chat-msg--pipeline-stall',
                !state.completed && state.lastChunkAt && (Date.now() - state.lastChunkAt > 500));
        }
        scrollBottom();
    }

    function scheduleStreamPaint(showCursor) {
        state.paintQueued = true;
        if (state.rafPending) return;
        state.rafPending = true;
        requestAnimationFrame(function () {
            state.rafPending = false;
            if (!state.paintQueued) return;
            state.paintQueued = false;
            paintStream(showCursor !== false);
        });
    }

    function flushStreamPaint(showCursor) {
        state.paintQueued = false;
        paintStream(showCursor);
    }

    function createStepMessage(stepId) {
        var def = getStepDef(stepId);
        if (!def) return null;
        var thread = getThread();
        if (!thread) return null;

        var isGenerate = stepId === 'generate';
        var item = document.createElement('article');
        item.className = 'tc-gen-chat-msg tc-gen-chat-msg--assistant tc-gen-chat-msg--pipeline-step tc-gen-chat-msg--pipeline-step--pending';
        item.setAttribute('data-tc-gen-pipeline-step', stepId);

        var bubbleHtml =
            '<div class="tc-gen-chat-msg__bubble tc-gen-chat-msg__bubble--pipeline-step">' +
            '<div class="tc-pipeline-step">' +
            '<div class="tc-pipeline-step__head">' +
            '<span class="tc-pipeline-step__dot" aria-hidden="true"></span>' +
            '<span class="tc-pipeline-step__title">' + escapeHtml(def.label) + '</span>' +
            '</div>' +
            '<p class="tc-pipeline-step__detail hidden"></p>' +
            '</div>';

        if (isGenerate) {
            bubbleHtml +=
                '<div class="tc-pipeline-step__stream-wrap hidden">' +
                '<div class="tc-pipeline-step__stream-label">模型输出</div>' +
                '<div class="tc-pipeline-step__stream tc-chat-streaming-content" aria-live="polite"></div>' +
                '<button type="button" class="tc-pipeline-step__cancel hidden" aria-label="取消生成">取消生成</button>' +
                '</div>';
        }

        bubbleHtml += '</div>';

        item.innerHTML =
            bubbleHtml +
            '<div class="tc-gen-chat-msg__meta">' +
            '<span class="tc-gen-chat-msg__mode">AI 助手</span>' +
            '<time class="tc-gen-chat-msg__time">' + formatTime(new Date()) + '</time>' +
            '</div>';

        thread.appendChild(item);
        state.stepMsgs[stepId] = item;
        if (isGenerate) bindGenerateStreamRefs(item);
        scrollBottom();
        return item;
    }

    function ensureStepMessage(stepId) {
        var existing = state.stepMsgs[stepId];
        if (existing && existing.isConnected) {
            if (stepId === 'generate') bindGenerateStreamRefs(existing);
            return existing;
        }
        return createStepMessage(stepId);
    }

    function rememberStepPhase(stepId, status, detail) {
        if (!stepId) return;
        state.stepPhaseSnapshot = state.stepPhaseSnapshot || {};
        state.stepPhaseSnapshot[stepId] = {
            status: status || 'pending',
            detail: String(detail || '').trim()
        };
    }

    function buildCombinedGenerateModulesText(slots) {
        if (!Array.isArray(slots) || !slots.length) return '';
        return slots.map(function (slot) {
            var text = String((slot && slot.text) || '').trim();
            if (!text) return '';
            var name = slot && slot.name ? String(slot.name) : '';
            return name ? ('【' + name + '】\n' + text) : text;
        }).filter(Boolean).join('\n\n');
    }

    function normalizeModuleGenSlots(slots) {
        if (!Array.isArray(slots)) return [];
        return slots.map(function (slot, idx) {
            slot = slot || {};
            return {
                name: String(slot.name || ('模块' + (idx + 1))),
                text: String(slot.text || ''),
                status: String(slot.status || 'pending')
            };
        });
    }

    function syncModuleGenSlotsToXUi(opts) {
        opts = opts || {};
        if (!useXRenderer() || !global.TcGenChatXUi) return;
        var slots = state.moduleStepThinking.generate_module_slots || [];
        if (!slots.length) return;
        if (typeof global.TcGenChatXUi.setModuleGenSlots === 'function') {
            global.TcGenChatXUi.setModuleGenSlots(slots, opts);
            return;
        }
        if (typeof global.TcGenChatXUi.setModuleStepThinking === 'function') {
            global.TcGenChatXUi.setModuleStepThinking(
                'generate_modules',
                state.moduleStepThinking.generate_modules || buildCombinedGenerateModulesText(slots),
                { replace: true, force: !!opts.force }
            );
        }
    }

    function setModuleGenPlan(modules, opts) {
        opts = opts || {};
        var list = Array.isArray(modules) ? modules : [];
        if (!list.length) return;
        var slots = list.map(function (mod, idx) {
            var name = '';
            if (mod && typeof mod === 'object') {
                name = String(mod.name || '').trim();
            } else {
                name = String(mod || '').trim();
            }
            return {
                name: name || ('模块' + (idx + 1)),
                text: '',
                status: 'pending'
            };
        });
        state.moduleStepThinking.module_count = slots.length;
        state.moduleStepThinking.generate_module_slots = slots;
        syncModuleGenSlotsToXUi(opts);
        if (typeof global.dispatchEvent === 'function') {
            global.dispatchEvent(new CustomEvent('tc-gen-pipeline-step'));
        }
    }

    function setModuleGenSlots(slots, opts) {
        opts = opts || {};
        var normalized = normalizeModuleGenSlots(slots);
        if (!normalized.length) return;
        state.moduleStepThinking.generate_module_slots = normalized;
        state.moduleStepThinking.module_count = normalized.length;
        state.moduleStepThinking.generate_modules = buildCombinedGenerateModulesText(normalized);
        syncModuleGenSlotsToXUi(opts);
        if (typeof global.dispatchEvent === 'function') {
            global.dispatchEvent(new CustomEvent('tc-gen-pipeline-step'));
        }
    }

    function setModuleStepThinking(stepId, text, opts) {
        opts = opts || {};
        if (stepId !== 'split_modules' && stepId !== 'generate_modules') return;
        text = String(text != null ? text : '');
        var prev = String(state.moduleStepThinking[stepId] || '');
        if (!text.trim() && prev.trim()) return;
        if (opts.replace || !prev.trim()) {
            state.moduleStepThinking[stepId] = text;
        } else if (text.length > prev.length) {
            state.moduleStepThinking[stepId] = text;
        } else if (!text.trim()) {
            return;
        }
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.setModuleStepThinking === 'function') {
            global.TcGenChatXUi.setModuleStepThinking(stepId, state.moduleStepThinking[stepId], {
                replace: true
            });
        }
        if (typeof global.dispatchEvent === 'function') {
            global.dispatchEvent(new CustomEvent('tc-gen-pipeline-step'));
        }
    }

    function getModuleStepThinkingSnapshot() {
        return {
            split_modules: String(state.moduleStepThinking.split_modules || ''),
            generate_modules: String(state.moduleStepThinking.generate_modules || ''),
            module_count: Number(state.moduleStepThinking.module_count || 0) || 0,
            generate_module_slots: normalizeModuleGenSlots(
                state.moduleStepThinking.generate_module_slots || []
            )
        };
    }

    function hasModuleThinkingContent(snap) {
        snap = snap || {};
        if (String(snap.split_modules || '').trim() || String(snap.generate_modules || '').trim()) {
            return true;
        }
        var slots = Array.isArray(snap.generate_module_slots) ? snap.generate_module_slots : [];
        return slots.some(function (slot) {
            return String((slot && slot.text) || '').trim() ||
                (slot && (slot.status === 'active' || slot.status === 'done'));
        });
    }

    function stashModuleThinkingForArchive() {
        var snap = getModuleStepThinkingSnapshot();
        global.__tcModuleStepThinkingArchive = {
            split_modules: snap.split_modules,
            generate_modules: snap.generate_modules,
            module_count: snap.module_count,
            generate_module_slots: snap.generate_module_slots
        };
        return global.__tcModuleStepThinkingArchive;
    }

    function resolveModuleThinkingForArchive() {
        var snap = getModuleStepThinkingSnapshot();
        if (hasModuleThinkingContent(snap)) {
            stashModuleThinkingForArchive();
            return snap;
        }
        var stash = global.__tcModuleStepThinkingArchive;
        if (stash && hasModuleThinkingContent(stash)) {
            return {
                split_modules: String(stash.split_modules || ''),
                generate_modules: String(stash.generate_modules || ''),
                module_count: Number(stash.module_count || 0) || 0,
                generate_module_slots: normalizeModuleGenSlots(stash.generate_module_slots || [])
            };
        }
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.getModuleStepThinkingSnapshot === 'function') {
            var uiSnap = global.TcGenChatXUi.getModuleStepThinkingSnapshot() || {};
            return {
                split_modules: String(uiSnap.split_modules || ''),
                generate_modules: String(uiSnap.generate_modules || ''),
                module_count: Number(uiSnap.module_count || 0) || 0,
                generate_module_slots: normalizeModuleGenSlots(uiSnap.generate_module_slots || [])
            };
        }
        return snap;
    }

    function prepareModuleThinkingArchive() {
        syncModuleThinkingToXUiBeforeArchive();
        return stashModuleThinkingForArchive();
    }

    function syncLivePipelineToXUi() {
        if (!useXRenderer() || !global.TcGenChatXUi) return;
        var snap = state.stepPhaseSnapshot || {};
        var steps = {};
        STEP_IDS.forEach(function (stepId) {
            var row = snap[stepId];
            if (!row || row.status === 'pending') return;
            steps[stepId] = { status: row.status, detail: row.detail || '' };
        });
        if (typeof global.TcGenChatXUi.replayLivePipeline === 'function' &&
            Object.keys(steps).length) {
            global.TcGenChatXUi.replayLivePipeline({
                steps: steps,
                thinkingText: state.thinkingBuffer || global.__tcGenReasoningText || '',
                moduleStepThinking: getModuleStepThinkingSnapshot(),
                stream: {
                    buffer: state.buffer || '',
                    completed: !!state.completed,
                    cancelled: !!state.cancelled,
                    visible: !!(String(state.buffer || '').trim() || String(state.thinkingBuffer || '').trim()),
                    showCursor: !state.completed && !state.cancelled
                }
            });
            return;
        }
        STEP_IDS.forEach(function (stepId) {
            var row = snap[stepId];
            if (!row || row.status === 'pending') return;
            if (typeof global.TcGenChatXUi.paintStepMessage === 'function') {
                global.TcGenChatXUi.paintStepMessage(stepId, row.status, row.detail);
            }
        });
        if (String(state.thinkingBuffer || '').trim() &&
            typeof global.TcGenChatXUi.setThinkingContent === 'function') {
            global.TcGenChatXUi.setThinkingContent(state.thinkingBuffer, { replace: true });
        } else if (String(global.__tcGenReasoningText || '').trim() &&
            typeof global.TcGenChatXUi.setThinkingContent === 'function') {
            global.TcGenChatXUi.setThinkingContent(global.__tcGenReasoningText, { replace: true });
        }
        if (String(state.buffer || '').trim() &&
            typeof global.TcGenChatXUi.updateStream === 'function') {
            global.TcGenChatXUi.updateStream({
                buffer: state.buffer,
                completed: state.completed,
                cancelled: state.cancelled,
                showCursor: !state.completed && !state.cancelled
            });
        }
        var modThink = getModuleStepThinkingSnapshot();
        if (hasModuleThinkingContent(modThink) && global.TcGenChatXUi) {
            if (modThink.generate_module_slots.length &&
                typeof global.TcGenChatXUi.setModuleGenSlots === 'function') {
                global.TcGenChatXUi.setModuleGenSlots(modThink.generate_module_slots, { replace: true });
            } else if (typeof global.TcGenChatXUi.setModuleStepThinking === 'function' &&
                modThink.generate_modules) {
                global.TcGenChatXUi.setModuleStepThinking(
                    'generate_modules', modThink.generate_modules, { replace: true }
                );
            }
            if (modThink.split_modules &&
                typeof global.TcGenChatXUi.setModuleStepThinking === 'function') {
                global.TcGenChatXUi.setModuleStepThinking('split_modules', modThink.split_modules, { replace: true });
            }
        }
        scrollBottom();
    }

    function paintStepMessage(stepId, status, detail) {
        var incomingWrite = stepId === 'write';
        stepId = normalizePipelineStepId(stepId);
        if (incomingWrite) {
            var prevSnap = state.stepPhaseSnapshot && state.stepPhaseSnapshot[stepId];
            detail = mergeParseWriteDetail(prevSnap && prevSnap.detail, detail);
        }
        var st = status || 'pending';
        rememberStepPhase(stepId, st, detail);
        if (st === 'active') {
            state.activeStepId = stepId;
        } else if (state.activeStepId === stepId &&
            (st === 'done' || st === 'skip' || st === 'error' || st === 'cancelled' || st === 'pending')) {
            state.activeStepId = '';
        }
        if (useXRenderer()) {
            global.TcGenChatXUi.paintStepMessage(stepId, st, detail);
            if (stepId === 'generate') {
                xUpdateStream(false);
            }
            scrollBottom();
            try {
                global.dispatchEvent(new CustomEvent('tc-gen-pipeline-step', {
                    detail: { stepId: stepId, status: st, detail: detail || '' }
                }));
            } catch (e) { /* ignore */ }
            return;
        }

        var item = ensureStepMessage(stepId);
        if (!item) return;

        item.classList.remove(
            'tc-gen-chat-msg--pipeline-step--pending',
            'tc-gen-chat-msg--pipeline-step--active',
            'tc-gen-chat-msg--pipeline-step--done',
            'tc-gen-chat-msg--pipeline-step--skip',
            'tc-gen-chat-msg--pipeline-step--error',
            'tc-gen-chat-msg--pipeline-step--cancelled'
        );
        item.classList.add('tc-gen-chat-msg--pipeline-step--' + st);

        var detailEl = item.querySelector('.tc-pipeline-step__detail');
        var detailText = String(detail || '').trim();
        if (detailEl) {
            detailEl.textContent = detailText;
            detailEl.classList.toggle('hidden', !detailText);
        }

        if (stepId === 'generate') {
            bindGenerateStreamRefs(item);
            var streamWrap = item.querySelector('.tc-pipeline-step__stream-wrap');
            if (streamWrap) {
                var showStream = st === 'active' || (st === 'done' && String(state.buffer || '').trim());
                streamWrap.classList.toggle('hidden', !showStream);
            }
            if (state.cancelBtn) {
                state.cancelBtn.classList.toggle('hidden', st !== 'active');
            }
        }

        scrollBottom();
    }

    function resetInternalState() {
        state.sessionActive = false;
        state.stepMsgs = {};
        state.streamEl = null;
        state.streamMsg = null;
        state.cancelBtn = null;
        state.buffer = '';
        state.thinkingBuffer = '';
        global.__tcGenReasoningText = '';
        state.completed = false;
        state.cancelled = false;
        state._stopHandled = false;
        state.failed = false;
        state.failedStepId = '';
        state.activeStepId = '';
        state.expanded = false;
        state.rafPending = false;
        state.paintQueued = false;
        state.lastChunkAt = 0;
        state.qualityCheckEnabled = false;
        state.pendingQualityCheckInChat = false;
        state.validateReasoningBuffer = '';
        state.stepPhaseSnapshot = {};
        state.useModulePipeline = false;
        state.moduleStepThinking = {
            split_modules: '',
            generate_modules: '',
            module_count: 0,
            generate_module_slots: []
        };
        STEPS = STEPS_STANDARD.slice();
        STEP_IDS = STEPS.map(function (s) { return s.id; });
    }

    function configureModulePipeline(pageChars) {
        pageChars = parseInt(pageChars, 10) || 0;
        state.useModulePipeline = true;
        STEPS = STEPS_MODULE.map(function (step) {
            if (step.id !== 'parse_rows') return step;
            return { id: step.id, label: pipelineParseWriteStepTitle() };
        });
        STEP_IDS = STEPS.map(function (s) { return s.id; });
        if (!state.sessionActive) return;
        if (state.stepPhaseSnapshot.generate) {
            paintStepMessage('generate', 'skip', '当前需求较大，改走分模块生成');
        }
        syncLivePipelineToXUi();
    }

    function isModulePipelineActive() {
        return !!state.useModulePipeline;
    }

    function clearLivePipelineUi() {
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.clearLivePipeline === 'function') {
            global.TcGenChatXUi.clearLivePipeline();
        }
    }

    function archiveLiveRunBeforeNewGeneration() {
        if (!useXRenderer() || !global.TcGenChatXUi ||
            typeof global.TcGenChatXUi.archiveCurrentRun !== 'function') {
            return;
        }
        global.TcGenChatXUi.archiveCurrentRun({
            preferPrevious: true,
            skipIfPersisted: false
        });
    }

    function prepareForNewGenerationRun() {
        cancelScheduledArchive();
        archiveLiveRunBeforeNewGeneration();
        resetInternalState();
        clearLivePipelineUi();
    }

    function begin() {
        if (!enabled()) return null;
        if (state.sessionActive && !state.completed) return true;
        resetInternalState();
        state.sessionActive = true;
        if (typeof global.dismissTcPromptIntro === 'function') global.dismissTcPromptIntro();
        scrollBottom();
        return true;
    }

    function setPhase(id, status, detail) {
        if (!enabled()) return;
        id = normalizePipelineStepId(id);
        if (!state.sessionActive) begin();
        if (status === 'pending') return;
        if (state.failed) {
            var curIdx = getStepIndex(id);
            var failIdx = getStepIndex(state.failedStepId || resolveDefaultFailStepId());
            if (failIdx < 0) failIdx = 0;
            if (curIdx > failIdx && (status === 'active' || status === 'done')) return;
        }
        if (state.completed && status === 'active') {
            if (state.failed) return;
            if (state.cancelled) return;
            if (id !== 'quality_check') return;
        }
        if (status === 'error') {
            paintStepMessage(id, status, detail);
            abortSubsequentSteps(id, detail);
            return;
        }
        if (status === 'active' || status === 'done' || status === 'skip' || status === 'cancelled') {
            paintStepMessage(id, status, detail);
        }
    }


    function mergeReasoningText(prev, piece) {
        prev = String(prev || '');
        piece = String(piece || '');
        if (!piece) return prev;
        if (!prev) return piece;
        if (piece === prev) return prev;
        if (piece.indexOf(prev) === 0) return piece;
        if (prev.indexOf(piece) === 0) return prev;
        return prev + piece;
    }

    function appendReasoningContent(chunk) {
        if (!enabled()) return;
        if (state.completed || state.failed) return;
        var piece = String(chunk || '');
        if (!piece) return;
        if (!state.sessionActive) begin();
        paintStepMessage('generate', 'active', '思考中…');
        state.thinkingBuffer = mergeReasoningText(state.thinkingBuffer, piece);
        syncThinkingGlobals(state.thinkingBuffer, true);
        state.lastChunkAt = Date.now();
        paintGenerateThinkingDetail('active');
        scheduleStreamPaint(true);
    }

    function setReasoningContent(text, opts) {
        opts = opts || {};
        text = String(text || '');
        if (!text.trim()) return;
        if (!state.sessionActive) begin();
        if (opts.replace || !String(state.thinkingBuffer || '').trim()) {
            state.thinkingBuffer = text;
        } else if (text.length > state.thinkingBuffer.length) {
            state.thinkingBuffer = text;
        }
        syncThinkingGlobals(state.thinkingBuffer, true);
        state.lastChunkAt = Date.now();
        if (state.completed || opts.finalize) {
            paintGenerateThinkingDetail('done');
            return;
        }
        paintGenerateThinkingDetail('active', thinkingPreview(state.thinkingBuffer, 100));
        paintStepMessage('generate', 'active', '思考中…');
        flushStreamPaint(false);
    }

    function appendContent(chunk) {
        if (!enabled()) return;
        var piece = String(chunk || '');
        if (!piece) return;
        if (!state.sessionActive) begin();
        if (!useXRenderer()) {
            ensureStepMessage('generate');
            bindGenerateStreamRefs(state.stepMsgs.generate);
        }
        if (state.completed || state.failed) {
            return;
        }
        state.completed = false;
        state.cancelled = false;
        state.buffer += piece;
        maybeSplitContentThinking();
        state.lastChunkAt = Date.now();
        paintGenerateDetailDuringStream();
        ensureParseRowsForOutput('正在接收模型输出…');
        scheduleStreamPaint(true);
    }

    function isFallbackSummary(text) {
        return /^已解析 \*\*\d+\*\* 条用例并写入右侧表格。$/.test(String(text || '').trim());
    }

    function isMindmapFallbackSummary(text) {
        return /^已解析 \*\*\d+\*\* 条导图用例并写入右侧思维导图。$/.test(String(text || '').trim());
    }

    function ingestStreamText(text, opts) {
        opts = opts || {};
        text = String(text || '');
        if (!text.trim()) return;
        if (!state.sessionActive) begin();
        if (!useXRenderer()) {
            ensureStepMessage('generate');
            bindGenerateStreamRefs(state.stepMsgs.generate);
        }
        if (state.completed && !opts.allowAfterComplete) {
            if (opts.replace || !String(state.buffer || '').trim() || isFallbackSummary(state.buffer) ||
                isMindmapFallbackSummary(state.buffer)) {
                state.buffer = text;
            } else if (state.buffer.length < text.length) {
                state.buffer = text;
            }
            flushStreamPaint(false);
            return;
        }
        if (!state.buffer.trim() || opts.replace || isFallbackSummary(state.buffer) ||
            isMindmapFallbackSummary(state.buffer)) {
            state.buffer = text;
        } else if (state.buffer.length < text.length) {
            state.buffer = text;
        }
        maybeSplitContentThinking();
        state.lastChunkAt = Date.now();
        paintGenerateDetailDuringStream();
        ensureParseRowsForOutput('正在接收模型输出…');
        flushStreamPaint(false);
    }

    function getStreamText() {
        return state.buffer || '';
    }

    function getThinkingText() {
        return state.thinkingBuffer || '';
    }

    function applyFinishReasoning(opts) {
        if (!opts || !opts.reasoning_text) return;
        var rt = String(opts.reasoning_text || '').trim();
        if (!rt) return;
        var finalize = !!(state.completed || opts.finalize);
        if (global.TcGenChatXUi && global.TcGenChatXUi.ready &&
            typeof global.TcGenChatXUi.setThinkingContent === 'function') {
            global.TcGenChatXUi.setThinkingContent(rt, { replace: true, force: true });
        }
        if (!String(state.thinkingBuffer || '').trim() || rt.length >= String(state.thinkingBuffer || '').length) {
            setReasoningContent(rt, { replace: true, finalize: finalize });
        } else if (finalize && String(state.thinkingBuffer || '').trim()) {
            /* 思考内容已在 generate 步骤内展示，无需单独步骤 */
        }
    }

    function resolveEffectiveListGenerationRows(opts) {
        opts = opts || {};
        return resolveCurrentRunParsedRowCount(opts);
    }

    function resolveEffectiveMindmapGenerationRows(opts) {
        opts = opts || {};
        if (global.TcGenerationStreamClient) {
            var sessionAdded = typeof global.TcGenerationStreamClient.getSessionRowsAdded === 'function'
                ? global.TcGenerationStreamClient.getSessionRowsAdded() : 0;
            if (sessionAdded > 0) return sessionAdded;
        }
        var contentRows = countMindmapCaseContentRows();
        if (contentRows > 0) return contentRows;
        var hasStream = hasMeaningfulStreamOutput(state.buffer);
        var hasStreamText = hasMeaningfulStreamOutput(opts.stream_text);
        if (hasStream || hasStreamText) return 0;
        return 0;
    }

    function resolveEffectiveGenerationRows(opts) {
        if (detectPipelineOutputTarget() === 'mindmap') {
            return resolveEffectiveMindmapGenerationRows(opts);
        }
        return resolveEffectiveListGenerationRows(opts);
    }


    /** 本次生成/解析写入的行数（不含表格历史存量） */
    function resolveCurrentRunParsedRowCount(opts) {
        opts = opts || {};
        var finishCount = parseInt(opts.finish_row_count, 10) || 0;
        if (finishCount > 0) return finishCount;

        if (global.TcGenerationStreamClient) {
            var sessionAdded = typeof global.TcGenerationStreamClient.getSessionRowsAdded === 'function'
                ? global.TcGenerationStreamClient.getSessionRowsAdded() : 0;
            if (sessionAdded > 0) return sessionAdded;
        }

        var parsedRowsOpt = parseInt(opts.parsedRows, 10) || 0;
        if (parsedRowsOpt > 0) return parsedRowsOpt;

        if (global.tcGenBatchCore && global.tcGenBatchCore.state) {
            var batchRowCount = parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0;
            if (batchRowCount > 0) return batchRowCount;
        }

        var target = detectPipelineOutputTarget();
        if (target === 'list' && typeof global.tcCountTableCaseContentRows === 'function') {
            var batchStart = opts.batch_row_start != null ? parseInt(opts.batch_row_start, 10) : -1;
            if (isNaN(batchStart) || batchStart < 0) {
                if (typeof global.tcGetLastGenerationWriteStart === 'function') {
                    batchStart = global.tcGetLastGenerationWriteStart();
                }
            }
            if ((isNaN(batchStart) || batchStart < 0) && global.tcGenBatchCore && global.tcGenBatchCore.state) {
                batchStart = parseInt(global.tcGenBatchCore.state.batchRowStart, 10);
            }
            var batchLimit = parseInt(opts.batch_row_count, 10) || 0;
            if (batchLimit <= 0 && global.tcGenBatchCore && global.tcGenBatchCore.state) {
                batchLimit = parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0;
            }
            if (!isNaN(batchStart) && batchStart >= 0) {
                if (batchLimit > 0) {
                    var limited = global.tcCountTableCaseContentRows(batchStart, batchLimit);
                    if (limited > 0) return limited;
                }
                if (batchStart > 0) {
                    var scoped = global.tcCountTableCaseContentRows(batchStart);
                    if (scoped > 0) return scoped;
                }
            }
        }

        if (global.TcGenerationStreamClient &&
            typeof global.TcGenerationStreamClient.getTotalRows === 'function') {
            var streamTotal = parseInt(global.TcGenerationStreamClient.getTotalRows(), 10) || 0;
            if (streamTotal > 0) return streamTotal;
        }

        var claimed = parseInt(opts.total_rows, 10) || 0;
        if (claimed > 0 && opts.trust_server_row_count) return claimed;
        return 0;
    }

    /** 流式生成 finish 专用：仅统计本次解析/写入行数 */
    function resolvePipelineFinishRowCount(opts) {
        return resolveCurrentRunParsedRowCount(opts);
    }

    function isParseRowsTerminal() {
        var snap = state.stepPhaseSnapshot && state.stepPhaseSnapshot.parse_rows;
        return !!(snap && (snap.status === 'done' || snap.status === 'skip' ||
            snap.status === 'cancelled' || snap.status === 'error'));
    }

    /** 流式进度同步：已完成后忽略迟到的 parse/write 事件，防止步骤回退为转圈 */
    function syncStreamProgressStep(opts) {
        if (!enabled()) return;
        if (state.failed) return;
        opts = opts || {};
        var step = opts.step || '';
        if (step === 'done' || step === 'error' || step === 'cancelled') {
            syncStreamStep(opts);
            return;
        }
        if (state.completed || isParseRowsTerminal()) return;
        syncStreamStep(opts);
    }

    /** 补救：写入已成功但 finish 未收尾时强制完成 parse_rows（并触发质量检查排队） */
    function completeStreamParseWriteFinish(opts) {
        if (!enabled() || state.failed) return false;
        opts = opts || {};
        if (state.completed && isParseRowsTerminal()) return false;
        var rowCount = resolvePipelineFinishRowCount(opts);
        if (rowCount <= 0) return false;
        if (!state.sessionActive) begin();
        if (!state.completed) state.completed = true;
        markGenerationPipelineDone(Object.assign({}, opts, {
            total_rows: rowCount,
            finish_row_count: rowCount,
            parsed_detail: opts.parsed_detail || ('已解析 ' + rowCount + ' 条')
        }));
        flushStreamPaint(false);
        return true;
    }

    function cancelScheduledArchive() {
        state.runToken = (state.runToken || 0) + 1;
        if (scheduledArchiveHandles.raf1 && typeof global.cancelAnimationFrame === 'function') {
            global.cancelAnimationFrame(scheduledArchiveHandles.raf1);
        }
        if (scheduledArchiveHandles.raf2 && typeof global.cancelAnimationFrame === 'function') {
            global.cancelAnimationFrame(scheduledArchiveHandles.raf2);
        }
        if (scheduledArchiveHandles.timeout && typeof global.clearTimeout === 'function') {
            global.clearTimeout(scheduledArchiveHandles.timeout);
        }
        scheduledArchiveHandles.raf1 = 0;
        scheduledArchiveHandles.raf2 = 0;
        scheduledArchiveHandles.timeout = 0;
    }

    function scheduleArchiveCurrentRunToSession(opts) {
        opts = opts || {};
        if (!useXRenderer() || !global.TcGenChatXUi ||
            typeof global.TcGenChatXUi.archiveCurrentRun !== 'function') {
            return;
        }
        var token = state.runToken;
        var run = function () {
            if (token !== state.runToken) return;
            prepareModuleThinkingArchive();
            var archiveSteps = buildArchiveStepSnapshot();
            if (useXRenderer() && global.TcGenChatXUi &&
                typeof global.TcGenChatXUi.replayLivePipeline === 'function' &&
                Object.keys(archiveSteps).length) {
                global.TcGenChatXUi.replayLivePipeline({
                    steps: archiveSteps,
                    thinkingText: state.thinkingBuffer || global.__tcGenReasoningText || '',
                    moduleStepThinking: getModuleStepThinkingSnapshot(),
                    stream: {
                        buffer: state.buffer || '',
                        completed: !!state.completed,
                        cancelled: !!state.cancelled,
                        visible: !!(String(state.buffer || '').trim() || String(state.thinkingBuffer || '').trim()),
                        showCursor: !state.completed && !state.cancelled
                    }
                });
            }
            global.TcGenChatXUi.archiveCurrentRun({
                preferPrevious: !!opts.preferPrevious,
                skipIfPersisted: !!opts.skipIfPersisted,
                steps: archiveSteps
            });
        };
        if (typeof global.requestAnimationFrame === 'function') {
            scheduledArchiveHandles.raf1 = global.requestAnimationFrame(function () {
                scheduledArchiveHandles.raf2 = global.requestAnimationFrame(function () {
                    scheduledArchiveHandles.raf1 = 0;
                    scheduledArchiveHandles.raf2 = 0;
                    run();
                });
            });
        } else {
            scheduledArchiveHandles.timeout = global.setTimeout(function () {
                scheduledArchiveHandles.timeout = 0;
                run();
            }, 0);
        }
    }

    function syncModuleThinkingToXUiBeforeArchive() {
        if (!useXRenderer() || !global.TcGenChatXUi) return;
        var snap = getModuleStepThinkingSnapshot();
        if (snap.generate_module_slots.length &&
            typeof global.TcGenChatXUi.setModuleGenSlots === 'function') {
            global.TcGenChatXUi.setModuleGenSlots(snap.generate_module_slots, { replace: true });
            return;
        }
        if (typeof global.TcGenChatXUi.setModuleStepThinking !== 'function') return;
        if (snap.split_modules) {
            global.TcGenChatXUi.setModuleStepThinking('split_modules', snap.split_modules, { replace: true });
        }
        if (snap.generate_modules) {
            global.TcGenChatXUi.setModuleStepThinking('generate_modules', snap.generate_modules, { replace: true });
        }
    }

    function markModuleGenerationDone(opts) {
        opts = opts || {};
        if (state.failed) return;
        if (!state.qualityCheckEnabled && typeof global.tcCaptureGenAutoValidateForTask === 'function') {
            state.qualityCheckEnabled = !!global.tcCaptureGenAutoValidateForTask();
        }
        syncModuleThinkingToXUiBeforeArchive();
        var target = detectPipelineOutputTarget();
        var effectiveRows = resolvePipelineFinishRowCount(opts);
        if (effectiveRows <= 0) {
            failStep('parse_rows', '分模块生成未产出用例，请检查需求或模型配置后重试');
            return;
        }
        opts.total_rows = effectiveRows;
        opts.finish_row_count = effectiveRows;
        opts.parsed_detail = opts.parsed_detail || ('已生成 ' + effectiveRows + ' 条');
        state.completed = true;
        paintStepMessage('parse_rows', 'done', pipelineParseWriteDoneDetail(
            target, effectiveRows, opts.parsed_detail
        ));
        if (state.cancelBtn) state.cancelBtn.classList.add('hidden');
        scheduleArchiveCurrentRunToSession({ preferPrevious: false });
    }

    function markGenerationPipelineDone(opts) {
        opts = opts || {};
        if (state.failed) return;
        if (state.cancelled) return;
        var target = detectPipelineOutputTarget();
        var effectiveRows = resolvePipelineFinishRowCount(opts);
        if (effectiveRows <= 0) {
            error('未收到模型输出，请检查 AI 配置后重试');
            return;
        }
        opts.total_rows = effectiveRows;
        opts.finish_row_count = effectiveRows;
        opts.parsed_detail = opts.parsed_detail || ('已解析 ' + effectiveRows + ' 条');
        var thinkLen = String(state.thinkingBuffer || '').trim().length;
        var genDetail = thinkLen > 0
            ? ('生成完成（思考 ' + thinkLen + ' 字）')
            : '生成完成';
        paintStepMessage('generate', 'done', genDetail);
        paintStepMessage('parse_rows', 'done', pipelineParseWriteDoneDetail(
            target, effectiveRows, opts.parsed_detail
        ));
        if (state.cancelBtn) state.cancelBtn.classList.add('hidden');
        scheduleArchiveCurrentRunToSession({ preferPrevious: false });
    }

    function captureQualityCheckEnabled() {
        state.qualityCheckEnabled = false;
        return false;
    }

    function isQualityCheckEnabled() {
        return !!state.qualityCheckEnabled;
    }

    function setQualityCheckContent(text, opts) {
        opts = opts || {};
        text = String(text || '');
        if (!text.trim() && !opts.force) return;
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.setValidateContent === 'function') {
            global.TcGenChatXUi.setValidateContent(text, opts);
        }
    }

    function appendQualityCheckContent(text) {
        text = String(text || '');
        if (!text) return;
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.appendValidateContent === 'function') {
            global.TcGenChatXUi.appendValidateContent(text);
        }
        scrollBottom();
    }

    function resetValidateSubStepsInUi() {
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.resetValidateSubSteps === 'function') {
            global.TcGenChatXUi.resetValidateSubSteps();
        }
    }

    function paintValidateSubStepInUi(stepId, status, detail, skipReason) {
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.paintValidateSubStep === 'function') {
            global.TcGenChatXUi.paintValidateSubStep(stepId, status, detail, skipReason);
        }
    }

    function resetValidateReasoningInUi() {
        state.validateReasoningBuffer = '';
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.resetValidateReasoning === 'function') {
            global.TcGenChatXUi.resetValidateReasoning();
        }
    }

    function appendValidateReasoningContent(chunk) {
        if (!enabled()) return;
        var piece = String(chunk || '');
        if (!piece) return;
        if (!state.sessionActive) begin();
        state.validateReasoningBuffer += piece;
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.appendValidateReasoningContent === 'function') {
            global.TcGenChatXUi.appendValidateReasoningContent(piece);
        }
        scrollBottom();
    }

    function setValidateReasoningContent(text, opts) {
        opts = opts || {};
        text = String(text || '');
        if (!text.trim() && !opts.force) return;
        if (!state.sessionActive) begin();
        if (opts.replace || !String(state.validateReasoningBuffer || '').trim()) {
            state.validateReasoningBuffer = text;
        } else if (text.length > state.validateReasoningBuffer.length) {
            state.validateReasoningBuffer = text;
        }
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.setValidateReasoningContent === 'function') {
            global.TcGenChatXUi.setValidateReasoningContent(state.validateReasoningBuffer, opts);
        }
        scrollBottom();
    }

    function syncQualityCheckProgress(opts) {
        opts = opts || {};
        if (!enabled()) return;
        if (state.failed) return;
        if (!state.pendingQualityCheckInChat) {
            if (!opts.begin || !state.qualityCheckEnabled) return;
            state.pendingQualityCheckInChat = true;
        }
        if (opts.begin) {
            setPhase('quality_check', 'active', opts.detail || '正在执行质量检查…');
            if (opts.resetSubSteps !== false) {
                resetValidateSubStepsInUi();
                resetValidateReasoningInUi();
            }
            if (global.TcLeftPanelLock && typeof global.TcLeftPanelLock.applyLockUi === 'function') {
                global.TcLeftPanelLock.applyLockUi();
            }
            return;
        }
        if (opts.subStep === 'llm' && opts.subStatus === 'running') {
            resetValidateReasoningInUi();
        }
        if (opts.subStep) {
            paintValidateSubStepInUi(opts.subStep, opts.subStatus, opts.subDetail, opts.subSkipReason);
            if (opts.detail) {
                setPhase('quality_check', 'active', opts.detail);
            }
            scrollBottom();
            return;
        }
        if (opts.append) {
            if (opts.detail) {
                setPhase('quality_check', 'active', opts.detail);
            }
            return;
        }
        if (opts.finish) {
            var st = opts.error ? 'error' : 'done';
            setPhase('quality_check', st, opts.detail || '质量检查完成');
            state.pendingQualityCheckInChat = false;
            if (typeof global.syncTcPromptSendBtnState === 'function') {
                global.syncTcPromptSendBtnState();
            }
            if (global.TcLeftPanelLock && typeof global.TcLeftPanelLock.applyLockUi === 'function') {
                global.TcLeftPanelLock.applyLockUi();
            }
            if (typeof global.setTimeout === 'function') {
                global.setTimeout(function () {
                    scheduleArchiveCurrentRunToSession({ preferPrevious: false });
                }, 0);
            } else {
                scheduleArchiveCurrentRunToSession({ preferPrevious: false });
            }
            return;
        }
        if (opts.detail) {
            setPhase('quality_check', 'active', opts.detail);
        }
    }

    function finish(opts) {
        opts = opts || {};
        if (!state.sessionActive) return;
        if (state.failed) return;
        if (state.cancelled) return;
        applyFinishReasoning(opts);
        if (state.completed && String(state.buffer || '').trim()) {
            if (opts.stream_text && String(opts.stream_text).trim()) {
                if (isFallbackSummary(state.buffer) || isMindmapFallbackSummary(state.buffer) ||
                    String(opts.stream_text).length > String(state.buffer).length) {
                    ingestStreamText(opts.stream_text, { replace: true, allowAfterComplete: true });
                }
            }
            applyFinishReasoning(Object.assign({}, opts, { finalize: true }));
            markGenerationPipelineDone(opts);
            flushStreamPaint(false);
            return;
        }
        if (!useXRenderer()) {
            ensureStepMessage('generate');
            bindGenerateStreamRefs(state.stepMsgs.generate);
        }
        if (!String(state.buffer || '').trim() && opts.stream_text) {
            ingestStreamText(opts.stream_text, { replace: true });
        }
        applyFinishReasoning(opts);
        var effectiveRows = resolvePipelineFinishRowCount(opts);
        if (effectiveRows <= 0) {
            error('未收到模型输出，请检查 AI 配置后重试');
            return;
        }
        state.completed = true;
        opts.total_rows = effectiveRows;
        opts.finish_row_count = effectiveRows;
        if (!String(state.buffer || '').trim()) {
            if (opts.stream_text && String(opts.stream_text).trim()) {
                ingestStreamText(opts.stream_text, { replace: true, allowAfterComplete: true });
            } else {
                state.buffer = pipelineFallbackSummaryText(effectiveRows, detectPipelineOutputTarget());
            }
        }
        markGenerationPipelineDone(opts);
        flushStreamPaint(false);
    }



    function buildArchiveStepSnapshot() {
        var snap = state.stepPhaseSnapshot || {};
        var steps = {};
        STEP_IDS.forEach(function (stepId) {
            var row = snap[stepId];
            if (!row || row.status === 'pending') return;
            steps[stepId] = { status: row.status, detail: row.detail || '' };
        });
        return steps;
    }

    function markRunStopped(activeId) {
        activeId = activeId || state.activeStepId || 'generate';
        var idx = getStepIndex(activeId);
        if (idx < 0) idx = getStepIndex('generate');
        for (var i = 0; i < STEP_IDS.length; i++) {
            var stepId = STEP_IDS[i];
            var row = state.stepPhaseSnapshot[stepId];
            if (i < idx) {
                continue;
            }
            if (i === idx) {
                if (!row || row.status !== 'done') {
                    paintStepMessage(stepId, 'cancelled', '已停止');
                }
            } else if (!row || row.status === 'pending' || row.status === 'active') {
                paintStepMessage(stepId, 'skip', '已停止');
            }
        }
    }

    function cancel() {
        if (!state.sessionActive || state._stopHandled) return;
        state._stopHandled = true;
        state.cancelled = true;
        state.completed = true;
        state.pendingQualityCheckInChat = false;
        markRunStopped(state.activeStepId || 'generate');
        if (state.cancelBtn) state.cancelBtn.classList.add('hidden');
        if (typeof abortTcMindmapStreamingIfActive === 'function') {
            abortTcMindmapStreamingIfActive();
        }
        syncLivePipelineToXUi();
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.replayLivePipeline === 'function') {
            var archiveSteps = buildArchiveStepSnapshot();
            if (Object.keys(archiveSteps).length) {
                global.TcGenChatXUi.replayLivePipeline({
                    steps: archiveSteps,
                    thinkingText: state.thinkingBuffer || global.__tcGenReasoningText || '',
                    moduleStepThinking: getModuleStepThinkingSnapshot(),
                    stream: {
                        buffer: state.buffer || '',
                        completed: true,
                        cancelled: true,
                        visible: !!(String(state.buffer || '').trim() || String(state.thinkingBuffer || '').trim()),
                        showCursor: false
                    }
                });
            }
        }
        flushStreamPaint(false);
        scheduleArchiveCurrentRunToSession({ preferPrevious: false });
    }

    function abortForPageLeave() {
        state.cancelled = true;
        state.completed = true;
        state.pendingQualityCheckInChat = false;
        if (typeof abortTcMindmapStreamingIfActive === 'function') {
            abortTcMindmapStreamingIfActive();
        }
    }

    function error(message, stepId) {
        stepId = stepId || 'generate';
        message = String(message || '生成失败');
        if (!state.sessionActive) begin();
        if (!useXRenderer()) {
            ensureStepMessage(stepId === 'generate' ? 'generate' : stepId);
            if (stepId === 'generate') bindGenerateStreamRefs(state.stepMsgs.generate);
        }
        if (stepId === 'generate') {
            state.buffer += (state.buffer ? '\n\n' : '') + '**错误：** ' + message;
        }
        paintStepMessage(stepId, 'error', message);
        abortSubsequentSteps(stepId, message);
        if (state.streamMsg) state.streamMsg.classList.add('tc-gen-chat-msg--pipeline-error');
        flushStreamPaint(false);
    }

    function syncStreamStep(opts) {
        if (!enabled()) return;
        if (state.failed) return;
        if (!state.sessionActive) begin();
        opts = opts || {};
        var step = opts.step || '';
        var target = detectPipelineOutputTarget();
        var map = {
            connect: ['generate', 'active', '连接模型…'],
            gen: ['generate', 'active', '模型生成中…'],
            parse: ['parse_rows', 'active', pipelineParseWriteActiveDetail(target, 'parse')],
            write: ['parse_rows', 'active', pipelineParseWriteActiveDetail(target, 'write')]
        };
        if (step === 'done') {
            if (state.completed && String(state.buffer || '').trim()) {
                var lateReasoning = opts.reasoning_text || state.thinkingBuffer || '';
                if (!String(lateReasoning || '').trim() && global.TcGenerationStreamClient &&
                    typeof global.TcGenerationStreamClient.getReasoningText === 'function') {
                    lateReasoning = global.TcGenerationStreamClient.getReasoningText() || '';
                }
                if (lateReasoning) {
                    applyFinishReasoning({ reasoning_text: lateReasoning, finalize: true });
                }
                markGenerationPipelineDone({
                    total_rows: opts.parsedRows || 0,
                    parsed_detail: opts.parsedRows ? ('已解析 ' + opts.parsedRows + ' 条') : ''
                });
                flushStreamPaint(false);
                return;
            }
            var doneStream = opts.stream_text || '';
            if (!String(doneStream || '').trim() && String(state.buffer || '').trim()) {
                doneStream = state.buffer;
            }
            var doneReasoning = opts.reasoning_text || state.thinkingBuffer || '';
            if (!String(doneReasoning || '').trim() && global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.getReasoningText === 'function') {
                doneReasoning = global.TcGenerationStreamClient.getReasoningText() || '';
            }
            finish({
                total_rows: opts.parsedRows || 0,
                parsed_detail: opts.parsedRows ? ('已解析 ' + opts.parsedRows + ' 条') : '',
                stream_text: doneStream,
                reasoning_text: doneReasoning
            });
            return;
        }
        if (step === 'error') {
            error(opts.detail || '');
            return;
        }
        if (step === 'cancelled') {
            cancel();
            return;
        }
        var m = map[step];
        if (m) setPhase(m[0], m[1], m[2] || opts.detail || '');
        if (opts.parsedRows > 0 && (step === 'parse' || step === 'write')) {
            var parsedActive = '已解析 ' + opts.parsedRows + ' 条';
            if (step === 'write') {
                parsedActive += '，' + pipelineWriteStepLabel(target, 'active');
            }
            setPhase('parse_rows', 'active', parsedActive);
        }
    }

    function reset() {
        resetInternalState();
        if (useXRenderer() && typeof global.TcGenChatXUi.resetPipeline === 'function') {
            global.TcGenChatXUi.resetPipeline({ skipArchive: true });
        }
    }

    /** 归档到对话轮次后清掉 pipeline 快照，避免 live 链覆盖已归档链（含质量检查子步骤）。 */
    function clearAfterArchive() {
        cancelScheduledArchive();
        resetInternalState();
    }

    function getStreamText() {
        return state.buffer || '';
    }

    function isFinished() {
        return !!state.completed;
    }

    function isQualityCheckPending() {
        return !!state.pendingQualityCheckInChat;
    }

    function failStep(stepId, message) {
        setPhase(stepId || resolveDefaultFailStepId(), 'error', message || '步骤失败');
    }

    global.TcGenChatPipeline = {
        enabled: enabled,
        begin: begin,
        setOutputTarget: setOutputTarget,
        getOutputTarget: detectPipelineOutputTarget,
        setPhase: setPhase,
        configureModulePipeline: configureModulePipeline,
        isModulePipelineActive: isModulePipelineActive,
        markModuleGenerationDone: markModuleGenerationDone,
        appendContent: appendContent,
        appendReasoningContent: appendReasoningContent,
        setReasoningContent: setReasoningContent,
        ingestStreamText: ingestStreamText,
        finish: finish,
        cancel: cancel,
        abortForPageLeave: abortForPageLeave,
        error: error,
        syncStreamStep: syncStreamStep,
        syncStreamProgressStep: syncStreamProgressStep,
        completeStreamParseWriteFinish: completeStreamParseWriteFinish,
        resolvePipelineFinishRowCount: resolvePipelineFinishRowCount,
        reset: reset,
        clearAfterArchive: clearAfterArchive,
        prepareForNewGenerationRun: prepareForNewGenerationRun,
        cancelScheduledArchive: cancelScheduledArchive,
        getStreamText: getStreamText,
        getThinkingText: getThinkingText,
        isFinished: isFinished,
        isFailed: isFailed,
        failStep: failStep,
        captureQualityCheckEnabled: captureQualityCheckEnabled,
        isQualityCheckEnabled: isQualityCheckEnabled,
        isQualityCheckPending: isQualityCheckPending,
        syncQualityCheckProgress: syncQualityCheckProgress,
        appendValidateReasoningContent: appendValidateReasoningContent,
        setValidateReasoningContent: setValidateReasoningContent,
        resetValidateReasoning: resetValidateReasoningInUi,
        getValidateReasoningText: function () { return state.validateReasoningBuffer || ''; },
        isSessionActive: function () { return !!state.sessionActive; },
        getStepIds: function () { return STEP_IDS.slice(); },
        getStepPhaseSnapshot: function () {
            var snap = state.stepPhaseSnapshot || {};
            var copy = {};
            Object.keys(snap).forEach(function (stepId) {
                var row = snap[stepId];
                if (!row) return;
                copy[stepId] = { status: row.status || 'pending', detail: row.detail || '' };
            });
            return copy;
        },
        setModuleStepThinking: setModuleStepThinking,
        setModuleGenPlan: setModuleGenPlan,
        setModuleGenSlots: setModuleGenSlots,
        getModuleStepThinkingSnapshot: getModuleStepThinkingSnapshot,
        prepareModuleThinkingArchive: prepareModuleThinkingArchive,
        resolveModuleThinkingForArchive: resolveModuleThinkingForArchive,
        syncLivePipelineToXUi: syncLivePipelineToXUi
    };

    global.addEventListener('tc-gen-chat-x-ready', function () {
        if (!state.sessionActive) return;
        syncLivePipelineToXUi();
        if (!state.thinkingBuffer && !state.buffer &&
            !Object.keys(state.stepPhaseSnapshot || {}).some(function (stepId) {
                var row = state.stepPhaseSnapshot[stepId];
                return row && row.status && row.status !== 'pending';
            })) {
            return;
        }
        if (String(state.thinkingBuffer || '').trim() &&
            global.TcGenChatXUi && typeof global.TcGenChatXUi.setThinkingContent === 'function') {
            global.TcGenChatXUi.setThinkingContent(state.thinkingBuffer, { replace: true });
        }
        flushStreamPaint(!state.completed && !state.cancelled);
    });
})(typeof window !== 'undefined' ? window : this);
