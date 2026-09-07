/**
 * 压测造数 · 测试计划壳 P1：将 #jms-studio-plan-toolbar 移入 .jms-plan-card，不影响原有读写逻辑。
 */
(function (global) {
  "use strict";

  function ensureShell(card) {
    if (!card || card.querySelector(".jms-plan-shell__frame")) return card.querySelector(".jms-plan-shell__frame");
    var frame = global.document.createElement("div");
    frame.className = "jms-plan-shell__frame";
    var header = global.document.createElement("div");
    header.className = "jms-plan-shell__header";
    var badgeWrap = global.document.createElement("div");
    badgeWrap.className = "jms-plan-shell__badge-wrap";
    badgeWrap.innerHTML =
      '<span class="jms-plan-shell__badge">测试计划</span>' +
      '<p class="jms-plan-shell__desc">本计划下的线程组与请求步骤</p>';
    var host = global.document.createElement("div");
    host.className = "jms-plan-shell__toolbar-host";
    header.appendChild(badgeWrap);
    header.appendChild(host);
    frame.appendChild(header);
    var catalog = card.querySelector(".jms-plan-catalog-section");
    var tgs = card.querySelector(".jms-plan-tgs");
    var insertBeforeEl = tgs || catalog || card.firstChild;
    if (insertBeforeEl) {
      card.insertBefore(frame, insertBeforeEl);
    } else {
      card.appendChild(frame);
    }
    if (catalog) {
      var shellBody = frame.querySelector(".jms-plan-shell__body");
      frame.insertBefore(catalog, shellBody || null);
      catalog.classList.add("jms-plan-shell__plan-catalog");
    }
    if (tgs) {
      var body = frame.querySelector(".jms-plan-shell__body");
      if (!body) {
        body = global.document.createElement("div");
        body.className = "jms-plan-shell__body";
        frame.appendChild(body);
      }
      body.appendChild(tgs);
    }
    return frame;
  }

  function relocatePlanToolbar() {
    if (!global.document.body.classList.contains("lth-studio-v2")) return;
    if (!global.document.body.classList.contains("lth-hub-jmeter-tab")) return;
    if (global.document.body.classList.contains("jms-plan-settings-nav-v1")) return;
    var toolbar = global.document.getElementById("jms-studio-plan-toolbar");
    var card = global.document.querySelector("#jms-plans-container .jms-plan-card");
    if (!toolbar || !card) return;
    var frame = ensureShell(card);
    var host = frame && frame.querySelector(".jms-plan-shell__toolbar-host");
    if (host && toolbar.parentElement !== host) {
      host.appendChild(toolbar);
    }
    card.classList.add("jms-plan-shell-card");
    global.document.body.classList.add("jms-plan-shell-v1");
    if (global.JmsPlanListenerCardsV1 && typeof global.JmsPlanListenerCardsV1.enhance === "function") {
      global.JmsPlanListenerCardsV1.enhance();
    }
  }

  function wrapBuilder() {
    var vb = global.JmsVisualBuilder;
    if (!vb || vb.__planShellV1Wrapped) return !!vb;
    vb.__planShellV1Wrapped = true;
    var origToolbar = vb.renderStudioPlanToolbar;
    if (typeof origToolbar === "function") {
      vb.renderStudioPlanToolbar = function () {
        var r = origToolbar.apply(this, arguments);
        global.requestAnimationFrame(relocatePlanToolbar);
        return r;
      };
    }
    var origTrigger = vb.triggerRender;
    if (typeof origTrigger === "function") {
      vb.triggerRender = function () {
        var r = origTrigger.apply(this, arguments);
        global.requestAnimationFrame(relocatePlanToolbar);
        return r;
      };
    }
    return true;
  }

  function boot() {
    wrapBuilder();
    relocatePlanToolbar();
  }

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  var tries = 0;
  var timer = global.setInterval(function () {
    tries += 1;
    wrapBuilder();
    relocatePlanToolbar();
    if (tries > 120) global.clearInterval(timer);
  }, 250);

  global.JmsPlanShellV1 = { relocate: relocatePlanToolbar, boot: boot };
})(window);
