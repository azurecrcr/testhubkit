/**
 * 蓝湖需求树 — 已设计用例页状态（独立于 doc_tree / requirement store）
 */
(function tcLanhuTreeCaseStatusModule() {
    'use strict';

    var _byDoc = Object.create(null);

    function normalizeDocId(docId) {
        return String(docId || '').trim();
    }

    function normalizePageId(pageId) {
        return String(pageId || '').trim();
    }

    function getDocMap(docId) {
        docId = normalizeDocId(docId);
        if (!docId) return null;
        if (!_byDoc[docId]) _byDoc[docId] = Object.create(null);
        return _byDoc[docId];
    }

    function rerenderTree() {
        if (typeof window._tcLanhuDocTreeRerender === 'function') {
            window._tcLanhuDocTreeRerender();
        }
    }

    function applyListItems(docId, items) {
        var map = Object.create(null);
        (items || []).forEach(function (item) {
            if (!item) return;
            if (normalizeDocId(item.lanhu_doc_id) !== docId) return;
            var pageId = normalizePageId(item.lanhu_page_id);
            var rowCount = parseInt(item.row_count, 10) || 0;
            if (!pageId || rowCount <= 0) return;
            map[pageId] = {
                rowCount: rowCount,
                updatedAt: String(item.updated_at || '')
            };
        });
        _byDoc[docId] = map;
    }

    function snapshotDocMap(docId) {
        var map = _byDoc[normalizeDocId(docId)] || Object.create(null);
        try { return JSON.stringify(map); } catch (eSnap) { return ''; }
    }

    function loadForDoc(docId) {
        docId = normalizeDocId(docId);
        if (!docId) return Promise.resolve(false);
        var before = snapshotDocMap(docId);
        return fetch('/api/test-cases/requirement-cases/list?limit=1000', {
            credentials: 'same-origin',
            cache: 'no-store'
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data || !data.ok) return false;
                applyListItems(docId, data.items || []);
                if (snapshotDocMap(docId) !== before) rerenderTree();
                return true;
            })
            .catch(function () { return false; });
    }

    function getPageStatus(docId, pageId) {
        docId = normalizeDocId(docId);
        pageId = normalizePageId(pageId);
        if (!docId || !pageId) return null;
        var map = _byDoc[docId];
        if (!map) return null;
        return map[pageId] || null;
    }

    function pageHasCases(docId, pageId) {
        var st = getPageStatus(docId, pageId);
        return !!(st && st.rowCount > 0);
    }

    function markPage(docId, pageId, rowCount) {
        docId = normalizeDocId(docId);
        pageId = normalizePageId(pageId);
        if (!docId || !pageId) return;
        var map = getDocMap(docId);
        var rc = parseInt(rowCount, 10) || 0;
        var prev = map[pageId];
        var changed = false;
        if (rc > 0) {
            if (!prev || prev.rowCount !== rc) changed = true;
            map[pageId] = { rowCount: rc, updatedAt: '' };
        } else if (prev) {
            delete map[pageId];
            changed = true;
        }
        if (changed) rerenderTree();
    }

    function getSummary(docId) {
        docId = normalizeDocId(docId);
        var map = _byDoc[docId] || Object.create(null);
        var designed = 0;
        Object.keys(map).forEach(function (pid) {
            if (map[pid] && map[pid].rowCount > 0) designed += 1;
        });
        return { designed: designed };
    }

    function countSubtreeStatus(nodes) {
        var designed = 0;
        var total = 0;
        function walk(list) {
            (list || []).forEach(function (node) {
                if (!node) return;
                if (node.type === 'page') {
                    total += 1;
                    return;
                }
                walk(node.children);
            });
        }
        walk(nodes);
        return { designed: designed, total: total };
    }

    window.TcLanhuTreeCaseStatus = {
        loadForDoc: loadForDoc,
        getPageStatus: getPageStatus,
        pageHasCases: pageHasCases,
        markPage: markPage,
        getSummary: getSummary,
        countSubtreeStatus: countSubtreeStatus
    };
})();
