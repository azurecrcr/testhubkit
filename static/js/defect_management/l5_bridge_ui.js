/**
 * DM L5：活动时间线 + 底栏导出 CSV。
 * 不改 defect app.js 核心逻辑。
 */
(function () {
  var ACTION_LABELS = {
    enrich_update: "更新扩展字段",
    set_cases: "更新关联用例",
    status_change: "变更状态",
    status_change_l5: "变更状态",
    "defect.status": "变更状态",
    create: "创建缺陷",
    comment: "发表评论",
    "regression.pending": "标记待回归",
    "regression.cleared": "清除待回归",
    execution_create_defect: "由测试执行创建",
    created_from_execution: "由测试执行创建",
  };
  var STATUS_LABELS = {
    open: "待处理",
    confirmed: "已确认",
    in_progress: "处理中",
    resolved: "已解决",
    closed: "已关闭",
    rejected: "已拒绝",
  };

  function $(id) {
    return document.getElementById(id);
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
  function toast(msg, type) {
    if (window.HfFloatToast && typeof window.HfFloatToast.show === "function") {
      window.HfFloatToast.show(msg, type || "info");
    } else {
      console.log("[L5-DM]", type || "info", msg);
    }
  }
  function params() {
    var u = new URL(window.location.href);
    return {
      project_id: u.searchParams.get("project_id") || "",
      defect_id: u.searchParams.get("defect_id") || "",
    };
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function actionLabel(code) {
    var c = String(code || "").trim();
    return ACTION_LABELS[c] || c || "操作";
  }
  function statusLabel(code) {
    var c = String(code || "").trim().toLowerCase();
    return STATUS_LABELS[c] || c || "—";
  }
  function activityTitle(a) {
    var code = String((a && a.action) || "").trim();
    var payload = (a && a.payload) || {};
    if (code === "status_change" || code === "status_change_l5" || code === "defect.status") {
      var from = statusLabel(payload.from);
      var to = statusLabel(payload.to);
      if (from !== "—" || to !== "—") return "状态：" + from + " → " + to;
      return "变更状态";
    }
    if (code === "created_from_execution" || code === "execution_create_defect") {
      return "由测试执行创建";
    }
    return actionLabel(code);
  }
  function formatTime(raw) {
    var s = String(raw || "").trim();
    if (!s) return "—";
    // "YYYY-MM-DD HH:MM:SS" → 月日 + 时分
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (m) return m[2] + "-" + m[3] + " " + m[4] + ":" + m[5];
    return s;
  }

  function setActivityOpen(open) {
    var tab = $("dm-tab-activity");
    if (tab) tab.classList.toggle("is-hidden", !open);
    if (!open) {
      // 新建时回到详情 Tab，避免停在已隐藏的活动页
      var detailBtn = $("dm-tab-detail");
      var detailPane = $("dm-pane-detail");
      var actPane = $("dm-pane-activity");
      var actBtn = $("dm-tab-activity");
      if (detailBtn) {
        detailBtn.classList.add("is-active");
        detailBtn.setAttribute("aria-selected", "true");
      }
      if (actBtn) {
        actBtn.classList.remove("is-active");
        actBtn.setAttribute("aria-selected", "false");
      }
      if (detailPane) detailPane.classList.remove("is-hidden");
      if (actPane) actPane.classList.add("is-hidden");
    }
  }

  function syncWithDrawerMode() {
    var title = $("dm-drawer-title");
    var text = (title && title.textContent) || "";
    var isNew = /新建/.test(text);
    var hasId = !!(window.__DM_L5_DEFECT_ID || params().defect_id);
    if (isNew && !hasId) {
      window.__DM_L5_DEFECT_ID = "";
      setActivityOpen(false);
      return;
    }
    if (hasId) setActivityOpen(true);
  }

  function watchDrawerMode() {
    var title = $("dm-drawer-title");
    if (!title || title._dmL5Obs) return;
    title._dmL5Obs = true;
    var obs = new MutationObserver(function () {
      syncWithDrawerMode();
    });
    obs.observe(title, { childList: true, characterData: true, subtree: true });
    var newBtn = $("dm-btn-new");
    if (newBtn && !newBtn._dmL5Bound) {
      newBtn._dmL5Bound = true;
      newBtn.addEventListener("click", function () {
        window.__DM_L5_DEFECT_ID = "";
        setTimeout(syncWithDrawerMode, 0);
      });
    }
  }

  function renderActivity(acts) {
    var box = $("dm-l5-activity");
    if (!box) return;
    if (!acts.length) {
      box.innerHTML = '<div class="dm-activity__empty">暂无活动记录</div>';
      return;
    }
    box.innerHTML =
      '<ol class="dm-activity__list">' +
      acts
        .slice(0, 30)
        .map(function (a) {
          var who = String(a.actor_name || "").trim() || "—";
          return (
            '<li class="dm-activity__item" role="listitem">' +
            '<span class="dm-activity__dot" aria-hidden="true"></span>' +
            '<div class="dm-activity__card">' +
            '<div class="dm-activity__row">' +
            '<span class="dm-activity__action">' +
            esc(activityTitle(a)) +
            "</span>" +
            "<time class=\"dm-activity__time\" datetime=\"" +
            esc(a.created_at) +
            '">' +
            esc(formatTime(a.created_at)) +
            "</time>" +
            "</div>" +
            '<div class="dm-activity__actor">' +
            '<span class="dm-activity__actor-label">操作人：</span>' +
            '<span class="dm-activity__actor-name">' +
            esc(who) +
            "</span>" +
            "</div>" +
            "</div>" +
            "</li>"
          );
        })
        .join("") +
      "</ol>";
  }

  function loadDefect(defectId) {
    if (!defectId) return;
    window.__DM_L5_DEFECT_ID = defectId;
    setActivityOpen(true);
    api("/api/l5/defects/" + defectId + "/activity")
      .then(function (data) {
        renderActivity((data && data.items) || []);
      })
      .catch(function () {
        renderActivity([]);
      });
  }

  function bindExport() {
    var exp = $("dm-l5-btn-export");
    if (!exp || exp._bound) return;
    exp._bound = true;
    exp.addEventListener("click", function () {
      var projectId =
        params().project_id || ($("dm-project-select") && $("dm-project-select").value) || "";
      if (!projectId) return toast("请先选择项目", "error");
      window.location.href =
        "/api/l5/projects/" + encodeURIComponent(projectId) + "/defects/export.csv";
    });
  }

  function hookFetch() {
    if (window.__DM_L5_FETCH_HOOKED_V2) return;
    window.__DM_L5_FETCH_HOOKED_V2 = true;
    var rawFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      return rawFetch(input, init).then(function (res) {
        try {
          var url = typeof input === "string" ? input : (input && input.url) || "";
          var m = url.match(/\/api\/(?:l5\/)?defect-management\/defects\/([a-f0-9]{32})$/i);
          if (!m) m = url.match(/\/api\/defect-management\/defects\/([a-f0-9]{32})$/i);
          if (m && (!init || !init.method || init.method.toUpperCase() === "GET")) {
            loadDefect(m[1]);
          }
        } catch (e) {}
        return res;
      });
    };
  }

  function deepLink() {
    var p = params();
    if (p.project_id) {
      var sel = $("dm-project-select");
      if (sel) {
        sel.value = p.project_id;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    if (p.defect_id) {
      setTimeout(function () {
        loadDefect(p.defect_id);
      }, 600);
    }
  }

  function boot() {
    // 清掉旧版动态注入的「扩展信息」面板
    var legacy = $("dm-l5-panel");
    if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
    bindExport();
    watchDrawerMode();
    syncWithDrawerMode();
    hookFetch();
    deepLink();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
