/**
 * 思维导图智能编辑 — 将 AI operations 增量应用到 tcMindmapCasesData（与表格 TcSmartEditApply 隔离）
 */
(function (global) {
    'use strict';

    function deepCloneRows(rows) {
        return (rows || []).map(function (row) {
            return Array.isArray(row) ? row.slice() : row;
        });
    }

    function cellsToRow(columns, cells) {
        return columns.map(function (col) {
            return cells && cells[col] != null ? String(cells[col]) : '';
        });
    }

    function resolveModuleColumnIndex(columns) {
        for (var i = 0; i < columns.length; i++) {
            if (columns[i] === '所属模块') return i;
        }
        return 1;
    }

    function ensureMindmapAddDefaults(columns, cells) {
        var out = {};
        (columns || []).forEach(function (col) {
            out[col] = cells && cells[col] != null ? String(cells[col]) : '';
        });
        var modCol = '所属模块';
        if (columns.indexOf(modCol) >= 0 && !String(out[modCol] || '').trim()) {
            out[modCol] = '未分类';
        }
        return out;
    }

    function formatMindmapEditSuccessHint(operations) {
        var updates = 0;
        var adds = 0;
        (operations || []).forEach(function (op) {
            if (op.type === 'update') updates++;
            else if (op.type === 'add') adds++;
        });
        var total = updates + adds;
        if (total <= 0) return '未产生变更';
        if (adds > 0 && updates === 0) return '成功新增 ' + adds + ' 条导图用例';
        if (adds === 0 && updates > 0) return '成功更新 ' + updates + ' 条导图用例';
        return '成功编辑 ' + total + ' 条导图用例';
    }

    function applyMindmapSmartEditOps(operations, columns, data) {
        var backup = deepCloneRows(data);
        var changedRows = [];
        var next = deepCloneRows(data);

        (operations || []).forEach(function (op) {
            if (op.type === 'update') {
                var ri = op.rowIndex;
                if (!next[ri]) {
                    next[ri] = columns.map(function () { return ''; });
                }
                var row = next[ri].slice();
                columns.forEach(function (col, j) {
                    if (op.cells && Object.prototype.hasOwnProperty.call(op.cells, col)) {
                        row[j] = op.cells[col];
                    }
                });
                next[ri] = row;
                if (changedRows.indexOf(ri) < 0) changedRows.push(ri);
            } else if (op.type === 'add') {
                var cells = ensureMindmapAddDefaults(columns, op.cells || {});
                var newRow = cellsToRow(columns, cells);
                var newIndex = next.length;
                next.push(newRow);
                changedRows.push(newIndex);
            }
        });

        return {
            data: next,
            backup: backup,
            changedRows: changedRows
        };
    }

    global.TcMindmapSmartEditApply = {
        formatMindmapEditSuccessHint: formatMindmapEditSuccessHint,
        applyMindmapSmartEditOps: applyMindmapSmartEditOps
    };
})(typeof window !== 'undefined' ? window : this);
