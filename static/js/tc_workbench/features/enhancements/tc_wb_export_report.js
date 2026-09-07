/* ---------- 导出报告 ---------- */

var lastExportReport = null;

function normalizeExportProfileKey(raw) {
    var key = String(raw != null ? raw : '').trim();
    if (!key) return 'metersphere';
    if (key.charAt(0) === '{') {
        try {
            var obj = JSON.parse(key);
            if (obj && obj.templateId) return String(obj.templateId);
        } catch (e0) { /* ignore */ }
    }
    return key;
}

function getExportProfileDisplayName(profileKey) {
    var key = normalizeExportProfileKey(profileKey);
    var templates = (typeof global.TC_CASE_TEMPLATES !== 'undefined' && global.TC_CASE_TEMPLATES) ? global.TC_CASE_TEMPLATES : [];
    for (var i = 0; i < templates.length; i++) {
        if (String(templates[i].id) === key) return String(templates[i].name || key);
    }
    var fallback = {
        current: '当前表格',
        metersphere: 'MeterSphere',
        zentao: '禅道',
        jira: 'Jira / Xray',
        testrail: 'TestRail',
        excel: 'Excel 通用'
    };
    return fallback[key] || key;
}

function formatExportReportSubtitle(report) {
    if (!report) return '';
    var parts = ['模板：' + getExportProfileDisplayName(report.profile)];
    if (report.exported_at) parts.push('导出时间：' + String(report.exported_at).replace('T', ' '));
    return parts.join(' · ');
}

function columnsMatchTemplateColumns(columns, templateColumns) {
    var cols = columns || [];
    var tc = templateColumns || [];
    if (!tc.length || tc.length !== cols.length) return false;
    for (var i = 0; i < tc.length; i++) {
        if (String(cols[i]) !== String(tc[i])) return false;
    }
    return true;
}

function getActiveExportProfileKey() {
    var cols = getTableColumns();
    var templates = (typeof global.TC_CASE_TEMPLATES !== 'undefined' && global.TC_CASE_TEMPLATES) ? global.TC_CASE_TEMPLATES : [];
    if (cols.length && templates.length) {
        for (var i = 0; i < templates.length; i++) {
            if (columnsMatchTemplateColumns(cols, templates[i].columns || [])) {
                return String(templates[i].id);
            }
        }
    }
    return 'current';
}

function buildExportReportSummaryText(report) {
    if (!report) return '';
    return [
        '导出 ' + (report.exported_rows || 0) + ' 条',
        '跳过 ' + (report.skipped_count != null ? report.skipped_count : (report.skipped || []).length) + ' 条',
        '重复 ' + (report.duplicate_count != null ? report.duplicate_count : (report.duplicates || []).length) + ' 条',
        '模板：' + getExportProfileDisplayName(report.profile),
        '导出时间：' + String(report.exported_at || '').replace('T', ' ')
    ].join('\n');
}


function ensureExportReportModalMounted() {
    if (typeof global.ensureTcWorkbenchOverlaysMounted === 'function') {
        global.ensureTcWorkbenchOverlaysMounted();
    }
    var modal = $('tc-export-report-modal');
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    return modal;
}

function renderExportReportModal(report) {
    var modal = ensureExportReportModalMounted();
    var subtitle = $('tc-export-report-subtitle');
    var summary = $('tc-export-report-summary');
    var tableWrap = $('tc-export-report-table-wrap');
    if (!modal || !summary || !tableWrap) return;
    var skipped = report.skipped || [];
    var duplicates = report.duplicates || [];
    if (subtitle) {
        subtitle.textContent = formatExportReportSubtitle(report);
    }
    summary.innerHTML =
        '<div class="tc-export-report-stats">' +
        '<div class="tc-export-report-stat"><div class="tc-export-report-stat__label">总行数</div><div class="tc-export-report-stat__value">' + esc(report.total_rows || 0) + '</div></div>' +
        '<div class="tc-export-report-stat"><div class="tc-export-report-stat__label">已导出</div><div class="tc-export-report-stat__value">' + esc(report.exported_rows || 0) + '</div></div>' +
        '<div class="tc-export-report-stat"><div class="tc-export-report-stat__label">跳过</div><div class="tc-export-report-stat__value">' + esc(report.skipped_count != null ? report.skipped_count : skipped.length) + '</div></div>' +
        '<div class="tc-export-report-stat"><div class="tc-export-report-stat__label">重复</div><div class="tc-export-report-stat__value">' + esc(report.duplicate_count != null ? report.duplicate_count : duplicates.length) + '</div></div>' +
        '</div>';

    function renderIssueTable(title, items) {
        if (!items.length) {
            return '<div class="tc-export-report-section"><div class="tc-export-report-section__title">' + esc(title) + '</div><div class="tc-export-report-empty">无</div></div>';
        }
        var rows = items.map(function(item) {
            return '<tr><td>' + esc((item.row_index != null ? item.row_index + 1 : '')) + '</td><td>' + esc(item.reason || '') + '</td></tr>';
        }).join('');
        return '<div class="tc-export-report-section"><div class="tc-export-report-section__title">' + esc(title) + '</div><table class="tc-export-report-table"><thead><tr><th>行号</th><th>原因</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    tableWrap.innerHTML = renderIssueTable('跳过明细', skipped) + renderIssueTable('重复明细', duplicates);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
}

function closeExportReportModal() {
    var modal = $('tc-export-report-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (!document.querySelector('#tc-export-report-modal.flex')) {
        document.body.style.overflow = '';
    }
}

function openExportReportModal(report) {
    lastExportReport = report;
    renderExportReportModal(report);
}

function copyExportReportSummary(report) {
    report = report || lastExportReport;
    if (!report) return Promise.resolve(false);
    var text = buildExportReportSummaryText(report);
    if (typeof global.tcAppDialogCopyToClipboard === 'function') {
        return global.tcAppDialogCopyToClipboard(text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('copy unsupported'));
}

function showExportReportToast(report) {
    var wrap = document.getElementById('hf-float-toast');
    if (!wrap) {
        toast('已导出 ' + (report.exported_rows || 0) + ' 条', { variant: 'success', duration: 4200 });
        return;
    }
    if (wrap.parentElement !== document.body) document.body.appendChild(wrap);
    var inner = document.getElementById('hf-float-toast-inner');
    if (!inner) return;
    if (wrap._tcExportToastHideTimer) {
        clearTimeout(wrap._tcExportToastHideTimer);
        wrap._tcExportToastHideTimer = null;
    }
    wrap.classList.remove('hf-float-toast--top', 'hf-float-toast--bottom', 'hf-float-toast--visible', 'hf-float-toast--interactive');
    wrap.classList.add('hf-float-toast--bottom', 'hf-float-toast--interactive');
    wrap.style.pointerEvents = 'auto';
    inner.className = 'hf-float-toast__inner hf-float-toast__inner--success';
    inner.innerHTML = '已导出 ' + esc(report.exported_rows || 0) + ' 条' +
        '<button type="button" class="tc-export-report-toast-link">查看导出报告</button>';
    if (!wrap._tcExportToastClickBound) {
        wrap._tcExportToastClickBound = true;
        wrap.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('.tc-export-report-toast-link') : null;
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            if (wrap._tcExportToastHideTimer) {
                clearTimeout(wrap._tcExportToastHideTimer);
                wrap._tcExportToastHideTimer = null;
            }
            wrap.classList.remove('hf-float-toast--visible', 'hf-float-toast--interactive');
            wrap.style.pointerEvents = '';
            openExportReportModal(lastExportReport || report);
        });
    }
    wrap.classList.add('hf-float-toast--visible');
    wrap._tcExportToastHideTimer = setTimeout(function () {
        wrap.classList.remove('hf-float-toast--visible', 'hf-float-toast--interactive');
        wrap.style.pointerEvents = '';
        wrap._tcExportToastHideTimer = null;
    }, 8000);
}

