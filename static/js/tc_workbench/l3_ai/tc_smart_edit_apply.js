/**
 * 智能编辑 — 将 AI 操作应用到 testCasesData
 */
(function (global) {
    'use strict';

    function deepCloneRows(rows) {
        return (rows || []).map(function (row) {
            return Array.isArray(row) ? row.slice() : row;
        });
    }

    function rowToCells(columns, row) {
        var cells = {};
        columns.forEach(function (col, j) {
            cells[col] = String(row[j] != null ? row[j] : '');
        });
        return cells;
    }

    function cellsToRow(columns, cells) {
        return columns.map(function (col) {
            return cells && cells[col] != null ? String(cells[col]) : '';
        });
    }

    function serializeTableForEdit(columns, rows) {
        var list = rows || [];
        return {
            columns: columns.slice(),
            rows: list.map(function (row, i) {
                return { rowIndex: i, cells: rowToCells(columns, row) };
            }),
            rowCount: list.length
        };
    }

    function rowHasCaseContent(columns, row) {
        if (typeof global.tcTableRowHasCaseContent === 'function') {
            return global.tcTableRowHasCaseContent(row);
        }
        if (!row || !Array.isArray(row)) return false;
        var nameCol = 0;
        if (typeof global.resolveTcCaseNameColumnIndex === 'function') {
            nameCol = global.resolveTcCaseNameColumnIndex();
        } else if (typeof global.getTcColumnIndex === 'function') {
            nameCol = global.getTcColumnIndex('用例名称', 0);
        }
        if (String(row[nameCol] || '').trim()) return true;
        for (var i = 0; i < row.length; i++) {
            if (i === nameCol) continue;
            if (String(row[i] || '').trim()) return true;
        }
        return false;
    }

    function findFirstEmptyRowIndex(rows, fromIndex) {
        fromIndex = fromIndex || 0;
        for (var i = fromIndex; i < rows.length; i++) {
            if (!rowHasCaseContent(null, rows[i])) return i;
        }
        return -1;
    }

    /**
     * 将 add 优先映射到表格内第一个空行（update）；仅当所有行均有内容时才保留 add。
     */
    function normalizeAddOpsToEmptyRows(operations, columns, data) {
        var rows = deepCloneRows(data);
        var normalized = [];

        (operations || []).forEach(function (op) {
            if (!op || op.type === 'update') {
                if (op && op.type === 'update') {
                    var ri = op.rowIndex;
                    if (!rows[ri]) {
                        rows[ri] = columns.map(function () { return ''; });
                    }
                    var updated = rows[ri].slice();
                    columns.forEach(function (col, j) {
                        if (op.cells && Object.prototype.hasOwnProperty.call(op.cells, col)) {
                            updated[j] = op.cells[col];
                        }
                    });
                    rows[ri] = updated;
                }
                normalized.push(op);
                return;
            }
            if (op.type !== 'add') {
                normalized.push(op);
                return;
            }
            var emptyIdx = findFirstEmptyRowIndex(rows, 0);
            if (emptyIdx >= 0) {
                normalized.push({ type: 'update', rowIndex: emptyIdx, cells: op.cells || {} });
                rows[emptyIdx] = cellsToRow(columns, op.cells || {});
            } else {
                normalized.push(op);
                rows.push(cellsToRow(columns, op.cells || {}));
            }
        });

        return normalized;
    }

    function formatEditSuccessHint(operations) {
        var updates = 0;
        var adds = 0;
        (operations || []).forEach(function (op) {
            if (op.type === 'update') updates++;
            else if (op.type === 'add') adds++;
        });
        var total = updates + adds;
        if (total <= 0) return '未产生变更';
        if (adds > 0 && updates === 0) return '成功新增 ' + adds + ' 条用例';
        if (adds === 0 && updates > 0) return '成功生成 ' + updates + ' 条用例';
        return '成功编辑 ' + total + ' 条用例';
    }

    function applySmartEditOps(operations, columns, data) {
        var backup = deepCloneRows(data);
        var changedRows = [];
        var next = deepCloneRows(data);

        operations.forEach(function (op) {
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
                var newRow = cellsToRow(columns, op.cells || {});
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

    function highlightEditedRows(rowIndices) {
        (rowIndices || []).forEach(function (ri) {
            var tr = document.querySelector('#table-body tr[data-row-index="' + ri + '"]');
            if (tr) {
                tr.classList.add('tc-row--ai-edited');
                setTimeout(function () {
                    tr.classList.remove('tc-row--ai-edited');
                }, 2500);
            }
        });
    }

    global.TcSmartEditApply = {
        serializeTableForEdit: serializeTableForEdit,
        normalizeAddOpsToEmptyRows: normalizeAddOpsToEmptyRows,
        formatEditSuccessHint: formatEditSuccessHint,
        applySmartEditOps: applySmartEditOps,
        highlightEditedRows: highlightEditedRows
    };
})(typeof window !== 'undefined' ? window : this);
