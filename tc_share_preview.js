/**
 * 用例分享评审页：只读表格 + 评论（独立模块，不依赖工作台内联脚本）
 */
(function (global) {
    'use strict';

    var state = {
        token: '',
        snapshot: null,
        comments: [],
        targetRowIndex: null
    };

    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fetchJson(url, opts) {
        opts = opts || {};
        return fetch(url, opts).then(function (r) {
            return r.json().then(function (d) {
                if (r.status === 410) {
                    var err = new Error((d && d.error) || '链接已失效');
                    err.code = 'SHARE_GONE';
                    throw err;
                }
                if (!r.ok) throw new Error((d && d.error) || ('请求失败 HTTP ' + r.status));
                return d;
            });
        });
    }

    function formatTime(iso) {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleString('zh-CN', { hour12: false });
        } catch (e) {
            return String(iso);
        }
    }

    function commentsByRow() {
        var map = {};
        state.comments.forEach(function (c) {
            var key = c.row_index == null ? '__global__' : String(c.row_index);
            if (!map[key]) map[key] = [];
            map[key].push(c);
        });
        return map;
    }

    function renderTable() {
        var wrap = $('tc-share-preview-table-wrap');
        var snap = state.snapshot;
        if (!wrap || !snap) return;
        var cols = snap.columns || [];
        var rows = snap.rows || [];
        if (!cols.length) {
            wrap.innerHTML = '<p class="text-slate-500">暂无表格数据</p>';
            return;
        }
        var byRow = commentsByRow();
        var thead = '<thead><tr>' + cols.map(function (c) {
            return '<th>' + esc(c) + '</th>';
        }).join('') + (snap.comment_enabled ? '<th class="tc-share-preview-table__row-actions">评审</th>' : '') + '</tr></thead>';
        var tbody = '<tbody>' + rows.map(function (row, idx) {
            var hasComments = !!(byRow[String(idx)] && byRow[String(idx)].length);
            var cells = cols.map(function (_, ci) {
                return '<td>' + esc(row[ci] != null ? row[ci] : '') + '</td>';
            }).join('');
            var action = '';
            if (snap.comment_enabled) {
                action = '<td class="tc-share-preview-table__row-actions">' +
                    '<button type="button" class="tc-share-preview-table__comment-btn" data-row-index="' + idx + '">对此行评论</button>' +
                    '</td>';
            }
            return '<tr data-row-index="' + idx + '" data-has-comments="' + (hasComments ? '1' : '0') + '">' + cells + action + '</tr>';
        }).join('') + '</tbody>';
        wrap.innerHTML = '<table class="tc-share-preview-table">' + thead + tbody + '</table>';
        wrap.querySelectorAll('.tc-share-preview-table__comment-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setRowCommentTarget(parseInt(btn.getAttribute('data-row-index'), 10));
            });
        });
    }

    function renderComments() {
        var list = $('tc-share-comments-list');
        if (!list) return;
        if (!state.comments.length) {
            list.innerHTML = '<p class="text-slate-400 text-sm">暂无评论</p>';
            return;
        }
        list.innerHTML = state.comments.map(function (c) {
            var rowLabel = c.row_index == null ? '全局' : ('第 ' + (c.row_index + 1) + ' 行');
            return '<article class="tc-share-preview__comment-item">' +
                '<div class="tc-share-preview__comment-item__head">' +
                '<span class="tc-share-preview__comment-item__author">' + esc(c.author_name) + '</span>' +
                '<span>' + esc(rowLabel) + '</span>' +
                '<span>' + esc(formatTime(c.created_at)) + '</span>' +
                '</div>' +
                '<div class="tc-share-preview__comment-item__body">' + esc(c.content) + '</div>' +
                '</article>';
        }).join('');
        renderTable();
    }

    function setRowCommentTarget(rowIndex) {
        state.targetRowIndex = rowIndex;
        var form = $('tc-share-comment-form');
        var label = form && form.querySelector('.tc-share-preview__comment-form-label');
        if (form) form.classList.add('tc-share-preview__comment-form--row');
        if (label) label.textContent = '第 ' + (rowIndex + 1) + ' 行';
        var ta = $('tc-share-comment-content');
        if (ta) {
            ta.focus();
            ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function clearRowCommentTarget() {
        state.targetRowIndex = null;
        var form = $('tc-share-comment-form');
        var label = form && form.querySelector('.tc-share-preview__comment-form-label');
        if (form) form.classList.remove('tc-share-preview__comment-form--row');
        if (label) label.textContent = '全局评论';
    }

    function loadComments() {
        return fetchJson('/api/test-cases/shares/by-token/' + encodeURIComponent(state.token) + '/comments')
            .then(function (data) {
                state.comments = (data && data.comments) || [];
                renderComments();
            });
    }

    function showError(msg) {
        var status = $('tc-share-preview-status');
        var main = $('tc-share-preview-main');
        if (status) {
            status.textContent = msg;
            status.classList.add('tc-share-preview__status--error');
        }
        if (main) main.classList.add('hidden');
    }

    function initPage() {
        var root = document.querySelector('.tc-share-preview');
        if (!root) return;
        state.token = root.getAttribute('data-share-token') || '';
        if (!state.token) {
            showError('无效的分享链接');
            return;
        }

        fetchJson('/api/test-cases/shares/by-token/' + encodeURIComponent(state.token))
            .then(function (data) {
                state.snapshot = data.snapshot;
                var snap = state.snapshot;
                var status = $('tc-share-preview-status');
                var main = $('tc-share-preview-main');
                if (status) status.classList.add('hidden');
                if (main) main.classList.remove('hidden');
                var title = $('tc-share-preview-title');
                var meta = $('tc-share-preview-meta');
                if (title) title.textContent = snap.title || '用例评审';
                if (meta) {
                    var parts = [];
                    if (snap.template_name) parts.push('模板 ' + snap.template_name);
                    else if (snap.template_id) parts.push('模板 ' + snap.template_id);
                    if (snap.expires_at) parts.push('有效期至 ' + formatTime(snap.expires_at));
                    parts.push((snap.rows || []).length + ' 行');
                    meta.textContent = parts.join(' · ');
                }
                var section = $('tc-share-comments-section');
                if (section && !snap.comment_enabled) {
                    section.classList.add('hidden');
                }
                renderTable();
                return loadComments();
            })
            .catch(function (err) {
                showError(err.message || '无法加载分享内容');
            });

        var form = $('tc-share-comment-form');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                if (!state.snapshot || !state.snapshot.comment_enabled) return;
                var nameEl = $('tc-share-comment-name');
                var contentEl = $('tc-share-comment-content');
                var body = {
                    author_name: nameEl ? nameEl.value : '',
                    content: contentEl ? contentEl.value : ''
                };
                if (state.targetRowIndex != null) body.row_index = state.targetRowIndex;
                fetchJson('/api/test-cases/shares/by-token/' + encodeURIComponent(state.token) + '/comments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(body)
                }).then(function (data) {
                    if (data && data.comment) state.comments.push(data.comment);
                    if (contentEl) contentEl.value = '';
                    clearRowCommentTarget();
                    renderComments();
                }).catch(function (err) {
                    alert(err.message || '提交失败');
                });
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPage);
    } else {
        initPage();
    }
})(typeof window !== 'undefined' ? window : this);
