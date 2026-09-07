(function (global) {
  "use strict";

  function getModel() {
    var vb = global.JmsVisualBuilder;
    return vb && typeof vb.getModel === "function" ? vb.getModel() : null;
  }

  function getActivePlan() {
    var m = getModel();
    if (!m || !(m.test_plans || []).length) return null;
    var vb = global.JmsVisualBuilder;
    var sel = vb && vb.getSelection ? vb.getSelection() : null;
    if (sel && sel.planId) {
      var plans = m.test_plans || [];
      for (var i = 0; i < plans.length; i++) {
        if (plans[i].id === sel.planId) return plans[i];
      }
    }
    return m.test_plans[0];
  }

  function syncPlanName(plan) {
    var toolbar = global.document.getElementById("jms-studio-plan-toolbar");
    if (!plan) return;
    if (toolbar) {
      toolbar.setAttribute("data-plan-id", plan.id || "");
      var syncName = toolbar.querySelector(".jms-plan-name--sync, .jms-plan-name");
      if (syncName && plan.name != null) syncName.value = plan.name;
      var syncAdd = toolbar.querySelector(".jms-btn-add-tg--sync, .jms-btn-add-tg");
      if (syncAdd) syncAdd.setAttribute("data-plan-id", plan.id || "");
    }
  }

  function syncPlanMeta(plan) {
    if (!plan) return;
    var m = getModel() || {};
    var tgCount = (plan.thread_groups || []).length +
      ((m.setup_thread_groups || []).length) +
      ((m.post_thread_groups || []).length);

    var tgHint = global.document.querySelector('[data-plan-meta="tg-count"]');
    if (tgHint) {
      tgHint.textContent = tgCount + " 个线程组 · Setup / 主流程 / 清理";
    }
  }

  function syncAll() {
    var plan = getActivePlan();
    syncPlanName(plan);
    syncPlanMeta(plan);
  }

  function resolveAddTgProxy() {
    var toolbar = global.document.getElementById("jms-studio-plan-toolbar");
    if (toolbar) {
      var btn = toolbar.querySelector(".jms-btn-add-tg");
      if (btn) return btn;
    }
    return global.document.querySelector(".jms-btn-add-tg");
  }

  function bindAddTg() {
    var item = global.document.getElementById("lth-btn-add-tg");
    if (!item || item.dataset.lthAddTgBound === "1") return;
    item.dataset.lthAddTgBound = "1";
    item.addEventListener("click", function (e) {
      e.preventDefault();
      global.document.querySelectorAll(".lth-nav-item[data-lth-trigger], .lth-nav-item--plan-listener").forEach(function (n) {
        n.classList.remove("is-active");
      });
      item.classList.add("is-active");
      var proxy = resolveAddTgProxy();
      if (proxy) proxy.click();
    });
  }

  function wrapBuilder() {
    var vb = global.JmsVisualBuilder;
    if (!vb || vb.__planSettingsNavWrapped) return !!vb;
    vb.__planSettingsNavWrapped = true;
    var orig = vb.renderStudioPlanToolbar;
    if (typeof orig === "function") {
      vb.renderStudioPlanToolbar = function () {
        var r = orig.apply(this, arguments);
        global.requestAnimationFrame(syncAll);
        return r;
      };
    }
    var origRender = vb.triggerRender;
    if (typeof origRender === "function") {
      vb.triggerRender = function () {
        var r = origRender.apply(this, arguments);
        global.requestAnimationFrame(syncAll);
        return r;
      };
    }
    return true;
  }

  function boot() {
    global.document.body.classList.add("jms-plan-settings-nav-v1");
    bindAddTg();
    wrapBuilder();
    syncAll();
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
    syncAll();
    if (tries > 120) global.clearInterval(timer);
  }, 250);

  global.JmsPlanSettingsNavV1 = { sync: syncAll, boot: boot };
})(window);
