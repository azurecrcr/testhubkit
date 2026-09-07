/**
 * TestHub — 思维导图数据层（与渲染库无关，Simple Mind Map 共用）
 */

var TC_MINDMAP_FIXED_ROOT_TOPIC = '测试用例';
var TC_MINDMAP_DEFAULT_ROOT_ICON_FALLBACK = 'progress_1';

function resolveTcMindmapFixedRootTopic() {
    return TC_MINDMAP_FIXED_ROOT_TOPIC;
}

/** 优先使用 simple-mind-map 内置 iconList 的首个图标（type_name 格式） */
function resolveTcMindmapDefaultRootIcon() {
    var fallback = TC_MINDMAP_DEFAULT_ROOT_ICON_FALLBACK;
    try {
        var smm = typeof simpleMindMap !== 'undefined' ? simpleMindMap : null;
        var list = smm && smm.iconList;
        if (list && list.length) {
            for (var i = 0; i < list.length; i++) {
                var grp = list[i];
                if (grp && grp.type && grp.list && grp.list.length && grp.list[0].name != null) {
                    return String(grp.type) + '_' + String(grp.list[0].name);
                }
            }
        }
    } catch (e) { /* ignore */ }
    return fallback;
}

function tcMindmapHasRenderableContent() {
    if (tcMindmapCasesData.length) return true;
    if (tcMindmapExternalMindData && tcMindmapExternalMindData.data) {
        var ch = tcMindmapExternalMindData.data.children;
        if (Array.isArray(ch) && ch.length) return true;
    }
    if (typeof tcMindmapCommittedExternalMind !== 'undefined' && tcMindmapCommittedExternalMind && tcMindmapCommittedExternalMind.data) {
        var ch2 = tcMindmapCommittedExternalMind.data.children;
        if (Array.isArray(ch2) && ch2.length) return true;
    }
    return false;
}

/** 表格已选模板/有列配置但尚无导图内容时，展示带默认图标的根节点骨架 */
function tcMindmapShouldApplyDefaultRootIcon() {
    if (tcMindmapHasRenderableContent()) return false;
    return !!(tableColumns && tableColumns.length);
}

function tcMindmapBuildRootNodeMeta(extra) {
    var meta = Object.assign({ tcType: 'root' }, extra || {});
    if (tcMindmapShouldApplyDefaultRootIcon()) {
        meta.icon = [resolveTcMindmapDefaultRootIcon()];
    }
    return meta;
}

function tcMindmapEnsureRootVisualDefaults(rootNode) {
    if (!rootNode) return;
    var nodeId = rootNode.id || (rootNode.data && rootNode.data.uid);
    if (nodeId !== 'tc_root') return;
    var fixedTopic = resolveTcMindmapFixedRootTopic();
    rootNode.topic = fixedTopic;
    tcMindmapRootTopic = fixedTopic;
    if (!rootNode.data || typeof rootNode.data !== 'object') rootNode.data = { tcType: 'root' };
    if (rootNode.data.tcType == null) rootNode.data.tcType = 'root';
    if (tcMindmapShouldApplyDefaultRootIcon()) {
        var iconKey = resolveTcMindmapDefaultRootIcon();
        if (!rootNode.data.icon || !rootNode.data.icon.length) {
            rootNode.data.icon = [iconKey];
        }
    }
}

function resolveTcModuleColumnIndex() {
    var candidates = ['所属模块', '模块', '所属产品', '组件', '目录'];
    for (var i = 0; i < candidates.length; i++) {
        var idx = tableColumns.indexOf(candidates[i]);
        if (idx >= 0) return idx;
    }
    return getTcColumnIndex('所属模块', 1);
}

function resolveTcMindmapNameColumnIndex() {
    if (typeof resolveTcCaseNameColumnIndex === 'function') return resolveTcCaseNameColumnIndex();
    var candidates = ['用例名称', '用例标题', '用例摘要', '标题'];
    for (var i = 0; i < candidates.length; i++) {
        var idx = tableColumns.indexOf(candidates[i]);
        if (idx >= 0) return idx;
    }
    return getTcColumnIndex('用例名称', 0);
}

function tcMindmapNewNodeId(prefix) {
    if (typeof tcMindmapIdSeq === 'undefined') window.tcMindmapIdSeq = 0;
    tcMindmapIdSeq += 1;
    return prefix + '_' + Date.now() + '_' + tcMindmapIdSeq;
}

