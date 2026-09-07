/**
 * 思维导图评审分享 · 预览页元数据补全（与工作台采集逻辑隔离）
 */
(function (global) {
    'use strict';

    function resolveCtx() {
        if (global.TcRequirementCaseStore && typeof global.TcRequirementCaseStore.resolveContext === 'function') {
            return global.TcRequirementCaseStore.resolveContext({});
        }
        return null;
    }

    function resolveDocName() {
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta = global.getTcLanhuDocTreeMeta() || {};
            var name = String(meta.docName || meta.doc_name || '').trim();
            if (name) return name;
        }
        var ctx = resolveCtx();
        if (ctx && ctx.doc_name) return String(ctx.doc_name).trim();
        return '';
    }

    function resolvePageFullPath(item) {
        item = item || {};
        var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
        if (pageId && typeof global.findTcLanhuPageNodePath === 'function') {
            var path = String(global.findTcLanhuPageNodePath(pageId) || '').trim();
            if (path) return path;
        }
        return String(item.page_name || item.requirement_id || '需求页').trim() || '需求页';
    }

    function buildPagesFromMeta(pageMetaList) {
        var pages = [];
        var rowOffset = 0;
        (pageMetaList || []).forEach(function (entry) {
            if (!entry) return;
            var item = entry.item || {};
            var payload = entry.payload || {};
            var rows = payload.rows || [];
            pages.push({
                page_path: resolvePageFullPath(item),
                page_name: String(item.page_name || entry.page_name || '').trim(),
                mind: payload.mind || null,
                row_start: rowOffset,
                row_count: rows.length
            });
            rowOffset += rows.length;
        });
        return pages;
    }

    function buildSinglePageFallback(payload) {
        var ctx = resolveCtx();
        var pagePath = ctx ? resolvePageFullPath(ctx) : String(payload.rootTopic || '需求页');
        return [{
            page_path: pagePath,
            page_name: ctx ? String(ctx.page_name || pagePath).trim() : pagePath,
            mind: payload.mind || null,
            row_start: 0,
            row_count: (payload.rows || []).length
        }];
    }

    function enrichPayload(payload, opts) {
        opts = opts || {};
        if (!payload || payload.scope !== 'mindmap') return payload;
        if (Array.isArray(payload.review_pages) && payload.review_pages.length) return payload;
        var cloned;
        try {
            cloned = JSON.parse(JSON.stringify(payload));
        } catch (eClone) {
            cloned = payload;
        }
        if (!cloned.review_doc_name) {
            cloned.review_doc_name = resolveDocName() || String(cloned.rootTopic || '').trim();
        }
        if (opts.pageMetaList && opts.pageMetaList.length) {
            cloned.review_pages = buildPagesFromMeta(opts.pageMetaList);
        } else {
            cloned.review_pages = buildSinglePageFallback(cloned);
        }
        return cloned;
    }

    global.TcShareMindmapPreviewMeta = {
        enrichPayload: enrichPayload,
        resolvePageFullPath: resolvePageFullPath,
        resolveDocName: resolveDocName
    };
})(typeof window !== 'undefined' ? window : this);