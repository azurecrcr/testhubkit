/**
 * 无效蓝湖需求文档：工作台局部锁定（模板 / AI 悬浮 / 导出悬浮）
 * AI 悬浮钮在 .tc-workbench-scope 外，需同时锁定 body 与 float-wrap。
 */
(function (global) {
  "use strict";

  var locked = false;
  var captureBound = false;
  var BODY_LOCK_CLASS = "tc-invalid-lanhu-doc-lock";
  var SCOPE_LOCK_CLASS = "tc-invalid-lanhu-doc-workbench-lock";
  var AI_WRAP_LOCK_CLASS = "tc-invalid-lanhu-doc-ai-lock";

  function getScope() {
    return document.querySelector(".tc-workbench-scope");
  }

  function bindCaptureOnce() {
    if (captureBound) return;
    captureBound = true;
    document.addEventListener(
      "click",
      function (e) {
        if (!locked) return;
        var target = e.target;
        if (!target || !target.closest) return;
        var blocked = target.closest(
          "#tc-left-input-float-wrap [data-tc-float-open]," +
            "#tc-left-float-dock .tc-left-float-dock__mode[data-tc-float-drawer]," +
            "#tc-left-float-dock .tc-left-float-dock__mode[data-tc-float-open]"
        );
        if (!blocked) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      },
      true
    );
  }

  function setTcInvalidLanhuDocWorkbenchLock(nextLocked) {
    locked = !!nextLocked;
    bindCaptureOnce();
    var scope = getScope();
    if (scope) scope.classList.toggle(SCOPE_LOCK_CLASS, locked);
    if (document.body) document.body.classList.toggle(BODY_LOCK_CLASS, locked);
    var aiWrap = document.getElementById("tc-left-input-float-wrap");
    if (aiWrap) aiWrap.classList.toggle(AI_WRAP_LOCK_CLASS, locked);
    var aiDock = document.getElementById("tc-left-float-dock");
    if (aiDock) aiDock.classList.toggle(AI_WRAP_LOCK_CLASS, locked);
  }

  function isTcInvalidLanhuDocWorkbenchLocked() {
    return locked;
  }

  global.setTcInvalidLanhuDocWorkbenchLock = setTcInvalidLanhuDocWorkbenchLock;
  global.isTcInvalidLanhuDocWorkbenchLocked = isTcInvalidLanhuDocWorkbenchLocked;
})(typeof window !== "undefined" ? window : this);