function parseTcMindmapModuleTopic(topic) {
    var s = String(topic != null ? topic : '').trim();
    var m = s.match(/^(.+?)\s*\(\d+\)\s*$/);
    return (m ? m[1] : s).trim() || '未分类';
}

function parseTcMindmapLeafTopic(topic) {
    var s = String(topic != null ? topic : '').trim();
    if (!s) return { name: '', level: '' };
    var m = s.match(/^(.+?)\s*\[(P[0-3])\]\s*$/i);
    if (m) return { name: m[1].trim(), level: m[2].toUpperCase() };
    return { name: s, level: '' };
}

function formatTcMindmapLeafTopic(row) {
    var nameIdx = resolveTcMindmapNameColumnIndex();
    var levelIdx = getTcColumnIndex('用例等级', tableColumns.length - 1);
    if (levelIdx < 0 || levelIdx >= tableColumns.length) {
        var priCandidates = ['用例等级', '优先级', '用例类型'];
        levelIdx = tableColumns.length - 1;
        for (var pi = 0; pi < priCandidates.length; pi++) {
            var pidx = tableColumns.indexOf(priCandidates[pi]);
            if (pidx >= 0) { levelIdx = pidx; break; }
        }
    }
    var name = truncateTcMindmapTopic(row[nameIdx], 48);
    var level = String(row[levelIdx] != null ? row[levelIdx] : '').trim();
    if (!String(name).trim()) return TC_MINDMAP_EMPTY_TOPIC;
    return level ? name + ' [' + level + ']' : name;
}

function tcMindmapIsEmptyTopic(topic) {
    var s = String(topic != null ? topic : '').replace(/\u200b/g, '').trim();
    return !s;
}

function formatTcMindmapModuleTopic(moduleName) {
    var s = parseTcMindmapModuleTopic(String(moduleName != null ? moduleName : ''));
    var parts = tcMindmapSplitModulePath(s);
    if (parts.length) return parts[parts.length - 1];
    return s || '未分类';
}

function tcMindmapSplitModulePath(modStr) {
    var s = String(modStr != null ? modStr : '').trim();
    if (!s) return [];
    return s.split(/\s*[\/／>→]\s*|\s+\/\s+/).map(function(p) { return p.trim(); }).filter(Boolean);
}

