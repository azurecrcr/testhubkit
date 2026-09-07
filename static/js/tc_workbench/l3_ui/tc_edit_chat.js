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
