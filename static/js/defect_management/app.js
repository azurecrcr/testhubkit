/**
 * 缺陷管理前端：团队项目门槛、列表、抽屉编辑、评论、关联用例。
 */
(function () {
  "use strict";

  var STATUS_LABEL = {
    open: "待处理",
    confirmed: "已确认",
    in_progress: "处理中",
    resolved: "已解决",
    closed: "已关闭",
    rejected: "已拒绝",
  };
  /** 与后端 defect_db.STATUS_TRANSITIONS 保持一致 */
  var STATUS_TRANSITIONS = {
    open: ["confirmed", "in_progress", "rejected", "closed"],
    confirmed: ["in_progress", "rejected", "closed"],
    in_progress: ["resolved", "closed"],
    resolved: ["closed", "in_progress"],
    rejected: ["open"],
    closed: ["open", "in_progress"],
  };
  var SEV_LABEL = {
    blocker: "阻塞",
    major: "严重",
    normal: "一般",
    minor: "次要",
    trivial: "细微",
  };

  var state = {
    loggedIn: false,
    userId: "",
    userDisplayName: "",
    projects: [],
    projectId: "",
    myRole: "",
    teamReady: false,
    members: [],
    items: [],
    total: 0,
    statusCounts: {},
    openSeverityCounts: {},
    page: 1,
    pageSize: 20,
    filters: {
      status: "",
      severity: "",
      assignee_id: "",
      q: "",
      assigned_to_me: false,
      unclosed: false,
      statKey: "",
    },
    editingId: null,
    editingNew: false,
    linkedCases: [],
    caseModalDraft: {},
    caseModalItems: [],
    caseModalSuites: [],
    caseModalSuiteId: "__all__",
    caseModalCollapsed: {},
    caseModalPage: 1,
    caseModalTotal: 0,
    caseModalPageSize: 10,
    selectedHandlerIds: [],
    activeId: "",
    commentItems: [],
    commentPage: 1,
    commentPageSize: 5,
    pendingInvites: [],
    primaryOwnerId: "",
    memberPickUserId: "",
    memberPickLabel: "",
    memberPickMeta: "",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function toast(msg, type) {
    if (window.HfFloatToast && typeof window.HfFloatToast.show === "function") {
      window.HfFloatToast.show(msg, type || "info");
      return;
    }
    console.log("[dm]", type || "info", msg);
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    if (opts.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(path, {
      credentials: "same-origin",
      headers: headers,
      method: opts.method || "GET",
      body: opts.body,
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || res.statusText || "请求失败");
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function currentProject() {
    return (state.projects || []).find(function (p) {
      return p.id === state.projectId;
    }) || null;
  }

  function isViewerOnly() {
    return state.myRole === "viewer";
  }

  function isOwner() {
    return state.myRole === "owner";
  }

  function canEdit() {
    return !!state.projectId && state.teamReady && !isViewerOnly();
  }

  function showPanel(which) {
    ["dm-login-gate", "dm-empty-projects", "dm-empty-team", "dm-workspace"].forEach(
      function (id) {
        var el = $(id);
        if (el) el.classList.toggle("is-hidden", id !== which);
      }
    );
  }

  function syncChrome() {
    var btnNew = $("dm-btn-new");
    if (btnNew) btnNew.disabled = !canEdit();
    var btnMembers = $("dm-btn-members");
    if (btnMembers) {
      btnMembers.disabled = !state.projectId;
      btnMembers.title = state.projectId ? "项目成员" : "请先选择项目";
    }
    var btnInvite = $("dm-btn-invite");
    if (btnInvite) btnInvite.disabled = !state.projectId;
  }

  function fillProjectSelect() {
    var sel = $("dm-project-select");
    if (!sel) return;
    sel.innerHTML = "";
    if (!state.projects.length) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "暂无项目";
      sel.appendChild(opt);
      syncFieldPick("dm-project-select");
      return;
    }
    state.projects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      var tag = p.team_ready ? "" : "（未组队）";
      opt.textContent = (p.name || p.id) + tag;
      sel.appendChild(opt);
    });
    if (state.projectId) sel.value = state.projectId;
    syncFieldPick("dm-project-select");
  }

  function personNickname(person) {
    if (!person) return "—";
    var nick = String(person.display_name || "").trim();
    if (nick) return nick;
    var label = String(person.label || "").trim();
    if (label) return label;
    return String(person.user_id || "").trim() || "—";
  }

  function setReporterDisplay(text) {
    var el = $("dm-f-reporter");
    if (el) el.textContent = text || "—";
  }

  function currentUserNickname() {
    var nick = String(state.userDisplayName || "").trim();
    if (nick) return nick;
    var me = (state.members || []).find(function (m) {
      return m.user_id === state.userId;
    });
    return personNickname(me);
  }

  function fillAssigneeFilters() {
    var filterSel = $("dm-filter-assignee");
    var opts = '<option value="">全部处理人</option>';
    (state.members || []).forEach(function (m) {
      var label = personNickname(m);
      if (label === "—") label = m.user_id;
      opts +=
        '<option value="' +
        m.user_id +
        '">' +
        escapeHtml(label) +
        "</option>";
    });
    if (filterSel) filterSel.innerHTML = opts;
    syncFieldPick("dm-filter-assignee");
    renderHandlersPanel();
    syncHandlersSummary();
  }

  function memberLabel(uid) {
    var m = (state.members || []).find(function (x) {
      return x.user_id === uid;
    });
    if (m) return m.label || m.display_name || m.email || uid;
    return uid;
  }

  function syncHandlersSummary() {
    var summary = $("dm-f-handlers-summary");
    if (!summary) return;
    var ids = state.selectedHandlerIds || [];
    if (!ids.length) {
      summary.className = "dm-multi__summary is-placeholder";
      summary.textContent = "选择处理人";
      return;
    }
    summary.className = "dm-multi__summary";
    summary.innerHTML = "";
    ids.forEach(function (id) {
      var name = memberLabel(id);
      var tag = document.createElement("span");
      tag.className = "dm-multi__tag";
      tag.title = name;
      var text = document.createElement("span");
      text.className = "dm-multi__tag-text";
      text.textContent = name;
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "dm-multi__tag-rm";
      rm.setAttribute("aria-label", "移除 " + name);
      rm.textContent = "×";
      rm.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        state.selectedHandlerIds = (state.selectedHandlerIds || []).filter(
          function (x) {
            return x !== id;
          }
        );
        renderHandlersPanel();
        syncHandlersSummary();
      });
      tag.appendChild(text);
      tag.appendChild(rm);
      summary.appendChild(tag);
    });
  }

  function renderHandlersPanel() {
    var panel = $("dm-f-handlers-panel");
    if (!panel) return;
    panel.innerHTML = "";
    var members = state.members || [];
    if (!members.length) {
      panel.innerHTML = '<div class="dm-multi__empty">暂无项目成员</div>';
      return;
    }
    members.forEach(function (m) {
      var uid = m.user_id;
      var label = m.label || m.display_name || m.email || uid;
      var opt = document.createElement("button");
      opt.type = "button";
      opt.className = "dm-multi__opt";
      var checked = (state.selectedHandlerIds || []).indexOf(uid) >= 0;
      if (checked) opt.classList.add("is-checked");
      opt.setAttribute("aria-pressed", checked ? "true" : "false");
      opt.innerHTML =
        '<span class="dm-multi__opt-text">' +
        escapeHtml(label) +
        "</span>" +
        (checked
          ? '<span class="dm-multi__opt-mark">已选</span>'
          : "");
      opt.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var list = (state.selectedHandlerIds || []).slice();
        var idx = list.indexOf(uid);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(uid);
        state.selectedHandlerIds = list;
        renderHandlersPanel();
        syncHandlersSummary();
      });
      panel.appendChild(opt);
    });
  }

  function setHandlersOpen(open) {
    var wrap = $("dm-f-handlers");
    var panel = $("dm-f-handlers-panel");
    var btn = $("dm-f-handlers-btn");
    if (!wrap || !panel || !btn) return;
    if (open) closeAllFieldPicks("dm-f-handlers");
    wrap.classList.toggle("is-open", !!open);
    panel.classList.toggle("is-hidden", !open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function applyStatusOptions(currentStatus) {
    var sel = $("dm-f-status");
    if (!sel) return;
    var cur = String(currentStatus || "open").toLowerCase();
    if (!STATUS_LABEL[cur]) cur = "open";
    var allowed = STATUS_TRANSITIONS[cur] || [];
    var keep = {};
    keep[cur] = true;
    allowed.forEach(function (s) {
      keep[s] = true;
    });
    var order = ["open", "confirmed", "in_progress", "resolved", "closed", "rejected"];
    sel.innerHTML = "";
    order.forEach(function (s) {
      if (!keep[s]) return;
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = STATUS_LABEL[s] || s;
      sel.appendChild(opt);
    });
    sel.value = cur;
  }

  function setSelectedHandlers(ids) {
    state.selectedHandlerIds = (ids || []).filter(Boolean);
    renderHandlersPanel();
    syncHandlersSummary();
  }

  var FIELD_PICKS = [
    { selectId: "dm-f-severity", pickId: "dm-pick-severity" },
    { selectId: "dm-f-status", pickId: "dm-pick-status" },
    { selectId: "dm-project-select", pickId: "dm-pick-project" },
    { selectId: "dm-filter-severity", pickId: "dm-pick-filter-severity" },
    { selectId: "dm-filter-assignee", pickId: "dm-pick-filter-assignee" },
  ];

  function pickIds(pickId) {
    return {
      wrap: $(pickId),
      btn: $(pickId + "-btn"),
      panel: $(pickId + "-panel"),
      summary: $(pickId + "-summary"),
    };
  }

  function closeAllFieldPicks(exceptId) {
    FIELD_PICKS.forEach(function (p) {
      if (exceptId && p.pickId === exceptId) return;
      setFieldPickOpen(p.pickId, false);
    });
    if (exceptId !== "dm-f-handlers") setHandlersOpen(false);
  }

  function setFieldPickOpen(pickId, open) {
    var el = pickIds(pickId);
    if (!el.wrap || !el.panel || !el.btn) return;
    if (open) closeAllFieldPicks(pickId);
    el.wrap.classList.toggle("is-open", !!open);
    el.panel.classList.toggle("is-hidden", !open);
    el.btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function syncFieldPick(selectId) {
    var conf = FIELD_PICKS.find(function (p) {
      return p.selectId === selectId;
    });
    if (!conf) return;
    var sel = $(selectId);
    var el = pickIds(conf.pickId);
    if (!sel || !el.summary) return;
    var opt = sel.options[sel.selectedIndex];
    var text = opt ? opt.text : "请选择";
    var emptyVal = !opt || !String(opt.value || "").trim();
    el.summary.className =
      "dm-multi__summary" +
      (selectId === "dm-project-select" && emptyVal ? " is-placeholder" : "");
    el.summary.textContent = text;
    renderFieldPickPanel(conf);
  }

  function renderFieldPickPanel(conf) {
    var sel = $(conf.selectId);
    var panel = $(conf.pickId + "-panel");
    if (!sel || !panel) return;
    panel.innerHTML = "";
    if (!sel.options.length) {
      panel.innerHTML = '<div class="dm-multi__empty">暂无选项</div>';
      return;
    }
    Array.prototype.forEach.call(sel.options, function (opt) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dm-multi__opt";
      var checked = opt.value === sel.value;
      if (checked) btn.classList.add("is-checked");
      btn.setAttribute("aria-pressed", checked ? "true" : "false");
      btn.innerHTML =
        '<span class="dm-multi__opt-text">' +
        escapeHtml(opt.text) +
        "</span>" +
        (checked ? '<span class="dm-multi__opt-mark" aria-hidden="true"></span>' : "");
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (sel.disabled) return;
        if (opt.value === sel.value) {
          setFieldPickOpen(conf.pickId, false);
          return;
        }
        sel.value = opt.value;
        syncFieldPick(conf.selectId);
        setFieldPickOpen(conf.pickId, false);
        try {
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (err) {
          var ev = document.createEvent("HTMLEvents");
          ev.initEvent("change", true, false);
          sel.dispatchEvent(ev);
        }
      });
      panel.appendChild(btn);
    });
  }

  function setFieldPickDisabled(selectId, disabled) {
    var conf = FIELD_PICKS.find(function (p) {
      return p.selectId === selectId;
    });
    if (!conf) return;
    var sel = $(selectId);
    var btn = $(conf.pickId + "-btn");
    if (sel) sel.disabled = !!disabled;
    if (btn) {
      btn.classList.toggle("is-disabled", !!disabled);
      btn.setAttribute("aria-disabled", disabled ? "true" : "false");
      btn.tabIndex = disabled ? -1 : 0;
    }
    if (disabled) setFieldPickOpen(conf.pickId, false);
  }

  function bindFieldPicks() {
    FIELD_PICKS.forEach(function (conf) {
      renderFieldPickPanel(conf);
      syncFieldPick(conf.selectId);
      var btn = $(conf.pickId + "-btn");
      if (!btn) return;
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.classList.contains("is-disabled")) return;
        var open = !$(conf.pickId).classList.contains("is-open");
        setFieldPickOpen(conf.pickId, open);
      });
      btn.addEventListener("keydown", function (e) {
        if (this.classList.contains("is-disabled")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.click();
        }
      });
    });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadProjects() {
    return api("/api/defect-management/projects").then(function (data) {
      state.projects = data.items || [];
      var params = new URLSearchParams(window.location.search || "");
      var fromUrl = params.get("project_id") || "";
      if (fromUrl && state.projects.some(function (p) { return p.id === fromUrl; })) {
        state.projectId = fromUrl;
      } else if (
        !state.projectId ||
        !state.projects.some(function (p) {
          return p.id === state.projectId;
        })
      ) {
        state.projectId = state.projects[0] ? state.projects[0].id : "";
      }
      fillProjectSelect();
      return applyProjectGate();
    });
  }

  function applyProjectGate() {
    syncChrome();
    if (!state.projects.length) {
      showPanel("dm-empty-projects");
      return Promise.resolve();
    }
    var proj = currentProject();
    state.myRole = (proj && proj.my_role) || "";
    state.teamReady = !!(proj && proj.team_ready);
    state.primaryOwnerId = (proj && proj.user_id) || state.primaryOwnerId || "";
    syncChrome();
    if (!state.teamReady) {
      showPanel("dm-empty-team");
      return loadMembers().then(function () {});
    }
    showPanel("dm-workspace");
    return loadMembers().then(function () {
      return loadDefects();
    });
  }

  function loadMembers() {
    if (!state.projectId) {
      state.members = [];
      fillAssigneeFilters();
      return Promise.resolve();
    }
    return api("/api/defect-management/projects/" + state.projectId + "/members").then(
      function (data) {
        state.members = data.items || [];
        if (data.my_role) state.myRole = data.my_role;
        if (typeof data.team_ready === "boolean") state.teamReady = data.team_ready;
        fillAssigneeFilters();
      }
    );
  }

  function roleLabel(role) {
    var map = { owner: "负责人", editor: "编辑", viewer: "只读" };
    return map[role] || role || "—";
  }

  function syncMembersInviteUi() {
    var box = $("dm-members-invite");
    if (box) box.classList.toggle("is-hidden", !isOwner());
    var hint = $("dm-members-hint");
    if (hint) {
      if (!state.projectId) {
        hint.textContent = "请先选择项目";
      } else if (!isOwner()) {
        hint.textContent =
          "当前角色为「" + roleLabel(state.myRole) + "」，仅负责人可邀请成员";
      } else if (!state.teamReady) {
        hint.textContent = "邀请至少一名成员组成团队后即可使用缺陷管理";
      } else {
        hint.textContent = "邀请站内账号一起协作本项目缺陷";
      }
    }
    var picked = $("dm-members-picked");
    var nameEl = $("dm-members-picked-name");
    var metaEl = $("dm-members-picked-meta");
    var btn = $("dm-members-invite-btn");
    var has = !!state.memberPickUserId;
    if (picked) picked.classList.toggle("is-hidden", !has);
    if (nameEl) nameEl.textContent = state.memberPickLabel || "";
    if (metaEl) metaEl.textContent = state.memberPickMeta || "";
    if (btn) btn.disabled = !has || !isOwner();
  }

  function renderMembersModalList() {
    var tbody = $("dm-members-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    var countEl = $("dm-members-count");
    var pending = state.pendingInvites || [];
    var members = state.members || [];
    if (countEl) {
      countEl.textContent =
        members.length +
        " 人" +
        (pending.length ? " · 待确认 " + pending.length : "");
    }
    var canManage = isOwner();
    var primaryId = state.primaryOwnerId || "";
    if (!members.length && !pending.length) {
      var tr0 = document.createElement("tr");
      tr0.innerHTML =
        '<td colspan="3" style="text-align:center;color:#94a3b8;padding:1rem">暂无成员</td>';
      tbody.appendChild(tr0);
      return;
    }
    members.forEach(function (m) {
      var tr = document.createElement("tr");
      var name =
        personNickname(m) !== "—"
          ? personNickname(m)
          : m.label || m.email || m.user_id;
      if (m.user_id === primaryId) name += "（负责人）";
      var tdName = document.createElement("td");
      tdName.textContent = name;
      tr.appendChild(tdName);

      var tdRole = document.createElement("td");
      if (canManage && m.user_id !== primaryId && m.role !== "owner") {
        var sel = document.createElement("select");
        sel.className = "dm-select";
        sel.setAttribute("aria-label", "修改角色");
        [
          { value: "editor", label: "编辑" },
          { value: "viewer", label: "只读" },
        ].forEach(function (r) {
          var o = document.createElement("option");
          o.value = r.value;
          o.textContent = r.label;
          if (r.value === m.role) o.selected = true;
          sel.appendChild(o);
        });
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
              return refreshMembersModal();
            })
            .catch(function (err) {
              toast(err.message, "error");
              refreshMembersModal();
            });
        });
        tdRole.appendChild(sel);
      } else {
        var badge = document.createElement("span");
        badge.className =
          "dm-members-role-badge dm-members-role-badge--" + (m.role || "viewer");
        badge.textContent = roleLabel(m.role);
        tdRole.appendChild(badge);
      }
      tr.appendChild(tdRole);

      var tdAct = document.createElement("td");
      if (canManage && m.user_id !== primaryId && m.role !== "owner") {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dm-btn dm-btn--danger dm-btn--sm";
        btn.textContent = "移除";
        btn.addEventListener("click", function () {
          if (!window.confirm("确定移除「" + name + "」？")) return;
          api(
            "/api/case-management/projects/" +
              state.projectId +
              "/members/" +
              encodeURIComponent(m.user_id),
            { method: "DELETE" }
          )
            .then(function () {
              toast("已移除", "success");
              return afterMembersChanged();
            })
            .catch(function (err) {
              toast(err.message, "error");
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
      var label =
        (inv.invitee && (inv.invitee.display_name || inv.invitee.label)) ||
        inv.invitee_user_id ||
        "待确认用户";
      var tdName = document.createElement("td");
      tdName.textContent = label;
      tr.appendChild(tdName);
      var tdRole = document.createElement("td");
      var badge = document.createElement("span");
      badge.className = "dm-members-role-badge dm-members-role-badge--pending";
      badge.textContent = "待确认 · " + roleLabel(inv.role);
      tdRole.appendChild(badge);
      tr.appendChild(tdRole);
      var tdAct = document.createElement("td");
      if (canManage) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dm-btn dm-btn--ghost dm-btn--sm";
        btn.textContent = "取消邀请";
        btn.addEventListener("click", function () {
          api(
            "/api/case-management/projects/" +
              state.projectId +
              "/invites/" +
              encodeURIComponent(inv.id),
            { method: "DELETE" }
          )
            .then(function () {
              toast("已取消邀请", "success");
              return refreshMembersModal();
            })
            .catch(function (err) {
              toast(err.message, "error");
            });
        });
        tdAct.appendChild(btn);
      } else {
        tdAct.textContent = "—";
      }
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  function refreshMembersModal() {
    if (!state.projectId) return Promise.resolve();
    return api("/api/case-management/projects/" + state.projectId + "/members").then(
      function (data) {
        state.members = data.items || [];
        state.pendingInvites = data.pending_invites || [];
        if (data.my_role) state.myRole = data.my_role;
        if (data.primary_owner_id) state.primaryOwnerId = String(data.primary_owner_id);
        fillAssigneeFilters();
        renderMembersModalList();
        syncMembersInviteUi();
      }
    );
  }

  function afterMembersChanged() {
    return refreshMembersModal().then(function () {
      return loadProjects();
    });
  }

  function openMembersModal() {
    if (!state.projectId) return toast("请先选择项目", "error");
    state.memberPickUserId = "";
    state.memberPickLabel = "";
    state.memberPickMeta = "";
    if ($("dm-members-q")) $("dm-members-q").value = "";
    var list = $("dm-members-search-list");
    if (list) {
      list.innerHTML = "";
      list.classList.add("is-empty");
    }
    syncMembersInviteUi();
    $("dm-members-mask").classList.remove("is-hidden");
    refreshMembersModal().catch(function (err) {
      toast(err.message || "加载成员失败", "error");
    });
  }

  function closeMembersModal() {
    var mask = $("dm-members-mask");
    if (!mask || mask.classList.contains("is-hidden")) return;
    mask.classList.add("is-hidden");
    state.memberPickUserId = "";
    state.memberPickLabel = "";
    state.memberPickMeta = "";
    loadProjects().catch(function () {});
  }

  function searchMembersUsers() {
    if (!isOwner()) return toast("仅负责人可邀请成员", "error");
    var q = (($("dm-members-q") && $("dm-members-q").value) || "").trim();
    var box = $("dm-members-search-list");
    if (!box) return;
    if (!q) {
      box.innerHTML = '<p class="dm-members-search-empty">请输入完整邮箱或手机号后搜索</p>';
      box.classList.remove("is-empty");
      return;
    }
    box.innerHTML = '<p class="dm-members-search-empty">搜索中…</p>';
    box.classList.remove("is-empty");
    api("/api/case-management/users/search?q=" + encodeURIComponent(q))
      .then(function (data) {
        var items = data.items || [];
        box.innerHTML = "";
        if (!items.length) {
          box.innerHTML =
            '<p class="dm-members-search-empty">未找到该邮箱或手机号对应的用户</p>';
          return;
        }
        var onlySelf =
          items.length === 1 &&
          String(items[0].id || items[0].user_id || "") === String(state.userId || "");
        if (onlySelf) {
          box.innerHTML =
            '<p class="dm-members-search-empty">这是你自己的账号</p>';
          toast("不能邀请自己，请搜索其他成员的邮箱或手机号", "error");
          return;
        }
        items.forEach(function (u) {
          var uid = String(u.id || u.user_id || "");
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "dm-members-search-item";
          var label =
            u.display_name || u.label || u.email || u.phone_masked || u.id;
          var meta = u.email || u.phone_masked || "";
          btn.innerHTML =
            "<strong>" +
            escapeHtml(label) +
            '</strong><span class="dm-members-search-item__meta">' +
            escapeHtml(meta) +
            "</span>";
          btn.addEventListener("click", function () {
            if (uid && uid === String(state.userId || "")) {
              toast("不能邀请自己，请选择其他成员", "error");
              return;
            }
            if (isAlreadyProjectMember(uid)) {
              toast("该用户已在项目中，无需重复邀请", "error");
              return;
            }
            if (isPendingInvitee(uid)) {
              toast("已向该用户发送过邀请，请等待对方确认，勿重复邀请", "error");
              return;
            }
            state.memberPickUserId = uid;
            state.memberPickLabel = label;
            state.memberPickMeta = meta;
            Array.prototype.forEach.call(
              box.querySelectorAll(".dm-members-search-item"),
              function (el) {
                el.classList.toggle("is-active", el === btn);
              }
            );
            syncMembersInviteUi();
          });
          box.appendChild(btn);
        });
      })
      .catch(function (err) {
        box.innerHTML =
          '<p class="dm-members-search-empty">' +
          escapeHtml(err.message || "搜索失败") +
          "</p>";
      });
  }

  function isAlreadyProjectMember(userId) {
    var uid = String(userId || "");
    if (!uid) return false;
    return (state.members || []).some(function (m) {
      return String(m.user_id || "") === uid;
    });
  }

  function isPendingInvitee(userId) {
    var uid = String(userId || "");
    if (!uid) return false;
    return (state.pendingInvites || []).some(function (inv) {
      return String(inv.invitee_user_id || (inv.invitee && inv.invitee.user_id) || "") === uid;
    });
  }

  function inviteSelectedMember() {
    if (!isOwner()) return toast("仅负责人可邀请成员", "error");
    if (!state.memberPickUserId) return toast("请先搜索并选择用户", "error");
    if (String(state.memberPickUserId) === String(state.userId || "")) {
      return toast("不能邀请自己，请搜索其他成员的邮箱或手机号", "error");
    }
    if (isAlreadyProjectMember(state.memberPickUserId)) {
      return toast("该用户已在项目中，无需重复邀请", "error");
    }
    if (isPendingInvitee(state.memberPickUserId)) {
      return toast("已向该用户发送过邀请，请等待对方确认，勿重复邀请", "error");
    }
    var role = (($("dm-members-role") && $("dm-members-role").value) || "editor").trim();
    var btn = $("dm-members-invite-btn");
    if (btn) btn.disabled = true;
    api("/api/case-management/projects/" + state.projectId + "/members", {
      method: "POST",
      body: JSON.stringify({ user_id: state.memberPickUserId, role: role }),
    })
      .then(function () {
        toast("邀请已发送", "success");
        state.memberPickUserId = "";
        state.memberPickLabel = "";
        state.memberPickMeta = "";
        if ($("dm-members-q")) $("dm-members-q").value = "";
        var list = $("dm-members-search-list");
        if (list) {
          list.innerHTML = "";
          list.classList.add("is-empty");
        }
        syncMembersInviteUi();
        return afterMembersChanged();
      })
      .catch(function (err) {
        var msg = err.message || "邀请失败";
        if (/已是项目成员|已经是/.test(msg)) {
          msg = "该用户已在项目中，无需重复邀请";
        } else if (/已向该用户发送|等待对方确认|pending/i.test(msg)) {
          msg = "已向该用户发送过邀请，请等待对方确认，勿重复邀请";
        } else if (/不能邀请自己/.test(msg)) {
          msg = "不能邀请自己，请搜索其他成员的邮箱或手机号";
        }
        toast(msg, "error");
      })
      .then(function () {
        syncMembersInviteUi();
      });
  }

  function loadDefects() {
    if (!state.projectId || !state.teamReady) return Promise.resolve();
    var qs = new URLSearchParams();
    qs.set("page", String(state.page));
    qs.set("page_size", String(state.pageSize));
    if (state.filters.status) qs.set("status", state.filters.status);
    if (state.filters.severity) qs.set("severity", state.filters.severity);
    if (state.filters.assignee_id) qs.set("assignee_id", state.filters.assignee_id);
    if (state.filters.q) qs.set("q", state.filters.q);
    if (state.filters.assigned_to_me) qs.set("assigned_to_me", "1");
    if (state.filters.unclosed && !state.filters.status) qs.set("unclosed", "1");
    return api(
      "/api/defect-management/projects/" + state.projectId + "/defects?" + qs.toString()
    ).then(function (data) {
      state.items = data.items || [];
      state.total = data.total || 0;
      state.page = data.page || state.page;
      state.statusCounts = data.status_counts || {};
      state.openSeverityCounts = data.open_severity_counts || {};
      renderOverview();
      renderTable();
    });
  }

  function renderOverview() {
    var counts = state.statusCounts || {};
    var all = 0;
    Object.keys(counts).forEach(function (k) {
      all += Number(counts[k] || 0) || 0;
    });
    var setCount = function (key, n) {
      var el = document.querySelector('.dm-side-count[data-count-for="' + key + '"]');
      if (el) el.textContent = String(n);
    };
    setCount("all", all);
    ["open", "confirmed", "in_progress", "resolved", "closed", "rejected"].forEach(
      function (st) {
        setCount(st, Number(counts[st] || 0) || 0);
      }
    );
    var sev = state.openSeverityCounts || {};
    var openN =
      (Number(counts.open) || 0) +
      (Number(counts.confirmed) || 0) +
      (Number(counts.in_progress) || 0) +
      (Number(counts.resolved) || 0);
    var blockerN = Number(sev.blocker || 0) || 0;
    var majorN = Number(sev.major || 0) || 0;
    var restN =
      (Number(sev.normal) || 0) +
      (Number(sev.minor) || 0) +
      (Number(sev.trivial) || 0);
    var openEl = $("dm-stat-open-n");
    var blockerEl = $("dm-stat-blocker-n");
    var majorEl = $("dm-stat-major-n");
    var normalEl = $("dm-stat-normal-n");
    if (openEl) openEl.textContent = String(openN);
    if (blockerEl) blockerEl.textContent = String(blockerN);
    if (majorEl) majorEl.textContent = String(majorN);
    if (normalEl) normalEl.textContent = String(restN);
    Array.prototype.forEach.call(document.querySelectorAll(".dm-stat"), function (btn) {
      var key = btn.id || "";
      var active =
        (key === "dm-stat-open" && state.filters.statKey === "open") ||
        (key === "dm-stat-blocker" && state.filters.statKey === "blocker") ||
        (key === "dm-stat-major" && state.filters.statKey === "major") ||
        (key === "dm-stat-normal" && state.filters.statKey === "lte_normal");
      btn.classList.toggle("is-active", !!active);
    });
  }

  function applyStatFilter(key) {
    state.filters.statKey = key || "";
    state.filters.status = "";
    state.filters.assigned_to_me = false;
    if ($("dm-filter-mine")) $("dm-filter-mine").classList.remove("is-active");
    Array.prototype.forEach.call(
      ($("dm-side-status") && $("dm-side-status").querySelectorAll("button")) || [],
      function (el) {
        el.classList.toggle("is-active", (el.getAttribute("data-status") || "") === "");
      }
    );
    if (key === "open") {
      state.filters.unclosed = true;
      state.filters.severity = "";
    } else if (key === "blocker") {
      state.filters.unclosed = true;
      state.filters.severity = "blocker";
    } else if (key === "major") {
      state.filters.unclosed = true;
      state.filters.severity = "major";
    } else if (key === "lte_normal") {
      state.filters.unclosed = true;
      state.filters.severity = "normal,minor,trivial";
    } else {
      state.filters.unclosed = false;
      state.filters.severity = "";
    }
    if ($("dm-filter-severity")) {
      // 多严重度时下拉显示「全部」；单值时同步
      var single =
        state.filters.severity.indexOf(",") >= 0 ? "" : state.filters.severity;
      $("dm-filter-severity").value = single;
      syncFieldPick("dm-filter-severity");
    }
    state.page = 1;
    return loadDefects();
  }

  function resetListFilters() {
    state.filters.q = "";
    state.filters.status = "";
    state.filters.severity = "";
    state.filters.assignee_id = "";
    state.filters.assigned_to_me = false;
    state.filters.unclosed = false;
    state.filters.statKey = "";
    state.page = 1;
    if ($("dm-q")) $("dm-q").value = "";
    if ($("dm-filter-severity")) {
      $("dm-filter-severity").value = "";
      syncFieldPick("dm-filter-severity");
    }
    if ($("dm-filter-assignee")) {
      $("dm-filter-assignee").value = "";
      syncFieldPick("dm-filter-assignee");
    }
    if ($("dm-filter-mine")) $("dm-filter-mine").classList.remove("is-active");
    Array.prototype.forEach.call(
      ($("dm-side-status") && $("dm-side-status").querySelectorAll("button")) || [],
      function (el) {
        el.classList.toggle(
          "is-active",
          (el.getAttribute("data-status") || "") === ""
        );
      }
    );
    renderOverview();
  }

  function applyDropdownFilters() {
    state.filters.severity =
      ($("dm-filter-severity") && $("dm-filter-severity").value) || "";
    state.filters.assignee_id =
      ($("dm-filter-assignee") && $("dm-filter-assignee").value) || "";
    state.filters.unclosed = false;
    state.filters.statKey = "";
    if (state.filters.assignee_id) {
      state.filters.assigned_to_me = false;
      if ($("dm-filter-mine")) $("dm-filter-mine").classList.remove("is-active");
    }
    state.page = 1;
    renderOverview();
    return loadDefects();
  }

  function hasActiveListFilters() {
    return !!(
      state.filters.q ||
      state.filters.status ||
      state.filters.severity ||
      state.filters.assignee_id ||
      state.filters.assigned_to_me ||
      state.filters.unclosed ||
      state.filters.statKey
    );
  }

  function renderListEmpty() {
    var wrap = $("dm-table-wrap");
    var empty = $("dm-list-empty");
    if (!empty) return;
    var filtered = hasActiveListFilters();
    var actions = filtered
      ? '<div class="dm-list-empty__actions">' +
        '<button type="button" class="dm-btn dm-btn--ghost dm-btn--sm" data-dm-empty-action="reset">清除筛选</button>' +
        "</div>"
      : '<div class="dm-list-empty__actions">' +
        '<button type="button" class="dm-btn dm-btn--primary dm-btn--sm" data-dm-empty-action="create"' +
        ($("dm-btn-new") && $("dm-btn-new").disabled ? " disabled" : "") +
        ">新建缺陷</button>" +
        "</div>";
    empty.innerHTML =
      '<div class="dm-list-empty__inner">' +
      '<div class="dm-list-empty__icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 5h6"/><path d="M8 5.5V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8v.7"/>' +
      '<rect x="5.5" y="5" width="13" height="15.5" rx="2.2"/>' +
      '<path d="M9 11h6M9 14.5h4"/>' +
      "</svg></div>" +
      '<p class="dm-list-empty__title">' +
      (filtered ? "当前筛选下暂无缺陷" : "暂无缺陷") +
      "</p>" +
      '<p class="dm-list-empty__desc">' +
      (filtered
        ? "可以清除筛选条件，或调整左侧状态 / 上方筛选后再试"
        : "还没有登记缺陷，创建一个开始跟踪问题") +
      "</p>" +
      actions +
      "</div>";
    empty.classList.remove("is-hidden");
    empty.hidden = false;
    if (wrap) wrap.classList.add("is-empty");
    var actionBtn = empty.querySelector("[data-dm-empty-action]");
    if (actionBtn) {
      actionBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var act = actionBtn.getAttribute("data-dm-empty-action");
        if (act === "reset") {
          resetListFilters();
          loadDefects().catch(function (err) {
            toast(err.message, "error");
          });
          return;
        }
        if (act === "create" && $("dm-btn-new") && !$("dm-btn-new").disabled) {
          $("dm-btn-new").click();
        }
      });
    }
  }

  function hideListEmpty() {
    var wrap = $("dm-table-wrap");
    var empty = $("dm-list-empty");
    if (empty) {
      empty.classList.add("is-hidden");
      empty.hidden = true;
      empty.innerHTML = "";
    }
    if (wrap) wrap.classList.remove("is-empty");
  }

  function renderTable() {
    var tbody = $("dm-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!state.items.length) {
      renderListEmpty();
    } else {
      hideListEmpty();
      state.items.forEach(function (item) {
        var tr = document.createElement("tr");
        if (item.id === state.activeId) tr.classList.add("is-active");
        tr.innerHTML =
          '<td class="dm-col-id">' +
          escapeHtml(item.display_id || "") +
          '</td><td class="dm-col-title">' +
          escapeHtml(item.title || "") +
          '</td><td class="dm-col-sev dm-sev--' +
          escapeHtml(item.severity || "") +
          '">' +
          escapeHtml(SEV_LABEL[item.severity] || item.severity || "") +
          '</td><td class="dm-col-status"><span class="dm-badge dm-badge--' +
          escapeHtml(item.status || "") +
          '">' +
          escapeHtml(STATUS_LABEL[item.status] || item.status || "") +
          "</span></td><td>" +
          escapeHtml(personNickname(item.reporter)) +
          "</td><td>" +
          (function () {
            var handlers = item.handlers || [];
            if (!handlers.length) return "—";
            return (
              '<span class="dm-handler-tags">' +
              handlers
                .map(function (h) {
                  return (
                    '<span class="dm-handler-tag">' +
                    escapeHtml(personNickname(h)) +
                    "</span>"
                  );
                })
                .join("") +
              "</span>"
            );
          })() +
          '</td><td class="dm-col-time">' +
          escapeHtml(item.updated_at || "") +
          "</td>";
        tr.addEventListener("click", function () {
          openDrawer(item.id);
        });
        tbody.appendChild(tr);
      });
    }
    var info = $("dm-pager-info");
    if (info) {
      var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
      info.textContent =
        "共 " + state.total + " 条 · 第 " + state.page + "/" + pages + " 页";
    }
  }

  function setDrawerTab(tab) {
    var name = tab === "activity" ? "activity" : "detail";
    var tabActivity = $("dm-tab-activity");
    if (name === "activity" && tabActivity && tabActivity.classList.contains("is-hidden")) {
      name = "detail";
    }
    ["detail", "activity"].forEach(function (key) {
      var btn = $("dm-tab-" + key);
      var pane = $("dm-pane-" + key);
      var on = key === name;
      if (btn) {
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      }
      if (pane) pane.classList.toggle("is-hidden", !on);
    });
  }

  function openDrawer(id) {
    state.editingNew = !id;
    state.editingId = id || null;
    state.linkedCases = [];
    $("dm-drawer-mask").classList.remove("is-hidden");
    $("dm-drawer-title").textContent = state.editingNew ? "新建缺陷" : "缺陷详情";
    var drawerSub = $("dm-drawer-sub");
    if (drawerSub) {
      drawerSub.textContent = state.editingNew
        ? "填写基本信息后保存"
        : "查看与编辑缺陷内容";
    }
    $("dm-btn-delete").classList.toggle("is-hidden", state.editingNew || !isOwner());
    var exportBtn = $("dm-l5-btn-export");
    if (exportBtn) {
      exportBtn.classList.toggle("is-hidden", !!state.editingNew || !isOwner());
    }
    $("dm-comments-block").classList.toggle("is-hidden", state.editingNew);
    var tabActivity = $("dm-tab-activity");
    if (tabActivity) tabActivity.classList.toggle("is-hidden", state.editingNew);
    setDrawerTab("detail");
    setFormReadonly(!canEdit());
    setFieldPickDisabled("dm-f-status", state.editingNew || !canEdit());

    if (state.editingNew) {
      $("dm-f-title").value = "";
      $("dm-f-desc").value = "";
      $("dm-f-severity").value = "normal";
      applyStatusOptions("open");
      $("dm-f-status").value = "open";
      syncFieldPick("dm-f-severity");
      syncFieldPick("dm-f-status");
      setReporterDisplay(currentUserNickname());
      setSelectedHandlers([]);
      renderCaseChips();
      $("dm-comments").innerHTML = "";
      state.commentItems = [];
      state.commentPage = 1;
      var pager = $("dm-comments-pager");
      if (pager) pager.classList.add("is-hidden");
      return;
    }

    state.activeId = id;
    renderTable();
    api("/api/defect-management/defects/" + id)
      .then(function (data) {
        var item = data.item || {};
        $("dm-f-title").value = item.title || "";
        $("dm-f-desc").value = item.description || "";
        $("dm-f-severity").value = item.severity || "normal";
        applyStatusOptions(item.status || "open");
        $("dm-f-status").value = item.status || "open";
        syncFieldPick("dm-f-severity");
        syncFieldPick("dm-f-status");
        setReporterDisplay(personNickname(item.reporter));
        setSelectedHandlers(item.handler_ids || (item.assignee_id ? [item.assignee_id] : []));
        state.linkedCases = (item.cases || []).map(function (c) {
          return {
            id: c.id,
            title: c.title || c.id,
            last_result: c.last_result || "",
          };
        });
        renderCaseChips();
        return loadComments(id);
      })
      .catch(function (err) {
        toast(err.message || "加载失败", "error");
        closeDrawer();
      });
  }

  function setFormReadonly(ro) {
    ["dm-f-title", "dm-f-desc", "dm-comment-body"].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = ro;
    });
    setFieldPickDisabled("dm-f-severity", ro);
    setFieldPickDisabled("dm-f-status", ro || !!state.editingNew);
    $("dm-btn-save").disabled = ro;
    $("dm-btn-comment").disabled = ro;
    var pickBtn = $("dm-btn-pick-cases");
    if (pickBtn) pickBtn.disabled = ro;
    var handlersBtn = $("dm-f-handlers-btn");
    if (handlersBtn) {
      handlersBtn.classList.toggle("is-disabled", !!ro);
      handlersBtn.setAttribute("aria-disabled", ro ? "true" : "false");
      handlersBtn.tabIndex = ro ? -1 : 0;
    }
    if (ro) {
      setHandlersOpen(false);
      closeAllFieldPicks();
    }
  }

  function closeDrawer() {
    $("dm-drawer-mask").classList.add("is-hidden");
    closeCaseModal(false);
    state.editingId = null;
    state.editingNew = false;
    state.activeId = "";
    renderTable();
  }

  function caseResultLabel(r) {
    var map = { pass: "通过", fail: "失败", blocked: "阻塞", skip: "跳过" };
    var k = String(r || "").toLowerCase();
    return map[k] || "";
  }

  function caseResultClass(r) {
    var k = String(r || "").toLowerCase();
    if (k === "pass" || k === "fail" || k === "blocked" || k === "skip") return k;
    return "";
  }

  function renderCaseChips() {
    var box = $("dm-case-chips");
    if (!box) return;
    box.innerHTML = "";
    if (!state.linkedCases.length) {
      var tip = document.createElement("span");
      tip.className = "dm-chips__empty";
      tip.textContent = "尚未关联用例";
      box.appendChild(tip);
      return;
    }
    state.linkedCases.forEach(function (c) {
      var chip = document.createElement("span");
      chip.className = "dm-chip";
      var title = document.createElement("span");
      title.className = "dm-chip__title";
      title.textContent = c.title || c.id;
      chip.appendChild(title);
      var resCls = caseResultClass(c.last_result);
      var resText = caseResultLabel(c.last_result);
      if (resCls && resText) {
        var tag = document.createElement("span");
        tag.className = "dm-chip__result dm-chip__result--" + resCls;
        tag.textContent = resText;
        chip.appendChild(tag);
      } else {
        var unset = document.createElement("span");
        unset.className = "dm-chip__result dm-chip__result--unset";
        unset.textContent = "未测";
        chip.appendChild(unset);
      }
      if (canEdit()) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("aria-label", "移除");
        btn.textContent = "×";
        btn.addEventListener("click", function () {
          state.linkedCases = state.linkedCases.filter(function (x) {
            return x.id !== c.id;
          });
          renderCaseChips();
        });
        chip.appendChild(btn);
      }
      box.appendChild(chip);
    });
  }

  function syncCaseModalHint() {
    var n = Object.keys(state.caseModalDraft || {}).length;
    var hint = $("dm-case-modal-hint");
    if (hint) hint.textContent = "已选 " + n + " 条";
  }

  function syncCaseModalPager() {
    var info = $("dm-case-modal-page-info");
    var prev = $("dm-case-modal-prev");
    var next = $("dm-case-modal-next");
    var pages = Math.max(1, Math.ceil((state.caseModalTotal || 0) / state.caseModalPageSize));
    var page = Math.min(Math.max(1, state.caseModalPage || 1), pages);
    state.caseModalPage = page;
    if (info) {
      info.textContent =
        "共 " + (state.caseModalTotal || 0) + " 条 · 第 " + page + "/" + pages + " 页";
    }
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= pages;
  }

  function caseModalSuiteParentKey(suite) {
    var pid = suite && suite.parent_id;
    return pid == null || pid === "" ? "" : String(pid);
  }

  function caseModalChildrenMap() {
    var map = {};
    (state.caseModalSuites || []).forEach(function (s) {
      var k = caseModalSuiteParentKey(s);
      if (!map[k]) map[k] = [];
      map[k].push(s);
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) {
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
    });
    return map;
  }

  function renderCaseModalTree() {
    var ul = $("dm-case-modal-tree");
    if (!ul) return;
    ul.innerHTML = "";
    var children = caseModalChildrenMap();

    function addAll() {
      var li = document.createElement("li");
      li.className = "dm-case-modal-tree__item";
      if (state.caseModalSuiteId === "__all__") li.classList.add("is-active");
      var row = document.createElement("div");
      row.className = "dm-case-modal-tree__row";
      var twist = document.createElement("span");
      twist.className = "dm-case-modal-tree__twist is-leaf";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dm-case-modal-tree__label";
      btn.textContent = "全部用例";
      btn.addEventListener("click", function () {
        if (state.caseModalSuiteId === "__all__") return;
        state.caseModalSuiteId = "__all__";
        state.caseModalPage = 1;
        renderCaseModalTree();
        loadCaseModalItems();
      });
      row.appendChild(twist);
      row.appendChild(btn);
      li.appendChild(row);
      ul.appendChild(li);
    }

    function addSuite(suite, depth) {
      var kids = children[suite.id] || [];
      var hasChildren = kids.length > 0;
      var collapsed = !!state.caseModalCollapsed[suite.id];
      var li = document.createElement("li");
      li.className = "dm-case-modal-tree__item";
      if (state.caseModalSuiteId === suite.id) li.classList.add("is-active");
      var row = document.createElement("div");
      row.className = "dm-case-modal-tree__row";
      row.style.paddingLeft = depth * 0.7 + "rem";

      var twist = document.createElement("button");
      twist.type = "button";
      twist.className =
        "dm-case-modal-tree__twist" + (hasChildren ? "" : " is-leaf");
      if (hasChildren) {
        twist.textContent = collapsed ? "▸" : "▾";
        twist.addEventListener("click", function (e) {
          e.stopPropagation();
          if (state.caseModalCollapsed[suite.id]) {
            delete state.caseModalCollapsed[suite.id];
          } else {
            state.caseModalCollapsed[suite.id] = true;
          }
          renderCaseModalTree();
        });
      } else {
        twist.textContent = "";
        twist.tabIndex = -1;
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dm-case-modal-tree__label";
      btn.textContent = suite.name || "未命名目录";
      btn.title = suite.name || "";
      btn.addEventListener("click", function () {
        if (state.caseModalSuiteId === suite.id) return;
        state.caseModalSuiteId = suite.id;
        state.caseModalPage = 1;
        renderCaseModalTree();
        loadCaseModalItems();
      });

      row.appendChild(twist);
      row.appendChild(btn);
      li.appendChild(row);
      ul.appendChild(li);
      if (hasChildren && !collapsed) {
        kids.forEach(function (child) {
          addSuite(child, depth + 1);
        });
      }
    }

    addAll();
    (children[""] || []).forEach(function (s) {
      addSuite(s, 0);
    });
  }

  function loadCaseModalSuites() {
    if (!state.projectId) return Promise.resolve();
    return api("/api/case-management/projects/" + state.projectId + "/suites").then(
      function (data) {
        state.caseModalSuites = data.items || [];
        renderCaseModalTree();
      }
    );
  }

  function renderCaseModalList() {
    var list = $("dm-case-modal-list");
    if (!list) return;
    list.innerHTML = "";
    var items = state.caseModalItems || [];
    if (!items.length) {
      list.innerHTML =
        '<p class="dm-case-modal-empty">当前目录暂无用例，可换目录或搜索</p>';
      return;
    }
    items.forEach(function (c) {
      var row = document.createElement("label");
      row.className = "dm-case-modal-item";
      if (state.caseModalDraft[c.id]) row.classList.add("is-selected");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!state.caseModalDraft[c.id];
      cb.addEventListener("change", function () {
        if (cb.checked) {
          state.caseModalDraft[c.id] = {
            id: c.id,
            title: c.title || c.id,
            last_result: c.last_result || "",
          };
        } else {
          delete state.caseModalDraft[c.id];
        }
        row.classList.toggle("is-selected", cb.checked);
        syncCaseModalHint();
      });
      var text = document.createElement("span");
      text.className = "dm-case-modal-item__title";
      text.textContent = c.title || c.id;
      row.appendChild(cb);
      row.appendChild(text);
      list.appendChild(row);
    });
  }

  function loadCaseModalItems() {
    if (!state.projectId) return Promise.resolve();
    var list = $("dm-case-modal-list");
    if (list) list.innerHTML = '<p class="dm-case-modal-empty">加载中…</p>';
    var q = (($("dm-case-modal-q") && $("dm-case-modal-q").value) || "").trim();
    var qs = new URLSearchParams();
    qs.set("page", String(state.caseModalPage || 1));
    qs.set("page_size", String(state.caseModalPageSize || 10));
    qs.set("suite_id", state.caseModalSuiteId || "__all__");
    if (q) qs.set("q", q);
    return api(
      "/api/case-management/projects/" + state.projectId + "/cases?" + qs.toString()
    )
      .then(function (data) {
        state.caseModalItems = (data.items || []).map(function (c) {
          return { id: c.id, title: c.title || c.id };
        });
        state.caseModalTotal = data.total || 0;
        state.caseModalPage = data.page || state.caseModalPage;
        renderCaseModalList();
        syncCaseModalPager();
      })
      .catch(function (err) {
        if (list) {
          list.innerHTML =
            '<p class="dm-case-modal-empty">' +
            escapeHtml(err.message || "加载失败") +
            "</p>";
        }
        toast(err.message || "加载用例失败", "error");
      });
  }

  function openCaseModal() {
    if (!canEdit()) return toast("只读成员无法关联用例", "error");
    if (!state.projectId) return toast("请先选择项目", "error");
    state.caseModalDraft = {};
    (state.linkedCases || []).forEach(function (c) {
      state.caseModalDraft[c.id] = {
        id: c.id,
        title: c.title || c.id,
        last_result: c.last_result || "",
      };
    });
    state.caseModalSuiteId = "__all__";
    state.caseModalPage = 1;
    state.caseModalCollapsed = {};
    if ($("dm-case-modal-q")) $("dm-case-modal-q").value = "";
    syncCaseModalHint();
    $("dm-case-modal-mask").classList.remove("is-hidden");
    loadCaseModalSuites()
      .then(function () {
        return loadCaseModalItems();
      })
      .catch(function (err) {
        toast(err.message || "加载目录失败", "error");
      });
  }

  function closeCaseModal(apply) {
    var mask = $("dm-case-modal-mask");
    if (!mask || mask.classList.contains("is-hidden")) return;
    if (apply) {
      state.linkedCases = Object.keys(state.caseModalDraft).map(function (id) {
        return state.caseModalDraft[id];
      });
      renderCaseChips();
    }
    mask.classList.add("is-hidden");
    state.caseModalItems = [];
    state.caseModalSuites = [];
    state.caseModalDraft = {};
    state.caseModalTotal = 0;
  }

  function commentPages() {
    return Math.max(
      1,
      Math.ceil((state.commentItems || []).length / (state.commentPageSize || 5))
    );
  }

  function renderCommentsPage() {
    var box = $("dm-comments");
    var pager = $("dm-comments-pager");
    var info = $("dm-comments-pager-info");
    var prev = $("dm-comments-prev");
    var next = $("dm-comments-next");
    if (!box) return;
    var items = state.commentItems || [];
    var size = state.commentPageSize || 5;
    var pages = commentPages();
    if (state.commentPage > pages) state.commentPage = pages;
    if (state.commentPage < 1) state.commentPage = 1;
    var start = (state.commentPage - 1) * size;
    var slice = items.slice(start, start + size);
    box.innerHTML = "";
    slice.forEach(function (c) {
      var el = document.createElement("div");
      el.className = "dm-comment";
      var who = (c.user && c.user.label) || c.user_id || "用户";
      el.innerHTML =
        '<div class="dm-comment__meta">' +
        escapeHtml(who) +
        " · " +
        escapeHtml(c.created_at || "") +
        '</div><div class="dm-comment__body">' +
        escapeHtml(c.body || "") +
        "</div>";
      box.appendChild(el);
    });
    if (pager) {
      var show = items.length > size;
      pager.classList.toggle("is-hidden", !show);
      if (info) {
        info.textContent =
          "第 " +
          state.commentPage +
          "/" +
          pages +
          " 页 · 共 " +
          items.length +
          " 条";
      }
      if (prev) prev.disabled = state.commentPage <= 1;
      if (next) next.disabled = state.commentPage >= pages;
    }
  }

  function loadComments(id, opts) {
    opts = opts || {};
    return api("/api/defect-management/defects/" + id + "/comments").then(function (data) {
      state.commentItems = data.items || [];
      var pages = commentPages();
      if (opts.keepPage) {
        state.commentPage = Math.min(Math.max(1, state.commentPage || 1), pages);
      } else {
        // 默认落到最后一页，优先展示最新评论
        state.commentPage = pages;
      }
      renderCommentsPage();
    });
  }

  function saveDefect() {
    if (!canEdit()) return toast("只读成员无法编辑", "error");
    var title = ($("dm-f-title").value || "").trim();
    if (!title) return toast("请填写标题", "error");
    var payload = {
      title: title,
      description: $("dm-f-desc").value || "",
      severity: $("dm-f-severity").value || "normal",
      handler_ids: state.selectedHandlerIds || [],
    };
    var req;
    if (state.editingNew) {
      payload.status = "open";
      req = api("/api/defect-management/projects/" + state.projectId + "/defects", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } else {
      payload.status = $("dm-f-status").value;
      req = api("/api/defect-management/defects/" + state.editingId, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }
    req
      .then(function (data) {
        var item = data.item || {};
        var id = item.id || state.editingId;
        var caseIds = state.linkedCases.map(function (c) {
          return c.id;
        });
        if (!id) return item;
        return api("/api/defect-management/defects/" + id + "/cases", {
          method: "PUT",
          body: JSON.stringify({ case_ids: caseIds }),
        }).then(function () {
          return item;
        });
      })
      .then(function () {
        toast(state.editingNew ? "已创建" : "已保存", "success");
        closeDrawer();
        return loadDefects();
      })
      .catch(function (err) {
        toast(err.message || "保存失败", "error");
      });
  }

  function deleteDefect() {
    if (!isOwner() || !state.editingId) return;
    var displayId = "";
    var title = "";
    try {
      var cur = (state.items || []).find(function (x) {
        return x && x.id === state.editingId;
      });
      if (cur) {
        displayId = cur.display_id || "";
        title = cur.title || "";
      }
      if (!title && $("dm-title")) title = ($("dm-title").value || "").trim();
      if (!displayId && $("dm-drawer-title")) {
        var head = ($("dm-drawer-title").textContent || "").trim();
        if (/^D-\d+/i.test(head)) displayId = head.split(/\s+/)[0];
      }
    } catch (e) { /* ignore */ }
    var meta = [displayId, title].filter(Boolean).join(" · ");
    var runDelete = function () {
      api("/api/defect-management/defects/" + state.editingId, { method: "DELETE" })
        .then(function () {
          toast("已删除", "success");
          closeDrawer();
          return loadDefects();
        })
        .catch(function (err) {
          toast(err.message || "删除失败", "error");
        });
    };
    if (window.DmDialogs && typeof window.DmDialogs.confirmDanger === "function") {
      window.DmDialogs.confirmDanger({
        title: "确认删除该缺陷？",
        message: "删除后不可恢复，关联用例链接将一并移除。",
        meta: meta || "当前缺陷",
        confirmText: "删除缺陷",
        cancelText: "取消",
        danger: true,
      }).then(function (ok) {
        if (ok) runDelete();
      });
      return;
    }
    if (!window.confirm("确定删除该缺陷？此操作不可恢复。")) return;
    runDelete();
  }

  function bind() {
    $("dm-project-select").addEventListener("change", function () {
      state.projectId = this.value || "";
      state.page = 1;
      applyProjectGate().catch(function (err) {
        toast(err.message || "切换项目失败", "error");
      });
    });
    if ($("dm-btn-members")) {
      $("dm-btn-members").addEventListener("click", function () {
        openMembersModal();
      });
    }
    if ($("dm-btn-invite")) {
      $("dm-btn-invite").addEventListener("click", function () {
        openMembersModal();
      });
    }
    if ($("dm-members-close")) {
      $("dm-members-close").addEventListener("click", closeMembersModal);
    }
    if ($("dm-members-done")) {
      $("dm-members-done").addEventListener("click", closeMembersModal);
    }
    if ($("dm-members-mask")) {
      $("dm-members-mask").addEventListener("click", function (e) {
        if (e.target === this) closeMembersModal();
      });
    }
    if ($("dm-members-search-btn")) {
      $("dm-members-search-btn").addEventListener("click", searchMembersUsers);
    }
    if ($("dm-members-q")) {
      $("dm-members-q").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          searchMembersUsers();
        }
      });
    }
    if ($("dm-members-invite-btn")) {
      $("dm-members-invite-btn").addEventListener("click", inviteSelectedMember);
    }
    $("dm-btn-new").addEventListener("click", function () {
      openDrawer(null);
    });
    $("dm-drawer-close").addEventListener("click", closeDrawer);
    $("dm-btn-cancel").addEventListener("click", closeDrawer);
    $("dm-drawer-mask").addEventListener("click", function (e) {
      if (e.target === this) closeDrawer();
    });
    ["dm-tab-detail", "dm-tab-activity"].forEach(function (id) {
      var btn = $(id);
      if (!btn || btn._dmTabBound) return;
      btn._dmTabBound = true;
      btn.addEventListener("click", function () {
        setDrawerTab(btn.getAttribute("data-tab") || "detail");
      });
    });
    $("dm-btn-save").addEventListener("click", saveDefect);
    $("dm-btn-delete").addEventListener("click", deleteDefect);
    if ($("dm-f-handlers-btn")) {
      $("dm-f-handlers-btn").addEventListener("click", function (e) {
        e.preventDefault();
        if (this.classList.contains("is-disabled")) return;
        var open = !$("dm-f-handlers").classList.contains("is-open");
        setHandlersOpen(open);
      });
      $("dm-f-handlers-btn").addEventListener("keydown", function (e) {
        if (this.classList.contains("is-disabled")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.click();
        }
      });
    }
    bindFieldPicks();
    document.addEventListener("click", function (e) {
      var handlers = $("dm-f-handlers");
      if (handlers && !handlers.contains(e.target)) setHandlersOpen(false);
      FIELD_PICKS.forEach(function (p) {
        var wrap = $(p.pickId);
        if (wrap && !wrap.contains(e.target)) setFieldPickOpen(p.pickId, false);
      });
    });
    if ($("dm-btn-pick-cases")) {
      $("dm-btn-pick-cases").addEventListener("click", openCaseModal);
    }
    if ($("dm-case-modal-close")) {
      $("dm-case-modal-close").addEventListener("click", function () {
        closeCaseModal(false);
      });
    }
    if ($("dm-case-modal-cancel")) {
      $("dm-case-modal-cancel").addEventListener("click", function () {
        closeCaseModal(false);
      });
    }
    if ($("dm-case-modal-ok")) {
      $("dm-case-modal-ok").addEventListener("click", function () {
        closeCaseModal(true);
      });
    }
    if ($("dm-case-modal-mask")) {
      $("dm-case-modal-mask").addEventListener("click", function (e) {
        if (e.target === this) closeCaseModal(false);
      });
    }
    if ($("dm-case-modal-search")) {
      $("dm-case-modal-search").addEventListener("click", function () {
        state.caseModalPage = 1;
        loadCaseModalItems();
      });
    }
    if ($("dm-case-modal-q")) {
      $("dm-case-modal-q").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          state.caseModalPage = 1;
          loadCaseModalItems();
        }
      });
    }
    if ($("dm-case-modal-prev")) {
      $("dm-case-modal-prev").addEventListener("click", function () {
        if (state.caseModalPage <= 1) return;
        state.caseModalPage -= 1;
        loadCaseModalItems();
      });
    }
    if ($("dm-case-modal-next")) {
      $("dm-case-modal-next").addEventListener("click", function () {
        var pages = Math.max(
          1,
          Math.ceil((state.caseModalTotal || 0) / state.caseModalPageSize)
        );
        if (state.caseModalPage >= pages) return;
        state.caseModalPage += 1;
        loadCaseModalItems();
      });
    }
    $("dm-btn-search").addEventListener("click", function () {
      var q = ($("dm-q").value || "").trim();
      if (!q) {
        resetListFilters();
        loadDefects().catch(function (err) {
          toast(err.message, "error");
        });
        return;
      }
      state.filters.q = q;
      state.filters.severity = $("dm-filter-severity").value || "";
      state.filters.assignee_id = $("dm-filter-assignee").value || "";
      state.filters.assigned_to_me = false;
      state.filters.unclosed = false;
      state.filters.statKey = "";
      $("dm-filter-mine").classList.remove("is-active");
      state.page = 1;
      loadDefects().catch(function (err) {
        toast(err.message, "error");
      });
    });
    if ($("dm-btn-reset")) {
      $("dm-btn-reset").addEventListener("click", function () {
        resetListFilters();
        loadDefects().catch(function (err) {
          toast(err.message, "error");
        });
      });
    }
    $("dm-q").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        $("dm-btn-search").click();
      }
    });
    ["dm-filter-severity", "dm-filter-assignee"].forEach(function (id) {
      var sel = $(id);
      if (!sel || sel._dmFilterBound) return;
      sel._dmFilterBound = true;
      sel.addEventListener("change", function () {
        applyDropdownFilters().catch(function (err) {
          toast(err.message, "error");
        });
      });
    });
    if ($("dm-stats")) {
      $("dm-stats").addEventListener("click", function (e) {
        var btn = e.target.closest(".dm-stat");
        if (!btn) return;
        var map = {
          "dm-stat-open": "open",
          "dm-stat-blocker": "blocker",
          "dm-stat-major": "major",
          "dm-stat-normal": "lte_normal",
        };
        var key = map[btn.id] || "";
        if (state.filters.statKey === key) key = "";
        applyStatFilter(key).catch(function (err) {
          toast(err.message, "error");
        });
      });
    }
    $("dm-side-status").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-status]");
      if (!btn) return;
      state.filters.status = btn.getAttribute("data-status") || "";
      state.filters.unclosed = false;
      state.filters.statKey = "";
      Array.prototype.forEach.call(
        $("dm-side-status").querySelectorAll("button"),
        function (el) {
          el.classList.toggle("is-active", el === btn);
        }
      );
      state.page = 1;
      loadDefects().catch(function (err) {
        toast(err.message, "error");
      });
    });
    $("dm-filter-mine").addEventListener("click", function () {
      state.filters.assigned_to_me = !state.filters.assigned_to_me;
      this.classList.toggle("is-active", state.filters.assigned_to_me);
      if (state.filters.assigned_to_me) {
        state.filters.assignee_id = "";
        $("dm-filter-assignee").value = "";
        syncFieldPick("dm-filter-assignee");
      }
      state.page = 1;
      loadDefects().catch(function (err) {
        toast(err.message, "error");
      });
    });
    $("dm-page-prev").addEventListener("click", function () {
      if (state.page <= 1) return;
      state.page -= 1;
      loadDefects().catch(function (err) {
        toast(err.message, "error");
      });
    });
    $("dm-page-next").addEventListener("click", function () {
      var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
      if (state.page >= pages) return;
      state.page += 1;
      loadDefects().catch(function (err) {
        toast(err.message, "error");
      });
    });
    $("dm-btn-comment").addEventListener("click", function () {
      if (!canEdit() || !state.editingId) return;
      var body = ($("dm-comment-body").value || "").trim();
      if (!body) return toast("请输入评论", "error");
      api("/api/defect-management/defects/" + state.editingId + "/comments", {
        method: "POST",
        body: JSON.stringify({ body: body }),
      })
        .then(function () {
          $("dm-comment-body").value = "";
          toast("已发表评论", "success");
          return loadComments(state.editingId);
        })
        .catch(function (err) {
          toast(err.message || "评论失败", "error");
        });
    });
    if ($("dm-comments-prev")) {
      $("dm-comments-prev").addEventListener("click", function () {
        if (state.commentPage <= 1) return;
        state.commentPage -= 1;
        renderCommentsPage();
      });
    }
    if ($("dm-comments-next")) {
      $("dm-comments-next").addEventListener("click", function () {
        if (state.commentPage >= commentPages()) return;
        state.commentPage += 1;
        renderCommentsPage();
      });
    }
  }

  function checkAuth() {
    return api("/api/auth/me")
      .then(function (data) {
        state.loggedIn = !!(data && data.user && data.user.id);
        state.userId = state.loggedIn ? String(data.user.id) : "";
        state.userDisplayName = state.loggedIn
          ? String(data.user.display_name || "").trim()
          : "";
        return state.loggedIn;
      })
      .catch(function () {
        state.loggedIn = false;
        state.userId = "";
        state.userDisplayName = "";
        return false;
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bind();
    checkAuth()
      .then(function (ok) {
        if (!ok) {
          showPanel("dm-login-gate");
          return;
        }
        return loadProjects();
      })
      .catch(function () {
        showPanel("dm-login-gate");
      });
  });
})();