function tcMindmapStableBranchId(path) {
    var s = String(path != null ? path : '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return 'tc_br_' + Math.abs(h);
}

function tcMindmapEnsureBranchEntry(parent, key, fullPath) {
    if (!parent[key]) {
        parent[key] = { _order: [], _path: fullPath, _id: tcMindmapStableBranchId(fullPath) };
        parent._order.push(key);
    }
    return parent[key];
}

function tcMindmapMakeLeafNode(row, rowIndex, modulePath) {
    var nameIdx = resolveTcMindmapNameColumnIndex();
    var levelIdx = getTcColumnIndex('用例等级', tableColumns.length - 1);
    if (levelIdx < 0 || levelIdx >= tableColumns.length) {
        var priCandidates = ['用例等级', '优先级', '用例类型'];
        levelIdx = tableColumns.length - 1;
        for (var pi = 0; pi < priCandidates.length; pi++) {
            var pidx = tableColumns.indexOf(priCandidates[pi]);
            if (pidx >= 0) { levelIdx = pidx; break; }
        }
    }
    var name = truncateTcMindmapTopic(row[nameIdx], 48);
    var level = String(row[levelIdx] != null ? row[levelIdx] : '').trim();
    var style = getTcPriorityStyle(level);
    return {
        id: 'tc_leaf_' + rowIndex,
        topic: level ? name + ' [' + level + ']' : name,
        expanded: true,
        data: Object.assign({}, style, {
            tcType: 'leaf',
            rowIndex: rowIndex,
            moduleName: modulePath,
            _tcRowRef: row
        }),
        children: []
    };
}

function tcMindmapBuildBranchNode(title, entry) {
    var path = entry._path || title;
    var childNodes = [];
    (entry._order || []).forEach(function (ck) {
        var sub = entry[ck];
        if (!sub) return;
        if (sub._leaf) childNodes.push(sub._leaf);
        else childNodes.push(tcMindmapBuildBranchNode(ck, sub));
    });
    (entry._leaves || []).forEach(function (leaf) { childNodes.push(leaf); });
    return {
        id: entry._id || tcMindmapStableBranchId(path),
        topic: formatTcMindmapModuleTopic(title),
        expanded: true,
        data: { tcType: 'module', moduleName: path },
        children: childNodes
    };
}

function tcMindmapBuildBranchChildren(branchMap) {
    var nodes = [];
    (branchMap._order || []).forEach(function (key) {
        var built = tcMindmapBuildBranchNode(key, branchMap[key]);
        if (built) nodes.push(built);
    });
    (branchMap._leaves || []).forEach(function (leaf) { nodes.push(leaf); });
    return nodes;
}

function tcMindmapMindHasUserNodes(mind) {
    if (!mind || !mind.data) return false;
    var root = mind.data;
    return !!(Array.isArray(root.children) && root.children.length);
}
window.tcMindmapMindHasUserNodes = tcMindmapMindHasUserNodes;

function buildTcMindmapMindData() {
    var moduleIdx = resolveTcModuleColumnIndex();
    var treeRoot = { _order: [], _path: '' };
    tcMindmapCasesData.forEach(function (row, rowIndex) {
        var modStr = String(row[moduleIdx] != null ? row[moduleIdx] : '').trim();
        var parts = modStr ? tcMindmapSplitModulePath(modStr) : [];
        if (!parts.length) parts = ['未分类'];
        var cursor = treeRoot;
        var pathAcc = [];
        parts.forEach(function (part) {
            pathAcc.push(part);
            cursor = tcMindmapEnsureBranchEntry(cursor, part, pathAcc.join(' / '));
        });
        var modulePath = parts.join(' / ');
        var leaf = tcMindmapMakeLeafNode(row, rowIndex, modulePath);
        if (!cursor._leaves) cursor._leaves = [];
        cursor._leaves.push(leaf);
    });
    var children = tcMindmapBuildBranchChildren(treeRoot);
    var rootTitle = resolveTcMindmapFixedRootTopic();
    tcMindmapRootTopic = rootTitle;
    return {
        meta: { name: 'TestHub', author: 'TestHub', version: '1.0' },
        format: 'node_tree',
        data: {
            id: 'tc_root',
            topic: rootTitle,
            expanded: true,
            data: tcMindmapBuildRootNodeMeta(),
            children: children
        }
    };
}

function tcMindmapRowHasCaseContent(row) {
    if (!row || !row.length) return false;
    if (typeof tcTableRowHasCaseContent === 'function') return tcTableRowHasCaseContent(row);
    for (var i = 0; i < row.length; i++) {
        if (String(row[i] != null ? row[i] : '').trim()) return true;
    }
    return false;
}

function tcMindmapExtractRowsFromMindNode(node, moduleParts, outRows) {
    if (!node) return;
    var meta = (node.data && typeof node.data === 'object') ? node.data : {};
    var children = node.children || [];
    var isLeaf = meta.tcType === 'leaf' || (meta.rowIndex != null && !children.length);
    if (isLeaf) {
        if (Array.isArray(meta._tcRowRef) && meta._tcRowRef.length) {
            outRows.push(tableColumns.map(function (_, idx) {
                return String(meta._tcRowRef[idx] != null ? meta._tcRowRef[idx] : '');
            }));
            return;
        }
        if (meta.rowIndex != null && tcMindmapCasesData[meta.rowIndex]) {
            outRows.push(tcMindmapCasesData[meta.rowIndex].map(function (cell) {
                return String(cell != null ? cell : '');
            }));
            return;
        }
        var parsed = parseTcMindmapLeafTopic(node.topic);
        var row = tableColumns.map(function () { return ''; });
        var nameCol = resolveTcMindmapNameColumnIndex();
        var modCol = resolveTcModuleColumnIndex();
        row[nameCol] = parsed.name || tcMindmapCleanOutlineTitle(node.topic);
        row[modCol] = String(meta.moduleName || (moduleParts || []).join(' / ') || '').trim() || '未分类';
        if (parsed.level) {
            var levelCol = getTcColumnIndex('用例等级', -1);
            if (levelCol >= 0) row[levelCol] = parsed.level;
        }
        outRows.push(row);
        return;
    }
    var modName = parseTcMindmapModuleTopic(node.topic);
    var nextParts = (moduleParts || []).slice();
    if (modName && modName !== resolveTcMindmapFixedRootTopic()) nextParts.push(modName);
    children.forEach(function (child) {
        tcMindmapExtractRowsFromMindNode(child, nextParts, outRows);
    });
}

function tcMindmapExtractRowsFromMind(mind) {
    mind = mind || (typeof tcMindmapCaptureMindSnapshot === 'function' ? tcMindmapCaptureMindSnapshot() : null);
    if (!mind || !mind.data) return [];
    var out = [];
    (mind.data.children || []).forEach(function (child) {
        tcMindmapExtractRowsFromMindNode(child, [], out);
    });
    return out.map(function (row) { return row.slice(); });
}

function tcMindmapClearAppendBaseline() {
    window._tcMindmapAppendBaselineRows = null;
    window._tcMindmapAppendBaselineCount = 0;
}

function tcMindmapPrepareAppendGeneration() {
    if (typeof tcMindmapSyncExternalMindFromInstance === 'function') {
        tcMindmapSyncExternalMindFromInstance();
    }
    var existing = tcMindmapCasesData.map(function (row) { return row.slice(); });
    var hasContent = existing.some(tcMindmapRowHasCaseContent);
    if (!hasContent) {
        var extracted = tcMindmapExtractRowsFromMind();
        if (extracted.length) {
            tcMindmapCasesData = extracted.map(function (row) { return row.slice(); });
            existing = tcMindmapCasesData.map(function (row) { return row.slice(); });
        }
    }
    window._tcMindmapAppendBaselineRows = existing.map(function (row) { return row.slice(); });
    window._tcMindmapAppendBaselineCount = existing.length;
    return existing.length;
}

function tcMindmapEnsureAppendBaselineIntact() {
    var baseline = window._tcMindmapAppendBaselineRows;
    var expected = parseInt(window._tcMindmapAppendBaselineCount, 10) || 0;
    if (!expected || !baseline || !baseline.length) return;
    if (tcMindmapCasesData.length >= expected) return;
    var extras = tcMindmapCasesData.map(function (row) { return row.slice(); });
    tcMindmapCasesData = baseline.map(function (row) { return row.slice(); });
    extras.forEach(function (row) {
        if (tcMindmapRowHasCaseContent(row)) tcMindmapCasesData.push(row.slice());
    });
}

function tcResolveMindmapGenerationBatchRowStart(mergeMode) {
    if (mergeMode === 'overwrite') return 0;
    if (typeof tcMindmapPrepareAppendGeneration === 'function') {
        tcMindmapPrepareAppendGeneration();
    }
    return tcMindmapCasesData ? tcMindmapCasesData.length : 0;
}
window.tcMindmapPrepareAppendGeneration = tcMindmapPrepareAppendGeneration;
window.tcMindmapEnsureAppendBaselineIntact = tcMindmapEnsureAppendBaselineIntact;
window.tcMindmapClearAppendBaseline = tcMindmapClearAppendBaseline;
window.tcResolveMindmapGenerationBatchRowStart = tcResolveMindmapGenerationBatchRowStart;

function getTcMindmapNodeMeta(node) {
    if (!node) return {};
    if (typeof node === 'string') return tcMindmapMetaById[node] || {};
    if (node.data && node.data.tcType) return node.data;
    if (node.data && typeof node.data === 'object') {
        var d = node.data;
        if (d.tcType || d.rowIndex != null) return d;
    }
    return tcMindmapMetaById[node.id] || {};
}
window.getTcMindmapNodeMeta = getTcMindmapNodeMeta;

function syncTcMindmapMetaCache() {
    tcMindmapMetaById = {};
    var root = tcMindmapInstance && tcMindmapInstance.mind && tcMindmapInstance.mind.root;
    if (!root) return;
    function walk(n) {
        if (!n || !n.id) return;
        var meta = n.data || {};
        tcMindmapMetaById[n.id] = Object.assign({}, meta);
        (n.children || []).forEach(walk);
    }
    walk(root);
}

function tcMindmapShouldShowEmptyPlaceholder() {
    if (tcMindmapGenerating && !tcMindmapCasesData.length) return false;
    if (tcMindmapCasesData.length) return false;
    /* 已选模板/有列配置：展示根节点骨架（测试用例 + 默认图标），不显示空占位 */
    if (tableColumns && tableColumns.length) return false;
    if (tcMindmapExternalMindData && tcMindmapExternalMindData.data) {
        var ch = tcMindmapExternalMindData.data.children;
        if (Array.isArray(ch) && ch.length) return false;
    }
    return true;
}

function tcMindmapCaptureMindSnapshot() {
    var live = null;
    if (window.TcSmmEditor && typeof TcSmmEditor.captureMindSnapshot === 'function') {
        live = TcSmmEditor.captureMindSnapshot();
    }
    if (live && live.data) return live;
    var ext = typeof tcMindmapExternalMindData !== 'undefined' ? tcMindmapExternalMindData : null;
    if ((!ext || !ext.data) && typeof tcMindmapCommittedExternalMind !== 'undefined') {
        ext = tcMindmapCommittedExternalMind;
    }
    if (ext && ext.data) {
        try { return JSON.parse(JSON.stringify(ext)); } catch (eExt) { return ext; }
    }
    if (tableColumns && tableColumns.length) return buildTcMindmapMindData();
    if (!tcMindmapCasesData.length) return null;
    return buildTcMindmapMindData();
}

function tcMindmapCloneSnapshot(snap) {
    if (!snap || !snap.rows) return { rows: [] };
    var out = { rows: snap.rows.map(function (r) { return r.slice(); }) };
    if (snap.mind) {
        try { out.mind = JSON.parse(JSON.stringify(snap.mind)); } catch (e) { /* ignore */ }
    }
    return out;
}

function tcMindmapEnsureHistoryReady() {
    if (tcMindmapHistory.length) return;
    tcMindmapInitHistoryFromCurrent();
}

function tcMindmapInitHistoryFromCurrent() {
    var snap = { rows: tcMindmapCasesData.map(function (r) { return r.slice(); }) };
    tcMindmapHistory = [snap];
    tcMindmapHistoryIndex = 0;
    tcMindmapUndoStack = [snap];
}

function tcMindmapCaptureUndoBaseline() {
    tcMindmapUndoBaseline = tcMindmapCloneSnapshot({ rows: tcMindmapCasesData.map(function (r) { return r.slice(); }) });
}

function tcMindmapPersistCacheNow() {
    if (!tableColumns.length || tcMindmapGenerating) return;
    tcMindmapEnsurePageSessionForCache();
    syncTcMindmapMetaCache();
    try {
        sessionStorage.setItem(TC_MINDMAP_CACHE_KEY, JSON.stringify({
            pageSession: tcMindmapPageSessionId,
            columns: tableColumns.slice(),
            templateApplied: tcTableTemplateApplied,
            activeTemplateId: tcActiveTemplateId,
            rows: tcMindmapCasesData.map(function (r) { return r.slice(); }),
            rootTopic: tcMindmapRootTopic,
            mind: tcMindmapCaptureMindSnapshot(),
            undoBaseline: tcMindmapUndoBaseline,
            undoStack: tcMindmapUndoStack.slice(-TC_MINDMAP_UNDO_MAX),
            undoHistory: tcMindmapHistory.map(function (s) { return tcMindmapCloneSnapshot(s); }),
            undoHistoryIndex: tcMindmapHistoryIndex,
            savedAt: Date.now()
        }));
    } catch (e) { /* ignore quota */ }
}

function tcMindmapSchedulePersistCache(flush) {
    if (flush) {
        if (tcMindmapPersistCacheTimer) clearTimeout(tcMindmapPersistCacheTimer);
        tcMindmapPersistCacheTimer = null;
        tcMindmapPersistCacheNow();
        return;
    }
    if (tcMindmapPersistCacheTimer) return;
    tcMindmapPersistCacheTimer = window.setTimeout(function () {
        tcMindmapPersistCacheTimer = null;
        tcMindmapPersistCacheNow();
    }, 80);
}

function tcMindmapPersistCache() {
    tcMindmapSchedulePersistCache(true);
}

function tcMindmapCachePageSessionMatches(data) {
    return data && data.pageSession && data.pageSession === tcMindmapPageSessionId;
}

function tcMindmapEnsurePageSessionForCache() {
    if (!tcMindmapPageSessionId) {
        tcMindmapPageSessionId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
    }
}

function tcMindmapInitPageSession() {
    tcMindmapEnsurePageSessionForCache();
}

function tcMindmapLoadCache() {
    try {
        var raw = sessionStorage.getItem(TC_MINDMAP_CACHE_KEY);
        if (!raw) return false;
        var data = JSON.parse(raw);
        if (!tcMindmapCachePageSessionMatches(data)) return false;
        if (!data || !Array.isArray(data.rows)) return false;
        tcMindmapCachedMindPayload = null;
        if (data.mind) {
            try { tcMindmapCachedMindPayload = JSON.parse(JSON.stringify(data.mind)); } catch (e) { tcMindmapCachedMindPayload = null; }
        }
        if (Array.isArray(data.columns) && data.columns.length) {
            tableColumns = data.columns.slice();
            tcTableTemplateApplied = !!data.templateApplied;
            tcActiveTemplateId = data.activeTemplateId != null ? data.activeTemplateId : null;
            initColumnState();
            if (typeof renderTableHeader === 'function') renderTableHeader();
            if (typeof syncTcTableTemplateChrome === 'function') syncTcTableTemplateChrome();
        }
        tcMindmapCasesData = data.rows.map(function (r) { return r.slice(); });
        if (data.rootTopic) tcMindmapRootTopic = data.rootTopic;
        tcMindmapMetaById = {};
        return true;
    } catch (e) {
        return false;
    }
}

function tcMindmapClearCache() {
    tcMindmapCachedMindPayload = null;
    try { sessionStorage.removeItem(TC_MINDMAP_CACHE_KEY); } catch (e) { /* ignore */ }
}

function tcMindmapRestoreFromCacheIfNewer() {
    return tcMindmapLoadCache();
}

function tcMindmapRestoreCachedMindIfAny() {
    if (!tcMindmapCachedMindPayload || !tcMindmapCachedMindPayload.data) return false;
    tcMindmapExternalMindData = tcMindmapCachedMindPayload;
    tcMindmapCachedMindPayload = null;
    return true;
}

function initTcMindmapCacheLifecycle() {
    if (window._tcMindmapCacheLifecycleBound) return;
    window._tcMindmapCacheLifecycleBound = true;
    window.addEventListener('pagehide', function () { tcMindmapClearCache(); });
}

function tcMindmapCleanOutlineTitle(line) {
    return String(line != null ? line : '')
        .replace(/^\s*[-*•]\s*/, '')
        .replace(/\*\*/g, '')
        .trim();
}

function tcMindmapLineIndentCols(line) {
    var m = String(line != null ? line : '').match(/^(\s*)/);
    if (!m) return 0;
    var lead = m[1];
    var cols = 0;
    for (var i = 0; i < lead.length; i++) cols += lead.charAt(i) === '\t' ? 4 : 1;
    return cols;
}

var _TC_MINDMAP_THINKING_HEAD = /^(?:Here'?s a thinking process:|\*\*Analyze User Input:\*\*|Self-Correction|Output Generation|Proceeds\.?$|\[\s*Output Generation\s*\]|Final Output Generation|\[Done\])/i;
var _TC_MINDMAP_NOISE = /\b(the prompt says|It might be that|extremely specific|user actually wants|I will generate|I'll stick|Wait,|Let's re-read|Given the|To be safe)\b/i;

function tcMindmapIsNoiseLine(stripped) {
    var text = String(stripped != null ? stripped : '').trim();
    if (!text) return false;
    if (_TC_MINDMAP_THINKING_HEAD.test(text)) return true;
    if (_TC_MINDMAP_NOISE.test(text)) return true;
    if (/^(?:Wait|Let'?s|Actually|However|Maybe|Given |Check |Structure:|Level \d|I will|This is|Proceeds|Self-Correction|All constraints|Matches\.|Ready\.|Note:|One detail:|\*\*Input \d)/i.test(text)) {
        return true;
    }
    var letters = (text.match(/[A-Za-z]/g) || []).length;
    var chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    if (letters >= 24 && chinese <= 12) return true;
    if (text.length > 60 && letters > Math.max(1, chinese) * 3) return true;
    return false;
}

function tcMindmapIsObjectTitle(stripped) {
    var text = String(stripped != null ? stripped : '');
    var clean = text.replace(/\*\*/g, '').trim();
    if (!clean || tcMindmapIsNoiseLine(clean)) return false;
    if (!/[\u4e00-\u9fff]/.test(clean)) return false;
    if (/[A-Za-z]{3,}/.test(clean)) return false;
    if (/\*\*/.test(text) && /[\u4e00-\u9fff]+-[\u4e00-\u9fff]+/.test(clean)) return false;
    return /(?:功能|模块|场景)$/.test(clean) && clean.length >= 2 && clean.length <= 36;
}

function tcMindmapIsRootLine(line) {
    var stripped = String(line != null ? line : '').trim();
    var cols = tcMindmapLineIndentCols(line);
    if (cols !== 0 && cols !== 4) return false;
    return tcMindmapIsObjectTitle(stripped);
}

function tcMindmapIsOutlineLine(line) {
    var stripped = String(line != null ? line : '').trim();
    if (!stripped || tcMindmapIsNoiseLine(stripped)) return false;
    var cols = tcMindmapLineIndentCols(line);
    if (/^\s{8,}TC\s*[:：]/i.test(line)) {
        var caseName = line.replace(/^\s{8,}TC\s*[:：]\s*/i, '').trim();
        return !!caseName && !tcMindmapIsNoiseLine(caseName);
    }
    if (cols === 0 || (cols === 4 && tcMindmapIsObjectTitle(stripped))) return tcMindmapIsRootLine(line);
    if (cols === 4) {
        if (tcMindmapIsObjectTitle(stripped)) return true;
        var inner = stripped.replace(/\*\*/g, '').trim();
        return /[\u4e00-\u9fff]/.test(inner) && !/[A-Za-z]{4,}/.test(inner);
    }
    if (cols === 8) {
        return /[\u4e00-\u9fff]/.test(stripped) && !/[A-Za-z]{4,}/.test(stripped);
    }
    return false;
}

function tcMindmapExtractParseableText(text) {
    text = String(text != null ? text : '');
    if (!text.trim()) return text;
    if (!/TC\s*[:：]/i.test(text)) return text;

    var lines = text.split(/\r?\n/);
    var blocks = [];
    var current = [];

    function flushBlock() {
        if (current.length && current.some(function (ln) { return /TC\s*[:：]/i.test(ln); })) {
            blocks.push(current.slice());
        }
        current = [];
    }

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var stripped = String(line || '').trim();
        if (!stripped) {
            if (current.length) current.push(line);
            continue;
        }
        if (tcMindmapIsRootLine(line) && current.length) flushBlock();
        if (tcMindmapIsOutlineLine(line)) {
            current.push(line);
        } else if (current.length && tcMindmapIsNoiseLine(stripped)) {
            flushBlock();
        }
    }
    flushBlock();

    if (!blocks.length) {
        var kept = lines.filter(function (ln) { return tcMindmapIsOutlineLine(ln); });
        if (kept.length && kept.some(function (ln) { return /TC\s*[:：]/i.test(ln); })) {
            blocks = [kept];
        }
    }
    if (!blocks.length) return text;

    var best = blocks[0];
    var bestKey = [-1, -1];
    for (var b = 0; b < blocks.length; b++) {
        var block = blocks[b];
        var tcN = block.filter(function (ln) { return /TC\s*[:：]/i.test(ln); }).length;
        var key = [tcN, b];
        if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
            bestKey = key;
            best = block;
        }
    }

    var out = best.filter(function (ln) { return String(ln || '').trim(); }).join('\n');
    if (out && !/\n$/.test(out)) out += '\n';
    return out;
}

function tcMindmapOutlineIndentLevel(line) {
    var m = String(line != null ? line : '').match(/^(\s*)/);
    if (!m) return 0;
    return Math.floor(m[1].replace(/\t/g, '    ').length / 4);
}

function tcMindmapCommitEditing() {
    if (window.TcSmmEditor && typeof TcSmmEditor.commitTextEdit === 'function') TcSmmEditor.commitTextEdit();
}
function tcMindmapHideDeleteBtn() { /* no-op */ }
function tcMindmapClearMindSelection() { /* no-op */ }
var _tcMindmapProvRailBound = false;

function tcEnsureMindmapProvenanceRailEl() {
    var rail = document.getElementById('tc-mindmap-provenance-rail');
    if (rail) return rail;
    var stage = document.querySelector('.tc-mindmap-stage');
    if (!stage) return null;
    rail = document.createElement('div');
    rail.id = 'tc-mindmap-provenance-rail';
    rail.className = 'tc-provenance-rail tc-mindmap-provenance-rail hidden';
    rail.setAttribute('aria-hidden', 'true');
    stage.appendChild(rail);
    return rail;
}

function tcBindMindmapProvenanceRailEvents() {
    if (_tcMindmapProvRailBound) return;
    _tcMindmapProvRailBound = true;
    var syncHandler = function () { scheduleSyncTcMindmapProvenanceOverlay(); };
    window.addEventListener('resize', syncHandler);
    var panel = document.getElementById('tc-mindmap-view-panel');
    if (panel && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(syncHandler).observe(panel);
    }
    var stage = document.querySelector('.tc-mindmap-stage');
    if (stage && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(syncHandler).observe(stage);
    }
}

function scheduleSyncTcMindmapProvenanceOverlay() {
    if (typeof window.requestAnimationFrame !== 'function') {
        syncTcMindmapProvenanceOverlay();
        return;
    }
    window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
            syncTcMindmapProvenanceOverlay();
        });
    });
}

