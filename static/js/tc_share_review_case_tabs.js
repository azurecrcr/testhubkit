/**
 * 用例评审弹窗 · 表格/导图 Tab（隔离模块，由 tc_share_requirement_picker 调用）
 */
(function tcShareReviewCaseTabs(global) {
    'use strict';

    if (global.TcShareReviewCaseTabs) return;

    var TAB_TABLE = 'table';
    var TAB_MINDMAP = 'mindmap';

    var _activeTab = TAB_TABLE;
    var _itemsByTab = { table: [], mindmap: [] };
    var _selectionByTab = { table: [], mindmap: [] };
    var _mindmapListLoaded = false;
    var _mindmapListLoading = false;
    var _tableListLoaded = false;
    var _tableListLoading = false;

    function normalizeTab(tab) {
        return tab === TAB_MINDMAP ? TAB_MINDMAP : TAB_TABLE;
    }

    function resolveActiveDocId() {
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            return String((global.getTcLanhuDocTreeMeta() || {}).docId || '').trim();
        }
        return '';
    }


    function resolveShareRequirementPageFullPath(item) {
        item = item || {};
        var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
        if (pageId && typeof global.findTcLanhuPageNodePath === 'function') {
            var path = String(global.findTcLanhuPageNodePath(pageId) || '').trim();
            if (path) return path;
        }
        return String(item.page_name || item.requirement_id || '').trim();
    }

    function filterItemsForActiveDoc(items) {
        items = items || [];
        var docId = resolveActiveDocId();
        if (!docId) return items;
        return items.filter(function (item) {
            return String(item && item.lanhu_doc_id || '').trim() === docId;
        });
    }

    function countMindmapPayloadRows(payload) {
        if (!payload || !payload.rows) return 0;
        var rows = payload.rows || [];
        var n = 0;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i] || [];
            for (var j = 0; j < row.length; j++) {
                if (String(row[j] != null ? row[j] : '').trim()) {
                    n++;
                    break;
                }
            }
        }
        return n || rows.length;
    }

    function collectLiveMindmapReviewPayload() {
        if (typeof global.tcCollectLiveSharePayload === 'function' &&
            typeof global.tcRightViewMode !== 'undefined' && global.tcRightViewMode === 'mindmap') {
            return global.tcCollectLiveSharePayload();
        }
        var cols = (typeof global.tableColumns !== 'undefined' ? global.tableColumns : []).map(function (c) {
            return String(c);
        });
        if (!cols.length) return null;
        var sourceRows = (typeof global.tcMindmapCasesData !== 'undefined' && global.tcMindmapCasesData)
            ? global.tcMindmapCasesData : [];
        var rows = (sourceRows || []).map(function (row) {
            var out = [];
            for (var i = 0; i < cols.length; i++) {
                out.push(String(row[i] != null ? row[i] : ''));
            }
            return out;
        });
        var mind = typeof global.tcMindmapCaptureMindSnapshot === 'function'
            ? global.tcMindmapCaptureMindSnapshot() : null;
        var hasMind = mind && mind.data && Array.isArray(mind.data.children) && mind.data.children.length;
        var hasRows = false;
        for (var r = 0; r < rows.length; r++) {
            if ((rows[r] || []).some(function (c) { return String(c || '').trim(); })) {
                hasRows = true;
                break;
            }
        }
        if (!hasMind && !hasRows) return null;
        return {
            scope: 'mindmap',
            template_id: typeof global.tcActiveTemplateId !== 'undefined' ? global.tcActiveTemplateId : null,
            template_name: null,
            columns: cols,
            rows: rows,
            provenance: [],
            rootTopic: typeof global.tcMindmapRootTopic !== 'undefined' ? String(global.tcMindmapRootTopic || '') : '',
            mind: mind,
            viewTransform: (global.TcSmmEditor && typeof global.TcSmmEditor.captureViewTransform === 'function')
                ? global.TcSmmEditor.captureViewTransform() : null
        };
    }

    function mergeCurrentPageIntoShareMindmapList(items, ctx, buildKey) {
        items = (items || []).slice();
        if (!ctx) return items;
        var payload = collectLiveMindmapReviewPayload();
        if (!payload || !countMindmapPayloadRows(payload)) return items;
        var key = buildKey(ctx);
        var pageName = String(ctx.page_name || '').trim() || '未命名需求';
        var liveCount = countMindmapPayloadRows(payload);
        for (var i = 0; i < items.length; i++) {
            if (buildKey(items[i]) === key) {
                items[i] = Object.assign({}, items[i], {
                    page_name: pageName || items[i].page_name,
                    row_count: Math.max(parseInt(items[i].row_count, 10) || 0, liveCount),
                    case_count: Math.max(parseInt(items[i].case_count, 10) || 0, liveCount),
                    is_current: true,
                    review_case_kind: TAB_MINDMAP
                });
                return items;
            }
        }
        items.unshift({
            requirement_id: ctx.requirement_id || ctx.lanhu_page_id || '',
            lanhu_pid: ctx.lanhu_pid || '',
            lanhu_doc_id: ctx.lanhu_doc_id || '',
            lanhu_page_id: ctx.lanhu_page_id || ctx.page_id || '',
            lanhu_url: ctx.lanhu_url || '',
            page_name: pageName,
            row_count: liveCount,
            case_count: liveCount,
            updated_at: '',
            is_current: true,
            review_case_kind: TAB_MINDMAP
        });
        return items;
    }


    function buildShareReviewMindmapListQuery(ctx) {
        ctx = ctx || {};
        var docId = String(ctx.lanhu_doc_id || '').trim();
        if (!docId) return '';
        var q = '?lanhu_doc_id=' + encodeURIComponent(docId);
        var pid = String(ctx.lanhu_pid || '').trim();
        if (pid) q += '&lanhu_pid=' + encodeURIComponent(pid);
        return q;
    }

    function fetchDesignedShareMindmapList(ctx, buildKey) {
        var query = buildShareReviewMindmapListQuery(ctx || {});
        return fetch('/api/test-cases/requirement-mindmaps/list' + query, { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || !data.ok) {
                    throw new Error((data && data.error) || '加载导图用例列表失败');
                }
                var items = filterItemsForActiveDoc(data.items || []).map(function (item) {
                    var copy = Object.assign({}, item);
                    copy.review_case_kind = TAB_MINDMAP;
                    copy.row_count = parseInt(copy.case_count, 10) || parseInt(copy.row_count, 10) || 0;
                    return copy;
                });
                return mergeCurrentPageIntoShareMindmapList(items, ctx, buildKey);
            });
    }

    function docToMindmapSharePayload(doc) {
        var raw = (doc && doc.payload) || {};
        var columns = (raw.columns || []).map(function (c) { return String(c); });
        var n = columns.length;
        if (!n) return null;
        var rows = (raw.rows || []).map(function (row) {
            var out = [];
            for (var i = 0; i < n; i++) {
                out.push(String(row[i] != null ? row[i] : ''));
            }
            return out;
        });
        var payload = {
            scope: 'mindmap',
            template_id: doc.template_id || null,
            template_name: null,
            columns: columns,
            rows: rows,
            provenance: Array.isArray(raw.provenance) ? raw.provenance.slice() : rows.map(function () { return null; }),
            columnVisible: raw.columnVisible || {},
            columnWidth: raw.columnWidth || {},
            rowHeights: raw.rowHeights || {},
            rootTopic: raw.rootTopic != null ? String(raw.rootTopic) : '',
            mind: raw.mind || null,
            viewTransform: raw.viewTransform || null
        };
        if (typeof global.tcEnrichSharePayloadTemplate === 'function') {
            global.tcEnrichSharePayloadTemplate(payload);
        }
        return payload;
    }

    function fetchRequirementMindmapDoc(item) {
        var lanhuUrl = String(item.lanhu_url || '').trim();
        var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
        if (!lanhuUrl || !pageId) {
            return Promise.reject(new Error('需求链接不完整'));
        }
        var url = '/api/test-cases/requirement-mindmaps?lanhu_url=' +
            encodeURIComponent(lanhuUrl) + '&page_id=' + encodeURIComponent(pageId);
        return fetch(url, { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || !data.ok || !data.found || !data.data) {
                    throw new Error('未找到导图用例数据');
                }
                return data.data;
            });
    }

    function resolveMindmapSharePayload(item, helpers) {
        helpers = helpers || {};
        var ctx = helpers.resolveCtx ? helpers.resolveCtx() : null;
        var buildKey = helpers.buildKey || function () { return ''; };
        var isCurrent = item.is_current || (ctx && buildKey(item) === buildKey(ctx));
        var liveCount = countMindmapPayloadRows(collectLiveMindmapReviewPayload());
        if (isCurrent && liveCount > 0) {
            var payload = collectLiveMindmapReviewPayload();
            if (!helpers.sharePayloadHasRowContent || !helpers.sharePayloadHasRowContent(payload)) {
                return Promise.reject(new Error('当前页面暂无可评审导图用例'));
            }
            return Promise.resolve({ sharePayload: payload, page_name: item.page_name });
        }
        return fetchRequirementMindmapDoc(item).then(function (doc) {
            var sharePayload = docToMindmapSharePayload(doc);
            if (!sharePayload || !helpers.sharePayloadHasRowContent || !helpers.sharePayloadHasRowContent(sharePayload)) {
                throw new Error('没有可评审的有效导图用例');
            }
            return { sharePayload: sharePayload, page_name: doc.page_name || item.page_name };
        });
    }

    function mergeMindmapSharePayloads(payloads) {
        payloads = payloads || [];
        if (!payloads.length) return null;
        if (payloads.length === 1) return payloads[0];
        var base = payloads[0];
        var merged = {
            scope: 'mindmap',
            template_id: base.template_id,
            template_name: base.template_name,
            columns: base.columns.slice(),
            rows: base.rows.slice(),
            provenance: (base.provenance || []).slice(),
            columnVisible: Object.assign({}, base.columnVisible || {}),
            columnWidth: Object.assign({}, base.columnWidth || {}),
            rowHeights: Object.assign({}, base.rowHeights || {}),
            rootTopic: base.rootTopic || '',
            mind: base.mind || null,
            viewTransform: base.viewTransform || null
        };
        for (var i = 1; i < payloads.length; i++) {
            var p = payloads[i];
            if (typeof global.TcShareReviewCaseTabs && global.TcShareReviewCaseTabs._remapRows) {
                var remapped = global.TcShareReviewCaseTabs._remapRows(merged.columns, p.columns, p.rows);
                merged.rows = merged.rows.concat(remapped);
            } else {
                merged.rows = merged.rows.concat(p.rows || []);
            }
            var prov = p.provenance || [];
            for (var j = 0; j < (p.rows || []).length; j++) {
                merged.provenance.push(prov[j] || null);
            }
        }
        if (typeof global.tcEnrichSharePayloadTemplate === 'function') {
            global.tcEnrichSharePayloadTemplate(merged);
        }
        return merged;
    }

    function syncTabButtons() {
        var tableBtn = global.document.getElementById('tc-share-review-tab-table');
        var mindmapBtn = global.document.getElementById('tc-share-review-tab-mindmap');
        var tabsWrap = global.document.getElementById('tc-share-review-case-tabs');
        if (!tabsWrap) return;
        var isTable = _activeTab === TAB_TABLE;
        if (tableBtn) {
            tableBtn.classList.toggle('tc-share-review-case-tabs__btn--active', isTable);
            tableBtn.setAttribute('aria-selected', isTable ? 'true' : 'false');
        }
        if (mindmapBtn) {
            mindmapBtn.classList.toggle('tc-share-review-case-tabs__btn--active', !isTable);
            mindmapBtn.setAttribute('aria-selected', !isTable ? 'true' : 'false');
        }
    }

    function setTabsVisible(show) {
        var tabsWrap = global.document.getElementById('tc-share-review-case-tabs');
        if (!tabsWrap) return;
        tabsWrap.classList.toggle('hidden', !show);
        tabsWrap.setAttribute('aria-hidden', show ? 'false' : 'true');
    }

    function bindTabsOnce(onTabSwitch) {
        if (global._tcShareReviewCaseTabsBound) return;
        global._tcShareReviewCaseTabsBound = true;
        var tableBtn = global.document.getElementById('tc-share-review-tab-table');
        var mindmapBtn = global.document.getElementById('tc-share-review-tab-mindmap');
        function pick(tab) {
            tab = normalizeTab(tab);
            if (tab === _activeTab) return;
            if (typeof onTabSwitch === 'function') onTabSwitch(tab);
        }
        if (tableBtn) tableBtn.addEventListener('click', function () { pick(TAB_TABLE); });
        if (mindmapBtn) mindmapBtn.addEventListener('click', function () { pick(TAB_MINDMAP); });
    }

    global.TcShareReviewCaseTabs = {
        TAB_TABLE: TAB_TABLE,
        TAB_MINDMAP: TAB_MINDMAP,
        getActiveTab: function () { return _activeTab; },
        setActiveTab: function (tab) {
            _activeTab = normalizeTab(tab);
            syncTabButtons();
        },
        resetForModalOpen: function (defaultTab) {
            _activeTab = normalizeTab(defaultTab);
            _itemsByTab.table = [];
            _itemsByTab.mindmap = [];
            _selectionByTab.table = [];
            _selectionByTab.mindmap = [];
            _mindmapListLoaded = false;
            _mindmapListLoading = false;
            _tableListLoaded = false;
            _tableListLoading = false;
            syncTabButtons();
        },
        setItems: function (tab, items) {
            _itemsByTab[normalizeTab(tab)] = (items || []).slice();
        },
        getItems: function (tab) {
            return (_itemsByTab[normalizeTab(tab)] || []).slice();
        },
        setSelection: function (tab, order) {
            _selectionByTab[normalizeTab(tab)] = (order || []).slice();
        },
        getSelection: function (tab) {
            return (_selectionByTab[normalizeTab(tab)] || []).slice();
        },
        persistCurrentSelection: function (order) {
            _selectionByTab[_activeTab] = (order || []).slice();
        },
        fetchMindmapList: fetchDesignedShareMindmapList,
        isMindmapListLoaded: function () { return _mindmapListLoaded; },
        setMindmapListLoaded: function (v) { _mindmapListLoaded = !!v; },
        isMindmapListLoading: function () { return _mindmapListLoading; },
        setMindmapListLoading: function (v) { _mindmapListLoading = !!v; },
        isTableListLoaded: function () { return _tableListLoaded; },
        setTableListLoaded: function (v) { _tableListLoaded = !!v; },
        isTableListLoading: function () { return _tableListLoading; },
        setTableListLoading: function (v) { _tableListLoading = !!v; },
        resolveMindmapSharePayload: resolveMindmapSharePayload,
        mergeMindmapSharePayloads: mergeMindmapSharePayloads,
        mergeCurrentPageIntoShareMindmapList: mergeCurrentPageIntoShareMindmapList,
        itemMetaSuffix: function (tab) {
            return normalizeTab(tab) === TAB_MINDMAP ? ' 条导图用例' : ' 条用例';
        },
        emptyText: function (tab) {
            return normalizeTab(tab) === TAB_MINDMAP ? '暂无可选需求（导图用例）' : '暂无可选需求（表格用例）';
        },
        bindTabsOnce: bindTabsOnce,
        setTabsVisible: setTabsVisible,
        resolveShareRequirementPageFullPath: resolveShareRequirementPageFullPath,
        defaultTabForView: function () {
            if (typeof global.tcRightViewMode !== 'undefined' && global.tcRightViewMode === 'mindmap') {
                return TAB_MINDMAP;
            }
            return TAB_TABLE;
        },
        _remapRows: null
    };
})(typeof window !== 'undefined' ? window : globalThis);
