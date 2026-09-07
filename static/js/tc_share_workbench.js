/**
 * 用例工作台 · 协作评审（分享快照 + 我的分享）
 * 分享当前工作台表格进行评审。
 */
(function (global) {
    'use strict';

    var shareDraftPayload = null;
    var _inited = false;
    var SHARE_LIST_PAGE_SIZE = 10;
    var COMMENTS_PAGE_SIZE = 10;
    var SHARE_MAX_PER_USER = 5;
    var SHARE_LIMIT_MSG = '您已创建 ' + SHARE_MAX_PER_USER + ' 条评审分享（已达上限），请先在「我的分享」中删除不需要的评审后再创建。';
        var shareListAll = [];
    var shareListPage = 1;
    var commentsAll = [];
    var commentsPage = 1;
    var commentsSnapshotColumns = [];
    var commentsSnapshotRows = [];

    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toast(msg, opts) {
        if (typeof global.tcAppToast === 'function') {
            global.tcAppToast(msg, opts || { variant: 'info', duration: 3200 });
        }
    }

    function alertBox(msg, opts) {
        if (typeof global.tcAppAlert === 'function') {
            global.tcAppAlert(msg, opts || { variant: 'warning', title: '提示' });
        } else {
            global.alert(msg);
        }
    }

    function fetchJson(url, opts) {
        opts = opts || {};
        opts.credentials = 'same-origin';
        if (opts.body && !(opts.headers && opts.headers['Content-Type'])) {
            opts.headers = opts.headers || {};
            opts.headers['Content-Type'] = 'application/json';
        }
        return fetch(url, opts).then(function (r) {
            return r.json().then(function (d) {
                if (r.status === 401) throw new Error('请先登录');
                if (!r.ok) throw new Error((d && d.error) || ('请求失败 HTTP ' + r.status));
                return d;
            });
        });
    }

    function ensureLoggedIn() {
        if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === 'function') {
            return global.HfAuthNav.fetchMe().then(function (data) {
                if (data && data.authenticated && data.user) return data;
                throw new Error('AUTH_REQUIRED');
            });
        }
        return fetchJson('/api/auth/me').then(function (data) {
            if (data && data.authenticated && data.user) return data;
            throw new Error('AUTH_REQUIRED');
        });
    }

    function redirectToLoginPage() {
        var next = global.location.pathname + global.location.search;
        if (global.HfAuthNav && typeof global.HfAuthNav.loginUrl === 'function') {
            global.location.href = global.HfAuthNav.loginUrl(next);
            return;
        }
        global.location.href = '/auth?next=' + encodeURIComponent(next);
    }

    function onAuthRequired(err) {
        if (err && err.message === 'AUTH_REQUIRED') {
            redirectToLoginPage();
            return true;
        }
        return false;
    }

    
    function resolveSharePayload() {
        var live = null;
        if (typeof global.tcCollectLiveSharePayload === 'function') {
            live = global.tcCollectLiveSharePayload();
        }
        if (hasShareablePayload(live)) return live;
        if (typeof global.tcBuildDefaultSharePayload === 'function') {
            var fallback = global.tcBuildDefaultSharePayload();
            if (hasShareablePayload(fallback)) return fallback;
        }
        return null;
    }

    function clearShareDraftPayload() {
        shareDraftPayload = null;
    }

    function closeUnifiedReviewModal() {
        clearShareDraftPayload();
        var modal = $('tc-share-requirement-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.classList.remove('tc-share-review-modal--settings-only');
            modal.setAttribute('aria-hidden', 'true');
        }
        if (!document.querySelector('.tc-share-modal.flex')) {
            document.body.style.overflow = '';
        }
    }

    function closeCreateModal() {
        closeUnifiedReviewModal();
    }

    function hasShareablePayload(payload) {
        return !!(payload && payload.columns && payload.columns.length);
    }

    function hasTableData(payload) {
        if (!hasShareablePayload(payload)) return false;
        var rows = payload.rows || [];
        return rows.some(function (row) {
            return (row || []).some(function (cell) {
                return String(cell != null ? cell : '').trim() !== '';
            });
        });
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    function buildSharePublicUrl(token) {
        var t = String(token == null ? '' : token).trim();
        if (!t) return '';
        return global.location.origin + '/share/tc/' + encodeURIComponent(t);
    }

    function mountShareModalsToBody() {
        ['tc-share-list-modal', 'tc-share-comments-modal', 'tc-share-requirement-modal'].forEach(function (id) {
            var el = $(id);
            if (el && el.parentElement !== document.body) {
                document.body.appendChild(el);
            }
        });
    }

    function openModal(id) {
        mountShareModalsToBody();
        var el = $(id);
        if (!el) return;
        el.classList.remove('hidden');
        el.classList.add('flex');
        el.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(id) {
        var el = $(id);
        if (!el) return;
        el.classList.add('hidden');
        el.classList.remove('flex');
        el.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.tc-share-modal.flex')) {
            document.body.style.overflow = '';
        }
    }

    function isShareLimitReached(data) {
        if (!data) return false;
        if (typeof data.limit_reached === 'boolean') return data.limit_reached;
        var count = typeof data.count === 'number' ? data.count : ((data.items || []).length);
        var limit = typeof data.limit === 'number' ? data.limit : SHARE_MAX_PER_USER;
        return count >= limit;
    }

    function alertShareLimitReached() {
        alertBox(SHARE_LIMIT_MSG, {
            title: '无法分享',
            hint: '打开「我的分享」删除不需要的评审后，即可继续创建新的分享。'
        });
    }

    function ensureShareQuotaAvailable() {
        return fetchJson('/api/test-cases/shares').then(function (data) {
            if (isShareLimitReached(data)) {
                alertShareLimitReached();
                return false;
            }
            return true;
        });
    }

    function prepareSharePayload(payload) {
        if (!payload) return null;
        try {
            var cloned = JSON.parse(JSON.stringify(payload));
            if (typeof global.tcEnrichSharePayloadTemplate === 'function') {
                return global.tcEnrichSharePayloadTemplate(cloned);
            }
            if (typeof global.tcEnrichStashPayloadTemplate === 'function') {
                return global.tcEnrichStashPayloadTemplate(cloned);
            }
            return cloned;
        } catch (e) {
            return payload;
        }
    }

    function updateShareButtons() {
        var createBtn = $('tc-share-create-btn');
        if (!createBtn) return;
        if (typeof global.tcRightViewMode !== 'undefined' && global.tcRightViewMode === 'mindmap' &&
            typeof global.tcExportFabMindmapReviewItemsEnabled === 'function') {
            var mindmapOk = global.tcExportFabMindmapReviewItemsEnabled();
            createBtn.disabled = !mindmapOk;
            createBtn.title = mindmapOk
                ? '分享当前需求文档进行评审'
                : '当前需求文档下暂无任何需求页用例（表格或思维导图）';
            return;
        }
        var blockReason = typeof global.getTcShareBlockReason === 'function'
            ? global.getTcShareBlockReason()
            : '';
        createBtn.disabled = !!blockReason;
        createBtn.title = blockReason || '分享当前表格进行评审';
    }

    function openCreateModal(opts) {
        opts = opts || {};
        ensureLoggedIn().then(function () {
            return ensureShareQuotaAvailable();
        }).then(function (allowed) {
            if (!allowed) return;
            shareDraftPayload = opts.payload
                ? prepareSharePayload(opts.payload)
                : resolveSharePayload();
            if (!hasShareablePayload(shareDraftPayload)) {
                clearShareDraftPayload();
                alertBox('当前没有可分享的表格数据，请先选择模板并填写用例。', { title: '无法分享' });
                return;
            }
            if (typeof global.tcOpenShareReviewModal === 'function') {
                global.tcOpenShareReviewModal({
                    settingsOnly: !!opts.payload,
                    title: opts.title || ''
                });
                return;
            }
            if (typeof global.tcOpenShareRequirementPicker === 'function') {
                global.tcOpenShareRequirementPicker();
            }
        }).catch(function (err) {
            if (onAuthRequired(err)) return;
            alertBox(err.message || '请稍后重试', { title: '无法打开' });
        });
    }

    function postShareReviewCreate(payload, btn, enrichOpts) {
        var titleEl = $('tc-share-create-title');
        var expiresEl = $('tc-share-create-expires');
        var commentsEl = $('tc-share-create-comments');
        var prepared = prepareSharePayload(payload);
        if (global.TcShareMindmapPreviewMeta && typeof global.TcShareMindmapPreviewMeta.enrichPayload === 'function') {
            prepared = global.TcShareMindmapPreviewMeta.enrichPayload(prepared, enrichOpts || {});
        }
        if (!hasShareablePayload(prepared)) {
            alertBox('当前没有可分享的表格数据，请先选择模板并填写用例。', { title: '无法分享' });
            return Promise.resolve();
        }
        if (btn) btn.disabled = true;
        return fetchJson('/api/test-cases/shares', {
            method: 'POST',
            body: JSON.stringify({
                title: titleEl ? titleEl.value : '',
                expires_days: expiresEl ? parseInt(expiresEl.value, 10) : 30,
                comment_enabled: commentsEl ? !!commentsEl.checked : true,
                payload: prepared
            })
        }).then(function (data) {
            clearShareDraftPayload();
            closeUnifiedReviewModal();
            var token = data.share && data.share.token;
            var url = buildSharePublicUrl(token);
            if (!url && data.url) {
                try {
                    var parsed = new URL(data.url, global.location.origin);
                    url = global.location.origin + parsed.pathname + parsed.search;
                } catch (e) {
                    url = data.url;
                }
            }
            return copyText(url).then(function () {
                toast('分享链接已创建并复制到剪贴板', { variant: 'success', duration: 4200 });
            });
        }).catch(function (err) {
            alertBox(err.message || '创建失败', { title: '分享失败' });
        }).finally(function () {
            if (btn) btn.disabled = false;
        });
    }

    function submitCreate() {
        var btn = $('tc-share-requirement-submit') || $('tc-share-create-submit');
        return postShareReviewCreate(shareDraftPayload || resolveSharePayload(), btn);
    }

    function submitUnifiedReview(opts) {
        opts = opts || {};
        var btn = $('tc-share-requirement-submit');
        var payload = opts.payload || shareDraftPayload || resolveSharePayload();
        if (opts.suggestedTitle) {
            var titleEl = $('tc-share-create-title');
            if (titleEl && !String(titleEl.value || '').trim()) {
                titleEl.value = opts.suggestedTitle;
            }
        }
        return postShareReviewCreate(payload, btn, {
            pageMetaList: opts.pageMetaList || null
        });
    }

    function formatTime(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleString('zh-CN', { hour12: false });
        } catch (e) {
            return String(iso);
        }
    }

    function findCaseNameColIndex(columns) {
        var cols = columns || [];
        var exact = ['用例名称', '用例名', '用例标题', '用例摘要', '标题'];
        for (var i = 0; i < cols.length; i++) {
            var c = String(cols[i] == null ? '' : cols[i]).trim();
            for (var j = 0; j < exact.length; j++) {
                if (c === exact[j]) return i;
            }
        }
        for (var k = 0; k < cols.length; k++) {
            var col = String(cols[k] == null ? '' : cols[k]).trim();
            if (col.indexOf('用例名称') >= 0 || col.indexOf('用例名') >= 0 || col.indexOf('标题') >= 0) {
                return k;
            }
        }
        return 0;
    }

    function resolveCommentRowLabel(rowIndex, columns, rows) {
        if (rowIndex == null) return '全局';
        var idx = parseInt(rowIndex, 10);
        if (isNaN(idx) || idx < 0) return '全局';
        var nameCol = findCaseNameColIndex(columns);
        var row = rows && rows[idx];
        if (row && row[nameCol] != null) {
            var name = String(row[nameCol]).trim();
            if (name) return name;
        }
        return '第 ' + (idx + 1) + ' 行';
    }

    function totalPages(total, pageSize) {
        return Math.max(1, Math.ceil(total / pageSize));
    }

    function buildPagerHtml(page, total, pageSize, scope) {
        var tp = totalPages(total, pageSize);
        if (tp <= 1 || total === 0) return '';
        return '<div class="tc-share-pager" data-pager-scope="' + esc(scope) + '">' +
            '<button type="button" class="tc-share-pager__btn" data-tc-share-pager="' + esc(scope) + '" data-action="prev"' +
            (page <= 1 ? ' disabled' : '') + '>上一页</button>' +
            '<span class="tc-share-pager__info">第 ' + page + ' / ' + tp + ' 页，共 ' + total + ' 条</span>' +
            '<button type="button" class="tc-share-pager__btn" data-tc-share-pager="' + esc(scope) + '" data-action="next"' +
            (page >= tp ? ' disabled' : '') + '>下一页</button>' +
            '</div>';
    }

    function renderShareList(items, page) {
        shareListAll = items || [];
        if (page != null) shareListPage = page;
        var tp = totalPages(shareListAll.length, SHARE_LIST_PAGE_SIZE);
        if (shareListPage > tp) shareListPage = tp;
        var body = $('tc-share-list-body');
        if (!body) return;
        if (!shareListAll.length) {
            body.innerHTML = '<p class="text-slate-500">暂无分享记录</p>';
            return;
        }
        var start = (shareListPage - 1) * SHARE_LIST_PAGE_SIZE;
        var slice = shareListAll.slice(start, start + SHARE_LIST_PAGE_SIZE);
        var listHtml = slice.map(function (item) {
            var statusBadge = item.active
                ? '<span class="tc-share-list-item__badge tc-share-list-item__badge--active">有效</span>'
                : '<span class="tc-share-list-item__badge tc-share-list-item__badge--gone">' + (item.revoked ? '已作废' : '已过期') + '</span>';
            var url = buildSharePublicUrl(item.token);
            return '<div class="tc-share-list-item" data-share-id="' + esc(item.id) + '" data-share-url="' + esc(url) + '">' +
                '<div class="min-w-0 flex-1">' +
                '<div class="tc-share-list-item__title">' + esc(item.title) + ' ' + statusBadge + '</div>' +
                '<div class="tc-share-list-item__meta">' +
                esc(formatTime(item.created_at)) + ' · 评论 ' + (item.comment_count || 0) +
                (item.expires_at ? (' · 至 ' + esc(formatTime(item.expires_at))) : '') +
                '</div></div>' +
                '<div class="tc-share-list-item__actions">' +
                '<button type="button" class="btn btn-secondary btn-sm tc-share-copy-btn">复制链接</button>' +
                '<button type="button" class="btn btn-secondary btn-sm tc-share-view-comments-btn" data-id="' + esc(item.id) + '" data-title="' + esc(item.title) + '">查看评论</button>' +
                (item.active ? '<button type="button" class="btn btn-secondary btn-sm tc-share-revoke-btn" data-id="' + esc(item.id) + '">作废</button>' : '') +
                '<button type="button" class="btn btn-secondary btn-sm tc-share-delete-btn" data-id="' + esc(item.id) + '">删除</button>' +
                '</div></div>';
        }).join('');
        body.innerHTML = listHtml + buildPagerHtml(shareListPage, shareListAll.length, SHARE_LIST_PAGE_SIZE, 'list');
    }

    function loadShareList() {
        var body = $('tc-share-list-body');
        if (body) body.innerHTML = '<p class="text-slate-500">加载中…</p>';
        return fetchJson('/api/test-cases/shares').then(function (data) {
            renderShareList((data && data.items) || [], 1);
        }).catch(function (err) {
            if (body) body.innerHTML = '<p class="text-red-600">' + esc(err.message || '加载失败') + '</p>';
        });
    }

    function openMySharesModal() {
        ensureLoggedIn().then(function () {
            openModal('tc-share-list-modal');
            loadShareList();
        }).catch(function (err) {
            if (onAuthRequired(err)) return;
            alertBox(err.message || '请稍后重试', { title: '无法打开' });
        });
    }

    function renderCommentsBody() {
        var body = $('tc-share-comments-body');
        if (!body) return;
        var tp = totalPages(commentsAll.length, COMMENTS_PAGE_SIZE);
        if (commentsPage > tp) commentsPage = tp;
        if (!commentsAll.length) {
            body.innerHTML = '<p class="text-slate-500">暂无评论</p>';
            return;
        }
        var start = (commentsPage - 1) * COMMENTS_PAGE_SIZE;
        var slice = commentsAll.slice(start, start + COMMENTS_PAGE_SIZE);
        var listHtml = slice.map(function (c) {
            var rowLabel = resolveCommentRowLabel(
                c.row_index,
                commentsSnapshotColumns,
                commentsSnapshotRows
            );
            return '<article class="tc-share-comment-item">' +
                '<div class="tc-share-comment-item__head">' +
                '<span class="tc-share-comment-item__author">' + esc(c.author_name) + '</span>' +
                '<span class="tc-share-comment-item__case">' + esc(rowLabel) + '</span>' +
                '<span class="tc-share-comment-item__meta">' + esc(formatTime(c.created_at)) + '</span>' +
                '</div>' +
                '<div class="tc-share-comment-item__body">' + esc(c.content) + '</div>' +
                '</article>';
        }).join('');
        body.innerHTML = listHtml + buildPagerHtml(commentsPage, commentsAll.length, COMMENTS_PAGE_SIZE, 'comments');
    }

    function openCommentsModal(shareId, title) {
        var body = $('tc-share-comments-body');
        var titleEl = $('tc-share-comments-modal-title');
        if (titleEl) titleEl.textContent = '评论 · ' + (title || '');
        commentsAll = [];
        commentsPage = 1;
        commentsSnapshotColumns = [];
        commentsSnapshotRows = [];
        openModal('tc-share-comments-modal');
        if (body) body.innerHTML = '<p class="text-slate-500">加载中…</p>';
        fetchJson('/api/test-cases/shares/' + encodeURIComponent(shareId) + '/comments')
            .then(function (data) {
                commentsAll = (data && data.comments) || [];
                commentsSnapshotColumns = (data && data.columns) || [];
                commentsSnapshotRows = (data && data.rows) || [];
                renderCommentsBody();
            })
            .catch(function (err) {
                if (body) body.innerHTML = '<p class="text-red-600">' + esc(err.message) + '</p>';
            });
    }

    function openShareCreateFlow() {
        ensureLoggedIn().then(function () {
            return ensureShareQuotaAvailable();
        }).then(function (allowed) {
            if (!allowed) return;
            if (typeof global.tcOpenShareReviewModal === 'function') {
                global.tcOpenShareReviewModal();
                return;
            }
            if (typeof global.tcOpenShareRequirementPicker === 'function') {
                global.tcOpenShareRequirementPicker();
                return;
            }
            if (typeof global.getTcShareBlockReason === 'function') {
                var blockReason = global.getTcShareBlockReason();
                if (blockReason) {
                    alertBox(blockReason, { title: '无法分享' });
                    return;
                }
            }
            openCreateModal({});
        }).catch(function (err) {
            if (onAuthRequired(err)) return;
            alertBox(err.message || '请稍后重试', { title: '无法打开' });
        });
    }

    function openShareFromSelection() {
        openShareCreateFlow();
    }

    function bindShareDelegation() {
        if (global._tcShareWorkbenchDelegate) return;
        global._tcShareWorkbenchDelegate = true;

        document.addEventListener('click', function (ev) {
            if (typeof global.isTcHubExcelTabActive === 'function' && global.isTcHubExcelTabActive()) return;

            var target = ev.target;
            if (!target || !target.closest) return;

            if (target.closest('#tc-share-create-btn')) {
                ev.preventDefault();
                ev.stopPropagation();
                openShareCreateFlow();
                return;
            }

            if (target.closest('#tc-share-list-open-btn')) {
                ev.preventDefault();
                ev.stopPropagation();
                openMySharesModal();
                return;
            }

            if (target.closest('#tc-share-requirement-cancel')) {
                ev.preventDefault();
                closeCreateModal();
                return;
            }

            if (target.closest('#tc-share-list-close')) {
                ev.preventDefault();
                closeModal('tc-share-list-modal');
                return;
            }

            if (target.closest('#tc-share-comments-close')) {
                ev.preventDefault();
                closeModal('tc-share-comments-modal');
                return;
            }

            var copyBtn = target.closest('.tc-share-copy-btn');
            if (copyBtn) {
                ev.preventDefault();
                var row = copyBtn.closest('.tc-share-list-item');
                var url = row && row.getAttribute('data-share-url');
                if (url) {
                    copyText(url).then(function () {
                        toast('链接已复制', { variant: 'success', duration: 2400 });
                    });
                }
                return;
            }

            var revokeBtn = target.closest('.tc-share-revoke-btn');
            if (revokeBtn) {
                ev.preventDefault();
                var rid = revokeBtn.getAttribute('data-id');
                if (!rid) return;
                var revokeMsg = '确定作废该分享链接？作废后评审人将无法访问。';
                var doRevoke = function () {
                    fetchJson('/api/test-cases/shares/' + encodeURIComponent(rid), { method: 'DELETE' })
                        .then(function () {
                            toast('已作废', { variant: 'info', duration: 2600 });
                            loadShareList();
                            updateShareButtons();
                        })
                        .catch(function (err) {
                            alertBox(err.message || '作废失败', { title: '操作失败' });
                        });
                };
                if (typeof global.tcAppConfirm === 'function') {
                    global.tcAppConfirm(revokeMsg, { title: '作废分享', variant: 'warning' }).then(function (ok) {
                        if (ok) doRevoke();
                    });
                } else if (global.confirm(revokeMsg)) {
                    doRevoke();
                }
                return;
            }

            var deleteBtn = target.closest('.tc-share-delete-btn');
            if (deleteBtn) {
                ev.preventDefault();
                var did = deleteBtn.getAttribute('data-id');
                if (!did) return;
                var deleteMsg = '确定删除该评审分享？删除后链接将失效，且不再占用创建名额（最多5条）。';
                var doDelete = function () {
                    fetchJson('/api/test-cases/shares/' + encodeURIComponent(did) + '?purge=1', { method: 'DELETE' })
                        .then(function () {
                            toast('已删除', { variant: 'info', duration: 2600 });
                            loadShareList();
                            updateShareButtons();
                        })
                        .catch(function (err) {
                            alertBox(err.message || '删除失败', { title: '操作失败' });
                        });
                };
                if (typeof global.tcAppConfirm === 'function') {
                    global.tcAppConfirm(deleteMsg, { title: '删除分享', variant: 'warning' }).then(function (ok) {
                        if (ok) doDelete();
                    });
                } else if (global.confirm(deleteMsg)) {
                    doDelete();
                }
                return;
            }

            var viewCommentsBtn = target.closest('.tc-share-view-comments-btn');
            if (viewCommentsBtn) {
                ev.preventDefault();
                openCommentsModal(viewCommentsBtn.getAttribute('data-id'), viewCommentsBtn.getAttribute('data-title'));
                return;
            }

            var pagerBtn = target.closest('[data-tc-share-pager]');
            if (pagerBtn && !pagerBtn.disabled) {
                ev.preventDefault();
                var scope = pagerBtn.getAttribute('data-tc-share-pager');
                var action = pagerBtn.getAttribute('data-action');
                if (scope === 'list') {
                    var listTp = totalPages(shareListAll.length, SHARE_LIST_PAGE_SIZE);
                    if (action === 'prev' && shareListPage > 1) shareListPage -= 1;
                    else if (action === 'next' && shareListPage < listTp) shareListPage += 1;
                    else return;
                    renderShareList(shareListAll, shareListPage);
                } else if (scope === 'comments') {
                    var commentsTp = totalPages(commentsAll.length, COMMENTS_PAGE_SIZE);
                    if (action === 'prev' && commentsPage > 1) commentsPage -= 1;
                    else if (action === 'next' && commentsPage < commentsTp) commentsPage += 1;
                    else return;
                    renderCommentsBody();
                }
                return;
            }

            if (ev.target && ev.target.id === 'tc-share-requirement-modal') {
                closeCreateModal();
                return;
            }
            ['tc-share-list-modal', 'tc-share-comments-modal'].forEach(function (id) {
                var modal = $(id);
                if (modal && ev.target === modal) closeModal(id);
            });
        }, true);
    }


    function hookShareButtonRefresh() {
        if (typeof global.syncTcTableTemplateChrome === 'function' && !global.syncTcTableTemplateChrome._tcShareHooked) {
            var origSync = global.syncTcTableTemplateChrome;
            global.syncTcTableTemplateChrome = function () {
                var result = origSync.apply(this, arguments);
                updateShareButtons();
                return result;
            };
            global.syncTcTableTemplateChrome._tcShareHooked = true;
        }
    }

    function init() {
        if (_inited) return;
        _inited = true;
        mountShareModalsToBody();
        bindShareDelegation();
        hookShareButtonRefresh();
        updateShareButtons();
        global.setTimeout(mountShareModalsToBody, 500);
        global.setTimeout(updateShareButtons, 800);
    }

    global.TcShareWorkbench = {
        init: init,
        openCreateModal: openCreateModal,
        openMySharesModal: openMySharesModal,
        openShareCreateFlow: openShareCreateFlow,
        openShareFromSelection: openShareFromSelection,
        updateShareButtons: updateShareButtons,
        submitUnifiedReview: submitUnifiedReview,
        closeUnifiedReviewModal: closeUnifiedReviewModal
    };

    init();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    }
})(typeof window !== 'undefined' ? window : this);