var TC_XLSX_VENDOR_URL = '/static/vendor/xlsx.full.min.js?v=0.18.5';
var tcXlsxScriptPromise = null;

function ensureTcXlsxLoaded() {
    if (typeof global.XLSX !== 'undefined') {
        return Promise.resolve();
    }
    if (tcXlsxScriptPromise) {
        return tcXlsxScriptPromise;
    }
    tcXlsxScriptPromise = new Promise(function(resolve, reject) {
        var pending = document.querySelector('script[data-tc-xlsx="1"]');
        if (pending) {
            pending.addEventListener('load', function() {
                if (typeof global.XLSX !== 'undefined') resolve();
                else reject(new Error('XLSX 组件未加载'));
            });
            pending.addEventListener('error', function() {
                reject(new Error('无法加载 XLSX 组件'));
            });
            return;
        }
        var script = document.createElement('script');
        script.src = TC_XLSX_VENDOR_URL;
        script.async = true;
        script.defer = true;
        script.setAttribute('data-tc-xlsx', '1');
        script.onload = function() {
            if (typeof global.XLSX !== 'undefined') {
                resolve();
                return;
            }
            tcXlsxScriptPromise = null;
            reject(new Error('XLSX 组件未加载'));
        };
        script.onerror = function() {
            tcXlsxScriptPromise = null;
            reject(new Error('无法加载 XLSX 组件（请确认已部署 static/vendor/xlsx.full.min.js）'));
        };
        document.head.appendChild(script);
    });
    return tcXlsxScriptPromise;
}

function downloadExportXlsx(columns, rows) {
    if (typeof global.XLSX === 'undefined') {
        throw new Error('XLSX 组件未加载');
    }
    var aoa = [columns.slice()].concat((rows || []).map(function(row) {
        return (row || []).map(function(cell) {
            if (cell === null || cell === undefined) return '';
            return String(cell);
        });
    }));
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, '测试用例');
    var wbout = global.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '测试用例_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadExportSpreadsheet(columns, rows) {
    return ensureTcXlsxLoaded().then(function() {
        downloadExportXlsx(columns, rows);
    });
}



var TC_PROVENANCE_COLUMN_BY_PROFILE = {
    metersphere: ['备注'],
    zentao: ['相关需求'],
    jira: ['关联需求'],
    testrail: ['引用'],
    excel: ['备用', '备注']
};
var TC_PROVENANCE_COLUMN_AUTO_DETECT = ['相关需求', '关联需求', '引用', '备用', '备注'];
var tcExportProvenanceChoiceResolve = null;

function findExportColumnIndex(columns, name) {
    var target = String(name || '').trim().toLowerCase();
    for (var i = 0; i < columns.length; i++) {
        if (String(columns[i] || '').trim().toLowerCase() === target) return i;
    }
    return null;
}

function provenanceArrayHasSources(provenance) {
    if (typeof global.tcProvenanceArrayHasSources === 'function') {
        return global.tcProvenanceArrayHasSources(provenance);
    }
    if (!Array.isArray(provenance)) return false;
    for (var i = 0; i < provenance.length; i++) {
        var p = provenance[i];
        if (p && p.sources && p.sources.length) return true;
    }
    return false;
}

function resolveProvenanceExportColumnIndex(profileKey, profileColumns) {
    var key = normalizeExportProfileKey(profileKey);
    if (key === 'current' && typeof global.tcActiveTemplateId !== 'undefined' && global.tcActiveTemplateId) {
        key = String(global.tcActiveTemplateId);
    }
    var prefs = TC_PROVENANCE_COLUMN_BY_PROFILE[key] || TC_PROVENANCE_COLUMN_BY_PROFILE.metersphere;
    var pi;
    for (pi = 0; pi < prefs.length; pi++) {
        var idx = findExportColumnIndex(profileColumns, prefs[pi]);
        if (idx != null) return idx;
    }
    for (pi = 0; pi < TC_PROVENANCE_COLUMN_AUTO_DETECT.length; pi++) {
        var idx2 = findExportColumnIndex(profileColumns, TC_PROVENANCE_COLUMN_AUTO_DETECT[pi]);
        if (idx2 != null) return idx2;
    }
    return null;
}


function tcExportFormatProvenanceTextForExcel(entry) {
    if (typeof global.tcFormatProvenanceForExport === 'function') {
        var t = global.tcFormatProvenanceForExport(entry);
        if (t) return t;
    }
    if (!entry || !entry.sources || !entry.sources.length) return '';
    var parts = [];
    for (var i = 0; i < entry.sources.length; i++) {
        var s = entry.sources[i];
        if (!s) continue;
        var label = String(s.label || s.type || '').trim();
        var section = String(s.section || '').trim();
        if (label && section) parts.push(label + ' § ' + section);
        else if (label) parts.push(label);
        else if (section) parts.push(section);
    }
    return parts.join('；');
}

