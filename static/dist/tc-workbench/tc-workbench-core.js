/* ---- tc_workbench_store.js ---- */
/**
 * TestHub 用例工作台 — TcWorkbenchStore（linkLegacy 双写，兼容既有全局变量）
 */
(function (global) {
  'use strict';

  var linked = null;
  var listeners = [];
  var batchDepth = 0;
  var pendingNotify = false;
  var debug = false;
  var patchRowCount = 0;
  var patchFlushTimer = null;

  function isLinked() {
    return linked && typeof linked.getTestCasesData === 'function';
  }

  function notify(path) {
    if (batchDepth > 0) {
      pendingNotify = true;
      return;
    }
    var p = path || '*';
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](p); } catch (e) { if (debug) console.warn('[TcWorkbenchStore]', e); }
    }
  }

  function endBatch() {
    batchDepth = Math.max(0, batchDepth - 1);
    if (batchDepth === 0 && pendingNotify) {
      pendingNotify = false;
      notify('*');
    }
  }

  function beginBatch() {
    batchDepth++;
  }

  function cloneRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(function (row) { return Array.isArray(row) ? row.slice() : []; });
  }

  function cloneProvenance(arr) {
    return Array.isArray(arr) ? arr.slice() : [];
  }

  function shiftIndexSet(setLike, deletedIndex) {
    var next = new Set();
    if (!setLike || typeof setLike.forEach !== 'function') return next;
    setLike.forEach(function (rowIndex) {
      if (rowIndex < deletedIndex) next.add(rowIndex);
      else if (rowIndex > deletedIndex) next.add(rowIndex - 1);
    });
    return next;
  }

  function shiftIndexSetMany(setLike, deletedIndexes) {
    var sorted = deletedIndexes.slice().sort(function (a, b) { return a - b; });
    var next = new Set();
    if (!setLike || typeof setLike.forEach !== 'function') return next;
    setLike.forEach(function (rowIndex) {
      var offset = 0;
      var drop = false;
      for (var i = 0; i < sorted.length; i++) {
        if (rowIndex === sorted[i]) { drop = true; break; }
        if (rowIndex > sorted[i]) offset++;
      }
      if (!drop) next.add(rowIndex - offset);
    });
    return next;
  }

  function remapRowHeightsAfterDelete(heights, deletedIndex) {
    var next = {};
    if (!heights || typeof heights !== 'object') return next;
    Object.keys(heights).forEach(function (k) {
      var idx = parseInt(k, 10);
      if (isNaN(idx)) return;
      if (idx < deletedIndex) next[idx] = heights[idx];
      else if (idx > deletedIndex) next[idx - 1] = heights[idx];
    });
    return next;
  }

  function shiftIndexSetAfterInsert(setLike, insertAt) {
    var next = new Set();
    if (!setLike || typeof setLike.forEach !== 'function') return next;
    setLike.forEach(function (rowIndex) {
      next.add(rowIndex >= insertAt ? rowIndex + 1 : rowIndex);
    });
    return next;
  }

  function remapRowHeightsAfterInsert(heights, insertAt) {
    var next = {};
    if (!heights || typeof heights !== 'object') return next;
    Object.keys(heights).forEach(function (k) {
      var idx = parseInt(k, 10);
      if (isNaN(idx)) return;
      next[idx >= insertAt ? idx + 1 : idx] = heights[idx];
    });
    return next;
  }


  function remapRowHeightsMany(heights, deletedIndexes) {
    var sorted = deletedIndexes.slice().sort(function (a, b) { return a - b; });
    var next = {};
    if (!heights || typeof heights !== 'object') return next;
    Object.keys(heights).forEach(function (k) {
      var idx = parseInt(k, 10);
      if (isNaN(idx)) return;
      var offset = 0;
      var drop = false;
      for (var i = 0; i < sorted.length; i++) {
        if (idx === sorted[i]) { drop = true; break; }
        if (idx > sorted[i]) offset++;
      }
      if (!drop) next[idx - offset] = heights[k];
    });
    return next;
  }

  function requestRender(opts) {
    opts = opts || {};
    if (linked && typeof linked.requestTableRender === 'function') {
      linked.requestTableRender(opts);
      return;
    }
    if (global.TcTableBridge && typeof global.TcTableBridge.requestSync === 'function') {
      global.TcTableBridge.requestSync(opts);
    }
  }

  function flushPatchRender(meta) {
    patchRowCount = 0;
    if (patchFlushTimer) {
      clearTimeout(patchFlushTimer);
      patchFlushTimer = null;
    }
    requestRender({
      reload: false,
      immediate: true,
      mode: 'patch',
      source: (meta && meta.source) || 'patchFlush'
    });
  }

  function schedulePatchRender(meta) {
    patchRowCount++;
    if (patchFlushTimer) return;
    var delay = (meta && meta.immediate) ? 0 : 120;
    patchFlushTimer = setTimeout(function () {
      patchFlushTimer = null;
      flushPatchRender(meta);
    }, delay);
  }

  var store = {
    linkLegacy: function (hooks) {
      linked = hooks || null;
    },

    setDebug: function (on) {
      debug = !!on;
      try {
        if (global.location && /tc_store_debug=1/.test(global.location.search || '')) debug = true;
      } catch (e0) { /* ignore */ }
    },

    subscribe: function (listener) {
      if (typeof listener !== 'function') return function () {};
      listeners.push(listener);
      return function () {
        var ix = listeners.indexOf(listener);
        if (ix >= 0) listeners.splice(ix, 1);
      };
    },

    getSnapshot: function () {
      if (!isLinked()) return null;
      return {
        version: 1,
        table: {
          rows: cloneRows(linked.getTestCasesData()),
          provenance: cloneProvenance(linked.getTestCasesProvenance()),
          columnTitles: (linked.getTableColumns() || []).slice(),
          columnVisible: Object.assign({}, linked.getColumnVisible() || {}),
          columnWidths: Object.assign({}, linked.getColumnWidth() || {}),
          rowHeights: Object.assign({}, linked.getRowHeights() || {})
        },
        template: {
          applied: !!linked.getTcTableTemplateApplied(),
          templateId: linked.getTcActiveTemplateId ? linked.getTcActiveTemplateId() : null
        },
        selection: {
          selectedRowIndexes: Array.from(linked.getSelectedRows() || []),
          markedRowIndexes: Array.from(linked.getMarkedRows() || [])
        },
        mindmap: {
          viewMode: linked.getTcRightViewMode ? linked.getTcRightViewMode() : 'table',
          casesData: linked.getTcMindmapCasesData ? cloneRows(linked.getTcMindmapCasesData()) : []
        }
      };
    },


    table: {
      syncRowsFromGrid: function (rows, meta) {
        meta = meta || {};
        var cloned = cloneRows(rows);
        if (!isLinked()) {
          global.testCasesData = cloned;
          notify('table.rows');
          return true;
        }
        linked.setTestCasesData(cloned);
        notify('table.rows');
        if (meta.render !== false) schedulePatchRender(meta);
        if (meta.recordUndo && linked.onTableMutated) linked.onTableMutated();
        return true;
      },

      setRows: function (rows, meta) {
        if (!isLinked()) return false;
        meta = meta || {};
        beginBatch();
        try {
          linked.setTestCasesData(cloneRows(rows));
          if (meta.provenance && linked.setTestCasesProvenance) {
            linked.setTestCasesProvenance(cloneProvenance(meta.provenance));
          }
        } finally {
          endBatch();
        }
        notify('table.rows');
        requestRender({ reload: meta.reload !== false, immediate: true, source: meta.source || 'setRows' });
        if (meta.recordUndo && linked.onTableMutated) linked.onTableMutated();
        return true;
      },

      appendRow: function (row, meta) {
        if (!isLinked()) return false;
        meta = meta || {};
        var rows = linked.getTestCasesData();
        if (!rows) return false;
        if (typeof linked.ensureRowMaterialized === 'function' && meta.materialize !== false) {
          /* no-op: push extends */
        }
        var normalized = Array.isArray(row) ? row.slice() : [];
        rows.push(normalized);
        if (meta.provenanceEntry && linked.appendProvenance) {
          linked.appendProvenance(meta.provenanceEntry);
        } else if (linked.ensureProvenanceLength) {
          linked.ensureProvenanceLength();
        }
        notify('table.rows');
        schedulePatchRender({ source: meta.source || 'appendRow', immediate: meta.immediate });
        return rows.length - 1;
      },

      appendRows: function (newRows, meta) {
        if (!isLinked() || !newRows || !newRows.length) return 0;
        meta = meta || {};
        var rows = linked.getTestCasesData();
        var start = rows.length;
        beginBatch();
        try {
          for (var i = 0; i < newRows.length; i++) {
            rows.push(Array.isArray(newRows[i]) ? newRows[i].slice() : []);
          }
          if (meta.provenanceList && linked.applyServerProvenance) {
            linked.applyServerProvenance(start, meta.provenanceList);
          } else if (linked.ensureProvenanceLength) {
            linked.ensureProvenanceLength();
          }
        } finally {
          endBatch();
        }
        notify('table.rows');
        requestRender({ reload: true, immediate: meta.immediate !== false, source: meta.source || 'appendRows' });
        if (meta.recordUndo && linked.onTableMutated) linked.onTableMutated();
        return newRows.length;
      },

      patchRow: function (rowIndex, rowValues, meta) {
        if (!isLinked()) return false;
        var rows = linked.getTestCasesData();
        if (!rows || rowIndex < 0 || rowIndex >= rows.length) return false;
        rows[rowIndex] = Array.isArray(rowValues) ? rowValues.slice() : rows[rowIndex];
        notify('table.rows');
        requestRender({ reload: true, source: (meta && meta.source) || 'patchRow' });
        if (meta && meta.recordUndo && linked.onTableMutated) linked.onTableMutated();
        return true;
      },

      patchCell: function (rowIndex, colIndex, value, meta) {
        if (!isLinked()) return false;
        if (typeof linked.ensureRowMaterialized === 'function') linked.ensureRowMaterialized(rowIndex);
        var rows = linked.getTestCasesData();
        if (!rows || !rows[rowIndex]) return false;
        rows[rowIndex][colIndex] = value == null ? '' : String(value);
        notify('table.rows');
        schedulePatchRender(Object.assign({ source: 'patchCell' }, meta || {}));
        return true;
      },


      insertRowAt: function (index, row, meta) {
        meta = meta || {};
        var rows = isLinked() ? linked.getTestCasesData() : global.testCasesData;
        if (!rows || !Array.isArray(rows)) {
          if (isLinked()) return false;
          global.testCasesData = [];
          rows = global.testCasesData;
        }
        var cols = isLinked() ? (linked.getTableColumns() || []) : (global.tableColumns || []);
        if (!cols.length) return false;
        var insertAt = parseInt(index, 10);
        if (isNaN(insertAt) || insertAt < 0) insertAt = 0;
        if (insertAt > rows.length) insertAt = rows.length;
        var normalized = Array.isArray(row) ? row.slice() : cols.map(function () { return ''; });
        while (normalized.length < cols.length) normalized.push('');
        if (normalized.length > cols.length) normalized = normalized.slice(0, cols.length);
        beginBatch();
        try {
          rows.splice(insertAt, 0, normalized);
          var prov = isLinked() ? linked.getTestCasesProvenance() : global.testCasesProvenance;
          if (prov) {
            prov.splice(insertAt, 0, meta.provenanceEntry != null ? meta.provenanceEntry : null);
          } else if (isLinked() && linked.ensureProvenanceLength) {
            linked.ensureProvenanceLength();
          } else if (!isLinked() && typeof global.tcEnsureProvenanceLength === 'function') {
            global.tcEnsureProvenanceLength();
          }
          if (isLinked()) {
            if (linked.setMarkedRows) {
              linked.setMarkedRows(shiftIndexSetAfterInsert(linked.getMarkedRows(), insertAt));
            }
            if (linked.setSelectedRows) {
              linked.setSelectedRows(shiftIndexSetAfterInsert(linked.getSelectedRows(), insertAt));
            }
            if (linked.setRowHeights && linked.getRowHeights) {
              linked.setRowHeights(remapRowHeightsAfterInsert(linked.getRowHeights(), insertAt));
            }
          } else {
            var marked = global.markedRows;
            if (marked instanceof Set) {
              var nextMarked = new Set();
              marked.forEach(function (i) { nextMarked.add(i >= insertAt ? i + 1 : i); });
              global.markedRows = nextMarked;
            }
            var selected = global.selectedRows;
            if (selected instanceof Set) {
              var nextSelected = new Set();
              selected.forEach(function (i) { nextSelected.add(i >= insertAt ? i + 1 : i); });
              global.selectedRows = nextSelected;
            }
            var rh = global.rowHeights || {};
            var nextRh = {};
            Object.keys(rh).forEach(function (k) {
              var i = parseInt(k, 10);
              if (isNaN(i)) return;
              nextRh[i >= insertAt ? i + 1 : i] = rh[k];
            });
            global.rowHeights = nextRh;
          }
        } finally {
          endBatch();
        }
        notify('table.rows');
        if (meta.render !== false) {
          requestRender({ reload: false, mode: 'patch', immediate: true, source: meta.source || 'insertRowAt' });
        }
        if (meta.recordUndo !== false && linked.onTableMutated) linked.onTableMutated();
        return true;
      },

      insertEmptyRow: function (meta) {
        if (!isLinked()) return false;
        meta = meta || {};
        if (linked.ensureTemplate && !linked.ensureTemplate()) return false;
        var cols = linked.getTableColumns() || [];
        if (!cols.length) return false;
        var rows = linked.getTestCasesData();
        if (!rows) return false;
        rows.push(cols.map(function () { return ''; }));
        var prov = linked.getTestCasesProvenance();
        if (prov) prov.push(null);
        notify('table.rows');
        requestRender({ reload: true, source: meta.source || 'insertEmptyRow' });
        if (meta.recordUndo !== false && linked.onTableMutated) linked.onTableMutated();
        return true;
      },

      deleteRowAt: function (index, meta) {
        if (!isLinked()) return false;
        var rows = linked.getTestCasesData();
        if (!rows || index < 0 || index >= rows.length) return false;
        meta = meta || {};
        beginBatch();
        try {
          rows.splice(index, 1);
          var prov = linked.getTestCasesProvenance();
          if (prov && index < prov.length) prov.splice(index, 1);
          if (linked.setMarkedRows) linked.setMarkedRows(shiftIndexSet(linked.getMarkedRows(), index));
          if (linked.setSelectedRows) linked.setSelectedRows(shiftIndexSet(linked.getSelectedRows(), index));
          if (linked.setRowHeights && linked.getRowHeights) {
            linked.setRowHeights(remapRowHeightsAfterDelete(linked.getRowHeights(), index));
          } else if (linked.shiftRowHeightsAfterDelete) {
            linked.shiftRowHeightsAfterDelete(index);
          }
        } finally {
          endBatch();
        }
        notify('table.rows');
        requestRender({ reload: true, source: meta.source || 'deleteRow' });
        if (meta.recordUndo !== false && linked.onTableMutated) linked.onTableMutated();
        return true;
      },

      applyBulkReplace: function (nextRows, nextProv, oldToNewMap, meta) {
        if (!isLinked()) return false;
        meta = meta || {};
        beginBatch();
        try {
          linked.setTestCasesData(cloneRows(nextRows));
          if (linked.setTestCasesProvenance) linked.setTestCasesProvenance(cloneProvenance(nextProv));
          var nextMarked = new Set();
          var marks = linked.getMarkedRows();
          if (marks && oldToNewMap && typeof oldToNewMap.has === 'function') {
            marks.forEach(function (idx) {
              if (oldToNewMap.has(idx)) nextMarked.add(oldToNewMap.get(idx));
            });
          }
          if (linked.setMarkedRows) linked.setMarkedRows(nextMarked);
          if (linked.setSelectedRows) linked.setSelectedRows(new Set());
          if (linked.remapRowHeightsByIndexMap && oldToNewMap) linked.remapRowHeightsByIndexMap(oldToNewMap);
        } finally {
          endBatch();
        }
        notify('table.rows');
        requestRender({ reload: true, source: meta.source || 'applyBulkReplace' });
        if (meta.recordUndo !== false && linked.onTableMutated) linked.onTableMutated();
        return true;
      },

      clear: function (meta) {
        if (!isLinked()) return false;
        meta = meta || {};
        beginBatch();
        try {
          linked.setTestCasesData([]);
          if (linked.setTestCasesProvenance) linked.setTestCasesProvenance([]);
          if (linked.setMarkedRows) linked.setMarkedRows(new Set());
          if (linked.setSelectedRows) linked.setSelectedRows(new Set());
          if (linked.setRowHeights) linked.setRowHeights({});
          if (linked.clearLayoutMaps) linked.clearLayoutMaps();
        } finally {
          endBatch();
        }
        notify('table.rows');
        requestRender({ reload: true, source: meta.source || 'clear' });
        if (meta.recordUndo !== false && linked.onTableMutated) linked.onTableMutated();
        return true;
      }
    },

    selection: {
      toggleMark: function (index) {
        if (!isLinked()) return false;
        if (typeof linked.ensureRowMaterialized === 'function') linked.ensureRowMaterialized(index);
        var marks = linked.getMarkedRows();
        if (!marks) return false;
        if (marks.has(index)) marks.delete(index);
        else marks.add(index);
        notify('selection.marked');
        requestRender({ reload: true, source: 'toggleMark' });
        if (linked.onTableMutated) linked.onTableMutated();
        return true;
      }
    },

    ui: {
      setGenerating: function (on) {
        if (linked && linked.setGenerating) linked.setGenerating(!!on);
      }
    }
  };

  store.setDebug(true);
  global.TcWorkbenchStore = store;
})(typeof window !== 'undefined' ? window : this);