function syncTcMindmapProvenanceOverlay() {
    var rail = tcEnsureMindmapProvenanceRailEl();
    if (!rail) return;
    tcBindMindmapProvenanceRailEvents();
    rail.innerHTML = '';
    if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode !== 'mindmap') {
        rail.classList.add('hidden');
        rail.setAttribute('aria-hidden', 'true');
        if (typeof hideTcProvenanceTip === 'function') hideTcProvenanceTip();
        return;
    }
    if (typeof tcEnsureMindmapProvenanceLength === 'function') tcEnsureMindmapProvenanceLength();
    var findDom = window.TcSmmEditor && typeof TcSmmEditor.findNodeDomByUid === 'function'
        ? TcSmmEditor.findNodeDomByUid.bind(TcSmmEditor) : null;
    if (!findDom) {
        rail.classList.add('hidden');
        rail.setAttribute('aria-hidden', 'true');
        return;
    }
    var stage = document.querySelector('.tc-mindmap-stage');
    rail.style.position = 'absolute';
    rail.style.top = '0';
    rail.style.right = '0.4rem';
    rail.style.width = '1.25rem';
    rail.style.height = (stage && stage.clientHeight ? stage.clientHeight + 'px' : '100%');
    rail.style.bottom = 'auto';
    rail.style.pointerEvents = 'none';
    rail.style.zIndex = '6';
    var hasAny = false;
    var rowCount = typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData ? tcMindmapCasesData.length : 0;
    for (var idx = 0; idx < rowCount; idx++) {
        if (typeof tcHasMindmapRowProvenance !== 'function' || !tcHasMindmapRowProvenance(idx)) continue;
        var nodeEl = findDom('tc_leaf_' + idx);
        if (!nodeEl || !nodeEl.getBoundingClientRect) continue;
        hasAny = true;
        var nodeRect = nodeEl.getBoundingClientRect();
        var railRect = rail.getBoundingClientRect();
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tc-provenance-rail__btn';
        btn.setAttribute('aria-label', '查看生成来源');
        btn.setAttribute('data-mindmap-row-index', String(idx));
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"></circle></svg>';
        rail.appendChild(btn);
        var railH = rail.clientHeight || 0;
        var btnTop = nodeRect.top - railRect.top + nodeRect.height / 2 - 9;
        btn.style.top = Math.max(0, Math.min(btnTop, Math.max(0, railH - 18))) + 'px';
        btn.style.left = '50%';
        btn.style.transform = 'translateX(-50%)';
        (function (rowIdx, button) {
            var entry = tcMindmapCasesProvenance[rowIdx];
            button.addEventListener('mouseenter', function () {
                if (typeof showTcProvenanceTipForEntry === 'function') showTcProvenanceTipForEntry(button, entry);
            });
            button.addEventListener('mouseleave', function () {
                if (typeof hideTcProvenanceTip === 'function') hideTcProvenanceTip();
            });
            button.addEventListener('focus', function () {
                if (typeof showTcProvenanceTipForEntry === 'function') showTcProvenanceTipForEntry(button, entry);
            });
            button.addEventListener('blur', function () {
                if (typeof hideTcProvenanceTip === 'function') hideTcProvenanceTip();
            });
            button.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof showTcProvenanceEntryPanel === 'function') showTcProvenanceEntryPanel(entry, button);
            });
        })(idx, btn);
    }
    if (hasAny) {
        rail.classList.remove('hidden');
        rail.setAttribute('aria-hidden', 'false');
    } else {
        rail.classList.add('hidden');
        rail.setAttribute('aria-hidden', 'true');
    }
}

function tcMindmapRebindMindmapInteractions() {
    scheduleSyncTcMindmapProvenanceOverlay();
}
function tcMindmapSafeSelectNode(jm, nodeId) {
    if (window.TcSmmEditor && TcSmmEditor.focusNode) TcSmmEditor.focusNode(nodeId);
}
function tcMindmapFocusPanel() {
    var panel = document.getElementById('tc-mindmap-view-panel');
    if (panel && panel.focus) panel.focus();
}
