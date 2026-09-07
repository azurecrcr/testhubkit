/**
 * 智能编辑 — 主编排（与智能生成完全隔离）
 */
(function (global) {
    'use strict';

    var EDIT_CANCEL_STATUS_HINT = '已取消本次编辑';
    var editAbort = null;
    var editRunToken = 0;
    var editRunning = false;
    var editFinishHandled = false;
    var activeEditTurn = null;
    var lastReservedEditTurnIndex = -1;
    var undoStack = [];
    var mindmapUndoStack = [];
    var activeEditTarget = 'table';

    function $(id) { return document.getElementById(id); }

    function toast(msg, opts) {
        if (typeof global.tcAppToast === 'function') {
            global.tcAppToast(msg, opts || { variant: 'info', duration: 2800 });
        }
    }

    function isEditRunning() {
        return !!editRunning;
    }

    function bumpEditRunToken() {
        editRunToken += 1;
        return editRunToken;
    }

    function isEditRunCurrent(token) {
        return token === editRunToken;
    }

    function makeEditAbortError() {
        var err = new Error('cancelled');
        err.name = 'AbortError';
        return err;
    }

    function getEditAbortSignal() {
        return editAbort ? editAbort.signal : undefined;
    }

    function rejectIfEditRunCancelled(token) {
        if (!isEditRunCurrent(token)) {
            return Promise.reject(makeEditAbortError());
        }
        return null;
    }

    function setEditRunning(running) {
        editRunning = !!running;
        if (global.TcLeftPanelLock && typeof global.TcLeftPanelLock.setEditLock === 'function') {
            global.TcLeftPanelLock.setEditLock(editRunning);
        }
        if (typeof global.syncTcEditSendBtnState === 'function') {
            global.syncTcEditSendBtnState();
        }
    }

    function isEditSendBlocked() {
        var lock = global.TcLeftPanelLock;
        if (!lock) return false;
        if (lock.isAiGenerateLocked && lock.isAiGenerateLocked()) return true;
        if (lock.isQualityCheckBusy && lock.isQualityCheckBusy()) return true;
        return false;
    }

    function isMindmapViewActive() {
        return document.body.classList.contains('tc-left-gen-compact--mindmap') ||
            (typeof global.tcRightViewMode !== 'undefined' && global.tcRightViewMode === 'mindmap');
    }

    function isSmartEditTablePrepared() {
        if (isMindmapViewActive()) {
            if (typeof global.ensureTcMindmapGenerateColumns === 'function') {
                return !!global.ensureTcMindmapGenerateColumns();
            }
            return !!(global.tableColumns && global.tableColumns.length);
        }
        if (!global.tableColumns || !global.tableColumns.length) return false;
        if (typeof global.isTcExplicitTemplateApplied === 'function' && global.isTcExplicitTemplateApplied()) {
            return true;
        }
        if (typeof global.tcTableTemplateApplied !== 'undefined' && global.tcTableTemplateApplied) {
            return true;
        }
        return false;
    }

    function ensureTableReady() {
        if (isSmartEditTablePrepared()) return true;
        if (isMindmapViewActive()) {
            return !!(global.tableColumns && global.tableColumns.length);
        }
        if (typeof global.ensureTcTableTemplateApplied === 'function') {
            if (!global.ensureTcTableTemplateApplied()) return false;
        }
        if (isSmartEditTablePrepared()) return true;
        if (!global.tableColumns || !global.tableColumns.length) {
            if (typeof global.tcAppAlert === 'function') {
                global.tcAppAlert('请先应用用例模板后再使用智能编辑。', { variant: 'warning', title: '缺少模板' });
            } else {
                toast('请先应用用例模板后再使用智能编辑。', { variant: 'warning' });
            }
            return false;
        }
        return true;
    }

    function commitTable() {
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            return global.TcTableBridge.commitAll();
        }
        return Promise.resolve(true);
    }

    function getMindmapCasesRows() {
        if (typeof global.tcMindmapCasesData !== 'undefined' && global.tcMindmapCasesData) {
            return global.tcMindmapCasesData;
        }
        return [];
    }

    function cloneMindmapRows(rows) {
        return (rows || []).map(function (row) { return row.slice(); });
    }

    function buildMindmapSnapshot() {
        var columns = global.tableColumns || [];
        var rows = getMindmapCasesRows();
        var cases = rows.map(function (row, rowIndex) {
            var cells = {};
            columns.forEach(function (col, i) {
                cells[col] = String(row[i] != null ? row[i] : '');
            });
            return { rowIndex: rowIndex, cells: cells };
        });
        return { columns: columns.slice(), cases: cases, rowCount: cases.length };
    }

    function buildMindmapEditUserMessageHistory(activeTurn) {
        if (!global.TcWorkbenchSession ||
            typeof global.TcWorkbenchSession.listCurrentTurns !== 'function') {
            return [];
        }
        var currentIndex = activeTurn && activeTurn.turnIndex != null
            ? parseInt(activeTurn.turnIndex, 10)
            : null;
        if (currentIndex == null || isNaN(currentIndex)) return [];
        return global.TcWorkbenchSession.listCurrentTurns()
            .filter(function (turn) {
                if (!turn) return false;
                var idx = parseInt(turn.turn_index, 10);
                if (isNaN(idx) || idx >= currentIndex) return false;
                return !!String(turn.user_prompt || '').trim();
            })
            .map(function (turn) {
                return String(turn.user_prompt || '').trim();
            });
    }

    function pushMindmapUndo(backup) {
        mindmapUndoStack.push(backup);
        if (mindmapUndoStack.length > 10) mindmapUndoStack.shift();
        updateUndoBtn();
    }

    function applyMindmapOpsResult(operations) {
        var columns = global.tableColumns || [];
        var target = global.tcMindmapCasesData;
        if (!target || !Array.isArray(target)) {
            throw new Error('导图数据不可用');
        }
        if (!global.TcMindmapSmartEditApply ||
            typeof global.TcMindmapSmartEditApply.applyMindmapSmartEditOps !== 'function') {
            throw new Error('导图智能编辑模块未加载');
        }
        var check = global.TcSmartEditSchema &&
            typeof global.TcSmartEditSchema.validateEditOperations === 'function'
            ? global.TcSmartEditSchema.validateEditOperations(operations, columns, target.length)
            : { ok: true, operations: operations || [] };
        if (!check.ok) {
            throw new Error(check.error || '导图操作校验失败');
        }
        var result = global.TcMindmapSmartEditApply.applyMindmapSmartEditOps(
            check.operations, columns, target
        );
        pushMindmapUndo(result.backup);
        global.tcMindmapCasesData = result.data;
        global.tcMindmapExternalMindData = null;
        global.tcMindmapCommittedExternalMind = null;
        if (typeof global.switchTcRightView === 'function') {
            global.switchTcRightView('mindmap');
        }
        if (typeof global.renderTcMindmap === 'function') {
            global.renderTcMindmap();
        }
        if (typeof global.tcMindmapCaptureUndoBaseline === 'function') {
            global.tcMindmapCaptureUndoBaseline();
        }
        if (typeof global.tcMindmapPersistCache === 'function') {
            global.tcMindmapPersistCache();
        }
        return {
            changedRows: result.changedRows || [],
            normalizedOperations: check.operations || []
        };
    }

    function formatMindmapOpsSummary(operations) {
        if (global.TcMindmapSmartEditApply &&
            typeof global.TcMindmapSmartEditApply.formatMindmapEditSuccessHint === 'function') {
            return global.TcMindmapSmartEditApply.formatMindmapEditSuccessHint(operations);
        }
        return formatOpsSummary(operations);
    }

    function buildSnapshot() {
        var columns = global.tableColumns || [];
        var rows = global.testCasesData || [];
        if (global.TcSmartEditApply && typeof global.TcSmartEditApply.serializeTableForEdit === 'function') {
            return global.TcSmartEditApply.serializeTableForEdit(columns, rows);
        }
        return { columns: columns.slice(), rows: [], rowCount: 0 };
    }

    function pushUndo(backup) {
        undoStack.push(backup);
        if (undoStack.length > 10) undoStack.shift();
        updateUndoBtn();
    }

    function updateUndoBtn() {
        var btn = $('tc-edit-undo-btn');
        if (!btn) return;
        var hasUndo = activeEditTarget === 'mindmap'
            ? mindmapUndoStack.length > 0
            : undoStack.length > 0;
        btn.disabled = !hasUndo || editRunning;
    }

    function undoLastEdit() {
        if (editRunning) return;
        if (activeEditTarget === 'mindmap' && mindmapUndoStack.length) {
            var mmBackup = mindmapUndoStack.pop();
            global.tcMindmapCasesData = mmBackup;
            global.tcMindmapExternalMindData = null;
            global.tcMindmapCommittedExternalMind = null;
            if (typeof global.renderTcMindmap === 'function') {
                global.renderTcMindmap();
            }
            if (typeof global.tcMindmapPersistCache === 'function') {
                global.tcMindmapPersistCache();
            }
            updateUndoBtn();
            toast('已撤销上一次导图智能编辑', { variant: 'info' });
            return;
        }
        if (!undoStack.length) return;
        var backup = undoStack.pop();
        global.testCasesData = backup;
        if (typeof global.renderTableBody === 'function') {
            global.renderTableBody({ reload: true });
        } else if (global.TcTableBridge && typeof global.TcTableBridge.requestSync === 'function') {
            global.TcTableBridge.requestSync({ immediate: true, reload: true });
        }
        if (typeof global.markTcTableDirty === 'function') {
            global.markTcTableDirty();
        }
        updateUndoBtn();
        toast('已撤销上一次智能编辑', { variant: 'info' });
    }

    function applyResult(operations) {
        var columns = global.tableColumns || [];
        var data = global.testCasesData || [];
        var check = global.TcSmartEditSchema.validateEditOperations(
            operations, columns, data.length
        );
        if (!check.ok) {
            throw new Error(check.error || '操作校验失败');
        }
        var normalizedOps = global.TcSmartEditApply.normalizeAddOpsToEmptyRows(
            check.operations, columns, data
        );
        var result = global.TcSmartEditApply.applySmartEditOps(normalizedOps, columns, data);
        pushUndo(result.backup);
        global.testCasesData = result.data;
        if (typeof global.renderTableBody === 'function') {
            global.renderTableBody({ reload: true });
        } else if (global.TcTableBridge && typeof global.TcTableBridge.requestSync === 'function') {
            global.TcTableBridge.requestSync({ immediate: true, reload: true });
        }
        if (typeof global.markTcTableDirty === 'function') {
            global.markTcTableDirty();
        }
        global.TcSmartEditApply.highlightEditedRows(result.changedRows);
        result.normalizedOperations = normalizedOps;
        return result;
    }

    function formatOpsSummary(operations) {
        if (global.TcSmartEditApply && typeof global.TcSmartEditApply.formatEditSuccessHint === 'function') {
            return global.TcSmartEditApply.formatEditSuccessHint(operations);
        }
        var updates = 0;
        var adds = 0;
        (operations || []).forEach(function (op) {
            if (op.type === 'update') updates++;
            else if (op.type === 'add') adds++;
        });
        var parts = [];
        if (updates) parts.push('更新 ' + updates + ' 行');
        if (adds) parts.push('新增 ' + adds + ' 行');
        return parts.length ? parts.join('，') : '无变更';
    }

    function resolveNextEditTurnIndex() {
        var base = 0;
        if (global.TcWorkbenchSession && typeof global.TcWorkbenchSession.getCurrentTurnCount === 'function') {
            base = parseInt(global.TcWorkbenchSession.getCurrentTurnCount(), 10) || 0;
        }
        return Math.max(base, lastReservedEditTurnIndex + 1);
    }

    function normalizePersistedUserAttachments(items) {
        return (items || []).map(function (item) {
            if (!item || !item.id) return null;
            var id = String(item.id);
            var mime = String(item.mime_type || item.mimeType || '').toLowerCase();
            var kind = String(item.kind || '').trim();
            if (!kind) {
                if (mime.indexOf('pdf') >= 0) kind = 'pdf';
                else if (mime.indexOf('text') >= 0) kind = 'txt';
                else kind = 'image';
            }
            var fileName = String(item.fileName || item.file_name || '').trim();
            return {
                id: id,
                mime_type: mime,
                kind: kind,
                fileName: fileName,
                thumb_url: String(item.thumb_url || item.thumbUrl || (
                    '/api/test-cases/attachments/' + encodeURIComponent(id) + '/thumb'
                ))
            };
        }).filter(Boolean);
    }

    function beginEditTurn(promptText, opts) {
        opts = opts || {};
        var isMindmap = !!opts.isMindmap;
        var userAttachments = normalizePersistedUserAttachments(opts.userAttachments || []);
        var assetIds = (opts.assetIds || []).map(function (id) { return String(id || '').trim(); }).filter(Boolean);
        var turn = {
            key: 'edit-' + Date.now(),
            id: null,
            turnIndex: resolveNextEditTurnIndex(),
            promptText: String(promptText || '').trim(),
            isMindmap: isMindmap,
            userAttachments: userAttachments,
            assetIds: assetIds
        };
        lastReservedEditTurnIndex = turn.turnIndex;
        activeEditTurn = turn;
        if (!global.TcWorkbenchSession || typeof global.TcWorkbenchSession.saveTurn !== 'function') {
            return Promise.resolve(null);
        }
        return global.TcWorkbenchSession.ensureSession().then(function () {
            return global.TcWorkbenchSession.saveTurn({
                turnIndex: turn.turnIndex,
                userPrompt: turn.promptText,
                userMode: 'edit',
                userKey: turn.key,
                chain: {
                    kind: isMindmap ? 'mindmap_smart_edit' : 'smart_edit',
                    summary: '',
                    operations: [],
                    status: 'pending',
                    user_attachments: userAttachments,
                    asset_ids: assetIds
                }
            });
        }).then(function (saved) {
            if (saved && saved.id) {
                turn.id = saved.id;
                if (activeEditTurn && activeEditTurn.key === turn.key) {
                    activeEditTurn.id = saved.id;
                }
            }
            return saved;
        }).catch(function () {
            return null;
        });
    }

    function persistEditTurn(promptText, assistantText, operations, opts) {
        opts = opts || {};
        if (!global.TcWorkbenchSession || typeof global.TcWorkbenchSession.saveTurn !== 'function') {
            return Promise.resolve(null);
        }
        var turn = activeEditTurn;
        var isMindmap = !!(turn && turn.isMindmap) || activeEditTarget === 'mindmap';
        var turnIndex = turn ? turn.turnIndex : resolveNextEditTurnIndex();
        var turnId = turn && turn.id ? turn.id : null;
        var userKey = turn ? turn.key : ('edit-' + Date.now());
        var userPersist = turn && turn._userPersistPromise ? turn._userPersistPromise : Promise.resolve(null);
        var hintText = opts.statusHint ? String(assistantText || '').trim() : '';
        var hintVariant = hintText ? String(opts.statusHintVariant || opts.variant || 'done') : '';
        var assistantContent = buildAssistantResponseJson(
            hintText || assistantText,
            operations || []
        );
        return userPersist.then(function () {
            return global.TcWorkbenchSession.ensureSession().then(function () {
                if (!turnId && turn && turn.key && typeof global.TcWorkbenchSession.getTurnIdForUserKey === 'function') {
                    turnId = global.TcWorkbenchSession.getTurnIdForUserKey(turn.key) || null;
                }
                return global.TcWorkbenchSession.saveTurn({
                    turnIndex: turnIndex,
                    userPrompt: promptText,
                    userMode: 'edit',
                    userKey: userKey,
                    turnId: turnId,
                    chain: {
                        kind: isMindmap ? 'mindmap_smart_edit' : 'smart_edit',
                        summary: assistantText,
                        status_hint: hintText,
                        status_hint_variant: hintVariant,
                        assistant_content: assistantContent,
                        mindmap_text: opts.mindmapText || '',
                        operations: operations || [],
                        user_attachments: turn && turn.userAttachments ? turn.userAttachments.slice() : [],
                        asset_ids: turn && turn.assetIds ? turn.assetIds.slice() : [],
                        visual_context_id: (global.TcEditAttachments && global.TcEditAttachments.getVisualContextId &&
                            global.TcEditAttachments.getVisualContextId()) || '',
                        error: !!opts.error,
                        cancelled: !!opts.cancelled,
                        status: opts.cancelled ? 'cancelled' : (opts.error ? 'error' : 'done')
                    }
                });
            });
        }).catch(function () {
            return null;
        });
    }

    function finishEditTurnUi(promptText, assistantText, operations, opts) {
        opts = opts || {};
        if (editFinishHandled) {
            return Promise.resolve(null);
        }
        editFinishHandled = true;
        if (global.TcEditChat && typeof global.TcEditChat.removeThinkingMessage === 'function') {
            global.TcEditChat.removeThinkingMessage();
        }
        if (global.TcEditChat) {
            if (opts.variant === 'error') {
                global.TcEditChat.appendAssistantMessage(assistantText, { variant: 'error' });
            } else if (opts.statusHint && typeof global.TcEditChat.appendStatusUnderLastUser === 'function') {
                global.TcEditChat.appendStatusUnderLastUser(assistantText, { variant: opts.variant || 'done' });
            } else if (opts.variant === 'cancelled') {
                global.TcEditChat.appendAssistantMessage(assistantText, { variant: 'cancelled' });
            } else {
                global.TcEditChat.appendAssistantMessage(assistantText, { variant: opts.variant || 'done' });
            }
        }
        return persistEditTurn(promptText, assistantText, operations, {
            error: opts.variant === 'error',
            cancelled: opts.variant === 'cancelled',
            statusHint: !!opts.statusHint,
            statusHintVariant: opts.statusHint ? (opts.variant || 'done') : '',
            variant: opts.variant || 'done',
            mindmapText: opts.mindmapText || ''
        });
    }

    function finalizeEditRunUi(promptText, assistantText, operations, opts) {
        return finishEditTurnUi(promptText, assistantText, operations, opts).finally(function () {
            activeEditTurn = null;
        });
    }

    function cancelActiveEditRun() {
        if (!editRunning || editFinishHandled) return;
        var promptText = activeEditTurn && activeEditTurn.promptText;
        bumpEditRunToken();
        if (editAbort) {
            try { editAbort.abort(); } catch (e1) { /* ignore */ }
        }
        if (global.TcEditAttachments &&
            typeof global.TcEditAttachments.cancelPrepareForEditSend === 'function') {
            global.TcEditAttachments.cancelPrepareForEditSend();
        }
        setEditRunning(false);
        if (promptText) {
            finalizeEditRunUi(promptText, EDIT_CANCEL_STATUS_HINT, [], { variant: 'cancelled', statusHint: true });
        }
    }

    function parseSmartEditSseBlock(block) {
        var lines = String(block || '').split('\n');
        for (var i = 0; i < lines.length; i++) {
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

    function consumeSmartEditStream(res, handlers) {
        handlers = handlers || {};
        if (!res.body || typeof res.body.getReader !== 'function') {
            return Promise.reject(new Error('浏览器不支持流式响应'));
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';
        var finalData = null;
        function pump() {
            return reader.read().then(function (chunk) {
                if (chunk.done) {
                    if (finalData) return finalData;
                    throw new Error('智能编辑流中断');
                }
                buf += decoder.decode(chunk.value, { stream: true });
                var parts = buf.split('\n\n');
                buf = parts.pop() || '';
                parts.forEach(function (block) {
                    var ev = parseSmartEditSseBlock(block);
                    if (!ev || !ev.type) return;
                    if (ev.type === 'ai_quota' && ev.ai_quota &&
                        typeof global.hfAiQuotaNotify === 'function') {
                        global.hfAiQuotaNotify(ev.ai_quota);
                    } else if (ev.type === 'reasoning' && ev.content &&
                        typeof handlers.onReasoning === 'function') {
                        handlers.onReasoning(String(ev.content), ev);
                    } else if (ev.type === 'done') {
                        finalData = ev;
                    } else if (ev.type === 'error') {
                        throw new Error(ev.error || '智能编辑失败');
                    }
                });
                return pump();
            });
        }
        return pump();
    }

    function parseEditTurnChain(turn) {
        var chain = turn && turn.chain;
        if (!chain && turn && turn.chain_json) {
            try {
                chain = typeof turn.chain_json === 'string' ? JSON.parse(turn.chain_json) : turn.chain_json;
            } catch (e) {
                chain = null;
            }
        }
        return chain || {};
    }

    function resolveEditTurnSummary(chain) {
        chain = chain || {};
        return String(chain.status_hint || chain.summary || chain.editSummary || '').trim();
    }

    function buildAssistantResponseJson(summary, operations) {
        try {
            return JSON.stringify({
                summary: String(summary || '').trim() || '已完成编辑',
                operations: operations || []
            });
        } catch (e) {
            return String(summary || '').trim();
        }
    }

    function buildAssistantContentFromChain(chain) {
        chain = chain || {};
        if (chain.assistant_content) {
            return String(chain.assistant_content);
        }
        return buildAssistantResponseJson(
            resolveEditTurnSummary(chain),
            chain.operations || []
        );
    }

    function buildEditConversationHistory(activeTurn) {
        if (!global.TcWorkbenchSession ||
            typeof global.TcWorkbenchSession.listCurrentTurns !== 'function') {
            return [];
        }
        var currentIndex = activeTurn && activeTurn.turnIndex != null
            ? parseInt(activeTurn.turnIndex, 10)
            : null;
        if (currentIndex == null || isNaN(currentIndex)) return [];
        return global.TcWorkbenchSession.listCurrentTurns()
            .filter(function (turn) {
                if (!turn) return false;
                var idx = parseInt(turn.turn_index, 10);
                if (isNaN(idx) || idx >= currentIndex) return false;
                return !!String(turn.user_prompt || '').trim();
            })
            .map(function (turn) {
                var chain = parseEditTurnChain(turn);
                var ops = chain.operations || [];
                return {
                    user_prompt: String(turn.user_prompt || '').trim(),
                    assistant_summary: resolveEditTurnSummary(chain),
                    assistant_content: buildAssistantContentFromChain(chain),
                    operations: ops
                };
            });
    }

    function appendEditVisualPayload(body) {
        if (global.TcEditAttachments && typeof global.TcEditAttachments.appendPayload === 'function') {
            global.TcEditAttachments.appendPayload(body);
        }
        return body;
    }

    function ensureEditAttachmentsReady(userPrompt, attachmentSnapshot) {
        var mod = global.TcEditAttachments;
        var assetIds = attachmentSnapshot && attachmentSnapshot.assetIds
            ? attachmentSnapshot.assetIds.slice()
            : [];
        if (assetIds.length) {
            var prepareWithIds = mod && (mod.prepareContextForSmartEditSend || mod.rebuildContext);
            if (typeof prepareWithIds === 'function') {
                return prepareWithIds.call(mod, userPrompt, assetIds);
            }
            return Promise.resolve();
        }
        if (!mod || typeof mod.getAssets !== 'function' || !mod.getAssets().length) {
            return Promise.resolve();
        }
        var prepare = mod.prepareContextForSmartEditSend || mod.rebuildContext;
        if (typeof prepare === 'function') {
            return prepare.call(mod, userPrompt);
        }
        return Promise.resolve();
    }

    function requestMindmapSmartEditStream(body, handlers) {
        return fetch('/api/test-cases/mindmap-smart-edit/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body),
            signal: editAbort ? editAbort.signal : undefined
        }).then(function (res) {
            if (!res.ok) {
                return res.json().then(function (data) {
                    var quotaShown = typeof globalThis.hfAiQuotaFromErrorBody === 'function' &&
                        globalThis.hfAiQuotaFromErrorBody(data || {});
                    var err = new Error((data && data.error) || ('HTTP ' + res.status));
                    if (quotaShown) err._quotaToastShown = true;
                    throw err;
                }).catch(function (innerErr) {
                    if (innerErr && innerErr._quotaToastShown) throw innerErr;
                    throw new Error('HTTP ' + res.status);
                });
            }
            return consumeSmartEditStream(res, handlers);
        });
    }

    function requestSmartEditStream(body, handlers) {
        return fetch('/api/test-cases/smart-edit/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body),
            signal: editAbort ? editAbort.signal : undefined
        }).then(function (res) {
            if (!res.ok) {
                return res.json().then(function (data) {
                    var quotaShown = typeof globalThis.hfAiQuotaFromErrorBody === 'function' &&
                        globalThis.hfAiQuotaFromErrorBody(data || {});
                    var err = new Error((data && data.error) || ('HTTP ' + res.status));
                    if (quotaShown) err._quotaToastShown = true;
                    throw err;
                }).catch(function (innerErr) {
                    if (innerErr && innerErr._quotaToastShown) throw innerErr;
                    throw new Error('HTTP ' + res.status);
                });
            }
            return consumeSmartEditStream(res, handlers);
        });
    }

    function captureEditAttachmentSnapshot() {
        var mod = global.TcEditAttachments;
        if (mod && typeof mod.snapshotComposerAttachmentsForSend === 'function') {
            return mod.snapshotComposerAttachmentsForSend();
        }
        return { assetIds: [], displayItems: [], hadAttachments: false };
    }

    function dispatchEditStreamWithAttachments(body, requestStreamFn, attachmentSnapshot) {
        var snap = attachmentSnapshot || { assetIds: [], hadAttachments: false };
        var mod = global.TcEditAttachments;
        var hadAttachments = !!(snap.hadAttachments || (snap.assetIds && snap.assetIds.length));
        return ensureEditAttachmentsReady(body.user_prompt, snap).then(function () {
            if (hadAttachments) {
                body.use_attachments = true;
                appendEditVisualPayload(body);
            } else {
                delete body.visual_context_id;
                delete body.use_attachments;
                if (mod && typeof mod.clearVisualContext === 'function') {
                    mod.clearVisualContext();
                }
            }
            return requestStreamFn(body);
        });
    }

    function runSmartEdit(userPrompt, options) {
        options = options || {};
        if (editRunning) return Promise.resolve();
        if (!ensureTableReady()) return Promise.resolve();

        var promptText = String(userPrompt || '').trim();
        if (!promptText) {
            if (typeof global.tcAppAlert === 'function') {
                global.tcAppAlert('请先在输入框中描述要如何编辑当前用例。', { variant: 'warning', title: '缺少指令' });
            }
            return Promise.resolve();
        }

        if (global.TcEditAttachments &&
            typeof global.TcEditAttachments.isComposerAttachmentParsePending === 'function' &&
            global.TcEditAttachments.isComposerAttachmentParsePending()) {
            toast('附件处理中，请稍后再发送', { variant: 'warning' });
            return Promise.resolve();
        }

        if (!options._userAiGatePassed &&
            global.HfUserAiConfig &&
            typeof global.HfUserAiConfig.ensurePresetAiConfigured === 'function') {
            return global.HfUserAiConfig.ensurePresetAiConfigured().then(function (ok) {
                if (!ok) {
                    /* login gate handled by HfUserAiConfig */
                    return;
                }
                options._userAiGatePassed = true;
                return runSmartEdit(promptText, options);
            });
        }

        setEditRunning(true);
        editFinishHandled = false;
        var runToken = bumpEditRunToken();
        editAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
        activeEditTarget = isMindmapViewActive() ? 'mindmap' : 'table';

        var editAttachmentSnapshot = captureEditAttachmentSnapshot();
        if (global.TcEditChat) {
            if (editAttachmentSnapshot.hadAttachments &&
                typeof global.TcEditChat.appendUserMessageWithAttachments === 'function') {
                global.TcEditChat.appendUserMessageWithAttachments(
                    promptText,
                    editAttachmentSnapshot.displayItems || []
                );
            } else {
                global.TcEditChat.appendUserMessage(promptText);
            }
        }
        if (editAttachmentSnapshot.hadAttachments && global.TcEditAttachments &&
            typeof global.TcEditAttachments.hideComposerAttachments === 'function') {
            global.TcEditAttachments.hideComposerAttachments();
        }

        var promptEl = $('ai-edit-prompt');
        if (promptEl) {
            promptEl.value = '';
            if (typeof global.resizeTcEditPromptInput === 'function') {
                global.resizeTcEditPromptInput(promptEl);
            }
            if (typeof global.syncTcEditSendBtnState === 'function') {
                global.syncTcEditSendBtnState();
            }
        }

        var userPersistPromise = beginEditTurn(promptText, {
            isMindmap: activeEditTarget === 'mindmap',
            userAttachments: editAttachmentSnapshot.displayItems || [],
            assetIds: editAttachmentSnapshot.assetIds || []
        });
        if (activeEditTurn) {
            activeEditTurn._userPersistPromise = userPersistPromise;
        }

        return userPersistPromise.then(function () {
            var cancelled = rejectIfEditRunCancelled(runToken);
            if (cancelled) return cancelled;
            return commitTable();
        }).then(function () {
            var cancelledAfterCommit = rejectIfEditRunCancelled(runToken);
            if (cancelledAfterCommit) return cancelledAfterCommit;
            if (activeEditTarget === 'mindmap') {
                if (typeof global.ensureTcMindmapGenerateColumns === 'function') {
                    global.ensureTcMindmapGenerateColumns();
                }
                if (typeof global.tcMindmapHydrateFromTableIfEmpty === 'function') {
                    global.tcMindmapHydrateFromTableIfEmpty();
                }
                var mmSnapshot = buildMindmapSnapshot();
                var mmBody = {
                    user_prompt: promptText,
                    mindmap_snapshot: mmSnapshot,
                    use_builtin: true,
                    user_message_history: buildMindmapEditUserMessageHistory(activeEditTurn)
                };
                return dispatchEditStreamWithAttachments(mmBody, function (payload) {
                    return requestMindmapSmartEditStream(payload, {
                        onReasoning: function (text) {
                            if (global.TcEditChat && typeof global.TcEditChat.setThinkingContent === 'function') {
                                global.TcEditChat.setThinkingContent(text);
                            }
                        }
                    });
                }, editAttachmentSnapshot);
            }

            var snapshot = buildSnapshot();

            var columns = global.tableColumns || snapshot.columns || [];
            var isMetersphereHeaders = global.TcSmartEditSchema &&
                typeof global.TcSmartEditSchema.isMetersphereTableHeaders === 'function' &&
                global.TcSmartEditSchema.isMetersphereTableHeaders(columns);

            var body = {
                user_prompt: promptText,
                table_snapshot: snapshot,
                use_builtin: true,
                is_metersphere_headers: !!isMetersphereHeaders,
                conversation_history: buildEditConversationHistory(activeEditTurn)
            };

            return dispatchEditStreamWithAttachments(body, function (payload) {
                return requestSmartEditStream(payload, {
                    onReasoning: function (text) {
                        if (global.TcEditChat && typeof global.TcEditChat.setThinkingContent === 'function') {
                            global.TcEditChat.setThinkingContent(text);
                        }
                    }
                });
            }, editAttachmentSnapshot);
        }).then(function (data) {
            if (activeEditTarget === 'mindmap') {
                if (!data.operations || !data.operations.length) {
                    var mmEmptyMsg = String(data.summary || '').trim() || '未产生变更';
                    return finalizeEditRunUi(promptText, mmEmptyMsg, [], {
                        variant: 'info',
                        statusHint: true
                    });
                }
                var mmApplied = applyMindmapOpsResult(data.operations);
                var mmOps = mmApplied.normalizedOperations || data.operations;
                var mmHint = formatMindmapOpsSummary(mmOps);
                toast(mmHint, { variant: 'success' });
                return finalizeEditRunUi(promptText, mmHint, mmOps, {
                    variant: 'done',
                    statusHint: true
                });
            }
            if (!data.operations || !data.operations.length) {
                var emptyMsg = '未产生变更';
                return finalizeEditRunUi(promptText, emptyMsg, [], { variant: 'info', statusHint: true });
            }
            var applied = applyResult(data.operations);
            var opsForSummary = applied.normalizedOperations || data.operations;
            var hint = formatOpsSummary(opsForSummary);
            toast(hint, { variant: 'success' });
            return finalizeEditRunUi(promptText, hint, opsForSummary, { variant: 'done', statusHint: true });
        }).catch(function (err) {
            if (global.TcEditChat && typeof global.TcEditChat.removeThinkingMessage === 'function') {
                global.TcEditChat.removeThinkingMessage();
            }
            if (editFinishHandled) return null;
            if (err && err.name === 'AbortError') {
                return finalizeEditRunUi(promptText, EDIT_CANCEL_STATUS_HINT, [], { variant: 'cancelled', statusHint: true });
            }
            var msg = (err && err.message) ? err.message : String(err);
            var quotaShown = !!(err && err._quotaToastShown);
            if (!quotaShown && typeof globalThis.hfAiQuotaFromErrorBody === 'function') {
                quotaShown = msg === 'VISION_QUOTA_EXHAUSTED' || globalThis.hfAiQuotaFromErrorBody({ error: msg, code: 'USER_AI_VISION_QUOTA_EXCEEDED' });
            }
            if (quotaShown) {
                return finalizeEditRunUi(promptText, '', [], { variant: 'cancelled' });
            }
            if (typeof global.tcAppAlert === 'function') {
                global.tcAppAlert(msg, { variant: 'error', title: '智能编辑失败' });
            }
            return finalizeEditRunUi(promptText, '编辑失败：' + msg, [], { variant: 'error' });
        }).finally(function () {
            editAbort = null;
            setEditRunning(false);
            updateUndoBtn();
            if (global.TcEditAttachments && typeof global.TcEditAttachments.clearVisualContext === 'function') {
                global.TcEditAttachments.clearVisualContext();
            }
        });
    }

    function triggerTcEditSend() {
        if (!global.isTcWorkbenchEditMode || !global.isTcWorkbenchEditMode()) return;
        if (editRunning) {
            cancelActiveEditRun();
            return;
        }
        var el = $('ai-edit-prompt');
        if (!el || !String(el.value || '').trim()) return;
        if (isEditSendBlocked()) {
            toast('生成或质量检查进行中，请稍后再试');
            return;
        }
        runSmartEdit(el.value);
    }

    function initTcSmartEditUndo() {
        var undoBtn = $('tc-edit-undo-btn');
        if (undoBtn && !undoBtn.dataset.tcEditBound) {
            undoBtn.dataset.tcEditBound = '1';
            undoBtn.addEventListener('click', undoLastEdit);
        }
        updateUndoBtn();
    }

    global.TcAiSmartEdit = {
        run: runSmartEdit,
        undo: undoLastEdit,
        isRunning: isEditRunning,
        getAbortSignal: getEditAbortSignal
    };
    global.triggerTcEditSend = triggerTcEditSend;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTcSmartEditUndo);
    } else {
        initTcSmartEditUndo();
    }
})(typeof window !== 'undefined' ? window : this);
