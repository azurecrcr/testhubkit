/**
 * 表格侧生产力：全局搜索、列宽/行高撤销补录
 */
(function (global) {
    'use strict';

    var filterQuery = '';
    var wrapped = false;
    var resizeSession = null;

    function $(id) { return document.getElementById(id); }

    function rowHasData(rowIndex) {
        if (!global.testCasesData || !global.testCasesData[rowIndex]) return false;
        return global.testCasesData[rowIndex].some(function (cell) {
            return String(cell != null ? cell : '').trim() !== '';
        });
    }

    function rowMatchesFilter(rowIndex) {
        var q = String(filterQuery || '').trim().toLowerCase();
        if (!q) return true;
        if (!global.testCasesData || !global.testCasesData[rowIndex]) {
            return false;
        }
        var row = global.testCasesData[rowIndex];
        for (var i = 0; i < row.length; i++) {
            if (String(row[i] != null ? row[i] : '').toLowerCase().indexOf(q) >= 0) {
                return true;
            }
        }
        return false;
    }

    function countDataRows() {
        if (!global.testCasesData) return 0;
        var total = 0;
        for (var i = 0; i < global.testCasesData.length; i++) {
            if (rowHasData(i)) total += 1;
        }
        return total;
    }

    function isRowVisibleInFilter(rowIndex) {
        var q = String(filterQuery || '').trim();
        if (!q) return true;
        if (!rowHasData(rowIndex)) return false;
        return rowMatchesFilter(rowIndex);
    }

    function applyVxeTableRowFilter() {
        var mount = document.getElementById('tc-vxe-table-mount');
        if (!mount || !mount.querySelector('.vxe-grid')) return null;
        var q = String(filterQuery || '').trim();
        var rowEls = mount.querySelectorAll('.vxe-body--row');
        var visible = 0;
        var total = 0;
        rowEls.forEach(function (rowEl) {
            var rowid = rowEl.getAttribute('rowid');
            var idx = rowid && rowid.charAt(0) === 'r' ? parseInt(rowid.slice(1), 10) : NaN;
            if (isNaN(idx)) return;
            if (!rowHasData(idx)) {
                rowEl.classList.toggle('tc-table-row--filtered-out', !!q);
                return;
            }
            total += 1;
            var show = isRowVisibleInFilter(idx);
            rowEl.classList.toggle('tc-table-row--filtered-out', !show);
            if (show) visible += 1;
        });
        return { visible: visible, total: total, hasQuery: !!q };
    }

    function applyTableRowFilter() {
        var tbody = $('table-body');
        var q = String(filterQuery || '').trim();
        var meta = $('tc-table-filter-meta');
        var vxeResult = applyVxeTableRowFilter();
        if (!tbody) {
            var totalRows = countDataRows();
            var visibleRows = totalRows;
            if (vxeResult && vxeResult.hasQuery) {
                totalRows = vxeResult.total;
                visibleRows = vxeResult.visible;
            } else if (q && global.testCasesData) {
                visibleRows = 0;
                for (var i = 0; i < global.testCasesData.length; i++) {
                    if (rowHasData(i) && rowMatchesFilter(i)) visibleRows += 1;
                }
            }
            if (meta) {
                if (!q) meta.textContent = totalRows ? ('共 ' + totalRows + ' 行') : '';
                else meta.textContent = '匹配 ' + visibleRows + ' / ' + totalRows + ' 行';
            }
            return;
        }
        var rows = tbody.querySelectorAll('tr[data-row-index]');
        var visible = 0;
        var total = 0;
        rows.forEach(function (tr) {
            var idx = parseInt(tr.getAttribute('data-row-index'), 10);
            if (isNaN(idx)) return;
            if (!rowHasData(idx)) {
                tr.classList.toggle('tc-table-row--filtered-out', !!q);
                return;
            }
            total += 1;
            var show = rowMatchesFilter(idx);
            tr.classList.toggle('tc-table-row--filtered-out', !show);
            if (show) visible += 1;
        });
        if (meta) {
            if (!q) {
                meta.textContent = total ? ('共 ' + total + ' 行') : '';
            } else {
                meta.textContent = '显示 ' + visible + ' / ' + total + ' 行';
            }
        }
    }

    function afterTableRender() {
        applyTableRowFilter();
    }

    function wrapTableRenderers() {
        if (wrapped || typeof global.renderTableBody !== 'function') return false;
        var origBody = global.renderTableBody;
        global.renderTableBody = function () {
            origBody.apply(this, arguments);
            afterTableRender();
        };
        global.renderTableBody._tcProductivityWrapped = true;
        wrapped = true;
        return true;
    }

    function tcEnsureToolbarRightStack(mountParent) {
        if (!mountParent) return null;
        var stack = $('tc-table-toolbar-right-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'tc-table-toolbar-right-stack';
            stack.className = 'tc-table-toolbar-right-stack';
            mountParent.appendChild(stack);
        } else if (stack.parentElement !== mountParent) {
            mountParent.appendChild(stack);
        }
        var slot = $('tc-restore-columns-slot');
        if (!slot) {
            slot = document.createElement('div');
            slot.id = 'tc-restore-columns-slot';
            slot.className = 'tc-restore-columns-slot';
            slot.setAttribute('aria-label', '已隐藏列');
            stack.appendChild(slot);
        } else if (slot.parentElement !== stack) {
            stack.appendChild(slot);
        }
        var existingRestore = $('restore-columns');
        if (existingRestore && slot && existingRestore.parentElement !== slot) {
            slot.appendChild(existingRestore);
        }
        return stack;
    }

    function mountFilterBar() {
        var toolbar = $('table-toolbar');
        var mountParent = $('tc-table-toolbar-right') || $('tc-table-toolbar-center') || toolbar;
        var existingBar = $('tc-table-filter-bar');
        var stack = tcEnsureToolbarRightStack(mountParent);
        if (existingBar && stack) {
            if (existingBar.parentElement !== stack) {
                stack.insertBefore(existingBar, $('tc-restore-columns-slot'));
            }
            return;
        }
        if (!mountParent || existingBar) return;
        if (toolbar) toolbar.classList.add('tc-table-toolbar--with-filter');
        var bar = document.createElement('div');
        bar.id = 'tc-table-filter-bar';
        bar.className = 'tc-table-filter-bar';
        bar.innerHTML =
            '<div class="tc-table-filter-bar__main">' +
            '<div class="tc-table-filter-bar__search-wrap">' +
            '<input type="search" id="tc-table-filter-search" class="tc-table-filter-bar__search" ' +
            'placeholder="全局搜索表格内容" autocomplete="off" />' +
            '<button type="button" id="tc-table-filter-reset" class="tc-table-filter-bar__reset" ' +
            'title="清空搜索并显示全部用例" disabled>重置</button>' +
            '</div>' +
            '<span id="tc-table-filter-meta" class="tc-table-filter-bar__meta"></span>' +
            '</div>';
        if (stack) {
            var slot = $('tc-restore-columns-slot');
            stack.insertBefore(bar, slot || null);
        } else {
            mountParent.appendChild(bar);
        }

        var search = $('tc-table-filter-search');
        var resetBtn = $('tc-table-filter-reset');

        function syncResetButton() {
            if (!resetBtn) return;
            var hasQuery = !!(search && String(search.value || '').trim());
            resetBtn.disabled = !hasQuery;
        }

        function resetTableSearch() {
            filterQuery = '';
            if (search) {
                search.value = '';
                search.focus();
            }
            syncResetButton();
            afterTableRender();
        }

        if (search) {
            search.addEventListener('input', function () {
                filterQuery = search.value;
                syncResetButton();
                afterTableRender();
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', resetTableSearch);
        }
        syncResetButton();
    }

    function snapshotResizeDims() {
        return {
            actionColumnWidth: global.actionColumnWidth,
            columnWidth: Object.assign({}, global.columnWidth || {}),
            rowHeights: Object.assign({}, global.rowHeights || {})
        };
    }

    function resizeDimsChanged(before, after) {
        if (!before || !after) return false;
        if (before.actionColumnWidth !== after.actionColumnWidth) return true;
        var keys = Object.keys(after.rowHeights || {});
        var i;
        for (i = 0; i < keys.length; i++) {
            if (before.rowHeights[keys[i]] !== after.rowHeights[keys[i]]) return true;
        }
        keys = Object.keys(after.columnWidth || {});
        for (i = 0; i < keys.length; i++) {
            if (before.columnWidth[keys[i]] !== after.columnWidth[keys[i]]) return true;
        }
        return false;
    }

    function bindResizeUndo() {
        if (global._tcTableResizeUndoBound) return;
        global._tcTableResizeUndoBound = true;
        document.addEventListener('mousedown', function (e) {
            if (!e.target || !e.target.closest) return;
            if (!e.target.closest('#test-case-table')) return;
            if (!e.target.closest('.cursor-col-resize') && !e.target.closest('.tc-row-resize-handle')) return;
            resizeSession = { start: snapshotResizeDims() };
        }, true);
        document.addEventListener('mouseup', function () {
            if (!resizeSession) return;
            var after = snapshotResizeDims();
            if (resizeDimsChanged(resizeSession.start, after) && typeof global.tcTableRecordAfterMutation === 'function') {
                global.tcTableRecordAfterMutation();
            }
            resizeSession = null;
        });
    }

    function syncFilterBarVisibility() {
        var bar = $('tc-table-filter-bar');
        if (!bar) return;
        if (global.tcRightViewMode === 'mindmap') {
            bar.style.display = 'none';
        } else {
            bar.style.removeProperty('display');
        }
    }

    function hookViewSwitch() {
        if (typeof global.switchTcRightView !== 'function' || global.switchTcRightView._tcProdWrapped) return;
        var orig = global.switchTcRightView;
        global.switchTcRightView = function (mode) {
            try {
                return orig.apply(this, arguments);
            } finally {
                syncFilterBarVisibility();
            }
        };
        global.switchTcRightView._tcProdWrapped = true;
        syncFilterBarVisibility();
    }

    function init() {
        if (!document.querySelector('.tc-workbench-scope')) return;
        mountFilterBar();
        hookViewSwitch();
        bindResizeUndo();
        var tries = 0;
        var timer = global.setInterval(function () {
            if (wrapTableRenderers() || ++tries > 120) global.clearInterval(timer);
        }, 100);
    }

    global.TcTableProductivity = {
        init: init,
        refreshFilter: afterTableRender,
        syncFilterBarVisibility: syncFilterBarVisibility,
        getFilterQuery: function () { return filterQuery; },
        isRowVisibleInFilter: isRowVisibleInFilter
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);
