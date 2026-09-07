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
