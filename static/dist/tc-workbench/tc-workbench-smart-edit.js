/* ---- tc_smart_edit_prompt.js ---- */
/**
 * 智能编辑 — 系统提示词（前端预览用，实际约束由后端兜底拼接）
 */
(function (global) {
    'use strict';

    var SYSTEM_PROMPT = '【系统约束 — 智能编辑助手】\n'
        + '你是测试用例表格编辑助手。你将收到表格表头（列定义 columns）、当前表格数据快照和用户编辑指令。\n\n'
        + '## 表头与数据格式（必读）\n'
        + '- columns 是表格表头；cells 的 key 必须与 columns 列名完全一致\n'
        + '- 每条 add 追加一行；新增 N 行须输出 N 条 add\n\n'
        + '## 允许的操作\n'
        + '- update：修改已有行的指定单元格\n'
        + '- add：在表格末尾追加新行（可多条）\n\n'
        + '## 禁止的操作\n'
        + '- 禁止 delete、禁止清空整行\n'
        + '- 禁止修改 columns 表头、禁止自造列名\n\n'
        + '## 输出格式\n'
        + '严格 JSON：{ "summary": "...", "operations": [...] }';

    function formatColumnsBlock(columns) {
        return (columns || []).map(function (col, i) {
            return (i + 1) + '. ' + col;
        }).join('\n') || '（无）';
    }

    function buildEditPromptPreview(userPrompt, tableSnapshot) {
        var snap = tableSnapshot || {};
        var columns = snap.columns || [];
        return SYSTEM_PROMPT
            + '\n\n【表格表头 columns（cells 的 key 必须且仅能使用以下列名）】\n'
            + formatColumnsBlock(columns)
            + '\n\n【当前表格数据快照】\n'
            + JSON.stringify(snap, null, 2)
            + '\n\n【用户编辑指令】\n'
            + String(userPrompt || '').trim();
    }

    global.TcSmartEditPrompt = {
        SYSTEM_PROMPT: SYSTEM_PROMPT,
        buildEditPromptPreview: buildEditPromptPreview
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_smart_edit_schema.js ---- */
/**
 * 智能编辑 — 前端响应校验（与后端规则对齐，应用前二次校验）
 */
(function (global) {
    'use strict';

    var METERSPHERE_TABLE_COLUMNS = [
        '用例名称', '所属模块', '标签', '前置条件', '步骤描述',
        '预期结果', '编辑模式', '备注', '用例等级'
    ];

    function normalizeColumns(columns) {
        return (columns || []).map(function (c) { return String(c).trim(); });
    }

    function isMetersphereTableHeaders(columns) {
        var cols = normalizeColumns(columns);
        if (cols.length !== METERSPHERE_TABLE_COLUMNS.length) return false;
        for (var i = 0; i < cols.length; i++) {
            if (cols[i] !== METERSPHERE_TABLE_COLUMNS[i]) return false;
        }
        return true;
    }

    function validateEditOperations(operations, columns, rowCount) {
        if (!Array.isArray(operations)) {
            return { ok: false, error: 'operations 必须是数组' };
        }
        var colSet = {};
        (columns || []).forEach(function (c) { colSet[c] = true; });
        var validated = [];

        for (var i = 0; i < operations.length; i++) {
            var op = operations[i];
            if (!op || typeof op !== 'object') {
                return { ok: false, error: 'operations[' + i + '] 无效' };
            }
            var type = String(op.type || '').toLowerCase();
            if (type === 'delete' || type === 'remove' || type === 'drop') {
                return { ok: false, error: '禁止删除操作' };
            }
            if (type !== 'update' && type !== 'add') {
                return { ok: false, error: '不支持的操作类型: ' + type };
            }
            var cells = op.cells;
            if (!cells || typeof cells !== 'object') {
                return { ok: false, error: 'operations[' + i + '].cells 无效' };
            }
            var clean = {};
            Object.keys(cells).forEach(function (k) {
                if (colSet[k]) clean[k] = String(cells[k] != null ? cells[k] : '');
            });
            if (type === 'update') {
                var ri = parseInt(op.rowIndex, 10);
                if (isNaN(ri) || ri < 0 || ri >= rowCount) {
                    return { ok: false, error: 'rowIndex 越界: ' + op.rowIndex };
                }
                if (!Object.keys(clean).length) {
                    return { ok: false, error: 'update 未包含有效列' };
                }
                validated.push({ type: 'update', rowIndex: ri, cells: clean });
            } else {
                validated.push({ type: 'add', cells: clean });
            }
        }
        return { ok: true, operations: validated };
    }

    global.TcSmartEditSchema = {
        METERSPHERE_TABLE_COLUMNS: METERSPHERE_TABLE_COLUMNS,
        isMetersphereTableHeaders: isMetersphereTableHeaders,
        validateEditOperations: validateEditOperations
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_smart_edit_apply.js ---- */
/**
 * 智能编辑 — 将 AI 操作应用到 testCasesData
 */
(function (global) {
    'use strict';

    function deepCloneRows(rows) {
        return (rows || []).map(function (row) {
            return Array.isArray(row) ? row.slice() : row;
        });
    }

    function rowToCells(columns, row) {
        var cells = {};
        columns.forEach(function (col, j) {
            cells[col] = String(row[j] != null ? row[j] : '');
        });
        return cells;
    }

    function cellsToRow(columns, cells) {
        return columns.map(function (col) {
            return cells && cells[col] != null ? String(cells[col]) : '';
        });
    }

    function serializeTableForEdit(columns, rows) {
        var list = rows || [];
        return {
            columns: columns.slice(),
            rows: list.map(function (row, i) {
                return { rowIndex: i, cells: rowToCells(columns, row) };
            }),
            rowCount: list.length
        };
    }

    function rowHasCaseContent(columns, row) {
        if (typeof global.tcTableRowHasCaseContent === 'function') {
            return global.tcTableRowHasCaseContent(row);
        }
        if (!row || !Array.isArray(row)) return false;
        var nameCol = 0;
        if (typeof global.resolveTcCaseNameColumnIndex === 'function') {
            nameCol = global.resolveTcCaseNameColumnIndex();
        } else if (typeof global.getTcColumnIndex === 'function') {
            nameCol = global.getTcColumnIndex('用例名称', 0);
        }
        if (String(row[nameCol] || '').trim()) return true;
        for (var i = 0; i < row.length; i++) {
            if (i === nameCol) continue;
            if (String(row[i] || '').trim()) return true;
        }
        return false;
    }

    function findFirstEmptyRowIndex(rows, fromIndex) {
        fromIndex = fromIndex || 0;
        for (var i = fromIndex; i < rows.length; i++) {
            if (!rowHasCaseContent(null, rows[i])) return i;
        }
        return -1;
    }

    /**
     * 将 add 优先映射到表格内第一个空行（update）；仅当所有行均有内容时才保留 add。
     */
    function normalizeAddOpsToEmptyRows(operations, columns, data) {
        var rows = deepCloneRows(data);
        var normalized = [];

        (operations || []).forEach(function (op) {
            if (!op || op.type === 'update') {
                if (op && op.type === 'update') {
                    var ri = op.rowIndex;
                    if (!rows[ri]) {
                        rows[ri] = columns.map(function () { return ''; });
                    }
                    var updated = rows[ri].slice();
                    columns.forEach(function (col, j) {
                        if (op.cells && Object.prototype.hasOwnProperty.call(op.cells, col)) {
                            updated[j] = op.cells[col];
                        }
                    });
                    rows[ri] = updated;
                }
                normalized.push(op);
                return;
            }
            if (op.type !== 'add') {
                normalized.push(op);
                return;
            }
            var emptyIdx = findFirstEmptyRowIndex(rows, 0);
            if (emptyIdx >= 0) {
                normalized.push({ type: 'update', rowIndex: emptyIdx, cells: op.cells || {} });
                rows[emptyIdx] = cellsToRow(columns, op.cells || {});
            } else {
                normalized.push(op);
                rows.push(cellsToRow(columns, op.cells || {}));
            }
        });

        return normalized;
    }

    function formatEditSuccessHint(operations) {
        var updates = 0;
        var adds = 0;
        (operations || []).forEach(function (op) {
            if (op.type === 'update') updates++;
            else if (op.type === 'add') adds++;
        });
        var total = updates + adds;
        if (total <= 0) return '未产生变更';
        if (adds > 0 && updates === 0) return '成功新增 ' + adds + ' 条用例';
        if (adds === 0 && updates > 0) return '成功生成 ' + updates + ' 条用例';
        return '成功编辑 ' + total + ' 条用例';
    }

    function applySmartEditOps(operations, columns, data) {
        var backup = deepCloneRows(data);
        var changedRows = [];
        var next = deepCloneRows(data);

        operations.forEach(function (op) {
            if (op.type === 'update') {
                var ri = op.rowIndex;
                if (!next[ri]) {
                    next[ri] = columns.map(function () { return ''; });
                }
                var row = next[ri].slice();
                columns.forEach(function (col, j) {
                    if (op.cells && Object.prototype.hasOwnProperty.call(op.cells, col)) {
                        row[j] = op.cells[col];
                    }
                });
                next[ri] = row;
                if (changedRows.indexOf(ri) < 0) changedRows.push(ri);
            } else if (op.type === 'add') {
                var newRow = cellsToRow(columns, op.cells || {});
                var newIndex = next.length;
                next.push(newRow);
                changedRows.push(newIndex);
            }
        });

        return {
            data: next,
            backup: backup,
            changedRows: changedRows
        };
    }

    function highlightEditedRows(rowIndices) {
        (rowIndices || []).forEach(function (ri) {
            var tr = document.querySelector('#table-body tr[data-row-index="' + ri + '"]');
            if (tr) {
                tr.classList.add('tc-row--ai-edited');
                setTimeout(function () {
                    tr.classList.remove('tc-row--ai-edited');
                }, 2500);
            }
        });
    }

    global.TcSmartEditApply = {
        serializeTableForEdit: serializeTableForEdit,
        normalizeAddOpsToEmptyRows: normalizeAddOpsToEmptyRows,
        formatEditSuccessHint: formatEditSuccessHint,
        applySmartEditOps: applySmartEditOps,
        highlightEditedRows: highlightEditedRows
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_mindmap_smart_edit_apply.js ---- */
/**
 * 思维导图智能编辑 — 将 AI operations 增量应用到 tcMindmapCasesData（与表格 TcSmartEditApply 隔离）
 */
(function (global) {
    'use strict';

    function deepCloneRows(rows) {
        return (rows || []).map(function (row) {
            return Array.isArray(row) ? row.slice() : row;
        });
    }

    function cellsToRow(columns, cells) {
        return columns.map(function (col) {
            return cells && cells[col] != null ? String(cells[col]) : '';
        });
    }

    function resolveModuleColumnIndex(columns) {
        for (var i = 0; i < columns.length; i++) {
            if (columns[i] === '所属模块') return i;
        }
        return 1;
    }

    function ensureMindmapAddDefaults(columns, cells) {
        var out = {};
        (columns || []).forEach(function (col) {
            out[col] = cells && cells[col] != null ? String(cells[col]) : '';
        });
        var modCol = '所属模块';
        if (columns.indexOf(modCol) >= 0 && !String(out[modCol] || '').trim()) {
            out[modCol] = '未分类';
        }
        return out;
    }

    function formatMindmapEditSuccessHint(operations) {
        var updates = 0;
        var adds = 0;
        (operations || []).forEach(function (op) {
            if (op.type === 'update') updates++;
            else if (op.type === 'add') adds++;
        });
        var total = updates + adds;
        if (total <= 0) return '未产生变更';
        if (adds > 0 && updates === 0) return '成功新增 ' + adds + ' 条导图用例';
        if (adds === 0 && updates > 0) return '成功更新 ' + updates + ' 条导图用例';
        return '成功编辑 ' + total + ' 条导图用例';
    }

    function applyMindmapSmartEditOps(operations, columns, data) {
        var backup = deepCloneRows(data);
        var changedRows = [];
        var next = deepCloneRows(data);

        (operations || []).forEach(function (op) {
            if (op.type === 'update') {
                var ri = op.rowIndex;
                if (!next[ri]) {
                    next[ri] = columns.map(function () { return ''; });
                }
                var row = next[ri].slice();
                columns.forEach(function (col, j) {
                    if (op.cells && Object.prototype.hasOwnProperty.call(op.cells, col)) {
                        row[j] = op.cells[col];
                    }
                });
                next[ri] = row;
                if (changedRows.indexOf(ri) < 0) changedRows.push(ri);
            } else if (op.type === 'add') {
                var cells = ensureMindmapAddDefaults(columns, op.cells || {});
                var newRow = cellsToRow(columns, cells);
                var newIndex = next.length;
                next.push(newRow);
                changedRows.push(newIndex);
            }
        });

        return {
            data: next,
            backup: backup,
            changedRows: changedRows
        };
    }

    global.TcMindmapSmartEditApply = {
        formatMindmapEditSuccessHint: formatMindmapEditSuccessHint,
        applyMindmapSmartEditOps: applyMindmapSmartEditOps
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_edit_chat.js ---- */
/**
 * 智能编辑 — 独立对话 UI
 */
(function (global) {
    'use strict';

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getThread() {
        return document.getElementById('tc-edit-chat-thread');
    }

    function getPanel() {
        return document.getElementById('tc-edit-chat-panel');
    }

    function syncLayout() {
        var panel = getPanel();
        var thread = getThread();
        if (!panel || !thread) return;
        var hasMessages = thread.children.length > 0;
        panel.classList.toggle('tc-edit-chat-panel--has-messages', hasMessages);
        panel.setAttribute('data-tc-has-messages', hasMessages ? '1' : '0');
        if (typeof global.tcLeftFloatRefreshContentHeights === 'function') {
            global.tcLeftFloatRefreshContentHeights();
        }
    }

    var thinkingEl = null;

    function removeThinkingMessage() {
        if (thinkingEl && thinkingEl.parentNode) {
            thinkingEl.parentNode.removeChild(thinkingEl);
        }
        thinkingEl = null;
        syncLayout();
    }

    function setThinkingContent(text) {
        text = String(text || '').trim();
        if (!text) {
            removeThinkingMessage();
            return null;
        }
        var thread = getThread();
        if (!thread) return null;
        if (!thinkingEl || !thread.contains(thinkingEl)) {
            removeThinkingMessage();
            thinkingEl = document.createElement('article');
            thinkingEl.className = 'tc-edit-chat-msg tc-edit-chat-msg--assistant tc-edit-chat-msg--thinking';
            thinkingEl.setAttribute('data-tc-edit-thinking', '1');
            var bubble = document.createElement('div');
            bubble.className = 'tc-edit-chat-msg__bubble';
            thinkingEl.appendChild(bubble);
            thread.appendChild(thinkingEl);
        }
        var bubbleEl = thinkingEl.querySelector('.tc-edit-chat-msg__bubble');
        if (bubbleEl) {
            bubbleEl.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
        }
        thread.scrollTop = thread.scrollHeight;
        syncLayout();
        return thinkingEl;
    }

    function appendMessage(role, text, opts) {
        opts = opts || {};
        var thread = getThread();
        if (!thread || !String(text || '').trim()) return null;
        var item = document.createElement('article');
        item.className = 'tc-edit-chat-msg tc-edit-chat-msg--' + role;
        if (opts.variant) item.classList.add('tc-edit-chat-msg--' + opts.variant);
        var bubble = document.createElement('div');
        bubble.className = 'tc-edit-chat-msg__bubble';
        bubble.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
        item.appendChild(bubble);
        thread.appendChild(item);
        thread.scrollTop = thread.scrollHeight;
        syncLayout();
        return item;
    }

    function appendUserMessage(text) {
        return appendMessage('user', text);
    }

    function classifyChatAttachKind(item) {
        var mime = String((item && item.mime_type) || '').toLowerCase();
        if (item && item.kind) return String(item.kind);
        if (mime.indexOf('pdf') >= 0) return 'pdf';
        if (mime.indexOf('text') >= 0) return 'txt';
        return 'image';
    }

    function resolveHistoryAttachments(attachments) {
        attachments = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
        if (!attachments.length) return Promise.resolve([]);
        var ids = attachments.map(function (item) { return item && item.id; }).filter(Boolean);
        if (!ids.length) return Promise.resolve(attachments);
        return fetch('/api/test-cases/attachments/history-resolve', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_ids: ids })
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) throw new Error((data && data.error) || ('HTTP ' + r.status));
                return data;
            });
        }).then(function (data) {
            var map = {};
            (data.items || []).forEach(function (row) {
                if (row && row.id) map[row.id] = row;
            });
            return attachments.map(function (att) {
                var row = map[att.id];
                if (!row || !row.available) {
                    return Object.assign({}, att, { expired: true });
                }
                return Object.assign({}, att, {
                    expired: false,
                    mime_type: row.mime_type || att.mime_type,
                    kind: row.kind || att.kind,
                    thumb_url: row.thumb_url || att.thumb_url
                });
            });
        }).catch(function () {
            return attachments.map(function (att) {
                return Object.assign({}, att, { expired: !!att.expired });
            });
        });
    }

    function buildChatAttachmentPreviewEl(item) {
        var kind = classifyChatAttachKind(item);
        var el = document.createElement('div');
        el.className = 'tc-edit-chat-msg__attach-item tc-edit-chat-msg__attach-item--' + kind;
        var fileName = String((item && item.fileName) || '').trim();

        if (item && item.expired) {
            el.classList.add('tc-edit-chat-msg__attach-item--expired');
            var expiredEl = document.createElement('div');
            expiredEl.className = 'tc-edit-chat-msg__attach-expired';
            expiredEl.textContent = kind === 'image' ? '图片已过期' : (kind === 'pdf' ? 'PDF 已过期' : '附件已过期');
            el.appendChild(expiredEl);
        } else if (kind === 'image') {
            var img = document.createElement('img');
            img.className = 'tc-edit-chat-msg__attach-img';
            img.src = String((item && item.thumb_url) || '');
            img.alt = fileName || '图片';
            img.loading = 'lazy';
            img.addEventListener('error', function () {
                img.style.display = 'none';
                if (el.querySelector('.tc-edit-chat-msg__attach-expired')) return;
                el.classList.add('tc-edit-chat-msg__attach-item--expired');
                var fallback = document.createElement('div');
                fallback.className = 'tc-edit-chat-msg__attach-expired';
                fallback.textContent = '图片已过期';
                el.insertBefore(fallback, img);
            });
            el.appendChild(img);
        } else {
            var doc = document.createElement('div');
            doc.className = 'tc-edit-chat-msg__attach-doc';
            doc.textContent = kind === 'pdf' ? 'PDF' : (kind === 'txt' ? 'TXT' : 'FILE');
            el.appendChild(doc);
        }


        if (fileName) {
            var nameEl = document.createElement('div');
            nameEl.className = 'tc-edit-chat-msg__attach-name';
            nameEl.textContent = fileName;
            nameEl.title = fileName;
            el.appendChild(nameEl);
        }
        return el;
    }

    /** 智能编辑专用：附件展示在提示词上方（不影响 appendUserMessage） */
    function appendUserMessageWithAttachments(text, attachments) {
        var thread = getThread();
        if (!thread) return null;
        var list = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
        var promptText = String(text || '').trim();
        if (!promptText && !list.length) return null;

        var item = document.createElement('article');
        item.className = 'tc-edit-chat-msg tc-edit-chat-msg--user';
        if (list.length) {
            item.classList.add('tc-edit-chat-msg--with-attachments');
        }

        var bubble = document.createElement('div');
        bubble.className = 'tc-edit-chat-msg__bubble';

        if (list.length) {
            var grid = document.createElement('div');
            grid.className = 'tc-edit-chat-msg__attachments';
            grid.setAttribute('aria-label', '消息附件');
            list.forEach(function (att) {
                grid.appendChild(buildChatAttachmentPreviewEl(att));
            });
            bubble.appendChild(grid);
        }

        if (promptText) {
            var textEl = document.createElement('div');
            textEl.className = 'tc-edit-chat-msg__text';
            textEl.innerHTML = escapeHtml(promptText).replace(/\n/g, '<br>');
            bubble.appendChild(textEl);
        }

        item.appendChild(bubble);
        thread.appendChild(item);
        thread.scrollTop = thread.scrollHeight;
        syncLayout();
        return item;
    }

    function appendAssistantMessage(text, opts) {
        return appendMessage('assistant', text, opts || {});
    }

    function appendStatusUnderLastUser(text, opts) {
        opts = opts || {};
        text = String(text || '').trim();
        if (!text) return null;
        var thread = getThread();
        if (!thread) return null;
        var users = thread.querySelectorAll('.tc-edit-chat-msg--user');
        var item = users.length ? users[users.length - 1] : null;
        if (!item) return null;
        var status = item.querySelector('.tc-edit-chat-msg__status');
        if (!status) {
            status = document.createElement('div');
            item.appendChild(status);
        }
        status.className = 'tc-edit-chat-msg__status';
        if (opts.variant) status.classList.add('tc-edit-chat-msg__status--' + opts.variant);
        status.textContent = text;
        thread.scrollTop = thread.scrollHeight;
        syncLayout();
        return status;
    }

    function clearThread() {
        removeThinkingMessage();
        var thread = getThread();
        if (thread) thread.innerHTML = '';
        syncLayout();
    }

    function parseTurnChain(turn) {
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

    function normalizeRestoredAttachments(chain) {
        chain = chain || {};
        var list = chain.user_attachments || chain.userAttachments || [];
        if (!Array.isArray(list)) return [];
        return list.map(function (item) {
            if (!item || !item.id) return null;
            var id = String(item.id);
            var mime = String(item.mime_type || item.mimeType || '').toLowerCase();
            var kind = String(item.kind || '').trim();
            if (!kind) {
                if (mime.indexOf('pdf') >= 0) kind = 'pdf';
                else if (mime.indexOf('text') >= 0) kind = 'txt';
                else kind = 'image';
            }
            return {
                id: id,
                mime_type: mime,
                kind: kind,
                fileName: String(item.fileName || item.file_name || '').trim(),
                thumb_url: String(item.thumb_url || item.thumbUrl || (
                    '/api/test-cases/attachments/' + encodeURIComponent(id) + '/thumb'
                ))
            };
        }).filter(Boolean);
    }

    function restoreFromTurns(turns, opts) {
        opts = opts || {};
        turns = turns || [];
        if (!opts.force) {
            var thread = getThread();
            if (thread && thread.children.length > 0) return;
        }
        clearThread();
        var sorted = turns.slice().sort(function (a, b) {
            return (a.turn_index || 0) - (b.turn_index || 0);
        });
        var sequence = Promise.resolve();
        sorted.forEach(function (turn) {
            sequence = sequence.then(function () {
                if (!turn) return;
                var chain = parseTurnChain(turn);
                var user = String(turn.user_prompt || '').trim();
                var attachments = normalizeRestoredAttachments(chain);
                var renderStatus = function () {
                    var summary = String(chain.summary || chain.editSummary || '').trim();
                    if (chain.error && summary) {
                        appendAssistantMessage(summary, { variant: 'error' });
                    } else if (summary) {
                        appendStatusUnderLastUser(summary, { variant: chain.error ? 'error' : 'done' });
                    }
                };
                if (!attachments.length) {
                    if (user) appendUserMessage(user);
                    renderStatus();
                    return;
                }
                return resolveHistoryAttachments(attachments).then(function (resolved) {
                    appendUserMessageWithAttachments(user, resolved);
                    renderStatus();
                });
            });
        });
        return sequence;
    }


    global.TcEditChat = {
        appendUserMessage: appendUserMessage,
        appendUserMessageWithAttachments: appendUserMessageWithAttachments,
        appendAssistantMessage: appendAssistantMessage,
        appendStatusUnderLastUser: appendStatusUnderLastUser,
        setThinkingContent: setThinkingContent,
        removeThinkingMessage: removeThinkingMessage,
        clearThread: clearThread,
        restoreFromTurns: restoreFromTurns,
        syncLayout: syncLayout
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_edit_attachments.js ---- */
/* 智能编辑 — 视觉附件（独立实现，与智能生成附件模块隔离）
 * 策略：上传仅保存文件；点击发送时再调用视觉模型解析并构建上下文。 */
(function (global) {
    'use strict';

    var state = {
        enabled: false,
        authed: false,
        isAdmin: false,
        visionConfigured: false,
        visionQuotaExhausted: false,
        assets: [],
        visualContextId: null,
        contextDirty: false,
        preparingOnSend: false,
        limits: {
            maxAttachFiles: 4,
            maxBatchFiles: 4
        }
    };

    var uploadChain = Promise.resolve();

    function $(id) { return document.getElementById(id); }

    function getComposerRoot() {
        return $('tc-edit-prompt-composer');
    }

    function getAttachmentsGrid() {
        var root = getComposerRoot();
        if (root) {
            var scoped = root.querySelector('#tc-edit-prompt-composer-attachments');
            if (scoped) return scoped;
        }
        return $('tc-edit-prompt-composer-attachments');
    }

    function toast(msg, variant) {
        if (typeof global.tcAppToast === 'function') {
            global.tcAppToast(msg, { variant: variant || 'info', duration: 3200 });
        }
    }

    function getMaxAttachFiles() {
        var n = state.limits && state.limits.maxAttachFiles;
        return typeof n === 'number' && n > 0 ? n : 4;
    }

    function getRemainingSlots() {
        return Math.max(0, getMaxAttachFiles() - state.assets.length);
    }

    var ALLOWED_EXT = /\.(png|jpe?g|webp|pdf|txt)$/i;
    var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    var MAX_PDF_BYTES = 30 * 1024 * 1024;
    var MAX_TXT_BYTES = 2 * 1024 * 1024;

    function classifyUploadFile(file) {
        var name = String((file && file.name) || '').toLowerCase();
        var mime = String((file && file.type) || '').split(';')[0].trim().toLowerCase();
        if (/\.pdf$/.test(name) || mime === 'application/pdf') return 'pdf';
        if (/\.txt$/.test(name) || mime === 'text/plain') return 'txt';
        if (/\.(png|jpe?g|webp)$/.test(name) || /^image\//.test(mime)) return 'image';
        return '';
    }

    function validateUploadFile(file) {
        if (!file || !file.name) return '无效文件';
        var kind = classifyUploadFile(file);
        if (!kind) return '仅支持 PNG/JPG/WebP 图片、PDF 或 TXT 文本';
        if (!ALLOWED_EXT.test(file.name)) return '文件扩展名不受支持：' + file.name;
        var size = file.size || 0;
        if (kind === 'pdf' && size > MAX_PDF_BYTES) return 'PDF 超过 30MB 限制';
        if (kind === 'txt' && size > MAX_TXT_BYTES) return 'TXT 超过 2MB 限制';
        if (kind === 'image' && size > MAX_IMAGE_BYTES) return '图片超过 10MB 限制';
        return '';
    }

    function validateUploadFiles(fileList) {
        if (!fileList || !fileList.length) return [];
        var errors = [];
        var valid = [];
        for (var i = 0; i < fileList.length; i++) {
            var err = validateUploadFile(fileList[i]);
            if (err) errors.push(err);
            else valid.push(fileList[i]);
        }
        if (errors.length && !valid.length) {
            toast(errors[0], 'warning');
            return [];
        }
        if (errors.length) {
            toast(errors[0] + (errors.length > 1 ? ' 等' : ''), 'warning');
        }
        return valid;
    }

    function isAttachLimitReached() {
        return state.assets.length >= getMaxAttachFiles();
    }

    function applyAuthFromMe(me) {
        state.authed = !!(me && me.authenticated);
        state.isAdmin = !!(me && me.can_manage_builtin_ai);
    }

    function syncComposerClass() {
        var root = getComposerRoot();
        if (!root) return;
        root.classList.toggle('tc-prompt-composer--attach-full', isAttachLimitReached());
        root.classList.toggle('tc-prompt-composer--has-attachments', state.assets.length > 0);
    }

    function refreshComposerLayout() {
        syncComposerClass();
        if (typeof global.tcLeftFloatRefreshContentHeights === 'function') {
            global.tcLeftFloatRefreshContentHeights();
        }
    }

    function isEditComposerDrawerActive() {
        var wrap = $('left-content-wrapper');
        if (!wrap) return false;
        if (wrap.getAttribute('data-active-drawer') === '2') return false;
        if (wrap.getAttribute('data-active-gen-mode') === 'edit') return true;
        var editPanel = $('drawer-edit-content');
        return !!(editPanel && !editPanel.classList.contains('hidden'));
    }

    function isLeftPanelVisible() {
        var panel = $('left-panel');
        if (!panel) return false;
        if (panel.getAttribute('aria-hidden') === 'true') return false;
        if (panel.classList.contains('tc-left-float-panel--collapsed')) return false;
        return true;
    }

    function applyVisionFromCache() {
        if (!state.authed || state.isAdmin) return;
        if (global.HfUserAiConfig && typeof global.HfUserAiConfig.isVisionConfigured === 'function') {
            if (global.HfUserAiConfig.isVisionConfigured()) {
                state.visionConfigured = true;
            }
        }
    }

    function refreshOnPanelOpen() {
        if (!isLeftPanelVisible() || !isEditComposerDrawerActive()) return;
        ensureInit();
        renderAttachments();
        var chain = Promise.resolve();
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            chain = global.HfAuthNav.fetchMe().then(function (me) {
                applyAuthFromMe(me);
            }).catch(function () {});
        }
        chain.then(function () {
            if (!state.authed) {
                state.visionConfigured = false;
                refreshComposerLayout();
                return;
            }
            applyVisionFromCache();
            return fetchStatus();
        }).catch(function () {
            refreshComposerLayout();
        });
    }

    function watchLeftPanelOpen() {
        var panel = $('left-panel');
        if (!panel || panel._tcEditAttachPanelWatch) return;
        panel._tcEditAttachPanelWatch = true;
        var lastVisible = false;
        function check() {
            var visible = isLeftPanelVisible() && isEditComposerDrawerActive();
            if (visible && !lastVisible) {
                refreshOnPanelOpen();
            }
            lastVisible = visible;
        }
        var obs = new MutationObserver(check);
        obs.observe(panel, { attributes: true, attributeFilter: ['aria-hidden', 'class'] });
        var wrap = $('left-content-wrapper');
        if (wrap) {
            var wrapObs = new MutationObserver(check);
            wrapObs.observe(wrap, { attributes: true, attributeFilter: ['data-active-drawer', 'data-active-gen-mode'] });
        }
        var editPanel = $('drawer-edit-content');
        if (editPanel) {
            var editObs = new MutationObserver(check);
            editObs.observe(editPanel, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
        }
        check();
    }

    function promptVisionConfigSetup() {
        if (state.isAdmin) {
            var adminOpen = global.HfBuiltinAiAdmin && global.HfBuiltinAiAdmin.openModal;
            if (typeof adminOpen !== 'function') return Promise.resolve(false);
            adminOpen.call(global.HfBuiltinAiAdmin, { focusVision: true });
            return Promise.resolve(false);
        }
        var openFn = global.HfUserAiConfig && global.HfUserAiConfig.openModal;
        if (typeof openFn !== 'function') return Promise.resolve(false);
        openFn.call(global.HfUserAiConfig, { focusVision: true });
        return Promise.resolve(false);
    }

    function ensureAuthenticatedForUpload() {
        function applyAuth(data) {
            applyAuthFromMe(data);
            state.authed = !!(data && data.authenticated);
            return state.authed;
        }
        if (global.HfAuthNav && typeof global.HfAuthNav.ensureAuthenticated === 'function') {
            return global.HfAuthNav.ensureAuthenticated({
                next: global.location.pathname + global.location.search
            }).then(function (data) {
                return applyAuth(data);
            });
        }
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            return global.HfAuthNav.fetchMe().then(function (me) {
                if (!applyAuth(me) && global.HfAuthNav.loginUrl) {
                    global.location.href = global.HfAuthNav.loginUrl(
                        global.location.pathname + global.location.search
                    );
                    return false;
                }
                return state.authed;
            });
        }
        return Promise.resolve(true);
    }

    function ensureVisionConfigured() {
        if (state.visionConfigured) return Promise.resolve(true);
        return fetchStatus().then(function (ok) {
            if (ok) return true;
            if (state.visionQuotaExhausted) {
                if (typeof globalThis.hfAiQuotaNotify === 'function') {
                    globalThis.hfAiQuotaNotify({
                        kind: 'vision',
                        kind_label: '视觉模型',
                        used_site_builtin: true,
                        remaining: 0,
                        exhausted: true
                    });
                }
                return false;
            }
            return promptVisionConfigSetup();
        });
    }

    function fetchStatus() {
        return fetch('/api/test-cases/attachments/status', { credentials: 'same-origin' })
            .then(function (r) {
                if (r.status === 401) {
                    state.authed = false;
                    return { enabled: false, vision_configured: false, unauthenticated: true };
                }
                state.authed = true;
                return r.json();
            })
            .then(function (d) {
                if (d && d.unauthenticated) {
                    state.enabled = false;
                    state.visionConfigured = false;
                    refreshComposerLayout();
                    return false;
                }
                state.enabled = !!(d && d.enabled);
                state.visionConfigured = !!(d && d.vision_configured);
                state.visionQuotaExhausted = !!(d && d.vision_quota_exhausted);
                if (d && d.max_attach_files) state.limits.maxAttachFiles = d.max_attach_files;
                if (d && d.max_batch_files) state.limits.maxBatchFiles = d.max_batch_files;
                refreshComposerLayout();
                return state.visionConfigured;
            })
            .catch(function () {
                state.enabled = false;
                state.visionConfigured = false;
                refreshComposerLayout();
                return false;
            });
    }

    function beginUploadFlow(openFilePicker) {
        if (isAttachLimitReached()) {
            toast('已达附件上限，请先移除部分后再添加', 'warning');
            return Promise.resolve();
        }
        return ensureAuthenticatedForUpload().then(function (ok) {
            if (!ok) return;
            refreshComposerLayout();
            if (openFilePicker) openFilePicker();
        });
    }

    /** 发送前解析中，或上传占位中 — 用于禁用发送按钮 */
    function isComposerAttachmentParsePending() {
        if (state.preparingOnSend) return true;
        return state.assets.some(function (asset) {
            return asset && asset._optimistic;
        });
    }

    function getEditAbortSignal() {
        if (global.TcAiSmartEdit && typeof global.TcAiSmartEdit.getAbortSignal === 'function') {
            return global.TcAiSmartEdit.getAbortSignal();
        }
        return undefined;
    }

    function cancelPrepareForEditSend() {
        state.preparingOnSend = false;
        syncEditComposerSendBtnFromAttachments();
    }

    function syncEditComposerSendBtnFromAttachments() {
        if (typeof global.syncTcEditSendBtnState === 'function') {
            global.syncTcEditSendBtnState();
        }
    }

    function revokeOptimisticAsset(asset) {
        if (asset && asset._objectUrl) {
            try { URL.revokeObjectURL(asset._objectUrl); } catch (e) { /* ignore */ }
        }
    }

    function removeOptimisticByBatch(batchId) {
        if (!batchId) return;
        var kept = [];
        state.assets.forEach(function (asset) {
            if (asset && asset._optimistic && asset._optimisticBatch === batchId) {
                revokeOptimisticAsset(asset);
                return;
            }
            kept.push(asset);
        });
        state.assets = kept;
    }

    function normalizeAssetThumb(asset) {
        if (!asset || asset.thumb_url) return asset;
        if (asset.id && !asset._optimistic) {
            asset.thumb_url = '/api/test-cases/attachments/' + asset.id + '/thumb';
        }
        return asset;
    }

    function addOptimisticAssets(files) {
        if (!files || !files.length) return '';
        var batchId = 'batch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        var stamp = Date.now();
        files.forEach(function (file, index) {
            var kind = classifyUploadFile(file);
            var mime = String((file && file.type) || '').split(';')[0].trim().toLowerCase();
            if (!mime && kind === 'pdf') mime = 'application/pdf';
            if (!mime && kind === 'txt') mime = 'text/plain';
            if (!mime && kind === 'image') mime = 'image/jpeg';
            var asset = {
                id: 'temp-' + stamp + '-' + index,
                mime_type: mime,
                parse_status: 'pending',
                _optimistic: true,
                _optimisticBatch: batchId,
                _fileName: String((file && file.name) || '附件')
            };
            if (kind === 'image' && global.URL && typeof global.URL.createObjectURL === 'function') {
                asset._objectUrl = global.URL.createObjectURL(file);
                asset.thumb_url = asset._objectUrl;
            }
            state.assets.push(asset);
        });
        state.contextDirty = true;
        state.visualContextId = null;
        renderAttachments();
        return batchId;
    }

    function getAttachmentBadgeText(asset) {
        if (asset._optimistic) return '上传中';
        if (asset.parse_status === 'error') return '失败';
        if (asset.parse_status === 'done') return '就绪';
        if (state.preparingOnSend) {
            if (asset.parse_status === 'processing') return '解析中';
            return '等待';
        }
        return '待发送';
    }

    function renderAttachments() {
        var grid = getAttachmentsGrid();
        if (!grid) return;
        grid.innerHTML = '';
        state.assets.forEach(function (asset) {
            var card = document.createElement('div');
            card.className = 'tc-attach-card';
            card.setAttribute('data-asset-id', asset.id);

            var isPdf = (asset.mime_type || '').indexOf('pdf') >= 0;
            var isTxt = (asset.mime_type || '').indexOf('text') >= 0;
            if (asset.thumb_url && !isPdf && !isTxt) {
                var img = document.createElement('img');
                img.className = 'tc-attach-card__img';
                img.src = asset.thumb_url;
                img.alt = asset._fileName || '附件';
                card.appendChild(img);
            } else {
                var doc = document.createElement('div');
                doc.className = 'tc-attach-card__doc';
                doc.textContent = isPdf ? 'PDF' : (isTxt ? 'TXT' : 'IMG');
                card.appendChild(doc);
            }

            var badge = document.createElement('div');
            badge.className = 'tc-attach-card__badge';
            var badgeText = getAttachmentBadgeText(asset);
            if (asset.parse_status === 'error') {
                badge.classList.add('tc-attach-card__badge--error');
            } else if (asset.parse_status !== 'done') {
                badge.classList.add('tc-attach-card__badge--pending');
            }
            badge.textContent = badgeText;
            card.appendChild(badge);

            var rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'tc-attach-card__remove';
            rm.setAttribute('aria-label', '移除附件');
            rm.textContent = '×';
            rm.addEventListener('click', function () { removeAsset(asset.id); });
            card.appendChild(rm);

            grid.appendChild(card);
        });
        refreshComposerLayout();
        syncEditComposerSendBtnFromAttachments();
    }

    function upsertAsset(asset) {
        var idx = -1;
        for (var i = 0; i < state.assets.length; i++) {
            if (state.assets[i].id === asset.id) { idx = i; break; }
        }
        if (idx >= 0) state.assets[idx] = asset;
        else state.assets.push(asset);
        state.contextDirty = true;
        state.visualContextId = null;
        renderAttachments();
    }

    function getRealAssetIds() {
        return state.assets
            .filter(function (asset) {
                return asset && asset.id && !asset._optimistic;
            })
            .map(function (asset) { return asset.id; })
            .slice(0, getMaxAttachFiles());
    }

    function pickFilesForUpload(fileList) {
        if (!fileList || !fileList.length) return [];
        var validated = validateUploadFiles(fileList);
        if (!validated.length) return [];
        var remaining = getRemainingSlots();
        if (remaining <= 0) {
            toast('已达附件上限，请先移除部分后再添加', 'warning');
            return [];
        }
        var batchMax = state.limits.maxBatchFiles || getMaxAttachFiles();
        var allowed = Math.min(remaining, batchMax);
        var picked = validated.slice(0, allowed);
        if (picked.length < validated.length) {
            toast('附件数量已达上限，已选取前 ' + picked.length + ' 个', 'warning');
        }
        return picked;
    }

    function uploadFilesInternal(fileList) {
        if (!fileList || !fileList.length) return Promise.resolve();
        return ensureAuthenticatedForUpload().then(function (ok) {
            if (!ok) return;
            var picked = pickFilesForUpload(fileList);
            if (!picked.length) return;
            var batchId = addOptimisticAssets(picked);
            var fd = new FormData();
            fd.append('defer_parse', '1');
            for (var i = 0; i < picked.length; i++) {
                fd.append('files[]', picked[i]);
            }
            getRealAssetIds().forEach(function (assetId) {
                fd.append('existing_asset_ids[]', assetId);
            });
            return fetch('/api/test-cases/attachments/batch', {
                method: 'POST',
                credentials: 'same-origin',
                body: fd
            })
                .then(function (r) {
                    return r.json().then(function (d) {
                        if (!r.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
                        return d;
                    });
                })
                .then(function (d) {
                    removeOptimisticByBatch(batchId);
                    (d.assets || []).forEach(function (asset) {
                        upsertAsset(normalizeAssetThumb(asset));
                    });
                    renderAttachments();
                    if (d && d.ai_quota && typeof global.hfAiQuotaNotify === 'function') {
                        global.hfAiQuotaNotify(d.ai_quota);
                    }
                })
                .catch(function (err) {
                    removeOptimisticByBatch(batchId);
                    renderAttachments();
                    toast((err && err.message) || '上传失败', 'error');
                });
        });
    }

    function uploadFiles(fileList) {
        if (!fileList || !fileList.length) return Promise.resolve();
        var task = uploadChain.then(function () {
            return uploadFilesInternal(fileList);
        });
        uploadChain = task.catch(function () {});
        return task;
    }

    function inferAttachmentKind(mime) {
        var m = String(mime || '').toLowerCase();
        if (m.indexOf('pdf') >= 0) return 'pdf';
        if (m.indexOf('text') >= 0) return 'txt';
        return 'image';
    }

    function buildChatDisplayItem(asset) {
        if (!asset || !asset.id || asset._optimistic) return null;
        var mime = String(asset.mime_type || '').toLowerCase();
        var kind = inferAttachmentKind(mime);
        var isPdf = kind === 'pdf';
        var isTxt = kind === 'txt';
        var fileName = String(asset._fileName || '').trim();
        if (!fileName) {
            fileName = isPdf ? 'PDF 文档' : (isTxt ? '文本文档' : '图片');
        }
        var thumb = '';
        if (!isPdf && !isTxt) {
            thumb = asset.thumb_url || ('/api/test-cases/attachments/' + encodeURIComponent(asset.id) + '/thumb');
        }
        return {
            id: asset.id,
            mime_type: mime,
            kind: kind,
            fileName: fileName,
            thumb_url: thumb
        };
    }

    function snapshotComposerAttachmentsForSend() {
        var displayItems = [];
        state.assets.forEach(function (asset) {
            var item = buildChatDisplayItem(asset);
            if (item) displayItems.push(item);
        });
        var assetIds = displayItems.map(function (item) { return item.id; });
        return {
            assetIds: assetIds.slice(),
            displayItems: displayItems,
            hadAttachments: displayItems.length > 0 || state.assets.some(function (a) { return a && a._optimistic; })
        };
    }

    /** 发送瞬间清空输入框上方附件 UI（不删服务器文件，供后台解析使用） */
    function hideComposerAttachments() {
        state.assets.forEach(revokeOptimisticAsset);
        state.assets = [];
        state.preparingOnSend = false;
        state.contextDirty = true;
        renderAttachments();
        refreshComposerLayout();
        syncEditComposerSendBtnFromAttachments();
    }

    function purgeComposerAttachmentsFromServer(assetIds) {
        (assetIds || []).forEach(function (assetId) {
            if (!assetId || String(assetId).indexOf('temp-') === 0) return;
            fetch('/api/test-cases/attachments/' + encodeURIComponent(assetId), {
                method: 'DELETE',
                credentials: 'same-origin'
            }).catch(function () {});
        });
    }

    function clearComposerAttachmentsAfterSend() {
        hideComposerAttachments();
        state.visualContextId = null;
        state.contextDirty = false;
    }

    function removeAsset(assetId) {
        var target = null;
        state.assets.forEach(function (asset) {
            if (asset && asset.id === assetId) target = asset;
        });
        if (target && target._optimistic) {
            revokeOptimisticAsset(target);
            state.assets = state.assets.filter(function (a) { return a.id !== assetId; });
            state.contextDirty = true;
            state.visualContextId = null;
            renderAttachments();
            return;
        }
        fetch('/api/test-cases/attachments/' + encodeURIComponent(assetId), {
            method: 'DELETE',
            credentials: 'same-origin'
        }).finally(function () {
            state.assets = state.assets.filter(function (a) { return a.id !== assetId; });
            state.contextDirty = true;
            state.visualContextId = null;
            renderAttachments();
        });
    }

    function getUserPromptSnippet() {
        var el = $('ai-edit-prompt');
        if (!el) return '';
        return String(el.value || '').trim().slice(0, 500);
    }

    function parseJsonResponse(r) {
        return r.text().then(function (text) {
            var data = null;
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    var hint = String(text || '').replace(/\s+/g, ' ').slice(0, 120);
                    throw new Error(
                        (r.ok ? '服务器返回格式异常' : ('请求失败 (HTTP ' + r.status + ')'))
                        + (hint ? ('：' + hint) : '')
                    );
                }
            } else {
                data = {};
            }
            if (!r.ok) {
                throw new Error((data && data.error) || ('HTTP ' + r.status));
            }
            return data;
        });
    }

    function rebuildContext(userPrompt, explicitAssetIds) {
        var assetIds = (explicitAssetIds && explicitAssetIds.length)
            ? explicitAssetIds.slice(0, getMaxAttachFiles())
            : getRealAssetIds();
        var sendFlow = !!(explicitAssetIds && explicitAssetIds.length);
        if (!assetIds.length) {
            state.visualContextId = null;
            state.contextDirty = false;
            return Promise.resolve(null);
        }
        if (!sendFlow && state.assets.some(function (a) { return a && a._optimistic; })) {
            return Promise.reject(new Error('附件上传中，请稍后再发送'));
        }
        var promptText = String(userPrompt || getUserPromptSnippet() || '').trim().slice(0, 500);
        if (!sendFlow && !state.contextDirty && state.visualContextId && !userPrompt) {
            return Promise.resolve(state.visualContextId);
        }
        return ensureVisionConfigured().then(function (configured) {
            if (!configured) {
                if (state.visionQuotaExhausted) {
                    return Promise.reject(new Error('VISION_QUOTA_EXHAUSTED'));
                }
                return Promise.reject(new Error('请先配置视觉模型后再发送带附件的编辑指令'));
            }
            state.preparingOnSend = true;
            if (!sendFlow) {
                renderAttachments();
            }
            syncEditComposerSendBtnFromAttachments();
            var prepareSignal = getEditAbortSignal();
            return fetch('/api/test-cases/attachments/edit-prepare-context', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                signal: prepareSignal,
                body: JSON.stringify({
                    asset_ids: assetIds,
                    user_prompt: promptText
                })
            })
                .then(function (r) {
                    return parseJsonResponse(r);
                })
                .then(function (d) {
                    var ctx = d && d.context;
                    state.visualContextId = ctx && ctx.id ? ctx.id : null;
                    if (d && d.ai_quota && typeof global.hfAiQuotaNotify === 'function') {
                        global.hfAiQuotaNotify(d.ai_quota);
                    }

                    state.contextDirty = false;
                    if (!state.visualContextId) {
                        throw new Error('附件上下文构建失败');
                    }
                    return state.visualContextId;
                })
                .catch(function (err) {
                    if (err && err.name === 'AbortError') {
                        throw err;
                    }
                    var msg = (err && err.message) ? err.message : String(err);
                    var quotaShown = typeof globalThis.hfAiQuotaFromErrorBody === 'function' &&
                        globalThis.hfAiQuotaFromErrorBody({ error: msg });
                    if (!quotaShown) {
                        toast(msg || '附件解析失败', 'error');
                        if (typeof global.tcAppAlert === 'function') {
                            global.tcAppAlert(msg || '附件解析失败', { variant: 'error', title: '附件解析失败' });
                        }
                    }
                    throw err;
                })
                .finally(function () {
                    state.preparingOnSend = false;
                    syncEditComposerSendBtnFromAttachments();
                });
        });
    }

    function clearVisualContext() {
        state.visualContextId = null;
        state.contextDirty = false;
    }

    function appendPayload(body) {
        if (!body || !state.visualContextId) return body;
        if (!getRealAssetIds().length && !body.use_attachments) return body;
        body.visual_context_id = state.visualContextId;
        return body;
    }

    function bindEvents() {
        var root = getComposerRoot();
        if (!root || root.dataset.tcEditAttachBound === '1') return;
        root.dataset.tcEditAttachBound = '1';

        var uploadBtn = $('tc-edit-attach-upload-btn');
        var fileInput = $('tc-edit-attach-file-input');
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', function () {
                beginUploadFlow(function () { fileInput.click(); });
            });
            fileInput.addEventListener('change', function () {
                if (fileInput.files && fileInput.files.length) {
                    uploadFiles(Array.prototype.slice.call(fileInput.files));
                }
                fileInput.value = '';
            });
        }

        var box = $('tc-edit-prompt-composer-box');
        if (box) {
            box.addEventListener('dragover', function (e) {
                e.preventDefault();
                if (!isAttachLimitReached()) {
                    box.classList.add('tc-prompt-composer__box--drag');
                }
            });
            box.addEventListener('dragleave', function () {
                box.classList.remove('tc-prompt-composer__box--drag');
            });
            box.addEventListener('drop', function (e) {
                e.preventDefault();
                box.classList.remove('tc-prompt-composer__box--drag');
                var files = e.dataTransfer && e.dataTransfer.files;
                if (files && files.length) {
                    uploadFiles(Array.prototype.slice.call(files));
                }
            });
        }

        var promptEl = $('ai-edit-prompt');
        if (promptEl) {
            promptEl.addEventListener('input', function () {
                if (state.assets.length) {
                    state.contextDirty = true;
                    state.visualContextId = null;
                }
            });
        }

        global.addEventListener('hf-user-ai-config-updated', function (ev) {
            if (state.isAdmin) return;
            var d = ev && ev.detail;
            state.visionConfigured = !!(d && d.vision_configured);
            refreshComposerLayout();
            if (state.visionConfigured) fetchStatus();
        });

        global.addEventListener('hf-auth-nav-updated', function (ev) {
            applyAuthFromMe(ev.detail || {});
            refreshComposerLayout();
            if (state.authed) fetchStatus();
        });
    }

    function ensureInit() {
        if (!getComposerRoot()) return;
        bindEvents();
    }

    function init() {
        if (!getComposerRoot()) return;
        bindEvents();
        watchLeftPanelOpen();
        var authP = Promise.resolve();
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            authP = global.HfAuthNav.fetchMe().then(function (me) {
                applyAuthFromMe(me);
            }).catch(function () {});
        }
        authP.then(function () {
            applyVisionFromCache();
            return fetchStatus();
        }).then(function () {
            renderAttachments();
        });
    }

    global.TcEditAttachments = {
        init: init,
        ensureInit: ensureInit,
        uploadFiles: uploadFiles,
        getVisualContextId: function () { return state.visualContextId; },
        appendPayload: appendPayload,
        rebuildContext: rebuildContext,
        prepareContextForSmartEditSend: rebuildContext,
        snapshotComposerAttachmentsForSend: snapshotComposerAttachmentsForSend,
        hideComposerAttachments: hideComposerAttachments,
        clearVisualContext: clearVisualContext,
        purgeComposerAttachmentsFromServer: purgeComposerAttachmentsFromServer,
        clearComposerAttachmentsAfterSend: clearComposerAttachmentsAfterSend,
        isComposerAttachmentParsePending: isComposerAttachmentParsePending,
        cancelPrepareForEditSend: cancelPrepareForEditSend,
        hasUploadedAttachments: function () { return state.assets.length > 0; },
        getAssets: function () { return state.assets.slice(); },
        refreshOnPanelOpen: refreshOnPanelOpen,
        renderAttachments: renderAttachments
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_edit_composer.js ---- */
/**
 * 智能编辑 — 输入框 Composer（独立实现，不复用智能生成对话框）
 */
(function (global) {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function resizeTcEditPromptInput(textarea) {
        var el = textarea || $('ai-edit-prompt');
        if (!el) return;
        var lim;
        if (typeof global.getTcAiPromptResizeLimits === 'function') {
            lim = global.getTcAiPromptResizeLimits(el);
        } else {
            lim = { min: 36, max: 118 };
        }
        el.style.height = 'auto';
        var scrollHeight = el.scrollHeight;
        var next = Math.min(lim.max, Math.max(lim.min, scrollHeight));
        el.style.height = next + 'px';
        el.style.overflowY = scrollHeight > lim.max ? 'auto' : 'hidden';
        var box = $('tc-edit-prompt-composer-box');
        if (box) {
            var multiline = scrollHeight > lim.min + 2;
            box.classList.toggle('tc-prompt-composer__box--multiline', multiline);
            if (multiline) {
                box.style.setProperty('border-radius', '10px', 'important');
            } else {
                box.style.removeProperty('border-radius');
            }
        }
    }


    function isEditAttachmentParsePending() {
        var mod = global.TcEditAttachments;
        if (!mod || typeof mod.isComposerAttachmentParsePending !== 'function') return false;
        return mod.isComposerAttachmentParsePending();
    }

    function syncTcEditSendBtnState() {
        var el = $('ai-edit-prompt');
        var btn = $('tc-edit-send-btn');
        if (!btn) return;
        var running = global.TcAiSmartEdit && typeof global.TcAiSmartEdit.isRunning === 'function'
            ? global.TcAiSmartEdit.isRunning()
            : false;
        var hasText = !!(el && String(el.value || '').trim());
        var attachParsing = isEditAttachmentParsePending();
        var canSend = hasText && !running && !attachParsing;
        btn.disabled = running ? false : !canSend;
        btn.classList.toggle('tc-prompt-composer__send-btn--active', canSend);
        btn.classList.toggle('tc-prompt-composer__send-btn--stop', running);
        btn.classList.toggle('tc-prompt-composer__send-btn--attach-pending', !running && attachParsing);
        if (running) {
            btn.title = '停止编辑';
            btn.setAttribute('aria-label', '停止编辑');
        } else if (attachParsing) {
            btn.title = '附件解析中，请稍候';
            btn.setAttribute('aria-label', '附件解析中，请稍候');
        } else {
            btn.title = '发送编辑指令';
            btn.setAttribute('aria-label', '发送编辑指令');
        }
    }

    function isEditSendBlocked() {
        var lock = global.TcLeftPanelLock;
        if (!lock) return false;
        if (lock.isAiGenerateLocked && lock.isAiGenerateLocked()) return true;
        if (lock.isQualityCheckBusy && lock.isQualityCheckBusy()) return true;
        return false;
    }

    function onEditSendClick() {
        var btn = $('tc-edit-send-btn');
        if (!global.isTcWorkbenchEditMode || !global.isTcWorkbenchEditMode()) return;
        if (global.TcAiSmartEdit && typeof global.TcAiSmartEdit.isRunning === 'function' &&
            global.TcAiSmartEdit.isRunning()) {
            if (typeof global.triggerTcEditSend === 'function') global.triggerTcEditSend();
            return;
        }
        if (btn && btn.disabled) return;
        if (isEditAttachmentParsePending()) {
            if (typeof global.tcAppToast === 'function') {
                global.tcAppToast('附件解析中，请稍后再发送', { variant: 'warning', duration: 2800 });
            }
            return;
        }
        if (isEditSendBlocked()) {
            if (typeof global.tcAppToast === 'function') {
                global.tcAppToast('生成或质量检查进行中，请稍后再试', { variant: 'warning', duration: 2800 });
            }
            return;
        }
        if (typeof global.triggerTcEditSend === 'function') {
            global.triggerTcEditSend();
        }
    }

    function initTcEditPromptInput() {
        var el = $('ai-edit-prompt');
        if (!el || el.dataset.tcEditPromptBound === '1') return;
        el.dataset.tcEditPromptBound = '1';
        el._tcPromptScrollLocked = false;
        resizeTcEditPromptInput(el);
        el.addEventListener('input', function () {
            resizeTcEditPromptInput(this);
            syncTcEditSendBtnState();
        });
        el.addEventListener('change', syncTcEditSendBtnState);
        el.addEventListener('paste', function () {
            var self = this;
            global.setTimeout(function () {
                resizeTcEditPromptInput(self);
                syncTcEditSendBtnState();
            }, 0);
        });
        el.addEventListener('compositionend', function () {
            resizeTcEditPromptInput(this);
            syncTcEditSendBtnState();
        });
        el.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
            if (e.isComposing) return;
            if (typeof global.tcAppDialogIsOpen === 'function' && global.tcAppDialogIsOpen()) return;
            if (!global.isTcWorkbenchEditMode || !global.isTcWorkbenchEditMode()) return;
            if (isEditSendBlocked()) return;
            if (isEditAttachmentParsePending()) return;
            e.preventDefault();
            onEditSendClick();
        });
    }

    function initTcEditSendBtn() {
        var btn = $('tc-edit-send-btn');
        if (!btn || btn.dataset.tcEditSendBound === '1') return;
        btn.dataset.tcEditSendBound = '1';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            onEditSendClick();
        });
    }

    function initTcEditComposer() {
        if (!document.getElementById('tc-edit-send-btn')) return;
        initTcEditPromptInput();
        initTcEditSendBtn();
        syncTcEditSendBtnState();
    }

    global.resizeTcEditPromptInput = resizeTcEditPromptInput;
    global.syncTcEditSendBtnState = syncTcEditSendBtnState;
    global.initTcEditComposer = initTcEditComposer;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTcEditComposer);
    } else {
        initTcEditComposer();
    }
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_workbench_mode.js ---- */
/**
 * 工作台左栏：仅保留智能编辑模式（智能生成已移除）
 */
(function (global) {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function notifyPlanContextChange() {
        global.setTimeout(function () {
            if (global.TcWorkbenchSession &&
                typeof global.TcWorkbenchSession.syncPlanContextFromWorkbench === 'function') {
                global.TcWorkbenchSession.syncPlanContextFromWorkbench();
            }
        }, 0);
    }

    function getCurrentMode() {
        return 'edit';
    }

    function isEditMode() {
        return true;
    }

    function syncTabChrome() {
        var editPanel = $('drawer-edit-content');
        if (editPanel) {
            editPanel.classList.remove('hidden');
            editPanel.setAttribute('aria-hidden', 'false');
        }

        if (document.body) {
            document.body.classList.add('tc-workbench-mode-edit');
            document.body.classList.remove('tc-workbench-mode-single');
        }

        var leftWrap = $('left-content-wrapper');
        if (leftWrap) leftWrap.setAttribute('data-active-gen-mode', 'edit');

        var title = document.querySelector('.tc-left-float-panel__title');
        if (title) title.textContent = '智能编辑';

        if (typeof global.initTcEditComposer === 'function') {
            global.initTcEditComposer();
        }
        if (global.TcEditAttachments && typeof global.TcEditAttachments.refreshOnPanelOpen === 'function') {
            global.TcEditAttachments.refreshOnPanelOpen();
        }
        if (typeof global.syncTcEditSendBtnState === 'function') {
            global.syncTcEditSendBtnState();
        }
        if (typeof global.tcLeftFloatRefreshContentHeights === 'function') {
            global.tcLeftFloatRefreshContentHeights();
        }
    }

    function switchTcWorkbenchMode(mode) {
        if (mode !== 'edit') return;
        syncTabChrome();
        notifyPlanContextChange();
    }

    function initTcWorkbenchMode() {
        syncTabChrome();
        notifyPlanContextChange();
    }

    global.switchTcWorkbenchMode = switchTcWorkbenchMode;
    global.getTcWorkbenchMode = getCurrentMode;
    global.isTcWorkbenchEditMode = isEditMode;
    global.initTcWorkbenchMode = initTcWorkbenchMode;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTcWorkbenchMode);
    } else {
        initTcWorkbenchMode();
    }
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_ai_smart_edit.js ---- */
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

