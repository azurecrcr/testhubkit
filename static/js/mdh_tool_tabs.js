/**
 * 媒体与数据工具箱 — 子 Tab 切换（独立文件，不依赖用例工作台大包）
 * 供 /tool/media-data-hub 使用；不影响 test-cases /app。
 */
(function (global) {
  'use strict';

  function setToolTabButtonActive(btn, on) {
    if (!btn) return;
    var inactive = ['border-slate-200', 'bg-white', 'text-slate-700'];
    var active = ['border-indigo-300', 'bg-indigo-50', 'shadow-md', 'text-indigo-700'];
    inactive.forEach(function (c) { btn.classList.remove(c); });
    active.forEach(function (c) { btn.classList.remove(c); });
    if (on) {
      active.forEach(function (c) { btn.classList.add(c); });
      btn.setAttribute('aria-selected', 'true');
      btn.classList.add('is-active');
    } else {
      inactive.forEach(function (c) { btn.classList.add(c); });
      btn.setAttribute('aria-selected', 'false');
      btn.classList.remove('is-active');
    }
  }

  function setToolTabPanelActive(panel, on) {
    if (!panel) return;
    panel.classList.toggle('is-active', on);
    panel.hidden = !on;
  }

  var MEDIA_TOOL_TABS = {
    sizer: { btnId: 'media-tool-tab-sizer', panelId: 'img-tool-panel-sizer' },
    format: { btnId: 'media-tool-tab-format', panelId: 'img-tool-panel-format' },
    audio: { btnId: 'media-tool-tab-audio', panelId: 'media-workbench-audio-panel' },
  };

  function switchMediaToolTab(tab) {
    var key = Object.prototype.hasOwnProperty.call(MEDIA_TOOL_TABS, tab) ? tab : 'sizer';
    Object.keys(MEDIA_TOOL_TABS).forEach(function (id) {
      var cfg = MEDIA_TOOL_TABS[id];
      var btn = document.getElementById(cfg.btnId);
      var panel = document.getElementById(cfg.panelId);
      var on = id === key;
      if (btn) {
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      setToolTabPanelActive(panel, on);
    });
  }

  var DATA_TOOL_TABS = {
    json: { btnId: 'data-tool-tab-json', panelId: 'data-tool-panel-json' },
    base64: { btnId: 'data-tool-tab-base64', panelId: 'data-tool-panel-base64' },
    url: { btnId: 'data-tool-tab-url', panelId: 'data-tool-panel-url' },
    diff: { btnId: 'data-tool-tab-diff', panelId: 'data-tool-panel-diff' },
    timestamp: { btnId: 'data-tool-tab-timestamp', panelId: 'data-tool-panel-timestamp' },
  };

  function switchDataToolTab(tab) {
    var key = Object.prototype.hasOwnProperty.call(DATA_TOOL_TABS, tab) ? tab : 'json';
    Object.keys(DATA_TOOL_TABS).forEach(function (id) {
      var cfg = DATA_TOOL_TABS[id];
      var btn = document.getElementById(cfg.btnId);
      var panel = document.getElementById(cfg.panelId);
      var on = id === key;
      setToolTabButtonActive(btn, on);
      setToolTabPanelActive(panel, on);
    });
  }

  global.switchMediaToolTab = switchMediaToolTab;
  global.switchDataToolTab = switchDataToolTab;
  global.switchMediaWorkbench = function (tab) {
    switchMediaToolTab(tab === 'audio' ? 'audio' : 'sizer');
  };
  global.switchImageToolTab = function (tab) {
    switchMediaToolTab(tab === 'format' ? 'format' : 'sizer');
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('data-tool-panel-json')) {
      var dataTab = 'json';
      try {
        var params = new URLSearchParams(window.location.search || '');
        var q = params.get('tool') || params.get('sub');
        if (q && Object.prototype.hasOwnProperty.call(DATA_TOOL_TABS, q)) dataTab = q;
      } catch (e) {}
      switchDataToolTab(dataTab);
    }
    if (document.getElementById('media-tool-tab-sizer')) {
      var mediaTab = 'sizer';
      try {
        var params2 = new URLSearchParams(window.location.search || '');
        var q2 = params2.get('media') || params2.get('sub');
        if (q2 && Object.prototype.hasOwnProperty.call(MEDIA_TOOL_TABS, q2)) mediaTab = q2;
      } catch (e2) {}
      switchMediaToolTab(mediaTab);
    }
  });
})(window);
