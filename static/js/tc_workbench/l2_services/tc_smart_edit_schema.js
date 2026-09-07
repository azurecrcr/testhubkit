/**
 * 智能编辑 — 前端响应校验（与后端规则对齐，应用前二次校验）
 */
(function (global) {
    'use strict';

    var METERSPHERE_TABLE_COLUMNS = [
        '用例名称', '所属模块', '标签', '前置条件', '步骤描述',
        '预期结果', '编辑模式', '备注', '用例等级'
    ];

    function normalizeColumns(columns) {
        return (columns || []).map(function (c) { return String(c).trim(); });
    }

    function isMetersphereTableHeaders(columns) {
        var cols = normalizeColumns(columns);
        if (cols.length !== METERSPHERE_TABLE_COLUMNS.length) return false;
        for (var i = 0; i < cols.length; i++) {
            if (cols[i] !== METERSPHERE_TABLE_COLUMNS[i]) return false;
        }
        return true;
    }

    function validateEditOperations(operations, columns, rowCount) {
        if (!Array.isArray(operations)) {
            return { ok: false, error: 'operations 必须是数组' };
        }
        var colSet = {};
        (columns || []).forEach(function (c) { colSet[c] = true; });
        var validated = [];

        for (var i = 0; i < operations.length; i++) {
            var op = operations[i];
            if (!op || typeof op !== 'object') {
                return { ok: false, error: 'operations[' + i + '] 无效' };
            }
            var type = String(op.type || '').toLowerCase();
            if (type === 'delete' || type === 'remove' || type === 'drop') {
                return { ok: false, error: '禁止删除操作' };
            }
            if (type !== 'update' && type !== 'add') {
                return { ok: false, error: '不支持的操作类型: ' + type };
            }
            var cells = op.cells;
            if (!cells || typeof cells !== 'object') {
                return { ok: false, error: 'operations[' + i + '].cells 无效' };
            }
            var clean = {};
            Object.keys(cells).forEach(function (k) {
                if (colSet[k]) clean[k] = String(cells[k] != null ? cells[k] : '');
            });
            if (type === 'update') {
                var ri = parseInt(op.rowIndex, 10);
                if (isNaN(ri) || ri < 0 || ri >= rowCount) {
                    return { ok: false, error: 'rowIndex 越界: ' + op.rowIndex };
                }
                if (!Object.keys(clean).length) {
                    return { ok: false, error: 'update 未包含有效列' };
                }
                validated.push({ type: 'update', rowIndex: ri, cells: clean });
            } else {
                validated.push({ type: 'add', cells: clean });
            }
        }
        return { ok: true, operations: validated };
    }

    global.TcSmartEditSchema = {
        METERSPHERE_TABLE_COLUMNS: METERSPHERE_TABLE_COLUMNS,
        isMetersphereTableHeaders: isMetersphereTableHeaders,
        validateEditOperations: validateEditOperations
    };
})(typeof window !== 'undefined' ? window : this);