// Compat: mirror legacy globals when store updates
if (typeof global !== 'undefined') {
    var _origSet = TcWorkbenchStore.setState;
    if (_origSet) {
        TcWorkbenchStore.setState = function (patch) {
            var r = _origSet.call(TcWorkbenchStore, patch);
            var s = TcWorkbenchStore.getState();
            if (s && s.testCasesData) global.testCasesData = s.testCasesData;
            if (s && s.tableColumns) global.tableColumns = s.tableColumns;
            return r;
        };
    }
}

/* ---- tc_table_bridge.js ---- */
/**
 * TestHub — TcTableBridge：统一表格同步入口（包装 TcTableView）
 */
(function (global) {
  'use strict';

  var syncTimer = null;
  var throttleMs = 80;
  var patchThrottleMs = 60;

  function getView() {
    return global.TcTableView || null;
  }

  function requestSync(opts) {
    opts = opts || {};
    var view = getView();
    if (!view || typeof view.syncFromData !== 'function') {
      if (global.TcTableProductivity && typeof global.TcTableProductivity.refreshFilter === 'function') {
        global.TcTableProductivity.refreshFilter();
      }
      return false;
    }
    var delay = opts.mode === 'patch' ? patchThrottleMs : throttleMs;
    if (opts.immediate) delay = 0;
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    if (delay === 0) {
      view.syncFromData({
        reload: opts.reload === true,
        immediate: true,
        preserveScroll: opts.preserveScroll === true,
      });
      return true;
    }
    syncTimer = setTimeout(function () {
      syncTimer = null;
      var v = getView();
      if (!v || typeof v.syncFromData !== 'function') return;
      v.syncFromData({
        reload: opts.reload === true,
        immediate: opts.reload === true,
        preserveScroll: opts.preserveScroll === true,
      });
    }, delay);
    return true;
  }

  function commitAll() {
    var view = getView();
    if (!view || typeof view.pullRows !== 'function') return Promise.resolve(false);
    return Promise.resolve(view.pullRows()).then(function (ok) {
      if (global.TcWorkbenchStore && global.TcWorkbenchStore.table && typeof global.TcWorkbenchStore.table.syncRowsFromGrid === 'function') {
        var snap = global.TcWorkbenchStore.getSnapshot();
        if (snap && snap.table) {
          global.TcWorkbenchStore.table.syncRowsFromGrid(snap.table.rows, { render: false, source: 'commitAll' });
        }
      }
      return ok;
    });
  }

  function onViewShow() {
    var view = getView();
    if (view && typeof view.onViewShow === 'function') return view.onViewShow();
  }

  function onViewHide() {
    return commitAll().then(function () {
      var view = getView();
      if (view && typeof view.onViewHide === 'function') return view.onViewHide();
    });
  }

  function scrollToRow(rowIndex) {
    var view = getView();
    if (!view || typeof view.scrollToRow !== 'function') return Promise.resolve(false);
    return view.scrollToRow(rowIndex);
  }

  function registerViewBridge() {
    var view = getView();
    if (!view || view._tcBridgeWrapped) return;
    var origSync = view.syncFromData;
    var origPull = view.pullRows;
    if (typeof origSync === 'function') {
      view.syncFromData = function (opts) {
        return origSync.call(view, opts || {});
      };
    }
    if (typeof origPull === 'function') {
      view.pullRows = function () {
        return Promise.resolve(origPull.call(view)).then(function (r) {
          if (global.TcWorkbenchStore && global.TcWorkbenchStore.getSnapshot) {
            /* pull 后 legacy 已由 Vue bridge 写回 */
          }
          return r;
        });
      };
    }
    view._tcBridgeWrapped = true;
  }

  global.TcTableBridge = {
    requestSync: requestSync,
    commitAll: commitAll,
    onViewShow: onViewShow,
    onViewHide: onViewHide,
    scrollToRow: scrollToRow,
    registerViewBridge: registerViewBridge
  };

  function bootBridge() {
    registerViewBridge();
    if (global.TcTableView) registerViewBridge();
    else {
      var n = 0;
      var t = setInterval(function () {
        n++;
        if (global.TcTableView || n > 80) {
          clearInterval(t);
          registerViewBridge();
        }
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootBridge);
  } else {
    bootBridge();
  }
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_workbench_data.js ---- */
/**
 * 用例工作台双数据源隔离策略（列表 testCasesData / 导图 tcMindmapCasesData）
 * - AI 列表生成：仅写入列表存储
 * - AI 导图生成：仅写入导图存储，不自动同步表格
 * - 显式「表格→导图」转换按钮可跨视图同步
 */
(function (global) {
    'use strict';

    var OUTPUT_LIST = 'list';
    var OUTPUT_MINDMAP = 'mindmap';

    function resetStoreForGeneration(outputTarget) {
        if (typeof global.tcHasAppendGenerationBaseline === 'function' && global.tcHasAppendGenerationBaseline()) {
            return;
        }
        if (outputTarget === OUTPUT_MINDMAP) {
            if (typeof global.tcMindmapExternalMindData !== 'undefined') {
                global.tcMindmapExternalMindData = null;
            }
            if (typeof global.tcMindmapCasesData !== 'undefined') {
                global.tcMindmapCasesData = [];
            }
            if (typeof global.tcMindmapCasesProvenance !== 'undefined') {
                global.tcMindmapCasesProvenance = [];
            }
            return;
        }
        if (typeof global.testCasesData !== 'undefined') {
            global.testCasesData = [];
        }
        if (typeof global.testCasesProvenance !== 'undefined') {
            global.testCasesProvenance = [];
        }
        if (global.markedRows && typeof global.markedRows.clear === 'function') {
            global.markedRows.clear();
        } else if (global.markedRows instanceof Set) {
            global.markedRows = new Set();
        }
        if (global.selectedRows && typeof global.selectedRows.clear === 'function') {
            global.selectedRows.clear();
        }
    }

    /** 导图与表格数据隔离：不自动跨视图同步（显式「表格→导图」按钮除外） */
    var MINDMAP_TABLE_SYNC = 'manual';

    function shouldAutoSyncMindmapToTable() {
        return MINDMAP_TABLE_SYNC !== 'manual';
    }

    function shouldAutoHydrateMindmapFromTable() {
        return MINDMAP_TABLE_SYNC !== 'manual';
    }

    /** 恢复/切换视图时是否允许导图暂存写入列表 testCasesData（默认否） */
    function shouldSyncTableStoreOnMindmapStashRestore() {
        return false;
    }

    global.TcWorkbenchData = {
        OUTPUT_LIST: OUTPUT_LIST,
        OUTPUT_MINDMAP: OUTPUT_MINDMAP,
        MINDMAP_TABLE_SYNC: MINDMAP_TABLE_SYNC,
        resetStoreForGeneration: resetStoreForGeneration,
        shouldAutoSyncMindmapToTable: shouldAutoSyncMindmapToTable,
        shouldAutoHydrateMindmapFromTable: shouldAutoHydrateMindmapFromTable,
        shouldSyncTableStoreOnMindmapStashRestore: shouldSyncTableStoreOnMindmapStashRestore
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_workbench_boot.js ---- */
/**
 * TestHub 用例工作台 — 启动与动作导出（兼容模板 onclick）
 */
(function (global) {
  'use strict';

  global.TcWorkbenchActions = {
    saveEditRow: function () { if (typeof saveEditRow === 'function') saveEditRow(); },
    closeEditModal: function () { if (typeof closeEditModal === 'function') closeEditModal(); },
    closeColumnSettingsModal: function () { if (typeof closeColumnSettingsModal === 'function') closeColumnSettingsModal(); },
    addColumnSetting: function () { if (typeof addColumnSetting === 'function') addColumnSetting(); },
    resetColumnSettingsDraft: function () { if (typeof resetColumnSettingsDraft === 'function') resetColumnSettingsDraft(); },
    saveColumnSettings: function () { if (typeof saveColumnSettings === 'function') saveColumnSettings(); },
    switchTcRightView: function (m) { if (typeof switchTcRightView === 'function') switchTcRightView(m); },
    switchDrawer: function (n) { if (typeof switchDrawer === 'function') switchDrawer(n); },
    toggleCollapse: function () { if (typeof toggleCollapse === 'function') toggleCollapse(); }
  };

  function boot() {
    if (global.TcWorkbenchStore) global.TcWorkbenchStore.setDebug(true);
    if (global.TcTableBridge && global.TcTableBridge.registerViewBridge) {
      global.TcTableBridge.registerViewBridge();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_gen_abort_stub.js ---- */
/**
 * 智能生成模块移除后的兼容桩：供 Agent 流式/质量检查等共用逻辑安全调用。
 */
(function (global) {
    'use strict';

    if (typeof global.syncTcPromptSendBtnState !== 'function') {
        global.syncTcPromptSendBtnState = function () {};
    }

    if (typeof global.abortActiveGenerationRun !== 'function') {
        global.abortActiveGenerationRun = function () {
            if (global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.cancel === 'function') {
                global.TcGenerationStreamClient.cancel();
            }
            if (global.TcAgentOrchestrator &&
                typeof global.TcAgentOrchestrator.cancelAgentJob === 'function') {
                global.TcAgentOrchestrator.cancelAgentJob();
            }
        };
    }
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_workbench_bus.js ---- */
/**
 * TC Workbench EventBus — decouple features without breaking window.* compat.
 */
(function (global) {
    'use strict';
    var listeners = {};

    function on(event, fn) {
        event = String(event || '');
        if (!event || typeof fn !== 'function') return function () {};
        (listeners[event] = listeners[event] || []).push(fn);
        return function () { off(event, fn); };
    }

    function off(event, fn) {
        event = String(event || '');
        var arr = listeners[event];
        if (!arr) return;
        listeners[event] = arr.filter(function (x) { return x !== fn; });
    }

    function emit(event, detail) {
        event = String(event || '');
        var arr = (listeners[event] || []).slice();
        arr.forEach(function (fn) {
            try { fn(detail || {}); } catch (e) { console.error('[TcWorkbenchBus]', event, e); }
        });
    }

    global.TcWorkbenchBus = { on: on, off: off, emit: emit };
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_dialog.js ---- */
/**
 * TestHub TC Workbench — L1 FOUNDATION
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
function getImageFileSizeError(file) {
    if (!file) return '请先选择文件';
    if (file.size === 0) return '文件为空，请重新选择';
    if (file.size > IMAGE_UPLOAD_LIMITS.maxBytes) {
        const cur = (file.size / (1024 * 1024)).toFixed(1);
        return '文件过大：单张不超过 ' + IMAGE_UPLOAD_LIMITS.maxMb + ' MB（当前约 ' + cur + ' MB）';
    }
    return '';
}

/** 测试用例页统一弹窗（无 tc-app-dialog 时回退到 alert/confirm） */
var tcAppDialogResolve = null;
var tcAppDialogIsConfirm = false;
var tcAppDialogIsCopyMode = false;
var tcAppDialogCopyText = null;
var tcAppDialogBackdropFn = null;
var TC_WORKBENCH_MODAL_Z_BASE = 10750;
var TC_VALIDATE_DRAWER_Z_FLOOR = 10475;

function tcWorkbenchEnhancementsApi() {
    if (typeof TcWorkbenchEnhancements !== 'undefined' && TcWorkbenchEnhancements) {
        return TcWorkbenchEnhancements;
    }
    if (typeof window !== 'undefined' && window.TcWorkbenchEnhancements) {
        return window.TcWorkbenchEnhancements;
    }
    return null;
}

function tcWorkbenchModalZIndex() {
    var z = TC_WORKBENCH_MODAL_Z_BASE;
    var enh = tcWorkbenchEnhancementsApi();
    if (enh && typeof enh.getFloatPanelStackZIndex === 'function') {
        z = Math.max(z, enh.getFloatPanelStackZIndex() + 20);
    }
    z = Math.max(z, TC_VALIDATE_DRAWER_Z_FLOOR + 250);
    if (typeof document !== 'undefined' &&
        document.body &&
        document.body.classList.contains('tc-wb-supplement-confirm-open')) {
        z = Math.max(z, TC_VALIDATE_DRAWER_Z_FLOOR + 350);
    }
    return z;
}


/** 通用模态框显隐（原 tc_stash.js，暂存移除后仍供模板/导出等弹窗使用） */
function showModal(el) {
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
    el.style.display = 'flex';
    el.setAttribute('aria-hidden', 'false');
    if (typeof tcEnsureModalTopLayer === 'function') tcEnsureModalTopLayer(el);
}

function hideModal(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
    el.style.display = '';
    el.setAttribute('aria-hidden', 'true');
}

function tcEnsureModalTopLayer(el) {
    if (!el) return;
    if (el.parentElement !== document.body) document.body.appendChild(el);
    el.style.setProperty('z-index', String(tcWorkbenchModalZIndex()), 'important');
}

function tcAppDialogIsOpen() {
    var root = document.getElementById('tc-app-dialog');
    return !!(root && !root.classList.contains('hidden'));
}
window.tcAppDialogIsOpen = tcAppDialogIsOpen;

function tcAppDialogClose(result) {
    var root = document.getElementById('tc-app-dialog');
    if (root) {
        root.classList.add('hidden');
    }
    document.body.classList.remove('overflow-hidden');
    if (tcAppDialogBackdropFn && root) {
        root.removeEventListener('click', tcAppDialogBackdropFn);
        tcAppDialogBackdropFn = null;
    }
    var fn = tcAppDialogResolve;
    var wasConfirm = tcAppDialogIsConfirm;
    tcAppDialogResolve = null;
    tcAppDialogIsConfirm = false;
    tcAppDialogIsCopyMode = false;
    tcAppDialogCopyText = null;
    if (fn) {
        if (wasConfirm) fn(!!result);
        else fn();
    }
}

function tcAppDialogOpen(options) {
    return new Promise(function (resolve) {
        var root = document.getElementById('tc-app-dialog');
        var titleEl = document.getElementById('tc-app-dialog-title');
        var msgEl = document.getElementById('tc-app-dialog-message');
        var iconEl = document.getElementById('tc-app-dialog-icon');
        var hintEl = document.getElementById('tc-app-dialog-hint');
        var cancelBtn = document.getElementById('tc-app-dialog-cancel');
        var okBtn = document.getElementById('tc-app-dialog-confirm');
        var variant = (options && options.variant) || 'info';
        var showCancel = !!(options && options.showCancel);

        if (!root || !titleEl || !msgEl || !iconEl || !cancelBtn || !okBtn) {
            if (showCancel) resolve(confirm((options && options.message) || ''));
            else {
                alert((options && options.message) || '');
                resolve();
            }
            return;
        }

        tcAppDialogResolve = resolve;
        tcAppDialogIsConfirm = showCancel;

        titleEl.textContent = (options && options.title) || (showCancel ? '请确认' : '提示');
        var fullMessage = (options && options.message) || '';
        msgEl.textContent = fullMessage;
        tcAppDialogCopyText = fullMessage;
        if (variant === 'error' && !showCancel) {
            tcAppDialogIsCopyMode = true;
            msgEl.classList.add('tc-app-dialog-message--error-clamp');
        } else {
            tcAppDialogIsCopyMode = false;
            msgEl.classList.remove('tc-app-dialog-message--error-clamp');
        }
        if (hintEl) {
            var hint = options && options.hint;
            if (hint) {
                hintEl.textContent = hint;
                hintEl.classList.remove('hidden');
            } else {
                hintEl.textContent = '';
                hintEl.classList.add('hidden');
            }
        }

        iconEl.className = 'tc-app-dialog-icon';
        iconEl.classList.remove(
            'tc-app-dialog-icon--error',
            'tc-app-dialog-icon--warning',
            'tc-app-dialog-icon--success',
            'tc-app-dialog-icon--info'
        );
        if (variant === 'error') {
            iconEl.classList.add('tc-app-dialog-icon--error');
            iconEl.textContent = '!';
        } else if (variant === 'warning') {
            iconEl.classList.add('tc-app-dialog-icon--warning');
            iconEl.textContent = '!';
        } else if (variant === 'success') {
            iconEl.classList.add('tc-app-dialog-icon--success');
            iconEl.textContent = '✓';
        } else {
            iconEl.classList.add('tc-app-dialog-icon--info');
            iconEl.textContent = 'i';
        }

        if (showCancel) {
            cancelBtn.classList.remove('hidden');
            cancelBtn.textContent = (options && options.cancelText) || '取消';
            okBtn.textContent = (options && options.confirmText) || '确定';
        } else {
            cancelBtn.classList.add('hidden');
            if (variant === 'error') {
                okBtn.textContent = (options && options.confirmText) || '复制';
            } else {
                okBtn.textContent = (options && options.confirmText) || '知道了';
            }
        }

        root.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        tcEnsureModalTopLayer(root);

        tcAppDialogBackdropFn = function (e) {
            if (e.target === root || (e.target && e.target.classList && e.target.classList.contains('tc-app-dialog__scrim'))) {
                tcAppDialogClose(showCancel ? false : undefined);
            }
        };
        root.addEventListener('click', tcAppDialogBackdropFn);

        requestAnimationFrame(function () {
            if (okBtn && typeof okBtn.focus === 'function') okBtn.focus();
        });
    });
}

function tcAppAlert(message, opts) {
    opts = opts || {};
    return tcAppDialogOpen({
        message: message,
        title: opts.title || '提示',
        showCancel: false,
        variant: opts.variant || 'info',
        confirmText: opts.confirmText
    });
}

function tcAppConfirm(message, opts) {
    opts = opts || {};
    return tcAppDialogOpen({
        message: message,
        title: opts.title || '请确认',
        showCancel: true,
        variant: opts.variant || 'warning',
        confirmText: opts.confirmText,
        cancelText: opts.cancelText,
        hint: opts.hint
    });
}

var hfFloatToastTimer = null;
/** 统一渐变悬浮提示：placement top|bottom，variant warning|success|error|info，默认 2s 渐隐 */
function hfFloatToast(message, opts) {
    opts = opts || {};
    var wrap = document.getElementById('hf-float-toast');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'hf-float-toast';
        wrap.className = 'hf-float-toast hf-float-toast--top';
        wrap.setAttribute('role', 'status');
        wrap.setAttribute('aria-live', 'polite');
        var innerEl = document.createElement('div');
        innerEl.id = 'hf-float-toast-inner';
        innerEl.className = 'hf-float-toast__inner';
        wrap.appendChild(innerEl);
    }
    if (wrap.parentElement !== document.body) {
        document.body.appendChild(wrap);
    }
    var inner = document.getElementById('hf-float-toast-inner');
    if (!inner) return;
    if (hfFloatToastTimer) {
        clearTimeout(hfFloatToastTimer);
        hfFloatToastTimer = null;
    }
    var placement = opts.placement === 'bottom' ? 'bottom' : 'top';
    wrap.classList.remove('hf-float-toast--top', 'hf-float-toast--bottom', 'hf-float-toast--visible', 'hf-float-toast--above-modal');
    wrap.classList.add(placement === 'bottom' ? 'hf-float-toast--bottom' : 'hf-float-toast--top');
    if (opts.aboveModal) wrap.classList.add('hf-float-toast--above-modal');
    inner.textContent = String(message != null ? message : '').trim();
    var tone = opts.variant || (placement === 'top' ? 'warning' : 'success');
    inner.className = 'hf-float-toast__inner hf-float-toast__inner--' + tone;
    wrap.classList.add('hf-float-toast--visible');
    var ms = typeof opts.duration === 'number' ? opts.duration : (placement === 'top' ? 2000 : 3200);
    hfFloatToastTimer = setTimeout(function() {
        wrap.classList.remove('hf-float-toast--visible');
        hfFloatToastTimer = null;
    }, ms);
}

function tcAppToast(message, opts) {
    opts = opts || {};
    hfFloatToast(message, {
        placement: 'bottom',
        variant: opts.variant || 'success',
        duration: typeof opts.duration === 'number' ? opts.duration : 3200
    });
}

function tcAppDialogCopyToClipboard(text) {
    var s = String(text != null ? text : '');
    if (!s) return Promise.reject(new Error('empty'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(s);
    }
    return new Promise(function(resolve, reject) {
        try {
            var ta = document.createElement('textarea');
            ta.value = s;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            if (ok) resolve();
            else reject(new Error('copy failed'));
        } catch (e) {
            reject(e);
        }
    });
}

(function tcAppDialogBindButtons() {
    var okBtn = document.getElementById('tc-app-dialog-confirm');
    var cancelBtn = document.getElementById('tc-app-dialog-cancel');
    if (okBtn) {
        okBtn.addEventListener('click', function () {
            if (tcAppDialogIsCopyMode && tcAppDialogCopyText) {
                tcAppDialogCopyToClipboard(tcAppDialogCopyText)
                    .then(function() {
                        tcAppToast('已复制完整报错到剪贴板', { variant: 'success', duration: 2400 });
                    })
                    .catch(function() {
                        tcAppToast('复制失败，请手动选择报错文字复制', { variant: 'warning', duration: 3200 });
                    })
                    .finally(function() { tcAppDialogClose(); });
                return;
            }
            tcAppDialogClose(true);
        });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', function () { tcAppDialogClose(false); });
})();

(function bindTcAppDialogGlobalKeys() {
    document.addEventListener('keydown', function (e) {
        if (!tcAppDialogIsOpen()) return;
        var showCancel = tcAppDialogIsConfirm;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            tcAppDialogClose(showCancel ? false : undefined);
            return;
        }
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        var tag = e.target && e.target.tagName;
        if (tag === 'TEXTAREA' && e.target.closest && e.target.closest('#tc-app-dialog')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (tcAppDialogIsCopyMode && tcAppDialogCopyText) {
            tcAppDialogCopyToClipboard(tcAppDialogCopyText)
                .then(function () {
                    tcAppToast('已复制完整报错到剪贴板', { variant: 'success', duration: 2400 });
                })
                .catch(function () {
                    tcAppToast('复制失败，请手动选择报错文字复制', { variant: 'warning', duration: 3200 });
                })
                .finally(function () { tcAppDialogClose(); });
            return;
        }
        tcAppDialogClose(showCancel ? true : undefined);
    }, true);
})();


/* ---- tc_left_panel_lock.js ---- */
/**
 * 左栏录入区导航锁：Agent 运行 / 列表·导图 AI 生成 / 智能编辑期间禁止切换子页。
 * 不影响右侧表格/导图视图切换。
 */
(function (global) {
    'use strict';

    var locks = {
        agent: false,
        aiGenerate: false,
        edit: false
    };

    function $(id) { return document.getElementById(id); }

    function toast(msg) {
        if (typeof global.tcAppToast === 'function') {
            global.tcAppToast(msg, { variant: 'warning', duration: 2800 });
        }
    }


    function isQualityCheckActivelyRunning() {
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.isSingleGenValidationInProgress === 'function' &&
            global.TcWorkbenchEnhancements.isSingleGenValidationInProgress()) {
            return true;
        }
        if (global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.isQualityCheckPending === 'function' &&
            global.TcGenChatPipeline.isQualityCheckPending()) {
            return true;
        }
        return false;
    }

    function shouldBypassLanhuGenLockAfterCoverageFillTerminal() {
        var cov = global.TcCoverageMatrix;
        if (!cov || typeof cov.shouldBypassLanhuGenLockAfterCoverageFillTerminal !== 'function') {
            return false;
        }
        return cov.shouldBypassLanhuGenLockAfterCoverageFillTerminal('single');
    }

    function forceUnlockLanhuNavAfterCoverageFillTerminal() {
        var cov = global.TcCoverageMatrix;
        if (cov && typeof cov.isCoverageFillJobBlockingLanhuNav === 'function' &&
            cov.isCoverageFillJobBlockingLanhuNav('single')) {
            return;
        }
        var orch = global.TcAgentOrchestrator;
        if (orch && typeof orch.isAgentJobRunning === 'function' && orch.isAgentJobRunning()) {
            return;
        }
        if (typeof global.setTcLeftPanelAgentLock === 'function') {
            global.setTcLeftPanelAgentLock(false);
        }
        if (orch && typeof orch.releaseGenModeLockIfIdle === 'function') {
            orch.releaseGenModeLockIfIdle();
        }
        if (typeof global.clearOptimisticPageGenLock === 'function') {
            global.clearOptimisticPageGenLock();
        }
        applyLockUi();
        syncLanhuRequirementNavLockUi();
    }

    function syncLanhuNavLockAfterCoverageFillTerminal() {
        applyLockUi();
        syncLanhuRequirementNavLockUi();
    }

    global.syncLanhuNavLockAfterCoverageFillTerminal = syncLanhuNavLockAfterCoverageFillTerminal;
    global.forceUnlockLanhuNavAfterCoverageFillTerminal = forceUnlockLanhuNavAfterCoverageFillTerminal;

    function isCoverageFillDrawerBusy() {
        var cov = global.TcCoverageMatrix;
        if (!cov) return false;
        if (typeof cov.isCoverageFillJobBlockingLanhuNav === 'function') {
            return cov.isCoverageFillJobBlockingLanhuNav('single');
        }
        if (typeof cov.isValidateDrawerFillInProgress === 'function') {
            return cov.isValidateDrawerFillInProgress('single');
        }
        return false;
    }

    function isQualityCheckBusy() {
        if (global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.isQualityCheckPending === 'function' &&
            global.TcGenChatPipeline.isQualityCheckPending()) {
            return true;
        }
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.isSingleGenValidationInProgress === 'function' &&
            global.TcWorkbenchEnhancements.isSingleGenValidationInProgress()) {
            return true;
        }
        if (typeof global.isTcGenQualityCheckInProgress === 'function' &&
            global.isTcGenQualityCheckInProgress()) {
            return true;
        }
        return false;
    }

    function isLocked() {
        return !!(locks.agent || locks.aiGenerate || locks.edit || isQualityCheckBusy());
    }

    function isAiGenerateLocked() {
        return !!locks.aiGenerate;
    }

    function isEditLocked() {
        return !!locks.edit;
    }

    function applyLockUi() {
        var locked = isLocked();
        var genLocked = !!(locks.agent || locks.aiGenerate || isQualityCheckBusy());
        var editLocked = !!locks.edit;

        var singleBtn = $('tc-gen-mode-single');
        var editBtn = $('tc-gen-mode-edit');
        var genSeg = document.querySelector('#drawer-tabs.tc-gen-mode-seg, .tc-gen-mode-seg');

        [singleBtn, editBtn].forEach(function (btn) {
            if (!btn) return;
            var disable = locked;
            if (btn === singleBtn && editLocked) disable = true;
            if (btn === editBtn && genLocked) disable = true;
            btn.disabled = disable;
            btn.classList.toggle('tc-gen-mode-btn--locked', disable);
            btn.classList.toggle('tc-drawer-tab--locked', disable);
            if (disable) {
                btn.setAttribute('aria-disabled', 'true');
                if (btn === singleBtn) {
                    btn.title = editLocked
                        ? '智能编辑进行中，无法切换'
                        : (isQualityCheckBusy()
                            ? '质量检查进行中，无法切换'
                            : (locks.agent ? 'Agent 任务进行中' : 'AI 生成进行中'));
                }
                if (btn === editBtn) {
                    btn.title = genLocked
                        ? (isQualityCheckBusy() ? '质量检查进行中' : '生成进行中，无法切换')
                        : '智能编辑进行中';
                }
            } else {
                btn.removeAttribute('aria-disabled');
                if (btn === singleBtn) btn.title = '单次提示词生成列表或导图用例';
                if (btn === editBtn) btn.title = '通过提示词编辑当前表格用例';
            }
        });
        if (genSeg) genSeg.classList.toggle('tc-gen-mode-seg--locked', locked);

        if (typeof global.syncTcSessionNavLockUi === 'function') {
            global.syncTcSessionNavLockUi(locked);
        }
        if (typeof global.syncTcPromptSendBtnState === 'function') {
            global.syncTcPromptSendBtnState();
        }
        if (typeof global.syncTcEditSendBtnState === 'function') {
            global.syncTcEditSendBtnState();
        }
        syncLanhuDocSwitcherLockUi();
        syncLanhuTreePageSwitchLockUi();
    }

    function getSessionNavLockTitle() {
        if (isQualityCheckBusy()) return '质量检查进行中，请稍候';
        if (locks.edit) return '智能编辑进行中，请稍候';
        if (locks.agent) return 'Agent 生成进行中，请稍候';
        if (locks.aiGenerate) return '用例生成进行中，请稍候';
        return '用例生成进行中，请稍候';
    }

    function setAgentLock(locked) {
        locks.agent = !!locked;
        applyLockUi();
    }

    function setAiGenerateLock(locked) {
        locks.aiGenerate = !!locked;
        if (locks.aiGenerate && global.TcCoverageMatrix &&
            typeof global.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal === 'function') {
            global.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal();
        }
        applyLockUi();
    }

    function setEditLock(locked) {
        locks.edit = !!locked;
        applyLockUi();
    }

    global.isTcLeftPanelNavLocked = isLocked;
    global.isTcLeftPanelAiGenerateLocked = isAiGenerateLocked;
    global.setTcLeftPanelAgentLock = setAgentLock;
    global.setTcLeftPanelAiGenerateLock = setAiGenerateLock;



    function isLanhuActiveGenerationBlockingTreeNav() {
        if (locks.agent || locks.aiGenerate) return true;
        if (global.TcRequirementCaseStore &&
            typeof global.TcRequirementCaseStore.isWorkbenchGenerationStreamBusy === 'function' &&
            global.TcRequirementCaseStore.isWorkbenchGenerationStreamBusy()) {
            return true;
        }
        return false;
    }

    function syncLanhuNavLockUiAfterGenerationIdle() {
        syncLanhuTreePageSwitchLockUi();
        syncLanhuDocSwitcherLockUi();
    }

    function isLanhuRequirementNavBlocked() {
        if (isCoverageFillDrawerBusy()) return true;
        if (shouldBypassLanhuGenLockAfterCoverageFillTerminal()) return false;
        return isQualityCheckActivelyRunning();
    }

    function toastLanhuRequirementNavBlocked() {
        toast('质量检测进行中，暂不可切换需求页或文档');
    }

    function isLanhuDocSwitchBlockedDuringGenerationCore() {
        if (shouldBypassLanhuGenLockAfterCoverageFillTerminal()) return false;
        if (locks.agent || locks.aiGenerate) return true;
        if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.isActive === 'function' &&
            global.TcGenerationStreamClient.isActive()) {
            return true;
        }
        if (global.TcAgentOrchestrator && typeof global.TcAgentOrchestrator.isGenModeLocked === 'function' &&
            global.TcAgentOrchestrator.isGenModeLocked()) {
            return true;
        }
        if (typeof global.isTcPageGenLockActive === 'function' && global.isTcPageGenLockActive()) {
            return true;
        }
        if (isLanhuActiveGenerationBlockingTreeNav()) {
            return true;
        }
        return false;
    }

    function isLanhuDocSwitchBlockedDuringGeneration() {
        if (isCoverageFillDrawerBusy()) return true;
        return isLanhuDocSwitchBlockedDuringGenerationCore();
    }

    function toastLanhuDocSwitchBlockedDuringGeneration() {
        toast('用例生成进行中，暂不可切换需求文档');
    }


    function isLanhuRequirementPageSwitchBlocked() {
        return isLanhuDocSwitchBlockedDuringGeneration();
    }

    function toastLanhuRequirementPageSwitchBlocked() {
        toast('用例生成进行中，暂不可切换需求页');
    }

    function syncLanhuTreePageSwitchLockUi() {
        var blocked = isLanhuRequirementPageSwitchBlocked() || isLanhuRequirementNavBlocked();
        var mount = document.getElementById('tc-lanhu-tree-mount');
        var rail = document.getElementById('tc-lanhu-doc-tree-rail');
        if (mount) mount.classList.toggle('tc-lanhu-tree-mount--gen-page-locked', blocked);
        if (rail) rail.classList.toggle('tc-lanhu-tree-rail--gen-page-locked', blocked);
    }
    function isLanhuTreeHeadActionsBlocked() {
        return isLanhuRequirementNavBlocked() || isLanhuDocSwitchBlockedDuringGeneration();
    }

    function toastLanhuTreeHeadActionsBlocked() {
        if (isCoverageFillDrawerBusy()) {
            toast('用例补充进行中，暂不可切换需求页或文档');
        } else if (isQualityCheckBusy()) {
            toastLanhuRequirementNavBlocked();
        } else {
            toastLanhuDocSwitchBlockedDuringGeneration();
        }
    }

    function applyLanhuTreeRailHeadBtnLock(btn, blocked, qcBlocked) {
        if (!btn) return;
        btn.disabled = !!blocked;
        btn.classList.toggle('tc-lanhu-tree-rail__action-btn--locked', blocked);
        if (blocked) {
            btn.setAttribute('aria-disabled', 'true');
            var isAdd = btn.id === 'tc-lanhu-tree-head-add-btn';
            btn.title = qcBlocked === 'fill'
                ? (isAdd ? '用例补充进行中，暂不可新增文档' : '用例补充进行中，暂不可连接文档')
                : (qcBlocked
                    ? (isAdd ? '质量检测进行中，暂不可新增文档' : '质量检测进行中，暂不可连接文档')
                    : (isAdd ? '用例生成进行中，暂不可新增文档' : '用例生成进行中，暂不可连接文档'));
        } else {
            btn.removeAttribute('aria-disabled');
            if (btn.id === 'tc-lanhu-tree-head-add-btn') btn.title = '添加 / 连接蓝湖文档';
            else if (btn.id === 'tc-lanhu-tree-connect-btn') btn.title = '添加 / 连接蓝湖文档';
        }
    }

    function syncLanhuDocSwitcherLockUi() {
        var fillBlocked = isCoverageFillDrawerBusy();
        var qcBlocked = !fillBlocked && isQualityCheckBusy();
        var genBlocked = !fillBlocked && !qcBlocked && isLanhuDocSwitchBlockedDuringGenerationCore();
        var blocked = fillBlocked || qcBlocked || genBlocked;
        var docTrigger = document.getElementById('tc-lanhu-doc-switcher-trigger');
        if (docTrigger) {
            docTrigger.classList.toggle('tc-doc-switcher-trigger--qc-busy', blocked);
            docTrigger.disabled = !!blocked;
            if (blocked) {
                docTrigger.setAttribute('aria-disabled', 'true');
                docTrigger.title = fillBlocked
                    ? '用例补充进行中，暂不可切换文档'
                    : (qcBlocked
                        ? '质量检测进行中，暂不可切换文档'
                        : '用例生成进行中，暂不可切换文档');
            } else {
                docTrigger.removeAttribute('aria-disabled');
                docTrigger.title = '切换文档';
            }
        }
        applyLanhuTreeRailHeadBtnLock(
            document.getElementById('tc-lanhu-tree-head-add-btn'),
            blocked,
            fillBlocked ? 'fill' : (qcBlocked ? 'qc' : '')
        );
        applyLanhuTreeRailHeadBtnLock(
            document.getElementById('tc-lanhu-tree-connect-btn'),
            blocked,
            fillBlocked ? 'fill' : (qcBlocked ? 'qc' : '')
        );
    }

    function syncLanhuRequirementNavLockUi() {
        syncLanhuDocSwitcherLockUi();
        syncLanhuTreePageSwitchLockUi();
    }

    global.isTcQualityCheckLanhuNavBlocked = isLanhuRequirementNavBlocked;
    global.toastTcQualityCheckNavBlocked = toastLanhuRequirementNavBlocked;
    global.isTcLanhuDocSwitchBlockedDuringGeneration = isLanhuDocSwitchBlockedDuringGeneration;
    global.toastTcLanhuDocSwitchBlockedDuringGeneration = toastLanhuDocSwitchBlockedDuringGeneration;
    global.isTcLanhuTreeHeadActionsBlocked = isLanhuTreeHeadActionsBlocked;
    global.toastTcLanhuTreeHeadActionsBlocked = toastLanhuTreeHeadActionsBlocked;
    global.isTcLanhuRequirementPageSwitchBlocked = isLanhuRequirementPageSwitchBlocked;
    global.toastTcLanhuRequirementPageSwitchBlocked = toastLanhuRequirementPageSwitchBlocked;
    global.tcSyncLanhuNavLockUiAfterGenerationIdle = syncLanhuNavLockUiAfterGenerationIdle;
    global.tcSyncLanhuTreePageSwitchLockUi = syncLanhuTreePageSwitchLockUi;
    global.tcSyncLanhuDocSwitcherLockUi = syncLanhuDocSwitcherLockUi;

    global.TcLeftPanelLock = {
        isLocked: isLocked,
        isAiGenerateLocked: isAiGenerateLocked,
        isEditLocked: isEditLocked,
        isQualityCheckBusy: isQualityCheckBusy,
        getSessionNavLockTitle: getSessionNavLockTitle,
        setAgentLock: setAgentLock,
        setAiGenerateLock: setAiGenerateLock,
        setEditLock: setEditLock,
        applyLockUi: applyLockUi,
        syncLanhuDocSwitcherLockUi: syncLanhuDocSwitcherLockUi,
        forceUnlockLanhuNavAfterCoverageFillTerminal: forceUnlockLanhuNavAfterCoverageFillTerminal,
        syncLanhuRequirementNavLockUi: syncLanhuRequirementNavLockUi,
        isLanhuDocSwitchBlockedDuringGeneration: isLanhuDocSwitchBlockedDuringGeneration,
        toastLanhuDocSwitchBlockedDuringGeneration: toastLanhuDocSwitchBlockedDuringGeneration,
        isLanhuRequirementPageSwitchBlocked: isLanhuRequirementPageSwitchBlocked,
        toastLanhuRequirementPageSwitchBlocked: toastLanhuRequirementPageSwitchBlocked,
        syncLanhuNavLockUiAfterGenerationIdle: syncLanhuNavLockUiAfterGenerationIdle,
        syncLanhuTreePageSwitchLockUi: syncLanhuTreePageSwitchLockUi,
        isLanhuTreeHeadActionsBlocked: isLanhuTreeHeadActionsBlocked,
        toastLanhuTreeHeadActionsBlocked: toastLanhuTreeHeadActionsBlocked,
        isLanhuRequirementNavBlocked: isLanhuRequirementNavBlocked,
        toastLanhuRequirementNavBlocked: toastLanhuRequirementNavBlocked,
        isCoverageFillDrawerBusy: isCoverageFillDrawerBusy
    };
})(typeof window !== 'undefined' ? window : this);

