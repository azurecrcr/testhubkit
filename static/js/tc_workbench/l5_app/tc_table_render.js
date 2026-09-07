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

