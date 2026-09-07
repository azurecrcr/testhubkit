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
