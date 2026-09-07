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
