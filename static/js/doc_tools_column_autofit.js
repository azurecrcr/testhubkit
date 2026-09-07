/**
 * 文档工具 · 双击列缝自动列宽（仅当前列、仅有内容的列；空列不改动）
 * 仅 doc-tools-page，与 tc-vxe-table 完全隔离。
 */
(function () {
    'use strict';

    if (!document.body.classList.contains('doc-tools-page')) return;

    var FLAG_KEY = '__dtkColAutoFitDblclickUntil';
    var FLAG_TTL_MS = 1200;
    var MAX_COL_WIDTH = 960;
    var MIN_COL_WIDTH = 40;
    var MOUNT_ID = 'dtk-vxe-table-mount';

    var measureCanvas = null;
    var cachedFont = '';

    function getMount() {
        return document.getElementById(MOUNT_ID);
    }

    function isColumnResizeTarget(event) {
        var target = event && event.target;
        if (!target || !target.closest) return false;
        if (target.closest('.vxe-cell--col-resizable, .vxe-table--header-column-resizable-area, .vxe-table--resizable-column-bar')) {
            return true;
        }
        if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return false;
        var mount = getMount();
        if (!mount) return false;
        var resizables = mount.querySelectorAll('.vxe-cell--col-resizable, .vxe-table--header-column-resizable-area');
        for (var i = 0; i < resizables.length; i += 1) {
            var el = resizables[i];
            var rect = el.getBoundingClientRect();
            if (event.clientX >= rect.left && event.clientX <= rect.right &&
                event.clientY >= rect.top && event.clientY <= rect.bottom) {
                return true;
            }
        }
        return false;
    }

    function isAllCellsAreaSelected(mount) {
        if (!mount) return false;
        var gridRoot = mount.querySelector('.dtk-vxe-grid');
        return !!(gridRoot && gridRoot.classList.contains('dtk-vxe-grid--all-cells-selected'));
    }

    function cellHasText(val) {
        return val != null && String(val).trim() !== '';
    }

    function getMeasureFont(mount) {
        if (cachedFont) return cachedFont;
        var sample = mount && mount.querySelector('.vxe-body--column .vxe-cell--wrapper, .vxe-body--column .vxe-cell');
        if (sample) {
            var st = window.getComputedStyle(sample);
            cachedFont = st.font || ((st.fontSize || '14px') + ' ' + (st.fontFamily || 'sans-serif'));
            return cachedFont;
        }
        cachedFont = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        return cachedFont;
    }

    function measureLineWidth(text, font) {
        if (!measureCanvas) measureCanvas = document.createElement('canvas');
        var ctx = measureCanvas.getContext('2d');
        ctx.font = font;
        return ctx.measureText(String(text == null ? '' : text)).width;
    }

    function measureCellTextWidth(text, font) {
        var raw = String(text == null ? '' : text).trim();
        if (!raw) return 0;
        var lines = raw.split('\n');
        var max = 0;
        for (var i = 0; i < lines.length; i += 1) {
            var line = lines[i].trim();
            if (!line) continue;
            max = Math.max(max, measureLineWidth(line, font));
        }
        return max;
    }

    function getFullTableRows(grid) {
        if (!grid || typeof grid.getTableData !== 'function') return [];
        var tableData = grid.getTableData();
        return (tableData && tableData.fullData) ? tableData.fullData : [];
    }

    function columnHasBodyContent(column, grid) {
        var field = column && column.field;
        if (!field) return false;
        var rows = getFullTableRows(grid);
        for (var i = 0; i < rows.length; i += 1) {
            if (cellHasText(rows[i] && rows[i][field])) return true;
        }
        return false;
    }

    function calcColumnFitWidth(column, grid, mount) {
        var field = column && column.field;
        if (!field || !columnHasBodyContent(column, grid)) return null;

        var font = getMeasureFont(mount);
        var maxTextW = 0;
        var rows = getFullTableRows(grid);
        for (var i = 0; i < rows.length; i += 1) {
            var row = rows[i];
            if (!row) continue;
            if (!cellHasText(row[field])) continue;
            var w = measureCellTextWidth(row[field], font);
            if (w > maxTextW) maxTextW = w;
        }
        if (maxTextW <= 0) return null;

        var cellPadding = 24;
        var sampleCell = mount.querySelector('.vxe-body--column .vxe-cell, .vxe-header--column .vxe-cell');
        if (sampleCell) {
            var st = window.getComputedStyle(sampleCell);
            cellPadding = Math.ceil(
                parseFloat(st.paddingLeft || 0) +
                parseFloat(st.paddingRight || 0) +
                parseFloat(st.borderLeftWidth || 0) +
                parseFloat(st.borderRightWidth || 0) + 8
            );
        }

        var fitWidth = Math.ceil(maxTextW + cellPadding);
        return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, fitWidth));
    }

    function resolveColumnFromResizeEvent(event, grid, mount) {
        var handle = event.target.closest(
            '.vxe-cell--col-resizable, .vxe-table--header-column-resizable-area, .vxe-table--resizable-column-bar'
        );
        if (!handle) return null;
        var headerCol = handle.closest('.vxe-header--column');
        if (!headerCol || !grid) return null;
        if (headerCol.classList.contains('col--seq')) return null;

        if (typeof grid.getColumnNode === 'function') {
            var node = grid.getColumnNode(headerCol);
            if (node && node.item) return node.item;
        }

        var headers = mount.querySelectorAll('.vxe-header--column:not(.col--seq)');
        for (var i = 0; i < headers.length; i += 1) {
            if (headers[i] === headerCol || headers[i].contains(handle)) {
                var cols = grid.getColumns ? grid.getColumns() : [];
                for (var j = 0; j < cols.length; j += 1) {
                    if (cols[j] && cols[j].field === 'c' + i) return cols[j];
                }
            }
        }
        return null;
    }

    function applyColumnWidth(grid, column, width, api) {
        if (!grid || !column || width == null) return Promise.resolve();
        var target = column.field;
        if (!target) return Promise.resolve();
        if (typeof grid.setColumnWidth !== 'function') return Promise.resolve();
        return Promise.resolve(grid.setColumnWidth(target, width)).then(function () {
            if (api && typeof api.notifyColumnResize === 'function') {
                api.notifyColumnResize({ column: column, resizeWidth: width });
            }
            if (typeof grid.recalculate === 'function') return grid.recalculate();
        });
    }

    function getDataColumns(grid) {
        if (!grid || typeof grid.getColumns !== 'function') return [];
        return grid.getColumns().filter(function (col) {
            return col && col.field && String(col.field).charAt(0) === 'c';
        });
    }

    function autofitAllColumns(grid, mount, api) {
        var cols = getDataColumns(grid);
        if (!cols.length) return Promise.resolve();
        globalThis[FLAG_KEY] = Date.now() + FLAG_TTL_MS;
        var chain = Promise.resolve();
        cols.forEach(function (column) {
            chain = chain.then(function () {
                var width = calcColumnFitWidth(column, grid, mount);
                if (width == null) return;
                return applyColumnWidth(grid, column, width, api);
            });
        });
        return chain;
    }

    function onColumnResizeDblclickCapture(event) {
        var mount = getMount();
        if (!mount || !isColumnResizeTarget(event)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        var table = globalThis.DocToolsVxeTable;
        if (!table || typeof table.ensureReady !== 'function') return;

        table.ensureReady().then(function (api) {
            var grid = api && api.gridRef && api.gridRef.value;
            if (!grid) return;

            if (isAllCellsAreaSelected(mount)) {
                return autofitAllColumns(grid, mount, api);
            }

            var column = resolveColumnFromResizeEvent(event, grid, mount);
            if (!column || column.type === 'seq') return;

            var width = calcColumnFitWidth(column, grid, mount);
            if (width == null) return;

            return applyColumnWidth(grid, column, width, api);
        }).catch(function () { /* ignore */ });
    }

    function initDocToolsColumnAutofit() {
        var mount = getMount();
        if (!mount || mount.getAttribute('data-dtk-col-autofit') === '1') return;
        mount.setAttribute('data-dtk-col-autofit', '1');
        mount.addEventListener('dblclick', onColumnResizeDblclickCapture, true);
    }

    function boot() {
        initDocToolsColumnAutofit();
        if (!getMount()) setTimeout(boot, 120);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
