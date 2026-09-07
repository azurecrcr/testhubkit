/**
 * 用例管理 · 测试计划 / 项目度量 完整 UI（独立模块）。
 * 不修改 app.js 业务函数；不改用例工作台。
 * 暴露 window.CmPlanRunUi = { openPlans, openMetrics }
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
    console.log("[CmPlanRunUi]", tone, text);
  }

  function cmPrompt(opts) {
    opts = opts || {};
    if (global.CmDialogs && typeof global.CmDialogs.prompt === "function") {
      return global.CmDialogs.prompt(opts);
    }
    var name = window.prompt(
      (opts.message ? opts.message + "\n" : "") + (opts.label || "名称"),
      opts.defaultValue || ""
    );
    return Promise.resolve(name ? String(name).trim() : null);
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

  var state = {
    view: "plans", // plans | run | assignee | report
    plans: [],
    planId: "",
    plan: null,
    planName: "",
    runId: "",
    run: null,
    items: [],
    stats: null,
    isPlanOwner: false, // 当前项目是否负责人（影响列表/详情形态）
    assigneeKey: "", // "" | "__none__" | user_id
    assigneeLabel: "",
    assigneePage: 1,
    assigneePageSize: 10,
    assigneeSelectedIds: {},
    assigneeSelectAll: false,
    pick: {
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
    var existing = $("cm-plan-mask");
    if (
      existing &&
      (existing.getAttribute("data-plan-v") !== "list3" || !$("cm-plan-head-actions"))
    ) {
      existing.parentNode && existing.parentNode.removeChild(existing);
    }
    if ($("cm-plan-mask")) return;
    var mask = document.createElement("div");
    mask.id = "cm-plan-mask";
    mask.className = "cm-plan-mask is-hidden";
    mask.setAttribute("data-plan-v", "list3");
    mask.setAttribute("role", "dialog");
    mask.setAttribute("aria-modal", "true");
    mask.innerHTML =
      '<div class="cm-plan-modal">' +
      '  <div class="cm-plan-modal__head">' +
      '    <div class="cm-plan-modal__head-main">' +
      '      <p class="cm-plan-modal__eyebrow" id="cm-plan-eyebrow">Test Plan</p>' +
      '      <h2 class="cm-plan-modal__title" id="cm-plan-title">测试计划</h2>' +
      '      <p class="cm-plan-modal__sub" id="cm-plan-sub">计划 → 加用例 → 执行</p>' +
      "    </div>" +
      '    <div class="cm-plan-modal__head-actions" id="cm-plan-head-actions"></div>' +
      '    <button type="button" class="cm-icon-btn" id="cm-plan-close" aria-label="关闭">×</button>' +
      "  </div>" +
      '  <div class="cm-plan-modal__toolbar" id="cm-plan-toolbar"></div>' +
      '  <div class="cm-plan-modal__body" id="cm-plan-body"></div>' +
      '  <div class="cm-plan-modal__foot">' +
      '    <button type="button" class="cm-btn cm-btn--ghost" id="cm-plan-back">返回</button>' +
      '    <button type="button" class="cm-btn cm-btn--ghost" id="cm-plan-done">关闭</button>' +
      "  </div>" +
      "</div>";
    document.body.appendChild(mask);

    mask.addEventListener("click", function (e) {
      if (e.target === mask) close();
    });
    $("cm-plan-close").addEventListener("click", close);
    $("cm-plan-done").addEventListener("click", close);
    $("cm-plan-back").addEventListener("click", function () {
      if (state.view === "assignee") {
        openRun(state.runId);
      } else if (state.view === "run" || state.view === "report") {
        openPlans();
      } else {
        close();
      }
    });
  }

  function openMask() {
    ensureDom();
    $("cm-plan-mask").classList.remove("is-hidden");
  }

  function close() {
    var mask = $("cm-plan-mask");
    if (mask) mask.classList.add("is-hidden");
  }

  function setHead(eyebrow, title, sub) {
    $("cm-plan-eyebrow").textContent = eyebrow || "";
    $("cm-plan-title").textContent = title || "";
    $("cm-plan-sub").textContent = sub || "";
  }

  function setHeadActions(html) {
    var box = $("cm-plan-head-actions");
    if (!box) return;
    box.innerHTML = html || "";
    box.classList.toggle("is-empty", !html);
  }

  function setToolbar(html) {
    var bar = $("cm-plan-toolbar");
    if (!bar) return;
    bar.innerHTML = html || "";
    bar.classList.toggle("is-hidden", !html);
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
    };
    return map[s] || s || "-";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isPlanOwnerUser() {
    if (global.CmCaseMgmt && typeof global.CmCaseMgmt.isProjectOwner === "function") {
      return !!global.CmCaseMgmt.isProjectOwner();
    }
    return !!state.isPlanOwner;
  }

  function currentUserId() {
    if (global.CmCaseMgmt && typeof global.CmCaseMgmt.currentUserId === "function") {
      return String(global.CmCaseMgmt.currentUserId() || "");
    }
    return "";
  }

  function openPlans() {
    var pid = currentProjectId();
    if (!pid) return toast("请先选择项目", "error");
    state.view = "plans";
    state.planId = "";
    state.runId = "";
    state.isPlanOwner = isPlanOwnerUser();
    // 负责人走独立工作台模块，避免改写非负责人列表/执行路径
    if (
      state.isPlanOwner &&
      global.CmPlanWorkbench &&
      typeof global.CmPlanWorkbench.open === "function"
    ) {
      global.CmPlanWorkbench.open();
      return;
    }
    openMask();
    if (state.isPlanOwner) {
      setHead("Test Plan", "测试计划", "打开计划后从目录勾选用例并执行");
      setHeadActions("");
      setToolbar(
        '<button type="button" class="cm-btn cm-btn--primary" id="cm-plan-create">新建计划</button>'
      );
      $("cm-plan-body").innerHTML = '<p class="cm-plan-muted">加载中…</p>';
      $("cm-plan-create").onclick = function () {
        cmPrompt({
          title: "新建计划",
          message: "为本次测试迭代创建计划，打开后可从目录勾选用例。",
          label: "计划名称",
          placeholder: "如：支付迭代回归",
          confirmText: "创建",
        }).then(function (name) {
          if (!name) return;
          api("/api/l5/projects/" + pid + "/plans", {
            method: "POST",
            body: { name: name, description: "" },
          })
            .then(function () {
              toast("已创建计划", "success");
              loadPlansList(pid);
            })
            .catch(function (err) {
              toast(err.message || "创建失败", "error");
            });
        });
      };
    } else {
      setHead("Test Plan", "我的测试计划", "仅展示分配给你执行的计划");
      setHeadActions("");
      setToolbar("");
      $("cm-plan-body").innerHTML = '<p class="cm-plan-muted">加载中…</p>';
    }
    loadPlansList(pid);
  }

  function loadPlansList(pid) {
    $("cm-plan-body").innerHTML = '<p class="cm-plan-muted">加载中…</p>';
    api("/api/l5/projects/" + pid + "/plans")
      .then(function (data) {
        state.plans = data.items || [];
        if (data.is_owner != null) state.isPlanOwner = !!data.is_owner;
        if (!state.plans.length) {
          $("cm-plan-body").innerHTML =
            '<div class="cm-plan-empty">' +
            (state.isPlanOwner
              ? "<p><strong>还没有测试计划</strong></p>" +
                "<p>点「新建计划」创建后，打开计划即可从目录勾选用例。</p>"
              : "<p><strong>暂无分配给你的测试计划</strong></p>" +
                "<p>负责人添加用例并指定你为执行人后会出现在这里。</p>") +
            "</div>";
          return;
        }
        var html =
          '<table class="cm-plan-table"><thead><tr>' +
          "<th>名称</th><th>状态</th><th>更新时间</th><th></th>" +
          "</tr></thead><tbody>";
        state.plans.forEach(function (p) {
          html +=
            "<tr>" +
            "<td>" +
            escapeHtml(p.name) +
            "</td>" +
            '<td><span class="cm-plan-pill">' +
            escapeHtml(statusLabel(p.status)) +
            "</span></td>" +
            "<td>" +
            escapeHtml(p.updated_at || p.created_at || "") +
            "</td>" +
            '<td><button type="button" class="cm-btn cm-btn--primary cm-btn--sm" data-plan-open="' +
            escapeHtml(p.id) +
            '">打开</button></td>' +
            "</tr>";
        });
        html += "</tbody></table>";
        $("cm-plan-body").innerHTML = html;
        $("cm-plan-body").querySelectorAll("[data-plan-open]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            openPlan(btn.getAttribute("data-plan-open"));
          });
        });
      })
      .catch(function (err) {
        $("cm-plan-body").innerHTML =
          '<p class="cm-plan-error">' + escapeHtml(err.message || "加载失败") + "</p>";
      });
  }

  /** 打开计划 = 加载计划详情并进入执行集 */
  function openPlan(planId) {
    if (!planId) return;
    state.planId = planId;
    $("cm-plan-body").innerHTML = '<p class="cm-plan-muted">加载中…</p>';
    openMask();
    api("/api/l5/plans/" + planId)
      .then(function (data) {
        var plan = (data && data.item) || {};
        state.plan = plan;
        var runId = data.run_id || (data.run && data.run.id) || "";
        if (!runId) {
          toast("计划执行集不存在", "error");
          openPlans();
          return;
        }
        state.planName = plan.name || "";
        if (state.isPlanOwner || isPlanOwnerUser()) {
          openRun(runId);
        } else {
          openMyAssigneeRun(runId);
        }
      })
      .catch(function (err) {
        toast(err.message || "打开失败", "error");
        openPlans();
      });
  }

  /** 非负责人：直接进入「我的用例」执行页 */
  function openMyAssigneeRun(runId) {
    state.runId = runId;
    state.view = "assignee";
    var uid = currentUserId();
    state.assigneeKey = uid || "__none__";
    state.assigneeLabel = "我的用例";
    state.assigneePage = 1;
    state.assigneeSelectedIds = {};
    state.assigneeSelectAll = false;
    openMask();
    setHead("My Cases", state.planName || "测试计划", "勾选后可批量登记结果");
    setHeadActions("");
    setToolbar(
      '<button type="button" class="cm-btn cm-btn--ghost" id="cm-assignee-back">返回计划列表</button>' +
        '<span class="cm-plan-muted" id="cm-assignee-sel-count"></span>' +
        '<span class="cm-plan-batch-exec is-hidden" id="cm-assignee-batch">' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-batch-exec="pass">批量通过</button>' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-batch-exec="fail">批量失败</button>' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-batch-exec="blocked">批量阻塞</button>' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-batch-exec="skip">批量跳过</button>' +
        "</span>" +
        '<span class="cm-plan-stats" id="cm-run-stats"></span>'
    );
    $("cm-assignee-back").onclick = function () {
      openPlans();
    };
    var batch = $("cm-assignee-batch");
    if (batch) {
      batch.querySelectorAll("[data-batch-exec]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          batchExecuteAssigneeItems(btn.getAttribute("data-batch-exec"));
        });
      });
    }
    refreshRun();
  }

  function openRunReport(runId) {
    openMask();
    state.view = "report";
    setHead("Report", "计划报告", "只读统计");
    setHeadActions("");
    setToolbar(
      '<button type="button" class="cm-btn cm-btn--ghost" id="cm-report-back">返回计划</button>'
    );
    $("cm-plan-body").innerHTML = '<p class="cm-plan-muted">加载中…</p>';
    $("cm-report-back").onclick = function () {
      if (state.runId) openRun(state.runId);
      else if (state.planId) openPlan(state.planId);
      else openPlans();
    };
    api("/api/l5/runs/" + runId + "/report")
      .then(function (rep) {
        var st = rep.stats || {};
        var html =
          '<div class="cm-metrics-grid">' +
          card("合计", String(st.total || 0), "") +
          card("通过", String(st.pass || 0), "") +
          card("失败", String(st.fail || 0), "") +
          card("未测", String(st.unset || 0), "") +
          card("待回归", String(rep.pending_regression || 0), "") +
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
        if ((rep.linked_defects || []).length) {
          html +=
            '<div class="cm-metrics-section"><h3>关联缺陷</h3><ul class="cm-metrics-list">' +
            rep.linked_defects
              .map(function (d) {
                return (
                  "<li><span>" +
                  escapeHtml(d.display_id + " " + d.title) +
                  "</span><strong>" +
                  escapeHtml(d.status) +
                  "</strong></li>"
                );
              })
              .join("") +
            "</ul></div>";
        }
        $("cm-plan-body").innerHTML = html;
      })
      .catch(function (err) {
        $("cm-plan-body").innerHTML =
          '<p class="cm-plan-error">' + escapeHtml(err.message || "加载失败") + "</p>";
      });
  }

  function openRun(runId) {
    state.view = "run";
    state.runId = runId;
    state.assigneeKey = "";
    state.assigneeLabel = "";
    openMask();
    setHead("Plan", state.planName || "测试计划", "按执行人查看任务与进度");
    setHeadActions("");
    setToolbar(
      (global.CmPlanGateUi &&
      typeof global.CmPlanGateUi.isLocked === "function" &&
      global.CmPlanGateUi.isLocked(state.plan && state.plan.release_status)
        ? ""
        : '<button type="button" class="cm-btn cm-btn--primary" id="cm-run-add-cases">添加用例</button>') +
        '<button type="button" class="cm-btn cm-btn--ghost" id="cm-run-report">报告</button>' +
        (global.CmPlanGateUi && typeof global.CmPlanGateUi.buttonsHtml === "function"
          ? global.CmPlanGateUi.buttonsHtml(state.plan, { sizeClass: "" })
          : '<button type="button" class="cm-btn cm-btn--ghost" id="cm-run-gate-btn">发布</button>') +
        '<span class="cm-plan-stats" id="cm-run-stats"></span>' +
        (global.CmPlanGateUi && typeof global.CmPlanGateUi.lockHintHtml === "function"
          ? global.CmPlanGateUi.lockHintHtml(state.plan)
          : "")
    );
    $("cm-plan-body").innerHTML = '<p class="cm-plan-muted">加载中…</p>';
    var addCasesBtn = $("cm-run-add-cases");
    if (addCasesBtn) addCasesBtn.onclick = openPickCases;
    $("cm-run-report").onclick = function () {
      openRunReport(state.runId);
    };
    if (global.CmPlanGateUi && typeof global.CmPlanGateUi.mount === "function") {
      global.CmPlanGateUi.mount($("cm-plan-toolbar") || $("cm-run-report").parentNode, {
        planId: state.planId,
        getPlan: function () {
          return state.plan;
        },
        onChange: function (plan) {
          state.plan = plan || state.plan;
          openRun(state.runId);
        },
      });
    } else {
      var gateBtn = $("cm-run-gate-btn");
      if (gateBtn) {
        gateBtn.onclick = function () {
          toast("发布模块未加载，请刷新页面", "error");
        };
      }
    }
    refreshRun();
  }

  function refreshRun() {
    Promise.all([
      api("/api/l5/runs/" + state.runId),
      api("/api/l5/runs/" + state.runId + "/items"),
      api("/api/l5/runs/" + state.runId + "/stats"),
    ])
      .then(function (arr) {
        state.run = (arr[0] && arr[0].item) || {};
        state.items = (arr[1] && arr[1].items) || [];
        state.stats = arr[2] || {};
        if (!state.planId && state.run.plan_id) state.planId = state.run.plan_id;
        var title = state.planName || state.run.name || "测试计划";
        var st = state.stats;
        if (state.view === "assignee") {
          var mineCount = itemsForAssignee(state.assigneeKey).length;
          setHead(
            state.isPlanOwner || isPlanOwnerUser() ? "Assignee" : "My Cases",
            state.assigneeLabel || state.planName || "执行用例",
            "共 " + mineCount + " 条用例"
          );
          var statsEl = $("cm-run-stats");
          if (statsEl) {
            statsEl.textContent = assigneeProgressText(state.assigneeKey);
          }
          renderAssigneeItems();
          return;
        }
        setHead(
          "Plan",
          title,
          (state.run.environment ? "环境 " + state.run.environment + " · " : "") +
            statusLabel(state.run.status)
        );
        $("cm-run-stats").textContent =
          "进度 " +
          (st.progress || 0) +
          "% · 通过 " +
          (st.pass || 0) +
          " / 失败 " +
          (st.fail || 0) +
          " / 阻塞 " +
          (st.blocked || 0) +
          " / 未测 " +
          (st.unset || 0);
        renderAssigneeSummary();
      })
      .catch(function (err) {
        $("cm-plan-body").innerHTML =
          '<p class="cm-plan-error">' + escapeHtml(err.message || "加载失败") + "</p>";
      });
  }

  function itemAssigneeKey(it) {
    return String(it.assignee_id || "").trim() || "__none__";
  }

  function itemsForAssignee(key) {
    // 非负责人接口已过滤为自己的用例，直接展示列表
    if (!isPlanOwnerUser()) {
      return state.items || [];
    }
    var k = String(key || "__none__");
    return (state.items || []).filter(function (it) {
      return itemAssigneeKey(it) === k;
    });
  }

  function buildAssigneeGroups() {
    var map = {};
    var order = [];
    (state.items || []).forEach(function (it) {
      var key = itemAssigneeKey(it);
      if (!map[key]) {
        map[key] = {
          key: key,
          label:
            key === "__none__"
              ? "未指定执行人"
              : it.assignee_label || String(it.assignee_id || "").slice(0, 8) || "未知",
          total: 0,
          done: 0,
          pass: 0,
          fail: 0,
          blocked: 0,
          skip: 0,
          unset: 0,
        };
        order.push(key);
      }
      var g = map[key];
      g.total += 1;
      var res = String(it.result || "");
      if (res === "pass") g.pass += 1;
      else if (res === "fail") g.fail += 1;
      else if (res === "blocked") g.blocked += 1;
      else if (res === "skip") g.skip += 1;
      else g.unset += 1;
      if (res) g.done += 1;
      if (key !== "__none__" && it.assignee_label) g.label = it.assignee_label;
    });
    // 未指定排最后
    order.sort(function (a, b) {
      if (a === "__none__") return 1;
      if (b === "__none__") return -1;
      return String(map[a].label).localeCompare(String(map[b].label), "zh");
    });
    return order.map(function (k) {
      return map[k];
    });
  }

  function assigneeProgressText(key) {
    var items = itemsForAssignee(key);
    var total = items.length;
    var pass = 0;
    var fail = 0;
    var blocked = 0;
    var skip = 0;
    var unset = 0;
    items.forEach(function (it) {
      var res = String(it.result || "");
      if (res === "pass") pass += 1;
      else if (res === "fail") fail += 1;
      else if (res === "blocked") blocked += 1;
      else if (res === "skip") skip += 1;
      else unset += 1;
    });
    var done = total - unset;
    var pct = total ? Math.round((1000 * done) / total) / 10 : 0;
    return (
      "进度 " +
      pct +
      "% · 通过 " +
      pass +
      " / 失败 " +
      fail +
      " / 阻塞 " +
      blocked +
      " / 未测 " +
      unset
    );
  }

  function renderAssigneeSummary() {
    if (!state.items.length) {
      $("cm-plan-body").innerHTML =
        '<div class="cm-plan-empty"><p><strong>计划里还没有用例</strong></p>' +
        "<p>点「添加用例」从目录勾选 ready 用例并指定执行人。</p></div>";
      return;
    }
    var groups = buildAssigneeGroups();
    var html =
      '<table class="cm-plan-table"><thead><tr>' +
      "<th>执行人</th><th>用例数</th><th>进度</th><th>通过</th><th>失败</th><th>阻塞</th><th>未测</th><th></th>" +
      "</tr></thead><tbody>";
    groups.forEach(function (g) {
      var pct = g.total ? Math.round((1000 * g.done) / g.total) / 10 : 0;
      html +=
        "<tr>" +
        "<td>" +
        escapeHtml(g.label) +
        "</td>" +
        "<td>" +
        g.total +
        "</td>" +
        "<td>" +
        pct +
        "%（" +
        g.done +
        "/" +
        g.total +
        "）</td>" +
        "<td>" +
        g.pass +
        "</td>" +
        "<td>" +
        g.fail +
        "</td>" +
        "<td>" +
        g.blocked +
        "</td>" +
        "<td>" +
        g.unset +
        "</td>" +
        '<td><button type="button" class="cm-btn cm-btn--primary cm-btn--sm" data-assignee-open="' +
        escapeHtml(g.key) +
        '" data-assignee-label="' +
        escapeHtml(g.label) +
        '">查看用例</button></td>' +
        "</tr>";
    });
    html += "</tbody></table>";
    $("cm-plan-body").innerHTML = html;
    $("cm-plan-body").querySelectorAll("[data-assignee-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openAssigneeDetail(
          btn.getAttribute("data-assignee-open"),
          btn.getAttribute("data-assignee-label")
        );
      });
    });
  }

  function openAssigneeDetail(key, label) {
    state.view = "assignee";
    state.assigneeKey = key || "__none__";
    state.assigneeLabel = label || (key === "__none__" ? "未指定执行人" : "执行人");
    state.assigneePage = 1;
    state.assigneeSelectedIds = {};
    state.assigneeSelectAll = false;
    setHead("Assignee", state.assigneeLabel, "勾选后可批量登记结果");
    setHeadActions("");
    setToolbar(
      '<button type="button" class="cm-btn cm-btn--ghost" id="cm-assignee-back">返回执行人</button>' +
        '<button type="button" class="cm-btn cm-btn--primary" id="cm-run-add-cases">添加用例</button>' +
        '<span class="cm-plan-muted" id="cm-assignee-sel-count"></span>' +
        '<span class="cm-plan-batch-exec is-hidden" id="cm-assignee-batch">' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-batch-exec="pass">批量通过</button>' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-batch-exec="fail">批量失败</button>' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-batch-exec="blocked">批量阻塞</button>' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-batch-exec="skip">批量跳过</button>' +
        "</span>" +
        '<span class="cm-plan-stats" id="cm-run-stats"></span>'
    );
    $("cm-assignee-back").onclick = function () {
      openRun(state.runId);
    };
    $("cm-run-add-cases").onclick = openPickCases;
    $("cm-assignee-batch").querySelectorAll("[data-batch-exec]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        batchExecuteAssigneeItems(btn.getAttribute("data-batch-exec"));
      });
    });
    $("cm-run-stats").textContent = assigneeProgressText(state.assigneeKey);
    renderAssigneeItems();
  }

  function assigneeSelectedCount() {
    if (state.assigneeSelectAll) return itemsForAssignee(state.assigneeKey).length;
    return Object.keys(state.assigneeSelectedIds).length;
  }

  function syncAssigneeSelectionUi() {
    var n = assigneeSelectedCount();
    var countEl = $("cm-assignee-sel-count");
    var batch = $("cm-assignee-batch");
    var allItems = itemsForAssignee(state.assigneeKey);
    if (countEl) {
      if (state.assigneeSelectAll) {
        countEl.textContent = "已选全部 " + allItems.length + " 条";
      } else if (n > 0) {
        countEl.textContent = "已选 " + n + " 条";
      } else {
        countEl.textContent = "";
      }
    }
    if (batch) batch.classList.toggle("is-hidden", n <= 0);
  }

  function assigneePageSlice() {
    var items = itemsForAssignee(state.assigneeKey);
    var pageSize = state.assigneePageSize || 10;
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    var page = Math.min(Math.max(1, state.assigneePage || 1), totalPages);
    state.assigneePage = page;
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

  function assigneePageFullySelected(pageItems) {
    if (!(pageItems || []).length) return false;
    return pageItems.every(function (it) {
      return !!(state.assigneeSelectAll || state.assigneeSelectedIds[it.id]);
    });
  }

  function isAssigneePageSelectMode(pageItems) {
    return (
      !state.assigneeSelectAll &&
      (pageItems || []).length > 0 &&
      assigneePageFullySelected(pageItems) &&
      Object.keys(state.assigneeSelectedIds).length === pageItems.length
    );
  }

  function cycleAssigneeHeadSelection() {
    var slice = assigneePageSlice();
    if (!slice.pageItems.length) return;
    if (state.assigneeSelectAll) {
      state.assigneeSelectAll = false;
      state.assigneeSelectedIds = {};
    } else if (isAssigneePageSelectMode(slice.pageItems)) {
      state.assigneeSelectAll = true;
      state.assigneeSelectedIds = {};
    } else {
      state.assigneeSelectAll = false;
      state.assigneeSelectedIds = {};
      slice.pageItems.forEach(function (it) {
        state.assigneeSelectedIds[it.id] = true;
      });
    }
    renderAssigneeItems();
  }

  function toggleAssigneeItemSelected(id, checked) {
    if (state.assigneeSelectAll) {
      state.assigneeSelectAll = false;
      state.assigneeSelectedIds = {};
      itemsForAssignee(state.assigneeKey).forEach(function (it) {
        state.assigneeSelectedIds[it.id] = true;
      });
    }
    if (checked) state.assigneeSelectedIds[id] = true;
    else delete state.assigneeSelectedIds[id];
  }

  function resolveAssigneeSelectedIds() {
    if (state.assigneeSelectAll) {
      return itemsForAssignee(state.assigneeKey).map(function (it) {
        return it.id;
      });
    }
    return Object.keys(state.assigneeSelectedIds);
  }

  function batchExecuteAssigneeItems(result) {
    var ids = resolveAssigneeSelectedIds();
    if (!ids.length) return toast("请先勾选用例", "error");
    if (!result) return;
    api("/api/l5/runs/" + state.runId + "/items/batch-execute", {
      method: "POST",
      body: { item_ids: ids, result: result, comment: "" },
    })
      .then(function (res) {
        var msg = "已批量登记 " + (res.updated || 0) + " 条：" + statusLabel(result);
        if (res.failed) msg += "，失败 " + res.failed + " 条";
        toast(msg, res.failed ? "error" : "success");
        state.assigneeSelectedIds = {};
        state.assigneeSelectAll = false;
        if (res.stats) state.stats = res.stats;
        refreshRun();
      })
      .catch(function (err) {
        toast(err.message || "批量执行失败", "error");
      });
  }

  function renderAssigneeItems() {
    var slice = assigneePageSlice();
    if (!slice.total) {
      $("cm-plan-body").innerHTML =
        '<div class="cm-plan-empty"><p>该执行人下暂无用例</p>' +
        '<p><button type="button" class="cm-btn cm-btn--ghost" id="cm-assignee-empty-back">返回执行人</button></p></div>';
      var back = $("cm-assignee-empty-back");
      if (back) {
        back.onclick = function () {
          openRun(state.runId);
        };
      }
      syncAssigneeSelectionUi();
      return;
    }

    var headTitle = "点击切换：本页 → 全部 → 取消";
    var html =
      '<table class="cm-plan-table"><thead><tr>' +
      '<th class="cm-th-check" style="width:36px">' +
      '<label class="cm-check-wrap" title="' +
      headTitle +
      '">' +
      '<input type="checkbox" class="cm-check" id="cm-assignee-check-head" aria-label="全选">' +
      '<span class="cm-check-wrap__box" aria-hidden="true"></span>' +
      "</label></th>" +
      "<th>用例</th><th>优先级</th><th>结果</th><th>操作</th>" +
      "</tr></thead><tbody>";
    slice.pageItems.forEach(function (it) {
      var res = it.result || "";
      var checked = !!(state.assigneeSelectAll || state.assigneeSelectedIds[it.id]);
      html +=
        "<tr>" +
        '<td class="cm-td-check"><label class="cm-check-wrap" title="选择">' +
        '<input type="checkbox" class="cm-check" data-assignee-item="' +
        escapeHtml(it.id) +
        '"' +
        (checked ? " checked" : "") +
        ' aria-label="选择用例">' +
        '<span class="cm-check-wrap__box" aria-hidden="true"></span>' +
        "</label></td>" +
        "<td>" +
        escapeHtml(it.title || it.case_id) +
        "</td>" +
        "<td>" +
        escapeHtml(it.priority || "-") +
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
        "<td class='cm-plan-exec-cell'>" +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-exec="pass" data-item="' +
        escapeHtml(it.id) +
        '">通过</button>' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-exec="fail" data-item="' +
        escapeHtml(it.id) +
        '">失败</button>' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-exec="blocked" data-item="' +
        escapeHtml(it.id) +
        '">阻塞</button>' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" data-exec="skip" data-item="' +
        escapeHtml(it.id) +
        '">跳过</button>' +
        "</td></tr>";
    });
    html += "</tbody></table>";

    html += '<div class="cm-plan-pick-foot" style="border:0;padding:0.75rem 0;">';
    if (slice.total <= slice.pageSize) {
      html += '<span class="cm-plan-muted">共 ' + slice.total + " 条</span>";
    } else {
      html +=
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-assignee-prev"' +
        (slice.page <= 1 ? " disabled" : "") +
        ">上一页</button> " +
        "<span class='cm-plan-muted'>" +
        slice.page +
        " / " +
        slice.totalPages +
        "（共 " +
        slice.total +
        " 条）</span> " +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-assignee-next"' +
        (slice.page >= slice.totalPages ? " disabled" : "") +
        ">下一页</button>";
    }
    html += "</div>";

    $("cm-plan-body").innerHTML = html;

    var headCb = $("cm-assignee-check-head");
    var headWrap = headCb && headCb.closest(".cm-check-wrap");
    if (headCb) {
      var pageIds = slice.pageItems.map(function (it) {
        return it.id;
      });
      var checkedN = 0;
      pageIds.forEach(function (id) {
        if (state.assigneeSelectAll || state.assigneeSelectedIds[id]) checkedN += 1;
      });
      if (state.assigneeSelectAll) {
        headCb.checked = true;
        headCb.indeterminate = false;
        if (headWrap) {
          headWrap.classList.remove("is-page-all");
          headWrap.classList.add("is-suite-all");
        }
      } else if (checkedN === pageIds.length && pageIds.length > 0) {
        headCb.checked = false;
        headCb.indeterminate = true;
        if (headWrap) {
          headWrap.classList.add("is-page-all");
          headWrap.classList.remove("is-suite-all");
        }
      } else if (checkedN > 0) {
        headCb.checked = false;
        headCb.indeterminate = true;
        if (headWrap) {
          headWrap.classList.remove("is-page-all");
          headWrap.classList.remove("is-suite-all");
        }
      } else {
        headCb.checked = false;
        headCb.indeterminate = false;
        if (headWrap) {
          headWrap.classList.remove("is-page-all");
          headWrap.classList.remove("is-suite-all");
        }
      }
      headCb.addEventListener("click", function (e) {
        e.preventDefault();
        cycleAssigneeHeadSelection();
      });
    }

    $("cm-plan-body").querySelectorAll("[data-assignee-item]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        toggleAssigneeItemSelected(cb.getAttribute("data-assignee-item"), !!cb.checked);
        renderAssigneeItems();
      });
    });

    var prev = $("cm-assignee-prev");
    var next = $("cm-assignee-next");
    if (prev) {
      prev.onclick = function () {
        if (state.assigneePage <= 1) return;
        state.assigneePage -= 1;
        renderAssigneeItems();
      };
    }
    if (next) {
      next.onclick = function () {
        if (state.assigneePage >= slice.totalPages) return;
        state.assigneePage += 1;
        renderAssigneeItems();
      };
    }

    $("cm-plan-body").querySelectorAll("[data-exec]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var itemId = btn.getAttribute("data-item");
        var result = btn.getAttribute("data-exec");
        api("/api/l5/run-items/" + itemId + "/execute", {
          method: "POST",
          body: { result: result, comment: "" },
        })
          .then(function () {
            toast("已记录：" + statusLabel(result), "success");
            refreshRun();
          })
          .catch(function (err) {
            toast(err.message || "登记失败", "error");
          });
      });
    });

    syncAssigneeSelectionUi();
  }

  function memberLabel(m) {
    return m.label || m.display_name || m.email || m.phone_masked || m.user_id || "";
  }

  function ensurePickDom() {
    var existing = $("cm-plan-pick-mask");
    if (existing && existing.getAttribute("data-plan-v") !== "pick3") {
      existing.parentNode && existing.parentNode.removeChild(existing);
      existing = null;
    }
    if ($("cm-plan-pick-mask")) return;
    var mask = document.createElement("div");
    mask.id = "cm-plan-pick-mask";
    mask.className = "cm-plan-mask is-hidden";
    mask.setAttribute("data-plan-v", "pick3");
    mask.setAttribute("role", "dialog");
    mask.setAttribute("aria-modal", "true");
    mask.innerHTML =
      '<div class="cm-plan-modal">' +
      '  <div class="cm-plan-modal__head">' +
      '    <div class="cm-plan-modal__head-main">' +
      '      <p class="cm-plan-modal__eyebrow">Add Cases</p>' +
      '      <h2 class="cm-plan-modal__title">添加用例</h2>' +
      '      <p class="cm-plan-modal__sub">从目录勾选 ready 用例加入计划</p>' +
      "    </div>" +
      '    <button type="button" class="cm-icon-btn" id="cm-plan-pick-close" aria-label="关闭">×</button>' +
      "  </div>" +
      '  <div class="cm-plan-pick-layout">' +
      '    <div class="cm-plan-pick-tree">' +
      '      <ul id="cm-plan-pick-tree" class="cm-tree"></ul>' +
      "    </div>" +
      '    <div class="cm-plan-pick-main">' +
      '      <div class="cm-plan-modal__toolbar" id="cm-plan-pick-toolbar">' +
      '        <span class="cm-plan-muted" id="cm-plan-pick-count"></span>' +
      "      </div>" +
      '      <div class="cm-plan-pick-cases" id="cm-plan-pick-cases-wrap">' +
      '        <table class="cm-plan-table" id="cm-plan-pick-cases"><tbody></tbody></table>' +
      "      </div>" +
      '      <div class="cm-plan-pick-foot">' +
      '        <span class="cm-plan-muted" id="cm-plan-pick-pager"></span>' +
      '        <span style="flex:1"></span>' +
      '        <button type="button" class="cm-btn cm-btn--ghost" id="cm-plan-pick-cancel">取消</button>' +
      '        <button type="button" class="cm-btn cm-btn--primary" id="cm-plan-pick-submit">添加到计划</button>' +
      "      </div>" +
      "    </div>" +
      "  </div>" +
      "</div>";
    document.body.appendChild(mask);

    mask.addEventListener("click", function (e) {
      if (e.target === mask) closePickCases();
    });
    $("cm-plan-pick-close").addEventListener("click", closePickCases);
    $("cm-plan-pick-cancel").addEventListener("click", closePickCases);
    $("cm-plan-pick-submit").addEventListener("click", submitPickCases);
  }

  function closePickCases() {
    var mask = $("cm-plan-pick-mask");
    if (mask) mask.classList.add("is-hidden");
  }

  function pickSelectedCount() {
    if (state.pick.suiteSelectAll) return state.pick.total || 0;
    return Object.keys(state.pick.selectedIds).length;
  }

  function syncPickCount() {
    var el = $("cm-plan-pick-count");
    if (!el) return;
    var n = pickSelectedCount();
    var total = state.pick.total || 0;
    var allLabel =
      state.pick.suiteId && state.pick.suiteId !== "__all__"
        ? "当前目录全部"
        : "全部 ready";
    if (state.pick.suiteSelectAll) {
      el.textContent =
        "已选" + allLabel + " " + total + " 条（再点表头可取消）";
    } else if (isPickPageSelectMode()) {
      el.textContent =
        "已选本页 " + n + " 条（再点表头可选" + allLabel + " " + total + " 条）";
    } else if (n > 0) {
      el.textContent = "已选 " + n + " 条";
    } else {
      el.textContent = "";
    }
  }

  function pickPageFullySelected() {
    var cases = state.pick.cases || [];
    if (!cases.length) return false;
    return cases.every(function (c) {
      return !!(state.pick.suiteSelectAll || state.pick.selectedIds[c.id]);
    });
  }

  function isPickPageSelectMode() {
    var cases = state.pick.cases || [];
    return (
      !state.pick.suiteSelectAll &&
      cases.length > 0 &&
      pickPageFullySelected() &&
      Object.keys(state.pick.selectedIds).length === cases.length
    );
  }

  function clearPickSelection() {
    state.pick.selectedIds = {};
    state.pick.suiteSelectAll = false;
  }

  function pickSelectCurrentPage() {
    state.pick.suiteSelectAll = false;
    state.pick.selectedIds = {};
    (state.pick.cases || []).forEach(function (c) {
      state.pick.selectedIds[c.id] = true;
    });
  }

  function pickSelectAllInView() {
    state.pick.suiteSelectAll = true;
    state.pick.selectedIds = {};
  }

  /** 表头全选三态：本页 → 全部 → 取消 */
  function cyclePickHeadSelection() {
    if (!(state.pick.cases || []).length) return;
    if (state.pick.suiteSelectAll) {
      clearPickSelection();
    } else if (isPickPageSelectMode()) {
      pickSelectAllInView();
    } else {
      pickSelectCurrentPage();
    }
    renderPickCases();
  }

  function togglePickCaseSelected(id, checked) {
    if (state.pick.suiteSelectAll) {
      state.pick.suiteSelectAll = false;
      state.pick.selectedIds = {};
      (state.pick.cases || []).forEach(function (c) {
        state.pick.selectedIds[c.id] = true;
      });
    }
    if (checked) state.pick.selectedIds[id] = true;
    else delete state.pick.selectedIds[id];
  }

  function syncPickHeadCheck() {
    var headCb = $("cm-plan-pick-check-head");
    var headWrap = headCb && headCb.closest(".cm-check-wrap");
    if (!headCb) return;
    var pageIds = (state.pick.cases || []).map(function (c) {
      return c.id;
    });
    var checked = 0;
    pageIds.forEach(function (id) {
      if (state.pick.suiteSelectAll || state.pick.selectedIds[id]) checked += 1;
    });
    if (state.pick.suiteSelectAll) {
      headCb.checked = true;
      headCb.indeterminate = false;
      if (headWrap) {
        headWrap.classList.remove("is-page-all");
        headWrap.classList.add("is-suite-all");
      }
    } else if (checked === pageIds.length && pageIds.length > 0) {
      headCb.checked = false;
      headCb.indeterminate = true;
      if (headWrap) {
        headWrap.classList.add("is-page-all");
        headWrap.classList.remove("is-suite-all");
      }
    } else if (checked > 0) {
      headCb.checked = false;
      headCb.indeterminate = true;
      if (headWrap) {
        headWrap.classList.remove("is-page-all");
        headWrap.classList.remove("is-suite-all");
      }
    } else {
      headCb.checked = false;
      headCb.indeterminate = false;
      if (headWrap) {
        headWrap.classList.remove("is-page-all");
        headWrap.classList.remove("is-suite-all");
      }
    }
  }

  function pickCheckCellHtml(id, checked) {
    return (
      '<td class="cm-td-check">' +
      '<label class="cm-check-wrap" title="选择">' +
      '<input type="checkbox" class="cm-check" data-pick-case="' +
      escapeHtml(id) +
      '"' +
      (checked ? " checked" : "") +
      ' aria-label="选择用例">' +
      '<span class="cm-check-wrap__box" aria-hidden="true"></span>' +
      "</label></td>"
    );
  }

  function pickHeadCheckHtml() {
    return (
      '<th class="cm-th-check" style="width:36px">' +
      '<label class="cm-check-wrap" title="点击切换：本页 → 全部 → 取消">' +
      '<input type="checkbox" class="cm-check" id="cm-plan-pick-check-head" aria-label="全选">' +
      '<span class="cm-check-wrap__box" aria-hidden="true"></span>' +
      "</label></th>"
    );
  }

  function buildPickSuiteForest() {
    var byParent = {};
    (state.pick.suites || []).forEach(function (s) {
      var k = s.parent_id ? String(s.parent_id) : "";
      if (!byParent[k]) byParent[k] = [];
      byParent[k].push(s);
    });
    Object.keys(byParent).forEach(function (k) {
      byParent[k].sort(function (a, b) {
        var sa = Number(a.sort_order || 0);
        var sb = Number(b.sort_order || 0);
        if (sa !== sb) return sa - sb;
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      });
    });
    return byParent;
  }

  function renderPickTree() {
    var ul = $("cm-plan-pick-tree");
    if (!ul) return;
    ul.innerHTML = "";
    var sid = state.pick.suiteId || "__all__";

    function addAllItem() {
      var li = document.createElement("li");
      li.className = "cm-tree__item";
      if (sid === "__all__") li.classList.add("is-active");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cm-tree__label";
      btn.textContent = "全部用例";
      btn.addEventListener("click", function () {
        state.pick.suiteId = "__all__";
        state.pick.page = 1;
        clearPickSelection();
        renderPickTree();
        loadPickCases();
      });
      li.appendChild(btn);
      ul.appendChild(li);
    }

    function addSuiteItem(suiteObj, depth, hasChildren) {
      var li = document.createElement("li");
      li.className = "cm-tree__item cm-tree__item--suite";
      if (sid === suiteObj.id) li.classList.add("is-active");
      li.style.setProperty("--cm-tree-depth", String(depth));

      var row = document.createElement("div");
      row.className = "cm-tree__row";

      var twist = document.createElement("button");
      twist.type = "button";
      twist.className = "cm-tree__twist" + (hasChildren ? "" : " is-leaf");
      if (hasChildren) {
        var collapsed = !!state.pick.suiteCollapsed[String(suiteObj.id)];
        twist.textContent = collapsed ? "▸" : "▾";
        twist.addEventListener("click", function (e) {
          e.stopPropagation();
          var id = String(suiteObj.id);
          if (state.pick.suiteCollapsed[id]) delete state.pick.suiteCollapsed[id];
          else state.pick.suiteCollapsed[id] = true;
          renderPickTree();
        });
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cm-tree__label";
      btn.textContent = suiteObj.name;
      btn.addEventListener("click", function () {
        state.pick.suiteId = suiteObj.id;
        state.pick.page = 1;
        clearPickSelection();
        renderPickTree();
        loadPickCases();
      });

      row.appendChild(twist);
      row.appendChild(btn);
      li.appendChild(row);
      ul.appendChild(li);

      if (hasChildren && !state.pick.suiteCollapsed[String(suiteObj.id)]) {
        (byParent[String(suiteObj.id)] || []).forEach(function (child) {
          addSuiteItem(child, depth + 1, (byParent[String(child.id)] || []).length > 0);
        });
      }
    }

    var byParent = buildPickSuiteForest();
    addAllItem();
    (byParent[""] || []).forEach(function (s) {
      addSuiteItem(s, 0, (byParent[String(s.id)] || []).length > 0);
    });
  }

  function promptPickAssignee(count) {
    var members = state.pick.members || [];
    if (!members.length) {
      return Promise.reject(new Error("项目暂无成员，无法指定执行人"));
    }
    var options = members
      .filter(function (m) {
        return m && m.user_id;
      })
      .map(function (m) {
        return { value: String(m.user_id), label: memberLabel(m) };
      });
    if (!options.length) {
      return Promise.reject(new Error("项目暂无成员，无法指定执行人"));
    }
    if (global.CmDialogs && typeof global.CmDialogs.choose === "function") {
      return global.CmDialogs.choose({
        title: "指定执行人",
        message: "必须指定执行人后才能加入计划（已选 " + count + " 条）。",
        label: "执行人",
        confirmText: "加入计划",
        requiredMessage: "请选择执行人",
        options: options,
        defaultValue: options[0].value,
      }).then(function (val) {
        if (val == null) return null;
        var id = String(val || "").trim();
        if (!id) throw new Error("请选择执行人");
        return id;
      });
    }
    return Promise.reject(new Error("请选择执行人"));
  }

  function renderPickCases() {
    var wrap = $("cm-plan-pick-cases-wrap");
    if (!wrap) return;
    var cases = state.pick.cases || [];
    if (!cases.length) {
      wrap.innerHTML =
        '<table class="cm-plan-table" id="cm-plan-pick-cases"><thead><tr>' +
        pickHeadCheckHtml() +
        "<th>用例</th><th>优先级</th></tr></thead><tbody></tbody></table>" +
        '<p class="cm-plan-muted cm-plan-pick-empty">当前目录下没有 ready 用例</p>';
      syncPickPager();
      syncPickCount();
      return;
    }
    wrap.innerHTML = '<table class="cm-plan-table" id="cm-plan-pick-cases"></table>';
    var table = $("cm-plan-pick-cases");
    var html =
      "<thead><tr>" +
      pickHeadCheckHtml() +
      "<th>用例</th><th>优先级</th></tr></thead><tbody>";
    cases.forEach(function (c) {
      var checked = !!(state.pick.suiteSelectAll || state.pick.selectedIds[c.id]);
      html +=
        "<tr>" +
        pickCheckCellHtml(c.id, checked) +
        "<td>" +
        escapeHtml(c.title || c.id) +
        "</td>" +
        "<td>" +
        escapeHtml(c.priority || "-") +
        "</td>" +
        "</tr>";
    });
    html += "</tbody>";
    table.innerHTML = html;

    var headCb = $("cm-plan-pick-check-head");
    if (headCb) {
      headCb.addEventListener("click", function (e) {
        e.preventDefault();
        cyclePickHeadSelection();
      });
    }
    table.querySelectorAll("[data-pick-case]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-pick-case");
        togglePickCaseSelected(id, !!cb.checked);
        syncPickHeadCheck();
        syncPickCount();
      });
    });
    syncPickHeadCheck();
    syncPickPager();
    syncPickCount();
  }

  function syncPickPager() {
    var el = $("cm-plan-pick-pager");
    if (!el) return;
    var total = state.pick.total || 0;
    var pageSize = state.pick.pageSize || 10;
    var totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    var page = state.pick.page || 1;
    if (total <= pageSize) {
      el.innerHTML = total ? "共 " + total + " 条" : "";
      return;
    }
    el.innerHTML =
      '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-plan-pick-prev"' +
      (page <= 1 ? " disabled" : "") +
      ">上一页</button> " +
      "<span>" +
      page +
      " / " +
      totalPages +
      "</span> " +
      '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-plan-pick-next"' +
      (page >= totalPages ? " disabled" : "") +
      ">下一页</button>";
    var prev = $("cm-plan-pick-prev");
    var next = $("cm-plan-pick-next");
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

  function loadPickCases() {
    var pid = currentProjectId();
    if (!pid) return;
    var wrap = $("cm-plan-pick-cases-wrap");
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

  function fetchAllReadyCaseIds() {
    var pid = currentProjectId();
    if (!pid) return Promise.resolve([]);
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

  function submitPickCases() {
    if (pickSelectedCount() <= 0) return toast("请至少勾选一条用例", "error");
    var n = pickSelectedCount();
    promptPickAssignee(n)
      .then(function (assigneeId) {
        if (assigneeId == null) return null;
        state.pick.assigneeId = assigneeId || "";
        return resolvePickCaseIds().then(function (ids) {
          if (!ids.length) throw new Error("请至少勾选一条用例");
          if (!state.pick.assigneeId) throw new Error("请指定执行人");
          return api("/api/l5/runs/" + state.runId + "/items", {
            method: "POST",
            body: { case_ids: ids, assignee_id: state.pick.assigneeId },
          });
        });
      })
      .then(function (res) {
        if (!res) return;
        var added = res.added || 0;
        var updated = res.updated || 0;
        var msg = "已加入 " + added + " 条用例";
        if (updated) msg += "，更新执行人 " + updated + " 条";
        toast(msg, "success");
        closePickCases();
        // 回到执行人汇总，避免按旧执行人过滤看不到新加用例
        openRun(state.runId);
      })
      .catch(function (err) {
        toast(err.message || "添加失败", "error");
      });
  }

  function openPickCases() {
    var pid = currentProjectId();
    if (!pid) return toast("请先选择项目", "error");
    if (!state.runId) return toast("计划执行集未就绪", "error");
    ensurePickDom();
    state.pick = {
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
    };
    $("cm-plan-pick-mask").classList.remove("is-hidden");
    $("cm-plan-pick-cases-wrap").innerHTML =
      '<p class="cm-plan-muted" style="padding:16px;">加载中…</p>';
    Promise.all([
      api("/api/case-management/projects/" + pid + "/suites"),
      api("/api/case-management/projects/" + pid + "/members"),
    ])
      .then(function (arr) {
        state.pick.suites = (arr[0] && arr[0].items) || [];
        state.pick.members = (arr[1] && arr[1].items) || [];
        renderPickTree();
        loadPickCases();
      })
      .catch(function (err) {
        toast(err.message || "加载失败", "error");
        closePickCases();
      });
  }

  function openMetrics() {
    var pid = currentProjectId();
    if (!pid) return toast("请先选择项目", "error");
    openMask();
    state.view = "plans";
    setHead("Metrics", "质量统计", "用例、执行结果与缺陷的只读汇总");
    setToolbar("");
    setHeadActions(
      '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-metrics-refresh">刷新</button>' +
        '<a class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-metrics-export" data-hf-no-nav-loading download href="/api/l5/projects/' +
        encodeURIComponent(pid) +
        '/defects/export.csv">导出缺陷 CSV</a>'
    );
    $("cm-plan-body").innerHTML = '<p class="cm-plan-muted">加载中…</p>';
    $("cm-metrics-refresh").onclick = function () {
      openMetrics();
    };
    api("/api/l5/projects/" + pid + "/metrics?decision=1")
      .then(function (m) {
        var cases = m.cases || {};
        var ex = m.executions_30d || {};
        var defects = m.defects || {};
        var byStatus = cases.by_status || {};
        var byLast = cases.by_last_result || {};
        var defBy = defects.by_status || {};
        var trend = m.exec_trend_14d || [];
        var openSev = m.open_by_severity || {};
        var html =
          '<div class="cm-metrics-grid">' +
          card("用例总数", String(cases.total || 0), "当前项目未删除用例") +
          card("近30天通过率", (ex.pass_rate || 0) + "%", "执行 " + (ex.total || 0) + " 次") +
          card("缺陷总数", String(defects.total || 0), "open " + (defBy.open || 0)) +
          card("MTTR", formatMttr(m), "已关单中位数") +
          "</div>" +
          '<div class="cm-metrics-sections">' +
          '<div class="cm-metrics-section"><h3>用例状态</h3><ul class="cm-metrics-list">' +
          kv("就绪", byStatus.ready) +
          kv("草稿", byStatus.draft) +
          kv("废弃", byStatus.deprecated) +
          "</ul></div>" +
          '<div class="cm-metrics-section"><h3>最近执行结果</h3><ul class="cm-metrics-list">' +
          kv("通过", byLast.pass) +
          kv("失败", byLast.fail) +
          kv("阻塞", byLast.blocked) +
          kv("跳过", byLast.skip) +
          "</ul></div>" +
          '<div class="cm-metrics-section"><h3>未关闭·严重度</h3><ul class="cm-metrics-list">' +
          (Object.keys(openSev).length
            ? ["blocker", "major", "normal", "minor", "trivial"]
                .filter(function (k) {
                  return Object.prototype.hasOwnProperty.call(openSev, k);
                })
                .concat(
                  Object.keys(openSev).filter(function (k) {
                    return (
                      ["blocker", "major", "normal", "minor", "trivial"].indexOf(k) < 0
                    );
                  })
                )
                .map(function (k) {
                  return kv(severityLabelZh(k), openSev[k]);
                })
                .join("")
            : kv("无", 0)) +
          "</ul></div>" +
          '</div>' +
          '<div class="cm-metrics-section cm-metrics-section--trend">' +
          '<div class="cm-metrics-trend__head">' +
          '<h3>近14日执行趋势</h3>' +
          (trend.length
            ? '<span class="cm-metrics-trend__count" id="cm-metrics-trend-count"></span>'
            : "") +
          "</div>" +
          (trend.length
            ? '<ul class="cm-metrics-trend-list" id="cm-metrics-trend-list"></ul>' +
              '<div class="cm-pager cm-metrics-trend-pager is-hidden" id="cm-metrics-trend-pager">' +
              '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-metrics-trend-prev">上一页</button>' +
              '<span id="cm-metrics-trend-page-info">1 / 1</span>' +
              '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-metrics-trend-next">下一页</button>' +
              "</div>"
            : '<p class="cm-plan-muted">近14日暂无执行记录</p>') +
          "</div>";
        $("cm-plan-body").innerHTML = html;
        if (trend.length) {
          bindTrendPager(
            trend
              .slice()
              .reverse()
          );
        }
      })
      .catch(function (err) {
        $("cm-plan-body").innerHTML =
          '<p class="cm-plan-error">' + escapeHtml(err.message || "加载失败") + "</p>";
      });
  }

  var TREND_PAGE_SIZE = 7;
  var trendPagerState = { items: [], page: 1 };

  function formatTrendItem(row) {
    return (
      "<li>" +
      '<div class="cm-metrics-trend-item__date">' +
      escapeHtml(row.date || "") +
      "</div>" +
      '<div class="cm-metrics-trend-item__stats">' +
      '<span class="cm-metrics-trend-stat"><em>合计</em><strong>' +
      escapeHtml(String(row.total || 0)) +
      "</strong></span>" +
      '<span class="cm-metrics-trend-stat cm-metrics-trend-stat--pass"><em>通过</em><strong>' +
      escapeHtml(String(row.pass || 0)) +
      "</strong></span>" +
      '<span class="cm-metrics-trend-stat cm-metrics-trend-stat--fail"><em>失败</em><strong>' +
      escapeHtml(String(row.fail || 0)) +
      "</strong></span>" +
      '<span class="cm-metrics-trend-stat"><em>阻塞</em><strong>' +
      escapeHtml(String(row.blocked || 0)) +
      "</strong></span>" +
      '<span class="cm-metrics-trend-stat"><em>跳过</em><strong>' +
      escapeHtml(String(row.skip || 0)) +
      "</strong></span>" +
      "</div>" +
      "</li>"
    );
  }

  function renderTrendPage() {
    var list = $("cm-metrics-trend-list");
    var pager = $("cm-metrics-trend-pager");
    var info = $("cm-metrics-trend-page-info");
    var count = $("cm-metrics-trend-count");
    var prev = $("cm-metrics-trend-prev");
    var next = $("cm-metrics-trend-next");
    var items = trendPagerState.items || [];
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / TREND_PAGE_SIZE) || 1);
    if (trendPagerState.page > totalPages) trendPagerState.page = totalPages;
    if (trendPagerState.page < 1) trendPagerState.page = 1;
    var page = trendPagerState.page;
    var start = (page - 1) * TREND_PAGE_SIZE;
    var pageItems = items.slice(start, start + TREND_PAGE_SIZE);
    if (count) count.textContent = "共 " + total + " 天";
    if (list) list.innerHTML = pageItems.map(formatTrendItem).join("");
    if (pager) {
      if (total > TREND_PAGE_SIZE) {
        pager.classList.remove("is-hidden");
        if (info) info.textContent = page + " / " + totalPages;
        if (prev) prev.disabled = page <= 1;
        if (next) next.disabled = page >= totalPages;
      } else {
        pager.classList.add("is-hidden");
      }
    }
  }

  function bindTrendPager(items) {
    trendPagerState = { items: items || [], page: 1 };
    var prev = $("cm-metrics-trend-prev");
    var next = $("cm-metrics-trend-next");
    if (prev) {
      prev.onclick = function () {
        if (trendPagerState.page <= 1) return;
        trendPagerState.page -= 1;
        renderTrendPage();
      };
    }
    if (next) {
      next.onclick = function () {
        var totalPages = Math.max(
          1,
          Math.ceil(trendPagerState.items.length / TREND_PAGE_SIZE)
        );
        if (trendPagerState.page >= totalPages) return;
        trendPagerState.page += 1;
        renderTrendPage();
      };
    }
    renderTrendPage();
  }

  function formatMttr(m) {
    var mins = m && m.mttr_minutes;
    if (mins == null && m && m.mttr_hours != null) {
      mins = Number(m.mttr_hours) * 60;
    }
    if (mins == null || !isFinite(Number(mins))) return "-";
    mins = Number(mins);
    if (mins <= 60) {
      return Math.round(mins) + "分钟";
    }
    var hours = mins / 60;
    if (Math.abs(hours - Math.round(hours)) < 0.05) {
      return Math.round(hours) + "小时";
    }
    return hours.toFixed(1) + "小时";
  }

  function card(title, value, tip) {
    return (
      '<div class="cm-metrics-card"><div class="cm-metrics-card__label">' +
      escapeHtml(title) +
      '</div><div class="cm-metrics-card__value">' +
      escapeHtml(value) +
      '</div><div class="cm-metrics-card__tip">' +
      escapeHtml(tip || "") +
      "</div></div>"
    );
  }

  function severityLabelZh(sev) {
    var map = {
      blocker: "阻塞",
      major: "严重",
      normal: "一般",
      minor: "次要",
      trivial: "细微",
    };
    var key = String(sev || "").trim().toLowerCase();
    return map[key] || key || "未知";
  }

  function kv(k, v) {
    return (
      "<li><span>" +
      escapeHtml(k) +
      '</span><strong>' +
      escapeHtml(String(v == null ? 0 : v)) +
      "</strong></li>"
    );
  }

  function ensureTopbarButtons() {
    function bindPlan(btn) {
      if (!btn || btn._cmPlanBound) return;
      btn._cmPlanBound = true;
      btn.addEventListener("click", function () {
        openPlans();
      });
    }
    bindPlan($("cm-btn-plans-l5"));
    bindPlan($("cm-btn-plans-more"));
    var metricsBtn = $("cm-btn-metrics-l5");
    if (metricsBtn && !metricsBtn._cmMetricsBound) {
      metricsBtn._cmMetricsBound = true;
      metricsBtn.title = "质量统计（只读）";
      metricsBtn.addEventListener("click", function () {
        openMetrics();
      });
    }
  }

  function boot() {
    ensureDom();
    ensureTopbarButtons();
    // 若登录门稍后才打开 workspace，再试一次挂按钮
    var obs = new MutationObserver(function () {
      ensureTopbarButtons();
    });
    var ws = $("cm-workspace");
    if (ws) obs.observe(ws, { attributes: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.CmPlanRunUi = {
    openPlans: openPlans,
    openMetrics: openMetrics,
    close: close,
  };
})(window);
