(function () {
  "use strict";

  var state = {
    loggedIn: false,
    projects: [],
    projectId: "",
    suites: [],
    suiteFilter: "__all__",
    /** 已生效的标题搜索词（仅点「搜索」/回车写入；清空输入框不改此项） */
    appliedSearchQ: "",
    cases: [],
    total: 0,
    page: 1,
    pageSize: 20,
    editingId: null,
    editingNew: false,
    execPage: 1,
    execPageSize: 10,
    pendingImportMode: "",
    pendingImportSuiteId: "",
    pendingWbSource: null,
    activeSchema: null,
    selectedIds: {},
    suiteSelectAll: false,
    suiteCollapsed: {},
    batchExec: null,
    targetSuiteAction: "", // move | copy
    trashPage: 1,
    trashTotal: 0,
    trashItems: [],
    trashSelected: {},
    trashSelectAll: false,
    trashRetentionDays: 30,
    trashForUserId: "",
    trashCanBrowseMembers: false,
    trashAllowPurge: true,
    userId: "",
    myRole: "",
    members: [],
    pendingInvites: [],
    memberSearchHits: [],
    memberPickUserId: "",
    memberPickLabel: "",
    memberPickMeta: "",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function currentProject() {
    return (state.projects || []).find(function (p) {
      return p.id === state.projectId;
    }) || null;
  }

  function isViewerOnly() {
    return state.myRole === "viewer";
  }

  function isProjectOwner() {
    return state.myRole === "owner";
  }

  function syncCollabUi() {
    var proj = currentProject();
    state.myRole = (proj && proj.my_role) || "";
    var hasProject = !!state.projectId;
    var canEdit = hasProject && !isViewerOnly();
    var canManage = hasProject && isProjectOwner();
    [
      "cm-btn-new-case",
      "cm-btn-add-suite",
      "cm-btn-import-excel",
      "cm-btn-import-wb",
      "cm-case-empty-new",
      "cm-case-empty-import-wb",
      "cm-case-empty-import-excel",
    ].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.disabled = !canEdit;
      if (!hasProject) {
        if (id === "cm-btn-new-case" || id === "cm-case-empty-new") el.title = "请先添加项目";
        else if (id === "cm-btn-add-suite") el.title = "请先添加项目";
        else el.title = "请先添加项目后再导入";
      } else if (!canEdit) {
        el.title = "当前角色仅可查看，无法编辑";
      } else {
        if (id === "cm-btn-new-case" || id === "cm-case-empty-new") el.title = "新建用例";
        else if (id === "cm-btn-add-suite") el.title = "新建根目录";
        else if (id === "cm-btn-import-wb" || id === "cm-case-empty-import-wb") el.title = "从工作台导入";
        else if (id === "cm-btn-import-excel" || id === "cm-case-empty-import-excel") el.title = "导入 Excel";
      }
    });
    /* 无项目时整组「导入和导出」不可点 */
    var ioMenu = $("cm-top-menu-io");
    if (ioMenu) {
      var ioTrigger = ioMenu.querySelector(".cm-top-menu__trigger");
      if (ioTrigger) {
        ioTrigger.disabled = !hasProject;
        ioTrigger.title = hasProject ? "导入和导出" : "请先添加项目后再导入或导出";
        if (!hasProject && ioMenu.classList.contains("is-open")) {
          ioMenu.classList.remove("is-open");
          var ioPanel = ioMenu.querySelector(".cm-top-menu__panel");
          if (ioPanel) ioPanel.hidden = true;
          ioTrigger.setAttribute("aria-expanded", "false");
        }
      }
    }
    syncBatchActionUi();
    var btnMembers = $("cm-btn-members");
    if (btnMembers) {
      btnMembers.disabled = !hasProject;
      btnMembers.title = hasProject ? "成员管理" : "请先选择项目";
    }
    var btnTrash = $("cm-btn-trash");
    if (btnTrash) {
      btnTrash.title = hasProject ? "回收站" : "请先选择项目";
      btnTrash.setAttribute("aria-label", hasProject ? "打开回收站" : "请先选择项目后再打开回收站");
    }
    var btnExport = $("cm-btn-export-excel");
    if (btnExport) {
      btnExport.classList.toggle("is-hidden", !canManage);
      btnExport.disabled = !canManage;
      btnExport.title = !hasProject
        ? "请先添加项目后再导出"
        : canManage
          ? "导出 Excel"
          : "仅项目负责人可导出";
    }
    // 更多（含质量统计 / 操作日志 / 测试计划）：仅负责人
    // 非负责人保留工具栏「测试计划」入口
    var moreMenu = $("cm-top-menu-more");
    if (moreMenu) {
      moreMenu.classList.toggle("is-hidden", !canManage);
      if (!canManage && moreMenu.classList.contains("is-open")) {
        moreMenu.classList.remove("is-open");
        var morePanel = moreMenu.querySelector(".cm-top-menu__panel");
        var moreTrigger = moreMenu.querySelector(".cm-top-menu__trigger");
        if (morePanel) morePanel.hidden = true;
        if (moreTrigger) moreTrigger.setAttribute("aria-expanded", "false");
      }
    }
    [
      "cm-btn-metrics-l5",
      "cm-btn-l5ops",
      "cm-btn-plans-more",
    ].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.classList.toggle("is-hidden", !canManage);
      el.disabled = !canManage;
    });
    var planBtn = $("cm-btn-plans-l5");
    if (planBtn) {
      var hasProj = !!state.projectId;
      var showPlanStandalone = hasProj && !canManage;
      planBtn.classList.toggle("is-hidden", !showPlanStandalone);
      planBtn.disabled = !showPlanStandalone;
      planBtn.title = showPlanStandalone
        ? "测试计划：查看分配给我的计划并执行"
        : "请先选择项目";
    }
    var planMoreBtn = $("cm-btn-plans-more");
    if (planMoreBtn && canManage) {
      planMoreBtn.title = "计划工作台：左选计划，右管用例";
    }
    var inviteBox = $("cm-members-invite");
    if (inviteBox) inviteBox.classList.toggle("is-hidden", !canManage);
    var hint = $("cm-members-hint");
    if (hint) {
      if (!state.projectId) {
        hint.textContent = "请先选择项目后再管理成员";
        hint.setAttribute("data-tone", "muted");
      } else if (canManage) {
        hint.textContent = "邀请站内账号一起管理本项目用例";
        hint.removeAttribute("data-tone");
      } else {
        hint.textContent =
          "当前角色为「" + roleLabel(state.myRole) + "」，仅负责人可邀请成员";
        hint.setAttribute("data-tone", "warn");
      }
    }
  }

  function toast(msg, type) {
    if (window.HfFloatToast && typeof window.HfFloatToast.show === "function") {
      window.HfFloatToast.show(msg, type || "info");
      return;
    }
    if (window.CmDialogs && typeof window.CmDialogs.confirm === "function") {
      window.CmDialogs.confirm({
        title: "提示",
        message: String(msg || ""),
        confirmText: "知道了",
        cancelText: "关闭",
        danger: false,
      });
      return;
    }
    /* 仅兜底：本页不应再走系统 alert */
  }

  function cmPrompt(opts) {
    if (window.CmDialogs && typeof window.CmDialogs.prompt === "function") {
      return window.CmDialogs.prompt(opts);
    }
    return Promise.resolve(null);
  }

  function cmChoose(opts) {
    if (window.CmDialogs && typeof window.CmDialogs.choose === "function") {
      return window.CmDialogs.choose(opts);
    }
    return Promise.resolve(null);
  }

  function cmConfirm(opts) {
    if (window.CmDialogs && typeof window.CmDialogs.confirm === "function") {
      return window.CmDialogs.confirm(opts);
    }
    return Promise.resolve(false);
  }

  function cmAlert(opts) {
    if (window.CmDialogs && typeof window.CmDialogs.alert === "function") {
      return window.CmDialogs.alert(opts);
    }
    return Promise.resolve(false);
  }

  /** 导入/导出/新建用例前：无项目提示建项目，有项目无目录提示建目录。返回是否可继续。 */
  function ensureProjectAndSuiteReady() {
    if (!state.projectId) {
      return cmAlert({
        title: "提示",
        message: "请先创建项目",
        confirmText: "知道了",
      }).then(function () { return false; });
    }
    if (!(state.suites || []).length) {
      return cmAlert({
        title: "提示",
        message: "请先创建目录",
        confirmText: "知道了",
      }).then(function () { return false; });
    }
    return Promise.resolve(true);
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    if (!(opts.body instanceof FormData)) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }
    return fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      credentials: "same-origin",
      body: opts.body,
      signal: opts.signal,
    }).then(function (res) {
      var ct = res.headers.get("content-type") || "";
      if (ct.indexOf("application/json") >= 0) {
        return res.json().then(function (data) {
          if (!res.ok) {
            var err = new Error((data && (data.error || data.message)) || "请求失败");
            err.status = res.status;
            err.data = data;
            throw err;
          }
          return data;
        });
      }
      if (!res.ok) {
        throw new Error("请求失败 " + res.status);
      }
      return res.blob();
    });
  }

  window.CmAppApi = api;
  window.CmOnInviteAccepted = function (projectId) {
    var pid = String(projectId || "").trim();
    return loadProjects()
      .then(function () {
        if (pid && state.projects.some(function (p) { return p.id === pid; })) {
          state.projectId = pid;
          var sel = $("cm-project-select");
          if (sel) {
            sel.value = pid;
            if (window.CmFilterSelect && typeof window.CmFilterSelect.refresh === "function") {
              window.CmFilterSelect.refresh(sel);
            }
          }
        }
        syncCollabUi();
        if (!state.projectId) return;
        return reloadWorkspaceAfterProjectChange();
      })
      .catch(function (err) {
        toast((err && err.message) || "刷新项目失败", "error");
      });
  };

  function checkAuth() {
    return api("/api/auth/me")
      .then(function (data) {
        state.loggedIn = !!(data && data.user && data.user.id);
        state.userId = state.loggedIn ? String(data.user.id) : "";
        return state.loggedIn;
      })
      .catch(function () {
        state.loggedIn = false;
        state.userId = "";
        return false;
      });
  }

  function showGate(needLogin) {
    $("cm-login-gate").classList.toggle("is-hidden", !needLogin);
    $("cm-workspace").classList.toggle("is-hidden", needLogin);
    var fab = $("cm-btn-trash");
    if (fab) fab.classList.toggle("is-hidden", !!needLogin);
  }

  function loadProjects() {
    return api("/api/case-management/projects").then(function (data) {
      state.projects = data.items || [];
      var sel = $("cm-project-select");
      sel.innerHTML = "";
      if (!state.projects.length) {
        var opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "暂无项目";
        sel.appendChild(opt);
        state.projectId = "";
      } else {
        state.projects.forEach(function (p) {
          var o = document.createElement("option");
          o.value = p.id;
          o.textContent = p.name;
          sel.appendChild(o);
        });
        if (!state.projectId || !state.projects.some(function (p) { return p.id === state.projectId; })) {
          state.projectId = state.projects[0].id;
        }
        sel.value = state.projectId;
      }
      if (window.CmFilterSelect && typeof window.CmFilterSelect.refresh === "function") {
        window.CmFilterSelect.refresh(sel);
      }
      syncCollabUi();
    });
  }

  function loadSuites() {
    if (!state.projectId) {
      state.suites = [];
      renderTree();
      return Promise.resolve();
    }
    return api("/api/case-management/projects/" + state.projectId + "/suites").then(function (data) {
      state.suites = data.items || [];
      renderTree();
      fillSuiteSelect();
    });
  }

  function suiteParentKey(suite) {
    var pid = suite && suite.parent_id;
    return pid ? String(pid) : "";
  }

  function buildSuiteForest() {
    var byParent = {};
    (state.suites || []).forEach(function (s) {
      var k = suiteParentKey(s);
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

  function suiteById(suiteId) {
    var id = String(suiteId || "");
    return (state.suites || []).find(function (s) {
      return String(s.id) === id;
    }) || null;
  }

  function suitePathLabel(suiteId) {
    var map = {};
    (state.suites || []).forEach(function (s) {
      map[String(s.id)] = s;
    });
    var parts = [];
    var cur = map[String(suiteId || "")];
    var guard = 0;
    while (cur && guard < 50) {
      parts.unshift(cur.name || "");
      cur = cur.parent_id ? map[String(cur.parent_id)] : null;
      guard += 1;
    }
    return parts.join(" / ") || "";
  }

  function walkSuitesDepthFirst(visitor) {
    var byParent = buildSuiteForest();
    function walk(parentKey, depth) {
      (byParent[parentKey] || []).forEach(function (s) {
        visitor(s, depth, (byParent[String(s.id)] || []).length > 0);
        walk(String(s.id), depth + 1);
      });
    }
    walk("", 0);
  }

  function ensureSuiteAncestorsExpanded(suiteId) {
    var map = {};
    (state.suites || []).forEach(function (s) {
      map[String(s.id)] = s;
    });
    var cur = map[String(suiteId || "")];
    var guard = 0;
    while (cur && cur.parent_id && guard < 50) {
      delete state.suiteCollapsed[String(cur.parent_id)];
      cur = map[String(cur.parent_id)];
      guard += 1;
    }
  }

  function isSuiteCollapsed(suiteId) {
    return !!state.suiteCollapsed[String(suiteId || "")];
  }

  function toggleSuiteCollapsed(suiteId) {
    var id = String(suiteId || "");
    if (!id) return;
    if (state.suiteCollapsed[id]) delete state.suiteCollapsed[id];
    else state.suiteCollapsed[id] = true;
    renderTree();
  }

  function fillSuiteSelect() {
    var sel = $("cm-f-suite");
    if (!sel) return;
    sel.innerHTML = "";
    walkSuitesDepthFirst(function (s, depth) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = suitePathLabel(s.id);
      o.setAttribute("data-depth", String(depth));
      sel.appendChild(o);
    });
    if (window.CmFilterSelect && typeof window.CmFilterSelect.refresh === "function") {
      window.CmFilterSelect.refresh(sel);
    }
  }

  function promptCreateSuite(parentId) {
    if (isViewerOnly()) return Promise.reject(new Error("只读成员无法新建目录"));
    if (!state.projectId) return toast("请先创建项目", "error");
    var parent = parentId ? suiteById(parentId) : null;
    return cmPrompt({
      title: parent ? "添加子目录" : "添加目录",
      message: parent
        ? "将在「" + parent.name + "」下创建子目录。适合按端再分版本，例如 Web端 → 1.5.1。"
        : "可先建端类型目录（如 Web端 / App端 / 桌面端），再在目录行点「＋」添加子目录。",
      label: "目录名称",
      placeholder: parent ? "例如：1.5.1" : "例如：Web端",
      confirmText: "添加",
    }).then(function (name) {
      if (!name) return null;
      var body = { name: name };
      if (parent) body.parent_id = parent.id;
      return api("/api/case-management/projects/" + state.projectId + "/suites", {
        method: "POST",
        body: JSON.stringify(body),
      }).then(function (data) {
        if (parent) delete state.suiteCollapsed[String(parent.id)];
        return loadSuites().then(function () {
          return data;
        });
      });
    });
  }

  function renderTree() {
    var ul = $("cm-tree");
    ul.innerHTML = "";
    if (state.suiteFilter === "__none__") {
      state.suiteFilter = "__all__";
    }
    if (state.suiteFilter && String(state.suiteFilter).indexOf("__") !== 0) {
      ensureSuiteAncestorsExpanded(state.suiteFilter);
    }

    function addAllItem() {
      var li = document.createElement("li");
      li.className = "cm-tree__item";
      if (state.suiteFilter === "__all__") li.classList.add("is-active");
      li.setAttribute("data-suite", "__all__");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cm-tree__label";
      btn.textContent = "全部用例";
      btn.addEventListener("click", function () {
        state.suiteFilter = "__all__";
        state.page = 1;
        clearCaseSelection();
        renderTree();
        Promise.all([loadActiveSchema(), loadCases()]);
      });
      li.appendChild(btn);
      ul.appendChild(li);
    }

    function addSuiteItem(suiteObj, depth, hasChildren) {
      var li = document.createElement("li");
      li.className = "cm-tree__item cm-tree__item--suite";
      if (state.suiteFilter === suiteObj.id) li.classList.add("is-active");
      li.setAttribute("data-suite", suiteObj.id);
      li.style.setProperty("--cm-tree-depth", String(depth));

      var row = document.createElement("div");
      row.className = "cm-tree__row";

      var twist = document.createElement("button");
      twist.type = "button";
      twist.className = "cm-tree__twist" + (hasChildren ? "" : " is-leaf");
      twist.setAttribute("aria-label", hasChildren ? "展开或折叠" : "");
      if (hasChildren) {
        var collapsed = isSuiteCollapsed(suiteObj.id);
        twist.textContent = collapsed ? "▸" : "▾";
        twist.title = collapsed ? "展开子目录" : "折叠子目录";
        twist.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleSuiteCollapsed(suiteObj.id);
        });
      } else {
        twist.textContent = "";
        twist.tabIndex = -1;
        twist.setAttribute("aria-hidden", "true");
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cm-tree__label";
      btn.textContent = suiteObj.name;
      btn.title = suitePathLabel(suiteObj.id);
      btn.addEventListener("click", function () {
        state.suiteFilter = suiteObj.id;
        state.page = 1;
        clearCaseSelection();
        renderTree();
        Promise.all([loadActiveSchema(), loadCases()]);
      });

      var acts = document.createElement("div");
      acts.className = "cm-tree__actions";

      var addChild = document.createElement("button");
      addChild.type = "button";
      addChild.className = "cm-icon-btn";
      addChild.title = "添加子目录";
      addChild.textContent = "＋";
      addChild.addEventListener("click", function (e) {
        e.stopPropagation();
        promptCreateSuite(suiteObj.id).catch(function (err) {
          toast(err.message, "error");
        });
      });

      var up = document.createElement("button");
      up.type = "button";
      up.className = "cm-icon-btn";
      up.title = "同级上移";
      up.textContent = "↑";
      up.addEventListener("click", function (e) {
        e.stopPropagation();
        api("/api/case-management/suites/" + suiteObj.id, {
          method: "PATCH",
          body: JSON.stringify({ move_up: true }),
        }).then(loadSuites).catch(function (err) { toast(err.message, "error"); });
      });

      var down = document.createElement("button");
      down.type = "button";
      down.className = "cm-icon-btn";
      down.title = "同级下移";
      down.textContent = "↓";
      down.addEventListener("click", function (e) {
        e.stopPropagation();
        api("/api/case-management/suites/" + suiteObj.id, {
          method: "PATCH",
          body: JSON.stringify({ move_down: true }),
        }).then(loadSuites).catch(function (err) { toast(err.message, "error"); });
      });

      var ren = document.createElement("button");
      ren.type = "button";
      ren.className = "cm-icon-btn";
      ren.title = "重命名";
      ren.textContent = "✎";
      ren.addEventListener("click", function (e) {
        e.stopPropagation();
        cmPrompt({
          title: "重命名目录",
          message: "修改后立即生效，不影响目录下的用例归属。",
          label: "目录名称",
          defaultValue: suiteObj.name,
          placeholder: "例如：登录模块",
          confirmText: "保存",
        }).then(function (name) {
          if (!name) return;
          api("/api/case-management/suites/" + suiteObj.id, {
            method: "PATCH",
            body: JSON.stringify({ name: name }),
          }).then(loadSuites).catch(function (err) { toast(err.message, "error"); });
        });
      });

      var del = document.createElement("button");
      del.type = "button";
      del.className = "cm-icon-btn";
      del.title = "删除";
      del.textContent = "×";
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        cmConfirm({
          title: "删除目录",
          message:
            "确定删除目录「" +
            suiteObj.name +
            "」？若仍有子目录或用例，将无法删除。",
          confirmText: "删除",
          danger: true,
        }).then(function (ok) {
          if (!ok) return;
          api("/api/case-management/suites/" + suiteObj.id, { method: "DELETE" })
            .then(function () {
              if (state.suiteFilter === suiteObj.id) state.suiteFilter = "__all__";
              return Promise.all([loadSuites(), loadActiveSchema(), loadCases()]);
            })
            .catch(function (err) { toast(err.message, "error"); });
        });
      });

      acts.appendChild(addChild);
      acts.appendChild(up);
      acts.appendChild(down);
      acts.appendChild(ren);
      acts.appendChild(del);

      row.appendChild(twist);
      row.appendChild(btn);
      row.appendChild(acts);
      li.appendChild(row);
      ul.appendChild(li);
    }

    addAllItem();
    var byParent = buildSuiteForest();
    function walkVisible(parentKey, depth) {
      (byParent[parentKey] || []).forEach(function (s) {
        var kids = byParent[String(s.id)] || [];
        addSuiteItem(s, depth, kids.length > 0);
        if (kids.length && !isSuiteCollapsed(s.id)) {
          walkVisible(String(s.id), depth + 1);
        }
      });
    }
    walkVisible("", 0);
  }

  function setDrawerSuiteValue(suiteId) {
    var sel = $("cm-f-suite");
    if (!sel) return;
    sel.value = suiteId || "";
    if (window.CmFilterSelect && typeof window.CmFilterSelect.refresh === "function") {
      window.CmFilterSelect.refresh(sel);
    }
  }

  function setDrawerSuiteVisible(show) {
    var wrap = $("cm-drawer-suite-wrap");
    if (wrap) wrap.classList.toggle("is-hidden", !show);
  }

  function defaultSuiteIdForNewCase() {
    var suites = state.suites || [];
    if (!suites.length) return "";
    var filter = String(state.suiteFilter || "");
    if (filter && filter.indexOf("__") !== 0) {
      var matched = suites.some(function (s) { return s.id === filter; });
      if (matched) return filter;
    }
    return suites[0].id;
  }

  function loadActiveSchema() {
    var sid = state.suiteFilter;
    if (!state.projectId) {
      state.activeSchema = null;
      return Promise.resolve(null);
    }
    // 全部用例：使用项目内已锁定表头；具体目录：effective 继承
    var url =
      !sid || String(sid).indexOf("__") === 0
        ? "/api/case-management/projects/" +
          encodeURIComponent(state.projectId) +
          "/schema/effective"
        : "/api/case-management/suites/" +
          encodeURIComponent(sid) +
          "/schema?effective=1";
    return api(url)
      .then(function (data) {
        state.activeSchema = data.item || null;
        return state.activeSchema;
      })
      .catch(function () {
        state.activeSchema = null;
        return null;
      });
  }

  function importHooks() {
    return {
      onSuccess: function (data) {
        var tip = formatImportResultMessage(data);
        toast(tip.message, tip.type);
        state.pendingImportSuiteId = "";
        state.pendingImportMode = "";
        state.pendingWbSource = null;
        $("cm-wb-mask").classList.add("is-hidden");
        loadSuites()
          .then(function () {
            return Promise.all([loadActiveSchema(), loadCases()]);
          });
      },
      onError: function (err) {
        toast(err.message || "导入失败", "error");
      },
    };
  }

  /**
   * 按后端真实计数生成导入提示：仅展示 >0 的项；
   * 全失败偏 error，有成功有失败偏 info，全成功 success。
   */
  function formatImportResultMessage(data) {
    data = data || {};
    var created = Number(data.created) || 0;
    var updated = Number(data.updated) || 0;
    var skipped = Number(data.skipped) || 0;
    var unchanged = Number(data.unchanged) || 0;
    var failed = Number(data.failed) || 0;
    var errors = data.errors || [];
    if (!failed && errors.length) failed = errors.length;

    var parts = [];
    if (created > 0) parts.push("新增 " + created + " 条");
    if (updated > 0) parts.push("更新 " + updated + " 条");
    if (skipped > 0) parts.push("跳过 " + skipped + " 条");
    if (unchanged > 0) parts.push("未变更 " + unchanged + " 条");
    if (failed > 0) parts.push("失败 " + failed + " 条");

    var wrote = created + updated;
    if (!parts.length) {
      return { message: "导入完成：没有可写入的数据", type: "info" };
    }
    var message = "导入完成：" + parts.join("，");
    if (wrote <= 0 && failed > 0) {
      if (errors[0]) message += "（" + errors[0] + "）";
      return { message: message, type: "error" };
    }
    if (failed > 0) {
      return { message: message, type: "info" };
    }
    return { message: message, type: "success" };
  }

  function loadCases() {
    if (!state.projectId) {
      state.cases = [];
      state.total = 0;
      renderCases();
      return Promise.resolve();
    }
    var f = currentCaseFilters();
    var qs =
      "?page=" +
      state.page +
      "&page_size=" +
      state.pageSize +
      "&q=" +
      encodeURIComponent(f.q) +
      "&priority=" +
      encodeURIComponent(f.priority) +
      "&status=" +
      encodeURIComponent(f.status) +
      "&suite_id=" +
      encodeURIComponent(state.suiteFilter);
    return api("/api/case-management/projects/" + state.projectId + "/cases" + qs).then(function (data) {
      state.cases = data.items || [];
      state.total = data.total || 0;
      renderCases();
    });
  }

  function currentCaseFilters() {
    return {
      q: String(state.appliedSearchQ || "").trim(),
      priority: (($("cm-filter-priority") && $("cm-filter-priority").value) || "").trim(),
      status: (($("cm-filter-status") && $("cm-filter-status").value) || "").trim(),
      suite_id: state.suiteFilter || "__all__",
    };
  }

  /** 同步搜索框内清空按钮显隐（不触发列表刷新） */
  function syncCaseSearchClearBtn() {
    var input = $("cm-search");
    var btn = $("cm-search-clear");
    if (!btn) return;
    var has = !!(input && String(input.value || "").length);
    btn.classList.toggle("is-hidden", !has);
  }

  /** 点搜索/回车：提交当前输入为生效关键词并刷新列表 */
  function runCaseTitleSearch() {
    var input = $("cm-search");
    state.appliedSearchQ = ((input && input.value) || "").trim();
    state.page = 1;
    clearCaseSelection();
    syncCaseSearchClearBtn();
    return loadCases();
  }

  /** 仅清空搜索框文案，不改已生效筛选、不请求列表 */
  function clearCaseSearchInputOnly() {
    var input = $("cm-search");
    if (input) input.value = "";
    syncCaseSearchClearBtn();
    if (input) input.focus();
  }

  /** 重置：清空搜索框 + 已生效关键词 + 状态筛选，并刷新列表（不影响优先级） */
  function resetCaseSearchAndStatusFilters() {
    var input = $("cm-search");
    if (input) input.value = "";
    state.appliedSearchQ = "";
    syncCaseSearchClearBtn();
    var statusSel = $("cm-filter-status");
    if (statusSel) {
      statusSel.value = "";
      if (window.CmFilterSelect && typeof window.CmFilterSelect.refresh === "function") {
        window.CmFilterSelect.refresh(statusSel);
      }
    }
    state.page = 1;
    clearCaseSelection();
    return loadCases();
  }

  function hasExtraCaseFilters(filters) {
    var f = filters || currentCaseFilters();
    return !!(f.q || f.priority || f.status);
  }

  function isConcreteSuite() {
    return !!(state.suiteFilter && String(state.suiteFilter).indexOf("__") !== 0);
  }

  function suiteHasChildren(suiteId) {
    var id = String(suiteId || "");
    if (!id) return false;
    return (state.suites || []).some(function (s) {
      return String(s.parent_id || "") === id;
    });
  }

  function isAggregatingSuiteView() {
    return isConcreteSuite() && suiteHasChildren(state.suiteFilter);
  }

  function pageFullySelected() {
    if (!state.cases.length) return false;
    return state.cases.every(function (c) {
      return !!(state.suiteSelectAll || state.selectedIds[c.id]);
    });
  }

  function isPageSelectMode() {
    return (
      !state.suiteSelectAll &&
      state.cases.length > 0 &&
      pageFullySelected() &&
      Object.keys(state.selectedIds).length === state.cases.length
    );
  }

  function clearCaseSelection() {
    state.selectedIds = {};
    state.suiteSelectAll = false;
    syncBatchActionUi();
  }

  function selectedCount() {
    if (state.suiteSelectAll) return state.total || 0;
    return Object.keys(state.selectedIds).length;
  }

  function selectCurrentPage() {
    state.suiteSelectAll = false;
    state.selectedIds = {};
    state.cases.forEach(function (c) {
      state.selectedIds[c.id] = true;
    });
  }

  /** 选择当前列表筛选下的全部用例（目录或全部用例视图一致） */
  function selectAllInView() {
    state.suiteSelectAll = true;
    state.selectedIds = {};
  }

  /** 表头全选三态：本页 → 全部 → 取消（全部用例 / 具体目录一致） */
  function cycleHeadSelection() {
    if (!state.cases.length) return;
    if (state.suiteSelectAll) {
      clearCaseSelection();
      renderCases();
      return;
    }
    if (isPageSelectMode()) {
      selectAllInView();
      renderCases();
      return;
    }
    selectCurrentPage();
    renderCases();
  }

  function syncBatchActionUi() {
    var batchMenu = $("cm-top-menu-batch");
    var btnBatch = $("cm-btn-batch-menu");
    var btnDel = $("cm-btn-batch-delete");
    var btnExec = $("cm-btn-batch-exec");
    var btnStatus = $("cm-btn-batch-status");
    var btnMove = $("cm-btn-batch-move");
    var btnCopy = $("cm-btn-batch-copy");
    var bar = $("cm-select-bar");
    var textEl = $("cm-select-bar-text");
    var actionsEl = $("cm-select-bar-actions");
    var onSuite = isConcreteSuite();
    var n = selectedCount();
    var total = state.total || 0;
    var allLabel = onSuite
      ? (isAggregatingSuiteView() ? "本目录及子目录全部" : "本目录全部")
      : "全部用例";

    var canEdit = !isViewerOnly();
    var showBatch = canEdit && n > 0;
    if (batchMenu) {
      batchMenu.classList.toggle("is-hidden", !showBatch);
      if (!showBatch && batchMenu.classList.contains("is-open")) {
        batchMenu.classList.remove("is-open");
        var panel = batchMenu.querySelector(".cm-top-menu__panel");
        if (panel) panel.hidden = true;
        if (btnBatch) btnBatch.setAttribute("aria-expanded", "false");
      }
    }
    if (btnBatch) {
      btnBatch.disabled = !showBatch;
      btnBatch.title = showBatch
        ? "对已选 " + n + " 条用例批量处理"
        : "请先勾选用例";
    }
    [
      [btnExec, n > 0 ? "登记已选 " + n + " 条的执行结果" : "请先勾选用例"],
      [btnStatus, n > 0 ? "修改已选 " + n + " 条的状态" : "请先勾选用例"],
      [btnMove, n > 0 ? "移动已选 " + n + " 条" : "请先勾选用例"],
      [btnCopy, n > 0 ? "复制已选 " + n + " 条" : "请先勾选用例"],
      [btnDel, n > 0 ? "移入回收站 " + n + " 条" : "请先勾选用例"],
    ].forEach(function (pair) {
      var el = pair[0];
      if (!el) return;
      el.disabled = !showBatch;
      el.title = pair[1];
    });

    if (!bar || !textEl || !actionsEl) return;

    if (n <= 0) {
      bar.classList.add("is-hidden");
      textEl.textContent = "";
      actionsEl.innerHTML = "";
      return;
    }

    bar.classList.remove("is-hidden");
    actionsEl.innerHTML = "";

    if (state.suiteSelectAll) {
      textEl.textContent =
        "已选" + allLabel + " " + total + " 条（再点表头勾选可取消）";
    } else if (isPageSelectMode()) {
      textEl.textContent =
        "已选本页 " + n + " 条（再点表头勾选可选" + allLabel + " " + total + " 条）";
    } else {
      textEl.textContent = "已选 " + n + " 条";
    }

    if (!state.suiteSelectAll && total > n) {
      var upgrade = document.createElement("button");
      upgrade.type = "button";
      upgrade.className = "cm-select-bar__link";
      upgrade.textContent = "选择" + allLabel + " " + total + " 条";
      upgrade.addEventListener("click", function () {
        selectAllInView();
        renderCases();
      });
      actionsEl.appendChild(upgrade);
    }
    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "cm-select-bar__link cm-select-bar__link--muted";
    clearBtn.textContent = "取消选择";
    clearBtn.addEventListener("click", function () {
      clearCaseSelection();
      renderCases();
    });
    actionsEl.appendChild(clearBtn);
  }

  function toggleCaseSelected(id, checked) {
    if (state.suiteSelectAll) {
      state.suiteSelectAll = false;
      state.selectedIds = {};
      state.cases.forEach(function (c) {
        state.selectedIds[c.id] = true;
      });
    }
    if (checked) state.selectedIds[id] = true;
    else delete state.selectedIds[id];
    syncBatchActionUi();
  }

  function buildSelectionScopeBody() {
    var onSuite = isConcreteSuite();
    if (state.suiteSelectAll) {
      var filters = currentCaseFilters();
      if (onSuite && !hasExtraCaseFilters(filters)) {
        return { scope: "suite", suite_id: state.suiteFilter };
      }
      return {
        scope: "filtered",
        suite_id: filters.suite_id,
        q: filters.q,
        priority: filters.priority,
        status: filters.status,
      };
    }
    return {
      scope: "ids",
      case_ids: Object.keys(state.selectedIds),
    };
  }

  /** 解析勾选范围为 id 列表（移动/复制单次上限 200） */
  function resolveSelectedCaseIds(limit) {
    var lim = Math.max(1, Math.min(Number(limit) || 200, 5000));
    var body = buildSelectionScopeBody();
    if (body.scope === "ids") {
      var ids = body.case_ids || [];
      var truncated = ids.length > lim;
      return Promise.resolve({
        case_ids: truncated ? ids.slice(0, lim) : ids,
        truncated: truncated,
      });
    }
    return api("/api/case-management/projects/" + state.projectId + "/cases/resolve-ids", {
      method: "POST",
      body: JSON.stringify(Object.assign({}, body, { limit: lim })),
    }).then(function (data) {
      return {
        case_ids: data.case_ids || [],
        truncated: !!data.truncated,
      };
    });
  }

  function setExecResultChips(chipsId, hiddenId, result) {
    var value = String(result || "pass");
    var hidden = $(hiddenId);
    if (hidden) hidden.value = value;
    var chips = $(chipsId);
    if (!chips) return;
    chips.querySelectorAll(".cm-exec-chip").forEach(function (btn) {
      var on = btn.getAttribute("data-result") === value;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function setBatchExecResult(result) {
    setExecResultChips("cm-exec-run-chips", "cm-exec-run-result", result);
  }

  function setDrawerExecResult(result) {
    setExecResultChips("cm-exec-chips", "cm-exec-result", result);
  }

  function execResultLabel(result) {
    var map = { pass: "通过", fail: "失败", blocked: "阻塞", skip: "跳过" };
    var key = String(result || "").toLowerCase();
    return map[key] || key || "—";
  }

  function setBatchExecBusy(busy) {
    var ids = ["cm-exec-run-submit", "cm-exec-run-cancel", "cm-exec-run-close", "cm-exec-run-comment"];
    ids.forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !!busy;
    });
    var chips = $("cm-exec-run-chips");
    if (chips) {
      chips.querySelectorAll(".cm-exec-chip").forEach(function (btn) {
        btn.disabled = !!busy;
      });
    }
    var submit = $("cm-exec-run-submit");
    if (submit) submit.textContent = busy ? "记录中…" : "确认记录";
  }

  function closeBatchExecPanel() {
    var mask = $("cm-exec-run-mask");
    if (mask) mask.classList.add("is-hidden");
    state.batchExec = null;
    setBatchExecBusy(false);
  }

  function openBatchExecPanel(caseIds, truncated) {
    state.batchExec = { caseIds: caseIds || [], busy: false };
    var countEl = $("cm-exec-run-count");
    if (countEl) countEl.textContent = String(caseIds.length);
    var summary = $("cm-exec-run-summary");
    if (summary) {
      summary.textContent = truncated
        ? "已超过上限，仅对前 " + caseIds.length + " 条统一写入结果"
        : "统一写入同一执行结果";
    }
    setBatchExecResult("pass");
    var commentEl = $("cm-exec-run-comment");
    if (commentEl) commentEl.value = "";
    var mask = $("cm-exec-run-mask");
    if (mask) mask.classList.remove("is-hidden");
    setBatchExecBusy(false);
  }

  function submitBatchExecAll() {
    var sess = state.batchExec;
    if (!sess || !sess.caseIds || !sess.caseIds.length || sess.busy) return;
    var result = ($("cm-exec-run-result") && $("cm-exec-run-result").value) || "pass";
    var comment = ($("cm-exec-run-comment") && $("cm-exec-run-comment").value) || "";
    var ids = sess.caseIds.slice();
    sess.busy = true;
    setBatchExecBusy(true);

    var recorded = 0;
    var failed = 0;
    var i = 0;

    function next() {
      if (i >= ids.length) {
        closeBatchExecPanel();
        if (failed > 0) {
          toast("已记录 " + recorded + " 条，失败 " + failed + " 条", "error");
        } else {
          toast("已为 " + recorded + " 条用例记录执行结果", "success");
        }
        return;
      }
      var caseId = ids[i];
      i += 1;
      api("/api/case-management/cases/" + caseId + "/executions", {
        method: "POST",
        body: JSON.stringify({ result: result, comment: comment }),
      })
        .then(function () {
          recorded += 1;
          next();
        })
        .catch(function () {
          failed += 1;
          next();
        });
    }

    next();
  }

  function runBatchExecute() {
    if (isViewerOnly()) return toast("只读成员无法执行用例", "error");
    var n = selectedCount();
    if (!state.projectId || n <= 0) {
      return toast("请先勾选要执行的用例", "error");
    }
    if (state.batchExec) {
      return toast("请先关闭当前执行弹窗", "error");
    }
    var body = buildSelectionScopeBody();
    var btn = $("cm-btn-batch-exec");
    if (btn) btn.disabled = true;
    api("/api/case-management/projects/" + state.projectId + "/cases/resolve-ids", {
      method: "POST",
      body: JSON.stringify(body),
    })
      .then(function (data) {
        var ids = (data && data.case_ids) || [];
        if (!ids.length) {
          throw new Error("未找到可执行的用例");
        }
        openBatchExecPanel(ids, !!data.truncated);
      })
      .catch(function (err) {
        toast(err.message || "解析用例失败", "error");
      })
      .then(function () {
        syncBatchActionUi();
      });
  }

  function runBatchDelete() {
    if (isViewerOnly()) return toast("只读成员无法删除用例", "error");
    var onSuite = isConcreteSuite();
    var n = selectedCount();
    if (!state.projectId || n <= 0) {
      return toast("请先勾选要删除的用例", "error");
    }
    var willClearSuite = false;
    if (state.suiteSelectAll && onSuite) {
      willClearSuite = true;
    } else if (onSuite && n >= (state.total || 0)) {
      willClearSuite = true;
    }
    var msg =
      "将把已选的 " +
      n +
      " 条用例移入回收站（可恢复）。执行记录会保留。";
    if (willClearSuite) {
      msg += "移入后本目录若无活跃用例，已锁定列头会清空，下次导入需重新确认表头。";
    } else if (state.suiteSelectAll && !onSuite) {
      msg += "将处理当前列表筛选下的全部用例。";
    }
    cmConfirm({
      title: "移入回收站",
      message: msg,
      confirmText: "移入回收站",
      danger: true,
    }).then(function (ok) {
      if (!ok) return;
      var body = Object.assign({ mode: "trash" }, buildSelectionScopeBody());
      api("/api/case-management/projects/" + state.projectId + "/cases/batch-delete", {
        method: "POST",
        body: JSON.stringify(body),
      })
        .then(function (data) {
          var tip = "已移入回收站 " + (data.deleted || data.trashed || 0) + " 条";
          if (data.schema_reset) tip += "，目录列头已重置";
          toast(tip, "success");
          clearCaseSelection();
          state.page = 1;
          return loadActiveSchema().then(loadCases);
        })
        .catch(function (err) {
          toast(err.message, "error");
        });
    });
  }

  function statusLabelZh(st) {
    var map = { draft: "草稿", ready: "就绪", deprecated: "废弃" };
    return map[st] || st || "-";
  }

  function runBatchStatus() {
    if (isViewerOnly()) return toast("只读成员无法修改状态", "error");
    var n = selectedCount();
    if (!state.projectId || n <= 0) {
      return toast("请先勾选要修改的用例", "error");
    }
    cmChoose({
      title: "批量改状态",
      message: "将把已选的 " + n + " 条用例改为所选状态。",
      label: "目标状态",
      confirmText: "更新",
      options: [
        { value: "draft", label: "草稿" },
        { value: "ready", label: "就绪" },
        { value: "deprecated", label: "废弃" },
      ],
      defaultValue: "ready",
    }).then(function (target) {
      if (!target) return;
      var scope = buildSelectionScopeBody();
      var body = {
        status: target,
        scope: scope.scope,
        case_ids: scope.case_ids,
        suite_id: scope.suite_id,
        q: scope.q || "",
        priority: scope.priority || "",
        filter_status: scope.status || "",
      };
      return api("/api/case-management/projects/" + state.projectId + "/cases/batch-status", {
        method: "POST",
        body: JSON.stringify(body),
      }).then(function (data) {
        toast(
          "已将 " + (data.updated || 0) + " 条改为「" + statusLabelZh(target) + "」",
          "success"
        );
        clearCaseSelection();
        return loadCases();
      });
    }).catch(function (err) {
      toast(err.message || "更新失败", "error");
    });
  }

  function fillTargetSuiteSelect() {
    var sel = $("cm-target-suite-select");
    if (!sel) return;
    sel.innerHTML = "";
    var empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "请选择目录";
    sel.appendChild(empty);
    walkSuitesDepthFirst(function (s) {
      var opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = suitePathLabel(s.id);
      sel.appendChild(opt);
    });
    var preferred =
      state.suiteFilter && String(state.suiteFilter).indexOf("__") !== 0
        ? state.suiteFilter
        : "";
    if (preferred && (state.suites || []).some(function (s) { return s.id === preferred; })) {
      sel.value = preferred;
    }
    var ok = $("cm-target-suite-ok");
    if (ok) ok.disabled = !sel.value;
    if (window.CmFilterSelect && typeof window.CmFilterSelect.refresh === "function") {
      window.CmFilterSelect.refresh(sel);
    }
  }

  function openTargetSuitePicker(action) {
    if (!state.projectId) return toast("请先选择项目", "error");
    if (!(state.suites || []).length) return toast("请先创建目录", "error");
    if (selectedCount() <= 0) return toast("请先勾选用例", "error");
    state.targetSuiteAction = action === "copy" ? "copy" : "move";
    var title = $("cm-target-suite-title");
    var hint = $("cm-target-suite-hint");
    if (title) title.textContent = state.targetSuiteAction === "copy" ? "复制到目录" : "移动到目录";
    if (hint) {
      hint.textContent =
        state.targetSuiteAction === "copy"
          ? "将在目标目录创建副本（标题加「副本」后缀）。单次最多 200 条。"
          : "将用例挪到目标目录。单次最多 200 条。";
    }
    fillTargetSuiteSelect();
    $("cm-target-suite-mask").classList.remove("is-hidden");
  }

  function closeTargetSuitePicker() {
    state.targetSuiteAction = "";
    var mask = $("cm-target-suite-mask");
    if (mask) mask.classList.add("is-hidden");
  }

  function confirmTargetSuitePicker() {
    var sel = $("cm-target-suite-select");
    var tid = sel && sel.value;
    if (!tid) return toast("请选择目标目录", "error");
    var action = state.targetSuiteAction;
    if (action !== "move" && action !== "copy") return;
    var okBtn = $("cm-target-suite-ok");
    if (okBtn) okBtn.disabled = true;
    resolveSelectedCaseIds(200)
      .then(function (resolved) {
        var ids = resolved.case_ids || [];
        if (!ids.length) throw new Error("未找到可处理的用例");
        if (resolved.truncated) {
          toast("已超过 200 条上限，仅处理前 200 条", "info");
        }
        var url =
          "/api/case-management/projects/" +
          state.projectId +
          "/cases/" +
          (action === "copy" ? "copy" : "move");
        return api(url, {
          method: "POST",
          body: JSON.stringify({ case_ids: ids, target_suite_id: tid }),
        });
      })
      .then(function (data) {
        closeTargetSuitePicker();
        if (action === "copy") {
          toast("已复制 " + (data.created || 0) + " 条", "success");
        } else {
          var tip = "已移动 " + (data.moved || 0) + " 条";
          if (data.skipped) tip += "，跳过 " + data.skipped;
          if (data.schema_reset_suite_ids && data.schema_reset_suite_ids.length) {
            tip += "，源目录列头已重置";
          }
          toast(tip, "success");
        }
        clearCaseSelection();
        state.page = 1;
        return loadActiveSchema().then(loadCases);
      })
      .catch(function (err) {
        toast(err.message || "操作失败", "error");
      })
      .then(function () {
        if (okBtn) okBtn.disabled = !(($("cm-target-suite-select") || {}).value);
      });
  }

  function syncTrashActionUi() {
    var n = trashSelectedCount();
    var btnR = $("cm-trash-restore");
    var btnP = $("cm-trash-purge");
    var canEdit = !isViewerOnly();
    var showPurge = canEdit && !!state.trashAllowPurge;
    if (btnR) {
      btnR.classList.toggle("is-hidden", !canEdit);
      btnR.disabled = n <= 0;
    }
    if (btnP) {
      btnP.classList.toggle("is-hidden", !showPurge);
      btnP.disabled = n <= 0 || !showPurge;
    }
    syncTrashHeadCheck();
    var info = $("cm-trash-page-info");
    if (info) {
      var pages = Math.max(1, Math.ceil((state.trashTotal || 0) / 20));
      var base = state.trashPage + "/" + pages + " 页 · 共 " + (state.trashTotal || 0) + " 条";
      if (state.trashSelectAll) {
        info.textContent = base + " · 已选全部";
      } else if (n > 0) {
        info.textContent = base + " · 已选 " + n;
      } else {
        info.textContent = base;
      }
    }
  }

  function trashSelectedCount() {
    if (state.trashSelectAll) return state.trashTotal || 0;
    return Object.keys(state.trashSelected || {}).length;
  }

  function clearTrashSelection() {
    state.trashSelectAll = false;
    state.trashSelected = {};
  }

  function selectTrashCurrentPage() {
    state.trashSelectAll = false;
    state.trashSelected = {};
    (state.trashItems || []).forEach(function (it) {
      if (it && it.id) state.trashSelected[it.id] = true;
    });
  }

  function selectTrashAllPages() {
    state.trashSelectAll = true;
    state.trashSelected = {};
  }

  function isTrashPageSelectMode() {
    var items = state.trashItems || [];
    if (!items.length || state.trashSelectAll) return false;
    return items.every(function (it) {
      return !!(it && it.id && state.trashSelected[it.id]);
    });
  }

  function cycleTrashHeadSelection() {
    if (!(state.trashItems || []).length && !state.trashSelectAll) return;
    if (state.trashSelectAll) {
      clearTrashSelection();
    } else if (isTrashPageSelectMode()) {
      selectTrashAllPages();
    } else {
      selectTrashCurrentPage();
    }
    renderTrash();
  }

  function syncTrashHeadCheck() {
    var headCb = $("cm-trash-check-head");
    var headWrap = $("cm-trash-check-head-wrap") || (headCb && headCb.closest(".cm-check-wrap"));
    if (!headCb) return;
    var pageIds = (state.trashItems || []).map(function (it) {
      return it.id;
    }).filter(Boolean);
    var checked = 0;
    pageIds.forEach(function (id) {
      if (state.trashSelectAll || state.trashSelected[id]) checked += 1;
    });
    if (state.trashSelectAll) {
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

  function bindTrashHeadCheck() {
    var headCb = $("cm-trash-check-head");
    if (!headCb || headCb._cmTrashBound) return;
    headCb._cmTrashBound = true;
    headCb.addEventListener("click", function (e) {
      e.preventDefault();
      cycleTrashHeadSelection();
    });
  }

  function toggleTrashItemSelected(id, checked) {
    if (state.trashSelectAll) {
      state.trashSelectAll = false;
      state.trashSelected = {};
      (state.trashItems || []).forEach(function (it) {
        if (it && it.id) state.trashSelected[it.id] = true;
      });
    }
    if (checked) state.trashSelected[id] = true;
    else delete state.trashSelected[id];
  }

  function fetchAllTrashCaseIds() {
    var scope = trashScopeUserId();
    var pageSize = 100;
    var page = 1;
    var all = [];
    var total = state.trashTotal || 0;

    function next() {
      var qs = "?page=" + page + "&page_size=" + pageSize;
      if (scope) qs += "&for_user_id=" + encodeURIComponent(scope);
      return api("/api/case-management/projects/" + state.projectId + "/cases/trash" + qs).then(
        function (data) {
          var items = data.items || [];
          items.forEach(function (it) {
            if (it && it.id) all.push(it.id);
          });
          total = data.total || total;
          if (all.length >= total || !items.length) return all;
          page += 1;
          if (page > 200) return all;
          return next();
        }
      );
    }
    return next();
  }

  function resolveTrashActionIds() {
    if (state.trashSelectAll) return fetchAllTrashCaseIds();
    return Promise.resolve(Object.keys(state.trashSelected || {}));
  }

  function trashScopeUserId() {
    return state.trashForUserId || state.userId || "";
  }

  function syncTrashMemberSelect() {
    var wrap = $("cm-trash-member-wrap");
    var sel = $("cm-trash-member-select");
    if (!wrap || !sel) return;
    var canBrowse = !!state.trashCanBrowseMembers && isProjectOwner();
    var members = state.members || [];
    var show = canBrowse && members.length > 1;
    wrap.classList.toggle("is-hidden", !show);
    if (!show) return;
    var current = trashScopeUserId();
    var nextIds = members.map(function (m) { return String(m.user_id || ""); }).join(",");
    var sameOptions = sel.getAttribute("data-cm-member-ids") === nextIds && sel.options.length === members.length;
    if (!sameOptions) {
      sel.innerHTML = "";
      members.forEach(function (m) {
        var o = document.createElement("option");
        o.value = m.user_id;
        var name = m.label || m.display_name || m.email || m.phone_masked || m.user_id;
        o.textContent = m.user_id === state.userId ? name + "（我）" : name;
        sel.appendChild(o);
      });
      sel.setAttribute("data-cm-member-ids", nextIds);
    }
    if (current && !Array.prototype.some.call(sel.options, function (o) { return o.value === current; })) {
      var mine = document.createElement("option");
      mine.value = current;
      mine.textContent = "我的回收站";
      sel.insertBefore(mine, sel.firstChild);
    }
    if (current) sel.value = current;
  }

  function loadTrash() {
    if (!state.projectId) return Promise.resolve();
    var scope = trashScopeUserId();
    var qs =
      "?page=" +
      state.trashPage +
      "&page_size=20";
    if (scope) qs += "&for_user_id=" + encodeURIComponent(scope);
    return api("/api/case-management/projects/" + state.projectId + "/cases/trash" + qs).then(
      function (data) {
        state.trashItems = data.items || [];
        state.trashTotal = data.total || 0;
        state.trashRetentionDays = data.retention_days || 30;
        state.trashCanBrowseMembers = !!data.can_browse_members;
        state.trashAllowPurge = !!data.allow_purge;
        if (data.scope_user_id) state.trashForUserId = data.scope_user_id;
        var hint = $("cm-trash-hint");
        if (hint) {
          var days = state.trashRetentionDays || 30;
          var base = "个人隔离 · 可恢复 · 保留 " + days + " 天后自动清理";
          if (data.has_team && !data.allow_purge) {
            hint.textContent = base + " · 彻底删除仅负责人可用";
          } else if (data.has_team && data.allow_purge) {
            hint.textContent = base + " · 负责人可彻底删除";
          } else if (state.trashCanBrowseMembers) {
            hint.textContent = base + " · 可切换查看成员回收站";
          } else {
            hint.textContent = base;
          }
        }
        syncTrashMemberSelect();
        renderTrash();
      }
    );
  }

  function renderTrash() {
    var tbody = $("cm-trash-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!state.trashItems.length) {
      var tr0 = document.createElement("tr");
      var td0 = document.createElement("td");
      td0.colSpan = 5;
      td0.className = "cm-trash-empty";
      td0.textContent = "回收站为空";
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
    } else {
      state.trashItems.forEach(function (it) {
        var tr = document.createElement("tr");
        var tdCheck = document.createElement("td");
        tdCheck.className = "cm-td-check";
        var wrap = document.createElement("label");
        wrap.className = "cm-check-wrap";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "cm-check";
        cb.checked = !!(state.trashSelectAll || state.trashSelected[it.id]);
        cb.onchange = function () {
          toggleTrashItemSelected(it.id, cb.checked);
          syncTrashActionUi();
        };
        var box = document.createElement("span");
        box.className = "cm-check-wrap__box";
        wrap.appendChild(cb);
        wrap.appendChild(box);
        tdCheck.appendChild(wrap);
        tr.appendChild(tdCheck);
        var tdTitle = document.createElement("td");
        tdTitle.textContent = it.title || "";
        tdTitle.title = it.title || "";
        tr.appendChild(tdTitle);
        var tdSuite = document.createElement("td");
        tdSuite.textContent = it.suite_name || "—";
        tr.appendChild(tdSuite);
        var tdAt = document.createElement("td");
        tdAt.textContent = String(it.deleted_at || "").replace("T", " ").slice(0, 19);
        tr.appendChild(tdAt);
        var tdLeft = document.createElement("td");
        var pill = document.createElement("span");
        if (it.days_left == null) {
          pill.className = "cm-trash-days__pill cm-trash-days__pill--muted";
          pill.textContent = "—";
        } else if (Number(it.days_left) <= 0) {
          pill.className = "cm-trash-days__pill cm-trash-days__pill--due";
          pill.textContent = "即将清理";
        } else {
          pill.className = "cm-trash-days__pill";
          pill.textContent = String(it.days_left) + " 天";
        }
        tdLeft.appendChild(pill);
        tr.appendChild(tdLeft);
        tbody.appendChild(tr);
      });
    }
    bindTrashHeadCheck();
    syncTrashActionUi();
  }

  function openTrash() {
    if (!state.projectId) return toast("请先选择项目", "error");
    state.trashPage = 1;
    clearTrashSelection();
    state.trashForUserId = state.userId || "";
    state.trashAllowPurge = true;
    /* 先减负页面合成，再显示弹层，数据放到首帧绘制之后再拉 */
    document.body.classList.add("cm-overlay-open");
    $("cm-trash-mask").classList.remove("is-hidden");
    syncTrashActionUi();

    function runAfterPaint(fn) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(fn);
      });
    }

    runAfterPaint(function () {
      var boot = Promise.resolve();
      if (isProjectOwner()) {
        if (!(state.members && state.members.length)) {
          boot = loadMembers().catch(function () {
            /* 成员列表失败时仍可看自己的回收站 */
          });
        }
      } else {
        var wrap = $("cm-trash-member-wrap");
        if (wrap) wrap.classList.add("is-hidden");
        state.trashCanBrowseMembers = false;
      }
      boot
        .then(function () {
          return loadTrash();
        })
        .catch(function (err) {
          toast(err.message || "加载回收站失败", "error");
        });
    });
  }

  function closeTrash() {
    var mask = $("cm-trash-mask");
    if (mask) mask.classList.add("is-hidden");
    clearTrashSelection();
    window.requestAnimationFrame(function () {
      if ($("cm-trash-mask") && !$("cm-trash-mask").classList.contains("is-hidden")) return;
      document.body.classList.remove("cm-overlay-open");
    });
  }

  function openMembersModal() {
    if (!state.projectId) return toast("请先选择项目", "error");
    state.memberPickUserId = "";
    state.memberPickLabel = "";
    state.memberPickMeta = "";
    state.memberSearchHits = [];
    var q = $("cm-members-q");
    if (q) q.value = "";
    var list = $("cm-members-search-list");
    if (list) {
      list.innerHTML = "";
      list.classList.add("is-empty");
    }
    syncMembersPickedUi();
    syncCollabUi();
    $("cm-members-mask").classList.remove("is-hidden");
    loadMembers().catch(function (err) {
      toast(err.message || "加载成员失败", "error");
    });
  }

  function closeMembersModal() {
    var mask = $("cm-members-mask");
    if (mask) mask.classList.add("is-hidden");
    state.memberPickUserId = "";
    state.memberPickLabel = "";
    state.memberPickMeta = "";
  }

  function syncMembersPickedUi() {
    var result = $("cm-members-invite-result");
    var nameEl = $("cm-members-picked-name");
    var metaEl = $("cm-members-picked-meta");
    var btn = $("cm-members-invite-btn");
    var has = !!state.memberPickUserId;
    if (result) result.classList.toggle("is-hidden", !has);
    if (nameEl) nameEl.textContent = state.memberPickLabel || "";
    if (metaEl) metaEl.textContent = state.memberPickMeta || "";
    if (btn) btn.disabled = !has || !isProjectOwner();
    if (has && window.CmFilterSelect) {
      window.CmFilterSelect.refresh($("cm-members-role"));
    }
  }

  function loadMembers() {
    return api("/api/case-management/projects/" + state.projectId + "/members").then(
      function (data) {
        state.members = data.items || [];
        state.pendingInvites = data.pending_invites || [];
        if (data.my_role) state.myRole = data.my_role;
        if (data.primary_owner_id) {
          var proj = currentProject();
          if (proj) {
            proj.user_id = data.primary_owner_id;
            proj.my_role = state.myRole;
          }
        }
        renderMembers();
        syncCollabUi();
        syncMembersPickedUi();
        syncTransferOwnerBtn();
      }
    );
  }

  function syncTransferOwnerBtn() {
    var btn = $("cm-members-transfer-owner");
    if (!btn) return;
    var proj = currentProject();
    var isPrimary =
      !!proj &&
      !!state.userId &&
      String(proj.user_id || "") === String(state.userId);
    var hasCandidate = (state.members || []).some(function (m) {
      return m.user_id && m.user_id !== state.userId;
    });
    btn.classList.toggle("is-hidden", !(isPrimary && hasCandidate));
  }

  function roleLabel(role) {
    var map = { owner: "负责人", editor: "编辑", viewer: "只读" };
    return map[role] || role || "—";
  }

  function renderMembers() {
    var tbody = $("cm-members-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    var countEl = $("cm-members-count");
    var pending = state.pendingInvites || [];
    var members = state.members || [];
    if (countEl) {
      countEl.textContent =
        members.length +
        " 人" +
        (pending.length ? " · 待确认 " + pending.length : "");
    }
    var canManage = isProjectOwner();
    var primaryId =
      (currentProject() && currentProject().user_id) ||
      "";
    if (!members.length && !pending.length) {
      var tr0 = document.createElement("tr");
      var td0 = document.createElement("td");
      td0.colSpan = 3;
      td0.className = "cm-empty";
      td0.textContent = "暂无成员";
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    members.forEach(function (m) {
      var tr = document.createElement("tr");
      var tdName = document.createElement("td");
      tdName.textContent =
        m.label || m.display_name || m.email || m.phone_masked || m.user_id;
      if (m.user_id === primaryId) tdName.textContent += "（负责人）";
      tr.appendChild(tdName);
      var tdRole = document.createElement("td");
      if (canManage && m.user_id !== primaryId) {
        var sel = document.createElement("select");
        sel.className = "cm-select cm-filter-select cm-members-role-select";
        sel.setAttribute("data-cm-filter", "role");
        sel.setAttribute("aria-label", "修改角色");
        var roleOpts = [
          { value: "editor", label: "编辑" },
          { value: "viewer", label: "只读" },
        ];
        roleOpts.forEach(function (r) {
          var o = document.createElement("option");
          o.value = r.value;
          o.textContent = r.label;
          o.setAttribute("data-label", r.label);
          if (r.value === m.role) o.selected = true;
          sel.appendChild(o);
        });
        if (m.role === "owner") {
          var oo = document.createElement("option");
          oo.value = "owner";
          oo.textContent = "负责人";
          oo.selected = true;
          oo.disabled = true;
          sel.appendChild(oo);
        }
        sel.addEventListener("change", function () {
          api(
            "/api/case-management/projects/" +
              state.projectId +
              "/members/" +
              encodeURIComponent(m.user_id),
            { method: "PATCH", body: JSON.stringify({ role: sel.value }) }
          )
            .then(function () {
              toast("角色已更新", "success");
              return loadMembers();
            })
            .catch(function (err) {
              toast(err.message, "error");
              loadMembers();
            });
        });
        tdRole.appendChild(sel);
        if (window.CmFilterSelect) window.CmFilterSelect.enhance(sel);
      } else {
        var badge = document.createElement("span");
        badge.className =
          "cm-members-role-badge cm-members-role-badge--" + (m.role || "viewer");
        badge.textContent = roleLabel(m.role);
        tdRole.appendChild(badge);
      }
      tr.appendChild(tdRole);
      var tdAct = document.createElement("td");
      if (canManage && m.user_id !== primaryId) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cm-btn cm-btn--danger cm-btn--sm";
        btn.textContent = "移除";
        btn.addEventListener("click", function () {
          cmConfirm({
            title: "移除成员",
            message: "确定移除「" + (m.label || "") + "」？",
            confirmText: "移除",
            danger: true,
          }).then(function (ok) {
            if (!ok) return;
            api(
              "/api/case-management/projects/" +
                state.projectId +
                "/members/" +
                encodeURIComponent(m.user_id),
              { method: "DELETE" }
            )
              .then(function () {
                toast("已移除", "success");
                return loadMembers();
              })
              .catch(function (err) {
                toast(err.message, "error");
              });
          });
        });
        tdAct.appendChild(btn);
      } else {
        tdAct.textContent = "—";
      }
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });

    pending.forEach(function (inv) {
      var tr = document.createElement("tr");
      tr.className = "cm-members-row--pending";
      var tdName = document.createElement("td");
      var label =
        (inv.invitee && inv.invitee.label) ||
        inv.label ||
        inv.invitee_user_id ||
        "用户";
      tdName.textContent = label;
      tr.appendChild(tdName);
      var tdRole = document.createElement("td");
      var pendBadge = document.createElement("span");
      pendBadge.className = "cm-members-role-badge cm-members-role-badge--pending";
      pendBadge.textContent =
        "等待确认 · " + (inv.role_label || roleLabel(inv.role));
      tdRole.appendChild(pendBadge);
      tr.appendChild(tdRole);
      var tdAct = document.createElement("td");
      if (canManage) {
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "cm-btn cm-btn--ghost cm-btn--sm";
        cancelBtn.textContent = "取消邀请";
        cancelBtn.addEventListener("click", function () {
          cmConfirm({
            title: "取消邀请",
            message: "确定取消对「" + label + "」的邀请？",
            confirmText: "取消邀请",
            danger: false,
          }).then(function (ok) {
            if (!ok) return;
            api(
              "/api/case-management/projects/" +
                state.projectId +
                "/invites/" +
                encodeURIComponent(inv.id),
              { method: "DELETE" }
            )
              .then(function () {
                toast("已取消邀请", "success");
                return loadMembers();
              })
              .catch(function (err) {
                toast(err.message, "error");
              });
          });
        });
        tdAct.appendChild(cancelBtn);
      } else {
        tdAct.textContent = "—";
      }
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  function searchMembersUsers() {
    var q = (($("cm-members-q") && $("cm-members-q").value) || "").trim();
    var box = $("cm-members-search-list");
    if (!box) return;
    state.memberPickUserId = "";
    state.memberPickLabel = "";
    state.memberPickMeta = "";
    syncMembersPickedUi();
    if (!q) {
      box.innerHTML = '<p class="cm-members-search-empty">请输入完整邮箱或手机号后搜索</p>';
      box.classList.add("is-empty");
      state.memberSearchHits = [];
      return;
    }
    var looksEmail = q.indexOf("@") >= 0;
    var phoneRaw = q.replace(/[\s-]/g, "");
    if (phoneRaw.indexOf("+86") === 0) phoneRaw = phoneRaw.slice(3);
    else if (phoneRaw.indexOf("86") === 0 && phoneRaw.length === 13) phoneRaw = phoneRaw.slice(2);
    var looksPhone = /^1[3-9]\d{9}$/.test(phoneRaw);
    if (!looksEmail && !looksPhone) {
      box.innerHTML = '<p class="cm-members-search-empty">仅支持完整邮箱或 11 位手机号</p>';
      box.classList.add("is-empty");
      state.memberSearchHits = [];
      toast("请输入完整邮箱或有效手机号", "error");
      return;
    }
    box.innerHTML = '<p class="cm-members-search-empty">搜索中…</p>';
    box.classList.remove("is-empty");
    api("/api/case-management/users/search?q=" + encodeURIComponent(q))
      .then(function (data) {
        state.memberSearchHits = data.items || [];
        box.innerHTML = "";
        if (!state.memberSearchHits.length) {
          box.innerHTML = '<p class="cm-members-search-empty">未找到该邮箱或手机号对应的用户</p>';
          box.classList.add("is-empty");
          syncMembersPickedUi();
          return;
        }
        // 精确匹配：结果行内展示用户 + 角色 + 邀请（不再单独占一行角色区）
        box.classList.add("is-empty");
        var first = state.memberSearchHits[0];
        state.memberPickUserId = first.id;
        state.memberPickLabel =
          first.label || first.email || first.phone_masked || first.id;
        state.memberPickMeta = first.email || first.phone_masked || "";
        syncMembersPickedUi();
      })
      .catch(function (err) {
        var tip = document.createElement("p");
        tip.className = "cm-members-search-empty";
        tip.textContent = (err && err.message) || "搜索失败";
        box.innerHTML = "";
        box.appendChild(tip);
        box.classList.add("is-empty");
        state.memberPickUserId = "";
        state.memberPickLabel = "";
        state.memberPickMeta = "";
        syncMembersPickedUi();
        toast(err.message || "搜索失败", "error");
      });
  }

  function inviteSelectedMember() {
    if (!isProjectOwner()) return toast("仅负责人可邀请成员", "error");
    if (!state.memberPickUserId) return toast("请先搜索并选择用户", "error");
    var role = (($("cm-members-role") && $("cm-members-role").value) || "editor").trim();
    if (role === "owner") {
      return toast("请使用「转移管理员」变更负责人", "error");
    }
    var btn = $("cm-members-invite-btn");
    if (btn) btn.disabled = true;
    api("/api/case-management/projects/" + state.projectId + "/members", {
      method: "POST",
      body: JSON.stringify({ user_id: state.memberPickUserId, role: role }),
    })
      .then(function () {
        toast("已发送邀请，等待对方确认", "success");
        state.memberPickUserId = "";
        state.memberPickLabel = "";
        state.memberPickMeta = "";
        if ($("cm-members-q")) $("cm-members-q").value = "";
        if ($("cm-members-search-list")) {
          $("cm-members-search-list").innerHTML = "";
          $("cm-members-search-list").classList.add("is-empty");
        }
        syncMembersPickedUi();
        return loadMembers();
      })
      .catch(function (err) {
        toast(err.message, "error");
        syncMembersPickedUi();
      });
  }

  function openTransferOwnerModal() {
    var sel = $("cm-transfer-owner-select");
    var mask = $("cm-transfer-owner-mask");
    if (!sel || !mask) return;
    var proj = currentProject();
    if (!proj || String(proj.user_id || "") !== String(state.userId || "")) {
      return toast("仅当前项目负责人可转移管理员", "error");
    }
    sel.innerHTML = "";
    var candidates = (state.members || []).filter(function (m) {
      return m.user_id && m.user_id !== state.userId;
    });
    if (!candidates.length) {
      return toast("没有可转移的正式成员", "error");
    }
    candidates.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.user_id;
      o.textContent =
        m.label || m.display_name || m.email || m.phone_masked || m.user_id;
      sel.appendChild(o);
    });
    mask.classList.remove("is-hidden");
  }

  function closeTransferOwnerModal() {
    var mask = $("cm-transfer-owner-mask");
    if (mask) mask.classList.add("is-hidden");
  }

  function confirmTransferOwner() {
    var sel = $("cm-transfer-owner-select");
    var target = sel && sel.value;
    if (!target) return toast("请选择成员", "error");
    var name =
      (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].textContent) ||
      target;
    cmConfirm({
      title: "转移管理员",
      message:
        "确定将负责人权限转移给「" +
        name +
        "」？转移后你将成为编辑，且无法自行改回。",
      confirmText: "确认转移",
      danger: true,
    }).then(function (ok) {
      if (!ok) return;
      api("/api/case-management/projects/" + state.projectId + "/transfer-owner", {
        method: "POST",
        body: JSON.stringify({ target_user_id: target }),
      })
        .then(function () {
          toast("已转移管理员", "success");
          closeTransferOwnerModal();
          return loadProjects().then(loadMembers);
        })
        .catch(function (err) {
          toast(err.message || "转移失败", "error");
        });
    });
  }

  function runTrashRestore() {
    resolveTrashActionIds()
      .then(function (ids) {
        if (!ids.length) return;
        var body = { case_ids: ids };
        var scope = trashScopeUserId();
        if (scope) body.for_user_id = scope;
        return api("/api/case-management/projects/" + state.projectId + "/cases/restore", {
          method: "POST",
          body: JSON.stringify(body),
        }).then(function (data) {
          toast("已恢复 " + (data.restored || 0) + " 条", "success");
          clearTrashSelection();
          return loadTrash().then(function () {
            return loadActiveSchema().then(loadCases);
          });
        });
      })
      .catch(function (err) {
        toast(err.message || "恢复失败", "error");
      });
  }

  function runTrashPurge() {
    if (!state.trashAllowPurge) {
      return toast("仅负责人可彻底删除团队项目的回收站用例", "error");
    }
    var countHint = trashSelectedCount();
    if (countHint <= 0) return;
    cmConfirm({
      title: "彻底删除",
      message:
        "将永久删除已选 " +
        countHint +
        " 条用例及其执行记录，不可恢复。",
      confirmText: "彻底删除",
      danger: true,
    }).then(function (ok) {
      if (!ok) return;
      return resolveTrashActionIds().then(function (ids) {
        if (!ids.length) return;
        var body = { case_ids: ids };
        var scope = trashScopeUserId();
        if (scope) body.for_user_id = scope;
        return api("/api/case-management/projects/" + state.projectId + "/cases/purge", {
          method: "POST",
          body: JSON.stringify(body),
        }).then(function (data) {
          toast("已彻底删除 " + (data.deleted || 0) + " 条", "success");
          clearTrashSelection();
          return loadTrash();
        });
      });
    }).catch(function (err) {
      toast(err.message || "删除失败", "error");
    });
  }

  function renderCaseTableHead(cols) {
    var tr = $("cm-case-thead-row");
    if (!tr) return;
    tr.innerHTML = "";
    var thCheck = document.createElement("th");
    thCheck.className = "cm-th-check";
    var headTitle = "点击切换：本页 → 全部 → 取消";
    thCheck.innerHTML =
      '<label class="cm-check-wrap" title="' +
      headTitle +
      '">' +
      '<input type="checkbox" class="cm-check" id="cm-check-head" aria-label="全选">' +
      '<span class="cm-check-wrap__box" aria-hidden="true"></span>' +
      "</label>";
    tr.appendChild(thCheck);
    (cols || []).forEach(function (c) {
      var th = document.createElement("th");
      th.textContent = c.label || c.key || "";
      tr.appendChild(th);
    });
    var headCb = $("cm-check-head");
    var headWrap = thCheck.querySelector(".cm-check-wrap");
    if (headCb) {
      var pageIds = state.cases.map(function (c) { return c.id; });
      var checked = 0;
      pageIds.forEach(function (id) {
        if (state.suiteSelectAll || state.selectedIds[id]) checked += 1;
      });
      if (state.suiteSelectAll) {
        headCb.checked = true;
        headCb.indeterminate = false;
        if (headWrap) {
          headWrap.classList.remove("is-page-all");
          headWrap.classList.add("is-suite-all");
        }
      } else if (checked === pageIds.length && pageIds.length > 0) {
        // 本页：用 indeterminate 显示横线「一」，不显示 √
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
      headCb.addEventListener("click", function (e) {
        e.preventDefault();
        cycleHeadSelection();
      });
    }
  }

  function setCaseListEmptyState(opts) {
    opts = opts || {};
    var empty = $("cm-case-empty");
    var wrap = $("cm-table-wrap");
    var card = $("cm-case-empty-card");
    var titleEl = $("cm-case-empty-title");
    var descEl = $("cm-case-empty-desc");
    var actionsCases = $("cm-case-empty-actions-cases");
    var actionsProject = $("cm-case-empty-actions-project");
    var showEmpty = !!opts.showEmpty;
    var mode = String(opts.mode || "cases");
    if (empty) empty.classList.toggle("is-hidden", !showEmpty);
    if (wrap) wrap.classList.toggle("is-hidden", showEmpty);
    if (card) {
      card.classList.toggle("cm-case-empty__card--project", mode === "no-project");
      card.classList.toggle("cm-case-empty__card--suite", mode === "no-suite");
    }
    if (titleEl && opts.emptyTitle) titleEl.textContent = opts.emptyTitle;
    if (descEl && opts.emptyDesc) descEl.textContent = opts.emptyDesc;
    if (actionsCases) actionsCases.classList.toggle("is-hidden", mode === "no-project");
    if (actionsProject) actionsProject.classList.toggle("is-hidden", mode !== "no-project");
  }

  function isSchemaLocked() {
    return !!(
      state.activeSchema &&
      state.activeSchema.status === "locked" &&
      (state.activeSchema.columns || []).length
    );
  }

  /** 锁定列表头：最多 10 个业务列（详情仍展示全部字段） */
  function buildLockedListColumns() {
    if (!window.CmSchemaUi || !isSchemaLocked()) return null;
    if (typeof window.CmSchemaUi.listColumnsForTable === "function") {
      return window.CmSchemaUi.listColumnsForTable(state.activeSchema, 10);
    }
    return window.CmSchemaUi.listColumnsFromSchema(state.activeSchema);
  }

  function clipListCellText(text, maxLen) {
    var s = String(text == null ? "" : text);
    var limit = maxLen || 160;
    if (s.length <= limit) return s;
    return s.slice(0, limit) + "…";
  }

  function renderCases() {
    var tbody = $("cm-case-tbody");
    tbody.innerHTML = "";
    var suiteNameMap = {};
    (state.suites || []).forEach(function (s) {
      suiteNameMap[s.id] = s.name;
    });
    var onAll = !state.suiteFilter || String(state.suiteFilter).indexOf("__") === 0;
    var aggregating = isAggregatingSuiteView();
    var schemaLocked = isSchemaLocked();

    if (!state.projectId) {
      clearCaseSelection();
      setCaseListEmptyState({
        showEmpty: true,
        mode: "no-project",
        emptyTitle: "还没有项目",
        emptyDesc: "先添加一个项目，再创建目录与用例。也可随时通过左上角「管理项目」维护。",
      });
      $("cm-page-info").textContent = "—";
      syncBatchActionUi();
      return;
    }

    if (!state.cases.length) {
      clearCaseSelection();
      // 项目/目录已锁定表头：即使暂无用例，也展示表头，不走空状态卡片
      if (schemaLocked) {
        var lockedCols = buildLockedListColumns() || [];
        setCaseListEmptyState({ showEmpty: false });
        renderCaseTableHead(lockedCols);
        var emptyTr = document.createElement("tr");
        var emptyTd = document.createElement("td");
        emptyTd.colSpan = Math.max(1, lockedCols.length + 1);
        emptyTd.className = "cm-empty";
        emptyTd.textContent = onAll
          ? "暂无用例，可新建或导入（项目表头已锁定）。"
          : aggregating
            ? "本目录及子目录暂无用例，可在子目录中新建或导入。"
            : "本目录暂无用例，可新建用例或导入（表头已锁定）。";
        emptyTr.appendChild(emptyTd);
        tbody.appendChild(emptyTr);
        $("cm-page-info").textContent = "第 1 / 1 页 · 共 0 条";
        syncBatchActionUi();
        return;
      }
      var emptyTitle = "还没有用例";
      var emptyDesc =
        "可以点击「新建用例」，或使用「导入 Excel」「从工作台导入」添加。" +
        (onAll
          ? "建议先在左侧选择具体目录再导入，首次导入会锁定项目表头。"
          : "对本目录首次导入时会确认并锁定列头；同项目其他目录将共用该表头。");
      if (!(state.suites || []).length) {
        emptyTitle = "还没有目录";
        emptyDesc = "请先在左侧创建目录，再新建用例或导入。导入后将锁定项目表头。";
      }
      setCaseListEmptyState({
        showEmpty: true,
        mode: !(state.suites || []).length ? "no-suite" : "cases",
        emptyTitle: emptyTitle,
        emptyDesc: emptyDesc,
      });
      $("cm-page-info").textContent = "第 1 / 1 页 · 共 0 条";
      syncBatchActionUi();
      return;
    }

    var cols;
    if (window.CmSchemaUi) {
      if (schemaLocked) {
        cols = buildLockedListColumns();
      } else if (onAll) {
        cols = window.CmSchemaUi.systemListColumns();
      } else {
        // 有数据但尚未锁定：仍用系统列兜底，避免空白表头
        cols = window.CmSchemaUi.systemListColumns();
      }
    } else {
      cols = [
        { key: "__title", label: "标题", role: "title" },
        { key: "__priority", label: "优先级", role: "priority" },
        { key: "__status", label: "状态", role: "status" },
        { key: "__last_result", label: "最近结果", role: "last_result" },
        { key: "__updated", label: "更新时间", role: "updated" },
        { key: "__actions", label: "操作", role: "actions" },
      ];
    }

    setCaseListEmptyState({
      showEmpty: false,
    });
    renderCaseTableHead(cols);

    var frag = document.createDocumentFragment();
    state.cases.forEach(function (c) {
      var tr = document.createElement("tr");
      var tdCheck = document.createElement("td");
      tdCheck.className = "cm-td-check";
      var wrap = document.createElement("label");
      wrap.className = "cm-check-wrap";
      wrap.title = "选择";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "cm-check";
      cb.setAttribute("aria-label", "选择用例");
      cb.checked = !!(state.suiteSelectAll || state.selectedIds[c.id]);
      var box = document.createElement("span");
      box.className = "cm-check-wrap__box";
      box.setAttribute("aria-hidden", "true");
      wrap.appendChild(cb);
      wrap.appendChild(box);
      tdCheck.appendChild(wrap);
      cb.onchange = function () {
        toggleCaseSelected(c.id, !!cb.checked);
        // 同步表头半选
        var headCb = $("cm-check-head");
        if (headCb) {
          var pageIds = state.cases.map(function (x) { return x.id; });
          var cnt = 0;
          pageIds.forEach(function (id) {
            if (state.suiteSelectAll || state.selectedIds[id]) cnt += 1;
          });
          headCb.checked = cnt === pageIds.length && pageIds.length > 0;
          headCb.indeterminate = cnt > 0 && cnt < pageIds.length;
        }
        syncBatchActionUi();
      };
      tr.appendChild(tdCheck);
      cols.forEach(function (col) {
        var td = document.createElement("td");
        if (col.role === "actions" || col.key === "__actions") {
          var open = document.createElement("button");
          open.type = "button";
          open.className = "cm-btn cm-btn--ghost cm-btn--sm";
          open.textContent = "打开";
          open.addEventListener("click", function () {
            openCase(c.id);
          });
          td.appendChild(open);
        } else if (col.role === "priority" || col.key === "__priority" || col.key === "priority") {
          var badge = document.createElement("span");
          badge.className = "cm-badge cm-badge--" + (c.priority || "P2");
          badge.textContent = window.CmSchemaUi
            ? window.CmSchemaUi.cellValue(c, col, suiteNameMap)
            : c.priority || "P2";
          td.appendChild(badge);
        } else if (col.role === "last_result" || col.key === "__last_result") {
          var lr = String(c.last_result || "").toLowerCase() || "untested";
          var lrBadge = document.createElement("span");
          lrBadge.className = "cm-result-badge cm-result-badge--" + lr;
          lrBadge.textContent = window.CmSchemaUi
            ? window.CmSchemaUi.cellValue(c, col, suiteNameMap)
            : execResultLabel(lr === "untested" ? "" : lr) || "未测";
          if (c.last_executed_at) {
            lrBadge.title = String(c.last_executed_at).replace("T", " ").slice(0, 19);
          }
          td.appendChild(lrBadge);
        } else {
          var text = window.CmSchemaUi
            ? window.CmSchemaUi.cellValue(c, col, suiteNameMap)
            : c.title || "";
          var display = clipListCellText(text, 160);
          td.title = clipListCellText(text, 400);
          var wide =
            window.CmSchemaUi &&
            typeof window.CmSchemaUi.isWideListColumn === "function"
              ? window.CmSchemaUi.isWideListColumn(col)
              : col.role === "steps" ||
                col.role === "expect" ||
                col.role === "precondition";
          if (wide) {
            td.classList.add("cm-td--wide");
            var clamp = document.createElement("div");
            clamp.className = "cm-td__clamp";
            clamp.textContent = display;
            td.appendChild(clamp);
          } else {
            td.textContent = display;
          }
        }
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    $("cm-page-info").textContent = "第 " + state.page + " / " + pages + " 页 · 共 " + state.total + " 条";
    syncBatchActionUi();
  }

  function openDrawer(show) {
    $("cm-drawer").classList.toggle("is-hidden", !show);
    $("cm-drawer-mask").classList.toggle("is-hidden", !show);
    $("cm-drawer").setAttribute("aria-hidden", show ? "false" : "true");
    document.body.classList.toggle("cm-drawer-open", !!show);
  }

  function setTab(tab) {
    document.querySelectorAll(".cm-drawer__tabs button").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === tab);
    });
    $("cm-tab-edit").classList.toggle("is-hidden", tab !== "edit");
    $("cm-tab-exec").classList.toggle("is-hidden", tab !== "exec");
    var foot = $("cm-drawer-foot");
    if (foot) foot.classList.toggle("is-hidden", tab !== "edit");
    if (tab === "exec" && state.editingId) loadExecutions(state.execPage || 1);
  }

  function drawerFieldColumns() {
    if (window.CmSchemaUi && isSchemaLocked()) {
      return (window.CmSchemaUi.listColumnsFromSchema(state.activeSchema) || []).filter(
        function (col) {
          var role = col.role || "";
          var key = col.key || "";
          if (role === "actions" || key === "__actions") return false;
          if (role === "title" || key === "__title" || key === "title") return false;
          if (role === "priority" || key === "__priority" || key === "priority") return false;
          if (role === "status" || key === "__status" || key === "status") return false;
          if (role === "suite" || key === "__suite") return false;
          if (role === "updated" || key === "__updated") return false;
          return true;
        }
      );
    }
    return [
      { key: "__precondition", label: "前置条件", role: "precondition" },
      { key: "__steps", label: "步骤描述", role: "steps" },
      { key: "__expect", label: "预期结果", role: "expect" },
      { key: "__tags", label: "标签（逗号分隔）", role: "tags" },
    ];
  }

  function drawerFieldValue(caseItem, col) {
    var role = col.role || "";
    var key = col.key || "";
    var fields = (caseItem && caseItem.fields) || {};
    if (key && fields[key] != null && String(fields[key]) !== "") {
      return String(fields[key]);
    }
    if (role === "precondition") return (caseItem && caseItem.precondition) || "";
    if (role === "tags") return ((caseItem && caseItem.tags) || []).join(",");
    if (role === "module") {
      var tags = (caseItem && caseItem.tags) || [];
      return tags.length ? String(tags[0]) : "";
    }
    if (role === "steps") {
      return ((caseItem && caseItem.steps) || [])
        .map(function (s) {
          return (s && s.step) || "";
        })
        .filter(Boolean)
        .join("\n");
    }
    if (role === "expect") {
      return ((caseItem && caseItem.steps) || [])
        .map(function (s) {
          return (s && s.expect) || "";
        })
        .filter(Boolean)
        .join("\n");
    }
    return fields[key] != null ? String(fields[key]) : "";
  }

  function isDrawerMultilineRole(role) {
    return (
      role === "precondition" ||
      role === "steps" ||
      role === "expect" ||
      role === "custom"
    );
  }

  function renderDrawerExtraFields(caseItem) {
    var box = $("cm-drawer-extra-fields");
    if (!box) return;
    box.innerHTML = "";
    drawerFieldColumns().forEach(function (col) {
      var role = col.role || "custom";
      var key = col.key || role;
      var label = col.label || key;
      var wrap = document.createElement("label");
      wrap.className = "cm-field";
      var span = document.createElement("span");
      span.textContent = label;
      wrap.appendChild(span);
      var control;
      if (isDrawerMultilineRole(role) || /前置|步骤|预期|备注|描述/.test(label)) {
        control = document.createElement("textarea");
        control.className = "cm-textarea";
        control.rows = role === "precondition" || role === "steps" || role === "expect" ? 4 : 3;
      } else {
        control = document.createElement("input");
        control.type = "text";
        control.className = "cm-input";
      }
      control.setAttribute("data-cm-field-key", key);
      control.setAttribute("data-cm-field-role", role);
      control.value = drawerFieldValue(caseItem || {}, col);
      wrap.appendChild(control);
      box.appendChild(wrap);
    });
  }

  function collectDrawerExtraFields() {
    var box = $("cm-drawer-extra-fields");
    var fields = {};
    var precondition = "";
    var tags = [];
    var stepText = "";
    var expectText = "";
    if (!box) {
      return { fields: fields, precondition: "", tags: [], steps: [] };
    }
    box.querySelectorAll("[data-cm-field-key]").forEach(function (el) {
      var key = el.getAttribute("data-cm-field-key") || "";
      var role = el.getAttribute("data-cm-field-role") || "custom";
      var val = el.value || "";
      if (key && key.indexOf("__") !== 0) {
        fields[key] = val;
      }
      if (role === "precondition") precondition = val;
      if (role === "steps") stepText = val;
      if (role === "expect") expectText = val;
      if (role === "tags") {
        tags = val
          .split(",")
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
      }
      if (role === "module" && val.trim() && tags.indexOf(val.trim()) < 0) {
        tags.push(val.trim());
      }
    });
    var steps = [];
    if (String(stepText || "").trim() || String(expectText || "").trim()) {
      steps = [{ step: stepText || "", expect: expectText || "" }];
    }
    return {
      fields: fields,
      precondition: precondition,
      tags: tags,
      steps: steps,
    };
  }

  function openCase(id) {
    state.editingNew = false;
    state.editingId = id;
    state.execPage = 1;
    $("cm-drawer-title").textContent = "用例详情";
    fillSuiteSelect();
    api("/api/case-management/cases/" + id).then(function (data) {
      var c = data.item || {};
      $("cm-f-title").value = c.title || "";
      $("cm-f-priority").value = c.priority || "P2";
      $("cm-f-status").value = c.status || "draft";
      if (window.CmFilterSelect) {
        window.CmFilterSelect.refresh($("cm-f-priority"));
        window.CmFilterSelect.refresh($("cm-f-status"));
      }
      var sid = c.suite_id || "";
      var sel = $("cm-f-suite");
      if (sid && sel && !Array.prototype.some.call(sel.options, function (o) { return o.value === sid; })) {
        var orphan = document.createElement("option");
        orphan.value = sid;
        orphan.textContent = "原目录（已失效）";
        sel.insertBefore(orphan, sel.firstChild);
      }
      if (sel) setDrawerSuiteValue(sid || defaultSuiteIdForNewCase());
      setDrawerSuiteVisible(false);
      renderDrawerExtraFields(c);
      $("cm-btn-delete-case").classList.toggle("is-hidden", isViewerOnly());
      var saveBtn = $("cm-btn-save-case");
      if (saveBtn) saveBtn.classList.toggle("is-hidden", isViewerOnly());
      var addExec = $("cm-btn-add-exec");
      if (addExec) addExec.classList.toggle("is-hidden", isViewerOnly());
      setDrawerExecResult("pass");
      if ($("cm-exec-comment")) $("cm-exec-comment").value = "";
      setTab("edit");
      openDrawer(true);
    }).catch(function (err) {
      toast(err.message, "error");
    });
  }

  function openNewCase() {
    if (isViewerOnly()) return toast("只读成员无法新建用例", "error");
    ensureProjectAndSuiteReady().then(function (ok) {
      if (!ok) return;
      fillSuiteSelect();
      state.editingNew = true;
      state.editingId = null;
      $("cm-drawer-title").textContent = "新建用例";
      $("cm-f-title").value = "";
      $("cm-f-priority").value = "P2";
      $("cm-f-status").value = "draft";
      if (window.CmFilterSelect) {
        window.CmFilterSelect.refresh($("cm-f-priority"));
        window.CmFilterSelect.refresh($("cm-f-status"));
      }
      setDrawerSuiteValue(defaultSuiteIdForNewCase());
      setDrawerSuiteVisible(true);
      renderDrawerExtraFields({});
      $("cm-btn-delete-case").classList.add("is-hidden");
      var saveBtn = $("cm-btn-save-case");
      if (saveBtn) saveBtn.classList.remove("is-hidden");
      var addExec = $("cm-btn-add-exec");
      if (addExec) addExec.classList.add("is-hidden");
      setTab("edit");
      openDrawer(true);
    });
  }

  /**
   * 用例抽屉保存成功：立刻关抽屉，再用轻提示反馈。
   * 不改通用 toast，避免影响其它提示。
   */
  function notifyCaseSavedAndCloseDrawer() {
    openDrawer(false);
    if (typeof window.hfFloatToast === "function") {
      window.hfFloatToast("已保存", { variant: "success", placement: "bottom" });
      return Promise.resolve();
    }
    toast("已保存", "success");
    return Promise.resolve();
  }

  function saveCase() {
    if (isViewerOnly()) return toast("只读成员无法保存用例", "error");
    var extra = collectDrawerExtraFields();
    var payload = {
      title: $("cm-f-title").value,
      priority: $("cm-f-priority").value,
      status: $("cm-f-status").value,
      precondition: extra.precondition,
      tags: extra.tags,
      steps: extra.steps,
      fields: extra.fields,
    };
    var req;
    if (state.editingNew) {
      payload.suite_id = $("cm-f-suite").value || null;
      req = api("/api/case-management/projects/" + state.projectId + "/cases", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } else {
      req = api("/api/case-management/cases/" + state.editingId, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }
    req
      .then(function (data) {
        state.editingNew = false;
        state.editingId = data.item && data.item.id;
        $("cm-btn-delete-case").classList.remove("is-hidden");
        setDrawerSuiteVisible(false);
        return loadCases().then(function () {
          return notifyCaseSavedAndCloseDrawer();
        });
      })
      .catch(function (err) {
        toast(err.message, "error");
      });
  }

  function loadExecutions(page) {
    if (!state.editingId) return;
    var pageNum = Math.max(1, parseInt(page || state.execPage || 1, 10) || 1);
    state.execPage = pageNum;
    var pageSize = state.execPageSize || 10;
    api(
      "/api/case-management/cases/" +
        state.editingId +
        "/executions?page=" +
        pageNum +
        "&page_size=" +
        pageSize
    ).then(function (data) {
      var list = $("cm-exec-list");
      var pager = $("cm-exec-pager");
      var info = $("cm-exec-page-info");
      var prev = $("cm-exec-prev");
      var next = $("cm-exec-next");
      list.innerHTML = "";
      var items = data.items || [];
      var total = Number(data.total || 0);
      var curPage = Number(data.page || pageNum) || 1;
      var size = Number(data.page_size || pageSize) || 10;
      var totalPages = Math.max(1, Math.ceil(total / size) || 1);
      state.execPage = curPage;
      items.forEach(function (e) {
        var result = String(e.result || "").toLowerCase();
        var li = document.createElement("li");
        var head = document.createElement("div");
        head.className = "cm-exec-list__head";

        var left = document.createElement("div");
        left.className = "cm-exec-list__main";
        var badge = document.createElement("span");
        badge.className = "cm-exec-badge cm-exec-badge--" + (result || "skip");
        badge.textContent = execResultLabel(result);
        var actor = document.createElement("span");
        actor.className = "cm-exec-list__actor";
        actor.textContent = "执行人：" + (e.executor_label || "未知用户");
        left.appendChild(badge);
        left.appendChild(actor);

        var time = document.createElement("time");
        time.className = "cm-exec-list__time";
        time.textContent = String(e.executed_at || "").replace("T", " ").slice(0, 19);

        head.appendChild(left);
        head.appendChild(time);
        li.appendChild(head);

        if (e.comment) {
          var comment = document.createElement("div");
          comment.className = "cm-exec-list__comment";
          comment.textContent = e.comment;
          li.appendChild(comment);
        }
        list.appendChild(li);
      });
      if (!items.length) {
        list.innerHTML = '<li class="cm-empty">暂无执行记录</li>';
      }
      if (pager) {
        if (total > size) {
          pager.classList.remove("is-hidden");
          if (info) info.textContent = curPage + " / " + totalPages + " · 共 " + total + " 条";
          if (prev) prev.disabled = curPage <= 1;
          if (next) next.disabled = curPage >= totalPages;
        } else {
          pager.classList.add("is-hidden");
        }
      }
    });
  }

  function refreshAll() {
    return loadProjects()
      .then(function () {
        // schema 必须先于 cases，避免并行时用到上一项目的锁定表头
        return loadSuites()
          .then(function () {
            return loadActiveSchema();
          })
          .then(function () {
            return loadCases();
          });
      })
      .catch(function (err) {
        if (err.status === 401) {
          showGate(true);
          return;
        }
        toast(err.message, "error");
      });
  }

  /**
   * 切换项目专用刷新：先清掉上一项目的 schema/列表残留，再按
   * suites → schema → cases 顺序加载。不改动目录内点击等其它并行路径。
   */
  function reloadWorkspaceAfterProjectChange() {
    state.activeSchema = null;
    state.cases = [];
    state.total = 0;
    state.page = 1;
    clearCaseSelection();
    var tbody = $("cm-case-tbody");
    if (tbody) tbody.innerHTML = "";
    setCaseListEmptyState({
      showEmpty: true,
      emptyTitle: "加载中…",
      emptyDesc: "正在切换项目，请稍候。",
    });
    if ($("cm-page-info")) $("cm-page-info").textContent = "—";
    syncBatchActionUi();
    return loadSuites()
      .then(function () {
        return loadActiveSchema();
      })
      .then(function () {
        return loadCases();
      });
  }

  /** 从管理项目弹窗删除指定项目（仅 owner；不改动其它删除入口） */
  function deleteProjectByIdFromManage(projectId, projectName) {
    var pid = String(projectId || "").trim();
    if (!pid) return;
    var name = String(projectName || "该项目").trim() || "该项目";
    cmConfirm({
      title: "删除项目",
      message:
        "确定删除项目「" +
        name +
        "」？将同时删除其下目录、用例与执行记录，此操作不可恢复。",
      confirmText: "删除项目",
      cancelText: "取消",
      danger: true,
    }).then(function (ok) {
      if (!ok) return;
      api(
        "/api/case-management/projects/" + encodeURIComponent(pid) + "?force=true",
        { method: "DELETE" }
      )
        .then(function () {
          toast("项目已删除", "success");
          if (state.projectId === pid) {
            state.projectId = "";
            state.suiteFilter = "__all__";
            state.activeSchema = null;
            state.cases = [];
            state.appliedSearchQ = "";
            clearCaseSelection();
          }
          return refreshAll().then(function () {
            renderManageProjectsList();
          });
        })
        .catch(function (err) {
          toast((err && err.message) || "删除失败", "error");
        });
    });
  }

  function renameProjectFromManage(projectId, projectName) {
    var pid = String(projectId || "").trim();
    if (!pid) return;
    var oldName = String(projectName || "").trim();
    cmPrompt({
      title: "重命名项目",
      message: "修改后左侧项目列表会同步更新。",
      label: "项目名称",
      placeholder: "输入新的项目名称",
      defaultValue: oldName,
      confirmText: "保存",
    }).then(function (name) {
      if (!name) return;
      var next = String(name).trim();
      if (!next || next === oldName) return;
      api("/api/case-management/projects/" + encodeURIComponent(pid), {
        method: "PATCH",
        body: JSON.stringify({ name: next }),
      })
        .then(function () {
          toast("项目已重命名", "success");
          return loadProjects().then(function () {
            renderManageProjectsList();
          });
        })
        .catch(function (err) {
          toast((err && err.message) || "重命名失败", "error");
        });
    });
  }

  function switchProjectFromManage(projectId) {
    var pid = String(projectId || "").trim();
    if (!pid || pid === state.projectId) return;
    var list = $("cm-projects-list");
    if (list) {
      list.querySelectorAll(".cm-projects-item").forEach(function (el) {
        el.classList.add("is-switching");
      });
    }
    state.projectId = pid;
    state.suiteFilter = "__all__";
    state.page = 1;
    var sel = $("cm-project-select");
    if (sel) {
      sel.value = pid;
      if (window.CmFilterSelect && typeof window.CmFilterSelect.refresh === "function") {
        window.CmFilterSelect.refresh(sel);
      }
    }
    syncCollabUi();
    renderManageProjectsList();
    reloadWorkspaceAfterProjectChange().catch(function (err) {
      toast((err && err.message) || "切换失败", "error");
    });
  }

  function updateManageProjectsCount() {
    var el = $("cm-projects-count");
    if (!el) return;
    var n = (state.projects || []).length;
    el.textContent = n ? "共 " + n + " 个项目" : "";
  }

  function renderManageProjectsList() {
    var list = $("cm-projects-list");
    if (!list) return;
    list.innerHTML = "";
    updateManageProjectsCount();
    var items = state.projects || [];
    if (!items.length) {
      list.innerHTML =
        '<div class="cm-projects-empty">暂无项目<br>点击右上角「＋ 新建」创建第一个项目</div>';
      return;
    }
    items.forEach(function (p) {
      var isCurrent = p.id === state.projectId;
      var isOwner = String(p.my_role || "") === "owner";
      var row = document.createElement("div");
      row.className = "cm-projects-item" + (isCurrent ? " is-current" : "");
      row.setAttribute("role", "listitem");
      row.setAttribute("tabindex", isCurrent ? "-1" : "0");
      row.title = isCurrent ? "当前项目" : "点击切换到此项目";

      var main = document.createElement("div");
      main.className = "cm-projects-item__main";

      var titleRow = document.createElement("div");
      titleRow.className = "cm-projects-item__title-row";
      var nameEl = document.createElement("strong");
      nameEl.className = "cm-projects-item__name";
      nameEl.textContent = p.name || p.id;
      titleRow.appendChild(nameEl);
      if (isCurrent) {
        var badge = document.createElement("span");
        badge.className = "cm-projects-item__badge";
        badge.textContent = "当前";
        titleRow.appendChild(badge);
      }

      var meta = document.createElement("div");
      meta.className = "cm-projects-item__meta";
      var role = document.createElement("span");
      role.className = "cm-projects-item__role";
      role.textContent = roleLabel(p.my_role || "");
      meta.appendChild(role);

      main.appendChild(titleRow);
      main.appendChild(meta);

      var actions = document.createElement("div");
      actions.className = "cm-projects-item__actions";
      if (isOwner) {
        var renameBtn = document.createElement("button");
        renameBtn.type = "button";
        renameBtn.className = "cm-projects-item__action";
        renameBtn.textContent = "重命名";
        renameBtn.title = "重命名项目";
        renameBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          renameProjectFromManage(p.id, p.name);
        });
        actions.appendChild(renameBtn);

        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "cm-projects-item__action cm-projects-item__action--danger";
        delBtn.textContent = "删除";
        delBtn.title = "删除项目（不可恢复）";
        delBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          deleteProjectByIdFromManage(p.id, p.name);
        });
        actions.appendChild(delBtn);
      }

      row.appendChild(main);
      row.appendChild(actions);

      if (!isCurrent) {
        row.addEventListener("click", function () {
          switchProjectFromManage(p.id);
        });
        row.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            switchProjectFromManage(p.id);
          }
        });
      }

      list.appendChild(row);
    });
  }

  function openManageProjectsModal() {
    var mask = $("cm-projects-mask");
    if (!mask) return;
    renderManageProjectsList();
    mask.classList.remove("is-hidden");
  }

  function closeManageProjectsModal() {
    var mask = $("cm-projects-mask");
    if (mask) mask.classList.add("is-hidden");
  }

  function closeAllTopMenus() {
    document.querySelectorAll(".cm-top-menu.is-open").forEach(function (menu) {
      menu.classList.remove("is-open");
      var panel = menu.querySelector(".cm-top-menu__panel");
      var trigger = menu.querySelector(".cm-top-menu__trigger");
      if (panel) panel.hidden = true;
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  }

  function bindTopMenus() {
    document.querySelectorAll(".cm-top-menu__trigger").forEach(function (trigger) {
      if (trigger._cmMenuBound) return;
      trigger._cmMenuBound = true;
      trigger.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var menuId = trigger.getAttribute("data-cm-menu");
        var menu = menuId ? document.getElementById(menuId) : trigger.closest(".cm-top-menu");
        if (!menu) return;
        var willOpen = !menu.classList.contains("is-open");
        closeAllTopMenus();
        if (!willOpen) return;
        menu.classList.add("is-open");
        var panel = menu.querySelector(".cm-top-menu__panel");
        if (panel) panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
      });
    });
    document.querySelectorAll(".cm-top-menu__item").forEach(function (item) {
      if (item._cmMenuItemBound) return;
      item._cmMenuItemBound = true;
      item.addEventListener("click", function () {
        closeAllTopMenus();
      });
    });
    if (!document._cmTopMenuDocBound) {
      document._cmTopMenuDocBound = true;
      document.addEventListener("click", function () {
        closeAllTopMenus();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeAllTopMenus();
      });
    }
  }

  function bind() {
    bindTopMenus();
    $("cm-project-select").addEventListener("change", function () {
      state.projectId = this.value;
      state.suiteFilter = "__all__";
      state.page = 1;
      syncCollabUi();
      reloadWorkspaceAfterProjectChange();
    });
    $("cm-btn-members").addEventListener("click", openMembersModal);
    $("cm-members-close").addEventListener("click", closeMembersModal);
    $("cm-members-done").addEventListener("click", closeMembersModal);
    $("cm-members-mask").addEventListener("click", function (e) {
      if (e.target === this) closeMembersModal();
    });
    var membersQ = $("cm-members-q");
    if (membersQ) {
      membersQ.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          searchMembersUsers();
        }
      });
      membersQ.addEventListener("input", function () {
        state.memberPickUserId = "";
        state.memberPickLabel = "";
        state.memberPickMeta = "";
        syncMembersPickedUi();
      });
    }
    if ($("cm-members-search-btn")) {
      $("cm-members-search-btn").addEventListener("click", searchMembersUsers);
    }
    if ($("cm-members-invite-btn")) {
      $("cm-members-invite-btn").addEventListener("click", inviteSelectedMember);
    }
    if ($("cm-members-transfer-owner")) {
      $("cm-members-transfer-owner").addEventListener("click", openTransferOwnerModal);
    }
    if ($("cm-transfer-owner-close")) {
      $("cm-transfer-owner-close").addEventListener("click", closeTransferOwnerModal);
    }
    if ($("cm-transfer-owner-cancel")) {
      $("cm-transfer-owner-cancel").addEventListener("click", closeTransferOwnerModal);
    }
    if ($("cm-transfer-owner-ok")) {
      $("cm-transfer-owner-ok").addEventListener("click", confirmTransferOwner);
    }
    if ($("cm-transfer-owner-mask")) {
      $("cm-transfer-owner-mask").addEventListener("click", function (e) {
        if (e.target === this) closeTransferOwnerModal();
      });
    }
    if ($("cm-btn-manage-projects")) {
      $("cm-btn-manage-projects").addEventListener("click", openManageProjectsModal);
    }
    if ($("cm-projects-close")) {
      $("cm-projects-close").addEventListener("click", closeManageProjectsModal);
    }
    if ($("cm-projects-done")) {
      $("cm-projects-done").addEventListener("click", closeManageProjectsModal);
    }
    if ($("cm-projects-mask")) {
      $("cm-projects-mask").addEventListener("click", function (e) {
        if (e.target === this) closeManageProjectsModal();
      });
    }
    if ($("cm-btn-new-project")) {
      $("cm-btn-new-project").addEventListener("click", function () {
        cmPrompt({
          title: "新建项目",
          message: "项目用于隔离不同产品或版本的用例库。",
          label: "项目名称",
          placeholder: "例如：订单中心 V2.0",
          confirmText: "创建",
        }).then(function (name) {
          if (!name) return;
          api("/api/case-management/projects", {
            method: "POST",
            body: JSON.stringify({ name: name }),
          })
            .then(function (data) {
              state.projectId = data.item && data.item.id;
              toast("项目已创建", "success");
              return refreshAll();
            })
            .then(function () {
              var mask = $("cm-projects-mask");
              if (mask && !mask.classList.contains("is-hidden")) {
                renderManageProjectsList();
              }
            })
            .catch(function (err) { toast(err.message, "error"); });
        });
      });
    }
    $("cm-btn-add-suite").addEventListener("click", function () {
      promptCreateSuite(null).catch(function (err) {
        toast(err.message, "error");
      });
    });
    $("cm-btn-new-case").addEventListener("click", openNewCase);
    $("cm-btn-batch-exec").addEventListener("click", runBatchExecute);
    $("cm-btn-batch-status").addEventListener("click", runBatchStatus);
    $("cm-btn-batch-move").addEventListener("click", function () {
      openTargetSuitePicker("move");
    });
    $("cm-btn-batch-copy").addEventListener("click", function () {
      openTargetSuitePicker("copy");
    });
    $("cm-btn-batch-delete").addEventListener("click", runBatchDelete);
    $("cm-btn-trash").addEventListener("click", openTrash);
    $("cm-target-suite-close").addEventListener("click", closeTargetSuitePicker);
    $("cm-target-suite-cancel").addEventListener("click", closeTargetSuitePicker);
    $("cm-target-suite-ok").addEventListener("click", confirmTargetSuitePicker);
    $("cm-target-suite-select").addEventListener("change", function () {
      $("cm-target-suite-ok").disabled = !this.value;
    });
    $("cm-trash-close").addEventListener("click", closeTrash);
    $("cm-trash-done").addEventListener("click", closeTrash);
    $("cm-trash-restore").addEventListener("click", runTrashRestore);
    $("cm-trash-purge").addEventListener("click", runTrashPurge);
    if ($("cm-trash-member-select")) {
      $("cm-trash-member-select").addEventListener("change", function () {
        var next = this.value || state.userId || "";
        if (next === state.trashForUserId) return;
        state.trashForUserId = next;
        state.trashPage = 1;
        clearTrashSelection();
        loadTrash().catch(function (err) {
          toast(err.message || "加载回收站失败", "error");
        });
      });
    }
    $("cm-trash-prev").addEventListener("click", function () {
      if (state.trashPage > 1) {
        state.trashPage -= 1;
        if (!state.trashSelectAll) state.trashSelected = {};
        loadTrash().catch(function (err) {
          toast(err.message, "error");
        });
      }
    });
    $("cm-trash-next").addEventListener("click", function () {
      var pages = Math.max(1, Math.ceil((state.trashTotal || 0) / 20));
      if (state.trashPage < pages) {
        state.trashPage += 1;
        if (!state.trashSelectAll) state.trashSelected = {};
        loadTrash().catch(function (err) {
          toast(err.message, "error");
        });
      }
    });
    $("cm-trash-mask").addEventListener("click", function (e) {
      if (e.target === this) closeTrash();
    });
    $("cm-target-suite-mask").addEventListener("click", function (e) {
      if (e.target === this) closeTargetSuitePicker();
    });
    $("cm-exec-run-submit").addEventListener("click", submitBatchExecAll);
    $("cm-exec-run-cancel").addEventListener("click", closeBatchExecPanel);
    $("cm-exec-run-close").addEventListener("click", closeBatchExecPanel);
    $("cm-exec-run-chips").addEventListener("click", function (e) {
      var btn = e.target.closest(".cm-exec-chip");
      if (!btn || btn.disabled) return;
      setBatchExecResult(btn.getAttribute("data-result"));
    });
    $("cm-exec-run-mask").addEventListener("click", function (e) {
      if (e.target === this && !(state.batchExec && state.batchExec.busy)) {
        closeBatchExecPanel();
      }
    });
    if ($("cm-case-empty-new")) {
      $("cm-case-empty-new").addEventListener("click", openNewCase);
    }
    if ($("cm-case-empty-add-project")) {
      $("cm-case-empty-add-project").addEventListener("click", function () {
        openManageProjectsModal();
      });
    }
    if ($("cm-case-empty-import-wb")) {
      $("cm-case-empty-import-wb").addEventListener("click", function () {
        $("cm-btn-import-wb").click();
      });
    }
    if ($("cm-case-empty-import-excel")) {
      $("cm-case-empty-import-excel").addEventListener("click", function () {
        $("cm-btn-import-excel").click();
      });
    }
    function reloadCasesFromFilter() {
      state.page = 1;
      clearCaseSelection();
      loadCases();
    }
    syncCaseSearchClearBtn();
    if ($("cm-search")) {
      $("cm-search").addEventListener("input", syncCaseSearchClearBtn);
      $("cm-search").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          runCaseTitleSearch();
        }
      });
    }
    if ($("cm-btn-search")) {
      $("cm-btn-search").addEventListener("click", function () {
        runCaseTitleSearch();
      });
    }
    if ($("cm-btn-search-reset")) {
      $("cm-btn-search-reset").addEventListener("click", function () {
        resetCaseSearchAndStatusFilters();
      });
    }
    if ($("cm-search-clear")) {
      $("cm-search-clear").addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        clearCaseSearchInputOnly();
      });
    }
    $("cm-filter-priority").addEventListener("change", reloadCasesFromFilter);
    $("cm-filter-status").addEventListener("change", reloadCasesFromFilter);
    $("cm-page-prev").addEventListener("click", function () {
      if (state.page > 1) {
        state.page -= 1;
        loadCases();
      }
    });
    $("cm-page-next").addEventListener("click", function () {
      var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
      if (state.page < pages) {
        state.page += 1;
        loadCases();
      }
    });
    $("cm-drawer-close").addEventListener("click", function () { openDrawer(false); });
    $("cm-drawer-mask").addEventListener("click", function () { openDrawer(false); });
    document.querySelectorAll(".cm-drawer__tabs button").forEach(function (b) {
      b.addEventListener("click", function () {
        setTab(b.getAttribute("data-tab"));
      });
    });
    $("cm-btn-save-case").addEventListener("click", saveCase);
    $("cm-btn-delete-case").addEventListener("click", function () {
      if (!state.editingId) return;
      if (isViewerOnly()) return toast("只读成员无法删除用例", "error");
      cmConfirm({
        title: "移入回收站",
        message: "将把该用例移入回收站（可恢复）。执行记录会保留。若为本目录最后一条活跃用例，列头也会重置。",
        confirmText: "移入回收站",
        danger: true,
      }).then(function (ok) {
        if (!ok) return;
        api("/api/case-management/cases/" + state.editingId + "?mode=trash", { method: "DELETE" })
          .then(function (data) {
            openDrawer(false);
            var tip = "已移入回收站";
            if (data && data.schema_reset) tip += "，目录列头已重置";
            toast(tip, "success");
            clearCaseSelection();
            return loadActiveSchema().then(loadCases);
          })
          .catch(function (err) { toast(err.message, "error"); });
      });
    });
    $("cm-exec-chips").addEventListener("click", function (e) {
      var btn = e.target.closest(".cm-exec-chip");
      if (!btn || btn.disabled) return;
      setDrawerExecResult(btn.getAttribute("data-result"));
    });
    var execPrev = $("cm-exec-prev");
    var execNext = $("cm-exec-next");
    if (execPrev) {
      execPrev.addEventListener("click", function () {
        if (state.execPage <= 1) return;
        loadExecutions(state.execPage - 1);
      });
    }
    if (execNext) {
      execNext.addEventListener("click", function () {
        loadExecutions((state.execPage || 1) + 1);
      });
    }
    $("cm-btn-add-exec").addEventListener("click", function () {
      if (!state.editingId) return;
      if (isViewerOnly()) return toast("只读成员无法登记执行", "error");
      api("/api/case-management/cases/" + state.editingId + "/executions", {
        method: "POST",
        body: JSON.stringify({
          result: $("cm-exec-result").value,
          comment: $("cm-exec-comment").value,
        }),
      })
        .then(function () {
          $("cm-exec-comment").value = "";
          setDrawerExecResult("pass");
          return loadCases().then(function () {
            openDrawer(false);
            toast("已记录", "success");
          });
        })
        .catch(function (err) { toast(err.message, "error"); });
    });
    $("cm-btn-export-excel").addEventListener("click", function () {
      if (!isProjectOwner()) return toast("仅项目负责人可导出 Excel", "error");
      ensureProjectAndSuiteReady().then(function (ok) {
        if (!ok) return;
        openExportSuitePicker();
      });
    });
    $("cm-export-suite-close").addEventListener("click", closeExportSuitePicker);
    $("cm-export-suite-cancel").addEventListener("click", closeExportSuitePicker);
    $("cm-export-suite-ok").addEventListener("click", confirmExportSuitePicker);
    $("cm-btn-import-excel").addEventListener("click", function () {
      ensureProjectAndSuiteReady().then(function (ok) {
        if (!ok) return;
        openImportSuitePicker("excel");
      });
    });
    $("cm-excel-file").addEventListener("change", function () {
      var file = this.files && this.files[0];
      this.value = "";
      if (!file || !state.projectId) return;
      if (!state.pendingImportSuiteId) {
        toast("请先选择导入目录", "error");
        return;
      }
      if (!window.CmSchemaUi) {
        toast("列结构组件未加载", "error");
        return;
      }
      window.CmSchemaUi.startExcelImport(
        state.projectId,
        state.pendingImportSuiteId,
        file,
        importHooks()
      );
    });
    $("cm-btn-import-wb").addEventListener("click", function () {
      ensureProjectAndSuiteReady().then(function (ok) {
        if (!ok) return;
        openWorkbenchSourceModal();
      });
    });
    $("cm-import-suite-close").addEventListener("click", closeImportSuitePicker);
    $("cm-import-suite-cancel").addEventListener("click", closeImportSuitePicker);
    $("cm-import-suite-create").addEventListener("click", createSuiteFromImportPicker);
    $("cm-import-suite-next").addEventListener("click", confirmImportSuitePicker);
    $("cm-import-suite-select").addEventListener("change", function () {
      $("cm-import-suite-next").disabled = !this.value;
    });
    $("cm-wb-close").addEventListener("click", function () {
      $("cm-wb-mask").classList.add("is-hidden");
      state.pendingWbSource = null;
      state.pendingImportMode = "";
      state.pendingImportSuiteId = "";
    });
    var wbFilter = $("cm-wb-filter");
    if (wbFilter && !wbFilter._cmWbBound) {
      wbFilter._cmWbBound = true;
      wbFilter.addEventListener("input", applyWbFilter);
    }
    if (window.CmSchemaUi && typeof window.CmSchemaUi.bindUi === "function") {
      window.CmSchemaUi.bindUi(importHooks());
    }
  }

  function refreshImportSuiteSelectUi() {
    var sel = $("cm-import-suite-select");
    if (!sel) return;
    if (window.CmFilterSelect && typeof window.CmFilterSelect.refresh === "function") {
      window.CmFilterSelect.refresh(sel);
    }
  }

  function closeExportSuitePicker() {
    var mask = $("cm-export-suite-mask");
    if (mask) mask.classList.add("is-hidden");
  }

  function fillExportSuiteSelect() {
    var sel = $("cm-export-suite-select");
    if (!sel) return;
    sel.innerHTML = "";
    var allOpt = document.createElement("option");
    allOpt.value = "__all__";
    allOpt.textContent = "全部用例";
    sel.appendChild(allOpt);
    walkSuitesDepthFirst(function (s) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = suitePathLabel(s.id);
      sel.appendChild(o);
    });
    var preferred =
      state.suiteFilter && String(state.suiteFilter).indexOf("__") !== 0
        ? state.suiteFilter
        : "__all__";
    if (preferred !== "__all__" && (state.suites || []).some(function (s) { return s.id === preferred; })) {
      sel.value = preferred;
    } else {
      sel.value = "__all__";
    }
    if (window.CmFilterSelect && typeof window.CmFilterSelect.refresh === "function") {
      window.CmFilterSelect.refresh(sel);
    }
  }

  function openExportSuitePicker() {
    if (!state.projectId) {
      cmAlert({ title: "提示", message: "请先创建项目", confirmText: "知道了" });
      return;
    }
    loadSuites()
      .then(function () {
        fillExportSuiteSelect();
        $("cm-export-suite-mask").classList.remove("is-hidden");
      })
      .catch(function (err) { toast(err.message, "error"); });
  }

  function confirmExportSuitePicker() {
    var sel = $("cm-export-suite-select");
    var suiteId = (sel && sel.value) || "__all__";
    if (!state.projectId) return;
    closeExportSuitePicker();
    var url =
      "/api/case-management/projects/" +
      encodeURIComponent(state.projectId) +
      "/export/excel?suite_id=" +
      encodeURIComponent(suiteId);
    window.location.href = url;
  }

  function closeImportSuitePicker() {
    var mask = $("cm-import-suite-mask");
    if (mask) mask.classList.add("is-hidden");
    state.pendingImportSuiteId = "";
    if (state.pendingImportMode === "excel") {
      state.pendingImportMode = "";
    }
    if (state.pendingImportMode === "workbench") {
      state.pendingWbSource = null;
      state.pendingImportMode = "";
    }
  }

  function fillImportSuiteSelect() {
    var sel = $("cm-import-suite-select");
    var empty = $("cm-import-suite-empty");
    var form = $("cm-import-suite-form");
    var next = $("cm-import-suite-next");
    if (!sel || !empty || !form || !next) return;
    sel.innerHTML = "";
    var suites = state.suites || [];
    if (!suites.length) {
      empty.classList.remove("is-hidden");
      form.classList.add("is-hidden");
      next.disabled = true;
      refreshImportSuiteSelectUi();
      return;
    }
    empty.classList.add("is-hidden");
    form.classList.remove("is-hidden");
    var preferred =
      state.suiteFilter && String(state.suiteFilter).indexOf("__") !== 0
        ? state.suiteFilter
        : "";
    walkSuitesDepthFirst(function (s) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = suitePathLabel(s.id);
      sel.appendChild(o);
    });
    if (preferred && suites.some(function (s) { return s.id === preferred; })) {
      sel.value = preferred;
    } else {
      sel.value = suites[0].id;
    }
    next.disabled = !sel.value;
    refreshImportSuiteSelectUi();
  }

  function openImportSuitePicker(mode, opts) {
    if (isViewerOnly()) return toast("只读成员无法导入", "error");
    if (!state.projectId) {
      cmAlert({ title: "提示", message: "请先创建项目", confirmText: "知道了" });
      return;
    }
    if (!(state.suites || []).length) {
      cmAlert({ title: "提示", message: "请先创建目录", confirmText: "知道了" });
      return;
    }
    opts = opts || {};
    state.pendingImportMode = mode;
    state.pendingImportSuiteId = "";
    if (mode !== "workbench") state.pendingWbSource = null;
    var title = $("cm-import-suite-title");
    var hint = $("cm-import-suite-hint");
    var next = $("cm-import-suite-next");
    var pageName = opts.pageName || "";
    var docName = opts.docName || "";
    if (title) {
      title.textContent = mode === "workbench" ? "选择导入目录 · 工作台" : "选择导入目录 · Excel";
    }
    if (hint) {
      if (mode === "workbench") {
        if (docName && pageName) {
          hint.textContent =
            "即将从文档「" + docName + "」导入页面「" + pageName + "」，请选择目标目录。";
        } else if (pageName) {
          hint.textContent = "即将导入「" + pageName + "」，请选择目标目录。";
        } else {
          hint.textContent = "请选择目标目录，用例将全部写入该目录。";
        }
      } else {
        hint.textContent = "请先选择目标目录，再选择 Excel 文件；用例将全部写入该目录。";
      }
    }
    if (next) next.textContent = mode === "workbench" ? "确认导入" : "选择文件";
    loadSuites()
      .then(function () {
        fillImportSuiteSelect();
        $("cm-import-suite-mask").classList.remove("is-hidden");
      })
      .catch(function (err) { toast(err.message, "error"); });
  }

  function createSuiteFromImportPicker() {
    if (!state.projectId) return toast("请先创建项目", "error");
    cmPrompt({
      title: "新建目录",
      message: "创建后即可继续导入；用例将写入该目录。",
      label: "目录名称",
      placeholder: "例如：订单结算",
      confirmText: "创建并选用",
    }).then(function (name) {
      if (!name) return;
      api("/api/case-management/projects/" + state.projectId + "/suites", {
        method: "POST",
        body: JSON.stringify({ name: name }),
      })
        .then(function (data) {
          var createdId = data && data.item && data.item.id;
          return loadSuites().then(function () {
            fillImportSuiteSelect();
            if (createdId) {
              var sel = $("cm-import-suite-select");
              sel.value = createdId;
              sel.dispatchEvent(new Event("change", { bubbles: true }));
              $("cm-import-suite-next").disabled = false;
              refreshImportSuiteSelectUi();
            }
            toast("目录已创建", "success");
          });
        })
        .catch(function (err) { toast(err.message, "error"); });
    });
  }

  function confirmImportSuitePicker() {
    var sel = $("cm-import-suite-select");
    var suiteId = sel && sel.value;
    if (!suiteId) return toast("请选择导入目录", "error");
    if (!(state.suites || []).length) return toast("请先创建目录", "error");
    var next = $("cm-import-suite-next");
    if (next && next.classList.contains("is-loading")) return;
    state.pendingImportSuiteId = suiteId;
    var mode = state.pendingImportMode;
    $("cm-import-suite-mask").classList.add("is-hidden");
    if (mode === "excel") {
      $("cm-excel-file").click();
      return;
    }
    if (mode === "workbench") {
      runWorkbenchImport();
    }
  }

  function runWorkbenchImport() {
    var src = state.pendingWbSource;
    if (!state.projectId) return toast("请先选择项目", "error");
    if (!src) return toast("请先选择要导入的需求页", "error");
    if (!state.pendingImportSuiteId) return toast("请先选择导入目录", "error");
    if (!window.CmSchemaUi) return toast("列结构组件未加载", "error");
    window.CmSchemaUi.startWorkbenchImport(
      state.projectId,
      state.pendingImportSuiteId,
      src,
      importHooks()
    );
  }

  function groupWorkbenchSources(items) {
    var groups = {};
    var order = [];
    (items || []).forEach(function (it) {
      var docId = String(it.lanhu_doc_id || "").trim();
      var pid = String(it.lanhu_pid || "").trim();
      var key = docId ? "doc:" + docId : pid ? "pid:" + pid : "misc";
      if (!groups[key]) {
        groups[key] = {
          key: key,
          doc_name: String(it.doc_name || "").trim() || (docId ? "文档 " + docId.slice(0, 8) : "未命名需求"),
          pages: [],
          row_total: 0,
          updated_at: "",
        };
        order.push(key);
      }
      var g = groups[key];
      g.pages.push(it);
      g.row_total += Number(it.row_count || 0) || 0;
      if (!g.updated_at || String(it.updated_at || "") > g.updated_at) {
        g.updated_at = String(it.updated_at || "");
      }
      var nm = String(it.doc_name || "").trim();
      if (nm && (!g.doc_name || /^文档\s/.test(g.doc_name) || g.doc_name === "未命名需求")) {
        g.doc_name = nm;
      }
    });
    return order.map(function (k) {
      return groups[k];
    });
  }

  function formatWbTime(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3] + " " + m[4] + ":" + m[5];
    return s;
  }

  function setWbDocTab(key) {
    var tabs = $("cm-wb-doc-tabs");
    var box = $("cm-wb-list");
    if (!tabs || !box) return;
    var buttons = tabs.querySelectorAll(".cm-wb-doc-tab");
    var panes = box.querySelectorAll(".cm-wb-pane");
    var active = key || "";
    if (!active) {
      var first = tabs.querySelector(".cm-wb-doc-tab:not(.is-hidden)");
      active = first ? first.getAttribute("data-doc-key") || "" : "";
    }
    buttons.forEach(function (btn) {
      var on = btn.getAttribute("data-doc-key") === active && !btn.classList.contains("is-hidden");
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    panes.forEach(function (pane) {
      var on = pane.getAttribute("data-doc-key") === active;
      pane.classList.toggle("is-hidden", !on);
    });
    applyWbFilter();
  }

  function applyWbFilter() {
    var input = $("cm-wb-filter");
    var q = ((input && input.value) || "").trim().toLowerCase();
    var tabs = $("cm-wb-doc-tabs");
    var box = $("cm-wb-list");
    if (!box) return;
    var activeKey = "";
    if (tabs) {
      var activeBtn = tabs.querySelector(".cm-wb-doc-tab.is-active:not(.is-hidden)");
      activeKey = activeBtn ? activeBtn.getAttribute("data-doc-key") || "" : "";
    }
    var activePane = null;
    box.querySelectorAll(".cm-wb-pane").forEach(function (pane) {
      if (pane.getAttribute("data-doc-key") === activeKey) activePane = pane;
    });
    if (!activePane) {
      var empty = box.querySelector(".cm-wb-filter-empty");
      if (empty) empty.classList.toggle("is-hidden", true);
      return;
    }
    var pageHit = 0;
    activePane.querySelectorAll(".cm-wb-item").forEach(function (row) {
      var pageName = (row.getAttribute("data-page-name") || "").toLowerCase();
      var show = !q || pageName.indexOf(q) >= 0;
      row.classList.toggle("is-hidden", !show);
      if (show) pageHit += 1;
    });
    var empty = box.querySelector(".cm-wb-filter-empty");
    if (empty) empty.classList.toggle("is-hidden", pageHit > 0);
  }

  function renderWorkbenchSources(items) {
    var tabs = $("cm-wb-doc-tabs");
    var box = $("cm-wb-list");
    if (!box) return;
    if (tabs) tabs.innerHTML = "";
    box.innerHTML = "";
    var groups = groupWorkbenchSources(items);
    if (!groups.length) {
      if (tabs) tabs.classList.add("is-hidden");
      box.innerHTML = '<p class="cm-wb-empty">工作台暂无可导入的用例数据</p>';
      return;
    }
    if (tabs) tabs.classList.remove("is-hidden");
    groups.forEach(function (g, gi) {
      if (tabs) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cm-wb-doc-tab" + (gi === 0 ? " is-active" : "");
        btn.setAttribute("role", "tab");
        btn.setAttribute("data-doc-key", g.key);
        btn.setAttribute("data-doc-name", g.doc_name || "");
        btn.setAttribute("aria-selected", gi === 0 ? "true" : "false");
        btn.title = g.doc_name || "未命名需求";
        var label = document.createElement("span");
        label.className = "cm-wb-doc-tab__label";
        label.textContent = g.doc_name || "未命名需求";
        var meta = document.createElement("span");
        meta.className = "cm-wb-doc-tab__meta";
        meta.textContent = g.pages.length + "页";
        btn.appendChild(label);
        btn.appendChild(meta);
        btn.addEventListener("click", function () {
          setWbDocTab(g.key);
        });
        tabs.appendChild(btn);
      }

      var pane = document.createElement("div");
      pane.className = "cm-wb-pane" + (gi === 0 ? "" : " is-hidden");
      pane.setAttribute("role", "tabpanel");
      pane.setAttribute("data-doc-key", g.key);
      pane.setAttribute("data-doc-name", g.doc_name || "");

      var pages = document.createElement("div");
      pages.className = "cm-wb-doc__pages";
      g.pages.forEach(function (it) {
        var pageName = it.page_name || it.lanhu_page_id || "未命名页";
        var row = document.createElement("div");
        row.className = "cm-wb-item";
        row.setAttribute("data-page-name", pageName);
        var main = document.createElement("div");
        main.className = "cm-wb-item__main";
        var title = document.createElement("strong");
        title.textContent = pageName;
        var metaLine = document.createElement("span");
        var timeText = formatWbTime(it.updated_at);
        metaLine.textContent =
          (it.row_count || 0) + " 条用例" + (timeText ? " · 更新于 " + timeText : "");
        main.appendChild(title);
        main.appendChild(metaLine);
        var btnImport = document.createElement("button");
        btnImport.type = "button";
        btnImport.className = "cm-btn cm-btn--primary cm-btn--sm";
        btnImport.textContent = "导入";
        btnImport.addEventListener("click", function () {
          state.pendingWbSource = {
            lanhu_pid: it.lanhu_pid,
            lanhu_doc_id: it.lanhu_doc_id,
            lanhu_page_id: it.lanhu_page_id,
            page_name: pageName,
            doc_name: g.doc_name,
          };
          openImportSuitePicker("workbench", {
            pageName: pageName,
            docName: g.doc_name,
          });
        });
        row.appendChild(main);
        row.appendChild(btnImport);
        pages.appendChild(row);
      });
      pane.appendChild(pages);
      box.appendChild(pane);
    });
    var filterEmpty = document.createElement("p");
    filterEmpty.className = "cm-wb-empty cm-wb-filter-empty is-hidden";
    filterEmpty.textContent = "当前文档下没有匹配的页面";
    box.appendChild(filterEmpty);
    setWbDocTab(groups[0].key);
  }

  function openWorkbenchSourceModal() {
    if (!state.projectId) {
      cmAlert({ title: "提示", message: "请先创建项目", confirmText: "知道了" });
      return;
    }
    if (!(state.suites || []).length) {
      cmAlert({ title: "提示", message: "请先创建目录", confirmText: "知道了" });
      return;
    }
    state.pendingWbSource = null;
    state.pendingImportMode = "";
    state.pendingImportSuiteId = "";
    var filter = $("cm-wb-filter");
    if (filter) filter.value = "";
    api("/api/case-management/import/workbench/sources")
      .then(function (data) {
        renderWorkbenchSources(data.items || []);
        $("cm-wb-mask").classList.remove("is-hidden");
      })
      .catch(function (err) {
        toast(err.message, "error");
      });
  }

  function layoutBgForViewport() {
    var root = document.documentElement;
    var icons = document.getElementById("cm-bg-icons");
    if (!icons) return;
    var vw = window.innerWidth || document.documentElement.clientWidth || 1200;
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    var contentMax = 1600;
    var sidePad = 28;
    var contentW = Math.min(contentMax, Math.max(280, vw - sidePad * 2));
    var blank = Math.max(0, vw - contentW);
    // 与 .cm-shell 一致：居中，左右各留约 28px 起的缝隙
    var leftGutter = Math.max(sidePad, Math.floor(blank / 2));
    var rightGutter = Math.max(sidePad, blank - leftGutter);
    var padTop = 14;
    var padBottom = Math.round(Math.min(158, Math.max(110, vh * 0.12 + 38)));
    var compact = leftGutter < 72 && rightGutter < 72;
    var icon;
    var edgeLeft;
    var edgeRight;

    if (compact) {
      icon = Math.round(Math.min(48, Math.max(36, Math.min(vw, vh) * 0.055)));
      edgeLeft = 10;
      edgeRight = 10;
      icons.classList.add("is-compact");
    } else {
      icon = Math.round(
        Math.min(92, Math.max(48, Math.min(Math.min(leftGutter, rightGutter) * 0.48, vh * 0.085)))
      );
      edgeLeft = Math.max(12, Math.round((leftGutter - icon) / 2));
      edgeRight = Math.max(12, Math.round((rightGutter - icon) / 2));
      icons.classList.remove("is-compact");
    }

    icons.style.setProperty("--cm-content-w", contentW + "px");
    icons.style.setProperty("--cm-gutter", leftGutter + "px");
    icons.style.setProperty("--cm-icon", icon + "px");
    icons.style.setProperty("--cm-pad-top", padTop + "px");
    icons.style.setProperty("--cm-pad-bottom", padBottom + "px");
    icons.style.setProperty("--cm-edge", edgeLeft + "px");
    icons.style.setProperty("--cm-edge-left", edgeLeft + "px");
    icons.style.setProperty("--cm-edge-right", edgeRight + "px");
    root.style.setProperty("--cm-vh", vh + "px");
    root.style.setProperty("--cm-vw", vw + "px");
    root.setAttribute("data-cm-res", vw + "x" + vh);
  }

  function bindGnavMegaPerf() {
    if (document.body.getAttribute("data-cm-mega-perf") === "1") return;
    document.body.setAttribute("data-cm-mega-perf", "1");

    function megaIsOpen() {
      return !!document.querySelector(".hf-gnav__mega-panel.is-open:not([hidden])");
    }

    function syncMegaOpenClass() {
      document.body.classList.toggle("cm-mega-open", megaIsOpen());
    }

    /* 捕获阶段先于顶栏脚本：打开前先标记；关闭/点选项后同步清除 */
    document.addEventListener(
      "click",
      function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-gnav-mega-btn]")) {
          document.body.classList.add("cm-mega-open");
          void document.body.offsetHeight;
        }
        window.requestAnimationFrame(syncMegaOpenClass);
      },
      true
    );

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") window.requestAnimationFrame(syncMegaOpenClass);
    });
  }

  function bindBgLayout() {
    layoutBgForViewport();
    var timer = null;
    window.addEventListener("resize", function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(layoutBgForViewport, 80);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(layoutBgForViewport, 80);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    try {
      bindGnavMegaPerf();
    } catch (err) {
      console.error("[case-management] bindGnavMegaPerf failed", err);
    }
    try {
      bindBgLayout();
    } catch (err) {
      console.error("[case-management] bindBgLayout failed", err);
    }
    try {
      bind();
    } catch (err) {
      console.error("[case-management] bind failed", err);
    }
    checkAuth()
      .then(function (ok) {
        if (!ok) {
          showGate(true);
          return;
        }
        showGate(false);
        if (window.CmMessagesUi && typeof window.CmMessagesUi.refreshUnread === "function") {
          window.CmMessagesUi.refreshUnread();
        }
        return refreshAll();
      })
      .catch(function (err) {
        console.error("[case-management] auth/init failed", err);
        showGate(true);
      });
  });
  window.CmCaseMgmt = {
    isProjectOwner: function () {
      return isProjectOwner();
    },
    isViewerOnly: function () {
      return isViewerOnly();
    },
    currentUserId: function () {
      return state.userId || "";
    },
    myRole: function () {
      return state.myRole || "";
    },
  };
})();