function tcExportPrependProvenanceToCellForExcel(cellValue, provText) {
    if (typeof global.tcPrependProvenanceToCell === 'function') {
        return global.tcPrependProvenanceToCell(cellValue, provText);
    }
    var prefix = '来源：' + provText;
    var cell = cellValue != null ? String(cellValue).trim() : '';
    return cell ? prefix + '\n' + cell : prefix;
}

function buildRequirementItemProvenanceEntry(item) {
    if (!item) return null;
    var section = String(item.page_name || '').trim();
    if (!section) return null;
    return {
        sources: [{ type: 'lanhu', label: '蓝湖需求', section: section, expandable: false }]
    };
}

function normalizeExportProvenanceRows(provenance, rowCount, item) {
    var out = [];
    var raw = Array.isArray(provenance) ? provenance : [];
    var fallback = buildRequirementItemProvenanceEntry(item);
    for (var i = 0; i < rowCount; i++) {
        var p = raw[i];
        if (p && p.sources && p.sources.length) {
            out.push(p);
        } else if (fallback) {
            out.push(fallback);
        } else {
            out.push(p || null);
        }
    }
    return out;
}

function resolveExportProvenanceOpts(profileKey, exportColumns, rows, provenance, item) {
    var normalized = normalizeExportProvenanceRows(provenance, rows.length, item);
    if (!provenanceArrayHasSources(normalized)) return null;
    var colIdx = resolveProvenanceExportColumnIndex(profileKey, exportColumns);
    if (colIdx == null) return null;
    return { provenance: normalized, provenanceColIndex: colIdx };
}

function closeTcExportProvenanceModal(result) {
    var modal = $('tc-export-provenance-modal');
    if (modal) hideModal(modal);
    var fn = tcExportProvenanceChoiceResolve;
    tcExportProvenanceChoiceResolve = null;
    if (fn) fn(result || { action: 'cancel' });
}

function askTcExportProvenanceColumnChoice(profileColumns) {
    return new Promise(function(resolve) {
        tcExportProvenanceChoiceResolve = resolve;
        var modal = $('tc-export-provenance-modal');
        var select = $('tc-export-provenance-col-select');
        if (!modal || !select) {
            resolve({ action: 'skip' });
            return;
        }
        select.innerHTML = (profileColumns || []).map(function(col, idx) {
            return '<option value="' + idx + '">' + esc(String(col)) + '</option>';
        }).join('');
        if (typeof global.ensureTcWorkbenchOverlaysMounted === 'function') global.ensureTcWorkbenchOverlaysMounted();
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        showModal(modal);
    });
}

function finishTcTableExportDownload(built, report) {
    downloadExportSpreadsheet(built.export_columns, built.export_rows).then(function() {
        lastExportReport = report;
        showExportReportToast(report);
        persistExportReportAudit(report);
    }).catch(function(err) {
        alertBox('Excel 导出失败：' + (err && err.message ? err.message : '未知错误'), {
            variant: 'warning',
            title: '导出失败'
        });
    }).finally(function() {
        if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
    });
}

function buildExportReportClient(profileKey, columns, rows, opts) {
    opts = opts || {};
    var provenanceRows = opts.provenance || null;
    var provenanceColIndex = opts.provenanceColIndex != null ? opts.provenanceColIndex : null;
    var sourceColumns = (columns || []).slice();
    var normalizedProfileKey = normalizeExportProfileKey(profileKey);
    var templates = (typeof global.TC_CASE_TEMPLATES !== 'undefined' && global.TC_CASE_TEMPLATES) ? global.TC_CASE_TEMPLATES : [];
    var tpl = null;
    if (normalizedProfileKey !== 'current') {
        for (var i = 0; i < templates.length; i++) {
            if (templates[i].id === normalizedProfileKey) { tpl = templates[i]; break; }
        }
    }
    var useCurrentColumns = normalizedProfileKey === 'current'
        || !tpl
        || !columnsMatchTemplateColumns(sourceColumns, tpl.columns || []);
    var profileColumns = useCurrentColumns
        ? sourceColumns.slice()
        : (tpl.columns || sourceColumns).slice();
    var colMap = {};
    function findExact(cols, name) {
        var target = String(name || '').trim().toLowerCase();
        for (var ci = 0; ci < cols.length; ci++) {
            if (String(cols[ci] || '').trim().toLowerCase() === target) return ci;
        }
        return null;
    }
    if (useCurrentColumns) {
        for (var pi = 0; pi < profileColumns.length; pi++) colMap[pi] = pi;
    } else {
        for (var pi2 = 0; pi2 < profileColumns.length; pi2++) {
            colMap[pi2] = findExact(sourceColumns, profileColumns[pi2]);
        }
    }
    var required = [
        ['用例名称', ['用例名称', '用例名', '用例标题', '用例摘要', '标题', '摘要']],
        ['步骤描述', ['步骤描述', '步骤', '测试步骤', '操作步骤']],
        ['预期结果', ['预期结果', '预期']]
    ];
    function profileColIndex(label, keywords) {
        for (var p = 0; p < profileColumns.length; p++) {
            if (profileColumns[p] === label) return p;
        }
        for (var p2 = 0; p2 < profileColumns.length; p2++) {
            var txt = String(profileColumns[p2] || '').toLowerCase();
            for (var k = 0; k < keywords.length; k++) {
                if (txt.indexOf(String(keywords[k]).toLowerCase()) >= 0) return p2;
            }
        }
        return null;
    }
    var requiredIdx = required.map(function(spec) {
        return { label: spec[0], idx: profileColIndex(spec[0], spec[1]) };
    }).filter(function(item) { return item.idx != null; });
    var nameIdx = profileColIndex('用例名称', ['用例名称', '用例名', '标题']);
    if (nameIdx == null) nameIdx = 0;
    var skipped = [];
    var duplicates = [];
    var exportRows = [];
    var seen = {};
    for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri] || [];
        var mapped = profileColumns.map(function(_, idx) {
            var si = colMap[idx];
            if (si == null || si >= row.length) return '';
            return String(row[si] != null ? row[si] : '').trim();
        });
        var missingLabel = null;
        for (var r = 0; r < requiredIdx.length; r++) {
            if (!mapped[requiredIdx[r].idx]) { missingLabel = requiredIdx[r].label; break; }
        }
        if (missingLabel) {
            skipped.push({ row_index: ri, reason: '缺少' + missingLabel });
            continue;
        }
        var norm = String(mapped[nameIdx] || '').trim().toLowerCase();
        if (seen[norm]) {
            duplicates.push({ row_index: ri, reason: '用例名称重复' });
            continue;
        }
        seen[norm] = true;
        if (provenanceColIndex != null && provenanceRows && provenanceRows[ri]) {
            var provText = tcExportFormatProvenanceTextForExcel(provenanceRows[ri]);
            if (provText) {
                mapped[provenanceColIndex] = tcExportPrependProvenanceToCellForExcel(mapped[provenanceColIndex], provText);
            }
        }
        exportRows.push(mapped);
    }
    var report = {
        exported_at: new Date().toISOString().slice(0, 19),
        profile: useCurrentColumns ? 'current' : normalizedProfileKey,
        total_rows: rows.length,
        exported_rows: exportRows.length,
        skipped_count: skipped.length,
        duplicate_count: duplicates.length,
        skipped: skipped,
        duplicates: duplicates
    };
    return { report: report, export_columns: profileColumns, export_rows: exportRows };
}

