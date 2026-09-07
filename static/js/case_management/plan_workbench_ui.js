/**
 * 负责人「计划工作台」独立模块。
 * - 不改写非负责人 openPlans / openMyAssigneeRun 路径
 * - 不改写 openMetrics
 * - 负责人经 CmPlanRunUi.openPlans 委托到本模块
 */
(function (global) {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function toast(msg, type) {
    var text = String(msg == null ? "" : msg);
    var tone = type || "info";
    if (typeof global.hfFloatToast === "function") {
      global.hfFloatToast(text, {
        placement: tone === "success" ? "bottom" : "top",
        variant: tone === "error" ? "error" : tone === "success" ? "success" : "info",
      });
      return;
    }
    if (global.HfFloatToast && typeof global.HfFloatToast.show === "function") {
      global.HfFloatToast.show(text, tone);
      return;
    }
    console.log("[CmPlanWorkbench]", tone, text);
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || "GET",
      headers: Object.assign({ "Content-Type": "application/json" }, opts.headers || {}),
      credentials: "same-origin",
      body: opts.body
        ? typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body)
        : undefined,
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || res.statusText || "请求失败");
        return data;
      });
    });
  }

  function currentProjectId() {
    var sel = $("cm-project-select");
    return (sel && sel.value) || "";
  }

  function currentUserId() {
    if (global.CmCaseMgmt && typeof global.CmCaseMgmt.currentUserId === "function") {
      return String(global.CmCaseMgmt.currentUserId() || "");
    }
    return "";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusLabel(s) {
    var map = {
      draft: "草稿",
      active: "进行中",
      archived: "已归档",
      not_started: "未开始",
      in_progress: "执行中",
      done: "已完成",
      pass: "通过",
      fail: "失败",
      blocked: "阻塞",
      skip: "跳过",
      open: "未发布",
      releasable: "已发布",
      released: "已发布",
      passed: "通过",
      failed: "未通过",
    };
    return map[s] || s || "-";
  }

  function planMetaText(p) {
    var bits = [statusLabel(p && p.status)];
    var rs = String((p && p.release_status) || "").trim();
    if (rs && rs !== "open") bits.push(statusLabel(rs));
    return bits.filter(Boolean).join(" · ");
  }

  function memberLabel(m) {
    return m.label || m.display_name || m.email || m.phone_masked || m.user_id || "";
  }

  function storageKey() {
    return "cm_plan_wb_last_" + (currentProjectId() || "none");
  }

  function rememberPlan(planId) {
    try {
      if (planId) localStorage.setItem(storageKey(), String(planId));
    } catch (e) {}
  }

  function recallPlan() {
    try {
      return localStorage.getItem(storageKey()) || "";
    } catch (e) {
      return "";
    }
  }

  var state = {
    plans: [],
    planId: "",
    planName: "",
    runId: "",
    run: null,
    items: [],
    stats: null,
    tab: "cases", // cases | assignees | report
    filterAssignee: "",
    page: 1,
    pageSize: 10,
    selectedIds: {},
    selectAll: false,
    members: [],
    wizard: {
      step: 1,
      name: "",
      description: "",
      assigneeId: "",
      members: [],
    },
    pick: {
      mode: "add", // add | wizard
      suiteId: "__all__",
      page: 1,
      pageSize: 10,
      total: 0,
      cases: [],
      selectedIds: {},
      suiteSelectAll: false,
      suites: [],
      members: [],
      assigneeId: "",
      suiteCollapsed: {},
    },
  };

  function ensureDom() {
    var existing = $("cm-plan-wb-mask");
    if (existing && existing.getAttribute("data-wb-v") !== "wb1") {
      existing.parentNode && existing.parentNode.removeChild(existing);
    }
    if ($("cm-plan-wb-mask")) return;
    var mask = document.createElement("div");
    mask.id = "cm-plan-wb-mask";
    mask.className = "cm-plan-mask is-hidden";
    mask.setAttribute("data-wb-v", "wb1");
    mask.setAttribute("role", "dialog");
    mask.setAttribute("aria-modal", "true");
    mask.innerHTML =
      '<div class="cm-plan-modal cm-plan-modal--workbench">' +
      '  <div class="cm-plan-modal__head">' +
      '    <div class="cm-plan-modal__head-main">' +
      '      <p class="cm-plan-modal__eyebrow">Workbench</p>' +
      '      <h2 class="cm-plan-modal__title">计划工作台</h2>' +
      '      <p class="cm-plan-modal__sub">左侧选计划 · 右侧直接管理用例</p>' +
      "    </div>" +
      '    <button type="button" class="cm-icon-btn" id="cm-plan-wb-close" aria-label="关闭">×</button>' +
      "  </div>" +
      '  <div class="cm-plan-wb" id="cm-plan-wb-root">' +
      '    <aside class="cm-plan-wb__aside">' +
      '      <div class="cm-plan-wb__aside-head">' +
      '        <button type="button" class="cm-btn cm-btn--primary cm-btn--sm" id="cm-wb-create">新建计划</button>' +
      "      </div>" +
      '      <div class="cm-plan-wb__plan-list" id="cm-wb-plan-list"></div>' +
      "    </aside>" +
      '    <section class="cm-plan-wb__main">' +
      '      <div class="cm-plan-wb__tabs" id="cm-wb-tabs">' +
      '        <button type="button" class="cm-plan-wb__tab is-active" data-wb-tab="cases">用例</button>' +
      '        <button type="button" class="cm-plan-wb__tab" data-wb-tab="assignees">执行人</button>' +
      '        <button type="button" class="cm-plan-wb__tab" data-wb-tab="report">报告</button>' +
      "      </div>" +
      '      <div class="cm-plan-wb__toolbar" id="cm-wb-toolbar"></div>' +
      '      <div class="cm-plan-wb__content" id="cm-wb-content"></div>' +
      "    </section>" +
      "  </div>" +
      '  <div class="cm-plan-modal__foot">' +
      '    <button type="button" class="cm-btn cm-btn--ghost" id="cm-plan-wb-done">关闭</button>' +
      "  </div>" +
      "</div>";
    document.body.appendChild(mask);
    mask.addEventListener("click", function (e) {
      if (e.target === mask) close();
    });
    $("cm-plan-wb-close").addEventListener("click", close);
    $("cm-plan-wb-done").addEventListener("click", close);
    $("cm-wb-create").addEventListener("click", openWizard);
    $("cm-wb-tabs").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-wb-tab]");
      if (!btn) return;
      state.tab = btn.getAttribute("data-wb-tab") || "cases";
      syncTabs();
      renderMain();
    });
  }

  function openMask() {
    ensureDom();
    $("cm-plan-wb-mask").classList.remove("is-hidden");
  }

  function close() {
    var mask = $("cm-plan-wb-mask");
    if (mask) mask.classList.add("is-hidden");
    closePick();
    closeWizard();
  }

  function syncTabs() {
    var tabs = $("cm-wb-tabs");
    if (!tabs) return;
    tabs.querySelectorAll("[data-wb-tab]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-wb-tab") === state.tab);
    });
  }

  function open() {
    var pid = currentProjectId();
    if (!pid) return toast("请先选择项目", "error");
    openMask();
    state.tab = "cases";
    state.filterAssignee = "";
    state.page = 1;
    state.selectedIds = {};
    state.selectAll = false;
    syncTabs();
    $("cm-wb-plan-list").innerHTML = '<p class="cm-plan-muted">加载中…</p>';
    $("cm-wb-content").innerHTML = '<p class="cm-plan-muted">加载中…</p>';
    $("cm-wb-toolbar").innerHTML = "";
    Promise.all([
      api("/api/l5/projects/" + pid + "/plans"),
      api("/api/case-management/projects/" + pid + "/members"),
    ])
      .then(function (arr) {
        state.plans = (arr[0] && arr[0].items) || [];
        state.members = (arr[1] && arr[1].items) || [];
        renderPlanList();
        var prefer = recallPlan();
        var pick =
          state.plans.find(function (p) {
            return p.id === prefer;
          }) ||
          state.plans.find(function (p) {
            return p.status === "active" || p.status === "in_progress";
          }) ||
          state.plans[0];
        if (pick) selectPlan(pick.id);
        else renderEmptyMain();
      })
      .catch(function (err) {
        $("cm-wb-plan-list").innerHTML =
          '<p class="cm-plan-error">' + escapeHtml(err.message || "加载失败") + "</p>";
      });
  }

  function renderEmptyMain() {
    state.planId = "";
    state.runId = "";
    $("cm-wb-toolbar").innerHTML = "";
    $("cm-wb-content").innerHTML =
      '<div class="cm-plan-empty"><p><strong>还没有测试计划</strong></p>' +
      '<p>点左侧「新建计划」，一次完成名称、执行人与用例。</p>' +
      '<p><button type="button" class="cm-btn cm-btn--primary" id="cm-wb-empty-create">新建计划</button></p></div>';
    var btn = $("cm-wb-empty-create");
    if (btn) btn.onclick = openWizard;
  }

  function cmConfirm(opts) {
    opts = opts || {};
    if (global.CmDialogs && typeof global.CmDialogs.confirm === "function") {
      return global.CmDialogs.confirm(opts);
    }
    return Promise.resolve(window.confirm(opts.message || "确认？"));
  }

  function renderPlanList() {
    var box = $("cm-wb-plan-list");
    if (!box) return;
    if (!state.plans.length) {
      box.innerHTML = '<p class="cm-plan-muted" style="padding:0.75rem;">暂无计划</p>';
      return;
    }
    var html = "";
    state.plans.forEach(function (p) {
      html +=
        '<div class="cm-plan-wb__plan' +
        (p.id === state.planId ? " is-active" : "") +
        '" data-wb-plan="' +
        escapeHtml(p.id) +
        '">' +
        '<button type="button" class="cm-plan-wb__plan-main" data-wb-plan-open="' +
        escapeHtml(p.id) +
        '">' +
        '<span class="cm-plan-wb__plan-name">' +
        escapeHtml(p.name) +
        "</span>" +
        '<span class="cm-plan-wb__plan-meta">' +
        escapeHtml(planMetaText(p)) +
        "</span>" +
        "</button>" +
        '<button type="button" class="cm-plan-wb__plan-del" data-wb-plan-del="' +
        escapeHtml(p.id) +
        '" data-wb-plan-name="' +
        escapeHtml(p.name) +
        '" title="删除计划" aria-label="删除计划">×</button>' +
        "</div>";
    });
    box.innerHTML = html;
    box.querySelectorAll("[data-wb-plan-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectPlan(btn.getAttribute("data-wb-plan-open"));
      });
    });
    box.querySelectorAll("[data-wb-plan-del]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        deletePlan(
          btn.getAttribute("data-wb-plan-del"),
          btn.getAttribute("data-wb-plan-name")
        );
      });
    });
  }

  function deletePlan(planId, planName) {
    if (!planId) return;
    var name = planName || "该计划";
    cmConfirm({
      title: "删除测试计划",
      message:
        "确定删除「" +
        name +
        "」吗？将同时移除计划内的用例分配与执行进度，历史单条执行记录会保留。此操作不可恢复。",
      confirmText: "删除",
      cancelText: "取消",
      danger: true,
    }).then(function (ok) {
      if (!ok) return;
      api("/api/l5/plans/" + encodeURIComponent(planId), { method: "DELETE" })
        .then(function () {
          toast("已删除计划", "success");
          try {
            if (recallPlan() === planId) localStorage.removeItem(storageKey());
          } catch (e) {}
          var pid = currentProjectId();
          return api("/api/l5/projects/" + pid + "/plans").then(function (data) {
            state.plans = data.items || [];
            if (state.planId === planId) {
              state.planId = "";
              state.runId = "";
              state.items = [];
              state.stats = null;
            }
            renderPlanList();
            var next = state.plans[0];
            if (next) selectPlan(next.id);
            else renderEmptyMain();
          });
        })
        .catch(function (err) {
          toast(err.message || "删除失败", "error");
        });
    });
  }

  function selectPlan(planId) {
    if (!planId) return;
    state.planId = planId;
    state.tab = "cases";
    state.filterAssignee = "";
    state.page = 1;
    state.selectedIds = {};
    state.selectAll = false;
    rememberPlan(planId);
    syncTabs();
    renderPlanList();
    $("cm-wb-content").innerHTML = '<p class="cm-plan-muted">加载中…</p>';
    api("/api/l5/plans/" + planId)
      .then(function (data) {
        var plan = (data && data.item) || {};
        state.plan = plan;
        state.planName = plan.name || "";
        state.runId = data.run_id || (data.run && data.run.id) || "";
        if (!state.runId) throw new Error("计划执行集不存在");
        return refreshRunData();
      })
      .then(function () {
        renderMain();
      })
      .catch(function (err) {
        $("cm-wb-content").innerHTML =
          '<p class="cm-plan-error">' + escapeHtml(err.message || "打开失败") + "</p>";
      });
  }

  function refreshRunData() {
    return Promise.all([
      api("/api/l5/runs/" + state.runId),
      api("/api/l5/runs/" + state.runId + "/items"),
      api("/api/l5/runs/" + state.runId + "/stats"),
    ]).then(function (arr) {
      state.run = (arr[0] && arr[0].item) || {};
      state.items = (arr[1] && arr[1].items) || [];
      state.stats = arr[2] || {};
    });
  }

  function refreshAndRender() {
    if (!state.runId) return;
    refreshRunData()
      .then(function () {
        // 计划列表可能因新建变化，静默刷新
        var pid = currentProjectId();
        if (pid) {
          return api("/api/l5/projects/" + pid + "/plans").then(function (data) {
            state.plans = data.items || [];
            renderPlanList();
          });
        }
      })
      .then(function () {
        renderMain();
      })
      .catch(function (err) {
        toast(err.message || "刷新失败", "error");
      });
  }

  function filteredItems() {
    var key = String(state.filterAssignee || "");
    if (!key) return state.items || [];
    return (state.items || []).filter(function (it) {
      var aid = String(it.assignee_id || "").trim() || "__none__";
      return aid === key;
    });
  }

  function buildAssigneeGroups() {
    var map = {};
    (state.items || []).forEach(function (it) {
      var key = String(it.assignee_id || "").trim() || "__none__";
      if (!map[key]) {
        map[key] = {
          key: key,
          label:
            key === "__none__"
              ? "未指定执行人"
              : it.assignee_label || key.slice(0, 8),
          total: 0,
          done: 0,
          pass: 0,
          fail: 0,
          blocked: 0,
          unset: 0,
        };
      }
      var g = map[key];
      g.total += 1;
      var res = String(it.result || "");
      if (!res) g.unset += 1;
      else {
        g.done += 1;
        if (res === "pass") g.pass += 1;
        else if (res === "fail") g.fail += 1;
        else if (res === "blocked") g.blocked += 1;
      }
    });
    return Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        return b.total - a.total;
      });
  }

  function renderMain() {
    if (!state.planId || !state.runId) {
      renderEmptyMain();
      return;
    }
    syncTabs();
    if (state.tab === "assignees") {
      renderAssigneesTab();
      return;
    }
    if (state.tab === "report") {
      renderReportTab();
      return;
    }
    renderCasesTab();
  }

  function planExecLocked() {
    return !!(
      global.CmPlanGateUi &&
      typeof global.CmPlanGateUi.isLocked === "function" &&
      global.CmPlanGateUi.isLocked(state.plan && state.plan.release_status)
    );
  }

  function renderCasesToolbar() {
    var st = state.stats || {};
    var locked = planExecLocked();
    var opts =
      '<option value="">全部执行人</option><option value="__none__">未指定执行人</option>';
    buildAssigneeGroups().forEach(function (g) {
      if (g.key === "__none__") return;
      opts +=
        '<option value="' +
        escapeHtml(g.key) +
        '"' +
        (state.filterAssignee === g.key ? " selected" : "") +
        ">" +
        escapeHtml(g.label) +
        "</option>";
    });
    $("cm-wb-toolbar").innerHTML =
      (locked
        ? ""
        : '<button type="button" class="cm-btn cm-btn--primary cm-btn--sm" id="cm-wb-add-cases">添加用例</button>') +
      (global.CmPlanGateUi && typeof global.CmPlanGateUi.buttonsHtml === "function"
        ? global.CmPlanGateUi.buttonsHtml(state.plan)
        : '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-wb-gate-btn">发布</button>') +
      '<label class="cm-plan-wb__filter">执行人 ' +
      '<select id="cm-wb-filter-assignee" class="cm-select cm-select--sm">' +
      opts +
      "</select></label>" +
      '<span class="cm-plan-wb__sel" id="cm-wb-sel-count" hidden></span>' +
      (locked
        ? ""
        : '<div class="cm-plan-batch-menu is-hidden" id="cm-wb-batch">' +
          '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-wb-batch-toggle" aria-expanded="false" aria-haspopup="true">批量结果</button>' +
          '<div class="cm-plan-batch-menu__list" id="cm-wb-batch-list" hidden>' +
          '<button type="button" data-wb-batch="pass">通过</button>' +
          '<button type="button" data-wb-batch="fail">失败</button>' +
          '<button type="button" data-wb-batch="blocked">阻塞</button>' +
          '<button type="button" data-wb-batch="skip">跳过</button>' +
          "</div>" +
          "</div>") +
      '<span class="cm-plan-stats" id="cm-wb-stats">进度 ' +
      (st.progress || 0) +
      "% · 通过 " +
      (st.pass || 0) +
      " / 失败 " +
      (st.fail || 0) +
      " / 未测 " +
      (st.unset || 0) +
      "</span>" +
      (global.CmPlanGateUi && typeof global.CmPlanGateUi.lockHintHtml === "function"
        ? global.CmPlanGateUi.lockHintHtml(state.plan)
        : "");

    // restore filter selected
    var filterSel = $("cm-wb-filter-assignee");
    if (filterSel) {
      filterSel.value = state.filterAssignee || "";
      filterSel.onchange = function () {
        state.filterAssignee = filterSel.value || "";
        state.page = 1;
        state.selectedIds = {};
        state.selectAll = false;
        renderCasesTab();
      };
    }
    var addBtn = $("cm-wb-add-cases");
    if (addBtn) {
      addBtn.onclick = function () {
        if (planExecLocked()) {
          toast("计划已判定，执行已锁定；请先取消发布", "error");
          return;
        }
        openPick("add");
      };
    }
    if (global.CmPlanGateUi && typeof global.CmPlanGateUi.mount === "function") {
      global.CmPlanGateUi.mount($("cm-wb-toolbar"), {
        planId: state.planId,
        getPlan: function () {
          return state.plan;
        },
        onChange: function (plan) {
          state.plan = plan || state.plan;
          var i;
          for (i = 0; i < state.plans.length; i++) {
            if (state.plans[i].id === state.planId) {
              state.plans[i] = Object.assign({}, state.plans[i], plan || {});
              break;
            }
          }
          renderPlanList();
          refreshRunData()
            .then(function () {
              renderMain();
            })
            .catch(function (err) {
              toast(err.message || "刷新失败", "error");
              renderMain();
            });
        },
      });
    } else {
      var gateBtn = $("cm-wb-gate-btn");
      if (gateBtn) {
        gateBtn.onclick = function () {
          toast("发布模块未加载，请刷新页面", "error");
        };
      }
    }
    if (locked) return;
    var batch = $("cm-wb-batch");
    var batchToggle = $("cm-wb-batch-toggle");
    var batchList = $("cm-wb-batch-list");
    function closeBatchMenu() {
      if (!batchList || !batchToggle) return;
      batchList.hidden = true;
      batchToggle.setAttribute("aria-expanded", "false");
    }
    if (batchToggle && batchList) {
      batchToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = batchList.hidden;
        batchList.hidden = !open;
        batchToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    if (!state._batchMenuDocBound) {
      state._batchMenuDocBound = true;
      document.addEventListener("click", function (e) {
        var menu = $("cm-wb-batch");
        if (!menu || menu.classList.contains("is-hidden") || menu.contains(e.target)) return;
        var list = $("cm-wb-batch-list");
        var toggle = $("cm-wb-batch-toggle");
        if (list) list.hidden = true;
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      });
    }
    if (batch) {
      batch.querySelectorAll("[data-wb-batch]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          closeBatchMenu();
          batchExecute(btn.getAttribute("data-wb-batch"));
        });
      });
    }
  }

  function pageSlice() {
    var items = filteredItems();
    var pageSize = state.pageSize || 10;
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    var page = Math.min(Math.max(1, state.page || 1), totalPages);
    state.page = page;
    var start = (page - 1) * pageSize;
    return {
      items: items,
      pageItems: items.slice(start, start + pageSize),
      page: page,
      totalPages: totalPages,
      total: total,
      pageSize: pageSize,
    };
  }

  function selectedCount() {
    if (state.selectAll) return filteredItems().length;
    return Object.keys(state.selectedIds).length;
  }

  function syncSelectionUi() {
    var n = selectedCount();
    var countEl = $("cm-wb-sel-count");
    var batch = $("cm-wb-batch");
    if (countEl) {
      if (state.selectAll) {
        countEl.textContent = "已选全部 " + filteredItems().length;
        countEl.hidden = false;
      } else if (n > 0) {
        countEl.textContent = "已选 " + n;
        countEl.hidden = false;
      } else {
        countEl.textContent = "";
        countEl.hidden = true;
      }
    }
    if (batch) {
      batch.classList.toggle("is-hidden", n <= 0);
      if (n <= 0) {
        var list = $("cm-wb-batch-list");
        var toggle = $("cm-wb-batch-toggle");
        if (list) list.hidden = true;
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      }
    }
  }

  function resolveSelectedIds() {
    if (state.selectAll) {
      return filteredItems().map(function (it) {
        return it.id;
      });
    }
    return Object.keys(state.selectedIds);
  }

  function cycleHeadSelection(pageItems) {
    if (!(pageItems || []).length) return;
    var pageFully =
      !state.selectAll &&
      pageItems.every(function (it) {
        return !!state.selectedIds[it.id];
      }) &&
      Object.keys(state.selectedIds).length === pageItems.length;
    if (state.selectAll) {
      state.selectAll = false;
      state.selectedIds = {};
    } else if (pageFully) {
      state.selectAll = true;
      state.selectedIds = {};
    } else {
      state.selectAll = false;
      state.selectedIds = {};
      pageItems.forEach(function (it) {
        state.selectedIds[it.id] = true;
      });
    }
    renderCasesTab();
  }

  function renderCasesTab() {
    renderCasesToolbar();
    var slice = pageSlice();
    var content = $("cm-wb-content");
    if (!slice.total) {
      content.innerHTML =
        '<div class="cm-plan-empty"><p><strong>' +
        (state.filterAssignee ? "筛选条件下没有用例" : "计划里还没有用例") +
        "</strong></p>" +
        (state.filterAssignee
          ? '<p><button type="button" class="cm-btn cm-btn--ghost" id="cm-wb-clear-filter">清除筛选</button></p>'
          : planExecLocked()
            ? '<p class="cm-plan-muted">计划已判定，无法添加用例。请先取消发布。</p>'
            : '<p>点「添加用例」，勾选后在同一抽屉指定执行人。</p>' +
              '<p><button type="button" class="cm-btn cm-btn--primary" id="cm-wb-empty-add">添加用例</button></p>') +
        "</div>";
      var clear = $("cm-wb-clear-filter");
      if (clear) {
        clear.onclick = function () {
          state.filterAssignee = "";
          renderCasesTab();
        };
      }
      var add = $("cm-wb-empty-add");
      if (add) add.onclick = function () {
        openPick("add");
      };
      syncSelectionUi();
      return;
    }

    var locked = planExecLocked();
    var html =
      '<table class="cm-plan-table"><thead><tr>' +
      (locked
        ? ""
        : '<th class="cm-th-check" style="width:36px">' +
          '<label class="cm-check-wrap" title="点击切换：本页 → 全部 → 取消">' +
          '<input type="checkbox" class="cm-check" id="cm-wb-check-head" aria-label="全选">' +
          '<span class="cm-check-wrap__box" aria-hidden="true"></span></label></th>') +
      "<th>用例</th><th>优先级</th><th>执行人</th><th>结果</th>" +
      (locked ? "" : "<th>操作</th>") +
      "</tr></thead><tbody>";

    slice.pageItems.forEach(function (it) {
      var res = it.result || "";
      var checked = !!(state.selectAll || state.selectedIds[it.id]);
      var assignee =
        it.assignee_label ||
        (it.assignee_id ? String(it.assignee_id).slice(0, 8) : "未指定");
      html +=
        "<tr>" +
        (locked
          ? ""
          : '<td class="cm-td-check"><label class="cm-check-wrap">' +
            '<input type="checkbox" class="cm-check" data-wb-item="' +
            escapeHtml(it.id) +
            '"' +
            (checked ? " checked" : "") +
            ">" +
            '<span class="cm-check-wrap__box" aria-hidden="true"></span></label></td>') +
        "<td>" +
        escapeHtml(it.title || it.case_id) +
        "</td>" +
        "<td>" +
        escapeHtml(it.priority || "-") +
        "</td>" +
        "<td>" +
        escapeHtml(assignee) +
        "</td>" +
        "<td>" +
        (res
          ? '<span class="cm-plan-pill cm-plan-pill--' +
            escapeHtml(res) +
            '">' +
            escapeHtml(statusLabel(res)) +
            "</span>"
          : '<span class="cm-plan-muted">未测</span>') +
        "</td>" +
        (locked
          ? ""
          : "<td class='cm-plan-exec-cell'>" +
            '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-wb-exec="pass" data-item="' +
            escapeHtml(it.id) +
            '">通过</button>' +
            '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-wb-exec="fail" data-item="' +
            escapeHtml(it.id) +
            '">失败</button>' +
            '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-wb-exec="blocked" data-item="' +
            escapeHtml(it.id) +
            '">阻塞</button>' +
            '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-wb-exec="skip" data-item="' +
            escapeHtml(it.id) +
            '">跳过</button></td>') +
        "</tr>";
    });
    html += "</tbody></table>";
    html += '<div class="cm-plan-pick-foot" style="border:0;padding:0.75rem 0;">';
    if (slice.total <= slice.pageSize) {
      html += '<span class="cm-plan-muted">共 ' + slice.total + " 条</span>";
    } else {
      html +=
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-wb-prev"' +
        (slice.page <= 1 ? " disabled" : "") +
        ">上一页</button> " +
        "<span class='cm-plan-muted'>" +
        slice.page +
        " / " +
        slice.totalPages +
        "（共 " +
        slice.total +
        " 条）</span> " +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-wb-next"' +
        (slice.page >= slice.totalPages ? " disabled" : "") +
        ">下一页</button>";
    }
    html += "</div>";
    content.innerHTML = html;

    var headCb = $("cm-wb-check-head");
    if (headCb) {
      var pageIds = slice.pageItems.map(function (it) {
        return it.id;
      });
      var checkedN = 0;
      pageIds.forEach(function (id) {
        if (state.selectAll || state.selectedIds[id]) checkedN += 1;
      });
      headCb.checked = !!state.selectAll;
      headCb.indeterminate = !state.selectAll && checkedN > 0;
      headCb.addEventListener("click", function (e) {
        e.preventDefault();
        cycleHeadSelection(slice.pageItems);
      });
    }
    content.querySelectorAll("[data-wb-item]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-wb-item");
        if (state.selectAll) {
          state.selectAll = false;
          state.selectedIds = {};
          filteredItems().forEach(function (it) {
            state.selectedIds[it.id] = true;
          });
        }
        if (cb.checked) state.selectedIds[id] = true;
        else delete state.selectedIds[id];
        renderCasesTab();
      });
    });
    var prev = $("cm-wb-prev");
    var next = $("cm-wb-next");
    if (prev) {
      prev.onclick = function () {
        if (state.page <= 1) return;
        state.page -= 1;
        renderCasesTab();
      };
    }
    if (next) {
      next.onclick = function () {
        if (state.page >= slice.totalPages) return;
        state.page += 1;
        renderCasesTab();
      };
    }
    content.querySelectorAll("[data-wb-exec]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (planExecLocked()) {
          toast("计划已判定，执行已锁定；请先取消发布", "error");
          return;
        }
        var itemId = btn.getAttribute("data-item");
        var result = btn.getAttribute("data-wb-exec");
        api("/api/l5/run-items/" + itemId + "/execute", {
          method: "POST",
          body: { result: result, comment: "" },
        })
          .then(function () {
            toast("已记录：" + statusLabel(result), "success");
            refreshAndRender();
          })
          .catch(function (err) {
            toast(err.message || "登记失败", "error");
          });
      });
    });
    syncSelectionUi();
  }

  function batchExecute(result) {
    if (planExecLocked()) {
      toast("计划已判定，执行已锁定；请先取消发布", "error");
      return;
    }
    var ids = resolveSelectedIds();
    if (!ids.length) return toast("请先勾选用例", "error");
    api("/api/l5/runs/" + state.runId + "/items/batch-execute", {
      method: "POST",
      body: { item_ids: ids, result: result, comment: "" },
    })
      .then(function (res) {
        var msg = "已批量登记 " + (res.updated || 0) + " 条：" + statusLabel(result);
        if (res.failed) msg += "，失败 " + res.failed + " 条";
        toast(msg, res.failed ? "error" : "success");
        state.selectedIds = {};
        state.selectAll = false;
        if (res.stats) state.stats = res.stats;
        refreshAndRender();
      })
      .catch(function (err) {
        toast(err.message || "批量执行失败", "error");
      });
  }

  function renderAssigneesTab() {
    $("cm-wb-toolbar").innerHTML =
      '<span class="cm-plan-muted">进度总览 · 点「只看此人」回到用例并筛选</span>';
    var groups = buildAssigneeGroups();
    var content = $("cm-wb-content");
    if (!groups.length) {
      content.innerHTML =
        '<div class="cm-plan-empty"><p>暂无执行人数据</p>' +
        '<p><button type="button" class="cm-btn cm-btn--primary" id="cm-wb-as-add">添加用例</button></p></div>';
      var b = $("cm-wb-as-add");
      if (b) b.onclick = function () {
        state.tab = "cases";
        syncTabs();
        openPick("add");
      };
      return;
    }
    var html =
      '<table class="cm-plan-table"><thead><tr>' +
      "<th>执行人</th><th>用例数</th><th>进度</th><th>通过</th><th>失败</th><th>阻塞</th><th>未测</th><th></th>" +
      "</tr></thead><tbody>";
    groups.forEach(function (g) {
      var pct = g.total ? Math.round((1000 * g.done) / g.total) / 10 : 0;
      html +=
        "<tr><td>" +
        escapeHtml(g.label) +
        "</td><td>" +
        g.total +
        "</td><td>" +
        pct +
        "%</td><td>" +
        g.pass +
        "</td><td>" +
        g.fail +
        "</td><td>" +
        g.blocked +
        "</td><td>" +
        g.unset +
        '</td><td><button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-wb-only="' +
        escapeHtml(g.key) +
        '">只看此人</button></td></tr>';
    });
    html += "</tbody></table>";
    content.innerHTML = html;
    content.querySelectorAll("[data-wb-only]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filterAssignee = btn.getAttribute("data-wb-only") || "";
        state.tab = "cases";
        state.page = 1;
        syncTabs();
        renderCasesTab();
      });
    });
  }

  function renderReportTab() {
    $("cm-wb-toolbar").innerHTML = '<span class="cm-plan-muted">只读统计</span>';
    var content = $("cm-wb-content");
    content.innerHTML = '<p class="cm-plan-muted">加载中…</p>';
    api("/api/l5/runs/" + state.runId + "/report")
      .then(function (rep) {
        var st = rep.stats || {};
        var html =
          '<div class="cm-metrics-grid">' +
          card("合计", String(st.total || 0)) +
          card("通过", String(st.pass || 0)) +
          card("失败", String(st.fail || 0)) +
          card("未测", String(st.unset || 0)) +
          "</div>";
        if ((rep.unset || []).length) {
          html +=
            '<div class="cm-metrics-section"><h3>未执行</h3><ul class="cm-metrics-list">' +
            rep.unset
              .map(function (t) {
                return "<li><span>" + escapeHtml(t) + "</span><strong>-</strong></li>";
              })
              .join("") +
            "</ul></div>";
        }
        content.innerHTML = html;
      })
      .catch(function (err) {
        content.innerHTML =
          '<p class="cm-plan-error">' + escapeHtml(err.message || "加载失败") + "</p>";
      });
  }

  function card(label, value) {
    return (
      '<div class="cm-metrics-card"><div class="cm-metrics-card__label">' +
      escapeHtml(label) +
      '</div><div class="cm-metrics-card__value">' +
      escapeHtml(value) +
      "</div></div>"
    );
  }

  /* —— 添加用例抽屉（独立 mask，不改 cm-plan-pick-mask） —— */

  function ensurePickDom() {
    var existing = $("cm-plan-wb-pick-mask");
    if (existing && existing.getAttribute("data-wb-v") !== "pick1") {
      existing.parentNode && existing.parentNode.removeChild(existing);
    }
    if ($("cm-plan-wb-pick-mask")) return;
    var mask = document.createElement("div");
    mask.id = "cm-plan-wb-pick-mask";
    mask.className = "cm-plan-mask is-hidden";
    mask.style.zIndex = "270";
    mask.setAttribute("data-wb-v", "pick1");
    mask.innerHTML =
      '<div class="cm-plan-modal">' +
      '  <div class="cm-plan-modal__head">' +
      '    <div class="cm-plan-modal__head-main">' +
      '      <p class="cm-plan-modal__eyebrow">Add Cases</p>' +
      '      <h2 class="cm-plan-modal__title" id="cm-wb-pick-title">添加用例</h2>' +
      '      <p class="cm-plan-modal__sub">勾选 ready 用例，底部指定执行人后一次提交</p>' +
      "    </div>" +
      '    <button type="button" class="cm-icon-btn" id="cm-wb-pick-close">×</button>' +
      "  </div>" +
      '  <div class="cm-plan-pick-layout">' +
      '    <div class="cm-plan-pick-tree"><ul id="cm-wb-pick-tree" class="cm-tree"></ul></div>' +
      '    <div class="cm-plan-pick-main">' +
      '      <div class="cm-plan-modal__toolbar"><span class="cm-plan-muted" id="cm-wb-pick-count"></span></div>' +
      '      <div class="cm-plan-pick-cases" id="cm-wb-pick-cases-wrap"></div>' +
      '      <div class="cm-plan-pick-foot">' +
      '        <span class="cm-plan-muted" id="cm-wb-pick-pager"></span>' +
      '        <label class="cm-plan-wb__assignee-inline">执行人 ' +
      '          <select id="cm-wb-pick-assignee" class="cm-select cm-select--sm"></select>' +
      "        </label>" +
      '        <span style="flex:1"></span>' +
      '        <button type="button" class="cm-btn cm-btn--ghost" id="cm-wb-pick-cancel">取消</button>' +
      '        <button type="button" class="cm-btn cm-btn--primary" id="cm-wb-pick-submit">添加到计划</button>' +
      "      </div>" +
      "    </div>" +
      "  </div>" +
      "</div>";
    document.body.appendChild(mask);
    $("cm-wb-pick-close").onclick = closePick;
    $("cm-wb-pick-cancel").onclick = closePick;
    $("cm-wb-pick-submit").onclick = submitPick;
    mask.addEventListener("click", function (e) {
      if (e.target === mask) closePick();
    });
  }

  function closePick() {
    var mask = $("cm-plan-wb-pick-mask");
    if (mask) mask.classList.add("is-hidden");
  }

  function fillAssigneeSelect(sel, members, preferred) {
    if (!sel) return;
    sel.innerHTML = "";
    var list = (members || []).filter(function (m) {
      return m && m.user_id;
    });
    if (!list.length) {
      var o = document.createElement("option");
      o.value = "";
      o.textContent = "暂无成员";
      sel.appendChild(o);
      return;
    }
    list.forEach(function (m) {
      var o = document.createElement("option");
      o.value = String(m.user_id);
      o.textContent = memberLabel(m);
      sel.appendChild(o);
    });
    var pref = preferred || currentUserId() || list[0].user_id;
    sel.value = String(pref);
    if (!sel.value) sel.value = String(list[0].user_id);
  }

  function openPick(mode) {
    if (mode === "add" && planExecLocked()) {
      toast("计划已判定，执行已锁定；请先取消发布", "error");
      return;
    }
    var pid = currentProjectId();
    if (!pid) return toast("请先选择项目", "error");
    if (mode === "add" && !state.runId) return toast("请先选择计划", "error");
    ensurePickDom();
    state.pick = {
      mode: mode || "add",
      suiteId: "__all__",
      page: 1,
      pageSize: 10,
      total: 0,
      cases: [],
      selectedIds: {},
      suiteSelectAll: false,
      suites: [],
      members: [],
      assigneeId: state.wizard.assigneeId || "",
      suiteCollapsed: {},
    };
    $("cm-wb-pick-title").textContent = mode === "wizard" ? "选用例（向导）" : "添加用例";
    $("cm-wb-pick-submit").textContent = mode === "wizard" ? "完成并打开" : "添加到计划";
    $("cm-plan-wb-pick-mask").classList.remove("is-hidden");
    $("cm-wb-pick-cases-wrap").innerHTML =
      '<p class="cm-plan-muted" style="padding:16px;">加载中…</p>';
    Promise.all([
      api("/api/case-management/projects/" + pid + "/suites"),
      api("/api/case-management/projects/" + pid + "/members"),
    ])
      .then(function (arr) {
        state.pick.suites = (arr[0] && arr[0].items) || [];
        state.pick.members = (arr[1] && arr[1].items) || [];
        fillAssigneeSelect(
          $("cm-wb-pick-assignee"),
          state.pick.members,
          state.pick.assigneeId || state.wizard.assigneeId
        );
        renderPickTree();
        loadPickCases();
      })
      .catch(function (err) {
        toast(err.message || "加载失败", "error");
        closePick();
      });
  }

  function buildPickSuiteForest() {
    var byParent = { "": [] };
    (state.pick.suites || []).forEach(function (s) {
      var pid = String(s.parent_id || "");
      if (!byParent[pid]) byParent[pid] = [];
      byParent[pid].push(s);
    });
    return byParent;
  }

  function renderPickTree() {
    var ul = $("cm-wb-pick-tree");
    if (!ul) return;
    ul.innerHTML = "";
    function addAll() {
      var li = document.createElement("li");
      li.className = "cm-tree-item";
      var row = document.createElement("div");
      row.className =
        "cm-tree-row" + (state.pick.suiteId === "__all__" ? " is-active" : "");
      row.innerHTML = '<span class="cm-tree-label">全部目录</span>';
      row.onclick = function () {
        state.pick.suiteId = "__all__";
        state.pick.page = 1;
        state.pick.suiteSelectAll = false;
        state.pick.selectedIds = {};
        renderPickTree();
        loadPickCases();
      };
      li.appendChild(row);
      ul.appendChild(li);
    }
    function addSuite(suiteObj, depth) {
      var li = document.createElement("li");
      li.className = "cm-tree-item";
      var row = document.createElement("div");
      row.className =
        "cm-tree-row" +
        (String(state.pick.suiteId) === String(suiteObj.id) ? " is-active" : "");
      row.style.paddingLeft = 0.5 + depth * 0.9 + "rem";
      row.innerHTML =
        '<span class="cm-tree-label">' + escapeHtml(suiteObj.name || "目录") + "</span>";
      row.onclick = function () {
        state.pick.suiteId = String(suiteObj.id);
        state.pick.page = 1;
        state.pick.suiteSelectAll = false;
        state.pick.selectedIds = {};
        renderPickTree();
        loadPickCases();
      };
      li.appendChild(row);
      ul.appendChild(li);
      var byParent = buildPickSuiteForest();
      (byParent[String(suiteObj.id)] || []).forEach(function (child) {
        addSuite(child, depth + 1);
      });
    }
    var byParent = buildPickSuiteForest();
    addAll();
    (byParent[""] || []).forEach(function (s) {
      addSuite(s, 0);
    });
  }

  function pickSelectedCount() {
    if (state.pick.suiteSelectAll) return state.pick.total || 0;
    return Object.keys(state.pick.selectedIds).length;
  }

  function syncPickCount() {
    var el = $("cm-wb-pick-count");
    if (!el) return;
    var n = pickSelectedCount();
    el.textContent = n
      ? state.pick.suiteSelectAll
        ? "已选当前目录全部 " + n + " 条"
        : "已选 " + n + " 条"
      : "未选用例";
  }

  function loadPickCases() {
    var pid = currentProjectId();
    var wrap = $("cm-wb-pick-cases-wrap");
    if (wrap) wrap.innerHTML = '<p class="cm-plan-muted" style="padding:16px;">加载中…</p>';
    var qs =
      "/api/case-management/projects/" +
      pid +
      "/cases?status=ready&suite_id=" +
      encodeURIComponent(state.pick.suiteId || "__all__") +
      "&page=" +
      (state.pick.page || 1) +
      "&page_size=" +
      (state.pick.pageSize || 10);
    api(qs)
      .then(function (data) {
        state.pick.cases = data.items || [];
        state.pick.total = data.total != null ? data.total : state.pick.cases.length;
        renderPickCases();
      })
      .catch(function (err) {
        if (wrap) {
          wrap.innerHTML =
            '<p class="cm-plan-error" style="padding:16px;">' +
            escapeHtml(err.message || "加载失败") +
            "</p>";
        }
      });
  }

  function renderPickCases() {
    var wrap = $("cm-wb-pick-cases-wrap");
    if (!wrap) return;
    var cases = state.pick.cases || [];
    var html =
      '<table class="cm-plan-table"><thead><tr>' +
      '<th style="width:36px"><label class="cm-check-wrap">' +
      '<input type="checkbox" class="cm-check" id="cm-wb-pick-head">' +
      '<span class="cm-check-wrap__box" aria-hidden="true"></span></label></th>' +
      "<th>用例</th><th>优先级</th></tr></thead><tbody>";
    if (!cases.length) {
      html +=
        '<tr><td colspan="3" class="cm-plan-muted">当前目录下没有 ready 用例</td></tr>';
    } else {
      cases.forEach(function (c) {
        var checked = !!(state.pick.suiteSelectAll || state.pick.selectedIds[c.id]);
        html +=
          "<tr><td><label class=\"cm-check-wrap\">" +
          '<input type="checkbox" class="cm-check" data-wb-pick="' +
          escapeHtml(c.id) +
          '"' +
          (checked ? " checked" : "") +
          ">" +
          '<span class="cm-check-wrap__box" aria-hidden="true"></span></label></td>' +
          "<td>" +
          escapeHtml(c.title || c.id) +
          "</td><td>" +
          escapeHtml(c.priority || "-") +
          "</td></tr>";
      });
    }
    html += "</tbody></table>";
    wrap.innerHTML = html;
    var head = $("cm-wb-pick-head");
    if (head) {
      head.onclick = function (e) {
        e.preventDefault();
        if (state.pick.suiteSelectAll) {
          state.pick.suiteSelectAll = false;
          state.pick.selectedIds = {};
        } else if (
          cases.length &&
          cases.every(function (c) {
            return state.pick.selectedIds[c.id];
          }) &&
          Object.keys(state.pick.selectedIds).length === cases.length
        ) {
          state.pick.suiteSelectAll = true;
          state.pick.selectedIds = {};
        } else {
          state.pick.suiteSelectAll = false;
          state.pick.selectedIds = {};
          cases.forEach(function (c) {
            state.pick.selectedIds[c.id] = true;
          });
        }
        renderPickCases();
      };
    }
    wrap.querySelectorAll("[data-wb-pick]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-wb-pick");
        if (state.pick.suiteSelectAll) {
          state.pick.suiteSelectAll = false;
          state.pick.selectedIds = {};
        }
        if (cb.checked) state.pick.selectedIds[id] = true;
        else delete state.pick.selectedIds[id];
        syncPickCount();
      });
    });
    syncPickPager();
    syncPickCount();
  }

  function syncPickPager() {
    var el = $("cm-wb-pick-pager");
    if (!el) return;
    var total = state.pick.total || 0;
    var pageSize = state.pick.pageSize || 10;
    var totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    var page = state.pick.page || 1;
    if (total <= pageSize) {
      el.textContent = total ? "共 " + total + " 条" : "";
      return;
    }
    el.innerHTML =
      '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-wb-pick-prev"' +
      (page <= 1 ? " disabled" : "") +
      ">上一页</button> " +
      page +
      " / " +
      totalPages +
      ' <button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-wb-pick-next"' +
      (page >= totalPages ? " disabled" : "") +
      ">下一页</button>";
    var prev = $("cm-wb-pick-prev");
    var next = $("cm-wb-pick-next");
    if (prev) {
      prev.onclick = function () {
        if (state.pick.page <= 1) return;
        state.pick.page -= 1;
        loadPickCases();
      };
    }
    if (next) {
      next.onclick = function () {
        if (state.pick.page >= totalPages) return;
        state.pick.page += 1;
        loadPickCases();
      };
    }
  }

  function fetchAllReadyCaseIds() {
    var pid = currentProjectId();
    var suiteId = state.pick.suiteId || "__all__";
    var pageSize = 100;
    var all = [];
    function loadPage(page) {
      return api(
        "/api/case-management/projects/" +
          pid +
          "/cases?status=ready&suite_id=" +
          encodeURIComponent(suiteId) +
          "&page=" +
          page +
          "&page_size=" +
          pageSize
      ).then(function (data) {
        (data.items || []).forEach(function (c) {
          if (c && c.id) all.push(c.id);
        });
        var total = data.total != null ? data.total : all.length;
        if (all.length < total && (data.items || []).length > 0) {
          return loadPage(page + 1);
        }
        return all;
      });
    }
    return loadPage(1);
  }

  function resolvePickCaseIds() {
    if (state.pick.suiteSelectAll) return fetchAllReadyCaseIds();
    return Promise.resolve(Object.keys(state.pick.selectedIds));
  }

  function submitPick() {
    if (pickSelectedCount() <= 0) return toast("请至少勾选一条用例", "error");
    var assigneeEl = $("cm-wb-pick-assignee");
    var assigneeId = assigneeEl ? String(assigneeEl.value || "").trim() : "";
    if (!assigneeId) return toast("请指定执行人", "error");
    resolvePickCaseIds()
      .then(function (ids) {
        if (!ids.length) throw new Error("请至少勾选一条用例");
        if (state.pick.mode === "wizard") {
          return submitWizardWithCases(ids, assigneeId);
        }
        return api("/api/l5/runs/" + state.runId + "/items", {
          method: "POST",
          body: { case_ids: ids, assignee_id: assigneeId },
        }).then(function (res) {
          var msg = "已加入 " + (res.added || 0) + " 条用例";
          if (res.updated) msg += "，更新执行人 " + res.updated + " 条";
          toast(msg, "success");
          closePick();
          state.tab = "cases";
          syncTabs();
          refreshAndRender();
        });
      })
      .catch(function (err) {
        toast(err.message || "添加失败", "error");
      });
  }

  /* —— 新建向导（独立 mask） —— */

  function ensureWizardDom() {
    var existing = $("cm-plan-wb-wizard-mask");
    if (existing && existing.getAttribute("data-wb-v") !== "wiz1") {
      existing.parentNode && existing.parentNode.removeChild(existing);
    }
    if ($("cm-plan-wb-wizard-mask")) return;
    var mask = document.createElement("div");
    mask.id = "cm-plan-wb-wizard-mask";
    mask.className = "cm-plan-mask is-hidden";
    mask.style.zIndex = "265";
    mask.setAttribute("data-wb-v", "wiz1");
    mask.innerHTML =
      '<div class="cm-plan-modal cm-plan-modal--wizard">' +
      '  <div class="cm-plan-modal__head">' +
      '    <div class="cm-plan-modal__head-main">' +
      '      <p class="cm-plan-modal__eyebrow">New Plan</p>' +
      '      <h2 class="cm-plan-modal__title">新建计划</h2>' +
      '      <p class="cm-plan-modal__sub" id="cm-wb-wiz-sub">第 1 步 · 基本信息</p>' +
      "    </div>" +
      '    <button type="button" class="cm-icon-btn" id="cm-wb-wiz-close">×</button>' +
      "  </div>" +
      '  <div class="cm-plan-modal__body" id="cm-wb-wiz-body"></div>' +
      '  <div class="cm-plan-modal__foot">' +
      '    <button type="button" class="cm-btn cm-btn--ghost" id="cm-wb-wiz-back">上一步</button>' +
      '    <span style="flex:1"></span>' +
      '    <button type="button" class="cm-btn cm-btn--ghost" id="cm-wb-wiz-skip">稍后加用例</button>' +
      '    <button type="button" class="cm-btn cm-btn--primary" id="cm-wb-wiz-next">下一步</button>' +
      "  </div>" +
      "</div>";
    document.body.appendChild(mask);
    $("cm-wb-wiz-close").onclick = closeWizard;
    $("cm-wb-wiz-back").onclick = wizardBack;
    $("cm-wb-wiz-next").onclick = wizardNext;
    $("cm-wb-wiz-skip").onclick = wizardSkipCases;
    mask.addEventListener("click", function (e) {
      if (e.target === mask) closeWizard();
    });
  }

  function closeWizard() {
    var mask = $("cm-plan-wb-wizard-mask");
    if (mask) mask.classList.add("is-hidden");
  }

  function openWizard() {
    var pid = currentProjectId();
    if (!pid) return toast("请先选择项目", "error");
    ensureWizardDom();
    state.wizard = {
      step: 1,
      name: "",
      description: "",
      assigneeId: currentUserId() || "",
      members: state.members.slice(),
    };
    $("cm-plan-wb-wizard-mask").classList.remove("is-hidden");
    if (!state.wizard.members.length) {
      api("/api/case-management/projects/" + pid + "/members")
        .then(function (data) {
          state.wizard.members = data.items || [];
          state.members = state.wizard.members;
          renderWizard();
        })
        .catch(function () {
          renderWizard();
        });
    } else {
      renderWizard();
    }
  }

  function renderWizard() {
    var step = state.wizard.step;
    var sub = $("cm-wb-wiz-sub");
    var body = $("cm-wb-wiz-body");
    var back = $("cm-wb-wiz-back");
    var skip = $("cm-wb-wiz-skip");
    var next = $("cm-wb-wiz-next");
    if (sub) {
      sub.textContent =
        step === 1
          ? "第 1 步 · 基本信息"
          : step === 2
            ? "第 2 步 · 指定执行人"
            : "第 3 步 · 选用例";
    }
    if (back) back.classList.toggle("is-hidden", step <= 1);
    if (skip) skip.classList.toggle("is-hidden", step !== 2);
    if (next) {
      next.textContent =
        step === 1 ? "下一步" : step === 2 ? "下一步：选用例" : "打开选用例";
    }

    if (step === 1) {
      body.innerHTML =
        '<label class="cm-plan-wb__field"><span>计划名称</span>' +
        '<input type="text" class="cm-input" id="cm-wb-wiz-name" maxlength="200" placeholder="如：支付迭代回归" value="' +
        escapeHtml(state.wizard.name) +
        '"></label>' +
        '<label class="cm-plan-wb__field"><span>说明（可选）</span>' +
        '<textarea class="cm-input" id="cm-wb-wiz-desc" rows="3" maxlength="2000" placeholder="本轮范围与注意事项">' +
        escapeHtml(state.wizard.description) +
        "</textarea></label>";
      return;
    }
    if (step === 2) {
      var html =
        '<p class="cm-plan-muted" style="margin:0 0 0.75rem;">后续添加的用例将默认分配给此人（可在用例表按执行人筛选）。</p>' +
        '<label class="cm-plan-wb__field"><span>执行人</span>' +
        '<select class="cm-select" id="cm-wb-wiz-assignee"></select></label>';
      body.innerHTML = html;
      fillAssigneeSelect(
        $("cm-wb-wiz-assignee"),
        state.wizard.members,
        state.wizard.assigneeId
      );
      return;
    }
    body.innerHTML =
      '<div class="cm-plan-empty"><p>接下来勾选 ready 用例并确认执行人。</p>' +
      "<p>提交后将创建计划并直接打开工作台用例列表。</p></div>";
  }

  function readWizardStep1() {
    var nameEl = $("cm-wb-wiz-name");
    var descEl = $("cm-wb-wiz-desc");
    state.wizard.name = nameEl ? String(nameEl.value || "").trim() : state.wizard.name;
    state.wizard.description = descEl
      ? String(descEl.value || "").trim()
      : state.wizard.description;
    if (!state.wizard.name) {
      toast("请填写计划名称", "error");
      return false;
    }
    return true;
  }

  function readWizardStep2() {
    var sel = $("cm-wb-wiz-assignee");
    state.wizard.assigneeId = sel ? String(sel.value || "").trim() : "";
    if (!state.wizard.assigneeId) {
      toast("请指定执行人", "error");
      return false;
    }
    return true;
  }

  function wizardBack() {
    if (state.wizard.step === 2) {
      readWizardStep2();
      state.wizard.step = 1;
      renderWizard();
      return;
    }
    if (state.wizard.step === 3) {
      state.wizard.step = 2;
      renderWizard();
    }
  }

  function wizardNext() {
    if (state.wizard.step === 1) {
      if (!readWizardStep1()) return;
      state.wizard.step = 2;
      renderWizard();
      return;
    }
    if (state.wizard.step === 2) {
      if (!readWizardStep2()) return;
      state.wizard.step = 3;
      renderWizard();
      // 直接进入选用例
      closeWizard();
      openPick("wizard");
      return;
    }
  }

  function wizardSkipCases() {
    if (state.wizard.step !== 2) return;
    if (!state.wizard.name) {
      state.wizard.step = 1;
      renderWizard();
      return toast("请填写计划名称", "error");
    }
    if (!readWizardStep2()) return;
    createEmptyPlanAndOpen();
  }

  function createEmptyPlanAndOpen() {
    var pid = currentProjectId();
    api("/api/l5/projects/" + pid + "/plans/bundle", {
      method: "POST",
      body: {
        name: state.wizard.name,
        description: state.wizard.description || "",
        case_ids: [],
        assignee_id: "",
      },
    })
      .then(function (res) {
        var plan = res.item || {};
        toast("已创建计划", "success");
        closeWizard();
        closePick();
        return api("/api/l5/projects/" + pid + "/plans").then(function (data) {
          state.plans = data.items || [];
          renderPlanList();
          selectPlan(plan.id);
        });
      })
      .catch(function (err) {
        toast(err.message || "创建失败", "error");
      });
  }

  function submitWizardWithCases(caseIds, assigneeId) {
    var pid = currentProjectId();
    if (!state.wizard.name) throw new Error("计划名称不能为空");
    return api("/api/l5/projects/" + pid + "/plans/bundle", {
      method: "POST",
      body: {
        name: state.wizard.name,
        description: state.wizard.description || "",
        case_ids: caseIds,
        assignee_id: assigneeId,
      },
    }).then(function (res) {
      var plan = res.item || {};
      var msg = "已创建计划";
      if (res.added) msg += "，加入 " + res.added + " 条用例";
      toast(msg, "success");
      closePick();
      closeWizard();
      return api("/api/l5/projects/" + pid + "/plans").then(function (data) {
        state.plans = data.items || [];
        renderPlanList();
        selectPlan(plan.id);
      });
    });
  }

  global.CmPlanWorkbench = {
    open: open,
    close: close,
  };
})(window);
