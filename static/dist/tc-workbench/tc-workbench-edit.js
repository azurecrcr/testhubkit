/* ---- tc_state_provenance.js ---- */
/**
 * TestHub TC Workbench — L4 DOMAIN
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
// 存储测试用例数据（var 挂到 window，供外链模块与双视图隔离策略访问）
var testCasesData = [];
/** 与 testCasesData 行一一对应；无来源时为 null */
var testCasesProvenance = [];
var tcPendingGenerationProvenance = null;
var tcActiveGenerationLanhuSummary = '';
var tcActiveGenerationLanhuUrl = '';
var tcActiveGenerationLanhuReferenced = false;

function tcNormalizeServerProvenanceEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.sources && raw.sources.length) return tcCloneProvenanceEntry(raw);
    if (raw.type === 'lanhu') {
        return tcCloneProvenanceEntry({ sources: [raw], generatedAt: raw.generatedAt || new Date().toISOString() });
    }
    return null;
}

function tcApplyServerProvenanceToRows(startIndex, provenanceList) {
    if (!provenanceList || !provenanceList.length || startIndex < 0) return false;
    tcEnsureProvenanceLength();
    var applied = 0;
    for (var i = 0; i < provenanceList.length; i++) {
        var idx = startIndex + i;
        if (idx >= testCasesData.length) break;
        var entry = tcNormalizeServerProvenanceEntry(provenanceList[i]);
        if (entry) {
            testCasesProvenance[idx] = tcStampProvenanceValidationScope(tcCloneProvenanceEntry(entry));
            applied++;
        }
    }
    if (applied > 0 && typeof syncTcProvenanceRail === 'function') syncTcProvenanceRail();
    return applied > 0;
}

function tcApplyServerProvenanceEntryToRows(startIndex, rowCount, entry) {
    var normalized = tcNormalizeServerProvenanceEntry(entry);
    if (!normalized || !rowCount || startIndex < 0) return false;
    tcEnsureProvenanceLength();
    for (var i = 0; i < rowCount; i++) {
        var idx = startIndex + i;
        if (idx >= testCasesData.length) break;
        testCasesProvenance[idx] = tcStampProvenanceValidationScope(tcCloneProvenanceEntry(normalized));
    }
    if (typeof syncTcProvenanceRail === 'function') syncTcProvenanceRail();
    return true;
}

function tcCloneProvenanceEntry(entry) {
    if (!entry || !entry.sources || !entry.sources.length) return null;
    var out = {
        sources: entry.sources.map(function(s) {
            var srcOut = {
                type: s.type || '',
                label: s.label || '',
                section: s.section || '',
                expandable: !!s.expandable
            };
            if (s.confidence != null) srcOut.confidence = s.confidence;
            if (s.snippet) srcOut.snippet = s.snippet;
            if (s.fullText) srcOut.fullText = s.fullText;
            if (s.chunkId) srcOut.chunkId = s.chunkId;
            if (s.docId) srcOut.docId = s.docId;
            return srcOut;
        }),
        contextStage: entry.contextStage || '',
        generatedAt: entry.generatedAt || ''
    };
    if (entry.workbenchSessionId) out.workbenchSessionId = String(entry.workbenchSessionId);
    if (entry.lanhuUrl) out.lanhuUrl = String(entry.lanhuUrl);
    return out;
}

function tcNormalizeLanhuUrlForValidationMatch(url) {
    return String(url != null ? url : '').trim();
}

function tcLanhuUrlsMatchForValidation(a, b) {
    a = tcNormalizeLanhuUrlForValidationMatch(a);
    b = tcNormalizeLanhuUrlForValidationMatch(b);
    if (!a || !b) return false;
    if (a === b) return true;
    var pa = tcParseLanhuUrlQuery(a);
    var pb = tcParseLanhuUrlQuery(b);
    var keys = ['projectId', 'project_id', 'docId', 'doc_id', 'id', 'pageId', 'page_id', 'imageId', 'image_id'];
    var shared = false;
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (pa[key] && pb[key]) {
            if (pa[key] !== pb[key]) return false;
            shared = true;
        }
    }
    return shared;
}

function tcResolveValidationScopeSessionId() {
    if (typeof TcWorkbenchSession !== 'undefined' &&
        typeof TcWorkbenchSession.getCurrentSessionId === 'function') {
        return String(TcWorkbenchSession.getCurrentSessionId() || '').trim();
    }
    return '';
}

function tcResolveValidationScopeLanhuUrl() {
    if (tcActiveGenerationLanhuReferenced) {
        var active = String(tcActiveGenerationLanhuUrl || '').trim();
        if (active) return active;
    }
    if (typeof TcWorkbenchSession !== 'undefined' &&
        typeof TcWorkbenchSession.getCurrentLanhuUrlForGen === 'function') {
        var fromSession = String(TcWorkbenchSession.getCurrentLanhuUrlForGen() || '').trim();
        if (fromSession && tcLanhuCredentialsReadyForDisplay()) return fromSession;
    }
    return '';
}

function tcStampProvenanceValidationScope(entry) {
    if (!entry) {
        entry = { sources: [], generatedAt: new Date().toISOString() };
    }
    var sid = tcResolveValidationScopeSessionId();
    var lanhuUrl = tcResolveValidationScopeLanhuUrl();
    if (!lanhuUrl && typeof tcGetLanhuProvenanceCredentials === 'function') {
        lanhuUrl = String(tcGetLanhuProvenanceCredentials().url || '').trim();
    }
    if (sid) entry.workbenchSessionId = sid;
    if (lanhuUrl) entry.lanhuUrl = lanhuUrl;
    return entry;
}

function tcProvenanceEntryMatchesValidationScope(entry, sessionId, lanhuUrl) {
    if (!entry) return false;
    sessionId = String(sessionId || '').trim();
    lanhuUrl = tcNormalizeLanhuUrlForValidationMatch(lanhuUrl);
    var entrySid = String(entry.workbenchSessionId || '').trim();
    var entryUrl = tcNormalizeLanhuUrlForValidationMatch(entry.lanhuUrl || '');

    if (sessionId && entrySid && entrySid !== sessionId) return false;

    if (lanhuUrl) {
        if (entryUrl && tcLanhuUrlsMatchForValidation(entryUrl, lanhuUrl)) {
            return !sessionId || !entrySid || entrySid === sessionId;
        }
        var targetLanhu = tcParseLanhuProvenanceFromUrl(lanhuUrl);
        if (targetLanhu && entry.sources && entry.sources.length) {
            for (var i = 0; i < entry.sources.length; i++) {
                var source = entry.sources[i];
                if (!source || source.type !== 'lanhu') continue;
                if (source.label === targetLanhu.label &&
                    String(source.section || '') === String(targetLanhu.section || '')) {
                    return !sessionId || !entrySid || entrySid === sessionId;
                }
            }
        }
        return false;
    }

    if (sessionId) return entrySid === sessionId;
    return false;
}

function tcCollectValidationScopeRows(opts) {
    opts = opts || {};
    var cols = opts.columns || (typeof tableColumns !== 'undefined' ? tableColumns : []);
    var sessionId = String(opts.sessionId != null ? opts.sessionId : tcResolveValidationScopeSessionId()).trim();
    var lanhuUrl = tcNormalizeLanhuUrlForValidationMatch(
        opts.lanhuUrl != null ? opts.lanhuUrl : tcResolveValidationScopeLanhuUrl()
    );
    var fallback = opts.fallbackBatch || {};
    var batchStart = Math.max(0, parseInt(fallback.batchRowStart, 10) || 0);
    var batchCount = Math.max(0, parseInt(fallback.batchRowCount, 10) || 0);
    var batchEnd = batchStart + batchCount;
    var allRows = opts.allRows;
    if (!allRows && typeof testCasesData !== 'undefined' && testCasesData) {
        allRows = testCasesData.map(function (row) {
            return cols.map(function (_, i) { return String(row[i] != null ? row[i] : ''); });
        });
    }
    allRows = allRows || [];

    var selectedMap = {};
    function includeIndex(idx) {
        if (idx < 0 || idx >= allRows.length) return;
        selectedMap[idx] = true;
    }

    if (!lanhuUrl) {
        for (var bi = batchStart; bi < batchEnd; bi++) {
            includeIndex(bi);
        }
    } else {
        // 有蓝湖 URL 时仍只取当前批次切片，不按整会话/同 URL 扩范围
        for (var bj = batchStart; bj < batchEnd; bj++) {
            includeIndex(bj);
        }
    }

    var rowIndices = Object.keys(selectedMap).map(function (k) { return parseInt(k, 10); }).sort(function (a, b) {
        return a - b;
    });
    if (!rowIndices.length) {
        return {
            columns: cols,
            rows: [],
            rowIndices: [],
            rowIndexMap: [],
            rowOffset: 0,
            hasBatch: batchCount > 0,
            sessionScoped: false,
            batchOnly: true
        };
    }

    var compactRows = rowIndices.map(function (idx) {
        return allRows[idx] || cols.map(function () { return ''; });
    });
    return {
        columns: cols,
        rows: compactRows,
        rowIndices: rowIndices,
        rowIndexMap: rowIndices.slice(),
        rowOffset: rowIndices[0],
        hasBatch: true,
        sessionScoped: false,
        batchOnly: true
    };
}

function tcRowHasLanhuProvenance(index) {
    var p = testCasesProvenance[index];
    if (!p || !p.sources || !p.sources.length) return false;
    for (var i = 0; i < p.sources.length; i++) {
        if (p.sources[i] && p.sources[i].type === 'lanhu') return true;
    }
    return false;
}

function tcHasRowProvenance(index) {
    return tcRowHasLanhuProvenance(index);
}

function tcEnsureProvenanceLength() {
    while (testCasesProvenance.length < testCasesData.length) testCasesProvenance.push(null);
    if (testCasesProvenance.length > testCasesData.length) testCasesProvenance.length = testCasesData.length;
}

/** 与 tcMindmapCasesData 行一一对应；无来源时为 null */
var tcMindmapCasesProvenance = [];

function tcEnsureMindmapProvenanceLength() {
    while (tcMindmapCasesProvenance.length < tcMindmapCasesData.length) tcMindmapCasesProvenance.push(null);
    if (tcMindmapCasesProvenance.length > tcMindmapCasesData.length) tcMindmapCasesProvenance.length = tcMindmapCasesData.length;
}

function tcHasMindmapRowProvenance(index) {
    tcEnsureMindmapProvenanceLength();
    var p = tcMindmapCasesProvenance[index];
    if (!p || !p.sources || !p.sources.length) return false;
    for (var i = 0; i < p.sources.length; i++) {
        if (p.sources[i] && p.sources[i].type === 'lanhu') return true;
    }
    return false;
}

function tcMindmapProvenanceArrayForStashPayload(rowCount) {
    tcEnsureMindmapProvenanceLength();
    var out = [];
    var n = Math.max(0, rowCount | 0);
    for (var i = 0; i < n; i++) {
        out.push(tcCloneProvenanceEntry(tcMindmapCasesProvenance[i] || null));
    }
    return out;
}


function tcProvenanceArrayForStashPayload(rowCount) {
    tcEnsureProvenanceLength();
    var out = [];
    var n = Math.max(0, rowCount | 0);
    for (var i = 0; i < n; i++) {
        out.push(tcCloneProvenanceEntry(testCasesProvenance[i] || null));
    }
    return out;
}

function tcProvenanceArrayFromStashPayload(payload, rowCount) {
    var raw = payload && Array.isArray(payload.provenance) ? payload.provenance : [];
    var out = [];
    var n = Math.max(0, rowCount | 0);
    for (var i = 0; i < n; i++) {
        out.push(tcCloneProvenanceEntry(raw[i] || null));
    }
    return out;
}

function tcSanitizeProvenanceDisplayText(text) {
    return String(text || '')
        .replace(/[\uFF08(]\s*pageId\s*=\s*[^\uFF09)\n]*[\uFF09)]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function tcParseLanhuUrlQuery(url) {
    var raw = String(url || '').trim();
    if (!raw) return {};
    var q = raw;
    var hashIdx = raw.indexOf('#');
    if (hashIdx >= 0) {
        var frag = raw.slice(hashIdx + 1);
        var qIdx = frag.indexOf('?');
        q = qIdx >= 0 ? frag.slice(qIdx + 1) : frag;
    } else {
        var queryIdx = raw.indexOf('?');
        q = queryIdx >= 0 ? raw.slice(queryIdx + 1) : '';
    }
    var params = {};
    String(q || '').split('&').forEach(function(part) {
        if (!part || part.indexOf('=') < 0) return;
        var eq = part.indexOf('=');
        try {
            params[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
        } catch (e) {
            params[part.slice(0, eq)] = part.slice(eq + 1);
        }
    });
    return params;
}

function tcParseLanhuProvenanceFromUrl(url) {
    var params = tcParseLanhuUrlQuery(url);
    var docName = params.docName || params.doc_name || params.filename || params.fileName || params.title || params.name || '';
    var pageName = params.pageName || params.page_name || params.pageTitle || '';
    docName = tcSanitizeProvenanceDisplayText(docName);
    pageName = tcSanitizeProvenanceDisplayText(pageName);
    if (!docName && !pageName) return null;
    return {
        type: 'lanhu',
        label: docName ? ('\u84dd\u6e56\u300a' + docName + '\u300b') : '\u84dd\u6e56\u9700\u6c42',
        section: pageName || ''
    };
}

function tcGetLanhuProvenanceCredentials(mode) {
    if (typeof getTcLanhuCredentialsForMode !== 'function') return { cookie: '', url: '' };
    mode = mode || (typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
    return getTcLanhuCredentialsForMode(mode);
}

function tcLanhuCredentialsReady(creds) {
    creds = creds || {};
    return !!(String(creds.cookie || '').trim() && String(creds.url || '').trim());
}

function tcLanhuCredentialsReadyForDisplay(mode) {
    return tcLanhuCredentialsReady(tcGetLanhuProvenanceCredentials(mode));
}

function tcResolveLanhuProvenanceSource(reqSummary, lanhuUrl) {
    var lanhu = tcParseLanhuProvenanceFromSummary(reqSummary);
    if (!lanhu && lanhuUrl) lanhu = tcParseLanhuProvenanceFromUrl(lanhuUrl);
    return lanhu;
}

function tcNormalizeWorkbenchPageDisplayName(name) {
    var s = tcSanitizeProvenanceDisplayText(name || '');
    if (s === '—' || s === '-' || s === '–') return '';
    return s;
}


function tcResolveWorkbenchPageSectionPathForProvenance(pageId, pageName) {
    pageId = String(pageId || '').trim();
    pageName = tcNormalizeWorkbenchPageDisplayName(pageName);
    var root = (typeof window !== 'undefined') ? window
        : ((typeof global !== 'undefined') ? global : null);
    var fullPath = '';
    if (pageId && root && typeof root.findTcLanhuPageNodePath === 'function') {
        fullPath = tcNormalizeWorkbenchPageDisplayName(root.findTcLanhuPageNodePath(pageId));
    }
    if (!fullPath && pageId && root && typeof root.getTcLanhuDocTreeMeta === 'function') {
        var meta = root.getTcLanhuDocTreeMeta() || {};
        if (String(meta.selectedId || '').trim() === pageId) {
            fullPath = tcNormalizeWorkbenchPageDisplayName(meta.selectedPagePath || '');
        }
    }
    return fullPath || pageName;
}

function tcMakeLanhuProvenanceSourceFromDocPage(docName, pageName) {
    docName = tcNormalizeWorkbenchPageDisplayName(docName);
    pageName = tcNormalizeWorkbenchPageDisplayName(pageName);
    if (!docName && !pageName) return null;
    return {
        type: 'lanhu',
        label: docName ? ('蓝湖《' + docName + '》') : '蓝湖需求',
        section: pageName || '',
        expandable: false
    };
}

/** 生成/补充用例专用：summary/URL 解析失败时，回退需求树与当前需求页上下文（不影响导出等沿用旧解析的路径）。 */
function tcResolveLanhuProvenanceSourceFromWorkbenchTree(lanhuUrl) {
    var docName = '';
    var pageName = '';
    var pageId = '';
    var root = (typeof window !== 'undefined') ? window
        : ((typeof global !== 'undefined') ? global : null);
    var pgState = root && root.TC_PAGE_GEN_STATE ? root.TC_PAGE_GEN_STATE : null;
    if (pgState && typeof pgState === 'object') {
        pageId = String(pgState.pageId || '').trim();
        pageName = tcNormalizeWorkbenchPageDisplayName(pgState.pageName || '');
    }
    if (root && typeof root.getTcLanhuDocTreeMeta === 'function') {
        var meta = root.getTcLanhuDocTreeMeta() || {};
        if (!docName) docName = tcNormalizeWorkbenchPageDisplayName(meta.docName || '');
        if (!pageId) pageId = String(meta.selectedId || meta.focusPageId || '').trim();
        if (!pageName) pageName = tcNormalizeWorkbenchPageDisplayName(meta.selectedPageName || '');
        if (pageId && String(meta.selectedId || '') === pageId && meta.selectedPageName) {
            pageName = tcNormalizeWorkbenchPageDisplayName(meta.selectedPageName || pageName);
        }
    }
    if (root && root.TcRequirementCaseStore && typeof root.TcRequirementCaseStore.resolveContext === 'function') {
        var ctx = root.TcRequirementCaseStore.resolveContext({});
        if (ctx) {
            if (!pageId) pageId = String(ctx.lanhu_page_id || ctx.page_id || '').trim();
            if (!pageName) pageName = tcNormalizeWorkbenchPageDisplayName(ctx.page_name || '');
        }
    }
    if (!pageId && lanhuUrl) {
        var q = tcParseLanhuUrlQuery(lanhuUrl);
        pageId = String(q.pageId || q.page_id || '').trim();
    }
    pageName = tcResolveWorkbenchPageSectionPathForProvenance(pageId, pageName);
    return tcMakeLanhuProvenanceSourceFromDocPage(docName, pageName);
}

function tcResolveLanhuProvenanceSourceForCaseGeneration(reqSummary, lanhuUrl) {
    var lanhu = tcResolveLanhuProvenanceSource(reqSummary, lanhuUrl);
    var pageId = '';
    if (lanhuUrl) {
        var q0 = tcParseLanhuUrlQuery(lanhuUrl);
        pageId = String(q0.pageId || q0.page_id || '').trim();
    }
    if (lanhu) {
        if (!pageId) {
            var root0 = (typeof window !== 'undefined') ? window
                : ((typeof global !== 'undefined') ? global : null);
            var pg0 = root0 && root0.TC_PAGE_GEN_STATE ? root0.TC_PAGE_GEN_STATE : null;
            if (pg0 && pg0.pageId) pageId = String(pg0.pageId || '').trim();
            if (!pageId && root0 && typeof root0.getTcLanhuDocTreeMeta === 'function') {
                var meta0 = root0.getTcLanhuDocTreeMeta() || {};
                pageId = String(meta0.selectedId || meta0.focusPageId || '').trim();
            }
        }
        var fullSection = tcResolveWorkbenchPageSectionPathForProvenance(pageId, lanhu.section || '');
        if (fullSection) lanhu.section = fullSection;
        return lanhu;
    }
    if (!tcLanhuCredentialsReadyForDisplay()) return null;
    return tcResolveLanhuProvenanceSourceFromWorkbenchTree(lanhuUrl);
}

function tcBuildLanhuProvenanceEntry(reqSummary, lanhuUrl, mode) {
    var lanhu = tcResolveLanhuProvenanceSourceForCaseGeneration(reqSummary, lanhuUrl);
    if (!lanhu) return null;
    lanhu.expandable = false;
    var entry = { sources: [lanhu], generatedAt: new Date().toISOString() };
    if (String(lanhuUrl || '').trim()) entry.lanhuUrl = String(lanhuUrl).trim();
    return entry;
}

function tcCaptureGenerationLanhuContext(mode, reqSummary) {
    mode = mode || (typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
    var creds = tcGetLanhuProvenanceCredentials(mode);
    var incoming = String(reqSummary || '').trim();
    if (incoming) tcActiveGenerationLanhuSummary = incoming;
    tcActiveGenerationLanhuUrl = String(creds.url || '').trim();
    tcActiveGenerationLanhuReferenced = tcLanhuCredentialsReady(creds);
    if (!tcActiveGenerationLanhuReferenced) return;
    var summary = tcActiveGenerationLanhuSummary;
    if (!summary && typeof TcWorkbenchEnhancements !== 'undefined' &&
        typeof TcWorkbenchEnhancements.getLastRequirementsSummary === 'function') {
        summary = TcWorkbenchEnhancements.getLastRequirementsSummary();
        if (summary) tcActiveGenerationLanhuSummary = String(summary).trim();
    }
    var entry = tcBuildLanhuProvenanceEntry(summary, tcActiveGenerationLanhuUrl, mode);
    if (entry) tcPendingGenerationProvenance = entry;
}

function tcEnsurePendingGenerationProvenance(mode) {
    if (!tcActiveGenerationLanhuReferenced && !tcLanhuCredentialsReadyForDisplay(mode)) return;
    var creds = tcGetLanhuProvenanceCredentials(mode);
    var reqSummary = String(tcActiveGenerationLanhuSummary || '').trim();
    if (!reqSummary && typeof TcWorkbenchEnhancements !== 'undefined' &&
        typeof TcWorkbenchEnhancements.getLastRequirementsSummary === 'function') {
        reqSummary = TcWorkbenchEnhancements.getLastRequirementsSummary();
    }
    var lanhuUrl = String(tcActiveGenerationLanhuUrl || creds.url || '').trim();
    var entry = tcBuildLanhuProvenanceEntry(reqSummary, lanhuUrl);
    if (!entry) return;
    if (tcPendingGenerationProvenance && tcPendingGenerationProvenance.sources && tcPendingGenerationProvenance.sources.length) {
        var hasLanhu = tcPendingGenerationProvenance.sources.some(function(s) { return s && s.type === 'lanhu'; });
        if (!hasLanhu) tcPendingGenerationProvenance.sources.unshift(entry.sources[0]);
        return;
    }
    tcPendingGenerationProvenance = entry;
}

function tcApplyLanhuProvenanceToRowRange(startIndex, rowCount, reqSummary, lanhuUrl) {
    if (!rowCount || startIndex < 0) return;
    var entry = tcBuildLanhuProvenanceEntry(reqSummary, lanhuUrl);
    if (!entry) return;
    tcEnsureProvenanceLength();
    for (var i = 0; i < rowCount; i++) {
        var idx = startIndex + i;
        if (idx >= testCasesData.length) break;
        testCasesProvenance[idx] = tcStampProvenanceValidationScope(tcCloneProvenanceEntry(entry));
    }
}

function tcFinalizeGenerationProvenanceForRows(startIndex, rowCount, mode) {
    if (!rowCount || startIndex < 0) return;
    mode = mode || (typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
    if (!tcActiveGenerationLanhuReferenced && !tcLanhuCredentialsReadyForDisplay(mode)) return;
    if (!tcActiveGenerationLanhuReferenced && tcLanhuCredentialsReadyForDisplay(mode)) {
        tcActiveGenerationLanhuReferenced = true;
    }
    var creds = tcGetLanhuProvenanceCredentials(mode);
    var summary = String(tcActiveGenerationLanhuSummary || '').trim();
    if (!summary && typeof TcWorkbenchEnhancements !== 'undefined' &&
        typeof TcWorkbenchEnhancements.getLastRequirementsSummary === 'function') {
        summary = String(TcWorkbenchEnhancements.getLastRequirementsSummary() || '').trim();
        if (summary) tcActiveGenerationLanhuSummary = summary;
    }
    var lanhuUrl = String(tcActiveGenerationLanhuUrl || creds.url || '').trim();
    if (!lanhuUrl && creds.url) tcActiveGenerationLanhuUrl = String(creds.url).trim();
    tcApplyLanhuProvenanceToRowRange(startIndex, rowCount, summary, lanhuUrl);
    if (typeof syncTcProvenanceRail === 'function') syncTcProvenanceRail();
}

function tcParseLanhuProvenanceFromSummary(summary) {
    var text = String(summary || '');
    if (!text.trim()) return null;
    var docMatch = text.match(/\u6587\u6863[\uff1a:]\s*([^\n|]+)/);
    var pageMatch = text.match(/\u5f53\u524d\u9875\u9762[\uff1a:]\s*([^\n|]+)/);
    var docName = docMatch ? tcSanitizeProvenanceDisplayText(docMatch[1]) : '';
    var pageName = pageMatch ? tcSanitizeProvenanceDisplayText(pageMatch[1]) : '';
    if (!docName && !pageName) return null;
    return {
        type: 'lanhu',
        label: docName ? ('\u84dd\u6e56\u300a' + docName + '\u300b') : '\u84dd\u6e56\u9700\u6c42',
        section: pageName || ''
    };
}

function tcParseRagProvenanceFromContext(ragCtx, sourceType) {
    sourceType = sourceType || 'knowledge';
    var sources = [];
    var seen = {};
    var typeMap = {
        knowledge: 'knowledge',
        personal: 'personal',
        public: 'public'
    };
    var resolvedType = typeMap[sourceType] || sourceType;
    String(ragCtx || '').split(/\n/).forEach(function(line) {
        var m = line.match(/来源:\s*(.+?)(?:\s*\||\s*$)/);
        if (m) {
            var src = m[1].trim();
            if (src && !seen[src]) {
                seen[src] = true;
                var labelPrefix = resolvedType === 'personal' ? '个人库《' :
                    (resolvedType === 'public' ? '公共库《' : '知识库《');
                sources.push({
                    type: resolvedType,
                    label: labelPrefix + src + '》',
                    section: '',
                    expandable: false
                });
            }
        }
        var frag = line.match(/\[片段\d+\s*\|\s*来源:\s*(.+?)\s*\|/);
        if (frag) {
            var src2 = frag[1].trim();
            if (src2 && !seen[src2]) {
                seen[src2] = true;
                sources.push({
                    type: resolvedType === 'knowledge' ? 'public' : resolvedType,
                    label: '公共库《' + src2 + '》',
                    section: '',
                    expandable: false
                });
            }
        }
        var h = line.match(/^###\s+(.+)/);
        if (h) {
            var title = h[1].trim();
            if (title && !seen[title]) {
                seen[title] = true;
                sources.push({
                    type: resolvedType,
                    label: '知识库《' + title + '》',
                    section: '',
                    expandable: false
                });
            }
        }
    });
    return sources;
}

function tcProvenanceSourcesFromPublicChunks(chunks) {
    if (!chunks || !chunks.length) return [];
    return chunks.map(function(c) {
        var src = String(c.source || '未知来源');
        var text = String(c.text || c.preview || '');
        return {
            type: 'public',
            label: '公共库《' + src + '》',
            section: '',
            confidence: c.confidence,
            snippet: text.slice(0, 500),
            fullText: text.slice(0, 2000),
            chunkId: c.id || '',
            expandable: text.length > 0
        };
    });
}

function tcProvenanceSourcesFromPersonalChunks(chunks) {
    if (!chunks || !chunks.length) return [];
    return chunks.map(function(c) {
        var src = String(c.source || '文档');
        var text = String(c.text || c.preview || '');
        return {
            type: 'personal',
            label: '个人库《' + src + '》',
            section: '',
            confidence: c.confidence,
            snippet: text.slice(0, 500),
            fullText: text.slice(0, 2000),
            chunkId: c.id || '',
            docId: c.doc_id || '',
            expandable: text.length > 0
        };
    });
}

function tcBuildGenerationProvenance(reqSummary, ragCtxOrOpts, optLanhuUrl) {
    var sources = [];
    var lanhuUrl = String(optLanhuUrl || '').trim();
    if (!lanhuUrl && ragCtxOrOpts && typeof ragCtxOrOpts === 'object' && !Array.isArray(ragCtxOrOpts)) {
        lanhuUrl = String(ragCtxOrOpts.lanhuUrl || '').trim();
    }
    if (!lanhuUrl && tcLanhuCredentialsReadyForDisplay()) {
        lanhuUrl = String(tcGetLanhuProvenanceCredentials().url || '').trim();
    }
    var lanhu = tcResolveLanhuProvenanceSourceForCaseGeneration(reqSummary, lanhuUrl);
    if (lanhu) {
        lanhu.expandable = false;
        sources.push(lanhu);
    }
    var opts = ragCtxOrOpts;
    if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
        if (opts.personalChunks && opts.personalChunks.length) {
            tcProvenanceSourcesFromPersonalChunks(opts.personalChunks).forEach(function(s) { sources.push(s); });
        } else {
            var personal = String(opts.personalContext || '').trim();
            if (personal) {
                tcParseRagProvenanceFromContext(personal, 'personal').forEach(function(s) { sources.push(s); });
            }
        }
        if (opts.publicChunks && opts.publicChunks.length) {
            tcProvenanceSourcesFromPublicChunks(opts.publicChunks).forEach(function(s) { sources.push(s); });
        } else {
            var publicCtx = String(opts.publicContext || '').trim();
            if (publicCtx) {
                tcParseRagProvenanceFromContext(publicCtx, 'public').forEach(function(s) { sources.push(s); });
            }
        }
        if (!opts.personalContext && !opts.publicContext && opts.ragContext) {
            tcParseRagProvenanceFromContext(opts.ragContext).forEach(function(s) { sources.push(s); });
        }
    } else {
        tcParseRagProvenanceFromContext(ragCtxOrOpts).forEach(function(s) { sources.push(s); });
    }
    if (!sources.length) return null;
    return { sources: sources, generatedAt: new Date().toISOString() };
}

function tcFormatProvenanceTooltip(entry) {
    if (!entry || !entry.sources || !entry.sources.length) return '';
    var lines = ['\u6765\u6e90\uff1a'];
    entry.sources.forEach(function(s) {
        var label = tcSanitizeProvenanceDisplayText(s.label || '\u672a\u77e5\u6765\u6e90');
        var section = tcSanitizeProvenanceDisplayText(s.section || '');
        var line = '- ' + label;
        if (section) line += ' \u00a7 ' + section;
        if (s.confidence != null && !isNaN(s.confidence)) {
            line += ' (' + Math.round(Number(s.confidence) * 100) + '%)';
        }
        if (s.snippet) {
            var sn = tcSanitizeProvenanceDisplayText(s.snippet).slice(0, 120);
            if (sn) line += '\n  ' + sn + (s.snippet.length > 120 ? '…' : '');
        }
        lines.push(line);
    });
    lines.push('点击查看详情');
    return lines.join('\n').replace(/\r/g, '');
}

function tcFormatProvenanceForExport(entry) {
    if (!entry || !entry.sources || !entry.sources.length) return '';
    var parts = [];
    entry.sources.forEach(function(s) {
        var label = tcSanitizeProvenanceDisplayText(s.label || '未知来源');
        var section = tcSanitizeProvenanceDisplayText(s.section || '');
        parts.push(section ? (label + ' § ' + section) : label);
    });
    return parts.join('；');
}

function tcPrependProvenanceToCell(existing, provenanceText) {
    if (!provenanceText) return String(existing != null ? existing : '');
    var base = String(existing != null ? existing : '');
    if (base.trim()) return '来源：' + provenanceText + '\n' + base;
    return '来源：' + provenanceText;
}

function tcProvenanceArrayHasSources(provenance) {
    if (!Array.isArray(provenance)) return false;
    for (var i = 0; i < provenance.length; i++) {
        var p = provenance[i];
        if (p && p.sources && p.sources.length) return true;
    }
    return false;
}

var tcProvenanceRailBound = false;
var tcProvenanceTipEl = null;
var tcProvenancePanelEl = null;
var tcProvenancePanelOpenIndex = null;

function ensureTcProvenancePanelEl() {
    if (tcProvenancePanelEl && document.body.contains(tcProvenancePanelEl)) return tcProvenancePanelEl;
    tcProvenancePanelEl = document.createElement('aside');
    tcProvenancePanelEl.id = 'tc-provenance-panel';
    tcProvenancePanelEl.className = 'tc-provenance-panel hidden';
    tcProvenancePanelEl.setAttribute('role', 'dialog');
    tcProvenancePanelEl.setAttribute('aria-label', '生成来源详情');
    tcProvenancePanelEl.innerHTML =
        '<div class="tc-provenance-panel__head">' +
        '<h4 class="tc-provenance-panel__title">生成来源</h4>' +
        '<button type="button" class="tc-provenance-panel__close" aria-label="关闭">✕</button>' +
        '</div>' +
        '<div class="tc-provenance-panel__body"></div>';
    document.body.appendChild(tcProvenancePanelEl);
    var closeBtn = tcProvenancePanelEl.querySelector('.tc-provenance-panel__close');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideTcProvenancePanel);
    }
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && tcProvenancePanelEl && !tcProvenancePanelEl.classList.contains('hidden')) {
            hideTcProvenancePanel();
        }
    });
    return tcProvenancePanelEl;
}

function hideTcProvenancePanel() {
    var panel = ensureTcProvenancePanelEl();
    panel.classList.add('hidden');
    tcProvenancePanelOpenIndex = null;
    hideTcProvenanceTip();
}

function tcProvenanceTypeLabel(type) {
    if (type === 'lanhu') return '蓝湖需求';
    if (type === 'personal') return '个人知识库';
    if (type === 'public') return '公共库';
    return '知识库';
}

function showTcProvenanceEntryPanel(entry, anchorBtn) {
    if (!entry || !entry.sources || !entry.sources.length) return;
    hideTcProvenanceTip();
    var panel = ensureTcProvenancePanelEl();
    var body = panel.querySelector('.tc-provenance-panel__body');
    if (!body) return;
    body.innerHTML = '';
    entry.sources.forEach(function(s, i) {
        var item = document.createElement('div');
        item.className = 'tc-provenance-panel__item tc-provenance-panel__item--' + (s.type || 'knowledge');
        var head = document.createElement('div');
        head.className = 'tc-provenance-panel__item-head';
        var title = document.createElement('span');
        title.className = 'tc-provenance-panel__item-label';
        title.textContent = tcSanitizeProvenanceDisplayText(s.label || '未知来源');
        head.appendChild(title);
        var badge = document.createElement('span');
        badge.className = 'tc-provenance-panel__type-badge';
        badge.textContent = tcProvenanceTypeLabel(s.type);
        head.appendChild(badge);
        if (s.confidence != null && !isNaN(s.confidence)) {
            var conf = document.createElement('span');
            conf.className = 'tc-provenance-panel__confidence';
            conf.textContent = Math.round(Number(s.confidence) * 100) + '%';
            head.appendChild(conf);
        }
        item.appendChild(head);
        if (s.section) {
            var sec = document.createElement('p');
            sec.className = 'tc-provenance-panel__section';
            sec.textContent = tcSanitizeProvenanceDisplayText(s.section);
            item.appendChild(sec);
        }
        var snippetText = s.snippet || s.fullText || '';
        if (snippetText) {
            var snippet = document.createElement('blockquote');
            snippet.className = 'tc-provenance-panel__snippet';
            snippet.textContent = tcSanitizeProvenanceDisplayText(snippetText);
            item.appendChild(snippet);
            if (s.fullText && s.fullText.length > (s.snippet || '').length) {
                var expandBtn = document.createElement('button');
                expandBtn.type = 'button';
                expandBtn.className = 'tc-provenance-panel__expand-btn';
                expandBtn.textContent = '查看全文';
                expandBtn.addEventListener('click', function() {
                    snippet.textContent = tcSanitizeProvenanceDisplayText(s.fullText);
                    expandBtn.remove();
                });
                item.appendChild(expandBtn);
            }
        }
        body.appendChild(item);
    });
    panel.classList.remove('hidden');
    tcProvenancePanelOpenIndex = null;
    if (anchorBtn && anchorBtn.getBoundingClientRect) {
        var rect = anchorBtn.getBoundingClientRect();
        var panelRect = panel.getBoundingClientRect();
        var top = rect.top + window.scrollY;
        var left = rect.left - panelRect.width - 12;
        if (left < 8) left = rect.right + 12;
        panel.style.top = Math.max(8, top) + 'px';
        panel.style.left = Math.min(left, window.innerWidth - panelRect.width - 8) + 'px';
    }
}



function showTcProvenancePanel(index, anchorBtn) {
    showTcProvenanceEntryPanel(testCasesProvenance[index], anchorBtn);
}

function ensureTcProvenanceTipEl() {
    if (tcProvenanceTipEl && document.body.contains(tcProvenanceTipEl)) return tcProvenanceTipEl;
    tcProvenanceTipEl = document.createElement('div');
    tcProvenanceTipEl.id = 'tc-provenance-tip';
    tcProvenanceTipEl.className = 'tc-provenance-tip hidden';
    tcProvenanceTipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tcProvenanceTipEl);
    return tcProvenanceTipEl;
}

function hideTcProvenanceTip() {
    var tip = ensureTcProvenanceTipEl();
    tip.classList.add('hidden');
}

function showTcProvenanceTipForEntry(btn, entry) {
    if (!entry) return;
    var tip = ensureTcProvenanceTipEl();
    tip.textContent = tcFormatProvenanceTooltip(entry);
    tip.classList.remove('hidden');
    tip.style.left = '-9999px';
    tip.style.top = '-9999px';
    var btnRect = btn.getBoundingClientRect();
    var tipW = tip.offsetWidth;
    var tipH = tip.offsetHeight;
    var left = btnRect.left - tipW - 8;
    if (left < 8) left = Math.min(btnRect.right + 8, window.innerWidth - tipW - 8);
    var top = btnRect.top + btnRect.height / 2 - tipH / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - tipH - 8));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
}

function showTcProvenanceTip(btn, index) {
    showTcProvenanceTipForEntry(btn, testCasesProvenance[index]);
}


function tcParseProvenanceRowIndexFromEl(rowEl) {
    if (!rowEl) return NaN;
    var rowid = rowEl.getAttribute('rowid') || rowEl.getAttribute('row-id');
    if (rowid && /^r\d+$/.test(rowid)) {
        return parseInt(rowid.slice(1), 10);
    }
    var dataIdx = rowEl.getAttribute('data-row-index');
    if (dataIdx != null && dataIdx !== '') {
        return parseInt(dataIdx, 10);
    }
    return NaN;
}

function tcCollectProvenanceRailRows() {
    var rows = [];
    var seen = {};
    var mount = document.getElementById('tc-vxe-table-mount');
    if (mount) {
        mount.querySelectorAll('.vxe-body--row').forEach(function(tr) {
            var idx = tcParseProvenanceRowIndexFromEl(tr);
            if (!isNaN(idx) && seen[idx] == null) {
                seen[idx] = true;
                rows.push({ el: tr, index: idx });
            }
        });
    }
    if (!rows.length) {
        document.querySelectorAll('#table-body tr[data-row-index]').forEach(function(tr) {
            var idx = tcParseProvenanceRowIndexFromEl(tr);
            if (!isNaN(idx) && seen[idx] == null) {
                seen[idx] = true;
                rows.push({ el: tr, index: idx });
            }
        });
    }
    return rows;
}

/**
 * 虚拟滚动专用：只收集当前视口可见行（对齐来源轨按钮位置）。
 * 不改 tcCollectProvenanceRailRows，避免影响非虚拟路径。
 */
function tcCollectProvenanceRailVisibleRowsVirtual() {
    var rows = [];
    var seen = {};
    var mount = document.getElementById('tc-vxe-table-mount');
    if (!mount) return rows;
    mount.querySelectorAll('.vxe-body--row').forEach(function(tr) {
        var idx = tcParseProvenanceRowIndexFromEl(tr);
        if (!isNaN(idx) && seen[idx] == null) {
            seen[idx] = true;
            rows.push({ el: tr, index: idx });
        }
    });
    return rows;
}

function tcIsVxeVirtualYActiveForProvenance() {
    var cfg = typeof window !== 'undefined' ? window.TC_VXE_VIRTUAL_Y : null;
    if (cfg && cfg.enabled === false) return false;
    var mount = document.getElementById('tc-vxe-table-mount');
    if (!mount) return false;
    return !!(mount.querySelector('.vxe-table.is--virtual-y, .vxe-table--virtual-wrapper, .vxe-table--scroll-y-virtual'));
}

function tcResolveProvenanceRailTopOffset() {
    var mount = document.getElementById('tc-vxe-table-mount');
    if (mount) {
        var headerWrap = mount.querySelector('.vxe-table--header-wrapper');
        if (headerWrap && headerWrap.offsetHeight > 0) {
            return headerWrap.offsetHeight;
        }
    }
    var thead = document.getElementById('table-thead');
    if (thead && !thead.classList.contains('tc-table-thead--empty')) {
        return thead.offsetHeight || 0;
    }
    return 0;
}

function tcBindProvenanceRailScrollTarget(el, handler) {
    if (!el || !handler || el._tcProvenanceRailScrollBound) return;
    el._tcProvenanceRailScrollBound = true;
    el.addEventListener('scroll', handler, { passive: true });
}

function tcRefreshProvenanceRailScrollTargets(handler) {
    if (!handler) return;
    tcBindProvenanceRailScrollTarget(document.getElementById('tc-vxe-table-view-panel'), handler);
    tcBindProvenanceRailScrollTarget(document.getElementById('tc-table-view-panel'), handler);
    var mount = document.getElementById('tc-vxe-table-mount');
    if (!mount) return;
    mount.querySelectorAll('.vxe-table--body-wrapper, .vxe-table--body-inner-wrapper').forEach(function(el) {
        tcBindProvenanceRailScrollTarget(el, handler);
    });
}

/**
 * 虚拟滚动专用：额外绑定 VXE 纵向虚拟滚动条 handle，保证滚轮/拖条都能刷新来源轨。
 * 不改 tcRefreshProvenanceRailScrollTargets。
 */
function tcRefreshProvenanceRailScrollTargetsVirtual(handler) {
    if (!handler) return;
    tcRefreshProvenanceRailScrollTargets(handler);
    var mount = document.getElementById('tc-vxe-table-mount');
    if (!mount) return;
    mount.querySelectorAll(
        '.vxe-table--scroll-y-handle, .vxe-table--body-inner-wrapper, .vxe-table--body-wrapper, .vxe-table--main-wrapper'
    ).forEach(function(el) {
        tcBindProvenanceRailScrollTarget(el, handler);
    });
}

function tcBindProvenanceRailEvents() {
    if (tcProvenanceRailBound) return;
    tcProvenanceRailBound = true;
    var panel = document.getElementById('tc-table-list-panel');
    var syncHandler = function() { syncTcProvenanceRail(); };
    window.addEventListener('resize', syncHandler);
    window.addEventListener('scroll', syncHandler, true);
    tcBindProvenanceRailScrollTarget(document.getElementById('tc-vxe-table-view-panel'), syncHandler);
    tcBindProvenanceRailScrollTarget(document.getElementById('tc-table-view-panel'), syncHandler);
    var mount = document.getElementById('tc-vxe-table-mount');
    if (mount) {
        mount.querySelectorAll('.vxe-table--body-wrapper').forEach(function(el) {
            tcBindProvenanceRailScrollTarget(el, syncHandler);
        });
    }
    if (panel && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(syncHandler).observe(panel);
        if (mount) new ResizeObserver(syncHandler).observe(mount);
    }
}

var tcProvenanceRailSyncTimer = null;

function scheduleSyncTcProvenanceRail(opts) {
    opts = opts || {};
    var delay = typeof opts.debounceMs === 'number' ? opts.debounceMs : 200;
    if (tcProvenanceRailSyncTimer) {
        clearTimeout(tcProvenanceRailSyncTimer);
        tcProvenanceRailSyncTimer = null;
    }
    if (typeof window.setTimeout !== 'function') {
        syncTcProvenanceRail();
        return;
    }
    tcProvenanceRailSyncTimer = window.setTimeout(function() {
        tcProvenanceRailSyncTimer = null;
        syncTcProvenanceRail();
    }, delay);
}

/**
 * 虚拟滚动专用调度：不改 scheduleSyncTcProvenanceRail。
 * 有虚拟滚动时走 Virtual 同步，否则回落到旧同步。
 */
var tcProvenanceRailSyncTimerVirtual = null;
function scheduleSyncTcProvenanceRailVirtual(opts) {
    opts = opts || {};
    // ScrollIdle 开启时改走新调度，关闭时保持原 48/120ms Virtual 行为
    if (typeof window.tcVxeIsScrollIdleEnabled === 'function' && window.tcVxeIsScrollIdleEnabled()) {
        scheduleSyncTcProvenanceRailScrollIdle(opts);
        return;
    }
    var delay = typeof opts.debounceMs === 'number' ? opts.debounceMs : 120;
    if (tcProvenanceRailSyncTimerVirtual) {
        clearTimeout(tcProvenanceRailSyncTimerVirtual);
        tcProvenanceRailSyncTimerVirtual = null;
    }
    if (typeof window.setTimeout !== 'function') {
        syncTcProvenanceRailVirtual();
        return;
    }
    tcProvenanceRailSyncTimerVirtual = window.setTimeout(function() {
        tcProvenanceRailSyncTimerVirtual = null;
        syncTcProvenanceRailVirtual();
    }, delay);
}

/**
 * 滚动空闲专用来源轨调度（新方法）。
 * 不改 scheduleSyncTcProvenanceRail / 不改 Virtual 函数体主逻辑；
 * 停滑后同步，避免滚动中反复 innerHTML 重建。
 */
var tcProvenanceRailSyncTimerScrollIdle = null;
function scheduleSyncTcProvenanceRailScrollIdle(opts) {
    opts = opts || {};
    var idleMs = 120;
    if (typeof window.tcVxeReadScrollIdleConfig === 'function') {
        try {
            var cfg = window.tcVxeReadScrollIdleConfig();
            if (cfg && typeof cfg.idleMs === 'number' && cfg.idleMs >= 0) idleMs = cfg.idleMs;
        } catch (e) { /* ignore */ }
    }
    // flush 显式传 0 时立即同步；其余忽略外部 debounceMs，统一用 idleMs
    var delay = (typeof opts.debounceMs === 'number' && opts.debounceMs === 0)
        ? 0
        : idleMs;
    if (tcProvenanceRailSyncTimerScrollIdle) {
        clearTimeout(tcProvenanceRailSyncTimerScrollIdle);
        tcProvenanceRailSyncTimerScrollIdle = null;
    }
    if (delay <= 0 || typeof window.setTimeout !== 'function') {
        syncTcProvenanceRailScrollIdle();
        return;
    }
    tcProvenanceRailSyncTimerScrollIdle = window.setTimeout(function() {
        tcProvenanceRailSyncTimerScrollIdle = null;
        syncTcProvenanceRailScrollIdle();
    }, delay);
}

/**
 * 滚动空闲专用来源轨同步（新方法）：复用 Virtual 重建，避免复制 DOM 逻辑分叉。
 * 不改 syncTcProvenanceRailVirtual 函数体。
 */
function syncTcProvenanceRailScrollIdle() {
    if (typeof syncTcProvenanceRailVirtual === 'function') {
        syncTcProvenanceRailVirtual();
        return;
    }
    if (typeof syncTcProvenanceRail === 'function') syncTcProvenanceRail();
}

function syncTcProvenanceRail() {
    var rail = document.getElementById('tc-provenance-rail');
    var panel = document.getElementById('tc-table-list-panel');
    if (!rail || !panel) return;
    panel.classList.remove('tc-table-list-panel--provenance-visible');
    tcBindProvenanceRailEvents();
    if (typeof tcRefreshProvenanceRailScrollTargets === 'function') {
        tcRefreshProvenanceRailScrollTargets(function() { syncTcProvenanceRail(); });
    }
    rail.innerHTML = '';
    if (!tcTableTemplateApplied || tcRightViewMode !== 'table' || panel.classList.contains('tc-table-list-panel--locked')) {
        rail.classList.add('hidden');
        rail.setAttribute('aria-hidden', 'true');
        rail.style.display = 'none';
        panel.classList.remove('tc-table-list-panel--provenance-visible');
        hideTcProvenanceTip();
        return;
    }
    var bodyPanel = document.getElementById('tc-vxe-table-view-panel') || panel;
    var mount = document.getElementById('tc-vxe-table-mount');
    var topOffset = tcResolveProvenanceRailTopOffset();
    var bodyTopInPanel = bodyPanel.offsetTop || 0;
    var bodyHeight = bodyPanel.clientHeight || panel.clientHeight || 0;
    var railTop = bodyTopInPanel + topOffset;
    var railHeight = Math.max(0, bodyHeight - topOffset);
    rail.style.top = railTop + 'px';
    rail.style.height = railHeight + 'px';
    rail.style.overflow = 'visible';
    var hasAny = false;
    tcCollectProvenanceRailRows().forEach(function(rowRef) {
        var tr = rowRef.el;
        var idx = rowRef.index;
        if (isNaN(idx) || !tcHasRowProvenance(idx)) return;
        hasAny = true;
        var trRect = tr.getBoundingClientRect();
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tc-provenance-rail__btn';
        btn.setAttribute('aria-label', '查看生成来源');
        btn.setAttribute('data-row-index', String(idx));
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"></circle></svg>';
        rail.appendChild(btn);
        var railRect = rail.getBoundingClientRect();
        var btnTop = trRect.top - railRect.top + trRect.height / 2 - 9;
        btn.style.top = Math.max(0, Math.min(btnTop, railHeight - 18)) + 'px';
        btn.style.left = '50%';
        btn.style.transform = 'translateX(-50%)';
        btn.addEventListener('mouseenter', function() { showTcProvenanceTip(btn, idx); });
        btn.addEventListener('mouseleave', hideTcProvenanceTip);
        btn.addEventListener('focus', function() { showTcProvenanceTip(btn, idx); });
        btn.addEventListener('blur', hideTcProvenanceTip);
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showTcProvenancePanel(idx, btn);
        });
    });
    if (hasAny) {
        rail.classList.remove('hidden');
        rail.setAttribute('aria-hidden', 'false');
        rail.style.display = 'block';
        panel.classList.add('tc-table-list-panel--provenance-visible');
    } else {
        rail.classList.add('hidden');
        rail.setAttribute('aria-hidden', 'true');
        rail.style.display = 'none';
        panel.classList.remove('tc-table-list-panel--provenance-visible');
        hideTcProvenanceTip();
    }
}

/**
 * 虚拟滚动专用来源轨同步：可见行对齐 + 虚拟滚动条监听。
 * 不改 syncTcProvenanceRail，避免影响非虚拟场景。
 */
function syncTcProvenanceRailVirtual() {
    var rail = document.getElementById('tc-provenance-rail');
    var panel = document.getElementById('tc-table-list-panel');
    if (!rail || !panel) return;
    if (!tcIsVxeVirtualYActiveForProvenance()) {
        syncTcProvenanceRail();
        return;
    }
    panel.classList.remove('tc-table-list-panel--provenance-visible');
    tcBindProvenanceRailEvents();
    if (typeof tcRefreshProvenanceRailScrollTargetsVirtual === 'function') {
        tcRefreshProvenanceRailScrollTargetsVirtual(function() {
            scheduleSyncTcProvenanceRailVirtual({ debounceMs: 48 });
        });
    }
    rail.innerHTML = '';
    if (!tcTableTemplateApplied || tcRightViewMode !== 'table' || panel.classList.contains('tc-table-list-panel--locked')) {
        rail.classList.add('hidden');
        rail.setAttribute('aria-hidden', 'true');
        rail.style.display = 'none';
        panel.classList.remove('tc-table-list-panel--provenance-visible');
        hideTcProvenanceTip();
        return;
    }
    var bodyPanel = document.getElementById('tc-vxe-table-view-panel') || panel;
    var topOffset = tcResolveProvenanceRailTopOffset();
    var bodyTopInPanel = bodyPanel.offsetTop || 0;
    var bodyHeight = bodyPanel.clientHeight || panel.clientHeight || 0;
    var railTop = bodyTopInPanel + topOffset;
    var railHeight = Math.max(0, bodyHeight - topOffset);
    rail.style.top = railTop + 'px';
    rail.style.height = railHeight + 'px';
    rail.style.overflow = 'visible';
    var hasAny = false;
    tcCollectProvenanceRailVisibleRowsVirtual().forEach(function(rowRef) {
        var tr = rowRef.el;
        var idx = rowRef.index;
        if (isNaN(idx) || !tcHasRowProvenance(idx)) return;
        hasAny = true;
        var trRect = tr.getBoundingClientRect();
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tc-provenance-rail__btn';
        btn.setAttribute('aria-label', '查看生成来源');
        btn.setAttribute('data-row-index', String(idx));
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"></circle></svg>';
        rail.appendChild(btn);
        var railRect = rail.getBoundingClientRect();
        var btnTop = trRect.top - railRect.top + trRect.height / 2 - 9;
        btn.style.top = Math.max(0, Math.min(btnTop, railHeight - 18)) + 'px';
        btn.style.left = '50%';
        btn.style.transform = 'translateX(-50%)';
        btn.addEventListener('mouseenter', function() { showTcProvenanceTip(btn, idx); });
        btn.addEventListener('mouseleave', hideTcProvenanceTip);
        btn.addEventListener('focus', function() { showTcProvenanceTip(btn, idx); });
        btn.addEventListener('blur', hideTcProvenanceTip);
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showTcProvenancePanel(idx, btn);
        });
    });
    if (hasAny) {
        rail.classList.remove('hidden');
        rail.setAttribute('aria-hidden', 'false');
        rail.style.display = 'block';
        panel.classList.add('tc-table-list-panel--provenance-visible');
    } else {
        rail.classList.add('hidden');
        rail.setAttribute('aria-hidden', 'true');
        rail.style.display = 'none';
        panel.classList.remove('tc-table-list-panel--provenance-visible');
        hideTcProvenanceTip();
    }
}

function tcTakePendingProvenanceForNewRow() {
    var entry = tcCloneProvenanceEntry(tcPendingGenerationProvenance);
    if (!entry) {
        entry = { sources: [], generatedAt: new Date().toISOString() };
    }
    return tcStampProvenanceValidationScope(entry);
}

/** 列表表格最少展示行数（不足时用空行补齐，仅影响展示） */
var TC_TABLE_MIN_DISPLAY_ROWS = 8;
/** 思维导图专用数据，与列表 testCasesData 完全隔离 */
var tcMindmapCasesData = [];
var tcRightViewMode = 'table';
var tcTableUndoHistory = [];
var tcTableUndoHistoryIndex = -1;
var TC_TABLE_UNDO_MAX = 50;
var tcTableInUndoSync = false;
var tcTableUndoHandling = false;
var tcMindmapGenerating = false;
let tcMindmapInstance = null;
function tcSyncWorkbenchGlobals() {
    if (typeof window !== 'undefined') {
        if (window.tcMindmapInstance != null) {
            tcMindmapInstance = window.tcMindmapInstance;
        } else if (window.tcMindmapInstance === null) {
            tcMindmapInstance = null;
        }
    }
    window.tcRightViewMode = tcRightViewMode;
    window.tcMindmapInstance = tcMindmapInstance;
    window.tcMindmapCasesData = tcMindmapCasesData;
    window.tcMindmapCasesProvenance = tcMindmapCasesProvenance;
    window.tcMindmapCommittedExternalMind = tcMindmapCommittedExternalMind;
    if (typeof tcMindmapExternalMindData !== 'undefined') {
        window.tcMindmapExternalMindData = tcMindmapExternalMindData;
    }
}
tcSyncWorkbenchGlobals();
let tcMindmapMetaById = {};
var tcMindmapPendingTypeEditId = null;
var tcMindmapLastAddedRowRef = null;
var tcMindmapLastAddedModuleName = null;
var tcMindmapLastAddedNodeId = null;
var TC_MINDMAP_EMPTY_TOPIC = '';
var tcMindmapUndoStack = [];
var tcMindmapHistory = [];
var tcMindmapHistoryIndex = -1;
var tcMindmapUndoBaseline = null;
var TC_MINDMAP_UNDO_MAX = 50;
var tcMindmapSuppressAddUntil = 0;
var tcMindmapEditUndoPushed = false;
var tcMindmapEditSessionSnap = null;
var tcMindmapEditingNodeId = null;
var tcMindmapLastSelectedId = null;
var tcMindmapSkipNextAddUndo = false;
var tcMindmapInMoveSync = false;
var tcMindmapInUndoSync = false;
var tcMindmapSkipMindmapRebuild = false;
var tcMindmapUndoHandling = false;
var tcMindmapRefreshingTopics = false;
var TC_MINDMAP_CACHE_KEY = 'tc_mindmap_cases_cache_v3';
var tcMindmapPageSessionId = null;
var tcMindmapCachedMindPayload = null;
var tcMindmapPendingFitFocus = false;
var tcMindmapCommittedExternalMind = null;
var tcMindmapSkipCacheRestore = false;
var tcMindmapPersistCacheTimer = null;
var tcMindmapPersistCacheRaf = 0;
var tcMindmapSuppressRemoveSync = false;
var tcMindmapRecentNodeIds = {};
var tcMindmapSuppressEditUndoUntil = 0;
var tcMindmapSuppressTopicSyncUntil = 0;
var TC_MINDMAP_JSMIND_EMPTY_TOPIC = '\u200b';
var tcMindmapMoveHistoryCommit = false;
var tcMindmapPointerState = null;
var tcMindmapDragActive = false;
var tcMindmapDragPreSnapshot = null;
let editingRowIndex = -1;
let tcFocusedCell = null;
let tcEditingCell = null;
let markedRows = new Set();
let selectedRows = new Set();
const defaultTableColumns = ['用例名称', '所属模块', '标签', '前置条件', '步骤描述', '预期结果', '编辑模式', '备注', '用例等级'];
var tableColumns = [];
let tcTableTemplateApplied = false;
let tcActiveTemplateId = null;

function getTcActiveTemplateId() {
    return tcActiveTemplateId ? String(tcActiveTemplateId) : '';
}

function setTcActiveTemplateId(id) {
    tcActiveTemplateId = id ? String(id) : null;
    syncTcActiveTemplateIdToWindow();
}

function syncTcActiveTemplateIdToWindow() {
    if (typeof window !== 'undefined') {
        window.tcActiveTemplateId = tcActiveTemplateId || null;
    }
}

if (typeof window !== 'undefined') {
    window.getTcActiveTemplateId = getTcActiveTemplateId;
    window.setTcActiveTemplateId = setTcActiveTemplateId;
    window.syncTcActiveTemplateIdToWindow = syncTcActiveTemplateIdToWindow;
}

var TC_CASE_TEMPLATES = [];
var tcCaseTemplatesLoaded = false;
var tcCaseTemplatesLoadError = null;
var TC_DAILY_TEMPLATE_KEY = 'tc_daily_template_v1';

/** 当日日期键（Asia/Shanghai，UTC+8） */
function getTcBeijingDateKey() {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    } catch (e) {
        var now = new Date();
        var bj = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
        var y = bj.getUTCFullYear();
        var m = String(bj.getUTCMonth() + 1).padStart(2, '0');
        var d = String(bj.getUTCDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }
}

function saveTcDailyTemplateChoice(templateId) {
    if (!templateId) return;
    try {
        localStorage.setItem(TC_DAILY_TEMPLATE_KEY, JSON.stringify({
            date: getTcBeijingDateKey(),
            templateId: templateId
        }));
    } catch (e) { /* ignore */ }
    try { sessionStorage.removeItem('tc_case_template_id'); } catch (e2) { /* legacy */ }
}

function loadTcDailyTemplateChoice() {
    try {
        var raw = localStorage.getItem(TC_DAILY_TEMPLATE_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || !data.templateId) return null;
        if (data.date !== getTcBeijingDateKey()) {
            localStorage.removeItem(TC_DAILY_TEMPLATE_KEY);
            return null;
        }
        return data.templateId;
    } catch (e) {
        try { localStorage.removeItem(TC_DAILY_TEMPLATE_KEY); } catch (e2) { /* ignore */ }
        return null;
    }
}

function tryRestoreTcDailyTemplate() {
    var id = loadTcDailyTemplateChoice();
    if (!id || !tcCaseTemplatesLoaded) return false;
    var tpl = TC_CASE_TEMPLATES.find(function(t) { return t.id === id; });
    if (!tpl) {
        try { localStorage.removeItem(TC_DAILY_TEMPLATE_KEY); } catch (e) { /* ignore */ }
        return false;
    }
    applyTcCaseTemplate(id, { silent: true });
    return true;
}

function fetchTcCaseTemplates() {
    return fetch('/api/test-case-templates', { credentials: 'same-origin' })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.error) throw new Error(data.error);
            TC_CASE_TEMPLATES = Array.isArray(data.items) ? data.items : [];
            tcCaseTemplatesLoaded = true;
            tcCaseTemplatesLoadError = null;
        })
        .catch(function(err) {
            tcCaseTemplatesLoaded = true;
            tcCaseTemplatesLoadError = err && err.message ? err.message : '加载失败';
            TC_CASE_TEMPLATES = [];
        });
}
let columnSettingsDraft = [];
var columnVisible = {};  // 列显示状态（var 供 TcTableView / window 同步）
var columnWidth = {};    // 列宽度
var rowHeights = {};     // 行高度
if (typeof window !== 'undefined') {
    window.columnVisible = columnVisible;
    window.columnWidth = columnWidth;
    window.rowHeights = rowHeights;
    window.tcClearTableLayoutMaps = tcClearTableLayoutMaps;
    window.tcApplyStashTableLayoutFromPayload = tcApplyStashTableLayoutFromPayload;
}
const TC_DEFAULT_ROW_HEIGHT = 52;
let actionColumnWidth = 52; // # 列宽度（含勾选）

// 初始化列显示状态和宽度
function initColumnState() {
    tableColumns.forEach((col, idx) => {
        if (columnVisible[idx] === undefined) {
            columnVisible[idx] = true;
        }
        if (columnWidth[idx] === undefined) {
            columnWidth[idx] = 150;  // 默认宽度
        }
    });
}

/** 清空列显隐/列宽/行高（原地删除，保持 window.columnVisible 引用） */
function tcClearTableLayoutMaps() {
    Object.keys(columnVisible).forEach(function (k) { delete columnVisible[k]; });
    Object.keys(columnWidth).forEach(function (k) { delete columnWidth[k]; });
    Object.keys(rowHeights).forEach(function (k) { delete rowHeights[k]; });
}

/** 将 payload 中的列显隐、列宽、行高恢复到全局状态 */
function tcApplyStashTableLayoutFromPayload(p) {
    var n = tableColumns.length;
    tcClearTableLayoutMaps();
    if (p && p.columnVisible && typeof p.columnVisible === 'object') {
        Object.keys(p.columnVisible).forEach(function (k) {
            var i = parseInt(k, 10);
            if (Number.isNaN(i) || i < 0 || i >= n) return;
            columnVisible[i] = p.columnVisible[k] !== false;
        });
    }
    if (p && p.columnWidth && typeof p.columnWidth === 'object') {
        Object.keys(p.columnWidth).forEach(function (k) {
            var i = parseInt(k, 10);
            var w = parseInt(p.columnWidth[k], 10);
            if (Number.isNaN(i) || i < 0 || i >= n || Number.isNaN(w) || w <= 0) return;
            columnWidth[i] = w;
        });
    }
    if (p && p.rowHeights && typeof p.rowHeights === 'object') {
        Object.keys(p.rowHeights).forEach(function (k) {
            var i = parseInt(k, 10);
            var h = parseInt(p.rowHeights[k], 10);
            if (Number.isNaN(i) || i < 0 || Number.isNaN(h) || h <= 0) return;
            rowHeights[i] = h;
        });
    }
    initColumnState();
    if (typeof updateRestoreButton === 'function') updateRestoreButton();
}

/** 读取表格可视区域宽度（优先 vxe mount，回退到列表面板） */
function tcGetTableColumnLayoutWidth() {
    var candidates = [
        document.getElementById('tc-vxe-table-mount'),
        document.getElementById('tc-vxe-table-view-panel'),
        document.getElementById('tc-table-list-panel')
    ];
    var i;
    for (i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        if (!el) continue;
        var w = el.clientWidth || 0;
        if (w <= 0 && el.getBoundingClientRect) {
            w = Math.floor(el.getBoundingClientRect().width || 0);
        }
        if (w > 0) return w;
    }
    return 0;
}

/** 将可见列宽按当前表格宽度平均分配以占满（模板应用时使用） */
function tcFitColumnWidthsEvenly(opts) {
    opts = opts || {};
    if (!tableColumns || !tableColumns.length) return false;
    if (typeof initColumnState === 'function') initColumnState();
    var layoutW = opts.containerWidth != null ? parseInt(opts.containerWidth, 10) : tcGetTableColumnLayoutWidth();
    if (!layoutW || layoutW <= 0) return false;
    var seqW = typeof actionColumnWidth === 'number' && actionColumnWidth > 0 ? actionColumnWidth : 52;
    var available = Math.max(0, layoutW - seqW - 2);
    if (available <= 0) return false;
    var minW = typeof opts.minWidth === 'number' && opts.minWidth > 0 ? opts.minWidth : 72;
    var visibleIdx = [];
    tableColumns.forEach(function (_, idx) {
        if (columnVisible[idx] !== false) visibleIdx.push(idx);
    });
    if (!visibleIdx.length) {
        tableColumns.forEach(function (_, idx) { visibleIdx.push(idx); });
    }
    var count = visibleIdx.length;
    var base = Math.max(minW, Math.floor(available / count));
    var remainder = available - base * count;
    visibleIdx.forEach(function (idx, i) {
        columnWidth[idx] = base + (i < remainder ? 1 : 0);
    });
    return true;
}
if (typeof window !== 'undefined') {
    window.tcGetTableColumnLayoutWidth = tcGetTableColumnLayoutWidth;
    window.tcFitColumnWidthsEvenly = tcFitColumnWidthsEvenly;
}

function getTcColumnIndex(colName, fallbackIndex) {
    const idx = tableColumns.indexOf(colName);
    return idx >= 0 ? idx : fallbackIndex;
}

function truncateTcMindmapTopic(text, maxLen) {
    const s = String(text != null ? text : '').trim();
    if (!s) return '（未命名）';
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

function getTcPriorityStyle(level) {
    const lv = String(level || '').trim().toUpperCase();
    if (lv === 'P0') return { 'background-color': '#fef2f2', 'foreground-color': '#b91c1c' };
    if (lv === 'P1') return { 'background-color': '#fff7ed', 'foreground-color': '#c2410c' };
    if (lv === 'P2') return { 'background-color': '#eff6ff', 'foreground-color': '#1d4ed8' };
    if (lv === 'P3') return { 'background-color': '#f8fafc', 'foreground-color': '#475569' };
    return { 'background-color': '#f8fafc', 'foreground-color': '#334155' };
}

/** Tab/Enter 新建节点与 AI 用例节点一致的蓝色样式 */

window.scheduleSyncTcProvenanceRail = scheduleSyncTcProvenanceRail;
window.scheduleSyncTcProvenanceRailVirtual = scheduleSyncTcProvenanceRailVirtual;
window.scheduleSyncTcProvenanceRailScrollIdle = scheduleSyncTcProvenanceRailScrollIdle;
window.syncTcProvenanceRailVirtual = syncTcProvenanceRailVirtual;
window.syncTcProvenanceRailScrollIdle = syncTcProvenanceRailScrollIdle;
window.tcCollectProvenanceRailVisibleRowsVirtual = tcCollectProvenanceRailVisibleRowsVirtual;

/* ---- tc_mindmap_data.js ---- */
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

/* ---- tc_smm_runtime_config.js ---- */
/**
 * TestHub 用例工作台 — Simple Mind Map 画布静态配置（仅参数，不含业务逻辑）
 * 后续优化画布行为请优先改本文件。
 */
(function (global) {
    'use strict';

    var TC_SMM_RUNTIME_CONFIG = {
        layout: 'logicalStructure',
        theme: 'classic4',
        enableFreeDrag: true,
        mousewheelAction: 'move',
        mousewheelZoomActionReverse: false,
        disableMouseWheelZoom: true,
        readonly: false,
        isShowCreateChildBtnIcon: true,
        enableShortcutOnlyWhenMouseInSvg: false,
        containerFallbackMinHeightPx: 420,
        zoomStepDelta: 0.12,
        zoomMinRatioDefault: 20,
        zoomMaxRatioDefault: 400
    };

    function getTcSmmRuntimeConfig() {
        return TC_SMM_RUNTIME_CONFIG;
    }

    global.TC_SMM_RUNTIME_CONFIG = TC_SMM_RUNTIME_CONFIG;
    global.TcSmmRuntimeConfig = {
        get: getTcSmmRuntimeConfig
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_smm_canvas_shell.js ---- */
/**
 * TestHub 用例工作台 — SMM 画布容器与实例初始化壳层（从 tc_simple_mindmap_editor 抽出，逻辑不变）
 */
(function (global) {
    'use strict';

    function cfg() {
        if (global.TcSmmRuntimeConfig && typeof global.TcSmmRuntimeConfig.get === 'function') {
            return global.TcSmmRuntimeConfig.get() || {};
        }
        return global.TC_SMM_RUNTIME_CONFIG || {};
    }

    function isContainerSized(el) {
        if (!el) return false;
        var w = el.offsetWidth || el.clientWidth;
        var h = el.offsetHeight || el.clientHeight;
        return w > 0 && h > 0;
    }

    function prepareContainerForInit(el) {
        if (!el) return false;
        if (isContainerSized(el)) return true;
        var panel = document.getElementById('tc-mindmap-view-panel');
        if (!panel || panel.classList.contains('hidden') || panel.getAttribute('aria-hidden') === 'true') {
            return false;
        }
        if (typeof document !== 'undefined' && document.body &&
            document.body.classList.contains('tc-right-view-table')) {
            return false;
        }
        var stage = el.closest ? el.closest('.tc-mindmap-stage') : null;
        var panelH = panel.offsetHeight || panel.clientHeight || 0;
        var panelW = panel.offsetWidth || panel.clientWidth || 0;
        if (panelH <= 0 && stage) {
            panelH = stage.offsetHeight || stage.clientHeight || 0;
        }
        if (panelW <= 0 && stage) {
            panelW = stage.offsetWidth || stage.clientWidth || 0;
        }
        var fallbackH = cfg().containerFallbackMinHeightPx != null ? cfg().containerFallbackMinHeightPx : 420;
        if (panelH > 0) {
            el.style.height = panelH + 'px';
            el.style.minHeight = panelH + 'px';
        } else {
            el.style.minHeight = fallbackH + 'px';
            el.style.height = fallbackH + 'px';
        }
        el.style.width = '100%';
        if (stage && panelH > 0) {
            stage.style.height = panelH + 'px';
            stage.style.minHeight = panelH + 'px';
        }
        void el.offsetHeight;
        return isContainerSized(el);
    }

    /**
     * @param {HTMLElement} el
     * @param {{ resolveInitialData: function(): *, customCheckEnableShortcut: function, beforeShortcutRun: function }} hooks
     */
    function buildMindMapCtorOptions(el, hooks) {
        hooks = hooks || {};
        var c = cfg();
        return {
            el: el,
            data: typeof hooks.resolveInitialData === 'function' ? hooks.resolveInitialData() : null,
            layout: c.layout,
            theme: c.theme,
            enableFreeDrag: c.enableFreeDrag,
            mousewheelAction: c.mousewheelAction,
            mousewheelZoomActionReverse: c.mousewheelZoomActionReverse,
            disableMouseWheelZoom: c.disableMouseWheelZoom,
            readonly: c.readonly,
            isShowCreateChildBtnIcon: c.isShowCreateChildBtnIcon,
            enableShortcutOnlyWhenMouseInSvg: c.enableShortcutOnlyWhenMouseInSvg,
            customCheckEnableShortcut: hooks.customCheckEnableShortcut,
            beforeShortcutRun: hooks.beforeShortcutRun
        };
    }

    function getZoomStepDelta() {
        var d = cfg().zoomStepDelta;
        return d != null ? d : 0.12;
    }

    function getZoomMinRatioDefault() {
        var d = cfg().zoomMinRatioDefault;
        return d != null ? d : 20;
    }

    function getZoomMaxRatioDefault() {
        var d = cfg().zoomMaxRatioDefault;
        return d != null ? d : 400;
    }

    function getZoomRatioDefaults() {
        return {
            minRatio: getZoomMinRatioDefault(),
            maxRatio: getZoomMaxRatioDefault()
        };
    }

    global.TcSmmCanvasShell = {
        isContainerSized: isContainerSized,
        prepareContainerForInit: prepareContainerForInit,
        buildMindMapCtorOptions: buildMindMapCtorOptions,
        buildMindMapOptions: buildMindMapCtorOptions,
        getZoomStepDelta: getZoomStepDelta,
        getZoomMinRatioDefault: getZoomMinRatioDefault,
        getZoomMaxRatioDefault: getZoomMaxRatioDefault,
        getZoomRatioDefaults: getZoomRatioDefaults
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_smm_workbench_drag_guard.js ---- */
/**
 * 用例工作台 SMM 画布 · 自由拖拽改挂增强（与工作台其它模块隔离）
 * - 指针落入目标节点区域时显示改挂提示
 * - 松手前同步 overlapNode；dragend 兜底 MOVE_NODE_TO
 * - 改挂后清理旧父节点残留连线、清除自定义坐标，避免多次拖动后连线堆积
 */
(function (global) {
    'use strict';

    var POINTER_PAD_PX = 10;
    var REPART_HINT = {
        stroke: 'rgb(94, 200, 248)',
        fill: 'rgba(94, 200, 248, 0.14)',
        lineWidth: 2,
        pad: 8,
        label: '松手移入此节点',
        rootLabel: '松手移入主节点'
    };
    var boundMap = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    var boundIds = Object.create(null);

    function isBound(smm) {
        if (!smm) return false;
        if (boundMap) return boundMap.has(smm);
        return !!boundIds[smm.id || 'default'];
    }

    function markBound(smm) {
        if (!smm) return;
        if (boundMap) boundMap.set(smm, true);
        else boundIds[smm.id || 'default'] = true;
    }

    function getDragNodeList(drag) {
        if (!drag) return [];
        if (drag.beingDragNodeList && drag.beingDragNodeList.length) return drag.beingDragNodeList;
        if (drag.mousedownNode && !drag.mousedownNode.isRoot && !drag.mousedownNode.isGeneralization) {
            return [drag.mousedownNode];
        }
        return [];
    }

    function getSingleDraggedNode(drag) {
        var list = getDragNodeList(drag);
        if (list.length !== 1) return null;
        var node = list[0];
        if (!node || node.isRoot || node.isGeneralization) return null;
        return node;
    }

    function hasPassedDragOffset(drag) {
        if (!drag || drag.mouseMoveX == null || drag.mouseDownX == null) return false;
        var threshold = drag.checkDragOffset != null ? drag.checkDragOffset : 10;
        return Math.abs(drag.mouseMoveX - drag.mouseDownX) > threshold ||
            Math.abs(drag.mouseMoveY - drag.mouseDownY) > threshold;
    }

    function isSingleFreeDrag(smm, drag) {
        if (!smm || !smm.opt || !smm.opt.enableFreeDrag) return false;
        if (!drag) return false;
        if (drag.beingDragNodeList && drag.beingDragNodeList.length > 1) return false;
        if (!getSingleDraggedNode(drag)) return false;
        return !!(drag.isDragging || (drag.isMousedown && hasPassedDragOffset(drag)));
    }

    function refreshReparentNodeCache(smm) {
        if (!smm) return;
        var root = smm.renderer && smm.renderer.root;
        if (!root) {
            smm._tcReparentNodeCache = [];
            return;
        }
        var list = [];
        walkAllNodes(root, function (node) {
            if (!node || node.isGeneralization) return;
            list.push(node);
        });
        smm._tcReparentNodeCache = list;
    }

    function getReparentCandidateNodes(smm) {
        if (!smm) return [];
        var cached = smm._tcReparentNodeCache;
        if (cached && cached.length) return cached;
        refreshReparentNodeCache(smm);
        return smm._tcReparentNodeCache || [];
    }

    function getCanvasTransform(smm, drag) {
        var tr = null;
        try {
            if (drag && drag.drawTransform) tr = drag.drawTransform;
            else if (smm && smm.draw) tr = smm.draw.transform();
        } catch (e) { /* ignore */ }
        return {
            scaleX: (tr && tr.scaleX) || 1,
            scaleY: (tr && tr.scaleY) || 1,
            translateX: (tr && tr.translateX) || 0,
            translateY: (tr && tr.translateY) || 0
        };
    }

    function getCanvasNodeRect(smm, node, drag) {
        if (!node) return null;
        var t = getCanvasTransform(smm, drag);
        var left = node.left * t.scaleX + t.translateX;
        var top = node.top * t.scaleY + t.translateY;
        var width = node.width * t.scaleX;
        var height = node.height * t.scaleY;
        return {
            left: left,
            top: top,
            right: left + width,
            bottom: top + height,
            originWidth: node.width,
            originHeight: node.height,
            area: Math.max(node.width, 1) * Math.max(node.height, 1)
        };
    }

    function getNativeReparentTarget(drag) {
        if (!drag || !drag.overlapNode || drag.prevNode || drag.nextNode) return null;
        return drag.overlapNode;
    }

    function isInCanvasReparentZone(rect, mx, my, node) {
        if (!rect || mx == null || my == null) return false;
        if (mx < rect.left || mx > rect.right) return false;
        if (node && node.isRoot) {
            return my >= rect.top && my <= rect.bottom;
        }
        var edge = Math.max((rect.originHeight || 0) / 4, 4);
        var topBound = rect.top + edge;
        var bottomBound = rect.bottom - edge;
        if (bottomBound <= topBound) {
            topBound = rect.top;
            bottomBound = rect.bottom;
        }
        return my >= topBound && my <= bottomBound;
    }

    function findReparentTargetByCanvasPointer(smm, drag) {
        if (!isSingleFreeDrag(smm, drag)) return null;
        if (drag.mouseMoveX == null || drag.mouseMoveY == null) return null;
        var mx = drag.mouseMoveX;
        var my = drag.mouseMoveY;
        var rootNode = smm.renderer && smm.renderer.root;
        if (rootNode && !isInvalidReparentTarget(drag, rootNode)) {
            var rootRect = getCanvasNodeRect(smm, rootNode, drag);
            if (rootRect && isInCanvasReparentZone(rootRect, mx, my, rootNode)) {
                return rootNode;
            }
        }
        var best = null;
        var bestArea = Infinity;
        var nodes = getReparentCandidateNodes(smm);
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (!node || node.isRoot) continue;
            if (isInvalidReparentTarget(drag, node)) continue;
            var rect = getCanvasNodeRect(smm, node, drag);
            if (!rect || !isInCanvasReparentZone(rect, mx, my, node)) continue;
            if (rect.area < bestArea) {
                bestArea = rect.area;
                best = node;
            }
        }
        return best;
    }

    function getDragPointer(drag) {
        if (!drag || drag.mouseMoveX == null || drag.mouseMoveY == null) return null;
        return { x: drag.mouseMoveX, y: drag.mouseMoveY };
    }

    function getNodeRect(node) {
        if (!node) return null;
        return {
            left: node.left,
            top: node.top,
            width: node.width,
            height: node.height,
            right: node.left + node.width,
            bottom: node.top + node.height,
            cx: node.left + node.width / 2,
            cy: node.top + node.height / 2,
            area: Math.max(node.width, 1) * Math.max(node.height, 1)
        };
    }

    function getCloneAnchor(drag) {
        if (!drag || !drag.clone) return getDragPointer(drag);
        var dragged = getSingleDraggedNode(drag);
        if (!dragged) return getDragPointer(drag);
        var t = drag.clone.transform();
        return {
            x: t.translateX + dragged.width / 2,
            y: t.translateY + dragged.height / 2
        };
    }

    function getNodeUid(node) {
        if (!node) return '';
        var uid = node.uid;
        if (uid == null || uid === '') {
            try {
                if (node.getData) uid = node.getData('uid');
            } catch (e1) { /* ignore */ }
        }
        return uid == null || uid === '' ? '' : String(uid);
    }

    function isSameNode(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        var aUid = getNodeUid(a);
        var bUid = getNodeUid(b);
        return !!(aUid && bUid && aUid === bUid);
    }

    function isDescendantOf(ancestor, node) {
        if (!ancestor || !node) return false;
        var p = node.parent;
        while (p) {
            if (p === ancestor) return true;
            p = p.parent;
        }
        return false;
    }

    function isInvalidReparentTarget(drag, target) {
        if (!drag || !target || target.isGeneralization) return true;
        var list = getDragNodeList(drag);
        if (target.isRoot) {
            for (var r = 0; r < list.length; r++) {
                var draggedRoot = list[r];
                if (!draggedRoot) continue;
                if (draggedRoot.isRoot || isSameNode(draggedRoot, target)) return true;
                if (draggedRoot.parent === target) return true;
            }
            return false;
        }
        for (var i = 0; i < list.length; i++) {
            var dn = list[i];
            if (!dn) continue;
            if (isSameNode(dn, target)) return true;
            if (dn.parent === target) return true;
            if (isDescendantOf(dn, target)) return true;
        }
        return false;
    }

    function getReparentHintLabel(target) {
        return (target && target.isRoot) ? REPART_HINT.rootLabel : REPART_HINT.label;
    }

    function measureHintLabelWidth(label) {
        return (label ? label.length : 0) * 12 + 16;
    }

    function applyHintLabel(hint, targetRect, target, boxTop) {
        if (!hint.labelText || !hint.labelBg || !targetRect || !target) return;
        var label = getReparentHintLabel(target);
        var labelY = boxTop - 10;
        var textWidth = measureHintLabelWidth(label);
        var textHeight = 22;
        var labelX = targetRect.cx - textWidth / 2;
        if (hint._tcHintLabel !== label) {
            try {
                if (typeof hint.labelText.text === 'function') {
                    hint.labelText.text(label);
                } else if (typeof hint.labelText.clear === 'function') {
                    hint.labelText.clear();
                    hint.labelText.text(function (add) { add.tspan(label); });
                }
            } catch (eLabel) { /* ignore */ }
            hint._tcHintLabel = label;
        }
        hint.labelBg.move(labelX, labelY - textHeight).size(textWidth, textHeight).opacity(1);
        hint.labelText.move(targetRect.cx, labelY - textHeight / 2 - 1).opacity(1);
    }

    function walkAllNodes(root, cb) {
        if (!root || typeof cb !== 'function') return;
        var stack = [root];
        while (stack.length) {
            var node = stack.pop();
            if (!node) continue;
            cb(node);
            var children = node.children || [];
            for (var i = children.length - 1; i >= 0; i--) stack.push(children[i]);
        }
    }

    function findNodeByUid(smm, uid) {
        if (!smm || !uid) return null;
        var root = smm.renderer && smm.renderer.root;
        if (!root) return null;
        var found = null;
        walkAllNodes(root, function (node) {
            if (found) return;
            if (node.uid === uid || (node.getData && node.getData('uid') === uid)) found = node;
        });
        return found;
    }

    function pointInExpandedRect(p, rect, pad) {
        return p.x >= rect.left - pad && p.x <= rect.right + pad &&
            p.y >= rect.top - pad && p.y <= rect.bottom + pad;
    }

    function findReparentTargetByPointer(smm, drag) {
        return findReparentTargetByCanvasPointer(smm, drag);
    }

    function stageReparentTarget(drag, target) {
        if (!drag || !target) return false;
        drag._tcReparentTarget = target;
        drag._tcReparentTargetUid = getNodeUid(target);
        return true;
    }

    function commitReparentOverlapState(drag, target) {
        if (!stageReparentTarget(drag, target)) return false;
        drag.overlapNode = target;
        drag.prevNode = null;
        drag.nextNode = null;
        return true;
    }

    function captureDragStartSnapshot(drag, smm) {
        if (!drag) return;
        var list = getDragNodeList(drag);
        if (!list.length && drag.mousedownNode) list = [drag.mousedownNode];
        drag._tcDragStartSnapshot = list.map(function (node) {
            if (!node) return null;
            return {
                node: node,
                left: node._left != null ? node._left : node.left,
                top: node._top != null ? node._top : node.top,
                customLeft: node.customLeft,
                customTop: node.customTop
            };
        }).filter(function (item) { return !!item; });
        if (smm && drag._tcDragStartSnapshot && drag._tcDragStartSnapshot.length) {
            smm._tcWorkbenchDragSnapshot = drag._tcDragStartSnapshot.map(function (item) {
                return {
                    node: item.node,
                    left: item.left,
                    top: item.top,
                    customLeft: item.customLeft,
                    customTop: item.customTop
                };
            });
        }
    }

    function clearDragStartSnapshot(drag, smm) {
        if (drag) drag._tcDragStartSnapshot = null;
        if (smm) smm._tcWorkbenchDragSnapshot = null;
    }

    function hadStructuralDragResult(info, movedByFallback) {
        if (movedByFallback) return true;
        if (!info) return false;
        return !!(info.overlapNodeUid || info.prevNodeUid || info.nextNodeUid);
    }

    function hadReparentIntentAtDrop(drag, smm) {
        if (!drag) return false;
        if (drag._tcPendingReparentUid || drag._tcStickyDropTarget || drag._tcReparentTarget) return true;
        var hint = smm && smm._tcReparentHint;
        return !!(hint && hint.targetUid);
    }

    function shouldRestoreAfterCancelledDrag(smm, info, drag, movedByFallback) {
        if (!smm || !drag || !smm.opt || !smm.opt.enableFreeDrag) return false;
        if (hadStructuralDragResult(info, movedByFallback)) return false;
        return !!(drag._tcDragStartSnapshot && drag._tcDragStartSnapshot.length);
    }

    function getDragEndMovedList(drag) {
        if (!drag) return [];
        if (drag.beingDragNodeList && drag.beingDragNodeList.length) {
            return drag.beingDragNodeList.slice();
        }
        return getDragNodeList(drag).slice();
    }

    function temporarilySuppressWorkbenchFreeDragPosition(smm, drag) {
        if (!smm || !smm.opt || !smm.opt.enableFreeDrag || !drag) return null;
        if (!hasPassedDragOffset(drag) && !drag.isDragging) return null;
        if (!drag._tcDragStartSnapshot || !drag._tcDragStartSnapshot.length) {
            captureDragStartSnapshot(drag, smm);
        }
        if (!drag._tcDragStartSnapshot || !drag._tcDragStartSnapshot.length) return null;
        drag._tcSuppressingFreeDragDrop = true;
        var saved = smm.opt.enableFreeDrag;
        smm.opt.enableFreeDrag = false;
        return saved;
    }

    function restoreFreeDragOpt(smm, drag, saved) {
        if (drag) drag._tcSuppressingFreeDragDrop = false;
        if (smm && smm.opt && saved != null) smm.opt.enableFreeDrag = saved;
    }

    function shouldSettleWorkbenchDrag(drag) {
        if (!drag || !drag._tcDragStartSnapshot || !drag._tcDragStartSnapshot.length) return false;
        if (hasPassedDragOffset(drag) || drag.isDragging) return true;
        var list = getDragNodeList(drag);
        if (drag.mousedownNode && list.indexOf(drag.mousedownNode) < 0) {
            list = list.concat([drag.mousedownNode]);
        }
        for (var i = 0; i < list.length; i++) {
            var node = list[i];
            if (!node) continue;
            if (node.customLeft != null || node.customTop != null) return true;
        }
        return false;
    }

    function attemptWorkbenchReparentMove(smm, drag, info) {
        if (commitQuickDropReparentIfNeeded(smm, drag, info)) return true;
        return tryFallbackReparentMove(smm, drag, info);
    }

    function settleWorkbenchDragAfterDrop(smm, drag, info) {
        if (!smm || !drag || drag._tcDragSettled) return;
        drag._tcDragSettled = true;
        if (!drag._tcPendingReparentUid && hadReparentIntentAtDrop(drag, smm)) {
            var lateTarget = resolveDropReparentTarget(smm, drag);
            if (lateTarget && !isInvalidReparentTarget(drag, lateTarget)) {
                commitReparentOverlapState(drag, lateTarget);
                drag._tcPendingReparentUid = drag._tcReparentTargetUid || null;
            }
        }
        var oldParent = drag._tcReparentOldParent;
        var movedList = getDragEndMovedList(drag);
        var movedByFallback = attemptWorkbenchReparentMove(smm, drag, info);
        if (hadStructuralDragResult(info, movedByFallback) || drag._tcReparentMoveApplied) {
            if (movedList.length) {
                repairReparentLineArtifacts(smm, movedList, oldParent);
            } else if (drag._tcReparentMovedUid) {
                repairReparentLineArtifacts(smm, [], oldParent);
            }
            schedulePostReparentLineRepair(smm, drag);
            clearDragStartSnapshot(drag, smm);
            return;
        }
        restoreCancelledFreeDrag(smm, drag);
        enforceWorkbenchDragCancelSafetyNet(smm, drag, info, movedByFallback);
    }

    function resetDraggedNodeVisualState(node) {
        if (!node) return;
        try {
            if (typeof node.setOpacity === 'function') node.setOpacity(1);
            if (typeof node.showChildren === 'function') node.showChildren();
            if (typeof node.endDrag === 'function') node.endDrag();
            if (typeof node.show === 'function') node.show();
            if (node.group && typeof node.group.opacity === 'function') node.group.opacity(1);
            if (node.group && typeof node.group.show === 'function') node.group.show();
        } catch (eVis) { /* ignore */ }
    }

    function getNodesNeedingVisualReset(drag, snapshot) {
        var nodes = [];
        function pushNode(node) {
            if (!node || nodes.indexOf(node) >= 0) return;
            nodes.push(node);
        }
        if (snapshot && snapshot.length) {
            for (var si = 0; si < snapshot.length; si++) {
                pushNode(snapshot[si] && snapshot[si].node);
            }
        }
        if (drag) {
            var dragList = getDragNodeList(drag);
            for (var di = 0; di < dragList.length; di++) pushNode(dragList[di]);
            pushNode(drag.mousedownNode);
            if (drag.beingDragNodeList && drag.beingDragNodeList.length) {
                for (var bi = 0; bi < drag.beingDragNodeList.length; bi++) {
                    pushNode(drag.beingDragNodeList[bi]);
                }
            }
        }
        return nodes;
    }

    function rebuildNodeLinesFromScratch(node) {
        if (!node) return;
        try {
            if (typeof node.removeLine === 'function') node.removeLine();
            else trimNodeLineCache(node);
            if (typeof node.renderLine === 'function') node.renderLine(true);
        } catch (eLine) { /* ignore */ }
    }

    function cleanupDragOverlayArtifacts(smm) {
        try {
            var dragObj = smm && smm.drag;
            if (!dragObj) return;
            if (typeof dragObj.removeExtraLines === 'function') dragObj.removeExtraLines();
            if (dragObj.placeHolderLine && typeof dragObj.placeHolderLine.hide === 'function') {
                dragObj.placeHolderLine.hide();
            }
            if (dragObj.placeholder && typeof dragObj.placeholder.size === 'function') {
                dragObj.placeholder.size(0, 0);
            }
        } catch (eExtra) { /* ignore */ }
    }

    function isWorkbenchSmmRenderReady(smm) {
        if (!smm || !smm.el || !smm.renderer) return false;
        try {
            return document.body.contains(smm.el);
        } catch (eDom) { return false; }
    }

    function refreshWorkbenchMindmapLayout(smm) {
        if (!isWorkbenchSmmRenderReady(smm)) return;
        try {
            if (typeof smm.render === 'function') smm.render();
        } catch (eRender) { /* ignore */ }
    }

    function resetWorkbenchDraggedNodesLayout(smm, snapshot, drag) {
        if (!smm || !snapshot || !snapshot.length) return;
        var dragRef = drag || smm.drag;
        var visualNodes = getNodesNeedingVisualReset(dragRef, snapshot);
        for (var v = 0; v < visualNodes.length; v++) {
            resetDraggedNodeVisualState(visualNodes[v]);
        }
        for (var i = 0; i < snapshot.length; i++) {
            var item = snapshot[i];
            if (!item || !item.node) continue;
            clearSubtreeCustomPositions(smm, item.node);
        }
        cleanupDragOverlayArtifacts(smm);
        clearReparentHint(smm);
        refreshWorkbenchMindmapLayout(smm);
    }

    function purgeAndRefreshNodeLines(node) {
        if (!node) return;
        trimNodeLineCache(node);
        refreshNodeLines(node, true);
    }

    function repairCancelledFreeDragLines(smm, snapshot, drag) {
        resetWorkbenchDraggedNodesLayout(smm, snapshot, drag);
    }

    function getWorkbenchDragSnapshot(smm, drag) {
        if (drag && drag._tcDragStartSnapshot && drag._tcDragStartSnapshot.length) {
            return drag._tcDragStartSnapshot;
        }
        if (smm && smm._tcWorkbenchDragSnapshot && smm._tcWorkbenchDragSnapshot.length) {
            return smm._tcWorkbenchDragSnapshot;
        }
        return null;
    }

    function nodeDriftedFromSnapshot(item) {
        if (!item || !item.node) return false;
        var node = item.node;
        return node.customLeft != null || node.customTop != null;
    }

    function enforceWorkbenchDragCancelSafetyNet(smm, drag, info, movedByFallback) {
        if (!smm) return false;
        if (hadStructuralDragResult(info, movedByFallback) || (drag && drag._tcReparentMoveApplied)) {
            return false;
        }
        var snapshot = getWorkbenchDragSnapshot(smm, drag);
        if (!snapshot || !snapshot.length) return false;
        var drifted = false;
        for (var i = 0; i < snapshot.length; i++) {
            if (nodeDriftedFromSnapshot(snapshot[i])) {
                drifted = true;
                break;
            }
        }
        if (!drifted) return false;
        repairCancelledFreeDragLines(smm, snapshot, drag);
        clearDragStartSnapshot(drag, smm);
        return true;
    }

    function restoreCancelledFreeDrag(smm, drag) {
        var snapshot = getWorkbenchDragSnapshot(smm, drag);
        if (!snapshot || !snapshot.length) return false;
        repairCancelledFreeDragLines(smm, snapshot, drag);
        clearDragStartSnapshot(drag, smm);
        return true;
    }

    function clearStickyDropTarget(drag) {
        if (drag) drag._tcStickyDropTarget = null;
    }

    function clearReparentOverlapState(drag) {
        if (!drag) return;
        drag._tcReparentTarget = null;
        drag._tcReparentTargetUid = null;
        drag._tcReparentOldParent = null;
    }

    function captureReparentOldParent(drag) {
        var list = getDragNodeList(drag);
        if (!drag || !list.length) return null;
        var dn = list[0];
        drag._tcReparentOldParent = dn && dn.parent ? dn.parent : null;
        drag._tcReparentOldParentUid = drag._tcReparentOldParent ? getNodeUid(drag._tcReparentOldParent) : null;
        drag._tcReparentMovedUid = dn ? getNodeUid(dn) : null;
        return drag._tcReparentOldParent;
    }

    function resolveReparentOldParent(smm, drag) {
        if (!drag) return null;
        if (drag._tcReparentOldParent) return drag._tcReparentOldParent;
        if (drag._tcReparentOldParentUid && smm) {
            return findNodeByUid(smm, drag._tcReparentOldParentUid);
        }
        return null;
    }

    function getReparentHintState(smm) {
        if (!smm._tcReparentHint) {
            smm._tcReparentHint = {
                targetUid: null,
                highlightRect: null,
                connectorLine: null,
                labelBg: null,
                labelText: null
            };
        }
        return smm._tcReparentHint;
    }

    function ensureReparentHintElements(smm) {
        var hint = getReparentHintState(smm);
        if (hint.highlightRect || !smm || !smm.otherDraw) return hint;
        try {
            hint.highlightRect = smm.otherDraw.rect()
                .fill({ color: REPART_HINT.fill })
                .stroke({ color: REPART_HINT.stroke, width: REPART_HINT.lineWidth, dasharray: '7,4' })
                .radius(8)
                .opacity(0);
            hint.connectorLine = smm.otherDraw.path()
                .stroke({ color: REPART_HINT.stroke, width: REPART_HINT.lineWidth, dasharray: '6,5' })
                .fill({ color: 'none' })
                .opacity(0);
            hint.labelBg = smm.otherDraw.rect()
                .fill({ color: 'rgba(255, 255, 255, 0.96)' })
                .stroke({ color: REPART_HINT.stroke, width: 1 })
                .radius(4)
                .opacity(0);
            hint.labelText = smm.otherDraw.text(function (add) {
                add.tspan(REPART_HINT.label);
            }).font({
                size: 12,
                weight: 600,
                family: 'Microsoft YaHei, PingFang SC, sans-serif'
            }).fill({ color: REPART_HINT.stroke }).opacity(0);
            var layers = [hint.highlightRect, hint.connectorLine, hint.labelBg, hint.labelText];
            for (var i = 0; i < layers.length; i++) {
                if (layers[i] && typeof layers[i].css === 'function') {
                    layers[i].css('pointer-events', 'none');
                    layers[i].css('z-index', 100000);
                }
            }
            if (typeof smm.otherDraw.front === 'function') smm.otherDraw.front();
        } catch (e) { /* ignore */ }
        return hint;
    }

    function hideReparentHintVisuals(hint) {
        if (!hint) return;
        var layers = [hint.highlightRect, hint.connectorLine, hint.labelBg, hint.labelText];
        for (var i = 0; i < layers.length; i++) {
            if (layers[i] && typeof layers[i].opacity === 'function') layers[i].opacity(0);
        }
        hint.targetUid = null;
    }

    function clearReparentHint(smm) {
        if (!smm || !smm._tcReparentHint) return;
        hideReparentHintVisuals(smm._tcReparentHint);
        if (smm.drag) clearStickyDropTarget(smm.drag);
    }

    function updateReparentHint(smm, drag, target) {
        if (!smm || !drag || !target) {
            clearReparentHint(smm);
            return;
        }
        var hint = getReparentHintState(smm);
        var anchor = getCloneAnchor(drag);
        var targetRect = getNodeRect(target);
        var targetUid = getNodeUid(target);
        if (hint.targetUid === targetUid && hint.highlightRect) {
            hint.highlightRect.opacity(1);
            if (anchor && targetRect && hint.connectorLine) {
                hint.connectorLine.plot(
                    'M ' + anchor.x + ' ' + anchor.y + ' L ' + targetRect.cx + ' ' + targetRect.cy
                ).opacity(0.9);
            }
            if (hint.labelText && hint.labelBg) {
                applyHintLabel(hint, targetRect, target, target.top - REPART_HINT.pad);
            }
            return;
        }
        hint = ensureReparentHintElements(smm);
        if (!hint.highlightRect || !targetRect) return;

        var pad = REPART_HINT.pad;
        var left = target.left - pad;
        var top = target.top - pad;
        var width = target.width + pad * 2;
        var height = target.height + pad * 2;

        hint.highlightRect.move(left, top).size(width, height).opacity(1);

        if (anchor && hint.connectorLine) {
            hint.connectorLine.plot(
                'M ' + anchor.x + ' ' + anchor.y + ' L ' + targetRect.cx + ' ' + targetRect.cy
            ).opacity(0.9);
        }

        applyHintLabel(hint, targetRect, target, top);

        hint.targetUid = targetUid;
    }

    function hidePlaceholderVisuals(drag) {
        if (!drag) return;
        try {
            if (drag.placeholder && typeof drag.placeholder.size === 'function') drag.placeholder.size(0, 0);
            if (drag.placeHolderLine && typeof drag.placeHolderLine.hide === 'function') drag.placeHolderLine.hide();
            if (typeof drag.removeExtraLines === 'function') drag.removeExtraLines();
        } catch (e) { /* ignore */ }
    }

    function resolveWorkbenchReparentTarget(smm, drag) {
        var nativeTarget = getNativeReparentTarget(drag);
        if (nativeTarget && !isInvalidReparentTarget(drag, nativeTarget)) return nativeTarget;
        var canvasTarget = findReparentTargetByCanvasPointer(smm, drag);
        if (canvasTarget) return canvasTarget;
        if (drag.overlapNode && !drag.prevNode && !drag.nextNode && !isInvalidReparentTarget(drag, drag.overlapNode)) {
            return drag.overlapNode;
        }
        return null;
    }

    function resolveDropReparentTarget(smm, drag) {
        var live = resolveWorkbenchReparentTarget(smm, drag);
        if (live && !isInvalidReparentTarget(drag, live)) return live;
        var sticky = drag && drag._tcStickyDropTarget;
        if (sticky && !isInvalidReparentTarget(drag, sticky)) return sticky;
        if (drag && drag._tcReparentTarget && !isInvalidReparentTarget(drag, drag._tcReparentTarget)) {
            return drag._tcReparentTarget;
        }
        var hintUid = smm && smm._tcReparentHint && smm._tcReparentHint.targetUid;
        if (hintUid) {
            var byHint = findNodeByUid(smm, hintUid);
            if (byHint && !isInvalidReparentTarget(drag, byHint)) return byHint;
        }
        return null;
    }

    function syncNativeOverlapBeforeDrop(drag) {
        if (!drag || typeof drag._tcOrigCheckOverlapNode !== 'function') return;
        try {
            drag._tcOrigCheckOverlapNode.call(drag);
        } catch (eSync) { /* ignore */ }
    }

    function syncReparentHintVisual(smm, drag, target) {
        if (!target) return;
        stageReparentTarget(drag, target);
        drag._tcStickyDropTarget = target;
        updateReparentHint(smm, drag, target);
        hidePlaceholderVisuals(drag);
    }

    function cancelScheduledFastReparentUi(drag) {
        if (!drag || !drag._tcFastReparentUiRaf) return;
        window.cancelAnimationFrame(drag._tcFastReparentUiRaf);
        drag._tcFastReparentUiRaf = 0;
    }

    function refreshReparentHintFromNativeOverlap(smm, drag) {
        if (!isSingleFreeDrag(smm, drag)) return null;
        var overlap = getNativeReparentTarget(drag);
        if (!overlap || isInvalidReparentTarget(drag, overlap)) return null;
        syncReparentHintVisual(smm, drag, overlap);
        return overlap;
    }

    function applyFastReparentUi(smm, drag) {
        var nativeOverlap = refreshReparentHintFromNativeOverlap(smm, drag);
        if (nativeOverlap) return nativeOverlap;
        if (!isSingleFreeDrag(smm, drag)) {
            clearReparentOverlapState(drag);
            clearReparentHint(smm);
            return null;
        }
        if ((drag.prevNode || drag.nextNode) && !drag.overlapNode) {
            clearReparentOverlapState(drag);
            clearReparentHint(smm);
            return null;
        }
        var target = resolveWorkbenchReparentTarget(smm, drag);
        if (target) {
            syncReparentHintVisual(smm, drag, target);
            return target;
        }
        clearReparentOverlapState(drag);
        if (!getNativeReparentTarget(drag)) clearReparentHint(smm);
        return null;
    }

    function finalizeReparentBeforeDrop(smm, drag) {
        if (!smm || !drag || !smm.opt || !smm.opt.enableFreeDrag) return null;
        if (!getSingleDraggedNode(drag) || !hasPassedDragOffset(drag)) return null;
        captureReparentOldParent(drag);
        syncNativeOverlapBeforeDrop(drag);
        var target = resolveDropReparentTarget(smm, drag);
        if (target && !isInvalidReparentTarget(drag, target)) {
            commitReparentOverlapState(drag, target);
            updateReparentHint(smm, drag, target);
            drag._tcPendingReparentUid = drag._tcReparentTargetUid || null;
            return target;
        }
        drag._tcPendingReparentUid = null;
        return null;
    }

    function commitQuickDropReparentIfNeeded(smm, drag, info) {
        if (!smm || !drag || !drag._tcPendingReparentUid) return false;
        if (drag._tcReparentMoveApplied) return false;
        if (info && info.overlapNodeUid) return false;
        var list = drag.beingDragNodeList && drag.beingDragNodeList.length
            ? drag.beingDragNodeList
            : getDragNodeList(drag);
        if (!list.length) return false;
        var target = drag._tcReparentTarget || drag._tcStickyDropTarget ||
            findNodeByUid(smm, drag._tcPendingReparentUid);
        if (!target || isInvalidReparentTarget(drag, target)) return false;
        if (list[0].parent === target) return false;
        try {
            prepareNodesBeforeWorkbenchReparent(smm, drag);
            smm.execCommand('MOVE_NODE_TO', list, target);
            drag._tcReparentMoveApplied = true;
            return true;
        } catch (eQuick) {
            return false;
        }
    }

    function walkNodeSubtree(node, cb) {
        if (!node || typeof cb !== 'function') return;
        cb(node);
        var children = node.children || [];
        for (var i = 0; i < children.length; i++) {
            walkNodeSubtree(children[i], cb);
        }
    }

    function collectAncestorChain(node) {
        var chain = [];
        var current = node;
        while (current) {
            chain.push(current);
            current = current.parent;
        }
        return chain;
    }

    function pushUniqueNode(list, node) {
        if (!node || list.indexOf(node) >= 0) return;
        list.push(node);
    }

    function clearSubtreeCustomPositions(smm, node) {
        if (!smm || !node) return;
        walkNodeSubtree(node, function (item) {
            clearNodeCustomPosition(smm, item);
        });
    }

    function prepareNodesBeforeWorkbenchReparent(smm, drag) {
        if (!smm || !drag) return;
        var list = drag.beingDragNodeList && drag.beingDragNodeList.length
            ? drag.beingDragNodeList
            : getDragNodeList(drag);
        for (var i = 0; i < list.length; i++) {
            if (list[i]) clearSubtreeCustomPositions(smm, list[i]);
        }
    }

    function clearNodeCustomPosition(smm, node) {
        if (!smm || !node) return;
        try {
            node.customLeft = undefined;
            node.customTop = undefined;
            if (typeof smm.execCommand === 'function') {
                smm.execCommand('SET_NODE_DATA', node, {
                    customLeft: undefined,
                    customTop: undefined
                });
            }
        } catch (e) { /* ignore */ }
    }

    function trimNodeLineCache(node) {
        if (!node) return;
        try {
            var childCount = typeof node.getChildrenLength === 'function'
                ? node.getChildrenLength()
                : ((node.children && node.children.length) || 0);
            if (node._lines && node._lines.length > childCount) {
                node._lines.slice(childCount).forEach(function (line) {
                    try { if (line && typeof line.remove === 'function') line.remove(); } catch (e1) { /* ignore */ }
                });
                node._lines = node._lines.slice(0, childCount);
            }
        } catch (e) { /* ignore */ }
    }

    function refreshNodeLines(node, deep) {
        if (!node || typeof node.renderLine !== 'function') return;
        try {
            trimNodeLineCache(node);
            node.renderLine(!!deep);
        } catch (e) { /* ignore */ }
    }

    function repairReparentLineArtifacts(smm, movedNodes, oldParent) {
        if (!smm) return;
        var node = movedNodes && movedNodes.length ? movedNodes[0] : null;
        if (!node && smm.drag && smm.drag._tcReparentMovedUid) {
            node = findNodeByUid(smm, smm.drag._tcReparentMovedUid);
        }
        if (!node) return;

        clearSubtreeCustomPositions(smm, node);
        resetDraggedNodeVisualState(node);
        walkNodeSubtree(node, function (item) {
            resetDraggedNodeVisualState(item);
        });

        cleanupDragOverlayArtifacts(smm);
        clearReparentHint(smm);
        refreshWorkbenchMindmapLayout(smm);
    }

    function schedulePostReparentLineRepair(smm, drag) {
        if (!smm || !drag) return;
        var movedUid = drag._tcReparentMovedUid;
        var oldParentUid = drag._tcReparentOldParentUid;
        if (!movedUid) return;
        window.requestAnimationFrame(function () {
            try {
                var moved = findNodeByUid(smm, movedUid);
                var oldParentNode = oldParentUid ? findNodeByUid(smm, oldParentUid) : null;
                if (moved) repairReparentLineArtifacts(smm, [moved], oldParentNode);
            } catch (ePost) { /* ignore */ }
        });
    }

    function didReparentOccur(info, movedByFallback) {
        return !!(movedByFallback || (info && info.overlapNodeUid));
    }

    function tryFallbackReparentMove(smm, drag, info) {
        if (!smm || !drag || !drag._tcPendingReparentUid) return false;
        if (info && info.overlapNodeUid) return false;
        if (drag._tcReparentMoveApplied) return false;
        var list = drag.beingDragNodeList && drag.beingDragNodeList.length
            ? drag.beingDragNodeList
            : getDragNodeList(drag);
        if (!list.length) return false;
        var target = drag._tcReparentTarget || drag._tcStickyDropTarget ||
            findNodeByUid(smm, drag._tcPendingReparentUid);
        if (!target || isInvalidReparentTarget(drag, target)) return false;
        if (list[0].parent === target) return false;
        try {
            prepareNodesBeforeWorkbenchReparent(smm, drag);
            smm.execCommand('MOVE_NODE_TO', list, target);
            drag._tcReparentMoveApplied = true;
            return true;
        } catch (e) {
            return false;
        }
    }

    function forceCleanupDragArtifacts(smm) {
        if (!smm) return;
        clearReparentHint(smm);
        var drag = smm.drag;
        if (!drag) return;
        if (drag.beingDragNodeList && drag.beingDragNodeList.length) {
            for (var fi = 0; fi < drag.beingDragNodeList.length; fi++) {
                resetDraggedNodeVisualState(drag.beingDragNodeList[fi]);
            }
        }
        resetDraggedNodeVisualState(drag.mousedownNode);
        cancelScheduledFastReparentUi(drag);
        clearReparentOverlapState(drag);
        drag._tcPendingReparentUid = null;
        drag._tcReparentMoveApplied = false;
        clearStickyDropTarget(drag);
        clearDragStartSnapshot(drag, smm);
        try {
            if (typeof drag.removeExtraLines === 'function') drag.removeExtraLines();
            if (drag.placeHolderLine && typeof drag.placeHolderLine.hide === 'function') drag.placeHolderLine.hide();
            if (drag.placeholder && typeof drag.placeholder.size === 'function') drag.placeholder.size(0, 0);
            if (drag.clone && typeof drag.removeCloneNode === 'function') drag.removeCloneNode();
        } catch (e) { /* ignore */ }
    }

    function runFastReparentUi(smm, drag) {
        applyFastReparentUi(smm, drag);
    }

    function patchDragRemoveCloneGuard(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchRemoveCloneGuard) return;
        drag._tcWorkbenchRemoveCloneGuard = true;
        var origRemoveClone = drag.removeCloneNode && drag.removeCloneNode.bind(drag);
        if (!origRemoveClone) return;
        drag.removeCloneNode = function () {
            origRemoveClone();
            this.clone = null;
            this.placeholder = null;
            this.placeHolderLine = null;
        };
    }

    function patchWorkbenchBeforeDragEnd(smm) {
        if (!smm || smm._tcWorkbenchBeforeDragEnd) return;
        smm._tcWorkbenchBeforeDragEnd = true;
        var origBeforeDragEnd = smm.opt.beforeDragEnd;
        smm.opt.beforeDragEnd = async function (info) {
            var drag = smm.drag;
            if (drag && drag._tcSuppressingFreeDragDrop) {
                if (!drag._tcPendingReparentUid) {
                    drag.overlapNode = null;
                    drag.prevNode = null;
                    drag.nextNode = null;
                } else if (drag._tcReparentTarget) {
                    prepareNodesBeforeWorkbenchReparent(smm, drag);
                    drag.overlapNode = drag._tcReparentTarget;
                    drag.prevNode = null;
                    drag.nextNode = null;
                }
            }
            if (typeof origBeforeDragEnd === 'function') {
                return await origBeforeDragEnd(info);
            }
        };
    }

    function patchDragPlaceholderVisualGuard(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchPlaceholderVisualGuard) return;
        drag._tcWorkbenchPlaceholderVisualGuard = true;
        var origSet = drag.setPlaceholderRect && drag.setPlaceholderRect.bind(drag);
        if (!origSet) return;
        drag.setPlaceholderRect = function (opts) {
            var res = origSet(opts);
            if (isSingleFreeDrag(smm, drag)) hidePlaceholderVisuals(drag);
            return res;
        };
    }

    function patchDragFastReparentUi(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchFastReparentUi) return;
        drag._tcWorkbenchFastReparentUi = true;
        var origOnMove = drag.onMove && drag.onMove.bind(drag);
        if (!origOnMove) return;
        drag.onMove = function (x, y, e) {
            drag.mouseMoveX = x;
            drag.mouseMoveY = y;
            var res = origOnMove(x, y, e);
            runFastReparentUi(smm, drag);
            return res;
        };
    }

    function patchDragMousemoveReparent(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchMousemoveReparent) return;
        drag._tcWorkbenchMousemoveReparent = true;
        var origMousemove = drag.onMousemove && drag.onMousemove.bind(drag);
        if (!origMousemove) return;
        drag.onMousemove = function (e) {
            var res = origMousemove(e);
            if (!smm.opt || !smm.opt.enableFreeDrag || !drag.isMousedown) return res;
            if (!drag.isDragging && !hasPassedDragOffset(drag)) return res;
            runFastReparentUi(smm, drag);
            return res;
        };
    }

    function patchDragPrewarmReparent(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchPrewarmReparent) return;
        drag._tcWorkbenchPrewarmReparent = true;
        var origHandleStartMove = drag.handleStartMove && drag.handleStartMove.bind(drag);
        if (!origHandleStartMove) return;
        drag.handleStartMove = async function () {
            if (!drag.isDragging && smm.opt && smm.opt.enableFreeDrag) {
                ensureReparentHintElements(smm);
                refreshReparentNodeCache(smm);
            }
            await origHandleStartMove();
            captureDragStartSnapshot(drag, smm);
            runFastReparentUi(smm, drag);
        };
        var origMousedown = drag.onNodeMousedown && drag.onNodeMousedown.bind(drag);
        if (origMousedown) {
            drag.onNodeMousedown = function (node, e) {
                drag._tcDragSettled = false;
                var res = origMousedown(node, e);
                if (smm.opt && smm.opt.enableFreeDrag) {
                    smm._tcReparentNodeCache = null;
                    captureDragStartSnapshot(drag, smm);
                }
                return res;
            };
        }
    }

    function patchDragFinalizeReparent(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchFinalizeReparent) return;
        drag._tcWorkbenchFinalizeReparent = true;
        var origMouseup = drag.onMouseup && drag.onMouseup.bind(drag);
        if (!origMouseup) return;
        drag.onMouseup = async function (e) {
            cancelScheduledFastReparentUi(drag);
            drag._tcReparentMoveApplied = false;
            finalizeReparentBeforeDrop(smm, drag);
            var savedFreeDrag = temporarilySuppressWorkbenchFreeDragPosition(smm, drag);
            var res = await origMouseup(e);
            if (shouldSettleWorkbenchDrag(drag)) {
                settleWorkbenchDragAfterDrop(smm, drag, null);
            }
            enforceWorkbenchDragCancelSafetyNet(smm, drag, null, false);
            restoreFreeDragOpt(smm, drag, savedFreeDrag);
            forceCleanupDragArtifacts(smm);
            schedulePostDragRender(smm);
            return res;
        };
    }

    function patchDragProximityReparent(smm) {
        var drag = smm && smm.drag;
        if (!drag || drag._tcWorkbenchProximityReparent) return;
        drag._tcWorkbenchProximityReparent = true;
        var origCheck = drag.checkOverlapNode && drag.checkOverlapNode.bind(drag);
        if (!origCheck) return;
        drag._tcOrigCheckOverlapNode = origCheck;
        drag.checkOverlapNode = function () {
            origCheck.apply(drag, arguments);
            if (!isSingleFreeDrag(smm, drag)) return;
            var target = resolveWorkbenchReparentTarget(smm, drag);
            if (target) {
                syncReparentHintVisual(smm, drag, target);
            } else if (!getNativeReparentTarget(drag) && !drag._tcReparentTarget) {
                clearReparentHint(smm);
            }
        };
    }

    function schedulePostDragRender(smm) {
        if (!smm || typeof smm.render !== 'function') return;
        window.requestAnimationFrame(function () {
            try {
                var drag = smm.drag;
                enforceWorkbenchDragCancelSafetyNet(smm, drag, null, false);
                refreshWorkbenchMindmapLayout(smm);
            } catch (e) { /* ignore */ }
        });
    }

    function bind(smm) {
        if (!smm || isBound(smm)) return true;
        markBound(smm);
        patchDragRemoveCloneGuard(smm);
        patchWorkbenchBeforeDragEnd(smm);
        patchDragPlaceholderVisualGuard(smm);
        patchDragFastReparentUi(smm);
        patchDragMousemoveReparent(smm);
        patchDragPrewarmReparent(smm);
        patchDragFinalizeReparent(smm);
        patchDragProximityReparent(smm);
        smm.on('node_dragend', function (info) {
            var drag = smm.drag;
            if (!drag || drag._tcDragSettled) {
                forceCleanupDragArtifacts(smm);
                return;
            }
            settleWorkbenchDragAfterDrop(smm, drag, info);
            forceCleanupDragArtifacts(smm);
            schedulePostDragRender(smm);
        });
        return true;
    }

    global.TcSmmWorkbenchDragGuard = {
        bind: bind,
        forceCleanupDragArtifacts: forceCleanupDragArtifacts,
        findReparentTargetByPointer: findReparentTargetByPointer,
        clearReparentHint: clearReparentHint,
        applyFastReparentUi: applyFastReparentUi,
        finalizeReparentBeforeDrop: finalizeReparentBeforeDrop,
        repairReparentLineArtifacts: repairReparentLineArtifacts,
        restoreCancelledFreeDrag: restoreCancelledFreeDrag,
        shouldRestoreAfterCancelledDrag: shouldRestoreAfterCancelledDrag,
        commitQuickDropReparentIfNeeded: commitQuickDropReparentIfNeeded,
        settleWorkbenchDragAfterDrop: settleWorkbenchDragAfterDrop
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_simple_mindmap_editor.js ---- */
/**
 * TestHub — Simple Mind Map 编辑器（替换 jsMind 渲染层）
 */
(function (global) {
    'use strict';

    var _showApplyLock = false;
    var _showPendingMindData = null;
    var _showApplyRaf = null;

    var state = {
        smm: null,
        facade: null,
        zoom: 1,
        dataBound: false,
        suppressExternalMindClear: false,
        ctxMenuBridgeBound: false,
        smmApplyToken: 0
    };

    function getMindMapCtor() {
        if (!global.simpleMindMap) return null;
        return global.simpleMindMap.default || global.simpleMindMap.MindMap || global.simpleMindMap;
    }

    function tcSmmIsContainerSized(el) {
        if (global.TcSmmCanvasShell && typeof global.TcSmmCanvasShell.isContainerSized === 'function') {
            return global.TcSmmCanvasShell.isContainerSized(el);
        }
        if (!el) return false;
        var w = el.offsetWidth || el.clientWidth;
        var h = el.offsetHeight || el.clientHeight;
        return w > 0 && h > 0;
    }

    function tcSmmPrepareContainerForInit(el) {
        if (global.TcSmmCanvasShell && typeof global.TcSmmCanvasShell.prepareContainerForInit === 'function') {
            return global.TcSmmCanvasShell.prepareContainerForInit(el);
        }
        return tcSmmIsContainerSized(el);
    }

    function tcSmmGetZoomStepDelta() {
        if (global.TcSmmCanvasShell && typeof global.TcSmmCanvasShell.getZoomStepDelta === 'function') {
            return global.TcSmmCanvasShell.getZoomStepDelta();
        }
        return 0.12;
    }

    function tcSmmGetZoomRatioDefaults() {
        if (global.TcSmmCanvasShell && typeof global.TcSmmCanvasShell.getZoomMinRatioDefault === 'function') {
            return {
                minRatio: global.TcSmmCanvasShell.getZoomMinRatioDefault(),
                maxRatio: global.TcSmmCanvasShell.getZoomMaxRatioDefault()
            };
        }
        return { minRatio: 20, maxRatio: 400 };
    }

    function tcSmmBuildMindMapOptions(el, hooks) {
        if (global.TcSmmCanvasShell && typeof global.TcSmmCanvasShell.buildMindMapCtorOptions === 'function') {
            return global.TcSmmCanvasShell.buildMindMapCtorOptions(el, hooks);
        }
        return { el: el, data: hooks && hooks.resolveInitialData ? hooks.resolveInitialData() : null };
    }

    function isMindmapPanelTarget(target) {
        if (!target) return false;
        if (target === document.body) return true;
        var panel = document.getElementById('tc-mindmap-view-panel');
        var container = document.getElementById('tc-smm-container');
        if (panel && (target === panel || panel.contains(target))) return true;
        if (container && container.contains(target)) return true;
        return false;
    }

    function isSmmEditTarget(target) {
        if (!target) return false;
        if (state.smm && state.smm.editNodeClassList) {
            for (var i = 0; i < state.smm.editNodeClassList.length; i++) {
                var cls = state.smm.editNodeClassList[i];
                if (target.classList && target.classList.contains(cls)) return true;
            }
        }
        if (target.closest && (
            target.closest('.smm-node-edit') ||
            target.closest('.smm-text-edit-wrap')
        )) return true;
        return false;
    }

    function tcMindmapShortcutEnableCheck(e) {
        var target = e.target;
        if (isMindmapPanelTarget(target)) return true;
        if (isSmmEditTarget(target)) return true;
        return false;
    }

    function isTcMindmapViewActive() {
        return typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap';
    }

    function tcMindmapShortcutBlockedByOverlay() {
        if (typeof tcAppDialogIsOpen === 'function' && tcAppDialogIsOpen()) return true;
        var appDlg = document.getElementById('tc-app-dialog');
        if (appDlg && !appDlg.classList.contains('hidden')) return true;
        return false;
    }

    function isTcMindmapBlockedInput() {
        if (tcMindmapShortcutBlockedByOverlay()) return true;
        if (!isTcMindmapViewActive()) return true;
        var panel = document.getElementById('tc-mindmap-view-panel');
        if (!panel || panel.classList.contains('hidden')) return true;
        if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) return true;
        var active = document.activeElement;
        if (!active) return false;
        if (isSmmEditTarget(active)) return false;
        if (active.closest) {
            if (active.closest('#edit-modal')) return true;
            if (active.closest('#left-panel')) return true;
            if (active.closest('.tc-table-fab-sheet')) return true;
            if (active.closest('.tc-provenance-panel:not(.hidden)')) return true;
        }
        var tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (active.isContentEditable && !isSmmEditTarget(active)) return true;
        return false;
    }

    function isSmmTextEditing() {
        if (!state.smm || !state.smm.renderer || !state.smm.renderer.textEdit) return false;
        try {
            return state.smm.renderer.textEdit.isShowTextEdit();
        } catch (e) {
            return false;
        }
    }

    function smmCommitTextEdit() {
        if (!state.smm || !state.smm.renderer || !state.smm.renderer.textEdit) return;
        var wasEditing = false;
        try {
            wasEditing = state.smm.renderer.textEdit.isShowTextEdit();
            if (wasEditing) {
                state.smm.renderer.textEdit.hideEditTextBox();
            }
        } catch (e) { /* ignore */ }
        if (wasEditing) {
            syncExternalMindFromFacade();
        }
    }

    function ensureSmmHasActiveNode() {
        if (!state.smm || !state.smm.renderer) return;
        try {
            var list = state.smm.renderer.activeNodeList;
            if (list && list.length) return;
            var root = state.smm.renderer.root;
            if (root) state.smm.execCommand('SET_NODE_ACTIVE', root, true);
        } catch (e) { /* ignore */ }
    }

    function smmExec(cmd) {
        if (!state.smm) return false;
        ensureSmmHasActiveNode();
        try {
            if (cmd === 'INSERT_CHILD_NODE') {
                var activeList = state.smm.renderer && state.smm.renderer.activeNodeList;
                var parent = activeList && activeList.length ? activeList[0] : state.smm.renderer.root;
                if (!parent) return false;
                state.smm.execCommand('SET_NODE_ACTIVE', parent, true);
                state.smm.execCommand('INSERT_CHILD_NODE', true, [parent]);
            } else {
                state.smm.execCommand(cmd);
            }
            syncExternalMindFromFacade();
            return true;
        } catch (e) {
            return false;
        }
    }

    function isRootNode(node) {
        if (!node) return false;
        if (node.isRoot) return true;
        try {
            return node.getData && node.getData('uid') === 'tc_root';
        } catch (e) {
            return false;
        }
    }

    function hasClipboardData() {
        return !!(state.smm && state.smm.renderer && state.smm.renderer.beingCopyData);
    }

    function activateNode(node) {
        if (!state.smm || !node) return false;
        try {
            state.smm.execCommand('SET_NODE_ACTIVE', node, true);
            return true;
        } catch (e) {
            return false;
        }
    }

    function copySelection() {
        if (!state.smm || !state.smm.renderer) return false;
        smmCommitTextEdit();
        try {
            state.smm.renderer.copy();
            return true;
        } catch (e) {
            return false;
        }
    }

    function cutSelection() {
        if (!state.smm || !state.smm.renderer) return false;
        smmCommitTextEdit();
        var activeList = state.smm.renderer.activeNodeList;
        if (activeList && activeList.length && activeList.some(isRootNode)) return false;
        try {
            state.smm.renderer.cut();
            return true;
        } catch (e) {
            return false;
        }
    }

    function pasteToActive() {
        if (!state.smm || !state.smm.renderer || !state.smm.renderer.beingCopyData) return false;
        smmCommitTextEdit();
        ensureSmmHasActiveNode();
        try {
            state.smm.execCommand('PASTE_NODE', state.smm.renderer.beingCopyData);
            return true;
        } catch (e) {
            return false;
        }
    }

    function pasteToRoot() {
        if (!state.smm || !state.smm.renderer || !state.smm.renderer.beingCopyData) return false;
        smmCommitTextEdit();
        try {
            var root = state.smm.renderer.root;
            if (root) state.smm.execCommand('SET_NODE_ACTIVE', root, true);
            state.smm.execCommand('PASTE_NODE', state.smm.renderer.beingCopyData);
            return true;
        } catch (e) {
            return false;
        }
    }

    function selectAllNodes() {
        return smmExec('SELECT_ALL');
    }

    function insertChildNode() {
        smmCommitTextEdit();
        return smmExec('INSERT_CHILD_NODE');
    }

    function insertSiblingNode() {
        smmCommitTextEdit();
        var activeList = state.smm && state.smm.renderer && state.smm.renderer.activeNodeList;
        if (activeList && activeList.length && isRootNode(activeList[0])) return false;
        return smmExec('INSERT_NODE');
    }

    function insertParentNode() {
        smmCommitTextEdit();
        var activeList = state.smm && state.smm.renderer && state.smm.renderer.activeNodeList;
        if (activeList && activeList.length && isRootNode(activeList[0])) return false;
        return smmExec('INSERT_PARENT_NODE');
    }

    function removeActiveNodes() {
        smmCommitTextEdit();
        var activeList = state.smm && state.smm.renderer && state.smm.renderer.activeNodeList;
        if (activeList && activeList.length && activeList.some(isRootNode)) return false;
        return smmExec('REMOVE_NODE');
    }

    function insertAssociativeLine() {
        if (!state.smm) return false;
        smmCommitTextEdit();
        ensureSmmHasActiveNode();
        try {
            if (state.smm.associativeLine &&
                typeof state.smm.associativeLine.createLineFromActiveNode === 'function') {
                state.smm.associativeLine.createLineFromActiveNode();
                return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function insertFreeTopicAt(clientX, clientY) {
        if (!state.smm || !state.smm.renderer) return false;
        smmCommitTextEdit();
        var root = state.smm.renderer.root;
        if (!root) return false;
        try {
            state.smm.execCommand('SET_NODE_ACTIVE', root, true);
            state.smm.execCommand('INSERT_CHILD_NODE', true, [root]);
            var newNode = state.smm.renderer.activeNodeList && state.smm.renderer.activeNodeList[0];
            if (newNode && typeof state.smm.toPos === 'function') {
                var pos = state.smm.toPos(clientX, clientY);
                state.smm.execCommand('SET_NODE_CUSTOM_POSITION', newNode, pos.x, pos.y);
            }
            syncExternalMindFromFacade();
            return true;
        } catch (e) {
            return false;
        }
    }

    function isMindmapNodeDomTarget(target) {
        if (!target || !target.closest) return false;
        return !!(
            target.closest('.smm-node') ||
            target.closest('.smm-hover-node') ||
            target.closest('.smm-text-node-wrap') ||
            target.closest('.smm-expand-btn')
        );
    }

    function walkSmmNodes(node, visit) {
        if (!node) return null;
        if (visit(node) === true) return node;
        var children = node.children;
        if (!children || !children.length) return null;
        for (var i = 0; i < children.length; i++) {
            var found = walkSmmNodes(children[i], visit);
            if (found) return found;
        }
        return null;
    }

    function resolveNodeFromDomTarget(target) {
        if (!state.smm || !state.smm.renderer || !target) return null;
        var el = target.closest && (
            target.closest('.smm-node') ||
            target.closest('.smm-hover-node') ||
            target.closest('.smm-text-node-wrap')
        );
        if (!el) return null;
        var domEl = el.closest ? (el.closest('.smm-node') || el) : el;
        return walkSmmNodes(state.smm.renderer.root, function (node) {
            try {
                return !!(node.group && node.group.node === domEl);
            } catch (e) {
                return false;
            }
        });
    }

    function clearActiveNodeText() {
        if (!state.smm || !state.smm.renderer) return false;
        smmCommitTextEdit();
        var activeList = state.smm.renderer.activeNodeList;
        if (!activeList || !activeList.length) return false;
        if (activeList.some(isRootNode)) return false;
        try {
            activeList.forEach(function (node) {
                state.smm.execCommand('SET_NODE_TEXT', node, ' ', false, true);
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    function bindContextMenuBridge() {
        if (!state.smm || state.ctxMenuBridgeBound) return;
        state.ctxMenuBridgeBound = true;
        state.smm.on('node_contextmenu', function (e, node) {
            if (typeof global.tcMindmapShowContextMenu !== 'function') return;
            if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode !== 'mindmap') return;
            if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) return;
            e.preventDefault();
            e.stopPropagation();
            global._tcMindmapCtxFromNode = true;
            global.tcMindmapShowContextMenu('node', e.clientX, e.clientY, node);
            global.setTimeout(function () { global._tcMindmapCtxFromNode = false; }, 0);
        });
    }


    function smmExtractNodeTree(payload) {
        if (!payload) return null;
        if (payload.root && payload.root.data) return payload.root;
        if (payload.data) return payload;
        return null;
    }

    function tcSmmStripHtmlToPlainText(text) {
        var s = String(text != null ? text : '').replace(/\u200b/g, '').trim();
        if (!s) return ' ';
        if (!/[<&]/.test(s)) return s;
        try {
            var el = document.createElement('div');
            var prev = s;
            el.innerHTML = prev;
            s = String(el.textContent || el.innerText || '').trim();
            for (var i = 0; i < 3 && /[<&]/.test(s) && s !== prev; i++) {
                prev = s;
                el.innerHTML = prev;
                s = String(el.textContent || el.innerText || '').trim();
            }
        } catch (e) { /* keep s */ }
        return s || ' ';
    }


    function tcSmmInstanceAttached(smm) {
        if (!smm || !smm.el) return false;
        var mount = document.getElementById('tc-smm-container');
        if (!mount || mount.classList.contains('hidden')) return false;
        if (smm.el !== mount) return false;
        return document.body.contains(mount);
    }

    function tcSmmCanApplyData(smm) {
        return tcSmmInstanceAttached(smm) && !!(smm.renderer);
    }

    function tcSmmResolveLiveInstance(preferred) {
        if (tcSmmCanApplyData(state.smm)) return state.smm;
        if (tcSmmCanApplyData(preferred)) return preferred;
        return null;
    }

    function tcSmmSafeSetData(smm, root) {
        if (!tcSmmCanApplyData(smm) || !root) return false;
        try {
            smm.setData(root);
            return true;
        } catch (eSet) {
            console.warn('[TestHub] SMM setData failed:', eSet && eSet.message ? eSet.message : eSet);
            return false;
        }
    }

    function tcSmmSafeExecCommand(smm, command) {
        if (!tcSmmCanApplyData(smm)) return false;
        try {
            smm.execCommand(command);
            return true;
        } catch (eCmd) { /* ignore */ }
        return false;
    }

    function tcSmmDeferExpandAllAfterRender(smm, applyToken) {
        if (!smm || typeof smm.on !== 'function') return;
        var handler = function () {
            if (applyToken !== state.smmApplyToken) {
                try { smm.off('node_tree_render_end', handler); } catch (eOff) { /* ignore */ }
                return;
            }
            if (!tcSmmCanApplyData(smm)) {
                try { smm.off('node_tree_render_end', handler); } catch (eOff2) { /* ignore */ }
                return;
            }
            try { smm.off('node_tree_render_end', handler); } catch (eOff3) { /* ignore */ }
            tcSmmSafeExecCommand(smm, 'EXPAND_ALL');
        };
        smm.on('node_tree_render_end', handler);
    }

    function tcSmmPlainNodeData(meta) {
        var smmData = { richText: false };
        if (meta && typeof meta === 'object') {
            Object.keys(meta).forEach(function (k) {
                if (k === 'richText' || k === 'resetRichText') return;
                smmData[k] = meta[k];
            });
        }
        smmData.richText = false;
        return smmData;
    }

    function syncExternalMindFromFacade(sourceMeta) {
        if (!state.facade || state.suppressExternalMindClear) return null;
        try {
            var snap = state.facade.get_data('node_tree');
            if (!snap || !snap.data) return null;
            if (sourceMeta) {
                snap.meta = sourceMeta;
            }
            var mindClone = JSON.parse(JSON.stringify(snap));
            tcMindmapExternalMindData = mindClone;
            tcMindmapCommittedExternalMind = mindClone;
            window.tcMindmapExternalMindData = mindClone;
            window.tcMindmapCommittedExternalMind = mindClone;
            if (typeof tcSyncWorkbenchGlobals === 'function') tcSyncWorkbenchGlobals();
            return mindClone;
        } catch (e) {
            return null;
        }
    }

    function jsMindNodeToSmm(node) {
        if (!node) return null;
        var meta = node.data || {};
        var text = tcSmmStripHtmlToPlainText(node.topic);
        var smmData = tcSmmPlainNodeData({
            text: text,
            uid: node.id || tcMindmapNewNodeId('tc'),
            expand: node.expanded !== false,
            tcType: meta.tcType,
            moduleName: meta.moduleName,
            rowIndex: meta.rowIndex,
            _tcRowRef: meta._tcRowRef
        });
        if (meta.icon) smmData.icon = Array.isArray(meta.icon) ? meta.icon.slice() : meta.icon;
        if (meta.image) smmData.image = meta.image;
        if (meta.imageSize) smmData.imageSize = meta.imageSize;
        if (meta.imageTitle) smmData.imageTitle = meta.imageTitle;
        if (meta.customLeft != null) smmData.customLeft = meta.customLeft;
        if (meta.customTop != null) smmData.customTop = meta.customTop;
        return {
            data: smmData,
            children: (node.children || []).map(jsMindNodeToSmm).filter(Boolean)
        };
    }

    function smmNodeToJsMind(node) {
        if (!node) return null;
        var d = node.data || {};
        var meta = {
            tcType: d.tcType,
            moduleName: d.moduleName,
            rowIndex: d.rowIndex,
            _tcRowRef: d._tcRowRef
        };
        Object.keys(d).forEach(function (k) {
            if (k.indexOf('border') === 0 || k.indexOf('fill') === 0) meta[k] = d[k];
        });
        if (d.icon) meta.icon = Array.isArray(d.icon) ? d.icon.slice() : d.icon;
        if (d.image) meta.image = d.image;
        if (d.imageSize) meta.imageSize = d.imageSize;
        if (d.imageTitle) meta.imageTitle = d.imageTitle;
        if (d.customLeft != null) meta.customLeft = d.customLeft;
        if (d.customTop != null) meta.customTop = d.customTop;
        return {
            id: d.uid || tcMindmapNewNodeId('tc'),
            topic: tcSmmStripHtmlToPlainText(d.text),
            expanded: d.expand !== false,
            data: meta,
            children: (node.children || []).map(smmNodeToJsMind).filter(Boolean)
        };
    }

    function mindToSmmRoot(mindData) {
        if (!mindData || !mindData.data) {
            var rootMeta = tcSmmPlainNodeData({
                text: typeof resolveTcMindmapFixedRootTopic === 'function' ? resolveTcMindmapFixedRootTopic() : (tcMindmapRootTopic || '测试用例'),
                uid: 'tc_root',
                tcType: 'root',
                expand: true
            });
            if (typeof tcMindmapShouldApplyDefaultRootIcon === 'function' && tcMindmapShouldApplyDefaultRootIcon()) {
                rootMeta.icon = [typeof resolveTcMindmapDefaultRootIcon === 'function'
                    ? resolveTcMindmapDefaultRootIcon()
                    : 'progress_1'];
            }
            return { data: rootMeta, children: [] };
        }
        return jsMindNodeToSmm(mindData.data);
    }

    function buildFacade(smm) {
        var facade = {
            _smm: smm,
            mind: { root: null },
            show: function (mindData) {
                if (!mindData || !mindData.data) return;
                _showPendingMindData = mindData;
                if (_showApplyRaf) return;
                _showApplyRaf = window.requestAnimationFrame(function () {
                    _showApplyRaf = null;
                    var pending = _showPendingMindData;
                    _showPendingMindData = null;
                    if (!pending || !pending.data) return;
                    if (_showApplyLock) {
                        _showPendingMindData = pending;
                        facade.show(pending);
                        return;
                    }
                    if (!tcSmmCanApplyData(smm)) {
                        _showPendingMindData = pending;
                        if (typeof ensureInstance === 'function') ensureInstance();
                        if (!tcSmmCanApplyData(state.smm)) {
                            window.setTimeout(function () { facade.show(pending); }, 32);
                            return;
                        }
                        smm = state.smm;
                    }
                    smm = tcSmmResolveLiveInstance(smm);
                    if (!smm) {
                        _showPendingMindData = pending;
                        window.setTimeout(function () { facade.show(pending); }, 32);
                        return;
                    }
                    var applyToken = state.smmApplyToken = (state.smmApplyToken || 0) + 1;
                    var root = mindToSmmRoot(pending);
                    var expectedChildren = (pending.data.children || []).length;
                    state.suppressExternalMindClear = true;
                    _showApplyLock = true;
                    try {
                        if (applyToken !== state.smmApplyToken || !tcSmmSafeSetData(smm, root)) {
                            return;
                        }
                        tcSmmDeferExpandAllAfterRender(smm, applyToken);
                    } finally {
                        _showApplyLock = false;
                        state.suppressExternalMindClear = false;
                    }
                    if (applyToken !== state.smmApplyToken || !tcSmmCanApplyData(smm)) {
                        return;
                    }
                var snapTree = null;
                try {
                    snapTree = smmExtractNodeTree(smm.getData(true));
                    if (!snapTree) snapTree = smm.getData(false);
                } catch (snapErr) { /* ignore */ }
                var jsRoot = snapTree ? smmNodeToJsMind(snapTree) : smmNodeToJsMind(root);
                facade.mind.root = jsRoot;
                syncTcMindmapMetaCache();
                syncExternalMindFromFacade(pending && pending.meta);
                var actualChildren = (jsRoot.children || []).length;
                if (expectedChildren > 0 && actualChildren === 0) {
                    console.warn('[TestHub] SMM tree missing children after setData, retrying');
                    if (applyToken === state.smmApplyToken && tcSmmCanApplyData(smm)) {
                        try {
                            if (tcSmmSafeSetData(smm, mindToSmmRoot(pending))) {
                                tcSmmDeferExpandAllAfterRender(smm, applyToken);
                            }
                            snapTree = smmExtractNodeTree(smm.getData(true)) || smm.getData(false);
                            facade.mind.root = smmNodeToJsMind(snapTree);
                            syncTcMindmapMetaCache();
                            syncExternalMindFromFacade(pending && pending.meta);
                        } catch (retryErr) { /* ignore */ }
                    }
                }
                tcSmmPatchRootExpandBtnSupport();
                window.setTimeout(function () { tcSmmRefreshRootExpandBtn(); }, 0);
                });
            },
            get_data: function (format) {
                if (format !== 'node_tree') return null;
                var payload = smm.getData(true);
                var nodeTree = smmExtractNodeTree(payload);
                if (!nodeTree) {
                    try { nodeTree = smm.getData(false); } catch (e) { nodeTree = null; }
                }
                var root = smmNodeToJsMind(nodeTree);
                facade.mind.root = root;
                return {
                    meta: { name: 'TestHub', author: 'TestHub', version: '1.0' },
                    format: 'node_tree',
                    data: root
                };
            },
            expand_all: function () {
                var live = tcSmmResolveLiveInstance(smm);
                if (live) tcSmmSafeExecCommand(live, 'EXPAND_ALL');
                tcSmmSetRootExpanded(true);
            },
            collapse_all: function () {
                var live = tcSmmResolveLiveInstance(smm);
                if (live) tcSmmSafeExecCommand(live, 'UNEXPAND_ALL');
                tcSmmSetRootExpanded(false);
            },
            resize: function () {
                var live = tcSmmResolveLiveInstance(smm);
                if (!live) return;
                try { live.resize(); } catch (e) { /* ignore */ }
            },
            _reset: function () {
                destroyInstance();
            },
            view: {
                zoom_current: 1,
                enlarge: function () { zoomStep(tcSmmGetZoomStepDelta()); },
                narrow: function () { zoomStep(-0.12); }
            }
        };
        return facade;
    }


    function tcSmmPrepareViewForZoom() {
        if (!state.smm) return false;
        try {
            if (typeof state.smm.resize === 'function') state.smm.resize();
            return !!(state.smm.view && state.smm.width > 0 && state.smm.height > 0);
        } catch (e) {
            return false;
        }
    }

    function tcSmmResolveViewZoomCenter(smm, clientX, clientY) {
        if (smm && typeof clientX === 'number' && typeof clientY === 'number' && typeof smm.toPos === 'function') {
            try {
                var pos = smm.toPos(clientX, clientY);
                if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                    return { cx: pos.x, cy: pos.y };
                }
            } catch (ePos) { /* ignore */ }
        }
        if (smm && smm.width > 0 && smm.height > 0) {
            return { cx: smm.width / 2, cy: smm.height / 2 };
        }
        return { cx: undefined, cy: undefined };
    }

    function tcSmmGetViewScale() {
        if (!state.smm || !state.smm.view) return 1;
        var z = state.smm.view.scale;
        return z != null && Number.isFinite(Number(z)) && Number(z) > 0 ? Number(z) : 1;
    }

    function tcSmmClampViewScale(view, scale) {
        var next = Number(scale);
        if (!Number.isFinite(next) || next <= 0) next = 1;
        var ratioDefaults = tcSmmGetZoomRatioDefaults();
        var minRatio = ratioDefaults.minRatio;
        var maxRatio = ratioDefaults.maxRatio;
        if (view && view.minZoomRatio != null) minRatio = Number(view.minZoomRatio);
        if (view && view.maxZoomRatio != null && Number(view.maxZoomRatio) > 0) maxRatio = Number(view.maxZoomRatio);
        var minS = minRatio > 0 ? minRatio / 100 : 0.2;
        var maxS = maxRatio > 0 ? maxRatio / 100 : 4;
        return Math.max(minS, Math.min(maxS, next));
    }

    function tcSmmApplyViewZoomStep(view, step, clientX, clientY) {
        var center = tcSmmResolveViewZoomCenter(state.smm, clientX, clientY);
        var cx = center.cx;
        var cy = center.cy;
        if (typeof view.enlarge === 'function' && typeof view.narrow === 'function') {
            var loops = Math.max(1, Math.round(Math.abs(step) / tcSmmGetZoomStepDelta()));
            var i;
            for (i = 0; i < loops; i++) {
                if (step > 0) view.enlarge(cx, cy);
                else view.narrow(cx, cy);
            }
            return true;
        }
        var cur = view.scale != null ? Number(view.scale) : 1;
        if (!Number.isFinite(cur) || cur <= 0) cur = 1;
        var next = tcSmmClampViewScale(view, cur + step);
        if (Math.abs(next - cur) < 0.0001) return false;
        if (typeof view.setScale === 'function') {
            view.setScale(next, cx, cy);
            return true;
        }
        return false;
    }

    function zoomStep(delta, clientX, clientY) {
        if (!state.smm || !state.smm.view) return false;
        try {
            tcSmmPrepareViewForZoom();
            var view = state.smm.view;
            var step = Number(delta) || 0;
            if (!step) return false;
            if (!tcSmmApplyViewZoomStep(view, step, clientX, clientY)) return false;
            updateZoomFromSmm();
            return true;
        } catch (e) {
            return false;
        }
    }

    function updateZoomFromSmm() {
        if (!state.smm || !state.smm.view) return;
        var z = state.smm.view.scale != null ? state.smm.view.scale : 1;
        state.zoom = z;
        if (state.facade && state.facade.view) state.facade.view.zoom_current = z;
        if (typeof tcMindmapUpdateZoomChrome === 'function') tcMindmapUpdateZoomChrome();
    }

    /** SMM 默认不为根节点渲染展开/收起按钮；临时取消 isRoot 标记以复用内置按钮 */
    function tcSmmCallExpandRender(fn, ctx) {
        if (!fn || !ctx || ctx.getChildrenLength() <= 0) return;
        if (!ctx.isRoot) {
            fn.call(ctx);
            return;
        }
        var wasRoot = ctx.isRoot;
        ctx.isRoot = false;
        try {
            fn.call(ctx);
        } finally {
            ctx.isRoot = wasRoot;
        }
    }

    function tcSmmPatchRootExpandBtnSupport() {
        if (global.__tcSmmRootExpandBtnPatched) return true;
        if (!state.smm || !state.smm.renderer || !state.smm.renderer.root) return false;
        var proto = Object.getPrototypeOf(state.smm.renderer.root);
        if (!proto || typeof proto.renderExpandBtn !== 'function') return false;
        var origRenderExpandBtn = proto.renderExpandBtn;
        var origRenderExpandBtnPlaceholderRect = proto.renderExpandBtnPlaceholderRect;
        proto.renderExpandBtn = function () {
            tcSmmCallExpandRender(origRenderExpandBtn, this);
        };
        if (typeof origRenderExpandBtnPlaceholderRect === 'function') {
            proto.renderExpandBtnPlaceholderRect = function () {
                tcSmmCallExpandRender(origRenderExpandBtnPlaceholderRect, this);
            };
        }
        global.__tcSmmRootExpandBtnPatched = true;
        return true;
    }

    function tcSmmRefreshRootExpandBtn() {
        if (!state.smm || !state.smm.renderer) return;
        var root = state.smm.renderer.root;
        if (!root || root.getChildrenLength() <= 0) return;
        try {
            if (typeof root.renderExpandBtn === 'function') root.renderExpandBtn();
            if (typeof root.renderExpandBtnPlaceholderRect === 'function') root.renderExpandBtnPlaceholderRect();
        } catch (e) { /* ignore */ }
    }

    function tcSmmSetRootExpanded(expand) {
        if (!state.smm || !state.smm.renderer) return;
        var root = state.smm.renderer.root;
        if (!root || root.getChildrenLength() <= 0) return;
        try {
            var current = root.getData ? root.getData('expand') : true;
            if (current !== false) current = true;
            if (!!current === !!expand) return;
            state.smm.execCommand('SET_NODE_DATA', root, { expand: !!expand });
        } catch (e) {
            try { state.smm.render(); } catch (e2) { /* ignore */ }
        }
    }

    function bindSmmEvents(smm) {
        if (state.dataBound) return;
        state.dataBound = true;
        smm.on('data_change', function () {
            if (state.facade) {
                var snap = state.facade.get_data('node_tree');
                if (snap && snap.data) state.facade.mind.root = snap.data;
            }
            syncTcMindmapMetaCache();
            syncExternalMindFromFacade();
            if (typeof tcMindmapSchedulePersistCache === 'function') tcMindmapSchedulePersistCache(false);
        });
        smm.on('view_data_change', function () {
            updateZoomFromSmm();
            if (typeof scheduleSyncTcMindmapProvenanceOverlay === 'function') scheduleSyncTcMindmapProvenanceOverlay();
        });
        smm.on('node_tree_render_end', function () {
            try { smm.resize(); } catch (eRenderResize) { /* ignore */ }
            tcSmmPatchRootExpandBtnSupport();
            tcSmmRefreshRootExpandBtn();
            if (typeof scheduleSyncTcMindmapProvenanceOverlay === 'function') scheduleSyncTcMindmapProvenanceOverlay();
        });
        if (global.TcSmmWorkbenchDragGuard && typeof global.TcSmmWorkbenchDragGuard.bind === 'function') {
            global.TcSmmWorkbenchDragGuard.bind(smm);
        }
    }

    function destroyInstance() {
        state.smmApplyToken = (state.smmApplyToken || 0) + 1;
        if (_showApplyRaf) {
            try { window.cancelAnimationFrame(_showApplyRaf); } catch (e0) { /* ignore */ }
            _showApplyRaf = null;
        }
        _showPendingMindData = null;
        _showApplyLock = false;
        if (state.smm) {
            try { state.smm.destroy(); } catch (e) { /* ignore */ }
        }
        state.smm = null;
        state.facade = null;
        state.dataBound = false;
        state.ctxMenuBridgeBound = false;
        global.tcMindmapInstance = null;
        tcSyncWorkbenchGlobals();
    }

    function ensureInstance() {
        var Ctor = getMindMapCtor();
        var el = document.getElementById('tc-smm-container');
        if (!Ctor || !el) return null;
        if (state.smm && state.facade) {
            if (tcSmmInstanceAttached(state.smm)) {
                global.tcMindmapInstance = state.facade;
                tcSyncWorkbenchGlobals();
                return state.facade;
            }
            destroyInstance();
        }
        if (!tcSmmIsContainerSized(el)) {
            tcSmmPrepareContainerForInit(el);
        }
        if (!tcSmmIsContainerSized(el)) return null;
        el.innerHTML = '';
        var smm;
        try {
            smm = new Ctor(tcSmmBuildMindMapOptions(el, {
                resolveInitialData: function () {
                    var ext = typeof tcMindmapExternalMindData !== 'undefined' ? tcMindmapExternalMindData : null;
                    if (!ext || !ext.data) {
                        ext = typeof tcMindmapCommittedExternalMind !== 'undefined' ? tcMindmapCommittedExternalMind : null;
                    }
                    if (ext && ext.data) return mindToSmmRoot(ext);
                    var emptyRootMeta = tcSmmPlainNodeData({
                        text: typeof resolveTcMindmapFixedRootTopic === 'function' ? resolveTcMindmapFixedRootTopic() : (tcMindmapRootTopic || '测试用例'),
                        uid: 'tc_root',
                        tcType: 'root',
                        expand: true
                    });
                    if (typeof tcMindmapShouldApplyDefaultRootIcon === 'function' && tcMindmapShouldApplyDefaultRootIcon()) {
                        emptyRootMeta.icon = [typeof resolveTcMindmapDefaultRootIcon === 'function'
                            ? resolveTcMindmapDefaultRootIcon()
                            : 'progress_1'];
                    }
                    return { data: emptyRootMeta, children: [] };
                },
                customCheckEnableShortcut: tcMindmapShortcutEnableCheck,
                beforeShortcutRun: function (key, activeNodeList) {
                    if (!activeNodeList || !activeNodeList.length) ensureSmmHasActiveNode();
                    return false;
                }
            }));
        } catch (e) {
            console.warn('[TestHub] SMM init deferred:', e && e.message ? e.message : e);
            return null;
        }
        state.smm = smm;
        state.facade = buildFacade(smm);
        bindSmmEvents(smm);
        tcSmmPatchRootExpandBtnSupport();
        tcSmmRefreshRootExpandBtn();
        bindContextMenuBridge();
        global.tcMindmapInstance = state.facade;
        tcSyncWorkbenchGlobals();
        return state.facade;
    }

    function captureMindSnapshot() {
        if (!state.facade) return buildTcMindmapMindData();
        try {
            return state.facade.get_data('node_tree');
        } catch (e) {
            return buildTcMindmapMindData();
        }
    }

    function captureViewTransform() {
        if (!state.smm || !state.smm.view || typeof state.smm.view.getTransformData !== 'function') return null;
        try {
            return state.smm.view.getTransformData();
        } catch (e) {
            return null;
        }
    }

    function restoreViewTransform(viewData) {
        if (!state.smm || !state.smm.view || !viewData) return false;
        try {
            if (typeof state.smm.view.setTransformData === 'function') {
                state.smm.view.setTransformData(viewData);
                updateZoomFromSmm();
                return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function findNodeDomByUid(uid) {
        if (!state.smm || !state.smm.renderer || !uid) return null;
        try {
            var node = state.smm.renderer.findNodeByUid(String(uid));
            if (node && node.group && node.group.node) return node.group.node;
        } catch (e) { /* ignore */ }
        return null;
    }

    function focusNode(nodeId) {
        if (!state.smm || !nodeId) return;
        try {
            var node = state.smm.renderer.findNodeByUid(nodeId);
            if (node) {
                state.smm.execCommand('GO_TARGET_NODE', node);
            }
        } catch (e) { /* ignore */ }
    }

    function fitView() {
        if (!state.smm || !state.smm.view) return false;
        try {
            tcSmmPrepareViewForZoom();
            state.smm.view.fit();
            updateZoomFromSmm();
            return true;
        } catch (e) {
            return false;
        }
    }

    function bindKeyboardShortcuts() {
        if (window._tcMindmapKeysBound) return;
        window._tcMindmapKeysBound = true;
        document.addEventListener('keydown', function (e) {
            if (tcMindmapShortcutBlockedByOverlay()) return;
            if (!isTcMindmapViewActive()) return;
            if (isTcMindmapBlockedInput()) return;
            if (!state.smm) return;

            var isEditing = isSmmTextEditing();

            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                if (isEditing) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                if (e.shiftKey) smmExec('FORWARD');
                else smmExec('BACK');
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
                if (isEditing) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                smmExec('FORWARD');
                return;
            }

            if (isEditing) return;

            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                e.stopImmediatePropagation();
                smmExec('INSERT_CHILD_NODE');
                if (typeof tcMindmapFocusPanel === 'function') tcMindmapFocusPanel();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopImmediatePropagation();
                smmExec('INSERT_NODE');
                if (typeof tcMindmapFocusPanel === 'function') tcMindmapFocusPanel();
                return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                var activeList = state.smm.renderer && state.smm.renderer.activeNodeList;
                if (!activeList || !activeList.length) return;
                var node = activeList[0];
                var uid = node && node.getData ? node.getData('uid') : null;
                if (uid === 'tc_root') return;
                e.preventDefault();
                e.stopImmediatePropagation();
                smmExec('REMOVE_NODE');
            }
        }, true);
    }

    function bindPanelCommitEdit() {
        var panel = document.getElementById('tc-mindmap-view-panel');
        if (!panel || panel._tcMindmapPanelCommitBound) return;
        panel._tcMindmapPanelCommitBound = true;
        panel.addEventListener('mousedown', function (e) {
            if (!isTcMindmapViewActive()) return;
            if (e.target.closest && (
                e.target.closest('.smm-node-edit') ||
                e.target.closest('.smm-text-edit-wrap') ||
                e.target.closest('#tc-mindmap-context-menu')
            )) return;
            smmCommitTextEdit();
        }, true);
    }

    function bindEditorCommit() {
        if (window._tcMindmapEditorCommitBound) return;
        window._tcMindmapEditorCommitBound = true;
        document.addEventListener('focusin', function (e) {
            if (!isTcMindmapViewActive()) return;
            if (!isSmmTextEditing()) return;
            var t = e.target;
            if (!t || isSmmEditTarget(t)) return;
            smmCommitTextEdit();
        }, true);
    }

    function expandAllNodes() {
        var inst = ensureInstance();
        if (inst && typeof inst.expand_all === 'function') inst.expand_all();
    }

    function collapseAllNodes() {
        var inst = ensureInstance();
        if (inst && typeof inst.collapse_all === 'function') inst.collapse_all();
    }

    global.TcSmmEditor = {
        ensure: ensureInstance,
        destroy: destroyInstance,
        getMindMapCtor: getMindMapCtor,
        isLibraryReady: function () { return !!getMindMapCtor(); },
        isInstanceReady: function () { return !!(state.smm && state.facade); },
        isContainerReady: tcSmmIsContainerSized,
        captureMindSnapshot: captureMindSnapshot,
        captureViewTransform: captureViewTransform,
        restoreViewTransform: restoreViewTransform,
        focusNode: focusNode,
        findNodeDomByUid: findNodeDomByUid,
        fitView: fitView,
        zoomStep: zoomStep,
        prepareViewForZoom: tcSmmPrepareViewForZoom,
        getViewScale: tcSmmGetViewScale,
        updateZoom: updateZoomFromSmm,
        commitTextEdit: smmCommitTextEdit,
        expandAll: expandAllNodes,
        collapseAll: collapseAllNodes,
        hasClipboardData: hasClipboardData,
        isRootNode: isRootNode,
        activateNode: activateNode,
        copySelection: copySelection,
        cutSelection: cutSelection,
        pasteToActive: pasteToActive,
        pasteToRoot: pasteToRoot,
        selectAllNodes: selectAllNodes,
        insertChildNode: insertChildNode,
        insertSiblingNode: insertSiblingNode,
        insertParentNode: insertParentNode,
        removeActiveNodes: removeActiveNodes,
        insertAssociativeLine: insertAssociativeLine,
        insertFreeTopicAt: insertFreeTopicAt,
        isMindmapNodeDomTarget: isMindmapNodeDomTarget,
        resolveNodeFromDomTarget: resolveNodeFromDomTarget,
        clearActiveNodeText: clearActiveNodeText,
        syncExternalMind: function () { return syncExternalMindFromFacade(); },
        stripHtmlToPlainText: tcSmmStripHtmlToPlainText
    };

    global.ensureTcMindmapInstance = ensureInstance;
    global.tcMindmapReleaseInstance = destroyInstance;

    global.tcMindmapBindPanelCommitEdit = bindPanelCommitEdit;
    global.tcMindmapBindNodeClickSelect = function () { /* SMM 原生处理节点选中 */ };
    global.tcMindmapBindKeyboardShortcuts = bindKeyboardShortcuts;
    global.tcMindmapBindEditorCommit = bindEditorCommit;
    global.tcMindmapBindNodeDeleteHover = function () {};
    global.tcMindmapBindDragGuard = function () {
        if (state.smm && global.TcSmmWorkbenchDragGuard && typeof global.TcSmmWorkbenchDragGuard.bind === 'function') {
            global.TcSmmWorkbenchDragGuard.bind(state.smm);
        }
    };
    global.tcMindmapBindFreeDrag = function () {};
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_mindmap_view.js ---- */
/**
 * TestHub TC Workbench — L4 DOMAIN
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
function tcMindmapZoomByStep(step, clientX, clientY) {
    if (!window.TcSmmEditor) return;
    if (typeof tcMindmapEnsureZoomUiBound === 'function') tcMindmapEnsureZoomUiBound();
    if (typeof TcSmmEditor.isInstanceReady === 'function' && !TcSmmEditor.isInstanceReady()) {
        if (typeof TcSmmEditor.ensure === 'function') TcSmmEditor.ensure();
    }
    if (typeof tcMindmapSyncCanvasSize === 'function') tcMindmapSyncCanvasSize();
    if (typeof TcSmmEditor.zoomStep === 'function') TcSmmEditor.zoomStep(step, clientX, clientY);
}

function tcMindmapFitToView() {
    if (!window.TcSmmEditor) return false;
    if (typeof TcSmmEditor.ensure === 'function') TcSmmEditor.ensure();
    if (typeof tcMindmapSyncCanvasSize === 'function') tcMindmapSyncCanvasSize();
    if (typeof TcSmmEditor.fitView === 'function') return TcSmmEditor.fitView();
    return false;
}

var _tcMindmapFitFocusTimer = null;
var _tcMindmapFitFocusAttempts = 0;
var TC_MINDMAP_FIT_FOCUS_MAX = 15;

function tcMindmapResolveRootNodeId() {
    if (tcMindmapExternalMindData && tcMindmapExternalMindData.data && tcMindmapExternalMindData.data.id) {
        return String(tcMindmapExternalMindData.data.id);
    }
    var root = tcMindmapInstance && tcMindmapInstance.mind && tcMindmapInstance.mind.root;
    if (root && root.id) return String(root.id);
    return 'tc_root';
}

function tcMindmapFitAndFocusMainBranch() {
    if (typeof tcMindmapFitToView === 'function') tcMindmapFitToView();
    if (typeof tcMindmapFocusMainBranch === 'function') tcMindmapFocusMainBranch();
    if (typeof tcMindmapUpdateZoomChrome === 'function') tcMindmapUpdateZoomChrome();
}

function tcMindmapScheduleFitAndFocusMainBranch() {
    if (_tcMindmapFitFocusTimer) {
        clearTimeout(_tcMindmapFitFocusTimer);
        _tcMindmapFitFocusTimer = null;
    }
    _tcMindmapFitFocusAttempts = 0;
    function attempt() {
        if (tcRightViewMode !== 'mindmap') return;
        if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) {
            if (_tcMindmapFitFocusAttempts < TC_MINDMAP_FIT_FOCUS_MAX) {
                _tcMindmapFitFocusAttempts += 1;
                _tcMindmapFitFocusTimer = window.setTimeout(attempt, 80);
            }
            return;
        }
        if (typeof tcMindmapContainerIsReady === 'function' && !tcMindmapContainerIsReady()) {
            if (_tcMindmapFitFocusAttempts < TC_MINDMAP_FIT_FOCUS_MAX) {
                _tcMindmapFitFocusAttempts += 1;
                _tcMindmapFitFocusTimer = window.setTimeout(attempt, 80);
            }
            return;
        }
        if (typeof ensureTcMindmapInstance === 'function') ensureTcMindmapInstance();
        if (!tcMindmapInstance) {
            if (_tcMindmapFitFocusAttempts < TC_MINDMAP_FIT_FOCUS_MAX) {
                _tcMindmapFitFocusAttempts += 1;
                _tcMindmapFitFocusTimer = window.setTimeout(attempt, 80);
            }
            return;
        }
        tcMindmapFitAndFocusMainBranch();
        if (_tcMindmapFitFocusAttempts < 2) {
            _tcMindmapFitFocusAttempts += 1;
            _tcMindmapFitFocusTimer = window.setTimeout(function () {
                tcMindmapFitAndFocusMainBranch();
            }, 220);
        }
    }
    _tcMindmapFitFocusTimer = window.setTimeout(attempt, 120);
}

function tcMindmapOnZoomWheel(e) {
    if (!tcMindmapIsMindmapZoomWheelEvent(e)) return;
    if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var dy = e.deltaY || 0;
    tcMindmapZoomByStep(dy > 0 ? -0.12 : 0.12, e.clientX, e.clientY);
}

function tcMindmapBindZoomBar() {
    var bar = document.getElementById('tc-mindmap-zoom-bar');
    if (!bar || bar._tcMindmapZoomBarBound) return;
    var outBtn = document.getElementById('tc-mindmap-zoom-out-btn');
    var inBtn = document.getElementById('tc-mindmap-zoom-in-btn');
    var fitBtn = document.getElementById('tc-mindmap-zoom-fit-btn');
    if (!outBtn && !inBtn && !fitBtn) return;
    bar._tcMindmapZoomBarBound = true;
    window._tcMindmapZoomBarBound = true;
    bar.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('#tc-mindmap-zoom-out-btn')) {
            e.preventDefault();
            e.stopPropagation();
            tcMindmapZoomByStep(-0.12);
            return;
        }
        if (t.closest('#tc-mindmap-zoom-in-btn')) {
            e.preventDefault();
            e.stopPropagation();
            tcMindmapZoomByStep(0.12);
            return;
        }
        if (t.closest('#tc-mindmap-zoom-fit-btn')) {
            e.preventDefault();
            e.stopPropagation();
            tcMindmapFitToView();
        }
    });
}

function tcMindmapEnsureZoomUiBound() {
    tcMindmapBindZoomBar();
    tcMindmapBindZoomWheel();
}

function tcMindmapEnsureCanvas() { return document.getElementById('tc-smm-container'); }

function tcMindmapSyncCanvasSize() {
    if (!window.TcSmmEditor) return false;
    if (typeof TcSmmEditor.prepareViewForZoom === 'function') return TcSmmEditor.prepareViewForZoom();
    return false;
}

function tcMindmapBindZoomWheel() {
    if (window._tcMindmapZoomWheelBound) return;
    window._tcMindmapZoomWheelBound = true;
    document.addEventListener('wheel', tcMindmapOnZoomWheel, { passive: false, capture: true });
}

function tcMindmapBindInnerZoomWheel() {}

function tcMindmapBindNodeDeleteHover() { tcMindmapHideDeleteBtn(); }

function tcMindmapUpdateZoomChrome() {
    var bar = document.getElementById('tc-mindmap-zoom-bar');
    var label = document.getElementById('tc-mindmap-zoom-label');
    var z = 1;
    if (window.TcSmmEditor && typeof TcSmmEditor.getViewScale === 'function') {
        z = TcSmmEditor.getViewScale();
    } else {
        var view = tcMindmapInstance && tcMindmapInstance.view;
        if (view && view.zoom_current) z = view.zoom_current;
    }
    if (label) label.textContent = Math.round(z * 100) + '%';
    if (bar) {
        var show = tcRightViewMode === 'mindmap' &&
            !(typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder());
        bar.classList.toggle('hidden', !show);
        bar.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
}

function tcMindmapIsMindmapZoomWheelEvent(e) {
    /* 仅 Ctrl / Alt / Meta + 滚轮缩放；普通滚轮由 SMM move 平移画布 */
    if (!e || (!e.ctrlKey && !e.altKey && !e.metaKey)) return false;
    if (tcRightViewMode !== 'mindmap') return false;
    var panel = document.getElementById('tc-mindmap-view-panel');
    if (!panel || panel.classList.contains('hidden')) return false;
    var t = e.target;
    if (!t || !t.closest) return false;
    return !!t.closest('#tc-mindmap-view-panel');
}

function tcMindmapFocusNodeById(nodeId, opts) {
    if (!nodeId) return;
    if (typeof switchTcRightView === 'function') switchTcRightView('mindmap');
    if (window.TcSmmEditor && TcSmmEditor.focusNode) {
        window.setTimeout(function () {
            TcSmmEditor.focusNode(nodeId);
        }, opts && opts.delay != null ? opts.delay : 60);
    }
}


/** 表格/导图主内容区互斥展示（避免列表模板区在导图 Tab 占位） */
function syncTcRightViewPanelIsolation(isTable, tablePanel, mindmapPanel) {
    var listPanelWrap = document.getElementById('tc-table-list-panel');
    if (listPanelWrap) {
        listPanelWrap.classList.toggle('hidden', !isTable);
        listPanelWrap.setAttribute('aria-hidden', isTable ? 'false' : 'true');
    }
    if (tablePanel) {
        tablePanel.classList.toggle('hidden', !isTable);
        tablePanel.setAttribute('aria-hidden', isTable ? 'false' : 'true');
        if (isTable) tablePanel.classList.remove('hidden');
    }
    if (mindmapPanel) {
        mindmapPanel.classList.toggle('hidden', isTable);
        mindmapPanel.setAttribute('aria-hidden', isTable ? 'true' : 'false');
        if (!isTable) mindmapPanel.classList.remove('hidden');
    }
}

function syncTcRightViewChrome() {
    const tableBtn = document.getElementById('tc-right-view-table-btn');
    const mindmapBtn = document.getElementById('tc-right-view-mindmap-btn');
    const tableActions = document.getElementById('tc-table-toolbar-actions');
    const mindmapActions = document.getElementById('tc-mindmap-toolbar-actions');
    const tablePanel = document.getElementById('tc-vxe-table-view-panel');
    const mindmapPanel = document.getElementById('tc-mindmap-view-panel');
    const isTable = tcRightViewMode === 'table';
    document.body.classList.toggle('tc-right-view-table', isTable);
    document.body.classList.toggle('tc-right-view-mindmap', !isTable);
    if (tableBtn) {
        tableBtn.classList.toggle('tc-right-view-nav__btn--active', isTable);
        tableBtn.setAttribute('aria-selected', isTable ? 'true' : 'false');
    }
    if (mindmapBtn) {
        mindmapBtn.classList.toggle('tc-right-view-nav__btn--active', !isTable);
        mindmapBtn.setAttribute('aria-selected', !isTable ? 'true' : 'false');
    }
    if (typeof syncTcRightPanelMeta === 'function') syncTcRightPanelMeta();
    if (typeof syncTcLeftInputFloatChrome === 'function') syncTcLeftInputFloatChrome();
    if (typeof syncTcLeftGenPanelLayout === 'function') syncTcLeftGenPanelLayout();
    if (tableActions) tableActions.classList.toggle('hidden', true);
    if (mindmapActions) mindmapActions.classList.add('hidden');
    if (typeof syncTcRightViewPanelIsolation === 'function') {
        syncTcRightViewPanelIsolation(isTable, tablePanel, mindmapPanel);
    } else {
        var listPanelWrap = document.getElementById('tc-table-list-panel');
        if (listPanelWrap) listPanelWrap.classList.toggle('hidden', !isTable);
        if (tablePanel) {
            tablePanel.classList.toggle('hidden', !isTable);
            tablePanel.setAttribute('aria-hidden', isTable ? 'false' : 'true');
            if (isTable) tablePanel.classList.remove('hidden');
        }
        if (mindmapPanel) {
            mindmapPanel.classList.toggle('hidden', isTable);
            mindmapPanel.setAttribute('aria-hidden', isTable ? 'true' : 'false');
            if (!isTable) mindmapPanel.classList.remove('hidden');
        }
    }
    if (typeof syncTcTableTemplateChrome === 'function') syncTcTableTemplateChrome();
    syncTcTableFabMenu();
    if (isTable) {
        tcMindmapHideDeleteBtn();
        tcMindmapHideContextMenu();
    }
    tcMindmapUpdateZoomChrome();
    if (typeof window.TcTableProductivity !== 'undefined' && window.TcTableProductivity &&
        typeof window.TcTableProductivity.syncFilterBarVisibility === 'function') {
        window.TcTableProductivity.syncFilterBarVisibility();
    }
    if (typeof window !== 'undefined' && window.TcWorkbenchEnhancements &&
        window.TcWorkbenchEnhancements.TcQcPageSession &&
        typeof window.TcWorkbenchEnhancements.TcQcPageSession.syncReopenOnViewSwitch === 'function') {
        window.TcWorkbenchEnhancements.TcQcPageSession.syncReopenOnViewSwitch();
    }
}


function syncTcExportFabReviewItemsVisible() {
    var exportCommon = document.getElementById('tc-export-fab-sheet-common');
    if (!exportCommon) return;
    var hasItems = !!exportCommon.querySelector('.tc-workbench-fab-sheet__item, .tc-table-fab-sheet__item');
    exportCommon.classList.toggle('hidden', !hasItems);
    exportCommon.setAttribute('aria-hidden', hasItems ? 'false' : 'true');
}

/** 表格/思维导图 Tab 共用导出 FAB 中的评审入口（思维导图 Tab 不再隐藏） */
function syncTcExportFabCommonGroup() {
    syncTcExportFabReviewItemsVisible();
}

function syncTcTableFabMenu() {
    var isMindmap = tcRightViewMode === 'mindmap';
    var editList = document.getElementById('tc-table-fab-sheet-list');
    var editMindmap = document.getElementById('tc-table-fab-sheet-mindmap');
    var exportList = document.getElementById('tc-export-fab-sheet-list');
    var exportMindmap = document.getElementById('tc-export-fab-sheet-mindmap');
    var editSheet = document.getElementById('tc-table-fab-sheet');
    var exportSheet = document.getElementById('tc-export-fab-sheet');
    var editToggle = document.getElementById('tc-table-fab-toggle');
    var exportToggle = document.getElementById('tc-export-fab-toggle');
    if (editList) {
        editList.classList.toggle('hidden', isMindmap);
        editList.setAttribute('aria-hidden', isMindmap ? 'true' : 'false');
    }
    if (editMindmap) {
        editMindmap.classList.toggle('hidden', !isMindmap);
        editMindmap.setAttribute('aria-hidden', !isMindmap ? 'true' : 'false');
    }
    if (exportList) {
        exportList.classList.toggle('hidden', isMindmap);
        exportList.setAttribute('aria-hidden', isMindmap ? 'true' : 'false');
    }
    if (exportMindmap) {
        exportMindmap.classList.toggle('hidden', !isMindmap);
        exportMindmap.setAttribute('aria-hidden', !isMindmap ? 'true' : 'false');
    }
    if (editSheet) editSheet.setAttribute('aria-label', isMindmap ? '编辑操作（导图）' : '编辑操作（表格）');
    if (exportSheet) exportSheet.setAttribute('aria-label', isMindmap ? '导出与协作（导图）' : '导出与协作（表格）');
    if (editToggle) {
        editToggle.setAttribute('title', '拖动移动 · 点击展开编辑菜单');
        editToggle.setAttribute('aria-label', isMindmap ? '编辑操作（导图，可拖动）' : '编辑操作（表格，可拖动）');
    }
    syncTcExportFabCommonGroup();
    if (typeof syncTcTableToolbarOpsLabel === 'function') syncTcTableToolbarOpsLabel();
    if (exportToggle) {
        exportToggle.setAttribute('title', '拖动移动 · 点击展开导出与协作');
        exportToggle.setAttribute('aria-label', isMindmap ? '导出与协作（导图，可拖动）' : '导出与协作（表格，可拖动）');
    }
}

var _tcMindmapRenderRetryTimer = null;
var _tcMindmapRenderRetryCount = 0;
var TC_MINDMAP_RENDER_RETRY_MAX = 30;
var _tcMindmapLibraryRetryCount = 0;
var TC_MINDMAP_LIBRARY_RETRY_MAX = 20;

function tcMindmapLibraryReady() {
    if (window.TcSmmEditor && typeof TcSmmEditor.isLibraryReady === 'function') {
        return TcSmmEditor.isLibraryReady();
    }
    if (typeof simpleMindMap === 'undefined') return false;
    var Ctor = simpleMindMap.default || simpleMindMap.MindMap || simpleMindMap;
    return !!Ctor;
}
var _tcMindmapRenderReadyTimer = null;
var _tcMindmapRenderReadyAttempts = 0;
var TC_MINDMAP_RENDER_READY_MAX = 24;



function tcMindmapPaintView(opts) {
    opts = opts || {};
    if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode !== 'mindmap') return;
    if (tcMindmapGenerating && !(typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData.length)) return;
    var release = opts.releaseInstance !== false;
    var paintToken = (window._tcMindmapPaintSeq = (window._tcMindmapPaintSeq || 0) + 1);
    var painted = false;

    function paintFull(forceWhenNotReady) {
        if (paintToken !== window._tcMindmapPaintSeq) return false;
        if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode !== 'mindmap') return false;
        if (painted) return true;
        if (typeof tcMindmapPrepareContainerLayout === 'function') tcMindmapPrepareContainerLayout();
        if (!forceWhenNotReady && typeof tcMindmapContainerIsReady === 'function' && !tcMindmapContainerIsReady()) {
            return false;
        }
        painted = true;
        if (release && typeof tcMindmapReleaseInstance === 'function') tcMindmapReleaseInstance();
        renderTcMindmap({ forceLayout: true, releaseInstance: false });
        return true;
    }

    function onFallbackDelay() {
        if (paintToken !== window._tcMindmapPaintSeq) return;
        if (!painted) paintFull(true);
    }

    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { requestAnimationFrame(function () { paintFull(false); }); });
    } else {
        window.setTimeout(function () { paintFull(false); }, 0);
    }
    window.setTimeout(onFallbackDelay, 300);
}
window.tcMindmapPaintView = tcMindmapPaintView;

/** 切回表格 Tab 时挂起导图实例，避免再次进入 Tab 时先闪旧画布再重建 */
function tcMindmapSuspendForTableView() {
    if (window.TcSmmEditor && typeof TcSmmEditor.captureViewTransform === 'function') {
        try {
            var vt = TcSmmEditor.captureViewTransform();
            if (vt) tcMindmapPendingViewTransform = vt;
        } catch (eVt) { /* ignore */ }
    }
    if (typeof tcMindmapReleaseInstance === 'function') tcMindmapReleaseInstance();
    var container = document.getElementById('tc-smm-container');
    if (container) container.classList.add('hidden');
}
window.tcMindmapSuspendForTableView = tcMindmapSuspendForTableView;

function tcMindmapPaintViewOnTabReshow() {
    tcMindmapPaintView({ releaseInstance: false });
}
window.tcMindmapPaintViewOnTabReshow = tcMindmapPaintViewOnTabReshow;


/** 导图面板刚显示时容器可能尚未完成布局，延迟到有尺寸后再 render */
function tcMindmapRenderWhenReady(opts) {
    opts = opts || {};
    tcMindmapPaintView({ releaseInstance: opts.releaseInstance !== false });
}
window.tcMindmapRenderWhenReady = tcMindmapRenderWhenReady;
window.ensureTcRightViewUiInited = ensureTcRightViewUiInited;
window.tcMindmapEnsureZoomUiBound = tcMindmapEnsureZoomUiBound;

function resolveTcMindmapRenderPayload() {
    function cloneExtMind(src) {
        if (!src || !src.data) return null;
        try {
            var cloned = JSON.parse(JSON.stringify(src));
            if (cloned.data && typeof tcMindmapEnsureRootVisualDefaults === 'function') {
                tcMindmapEnsureRootVisualDefaults(cloned.data);
            }
            return cloned;
        } catch (eClone) {
            return src;
        }
    }
    function pickExternalMind() {
        var ext = typeof tcMindmapExternalMindData !== 'undefined' ? tcMindmapExternalMindData : null;
        if ((!ext || !ext.data) && typeof tcMindmapCommittedExternalMind !== 'undefined') {
            ext = tcMindmapCommittedExternalMind;
        }
        if ((!ext || !ext.data) && typeof window !== 'undefined') {
            ext = window.tcMindmapCommittedExternalMind || window.tcMindmapExternalMindData;
        }
        if (ext && ext.data && typeof tcMindmapStashMindHasUserNodes === 'function' &&
            tcMindmapStashMindHasUserNodes(ext)) {
            return cloneExtMind(ext);
        }
        return null;
    }
    var fromExt = pickExternalMind();
    if (fromExt) return fromExt;
    var hasCaseRows = !!(typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData.length);
    if (!hasCaseRows && typeof tcMindmapHydrateFromTableIfEmpty === 'function') {
        if (tcMindmapHydrateFromTableIfEmpty()) {
            hasCaseRows = tcMindmapCasesData.length > 0;
        }
    }
    if (hasCaseRows) {
        var fromRows = buildTcMindmapMindData();
        if (fromRows && fromRows.data && typeof tcMindmapEnsureRootVisualDefaults === 'function') {
            tcMindmapEnsureRootVisualDefaults(fromRows.data);
        }
        return fromRows;
    }
    var extFallback = typeof tcMindmapExternalMindData !== 'undefined' ? tcMindmapExternalMindData : null;
    if ((!extFallback || !extFallback.data) && typeof tcMindmapCommittedExternalMind !== 'undefined') {
        extFallback = tcMindmapCommittedExternalMind;
    }
    if (extFallback && extFallback.data) return cloneExtMind(extFallback);
    var built = buildTcMindmapMindData();
    if (built && built.data && typeof tcMindmapEnsureRootVisualDefaults === 'function') {
        tcMindmapEnsureRootVisualDefaults(built.data);
    }
    return built;
}


function tcMindmapPrepareContainerLayout() {
    var el = document.getElementById('tc-smm-container');
    var panel = document.getElementById('tc-mindmap-view-panel');
    if (!el || !panel) return false;
    if (panel.classList.contains('hidden') || panel.getAttribute('aria-hidden') === 'true') return false;
    if (document.body && document.body.classList.contains('tc-right-view-table')) return false;
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    var stage = el.closest ? el.closest('.tc-mindmap-stage') : null;
    var panelRect = panel.getBoundingClientRect ? panel.getBoundingClientRect() : null;
    var panelH = (panelRect && panelRect.height > 0) ? panelRect.height : (panel.offsetHeight || panel.clientHeight || 0);
    var panelW = (panelRect && panelRect.width > 0) ? panelRect.width : (panel.offsetWidth || panel.clientWidth || 0);
    if (panelH <= 0) {
        panel.style.flex = '1 1 auto';
        panel.style.minHeight = 'min(78vh, 720px)';
        void panel.offsetHeight;
        panelH = panel.offsetHeight || panel.clientHeight || 0;
    }
    if (panelH > 0) {
        el.style.width = '100%';
        el.style.height = panelH + 'px';
        el.style.minHeight = panelH + 'px';
        if (stage) {
            stage.style.height = panelH + 'px';
            stage.style.minHeight = panelH + 'px';
        }
    } else {
        el.style.width = '100%';
        el.style.minHeight = '420px';
        el.style.height = '420px';
    }
    if (panelW > 0) {
        el.style.width = '100%';
    }
    void el.offsetHeight;
    return (el.offsetHeight || el.clientHeight) > 0 && (el.offsetWidth || el.clientWidth) > 0;
}
window.tcMindmapPrepareContainerLayout = tcMindmapPrepareContainerLayout;

function tcMindmapContainerIsReady() {
    var el = document.getElementById('tc-smm-container');
    var panel = document.getElementById('tc-mindmap-view-panel');
    if (!el || !panel) return false;
    if (panel.classList.contains('hidden') || panel.getAttribute('aria-hidden') === 'true') return false;
    if (document.body && document.body.classList.contains('tc-right-view-table')) return false;
    var w = el.offsetWidth || el.clientWidth;
    var h = el.offsetHeight || el.clientHeight;
    return w > 0 && h > 0;
}

function tcMindmapScheduleRenderRetry() {
    if (_tcMindmapRenderRetryCount >= TC_MINDMAP_RENDER_RETRY_MAX) {
        _tcMindmapRenderRetryCount = 0;
        renderTcMindmap({ forceLayout: true });
        return;
    }
    if (_tcMindmapRenderRetryTimer) return;
    _tcMindmapRenderRetryTimer = window.setTimeout(function () {
        _tcMindmapRenderRetryTimer = null;
        _tcMindmapRenderRetryCount += 1;
        renderTcMindmap();
    }, 80);
}


function tcMindmapNeedsDbRestoreFromStore() {
    if (typeof TcRequirementMindmapStore !== 'undefined' &&
        typeof TcRequirementMindmapStore.mindmapNeedsDbRestore === 'function') {
        return TcRequirementMindmapStore.mindmapNeedsDbRestore();
    }
    if (typeof tcMindmapStashMindHasUserNodes === 'function') {
        var ext = tcMindmapExternalMindData || tcMindmapCommittedExternalMind;
        if (tcMindmapStashMindHasUserNodes(ext)) return false;
    }
    return !(typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData.length);
}

function tcFinishMindmapViewSwitchAfterRestore(skipCacheRestore, opts) {
    opts = opts || {};
    if (!tcMindmapCasesData.length && !skipCacheRestore && typeof tcMindmapHydrateFromTableIfEmpty === 'function') {
        tcMindmapHydrateFromTableIfEmpty();
    }
    if (!tcMindmapHistory.length && tcMindmapCasesData.length) {
        tcMindmapEnsureHistoryReady();
    }
    if (tcMindmapGenerating) {
        showTcMindmapGeneratingUi();
    } else {
        if (!skipCacheRestore && tcMindmapCachedMindPayload) {
            tcMindmapRestoreCachedMindIfAny();
        }
        tcMindmapPaintViewOnTabReshow();
    }
    tcMindmapSkipCacheRestore = false;
    tcMindmapCachedMindPayload = null;
    tcMindmapFocusPanel();
}

function tcFinishMindmapViewSwitch() {
    var skipCacheRestore = tcMindmapSkipCacheRestore;

    function finishView() {
        if (!skipCacheRestore) tcMindmapSchedulePersistCache(true);
        tcFinishMindmapViewSwitchAfterRestore(skipCacheRestore, {});
    }

    if (typeof TcRequirementMindmapStore !== 'undefined' &&
        typeof TcRequirementMindmapStore.loadForMindmapTabView === 'function' &&
        typeof TcRequirementMindmapStore.mindmapNeedsDbRestore === 'function' &&
        TcRequirementMindmapStore.mindmapNeedsDbRestore()) {
        TcRequirementMindmapStore.loadForMindmapTabView({ deferRender: true })
            .then(function () { finishView(); })
            .catch(function () { finishView(); });
        return;
    }
    finishView();
}

function tcMindmapSyncExternalMindFromInstance() {
    if (window.TcSmmEditor && typeof TcSmmEditor.syncExternalMind === 'function') {
        return TcSmmEditor.syncExternalMind();
    }
    var snap = typeof tcMindmapCaptureMindSnapshot === 'function' ? tcMindmapCaptureMindSnapshot() : null;
    if (!snap || !snap.data) return null;
    tcMindmapExternalMindData = snap;
    tcMindmapCommittedExternalMind = snap;
    window.tcMindmapExternalMindData = snap;
    window.tcMindmapCommittedExternalMind = snap;
    if (typeof tcSyncWorkbenchGlobals === 'function') tcSyncWorkbenchGlobals();
    return snap;
}

function switchTcRightView(mode) {
    if (mode !== 'table' && mode !== 'mindmap') mode = 'table';
    if (typeof tcAutoRecoverySuppressForViewSwitch === 'function') {
        tcAutoRecoverySuppressForViewSwitch();
    }
    if (tcRightViewMode === 'mindmap' && mode !== 'mindmap') {
        tcMindmapCommitEditing();
        tcMindmapSyncExternalMindFromInstance();
        if (typeof TcRequirementMindmapStore !== 'undefined' &&
            typeof TcRequirementMindmapStore.persistNow === 'function') {
            TcRequirementMindmapStore.persistNow('manual_edit', {});
        }
        tcMindmapPersistCache();
        if (typeof tcMindmapSuspendForTableView === 'function') tcMindmapSuspendForTableView();
    }
    if (tcRightViewMode === mode) {
        if (mode === 'mindmap') {
            syncTcRightViewChrome();
            if (tcMindmapGenerating) showTcMindmapGeneratingUi();
            else tcMindmapRenderWhenReady();
            tcMindmapFocusPanel();
        }
        return;
    }
    var prevMode = tcRightViewMode;
    if (typeof tcFabPersistViewFabPositions === 'function') {
        tcFabPersistViewFabPositions(prevMode);
    }
    tcRightViewMode = mode;
    tcSyncWorkbenchGlobals();
    syncTcRightViewChrome();
    if (typeof closeTcTableFabSheet === 'function') closeTcTableFabSheet();
    if (typeof tcFabApplyViewFabPositions === 'function') {
        tcFabApplyViewFabPositions(mode);
    } else if (typeof syncTcWorkbenchFabPositionsOnViewSwitch === 'function') {
        syncTcWorkbenchFabPositionsOnViewSwitch();
    }
    if (mode === 'table') {
        if (window.TcTableView && typeof window.TcTableView.onViewShow === 'function') {
            window.TcTableView.onViewShow();
        }
        renderTableBody({ reload: true });
    } else if (mode === 'mindmap') {
        var afterTablePull = function() { tcFinishMindmapViewSwitch(); };
        var runPullThenFinish = function() {
            if (window.TcTableView && typeof window.TcTableView.pullRows === 'function') {
                var pullPromise = window.TcTableView.pullRows();
                if (pullPromise && typeof pullPromise.then === 'function') {
                    pullPromise.then(afterTablePull).catch(afterTablePull);
                } else {
                    afterTablePull();
                }
            } else {
                afterTablePull();
            }
        };
        if (window.TcTableView && typeof window.TcTableView.onViewHide === 'function') {
            var hidePromise = window.TcTableView.onViewHide();
            if (hidePromise && typeof hidePromise.then === 'function') {
                hidePromise.then(runPullThenFinish).catch(runPullThenFinish);
            } else {
                runPullThenFinish();
            }
        } else {
            runPullThenFinish();
        }
    }
}

function hideTcMindmapGenerating() {
    tcMindmapGenerating = false;
    var loadingEl = document.getElementById('tc-mindmap-loading');
    if (loadingEl) {
        loadingEl.classList.add('hidden');
        loadingEl.setAttribute('aria-hidden', 'true');
    }
}

/** 空占位副文案：未选模板时提示用户去表格页选择模板 */
function syncTcMindmapEmptyHint(showTemplateHint) {
    var hintEl = document.getElementById('tc-mindmap-empty-hint');
    if (!hintEl) return;
    if (showTemplateHint) {
        hintEl.classList.remove('hidden');
        hintEl.setAttribute('aria-hidden', 'false');
    } else {
        hintEl.classList.add('hidden');
        hintEl.setAttribute('aria-hidden', 'true');
    }
}

/** 仅更新导图区 DOM：展示「正在生成中」，不切换视图 */
function showTcMindmapGeneratingUi() {
    tcMindmapHideDeleteBtn();
    var container = document.getElementById('tc-smm-container');
    var emptyEl = document.getElementById('tc-mindmap-empty');
    var loadingEl = document.getElementById('tc-mindmap-loading');
    if (container) {
        if (typeof tcMindmapReleaseInstance === 'function') tcMindmapReleaseInstance();
        container.classList.add('hidden');
        if (container.innerHTML) container.innerHTML = '';
    }
    if (emptyEl) {
        emptyEl.classList.add('hidden');
        emptyEl.setAttribute('aria-hidden', 'true');
        syncTcMindmapEmptyHint(false);
    }
    if (loadingEl) {
        loadingEl.classList.remove('hidden');
        loadingEl.setAttribute('aria-hidden', 'false');
    }
}

function showTcMindmapGenerating() {
    tcMindmapGenerating = true;
    switchTcRightView('mindmap');
    showTcMindmapGeneratingUi();
}

function renderTcMindmap(opts) {
    opts = opts || {};
    if (tcRightViewMode !== 'mindmap') return;
    if (tcMindmapGenerating && !tcMindmapCasesData.length) {
        showTcMindmapGeneratingUi();
        return;
    }
    hideTcMindmapGenerating();
    const container = document.getElementById('tc-smm-container');
    const emptyEl = document.getElementById('tc-mindmap-empty');
    if (!container) return;
    if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) {
        if (typeof tcMindmapReleaseInstance === 'function') tcMindmapReleaseInstance();
        if (container.innerHTML) container.innerHTML = '';
        container.classList.add('hidden');
        if (emptyEl) {
            emptyEl.classList.remove('hidden');
            emptyEl.setAttribute('aria-hidden', 'false');
            var emptyTitle = emptyEl.querySelector('.ds-table-empty__title');
            if (emptyTitle) emptyTitle.textContent = '暂无思维导图';
            syncTcMindmapEmptyHint(!(tableColumns && tableColumns.length));
        }
        tcMindmapUpdateZoomChrome();
        return;
    }
    container.classList.remove('hidden');
    if (emptyEl) {
        emptyEl.classList.add('hidden');
        emptyEl.setAttribute('aria-hidden', 'true');
        syncTcMindmapEmptyHint(false);
    }
    if (!tcMindmapLibraryReady()) {
        if (_tcMindmapLibraryRetryCount < TC_MINDMAP_LIBRARY_RETRY_MAX) {
            _tcMindmapLibraryRetryCount += 1;
            window.setTimeout(function () {
                if (tcRightViewMode === 'mindmap' && typeof renderTcMindmap === 'function') {
                    renderTcMindmap();
                }
            }, 120);
            return;
        }
        _tcMindmapLibraryRetryCount = 0;
        container.classList.add('hidden');
        if (emptyEl) {
            emptyEl.classList.remove('hidden');
            emptyEl.setAttribute('aria-hidden', 'false');
            var errTitle = emptyEl.querySelector('.ds-table-empty__title');
            if (errTitle) errTitle.textContent = '思维导图组件未加载';
            syncTcMindmapEmptyHint(false);
        }
        return;
    }
    _tcMindmapLibraryRetryCount = 0;
    tcMindmapPrepareContainerLayout();
    if (!opts.forceLayout && !tcMindmapContainerIsReady()) {
        tcMindmapScheduleRenderRetry();
        return;
    }
    _tcMindmapRenderRetryCount = 0;
    const mindData = resolveTcMindmapRenderPayload();
    if (typeof tcMindmapReleaseInstance === 'function' && opts.releaseInstance) {
        tcMindmapReleaseInstance();
    }
    ensureTcMindmapInstance();
    var mmInst = tcMindmapResolveInstance();
    if (!mmInst) {
        tcMindmapScheduleRenderRetry();
        return;
    }
    tcMindmapClearMindSelection();
    mmInst.show(mindData);
    _tcMindmapRenderReadyAttempts = 0;
    syncTcMindmapMetaCache();
    if (!tcMindmapInUndoSync) tcMindmapEnsureHistoryReady();
    window.setTimeout(function () {
        var mmResize = tcMindmapResolveInstance();
        if (mmResize && typeof mmResize.resize === 'function') {
            mmResize.resize();
        }
        if (typeof tcMindmapPendingViewTransform !== 'undefined' && tcMindmapPendingViewTransform &&
            window.TcSmmEditor && typeof TcSmmEditor.restoreViewTransform === 'function') {
            TcSmmEditor.restoreViewTransform(tcMindmapPendingViewTransform);
            tcMindmapPendingViewTransform = null;
            tcMindmapUpdateZoomChrome();
        } else if (tcMindmapPendingFitFocus) {
            tcMindmapPendingFitFocus = false;
            tcMindmapScheduleFitAndFocusMainBranch();
        } else {
            tcMindmapFitToView();
            tcMindmapUpdateZoomChrome();
        }
    }, 120);
    tcMindmapEnsureZoomUiBound();
    tcMindmapRebindMindmapInteractions();
    tcSyncWorkbenchGlobals();
}


function tcMindmapResolveInstance() {
    if (tcMindmapInstance) return tcMindmapInstance;
    if (typeof window !== 'undefined' && window.tcMindmapInstance) return window.tcMindmapInstance;
    if (window.TcSmmEditor && typeof TcSmmEditor.ensure === 'function') {
        return TcSmmEditor.ensure();
    }
    return null;
}

function tcMindmapHideContextMenu() {
    var menu = document.getElementById('tc-mindmap-context-menu');
    if (!menu) return;
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
}
window.tcMindmapHideContextMenu = tcMindmapHideContextMenu;

function tcMindmapExpandAll() {
    var inst = tcMindmapResolveInstance();
    if (inst && typeof inst.expand_all === 'function') {
        inst.expand_all();
    } else if (window.TcSmmEditor && typeof TcSmmEditor.expandAll === 'function') {
        TcSmmEditor.expandAll();
    }
}

function tcMindmapCollapseAll() {
    var inst = tcMindmapResolveInstance();
    if (inst && typeof inst.collapse_all === 'function') {
        inst.collapse_all();
    } else if (window.TcSmmEditor && typeof TcSmmEditor.collapseAll === 'function') {
        TcSmmEditor.collapseAll();
    }
}

function tcMindmapFocusMainBranch() {
    tcMindmapSafeSelectNode(null, tcMindmapResolveRootNodeId());
    tcMindmapFocusPanel();
}


function tcMindmapIsContextMenuOpen() {
    var menu = document.getElementById('tc-mindmap-context-menu');
    return !!(menu && !menu.classList.contains('hidden'));
}

function tcMindmapDismissContextMenuOnOutsidePointer(event) {
    if (!tcMindmapIsContextMenuOpen()) return;
    var target = event && event.target;
    if (target && target.closest && target.closest('#tc-mindmap-context-menu')) return;
    tcMindmapHideContextMenu();
}

function tcMindmapBindContextMenuOutsideDismiss() {
    if (window._tcMindmapCtxMenuOutsideDismissBound) return;
    window._tcMindmapCtxMenuOutsideDismissBound = true;
    var onOutside = function (e) {
        tcMindmapDismissContextMenuOnOutsidePointer(e);
    };
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('click', onOutside, true);
    document.addEventListener('contextmenu', function (e) {
        if (!tcMindmapIsContextMenuOpen()) return;
        var target = e && e.target;
        if (target && target.closest && target.closest('#tc-mindmap-context-menu')) return;
        tcMindmapHideContextMenu();
    }, true);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') tcMindmapHideContextMenu();
    }, true);
    window.addEventListener('scroll', tcMindmapHideContextMenu, true);
    window.addEventListener('resize', tcMindmapHideContextMenu, { passive: true });
}

function tcMindmapEnsureContextMenuMounted() {
    var menu = document.getElementById('tc-mindmap-context-menu');
    if (menu && menu.parentElement !== document.body) {
        document.body.appendChild(menu);
    }
    return menu;
}

var tcMindmapCtxState = {
    mode: 'canvas',
    node: null,
    clientX: 0,
    clientY: 0
};

var TC_MINDMAP_CTX_MENU_DEFS = {
    canvas: [
        { action: 'selectAll', label: '全选' },
        { action: 'paste', label: '粘贴', needClipboard: true },
        { type: 'separator' },
        { action: 'insertFreeTopic', label: '插入自由主题' },
        { type: 'separator' },
        { action: 'focusMainBranch', label: '聚焦主分支' },
        { action: 'fitView', label: '适应画布', primary: true }
    ],
    root: [
        { action: 'copy', label: '复制' },
        { action: 'cut', label: '剪切', disableOnRoot: true },
        { action: 'paste', label: '粘贴', needClipboard: true },
        { type: 'separator' },
        { action: 'insertChild', label: '插入子主题' },
        { action: 'insertSibling', label: '插入同级主题', disableOnRoot: true },
        { action: 'insertAssociativeLine', label: '插入关联线' },
        { type: 'separator' },
        { action: 'remove', label: '删除', disableOnRoot: true, danger: true },
        { type: 'separator' },
        { action: 'focusMainBranch', label: '聚焦主分支' },
        { action: 'fitView', label: '适应画布', primary: true }
    ],
    child: [
        { action: 'copy', label: '复制' },
        { action: 'cut', label: '剪切' },
        { action: 'paste', label: '粘贴', needClipboard: true },
        { action: 'clearText', label: '清空文本' },
        { type: 'separator' },
        { action: 'insertChild', label: '插入子主题' },
        { action: 'insertSibling', label: '插入同级主题' },
        { action: 'insertAssociativeLine', label: '插入关联线' },
        { type: 'separator' },
        { action: 'remove', label: '删除', danger: true },
        { type: 'separator' },
        { action: 'focusMainBranch', label: '聚焦主分支' },
        { action: 'fitView', label: '适应画布', primary: true }
    ]
};

function tcMindmapResolveContextMenuMode(node) {
    if (!node) return 'canvas';
    var Ed = window.TcSmmEditor;
    if (Ed && typeof Ed.isRootNode === 'function' && Ed.isRootNode(node)) return 'root';
    return 'child';
}

function tcMindmapResolveContextMenuItems(mode) {
    if (mode === 'root') return TC_MINDMAP_CTX_MENU_DEFS.root;
    if (mode === 'child') return TC_MINDMAP_CTX_MENU_DEFS.child;
    return TC_MINDMAP_CTX_MENU_DEFS.canvas;
}

function tcMindmapIsContextMenuItemDisabled(item, mode, node) {
    if (!item || item.type === 'separator') return false;
    var Ed = window.TcSmmEditor;
    if (item.needClipboard && Ed && typeof Ed.hasClipboardData === 'function' && !Ed.hasClipboardData()) {
        return true;
    }
    if (item.disableOnRoot && mode === 'root' && node && Ed && typeof Ed.isRootNode === 'function' && Ed.isRootNode(node)) {
        return true;
    }
    return false;
}

function tcMindmapRenderContextMenuBody() {
    var body = document.getElementById('tc-mindmap-context-menu-body');
    if (!body) return;
    var mode = tcMindmapCtxState.mode || 'canvas';
    var node = tcMindmapCtxState.node || null;
    var items = tcMindmapResolveContextMenuItems(mode);
    body.innerHTML = '';
    items.forEach(function (item) {
        if (item.type === 'separator') {
            var sep = document.createElement('div');
            sep.className = 'tc-mindmap-context-menu__separator';
            sep.setAttribute('role', 'separator');
            body.appendChild(sep);
            return;
        }
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tc-mindmap-context-menu__item';
        btn.setAttribute('role', 'menuitem');
        btn.textContent = item.label;
        btn.dataset.action = item.action;
        if (item.primary) btn.classList.add('tc-mindmap-context-menu__item--primary');
        if (item.danger) btn.classList.add('tc-mindmap-context-menu__item--danger');
        if (tcMindmapIsContextMenuItemDisabled(item, mode, node)) {
            btn.disabled = true;
            btn.classList.add('is-disabled');
        }
        btn.addEventListener('click', function () {
            if (btn.disabled) return;
            tcMindmapExecuteContextAction(item.action);
        });
        body.appendChild(btn);
    });
}

function tcMindmapExecuteContextAction(action) {
    tcMindmapHideContextMenu();
    var Ed = window.TcSmmEditor;
    if (!Ed) return;
    Ed.ensure();
    if (typeof Ed.commitTextEdit === 'function') Ed.commitTextEdit();
    var mode = tcMindmapCtxState.mode || 'canvas';
    var node = tcMindmapCtxState.node || null;
    if ((mode === 'root' || mode === 'child') && node && typeof Ed.activateNode === 'function') {
        Ed.activateNode(node);
    }
    switch (action) {
        case 'selectAll':
            if (typeof Ed.selectAllNodes === 'function') Ed.selectAllNodes();
            break;
        case 'paste':
            if (mode === 'canvas') {
                if (typeof Ed.pasteToRoot === 'function') Ed.pasteToRoot();
            } else if (typeof Ed.pasteToActive === 'function') {
                Ed.pasteToActive();
            }
            break;
        case 'insertFreeTopic':
            if (typeof Ed.insertFreeTopicAt === 'function') {
                Ed.insertFreeTopicAt(tcMindmapCtxState.clientX, tcMindmapCtxState.clientY);
            }
            break;
        case 'copy':
            if (typeof Ed.copySelection === 'function') Ed.copySelection();
            break;
        case 'cut':
            if (typeof Ed.cutSelection === 'function') Ed.cutSelection();
            break;
        case 'insertChild':
            if (typeof Ed.insertChildNode === 'function') Ed.insertChildNode();
            break;
        case 'insertSibling':
            if (typeof Ed.insertSiblingNode === 'function') Ed.insertSiblingNode();
            break;
        case 'insertParent':
            if (typeof Ed.insertParentNode === 'function') Ed.insertParentNode();
            break;
        case 'insertAssociativeLine':
            if (typeof Ed.insertAssociativeLine === 'function') Ed.insertAssociativeLine();
            break;
        case 'remove':
            if (typeof Ed.removeActiveNodes === 'function') Ed.removeActiveNodes();
            break;
        case 'clearText':
            if (typeof Ed.clearActiveNodeText === 'function') Ed.clearActiveNodeText();
            break;
        case 'expandAll':
            tcMindmapExpandAll();
            break;
        case 'collapseAll':
            tcMindmapCollapseAll();
            break;
        case 'focusMainBranch':
            tcMindmapFocusMainBranch();
            break;
        case 'fitView':
            tcMindmapFitToView();
            break;
        default:
            break;
    }
    if (typeof tcMindmapFocusPanel === 'function') tcMindmapFocusPanel();
}

function tcMindmapPlaceContextMenu(menu, clientX, clientY) {
    if (!menu) return;
    function placeMenu() {
        var rect = menu.getBoundingClientRect();
        var mw = rect.width || menu.offsetWidth || 168;
        var mh = rect.height || menu.offsetHeight || 140;
        var left = clientX;
        var top = clientY;
        if (left + mw > window.innerWidth - 8) left = clientX - mw;
        if (top + mh > window.innerHeight - 8) top = clientY - mh;
        left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
        top = Math.max(8, Math.min(top, window.innerHeight - mh - 8));
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }
    placeMenu();
    window.requestAnimationFrame(placeMenu);
}

function tcMindmapShowContextMenu(mode, clientX, clientY, node) {
    if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode !== 'mindmap') return;
    var panel = document.getElementById('tc-mindmap-view-panel');
    if (!panel || panel.classList.contains('hidden')) return;
    if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) return;
    var menu = tcMindmapEnsureContextMenuMounted();
    if (!menu) return;
    if (window.TcSmmEditor && typeof TcSmmEditor.ensure === 'function') TcSmmEditor.ensure();
    var menuMode = mode === 'canvas' ? 'canvas' : tcMindmapResolveContextMenuMode(node);
    tcMindmapCtxState.mode = menuMode;
    tcMindmapCtxState.node = node || null;
    tcMindmapCtxState.clientX = clientX;
    tcMindmapCtxState.clientY = clientY;
    tcMindmapRenderContextMenuBody();
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    tcMindmapPlaceContextMenu(menu, clientX, clientY);
    tcMindmapBindContextMenuOutsideDismiss();
}
window.tcMindmapShowContextMenu = tcMindmapShowContextMenu;

function tcMindmapBindContextMenu() {
    var panel = document.getElementById('tc-mindmap-view-panel');
    var menu = tcMindmapEnsureContextMenuMounted();
    if (!panel || !menu || panel._tcMindmapCtxMenuBound) return;
    panel._tcMindmapCtxMenuBound = true;

    panel.addEventListener('contextmenu', function(e) {
        if (tcRightViewMode !== 'mindmap') return;
        if (panel.classList.contains('hidden')) return;
        if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) return;
        if (window._tcMindmapCtxFromNode) return;
        if (e.target.closest && (e.target.closest('.tc-mindmap-context-menu') ||
            e.target.closest('.smm-node-edit') || e.target.closest('.smm-text-edit-wrap'))) {
            return;
        }
        var Ed = window.TcSmmEditor;
        if (Ed && typeof Ed.isMindmapNodeDomTarget === 'function' && Ed.isMindmapNodeDomTarget(e.target)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        tcMindmapShowContextMenu('canvas', e.clientX, e.clientY, null);
    }, true);

    tcMindmapBindContextMenuOutsideDismiss();
}

function initTcRightViewUi() {
    syncTcRightViewChrome();
    window.setTimeout(function () {
        if (!window.TcTableView || tcRightViewMode !== 'table') return;
        if (typeof window.TcTableView.onViewShow === 'function') {
            window.TcTableView.onViewShow();
        }
    }, 0);
    tcMindmapBindContextMenu();
    tcMindmapEnsureZoomUiBound();
    tcMindmapBindPanelCommitEdit();
    tcMindmapBindNodeClickSelect();
    tcMindmapBindKeyboardShortcuts();
    tcMindmapBindEditorCommit();
    tcMindmapBindNodeDeleteHover();
}

function ensureTcRightViewUiInited() {
    if (window._tcRightViewUiInited) return;
    window._tcRightViewUiInited = true;
    try {
        initTcRightViewUi();
    } catch (viewUiErr) {
        console.error('[TestHub] ensureTcRightViewUiInited failed:', viewUiErr);
    }
}

// 初始化表格功能
function initTestCaseTable() {
    if (window._tcTestCaseTableInited) return;
    window._tcTestCaseTableInited = true;
    tcMindmapInitPageSession();
    initTcMindmapCacheLifecycle();
    // 初始化列显示状态和宽度
    initColumnState();
    
    // 添加行按钮
    const addRowBtn = document.getElementById('add-row-btn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', addEmptyRow);
    }
    
    // 清空表格按钮
    const clearTableBtn1 = document.getElementById('clear-table-btn');
    if (clearTableBtn1) {
        clearTableBtn1.addEventListener('click', clearTable);
    }
    const clearMindmapBtn = document.getElementById('clear-mindmap-btn');
    if (clearMindmapBtn) {
        clearMindmapBtn.addEventListener('click', clearMindmapData);
    }
    const exportXmindBtn = document.getElementById('export-xmind-btn');
    if (exportXmindBtn) {
        exportXmindBtn.addEventListener('click', function () {
            if (typeof openTcExportXmindPickerModal === 'function') openTcExportXmindPickerModal();
            else if (typeof exportTcMindmapToXmind === 'function') exportTcMindmapToXmind();
        });
    }

    const deleteSelectedRowsBtn = document.getElementById('delete-selected-rows-btn');
    if (deleteSelectedRowsBtn) {
        deleteSelectedRowsBtn.addEventListener('click', deleteSelectedRows);
    }
    
    const clearAiFormPresetBtn = document.getElementById('clear-ai-form-preset');
    if (clearAiFormPresetBtn) {
        clearAiFormPresetBtn.addEventListener('click', clearTcAiPresetForm);
    }
    initTcFeatureUnlockUi();
    initTcPresetModelSettingsUi();
    initTcPresetLanhuFields();
    initTcRagToggle();
    initTcAiPromptIsolation();
    initTcAiTemperatureInput();
    initTcTableCellInteraction();
    tcTableBindKeyboardShortcuts();
    if (typeof switchAiConfigMode === 'function') {
        try {
            switchAiConfigMode('preset', true);
        } catch (bootModeErr) { /* AI 模式切换失败不影响表格编辑 */ }
    }

    // AI转导图按钮
    const exportBtn = document.getElementById('export-excel-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToExcel);
    }

    const tableToMindmapBtn = document.getElementById('table-to-mindmap-btn');
    if (tableToMindmapBtn) {
        tableToMindmapBtn.addEventListener('click', function () {
        if (typeof tcExportExcelFromFab === 'function') tcExportExcelFromFab();
        else if (typeof convertTableToMindmap === 'function') convertTableToMindmap();
    });
    }
    initTcViewConvertModalUi();
    
    const tableColumnSettingsBtn = document.getElementById('table-column-settings-btn');
    if (tableColumnSettingsBtn) {
        tableColumnSettingsBtn.addEventListener('click', openColumnSettingsModal);
    }

    // 初始化渲染表头和内容
    renderTableHeader();
    renderColumnHeaderTags();
    initTcAutoRecoveryOnLeave();
    try {
        initTcRightViewUi();
    } catch (viewUiErr) {
        console.error('[TestHub] initTcRightViewUi failed:', viewUiErr);
    }
    initTcTemplateModalUi();
    initTcTableFabUi();
    initTcLeftFloatUi();
    initTcWorkbenchClickDelegate();
    syncTcHubAiChrome();
    syncTcTableTemplateChrome();
    if (typeof applyDrawerLayout === 'function') {
        applyDrawerLayout(getTcActiveDrawerNum());
    }
}

if (typeof window !== 'undefined') {
    window.switchTcRightView = switchTcRightView;
}


/* ---- tc_table_chrome.js ---- */
/**
 * TestHub TC Workbench — L4 DOMAIN
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
function updateTableHeader() {
    renderTableHeader();
    renderColumnHeaderTags();
}

function renderColumnHeaderTags() {
    const tagContainer = document.getElementById('column-header-tags');
    if (!tagContainer) return;
    if (!tableColumns.length) {
        tagContainer.innerHTML = '';
        return;
    }
    tagContainer.innerHTML = tableColumns
        .map(col => `<span class="px-2 py-1 text-xs rounded-md bg-white border border-slate-200 text-slate-700">${col}</span>`)
        .join('');
}

function openColumnSettingsModal() {
    if (!ensureTcTableTemplateApplied()) return;
    const modal = document.getElementById('column-settings-modal');
    if (!modal) return;
    columnSettingsDraft = [...tableColumns];
    renderColumnSettingsList();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function renderColumnSettingsList() {
    const list = document.getElementById('column-settings-list');
    if (!list) return;
    list.innerHTML = columnSettingsDraft.map((col, idx) => `
        <div class="grid grid-cols-12 gap-3 items-center">
            <label class="col-span-2 text-sm text-slate-600">第 ${idx + 1} 列</label>
            <input data-col-idx="${idx}" type="text" class="col-span-8 form-input column-setting-input" value="${col}">
            <button type="button" onclick="removeColumnSetting(${idx})" class="col-span-2 btn btn-secondary text-xs px-2 py-1 text-red-600 border-red-200 hover:bg-red-50">
                删除
            </button>
        </div>
    `).join('');
}

function closeColumnSettingsModal() {
    const modal = document.getElementById('column-settings-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function getTcResetColumnDefaults() {
    if (tcActiveTemplateId) {
        var tpl = TC_CASE_TEMPLATES.find(function(t) { return t.id === tcActiveTemplateId; });
        if (tpl && tpl.columns && tpl.columns.length) return tpl.columns.slice();
    }
    return defaultTableColumns.slice();
}

function resetColumnSettingsDraft() {
    columnSettingsDraft = getTcResetColumnDefaults();
    renderColumnSettingsList();
}

function addColumnSetting() {
    const inputs = document.querySelectorAll('.column-setting-input');
    columnSettingsDraft = Array.from(inputs).map(input => input.value.trim());
    columnSettingsDraft.push(`新列${columnSettingsDraft.length + 1}`);
    renderColumnSettingsList();
}

function removeColumnSetting(idx) {
    const inputs = document.querySelectorAll('.column-setting-input');
    columnSettingsDraft = Array.from(inputs).map(input => input.value.trim());
    if (columnSettingsDraft.length <= 1) {
        tcAppAlert('表格至少需要保留一列，无法继续删除。', { variant: 'info', title: '无法删除' });
        return;
    }
    columnSettingsDraft.splice(idx, 1);
    renderColumnSettingsList();
}

function saveColumnSettings() {
    const inputs = document.querySelectorAll('.column-setting-input');
    if (!inputs.length) return;

    const nextColumns = Array.from(inputs).map((input, idx) => {
        const value = input.value.trim();
        return value || `未命名列${idx + 1}`;
    });

    tableColumns = nextColumns;
    columnVisible = {};
    columnWidth = {};
    renderColumnHeaderTags();
    closeColumnSettingsModal();
    if (window.TcTableView && typeof window.TcTableView.syncFromData === 'function') {
        window.TcTableView.syncFromData({ reload: true, immediate: true });
    } else {
        renderTableHeader();
    }
    tcTableRecordAfterMutation();
}

function resetColumnSettings() {
    tableColumns = getTcResetColumnDefaults();
    columnVisible = {};
    columnWidth = {};
    renderTableHeader();
    renderColumnHeaderTags();
}

// 渲染表头（VxeTable 模式：同步数据到表格）
function renderTableHeader() {
    if (!tcTableTemplateApplied || !tableColumns.length) {
        if (window.TcTableView && typeof window.TcTableView.reset === 'function') window.TcTableView.reset();
        renderTableBody({ reload: true });
        return;
    }
    initColumnState();
    renderTableBody({ reload: true });
}

function bindTableSelectAllCheckbox() {
    const box = document.getElementById('select-all-rows');
    if (!box) return;
    const clone = box.cloneNode(true);
    box.parentNode.replaceChild(clone, box);
    clone.addEventListener('change', function() {
        var displayCount = getTcTableBodyRowCount();
        if (!displayCount) {
            this.checked = false;
            return;
        }
        if (this.checked) {
            for (var i = 0; i < displayCount; i++) selectedRows.add(i);
        } else {
            selectedRows.clear();
        }
        renderTableBody();
    });
}

function syncSelectAllCheckboxState() {
    const box = document.getElementById('select-all-rows');
    var displayCount = getTcTableBodyRowCount();
    if (!box || !displayCount) return;
    var allOn = true;
    var someOn = false;
    for (var i = 0; i < displayCount; i++) {
        if (selectedRows.has(i)) someOn = true;
        else allOn = false;
    }
    box.checked = allOn;
    box.indeterminate = someOn && !allOn;
}

function toggleRowSelect(index, checked) {
    if (checked && index >= testCasesData.length) {
        ensureTcTableRowMaterialized(index);
    }
    if (checked) {
        selectedRows.add(index);
    } else {
        selectedRows.delete(index);
    }
    syncSelectAllCheckboxState();
}

// 切换列显示/隐藏
function toggleColumn(colIndex) {
    columnVisible[colIndex] = !columnVisible[colIndex];
    renderTableHeader();
    updateRestoreButton();
    tcTableRecordAfterMutation();
}

function tcBuildRestoreColumnChip(idx, col) {
    var safeCol = String(col != null ? col : '').replace(/"/g, '&quot;');
    return '<button type="button" onclick="toggleColumn(' + idx + ')" title="恢复「' + safeCol + '」列">+ ' + safeCol + '</button>';
}

function tcResolveRestoreColumnsMount() {
    return document.getElementById('tc-restore-columns-slot')
        || document.getElementById('tc-table-toolbar-right')
        || document.getElementById('tc-table-toolbar-center')
        || document.getElementById('table-toolbar');
}

// 更新恢复按钮显示
function updateRestoreButton() {
    const toolbar = document.getElementById('table-toolbar');
    const centerWrap = tcResolveRestoreColumnsMount();
    if (!toolbar) return;

    let restoreDiv = document.getElementById('restore-columns');
    const hiddenList = [];
    tableColumns.forEach((col, idx) => {
        if (!columnVisible[idx]) hiddenList.push({ col: col, idx: idx });
    });

    if (hiddenList.length) {
        if (!restoreDiv) {
            restoreDiv = document.createElement('div');
            restoreDiv.id = 'restore-columns';
        }
        if (restoreDiv.parentElement !== centerWrap) {
            centerWrap.appendChild(restoreDiv);
        }
        restoreDiv.className = 'tc-restore-columns';
        restoreDiv.innerHTML = hiddenList.map(function (item) {
            return tcBuildRestoreColumnChip(item.idx, item.col);
        }).join('');
        if (toolbar) toolbar.classList.add('tc-table-toolbar--has-restore');
    } else {
        if (restoreDiv) {
            restoreDiv.remove();
        }
        if (toolbar) toolbar.classList.remove('tc-table-toolbar--has-restore');
    }
}

function getTableRowHeight(index) {
    return rowHeights[index] || TC_DEFAULT_ROW_HEIGHT;
}

function getTableRowHeightStyle(index) {
    var h = getTableRowHeight(index);
    return ' height: ' + h + 'px; min-height: ' + h + 'px; max-height: ' + h + 'px;';
}

function tcTableSnapshotFromState() {
    tcEnsureProvenanceLength();
    return {
        rows: testCasesData.map(function(r) { return r.slice(); }),
        provenance: testCasesProvenance.map(function(p) { return tcCloneProvenanceEntry(p); }),
        columns: tableColumns.slice(),
        columnVisible: Object.assign({}, columnVisible),
        columnWidth: Object.assign({}, columnWidth),
        rowHeights: Object.assign({}, rowHeights),
        markedRows: Array.from(markedRows),
        selectedRows: Array.from(selectedRows)
    };
}

function tcTableCloneSnapshot(snap) {
    if (!snap) return { rows: [], provenance: [], columns: [], columnVisible: {}, columnWidth: {}, rowHeights: {}, markedRows: [], selectedRows: [] };
    return {
        rows: (snap.rows || []).map(function(r) { return r.slice(); }),
        provenance: (snap.provenance || []).map(function(p) { return tcCloneProvenanceEntry(p); }),
        columns: (snap.columns || []).slice(),
        columnVisible: Object.assign({}, snap.columnVisible || {}),
        columnWidth: Object.assign({}, snap.columnWidth || {}),
        rowHeights: Object.assign({}, snap.rowHeights || {}),
        markedRows: (snap.markedRows || []).slice(),
        selectedRows: (snap.selectedRows || []).slice()
    };
}

function tcTableSnapshotsEqual(a, b) {
    if (!a || !b) return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
        return false;
    }
}

function tcTableResetUndoHistory() {
    tcTableUndoHistory = [];
    tcTableUndoHistoryIndex = -1;
}

function tcTableEnsureHistoryReady() {
    if (!tcTableTemplateApplied || !tableColumns.length) return;
    if (tcTableUndoHistory.length) return;
    var snap = tcTableCloneSnapshot(tcTableSnapshotFromState());
    tcTableUndoHistory = [snap];
    tcTableUndoHistoryIndex = 0;
}

function tcTableRecordAfterMutation() {
    if (tcTableInUndoSync || !tcTableTemplateApplied) return;
    tcTableEnsureHistoryReady();
    var snap = tcTableCloneSnapshot(tcTableSnapshotFromState());
    if (tcTableUndoHistoryIndex >= 0 && tcTableSnapshotsEqual(tcTableUndoHistory[tcTableUndoHistoryIndex], snap)) return;
    tcTableUndoHistory = tcTableUndoHistory.slice(0, tcTableUndoHistoryIndex + 1);
    tcTableUndoHistory.push(snap);
    tcTableUndoHistoryIndex = tcTableUndoHistory.length - 1;
    while (tcTableUndoHistory.length > TC_TABLE_UNDO_MAX) {
        tcTableUndoHistory.shift();
        tcTableUndoHistoryIndex -= 1;
    }
    if (typeof window.TcRequirementCaseStore !== 'undefined' && typeof window.TcRequirementCaseStore.onTableMutation === 'function') {
        window.TcRequirementCaseStore.onTableMutation();
    }
    syncTcExportFabSheetItemsChrome();
    syncTcQualityCheckButtonChrome();
}

function tcTableCanUndo() {
    return tcTableUndoHistoryIndex > 0;
}

function tcTableRestoreSnapshot(snap) {
    if (!snap) return;
    tcTableInUndoSync = true;
    try {
        testCasesData = (snap.rows || []).map(function(r) { return r.slice(); });
        testCasesProvenance = (snap.provenance || []).map(function(p) { return tcCloneProvenanceEntry(p); });
        tcEnsureProvenanceLength();
        tableColumns = (snap.columns || []).slice();
        columnVisible = Object.assign({}, snap.columnVisible || {});
        columnWidth = Object.assign({}, snap.columnWidth || {});
        rowHeights = Object.assign({}, snap.rowHeights || {});
        markedRows = new Set(snap.markedRows || []);
        selectedRows = new Set(snap.selectedRows || []);
        tcFocusedCell = null;
        tcEditingCell = null;
        renderTableHeader();
        renderTableBody({ reload: true });
        updateRestoreButton();
    } finally {
        tcTableInUndoSync = false;
    }
}

function tcTableUndo() {
    if (!tcTableCanUndo()) {
        if (typeof hfFloatToast === 'function') {
            hfFloatToast('没有可撤销的操作', { placement: 'top', variant: 'info', duration: 2000 });
        } else {
            tcAppToast('没有可撤销的操作', { variant: 'info', duration: 2000 });
        }
        return false;
    }
    tcTableUndoHistoryIndex -= 1;
    var snap = tcTableUndoHistory[tcTableUndoHistoryIndex];
    if (!snap) {
        tcTableUndoHistoryIndex += 1;
        return false;
    }
    tcTableRestoreSnapshot(snap);
    if (tcTableUndoHistoryIndex === 0) {
        tcAppToast('已恢复到初始状态', { variant: 'info', duration: 2200 });
    } else {
        tcAppToast('已撤销上一步', { variant: 'info', duration: 2200 });
    }
    return true;
}

function tcTableHandleKeydown(e) {
    if (tcRightViewMode !== 'table') return;
    if (!(e.ctrlKey || e.metaKey) || (e.key !== 'z' && e.key !== 'Z')) return;
    if (e.shiftKey) return;
    var active = document.activeElement;
    if (active && active.closest && active.closest('#edit-modal')) return;
    if (active && active.closest && active.closest('#left-panel')) return;
    if (active && active.classList && active.classList.contains('tc-cell-editor')) return;
    if (active && active.closest && active.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (tcTableUndoHandling) return;
    tcTableUndoHandling = true;
    try {
        if (tcEditingCell) cancelTableCellEdit();
        tcTableUndo();
    } finally {
        window.setTimeout(function() { tcTableUndoHandling = false; }, 0);
    }
}

function tcTableBindKeyboardShortcuts() {
    if (window._tcTableUndoKeysBound) return;
    window._tcTableUndoKeysBound = true;
    document.addEventListener('keydown', tcTableHandleKeydown, true);
}

function shiftRowHeightsAfterDelete(deletedIndex) {
    var next = {};
    Object.keys(rowHeights).forEach(function(k) {
        var i = parseInt(k, 10);
        if (isNaN(i)) return;
        if (i < deletedIndex) next[i] = rowHeights[k];
        else if (i > deletedIndex) next[i - 1] = rowHeights[k];
    });
    rowHeights = next;
}

function remapRowHeightsByIndexMap(oldToNew) {
    var next = {};
    Object.keys(rowHeights).forEach(function(k) {
        var i = parseInt(k, 10);
        if (oldToNew.has(i)) next[oldToNew.get(i)] = rowHeights[k];
    });
    rowHeights = next;
}

function applyRowHeight(rowIndex, height) {
    var tr = document.querySelector('#table-body tr[data-row-index="' + rowIndex + '"]');
    if (tr) {
        tr.style.height = height + 'px';
        tr.querySelectorAll('td').forEach(function(td) {
            td.style.height = height + 'px';
            td.style.minHeight = height + 'px';
            td.style.maxHeight = height + 'px';
        });
    }
    if (window.TcTableView && window.TcTableView._bridge && typeof window.TcTableView._bridge.applyRowHeightsFromGlobal === 'function') {
        window.TcTableView._bridge.applyRowHeightsFromGlobal();
    }
}

// 列宽度调整
let isResizing = false;
let resizeCol = -1;
let isRowResizing = false;
let resizeRow = -1;
let startY = 0;
let startRowHeight = 0;
let startX = 0;
let startWidth = 0;

function startResize(e, colIndex) {
    isResizing = true;
    resizeCol = colIndex;
    startX = e.pageX;
    startWidth = colIndex === -1 ? actionColumnWidth : (columnWidth[colIndex] || 150);
    e.preventDefault();
}

function startRowResize(e, rowIndex) {
    isRowResizing = true;
    resizeRow = rowIndex;
    startY = e.pageY;
    var tr = e.target.closest('tr[data-row-index]');
    startRowHeight = getTableRowHeight(rowIndex);
    document.body.classList.add('tc-table-row-resizing');
    e.preventDefault();
    e.stopPropagation();
}

document.addEventListener('mousemove', function(e) {
    if (isRowResizing) {
        var newHeight = Math.max(32, startRowHeight + (e.pageY - startY));
        rowHeights[resizeRow] = newHeight;
        applyRowHeight(resizeRow, newHeight);
        return;
    }
    if (!isResizing) return;
    if (resizeCol === -1) {
        actionColumnWidth = Math.max(44, startWidth + (e.pageX - startX));
    } else {
        const newWidth = Math.max(80, startWidth + (e.pageX - startX));
        columnWidth[resizeCol] = newWidth;
    }
    renderTableHeader();
});

document.addEventListener('mouseup', function() {
    if (isRowResizing) {
        isRowResizing = false;
        resizeRow = -1;
        document.body.classList.remove('tc-table-row-resizing');
    }
    isResizing = false;
    resizeCol = -1;
});

/** 最近一次生成写入的起始行（供批次条/溯源推断） */
var _tcLastGenerationWriteStart = -1;

function tcResetGenerationWriteTracking() {
    _tcLastGenerationWriteStart = -1;
}

function tcRecordGenerationWriteStart(startIndex) {
    if (startIndex == null || startIndex < 0) return;
    if (_tcLastGenerationWriteStart < 0 || startIndex < _tcLastGenerationWriteStart) {
        _tcLastGenerationWriteStart = startIndex;
    }
}

function tcGetLastGenerationWriteStart() {
    return _tcLastGenerationWriteStart;
}

var TC_TABLE_DEFAULT_EMPTY_ROWS = 8;

function createTcTableEmptyRow() {
    if (!tableColumns || !tableColumns.length) return [];
    return tableColumns.map(function() { return ''; });
}

/** 判断表格行是否已有用例内容（非占位空行） */
function tcTableRowHasCaseContent(row) {
    if (!row || !Array.isArray(row)) return false;
    var nameCol = typeof resolveTcCaseNameColumnIndex === 'function'
        ? resolveTcCaseNameColumnIndex()
        : (typeof getTcColumnIndex === 'function' ? getTcColumnIndex('用例名称', 0) : 0);
    if (String(row[nameCol] || '').trim()) return true;
    for (var i = 0; i < row.length; i++) {
        if (i === nameCol) continue;
        if (String(row[i] || '').trim()) return true;
    }
    return false;
}


/** 规范化表格行数：无内容时固定 8 行占位；有内容时裁掉尾部空行，禁止无限增长 */

function tcNormalizeTableRowsPreserveMin(rows) {
    var minKeep = (typeof window !== "undefined" && window._tcToolbarOpsPreserveMinRows > 0)
        ? window._tcToolbarOpsPreserveMinRows : 0;
    if (!minKeep || !rows || rows.length >= minKeep) return rows;
    var out = rows.slice();
    while (out.length < minKeep) {
        out.push(typeof createTcTableEmptyRow === "function" ? createTcTableEmptyRow() : []);
    }
    return out;
}

function tcNormalizeTableRowsForStorage(rows) {
    if (!rows || !Array.isArray(rows)) return [];
    if (!tableColumns || !tableColumns.length) return rows.slice();
    var normalized = rows.map(function (row) {
        return tableColumns.map(function (_, idx) {
            return Array.isArray(row) && row[idx] != null ? String(row[idx]) : '';
        });
    });
    var lastContent = -1;
    for (var i = 0; i < normalized.length; i++) {
        if (tcTableRowHasCaseContent(normalized[i])) lastContent = i;
    }
    if (lastContent < 0) {
        while (normalized.length < TC_TABLE_DEFAULT_EMPTY_ROWS) {
            normalized.push(createTcTableEmptyRow());
        }
        return tcNormalizeTableRowsPreserveMin(normalized);
    }
    var end = normalized.length;
    while (end > lastContent + 2) {
        end -= 1;
    }
    return tcNormalizeTableRowsPreserveMin(normalized.slice(0, end));
}

function tcTableMinDisplayRowCount() {
    return TC_TABLE_DEFAULT_EMPTY_ROWS;
}

/** 表格中是否仅有占位空行（无有效用例内容） */
function tcTableHasOnlyPlaceholderRows() {
    if (!testCasesData || !testCasesData.length) return true;
    for (var i = 0; i < testCasesData.length; i++) {
        if (tcTableRowHasCaseContent(testCasesData[i])) return false;
    }
    return true;
}

/** 统计表格中含用例内容的行数（不含占位空行） */
function tcCountTableCaseContentRows(fromIndex, limit) {
    fromIndex = fromIndex || 0;
    if (!testCasesData || !testCasesData.length) return 0;
    var end = limit != null ? Math.min(testCasesData.length, fromIndex + limit) : testCasesData.length;
    var count = 0;
    for (var i = fromIndex; i < end; i++) {
        if (tcTableRowHasCaseContent(testCasesData[i])) count++;
    }
    return count;
}

/**
 * 推断本次列表生成批次的起始行（0-based）。
 * 覆盖写入占位空行时数据落在表头区，而非表格末尾。
 */
function tcResolveListGenerationBatchStart(rowCount) {
    rowCount = parseInt(rowCount, 10) || 0;
    if (rowCount <= 0) return 0;
    if (_tcLastGenerationWriteStart >= 0) return _tcLastGenerationWriteStart;
    if (typeof tcFindGenerationInsertRowIndex === 'function') {
        var insertIdx = tcFindGenerationInsertRowIndex();
        if (insertIdx >= 0) return insertIdx;
    }
    var rows = typeof testCasesData !== 'undefined' ? testCasesData : null;
    var total = rows ? rows.length : 0;
    if (!total) return 0;
    return Math.max(0, total - rowCount);
}


/** 本次列表生成批次中已写入的有效用例行数（不含占位空行），供完成横幅统计。 */
function tcResolveListGenerationBatchContentRows() {
    if (typeof tcCountTableCaseContentRows !== 'function') return 0;
    var batchStart = -1;
    if (typeof tcGetLastGenerationWriteStart === 'function') {
        batchStart = parseInt(tcGetLastGenerationWriteStart(), 10);
    }
    if ((isNaN(batchStart) || batchStart < 0) && window.tcGenBatchCore && window.tcGenBatchCore.state) {
        batchStart = parseInt(window.tcGenBatchCore.state.batchRowStart, 10);
    }
    var batchLimit = 0;
    if (window.tcGenBatchCore && window.tcGenBatchCore.state) {
        batchLimit = parseInt(window.tcGenBatchCore.state.batchRowCount, 10) || 0;
    }
    if (isNaN(batchStart) || batchStart < 0) return 0;
    if (batchLimit > 0) {
        var limited = tcCountTableCaseContentRows(batchStart, batchLimit);
        if (limited > 0) return limited;
    }
    return tcCountTableCaseContentRows(batchStart) || 0;
}

function tcFindFirstEmptyTableRowIndex(fromIndex) {
    fromIndex = fromIndex || 0;
    if (!testCasesData) return -1;
    for (var i = fromIndex; i < testCasesData.length; i++) {
        if (!tcTableRowHasCaseContent(testCasesData[i])) return i;
    }
    return -1;
}

/** 最后一行含用例内容的行号（0-based）；无内容时返回 -1 */
function tcFindLastTableRowWithContentIndex() {
    if (!testCasesData || !testCasesData.length) return -1;
    var last = -1;
    for (var i = 0; i < testCasesData.length; i++) {
        if (tcTableRowHasCaseContent(testCasesData[i])) last = i;
    }
    return last;
}

/** 本次生成应写入的首行：紧跟最后一条已有用例的下一行；无空位则返回 -1（由调用方 push） */
function tcFindGenerationInsertRowIndex() {
    if (!testCasesData) return -1;
    var fromIndex = 0;
    var lastContent = tcFindLastTableRowWithContentIndex();
    if (lastContent >= 0) fromIndex = lastContent + 1;
    return tcFindFirstEmptyTableRowIndex(fromIndex);
}

/** 流式/批次条：记录本批写入起始行 */
function tcResolveGenerationBatchRowStart(mergeMode) {
    if (typeof tcFindGenerationInsertRowIndex === 'function') {
        var idx = tcFindGenerationInsertRowIndex();
        if (idx >= 0) return idx;
    }
    return testCasesData ? testCasesData.length : 0;
}

function seedTcTableDefaultEmptyRows() {
    if (!tableColumns || !tableColumns.length) return;
    testCasesData = [];
    testCasesProvenance = [];
    for (var i = 0; i < TC_TABLE_DEFAULT_EMPTY_ROWS; i++) {
        testCasesData.push(createTcTableEmptyRow());
        testCasesProvenance.push(null);
    }
}

// 添加空行
function addEmptyRow() {
    if (!ensureTcTableTemplateApplied()) return;
    const newRow = tableColumns.map(() => '');
    testCasesData.push(newRow);
    testCasesProvenance.push(null);
    renderTableBody({ reload: false, preserveScroll: true });
    tcTableRecordAfterMutation();
    if (typeof tcTemplateSwitchOnCurrentTemplateMutated === 'function') tcTemplateSwitchOnCurrentTemplateMutated();
}

/** 清空内网预设模块（蓝湖 + 提示词草稿） */
function clearTcAiPresetForm() {
    tcAppConfirm('将清空蓝湖 Cookie/URL 与提示词；右侧用例表格不受影响。', {
        title: '清空内网预设？',
        variant: 'warning',
        confirmText: '清空',
        cancelText: '保留'
    }).then(function(ok) {
        if (!ok) return;
        ['lanhu-cookie', 'lanhu-url'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        if (typeof clearTcAiPromptDraftForMode === 'function') clearTcAiPromptDraftForMode('preset');
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-cookie'));
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-url'));
        var statusEl = document.getElementById('lanhu-fetch-status');
        if (statusEl) statusEl.textContent = '';
        tcAppToast('内网预设已清空。', { variant: 'success', duration: 2600 });
    });
}

// 清空列表表格
function clearTable() {
    tcAppConfirm('将删除当前列表中的全部用例行（表头配置可随后在「表头配置」中调整）。此操作不可撤销。', {
        title: '清空全部用例？',
        variant: 'warning',
        confirmText: '清空',
        cancelText: '取消'
    }).then(function (ok) {
        if (!ok) return;
        testCasesData = [];
        testCasesProvenance = [];
        markedRows = new Set();
        selectedRows.clear();
        rowHeights = {};
        tcTableResetUndoHistory();
        renderTableBody({ reload: true });
        tcTableEnsureHistoryReady();
        tcTableRecordAfterMutation();
        if (window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.onTableRowsRemoved === 'function') {
            window.TcRequirementCaseStore.onTableRowsRemoved();
        }
        tcAppToast('列表用例数据已全部清空。', { variant: 'info', duration: 2600 });
    });
}

function clearMindmapData() {
    tcAppConfirm('将删除思维导图中的全部用例节点。此操作不可撤销。', {
        title: '清空导图用例？',
        variant: 'warning',
        confirmText: '清空',
        cancelText: '取消'
    }).then(function(ok) {
        if (!ok) return;
        tcMindmapExternalMindData = null;
        tcMindmapCommittedExternalMind = null;
        tcMindmapCasesData = [];
        tcMindmapCasesProvenance = [];
        tcMindmapUndoStack = [];
        tcMindmapHistory = [];
        tcMindmapHistoryIndex = -1;
        tcMindmapUndoBaseline = null;
        tcMindmapMetaById = {};
        tcMindmapClearCache();
        if (tcRightViewMode === 'mindmap') renderTcMindmap();
        tcAppToast('导图用例数据已全部清空。', { variant: 'info', duration: 2600 });
    });
}

function escapeTcHtml(text) {
    return String(text != null ? text : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isTcExplicitTemplateApplied() {
    return !!(tableColumns.length && tcActiveTemplateId);
}

function ensureTcTableTemplateApplied(opts) {
    opts = opts || {};
    if (tableColumns.length && (tcTableTemplateApplied || tcActiveTemplateId)) return true;
    if (isTcExplicitTemplateApplied()) return true;
    if (typeof window.isTcRequirementPageGenBusy === 'function' && window.isTcRequirementPageGenBusy()) {
        if (typeof window.restoreGenerationTableSnapshot === 'function' &&
            window.restoreGenerationTableSnapshot()) {
            return true;
        }
        return tableColumns.length > 0;
    }
    if (typeof isTcLeftPanelNavLocked === 'function' && isTcLeftPanelNavLocked()) {
        if (typeof window.restoreGenerationTableSnapshot === 'function' &&
            window.restoreGenerationTableSnapshot()) {
            return true;
        }
        return tableColumns.length > 0;
    }
    var onMindmap = typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap';
    if ((onMindmap || opts.fromMindmap) && !(typeof window !== 'undefined' && window.tcAiTableToMindmapConverting)) {
        if (typeof switchTcRightView === 'function') switchTcRightView('table');
    }
    function revealTemplateModal() {
        openTcTemplateModal();
    }
    if (onMindmap && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function() {
            requestAnimationFrame(revealTemplateModal);
        });
    } else {
        revealTemplateModal();
    }
    return false;
}

/** 导图解析兜底：仅在已有列配置时补齐默认列（不视为用户已选模板） */
function ensureTcMindmapGenerateColumns() {
    if (tableColumns.length) return true;
    tableColumns = defaultTableColumns.slice();
    columnVisible = {};
    columnWidth = {};
    initColumnState();
    renderTableHeader();
    syncTcTableTemplateChrome();
    return true;
}

var TC_TABLE_FAB_POS_KEY = 'tc_table_fab_pos_v7';
var TC_EXPORT_FAB_POS_KEY = 'tc_export_fab_pos_v1';

function tcFabEmptySlot() {
    return { moved: false, x: null, y: null };
}

var tcFabViewPosState = {
    table: { edit: tcFabEmptySlot(), export: tcFabEmptySlot() },
    mindmap: { edit: tcFabEmptySlot(), export: tcFabEmptySlot() }
};

function tcFabNormalizeViewScope(view) {
    return view === 'mindmap' ? 'mindmap' : 'table';
}

function isTcEditFabUserMoved(view) {
    var scope = tcFabNormalizeViewScope(view != null ? view : tcRightViewMode);
    return !!(tcFabViewPosState[scope] && tcFabViewPosState[scope].edit.moved);
}

function isTcExportFabUserMoved(view) {
    var scope = tcFabNormalizeViewScope(view != null ? view : tcRightViewMode);
    return !!(tcFabViewPosState[scope] && tcFabViewPosState[scope].export.moved);
}

function tcFabCaptureToggleSlot(toggle, slot) {
    if (!toggle || !slot) return;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    slot.x = r.left;
    slot.y = r.top;
}

function tcFabPersistViewFabPositions(view) {
    view = tcFabNormalizeViewScope(view);
    var state = tcFabViewPosState[view];
    if (!state) return;
    if (state.edit.moved) {
        tcFabCaptureToggleSlot(document.getElementById('tc-table-fab-toggle'), state.edit);
    }
    if (state.export.moved) {
        tcFabCaptureToggleSlot(document.getElementById('tc-export-fab-toggle'), state.export);
    }
}

function tcFabApplyViewFabPositions(view) {
    view = tcFabNormalizeViewScope(view);
    var editWrap = document.getElementById('tc-table-fab-wrap');
    var exportWrap = document.getElementById('tc-export-fab-wrap');
    if (!editWrap && !exportWrap) return;
    var editState = tcFabViewPosState[view].edit;
    var exportState = tcFabViewPosState[view].export;
    if (editState.moved && editState.x != null && editState.y != null) {
        applyTcTableFabPosition(editState.x, editState.y);
    } else {
        var editDef = getDefaultTcTableFabPosition();
        applyTcTableFabPosition(editDef.x, editDef.y);
    }
    if (exportState.moved && exportState.x != null && exportState.y != null) {
        applyTcExportFabPosition(exportState.x, exportState.y);
    } else {
        var exportDef = getDefaultTcExportFabPosition();
        applyTcExportFabPosition(exportDef.x, exportDef.y);
    }
    if (typeof ensureTcTableFabOnScreen === 'function') ensureTcTableFabOnScreen();
    if (typeof ensureTcExportFabOnScreen === 'function') ensureTcExportFabOnScreen();
    if (typeof refreshOpenTcFabSheetPlacements === 'function') {
        window.requestAnimationFrame(function () { refreshOpenTcFabSheetPlacements(); });
    }
}

function tcFabResetAllViewFabPositions() {
    tcFabViewPosState.table.edit = tcFabEmptySlot();
    tcFabViewPosState.table.export = tcFabEmptySlot();
    tcFabViewPosState.mindmap.edit = tcFabEmptySlot();
    tcFabViewPosState.mindmap.export = tcFabEmptySlot();
}

window.tcFabPersistViewFabPositions = tcFabPersistViewFabPositions;
window.tcFabApplyViewFabPositions = tcFabApplyViewFabPositions;
window.isTcEditFabUserMoved = isTcEditFabUserMoved;
window.isTcExportFabUserMoved = isTcExportFabUserMoved;

function ensureTcExportFabMounted() {
    var wrap = document.getElementById('tc-export-fab-wrap');
    if (!wrap) return null;
    if (wrap.parentElement !== document.body) document.body.appendChild(wrap);
    wrap._tcFabMountedToBody = true;
    return wrap;
}

function getTcExportFabDragSize() {
    var toggle = document.getElementById('tc-export-fab-toggle');
    if (toggle) {
        var r = toggle.getBoundingClientRect();
        if (r.width > 0) return { w: r.width, h: r.height };
    }
    return { w: 44, h: 44 };
}

function getDefaultTcExportFabPosition() {
    var editDef = getDefaultTcTableFabPosition();
    var editSize = getTcTableFabDragSize();
    var size = getTcExportFabDragSize();
    var gap = 8;
    var zone = getTcTableFabViewportZone();
    var searchRect = getTcTableFabSearchAnchorRect();
    var x = editDef.x + editSize.w + gap;
    var y = editDef.y;
    if (searchRect) {
        var maxX = searchRect.left - gap - size.w;
        x = Math.min(x, maxX);
    }
    if (x + size.w > zone.maxX) {
        x = Math.max(zone.minX, editDef.x);
        y = Math.min(zone.maxY, editDef.y + editSize.h + gap);
    }
    if (x < zone.minX) x = zone.minX;
    return clampTcTableFabToggleXY(x, y);
}

function applyTcExportFabPosition(toggleX, toggleY, prevToggleY) {
    var wrap = ensureTcExportFabMounted();
    if (!wrap) return;
    var p = clampTcTableFabToggleXY(toggleX, toggleY, prevToggleY);
    wrap.style.left = p.x + 'px';
    wrap.style.top = p.y + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
}

/** 表格 ↔ 思维导图切换：按目标视图恢复 FAB 位置（各视图独立记忆） */
function syncTcWorkbenchFabPositionsOnViewSwitch() {
    var view = typeof tcRightViewMode !== 'undefined' ? tcRightViewMode : 'table';
    tcFabApplyViewFabPositions(view);
}
window.syncTcWorkbenchFabPositionsOnViewSwitch = syncTcWorkbenchFabPositionsOnViewSwitch;

function resetTcWorkbenchFabPositionsToDefault() {
    tcFabResetAllViewFabPositions();
    if (typeof resetTcTableFabToDefault === 'function') resetTcTableFabToDefault();
    if (typeof resetTcExportFabToDefault === 'function') resetTcExportFabToDefault();
}
window.resetTcWorkbenchFabPositionsToDefault = resetTcWorkbenchFabPositionsToDefault;

(function initTcWorkbenchFabSessionReset() {
    function onPageShow() {
        if (!document.getElementById('tc-table-fab-wrap')) return;
        resetTcWorkbenchFabPositionsToDefault();
    }
    function boot() {
        if (window._tcFabSessionResetBound) return;
        window._tcFabSessionResetBound = true;
        window.addEventListener('pageshow', onPageShow);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

function resetTcExportFabToDefault() {
    var view = tcFabNormalizeViewScope(tcRightViewMode);
    tcFabViewPosState[view].export = tcFabEmptySlot();
    try { localStorage.removeItem(TC_EXPORT_FAB_POS_KEY); } catch (e) { /* ignore */ }
    var wrap = document.getElementById('tc-export-fab-wrap');
    if (!wrap) return;
    var def = getDefaultTcExportFabPosition();
    applyTcExportFabPosition(def.x, def.y);
}

function ensureTcExportFabOnScreen() {
    var toggle = document.getElementById('tc-export-fab-toggle');
    if (!toggle) return;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    var ceilingY = getTcTableFabPageCeilingY();
    if (r.top < ceilingY - 1) {
        applyTcExportFabPosition(r.left, ceilingY);
        return;
    }
    if (!isTcFabToggleOnScreen(toggle)) {
        resetTcExportFabToDefault();
    }
}


function mountTcFabSheetToBody(sheet) {
    if (!sheet) return;
    if (!sheet._tcFabSheetHomeParent && sheet.parentElement) {
        sheet._tcFabSheetHomeParent = sheet.parentElement;
        sheet._tcFabSheetHomeNext = sheet.nextSibling;
    }
    if (sheet.parentElement !== document.body) {
        document.body.appendChild(sheet);
    }
}

function restoreTcFabSheetToWrap(sheet) {
    if (!sheet || !sheet._tcFabSheetHomeParent) return;
    if (sheet.parentElement !== document.body) return;
    var parent = sheet._tcFabSheetHomeParent;
    if (!parent.isConnected) return;
    if (sheet._tcFabSheetHomeNext && sheet._tcFabSheetHomeNext.parentElement === parent) {
        parent.insertBefore(sheet, sheet._tcFabSheetHomeNext);
    } else {
        parent.appendChild(sheet);
    }
}

function resetTcFabSheetPlacement(sheet) {
    if (!sheet) return;
    sheet.classList.remove('tc-fab-sheet--placed');
    ['position', 'left', 'top', 'right', 'bottom', 'transform', 'margin', 'z-index'].forEach(function (prop) {
        sheet.style.removeProperty(prop);
    });
    restoreTcFabSheetToWrap(sheet);
}

function applyTcFabSheetPlacement(sheet, toggle) {
    if (!sheet || !toggle) return;
    var gap = 8;
    var margin = 8;
    mountTcFabSheetToBody(sheet);
    /* 大数据量表格下避免反复 getBoundingClientRect 触发整页强制布局 */
    var btnRect = toggle.getBoundingClientRect();
    var sheetW = sheet._tcFabCachedW || 160;
    var sheetH = sheet._tcFabCachedH || 220;
    var cx = btnRect.left + btnRect.width / 2;
    var cy = btnRect.top + btnRect.height / 2;
    var onLeft = cx < window.innerWidth * 0.5;
    var onTop = cy < window.innerHeight * 0.5;
    var left = onLeft ? (btnRect.right + gap) : (btnRect.left - sheetW - gap);
    var top = onTop ? (btnRect.bottom + gap) : (btnRect.top - sheetH - gap);
    left = Math.max(margin, Math.min(left, window.innerWidth - sheetW - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - sheetH - margin));
    sheet.classList.add('tc-fab-sheet--placed');
    sheet.style.setProperty('position', 'fixed', 'important');
    sheet.style.setProperty('left', left + 'px', 'important');
    sheet.style.setProperty('top', top + 'px', 'important');
    sheet.style.setProperty('right', 'auto', 'important');
    sheet.style.setProperty('bottom', 'auto', 'important');
    sheet.style.setProperty('transform', 'none', 'important');
    sheet.style.setProperty('margin', '0', 'important');
    sheet.style.setProperty('z-index', '130', 'important');

    if (!sheet.classList.contains('hidden') && !sheet._tcFabSizeWarm) {
        sheet._tcFabSizeWarm = true;
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(function () {
                if (sheet.classList.contains('hidden')) return;
                var sheetRect = sheet.getBoundingClientRect();
                if (sheetRect.width > 8) sheet._tcFabCachedW = sheetRect.width;
                if (sheetRect.height > 8) sheet._tcFabCachedH = sheetRect.height;
            });
        }
    }
}

function refreshOpenTcFabSheetPlacements() {
    var pairs = [
        ['tc-table-fab-sheet', 'tc-table-fab-toggle'],
        ['tc-export-fab-sheet', 'tc-export-fab-toggle']
    ];
    pairs.forEach(function (ids) {
        var sheet = document.getElementById(ids[0]);
        var toggle = document.getElementById(ids[1]);
        if (sheet && toggle && !sheet.classList.contains('hidden')) {
            applyTcFabSheetPlacement(sheet, toggle);
        }
    });
}

function closeTcExportFabSheet() {
    var sheet = document.getElementById('tc-export-fab-sheet');
    var toggle = document.getElementById('tc-export-fab-toggle');
    if (sheet) {
        resetTcFabSheetPlacement(sheet);
        sheet.classList.add('hidden');
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    syncTcFabOpenBodyClass();
}

function syncTcFabOpenBodyClass() {
    var exportOpen = isTcExportFabSheetOpen();
    var editSheet = document.getElementById('tc-table-fab-sheet');
    var editOpen = !!(editSheet && !editSheet.classList.contains('hidden'));
    document.body.classList.toggle('tc-fab-open', exportOpen || editOpen);
}




function isTcExportFabSheetOpen() {
    var sheet = document.getElementById('tc-export-fab-sheet');
    return !!(sheet && !sheet.classList.contains('hidden'));
}

/** 绿色导出 FAB：点击页面其它区域自动收起（隔离于编辑 FAB / 顶栏下拉） */
function bindTcExportFabSheetDismissOnOutsideClick() {
    if (window._tcExportFabOutsideDismissBound) return;
    window._tcExportFabOutsideDismissBound = true;
    document.addEventListener('click', function (e) {
        if (!document.body.classList.contains('tc-fab-open') && !isTcExportFabSheetOpen()) return;
        if (!isTcExportFabSheetOpen()) return;
        var target = e.target;
        if (!target || !target.closest) return;
        if (target.id === 'tc-export-fab-toggle' || target.id === 'tc-export-fab-sheet') return;
        if (target.closest('#tc-export-fab-wrap')) return;
        if (target.closest('#tc-export-fab-sheet')) return;
        if (typeof closeTcExportFabSheet === 'function') closeTcExportFabSheet();
    });
}

/** 绿色导出 FAB：点击菜单项后自动收起（document 捕获委托，隔离于编辑 FAB / 顶栏下拉） */
function bindTcExportFabSheetAutoCloseOnMenuItemClick() {
    if (window._tcExportFabMenuAutoCloseBound) return;
    window._tcExportFabMenuAutoCloseBound = true;
    document.addEventListener('click', function (e) {
        var item = e.target.closest('#tc-export-fab-sheet .tc-workbench-fab-sheet__item, #tc-export-fab-sheet .tc-table-fab-sheet__item');
        if (!item || item.disabled) return;
        var sheet = document.getElementById('tc-export-fab-sheet');
        if (!sheet || sheet.classList.contains('hidden')) return;
        window.setTimeout(function () {
            if (typeof closeTcExportFabSheet === 'function') closeTcExportFabSheet();
        }, 0);
    }, true);
}

function bindTcFabSheetKeepOpen(sheetId) {
    var sheet = document.getElementById(sheetId);
    if (!sheet || sheet._tcKeepOpenBound) return;
    sheet._tcKeepOpenBound = true;
    sheet.addEventListener('click', function(e) {
        e.stopPropagation();
    });
}

function closeTcEditFabSheetOnly() {
    var sheet = document.getElementById('tc-table-fab-sheet');
    var toggle = document.getElementById('tc-table-fab-toggle');
    if (sheet) {
        if (typeof isTcTableToolbarOpsMode === 'function' && isTcTableToolbarOpsMode()) {
            if (typeof resetTcFabSheetPlacement === 'function') resetTcFabSheetPlacement(sheet);
            sheet.classList.add('hidden');
            if (toggle) {
                toggle.setAttribute('aria-expanded', 'false');
                toggle.classList.remove('tc-table-ops-trigger--open');
            }
            syncTcFabOpenBodyClass();
            return;
        }
        resetTcFabSheetPlacement(sheet);
        sheet.classList.add('hidden');
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    syncTcFabOpenBodyClass();
}

function toggleTcExportFabSheet() {
    var sheet = document.getElementById('tc-export-fab-sheet');
    var toggle = document.getElementById('tc-export-fab-toggle');
    if (!sheet || !toggle) return;
    var open = sheet.classList.contains('hidden');
    if (open) closeTcEditFabSheetOnly();
    sheet.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
        /* 同步定位一次即可，避免 rAF 二次测量拖慢大数据量表格 */
        applyTcFabSheetPlacement(sheet, toggle);
    } else {
        resetTcFabSheetPlacement(sheet);
    }
    syncTcFabOpenBodyClass();
}

function initTcExportFabUi() {
    bindTcExportFabSheetAutoCloseOnMenuItemClick();
    bindTcExportFabSheetDismissOnOutsideClick();
    if (typeof bindTcFabSheetKeepOpen === 'function') bindTcFabSheetKeepOpen('tc-export-fab-sheet');
    var toggle = document.getElementById('tc-export-fab-toggle');
    var wrap = ensureTcExportFabMounted();
    if (!toggle || toggle._tcFabBound) return;
    toggle._tcFabBound = true;
    var pointerDown = false;
    var dragging = false;
    var activePointerId = null;
    var dragThreshold = 5;
    var startX = 0, startY = 0, startLeft = 0, startTop = 0, lastFabY = 0;
    function onFabPointerMove(e) {
        if (!pointerDown || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!dragging) {
            if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
            dragging = true;
            closeTcExportFabSheet();
            if (wrap) wrap.classList.add('tc-workbench-fab-wrap--dragging');
            document.body.classList.add('tc-workbench-fab-dragging');
            lastFabY = startTop;
        }
        applyTcExportFabPosition(startLeft + dx, startTop + dy, lastFabY);
        lastFabY = toggle.getBoundingClientRect().top;
        e.preventDefault();
    }
    function endFabPointer(e) {
        if (activePointerId !== null && e && e.pointerId !== activePointerId) return;
        document.removeEventListener('pointermove', onFabPointerMove);
        document.removeEventListener('pointerup', endFabPointer);
        document.removeEventListener('pointercancel', endFabPointer);
        if (!pointerDown) return;
        var wasDrag = dragging;
        pointerDown = false;
        dragging = false;
        activePointerId = null;
        if (wrap) wrap.classList.remove('tc-workbench-fab-wrap--dragging');
        document.body.classList.remove('tc-workbench-fab-dragging');
        if (wasDrag) {
            var exportView = tcFabNormalizeViewScope(tcRightViewMode);
            var exportSlot = tcFabViewPosState[exportView].export;
            exportSlot.moved = true;
            tcFabCaptureToggleSlot(toggle, exportSlot);
            refreshOpenTcFabSheetPlacements();
        } else toggleTcExportFabSheet();
    }
    toggle.addEventListener('pointerdown', function(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        pointerDown = true;
        dragging = false;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        var tRect = toggle.getBoundingClientRect();
        startLeft = tRect.left;
        startTop = tRect.top;
        lastFabY = tRect.top;
        if (toggle.setPointerCapture) { try { toggle.setPointerCapture(e.pointerId); } catch (err) {} }
        document.addEventListener('pointermove', onFabPointerMove);
        document.addEventListener('pointerup', endFabPointer);
        document.addEventListener('pointercancel', endFabPointer);
    });
}


function ensureTcTableFabMounted() {
    var wrap = document.getElementById('tc-table-fab-wrap');
    if (!wrap) return null;
    if (wrap.parentElement !== document.body) {
        document.body.appendChild(wrap);
    }
    wrap._tcFabMountedToBody = true;
    return wrap;
}

function getTcTableFabSize() {
    var toggle = document.getElementById('tc-table-fab-toggle');
    if (toggle) {
        var r = toggle.getBoundingClientRect();
        if (r.width > 0) return { w: r.width, h: r.height };
    }
    return { w: 44, h: 44 };
}

/** 拖动边界：以圆形按钮为准（收起菜单不占布局高度） */
function getTcTableFabDragSize() {
    return getTcTableFabSize();
}

function getTcTableFabToolbarRect() {
    var toolbar = document.getElementById('table-toolbar');
    if (!toolbar || toolbar.offsetParent === null) return null;
    var r = toolbar.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return r;
}

/** 搜索框区域（默认 FAB 落点锚定在搜索框左侧） */
function measureTcTableFabHiddenSearchAnchorRect() {
    var bar = document.getElementById('tc-table-filter-bar');
    if (!bar || getComputedStyle(bar).display !== 'none') return null;
    var prevDisplay = bar.style.display;
    var prevVis = bar.style.visibility;
    var prevPe = bar.style.pointerEvents;
    bar.style.display = 'inline-flex';
    bar.style.visibility = 'hidden';
    bar.style.pointerEvents = 'none';
    var rect = null;
    var search = document.getElementById('tc-table-filter-search');
    var wrap = bar.querySelector('.tc-table-filter-bar__search-wrap');
    var target = search || wrap || bar;
    if (target) {
        var sr = target.getBoundingClientRect();
        if (sr.width >= 8 && sr.height >= 8) rect = sr;
    }
    bar.style.display = prevDisplay;
    bar.style.visibility = prevVis;
    bar.style.pointerEvents = prevPe;
    return rect;
}

function getTcTableFabSearchAnchorRect() {
    var search = document.getElementById('tc-table-filter-search');
    if (search && search.offsetParent !== null) {
        var sr = search.getBoundingClientRect();
        if (sr.width >= 8 && sr.height >= 8) return sr;
    }
    var wrap = document.querySelector('#tc-table-filter-bar .tc-table-filter-bar__search-wrap');
    if (wrap && wrap.offsetParent !== null) {
        var wr = wrap.getBoundingClientRect();
        if (wr.width >= 8 && wr.height >= 8) return wr;
    }
    var bar = document.getElementById('tc-table-filter-bar');
    if (bar && bar.offsetParent !== null) {
        var br = bar.getBoundingClientRect();
        if (br.width >= 8 && br.height >= 8) return br;
    }
    if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap') {
        var hiddenRect = measureTcTableFabHiddenSearchAnchorRect();
        if (hiddenRect) return hiddenRect;
    }
    var toolbarRight = document.getElementById('tc-table-toolbar-right');
    if (toolbarRight && toolbarRight.offsetParent !== null) {
        var tr = toolbarRight.getBoundingClientRect();
        if (tr.width >= 8 && tr.height >= 8) return tr;
    }
    return getTcTableFabToolbarRect();
}

/** 全站顶栏底边：仅用于默认落点（避免首屏压住导航），拖动不再受此限制 */
function getTcTableFabNavFloorY() {
    var gap = 6;
    var floorY = 8;
    var gnav = document.querySelector('.hf-gnav');
    if (gnav) {
        var gr = gnav.getBoundingClientRect();
        if (gr.height >= 4) floorY = Math.max(floorY, gr.bottom + gap);
    }
    return floorY;
}

/** 页面顶部天花板：可拖入导航栏，但不得拖出当前视口上沿 */
function getTcTableFabPageCeilingY() {
    return 8;
}

function getTcTableFabStashReserveBottom() { return 24; }

/** 实际表格卡片区域（默认落点需避开；拖动时可进入） */
function getTcTableFabTableRect() {
    var panel = document.getElementById('tc-table-view-panel');
    if (!panel || panel.offsetParent === null) return null;
    var r = panel.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return r;
}

function getTcTableFabWorkspaceRect() {
    var ws = document.getElementById('table-workspace');
    if (!ws || ws.offsetParent === null) return null;
    var r = ws.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return r;
}



function isTcFabNearDefaultPosition(toggle, getDefaultFn) {
    if (!toggle || typeof getDefaultFn !== 'function') return false;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    var def = getDefaultFn();
    return Math.abs(r.left - def.x) <= 8 && Math.abs(r.top - def.y) <= 8;
}

function shouldResetTcFabToDefault(toggle, getDefaultFn) {
    if (!toggle) return true;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return true;
    if (!isTcFabToggleOnScreen(toggle)) return true;
    if (!isTcFabNearDefaultPosition(toggle, getDefaultFn)) return true;
    return false;
}

function intersectTcFabRectWithViewport(rect) {
    if (!rect) return null;
    var margin = 8;
    var top = Math.max(rect.top, margin);
    var bottom = Math.min(rect.bottom, window.innerHeight - margin);
    var left = Math.max(rect.left, margin);
    var right = Math.min(rect.right, window.innerWidth - margin);
    if (bottom - top < 8 || right - left < 8) return null;
    return {
        top: top,
        left: left,
        bottom: bottom,
        right: right,
        width: right - left,
        height: bottom - top
    };
}

function isTcFabToggleOnScreen(toggle) {
    if (!toggle) return false;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    var margin = 6;
    return r.right > margin && r.bottom > margin &&
        r.left < window.innerWidth - margin && r.top < window.innerHeight - margin;
}

function tcTableFabRectOverlaps(x, y, size, rect, gap) {
    if (!rect) return false;
    gap = gap != null ? gap : 8;
    return !(
        x + size.w + gap <= rect.left ||
        x >= rect.right + gap ||
        y + size.h + gap <= rect.top ||
        y >= rect.bottom + gap
    );
}

/** 拖动范围：视口内；可进入导航栏区域，但不得超出页面上沿 */
function getTcTableFabViewportZone() {
    var margin = 8;
    var size = getTcTableFabDragSize();
    var minY = getTcTableFabPageCeilingY();
    var maxY = window.innerHeight - size.h - getTcTableFabStashReserveBottom();
    return {
        minX: margin,
        maxX: Math.max(margin, window.innerWidth - size.w - margin),
        minY: minY,
        maxY: Math.max(minY, maxY)
    };
}

function clampTcTableFabToggleXY(toggleX, toggleY, prevToggleY) {
    var zone = getTcTableFabViewportZone();
    var ceilingY = getTcTableFabPageCeilingY();
    var x = Math.max(zone.minX, Math.min(toggleX, zone.maxX));
    var y = Math.max(zone.minY, Math.min(toggleY, zone.maxY));
    if (y < ceilingY) y = ceilingY;
    return { x: x, y: y };
}

/** x/y 为圆形按钮左上角（菜单面板绝对定位，不占布局） */
function applyTcTableFabPosition(toggleX, toggleY, prevToggleY) {
    var wrap = ensureTcTableFabMounted();
    if (!wrap) return;
    var p = clampTcTableFabToggleXY(toggleX, toggleY, prevToggleY);
    wrap.style.left = p.x + 'px';
    wrap.style.top = p.y + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
}

function isTcTableFabToggleOnScreen() {
    var toggle = document.getElementById('tc-table-fab-toggle');
    var wrap = document.getElementById('tc-table-fab-wrap');
    if (!toggle || !wrap || wrap.classList.contains('hidden')) return false;
    return isTcFabToggleOnScreen(toggle);
}

function isTcTableFabPositionVisible(x, y) {
    var size = getTcTableFabDragSize();
    if (y < getTcTableFabPageCeilingY() - 1) return false;
    if (x + size.w < 0 || y + size.h < 0) return false;
    if (x > window.innerWidth + 4 || y > window.innerHeight + 4) return false;
    return true;
}

function ensureTcTableFabOnScreen() {
    var toggle = document.getElementById('tc-table-fab-toggle');
    if (!toggle) return;
    var r = toggle.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    var ceilingY = getTcTableFabPageCeilingY();
    if (r.top < ceilingY - 1) {
        applyTcTableFabPosition(r.left, ceilingY);
        return;
    }
    if (!isTcTableFabToggleOnScreen()) {
        resetTcTableFabToDefault();
    }
}

/** 恢复默认位置（刷新、切换表格/导图视图时；不跨页面刷新记忆） */
function resetTcTableFabToDefault() {
    var view = tcFabNormalizeViewScope(tcRightViewMode);
    tcFabViewPosState[view].edit = tcFabEmptySlot();
    try { localStorage.removeItem(TC_TABLE_FAB_POS_KEY); } catch (e) { /* ignore */ }
    var wrap = document.getElementById('tc-table-fab-wrap');
    if (!wrap) return;
    var def = getDefaultTcTableFabPosition();
    applyTcTableFabPosition(def.x, def.y);
}

/** 工作区主内容区（表格或导图卡片），用于默认落点 */
function getTcTableFabContentRect() {
    var tableRect = getTcTableFabTableRect();
    if (tableRect) return tableRect;
    var mindmapPanel = document.getElementById('tc-mindmap-view-panel');
    if (mindmapPanel && !mindmapPanel.classList.contains('hidden') && mindmapPanel.offsetParent !== null) {
        var mr = mindmapPanel.getBoundingClientRect();
        if (mr.width >= 8 && mr.height >= 8) return mr;
    }
    return getTcTableFabWorkspaceRect();
}

/** 默认：搜索框左侧（导出钮紧贴搜索框左缘，编辑钮在其左侧） */
function getDefaultTcTableFabPosition() {
    var size = getTcTableFabDragSize();
    var exportSize = getTcExportFabDragSize();
    var gap = 8;
    var zone = getTcTableFabViewportZone();
    var searchRect = getTcTableFabSearchAnchorRect();
    var x;
    var y;
    if (searchRect) {
        var exportX = searchRect.left - gap - exportSize.w;
        x = exportX - gap - size.w;
        y = searchRect.top + (searchRect.height - size.h) / 2;
    } else {
        var toolbarRect = getTcTableFabToolbarRect();
        if (toolbarRect) {
            x = toolbarRect.right - gap - exportSize.w - gap - size.w;
            y = toolbarRect.top + (toolbarRect.height - size.h) / 2;
        } else {
            x = zone.maxX - exportSize.w - gap - size.w - 12;
            y = zone.minY + 48;
        }
    }
    x = Math.max(zone.minX, Math.min(x, zone.maxX));
    y = Math.max(getTcTableFabNavFloorY(), Math.min(y, zone.maxY));
    return clampTcTableFabToggleXY(x, y);
}

function saveTcTableFabPosition() {
    var view = tcFabNormalizeViewScope(tcRightViewMode);
    var slot = tcFabViewPosState[view].edit;
    slot.moved = true;
    tcFabCaptureToggleSlot(document.getElementById('tc-table-fab-toggle'), slot);
}

function closeTcTableFabSheet() {
    closeTcEditFabSheetOnly();
    closeTcExportFabSheet();
}

function toggleTcTableFabSheet() {
    var sheet = document.getElementById('tc-table-fab-sheet');
    var toggle = document.getElementById('tc-table-fab-toggle');
    if (!sheet || !toggle) return;
    var open = sheet.classList.contains('hidden');
    if (open) closeTcExportFabSheet();
    sheet.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
        applyTcFabSheetPlacement(sheet, toggle);
    } else {
        resetTcFabSheetPlacement(sheet);
    }
    syncTcFabOpenBodyClass();
}

function initTcTableFabUi() {
    if (typeof isTcTableToolbarOpsMode === 'function' && isTcTableToolbarOpsMode()) return;
    var toggle = document.getElementById('tc-table-fab-toggle');
    var sheet = document.getElementById('tc-table-fab-sheet');
    var wrap = ensureTcTableFabMounted();
    if (!toggle || toggle._tcFabBound) return;
    toggle._tcFabBound = true;

    var pointerDown = false;
    var dragging = false;
    var activePointerId = null;
    var dragThreshold = 5;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;
    var lastFabY = 0;

    function onFabPointerMove(e) {
        if (!pointerDown || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!dragging) {
            if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
            dragging = true;
            closeTcTableFabSheet();
            if (wrap) wrap.classList.add('tc-table-fab-wrap--dragging', 'tc-workbench-fab-wrap--dragging');
            document.body.classList.add('tc-table-fab-dragging', 'tc-workbench-fab-dragging');
            lastFabY = startTop;
        }
        var nextY = startTop + dy;
        applyTcTableFabPosition(startLeft + dx, nextY, lastFabY);
        lastFabY = toggle.getBoundingClientRect().top;
        e.preventDefault();
    }

    function endFabPointer(e) {
        if (activePointerId !== null && e && e.pointerId !== activePointerId) return;
        document.removeEventListener('pointermove', onFabPointerMove);
        document.removeEventListener('pointerup', endFabPointer);
        document.removeEventListener('pointercancel', endFabPointer);
        if (!pointerDown) return;
        var wasDrag = dragging;
        pointerDown = false;
        dragging = false;
        activePointerId = null;
        if (wrap) wrap.classList.remove('tc-table-fab-wrap--dragging', 'tc-workbench-fab-wrap--dragging');
        document.body.classList.remove('tc-table-fab-dragging', 'tc-workbench-fab-dragging');
        if (wasDrag) {
            saveTcTableFabPosition();
            refreshOpenTcFabSheetPlacements();
        } else {
            toggleTcTableFabSheet();
        }
    }

    toggle.addEventListener('pointerdown', function(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        pointerDown = true;
        dragging = false;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        var tRect = toggle.getBoundingClientRect();
        startLeft = tRect.left;
        startTop = tRect.top;
        lastFabY = tRect.top;
        if (toggle.setPointerCapture) {
            try { toggle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
        document.addEventListener('pointermove', onFabPointerMove);
        document.addEventListener('pointerup', endFabPointer);
        document.addEventListener('pointercancel', endFabPointer);
    });

    bindTcFabSheetKeepOpen('tc-table-fab-sheet');
    bindTcFabSheetKeepOpen('tc-export-fab-sheet');

    document.addEventListener('click', function(e) {
        if (!wrap || wrap.classList.contains('hidden')) return;
        if (e.target.closest('#tc-table-fab-wrap') || e.target.closest('#tc-export-fab-wrap')) return;
        if (e.target.closest('#tc-table-fab-sheet') || e.target.closest('#tc-export-fab-sheet')) return;
        closeTcTableFabSheet();
    });
    window.addEventListener('resize', function() {
        if (!wrap || wrap.classList.contains('hidden')) return;
        var tRect = toggle.getBoundingClientRect();
        applyTcTableFabPosition(tRect.left, tRect.top);
        ensureTcTableFabOnScreen();
        refreshOpenTcFabSheetPlacements();
    });
}

function syncTcRightPanelMeta() {
    var tpl = tcActiveTemplateId ? TC_CASE_TEMPLATES.find(function(t) { return t.id === tcActiveTemplateId; }) : null;
    var emptyArea = document.getElementById('tc-table-template-empty');
    var switchBtn = document.getElementById('tc-switch-template-btn');
    var tplLabel = document.getElementById('tc-active-template-label');
    var mmTag1 = document.getElementById('tc-mindmap-meta-tag-1');
    var mmTag2 = document.getElementById('tc-mindmap-meta-tag-2');
    var applied = tcTableTemplateApplied && tableColumns.length > 0;
    var isTable = tcRightViewMode === 'table';
    var isMindmap = tcRightViewMode === 'mindmap';
    var bootPending = typeof isTcTableBootHydratePending === 'function' && isTcTableBootHydratePending();
    if (emptyArea) {
        var showTemplateEmpty = !applied && isTable && !bootPending;
        emptyArea.classList.toggle('hidden', !showTemplateEmpty);
        emptyArea.setAttribute('aria-hidden', showTemplateEmpty ? 'false' : 'true');
    }
    if (switchBtn) {
        switchBtn.classList.toggle('hidden', !(applied && isTable));
        switchBtn.setAttribute('aria-hidden', applied && isTable ? 'false' : 'true');
    }
    if (tplLabel) {
        if (applied && isTable && tpl) {
            tplLabel.textContent = tpl.name;
            tplLabel.classList.remove('hidden');
            tplLabel.setAttribute('aria-hidden', 'false');
        } else {
            tplLabel.textContent = '';
            tplLabel.classList.add('hidden');
            tplLabel.setAttribute('aria-hidden', 'true');
        }
    }
    if (mmTag1) {
        mmTag1.classList.toggle('hidden', !(applied && isMindmap));
        mmTag1.setAttribute('aria-hidden', applied && isMindmap ? 'false' : 'true');
    }
    if (mmTag2) {
        mmTag2.classList.toggle('hidden', !(applied && isMindmap));
        mmTag2.setAttribute('aria-hidden', applied && isMindmap ? 'false' : 'true');
    }
}

/** 确保「选择模板」可点击；与暂存/批处理条初始化隔离，避免其它 boot 抛错时按钮失效 */
function ensureTcTemplateChooserUiReady() {
    if (typeof initTcWorkbenchClickDelegate === 'function') initTcWorkbenchClickDelegate();
    if (typeof initTcTemplateModalUi === 'function') initTcTemplateModalUi();
}


function syncTcQualityCheckButtonChrome() {
    var btn = document.getElementById('tc-gen-quality-btn');
    if (!btn) return;
    var onMindmapView = typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap';
    if (onMindmapView) {
        btn.classList.add('hidden');
        btn.setAttribute('aria-hidden', 'true');
        btn.disabled = true;
        return;
    }
    var hasCaseContent = typeof tcCountTableCaseContentRows === 'function' && tcCountTableCaseContentRows() > 0;
    var enh = window.TcWorkbenchEnhancements;
    var busy = enh && typeof enh.isStandaloneQualityCheckButtonBusy === 'function' &&
        enh.isStandaloneQualityCheckButtonBusy();
    if (!busy && typeof window.isTcGenQualityCheckInProgress === 'function') {
        busy = window.isTcGenQualityCheckInProgress();
    }
    if (!busy && enh && typeof enh.isCaseGenerationInteractionBusy === 'function') {
        busy = !!enh.isCaseGenerationInteractionBusy();
    }
    if (!busy && window.TcLeftPanelLock &&
        typeof window.TcLeftPanelLock.isLanhuDocSwitchBlockedDuringGeneration === 'function') {
        busy = !!window.TcLeftPanelLock.isLanhuDocSwitchBlockedDuringGeneration();
    }

    btn.classList.toggle('hidden', !hasCaseContent);
    btn.setAttribute('aria-hidden', hasCaseContent ? 'false' : 'true');
    btn.disabled = !hasCaseContent || !!busy;
    btn.classList.toggle('tc-quality-toggle-btn--busy', !!busy);
    btn.classList.remove('tc-quality-toggle-btn--on');
    btn.classList.toggle('tc-quality-toggle-btn--off', hasCaseContent && !busy);
    if (busy) {
        btn.setAttribute('aria-disabled', 'true');
    } else {
        btn.removeAttribute('aria-disabled');
    }

    if (!hasCaseContent) {
        btn.title = '检测当前需求页表格内的全部用例';
    } else if (busy) {
        var busyTitle = '质量检测进行中，请完毕后再试';
        if (enh && typeof enh.getStandaloneQualityCheckBusyMessage === 'function') {
            busyTitle = enh.getStandaloneQualityCheckBusyMessage() || busyTitle;
        } else if (enh && typeof enh.getQcWorkbenchInteractionLockTitle === 'function') {
            busyTitle = enh.getQcWorkbenchInteractionLockTitle() || busyTitle;
        }
        btn.title = busyTitle;
    } else {
        btn.title = '检测当前需求页表格内的全部用例';
    }
}

var TC_EXPORT_FAB_TREE_WIDE_ITEM_IDS = [
    'table-to-mindmap-btn',
    'tc-share-create-btn',
    'tc-share-list-open-btn'
];

var _tcExportFabTreeStatusRefreshScheduled = false;
var _tcExportFabTreeStatusLoadedDocIds = Object.create(null);

function tcExportFabRequirementTreeHasAnyDesignedCases() {
    if (typeof tcCountTableCaseContentRows === 'function' && tcCountTableCaseContentRows() > 0) {
        return true;
    }
    if (!window.TcLanhuTreeCaseStatus || typeof getTcLanhuDocTreeMeta !== 'function') {
        return false;
    }
    var meta = getTcLanhuDocTreeMeta();
    var docId = meta && meta.docId ? String(meta.docId).trim() : '';
    if (!docId) return false;
    var summary = window.TcLanhuTreeCaseStatus.getSummary(docId);
    return !!(summary && summary.designed > 0);
}

function tcScheduleExportFabTreeCaseStatusRefresh() {
    if (_tcExportFabTreeStatusRefreshScheduled) return;
    if (!window.TcLanhuTreeCaseStatus || typeof getTcLanhuDocTreeMeta !== 'function') return;
    var meta = getTcLanhuDocTreeMeta();
    var docId = meta && meta.docId ? String(meta.docId).trim() : '';
    if (!docId) return;
    if (_tcExportFabTreeStatusLoadedDocIds[docId]) return;
    _tcExportFabTreeStatusRefreshScheduled = true;
    window.TcLanhuTreeCaseStatus.loadForDoc(docId).finally(function () {
        _tcExportFabTreeStatusRefreshScheduled = false;
        _tcExportFabTreeStatusLoadedDocIds[docId] = true;
        if (typeof syncTcExportFabSheetItemsChrome === 'function') {
            syncTcExportFabSheetItemsChrome(undefined, { skipTreeStatusRefresh: true });
        }
    });
}

var TC_EXPORT_FAB_MENU_ITEM_IDS = [
    'export-excel-btn',
    'table-to-mindmap-btn',
    'export-xmind-btn',
    'clear-mindmap-btn',
    'tc-share-create-btn',
    'tc-share-list-open-btn'
];

function syncTcExportFabSheetItemsChrome(appliedOpt, syncOpts) {
    syncOpts = syncOpts || {};
    var applied = appliedOpt;
    if (applied === undefined) {
        applied = !!(typeof tcTableTemplateApplied !== 'undefined' && tcTableTemplateApplied && tableColumns.length > 0);
    }
    var hasCaseContent = typeof tcCountTableCaseContentRows === 'function' && tcCountTableCaseContentRows() > 0;
    var hasTreeWideCases = tcExportFabRequirementTreeHasAnyDesignedCases();
    var inMindmapView = typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap';
    var enabledMindmapReview = inMindmapView &&
        typeof window.tcExportFabMindmapReviewItemsEnabled === 'function' &&
        window.tcExportFabMindmapReviewItemsEnabled();
    if (inMindmapView) {
        if (!enabledMindmapReview && !syncOpts.skipMindmapReviewRefresh &&
            typeof window.tcScheduleExportFabMindmapReviewStatusRefresh === 'function') {
            window.tcScheduleExportFabMindmapReviewStatusRefresh();
        }
    } else if (!hasTreeWideCases && !syncOpts.skipTreeStatusRefresh) {
        tcScheduleExportFabTreeCaseStatusRefresh();
    }
    var enabledCurrentPage = !!applied && hasCaseContent;
    var enabledTreeWide = !!hasTreeWideCases;
    TC_EXPORT_FAB_MENU_ITEM_IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (id === 'export-excel-btn' && window.tcExportExcelBusy) {
            el.disabled = true;
            el.setAttribute('aria-disabled', 'true');
            return;
        }
        if (id === 'table-to-mindmap-btn' && window.tcExportExcelFabBusy) {
            el.disabled = true;
            el.setAttribute('aria-disabled', 'true');
            return;
        }
        var useTreeWide = TC_EXPORT_FAB_TREE_WIDE_ITEM_IDS.indexOf(id) >= 0;
        var isReviewFab = id === 'tc-share-create-btn' || id === 'tc-share-list-open-btn';
        var itemEnabled;
        if (isReviewFab && inMindmapView) {
            itemEnabled = !!enabledMindmapReview;
        } else if (useTreeWide) {
            itemEnabled = enabledTreeWide;
        } else {
            itemEnabled = enabledCurrentPage;
        }
        el.disabled = !itemEnabled;
        if (!itemEnabled) el.setAttribute('aria-disabled', 'true');
        else el.removeAttribute('aria-disabled');
    });
}

function syncTcTableTemplateChrome() {
    var listPanel = document.getElementById('tc-table-list-panel');
    var hasColumns = tableColumns.length > 0;
    var hasCaseRows = typeof testCasesData !== 'undefined' && testCasesData && testCasesData.length > 0;
    if (hasColumns && (tcTableTemplateApplied || hasCaseRows)) {
        tcTableTemplateApplied = true;
    }
    var applied = tcTableTemplateApplied && hasColumns;
    if (typeof syncTcTableBootLoadingChrome === 'function') {
        syncTcTableBootLoadingChrome(applied);
    }
    if (listPanel) listPanel.classList.toggle('tc-table-list-panel--locked', !applied);
    var vxePanel = document.getElementById('tc-vxe-table-view-panel');
    if (vxePanel) {
        vxePanel.classList.toggle('hidden', !applied);
        vxePanel.setAttribute('aria-hidden', applied ? 'false' : 'true');
    }
    if (!applied) ensureTcTemplateChooserUiReady();
    syncTcRightPanelMeta();
    var showFab = !isTcHubExcelTabActive();
    if (showFab) {
        ensureTcExportFabMounted();
        if (typeof isTcTableToolbarOpsMode === 'function' && isTcTableToolbarOpsMode()) {
            if (typeof initTcTableToolbarOpsUi === 'function') initTcTableToolbarOpsUi();
        } else {
            ensureTcTableFabMounted();
            if (typeof initTcTableFabUi === 'function') initTcTableFabUi();
        }
        if (typeof initTcExportFabUi === 'function') initTcExportFabUi();
    }
    function syncOneFabWrap(wrapId, userMoved, resetFn, ensureFn, getDefaultFn) {
        var fabWrap = document.getElementById(wrapId);
        if (!fabWrap) return;
        fabWrap.classList.toggle('hidden', !showFab);
        fabWrap.setAttribute('aria-hidden', showFab ? 'false' : 'true');
        if (!showFab) return;
        var toggleId = wrapId === 'tc-export-fab-wrap' ? 'tc-export-fab-toggle' : 'tc-table-fab-toggle';
        var toggle = document.getElementById(toggleId);
        if (!userMoved) {
            if (shouldResetTcFabToDefault(toggle, getDefaultFn)) resetFn();
        } else {
            ensureFn();
        }
        window.requestAnimationFrame(function() {
            ensureFn();
            if (typeof refreshOpenTcFabSheetPlacements === 'function') {
                refreshOpenTcFabSheetPlacements();
            }
        });
    }
    if (!showFab) {
        closeTcTableFabSheet();
    } else {
        if (typeof syncTcTableToolbarOpsAnchor === 'function' &&
            syncTcTableToolbarOpsAnchor({ showFab: showFab, applied: applied })) {
            /* 编辑 FAB 已收进顶栏下拉 */
        } else {
            syncOneFabWrap('tc-table-fab-wrap', isTcEditFabUserMoved(), resetTcTableFabToDefault, ensureTcTableFabOnScreen, getDefaultTcTableFabPosition);
        }
        syncOneFabWrap('tc-export-fab-wrap', isTcExportFabUserMoved(), resetTcExportFabToDefault, ensureTcExportFabOnScreen, getDefaultTcExportFabPosition);
        tcFabApplyViewFabPositions(tcRightViewMode);
    }
    ['table-column-settings-btn', 'add-row-btn', 'delete-selected-rows-btn', 'clear-table-btn'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.disabled = !applied;
    });
    syncTcExportFabSheetItemsChrome(applied);
    syncTcQualityCheckButtonChrome();
}

function renderTcTemplateModalGrid() {
    var grid = document.getElementById('tc-template-modal-grid');
    if (!grid) return;
    if (!tcCaseTemplatesLoaded) {
        grid.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">加载中</p>';
        return;
    }
    if (!TC_CASE_TEMPLATES.length) {
        grid.innerHTML = '<p class="text-sm text-rose-600 py-6 text-center">加载失败</p>';
        return;
    }
    grid.innerHTML = TC_CASE_TEMPLATES.map(function(tpl) {
        var colN = Array.isArray(tpl.columns) ? tpl.columns.length : 0;
        var active = tcActiveTemplateId === tpl.id ? ' tc-template-option--active' : '';
        return (
            '<button type="button" class="tc-template-option' + active + '" data-tc-template-id="' + escapeTcHtml(tpl.id) + '">' +
            '<span class="tc-template-option__icon tc-template-option__icon--' + escapeTcHtml(tpl.badgeClass) + '">' + escapeTcHtml(tpl.badge) + '</span>' +
            '<span class="tc-template-option__body">' +
            '<span class="tc-template-option__name">' + escapeTcHtml(tpl.name) + '</span>' +
            '<span class="tc-template-option__meta">' + colN + ' 列</span>' +
            '</span>' +
            '<span class="tc-template-option__tail">' +
            '<svg class="tc-template-option__chev" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7.5 5l5 5-5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</span></button>'
        );
    }).join('');
}

function openTcTemplateModal() {
    var modal = document.getElementById('tc-template-modal');
    if (!modal) return;
    if (typeof ensureTcWorkbenchOverlaysMounted === 'function') ensureTcWorkbenchOverlaysMounted();
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    if (typeof initTcTemplateModalUi === 'function') initTcTemplateModalUi();
    if (typeof tcEnsureModalTopLayer === 'function') tcEnsureModalTopLayer(modal);
    function reveal() {
        renderTcTemplateModalGrid();
        showModal(modal);
        document.body.style.overflow = 'hidden';
    }
    if (!tcCaseTemplatesLoaded) {
        fetchTcCaseTemplates().then(reveal).catch(function() {
            reveal();
        });
    } else {
        reveal();
    }
}

function closeTcTemplateModal() {
    var modal = document.getElementById('tc-template-modal');
    hideModal(modal);
    if (!document.querySelector('#tc-template-modal.flex, #tc-feature-unlock-modal.flex')) {
        document.body.style.overflow = '';
    }
    if (!isTcExplicitTemplateApplied() && window._tcPendingPageGenAfterTemplate) {
        window._tcPendingPageGenAfterTemplate = null;
    }
}

/** 工作台：悬浮钮 / 模板入口统一委托（挂 body 后仍有效） */
function initTcWorkbenchClickDelegate() {
    if (window._tcWorkbenchClickDelegate) return;
    window._tcWorkbenchClickDelegate = true;
    document.addEventListener('click', function(e) {
        if (!document.querySelector('.tc-workbench-scope')) return;
        if (isTcHubExcelTabActive()) return;
        if (false) return;
        if (document.body.classList.contains('tc-left-input-float-dragging')) return;

        var tplBtn = e.target && e.target.closest
            ? e.target.closest('#tc-choose-template-btn, #tc-switch-template-btn')
            : null;
        if (tplBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openTcTemplateModal === 'function') openTcTemplateModal();
            return;
        }

        var tplCloseBtn = e.target && e.target.closest
            ? e.target.closest('#tc-template-modal-close')
            : null;
        if (tplCloseBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcTemplateModal === 'function') closeTcTemplateModal();
            return;
        }

        var tplOptionBtn = e.target && e.target.closest
            ? e.target.closest('#tc-template-modal [data-tc-template-id]')
            : null;
        if (tplOptionBtn) {
            e.preventDefault();
            e.stopPropagation();
            var tplPickId = tplOptionBtn.getAttribute('data-tc-template-id');
            if (tplPickId && typeof applyTcCaseTemplate === 'function') applyTcCaseTemplate(tplPickId);
            return;
        }

        var tplModalRoot = document.getElementById('tc-template-modal');
        if (tplModalRoot && e.target === tplModalRoot && tplModalRoot.classList.contains('flex')) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcTemplateModal === 'function') closeTcTemplateModal();
            return;
        }

        var vcOverwriteBtn = e.target && e.target.closest
            ? e.target.closest('#tc-view-convert-overwrite')
            : null;
        if (vcOverwriteBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcViewConvertModal === 'function') closeTcViewConvertModal('overwrite');
            return;
        }

        var vcAppendBtn = e.target && e.target.closest
            ? e.target.closest('#tc-view-convert-append')
            : null;
        if (vcAppendBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcViewConvertModal === 'function') closeTcViewConvertModal('append');
            return;
        }

        var vcCancelBtn = e.target && e.target.closest
            ? e.target.closest('#tc-view-convert-cancel')
            : null;
        if (vcCancelBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcViewConvertModal === 'function') closeTcViewConvertModal('cancel');
            return;
        }

        var vcModalRoot = document.getElementById('tc-view-convert-modal');
        if (vcModalRoot && e.target === vcModalRoot && vcModalRoot.classList.contains('flex')) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof closeTcViewConvertModal === 'function') closeTcViewConvertModal('cancel');
            return;
        }

        var aiOpenBtn = e.target && e.target.closest
            ? e.target.closest('#tc-left-input-float-wrap [data-tc-float-open]')
            : null;
        if (aiOpenBtn) {
            if (aiOpenBtn._tcLeftFloatOpenSuppressClick) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof openTcLeftInputFloatFromFab === 'function') {
                openTcLeftInputFloatFromFab();
            } else if (typeof expandTcLeftFloatPanel === 'function') {
                expandTcLeftFloatPanel();
            }
            return;
        }

        var drawerBtn = e.target && e.target.closest
            ? e.target.closest('.tc-left-float-dock__mode[data-tc-float-drawer]')
            : null;
        if (drawerBtn) {
            e.preventDefault();
            e.stopPropagation();
            var n = parseInt(drawerBtn.getAttribute('data-tc-float-drawer'), 10);
            if (typeof expandTcLeftFloatPanel === 'function') {
                expandTcLeftFloatPanel(n === 2 ? 2 : 1);
            }
            return;
        }
    });
}


function resetRequirementCaseTableUi() {
    if (typeof window.isTcRequirementPageGenBusy === 'function' && window.isTcRequirementPageGenBusy()) {
        return;
    }
    if (typeof window.isTcPageGenLockActive === 'function' && window.isTcPageGenLockActive()) {
        return;
    }
    if (typeof isTcLeftPanelNavLocked === 'function' && isTcLeftPanelNavLocked()) {
        return;
    }
    if (typeof isTcWorkbenchGenerationActive === 'function' &&
        isTcWorkbenchGenerationActive()) {
        return;
    }
    if (window.TcTableBridge && typeof window.TcTableBridge.commitAll === 'function') {
        try { window.TcTableBridge.commitAll(); } catch (e0) { /* ignore */ }
    }
    if (window.TcTableView && typeof window.TcTableView.reset === 'function') {
        try { window.TcTableView.reset(); } catch (eReset) { /* ignore */ }
    }
    tcTableTemplateApplied = false;
    tcActiveTemplateId = null;
    tableColumns = [];
    testCasesData = [];
    testCasesProvenance = [];
    if (typeof tcClearTableLayoutMaps === 'function') {
        tcClearTableLayoutMaps();
    } else {
        Object.keys(columnVisible).forEach(function (k) { delete columnVisible[k]; });
        Object.keys(columnWidth).forEach(function (k) { delete columnWidth[k]; });
        Object.keys(rowHeights).forEach(function (k) { delete rowHeights[k]; });
    }
    markedRows = new Set();
    selectedRows.clear();
    if (typeof tcTableResetUndoHistory === 'function') tcTableResetUndoHistory();
    if (typeof renderTableHeader === 'function') renderTableHeader();
    if (typeof renderTableBody === 'function') renderTableBody({ reload: true });
    if (typeof updateRestoreButton === 'function') updateRestoreButton();
    syncTcTableTemplateChrome();
    if (typeof syncTcRightPanelMeta === 'function') syncTcRightPanelMeta();
    if (typeof tcTableEnsureHistoryReady === 'function') tcTableEnsureHistoryReady();
}

function applyRequirementCasePayload(payload, opts) {
    opts = opts || {};
    if (!payload || !payload.columns || !payload.columns.length) {
        return Promise.resolve(false);
    }
    if (typeof isTcWorkbenchGenerationActive === 'function' &&
        isTcWorkbenchGenerationActive()) {
        return Promise.resolve(false);
    }
    var cols = payload.columns.map(String);
    var rows = (payload.rows || []).map(function (row) {
        var out = [];
        for (var i = 0; i < cols.length; i++) {
            out.push(Array.isArray(row) && row[i] != null ? String(row[i]) : '');
        }
        return out;
    });
    tableColumns = cols;
    testCasesData = rows;
    if (typeof tcProvenanceArrayFromStashPayload === 'function') {
        testCasesProvenance = tcProvenanceArrayFromStashPayload(payload, rows.length);
    } else {
        testCasesProvenance = [];
    }
    if (typeof tcEnsureProvenanceLength === 'function') tcEnsureProvenanceLength();
    tcTableTemplateApplied = true;
    if (opts.templateId && typeof setTcActiveTemplateId === 'function') {
        setTcActiveTemplateId(opts.templateId);
    } else if (opts.templateId) {
        tcActiveTemplateId = String(opts.templateId);
        if (typeof syncTcActiveTemplateIdToWindow === 'function') syncTcActiveTemplateIdToWindow();
    } else {
        tcActiveTemplateId = null;
        if (typeof syncTcActiveTemplateIdToWindow === 'function') syncTcActiveTemplateIdToWindow();
    }
    markedRows = new Set();
    selectedRows.clear();
    if (typeof tcTableResetUndoHistory === 'function') tcTableResetUndoHistory();
    if (typeof tcApplyStashTableLayoutFromPayload === 'function') {
        tcApplyStashTableLayoutFromPayload(payload);
    } else {
        tcClearTableLayoutMaps();
        var n = cols.length;
        if (payload.columnVisible && typeof payload.columnVisible === 'object') {
            Object.keys(payload.columnVisible).forEach(function (k) {
                var i = parseInt(k, 10);
                if (Number.isNaN(i) || i < 0 || i >= n) return;
                columnVisible[i] = payload.columnVisible[k] !== false;
            });
        }
        if (payload.columnWidth && typeof payload.columnWidth === 'object') {
            Object.keys(payload.columnWidth).forEach(function (k) {
                var i = parseInt(k, 10);
                var w = parseInt(payload.columnWidth[k], 10);
                if (Number.isNaN(i) || i < 0 || i >= n || Number.isNaN(w) || w <= 0) return;
                columnWidth[i] = w;
            });
        }
        if (payload.rowHeights && typeof payload.rowHeights === 'object') {
            Object.keys(payload.rowHeights).forEach(function (k) {
                var i = parseInt(k, 10);
                var h = parseInt(payload.rowHeights[k], 10);
                if (Number.isNaN(i) || i < 0 || Number.isNaN(h) || h <= 0) return;
                rowHeights[i] = h;
            });
        }
        if (typeof initColumnState === 'function') initColumnState();
        if (typeof updateRestoreButton === 'function') updateRestoreButton();
    }
    if (typeof switchTcRightView === 'function') switchTcRightView('table');
    var openP = Promise.resolve(true);
    if (window.TcTableView && typeof window.TcTableView.open === 'function') {
        openP = Promise.resolve(window.TcTableView.open({
            keepRows: true,
            layoutColumns: true,
            resetColumnLayout: true,
            fitColumns: true
        }));
    } else if (typeof renderTableHeader === 'function') {
        renderTableHeader();
    }
    return openP.then(function () {
        if (typeof updateRestoreButton === 'function') updateRestoreButton();
        syncTcTableTemplateChrome();
        if (typeof syncTcRightPanelMeta === 'function') syncTcRightPanelMeta();
        if (typeof tcTableEnsureHistoryReady === 'function') tcTableEnsureHistoryReady();
        return true;
    }).catch(function () {
        if (typeof updateRestoreButton === 'function') updateRestoreButton();
        syncTcTableTemplateChrome();
        return true;
    });
}

if (typeof window !== 'undefined') {
    window.resetRequirementCaseTableUi = resetRequirementCaseTableUi;
    window.applyRequirementCasePayload = applyRequirementCasePayload;
}

function showTablePageLoading() {
    var panel = document.getElementById('tc-table-list-panel');
    if (!panel) return;
    panel.classList.add('tc-table-list-panel--page-loading');
}

function hideTablePageLoading() {
    var panel = document.getElementById('tc-table-list-panel');
    if (!panel) return;
    panel.classList.remove('tc-table-list-panel--page-loading');
}

if (typeof window !== 'undefined') {
    window.showTablePageLoading = showTablePageLoading;
    window.hideTablePageLoading = hideTablePageLoading;
}

function applyTcCaseTemplate(templateId, opts) {
    opts = opts || {};
    var tpl = TC_CASE_TEMPLATES.find(function(t) { return t.id === templateId; });
    if (!tpl) return;
    if (typeof window !== 'undefined') window._tcTemplateSwitchApplyInProgress = true;
    try {
    if (typeof tcTemplateSwitchBeforeApply === 'function') {
        tcTemplateSwitchBeforeApply(tcActiveTemplateId, templateId);
    }
    if (!opts.skipTemplateSwitchRestore && typeof tcTemplateSwitchTryRestore === 'function') {
        if (tcTemplateSwitchTryRestore(templateId, { silent: opts.silent })) {
            if (typeof setTcActiveTemplateId === 'function') setTcActiveTemplateId(templateId); else tcActiveTemplateId = templateId;
            tcTableTemplateApplied = true;
            return;
        }
    }
    if (typeof setTcActiveTemplateId === 'function') setTcActiveTemplateId(templateId); else tcActiveTemplateId = templateId;
    tcTableTemplateApplied = true;
    tableColumns = tpl.columns.slice();
    tcMindmapRootTopic = typeof resolveTcMindmapFixedRootTopic === 'function'
        ? resolveTcMindmapFixedRootTopic()
        : '测试用例';
    if (!opts.keepRows) {
        if (window.TcTableView && typeof window.TcTableView.reset === 'function') {
            try { window.TcTableView.reset(); } catch (eResetTpl) { /* ignore */ }
        }
        markedRows = new Set();
        selectedRows.clear();
        seedTcTableDefaultEmptyRows();
    }
    columnVisible = {};
    columnWidth = {};
    rowHeights = {};
    tcTableResetUndoHistory();
    initColumnState();
    saveTcDailyTemplateChoice(templateId);
    if (window.TcTableView && typeof window.TcTableView.open === 'function') {
        window.TcTableView.open({ keepRows: true, layoutColumns: true, resetColumnLayout: true, fitColumns: true });
    } else {
        renderTableHeader();
    }
    syncTcTableTemplateChrome();
    closeTcTemplateModal();
    switchTcRightView('table');
    tcTableEnsureHistoryReady();
    if (!opts.silent) {
        tcAppToast('已应用 ' + tpl.name, { variant: 'success', duration: 2200 });
    }
    if (window._tcPendingPageGenAfterTemplate) {
        var pendingPageGen = window._tcPendingPageGenAfterTemplate;
        window._tcPendingPageGenAfterTemplate = null;
        // 仅当 pending 目标页面就是当前选中页时才触发
        var pendingPageId = String(pendingPageGen.pageId || '').trim();
        if (pendingPageId) {
            var curPageId = '';
            if (window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.resolveContext === 'function') {
                var curCtx = window.TcRequirementCaseStore.resolveContext({});
                if (curCtx) {
                    curPageId = String(curCtx.lanhu_page_id || curCtx.page_id || '').trim();
                }
            }
            if (curPageId && curPageId !== pendingPageId) {
                return;
            }
        }
        setTimeout(function() {
            if (typeof window.openTcPageGenModal === 'function') {
                window.openTcPageGenModal(pendingPageGen.pageId, pendingPageGen.pageName);
            }
        }, 0);
    }
    } finally {
        if (typeof syncTcActiveTemplateIdToWindow === 'function') syncTcActiveTemplateIdToWindow();
        if (typeof window !== 'undefined') window._tcTemplateSwitchApplyInProgress = false;
        if (typeof tcTemplateSwitchAfterApply === 'function') tcTemplateSwitchAfterApply(templateId);
    }
}

function initTcTemplateModalUi() {
    var openIds = ['tc-choose-template-btn', 'tc-switch-template-btn'];
    openIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (el && !el._tcTplBound) {
            el._tcTplBound = true;
            el.addEventListener('click', openTcTemplateModal);
        }
    });
    var modal = document.getElementById('tc-template-modal');
    var closeBtn = document.getElementById('tc-template-modal-close');
    if (closeBtn && !closeBtn._tcTplBound) {
        closeBtn._tcTplBound = true;
        closeBtn.addEventListener('click', closeTcTemplateModal);
    }
    if (modal && !modal._tcTplBound) {
        modal._tcTplBound = true;
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeTcTemplateModal();
        });
    }
    var grid = document.getElementById('tc-template-modal-grid');
    if (grid && !grid._tcTplClickBound) {
        grid._tcTplClickBound = true;
        grid.addEventListener('click', function(e) {
            var btn = e.target && e.target.closest ? e.target.closest('[data-tc-template-id]') : null;
            if (!btn) return;
            var id = btn.getAttribute('data-tc-template-id');
            if (id) applyTcCaseTemplate(id);
        });
    }
}

// 渲染表格内容
function formatTableCellDisplay(cell) {
    let displayText = cell || '';
    displayText = String(displayText);
    displayText = displayText.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, '');
    displayText = displayText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    displayText = displayText.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
    return displayText;
}

function getTableDataCellEl(rowIndex, colIndex) {
    return document.querySelector('#test-case-table td.tc-td-data[data-row-index="' + rowIndex + '"][data-col-index="' + colIndex + '"]');
}

function clearTableCellFocus() {
    document.querySelectorAll('#test-case-table td.tc-cell-focused').forEach(function(el) {
        el.classList.remove('tc-cell-focused', 'tc-cell-editing');
    });
    tcFocusedCell = null;
}

function focusTableCell(rowIndex, colIndex, cellEl) {
    if (tcEditingCell) return;
    clearTableCellFocus();
    tcFocusedCell = { row: rowIndex, col: colIndex };
    var cell = cellEl || getTableDataCellEl(rowIndex, colIndex);
    if (cell) cell.classList.add('tc-cell-focused');
}

function startTableCellEdit(rowIndex, colIndex, cellEl, initialValue) {
    if (tcEditingCell && tcEditingCell.row === rowIndex && tcEditingCell.col === colIndex) {
        if (initialValue !== undefined) {
            var sameCell = getTableDataCellEl(rowIndex, colIndex);
            var sameEditor = sameCell && sameCell.querySelector('.tc-cell-editor');
            if (sameEditor) {
                sameEditor.value = String(sameEditor.value || '') + String(initialValue);
                sameEditor.focus();
                var endPos = sameEditor.value.length;
                sameEditor.setSelectionRange(endPos, endPos);
            }
        }
        return;
    }
    commitTableCellEdit(true);
    var cell = cellEl || getTableDataCellEl(rowIndex, colIndex);
    if (!cell) return;
    if (!testCasesData[rowIndex]) {
        ensureTcTableRowMaterialized(rowIndex);
    }
    if (!testCasesData[rowIndex]) return;
    var rawValue = testCasesData[rowIndex][colIndex] || '';
    var startValue = initialValue !== undefined ? String(initialValue) : String(rawValue);
    var cellHeight = getTableRowHeight(rowIndex);
    var cellWidth = Math.max(cell.offsetWidth, 80);
    tcEditingCell = { row: rowIndex, col: colIndex };
    tcFocusedCell = { row: rowIndex, col: colIndex };
    cell.classList.add('tc-cell-focused', 'tc-cell-editing');
    cell.style.boxSizing = 'border-box';
    cell.style.height = cellHeight + 'px';
    cell.style.minHeight = cellHeight + 'px';
    cell.style.width = cellWidth + 'px';
    cell.style.minWidth = cellWidth + 'px';
    cell.innerHTML = '';
    var textarea = document.createElement('textarea');
    textarea.className = 'tc-cell-editor';
    textarea.value = startValue;
    cell.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(startValue.length, startValue.length);
    textarea.addEventListener('blur', function() {
        window.setTimeout(function() {
            if (!tcEditingCell || tcEditingCell.row !== rowIndex || tcEditingCell.col !== colIndex) return;
            var active = document.activeElement;
            if (active && active.classList && active.classList.contains('tc-cell-editor')) return;
            commitTableCellEdit();
        }, 0);
    });
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cancelTableCellEdit();
            e.preventDefault();
            return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            commitTableCellEdit();
            e.preventDefault();
            return;
        }
        e.stopPropagation();
    });
}

function shouldHandleTcCellTypeInput() {
    if (typeof tcAppDialogIsOpen === 'function' && tcAppDialogIsOpen()) return false;
    if (tcEditingCell) return false;
    if (!tcFocusedCell || !tcTableTemplateApplied || !getTcTableBodyRowCount()) return false;
    var active = document.activeElement;
    if (active && active.closest && active.closest('input, textarea, select, [contenteditable="true"]')) {
        if (!active.classList.contains('tc-cell-editor')) return false;
    }
    return true;
}

var tcCellImeComposing = false;

function beginTcCellEditFromInput(initialValue) {
    if (!tcFocusedCell) return;
    startTableCellEdit(tcFocusedCell.row, tcFocusedCell.col, null, initialValue);
}

function isTcVxeTableActive() {
    var mount = document.getElementById('tc-vxe-table-mount');
    return !!(mount && mount.querySelector('.vxe-table'));
}

function onTcTableCellKeydown(e) {
    if (isTcVxeTableActive()) return;
    var activeEl = document.activeElement;
    if (activeEl && activeEl.closest) {
        if (activeEl.classList && activeEl.classList.contains('tc-cell-editor')) return;
        if (activeEl.closest('.vxe-cell--edit')) return;
    }
    if (!shouldHandleTcCellTypeInput()) return;
    if (tcCellImeComposing) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        beginTcCellEditFromInput('');
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        startTableCellEdit(tcFocusedCell.row, tcFocusedCell.col);
        return;
    }
    if (e.key.length === 1) {
        e.preventDefault();
        beginTcCellEditFromInput(e.key);
    }
}

function onTcTableCellPaste(e) {
    if (isTcVxeTableActive()) return;
    if (!shouldHandleTcCellTypeInput()) return;
    var text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (text === '') return;
    e.preventDefault();
    beginTcCellEditFromInput(text);
}

function onTcTableCellCompositionStart() {
    if (isTcVxeTableActive()) return;
    if (shouldHandleTcCellTypeInput()) tcCellImeComposing = true;
}

function onTcTableCellCompositionEnd(e) {
    if (isTcVxeTableActive()) return;
    if (!tcCellImeComposing) return;
    tcCellImeComposing = false;
    if (tcEditingCell || !tcFocusedCell) return;
    if (e.data) {
        e.preventDefault();
        beginTcCellEditFromInput(e.data);
    }
}

function initTcTableCellKeyboardInput() {
    if (document.documentElement.dataset.tcCellKeyboardBound === '1') return;
    document.documentElement.dataset.tcCellKeyboardBound = '1';
    document.addEventListener('keydown', onTcTableCellKeydown);
    document.addEventListener('paste', onTcTableCellPaste);
    document.addEventListener('compositionstart', onTcTableCellCompositionStart);
    document.addEventListener('compositionend', onTcTableCellCompositionEnd);
}

function commitTableCellEdit(skipRender) {
    if (!tcEditingCell) return;
    var row = tcEditingCell.row;
    var col = tcEditingCell.col;
    var cell = getTableDataCellEl(row, col);
    var editor = cell && cell.querySelector('.tc-cell-editor');
    var changed = false;
    if (editor && testCasesData[row]) {
        var newVal = editor.value;
        if (newVal !== String(testCasesData[row][col] || '')) {
            testCasesData[row][col] = newVal;
            changed = true;
        }
    }
    var focusAfter = tcFocusedCell ? { row: tcFocusedCell.row, col: tcFocusedCell.col } : null;
    tcEditingCell = null;
    if (skipRender) return;
    renderTableBody();
    if (changed) {
        tcTableRecordAfterMutation();
        if (typeof tcTemplateSwitchOnCurrentTemplateMutated === 'function') tcTemplateSwitchOnCurrentTemplateMutated();
    }
    if (focusAfter) focusTableCell(focusAfter.row, focusAfter.col);
}

function cancelTableCellEdit() {
    if (!tcEditingCell) return;
    var row = tcEditingCell.row;
    var col = tcEditingCell.col;
    tcEditingCell = null;
    renderTableBody();
    focusTableCell(row, col);
}


function scheduleReleaseWorkbenchInteractionLocks() {
    if (typeof window.releaseWorkbenchInteractionLocks === 'function') {
        window.releaseWorkbenchInteractionLocks();
    }
    window.requestAnimationFrame(function() {
        if (typeof window.releaseWorkbenchInteractionLocks === 'function') {
            window.releaseWorkbenchInteractionLocks();
        }
    });
    window.setTimeout(function() {
        if (typeof window.releaseWorkbenchInteractionLocks === 'function') {
            window.releaseWorkbenchInteractionLocks();
        }
    }, 120);
}

function releaseWorkbenchInteractionLocks() {
    if (window.TcLeftPanelLock && typeof window.TcLeftPanelLock.isQualityCheckBusy === 'function' &&
        window.TcLeftPanelLock.isQualityCheckBusy()) {
        return;
    }
    if (typeof window.isTcGenQualityCheckInProgress === 'function' &&
        window.isTcGenQualityCheckInProgress()) {
        return;
    }
    if (typeof window.setTcLeftPanelAiGenerateLock === 'function') {
        window.setTcLeftPanelAiGenerateLock(false);
    }
    if (window.TcAgentOrchestrator && typeof window.TcAgentOrchestrator.releaseGenModeLockIfIdle === 'function') {
        window.TcAgentOrchestrator.releaseGenModeLockIfIdle();
    }
    if (typeof tcEditingCell !== 'undefined' && tcEditingCell) {
        if (typeof commitTableCellEdit === 'function') commitTableCellEdit(true);
        else if (typeof cancelTableCellEdit === 'function') cancelTableCellEdit();
    }
    if (typeof clearTableCellFocus === 'function') clearTableCellFocus();
    document.body.classList.remove('tc-table-row-resizing', 'tc-table-fab-dragging', 'tc-workbench-fab-dragging');
    if (typeof syncTcTableTemplateChrome === 'function') syncTcTableTemplateChrome();
    if (typeof initTcTableCellInteraction === 'function') initTcTableCellInteraction();
}
window.releaseWorkbenchInteractionLocks = releaseWorkbenchInteractionLocks;
window.scheduleReleaseWorkbenchInteractionLocks = scheduleReleaseWorkbenchInteractionLocks;

function resolveTcTableDataCellFromEvent(e) {
    if (e && e.target && e.target.closest && e.target.closest(".tc-vxe-table-mount, .vxe-grid, .vxe-table")) return null;
    if (!e || !e.target || !e.target.closest) return null;
    if (!document.querySelector('.tc-workbench-scope')) return null;
    if (typeof isTcHubExcelTabActive === 'function' && isTcHubExcelTabActive()) return null;
    var panel = e.target.closest('#tc-table-view-panel');
    if (!panel) return null;
    var listPanel = document.getElementById('tc-table-list-panel');
    if (listPanel && listPanel.classList.contains('tc-table-list-panel--locked')) return null;
    if (!tcTableTemplateApplied || !tableColumns || !tableColumns.length) return null;
    if (e.target.closest('.tc-td-actions')) return null;
    if (e.target.closest('.tc-row-resize-handle')) return null;
    if (e.target.closest('.tc-cell-editor')) return null;
    return e.target.closest('td.tc-td-data');
}

function initTcTableCellInteraction() {
    initTcTableCellKeyboardInput();
    if (window._tcTableCellInteractionBound) return;
    window._tcTableCellInteractionBound = true;
    document.addEventListener('click', function(e) {
        var td = resolveTcTableDataCellFromEvent(e);
        if (!td) return;
        focusTableCell(parseInt(td.dataset.rowIndex, 10), parseInt(td.dataset.colIndex, 10), td);
    }, true);
    document.addEventListener('dblclick', function(e) {
        var td = resolveTcTableDataCellFromEvent(e);
        if (!td) return;
        e.preventDefault();
        e.stopPropagation();
        startTableCellEdit(parseInt(td.dataset.rowIndex, 10), parseInt(td.dataset.colIndex, 10), td);
    }, true);
    if (!window._tcTableOutsideClickBound) {
        window._tcTableOutsideClickBound = true;
        document.addEventListener('click', function(e) {
            if (e.target.closest('#tc-table-view-panel')) return;
            if (tcEditingCell) commitTableCellEdit();
            else clearTableCellFocus();
        });
    }
}

function getTcTableBodyRowCount() {
    return testCasesData.length;
}

function getTcTableRowData(index) {
    if (testCasesData[index]) return testCasesData[index];
    return tableColumns.map(function() { return ''; });
}

/** 用户编辑/勾选占位空行时，将其写入 testCasesData */


window.tcNormalizeTableRowsForStorage = tcNormalizeTableRowsForStorage;
window.tcTableMinDisplayRowCount = tcTableMinDisplayRowCount;
window.syncTcExportFabSheetItemsChrome = syncTcExportFabSheetItemsChrome;
window.syncTcQualityCheckButtonChrome = syncTcQualityCheckButtonChrome;
window.isTcExplicitTemplateApplied = isTcExplicitTemplateApplied;
window.ensureTcTableTemplateApplied = ensureTcTableTemplateApplied;

/** 追加生成专用：锁定生成开始时的表格快照，防止 grid pull / reset 清空已有用例 */
var _tcAppendGenBaselineRows = null;
var _tcAppendGenBaselineProv = null;

function tcCloneAppendGenBaselineRows(rows) {
    if (!rows || !rows.length) return [];
    return rows.map(function (row) {
        return Array.isArray(row) ? row.slice() : row;
    });
}

function tcCountContentRowsInData(rows) {
    if (!rows || !rows.length) return 0;
    var count = 0;
    for (var i = 0; i < rows.length; i++) {
        if (typeof tcTableRowHasCaseContent === 'function') {
            if (tcTableRowHasCaseContent(rows[i])) count++;
        } else if (Array.isArray(rows[i]) && rows[i].some(function (c) { return String(c || '').trim(); })) {
            count++;
        }
    }
    return count;
}

function tcBeginAppendGenerationBaseline() {
    if (typeof testCasesData === 'undefined' || !testCasesData || !testCasesData.length) {
        _tcAppendGenBaselineRows = null;
        _tcAppendGenBaselineProv = null;
        return false;
    }
    _tcAppendGenBaselineRows = tcCloneAppendGenBaselineRows(testCasesData);
    _tcAppendGenBaselineProv = (typeof testCasesProvenance !== 'undefined' && testCasesProvenance)
        ? testCasesProvenance.slice() : null;
    return true;
}

function tcClearAppendGenerationBaseline() {
    _tcAppendGenBaselineRows = null;
    _tcAppendGenBaselineProv = null;
}

function tcHasAppendGenerationBaseline() {
    return !!(_tcAppendGenBaselineRows && _tcAppendGenBaselineRows.length);
}

function tcGetAppendGenerationBaselineRows() {
    if (!_tcAppendGenBaselineRows || !_tcAppendGenBaselineRows.length) return null;
    return tcCloneAppendGenBaselineRows(_tcAppendGenBaselineRows);
}

function tcRestoreAppendGenerationBaselineIfNeeded() {
    if (!_tcAppendGenBaselineRows || !_tcAppendGenBaselineRows.length) return false;
    if (typeof testCasesData === 'undefined') return false;
    var baseCount = tcCountContentRowsInData(_tcAppendGenBaselineRows);
    var nowCount = typeof tcCountTableCaseContentRows === 'function'
        ? tcCountTableCaseContentRows()
        : tcCountContentRowsInData(testCasesData);
    if (baseCount > nowCount || _tcAppendGenBaselineRows.length > (testCasesData || []).length) {
        testCasesData = tcCloneAppendGenBaselineRows(_tcAppendGenBaselineRows);
        if (_tcAppendGenBaselineProv && typeof testCasesProvenance !== 'undefined') {
            testCasesProvenance = _tcAppendGenBaselineProv.slice();
            if (typeof tcEnsureProvenanceLength === 'function') {
                try { tcEnsureProvenanceLength(); } catch (eProv) { /* ignore */ }
            }
        }
        if (typeof renderTableBody === 'function') {
            renderTableBody({ reload: true });
        }
        return true;
    }
    return false;
}

/** 暂停/取消横幅：仅统计本次生成会话实际写入的行数（追加模式不计入已有用例）。 */
function tcResolveGenerationPausedWrittenRows(opts) {
    opts = opts || {};
    if (window.TcGenerationStreamClient && typeof window.TcGenerationStreamClient.getSessionRowsAdded === 'function') {
        var sessionAdded = parseInt(window.TcGenerationStreamClient.getSessionRowsAdded(), 10) || 0;
        if (sessionAdded > 0) return sessionAdded;
    }
    if (typeof tcHasAppendGenerationBaseline === 'function' && tcHasAppendGenerationBaseline()) {
        var baseline = typeof tcGetAppendGenerationBaselineRows === 'function'
            ? tcGetAppendGenerationBaselineRows() : null;
        if (baseline && baseline.length) {
            var baseCount = tcCountContentRowsInData(baseline);
            var nowCount = typeof tcCountTableCaseContentRows === 'function' ? tcCountTableCaseContentRows() : 0;
            return Math.max(0, nowCount - baseCount);
        }
    }
    var batchRowCount = 0;
    var batchRowStart = -1;
    if (window.tcGenBatchCore && window.tcGenBatchCore.state) {
        batchRowCount = parseInt(window.tcGenBatchCore.state.batchRowCount, 10) || 0;
        batchRowStart = parseInt(window.tcGenBatchCore.state.batchRowStart, 10);
    }
    if (typeof tcGetLastGenerationWriteStart === 'function') {
        var writeStart = parseInt(tcGetLastGenerationWriteStart(), 10);
        if (!isNaN(writeStart) && writeStart >= 0) batchRowStart = writeStart;
    }
    if (batchRowCount > 0) {
        if (typeof tcCountTableCaseContentRows === 'function' && !isNaN(batchRowStart) && batchRowStart >= 0) {
            return tcCountTableCaseContentRows(batchRowStart, batchRowCount) || batchRowCount;
        }
        return batchRowCount;
    }
    if (!isNaN(batchRowStart) && batchRowStart > 0 && typeof tcCountTableCaseContentRows === 'function') {
        return tcCountTableCaseContentRows(batchRowStart) || 0;
    }
    return 0;
}

window.tcResolveGenerationPausedWrittenRows = tcResolveGenerationPausedWrittenRows;

window.tcResolveListGenerationBatchContentRows = tcResolveListGenerationBatchContentRows;
window.tcBeginAppendGenerationBaseline = tcBeginAppendGenerationBaseline;
window.tcClearAppendGenerationBaseline = tcClearAppendGenerationBaseline;
window.tcHasAppendGenerationBaseline = tcHasAppendGenerationBaseline;
window.tcGetAppendGenerationBaselineRows = tcGetAppendGenerationBaselineRows;
window.tcRestoreAppendGenerationBaselineIfNeeded = tcRestoreAppendGenerationBaselineIfNeeded;

function tcShouldSkipGridPullForAppendGen() {
    return typeof tcHasAppendGenerationBaseline === 'function' && tcHasAppendGenerationBaseline();
}

function tcFinalizeAppendGenerationTable() {
    if (typeof tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
        tcRestoreAppendGenerationBaselineIfNeeded();
    }
    if (typeof renderTableBody === 'function') {
        renderTableBody({ reload: true });
    }
}

window.tcShouldSkipGridPullForAppendGen = tcShouldSkipGridPullForAppendGen;
window.tcFinalizeAppendGenerationTable = tcFinalizeAppendGenerationTable;

var _tcGenerationRollbackSnapshot = null;

function tcCaptureGenerationRollbackSnapshot() {
    if (typeof testCasesData === 'undefined') {
        _tcGenerationRollbackSnapshot = null;
        return false;
    }
    _tcGenerationRollbackSnapshot = tcTableCloneSnapshot(tcTableSnapshotFromState());
    _tcGenerationRollbackSnapshot.tcActiveTemplateId = tcActiveTemplateId || null;
    _tcGenerationRollbackSnapshot.tcTableTemplateApplied = !!tcTableTemplateApplied;
    return true;
}

function tcClearGenerationRollbackSnapshot() {
    _tcGenerationRollbackSnapshot = null;
}

function tcIsGenerationRollbackSnapshotActive() {
    return !!_tcGenerationRollbackSnapshot;
}

function tcForceRestoreAppendGenerationBaseline() {
    if (!_tcAppendGenBaselineRows || !_tcAppendGenBaselineRows.length) return false;
    if (typeof testCasesData === 'undefined') return false;
    testCasesData = tcCloneAppendGenBaselineRows(_tcAppendGenBaselineRows);
    if (_tcAppendGenBaselineProv && typeof testCasesProvenance !== 'undefined') {
        testCasesProvenance = _tcAppendGenBaselineProv.map(function (p) {
            return typeof tcCloneProvenanceEntry === 'function' ? tcCloneProvenanceEntry(p) : p;
        });
        if (typeof tcEnsureProvenanceLength === 'function') {
            try { tcEnsureProvenanceLength(); } catch (eProv) { /* ignore */ }
        }
    }
    if (typeof renderTableHeader === 'function') renderTableHeader();
    if (typeof renderTableBody === 'function') renderTableBody({ reload: true });
    if (window.TcTableView && typeof window.TcTableView.syncFromData === 'function') {
        try { window.TcTableView.syncFromData({ reload: true, immediate: true }); } catch (eSync) { /* ignore */ }
    }
    if (typeof syncTcTableTemplateChrome === 'function') syncTcTableTemplateChrome();
    return true;
}

function tcRestoreGenerationRollbackSnapshot(opts) {
    opts = opts || {};
    if (opts.mergeMode === 'append' && tcForceRestoreAppendGenerationBaseline()) {
        return true;
    }
    if (!_tcGenerationRollbackSnapshot) return false;
    var snap = _tcGenerationRollbackSnapshot;
    tcTableRestoreSnapshot(snap);
    if (snap.tcActiveTemplateId != null) tcActiveTemplateId = snap.tcActiveTemplateId;
    tcTableTemplateApplied = !!snap.tcTableTemplateApplied;
    if (typeof syncTcTableTemplateChrome === 'function') syncTcTableTemplateChrome();
    if (typeof syncTcProvenanceRail === 'function') syncTcProvenanceRail();
    if (window.TcTableView && typeof window.TcTableView.syncFromData === 'function') {
        try { window.TcTableView.syncFromData({ reload: true, immediate: true }); } catch (eSync2) { /* ignore */ }
    }
    return true;
}

window.tcCaptureGenerationRollbackSnapshot = tcCaptureGenerationRollbackSnapshot;
window.tcClearGenerationRollbackSnapshot = tcClearGenerationRollbackSnapshot;
window.tcIsGenerationRollbackSnapshotActive = tcIsGenerationRollbackSnapshotActive;
window.tcRestoreGenerationRollbackSnapshot = tcRestoreGenerationRollbackSnapshot;
window.tcForceRestoreAppendGenerationBaseline = tcForceRestoreAppendGenerationBaseline;




window.seedTcTableDefaultEmptyRows = seedTcTableDefaultEmptyRows;

/* ---- tc_table_toolbar_ops.js ---- */
/**
 * 表格顶栏「表格操作」下拉 — 替代紫色浮动编辑 FAB（隔离模块，不影响其它 FAB）
 */
function isTcTableToolbarOpsMode() {
    var anchor = document.getElementById("tc-table-ops-anchor");
    var toggle = document.getElementById("tc-table-fab-toggle");
    return !!(anchor && toggle && anchor.contains(toggle) &&
        toggle.classList.contains("tc-table-ops-trigger"));
}


function hasTcTableToolbarOpsMenuItems() {
    var isMindmap = typeof tcRightViewMode !== "undefined" && tcRightViewMode === "mindmap";
    var groupId = isMindmap ? "tc-table-fab-sheet-mindmap" : "tc-table-fab-sheet-list";
    var group = document.getElementById(groupId);
    if (!group || group.classList.contains("hidden")) return false;
    return !!group.querySelector(".tc-workbench-fab-sheet__item, .tc-table-fab-sheet__item");
}

function syncTcTableToolbarOpsLabel() {
    if (!isTcTableToolbarOpsMode()) return;
    var isMindmap = typeof tcRightViewMode !== "undefined" && tcRightViewMode === "mindmap";
    var toggle = document.getElementById("tc-table-fab-toggle");
    var sheet = document.getElementById("tc-table-fab-sheet");
    var label = toggle && toggle.querySelector(".tc-table-ops-trigger__label");
    if (label) label.textContent = isMindmap ? "导图操作" : "表格操作";
    if (toggle) {
        toggle.setAttribute("title", isMindmap ? "导图编辑操作" : "表格行与表头操作");
        toggle.setAttribute("aria-label", isMindmap ? "导图操作" : "表格操作");
    }
    if (sheet) sheet.setAttribute("aria-label", isMindmap ? "导图操作" : "表格操作");
}

function syncTcTableToolbarOpsSheetPlacement(open) {
    var sheet = document.getElementById("tc-table-fab-sheet");
    var toggle = document.getElementById("tc-table-fab-toggle");
    if (!sheet || !toggle) return;
    if (open) {
        if (typeof applyTcFabSheetPlacement === "function") {
            applyTcFabSheetPlacement(sheet, toggle);
        }
    } else if (typeof resetTcFabSheetPlacement === "function") {
        resetTcFabSheetPlacement(sheet);
    }
}

function closeTcTableToolbarOpsSheet() {
    if (!isTcTableToolbarOpsMode()) return false;
    var sheet = document.getElementById("tc-table-fab-sheet");
    var toggle = document.getElementById("tc-table-fab-toggle");
    if (sheet) sheet.classList.add("hidden");
    if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
        toggle.classList.remove("tc-table-ops-trigger--open");
    }
    syncTcTableToolbarOpsSheetPlacement(false);
    return true;
}

function toggleTcTableToolbarOpsSheet() {
    if (!isTcTableToolbarOpsMode()) return;
    var sheet = document.getElementById("tc-table-fab-sheet");
    var toggle = document.getElementById("tc-table-fab-toggle");
    if (!sheet || !toggle) return;
    var open = sheet.classList.contains("hidden");
    if (open && typeof closeTcExportFabSheet === "function") closeTcExportFabSheet();
    sheet.classList.toggle("hidden", !open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.classList.toggle("tc-table-ops-trigger--open", !!open);
    syncTcTableToolbarOpsSheetPlacement(!!open);
    if (open) {
        bindTcTableToolbarOpsMenuItems(document.getElementById("tc-table-fab-sheet"));
    }
}

function syncTcTableToolbarOpsAnchor(opts) {
    opts = opts || {};
    if (!isTcTableToolbarOpsMode()) return false;
    var anchor = document.getElementById("tc-table-ops-anchor");
    var floatWrap = document.getElementById("tc-table-fab-wrap");
    if (!anchor) return false;
    if (floatWrap) {
        floatWrap.classList.add("hidden");
        floatWrap.setAttribute("aria-hidden", "true");
    }
    var showFab = opts.showFab !== false;
    var applied = !!opts.applied;
    var isTable = typeof tcRightViewMode !== "undefined" && tcRightViewMode === "table";
    var isMindmap = typeof tcRightViewMode !== "undefined" && tcRightViewMode === "mindmap";
    var show = showFab && applied && (isTable || isMindmap) && hasTcTableToolbarOpsMenuItems();
    anchor.classList.toggle("hidden", !show);
    anchor.setAttribute("aria-hidden", show ? "false" : "true");
    if (!show) closeTcTableToolbarOpsSheet();
    syncTcTableToolbarOpsLabel();
    return true;
}

function isTcTableToolbarOpsSheetOpen() {
    var sheet = document.getElementById("tc-table-fab-sheet");
    return !!(sheet && !sheet.classList.contains("hidden"));
}

function isTcTableToolbarOpsDismissTarget(target) {
    if (!target || !target.closest) return false;
    return !!(target.closest("#tc-table-ops-anchor") || target.closest("#tc-table-fab-sheet"));
}


function addEmptyRowFromToolbarOps() {
    if (typeof ensureTcTableTemplateApplied !== "function" || !ensureTcTableTemplateApplied()) return false;
    if (!tableColumns || !tableColumns.length) return false;
    if (!testCasesData) testCasesData = [];
    if (!testCasesProvenance) testCasesProvenance = [];
    var newRow = tableColumns.map(function () { return ""; });
    testCasesData.push(newRow);
    testCasesProvenance.push(null);
    var targetLen = testCasesData.length;
    window._tcToolbarOpsPreserveMinRows = targetLen;
    try {
        if (typeof renderTableBody === "function") {
            renderTableBody({ reload: false, preserveScroll: true });
        } else if (typeof addEmptyRow === "function") {
            window._tcToolbarOpsPreserveMinRows = 0;
            addEmptyRow();
            return true;
        }
    } finally {
        window._tcToolbarOpsPreserveMinRows = 0;
    }
    if (typeof tcTableRecordAfterMutation === "function") tcTableRecordAfterMutation();
    if (typeof tcTemplateSwitchOnCurrentTemplateMutated === "function") tcTemplateSwitchOnCurrentTemplateMutated();
    return testCasesData.length >= targetLen;
}


function shouldKeepTcTableToolbarOpsSheetOpen(item) {
    return !!(item && item.id === "add-row-btn");
}

function runTcTableToolbarOpsMenuAction(item) {
    if (!item || item.disabled) return false;
    var id = item.id;
    if (id === "add-row-btn") {
        addEmptyRowFromToolbarOps();
        return true;
    }
    if (id === "table-column-settings-btn" && typeof openColumnSettingsModal === "function") {
        openColumnSettingsModal();
        return true;
    }
    return false;
}

function bindTcTableToolbarOpsMenuItems(sheet) {
    if (!sheet || sheet._tcToolbarOpsMenuBound) return;
    sheet._tcToolbarOpsMenuBound = true;
    sheet.addEventListener("click", function (e) {
        var item = e.target.closest(".tc-workbench-fab-sheet__item, .tc-table-fab-sheet__item");
        if (!item || item.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        runTcTableToolbarOpsMenuAction(item);
        if (!shouldKeepTcTableToolbarOpsSheetOpen(item)) {
            window.setTimeout(function () {
                closeTcTableToolbarOpsSheet();
            }, 0);
        }
    }, true);
}

function initTcTableToolbarOpsUi() {
    if (!isTcTableToolbarOpsMode()) return;
    var toggle = document.getElementById("tc-table-fab-toggle");
    var anchor = document.getElementById("tc-table-ops-anchor");
    var sheet = document.getElementById("tc-table-fab-sheet");
    if (!toggle || toggle._tcToolbarOpsBound) return;
    toggle._tcToolbarOpsBound = true;
    toggle._tcFabBound = true;

    toggle.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleTcTableToolbarOpsSheet();
    });

    if (typeof bindTcFabSheetKeepOpen === "function") bindTcFabSheetKeepOpen("tc-table-fab-sheet");
    bindTcTableToolbarOpsMenuItems(sheet);

    if (!window._tcToolbarOpsDismissBound) {
        window._tcToolbarOpsDismissBound = true;
        document.addEventListener("click", function (e) {
            if (!isTcTableToolbarOpsMode() || !isTcTableToolbarOpsSheetOpen()) return;
            if (isTcTableToolbarOpsDismissTarget(e.target)) return;
            closeTcTableToolbarOpsSheet();
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && isTcTableToolbarOpsSheetOpen()) closeTcTableToolbarOpsSheet();
        });
    }
}

(function patchToggleTcTableFabSheetForToolbarOps() {
    if (typeof toggleTcTableFabSheet !== "function") return;
    var orig = toggleTcTableFabSheet;
    window.toggleTcTableFabSheet = function () {
        if (isTcTableToolbarOpsMode()) toggleTcTableToolbarOpsSheet();
        else orig();
    };
})();

(function patchRefreshOpenTcFabSheetPlacementsForToolbarOps() {
    if (typeof refreshOpenTcFabSheetPlacements !== "function") return;
    var orig = refreshOpenTcFabSheetPlacements;
    window.refreshOpenTcFabSheetPlacements = function () {
        if (isTcTableToolbarOpsMode()) {
            var tableSheet = document.getElementById("tc-table-fab-sheet");
            var tableToggle = document.getElementById("tc-table-fab-toggle");
            if (tableSheet && tableToggle && !tableSheet.classList.contains("hidden") &&
                typeof applyTcFabSheetPlacement === "function") {
                applyTcFabSheetPlacement(tableSheet, tableToggle);
            }
            var exportSheet = document.getElementById("tc-export-fab-sheet");
            var exportToggle = document.getElementById("tc-export-fab-toggle");
            if (exportSheet && exportToggle && !exportSheet.classList.contains("hidden") &&
                typeof applyTcFabSheetPlacement === "function") {
                applyTcFabSheetPlacement(exportSheet, exportToggle);
            }
            return;
        }
        orig();
    };
})();

(function patchCloseTcTableFabSheetForToolbarOps() {
    if (typeof closeTcTableFabSheet !== "function") return;
    var origClose = closeTcTableFabSheet;
    window.closeTcTableFabSheet = function () {
        if (isTcTableToolbarOpsMode()) {
            closeTcTableToolbarOpsSheet();
            if (typeof closeTcExportFabSheet === "function") closeTcExportFabSheet();
            return;
        }
        origClose();
    };
})();


/* ---- tc_table_render.js ---- */
/**
 * TestHub TC Workbench — L5 APP
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
function ensureTcTableRowMaterialized(rowIndex) {
    if (!tcTableTemplateApplied || !tableColumns.length) return false;
    if (rowIndex < 0) return false;
    if (typeof tcTableHasOnlyPlaceholderRows === 'function' && tcTableHasOnlyPlaceholderRows()) {
        if (rowIndex >= TC_TABLE_DEFAULT_EMPTY_ROWS) return false;
    }
    while (testCasesData.length <= rowIndex) {
        if (typeof tcTableHasOnlyPlaceholderRows === 'function' &&
            tcTableHasOnlyPlaceholderRows() &&
            testCasesData.length >= TC_TABLE_DEFAULT_EMPTY_ROWS) {
            return false;
        }
        testCasesData.push(tableColumns.map(function() { return ''; }));
        if (typeof testCasesProvenance !== 'undefined' && typeof tcEnsureProvenanceLength === 'function') {
            tcEnsureProvenanceLength();
        }
    }
    return true;
}

/**
 * 将解析出的行写入列表表格：优先填入现有空行，不足则在末尾追加。
 * @returns {{ added: number, startIndex: number }}
 */
function tcWriteParsedRowsToTable(normalizedRows, opts) {
    opts = opts || {};
    if (!normalizedRows || !normalizedRows.length) return { added: 0, startIndex: -1 };
    if (!tcTableTemplateApplied || !tableColumns.length) {
        if (!ensureTcTableTemplateApplied()) return { added: 0, startIndex: -1 };
    }
    if (typeof initColumnState === 'function') initColumnState();
    var appendOnly = opts.appendOnly === true;
    var added = 0;
    var startIndex = -1;
    var writtenIndices = [];
    var mode = typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset';

    normalizedRows.forEach(function (rawRow, rowIdx) {
        if (!Array.isArray(rawRow)) return;
        var normalizedRow = tableColumns.map(function (_, idx) {
            var v = rawRow[idx];
            return v !== undefined && v !== null ? String(v) : '';
        });
        var targetIdx = appendOnly
            ? -1
            : (typeof tcFindGenerationInsertRowIndex === 'function'
                ? tcFindGenerationInsertRowIndex()
                : tcFindFirstEmptyTableRowIndex(0));
        if (targetIdx >= 0) {
            testCasesData[targetIdx] = normalizedRow;
        } else {
            testCasesData.push(normalizedRow);
            targetIdx = testCasesData.length - 1;
        }
        if (startIndex < 0 || targetIdx < startIndex) startIndex = targetIdx;
        writtenIndices.push(targetIdx);
        try {
            if (typeof testCasesProvenance !== 'undefined') {
                if (typeof tcEnsurePendingGenerationProvenance === 'function') {
                    tcEnsurePendingGenerationProvenance(mode);
                }
                var serverProv = opts.provenance && opts.provenance[rowIdx];
                if (serverProv && typeof tcNormalizeServerProvenanceEntry === 'function') {
                    testCasesProvenance[targetIdx] = tcNormalizeServerProvenanceEntry(serverProv);
                } else {
                    testCasesProvenance[targetIdx] = typeof tcTakePendingProvenanceForNewRow === 'function'
                        ? tcTakePendingProvenanceForNewRow()
                        : null;
                }
            }
        } catch (provErr) {
            console.warn('[TestHub] provenance write skipped:', provErr);
        }
        added++;
    });

    if (added > 0) {
        try { tcEnsureProvenanceLength(); } catch (e2) { /* ignore */ }
        tcPendingGenerationProvenance = null;
        if (typeof tcRecordGenerationWriteStart === 'function') {
            tcRecordGenerationWriteStart(startIndex);
        }
    }
    return { added: added, startIndex: startIndex, writtenIndices: writtenIndices };
}

function renderTableBody(opts) {
    opts = opts || {};
    if (testCasesData && typeof tcNormalizeTableRowsForStorage === 'function') {
        testCasesData = tcNormalizeTableRowsForStorage(testCasesData);
        try { tcEnsureProvenanceLength(); } catch (eNorm) { /* ignore */ }
    }
    if (tcEditingCell && typeof commitTableCellEdit === 'function') commitTableCellEdit(true);
    if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode === 'mindmap' && !opts.forceTableSync) {
        return Promise.resolve(false);
    }
    if (window.TcTableView && typeof window.TcTableView.syncFromData === 'function') {
        return window.TcTableView.syncFromData({
            reload: opts.reload === true,
            immediate: opts.immediate === true || opts.reload === true,
            preserveScroll: opts.preserveScroll === true,
        });
    }
    if (window.TcTableProductivity && typeof window.TcTableProductivity.refreshFilter === 'function') {
        window.TcTableProductivity.refreshFilter();
    }
    return Promise.resolve(false);
}

// 编辑行
function editRow(index) {
    editingRowIndex = index;
    const row = testCasesData[index];

    const editForm = document.getElementById('edit-form');
    let formHTML = '';
    
    tableColumns.forEach((col, colIndex) => {
        formHTML += `
            <div>
                <label class="form-label">${col}</label>
                <textarea id="edit-col-${colIndex}" class="form-input" rows="3">${row[colIndex] || ''}</textarea>
            </div>
        `;
    });
    
    editForm.innerHTML = formHTML;

    // 显示模态框
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// 关闭编辑模态框
function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    editingRowIndex = -1;
}

// 保存编辑
function saveEditRow() {
    if (editingRowIndex === -1) return;
    
    const updatedRow = tableColumns.map((_, colIndex) => {
        const input = document.getElementById(`edit-col-${colIndex}`);
        return input ? input.value : '';
    });
    var prevRow = testCasesData[editingRowIndex];
    var rowChanged = !prevRow || updatedRow.some(function(v, i) {
        return String(v || '') !== String(prevRow[i] || '');
    });
    testCasesData[editingRowIndex] = updatedRow;
    renderTableBody({ reload: true });
    if (rowChanged) tcTableRecordAfterMutation();
    closeEditModal();
}

// 标记行（黄色高亮）
function toggleRowMark(index) {
    if (!testCasesData[index]) {
        ensureTcTableRowMaterialized(index);
    }
    if (markedRows.has(index)) {
        markedRows.delete(index);
    } else {
        markedRows.add(index);
    }
    renderTableBody({ reload: true });
    tcTableRecordAfterMutation();
}

// 删除行
function deleteRow(index) {
    if (index >= testCasesData.length) return;
    tcAppConfirm('将删除该条用例行，且不可恢复。', {
        title: '删除用例？',
        variant: 'warning',
        confirmText: '删除',
        cancelText: '保留'
    }).then(function (ok) {
        if (!ok) return;
        testCasesData.splice(index, 1);
        if (index < testCasesProvenance.length) testCasesProvenance.splice(index, 1);
        const shiftedMarks = new Set();
        markedRows.forEach((rowIndex) => {
            if (rowIndex < index) shiftedMarks.add(rowIndex);
            if (rowIndex > index) shiftedMarks.add(rowIndex - 1);
        });
        markedRows = shiftedMarks;
        const shiftedSel = new Set();
        selectedRows.forEach((rowIndex) => {
            if (rowIndex < index) shiftedSel.add(rowIndex);
            if (rowIndex > index) shiftedSel.add(rowIndex - 1);
        });
        selectedRows = shiftedSel;
        shiftRowHeightsAfterDelete(index);
        renderTableBody({ reload: false, preserveScroll: true });
        tcTableRecordAfterMutation();
        if (window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.onTableRowsRemoved === 'function') {
            window.TcRequirementCaseStore.onTableRowsRemoved();
        }
        tcAppToast('已删除 1 条用例。', { variant: 'success', duration: 2200 });
    });
}

function deleteSelectedRows() {
    if (!selectedRows.size) {
        tcAppAlert('请先在表格左侧勾选要删除的用例行，再使用批量删除。', { variant: 'warning', title: '未选择行' });
        return;
    }
    const selectedSet = new Set(selectedRows);
    const count = selectedSet.size;
    tcAppConfirm('将永久删除已选中的 ' + count + ' 条用例，且不可恢复。', {
        title: '批量删除用例？',
        variant: 'warning',
        confirmText: '删除 ' + count + ' 条',
        cancelText: '取消'
    }).then(function (ok) {
        if (!ok) return;

        const oldToNew = new Map();
        const nextRows = [];
        const nextProv = [];
        testCasesData.forEach(function(row, idx) {
            if (selectedSet.has(idx)) return;
            oldToNew.set(idx, nextRows.length);
            nextRows.push(row);
            nextProv.push(testCasesProvenance[idx] || null);
        });
        testCasesData = nextRows;
        testCasesProvenance = nextProv;

        const nextMarked = new Set();
        markedRows.forEach(function(idx) {
            if (oldToNew.has(idx)) nextMarked.add(oldToNew.get(idx));
        });
        markedRows = nextMarked;
        selectedRows.clear();
        remapRowHeightsByIndexMap(oldToNew);
        renderTableBody({ reload: true });
        tcTableRecordAfterMutation();
        if (window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.onTableRowsRemoved === 'function') {
            window.TcRequirementCaseStore.onTableRowsRemoved();
        }
        tcAppToast('已删除 ' + count + ' 条用例。', { variant: 'success', duration: 2600 });
    });
}


/** 从 AI 返回中提取可解析载荷：优先含 test_cases/[[ 的 fenced 代码块 */
function extractAiPayloadText(aiResult) {
    var text = String(aiResult != null ? aiResult : '');
    var trimmed = text.trim();
    if (trimmed.charAt(0) === '{' && /test_cases/i.test(trimmed)) {
        try {
            var wrapper = JSON.parse(trimmed);
            if (wrapper && Array.isArray(wrapper.test_cases)) {
                return 'test_cases = ' + JSON.stringify(wrapper.test_cases);
            }
        } catch (jsonWrapErr) { /* ignore */ }
    }
    var fenceRe = /```(?:python|json|javascript|js|txt|text|plaintext|markdown)?\s*([\s\S]*?)```/gi;
    var blocks = [];
    var m;
    while ((m = fenceRe.exec(text)) !== null) {
        blocks.push(m[1]);
    }
    if (blocks.length) {
        var pick = null;
        for (var i = blocks.length - 1; i >= 0; i--) {
            if (/test_cases\s*=|\[\s*(\[|\{)/.test(blocks[i])) {
                pick = blocks[i];
                break;
            }
        }
        return pick != null ? pick : blocks[blocks.length - 1];
    }
    if (/```/.test(text)) {
        text = text.replace(/```[\w]*\n?/g, '\n');
    }
    var assignMatches = text.match(/(?:^|\n)\s*test_cases\s*=/g);
    if (assignMatches && assignMatches.length > 1) {
        var lastAssign = text.lastIndexOf('test_cases');
        if (lastAssign >= 0) {
            text = text.slice(lastAssign);
        }
    }
    return text;
}


/** 修复 AI 在双引号字符串内误用 ASCII " 作中文引号导致的解析失败 */
function fixNestedAsciiQuotesInPythonStrings(str) {
    var s = String(str != null ? str : '');
    if (!s) return s;
    var out = '';
    var inStr = false;
    var strChar = '';
    var i = 0;
    while (i < s.length) {
        var ch = s[i];
        if (!inStr && (ch === '"' || ch === "'")) {
            inStr = true;
            strChar = ch;
            out += ch;
            i++;
            continue;
        }
        if (inStr && ch === strChar && s[i - 1] !== '\\') {
            var k = i + 1;
            while (k < s.length && /[ \t\r\n]/.test(s[k])) k++;
            if (strChar === '"' && k < s.length && s[k] !== ',' && s[k] !== ']' && s[k] !== ')' && s[k] !== '"') {
                out += "'";
                i++;
                while (i < s.length) {
                    if (s[i] === '"' && s[i - 1] !== '\\') {
                        out += "'";
                        i++;
                        break;
                    }
                    out += s[i++];
                }
                continue;
            }
            inStr = false;
            out += ch;
            i++;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

function sanitizeAiInlineQuotes(str) {
    var s = fixNestedAsciiQuotesInPythonStrings(String(str != null ? str : ''));
    if (!s) return s;
    var out = '';
    var inStr = false;
    var i = 0;
    while (i < s.length) {
        var ch = s[i];
        if (!inStr) {
            out += ch;
            if (ch === '"') inStr = true;
            i++;
            continue;
        }
        if (ch === '"' && s[i - 1] !== '\\') {
            var j = i + 1;
            while (j < s.length && /[一-鿿㐀-䶿豈-﫿]/.test(s[j])) j++;
            if (j > i + 1 && s[j] === '"') {
                out += "'";
                i++;
                while (i < s.length && s[i] !== '"') {
                    out += s[i++];
                }
                if (s[i] === '"') {
                    out += "'";
                    i++;
                }
                continue;
            }
            inStr = false;
            out += ch;
            i++;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

function normalizeAiListLiteral(str) {
    var s = sanitizeAiInlineQuotes(String(str != null ? str : ''));
    s = s.replace(/[\u201c\u201d\u201e\u201f\ufeff]/g, "'");
    s = s.replace(/[\u2018\u2019\u201a\u201b]/g, "'");
    s = s.replace(/\bNone\b/g, 'null');
    s = s.replace(/\bTrue\b/g, 'true');
    s = s.replace(/\bFalse\b/g, 'false');
    s = s.replace(/,\s*([\]}])/g, '$1');
    return s;
}


function findOuterAiListStart(text) {
    var s = String(text != null ? text : '');
    for (var i = 0; i < s.length; i++) {
        if (s[i] === '[') return i;
    }
    return -1;
}

/** 与后端 incremental_case_parser._extract_complete_row_arrays 对齐：扫描完整内层用例行 */
function extractCompleteRowArrayLiterals(text, outerBracketPos, scanFrom) {
    text = String(text != null ? text : '');
    if (outerBracketPos < 0 || outerBracketPos >= text.length || text[outerBracketPos] !== '[') return [];
    var results = [];
    var i = Math.max(scanFrom || 0, outerBracketPos + 1);
    var n = text.length;
    while (i < n) {
        while (i < n && /[\s,]/.test(text[i])) i++;
        if (i >= n || text[i] === ']') break;
        if (text[i] !== '[') { i++; continue; }
        var innerStart = i;
        var depth = 0;
        var inString = false;
        var stringChar = '';
        var escape = false;
        var j = i;
        while (j < n) {
            var ch = text[j];
            if (escape) { escape = false; j++; continue; }
            if (ch === '\\' && inString) { escape = true; j++; continue; }
            if (!inString && (ch === '"' || ch === "'")) {
                inString = true;
                stringChar = ch;
                j++;
                continue;
            }
            if (inString) {
                if (ch === stringChar) inString = false;
                j++;
                continue;
            }
            if (ch === '[') depth++;
            else if (ch === ']') {
                depth--;
                if (depth === 0) {
                    results.push(text.slice(innerStart, j + 1));
                    i = j + 1;
                    break;
                }
            }
            j++;
        }
        if (j >= n) break;
    }
    return results;
}

function isPlaceholderParsedRow(row) {
    if (!row || !row.length) return true;
    for (var i = 0; i < row.length; i++) {
        var c = String(row[i] != null ? row[i] : '').trim();
        if (!c) continue;
        if (/^字段\d+$/.test(c)) return true;
        if (c === '...' || c === '…' || c === '字段1' || c === '字段2') return true;
    }
    var joined = row.map(function (cell) { return String(cell != null ? cell : '').trim(); }).join(' ');
    if (/\[\[|\]\]|test_cases\s*=/i.test(joined)) return true;
    return false;
}

function parseRowLiteralFromAi(literal) {
    if (!literal) return null;
    var candidates = [literal];
    var flat = literal.replace(/\n/g, ' ').trim();
    if (flat !== literal) candidates.push(flat);
    var sanitized = normalizeAiListLiteral(literal);
    if (sanitized !== literal) candidates.push(sanitized);
    var sanitizedFlat = sanitized.replace(/\n/g, ' ').trim();
    if (sanitizedFlat !== sanitized) candidates.push(sanitizedFlat);
    for (var ci = 0; ci < candidates.length; ci++) {
        try {
            var parsed = new Function('return ' + candidates[ci])();
            if (!Array.isArray(parsed)) continue;
            var bad = false;
            for (var pi = 0; pi < parsed.length; pi++) {
                if (Array.isArray(parsed[pi]) || (parsed[pi] && typeof parsed[pi] === 'object')) {
                    bad = true;
                    break;
                }
            }
            if (bad) continue;
            return parsed.map(function (x) { return x != null ? String(x) : ''; });
        } catch (e1) { /* try next */ }
        try {
            var parsedJson = JSON.parse(candidates[ci]);
            if (!Array.isArray(parsedJson)) continue;
            return parsedJson.map(function (x) { return x != null ? String(x) : ''; });
        } catch (e2) { /* try next */ }
    }
    var manual = manualParseTestCases('[' + literal + ']');
    if (manual && manual.length && Array.isArray(manual[0])) return manual[0];
    return null;
}

/** 与后端 parse_rows_from_text 对齐：逐条扫描内层数组，避免整段解析漏行 */
function parseTestCaseRowsFromAiText(text) {
    var raw = String(text != null ? text : '').replace(/test_cases\s*=\s*/, '');
    var cleaned = sanitizeAiInlineQuotes(raw);
    var outer = findOuterAiListStart(cleaned);
    if (outer < 0) return [];
    var literals = extractCompleteRowArrayLiterals(cleaned, outer, outer + 1);
    var rows = [];
    literals.forEach(function (lit) {
        var row = parseRowLiteralFromAi(lit);
        if (!row || isPlaceholderParsedRow(row)) return;
        rows.push(row);
    });
    return rows;
}

function tryParseTestCasesArrayLiteral(testCasesStr) {
    var sanitized = sanitizeAiInlineQuotes(testCasesStr);
    var candidates = [testCasesStr, sanitized, normalizeAiListLiteral(testCasesStr), normalizeAiListLiteral(sanitized)];
    for (var ci = 0; ci < candidates.length; ci++) {
        var candidate = candidates[ci];
        try {
            var parsed = new Function('return ' + candidate)();
            if (Array.isArray(parsed)) return parsed;
        } catch (e1) {}
        try {
            var cleanStr = candidate.replace(/\n/g, ' ').replace(/\s+/g, ' ');
            var parsed2 = new Function('return ' + cleanStr)();
            if (Array.isArray(parsed2)) return parsed2;
        } catch (e2) {}
        try {
            var parsed3 = JSON.parse(candidate);
            if (Array.isArray(parsed3)) return parsed3;
        } catch (e3) {}
    }
    return manualParseTestCases(testCasesStr);
}

function normalizeParsedTestCaseRows(testCases) {
    if (!Array.isArray(testCases) || !testCases.length) return null;
    if (Array.isArray(testCases[0])) return testCases;
    if (typeof testCases[0] === 'object' && testCases[0] !== null) {
        return testCases.map(function(obj) {
            return tableColumns.map(function(colName) {
                if (obj[colName] !== undefined && obj[colName] !== null) {
                    return String(obj[colName]);
                }
                var stripped = String(colName).replace(/^\d+\.\s*/, '');
                if (obj[stripped] !== undefined && obj[stripped] !== null) {
                    return String(obj[stripped]);
                }
                return '';
            });
        });
    }
    return null;
}

/**
 * 解析要素分类法导图文本（缩进层级 + TC: 用例）并写入 tcMindmapCasesData（与列表隔离）
 */
function parseMindmapElementClassificationResult(aiResult, showAlert, parseOpts) {
    if (!tableColumns.length) {
        if (!ensureTcMindmapGenerateColumns()) return 0;
    }
    try {
        parseOpts = parseOpts || {};
        var text = extractAiPayloadText(aiResult);
        if (typeof tcMindmapExtractParseableText === 'function') {
            text = tcMindmapExtractParseableText(text);
        }
        var lines = text.split(/\r?\n/);
        var pathStack = ['测试用例'];
        var added = 0;
        var nameCol = getTcColumnIndex('用例名称', 0);
        var modCol = getTcColumnIndex('所属模块', 1);

        lines.forEach(function(rawLine) {
            if (!String(rawLine).trim()) return;
            var level = tcMindmapOutlineIndentLevel(rawLine);
            var content = tcMindmapCleanOutlineTitle(rawLine);
            if (!content) return;
            if (typeof tcMindmapIsNoiseLine === 'function' && tcMindmapIsNoiseLine(content)) return;

            var tcMatch = content.match(/^TC\s*[:：]\s*(.+)$/i);
            if (tcMatch) {
                var caseName = tcMatch[1].trim();
                if (!caseName) return;
                if (typeof tcMindmapIsNoiseLine === 'function' && tcMindmapIsNoiseLine(caseName)) return;
                var moduleParts = pathStack.length > 1 ? pathStack.slice(1) : [];
                var row = tableColumns.map(function() { return ''; });
                row[nameCol] = caseName;
                row[modCol] = moduleParts.length ? moduleParts.join(' / ') : '未分类';
                if (parseOpts.useTableStore) {
                    testCasesData.push(row);
                } else {
                    tcMindmapCasesData.push(row);
                }
                added += 1;
                return;
            }

            if (/^测试用例$/i.test(content)) {
                pathStack = ['测试用例'];
                return;
            }
            var embeddedParts = tcMindmapSplitModulePath(content);
            if (embeddedParts.length > 1) {
                pathStack = ['测试用例'].concat(embeddedParts);
                return;
            }
            if (level <= 0 && typeof tcMindmapIsRootLine === 'function' &&
                !tcMindmapIsRootLine(rawLine) && /[A-Za-z]{3,}/.test(content)) {
                return;
            }
            var branchLevel;
            if (level === 1 && typeof tcMindmapIsObjectTitle === 'function' && tcMindmapIsObjectTitle(content)) {
                branchLevel = 1;
            } else {
                branchLevel = level <= 0 ? 1 : level + 1;
            }
            if (branchLevel > 48) branchLevel = 48;
            pathStack[branchLevel] = content;
            pathStack.length = branchLevel + 1;
            if (pathStack[0] !== '测试用例') pathStack.unshift('测试用例');
        });

        tcMindmapRootTopic = '测试用例';
        if (added > 0) {
            if (parseOpts.useTableStore) {
                renderTableBody({ reload: true });
                tcTableRecordAfterMutation();
            }
        } else if (showAlert) {
            console.warn('[TestHub] 要素分类法解析未识别到 TC: 行');
        }
        return added;
    } catch (err) {
        console.error('要素分类法导图解析失败:', err);
        if (showAlert) {
            tcAppAlert('导图层级文本解析失败：' + (err.message || String(err)), {
                variant: 'warning',
                title: '解析失败'
            });
        }
        return 0;
    }
}

// 解析AI返回的测试用例并添加到表格；replaceAtIndices 与解析出的行一一对应时执行原地改写
function parseAndAddTestCases(aiResult, showAlert = true, replaceAtIndices = null, parseOpts) {
    parseOpts = parseOpts || {};
    if (!tcTableTemplateApplied || !tableColumns.length) {
        if (parseOpts.allowMindmapWithoutTemplate) {
            ensureTcMindmapGenerateColumns();
        } else if (!ensureTcTableTemplateApplied()) {
            return 0;
        }
    }
    try {
        var rawInput = String(aiResult != null ? aiResult : '');
        console.log('开始解析AI返回结果:', rawInput.substring(0, 300) + '...');
        console.log('完整AI返回长度:', rawInput.length);

        let testCasesStr = extractAiPayloadText(rawInput);
        console.log('提取载荷后长度:', testCasesStr.length);
        
        // 2. 移除 test_cases = 赋值部分（仅首处，避免误删正文）
        testCasesStr = testCasesStr.replace(/test_cases\s*=\s*/, '');
        
        // 3. 处理注释 - 逐行处理，保留非注释行
        const lines = testCasesStr.split('\n');
        const cleanLines = [];
        
        for (let line of lines) {
            const trimmed = line.trim();
            // 跳过空行和注释行
            if (trimmed.length === 0 || trimmed.startsWith('#')) {
                continue;
            }
            cleanLines.push(line);
        }
        testCasesStr = cleanLines.join('\n');
        
        console.log('移除注释后内容:', testCasesStr.substring(0, 500) + '...');

        // 3.5 与后端 incremental_case_parser 对齐：逐条扫描内层用例数组（避免整段解析漏行）
        let testCases = parseTestCaseRowsFromAiText(testCasesStr);
        if (!testCases.length) {
            testCasesStr = normalizeAiListLiteral(testCasesStr);
        } else {
            console.log('逐行扫描解析成功，条数:', testCases.length);
        }

        // 4. 找到第一个[和匹配的最后一个] - 使用简单的括号匹配（逐行扫描失败时兜底）
        if (!testCases.length) {
        let firstBracket = -1;
        let lastBracket = -1;
        let bracketCount = 0;
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < testCasesStr.length; i++) {
            const char = testCasesStr[i];
            const prevChar = i > 0 ? testCasesStr[i - 1] : '';
            
            // 处理字符串
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }
            
            // 只在非字符串中处理括号
            if (!inString) {
                if (char === '[') {
                    if (firstBracket === -1) {
                        firstBracket = i;
                    }
                    bracketCount++;
                } else if (char === ']') {
                    bracketCount--;
                    if (bracketCount === 0 && firstBracket !== -1) {
                        lastBracket = i;
                        break;
                    }
                }
            }
        }
        
        if (firstBracket === -1) {
            console.error('未找到开始的 [ 括号');
            console.error('当前处理的字符串:', testCasesStr);
            
            // 尝试方法2：简单提取
            const simpleFirst = testCasesStr.indexOf('[');
            const simpleLast = testCasesStr.lastIndexOf(']');
            if (simpleFirst !== -1 && simpleLast !== -1 && simpleLast > simpleFirst) {
                console.log('使用简单提取方法');
                firstBracket = simpleFirst;
                lastBracket = simpleLast;
            } else {
                if (showAlert) {
                    tcAppAlert('未在内容中识别到有效的二维列表结构。请确认包含成对的 [ ] 且内层为用例数组。', {
                        variant: 'warning',
                        title: '未找到列表',
                        hint: '手动导入时请粘贴类似 [[\"列1\",...],[...]] 的格式。'
                    });
                }
                return 0;
            }
        }
        
        if (lastBracket === -1) {
            console.error('括号未闭合，尝试修复...');
            // 尝试添加缺失的闭合括号
            testCasesStr = testCasesStr.substring(firstBracket) + ']]';
            lastBracket = testCasesStr.length - 1;
            console.log('修复后的内容:', testCasesStr);
        }
        
        // 5. 提取列表部分
        testCasesStr = testCasesStr.substring(firstBracket, lastBracket + 1);
        
        console.log('最终提取的列表字符串（前500字符）:', testCasesStr.substring(0, 500));
        console.log('最终字符串长度:', testCasesStr.length);
        
        }

        // 6. 尝试解析 - 多种方法（Function / JSON / 手动）
        if (!testCases || !testCases.length) {
            try {
                testCases = tryParseTestCasesArrayLiteral(testCasesStr);
                console.log('列表解析成功，条数:', Array.isArray(testCases) ? testCases.length : 0);
            } catch (eParse) {
                console.error('所有列表解析方法失败:', eParse);
                throw new Error('无法解析测试用例，请手动检查格式');
            }
        }

        var normalizedFromObjects = normalizeParsedTestCaseRows(testCases);
        if (normalizedFromObjects) {
            testCases = normalizedFromObjects;
        }
        if (Array.isArray(testCases) && testCases.length && !Array.isArray(testCases[0]) &&
            tableColumns.length && testCases.length === tableColumns.length) {
            testCases = [testCases];
        }

        if (Array.isArray(testCases) && testCases.length > 0) {
            console.log('成功解析到', testCases.length, '条测试用例');
            
            const normalizedRows = [];
            testCases.forEach((tc, index) => {
                if (Array.isArray(tc)) {
                    console.log(`处理第 ${index + 1} 条测试用例:`, tc);
                    const normalizedRow = tableColumns.map((_, idx) => {
                        const value = tc[idx];
                        return value !== undefined && value !== null ? String(value) : '';
                    });
                    normalizedRows.push(normalizedRow);
                } else {
                    console.warn(`第 ${index + 1} 条不是数组:`, tc);
                }
            });
            
            if (normalizedRows.length === 0) {
                console.warn('没有有效的测试用例行');
                return 0;
            }

            if (replaceAtIndices !== null && Array.isArray(replaceAtIndices)) {
                if (!replaceAtIndices.length) {
                    if (showAlert) {
                        tcAppAlert('请先勾选表格中要改写的行，再执行改写。', { variant: 'warning', title: '未选择行' });
                    }
                    return 0;
                }
                if (normalizedRows.length !== replaceAtIndices.length) {
                    if (showAlert) {
                        tcAppAlert(
                            '改写模式要求模型返回与勾选行数完全一致的 ' + replaceAtIndices.length + ' 条内层数组；当前解析到 ' + normalizedRows.length + ' 条。',
                            { variant: 'warning', title: '条数不匹配', hint: '请调整提示词，明确要求只输出对应条数的列表。' }
                        );
                    }
                    return 0;
                }
                for (let i = 0; i < replaceAtIndices.length; i++) {
                    const rowIndex = replaceAtIndices[i];
                    testCasesData[rowIndex] = normalizedRows[i];
                    if (tcPendingGenerationProvenance) {
                        testCasesProvenance[rowIndex] = tcTakePendingProvenanceForNewRow();
                    }
                }
                tcPendingGenerationProvenance = null;
                selectedRows.clear();
                renderTableBody({ reload: true });
                tcTableRecordAfterMutation();
                if (showAlert) {
                    tcAppToast('已改写 ' + normalizedRows.length + ' 行并写回表格。', { variant: 'success', duration: 3200 });
                }
                return normalizedRows.length;
            }
            
            let addedCount = 0;
            if (parseOpts.useMindmapStore) {
                var mmModCol = getTcColumnIndex('所属模块', 1);
                normalizedRows.forEach(function(normalizedRow) {
                    if (mmModCol >= 0) {
                        var mmParts = tcMindmapSplitModulePath(normalizedRow[mmModCol]);
                        if (mmParts.length) normalizedRow[mmModCol] = mmParts.join(' / ');
                    }
                    tcMindmapCasesData.push(normalizedRow);
                    addedCount++;
                });
                tcMindmapRootTopic = '测试用例';
            } else {
                var listWrite = typeof tcWriteParsedRowsToTable === 'function'
                    ? tcWriteParsedRowsToTable(normalizedRows, {
                        mergeMode: parseOpts.mergeMode || 'overwrite',
                        appendOnly: parseOpts.appendOnly === true,
                        provenance: parseOpts.serverProvenanceList || null
                    })
                    : null;
                addedCount = listWrite ? listWrite.added : 0;
                var listAddStart = listWrite && listWrite.startIndex >= 0 ? listWrite.startIndex : testCasesData.length;
                if (typeof window.tcAppendValidationParsedRows === 'function' && replaceAtIndices === null && addedCount > 0) {
                    window.tcAppendValidationParsedRows(normalizedRows, tableColumns, {
                        replace: (parseOpts.mergeMode || 'overwrite') !== 'append',
                        tableRowIndices: listWrite && listWrite.writtenIndices ? listWrite.writtenIndices : null
                    });
                }
                if (!listWrite) {
                    listAddStart = testCasesData.length;
                    normalizedRows.forEach((normalizedRow) => {
                        testCasesData.push(normalizedRow);
                        try {
                            if (typeof testCasesProvenance !== 'undefined') {
                                if (typeof tcEnsurePendingGenerationProvenance === 'function') {
                                    tcEnsurePendingGenerationProvenance(typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
                                }
                                testCasesProvenance.push(tcTakePendingProvenanceForNewRow());
                            }
                        } catch (provErr) {
                            console.warn('[TestHub] provenance push skipped:', provErr);
                        }
                        addedCount++;
                    });
                    tcPendingGenerationProvenance = null;
                    try { tcEnsureProvenanceLength(); } catch (e2) { /* ignore */ }
                }
                if (parseOpts.serverProvenanceList && typeof tcApplyServerProvenanceToRows === 'function' && addedCount > 0) {
                    tcApplyServerProvenanceToRows(listAddStart, parseOpts.serverProvenanceList.slice(0, addedCount));
                } else if (parseOpts.serverProvenanceEntry && typeof tcApplyServerProvenanceEntryToRows === 'function' && addedCount > 0) {
                    tcApplyServerProvenanceEntryToRows(listAddStart, addedCount, parseOpts.serverProvenanceEntry);
                } else if (typeof tcFinalizeGenerationProvenanceForRows === 'function' && addedCount > 0) {
                    tcFinalizeGenerationProvenanceForRows(
                        listAddStart,
                        addedCount,
                        typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset'
                    );
                }
                renderTableBody({ reload: true });
                tcTableRecordAfterMutation();
            }
            
            console.log('实际添加了', addedCount, '条测试用例');
            return addedCount;
        } else {
            console.error('解析结果不是有效数组或数组为空:', testCases);
            if (showAlert) {
                tcAppAlert('解析结果不是有效的非空数组，或内层元素不是数组。请检查粘贴内容。', {
                    variant: 'warning',
                    title: '格式不正确'
                });
            }
        }
    } catch (e) {
        console.error('解析测试用例失败:', e);
        console.error('错误堆栈:', e.stack);
        console.error('原始AI返回:', aiResult);
        if (showAlert) {
            tcAppAlert('解析失败：' + e.message, {
                variant: 'error',
                title: '无法解析内容',
                hint: '请移除说明文字、Markdown 代码围栏，仅保留 Python 列表。'
            });
        }
    }
    return 0;
}

/** 将已规范化的二维行数组写入表格（Agent 结果等结构化数据直写，避免重复解析丢内容） */
function applyNormalizedRowsToTable(normalizedRows, parseOpts) {
    parseOpts = parseOpts || {};
    if (!normalizedRows || !normalizedRows.length) return 0;
    if (!tcTableTemplateApplied || !tableColumns.length) {
        if (!ensureTcTableTemplateApplied()) return 0;
    }
    if (typeof initColumnState === 'function') initColumnState();
    var listWrite = typeof tcWriteParsedRowsToTable === 'function'
        ? tcWriteParsedRowsToTable(normalizedRows, {
            mergeMode: parseOpts.mergeMode || 'overwrite',
            appendOnly: parseOpts.appendOnly === true,
            provenance: parseOpts.serverProvenanceList || null
        })
        : null;
    var addedCount = listWrite ? listWrite.added : 0;
    var listAddStart = listWrite && listWrite.startIndex >= 0 ? listWrite.startIndex : -1;
    if (!listWrite) {
        listAddStart = testCasesData.length;
        normalizedRows.forEach(function (normalizedRow) {
            if (!Array.isArray(normalizedRow)) return;
            testCasesData.push(normalizedRow);
            try {
                if (typeof testCasesProvenance !== 'undefined') {
                    if (typeof tcEnsurePendingGenerationProvenance === 'function') {
                        tcEnsurePendingGenerationProvenance(typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
                    }
                    testCasesProvenance.push(typeof tcTakePendingProvenanceForNewRow === 'function'
                        ? tcTakePendingProvenanceForNewRow()
                        : null);
                }
            } catch (provErr) {
                console.warn('[TestHub] provenance push skipped:', provErr);
            }
            addedCount++;
        });
    }
    if (addedCount <= 0) return 0;
    if (typeof window.tcAppendValidationParsedRows === 'function') {
        window.tcAppendValidationParsedRows(normalizedRows, tableColumns, {
            replace: (parseOpts.mergeMode || 'overwrite') !== 'append',
            tableRowIndices: listWrite && listWrite.writtenIndices ? listWrite.writtenIndices : null
        });
    }
    tcPendingGenerationProvenance = null;
    try { tcEnsureProvenanceLength(); } catch (e2) { /* ignore */ }
    if (parseOpts.serverProvenanceList && typeof tcApplyServerProvenanceToRows === 'function') {
        tcApplyServerProvenanceToRows(listAddStart, parseOpts.serverProvenanceList.slice(0, addedCount));
    } else if (parseOpts.serverProvenanceEntry && typeof tcApplyServerProvenanceEntryToRows === 'function') {
        tcApplyServerProvenanceEntryToRows(listAddStart, addedCount, parseOpts.serverProvenanceEntry);
    } else if (typeof tcFinalizeGenerationProvenanceForRows === 'function') {
        tcFinalizeGenerationProvenanceForRows(
            listAddStart,
            addedCount,
            typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset'
        );
    }
    return addedCount;
}
window.applyNormalizedRowsToTable = applyNormalizedRowsToTable;
window.parseTestCaseRowsFromAiText = parseTestCaseRowsFromAiText;

// 手动解析测试用例的备用方法
function manualParseTestCases(str) {
    const testCases = [];
    let currentTestCase = null;
    let inString = false;
    let stringChar = '';
    let currentValue = '';
    let depth = 0;
    let inTestCase = false;
    
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const prevChar = i > 0 ? str[i - 1] : '';
        
        // 处理字符串
        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
                // 字符串结束，如果在测试用例中，添加值
                if (inTestCase && depth === 2) {
                    if (currentValue.trim().length > 0) {
                        currentTestCase.push(currentValue.trim());
                    }
                    currentValue = '';
                }
            }
            continue;
        }
        
        if (inString) {
            currentValue += char;
            continue;
        }
        
        // 处理括号
        if (char === '[') {
            depth++;
            if (depth === 2) {
                // 开始一个新的测试用例
                currentTestCase = [];
                inTestCase = true;
                currentValue = '';
            }
        } else if (char === ']') {
            depth--;
            if (depth === 1 && inTestCase && currentTestCase) {
                // 结束一个测试用例
                if (currentValue.trim().length > 0) {
                    currentTestCase.push(currentValue.trim());
                }
                if (currentTestCase.length > 0) {
                    testCases.push(currentTestCase);
                }
                inTestCase = false;
                currentTestCase = null;
                currentValue = '';
            }
        } else if (char === ',' && depth === 2) {
            // 测试用例内的分隔符
            if (currentValue.trim().length > 0) {
                currentTestCase.push(currentValue.trim());
            }
            currentValue = '';
        } else if (char !== ' ' && char !== '\n' && char !== '\r' && char !== '\t') {
            // 非空白字符
            currentValue += char;
        }
    }
    
    return testCases;
}

function tcCrc32(bytes) {
    var table = tcCrc32._table;
    if (!table) {
        table = new Uint32Array(256);
        for (var i = 0; i < 256; i++) {
            var c = i;
            for (var j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            table[i] = c >>> 0;
        }
        tcCrc32._table = table;
    }
    var crc = 0xffffffff;
    for (var k = 0; k < bytes.length; k++) {
        crc = table[(crc ^ bytes[k]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function tcBuildStoredZipBlob(fileEntries) {
    var enc = new TextEncoder();
    var parts = [];
    var central = [];
    var offset = 0;
    fileEntries.forEach(function(entry) {
        var nameBytes = enc.encode(entry.name);
        var data = entry.data instanceof Uint8Array ? entry.data : enc.encode(String(entry.data));
        var crc = tcCrc32(data);
        var size = data.length;
        var local = new Uint8Array(30 + nameBytes.length + size);
        var dv = new DataView(local.buffer);
        dv.setUint32(0, 0x04034b50, true);
        dv.setUint16(4, 20, true);
        dv.setUint16(8, 0, true);
        dv.setUint32(14, crc, true);
        dv.setUint32(18, size, true);
        dv.setUint32(22, size, true);
        dv.setUint16(26, nameBytes.length, true);
        local.set(nameBytes, 30);
        local.set(data, 30 + nameBytes.length);
        parts.push(local);
        var centralHdr = new Uint8Array(46 + nameBytes.length);
        var cdv = new DataView(centralHdr.buffer);
        cdv.setUint32(0, 0x02014b50, true);
        cdv.setUint16(4, 20, true);
        cdv.setUint16(6, 20, true);
        cdv.setUint16(8, 0, true);
        cdv.setUint32(16, crc, true);
        cdv.setUint32(20, size, true);
        cdv.setUint32(24, size, true);
        cdv.setUint16(28, nameBytes.length, true);
        cdv.setUint32(42, offset, true);
        centralHdr.set(nameBytes, 46);
        central.push(centralHdr);
        offset += local.length;
    });
    var centralSize = central.reduce(function(sum, c) { return sum + c.length; }, 0);
    var end = new Uint8Array(22);
    var edv = new DataView(end.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, fileEntries.length, true);
    edv.setUint16(10, fileEntries.length, true);
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, offset, true);
    var totalLen = offset + centralSize + 22;
    var out = new Uint8Array(totalLen);
    var pos = 0;
    parts.forEach(function(p) { out.set(p, pos); pos += p.length; });
    central.forEach(function(c) { out.set(c, pos); pos += c.length; });
    out.set(end, pos);
    return new Blob([out], { type: 'application/vnd.xmind.workbook' });
}

function tcJsmindNodeToXmindTopic(node) {
    if (!node) return null;
    var topic = {
        id: String(node.id || tcMindmapNewNodeId('xm')),
        title: String(node.topic != null ? node.topic : '')
    };
    var children = node.children;
    if (children && children.length) {
        topic.children = {
            attached: children.map(tcJsmindNodeToXmindTopic).filter(Boolean)
        };
    }
    return topic;
}

function exportTcMindmapToXmind() {
    if (!ensureTcTableTemplateApplied()) return;
    if (!tcMindmapCasesData.length) {
        tcAppAlert('导图中还没有用例数据。请先生成或导入用例后再导出。', { variant: 'info', title: '暂无可导出数据' });
        return;
    }
    var mindRoot = null;
    if (tcMindmapInstance && typeof tcMindmapInstance.get_data === 'function') {
        try {
            var mindData = tcMindmapInstance.get_data('node_tree');
            if (mindData && mindData.data) mindRoot = mindData.data;
        } catch (e) { /* fallback below */ }
    }
    if (!mindRoot) mindRoot = buildTcMindmapMindData().data;
    var rootTopic = typeof tcJsmindNodeToXmindZenTopic === 'function'
        ? tcJsmindNodeToXmindZenTopic(mindRoot)
        : tcJsmindNodeToXmindTopic(mindRoot);
    if (!rootTopic) {
        tcAppAlert('无法读取思维导图结构，请刷新后重试。', { variant: 'warning', title: '导出失败' });
        return;
    }
    var blob = null;
    if (typeof tcBuildXmindZenWorkbookBlob === 'function') {
        blob = tcBuildXmindZenWorkbookBlob(rootTopic, { sheetTitle: '测试用例' });
    }
    if (!blob) {
        tcAppAlert('生成 XMind 文件失败，请刷新后重试。', { variant: 'warning', title: '导出失败' });
        return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '测试用例_' + new Date().toISOString().slice(0, 10) + '.xmind';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    tcAppToast('已导出 XMind 文件，可用 XMind / Zen 打开。', { variant: 'success', duration: 3200 });
}


var tcExportExcelBusy = false;

function getTcExportExcelBtn() {
    return document.getElementById('export-excel-btn');
}

function beginTcExportExcelLoading() {
    if (tcExportExcelBusy) return false;
    tcExportExcelBusy = true;
    window.tcExportExcelBusy = true;
    var btn = getTcExportExcelBtn();
    if (btn) {
        btn.disabled = true;
        btn.classList.add('tc-table-fab-sheet__item--loading');
        btn.setAttribute('aria-busy', 'true');
        var spans = btn.querySelectorAll('span');
        var labelSpan = spans.length > 1 ? spans[spans.length - 1] : null;
        if (labelSpan) {
            if (!btn.dataset.tcExportOrigLabel) {
                btn.dataset.tcExportOrigLabel = (labelSpan.textContent || '').trim() || 'AI转导图';
            }
            labelSpan.textContent = '下载中…';
        }
    }
    return true;
}

function endTcExportExcelLoading() {
    if (typeof endTcExportExcelFromFabLoading === 'function') {
        endTcExportExcelFromFabLoading();
    }
    if (!tcExportExcelBusy) return;
    tcExportExcelBusy = false;
    window.tcExportExcelBusy = false;
    var btn = getTcExportExcelBtn();
    if (!btn) return;
    btn.classList.remove('tc-table-fab-sheet__item--loading');
    btn.removeAttribute('aria-busy');
    var spans = btn.querySelectorAll('span');
    var labelSpan = spans.length > 1 ? spans[spans.length - 1] : null;
    if (labelSpan && btn.dataset.tcExportOrigLabel) {
        labelSpan.textContent = btn.dataset.tcExportOrigLabel;
    }
    if (typeof syncTcTableTemplateChrome === 'function') {
        syncTcTableTemplateChrome();
    } else {
        btn.disabled = false;
    }
}

window.beginTcExportExcelLoading = beginTcExportExcelLoading;
window.endTcExportExcelLoading = endTcExportExcelLoading;
window.tcExportExcelBusy = false;

var tcExportExcelFabBusy = false;

function getTcExportExcelFabBtn() {
    return document.getElementById('table-to-mindmap-btn');
}

function beginTcExportExcelFromFabLoading() {
    if (tcExportExcelFabBusy || tcExportExcelBusy) return false;
    tcExportExcelFabBusy = true;
    window.tcExportExcelFabBusy = true;
    var btn = getTcExportExcelFabBtn();
    if (btn) {
        btn.disabled = true;
        btn.classList.add('tc-table-fab-sheet__item--loading');
        btn.setAttribute('aria-busy', 'true');
        var spans = btn.querySelectorAll('span');
        var labelSpan = spans.length > 1 ? spans[spans.length - 1] : null;
        if (labelSpan) {
            if (!btn.dataset.tcExportOrigLabel) {
                btn.dataset.tcExportOrigLabel = (labelSpan.textContent || '').trim() || '导出 Excel';
            }
            labelSpan.textContent = '下载中…';
        }
    }
    return true;
}

function endTcExportExcelFromFabLoading() {
    if (!tcExportExcelFabBusy) return;
    tcExportExcelFabBusy = false;
    window.tcExportExcelFabBusy = false;
    var btn = getTcExportExcelFabBtn();
    if (!btn) return;
    btn.classList.remove('tc-table-fab-sheet__item--loading');
    btn.removeAttribute('aria-busy');
    var spans = btn.querySelectorAll('span');
    var labelSpan = spans.length > 1 ? spans[spans.length - 1] : null;
    if (labelSpan && btn.dataset.tcExportOrigLabel) {
        labelSpan.textContent = btn.dataset.tcExportOrigLabel;
    }
    if (typeof syncTcTableTemplateChrome === 'function') {
        syncTcTableTemplateChrome();
    } else if (typeof syncTcExportFabSheetItemsChrome === 'function') {
        syncTcExportFabSheetItemsChrome();
    } else {
        btn.disabled = false;
    }
}

window.beginTcExportExcelFromFabLoading = beginTcExportExcelFromFabLoading;
window.endTcExportExcelFromFabLoading = endTcExportExcelFromFabLoading;
window.tcExportExcelFabBusy = false;

// 导出到Excel
function tcTablePayloadHasExportableData() {
    if (typeof window.TcTableView !== 'undefined' && window.TcTableView && typeof window.TcTableView.pullRows === 'function') {
        try { window.TcTableView.pullRows(); } catch (ePull) { /* ignore */ }
    }
    if (!tableColumns || !tableColumns.length) return false;
    if (!testCasesData || !testCasesData.length) return false;
    for (var i = 0; i < testCasesData.length; i++) {
        if (typeof tcTableRowHasCaseContent === 'function' && tcTableRowHasCaseContent(testCasesData[i])) return true;
        var row = testCasesData[i];
        if (!row) continue;
        for (var j = 0; j < tableColumns.length; j++) {
            if (String(row[j] != null ? row[j] : '').trim()) return true;
        }
    }
    return false;
}


function tcExportExcelFromFab() {
    if (typeof closeTcTableFabSheet === 'function') closeTcTableFabSheet();
    if (!beginTcExportExcelFromFabLoading()) return;
    if (typeof window.tcOpenExportRequirementPicker === 'function') {
        window.tcOpenExportRequirementPicker();
        return;
    }
    if (typeof window.tcExportTableWithReport === 'function') {
        window.tcExportTableWithReport();
        return;
    }
    if (!tcTablePayloadHasExportableData()) {
        endTcExportExcelFromFabLoading();
        tcAppAlert('当前表格暂无数据，请先添加用例后再导出。', { variant: 'info', title: '暂无可导出数据' });
        return;
    }
    var exportRows = testCasesData.map(function (row) {
        return tableColumns.map(function (_, i) { return String(row[i] != null ? row[i] : ''); });
    });
    if (typeof window.tcDownloadExportSpreadsheet === 'function') {
        window.tcDownloadExportSpreadsheet(tableColumns.slice(), exportRows).catch(function (err) {
            tcAppAlert('Excel 导出失败：' + (err && err.message ? err.message : '未知错误'), { variant: 'warning', title: '导出失败' });
        }).finally(function () {
            endTcExportExcelFromFabLoading();
        });
        return;
    }
    endTcExportExcelFromFabLoading();
    tcAppAlert('Excel 导出组件未就绪，请刷新页面后重试。', { variant: 'warning', title: '导出失败' });
}

window.tcExportExcelFromFab = tcExportExcelFromFab;

function exportToExcel() {
    if (typeof convertTableToMindmapViaAi === 'function') {
        convertTableToMindmapViaAi();
        return;
    }
    if (!beginTcExportExcelLoading()) return;
    tcAppAlert('AI 转换组件未就绪，请刷新页面后重试。', { variant: 'warning', title: 'AI转换失败' });
    endTcExportExcelLoading();
}

var tcTableToMindmapConverting = false;
var tcViewConvertChoiceResolve = null;

function closeTcViewConvertModal(choice) {
    hideModal(document.getElementById('tc-view-convert-modal'));
    var fn = tcViewConvertChoiceResolve;
    tcViewConvertChoiceResolve = null;
    if (fn) fn(choice || 'cancel');
}

function openTcViewConvertModal(opts) {
    opts = opts || {};
    var modal = document.getElementById('tc-view-convert-modal');
    var titleEl = document.getElementById('tc-view-convert-modal-title');
    var descEl = document.getElementById('tc-view-convert-modal-desc');
    if (titleEl) titleEl.textContent = opts.title || '目标已有数据';
    if (descEl) descEl.textContent = opts.message || '请选择如何处理现有数据。';
    if (typeof ensureTcWorkbenchOverlaysMounted === 'function') ensureTcWorkbenchOverlaysMounted();
    if (modal && modal.parentElement !== document.body) document.body.appendChild(modal);
    if (typeof initTcViewConvertModalUi === 'function') initTcViewConvertModalUi();
    if (typeof tcEnsureModalTopLayer === 'function') tcEnsureModalTopLayer(modal);
    showModal(modal);
}

function askTcViewConvertChoice(opts) {
    return new Promise(function(resolve) {
        tcViewConvertChoiceResolve = resolve;
        openTcViewConvertModal(opts);
    });
}

function initTcViewConvertModalUi() {
    if (window._tcViewConvertModalInited) return;
    window._tcViewConvertModalInited = true;
    var modal = document.getElementById('tc-view-convert-modal');
    var overwriteBtn = document.getElementById('tc-view-convert-overwrite');
    var appendBtn = document.getElementById('tc-view-convert-append');
    var cancelBtn = document.getElementById('tc-view-convert-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function() { closeTcViewConvertModal('cancel'); });
    if (overwriteBtn) overwriteBtn.addEventListener('click', function() { closeTcViewConvertModal('overwrite'); });
    if (appendBtn) appendBtn.addEventListener('click', function() { closeTcViewConvertModal('append'); });
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeTcViewConvertModal('cancel');
        });
    }
}


/* ---- tc_xmind_zen_export.js ---- */
/**
 * XMind Zen / 2020+ 原生 .xmind 导出（与 tcBuildStoredZipBlob 配合，独立模块不影响旧转换函数）
 */
(function tcXmindZenExport(global) {
    'use strict';

    function tcXmindZenNewId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function tcXmindZenTopicId(preferred) {
        var s = String(preferred || '').trim();
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
            return s;
        }
        return tcXmindZenNewId();
    }

    function tcXmindZenContentXmlStub() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="no"?><xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" version="2.0"><sheet id="stub-sheet"><title>Sheet</title><topic id="stub-root"><title>Root</title></topic></sheet></xmap-content>';
    }

    function tcJsmindNodeToXmindZenTopic(node) {
        if (!node) return null;
        var topic = {
            id: tcXmindZenTopicId(node.id),
            structureClass: 'org.xmind.ui.logic.right',
            title: String(node.topic != null ? node.topic : '')
        };
        var children = node.children;
        if (children && children.length) {
            topic.children = {
                attached: children.map(tcJsmindNodeToXmindZenTopic).filter(Boolean)
            };
        }
        return topic;
    }

    /** 将旧版 {id,title,children:{attached}} 或 jsmind 节点规范为 XMind Zen topic */
    function tcXmindZenNormalizeTopicTree(topic) {
        if (!topic || typeof topic !== 'object') return null;
        var out = {
            id: tcXmindZenTopicId(topic.id),
            structureClass: topic.structureClass || 'org.xmind.ui.logic.right',
            title: String(topic.title != null ? topic.title : (topic.topic != null ? topic.topic : ''))
        };
        var ch = topic.children;
        var attached = null;
        if (ch && Array.isArray(ch.attached)) {
            attached = ch.attached;
        } else if (Array.isArray(ch)) {
            attached = ch;
        } else if (Array.isArray(topic.children)) {
            attached = topic.children;
        }
        if (attached && attached.length) {
            out.children = {
                attached: attached.map(tcXmindZenNormalizeTopicTree).filter(Boolean)
            };
        }
        return out;
    }

    function tcBuildXmindZenWorkbookBlob(rootTopic, opts) {
        opts = opts || {};
        if (!rootTopic) return null;

        var normalizedRoot = tcXmindZenNormalizeTopicTree(rootTopic);
        if (!normalizedRoot && rootTopic.topic != null) {
            normalizedRoot = tcJsmindNodeToXmindZenTopic(rootTopic);
        }
        if (!normalizedRoot) return null;
        normalizedRoot.class = 'topic';

        var sheetId = tcXmindZenNewId();
        var sheet = {
            id: sheetId,
            class: 'sheet',
            title: String(opts.sheetTitle || '测试用例'),
            extensions: [],
            topicPositioning: 'fixed',
            topicOverlapping: 'overlap',
            coreVersion: '2.100.0',
            rootTopic: normalizedRoot
        };

        var contentJson = JSON.stringify([sheet]);
        var metadataJson = JSON.stringify({
            modifier: '',
            dataStructureVersion: '2',
            creator: { name: 'TestHub', version: '1.0' },
            layoutEngineVersion: '3',
            activeSheetId: sheetId
        });
        var manifestJson = JSON.stringify({
            'file-entries': {
                'content.json': {},
                'metadata.json': {},
                'manifest.json': {},
                'content.xml': {}
            }
        });

        var enc = new TextEncoder();
        var entries = [
            { name: 'content.json', data: enc.encode(contentJson) },
            { name: 'metadata.json', data: enc.encode(metadataJson) },
            { name: 'manifest.json', data: enc.encode(manifestJson) },
            { name: 'content.xml', data: enc.encode(tcXmindZenContentXmlStub()) }
        ];

        if (typeof global.tcBuildStoredZipBlob === 'function') {
            return global.tcBuildStoredZipBlob(entries);
        }
        return null;
    }

    function tcDownloadXmindZenBlob(rootTopic, filenameStem, opts) {
        var blob = tcBuildXmindZenWorkbookBlob(rootTopic, opts);
        if (!blob) return false;
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (filenameStem || '测试用例') + '_' + new Date().toISOString().slice(0, 10) + '.xmind';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    }

    global.tcJsmindNodeToXmindZenTopic = tcJsmindNodeToXmindZenTopic;
    global.tcXmindZenNormalizeTopicTree = tcXmindZenNormalizeTopicTree;
    global.tcBuildXmindZenWorkbookBlob = tcBuildXmindZenWorkbookBlob;
    global.tcDownloadXmindZenBlob = tcDownloadXmindZenBlob;
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- tc_view_convert_boot.js ---- */
/**
 * TestHub TC Workbench — L5 APP
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */

function tcTablePullRowsFromView() {
    if (window.TcTableView && typeof window.TcTableView.pullRows === 'function') {
        return window.TcTableView.pullRows();
    }
    return Promise.resolve(true);
}

function resolveTcCaseNameColumnIndex() {
    var candidates = ['用例名称', '用例标题', '用例摘要', '标题'];
    for (var i = 0; i < candidates.length; i++) {
        var idx = tableColumns.indexOf(candidates[i]);
        if (idx >= 0) return idx;
    }
    return typeof getTcColumnIndex === 'function' ? getTcColumnIndex('用例名称', 0) : 0;
}

function tcTableHasCaseData() {
    return collectTableRowsForMindmapConvert().length > 0;
}

function tcMindmapHasCaseData() {
    var nameCol = getTcColumnIndex('用例名称', 0);
    var i;
    for (i = 0; i < tcMindmapCasesData.length; i++) {
        var row = tcMindmapCasesData[i];
        if (row && String(row[nameCol] || '').trim()) return true;
    }
    var mind = tcMindmapCaptureMindSnapshot() || tcMindmapExternalMindData;
    if (mind && mind.data && Array.isArray(mind.data.children) && mind.data.children.length) {
        return true;
    }
    return false;
}
function fetchTableToMindmapApi(columns, rows, rootTopic) {
    return fetch('/api/test-cases/table-to-mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            columns: columns,
            rows: rows,
            root_topic: rootTopic || '测试用例'
        })
    }).then(function(resp) {
        return resp.json().then(function(data) {
            if (!resp.ok || (data && data.error)) {
                throw new Error((data && data.error) || ('HTTP ' + resp.status));
            }
            return data;
        });
    });
}
function applyMindmapConvertResult(data, combinedRows) {
    var mind = data && data.mind;
    if (!mind || !mind.data) {
        throw new Error('服务端未返回有效的思维导图数据');
    }
    tcMindmapCasesData = combinedRows.map(function(r) { return r.slice(); });
    var mindClone;
    try {
        mindClone = JSON.parse(JSON.stringify(mind));
    } catch (cloneErr) {
        mindClone = mind;
    }
    tcMindmapExternalMindData = mindClone;
    tcMindmapCommittedExternalMind = mindClone;
    tcMindmapCachedMindPayload = null;
    tcMindmapSkipCacheRestore = true;
    if (typeof tcMindmapReleaseInstance === 'function') tcMindmapReleaseInstance();
    tcMindmapRootTopic = String(mind.data.topic || '测试用例');
    tcMindmapUndoStack = [];
    tcMindmapHistory = [];
    tcMindmapHistoryIndex = -1;
    tcMindmapUndoBaseline = null;
    tcMindmapMetaById = {};
    tcMindmapGenerating = false;
    tcMindmapPendingFitFocus = true;
    window.tcMindmapExternalMindData = mindClone;
    window.tcMindmapCommittedExternalMind = mindClone;
    if (typeof tcSyncWorkbenchGlobals === 'function') tcSyncWorkbenchGlobals();
    switchTcRightView('mindmap');
    if (typeof tcMindmapPersistCache === 'function') {
        window.setTimeout(function() {
            var snap = typeof tcMindmapCaptureMindSnapshot === 'function' ? tcMindmapCaptureMindSnapshot() : null;
            if (snap && snap.data && Array.isArray(snap.data.children) && snap.data.children.length) {
                tcMindmapPersistCache();
            }
        }, 500);
    }
}
/** 导图为空且表格有有效用例时，从表格同步行数据（不覆盖已有导图；默认关闭，仅显式转换时同步） */
function tcMindmapHydrateFromTableIfEmpty() {
    if (window.TcWorkbenchData && typeof window.TcWorkbenchData.shouldAutoHydrateMindmapFromTable === 'function' &&
        !window.TcWorkbenchData.shouldAutoHydrateMindmapFromTable()) {
        return false;
    }
    if (typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData.length) return false;
    var ext = typeof tcMindmapExternalMindData !== 'undefined' ? tcMindmapExternalMindData : null;
    if ((!ext || !ext.data) && typeof tcMindmapCommittedExternalMind !== 'undefined') {
        ext = tcMindmapCommittedExternalMind;
    }
    if (typeof tcMindmapMindHasUserNodes === 'function' && tcMindmapMindHasUserNodes(ext)) {
        return false;
    }
    if (typeof collectTableRowsForMindmapConvert !== 'function') return false;
    var rows = collectTableRowsForMindmapConvert();
    if (!rows.length) return false;
    tcMindmapCasesData = rows.map(function(r) { return r.slice(); });
    tcMindmapExternalMindData = null;
    tcMindmapCommittedExternalMind = null;
    window.tcMindmapExternalMindData = null;
    window.tcMindmapCommittedExternalMind = null;
    tcMindmapRootTopic = '测试用例';
    return true;
}

function collectTableRowsForMindmapConvert() {
    var nameCol = resolveTcCaseNameColumnIndex();
    var rows = [];
    var source = typeof testCasesData !== 'undefined' && testCasesData ? testCasesData : [];
    for (var i = 0; i < source.length; i++) {
        var row = source[i];
        if (!row) continue;
        var copy = tableColumns.map(function(_, idx) {
            return row[idx] !== undefined && row[idx] !== null ? String(row[idx]) : '';
        });
        if (!String(copy[nameCol] || '').trim()) continue;
        rows.push(copy);
    }
    return rows;
}

function convertTableToMindmap() {
    if (typeof closeTcTableFabSheet === 'function') closeTcTableFabSheet();
    if (!ensureTcTableTemplateApplied()) return;
    if (tcTableToMindmapConverting) return;

    var btn = null; /* table-to-mindmap-btn 已用于导出 Excel FAB */

    tcTablePullRowsFromView().then(function() {
        var rows = collectTableRowsForMindmapConvert();
        if (!rows.length) {
            tcAppAlert('表格中还没有有效用例。请确保至少一行包含「用例名称」或同类标题列。', {
                variant: 'info',
                title: '暂无可转换数据'
            });
            return;
        }
        return Promise.resolve().then(function() {
        if (!tcMindmapHasCaseData()) return 'overwrite';
        return askTcViewConvertChoice({
            title: '思维导图已有数据',
            message: '当前思维导图中已有用例。覆盖将替换全部导图内容；追加会把现有用例与表格用例合并后重新生成导图；取消则不执行转换。'
        });
    }).then(function(choice) {
        if (choice === 'cancel') return null;
        var mode = choice === 'append' ? 'append' : 'overwrite';
        var apiRows = rows;
        if (mode === 'append') {
            var existing = [];
            var nameCol = resolveTcCaseNameColumnIndex();
            tcMindmapCasesData.forEach(function(row) {
                if (!row) return;
                var copy = tableColumns.map(function(_, idx) {
                    return row[idx] !== undefined && row[idx] !== null ? String(row[idx]) : '';
                });
                if (!String(copy[nameCol] || '').trim()) return;
                existing.push(copy);
            });
            apiRows = existing.concat(rows);
        }
        tcTableToMindmapConverting = true;
        if (btn) btn.disabled = true;
        return fetchTableToMindmapApi(tableColumns, apiRows, '测试用例').then(function(data) {
            applyMindmapConvertResult(data, apiRows);
            var total = (data.stats && data.stats.total) || apiRows.length;
            if (data.stats && data.stats.total < apiRows.length) {
                console.warn('[TestHub] table-to-mindmap: submitted ' + apiRows.length + ' rows, parsed ' + data.stats.total);
            }
            var toastMsg = mode === 'append'
                ? '已追加并转为思维导图，共 ' + total + ' 条用例。'
                : '已转为思维导图，共 ' + total + ' 条用例。';
            tcAppToast(toastMsg, { variant: 'success', duration: 3200 });
        });
    }).catch(function(err) {
        if (err && err.message) {
            tcAppAlert(err.message, { variant: 'error', title: '转思维导图失败' });
        }
    });
    }).catch(function(err) {
        if (err && err.message) {
            tcAppAlert(err.message, { variant: 'error', title: '转思维导图失败' });
        }
    }).finally(function() {
        tcTableToMindmapConverting = false;
        if (btn) btn.disabled = !(tcTableTemplateApplied && tableColumns.length);
    });
}
// 页面加载时初始化（模板从 MySQL API 加载）
document.addEventListener('DOMContentLoaded', function() {
    if (document.querySelector('.tc-workbench-scope')) {
        if (typeof ensureTcTemplateChooserUiReady === 'function') ensureTcTemplateChooserUiReady();
    }
    // 媒体工具箱复用了 tc-hub-scope 类名，但不应走用例 Hub Chrome / 提示词拉取
    if (document.querySelector('.tc-hub-scope') && !document.body.classList.contains('mdh-hub-page')) {
        syncTcHubAiChrome();
    }
    if (document.querySelector('.tc-workbench-scope')) {
        if (typeof tcInitGenBatchBarUi === 'function') tcInitGenBatchBarUi();
        if (typeof initTcEditComposer === 'function') initTcEditComposer();
    }
    if (document.querySelector('.tc-workbench-scope')) {
        if (typeof ensureTcTemplateChooserUiReady === 'function') ensureTcTemplateChooserUiReady();
        if (typeof initTcViewConvertModalUi === 'function') initTcViewConvertModalUi();
    }
    function bootTcWorkbench() {
        // 非用例工作台页面（如媒体工具箱）不拉取系统提示词/模板，避免控制台 NetworkError
        if (!document.querySelector('.tc-workbench-scope')) {
            return;
        }
        function bootCore() {
            if (typeof tcInitGenBatchBarUi === 'function') tcInitGenBatchBarUi();
            if (typeof initTcEditComposer === 'function') initTcEditComposer();
            if (document.querySelector('.tc-workbench-scope')) {
                try {
                    initTestCaseTable();
                } finally {
                    if (typeof ensureTcRightViewUiInited === 'function') ensureTcRightViewUiInited();
                }
                if (window.TcWorkbenchEnhancements && typeof TcWorkbenchEnhancements.init === 'function') {
                    TcWorkbenchEnhancements.init();
                }
            }
            if (document.getElementById('tc-gen-mode-single')) {
                switchDrawer(1);
            }
        }
        Promise.all([fetchTcCaseTemplates(), fetchTcSystemPrompts()])
            .then(bootCore)
            .catch(function() { bootCore(); });
    }
    if (typeof hfReloadToolkitLock === 'function') {
        hfReloadToolkitLock()
            .then(function() {
                if (typeof initTcFeatureUnlockLockedState === 'function') initTcFeatureUnlockLockedState();
                if (typeof syncTcRagLockChrome === 'function') syncTcRagLockChrome();
            })
            .catch(function() { /* keep SSR flag */ })
            .finally(bootTcWorkbench);
    } else {
        bootTcWorkbench();
    }
});


/* ---- tc_ai_table_to_mindmap.js ---- */
/**
 * AI 转换 Excel：表格用例 → AI 要素分类法思维导图（流式 + 导图区转换态，与其他功能隔离）
 */
(function (global) {
    'use strict';

    var tcAiTableToMindmapConverting = false;

    function scheduleTcMindmapRenderAfterAiConvert() {
        if (typeof global.tcMindmapRenderWhenReady === 'function') {
            global.tcMindmapRenderWhenReady({ releaseInstance: false });
            return;
        }
        if (typeof global.tcMindmapPaintView === 'function') {
            global.tcMindmapPaintView({ releaseInstance: false });
            return;
        }
        if (typeof global.renderTcMindmap === 'function') {
            global.renderTcMindmap({ forceLayout: true, releaseInstance: false });
        }
    }

    function installTcAiTableConvertViewGuard() {
        if (typeof global.switchTcRightView !== 'function') return false;
        if (global.switchTcRightView._tcAiTableConvertGuard) return true;
        var origSwitch = global.switchTcRightView;
        global.switchTcRightView = function (mode) {
            if (mode === 'table' && global.tcAiTableToMindmapConverting) return;
            return origSwitch.apply(this, arguments);
        };
        global.switchTcRightView._tcAiTableConvertGuard = true;
        return true;
    }

    var tcAiTableConvertWorkbenchLockActive = false;
    var tcAiTableConvertLockCaptureBound = false;

    function getTcAiTableConvertWorkbenchScope() {
        return document.querySelector('.tc-workbench-scope');
    }

    function setTcAiTableConvertLockEl(el, locked) {
        if (!el) return;
        if (locked) {
            if (!el.hasAttribute('data-tc-ai-convert-prev-disabled')) {
                el.setAttribute('data-tc-ai-convert-prev-disabled', el.disabled ? '1' : '0');
            }
            el.disabled = true;
            el.setAttribute('aria-disabled', 'true');
            el.classList.add('tc-ai-convert-lock-disabled');
        } else {
            var prev = el.getAttribute('data-tc-ai-convert-prev-disabled');
            if (prev !== null) {
                el.disabled = prev === '1';
                el.removeAttribute('data-tc-ai-convert-prev-disabled');
            } else {
                el.disabled = false;
            }
            el.removeAttribute('aria-disabled');
            el.classList.remove('tc-ai-convert-lock-disabled');
        }
    }

    function setTcAiTableConvertAiFabLock(locked) {
        var dock = document.getElementById('tc-left-float-dock');
        if (!dock) return;
        dock.classList.toggle('tc-ai-table-convert-ai-fab-lock', !!locked);
        dock.querySelectorAll('.tc-left-float-dock__mode').forEach(function (btn) {
            setTcAiTableConvertLockEl(btn, locked);
        });
    }

    function onTcAiTableConvertWorkbenchLockCapture(e) {
        if (!global.tcAiTableToMindmapConverting) return;
        var target = e.target;
        if (!target || !target.closest) return;
        var blocked = target.closest(
            '#tc-right-view-table-btn,' +
            '#tc-lanhu-tree-head-add-btn,' +
            '#tc-lanhu-tree-connect-btn,' +
            '[data-tc-lanhu-tree-connect],' +
            '.tc-lanhu-tree-node__row[data-tree-select],' +
            '.tc-lanhu-tree-node__refresh,' +
            '.tc-lanhu-tree-node__gen,' +
            '#tc-left-float-dock,' +
            '.tc-left-float-dock__mode[data-tc-float-open],' +
            '.tc-left-float-dock__mode[data-tc-float-drawer]'
        );
        if (!blocked) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
        }
    }

    function installTcAiTableConvertWorkbenchLockCapture() {
        if (tcAiTableConvertLockCaptureBound) return;
        tcAiTableConvertLockCaptureBound = true;
        document.addEventListener('click', onTcAiTableConvertWorkbenchLockCapture, true);
        document.addEventListener('pointerdown', onTcAiTableConvertWorkbenchLockCapture, true);
    }

    function beginTcAiTableConvertWorkbenchLock() {
        if (tcAiTableConvertWorkbenchLockActive) return;
        tcAiTableConvertWorkbenchLockActive = true;
        installTcAiTableConvertWorkbenchLockCapture();
        var scope = getTcAiTableConvertWorkbenchScope();
        if (scope) scope.classList.add('tc-ai-table-convert-workbench-lock');
        setTcAiTableConvertLockEl(document.getElementById('tc-right-view-table-btn'), true);
        setTcAiTableConvertLockEl(document.getElementById('tc-lanhu-tree-head-add-btn'), true);
        setTcAiTableConvertLockEl(document.getElementById('tc-lanhu-tree-connect-btn'), true);
        setTcAiTableConvertLockEl(document.querySelector('#tc-lanhu-tree-mount [data-tc-lanhu-tree-connect]'), true);
        setTcAiTableConvertAiFabLock(true);
    }

    function endTcAiTableConvertWorkbenchLock() {
        if (!tcAiTableConvertWorkbenchLockActive) return;
        tcAiTableConvertWorkbenchLockActive = false;
        var scope = getTcAiTableConvertWorkbenchScope();
        if (scope) scope.classList.remove('tc-ai-table-convert-workbench-lock');
        setTcAiTableConvertLockEl(document.getElementById('tc-right-view-table-btn'), false);
        setTcAiTableConvertLockEl(document.getElementById('tc-lanhu-tree-head-add-btn'), false);
        setTcAiTableConvertLockEl(document.getElementById('tc-lanhu-tree-connect-btn'), false);
        setTcAiTableConvertLockEl(document.querySelector('#tc-lanhu-tree-mount [data-tc-lanhu-tree-connect]'), false);
        setTcAiTableConvertAiFabLock(false);
    }

    var tcAiTableConvertAbortController = null;
    var tcAiTableConvertMindmapSnapshot = null;
    var tcAiTableConvertUserCancelled = false;
    var tcAiTableConvertCancelHandled = false;

    var tcAiTableConvertStreamRaf = null;
    var tcAiTableConvertThinkingRaf = null;
    var tcAiTableConvertStreamPinned = true;
    var tcAiTableConvertStreamScrollEl = null;
    var tcAiTableConvertStreamOnScroll = null;
    var TC_AI_TABLE_CONVERT_STREAM_BOTTOM_THRESHOLD = 28;

    var tcAiTableConvertLoadingDefaultHtml = null;

    function getTcAiTableConvertLoadingDefaultHtml() {
        if (tcAiTableConvertLoadingDefaultHtml) return tcAiTableConvertLoadingDefaultHtml;
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (!loadingEl) return '';
        tcAiTableConvertLoadingDefaultHtml = loadingEl.innerHTML;
        return tcAiTableConvertLoadingDefaultHtml;
    }

    function mountTcAiTableConvertLoadingChrome() {
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (!loadingEl) return;
        getTcAiTableConvertLoadingDefaultHtml();
        loadingEl.innerHTML =
            '<div class="tc-ai-convert-shell">' +
            '  <div class="tc-ai-convert-card" role="status">' +
            '    <div class="tc-ai-convert-card__head">' +
            '      <div class="tc-ai-convert-orbit" aria-hidden="true">' +
            '        <span class="tc-ai-convert-orbit__ring"></span>' +
            '        <span class="tc-ai-convert-orbit__dot"></span>' +
            '        <span class="tc-ai-convert-orbit__label">AI</span>' +
            '      </div>' +
            '      <div class="tc-ai-convert-card__copy">' +
            '        <p class="tc-ai-convert-card__title" data-tc-ai-convert-title>AI 正在转换思维导图</p>' +
            '        <p class="tc-ai-convert-card__sub" data-tc-ai-convert-sub>正在读取表格用例并调用 AI…</p>' +
            '      </div>' +
            '    </div>' +
            '    <div class="tc-ai-convert-card__track" aria-hidden="true">' +
            '      <span class="tc-ai-convert-card__track-fill"></span>' +
            '    </div>' +
            '    <div class="tc-ai-convert-card__stream" id="tc-ai-table-convert-stream-mount">' +
            '      <div class="tc-ai-table-convert-thinking__label">AI 思考过程</div>' +
            '      <pre class="tc-ai-table-convert-stream" id="tc-ai-table-convert-stream" aria-live="polite" aria-label="AI 思考过程">等待 AI 响应…</pre>' +
            '    </div>' +
            '    <div class="tc-ai-convert-card__actions">' +
            '      <button type="button" class="tc-ai-convert-cancel-btn" id="tc-ai-table-convert-cancel-btn">取消转换</button>' +
            '    </div>' +
            '  </div>' +
            '</div>';
    }


    function snapshotTcAiTableConvertMindmapState() {
        var cases = global.tcMindmapCasesData;
        var snapCases = Array.isArray(cases)
            ? cases.map(function (row) { return Array.isArray(row) ? row.slice() : row; })
            : [];
        var prov = global.tcMindmapCasesProvenance;
        return {
            cases: snapCases,
            provenance: Array.isArray(prov) ? prov.slice() : prov,
            external: global.tcMindmapExternalMindData,
            committed: global.tcMindmapCommittedExternalMind,
            rootTopic: global.tcMindmapRootTopic
        };
    }

    function restoreTcAiTableConvertMindmapSnapshot() {
        var snap = tcAiTableConvertMindmapSnapshot;
        if (!snap) return;
        global.tcMindmapCasesData = snap.cases.map(function (row) {
            return Array.isArray(row) ? row.slice() : row;
        });
        if (typeof global.tcMindmapCasesProvenance !== 'undefined') {
            global.tcMindmapCasesProvenance = Array.isArray(snap.provenance)
                ? snap.provenance.slice()
                : snap.provenance;
        }
        global.tcMindmapExternalMindData = snap.external;
        global.tcMindmapCommittedExternalMind = snap.committed;
        window.tcMindmapExternalMindData = snap.external;
        window.tcMindmapCommittedExternalMind = snap.committed;
        if (snap.rootTopic !== undefined && snap.rootTopic !== null) {
            global.tcMindmapRootTopic = snap.rootTopic;
        }
        scheduleTcMindmapRenderAfterAiConvert();
    }

    function clearTcAiTableConvertMindmapSnapshot() {
        tcAiTableConvertMindmapSnapshot = null;
    }

    function isTcAiTableConvertCancelledError(err) {
        if (tcAiTableConvertUserCancelled) return true;
        if (!err) return false;
        if (err.name === 'TcAiTableConvertCancelledError' || err.name === 'AbortError') return true;
        var msg = String(err.message || '');
        return /aborted|已取消转换|cancelled/i.test(msg);
    }

    function finishTcAiTableConvertUserCancel() {
        if (tcAiTableConvertCancelHandled) return;
        tcAiTableConvertCancelHandled = true;
        restoreTcAiTableConvertMindmapSnapshot();
        clearTcAiTableConvertMindmapSnapshot();
        endTcAiTableConvertMindmapUi();
        tcAiTableToMindmapConverting = false;
        global.tcAiTableToMindmapConverting = false;
        global._tcAiTableConvertSucceededOnMindmap = false;
        endTcAiTableConvertWorkbenchLock();
        resetTcAiTableConvertAbortState();
        if (typeof global.endTcExportExcelLoading === 'function') {
            global.endTcExportExcelLoading();
        }
        if (typeof global.syncTcExportFabSheetItemsChrome === 'function') {
            global.syncTcExportFabSheetItemsChrome();
        }
        if (typeof global.switchTcRightView === 'function') {
            global.switchTcRightView('table');
        }
    }

    function performTcAiTableConvertCancel() {
        if (!global.tcAiTableToMindmapConverting) return;
        tcAiTableConvertUserCancelled = true;
        if (tcAiTableConvertAbortController) {
            try { tcAiTableConvertAbortController.abort(); } catch (abortErr) { /* ignore */ }
        }
        updateTcAiTableConvertLoadingCopy('正在取消转换…', '已通知服务端停止生成');
        setTcAiTableConvertLockEl(document.getElementById('tc-ai-table-convert-cancel-btn'), true);
    }

    function bindTcAiTableConvertCancelButton() {
        var btn = document.getElementById('tc-ai-table-convert-cancel-btn');
        if (!btn || btn._tcAiTableConvertCancelBound) return;
        btn._tcAiTableConvertCancelBound = true;
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            cancelTcAiTableConvert();
        });
    }

    function cancelTcAiTableConvert() {
        if (!global.tcAiTableToMindmapConverting) return;
        if (typeof global.tcAppConfirm === 'function') {
            global.tcAppConfirm('确定要取消当前 AI 转导图吗？取消后将返回表格用例视图。', {
                title: '取消转换',
                confirmText: '确定取消',
                cancelText: '继续转换',
                variant: 'warning'
            }).then(function (ok) {
                if (ok) performTcAiTableConvertCancel();
            });
            return;
        }
        if (typeof global.confirm === 'function' && !global.confirm('确定要取消当前 AI 转导图吗？')) {
            return;
        }
        performTcAiTableConvertCancel();
    }

    function resetTcAiTableConvertAbortState() {
        tcAiTableConvertAbortController = null;
        tcAiTableConvertUserCancelled = false;
    }

    function restoreTcAiTableConvertLoadingChrome() {
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (!loadingEl) return;
        var html = getTcAiTableConvertLoadingDefaultHtml();
        if (html) loadingEl.innerHTML = html;
    }


    function parseAiTableConvertSseBlock(block) {
        var lines = String(block || '').split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('data:') !== 0) continue;
            try {
                return JSON.parse(line.slice(5).trim());
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    function consumeAiTableToMindmapStream(res, handlers) {
        handlers = handlers || {};
        if (!res.body || typeof res.body.getReader !== 'function') {
            return Promise.reject(new Error('浏览器不支持流式响应'));
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';
        var finalData = null;
        function pump() {
            return reader.read().then(function (chunk) {
                if (chunk.done) {
                    if (finalData) return finalData;
                    throw new Error('AI 转换流中断');
                }
                buf += decoder.decode(chunk.value, { stream: true });
                var parts = buf.split('\n\n');
                buf = parts.pop() || '';
                parts.forEach(function (block) {
                    var ev = parseAiTableConvertSseBlock(block);
                    if (!ev || !ev.type) return;
                    if (ev.type === 'reasoning' && ev.content && typeof handlers.onReasoning === 'function') {
                        handlers.onReasoning(String(ev.content), ev);
                    } else if (ev.type === 'content' && ev.content && typeof handlers.onContent === 'function') {
                        handlers.onContent(String(ev.content), ev);
                    } else if (ev.type === 'ai_quota' && ev.ai_quota &&
                        typeof global.hfAiQuotaNotify === 'function') {
                        global.hfAiQuotaNotify(ev.ai_quota);
                    } else if (ev.type === 'done') {
                        finalData = ev;
                    } else if (ev.type === 'cancelled') {
                        var cancelErr = new Error(ev.error || '已取消转换');
                        cancelErr.name = 'TcAiTableConvertCancelledError';
                        throw cancelErr;
                    } else if (ev.type === 'error') {
                        var streamErr = ev.error || 'AI 转换失败';
                        if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(streamErr)) {
                            throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                        }
                        throw new Error(streamErr);
                    }
                });
                return pump();
            }).catch(function (readErr) {
                if (tcAiTableConvertUserCancelled || (readErr && readErr.name === 'AbortError')) {
                    var abortedErr = new Error('已取消转换');
                    abortedErr.name = 'TcAiTableConvertCancelledError';
                    throw abortedErr;
                }
                throw readErr;
            });
        }
        return pump();
    }

    function fetchAiTableToMindmapStreamApi(columns, rows, rootTopic) {
        resetTcAiTableConvertAbortState();
        tcAiTableConvertAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var fetchOpts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                columns: columns,
                rows: rows,
                root_topic: rootTopic || '测试用例',
                use_builtin: true
            })
        };
        if (tcAiTableConvertAbortController) {
            fetchOpts.signal = tcAiTableConvertAbortController.signal;
        }
        return fetch('/api/test-cases/ai-table-to-mindmap/stream', fetchOpts).then(function (resp) {
            if (!resp.ok) {
                return resp.json().then(function (data) {
                    if (typeof globalThis.hfAiQuotaFromErrorBody === 'function' && globalThis.hfAiQuotaFromErrorBody(data)) {
                        throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                    }
                    var errText = (data && data.error) || ('HTTP ' + resp.status);
                    if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(errText)) {
                        throw new Error(globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__');
                    }
                    throw new Error(errText);
                }).catch(function (parseErr) {
                    if (parseErr && parseErr.message === (globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__')) {
                        throw parseErr;
                    }
                    if (parseErr && parseErr.message && parseErr.message.indexOf('HTTP') === 0) {
                        throw parseErr;
                    }
                    throw new Error('HTTP ' + resp.status);
                });
            }
            return consumeAiTableToMindmapStream(resp, {
                onReasoning: function (text) {
                    updateTcAiTableConvertThinkingPreview(text);
                },
                onContent: function (text) {
                    updateTcAiTableConvertStreamPreview(text);
                }
            });
        }).catch(function (fetchErr) {
            if (isTcAiTableConvertCancelledError(fetchErr)) {
                var cancelledErr = new Error('已取消转换');
                cancelledErr.name = 'TcAiTableConvertCancelledError';
                throw cancelledErr;
            }
            throw fetchErr;
        });
    }

    function updateTcAiTableConvertLoadingCopy(title, sub) {
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (!loadingEl) return;
        var titleEl = loadingEl.querySelector('[data-tc-ai-convert-title]');
        var subEl = loadingEl.querySelector('[data-tc-ai-convert-sub]');
        if (!titleEl || !subEl) {
            var wrap = loadingEl.querySelector('.ds-loading-inline');
            if (!wrap) return;
            titleEl = wrap.querySelector('.font-medium');
            subEl = wrap.querySelector('.text-sm');
        }
        if (titleEl && title) titleEl.textContent = title;
        if (subEl && sub) subEl.textContent = sub;
    }


    function tcAiTableConvertStreamIsNearBottom(pre) {
        if (!pre) return true;
        return (pre.scrollHeight - pre.scrollTop - pre.clientHeight) <= TC_AI_TABLE_CONVERT_STREAM_BOTTOM_THRESHOLD;
    }

    function hideTcAiTableConvertStreamJumpBtn() {
        var btn = document.getElementById('tc-ai-table-convert-stream-jump');
        if (btn) btn.classList.add('hidden');
    }

    function showTcAiTableConvertStreamJumpBtn() {
        var btn = document.getElementById('tc-ai-table-convert-stream-jump');
        if (btn) btn.classList.remove('hidden');
    }

    function ensureTcAiTableConvertStreamJumpBtn(mount) {
        var btn = document.getElementById('tc-ai-table-convert-stream-jump');
        if (btn) return btn;
        if (!mount) return null;
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'tc-ai-table-convert-stream-jump';
        btn.className = 'tc-ai-table-convert-stream-jump hidden';
        btn.setAttribute('aria-label', '回到思考过程底部');
        btn.textContent = '↓ 回到最新';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var pre = document.getElementById('tc-ai-table-convert-stream');
            if (!pre) return;
            tcAiTableConvertStreamPinned = true;
            if (typeof pre.scrollTo === 'function') {
                pre.scrollTo({ top: pre.scrollHeight, behavior: 'smooth' });
            } else {
                pre.scrollTop = pre.scrollHeight;
            }
            hideTcAiTableConvertStreamJumpBtn();
        });
        mount.appendChild(btn);
        return btn;
    }

    function unbindTcAiTableConvertStreamScrollBehavior() {
        if (tcAiTableConvertStreamScrollEl && tcAiTableConvertStreamOnScroll) {
            tcAiTableConvertStreamScrollEl.removeEventListener('scroll', tcAiTableConvertStreamOnScroll);
        }
        tcAiTableConvertStreamScrollEl = null;
        tcAiTableConvertStreamOnScroll = null;
        tcAiTableConvertStreamPinned = true;
        hideTcAiTableConvertStreamJumpBtn();
    }

    function bindTcAiTableConvertStreamScrollBehavior(pre) {
        if (!pre) return;
        unbindTcAiTableConvertStreamScrollBehavior();
        tcAiTableConvertStreamScrollEl = pre;
        tcAiTableConvertStreamPinned = true;
        var mount = pre.parentElement;
        ensureTcAiTableConvertStreamJumpBtn(mount);
        tcAiTableConvertStreamOnScroll = function () {
            tcAiTableConvertStreamPinned = tcAiTableConvertStreamIsNearBottom(pre);
            if (tcAiTableConvertStreamPinned) {
                hideTcAiTableConvertStreamJumpBtn();
            }
        };
        pre.addEventListener('scroll', tcAiTableConvertStreamOnScroll, { passive: true });
    }

    function tcAiTableConvertStreamScrollToBottomIfPinned(pre) {
        if (!pre) return;
        if (tcAiTableConvertStreamPinned) {
            pre.scrollTop = pre.scrollHeight;
            hideTcAiTableConvertStreamJumpBtn();
        } else {
            showTcAiTableConvertStreamJumpBtn();
        }
    }

    function ensureTcAiTableConvertStreamPre() {
        var pre = document.getElementById('tc-ai-table-convert-stream');
        if (pre) {
            if (!tcAiTableConvertStreamScrollEl || tcAiTableConvertStreamScrollEl !== pre) {
                bindTcAiTableConvertStreamScrollBehavior(pre);
            }
            return pre;
        }
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (!loadingEl) return null;
        var mount = document.getElementById('tc-ai-table-convert-stream-mount');
        if (!mount) return null;
        pre = document.createElement('pre');
        pre.id = 'tc-ai-table-convert-stream';
        pre.className = 'tc-ai-table-convert-stream';
        pre.setAttribute('aria-live', 'polite');
        pre.setAttribute('aria-label', 'AI 思考过程');
        pre.textContent = '等待 AI 响应…';
        mount.appendChild(pre);
        bindTcAiTableConvertStreamScrollBehavior(pre);
        return pre;
    }

    function updateTcAiTableConvertThinkingPreview(text) {
        if (tcAiTableConvertThinkingRaf) return;
        tcAiTableConvertThinkingRaf = global.requestAnimationFrame(function () {
            tcAiTableConvertThinkingRaf = null;
            var pre = ensureTcAiTableConvertStreamPre();
            if (!pre) return;
            pre.classList.add('tc-ai-table-convert-stream--thinking');
            pre.textContent = String(text || '');
            tcAiTableConvertStreamScrollToBottomIfPinned(pre);
            updateTcAiTableConvertLoadingCopy('AI 正在转换思维导图', 'AI 正在思考…');
        });
    }

    function updateTcAiTableConvertStreamPreview(text) {
        if (tcAiTableConvertStreamRaf) return;
        tcAiTableConvertStreamRaf = global.requestAnimationFrame(function () {
            tcAiTableConvertStreamRaf = null;
            var pre = ensureTcAiTableConvertStreamPre();
            if (!pre) return;
            pre.classList.remove('tc-ai-table-convert-stream--thinking');
            pre.textContent = String(text || '');
            tcAiTableConvertStreamScrollToBottomIfPinned(pre);
            updateTcAiTableConvertLoadingCopy('AI 正在转换思维导图', '正在流式生成导图结构…');
        });
    }

    function beginTcAiTableConvertMindmapUi() {
        installTcAiTableConvertViewGuard();
        global.tcMindmapSkipCacheRestore = true;
        global.tcMindmapExternalMindData = null;
        global.tcMindmapCommittedExternalMind = null;
        window.tcMindmapExternalMindData = null;
        window.tcMindmapCommittedExternalMind = null;
        if (typeof showTcMindmapGenerating === 'function') {
            showTcMindmapGenerating();
        } else {
            global.tcMindmapGenerating = true;
            if (typeof global.switchTcRightView === 'function') {
                global.switchTcRightView('mindmap');
            }
            if (typeof showTcMindmapGeneratingUi === 'function') {
                showTcMindmapGeneratingUi();
            }
        }
        mountTcAiTableConvertLoadingChrome();
        bindTcAiTableConvertCancelButton();
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (loadingEl) {
            loadingEl.classList.add('tc-ai-table-convert-loading');
        }
        var streamPre = ensureTcAiTableConvertStreamPre();
        if (streamPre) bindTcAiTableConvertStreamScrollBehavior(streamPre);
        updateTcAiTableConvertLoadingCopy('AI 正在转换思维导图', '正在读取表格用例并调用 AI…');
    }

    function endTcAiTableConvertMindmapUi() {
        var loadingEl = document.getElementById('tc-mindmap-loading');
        if (loadingEl) {
            loadingEl.classList.remove('tc-ai-table-convert-loading');
        }
        unbindTcAiTableConvertStreamScrollBehavior();
        var jumpBtn = document.getElementById('tc-ai-table-convert-stream-jump');
        if (jumpBtn) jumpBtn.remove();
        var pre = document.getElementById('tc-ai-table-convert-stream');
        if (pre) pre.remove();
        restoreTcAiTableConvertLoadingChrome();
        if (typeof hideTcMindmapGenerating === 'function') {
            hideTcMindmapGenerating();
        } else {
            global.tcMindmapGenerating = false;
        }
    }

    function applyAiTableToMindmapText(mindmapText) {
        var text = String(mindmapText || '').trim();
        if (!text) {
            throw new Error('AI 未返回有效的思维导图文本');
        }
        if (typeof global.ensureTcMindmapGenerateColumns === 'function') {
            global.ensureTcMindmapGenerateColumns();
        }
        global.tcMindmapCasesData = [];
        var added = 0;
        if (typeof global.parseMindmapElementClassificationResult === 'function') {
            added = global.parseMindmapElementClassificationResult(text, false);
        }
        if (!added) {
            throw new Error('未能从 AI 返回中解析到 TC: 用例行，请检查 AI 配置或重试');
        }
        var mind = null;
        if (typeof global.buildTcMindmapMindData === 'function') {
            mind = global.buildTcMindmapMindData();
        }
        if (!mind || !mind.data) {
            throw new Error('思维导图渲染数据构建失败');
        }
        global.tcMindmapExternalMindData = mind;
        global.tcMindmapCommittedExternalMind = mind;
        global.tcMindmapCachedMindPayload = null;
        global.tcMindmapSkipCacheRestore = true;
        if (typeof global.tcMindmapReleaseInstance === 'function') {
            global.tcMindmapReleaseInstance();
        }
        global.tcMindmapRootTopic = String(mind.data.topic || '测试用例');
        global.tcMindmapUndoStack = [];
        global.tcMindmapHistory = [];
        global.tcMindmapHistoryIndex = -1;
        global.tcMindmapUndoBaseline = null;
        global.tcMindmapMetaById = {};
        global.tcMindmapPendingFitFocus = true;
        if (typeof global.tcSyncWorkbenchGlobals === 'function') {
            global.tcSyncWorkbenchGlobals();
        }
        endTcAiTableConvertMindmapUi();
        clearTcAiTableConvertMindmapSnapshot();
        if (typeof global.switchTcRightView === 'function') {
            global.switchTcRightView('mindmap');
        }
        scheduleTcMindmapRenderAfterAiConvert();
        global._tcAiTableConvertSucceededOnMindmap = true;
        if (typeof global.tcMindmapPersistCache === 'function') {
            global.setTimeout(function () {
                global.tcMindmapPersistCache();
            }, 500);
        }
        if (typeof global.TcRequirementMindmapStore !== 'undefined' &&
            typeof global.TcRequirementMindmapStore.persistAfterAiConvert === 'function') {
            global.setTimeout(function () {
                global.TcRequirementMindmapStore.persistAfterAiConvert();
            }, 650);
        }
        return added;
    }

    function prepareMindmapForAiTableConvert(choice) {
        if (choice === 'append') return;
        global.tcMindmapCasesData = [];
        if (typeof global.tcMindmapCasesProvenance !== 'undefined') {
            global.tcMindmapCasesProvenance = [];
        }
        global.tcMindmapExternalMindData = null;
        global.tcMindmapCommittedExternalMind = null;
        window.tcMindmapExternalMindData = null;
        window.tcMindmapCommittedExternalMind = null;
    }


    var tcAiMindmapConfirmResolve = null;

    function initTcAiMindmapConfirmModalUi() {
        if (global._tcAiMindmapConfirmModalInited) return;
        global._tcAiMindmapConfirmModalInited = true;
        var modal = document.getElementById('tc-ai-mindmap-confirm-modal');
        var closeBtn = document.getElementById('tc-ai-mindmap-confirm-close');
        var cancelBtn = document.getElementById('tc-ai-mindmap-confirm-cancel');
        var submitBtn = document.getElementById('tc-ai-mindmap-confirm-submit');
        if (closeBtn) closeBtn.addEventListener('click', function () { closeTcAiMindmapConfirmModal('cancel'); });
        if (cancelBtn) cancelBtn.addEventListener('click', function () { closeTcAiMindmapConfirmModal('cancel'); });
        if (submitBtn) submitBtn.addEventListener('click', function () { closeTcAiMindmapConfirmModal('confirm'); });
        var backdrop = modal && modal.querySelector('.tc-ai-mindmap-confirm-modal__backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', function () { closeTcAiMindmapConfirmModal('cancel'); });
        }
    }

    function openTcAiMindmapConfirmModal() {
        initTcAiMindmapConfirmModalUi();
        var modal = document.getElementById('tc-ai-mindmap-confirm-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeTcAiMindmapConfirmModal(choice) {
        var modal = document.getElementById('tc-ai-mindmap-confirm-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.setAttribute('aria-hidden', 'true');
        }
        if (typeof tcAiMindmapConfirmResolve === 'function') {
            var resolve = tcAiMindmapConfirmResolve;
            tcAiMindmapConfirmResolve = null;
            resolve(choice || 'cancel');
        }
    }

    function askTcAiMindmapConvertConfirm() {
        return new Promise(function (resolve) {
            tcAiMindmapConfirmResolve = resolve;
            openTcAiMindmapConfirmModal();
        });
    }

    function runConvertTableToMindmapViaAiForCurrentPage() {
        if (typeof global.closeTcTableFabSheet === 'function') {
            global.closeTcTableFabSheet();
        }
        if (typeof global.ensureTcTableTemplateApplied === 'function' &&
            !global.ensureTcTableTemplateApplied()) {
            return;
        }
        if (tcAiTableToMindmapConverting) return;

        var btn = document.getElementById('export-excel-btn');
        var started = typeof global.beginTcExportExcelLoading === 'function'
            ? global.beginTcExportExcelLoading()
            : true;
        if (!started) return;

        if (btn) {
            var spans = btn.querySelectorAll('span');
            var labelSpan = spans.length > 1 ? spans[spans.length - 1] : null;
            if (labelSpan) labelSpan.textContent = 'AI转换中…';
        }

        var pull = (global.TcTableView && typeof global.TcTableView.pullRows === 'function')
            ? global.TcTableView.pullRows()
            : Promise.resolve(true);

        pull.then(function () {
            var rows = typeof global.collectTableRowsForMindmapConvert === 'function'
                ? global.collectTableRowsForMindmapConvert()
                : [];
            if (!rows.length) {
                throw new Error('表格中还没有有效用例。请确保至少一行包含「用例名称」。');
            }
            return Promise.resolve().then(function () {
                if (typeof global.tcMindmapHasCaseData !== 'function' || !global.tcMindmapHasCaseData()) {
                    return 'overwrite';
                }
                return global.askTcViewConvertChoice({
                    title: '思维导图已有数据',
                    message: '当前思维导图中已有用例。覆盖将替换全部导图内容；追加会把现有用例与表格用例合并后重新生成；取消则不执行 AI 转换。'
                });
            }).then(function (choice) {
                if (choice === 'cancel') return null;
                var apiRows = rows;
                if (choice === 'append') {
                    var existing = [];
                    var nameCol = typeof global.resolveTcCaseNameColumnIndex === 'function'
                        ? global.resolveTcCaseNameColumnIndex()
                        : 0;
                    (global.tcMindmapCasesData || []).forEach(function (row) {
                        if (!row) return;
                        var copy = global.tableColumns.map(function (_, idx) {
                            return row[idx] !== undefined && row[idx] !== null ? String(row[idx]) : '';
                        });
                        if (!String(copy[nameCol] || '').trim()) return;
                        existing.push(copy);
                    });
                    apiRows = existing.concat(rows);
                }
                tcAiTableConvertMindmapSnapshot = snapshotTcAiTableConvertMindmapState();
                prepareMindmapForAiTableConvert(choice);
                beginTcAiTableConvertMindmapUi();
                tcAiTableToMindmapConverting = true;
                global.tcAiTableToMindmapConverting = true;
                installTcAiTableConvertViewGuard();
                beginTcAiTableConvertWorkbenchLock();
                if (btn) btn.disabled = true;
                return fetchAiTableToMindmapStreamApi(global.tableColumns, apiRows, '测试用例').then(function (data) {
                    var count = applyAiTableToMindmapText(data.mindmap_text);
                    var tcLines = (data.stats && data.stats.tc_lines) || count;
                    var msg = choice === 'append'
                        ? ('AI 已追加转换思维导图，共 ' + tcLines + ' 条用例。')
                        : ('AI 已转换思维导图，共 ' + tcLines + ' 条用例。');
                    if (typeof global.tcAppToast === 'function') {
                        global.tcAppToast(msg, { variant: 'success', duration: 3200 });
                    }
                    return count;
                });
            });
        }).catch(function (err) {
            if (isTcAiTableConvertCancelledError(err)) {
                finishTcAiTableConvertUserCancel();
                return;
            }
            endTcAiTableConvertMindmapUi();
            var convertErrMsg = err && err.message ? err.message : '';
            if (convertErrMsg === (globalThis.HF_AI_QUOTA_HANDLED || '__HF_AI_QUOTA_HANDLED__')) return;
            if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(convertErrMsg)) return;
            if (convertErrMsg && typeof global.tcAppAlert === 'function') {
                global.tcAppAlert(convertErrMsg, { variant: 'error', title: 'AI转换失败' });
            }
        }).finally(function () {
            if (tcAiTableConvertCancelHandled) {
                tcAiTableConvertCancelHandled = false;
                return;
            }
            var stayMindmap = !!global._tcAiTableConvertSucceededOnMindmap;
            if (typeof global.endTcExportExcelLoading === 'function') {
                global.endTcExportExcelLoading();
            }
            if (typeof global.syncTcExportFabSheetItemsChrome === 'function') {
                global.syncTcExportFabSheetItemsChrome();
            }
            if (stayMindmap && typeof global.switchTcRightView === 'function') {
                global.switchTcRightView('mindmap');
                scheduleTcMindmapRenderAfterAiConvert();
            }
            endTcAiTableConvertWorkbenchLock();
            resetTcAiTableConvertAbortState();
            clearTcAiTableConvertMindmapSnapshot();
            tcAiTableToMindmapConverting = false;
            global.tcAiTableToMindmapConverting = false;
            global._tcAiTableConvertSucceededOnMindmap = false;
        });
    }



    function convertTableToMindmapViaAi() {
        if (typeof global.closeTcTableFabSheet === 'function') {
            global.closeTcTableFabSheet();
        }
        if (typeof global.ensureTcTableTemplateApplied === 'function' &&
            !global.ensureTcTableTemplateApplied()) {
            return;
        }
        if (tcAiTableToMindmapConverting) return;

        askTcAiMindmapConvertConfirm().then(function (choice) {
            if (choice === 'confirm') {
                runConvertTableToMindmapViaAiForCurrentPage();
            }
        });
    }


    installTcAiTableConvertViewGuard();
    if (typeof global.addEventListener === 'function') {
        global.addEventListener('DOMContentLoaded', installTcAiTableConvertViewGuard);
    }
    global.tcAiTableToMindmapConverting = false;
    global.convertTableToMindmapViaAi = convertTableToMindmapViaAi;
})(typeof window !== 'undefined' ? window : globalThis);