function persistExportReportAudit(report) {
    return fetch('/api/test-cases/export-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: report })
    }).catch(function() { return null; });
}

function tcExportTableWithReport() {
    var payload = collectRowsPayloadForValidation();
    var columns = payload.columns || [];
    var rows = payload.rows || [];
    var provenance = [];
    if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
        provenance = global.tcProvenanceArrayForStashPayload(rows.length);
    } else if (typeof global.testCasesProvenance !== 'undefined' && global.testCasesProvenance) {
        provenance = global.testCasesProvenance.slice();
    }
    if (!columns.length || !rowsPayloadHasCellContent(payload)) {
        alertBox('当前表格暂无数据，请先添加用例后再导出。', { variant: 'info', title: '暂无可导出数据' });
        if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
        return;
    }
    var profileKey = getActiveExportProfileKey();
    var hasProv = provenanceArrayHasSources(provenance);
    var previewBuilt = buildExportReportClient(profileKey, columns, rows);
    var previewReport = previewBuilt.report;
    if (!previewReport.exported_rows) {
        alertBox('没有可导出的有效用例。请检查必填字段（用例名称、步骤描述、预期结果）或重复项。', {
            variant: 'warning',
            title: '导出失败'
        });
        if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
        return;
    }

    function runExport(provenanceColIndex) {
        var opts = null;
        if (hasProv && provenanceColIndex != null) {
            opts = { provenance: provenance, provenanceColIndex: provenanceColIndex };
        }
        var built = buildExportReportClient(profileKey, columns, rows, opts);
        finishTcTableExportDownload(built, built.report);
    }

    if (!hasProv) {
        runExport(null);
        return;
    }

    var autoCol = resolveProvenanceExportColumnIndex(profileKey, previewBuilt.export_columns);
    if (autoCol != null) {
        runExport(autoCol);
        return;
    }

    askTcExportProvenanceColumnChoice(previewBuilt.export_columns).then(function(choice) {
        if (!choice || choice.action === 'cancel') {
            if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
            return;
        }
        if (choice.action === 'skip') {
            runExport(null);
            return;
        }
        if (choice.action === 'apply') {
            var colIdx = choice.colIndex;
            if (colIdx == null || colIdx < 0 || colIdx >= previewBuilt.export_columns.length) {
                alertBox('请选择要写入来源的列。', { variant: 'warning', title: '请选择列' });
                if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
                return;
            }
            runExport(colIdx);
        }
    });
}


/* ---------- 导出需求选择弹窗 ---------- */

var tcExportRequirementPickerItems = [];
var tcExportRequirementPickerSelectionOrder = [];
var tcExportRequirementPickerCurrentKey = '';

function buildRequirementExportKey(item) {
    if (!item) return '';
    return [
        String(item.lanhu_pid || ''),
        String(item.lanhu_doc_id || ''),
        String(item.lanhu_page_id || item.page_id || '')
    ].join(':');
}



function resolveExportRequirementActiveDocId() {
    if (typeof global.getTcLanhuDocTreeMeta === 'function') {
        var meta = global.getTcLanhuDocTreeMeta() || {};
        var docId = String(meta.docId || '').trim();
        if (docId) return docId;
    }
    var ctx = resolveCurrentRequirementExportContext();
    if (ctx && ctx.lanhu_doc_id) return String(ctx.lanhu_doc_id).trim();
    return '';
}

function filterExportRequirementItemsForActiveDoc(items) {
    items = items || [];
    var activeDocId = resolveExportRequirementActiveDocId();
    if (!activeDocId) return items.slice();
    return items.filter(function(item) {
        if (!item) return false;
        return String(item.lanhu_doc_id || '').trim() === activeDocId;
    });
}

function resolveExportRequirementItemFolderPath(item) {
    item = item || {};
    var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
    if (!pageId) return '';
    var itemDocId = String(item.lanhu_doc_id || '').trim();
    var treeDocId = '';
    if (typeof global.getTcLanhuDocTreeMeta === 'function') {
        treeDocId = String((global.getTcLanhuDocTreeMeta() || {}).docId || '').trim();
    }
    if (treeDocId && itemDocId && treeDocId !== itemDocId) return '';
    var rawPath = '';
    if (typeof global.findTcLanhuPageNodePath === 'function') {
        rawPath = String(global.findTcLanhuPageNodePath(pageId) || '').trim();
    }
    if (!rawPath && item.is_current && typeof global.getTcLanhuDocTreeMeta === 'function') {
        var meta = global.getTcLanhuDocTreeMeta() || {};
        if (String(meta.selectedId || '').trim() === pageId) {
            rawPath = String(meta.selectedPagePath || '').trim();
        }
    }
    if (!rawPath) return '';
    if (typeof tcNormalizeWorkbenchPageDisplayName === 'function') {
        rawPath = tcNormalizeWorkbenchPageDisplayName(rawPath);
    }
    if (!rawPath) return '';
    var parts = rawPath.split('/').map(function(part) {
        return String(part || '').trim();
    }).filter(Boolean);
    if (parts.length <= 1) return '';
    parts.pop();
    return parts.join(' / ');
}

