/**
 * 文档工具 · 双击行缝自动行高（仅当前行、仅有内容的行；空行不改动）
 * 基于全表数据 + DOM 测量换行高度，绕过 vxe 虚拟滚动 DOM 逐次测量。
 * 仅 doc-tools-page，与 tc-vxe-table 完全隔离。
 */
(function () {
    'use strict';

    if (!document.body.classList.contains('doc-tools-page')) return;

    var FLAG_UNTIL_KEY = '__dtkRowAutoFitDblclickUntil';
    var FLAG_ROW_KEY = '__dtkRowAutoFitRowId';
    var FLAG_TTL_MS = 1200;
    var MIN_ROW_HEIGHT = 32;
    var MAX_ROW_HEIGHT = 800;
    var MOUNT_ID = 'dtk-vxe-table-mount';

    var measureEl = null;
    var cachedFont = '';

    function getMount() {
        return document.getElementById(MOUNT_ID);
    }

    function isRowResizeTarget(event) {
        var target = event && event.target;
        if (!target || !target.closest) return false;
        if (target.closest('.vxe-cell--row-resizable, .vxe-table--row-resizable-area, .vxe-table--resizable-row-bar')) {
            return true;
        }
        if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return false;
        var mount = getMount();
        if (!mount) return false;
        var areas = mount.querySelectorAll('.vxe-cell--row-resizable, .vxe-table--row-resizable-area');
        for (var i = 0; i < areas.length; i += 1) {
            var el = areas[i];
            var rect = el.getBoundingClientRect();
            if (event.clientX >= rect.left && event.clientX <= rect.right &&
                event.clientY >= rect.top && event.clientY <= rect.bottom) {
                return true;
            }
        }
        return false;
    }

    var BODY_ROW_GAP_HIT_PX = 14;

    function getBodyRowGapHitRowElement(event) {
        if (typeof event.clientY !== 'number' || typeof event.clientX !== 'number') return null;
        var mount = getMount();
        if (!mount) return null;
        var y = event.clientY;
        var x = event.clientX;
        var rows = mount.querySelectorAll('.vxe-body--row');
        for (var i = 0; i < rows.length; i += 1) {
            var rowEl = rows[i];
            var rowRect = rowEl.getBoundingClientRect();
            if (x < rowRect.left || x > rowRect.right) continue;
            if (y >= rowRect.bottom - BODY_ROW_GAP_HIT_PX && y <= rowRect.bottom + BODY_ROW_GAP_HIT_PX) {
                return rowEl;
            }
        }
        return null;
    }

    function isTableBodyRowGapTarget(event) {
        return !!getBodyRowGapHitRowElement(event);
    }

    function isRowResizeOrBodyGapTarget(event) {
        return isRowResizeTarget(event) || isTableBodyRowGapTarget(event);
    }

    function isAllCellsAreaSelected(mount) {
        if (!mount) return false;
        var gridRoot = mount.querySelector('.dtk-vxe-grid');
        return !!(gridRoot && gridRoot.classList.contains('dtk-vxe-grid--all-cells-selected'));
    }

    function cellHasText(val) {
        return val != null && String(val).trim() !== '';
    }

    function getMeasureEl() {
        if (measureEl) return measureEl;
        measureEl = document.createElement('div');
        measureEl.setAttribute('aria-hidden', 'true');
        measureEl.style.cssText = [
            'position:fixed',
            'left:-10000px',
            'top:-10000px',
            'visibility:hidden',
            'box-sizing:border-box',
            'white-space:pre-wrap',
            'word-wrap:break-word',
            'word-break:break-word',
            'overflow:hidden'
        ].join(';');
        document.body.appendChild(measureEl);
        return measureEl;
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

    function getFullTableRows(grid) {
        if (!grid || typeof grid.getTableData !== 'function') return [];
        var tableData = grid.getTableData();
        return (tableData && tableData.fullData) ? tableData.fullData : [];
    }

    function getDataColumns(grid) {
        if (!grid || typeof grid.getColumns !== 'function') return [];
        var cols = grid.getColumns();
        var out = [];
        for (var i = 0; i < cols.length; i += 1) {
            var col = cols[i];
            if (col && col.field && col.type !== 'seq') out.push(col);
        }
        return out;
    }

    function getColumnWidthPx(grid, column) {
        if (!column) return 120;
        if (column.renderWidth) return Math.round(column.renderWidth);
        if (column.width) {
            var n = parseInt(column.width, 10);
            if (!Number.isNaN(n) && n > 0) return n;
        }
        if (grid && typeof grid.getColumnWidth === 'function' && column.field) {
            var w = grid.getColumnWidth(column.field);
            if (w) return Math.round(w);
        }
        return 120;
    }

    function rowHasBodyContent(row, grid) {
        if (!row) return false;
        var cols = getDataColumns(grid);
        for (var i = 0; i < cols.length; i += 1) {
            if (cellHasText(row[cols[i].field])) return true;
        }
        return false;
    }

    function calcRowFitHeight(row, grid, mount) {
        if (!row || !rowHasBodyContent(row, grid)) return null;

        var font = getMeasureFont(mount);
        var el = getMeasureEl();
        el.style.font = font;

        var sampleCell = mount.querySelector('.vxe-body--column .vxe-cell');
        var padT = 6;
        var padB = 6;
        var padL = 8;
        var padR = 8;
        var lineHeight = '1.5';
        if (sampleCell) {
            var st = window.getComputedStyle(sampleCell);
            padT = parseFloat(st.paddingTop) || padT;
            padB = parseFloat(st.paddingBottom) || padB;
            padL = parseFloat(st.paddingLeft) || padL;
            padR = parseFloat(st.paddingRight) || padR;
            lineHeight = st.lineHeight || lineHeight;
        }

        var maxH = MIN_ROW_HEIGHT;
        var cols = getDataColumns(grid);
        for (var c = 0; c < cols.length; c += 1) {
            var col = cols[c];
            var text = row[col.field];
            if (!cellHasText(text)) continue;

            var colW = getColumnWidthPx(grid, col);
            var innerW = Math.max(24, colW - padL - padR);
            el.style.width = innerW + 'px';
            el.style.padding = padT + 'px ' + padR + 'px ' + padB + 'px ' + padL + 'px';
            el.style.lineHeight = String(lineHeight);
            el.textContent = String(text);
            maxH = Math.max(maxH, el.offsetHeight);
        }

        return Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, Math.ceil(maxH)));
    }

    function resolveRowFromResizeEvent(event, grid, mount) {
        var rowEl = getBodyRowGapHitRowElement(event);
        if (!rowEl) {
            var handle = event.target.closest(
                '.vxe-cell--row-resizable, .vxe-table--row-resizable-area, .vxe-table--resizable-row-bar'
            );
            if (!handle) return null;
            rowEl = handle.closest('.vxe-body--row');
        }
        if (!rowEl || !grid) return null;

        if (typeof grid.getRowNode === 'function') {
            var node = grid.getRowNode(rowEl);
            if (node && node.item) return node.item;
        }

        var rowid = rowEl.getAttribute('rowid');
        if (!rowid) return null;
        var rows = getFullTableRows(grid);
        for (var i = 0; i < rows.length; i += 1) {
            if (rows[i] && rows[i]._rowId === rowid) return rows[i];
        }
        return null;
    }

    function applyRowHeight(grid, row, height, api) {
        if (!grid || !row || !row._rowId || height == null) return Promise.resolve();
        if (typeof grid.setRowHeightConf !== 'function') return Promise.resolve();
        var conf = (typeof grid.getRowHeightConf === 'function' ? grid.getRowHeightConf(true) : {}) || {};
        conf[row._rowId] = height;
        return Promise.resolve(grid.setRowHeightConf(conf)).then(function () {
            if (typeof grid.recalculate === 'function') return grid.recalculate();
        }).then(function () {
            if (api && typeof api.notifyRowResizeChange === 'function') {
                api.notifyRowResizeChange({ row: row, height: height });
            }
        });
    }

    function autofitAllRows(grid, mount, api) {
        var rows = getFullTableRows(grid);
        if (!rows.length) return Promise.resolve();
        globalThis[FLAG_UNTIL_KEY] = Date.now() + FLAG_TTL_MS;
        var chain = Promise.resolve();
        rows.forEach(function (row) {
            chain = chain.then(function () {
                var height = calcRowFitHeight(row, grid, mount);
                if (height == null) return;
                globalThis[FLAG_ROW_KEY] = row._rowId;
                return applyRowHeight(grid, row, height, api);
            });
        });
        return chain;
    }

    function onRowResizeDblclickCapture(event) {
        var mount = getMount();
        if (!mount || !isRowResizeOrBodyGapTarget(event)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        var table = globalThis.DocToolsVxeTable;
        if (!table || typeof table.ensureReady !== 'function') return;

        table.ensureReady().then(function (api) {
            var grid = api && api.gridRef && api.gridRef.value;
            if (!grid) return;

            if (isAllCellsAreaSelected(mount)) {
                return autofitAllRows(grid, mount, api);
            }

            var row = resolveRowFromResizeEvent(event, grid, mount);
            if (!row) return;

            var height = calcRowFitHeight(row, grid, mount);
            if (height == null) return;

            return applyRowHeight(grid, row, height, api);
        }).catch(function () { /* ignore */ });
    }

    function initDocToolsRowAutofit() {
        var mount = getMount();
        if (!mount || mount.getAttribute('data-dtk-row-autofit') === '1') return;
        mount.setAttribute('data-dtk-row-autofit', '1');
        mount.addEventListener('dblclick', onRowResizeDblclickCapture, true);
    }

    function boot() {
        initDocToolsRowAutofit();
        if (!getMount()) setTimeout(boot, 120);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
