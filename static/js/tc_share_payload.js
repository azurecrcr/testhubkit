/**
 * 用例工作台 · 分享评审实时快照采集（与暂存功能无关）
 */
(function (global) {
    'use strict';

    function isTcTableViewActive() {
        return typeof tcRightViewMode === 'undefined' || tcRightViewMode !== 'mindmap';
    }

    function getTcActiveViewScope() {
        return (typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap') ? 'mindmap' : 'table';
    }

    function tcGetActiveTemplateMeta() {
        var tid = typeof tcActiveTemplateId !== 'undefined' ? tcActiveTemplateId : null;
        var name = '';
        if (tid && typeof TC_CASE_TEMPLATES !== 'undefined' && TC_CASE_TEMPLATES.length) {
            var tpl = TC_CASE_TEMPLATES.find(function (t) { return t.id === tid; });
            if (tpl && tpl.name) name = String(tpl.name);
        }
        return { template_id: tid || null, template_name: name || null };
    }

    function tcInferTemplateIdFromColumns(columns) {
        var cols = Array.isArray(columns) ? columns.map(function (c) { return String(c); }) : [];
        if (!cols.length || typeof TC_CASE_TEMPLATES === 'undefined' || !TC_CASE_TEMPLATES.length) return null;
        var sig = JSON.stringify(cols);
        for (var i = 0; i < TC_CASE_TEMPLATES.length; i++) {
            var t = TC_CASE_TEMPLATES[i];
            if (!t || !Array.isArray(t.columns)) continue;
            if (JSON.stringify(t.columns.map(function (c) { return String(c); })) === sig) return t.id;
        }
        return null;
    }

    function tcEnrichSharePayloadTemplate(payload) {
        if (!payload || typeof payload !== 'object') return payload;
        if (!payload.template_id) {
            var inferred = tcInferTemplateIdFromColumns(payload.columns);
            if (inferred) {
                payload.template_id = inferred;
                if (typeof TC_CASE_TEMPLATES !== 'undefined') {
                    var tpl = TC_CASE_TEMPLATES.find(function (t) { return t.id === inferred; });
                    if (tpl && tpl.name) payload.template_name = tpl.name;
                }
            }
        } else if (!payload.template_name && typeof TC_CASE_TEMPLATES !== 'undefined') {
            var tpl2 = TC_CASE_TEMPLATES.find(function (t) { return t.id === payload.template_id; });
            if (tpl2 && tpl2.name) payload.template_name = tpl2.name;
        }
        return payload;
    }

    function syncTableLayoutForShare(opts) {
        opts = opts || {};
        var pullRows = opts.pullRows !== false && isTcTableViewActive();
        try {
            if (typeof commitTableCellEdit === 'function' && typeof tcEditingCell !== 'undefined' && tcEditingCell) {
                commitTableCellEdit(true);
            }
        } catch (e0) { /* ignore */ }
        try {
            var bridge = global.TcTableView && global.TcTableView._bridge;
            if (bridge) {
                if (pullRows) {
                    if (typeof bridge.syncToGlobalForStash === 'function') {
                        bridge.syncToGlobalForStash();
                    } else if (typeof bridge.pullToGlobal === 'function') {
                        bridge.pullToGlobal({ skipVueSync: true });
                    }
                }
                if (typeof bridge.syncLayoutToGlobal === 'function') {
                    bridge.syncLayoutToGlobal();
                }
            }
        } catch (e1) { /* ignore */ }
    }

    function collectTcTableSharePayload() {
        syncTableLayoutForShare({ pullRows: isTcTableViewActive() });
        var cols = (typeof tableColumns !== 'undefined' ? tableColumns : []).map(function (c) { return String(c); });
        var n = cols.length;
        var source = typeof testCasesData !== 'undefined' ? testCasesData : [];
        var rows = source.map(function (row) {
            var out = [];
            for (var i = 0; i < n; i++) {
                out.push(String(row[i] != null ? row[i] : ''));
            }
            return out;
        });
        var tplMeta = tcGetActiveTemplateMeta();
        var prov = [];
        if (typeof tcProvenanceArrayForStashPayload === 'function') {
            prov = tcProvenanceArrayForStashPayload(rows.length);
        } else if (typeof testCasesProvenance !== 'undefined' && testCasesProvenance) {
            prov = testCasesProvenance.slice();
        }
        return {
            scope: 'table',
            template_id: tplMeta.template_id,
            template_name: tplMeta.template_name,
            columns: cols,
            rows: rows,
            provenance: prov,
            columnVisible: Object.assign({}, typeof columnVisible !== 'undefined' ? columnVisible : {}),
            columnWidth: Object.assign({}, typeof columnWidth !== 'undefined' ? columnWidth : {}),
            rowHeights: Object.assign({}, typeof rowHeights !== 'undefined' ? rowHeights : {})
        };
    }

    function collectTcMindmapSharePayload(opts) {
        opts = opts || {};
        if (typeof ensureTcMindmapGenerateColumns === 'function') {
            ensureTcMindmapGenerateColumns();
        }
        var mind = typeof tcMindmapCaptureMindSnapshot === 'function' ? tcMindmapCaptureMindSnapshot() : null;
        var cols = (typeof tableColumns !== 'undefined' ? tableColumns : []).map(function (c) { return String(c); });
        var n = cols.length;
        var sourceRows = (typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData && tcMindmapCasesData.length)
            ? tcMindmapCasesData
            : (opts.allowTableRowFallback === true && typeof testCasesData !== 'undefined' ? testCasesData : []);
        var rows = (sourceRows || []).map(function (row) {
            var out = [];
            for (var i = 0; i < n; i++) {
                out.push(String(row[i] != null ? row[i] : ''));
            }
            return out;
        });
        var viewTransform = null;
        if (global.TcSmmEditor && typeof global.TcSmmEditor.captureViewTransform === 'function') {
            viewTransform = global.TcSmmEditor.captureViewTransform();
        }
        var tplMeta = tcGetActiveTemplateMeta();
        var prov = [];
        if (typeof tcMindmapProvenanceArrayForStashPayload === 'function') {
            prov = tcMindmapProvenanceArrayForStashPayload(rows.length);
        }
        return {
            scope: 'mindmap',
            template_id: tplMeta.template_id,
            template_name: tplMeta.template_name,
            columns: cols,
            rows: rows,
            provenance: prov,
            rootTopic: typeof tcMindmapRootTopic !== 'undefined' ? String(tcMindmapRootTopic || '') : '',
            mind: mind,
            viewTransform: viewTransform
        };
    }

    function tcBuildDefaultSharePayload() {
        var cols = (typeof defaultTableColumns !== 'undefined' && defaultTableColumns && defaultTableColumns.length)
            ? defaultTableColumns.slice().map(function (c) { return String(c); })
            : ['用例名称', '所属模块', '标签', '前置条件', '步骤描述', '预期结果', '编辑模式', '备注', '用例等级'];
        return {
            scope: 'table',
            template_id: null,
            template_name: null,
            columns: cols,
            rows: [cols.map(function () { return ''; })],
            columnVisible: {},
            columnWidth: {},
            rowHeights: {}
        };
    }

    function tcCollectLiveSharePayload() {
        var payload = null;
        if (getTcActiveViewScope() === 'mindmap') {
            try {
                payload = collectTcMindmapSharePayload();
            } catch (eMind) {
                payload = null;
            }
        } else if (typeof tableColumns !== 'undefined' && tableColumns && tableColumns.length) {
            try {
                payload = collectTcTableSharePayload();
            } catch (eTable) {
                payload = null;
            }
        }
        if (!payload || !payload.columns || !payload.columns.length) {
            return tcBuildDefaultSharePayload();
        }
        if (!payload.rows || !payload.rows.length) {
            payload.rows = [payload.columns.map(function () { return ''; })];
        }
        if (payload.provenance && payload.provenance.length !== payload.rows.length) {
            payload.provenance = payload.rows.map(function () { return null; });
        }
        return tcEnrichSharePayloadTemplate(payload);
    }

    function mindmapHasShareableContent() {
        if (typeof tcMindmapCaptureMindSnapshot === 'function') {
            var snap = tcMindmapCaptureMindSnapshot();
            if (snap && snap.data && Array.isArray(snap.data.children) && snap.data.children.length) return true;
        }
        if (typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData && tcMindmapCasesData.length) {
            for (var i = 0; i < tcMindmapCasesData.length; i++) {
                var row = tcMindmapCasesData[i];
                if (row && row.some(function (cell) { return String(cell || '').trim(); })) return true;
            }
        }
        return false;
    }

    function getTcShareBlockReason() {
        if (getTcActiveViewScope() === 'mindmap') {
            if (!mindmapHasShareableContent()) {
                return '请先在思维导图中添加用例后再分享评审。';
            }
            return '';
        }
        if (typeof tcTableTemplateApplied !== 'undefined' && !tcTableTemplateApplied) {
            return '请先点击表格中的「选择模板」应用表头后再分享评审。';
        }
        if (typeof tableColumns === 'undefined' || !tableColumns.length) {
            return '请先应用模板后再分享评审。';
        }
        if (typeof tcTableHasUserCaseData === 'function' && !tcTableHasUserCaseData()) {
            return '请添加用例内容后再分享评审。';
        }
        return '';
    }

    global.tcBuildDefaultSharePayload = tcBuildDefaultSharePayload;
    global.tcCollectLiveSharePayload = tcCollectLiveSharePayload;
    global.tcEnrichSharePayloadTemplate = tcEnrichSharePayloadTemplate;
    global.tcEnrichStashPayloadTemplate = tcEnrichSharePayloadTemplate;
    global.tcInferTemplateIdFromColumns = tcInferTemplateIdFromColumns;
    global.getTcShareBlockReason = getTcShareBlockReason;
})(typeof window !== 'undefined' ? window : this);