function formatRequirementExportUpdatedAt(raw) {
    var text = String(raw || '').trim();
    if (!text) return '';
    return text.replace('T', ' ').slice(0, 16);
}

function resolveCurrentRequirementExportContext() {
    if (global.TcRequirementCaseStore && typeof global.TcRequirementCaseStore.resolveContext === 'function') {
        return global.TcRequirementCaseStore.resolveContext({});
    }
    return null;
}

function countLiveExportableRows() {
    var payload = collectRowsPayloadForValidation();
    if (!rowsPayloadHasCellContent(payload)) return 0;
    return (payload.rows || []).length;
}

function mergeCurrentPageIntoRequirementList(items) {
    items = (items || []).slice();
    var ctx = resolveCurrentRequirementExportContext();
    if (!ctx) return items;
    var activeDocId = resolveExportRequirementActiveDocId();
    if (activeDocId && String(ctx.lanhu_doc_id || '').trim() !== activeDocId) return items;
    var liveCount = countLiveExportableRows();
    if (!liveCount) return items;
    var key = buildRequirementExportKey(ctx);
    var pageName = String(ctx.page_name || '').trim() || '未命名需求';
    var found = false;
    for (var i = 0; i < items.length; i++) {
        if (buildRequirementExportKey(items[i]) === key) {
            items[i] = Object.assign({}, items[i], {
                page_name: pageName || items[i].page_name,
                row_count: liveCount,
                is_current: true
            });
            found = true;
            break;
        }
    }
    if (!found) {
        items.unshift({
            requirement_id: ctx.requirement_id || ctx.lanhu_page_id || '',
            lanhu_pid: ctx.lanhu_pid || '',
            lanhu_doc_id: ctx.lanhu_doc_id || '',
            lanhu_page_id: ctx.lanhu_page_id || ctx.page_id || '',
            lanhu_url: ctx.lanhu_url || '',
            page_name: pageName,
            row_count: liveCount,
            updated_at: '',
            is_current: true
        });
    }
    return items;
}

function fetchDesignedRequirementList() {
    return fetch('/api/test-cases/requirement-cases/list', { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data || !data.ok) {
                throw new Error((data && data.error) || '加载需求列表失败');
            }
            return mergeCurrentPageIntoRequirementList(
                filterExportRequirementItemsForActiveDoc(data.items || [])
            );
        });
}

function ensureExportRequirementPickerMounted() {
    if (typeof global.ensureTcWorkbenchOverlaysMounted === 'function') {
        global.ensureTcWorkbenchOverlaysMounted();
    }
    var modal = $('tc-export-requirement-modal');
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    return modal;
}

function closeTcExportRequirementPickerModal() {
    var modal = $('tc-export-requirement-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (!document.querySelector('#tc-export-requirement-modal.flex')) {
        document.body.style.overflow = '';
    }
}

function updateTcExportRequirementPickerSummary() {
    var summary = $('tc-export-requirement-summary');
    var submit = $('tc-export-requirement-submit');
    if (!summary && !submit) return;
    var selected = getSelectedExportRequirementItems();
    var count = selected.length;
    var rows = 0;
    selected.forEach(function(item) {
        rows += parseInt(item.row_count, 10) || 0;
    });
    if (summary) {
        summary.textContent = count
            ? ('已选 ' + count + ' 个需求，共约 ' + rows + ' 条用例（按勾选顺序导出）')
            : '请勾选需要导出的需求';
    }
    if (submit) submit.disabled = count === 0;
    syncTcExportRequirementPickerModeVisibility(count);
    syncTcExportRequirementPickerOrderBadges();
}

function renderTcExportRequirementPickerList(items) {
    tcExportRequirementPickerItems = items || [];
    var listEl = $('tc-export-requirement-list');
    var emptyEl = $('tc-export-requirement-empty');
    var loadingEl = $('tc-export-requirement-loading');
    if (loadingEl) loadingEl.classList.add('hidden');
    if (!listEl) return;
    if (!items.length) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        updateTcExportRequirementPickerSummary();
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    var html = items.map(function(item, idx) {
        var name = String(item.page_name || item.requirement_id || '未命名需求').trim();
        var meta = (parseInt(item.row_count, 10) || 0) + ' 条用例';
        var updated = formatRequirementExportUpdatedAt(item.updated_at);
        if (updated) meta += ' · 更新 ' + updated;
        if (item.is_current) meta += ' · 当前页面';
        var checked = item.is_current || buildRequirementExportKey(item) === tcExportRequirementPickerCurrentKey;
        var folderPath = resolveExportRequirementItemFolderPath(item);
        var pathHtml = folderPath
            ? ('<span class="tc-export-requirement-item__path" title="' + esc(folderPath) + '">' + esc(folderPath) + '</span>')
            : '';
        return '<label class="tc-export-requirement-item">' +
            '<input type="checkbox" class="tc-export-requirement-check" data-index="' + idx + '"' +
            (checked ? ' checked' : '') + '>' +
            '<span class="tc-export-requirement-item__order hidden" aria-hidden="true"></span>' +
            '<span class="tc-export-requirement-item__body">' +
            '<span class="tc-export-requirement-item__head">' +
            '<span class="tc-export-requirement-item__title">' + esc(name) + '</span>' +
            pathHtml +
            '</span>' +
            '<span class="tc-export-requirement-item__meta">' + esc(meta) + '</span>' +
            '</span></label>';
    }).join('');
    listEl.innerHTML = html;
    tcExportRequirementPickerSelectionOrder = [];
    items.forEach(function(item, idx) {
        if (item.is_current || buildRequirementExportKey(item) === tcExportRequirementPickerCurrentKey) {
            tcExportRequirementPickerSelectionOrder.push(idx);
        }
    });
    listEl.querySelectorAll('.tc-export-requirement-check').forEach(function(el) {
        el.addEventListener('change', onTcExportRequirementCheckChange);
    });
    updateTcExportRequirementPickerSummary();
}

