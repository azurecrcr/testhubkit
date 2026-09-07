/**
 * 用例评审页（/share/tc/）表格布局：列隐藏、列宽拖拽、行高拖拽。
 * 独立于用例工作台 tc_table_chrome.js / VXE 表格，请勿复用或合并实现。
 */
(function (global) {
    'use strict';

    var STORAGE_PREFIX = 'tc_share_preview_layout_';
    var MIN_ROW_HEIGHT = 28;
    var DEFAULT_DATA_COL_WIDTH = 128;
    var DEFAULT_DATA_COL_MIN_WIDTH = 112;
    /** 行底缝隙命中区（对齐工作台 VXE：底边上 14px、下 8px） */
    var ROW_GAP_HIT_ABOVE = 14;
    var ROW_GAP_HIT_BELOW = 8;
    var ROW_RESIZE_LONG_PRESS_MS = 380;
    var ROW_RESIZE_DRAG_START_PX = 5;
    var ROW_RESIZE_CANCEL_HORIZONTAL_PX = 28;

    var shareToken = '';
    var sharePreviewTabulator = null;
    var rowResizeGesture = null;
    var layoutPrefs = {
        hiddenFields: {},
        columnWidths: {},
        rowHeights: {}
    };
    var layoutApplying = false;
    var scheduleTableResizeFn = null;
    var pageCtx = null;

    function $(id) { return document.getElementById(id); }

    function storageKey() {
        return STORAGE_PREFIX + (shareToken || '');
    }

    function isHideableDataColumnField(field) {
        return typeof field === 'string' && /^c\d+$/.test(field);
    }

    function loadLayoutPrefs(token) {
        shareToken = token || shareToken || '';
        layoutPrefs = { hiddenFields: {}, columnWidths: {}, rowHeights: {} };
        if (!shareToken) return;
        try {
            var raw = global.sessionStorage.getItem(storageKey());
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                layoutPrefs.hiddenFields = parsed.hiddenFields || {};
                layoutPrefs.columnWidths = parsed.columnWidths || {};
                layoutPrefs.rowHeights = parsed.rowHeights || {};
            }
        } catch (e) { /* ignore */ }
    }

    function saveLayoutPrefs() {
        if (!shareToken) return;
        try {
            global.sessionStorage.setItem(storageKey(), JSON.stringify({
                hiddenFields: layoutPrefs.hiddenFields,
                columnWidths: layoutPrefs.columnWidths,
                rowHeights: layoutPrefs.rowHeights
            }));
        } catch (e) { /* ignore */ }
    }

    function hideSharePreviewColumn(column) {
        if (!column || typeof column.getField !== 'function') return;
        if (!isHideableDataColumnField(column.getField())) return;
        var field = column.getField();
        column.hide();
        markSharePreviewColumnHidden(field);
    }

    function buildSharePreviewHideColumnMenu() {
        return [{
            label: '隐藏此列',
            action: function (e, target) {
                var column = target;
                if (target && typeof target.getColumn === 'function') {
                    column = target.getColumn();
                }
                hideSharePreviewColumn(column);
            }
        }];
    }

    function syncSharePreviewHiddenColumnsBar() {
        if (!pageCtx) return;
        updateSharePreviewRestoreColumnsBar(pageCtx.getSnapshot(), pageCtx.escHtml);
        if (typeof scheduleTableResizeFn === 'function') {
            scheduleTableResizeFn();
        }
    }

    function markSharePreviewColumnHidden(field) {
        if (!isHideableDataColumnField(field)) return;
        layoutPrefs.hiddenFields[field] = true;
        saveLayoutPrefs();
        syncSharePreviewHiddenColumnsBar();
    }

    function markSharePreviewColumnVisible(field) {
        if (!isHideableDataColumnField(field)) return;
        delete layoutPrefs.hiddenFields[field];
        saveLayoutPrefs();
        syncSharePreviewHiddenColumnsBar();
    }

    function bindSharePreviewHiddenColumnsBarEvents(bar) {
        if (!bar || bar._tcShareHiddenColClickBound) return;
        bar._tcShareHiddenColClickBound = true;
        bar.addEventListener('click', function (e) {
            var btn = e.target.closest && e.target.closest('.tc-share-hidden-columns__col');
            if (!btn || !bar.contains(btn)) return;
            e.preventDefault();
            e.stopPropagation();
            var field = btn.getAttribute('data-field');
            if (!field) return;
            var tab = pageCtx && typeof pageCtx.getTabulator === 'function'
                ? pageCtx.getTabulator()
                : null;
            if (tab && typeof tab.showColumn === 'function') {
                tab.showColumn(field);
            }
            markSharePreviewColumnVisible(field);
        });
    }

    function ensureSharePreviewHiddenColumnsBar() {
        var bar = $('tc-share-hidden-columns');
        if (bar) return bar;
        var main = $('tc-share-preview-main');
        var body = document.querySelector('.tc-share-preview__body');
        if (!main || !body) return null;
        bar = document.createElement('div');
        bar.id = 'tc-share-hidden-columns';
        bar.className = 'tc-share-hidden-columns hidden';
        bar.setAttribute('aria-live', 'polite');
        bar.setAttribute('aria-label', '已隐藏的列');
        main.insertBefore(bar, body);
        return bar;
    }

    function updateSharePreviewRestoreColumnsBar(snapshot, escHtml) {
        if (!snapshot) return;
        var bar = ensureSharePreviewHiddenColumnsBar();
        if (!bar) return;
        var cols = snapshot.columns || [];
        var hidden = [];
        cols.forEach(function (name, ci) {
            var field = 'c' + ci;
            if (layoutPrefs.hiddenFields[field]) {
                hidden.push({ field: field, name: name || ('列' + (ci + 1)) });
            }
        });
        if (!hidden.length) {
            bar.classList.add('hidden');
            bar.innerHTML = '';
            bar.setAttribute('aria-hidden', 'true');
            return;
        }
        bar.classList.remove('hidden');
        bar.setAttribute('aria-hidden', 'false');
        bar.innerHTML =
            '<div class="tc-share-hidden-columns__head">' +
                '<span class="tc-share-hidden-columns__title">已隐藏列</span>' +
                '<span class="tc-share-hidden-columns__hint">点击列名恢复显示</span>' +
            '</div>' +
            '<div class="tc-share-hidden-columns__list">' +
                hidden.map(function (item) {
                    return '<button type="button" class="tc-share-hidden-columns__col" data-field="' +
                        escHtml(item.field) + '" title="恢复「' + escHtml(item.name) + '」列">' +
                        '<span class="tc-share-hidden-columns__col-name">' + escHtml(item.name) + '</span>' +
                        '</button>';
                }).join('') +
            '</div>';
        bindSharePreviewHiddenColumnsBarEvents(bar);
        if (typeof scheduleTableResizeFn === 'function') {
            scheduleTableResizeFn();
        }
    }

    function onSharePreviewColumnResized(column) {
        if (!column || layoutApplying) return;
        var field = column.getField();
        if (!field) return;
        layoutPrefs.columnWidths[field] = column.getWidth();
        saveLayoutPrefs();
    }

    function onSharePreviewColumnVisibilityChanged(column, visible) {
        if (!column) return;
        var field = column.getField();
        if (!isHideableDataColumnField(field)) return;
        if (visible) {
            delete layoutPrefs.hiddenFields[field];
        } else {
            layoutPrefs.hiddenFields[field] = true;
        }
        saveLayoutPrefs();
        syncSharePreviewHiddenColumnsBar();
        scheduleSharePreviewEqualColumnWidths(sharePreviewTabulator);
    }

    function onSharePreviewRowHeightChanged(row) {
        if (!row || layoutApplying) return;
        var idx = row.getData()._rowIndex;
        var h = row.getHeight();
        if (!h || h < MIN_ROW_HEIGHT) return;
        layoutPrefs.rowHeights[String(idx)] = h;
        saveLayoutPrefs();
    }

    function removeSharePreviewRowResizeDocListeners() {
        document.removeEventListener('pointermove', onSharePreviewRowResizePointerMove, true);
        document.removeEventListener('pointerup', onSharePreviewRowResizePointerUp, true);
        document.removeEventListener('pointercancel', onSharePreviewRowResizePointerUp, true);
    }

    function clearSharePreviewRowResizeGesture() {
        if (rowResizeGesture && rowResizeGesture.timer) {
            clearTimeout(rowResizeGesture.timer);
        }
        if (rowResizeGesture && rowResizeGesture.rowEl) {
            rowResizeGesture.rowEl.classList.remove('tc-share-row-gap-pressing');
            rowResizeGesture.rowEl.classList.remove('tc-share-row-gap-armed');
        }
        document.body.classList.remove('tc-share-preview-row-resizing');
        rowResizeGesture = null;
    }

    function teardownSharePreviewRowResizeGestures() {
        removeSharePreviewRowResizeDocListeners();
        clearSharePreviewRowResizeGesture();
        sharePreviewTabulator = null;
    }

    function findSharePreviewRowGapElement(event, tableRoot) {
        if (!tableRoot || typeof event.clientY !== 'number' || typeof event.clientX !== 'number') {
            return null;
        }
        var rows = tableRoot.querySelectorAll('.tabulator-row');
        for (var i = 0; i < rows.length; i++) {
            var rowEl = rows[i];
            if (rowEl.classList.contains('tabulator-calcs')) continue;
            var rect = rowEl.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            if (event.clientY < rect.bottom - ROW_GAP_HIT_ABOVE || event.clientY > rect.bottom + ROW_GAP_HIT_BELOW) {
                continue;
            }
            if (event.clientX < rect.left || event.clientX > rect.right) continue;
            return rowEl;
        }
        return null;
    }

    function getSharePreviewRowResizeRoot(instance) {
        if (!instance || !instance.element) return null;
        return instance.element.querySelector('.tabulator-tableholder') || instance.element;
    }

    function getSharePreviewTabulatorRowFromElement(rowEl) {
        if (!sharePreviewTabulator || !rowEl) return null;
        if (typeof sharePreviewTabulator.getRow === 'function') {
            var viaApi = sharePreviewTabulator.getRow(rowEl);
            if (viaApi) return viaApi;
        }
        if (typeof sharePreviewTabulator.getRows !== 'function') return null;
        var rows = sharePreviewTabulator.getRows();
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].getElement && rows[i].getElement() === rowEl) return rows[i];
        }
        return null;
    }

    function activateSharePreviewRowResizeGesture() {
        if (!rowResizeGesture || rowResizeGesture.phase === 'active') return;
        if (rowResizeGesture.timer) {
            clearTimeout(rowResizeGesture.timer);
            rowResizeGesture.timer = null;
        }
        rowResizeGesture.phase = 'active';
        if (rowResizeGesture.rowEl) {
            rowResizeGesture.rowEl.classList.remove('tc-share-row-gap-pressing');
            rowResizeGesture.rowEl.classList.add('tc-share-row-gap-armed');
        }
        document.body.classList.add('tc-share-preview-row-resizing');
        try {
            var root = getSharePreviewRowResizeRoot(sharePreviewTabulator);
            if (root) root.setPointerCapture(rowResizeGesture.pointerId);
        } catch (err) { /* ignore */ }
    }

    function applySharePreviewRowResizeHeight(clientY) {
        if (!rowResizeGesture || rowResizeGesture.phase !== 'active') return;
        var delta = clientY - rowResizeGesture.startY;
        var newH = Math.max(MIN_ROW_HEIGHT, rowResizeGesture.startHeight + delta);
        rowResizeGesture.row.setHeight(newH);
        if (typeof scheduleTableResizeFn === 'function') {
            scheduleTableResizeFn();
        }
    }

    function onSharePreviewRowResizePointerMove(e) {
        if (!rowResizeGesture || e.pointerId !== rowResizeGesture.pointerId) return;
        var dx = e.clientX - rowResizeGesture.startX;
        var dy = e.clientY - rowResizeGesture.startY;

        if (rowResizeGesture.phase === 'pending') {
            if (Math.abs(dx) > ROW_RESIZE_CANCEL_HORIZONTAL_PX) {
                removeSharePreviewRowResizeDocListeners();
                clearSharePreviewRowResizeGesture();
                return;
            }
            if (Math.abs(dy) >= ROW_RESIZE_DRAG_START_PX && Math.abs(dy) > Math.abs(dx)) {
                activateSharePreviewRowResizeGesture();
            } else {
                return;
            }
        }

        if (rowResizeGesture.phase === 'active') {
            e.preventDefault();
            applySharePreviewRowResizeHeight(e.clientY);
        }
    }

    function onSharePreviewRowResizePointerUp(e) {
        if (!rowResizeGesture || e.pointerId !== rowResizeGesture.pointerId) return;
        removeSharePreviewRowResizeDocListeners();
        clearSharePreviewRowResizeGesture();
    }

    function onSharePreviewRowResizePointerDown(e) {
        if (e.button !== 0 || !sharePreviewTabulator || rowResizeGesture) return;
        var tableRoot = getSharePreviewRowResizeRoot(sharePreviewTabulator);
        if (!tableRoot || !tableRoot.contains(e.target)) return;
        var rowEl = findSharePreviewRowGapElement(e, tableRoot);
        if (!rowEl) return;
        var row = getSharePreviewTabulatorRowFromElement(rowEl);
        if (!row || typeof row.getHeight !== 'function' || typeof row.setHeight !== 'function') return;

        e.preventDefault();
        e.stopPropagation();

        var startHeight = row.getHeight();
        if (!startHeight || startHeight < MIN_ROW_HEIGHT) {
            var rect = rowEl.getBoundingClientRect();
            startHeight = Math.max(MIN_ROW_HEIGHT, Math.round(rect.height || MIN_ROW_HEIGHT));
        }

        var gesture = {
            row: row,
            rowEl: rowEl,
            startX: e.clientX,
            startY: e.clientY,
            startHeight: startHeight,
            phase: 'pending',
            pointerId: e.pointerId
        };
        rowEl.classList.add('tc-share-row-gap-pressing');
        gesture.timer = setTimeout(function () {
            activateSharePreviewRowResizeGesture();
        }, ROW_RESIZE_LONG_PRESS_MS);
        rowResizeGesture = gesture;

        document.addEventListener('pointermove', onSharePreviewRowResizePointerMove, true);
        document.addEventListener('pointerup', onSharePreviewRowResizePointerUp, true);
        document.addEventListener('pointercancel', onSharePreviewRowResizePointerUp, true);
    }

    function bindSharePreviewRowResizeGestures(instance) {
        if (!instance) return;
        sharePreviewTabulator = instance;
        var root = getSharePreviewRowResizeRoot(instance);
        if (!root || root._tcShareRowResizeBound) return;
        root._tcShareRowResizeBound = true;
        root.addEventListener('pointerdown', onSharePreviewRowResizePointerDown, true);
    }

    function applySharePreviewRowLayout(row) {
        if (!pageCtx || !row) return;
        pageCtx.decorateRowElement(row, row.getData()._rowIndex);
        var savedH = layoutPrefs.rowHeights[String(row.getData()._rowIndex)];
        if (savedH && savedH >= MIN_ROW_HEIGHT) {
            row.setHeight(savedH);
        }
    }

    function getSharePreviewFixedColumnWidth(field) {
        if (field === '_rowIndex') return 56;
        if (field === '_actions') return 108;
        return 0;
    }

    function applySharePreviewEqualColumnWidths(instance) {
        if (!instance || layoutApplying) return;
        var root = instance.element;
        if (!root) return;
        var tableWidth = root.clientWidth;
        if (!tableWidth || tableWidth < 120) return;

        var columns = typeof instance.getColumns === 'function' ? instance.getColumns() : [];
        if (!columns.length) return;

        var fixedTotal = 0;
        var flexCols = [];
        columns.forEach(function (col) {
            if (!col || typeof col.isVisible !== 'function' || !col.isVisible()) return;
            var field = col.getField();
            var fixed = getSharePreviewFixedColumnWidth(field);
            if (fixed > 0) {
                fixedTotal += fixed;
            } else if (isHideableDataColumnField(field)) {
                flexCols.push(col);
            }
        });

        if (!flexCols.length) return;

        var remaining = tableWidth - fixedTotal;
        if (remaining <= flexCols.length * DEFAULT_DATA_COL_MIN_WIDTH) {
            remaining = flexCols.length * DEFAULT_DATA_COL_MIN_WIDTH;
        }
        var each = Math.max(DEFAULT_DATA_COL_MIN_WIDTH, Math.floor(remaining / flexCols.length));

        layoutApplying = true;
        try {
            columns.forEach(function (col) {
                if (!col || typeof col.isVisible !== 'function' || !col.isVisible()) return;
                if (typeof col.setWidth !== 'function') return;
                var field = col.getField();
                var fixed = getSharePreviewFixedColumnWidth(field);
                if (fixed > 0) {
                    col.setWidth(fixed);
                }
            });
            flexCols.forEach(function (col) {
                col.setWidth(each);
            });
        } finally {
            layoutApplying = false;
        }
    }

    function scheduleSharePreviewEqualColumnWidths(instance) {
        if (!instance) return;
        global.requestAnimationFrame(function () {
            global.requestAnimationFrame(function () {
                applySharePreviewEqualColumnWidths(instance);
            });
        });
    }

    function applySharePreviewSavedRowHeights(tabulator) {
        if (!tabulator) return;
        layoutApplying = true;
        try {
            tabulator.getRows().forEach(applySharePreviewRowLayout);
        } finally {
            layoutApplying = false;
        }
    }

    function buildSharePreviewDataColumnDef(name, ci) {
        var field = 'c' + ci;
        var hideMenu = buildSharePreviewHideColumnMenu();
        return {
            title: name,
            field: field,
            minWidth: DEFAULT_DATA_COL_MIN_WIDTH,
            widthGrow: 0,
            visible: !layoutPrefs.hiddenFields[field],
            resizable: 'header',
            headerSort: false,
            headerTooltip: name,
            headerHozAlign: 'center',
            hozAlign: 'center',
            headerVertAlign: 'middle',
            vertAlign: 'middle',
            tooltip: true,
            formatter: 'textarea',
            headerMenu: hideMenu,
            headerContextMenu: hideMenu,
            contextMenu: hideMenu
        };
    }

    function buildSharePreviewTableLayoutOptions(tableHeight, tableCore) {
        return {
            data: tableCore.buildTableData(),
            columns: tableCore.buildTableColumns(),
            layout: 'fitColumns',
            height: tableHeight,
            reactiveData: false,
            selectable: false,
            movableColumns: true,
            resizableRows: false,
            resizableColumnGuide: true,
            columnDefaults: {
                headerWordWrap: true,
                headerVertical: false,
                headerVertAlign: 'middle',
                headerHozAlign: 'center',
                hozAlign: 'center',
                vertAlign: 'middle',
                resizable: 'header',
                headerSort: false,
                minWidth: DEFAULT_DATA_COL_MIN_WIDTH
            },
            placeholder: '暂无用例数据',
            rowFormatter: applySharePreviewRowLayout,
            tableBuilt: function () {
                var instance = typeof tableCore.getTabulator === 'function'
                    ? tableCore.getTabulator()
                    : tableCore.tabulator;
                if (instance) {
                    applySharePreviewSavedRowHeights(instance);
                    bindSharePreviewRowResizeGestures(instance);
                    scheduleSharePreviewEqualColumnWidths(instance);
                }
                if (pageCtx) {
                    updateSharePreviewRestoreColumnsBar(pageCtx.getSnapshot(), pageCtx.escHtml);
                }
            },
            columnResized: onSharePreviewColumnResized
        };
    }

    function bindSharePreviewTabulatorLayoutEvents(instance) {
        if (!instance || instance._tcSharePreviewLayoutBound) return;
        instance._tcSharePreviewLayoutBound = true;
        sharePreviewTabulator = instance;
        instance.on('rowHeight', onSharePreviewRowHeightChanged);
        instance.on('columnVisibilityChanged', onSharePreviewColumnVisibilityChanged);
        bindSharePreviewRowResizeGestures(instance);
    }

    function trySharePreviewRestoreColumnClick(target, tabulator) {
        if (!target || !tabulator) return false;
        var restoreBtn = target.closest && target.closest('.tc-share-hidden-columns__col');
        if (!restoreBtn) return false;
        var bar = $('tc-share-hidden-columns');
        if (!bar || !bar.contains(restoreBtn)) return false;
        var field = restoreBtn.getAttribute('data-field');
        if (field && typeof tabulator.showColumn === 'function') {
            tabulator.showColumn(field);
            markSharePreviewColumnVisible(field);
        }
        return true;
    }

    function getSharePreviewRestoreBarChromeHeight() {
        return 0;
    }

    function configureSharePreviewTableLayout(options) {
        options = options || {};
        shareToken = options.token || '';
        scheduleTableResizeFn = options.scheduleTableResize || null;
        pageCtx = options.pageCtx || null;
        loadLayoutPrefs(shareToken);
    }

    global.TcSharePreviewTableLayout = {
        configure: configureSharePreviewTableLayout,
        loadPrefs: loadLayoutPrefs,
        buildDataColumnDef: buildSharePreviewDataColumnDef,
        buildTableLayoutOptions: buildSharePreviewTableLayoutOptions,
        bindTabulator: bindSharePreviewTabulatorLayoutEvents,
        teardownTabulator: teardownSharePreviewRowResizeGestures,
        applySavedRowHeights: applySharePreviewSavedRowHeights,
        syncEqualColumnWidths: applySharePreviewEqualColumnWidths,
        updateRestoreColumnsBar: updateSharePreviewRestoreColumnsBar,
        tryRestoreColumnClick: trySharePreviewRestoreColumnClick,
        getRestoreBarChromeHeight: getSharePreviewRestoreBarChromeHeight
    };
})(typeof window !== 'undefined' ? window : this);
