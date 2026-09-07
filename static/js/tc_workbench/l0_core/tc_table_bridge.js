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
