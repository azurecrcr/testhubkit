/**
 * 文档工具 · 表格列/行拖拽调整（仅 doc-tools-page，与 tc-vxe-table 完全隔离）
 * 同步 capture mousedown，移动超过阈值后才进入拖拽，避免干扰双击自适应。
 */
(function () {
    'use strict';

    if (!document.body.classList.contains('doc-tools-page')) return;

    var MIN_COL_WIDTH = 40;
    var MIN_ROW_HEIGHT = 32;
    var MOUNT_ID = 'dtk-vxe-table-mount';
    var EDGE_THRESHOLD = 10;
    var DRAG_THRESHOLD = 4;
    var COL_SUPPRESS_KEY = '__dtkCustomColDragSuppressUntil';
    var COL_ACTIVE_KEY = '__dtkCustomColDragActive';
    var SUPPRESS_MS = 900;
    var dragState = null;
    var pendingDrag = null;
    var rowRecalcRaf = 0;
    var dragScrollTargets = [];

    function getMount() {
        return document.getElementById(MOUNT_ID);
    }

    function getDocToolsTable() {
        return globalThis.DocToolsVxeTable || null;
    }

    function getGrid() {
        var table = getDocToolsTable();
        if (!table || typeof table.getApi !== 'function') return null;
        var api = table.getApi();
        if (!api || !api.gridRef || !api.gridRef.value) return null;
        return api.gridRef.value;
    }

    function isAllCellsSelected(mount) {
        var gridRoot = mount && mount.querySelector('.dtk-vxe-grid');
        return !!(gridRoot && gridRoot.classList.contains('dtk-vxe-grid--all-cells-selected'));
    }

    function pointInRect(x, y, rect) {
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    function nearRightEdge(x, rect) {
        return Math.abs(x - rect.right) <= EDGE_THRESHOLD;
    }

    function nearBottomEdge(y, rect) {
        return Math.abs(y - rect.bottom) <= EDGE_THRESHOLD;
    }

    function resolveHeaderColFromPoint(mount, x, y) {
        if (!mount) return null;
        var handles = mount.querySelectorAll('.vxe-cell--col-resizable, .vxe-table--header-column-resizable-area');
        for (var i = 0; i < handles.length; i += 1) {
            var handle = handles[i];
            var rect = handle.getBoundingClientRect();
            if (pointInRect(x, y, rect)) {
                var col = handle.closest('.vxe-header--column');
                if (col && !col.classList.contains('col--seq')) return col;
            }
        }
        var headers = mount.querySelectorAll('.vxe-header--column:not(.col--seq)');
        for (var j = 0; j < headers.length; j += 1) {
            var header = headers[j];
            var hrect = header.getBoundingClientRect();
            if (y >= hrect.top && y <= hrect.bottom && nearRightEdge(x, hrect)) {
                return header;
            }
        }
        return null;
    }

    function resolveBodyRowFromPoint(mount, x, y) {
        if (!mount) return null;
        var handles = mount.querySelectorAll('.vxe-cell--row-resizable, .vxe-table--row-resizable-area');
        for (var i = 0; i < handles.length; i += 1) {
            var handle = handles[i];
            var rect = handle.getBoundingClientRect();
            if (pointInRect(x, y, rect)) {
                var row = handle.closest('.vxe-body--row');
                if (row) return row;
            }
        }
        var seqCells = mount.querySelectorAll('.vxe-body--column.col--seq');
        for (var j = 0; j < seqCells.length; j += 1) {
            var cell = seqCells[j];
            var crect = cell.getBoundingClientRect();
            if (x >= crect.left && x <= crect.right && nearBottomEdge(y, crect)) {
                return cell.closest('.vxe-body--row');
            }
        }
        return null;
    }

    function headerElToColumn(headerEl, grid) {
        if (!headerEl) return null;
        if (grid && typeof grid.getColumnNode === 'function') {
            var node = grid.getColumnNode(headerEl);
            if (node && node.item) return node.item;
        }
        var colId = headerEl.getAttribute('colid') || headerEl.getAttribute('col-id');
        if (colId && grid && typeof grid.getColumnByField === 'function') {
            return grid.getColumnByField(colId);
        }
        return { field: colId || null, renderWidth: headerEl.offsetWidth };
    }

    function rowElToRow(rowEl, grid) {
        if (!rowEl) return null;
        if (grid && typeof grid.getRowNode === 'function') {
            var node = grid.getRowNode(rowEl);
            if (node && node.item) return node.item;
        }
        var rowId = rowEl.getAttribute('rowid');
        return rowId ? { _rowId: rowId } : null;
    }

    function readRowHeight(grid, row) {
        if (!grid || !row || !row._rowId || typeof grid.getRowHeightConf !== 'function') {
            var rowEl = getMount() && getMount().querySelector('.vxe-body--row[rowid="' + row._rowId + '"]');
            return rowEl ? rowEl.offsetHeight : MIN_ROW_HEIGHT;
        }
        var conf = grid.getRowHeightConf(true) || {};
        var h = parseInt(conf[row._rowId], 10);
        return !Number.isNaN(h) && h >= MIN_ROW_HEIGHT ? h : MIN_ROW_HEIGHT;
    }

    function setBodyDragCursor(kind) {
        document.body.style.cursor = kind === 'col' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
    }

    function clearBodyDragCursor() {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    function scheduleRowDragRecalculate(grid) {
        if (rowRecalcRaf) return;
        rowRecalcRaf = requestAnimationFrame(function () {
            rowRecalcRaf = 0;
            var g = grid || (dragState && dragState.grid) || getGrid();
            if (g && typeof g.recalculate === 'function') {
                Promise.resolve(g.recalculate()).catch(function () { /* ignore */ });
            }
        });
    }

    function onDragScroll() {
        if (!dragState || dragState.kind !== 'row') return;
        if (dragState.lastClientY == null) return;
        applyLiveRowDragHeight(dragState, dragState.lastClientY);
    }

    function bindDragScrollTargets(mount) {
        unbindDragScrollTargets();
        if (!mount) return;
        var nodes = mount.querySelectorAll('.vxe-table--body-wrapper, .vxe-table--body-inner-wrapper');
        for (var i = 0; i < nodes.length; i += 1) {
            nodes[i].addEventListener('scroll', onDragScroll, true);
            dragScrollTargets.push(nodes[i]);
        }
        mount.addEventListener('scroll', onDragScroll, true);
        dragScrollTargets.push(mount);
    }

    function unbindDragScrollTargets() {
        for (var i = 0; i < dragScrollTargets.length; i += 1) {
            dragScrollTargets[i].removeEventListener('scroll', onDragScroll, true);
        }
        dragScrollTargets = [];
    }

    function resolveDragRowId(st, grid) {
        if (!st) return null;
        if (st.rowId) return st.rowId;
        if (st.row && st.row._rowId) return st.row._rowId;
        if (st.rowEl) {
            var fromEl = st.rowEl.getAttribute('rowid');
            if (fromEl) return fromEl;
            var mapped = rowElToRow(st.rowEl, grid);
            if (mapped && mapped._rowId) return mapped._rowId;
        }
        return null;
    }

    function readBodyScrollTop(mount) {
        if (!mount) return 0;
        var wrapper = mount.querySelector('.vxe-table--body-wrapper');
        return wrapper ? wrapper.scrollTop : 0;
    }

    function findRowElByRowId(mount, rowId) {
        if (!mount || !rowId) return null;
        return mount.querySelector('.vxe-body--row[rowid="' + rowId + '"]');
    }

    function computeRowDragHeight(st, clientY, grid, mount) {
        if (!st) return MIN_ROW_HEIGHT;
        var rowId = resolveDragRowId(st, grid);
        if (!rowId) {
            return Math.max(st.min, Math.round(st.startSize + (clientY - st.startY)));
        }
        var mountEl = st.mount || mount || getMount();
        var rowEl = findRowElByRowId(mountEl, rowId);
        if (rowEl) {
            var rect = rowEl.getBoundingClientRect();
            return Math.max(st.min, Math.round(clientY - rect.top));
        }
        var scrollDelta = readBodyScrollTop(mountEl) - (st.startScrollTop || 0);
        return Math.max(st.min, Math.round(st.startSize + (clientY - st.startY) + scrollDelta));
    }

    function applyLiveRowDragHeight(st, clientY) {
        if (!st || st.kind !== 'row') return;
        st.lastClientY = clientY;
        var grid = getGrid() || st.grid;
        var next = computeRowDragHeight(st, clientY, grid, st.mount);
        if (next === st.lastApplied) return;
        st.lastApplied = next;
        var rowId = resolveDragRowId(st, grid);
        if (rowId && grid && typeof grid.setRowHeightConf === 'function') {
            grid.setRowHeightConf(mergeRowHeightConf(grid, rowId, next));
            clearDtkResizeArtifacts(st.mount);
            scheduleRowDragRecalculate(grid);
        }
    }

    function clearPendingListeners() {
        document.removeEventListener('mousemove', onPendingMouseMove, true);
        document.removeEventListener('mouseup', onPendingMouseUp, true);
    }

    function endDrag(wasColDrag) {
        if (wasColDrag) markCustomColDragActive(false);
        if (rowRecalcRaf) {
            cancelAnimationFrame(rowRecalcRaf);
            rowRecalcRaf = 0;
        }
        unbindDragScrollTargets();
        dragState = null;
        clearBodyDragCursor();
        document.removeEventListener('mousemove', onDocMouseMove, true);
        document.removeEventListener('mouseup', onDocMouseUp, true);
    }

    function cancelPendingDrag() {
        pendingDrag = null;
        clearPendingListeners();
    }

    function markCustomColDragActive(active) {
        if (typeof globalThis === 'undefined') return;
        if (active) {
            globalThis[COL_ACTIVE_KEY] = true;
            return;
        }
        globalThis[COL_ACTIVE_KEY] = false;
        globalThis[COL_SUPPRESS_KEY] = Date.now() + SUPPRESS_MS;
    }

    function clearDtkResizeArtifacts(mount) {
        if (!mount) return;
        var selectors = [
            '.vxe-table--resizable-bar',
            '.vxe-table--resizable-row-bar',
            '.vxe-table--resizable-column-bar',
            '.vxe-table--resizable-wrapper',
            '.vxe-table--resizable-drag-line'
        ];
        selectors.forEach(function (sel) {
            mount.querySelectorAll(sel).forEach(function (el) {
                if (el && el.parentNode) el.parentNode.removeChild(el);
            });
        });
        mount.querySelectorAll('.vxe-header--column.col--resizable, .vxe-header--column.is--resizable').forEach(function (el) {
            el.classList.remove('col--resizable', 'is--resizable', 'is--drag-resize');
        });
        if (document.body) {
            document.body.querySelectorAll('.vxe-table--resizable-bar, .vxe-table--resizable-column-bar').forEach(function (el) {
                if (el && el.parentNode) el.parentNode.removeChild(el);
            });
        }
    }

    function applyColumnWidth(grid, column, width, mount) {
        if (!column) return Promise.resolve();
        var next = Math.max(MIN_COL_WIDTH, Math.round(width));
        var chain = Promise.resolve();
        if (grid && column.field && typeof grid.setColumnWidth === 'function') {
            chain = Promise.resolve(grid.setColumnWidth(column.field, next));
        }
        return chain.then(function () {
            if (grid && typeof grid.recalculate === 'function') {
                return Promise.resolve(grid.recalculate());
            }
        }).then(function () {
            clearDtkResizeArtifacts(mount || getMount());
            var api = getDocToolsTable() && typeof getDocToolsTable().getApi === 'function'
                ? getDocToolsTable().getApi() : null;
            if (api && typeof api.notifyColumnResize === 'function') {
                api.notifyColumnResize({ column: column, resizeWidth: next, fromCustomDrag: true });
            } else if (grid && typeof grid.$emit === 'function') {
                grid.$emit('resizable-change', { column: column, resizeWidth: next });
            }
        }).catch(function () { /* ignore */ });
    }

    function mergeRowHeightConf(grid, rowId, height) {
        var conf = {};
        if (grid && typeof grid.getRowHeightConf === 'function') {
            conf = grid.getRowHeightConf(true) || {};
        }
        conf[rowId] = height;
        return conf;
    }

    function applyRowHeight(grid, row, height, mount) {
        if (!row || !row._rowId) return Promise.resolve();
        var next = Math.max(MIN_ROW_HEIGHT, Math.round(height));
        var chain = Promise.resolve();
        if (grid && typeof grid.setRowHeightConf === 'function') {
            chain = Promise.resolve(grid.setRowHeightConf(mergeRowHeightConf(grid, row._rowId, next)));
        }
        return chain.then(function () {
            if (grid && typeof grid.recalculate === 'function') {
                return Promise.resolve(grid.recalculate());
            }
        }).then(function () {
            clearDtkResizeArtifacts(mount || getMount());
            var api = getDocToolsTable() && typeof getDocToolsTable().getApi === 'function'
                ? getDocToolsTable().getApi() : null;
            if (api && typeof api.notifyRowResizeChange === 'function') {
                api.notifyRowResizeChange({ row: row, height: next });
            } else if (grid && typeof grid.$emit === 'function') {
                grid.$emit('row-resizable-change');
            }
        }).catch(function () { /* ignore */ });
    }

    function promotePendingToDrag(event) {
        if (!pendingDrag) return;
        var st = pendingDrag;
        pendingDrag = null;
        clearPendingListeners();
        dragState = {
            kind: st.kind,
            startX: st.startX,
            startY: st.startY,
            startSize: st.startSize,
            lastApplied: st.startSize,
            lastClientY: event.clientY,
            startScrollTop: st.kind === 'row' ? readBodyScrollTop(st.mount) : 0,
            min: st.kind === 'col' ? MIN_COL_WIDTH : MIN_ROW_HEIGHT,
            grid: st.grid,
            column: st.column,
            row: st.row,
            rowId: st.rowId || (st.row && st.row._rowId) || (st.rowEl && st.rowEl.getAttribute('rowid')) || null,
            mount: st.mount,
            headerEl: st.headerEl,
            rowEl: st.rowEl
        };
        setBodyDragCursor(st.kind);
        if (st.kind === 'col') {
            markCustomColDragActive(true);
        } else {
            bindDragScrollTargets(st.mount);
            clearDtkResizeArtifacts(st.mount);
        }
        document.addEventListener('mousemove', onDocMouseMove, true);
        document.addEventListener('mouseup', onDocMouseUp, true);
        onDocMouseMove(event);
    }

    function onPendingMouseMove(event) {
        if (!pendingDrag || dragState) return;
        var dx = event.clientX - pendingDrag.startX;
        var dy = event.clientY - pendingDrag.startY;
        var delta = pendingDrag.kind === 'col' ? dx : dy;
        if (Math.abs(delta) < DRAG_THRESHOLD) return;
        event.preventDefault();
        event.stopPropagation();
        promotePendingToDrag(event);
    }

    function onPendingMouseUp() {
        cancelPendingDrag();
    }

    function onDocMouseMove(event) {
        if (!dragState) return;
        event.preventDefault();
        event.stopPropagation();
        var st = dragState;
        var grid = getGrid() || st.grid;
        if (st.kind === 'row') {
            applyLiveRowDragHeight(st, event.clientY);
            return;
        }
        var delta = event.clientX - st.startX;
        var next = Math.max(st.min, Math.round(st.startSize + delta));
        if (next === st.lastApplied) return;
        st.lastApplied = next;
        var column = headerElToColumn(st.headerEl, grid) || st.column;
        if (grid && column && column.field && typeof grid.setColumnWidth === 'function') {
            grid.setColumnWidth(column.field, next);
        }
    }

    function onDocMouseUp(event) {
        if (!dragState) return;
        event.preventDefault();
        event.stopPropagation();
        var st = dragState;
        var grid = getGrid() || st.grid;
        var wasCol = st.kind === 'col';
        var next;
        if (st.kind === 'row') {
            next = computeRowDragHeight(st, event.clientY, grid, st.mount);
        } else {
            next = Math.max(st.min, Math.round(st.startSize + (event.clientX - st.startX)));
        }
        endDrag(wasCol);
        if (st.kind === 'col') {
            var column = headerElToColumn(st.headerEl, grid) || st.column;
            applyColumnWidth(grid, column, next, st.mount);
        } else {
            var rowId = resolveDragRowId(st, grid);
            var row = (st.row && st.row._rowId) ? st.row : (rowId ? { _rowId: rowId } : null);
            applyRowHeight(grid, row, next, st.mount);
        }
    }

    function startPendingDrag(kind, event, mount, headerEl, rowEl) {
        if (pendingDrag || dragState) return;
        var grid = getGrid();
        var column = kind === 'col' ? headerElToColumn(headerEl, grid) : null;
        var row = kind === 'row' ? rowElToRow(rowEl, grid) : null;
        var startSize = MIN_COL_WIDTH;
        if (kind === 'col') {
            startSize = (column && column.renderWidth) || (headerEl && headerEl.offsetWidth) || MIN_COL_WIDTH;
        } else {
            startSize = readRowHeight(grid, row);
        }
        pendingDrag = {
            kind: kind,
            startX: event.clientX,
            startY: event.clientY,
            startSize: startSize,
            grid: grid,
            column: column,
            row: row,
            rowId: row && row._rowId ? row._rowId : (rowEl ? rowEl.getAttribute('rowid') : null),
            mount: mount,
            headerEl: headerEl,
            rowEl: rowEl
        };
        document.addEventListener('mousemove', onPendingMouseMove, true);
        document.addEventListener('mouseup', onPendingMouseUp, true);
        if (kind === 'col' || kind === 'row') {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    }

    function onMouseDownCapture(event) {
        if (event.button !== 0 || dragState || pendingDrag) return;
        var mount = getMount();
        if (!mount || !mount.contains(event.target)) return;

        var x = event.clientX;
        var y = event.clientY;
        var headerEl = resolveHeaderColFromPoint(mount, x, y);
        if (headerEl) {
            startPendingDrag('col', event, mount, headerEl, null);
            return;
        }
        var rowEl = resolveBodyRowFromPoint(mount, x, y);
        if (rowEl) {
            startPendingDrag('row', event, mount, null, rowEl);
        }
    }

    function bindMount(mount) {
        if (!mount || mount.getAttribute('data-dtk-drag-resize-v6') === '1') return;
        mount.setAttribute('data-dtk-drag-resize-v6', '1');
        mount.addEventListener('mousedown', onMouseDownCapture, true);
    }

    function initDocToolsTableDragResize() {
        bindMount(getMount());
    }

    function boot() {
        initDocToolsTableDragResize();
        if (!getMount()) {
            setTimeout(boot, 120);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
