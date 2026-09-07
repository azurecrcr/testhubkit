/**
 * 用例分享评审页：只读表格（Tabulator）+ 评论
 * 表格列隐藏/列宽/行高布局见 tc_share_preview_table_layout.js（与工作台独立）
 */
(function (global) {
    'use strict';

    var layoutApi = global.TcSharePreviewTableLayout;

    var state = {
        token: '',
        snapshot: null,
        comments: [],
        targetRowIndex: null
    };

    var tabulator = null;
    var tableResizeTimer = null;
    var tableResizeObserver = null;
    var sharePreviewSmmHandle = null;

    function $(id) { return document.getElementById(id); }
    function isMindmapReviewSnapshot(snap) {
        return !!(snap && String(snap.scope || '').trim() === 'mindmap');
    }

    function destroySharePreviewSmmCanvas() {
        if (global.TcSharePreviewSmmCanvas && typeof global.TcSharePreviewSmmCanvas.destroy === 'function') {
            global.TcSharePreviewSmmCanvas.destroy();
        }
        sharePreviewSmmHandle = null;
    }

    function renderSharePreviewSmmCanvas() {
        var wrap = $('tc-share-preview-mindmap-wrap');
        var tableWrap = $('tc-share-preview-table-wrap');
        var snap = state.snapshot;
        if (tableWrap) tableWrap.classList.add('hidden');
        if (wrap) wrap.classList.remove('hidden');
        if (!wrap || !snap) return;
        destroyTabulator();
        destroySharePreviewSmmCanvas();
        if (!global.TcSharePreviewSmmCanvas || typeof global.TcSharePreviewSmmCanvas.mount !== 'function') {
            wrap.innerHTML = '<p class="tc-share-preview__empty">思维导图画布未加载，请刷新页面</p>';
            return;
        }
        sharePreviewSmmHandle = global.TcSharePreviewSmmCanvas.mount(wrap, snap, {
            onCaseClick: function (rowIndex) {
                if (!snap.comment_enabled) return;
                selectRowCommentTarget(rowIndex, true);
            },
            onBlankClick: function () {
                clearRowCommentTarget();
            }
        });
        syncMindmapRowHighlight();
    }

    function syncMindmapRowHighlight() {
        if (!sharePreviewSmmHandle || typeof sharePreviewSmmHandle.highlightRow !== 'function') return;
        sharePreviewSmmHandle.highlightRow(state.targetRowIndex);
    }

    function syncSharePreviewLayoutMode() {
        var main = $('tc-share-preview-main');
        if (!main) return;
        if (isMindmapReviewSnapshot(state.snapshot)) {
            main.classList.add('tc-share-preview__main--mindmap');
        } else {
            main.classList.remove('tc-share-preview__main--mindmap');
        }
    }

    function renderMainContent() {
        syncSharePreviewLayoutMode();
        if (isMindmapReviewSnapshot(state.snapshot)) {
            renderSharePreviewSmmCanvas();
            return;
        }
        var mindWrap = $('tc-share-preview-mindmap-wrap');
        if (mindWrap) mindWrap.classList.add('hidden');
        var tableWrap = $('tc-share-preview-table-wrap');
        if (tableWrap) tableWrap.classList.remove('hidden');
        destroySharePreviewSmmCanvas();
        renderTable();
    }


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

    function rowHasComments(idx) {
        var byRow = commentsByRow();
        return !!(byRow[String(idx)] && byRow[String(idx)].length);
    }

    function decorateRowElement(row, idx) {
        var el = row.getElement();
        if (!el) return;
        el.setAttribute('data-row-index', String(idx));
        el.setAttribute('data-has-comments', rowHasComments(idx) ? '1' : '0');
        el.classList.toggle('tc-share-tabulator-row--active', state.targetRowIndex === idx);
        el.classList.toggle('tc-share-tabulator-row--has-comments', rowHasComments(idx));
    }

    function destroyTabulator() {
        if (layoutApi && typeof layoutApi.teardownTabulator === 'function') {
            layoutApi.teardownTabulator();
        }
        if (tabulator) {
            try { tabulator.destroy(); } catch (e) { /* ignore */ }
            tabulator = null;
        }
    }

    var SHARE_PREVIEW_FOOTER_GAP = 14;

    function isSharePreviewFooterVisible(footer) {
        return !!(footer && footer.classList.contains('hf-site-footer--visible'));
    }

    function measureTableHeight() {
        var wrap = $('tc-share-preview-table-wrap');
        if (!wrap) {
            return Math.max(280, Math.floor((global.innerHeight || 800) * 0.72));
        }
        var cs = global.getComputedStyle(wrap);
        var padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        var top = wrap.getBoundingClientRect().top;
        var viewportH = global.innerHeight || document.documentElement.clientHeight || 800;
        var footer = document.querySelector('#hf-site-footer');
        var footerVisible = isSharePreviewFooterVisible(footer);
        var bottomLimit = viewportH;
        if (footer) {
            var footerTop = footer.getBoundingClientRect().top;
            if (footerTop > top) {
                bottomLimit = footerTop;
            }
        }
        var bottomClearance = footerVisible ? SHARE_PREVIEW_FOOTER_GAP : 24;
        var byViewport = Math.floor(bottomLimit - top - padY - bottomClearance);
        if (footerVisible) {
            return Math.max(200, byViewport);
        }
        var chromeH = layoutApi ? layoutApi.getRestoreBarChromeHeight() : 0;
        var parent = wrap.parentElement;
        if (parent && parent.clientHeight > 160) {
            var parentCs = global.getComputedStyle(parent);
            var parentPadY = (parseFloat(parentCs.paddingTop) || 0) + (parseFloat(parentCs.paddingBottom) || 0);
            var byParent = Math.floor(parent.clientHeight - parentPadY - padY - chromeH);
            if (byParent > 160) {
                return Math.max(200, Math.min(byViewport, byParent));
            }
        }
        return Math.max(200, byViewport);
    }

    function applyTableHeight() {
        if (!tabulator) return;
        tabulator.setHeight(measureTableHeight());
    }

    function scheduleTableResize() {
        if (tableResizeTimer) {
            global.clearTimeout(tableResizeTimer);
        }
        tableResizeTimer = global.setTimeout(function () {
            tableResizeTimer = null;
            applyTableHeight();
            if (layoutApi && tabulator && typeof layoutApi.syncEqualColumnWidths === 'function') {
                layoutApi.syncEqualColumnWidths(tabulator);
            }
        }, 80);
    }

    function bindTableResizeWatch() {
        var wrap = $('tc-share-preview-table-wrap');
        if (!wrap || wrap._tcShareResizeBound) return;
        wrap._tcShareResizeBound = true;
        global.addEventListener('resize', scheduleTableResize);
        if (typeof global.ResizeObserver === 'function') {
            tableResizeObserver = new global.ResizeObserver(function () {
                scheduleTableResize();
            });
            tableResizeObserver.observe(wrap);
            var main = $('tc-share-preview-main');
            if (main) tableResizeObserver.observe(main);
        }
        var footer = document.querySelector('#hf-site-footer');
        if (footer && typeof global.MutationObserver === 'function') {
            var footerObserver = new global.MutationObserver(function () {
                scheduleTableResize();
            });
            footerObserver.observe(footer, { attributes: true, attributeFilter: ['class'] });
            wrap._tcShareFooterObserver = footerObserver;
        }
    }

    function buildTableData() {
        var snap = state.snapshot;
        var cols = snap.columns || [];
        var rows = snap.rows || [];
        return rows.map(function (row, idx) {
            var rec = { id: idx, _rowIndex: idx };
            cols.forEach(function (_, ci) {
                rec['c' + ci] = row[ci] != null ? String(row[ci]) : '';
            });
            return rec;
        });
    }

    function buildTableColumns() {
        if (!layoutApi) return [];
        var snap = state.snapshot;
        var cols = snap.columns || [];
        var columns = [{
            title: '#',
            field: '_rowIndex',
            width: 56,
            minWidth: 56,
            resizable: false,
            headerSort: false,
            headerHozAlign: 'center',
            headerVertAlign: 'middle',
            hozAlign: 'center',
            vertAlign: 'middle',
            cssClass: 'tc-share-tabulator__seq-cell',
            formatter: function (cell) {
                var idx = cell.getValue();
                var badge = rowHasComments(idx)
                    ? '<span class="tc-share-tabulator__seq-dot" title="该行有评论"></span>'
                    : '';
                return badge + '<span class="tc-share-tabulator__seq-num">' + (idx + 1) + '</span>';
            }
        }];

        cols.forEach(function (name, ci) {
            columns.push(layoutApi.buildDataColumnDef(name, ci));
        });

        if (snap.comment_enabled) {
            columns.push({
                title: '评审',
                field: '_actions',
                width: 108,
                minWidth: 108,
                resizable: false,
                headerSort: false,
                headerHozAlign: 'center',
                headerVertAlign: 'middle',
                hozAlign: 'center',
                vertAlign: 'middle',
                cssClass: 'tc-share-tabulator__action-cell',
                formatter: function (cell) {
                    var idx = cell.getRow().getData()._rowIndex;
                    var active = state.targetRowIndex === idx;
                    var label = active ? '取消选中' : '评论此行';
                    return '<button type="button" class="tc-share-preview-table__comment-btn' +
                        (active ? ' tc-share-preview-table__comment-btn--active' : '') +
                        '" data-row-index="' + idx + '">' + label + '</button>';
                }
            });
        }
        return columns;
    }

    function getTableCore() {
        return {
            getTabulator: function () { return tabulator; },
            buildTableData: buildTableData,
            buildTableColumns: buildTableColumns
        };
    }

    function bindTableDelegation(wrap) {
        if (!wrap || wrap._tcShareDelegated) return;
        wrap._tcShareDelegated = true;
        wrap.addEventListener('click', function (e) {
            var btn = e.target.closest('.tc-share-preview-table__comment-btn');
            if (!btn || !wrap.contains(btn)) return;
            e.preventDefault();
            e.stopPropagation();
            toggleRowCommentTarget(parseInt(btn.getAttribute('data-row-index'), 10));
        });
    }

    function bindHiddenColumnsDelegation() {
        var root = $('tc-share-preview-main');
        if (!root || root._tcShareHiddenColBound) return;
        root._tcShareHiddenColBound = true;
        root.addEventListener('click', function (e) {
            if (layoutApi && layoutApi.tryRestoreColumnClick(e.target, tabulator)) {
                e.preventDefault();
            }
        });
    }

    function syncTabulatorRowChrome() {
        if (!tabulator) return;
        tabulator.getRows().forEach(function (row) {
            decorateRowElement(row, row.getData()._rowIndex);
        });
        if (state.snapshot && state.snapshot.comment_enabled) {
            var wrap = $('tc-share-preview-table-wrap');
            if (wrap) {
                wrap.querySelectorAll('.tc-share-preview-table__comment-btn').forEach(function (btn) {
                    var idx = parseInt(btn.getAttribute('data-row-index'), 10);
                    var active = state.targetRowIndex === idx;
                    btn.classList.toggle('tc-share-preview-table__comment-btn--active', active);
                    btn.textContent = active ? '取消选中' : '评论此行';
                });
            }
        }
    }

    function createTabulatorInstance(mountId, tableOpts) {
        try {
            return new global.Tabulator('#' + mountId, tableOpts);
        } catch (err) {
            console.error('[tc_share_preview] Tabulator init failed', err);
            throw err;
        }
    }

    function afterTableDataSync() {
        if (layoutApi) {
            layoutApi.applySavedRowHeights(tabulator);
            layoutApi.updateRestoreColumnsBar(state.snapshot, esc);
        }
        syncTabulatorRowChrome();
    }

    function renderTable() {
        var wrap = $('tc-share-preview-table-wrap');
        var snap = state.snapshot;
        if (!wrap || !snap) return;

        if (!layoutApi) {
            destroyTabulator();
            wrap.innerHTML = '<p class="tc-share-preview__empty">表格布局组件未加载，请刷新页面</p>';
            return;
        }

        var cols = snap.columns || [];
        if (!cols.length) {
            destroyTabulator();
            wrap.innerHTML = '<p class="tc-share-preview__empty">暂无表格数据</p>';
            return;
        }

        if (typeof global.Tabulator !== 'function') {
            destroyTabulator();
            wrap.innerHTML = '<p class="tc-share-preview__empty">表格组件未加载，请刷新页面</p>';
            return;
        }

        var mountId = 'tc-share-tabulator-mount';
        if (!$(mountId)) {
            wrap.innerHTML = '<div id="' + mountId + '" class="tc-share-tabulator"></div>';
        }
        bindTableDelegation(wrap);
        bindHiddenColumnsDelegation();
        bindTableResizeWatch();
        layoutApi.updateRestoreColumnsBar(snap, esc);

        var tableHeight = measureTableHeight();
        var tableOpts = layoutApi.buildTableLayoutOptions(tableHeight, getTableCore());

        if (!tabulator) {
            global.requestAnimationFrame(function () {
                global.requestAnimationFrame(function () {
                    if (tabulator) return;
                    tabulator = createTabulatorInstance(mountId, tableOpts);
                    layoutApi.bindTabulator(tabulator);
                    applyTableHeight();
                    layoutApi.updateRestoreColumnsBar(state.snapshot, esc);
                    applyRowCommentTargetUi(false);
                });
            });
            return;
        }

        tabulator.setColumns(buildTableColumns());
        tabulator.setHeight(measureTableHeight());
        tabulator.setData(buildTableData()).then(afterTableDataSync).catch(afterTableDataSync);
        applyRowCommentTargetUi(false);
    }

    function applyRowCommentTargetUi(focusTextarea) {
        var form = $('tc-share-comment-form');
        var label = form && form.querySelector('.tc-share-preview__comment-form-label');
        var isRow = state.targetRowIndex != null;
        if (form) form.classList.toggle('tc-share-preview__comment-form--row', isRow);
        if (label) {
            label.textContent = isRow ? ('第 ' + (state.targetRowIndex + 1) + ' 行') : '全局评论';
        }
        syncTabulatorRowChrome();
        syncMindmapRowHighlight();
        if (focusTextarea) {
            var ta = $('tc-share-comment-content');
            if (ta) {
                ta.focus();
                ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    function selectRowCommentTarget(rowIndex, focusTextarea) {
        state.targetRowIndex = rowIndex;
        applyRowCommentTargetUi(!!focusTextarea);
    }

    function toggleRowCommentTarget(rowIndex) {
        if (state.targetRowIndex === rowIndex) {
            clearRowCommentTarget();
            return;
        }
        selectRowCommentTarget(rowIndex, true);
    }

    function clearRowCommentTarget() {
        state.targetRowIndex = null;
        applyRowCommentTargetUi(false);
    }

    function renderComments() {
        var list = $('tc-share-comments-list');
        if (!list) return;
        if (!state.comments.length) {
            list.innerHTML = '<p class="text-slate-400 text-sm">暂无评论</p>';
            renderMainContent();
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
        renderMainContent();
    }

    function loadComments() {
        return fetchJson('/api/test-cases/shares/by-token/' + encodeURIComponent(state.token) + '/comments')
            .then(function (data) {
                state.comments = (data && data.comments) || [];
                renderComments();
            });
    }

    function showAlert(msg, opts) {
        if (typeof global.tcAppAlert === 'function') {
            return global.tcAppAlert(msg, opts || { variant: 'warning', title: '提示' });
        }
        var status = $('tc-share-preview-status');
        if (status) {
            status.textContent = String(msg || '');
            status.classList.remove('hidden');
            status.classList.add('tc-share-preview__status--error');
        }
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

        if (!layoutApi && !global.TcSharePreviewSmmCanvas) {
            showError('预览组件未加载，请刷新页面');
            return;
        }

        if (layoutApi) layoutApi.configure({
            token: state.token,
            scheduleTableResize: scheduleTableResize,
            pageCtx: {
                getSnapshot: function () { return state.snapshot; },
                escHtml: esc,
                decorateRowElement: decorateRowElement,
                getTabulator: function () { return tabulator; }
            }
        });

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
                    if (isMindmapReviewSnapshot(snap)) {
                        parts.unshift('思维导图评审');
                        parts.push((snap.rows || []).length + ' 条用例');
                    } else {
                        parts.push((snap.rows || []).length + ' 行');
                    }
                    meta.textContent = parts.join(' · ');
                }
                var section = $('tc-share-comments-section');
                if (section && !snap.comment_enabled) {
                    section.classList.add('hidden');
                }
                renderMainContent();
                if (!isMindmapReviewSnapshot(snap)) {
                    global.requestAnimationFrame(function () {
                        scheduleTableResize();
                    });
                }
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
                    var savedRow = state.targetRowIndex;
                    if (contentEl) contentEl.value = '';
                    renderComments();
                    if (savedRow != null) {
                        state.targetRowIndex = savedRow;
                        applyRowCommentTargetUi(false);
                    } else {
                        clearRowCommentTarget();
                    }
                }).catch(function (err) {
                    showAlert(err.message || '提交失败', { variant: 'warning', title: '提交失败' });
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
