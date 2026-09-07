/**
 * 思维导图 Tab · 导出 FAB 评审按钮启用逻辑（与表格 Tab 隔离）
 * 当前需求文档下任意需求页的表格或思维导图有用例 → 用例评审/我的评审 可点
 */
(function tcWbExportFabMindmapReview(global) {
    'use strict';

    var _mindmapListByDoc = Object.create(null);
    var _mindmapListLoadedDocIds = Object.create(null);
    var _refreshScheduled = false;
    var _refreshPromise = null;

    function resolveActiveDocId() {
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            return String((global.getTcLanhuDocTreeMeta() || {}).docId || '').trim();
        }
        return '';
    }

    function countContentRows(rows) {
        if (!Array.isArray(rows) || !rows.length) return 0;
        var n = 0;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row && row.some(function (c) { return String(c || '').trim(); })) n++;
        }
        return n;
    }

    function currentPageMindmapHasCases() {
        if (typeof global.tcMindmapCaptureMindSnapshot === 'function') {
            try {
                var snap = global.tcMindmapCaptureMindSnapshot();
                if (snap && snap.data && Array.isArray(snap.data.children) && snap.data.children.length) return true;
            } catch (e0) { /* ignore */ }
        }
        if (typeof global.tcMindmapCasesData !== 'undefined' && global.tcMindmapCasesData) {
            return countContentRows(global.tcMindmapCasesData) > 0;
        }
        return false;
    }

    function currentPageTableHasCases() {
        if (typeof global.tcCountTableCaseContentRows === 'function') {
            return global.tcCountTableCaseContentRows() > 0;
        }
        return false;
    }

    function docHasDesignedTableCases(docId) {
        if (currentPageTableHasCases()) return true;
        if (!docId || !global.TcLanhuTreeCaseStatus || typeof global.TcLanhuTreeCaseStatus.getSummary !== 'function') {
            return false;
        }
        var summary = global.TcLanhuTreeCaseStatus.getSummary(docId);
        return !!(summary && summary.designed > 0);
    }

    function mindmapListItemHasCases(item) {
        if (!item) return false;
        var cc = parseInt(item.case_count, 10);
        if (isNaN(cc)) cc = parseInt(item.row_count, 10);
        return (cc || 0) > 0;
    }

    function docHasDesignedMindmapCases(docId) {
        if (currentPageMindmapHasCases()) return true;
        if (!docId) return false;
        var items = _mindmapListByDoc[docId];
        if (!Array.isArray(items)) return false;
        for (var i = 0; i < items.length; i++) {
            if (mindmapListItemHasCases(items[i])) return true;
        }
        return false;
    }

    function tcExportFabMindmapReviewItemsEnabled() {
        var docId = resolveActiveDocId();
        if (!docId) {
            return currentPageTableHasCases() || currentPageMindmapHasCases();
        }
        return docHasDesignedTableCases(docId) || docHasDesignedMindmapCases(docId);
    }

    function applyMindmapListForDoc(docId, items) {
        docId = String(docId || '').trim();
        if (!docId) return;
        _mindmapListByDoc[docId] = (items || []).filter(function (item) {
            return String(item && item.lanhu_doc_id || '').trim() === docId;
        });
        _mindmapListLoadedDocIds[docId] = true;
    }

    function tcScheduleExportFabMindmapReviewStatusRefresh() {
        var docId = resolveActiveDocId();
        if (!docId) return;
        if (_refreshScheduled || _refreshPromise) return;

        var needTableLoad = global.TcLanhuTreeCaseStatus &&
            typeof global.TcLanhuTreeCaseStatus.loadForDoc === 'function';
        var needMindmapLoad = !_mindmapListLoadedDocIds[docId];
        if (!needTableLoad && !needMindmapLoad) return;

        _refreshScheduled = true;
        var tasks = [];
        if (needTableLoad) {
            tasks.push(global.TcLanhuTreeCaseStatus.loadForDoc(docId).catch(function () { return false; }));
        }
        if (needMindmapLoad) {
            tasks.push(
                fetch('/api/test-cases/requirement-mindmaps/list', { credentials: 'same-origin', cache: 'no-store' })
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        if (data && data.ok) applyMindmapListForDoc(docId, data.items || []);
                        else _mindmapListLoadedDocIds[docId] = true;
                        return true;
                    })
                    .catch(function () {
                        _mindmapListLoadedDocIds[docId] = true;
                        return false;
                    })
            );
        }

        _refreshPromise = Promise.all(tasks).finally(function () {
            _refreshScheduled = false;
            _refreshPromise = null;
            if (typeof global.syncTcExportFabSheetItemsChrome === 'function') {
                global.syncTcExportFabSheetItemsChrome(undefined, {
                    skipTreeStatusRefresh: true,
                    skipMindmapReviewRefresh: true
                });
            }
        });
    }

    global.tcExportFabMindmapReviewItemsEnabled = tcExportFabMindmapReviewItemsEnabled;
    global.tcScheduleExportFabMindmapReviewStatusRefresh = tcScheduleExportFabMindmapReviewStatusRefresh;
})(typeof window !== 'undefined' ? window : globalThis);