function setTcExportRequirementPickerLoading(isLoading) {
    var loadingEl = $('tc-export-requirement-loading');
    var listEl = $('tc-export-requirement-list');
    var emptyEl = $('tc-export-requirement-empty');
    if (loadingEl) loadingEl.classList.toggle('hidden', !isLoading);
    if (isLoading) {
        if (listEl) listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.add('hidden');
    }
}

function openTcExportRequirementPickerModal() {
    var modal = ensureExportRequirementPickerMounted();
    if (!modal) {
        alertBox('导出弹窗未就绪，请刷新页面后重试。', { variant: 'warning', title: '导出失败' });
        if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
        return;
    }
    var ctx = resolveCurrentRequirementExportContext();
    tcExportRequirementPickerCurrentKey = ctx ? buildRequirementExportKey(ctx) : '';
    setTcExportRequirementPickerLoading(true);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    fetchDesignedRequirementList()
        .then(function(items) {
            renderTcExportRequirementPickerList(items);
        })
        .catch(function(err) {
            setTcExportRequirementPickerLoading(false);
            renderTcExportRequirementPickerList([]);
            alertBox((err && err.message) || '加载需求列表失败', { variant: 'warning', title: '加载失败' });
        })
        .finally(function() {
            if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
        });
}

function getSelectedExportRequirementItems() {
    var selected = [];
    var seen = {};
    tcExportRequirementPickerSelectionOrder.forEach(function(idx) {
        var el = document.querySelector('.tc-export-requirement-check[data-index="' + idx + '"]');
        var item = tcExportRequirementPickerItems[idx];
        if (!el || !el.checked || !item || seen[idx]) return;
        seen[idx] = true;
        selected.push(item);
    });
    document.querySelectorAll('.tc-export-requirement-check:checked').forEach(function(el) {
        var idx = parseInt(el.getAttribute('data-index'), 10);
        if (isNaN(idx) || seen[idx] || !tcExportRequirementPickerItems[idx]) return;
        seen[idx] = true;
        selected.push(tcExportRequirementPickerItems[idx]);
    });
    return selected;
}

function fetchRequirementCasePayload(item) {
    var lanhuUrl = String(item.lanhu_url || '').trim();
    var pageId = String(item.lanhu_page_id || item.page_id || '').trim();
    if (!lanhuUrl || !pageId) {
        return Promise.reject(new Error('需求链接不完整'));
    }
    var url = '/api/test-cases/requirement-cases?lanhu_url=' +
        encodeURIComponent(lanhuUrl) + '&page_id=' + encodeURIComponent(pageId);
    return fetch(url, { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data || !data.ok || !data.found || !data.data) {
                throw new Error('未找到用例数据');
            }
            return data.data;
        });
}

function getLivePayloadForRequirementItem(item) {
    var payload = collectRowsPayloadForValidation();
    if (!rowsPayloadHasCellContent(payload)) {
        return Promise.reject(new Error('当前页面暂无可导出用例'));
    }
    var rows = payload.rows || [];
    var provenance = [];
    if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
        provenance = global.tcProvenanceArrayForStashPayload(rows.length);
    } else if (typeof global.testCasesProvenance !== 'undefined' && global.testCasesProvenance) {
        provenance = global.testCasesProvenance.slice();
    }
    return Promise.resolve({
        payload: {
            columns: payload.columns || [],
            rows: rows,
            provenance: provenance
        },
        page_name: item.page_name,
        template_id: (typeof global.tcActiveTemplateId !== 'undefined') ? global.tcActiveTemplateId : null
    });
}

function resolveRequirementExportPayload(item) {
    var ctx = resolveCurrentRequirementExportContext();
    var isCurrent = item.is_current || (ctx && buildRequirementExportKey(item) === buildRequirementExportKey(ctx));
    if (isCurrent && countLiveExportableRows() > 0) {
        return getLivePayloadForRequirementItem(item);
    }
    return fetchRequirementCasePayload(item).then(function(doc) {
        return {
            payload: doc.payload || {},
            page_name: doc.page_name || item.page_name,
            template_id: doc.template_id
        };
    });
}

