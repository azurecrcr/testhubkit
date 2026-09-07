/**
 * TestHub — 按蓝湖需求页持久化思维导图（user + doc + page），与表格 store 隔离。
 */
(function tcRequirementMindmapStoreModule(global) {
    'use strict';

    var _cachedByKey = {};
    var _loadSeqByKey = {};
    var _activeKey = '';

    function getCaseStore() {
        return global.TcRequirementCaseStore || null;
    }

    function resolveCtx(extra) {
        var store = getCaseStore();
        if (store && typeof store.resolveContext === 'function') {
            return store.resolveContext(extra || {});
        }
        return null;
    }


    function normalizeCtxForMindmap(ctx) {
        var store = getCaseStore();
        if (store && typeof store.resolveContext === 'function') {
            if (ctx && ctx.lanhu_url) {
                return store.resolveContext(Object.assign({}, ctx));
            }
            return store.resolveContext({});
        }
        return ctx || null;
    }

    function buildContextKey(ctx) {
        if (!ctx) return '';
        var pid = String(ctx.lanhu_pid || '').trim();
        var doc = String(ctx.lanhu_doc_id || '').trim();
        var page = String(ctx.lanhu_page_id || ctx.page_id || '').trim();
        if (!doc || !page) return '';
        return pid + '|' + doc + '|' + page;
    }

    function stripPageIdFromLanhuUrl(url) {
        url = String(url || '').trim();
        if (!url) return '';
        return url
            .replace(/([?&])pageId=[^&]*/gi, '$1')
            .replace(/([?&])page_id=[^&]*/gi, '$1')
            .replace(/[?&]$/, '')
            .replace(/\?&/, '?');
    }

    function mindmapHasPersistableContent() {
        if (typeof global.tcMindmapStashHasContent === 'function') {
            return !!global.tcMindmapStashHasContent();
        }
        if (typeof global.collectTcMindmapStashPayload === 'function') {
            try {
                var payload = global.collectTcMindmapStashPayload();
                if (payload && Array.isArray(payload.rows) && payload.rows.length) return true;
                if (payload && payload.mind && typeof global.tcMindmapStashMindHasUserNodes === 'function') {
                    return global.tcMindmapStashMindHasUserNodes(payload.mind);
                }
            } catch (e0) { /* ignore */ }
        }
        return false;
    }


    function mindmapHasRestorableMindInMemory() {
        if (typeof global.tcMindmapStashMindHasUserNodes === 'function') {
            var ext = global.tcMindmapExternalMindData || global.tcMindmapCommittedExternalMind;
            return global.tcMindmapStashMindHasUserNodes(ext);
        }
        var ext2 = global.tcMindmapExternalMindData || global.tcMindmapCommittedExternalMind;
        if (!ext2 || !ext2.data) return false;
        var ch = ext2.data.children;
        return Array.isArray(ch) && ch.length > 0;
    }

    function mindmapNeedsDbRestore() {
        return !mindmapHasRestorableMindInMemory();
    }

    function collectMindmapPayload() {
        if (typeof global.collectTcMindmapStashPayload !== 'function') return null;
        try {
            var payload = global.collectTcMindmapStashPayload();
            if (!payload || !payload.columns || !payload.columns.length) return null;
            payload.scope = 'mindmap';
            return payload;
        } catch (e1) {
            return null;
        }
    }

    function cloneMind(mind) {
        if (!mind) return null;
        try {
            return JSON.parse(JSON.stringify(mind));
        } catch (e2) {
            return null;
        }
    }

    function applyRequirementMindmapPayload(payload, opts) {
        opts = opts || {};
        if (!payload || !Array.isArray(payload.columns) || !payload.columns.length) return false;
        if (typeof global.isTcWorkbenchGenerationActive === 'function' && global.isTcWorkbenchGenerationActive()) {
            return false;
        }

        var cols = payload.columns.map(function (c) { return String(c); });
        var rawRows = Array.isArray(payload.rows) ? payload.rows : [];
        var rows = rawRows.map(function (row) {
            var out = [];
            for (var i = 0; i < cols.length; i++) {
                out.push(Array.isArray(row) && row[i] != null ? String(row[i]) : '');
            }
            return out;
        });

        global.tableColumns = cols;
        global.tcTableTemplateApplied = true;
        if (typeof global.tcApplyStashTemplateMetaFromPayload === 'function') {
            global.tcApplyStashTemplateMetaFromPayload(payload);
        }
        global.tcMindmapCasesData = rows.map(function (r) { return r.slice(); });
        if (typeof global.tcProvenanceArrayFromStashPayload === 'function') {
            global.tcMindmapCasesProvenance = global.tcProvenanceArrayFromStashPayload(payload, rows.length);
        }
        if (typeof global.tcEnsureMindmapProvenanceLength === 'function') {
            global.tcEnsureMindmapProvenanceLength();
        }

        if (payload.rootTopic) global.tcMindmapRootTopic = String(payload.rootTopic);

        var mindClone = cloneMind(payload.mind);
        if (mindClone && mindClone.data) {
            global.tcMindmapExternalMindData = mindClone;
            global.tcMindmapCommittedExternalMind = cloneMind(mindClone);
            if (typeof global.window !== 'undefined') {
                global.window.tcMindmapExternalMindData = global.tcMindmapExternalMindData;
                global.window.tcMindmapCommittedExternalMind = global.tcMindmapCommittedExternalMind;
            }
        } else if (typeof global.buildTcMindmapMindData === 'function') {
            var built = global.buildTcMindmapMindData();
            global.tcMindmapExternalMindData = built;
            global.tcMindmapCommittedExternalMind = cloneMind(built);
            if (typeof global.window !== 'undefined') {
                global.window.tcMindmapExternalMindData = built;
                global.window.tcMindmapCommittedExternalMind = global.tcMindmapCommittedExternalMind;
            }
        }

        global.tcMindmapPendingViewTransform = payload.viewTransform || null;
        global.tcMindmapSkipCacheRestore = true;
        global.tcMindmapHistory = [];
        global.tcMindmapHistoryIndex = 0;
        global.tcMindmapUndoStack = [];

        if (typeof global.tcSyncWorkbenchGlobals === 'function') global.tcSyncWorkbenchGlobals();

        if (!opts.deferRender) {
            var onMindmapView = typeof global.tcRightViewMode !== 'undefined' && global.tcRightViewMode === 'mindmap';
            if (!opts.skipViewSwitch && typeof global.switchTcRightView === 'function') {
                global.switchTcRightView('mindmap');
                onMindmapView = true;
            } else if (onMindmapView) {
                if (typeof global.tcMindmapReleaseInstance === 'function') global.tcMindmapReleaseInstance();
                if (typeof global.tcMindmapRenderWhenReady === 'function') {
                    global.tcMindmapRenderWhenReady();
                } else if (typeof global.renderTcMindmap === 'function') {
                    global.renderTcMindmap();
                }
            }
        }

        if (typeof global.tcMindmapPersistCache === 'function') {
            global.setTimeout(function () { global.tcMindmapPersistCache(); }, 200);
        }
        return true;
    }

    function clearSessionForPageSwitch() {
        _activeKey = '';
        global.tcMindmapCasesData = [];
        if (typeof global.tcMindmapCasesProvenance !== 'undefined') global.tcMindmapCasesProvenance = [];
        global.tcMindmapExternalMindData = null;
        global.tcMindmapCommittedExternalMind = null;
        if (typeof global.window !== 'undefined') {
            global.window.tcMindmapExternalMindData = null;
            global.window.tcMindmapCommittedExternalMind = null;
        }
        global.tcMindmapSkipCacheRestore = true;
        global.tcMindmapCachedMindPayload = null;
        if (typeof global.tcMindmapClearCache === 'function') global.tcMindmapClearCache();
        if (typeof global.tcMindmapReleaseInstance === 'function') global.tcMindmapReleaseInstance();
    }

    function prefetchForContext(ctx) {
        ctx = normalizeCtxForMindmap(ctx);
        var key = buildContextKey(ctx);
        if (!ctx || !key || !ctx.lanhu_url || !ctx.lanhu_page_id) {
            return Promise.resolve(false);
        }
        _activeKey = key;
        var seq = (_loadSeqByKey[key] || 0) + 1;
        _loadSeqByKey[key] = seq;
        var apiBaseUrl = stripPageIdFromLanhuUrl(ctx.lanhu_url) || ctx.lanhu_url;
        var q = '/api/test-cases/requirement-mindmaps?lanhu_url=' +
            encodeURIComponent(apiBaseUrl) +
            '&page_id=' + encodeURIComponent(String(ctx.lanhu_page_id)) +
            '&_ts=' + Date.now();
        return fetch(q, { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (_loadSeqByKey[key] !== seq) return false;
                if (!d.ok || !d.found || !d.data || !d.data.payload) {
                    delete _cachedByKey[key];
                    return false;
                }
                _cachedByKey[key] = {
                    payload: d.data.payload,
                    templateId: d.data.template_id ? String(d.data.template_id) : '',
                    updatedAt: d.data.updated_at || ''
                };
                return true;
            })
            .catch(function () { return false; });
    }

    function tryApplyCachedForContext(ctx, opts) {
        opts = opts || {};
        ctx = normalizeCtxForMindmap(ctx);
        var key = buildContextKey(ctx);
        if (!key) return false;
        var cached = _cachedByKey[key];
        if (!cached || !cached.payload) return false;
        if (!opts.force && mindmapHasRestorableMindInMemory()) return false;
        var applied = applyRequirementMindmapPayload(cached.payload, {
            skipViewSwitch: true,
            deferRender: opts.deferRender !== false
        });
        if (applied) _activeKey = key;
        return applied;
    }

    function tryApplyCachedForActivePage(opts) {
        return tryApplyCachedForContext(null, opts || {});
    }


    function ensureLoadedForActivePage(opts) {
        opts = opts || {};
        if (tryApplyCachedForActivePage(opts)) return Promise.resolve(true);
        var ctx = normalizeCtxForMindmap(null);
        return prefetchForContext(ctx).then(function (found) {
            if (!found) return false;
            if (tryApplyCachedForContext(ctx, opts)) return true;
            return tryApplyCachedForContext(ctx, Object.assign({}, opts, { force: true }));
        });
    }

    function persistNow(source, opts) {
        opts = opts || {};
        source = source || 'manual_edit';
        var ctx = opts.ctx || resolveCtx({});
        var key = buildContextKey(ctx);
        if (!ctx || !key || !ctx.lanhu_url || !ctx.lanhu_page_id) return Promise.resolve(null);
        if (!mindmapHasPersistableContent()) return Promise.resolve(null);

        if (typeof global.tcMindmapSyncExternalMindFromInstance === 'function') {
            global.tcMindmapSyncExternalMindFromInstance();
        }
        var payload = collectMindmapPayload();
        if (!payload) return Promise.resolve(null);

        var body = {
            lanhu_url: ctx.lanhu_url,
            page_id: ctx.lanhu_page_id,
            lanhu_page_id: ctx.lanhu_page_id,
            page_name: ctx.page_name || '',
            template_id: (typeof global.tcActiveTemplateId !== 'undefined' ? global.tcActiveTemplateId : null),
            source: source,
            payload: payload
        };
        return fetch('/api/test-cases/requirement-mindmaps', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d.ok) return null;
                _cachedByKey[key] = {
                    payload: payload,
                    templateId: body.template_id ? String(body.template_id) : '',
                    updatedAt: (d.saved && d.saved.updated_at) || ''
                };
                _activeKey = key;
                return d.saved || null;
            })
            .catch(function () { return null; });
    }

    function persistActivePageBeforeLeave(opts) {
        opts = opts || {};
        return persistNow(opts.source || 'manual_edit', { ctx: opts.ctx });
    }

    function persistAfterAiConvert() {
        return persistNow('ai_table_convert', {});
    }

    /** 表格视图加载钩子：不预取思维导图（仅在切到思维导图 Tab 时 loadForMindmapTabView 请求） */
    function onTablePageLoaded(ctx) {
        return Promise.resolve(false);
    }

    /**
     * 仅在用户切换到思维导图 Tab 时调用：按需请求接口并 hydrate 内存（不切换视图、不渲染）。
     */
    function loadForMindmapTabView(opts) {
        opts = opts || {};
        if (!opts.force && mindmapHasRestorableMindInMemory()) {
            return Promise.resolve(true);
        }
        var ctx = normalizeCtxForMindmap(null);
        if (!ctx) return Promise.resolve(false);
        return prefetchForContext(ctx).then(function (found) {
            if (!found) return false;
            if (tryApplyCachedForContext(ctx, {
                deferRender: opts.deferRender !== false,
                force: true
            })) {
                return true;
            }
            return false;
        });
    }

    global.TcRequirementMindmapStore = {
        buildContextKey: buildContextKey,
        clearSessionForPageSwitch: clearSessionForPageSwitch,
        prefetchForContext: prefetchForContext,
        tryApplyCachedForActivePage: tryApplyCachedForActivePage,
        tryApplyCachedForContext: tryApplyCachedForContext,
        mindmapHasRestorableMindInMemory: mindmapHasRestorableMindInMemory,
        mindmapNeedsDbRestore: mindmapNeedsDbRestore,
        applyRequirementMindmapPayload: applyRequirementMindmapPayload,
        persistNow: persistNow,
        persistActivePageBeforeLeave: persistActivePageBeforeLeave,
        persistAfterAiConvert: persistAfterAiConvert,
        onTablePageLoaded: onTablePageLoaded,
        loadForMindmapTabView: loadForMindmapTabView,
        ensureLoadedForActivePage: ensureLoadedForActivePage
    };
})(typeof window !== 'undefined' ? window : globalThis);