function sanitizeExcelSheetName(name, usedNames) {
    usedNames = usedNames || {};
    var base = String(name || '需求').replace(/[\\/*?:\[\]]/g, '_').trim();
    if (!base) base = '需求';
    if (base.length > 31) base = base.slice(0, 31);
    var candidate = base;
    var n = 2;
    while (usedNames[candidate]) {
        var suffix = '_' + n;
        candidate = base.slice(0, Math.max(1, 31 - suffix.length)) + suffix;
        n += 1;
    }
    usedNames[candidate] = true;
    return candidate;
}

function downloadMultiSheetExportXlsx(sheets) {
    if (typeof global.XLSX === 'undefined') {
        throw new Error('XLSX 组件未加载');
    }
    var wb = global.XLSX.utils.book_new();
    var usedNames = {};
    (sheets || []).forEach(function(spec) {
        var columns = spec.columns || [];
        var rows = spec.rows || [];
        var aoa = [columns.slice()].concat(rows.map(function(row) {
            return (row || []).map(function(cell) {
                if (cell === null || cell === undefined) return '';
                return String(cell);
            });
        }));
        var ws = global.XLSX.utils.aoa_to_sheet(aoa);
        global.XLSX.utils.book_append_sheet(wb, ws, sanitizeExcelSheetName(spec.sheetName, usedNames));
    });
    var wbout = global.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '测试用例_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


function onTcExportRequirementCheckChange(e) {
    var el = e && e.target;
    if (!el) return;
    var idx = parseInt(el.getAttribute('data-index'), 10);
    if (isNaN(idx)) return;
    if (el.checked) {
        if (tcExportRequirementPickerSelectionOrder.indexOf(idx) === -1) {
            tcExportRequirementPickerSelectionOrder.push(idx);
        }
    } else {
        tcExportRequirementPickerSelectionOrder = tcExportRequirementPickerSelectionOrder.filter(function(i) {
            return i !== idx;
        });
    }
    updateTcExportRequirementPickerSummary();
}

function resetTcExportRequirementPickerSelectionOrderFromChecks() {
    tcExportRequirementPickerSelectionOrder = [];
    document.querySelectorAll('.tc-export-requirement-check:checked').forEach(function(el) {
        var idx = parseInt(el.getAttribute('data-index'), 10);
        if (!isNaN(idx) && tcExportRequirementPickerSelectionOrder.indexOf(idx) === -1) {
            tcExportRequirementPickerSelectionOrder.push(idx);
        }
    });
}

function syncTcExportRequirementPickerOrderBadges() {
    document.querySelectorAll('.tc-export-requirement-item').forEach(function(label) {
        var badge = label.querySelector('.tc-export-requirement-item__order');
        if (!badge) return;
        badge.textContent = '';
        badge.classList.add('hidden');
    });
    tcExportRequirementPickerSelectionOrder.forEach(function(idx, order) {
        var el = document.querySelector('.tc-export-requirement-check[data-index="' + idx + '"]');
        if (!el || !el.checked) return;
        var label = el.closest('.tc-export-requirement-item');
        if (!label) return;
        var badge = label.querySelector('.tc-export-requirement-item__order');
        if (!badge) return;
        badge.textContent = String(order + 1);
        badge.classList.remove('hidden');
    });
}

function syncTcExportRequirementPickerModeVisibility(selectedCount) {
    var wrap = $('tc-export-requirement-mode-wrap');
    if (!wrap) return;
    wrap.classList.toggle('hidden', selectedCount < 2);
    wrap.setAttribute('aria-hidden', selectedCount < 2 ? 'true' : 'false');
}

function getTcExportRequirementExportMode() {
    var checked = document.querySelector('input[name="tc-export-requirement-mode"]:checked');
    return checked ? String(checked.value || 'merge') : 'merge';
}

function findExportColumnIndexInsensitive(columns, name) {
    var target = String(name || '').trim().toLowerCase();
    for (var i = 0; i < (columns || []).length; i++) {
        if (String(columns[i] || '').trim().toLowerCase() === target) return i;
    }
    return null;
}

function remapExportRowsToTargetColumns(targetColumns, sourceColumns, sourceRows) {
    targetColumns = targetColumns || [];
    sourceColumns = sourceColumns || [];
    sourceRows = sourceRows || [];
    if (!targetColumns.length) return sourceRows.slice();
    var sameShape = targetColumns.length === sourceColumns.length;
    if (sameShape) {
        var allMatch = true;
        for (var i = 0; i < targetColumns.length; i++) {
            if (String(targetColumns[i] || '').trim().toLowerCase() !==
                String(sourceColumns[i] || '').trim().toLowerCase()) {
                allMatch = false;
                break;
            }
        }
        if (allMatch) return sourceRows.map(function(row) { return (row || []).slice(); });
    }
    return sourceRows.map(function(row) {
        row = row || [];
        return targetColumns.map(function(colName) {
            var si = findExportColumnIndexInsensitive(sourceColumns, colName);
            if (si == null || si >= row.length) return '';
            var cell = row[si];
            return cell === null || cell === undefined ? '' : String(cell);
        });
    });
}

function mergeRequirementExportReports(reports) {
    var aggregate = {
        exported_at: new Date().toISOString().slice(0, 19),
        profile: getActiveExportProfileKey(),
        total_rows: 0,
        exported_rows: 0,
        skipped_count: 0,
        duplicate_count: 0,
        skipped: [],
        duplicates: []
    };
    (reports || []).forEach(function(report) {
        if (!report) return;
        aggregate.total_rows += report.total_rows || 0;
        aggregate.exported_rows += report.exported_rows || 0;
        aggregate.skipped_count += report.skipped_count != null
            ? report.skipped_count
            : (report.skipped || []).length;
        aggregate.duplicate_count += report.duplicate_count != null
            ? report.duplicate_count
            : (report.duplicates || []).length;
    });
    return aggregate;
}

function mergeRequirementExportSheetsOrdered(sheets) {
    sheets = sheets || [];
    if (!sheets.length) return null;
    var first = sheets[0];
    var mergedColumns = (first.columns || []).slice();
    var mergedRows = (first.rows || []).slice();
    var reports = [first.report];
    for (var i = 1; i < sheets.length; i++) {
        var spec = sheets[i];
        var remapped = remapExportRowsToTargetColumns(mergedColumns, spec.columns, spec.rows);
        mergedRows = mergedRows.concat(remapped);
        reports.push(spec.report);
    }
    return {
        export_columns: mergedColumns,
        export_rows: mergedRows,
        report: mergeRequirementExportReports(reports)
    };
}

function sanitizeRequirementExportFileName(pageName, dateStr, index) {
    var base = String(pageName || '需求').replace(/[\\/*?:\[\]"<>|]/g, '_').trim();
    if (!base) base = '需求';
    if (base.length > 40) base = base.slice(0, 40);
    var suffix = typeof index === 'number' ? '_' + (index + 1) : '';
    return '测试用例_' + base + suffix + '_' + dateStr + '.xlsx';
}

function downloadExportXlsxWithFilename(columns, rows, filename) {
    if (typeof global.XLSX === 'undefined') {
        throw new Error('XLSX 组件未加载');
    }
    var aoa = [columns.slice()].concat((rows || []).map(function(row) {
        return (row || []).map(function(cell) {
            if (cell === null || cell === undefined) return '';
            return String(cell);
        });
    }));
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, '测试用例');
    var wbout = global.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || ('测试用例_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadSeparateRequirementExportFiles(sheets) {
    return ensureTcXlsxLoaded().then(function() {
        var dateStr = new Date().toISOString().slice(0, 10);
        var aggregate = mergeRequirementExportReports((sheets || []).map(function(s) { return s.report; }));
        (sheets || []).forEach(function(spec, index) {
            (function(i, item) {
                setTimeout(function() {
                    downloadExportXlsxWithFilename(
                        item.columns || [],
                        item.rows || [],
                        sanitizeRequirementExportFileName(item.sheetName, dateStr, i)
                    );
                }, i * 320);
            })(index, spec);
        });
        lastExportReport = aggregate;
        showExportReportToast(aggregate);
        persistExportReportAudit(aggregate);
    });
}


function buildRequirementExportSheet(item, doc) {
    var payload = doc.payload || {};
    var columns = payload.columns || [];
    var rows = payload.rows || [];
    if (!columns.length || !rows.length) {
        return null;
    }
    var profileKey = doc.template_id || getActiveExportProfileKey();
    var previewBuilt = buildExportReportClient(profileKey, columns, rows);
    var provOpts = resolveExportProvenanceOpts(
        profileKey,
        previewBuilt.export_columns,
        rows,
        payload.provenance,
        item
    );
    var built = buildExportReportClient(profileKey, columns, rows, provOpts);
    if (!built.export_rows || !built.export_rows.length) return null;
    return {
        sheetName: String(item.page_name || item.requirement_id || '需求').trim() || '需求',
        columns: built.export_columns,
        rows: built.export_rows,
        report: built.report
    };
}

function runExportForSelectedRequirements(selectedItems) {
    if (!selectedItems.length) {
        alertBox('请至少选择一个需求。', { variant: 'info', title: '请选择需求' });
        return;
    }
    if (typeof global.beginTcExportExcelLoading === 'function' && !global.beginTcExportExcelLoading()) {
        return;
    }
    closeTcExportRequirementPickerModal();

    function syncBeforeExport() {
        if (global.TcRequirementCaseStore && typeof global.TcRequirementCaseStore.flushIfDirty === 'function') {
            return Promise.resolve(global.TcRequirementCaseStore.flushIfDirty('export_excel')).catch(function() {});
        }
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            return Promise.resolve(global.TcTableBridge.commitAll()).catch(function() {});
        }
        return Promise.resolve();
    }

    syncBeforeExport().then(function() {
        return Promise.all(selectedItems.map(function(item) {
            return resolveRequirementExportPayload(item).then(function(doc) {
                return buildRequirementExportSheet(item, doc);
            }).catch(function(err) {
                return { error: err, item: item };
            });
        }));
    }).then(function(results) {
        var sheets = [];
        var aggregate = {
            exported_at: new Date().toISOString().slice(0, 19),
            profile: getActiveExportProfileKey(),
            total_rows: 0,
            exported_rows: 0,
            skipped_count: 0,
            duplicate_count: 0,
            skipped: [],
            duplicates: []
        };
        var errors = [];
        results.forEach(function(result) {
            if (!result) return;
            if (result.error) {
                errors.push(String(result.item && result.item.page_name || '需求') + '：' +
                    (result.error.message || '导出失败'));
                return;
            }
            sheets.push(result);
            if (result.report) {
                aggregate.total_rows += result.report.total_rows || 0;
                aggregate.exported_rows += result.report.exported_rows || 0;
                aggregate.skipped_count += result.report.skipped_count != null
                    ? result.report.skipped_count
                    : (result.report.skipped || []).length;
                aggregate.duplicate_count += result.report.duplicate_count != null
                    ? result.report.duplicate_count
                    : (result.report.duplicates || []).length;
            }
        });
        if (!sheets.length) {
            alertBox(errors.length ? errors.join('\n') : '没有可导出的有效用例。', {
                variant: 'warning',
                title: '导出失败'
            });
            return;
        }
        var exportMode = sheets.length > 1 ? getTcExportRequirementExportMode() : 'single';
        return ensureTcXlsxLoaded().then(function() {
            if (sheets.length === 1) {
                finishTcTableExportDownload({ export_columns: sheets[0].columns, export_rows: sheets[0].rows }, sheets[0].report || aggregate);
                return;
            }
            if (exportMode === 'separate') {
                return downloadSeparateRequirementExportFiles(sheets);
            }
            var merged = mergeRequirementExportSheetsOrdered(sheets);
            if (!merged || !merged.export_rows || !merged.export_rows.length) {
                alertBox('合并导出失败：没有可导出的有效用例。', { variant: 'warning', title: '导出失败' });
                return;
            }
            finishTcTableExportDownload(merged, merged.report || aggregate);
        }).then(function() {
            if (errors.length) {
                toast('部分需求导出失败：' + errors.join('；'), { variant: 'warning', duration: 5200 });
            }
        });
    }).catch(function(err) {
        alertBox('导出失败：' + (err && err.message ? err.message : '未知错误'), {
            variant: 'warning',
            title: '导出失败'
        });
    }).finally(function() {
        if (typeof global.endTcExportExcelLoading === 'function') global.endTcExportExcelLoading();
    });
}

function tcOpenExportRequirementPicker() {
    openTcExportRequirementPickerModal();
}

function initTcExportRequirementPickerUi() {
    if (global._tcExportRequirementPickerInited) return;
    global._tcExportRequirementPickerInited = true;
    $('tc-export-requirement-close') && $('tc-export-requirement-close').addEventListener('click', function() {
        closeTcExportRequirementPickerModal();
    });
    $('tc-export-requirement-cancel') && $('tc-export-requirement-cancel').addEventListener('click', function() {
        closeTcExportRequirementPickerModal();
    });
    $('tc-export-requirement-select-all') && $('tc-export-requirement-select-all').addEventListener('click', function() {
        tcExportRequirementPickerSelectionOrder = tcExportRequirementPickerItems.map(function(_, idx) { return idx; });
        document.querySelectorAll('.tc-export-requirement-check').forEach(function(el) { el.checked = true; });
        updateTcExportRequirementPickerSummary();
    });
    $('tc-export-requirement-select-none') && $('tc-export-requirement-select-none').addEventListener('click', function() {
        tcExportRequirementPickerSelectionOrder = [];
        document.querySelectorAll('.tc-export-requirement-check').forEach(function(el) { el.checked = false; });
        updateTcExportRequirementPickerSummary();
    });
    document.querySelectorAll('input[name="tc-export-requirement-mode"]').forEach(function(el) {
        el.addEventListener('change', function() {
            syncTcExportRequirementPickerModeVisibility(getSelectedExportRequirementItems().length);
        });
    });
    $('tc-export-requirement-submit') && $('tc-export-requirement-submit').addEventListener('click', function() {
        runExportForSelectedRequirements(getSelectedExportRequirementItems());
    });
    $('tc-export-requirement-modal') && $('tc-export-requirement-modal').addEventListener('click', function(e) {
        if (e.target === $('tc-export-requirement-modal')) closeTcExportRequirementPickerModal();
    });
}

initTcExportRequirementPickerUi();

global.tcExportTableWithReport = tcExportTableWithReport;
global.tcOpenExportRequirementPicker = tcOpenExportRequirementPicker;
global.tcOpenExportReportModal = openExportReportModal;
global.tcDownloadExportSpreadsheet = downloadExportSpreadsheet;

