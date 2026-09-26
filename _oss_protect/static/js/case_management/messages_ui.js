/**
 * 全站站内消息（邀请同意/拒绝等）。
 * 入口在导航栏铃铛；打开面板时刷新列表与角标。
 * Inbox UI 增强（标签/筛选/深链/相对时间）集中在本文件新方法中，不改动其它模块 API。
 */
(function (global) {
  "use strict";

  if (global.CmMessagesUi) return;

  var PAGE_SIZE_INBOX = 15;

  var state = {
    items: [],
    unread: 0,
    loading: false,
    bound: false,
    filter: "all",
    page: 1,
    pageSize: PAGE_SIZE_INBOX,
    total: 0,
    pageCount: 0,
    selectedIds: {},
    selectAllMode: false,
    confirmResolver: null,
  };

  var anonRegionRefreshTimerInbox = null;

  var PLAN_TYPES = {
    plan_execution_done: 1,
    plan_cases_assigned: 1,
    plan_released: 1,
    plan_passed: 1,
    plan_failed: 1,
    plan_unpublished: 1,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function api(path, opts) {
    if (typeof global.CmAppApi === "function") {
      return global.CmAppApi(path, opts);
    }
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
      signal: opts.signal,
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || "请求失败");
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function selectedCountInbox() {
    if (state.selectAllMode) return Number(state.total || 0);
    return Object.keys(state.selectedIds || {}).length;
  }

  function clearSelectionInbox() {
    state.selectedIds = {};
    state.selectAllMode = false;
    syncSelectUiInbox();
    var box = $("cm-messages-list");
    if (box) {
      box.querySelectorAll(".cm-msg-card").forEach(function (card) {
        card.classList.remove("is-selected");
        var ck = card.querySelector(".cm-msg-card__check");
        if (ck) ck.checked = false;
      });
    }
  }

  function syncSelectUiInbox() {
    var n = selectedCountInbox();
    var batch = $("cm-messages-batch-delete");
    var pageBtn = $("cm-messages-select-page");
    var allBtn = $("cm-messages-select-all");
    if (batch) {
      if (n > 0) {
        batch.classList.remove("is-hidden");
        batch.disabled = false;
        batch.textContent = state.selectAllMode
          ? "删除全部（" + n + "）"
          : "删除所选（" + n + "）";
      } else {
        batch.classList.add("is-hidden");
        batch.disabled = true;
        batch.textContent = "删除所选";
      }
    }
    if (pageBtn) pageBtn.classList.toggle("is-active", !state.selectAllMode && n > 0);
    if (allBtn) allBtn.classList.toggle("is-active", !!state.selectAllMode);
  }

  function confirmInbox(message, title) {
    var layer = $("cm-messages-confirm");
    var body = $("cm-messages-confirm-body");
    var titleEl = $("cm-messages-confirm-title");
    if (!layer || !body) {
      return Promise.resolve(window.confirm(message || "确认删除？"));
    }
    if (titleEl) titleEl.textContent = title || "确认删除";
    body.textContent = message || "确定删除所选消息？";
    layer.classList.remove("is-hidden");
    return new Promise(function (resolve) {
      state.confirmResolver = resolve;
    });
  }

  function closeConfirmInbox(ok) {
    var layer = $("cm-messages-confirm");
    if (layer) layer.classList.add("is-hidden");
    var fn = state.confirmResolver;
    state.confirmResolver = null;
    if (typeof fn === "function") fn(!!ok);
  }

  function softDeleteInbox(payload) {
    return api("/api/case-management/messages/delete", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }).then(function (res) {
      state.unread = res.unread_count != null ? Number(res.unread_count) : state.unread;
      syncBadge();
      return res;
    });
  }

  function toast(msg, type) {
    if (global.HfFloatToast && typeof global.HfFloatToast.show === "function") {
      global.HfFloatToast.show(msg, type || "info");
      return;
    }
    console.log(msg);
  }

  function goLogin() {
    if (global.HfAuthNav && typeof global.HfAuthNav.loginUrl === "function") {
      global.location.href = global.HfAuthNav.loginUrl();
      return;
    }
    global.location.href =
      "/auth?next=" + encodeURIComponent(global.location.pathname + global.location.search);
  }

  /** 日报详情弹窗：从 payload 取数（独立方法，不影响其它消息类型） */
  function numPayloadInbox(payload, keys, fallback) {
    var i;
    for (i = 0; i < keys.length; i += 1) {
      if (payload && payload[keys[i]] != null && payload[keys[i]] !== "") {
        var n = Number(payload[keys[i]]);
        if (!isNaN(n)) return n;
      }
    }
    return fallback != null ? fallback : 0;
  }

  function closeDailyLoginUsersInbox() {
    var layer = $("cm-daily-users");
    if (!layer) return;
    layer.classList.add("is-hidden");
    layer.setAttribute("aria-hidden", "true");
    layer.classList.remove("cm-daily-users--anon");
    var detail = $("cm-daily-detail");
    if (detail) detail.classList.remove("is-anon-list");
    if (anonRegionRefreshTimerInbox) {
      clearTimeout(anonRegionRefreshTimerInbox);
      anonRegionRefreshTimerInbox = null;
    }
  }

  function closeDailyStatsDetailInbox() {
    closeDailyLoginUsersInbox();
    var el = $("cm-daily-detail");
    if (!el) return;
    el.classList.add("is-hidden");
    el.setAttribute("aria-hidden", "true");
    el.removeAttribute("data-stat-date");
    el.classList.remove("is-anon-list");
  }

  function ensureDailyDetailHostInbox() {
    var el = $("cm-daily-detail");
    if (!el) return null;
    // 挂到 body，彻底跳出消息 mask 的层叠上下文
    if (el.parentNode !== document.body) {
      document.body.appendChild(el);
    }
    return el;
  }

  function escHtmlDailyInbox(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderDailyLoginUsersInbox(users, viewKind) {
    var body = $("cm-daily-users-body");
    if (!body) return;
    var list = Array.isArray(users) ? users : [];
    if (!list.length) {
      body.innerHTML = '<p class="cm-daily-users__empty">当日暂无登录活跃用户</p>';
      return;
    }
    var showHits = viewKind === "login-total";
    var rows = list
      .map(function (u, idx) {
        var name = String((u && u.display_name) || "").trim();
        var email = String((u && u.email) || "—");
        var hits = Number((u && u.hit_count) || 0);
        var lastSeen = String((u && u.last_seen_at) || "—");
        var path = String((u && u.last_path) || "—");
        var title = name ? escHtmlDailyInbox(name) : escHtmlDailyInbox(email);
        var sub = name
          ? escHtmlDailyInbox(email)
          : "";
        return (
          '<li class="cm-daily-users__item">' +
          '<span class="cm-daily-users__idx">' +
          (idx + 1) +
          "</span>" +
          '<div class="cm-daily-users__main">' +
          '<div class="cm-daily-users__name">' +
          title +
          "</div>" +
          (sub ? '<div class="cm-daily-users__email">' + sub + "</div>" : "") +
          '<div class="cm-daily-users__meta">' +
          "末次 " +
          escHtmlDailyInbox(lastSeen) +
          " · " +
          escHtmlDailyInbox(path) +
          "</div>" +
          "</div>" +
          (showHits
            ? '<span class="cm-daily-users__hits" title="访问次数">' +
              hits +
              "<small>次</small></span>"
            : "") +
          "</li>"
        );
      })
      .join("");
    body.innerHTML = '<ul class="cm-daily-users__list">' + rows + "</ul>";
  }

  function cityFromRegionDailyInbox(region) {
    var text = String(region || "").trim();
    if (!text) return "地区未知";
    var parts = text
      .split("·")
      .map(function (p) {
        return String(p || "").trim();
      })
      .filter(Boolean);
    if (!parts.length) return "地区未知";
    return parts[parts.length - 1] || "地区未知";
  }

  function buildAnonCityStatsDailyInbox(visitors) {
    var map = {};
    var order = [];
    (Array.isArray(visitors) ? visitors : []).forEach(function (v) {
      var city = cityFromRegionDailyInbox(v && v.region);
      if (!Object.prototype.hasOwnProperty.call(map, city)) {
        map[city] = 0;
        order.push(city);
      }
      map[city] += 1;
    });
    return order
      .map(function (city) {
        return { city: city, count: map[city] };
      })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.city).localeCompare(String(b.city), "zh-CN");
      });
  }

  function renderDailyAnonVisitorsInbox(visitors, viewKind) {
    var body = $("cm-daily-users-body");
    if (!body) return;
    var list = Array.isArray(visitors) ? visitors : [];
    if (!list.length) {
      body.innerHTML =
        viewKind === "anon-clean"
          ? '<p class="cm-daily-users__empty">当日暂无有效曝光访客</p>'
          : '<p class="cm-daily-users__empty">当日暂无离线访客</p>';
      return;
    }
    var showHits = viewKind === "anon-total";
    var cityStats = buildAnonCityStatsDailyInbox(list);
    var statsHtml =
      '<div class="cm-daily-city-stats">' +
      '<div class="cm-daily-city-stats__head">' +
      '<span class="cm-daily-city-stats__title">城市分布</span>' +
      '<span class="cm-daily-city-stats__hint">共 ' +
      cityStats.length +
      " 个地区 · " +
      list.length +
      " 位访客</span>" +
      "</div>" +
      '<div class="cm-daily-city-stats__grid">' +
      cityStats
        .map(function (item) {
          return (
            '<div class="cm-daily-city-card" title="' +
            escHtmlDailyInbox(item.city) +
            '">' +
            '<strong class="cm-daily-city-card__name">' +
            escHtmlDailyInbox(item.city) +
            "</strong>" +
            '<span class="cm-daily-city-card__count">' +
            item.count +
            "<small>人</small></span>" +
            "</div>"
          );
        })
        .join("") +
      "</div></div>";

    var rows = list
      .map(function (v, idx) {
        var ip = String((v && v.client_ip) || "—");
        var region = String((v && v.region) || "").trim();
        var shortId = String((v && v.visitor_short) || "").trim() || "—";
        var hits = Number((v && v.hit_count) || 0);
        var lastSeen = String((v && v.last_seen_at) || "—");
        var path = String((v && v.last_path) || "—");
        return (
          '<li class="cm-daily-users__item cm-daily-users__item--anon">' +
          '<span class="cm-daily-users__idx cm-daily-users__idx--anon">' +
          (idx + 1) +
          "</span>" +
          '<div class="cm-daily-users__main">' +
          '<div class="cm-daily-users__name">' +
          escHtmlDailyInbox(ip) +
          (region
            ? '<span class="cm-daily-users__region">' +
              escHtmlDailyInbox(region) +
              "</span>"
            : '<span class="cm-daily-users__region cm-daily-users__region--na">地区未知</span>') +
          "</div>" +
          '<div class="cm-daily-users__email">访客 ' +
          escHtmlDailyInbox(shortId) +
          "</div>" +
          '<div class="cm-daily-users__meta">' +
          "末次 " +
          escHtmlDailyInbox(lastSeen) +
          " · " +
          escHtmlDailyInbox(path) +
          "</div>" +
          "</div>" +
          (showHits
            ? '<span class="cm-daily-users__hits cm-daily-users__hits--anon" title="访问次数">' +
              hits +
              "<small>次</small></span>"
            : "") +
          "</li>"
        );
      })
      .join("");
    body.innerHTML =
      statsHtml + '<ul class="cm-daily-users__list">' + rows + "</ul>";
  }

  function openDailyDetailListInbox(kind) {
    var detail = ensureDailyDetailHostInbox();
    if (!detail) return;
    var day = String(detail.getAttribute("data-stat-date") || "").slice(0, 10);
    var layer = $("cm-daily-users");
    var titleEl = $("cm-daily-users-title");
    var subEl = $("cm-daily-users-sub");
    var body = $("cm-daily-users-body");
    if (!layer || !body) return;

    var isAnon =
      kind === "anon-total" || kind === "anon-unique" || kind === "anon-clean";
    var titles = {
      "login-total": "登录用户 · 总日活明细",
      "login-unique": "登录用户 · 去重列表",
      "anon-total": "离线访客 · 总日活明细",
      "anon-unique": "离线访客 · 去重列表",
      "anon-clean": "离线访客 · 有效曝光（去噪）",
    };
    if (titleEl) titleEl.textContent = titles[kind] || "明细";
    if (subEl) subEl.textContent = day ? "统计日期 " + day : "统计日期 —";
    body.innerHTML = '<p class="cm-daily-users__empty">加载中…</p>';
    layer.classList.remove("is-hidden");
    layer.setAttribute("aria-hidden", "false");
    if (anonRegionRefreshTimerInbox) {
      clearTimeout(anonRegionRefreshTimerInbox);
      anonRegionRefreshTimerInbox = null;
    }
    if (isAnon) {
      detail.classList.add("is-anon-list");
      layer.classList.add("cm-daily-users--anon");
    } else {
      detail.classList.remove("is-anon-list");
      layer.classList.remove("cm-daily-users--anon");
    }

    if (!day) {
      body.innerHTML = '<p class="cm-daily-users__empty">缺少统计日期</p>';
      return;
    }

    var url = isAnon
      ? "/api/admin/daily-stats/anon-visitors?stat_date=" +
        encodeURIComponent(day) +
        (kind === "anon-clean" ? "&clean=1" : "")
      : "/api/admin/daily-stats/login-users?stat_date=" + encodeURIComponent(day);

    function applyAnonListInbox(data, soft) {
      var count = Number(data.count || (data.visitors && data.visitors.length) || 0);
      if (subEl) {
        subEl.textContent =
          "统计日期 " + day + " · 共 " + count + " 位访客";
      }
      renderDailyAnonVisitorsInbox(data.visitors || [], kind);
      if (soft) return;
      var visitors = data.visitors || [];
      var missing = visitors.some(function (v) {
        return !(v && String(v.region || "").trim());
      });
      if (!missing) return;
      // 后台归属地补齐后静默刷新一次（仅离线访客列表）
      anonRegionRefreshTimerInbox = setTimeout(function () {
        anonRegionRefreshTimerInbox = null;
        var ly = $("cm-daily-users");
        if (!ly || ly.classList.contains("is-hidden")) return;
        if (!$("cm-daily-detail") || !$("cm-daily-detail").classList.contains("is-anon-list")) {
          return;
        }
        api(url)
          .then(function (data2) {
            if (!data2 || !data2.ok) return;
            applyAnonListInbox(data2, true);
          })
          .catch(function () {});
      }, 2800);
    }

    api(url)
      .then(function (data) {
        if (!data || !data.ok) {
          throw new Error((data && data.error) || "加载失败");
        }
        if (isAnon) {
          applyAnonListInbox(data, false);
          return;
        }
        var count = Number(data.count || (data.users && data.users.length) || 0);
        if (subEl) {
          subEl.textContent = "统计日期 " + day + " · 共 " + count + " 人";
        }
        renderDailyLoginUsersInbox(data.users || [], kind);
      })
      .catch(function (err) {
        body.innerHTML =
          '<p class="cm-daily-users__empty cm-daily-users__empty--err">' +
          escHtmlDailyInbox((err && err.message) || "加载失败") +
          "</p>";
      });
  }

  function openDailyLoginUsersInbox(viewKind) {
    openDailyDetailListInbox(viewKind);
  }

  function openDailyAnonVisitorsInbox(viewKind) {
    openDailyDetailListInbox(viewKind);
  }

  function openDailyStatsDetailInbox(m) {
    var el = ensureDailyDetailHostInbox();
    if (!el) return;
    closeDailyLoginUsersInbox();
    var payload = parsePayload(m && m.payload);
    var day = String(payload.stat_date || (m && m.ref_id) || "").slice(0, 10);
    var loginTotal = numPayloadInbox(payload, ["login_dau_total"], 0);
    var loginUnique = numPayloadInbox(payload, ["login_dau_unique", "login_dau"], 0);
    var anonTotal = numPayloadInbox(payload, ["anon_uv_total"], 0);
    var anonUnique = numPayloadInbox(payload, ["anon_uv_unique", "anon_uv"], 0);
    var anonCleanUnique = numPayloadInbox(payload, ["anon_uv_clean_unique"], -1);
    var anonCleanTotal = numPayloadInbox(payload, ["anon_uv_clean_total"], -1);
    var reg = numPayloadInbox(payload, ["register_count"], 0);

    var titleEl = $("cm-daily-detail-title");
    var dateEl = $("cm-daily-detail-date");
    if (titleEl) titleEl.textContent = (m && m.title) || ("站点日报 · " + (day || ""));
    if (dateEl) dateEl.textContent = day ? ("统计日期 " + day) : "统计日期 —";
    if (day) el.setAttribute("data-stat-date", day);
    else el.removeAttribute("data-stat-date");

    function paintDailyMetricsInbox(vals) {
      var map = {
        "cm-daily-login-total": vals.loginTotal,
        "cm-daily-login-unique": vals.loginUnique,
        "cm-daily-anon-total": vals.anonTotal,
        "cm-daily-anon-unique": vals.anonUnique,
        "cm-daily-anon-clean-unique": vals.anonCleanUnique < 0 ? "…" : vals.anonCleanUnique,
        "cm-daily-anon-clean-total": vals.anonCleanTotal < 0 ? "…" : vals.anonCleanTotal,
        "cm-daily-register-count": vals.reg,
      };
      Object.keys(map).forEach(function (id) {
        var node = $(id);
        if (node) node.textContent = String(map[id]);
      });
    }

    paintDailyMetricsInbox({
      loginTotal: loginTotal,
      loginUnique: loginUnique,
      anonTotal: anonTotal,
      anonUnique: anonUnique,
      anonCleanUnique: anonCleanUnique,
      anonCleanTotal: anonCleanTotal,
      reg: reg,
    });

    el.classList.remove("is-hidden");
    el.setAttribute("aria-hidden", "false");
    markOneRead(m);

    // 旧消息无去噪字段时，用 preview 实时补齐（不影响其它消息类型）
    if (day && (anonCleanUnique < 0 || anonCleanTotal < 0)) {
      api("/api/admin/daily-stats/preview?stat_date=" + encodeURIComponent(day))
        .then(function (data) {
          var st = (data && data.stats) || {};
          paintDailyMetricsInbox({
            loginTotal: numPayloadInbox(st, ["login_dau_total"], loginTotal),
            loginUnique: numPayloadInbox(st, ["login_dau_unique", "login_dau"], loginUnique),
            anonTotal: numPayloadInbox(st, ["anon_uv_total"], anonTotal),
            anonUnique: numPayloadInbox(st, ["anon_uv_unique", "anon_uv"], anonUnique),
            anonCleanUnique: numPayloadInbox(st, ["anon_uv_clean_unique"], 0),
            anonCleanTotal: numPayloadInbox(st, ["anon_uv_clean_total"], 0),
            reg: numPayloadInbox(st, ["register_count"], reg),
          });
        })
        .catch(function () {
          paintDailyMetricsInbox({
            loginTotal: loginTotal,
            loginUnique: loginUnique,
            anonTotal: anonTotal,
            anonUnique: anonUnique,
            anonCleanUnique: 0,
            anonCleanTotal: 0,
            reg: reg,
          });
        });
    }
  }

  function dailyStatsCardSummaryInbox(m) {
    var payload = parsePayload(m && m.payload);
    var loginUnique = numPayloadInbox(payload, ["login_dau_unique", "login_dau"], 0);
    var anonUnique = numPayloadInbox(payload, ["anon_uv_unique", "anon_uv"], 0);
    var reg = numPayloadInbox(payload, ["register_count"], 0);
    return (
      "注册去重 " +
      loginUnique +
      " · 离线去重 " +
      anonUnique +
      " · 新注册 " +
      reg
    );
  }

  /** 投稿建议卡片摘要（新方法，不影响日报摘要） */
  function feedbackCardSummaryInbox(m) {
    var payload = parsePayload(m && m.payload);
    var contact = String((payload && payload.contact) || "").trim() || "未填写";
    var imgCount = Number((payload && payload.image_count) || 0);
    if (isNaN(imgCount) || imgCount < 0) imgCount = 0;
    var summary = String((payload && payload.content) || m.body || "").trim();
    if (summary.length > 72) summary = summary.slice(0, 71) + "…";
    var line = "联系 " + contact;
    if (imgCount > 0) line += " · 附图×" + imgCount;
    if (summary) line += " · " + summary;
    return line;
  }

  function escapeHtmlInbox(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function closeFeedbackLightboxInbox() {
    var box = $("cm-feedback-lightbox");
    var img = $("cm-feedback-lightbox-img");
    if (box) {
      box.classList.add("is-hidden");
      box.setAttribute("aria-hidden", "true");
    }
    if (img) {
      img.removeAttribute("src");
      img.alt = "";
    }
  }

  function openFeedbackLightboxInbox(src, alt) {
    var box = $("cm-feedback-lightbox");
    var img = $("cm-feedback-lightbox-img");
    if (!box || !img || !src) return;
    img.src = src;
    img.alt = alt || "投稿附图预览";
    box.classList.remove("is-hidden");
    box.setAttribute("aria-hidden", "false");
  }

  function closeFeedbackDetailInbox() {
    var el = $("cm-feedback-detail");
    if (!el) return;
    el.classList.add("is-hidden");
    el.setAttribute("aria-hidden", "true");
    closeFeedbackLightboxInbox();
  }

  function paintFeedbackDetailInbox(item) {
    var dateEl = $("cm-feedback-detail-date");
    var metaEl = $("cm-feedback-detail-meta");
    var bodyEl = $("cm-feedback-detail-body");
    var imagesEl = $("cm-feedback-detail-images");
    var errEl = $("cm-feedback-detail-error");
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.add("is-hidden");
    }
    if (dateEl) dateEl.textContent = String((item && item.created_at) || "—");
    if (metaEl) {
      var contact = String((item && item.contact) || "").trim() || "未填写";
      var pageUrl = String((item && item.page_url) || "").trim() || "—";
      var imgCount = Number((item && item.image_count) || ((item && item.images) || []).length || 0);
      metaEl.innerHTML =
        "<div><strong>联系方式</strong>：" +
        escapeHtmlInbox(contact) +
        "</div>" +
        "<div><strong>来源页面</strong>：" +
        escapeHtmlInbox(pageUrl) +
        "</div>" +
        (imgCount > 0 ? "<div><strong>附图</strong>：" + imgCount + " 张</div>" : "");
    }
    if (bodyEl) bodyEl.textContent = String((item && item.content) || "").trim() || "（无正文）";
    if (imagesEl) {
      imagesEl.innerHTML = "";
      var imgs = (item && item.images) || [];
      if (!imgs.length) {
        imagesEl.classList.add("is-hidden");
      } else {
        imagesEl.classList.remove("is-hidden");
        imgs.forEach(function (img) {
          var url = String((img && img.url) || "").trim();
          if (!url && img && img.id) {
            url = "/api/feedback/admin/images/" + encodeURIComponent(String(img.id));
          }
          if (!url) return;
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "cm-feedback-detail__thumb";
          btn.title = "点击预览";
          var im = document.createElement("img");
          im.src = url;
          im.alt = String((img && img.file_name) || "附图");
          im.loading = "lazy";
          btn.appendChild(im);
          btn.addEventListener("click", function () {
            openFeedbackLightboxInbox(url, im.alt);
          });
          imagesEl.appendChild(btn);
        });
      }
    }
  }

  function openFeedbackDetailInbox(m) {
    var el = $("cm-feedback-detail");
    if (!el) return;
    var payload = parsePayload(m && m.payload);
    var feedbackId = String((payload && payload.feedback_id) || (m && m.ref_id) || "").trim();
    var fallback = {
      id: feedbackId,
      content: String((payload && payload.content) || (m && m.body) || ""),
      contact: String((payload && payload.contact) || ""),
      page_url: String((payload && payload.page_url) || ""),
      created_at: String((payload && payload.created_at) || (m && m.created_at) || ""),
      image_count: Number((payload && payload.image_count) || 0),
      images: ((payload && payload.image_ids) || []).map(function (id) {
        return {
          id: id,
          url: "/api/feedback/admin/images/" + encodeURIComponent(String(id)),
        };
      }),
    };
    paintFeedbackDetailInbox(fallback);
    el.classList.remove("is-hidden");
    el.setAttribute("aria-hidden", "false");
    markOneRead(m);

    if (!feedbackId) return;
    api("/api/feedback/admin/item/" + encodeURIComponent(feedbackId))
      .then(function (data) {
        if (data && data.item) paintFeedbackDetailInbox(data.item);
      })
      .catch(function (err) {
        var errEl = $("cm-feedback-detail-error");
        if (!errEl) return;
        errEl.textContent = (err && err.message) || "详情刷新失败，已展示消息摘要";
        errEl.classList.remove("is-hidden");
      });
  }

  function parsePayload(raw) {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(String(raw)) || {};
    } catch (e) {
      return {};
    }
  }

  /** 消息展示元信息（新方法，不复用其它模块） */
  function resolveMsgMetaInbox(m) {
    var type = String((m && m.msg_type) || "");
    var payload = parsePayload(m && m.payload);
    var projectId = String(payload.project_id || "");
    var planId = String(payload.plan_id || "");
    var caseId = String(payload.case_id || "");
    var defectId = String(payload.defect_id || "");
    var refId = String((m && m.ref_id) || "");

    var group = "other";
    var tag = "通知";
    var nav = "none";
    var hint = "";

    if (type === "project_invite") {
      group = "invite";
      tag = "邀请";
      nav = "none";
    } else if (type === "system_daily_stats") {
      group = "daily";
      tag = "日报";
      nav = "none";
    } else if (type === "system_user_feedback") {
      group = "feedback";
      tag = "投稿";
      nav = "none";
    } else if (
      type === "defect_assigned" ||
      type === "defect_status" ||
      type === "defect_comment" ||
      (defectId && !PLAN_TYPES[type])
    ) {
      group = "defect";
      tag = "缺陷";
      nav = "defect";
      hint = "查看缺陷";
      if (!defectId) defectId = refId;
    } else if (PLAN_TYPES[type]) {
      group = "plan";
      tag = "计划";
      nav = "plan";
      hint = "查看计划";
      if (!planId) planId = refId;
    } else if (type === "regression_pending" && (caseId || refId)) {
      group = "defect";
      tag = "缺陷";
      nav = "case";
      hint = "查看用例";
      if (!caseId) caseId = refId;
    } else if (type === "gate_failed" || type === "sync_done") {
      group = "plan";
      tag = "计划";
      nav = "project";
      hint = "查看项目";
    }

    return {
      group: group,
      tag: tag,
      nav: nav,
      hint: hint,
      project_id: projectId,
      plan_id: planId,
      case_id: caseId,
      defect_id: defectId,
    };
  }

  /** 相对时间（Inbox 专用） */
  function formatRelativeTimeInbox(raw) {
    var s = String(raw || "").replace("T", " ").trim();
    var abs = s.length >= 19 ? s.slice(0, 19) : s.slice(0, 16);
    var d = new Date(s.replace(/-/g, "/"));
    if (isNaN(d.getTime())) {
      return { text: abs.length >= 16 ? abs.slice(5, 16) : abs, title: abs };
    }
    var now = new Date();
    var diffMs = now.getTime() - d.getTime();
    var diffMin = Math.floor(diffMs / 60000);
    var text;
    if (diffMs < 0) {
      text = abs.length >= 16 ? abs.slice(5, 16) : abs;
    } else if (diffMin < 1) {
      text = "刚刚";
    } else if (diffMin < 60) {
      text = diffMin + "分钟前";
    } else {
      var sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      var yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      var isYest =
        d.getFullYear() === yest.getFullYear() &&
        d.getMonth() === yest.getMonth() &&
        d.getDate() === yest.getDate();
      var hm =
        String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      if (sameDay) text = "今天 " + hm;
      else if (isYest) text = "昨天 " + hm;
      else {
        var md =
          String(d.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getDate()).padStart(2, "0");
        text = md + " " + hm;
      }
    }
    return { text: text, title: abs };
  }

  /** 深链跳转（Inbox 专用，替代 messages_l5 二次请求） */
  function navigateMsgInbox(meta) {
    if (!meta || meta.nav === "none") return false;
    var pid = encodeURIComponent(meta.project_id || "");
    if (meta.nav === "defect") {
      global.location.href =
        "/tool/defect-management?project_id=" +
        pid +
        "&defect_id=" +
        encodeURIComponent(meta.defect_id || "");
      return true;
    }
    if (meta.nav === "plan") {
      global.location.href =
        "/tool/case-management?project_id=" +
        pid +
        "&plan_id=" +
        encodeURIComponent(meta.plan_id || "");
      return true;
    }
    if (meta.nav === "case") {
      global.location.href =
        "/tool/case-management?project_id=" +
        pid +
        "&case_id=" +
        encodeURIComponent(meta.case_id || "");
      return true;
    }
    if (meta.nav === "project") {
      global.location.href = "/tool/case-management?project_id=" + pid;
      return true;
    }
    return false;
  }

  function syncBadge() {
    var badge = $("cm-msg-badge");
    var btn = $("cm-btn-messages");
    var readAllBtn = $("cm-messages-read-all");
    var hint = $("cm-messages-unread-hint");
    var filterUnread = $("cm-messages-filter-unread");
    var n = Number(state.unread || 0);
    if (badge) {
      if (n > 0) {
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.classList.remove("is-hidden");
        if (btn) btn.setAttribute("data-has-unread", "1");
      } else {
        badge.textContent = "";
        badge.classList.add("is-hidden");
        if (btn) btn.removeAttribute("data-has-unread");
      }
    }
    if (readAllBtn) readAllBtn.disabled = n <= 0;
    if (hint) {
      if (n > 0) {
        hint.textContent = "未读 " + n;
        hint.classList.remove("is-hidden");
      } else {
        hint.textContent = "";
        hint.classList.add("is-hidden");
      }
    }
    if (filterUnread) {
      filterUnread.textContent = n > 0 ? "未读 " + n : "未读";
    }
  }

  function syncFilterTabs() {
    var bar = $("cm-messages-filter");
    if (!bar) return;
    var btns = bar.querySelectorAll("[data-filter]");
    btns.forEach(function (b) {
      var on = b.getAttribute("data-filter") === state.filter;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function markAllRead() {
    var btn = $("cm-messages-read-all");
    if (btn) btn.disabled = true;
    return api("/api/case-management/messages/read-all", {
      method: "POST",
      body: "{}",
    })
      .then(function (res) {
        var updated = Number((res && res.updated) || 0);
        state.items.forEach(function (m) {
          if (m.status === "unread") m.status = "read";
        });
        state.unread = 0;
        syncBadge();
        state.page = 1;
        loadMessages(1);
        if (updated > 0) toast("已全部已读", "success");
      })
      .catch(function (err) {
        if (err && err.status === 401) {
          goLogin();
          return;
        }
        toast(err.message || "操作失败", "error");
        syncBadge();
      });
  }

  function renderLoadingInbox() {
    var box = $("cm-messages-list");
    if (!box) return;
    box.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "cm-messages-loading";
    wrap.setAttribute("aria-busy", "true");
    for (var i = 0; i < 4; i++) {
      var sk = document.createElement("div");
      sk.className = "cm-messages-skel";
      wrap.appendChild(sk);
    }
    box.appendChild(wrap);
  }

  function markOneRead(m, card) {
    if (!m || m.status !== "unread") return Promise.resolve();
    return api("/api/case-management/messages/" + encodeURIComponent(m.id) + "/read", {
      method: "POST",
      body: "{}",
    })
      .then(function () {
        m.status = "read";
        if (card) card.classList.remove("is-unread");
        if (state.unread > 0) state.unread -= 1;
        syncBadge();
        // 未读筛选用服务端分页：标已读后刷新当前页
        if (state.filter === "unread") {
          return loadMessages(state.page);
        }
      })
      .catch(function () {});
  }

  function syncPagerInbox() {
    var prev = $("cm-messages-prev");
    var next = $("cm-messages-next");
    var info = $("cm-messages-page-info");
    var pager = $("cm-messages-pager");
    var page = Number(state.page || 1);
    var pageCount = Number(state.pageCount || 0);
    var total = Number(state.total || 0);
    if (pager) {
      pager.classList.toggle("is-empty", total <= 0);
    }
    if (info) {
      if (total <= 0) info.textContent = "0 / 0";
      else info.textContent = page + " / " + Math.max(pageCount, 1);
    }
    if (prev) prev.disabled = page <= 1 || pageCount <= 1;
    if (next) next.disabled = pageCount <= 0 || page >= pageCount;
  }

  function renderList() {
    var box = $("cm-messages-list");
    if (!box) return;
    box.innerHTML = "";
    syncFilterTabs();
    syncPagerInbox();
    syncSelectUiInbox();

    var items = state.items || [];

    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "cm-messages-empty";
      empty.textContent = state.filter === "unread" ? "暂无未读" : "暂无消息";
      box.appendChild(empty);
      return;
    }

    items.forEach(function (m) {
      var meta = resolveMsgMetaInbox(m);
      var mid = m.id != null ? String(m.id) : "";
      var card = document.createElement("article");
      card.className = "cm-msg-card has-foot";
      if (meta.nav !== "none") card.classList.add("is-nav");
      if (mid) card.setAttribute("data-id", mid);
      card.setAttribute("data-msg-type", String(m.msg_type || ""));
      card.setAttribute("data-group", meta.group);
      card.setAttribute("data-nav", meta.nav);
      if (meta.project_id) card.setAttribute("data-project-id", meta.project_id);
      if (meta.plan_id) card.setAttribute("data-plan-id", meta.plan_id);
      if (meta.case_id) card.setAttribute("data-case-id", meta.case_id);
      if (meta.defect_id) card.setAttribute("data-defect-id", meta.defect_id);
      if (m.status === "unread") card.classList.add("is-unread");
      if (m.status === "acted") card.classList.add("is-acted");
      if (state.selectAllMode || (mid && state.selectedIds[mid])) {
        card.classList.add("is-selected");
      }

      var checkWrap = document.createElement("label");
      checkWrap.className = "cm-msg-card__check-wrap";
      checkWrap.title = "选择";
      var check = document.createElement("input");
      check.type = "checkbox";
      check.className = "cm-msg-card__check";
      check.checked = !!(state.selectAllMode || (mid && state.selectedIds[mid]));
      var checkUi = document.createElement("span");
      checkUi.className = "cm-msg-card__check-ui";
      checkUi.setAttribute("aria-hidden", "true");
      checkWrap.appendChild(check);
      checkWrap.appendChild(checkUi);
      checkWrap.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      check.addEventListener("change", function () {
        if (!mid) return;
        state.selectAllMode = false;
        if (check.checked) state.selectedIds[mid] = true;
        else delete state.selectedIds[mid];
        card.classList.toggle("is-selected", !!check.checked);
        syncSelectUiInbox();
      });

      var rail = document.createElement("span");
      rail.className = "cm-msg-card__rail";
      rail.setAttribute("aria-hidden", "true");

      var content = document.createElement("div");
      content.className = "cm-msg-card__content";

      var top = document.createElement("div");
      top.className = "cm-msg-card__top";

      var tag = document.createElement("span");
      tag.className = "cm-msg-card__tag";
      tag.textContent = meta.tag;

      var line = document.createElement("div");
      line.className = "cm-msg-card__line";
      var title = document.createElement("strong");
      title.className = "cm-msg-card__title";
      title.textContent = m.title || "消息";
      var time = document.createElement("time");
      time.className = "cm-msg-card__time";
      var rel = formatRelativeTimeInbox(m.created_at);
      time.textContent = rel.text;
      time.title = rel.title;
      line.appendChild(title);
      line.appendChild(time);

      top.appendChild(tag);
      top.appendChild(line);
      content.appendChild(top);

      var bodyText = String(m.body || "").trim();
      if (m.msg_type === "system_daily_stats") {
        bodyText = dailyStatsCardSummaryInbox(m);
      } else if (m.msg_type === "system_user_feedback") {
        bodyText = feedbackCardSummaryInbox(m);
      }
      if (bodyText) {
        var body = document.createElement("p");
        body.className = "cm-msg-card__body";
        body.textContent = bodyText;
        body.title = bodyText;
        content.appendChild(body);
      }

      if (m.msg_type === "project_invite" && m.status !== "acted") {
        var inviteId = (m.payload && m.payload.invite_id) || m.ref_id || "";
        var actions = document.createElement("div");
        actions.className = "cm-msg-card__actions";
        var btnAccept = document.createElement("button");
        btnAccept.type = "button";
        btnAccept.className = "cm-btn cm-btn--primary cm-btn--sm";
        btnAccept.textContent = "同意";
        btnAccept.addEventListener("click", function () {
          if (!inviteId) return toast("邀请无效", "error");
          btnAccept.disabled = true;
          btnReject.disabled = true;
          api("/api/case-management/invites/" + encodeURIComponent(inviteId) + "/accept", {
            method: "POST",
            body: "{}",
          })
            .then(function (res) {
              toast("已加入项目", "success");
              var pid =
                (res && res.project_id) ||
                (m.payload && m.payload.project_id) ||
                "";
              return loadMessages().then(function () {
                if (typeof global.CmOnInviteAccepted === "function") {
                  return global.CmOnInviteAccepted(pid);
                }
                if (pid && !document.body.classList.contains("cm-page")) {
                  global.location.href =
                    "/tool/case-management?project_id=" + encodeURIComponent(pid);
                }
              });
            })
            .catch(function (err) {
              toast(err.message || "操作失败", "error");
              btnAccept.disabled = false;
              btnReject.disabled = false;
            });
        });
        var btnReject = document.createElement("button");
        btnReject.type = "button";
        btnReject.className = "cm-btn cm-btn--ghost cm-btn--sm";
        btnReject.textContent = "拒绝";
        btnReject.addEventListener("click", function () {
          if (!inviteId) return toast("邀请无效", "error");
          btnAccept.disabled = true;
          btnReject.disabled = true;
          api("/api/case-management/invites/" + encodeURIComponent(inviteId) + "/reject", {
            method: "POST",
            body: "{}",
          })
            .then(function () {
              toast("已拒绝邀请", "success");
              return loadMessages();
            })
            .catch(function (err) {
              toast(err.message || "操作失败", "error");
              btnAccept.disabled = false;
              btnReject.disabled = false;
            });
        });
        actions.appendChild(btnAccept);
        actions.appendChild(btnReject);
        content.appendChild(actions);
      } else if (m.msg_type === "project_invite" && m.status === "acted") {
        var done = document.createElement("span");
        done.className = "cm-msg-card__meta";
        done.textContent = "已处理";
        content.appendChild(done);
      }

      card.appendChild(rail);
      card.appendChild(checkWrap);
      card.appendChild(content);

      var foot = document.createElement("div");
      foot.className = "cm-msg-card__foot";
      if (m.msg_type === "system_daily_stats") {
        var detailBtn = document.createElement("button");
        detailBtn.type = "button";
        detailBtn.className = "cm-msg-card__detail-btn";
        detailBtn.textContent = "查看详情";
        detailBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openDailyStatsDetailInbox(m);
        });
        foot.appendChild(detailBtn);
      } else if (m.msg_type === "system_user_feedback") {
        var fbDetailBtn = document.createElement("button");
        fbDetailBtn.type = "button";
        fbDetailBtn.className = "cm-msg-card__detail-btn";
        fbDetailBtn.textContent = "查看详情";
        fbDetailBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openFeedbackDetailInbox(m);
        });
        foot.appendChild(fbDetailBtn);
      } else if (meta.hint && m.msg_type !== "project_invite") {
        var hintEl = document.createElement("span");
        hintEl.className = "cm-msg-card__hint";
        hintEl.textContent = meta.hint;
        foot.appendChild(hintEl);
      }
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "cm-msg-card__del";
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!mid) return;
        confirmInbox("确定删除这条消息？删除后可不再显示。", "删除消息").then(function (ok) {
          if (!ok) return;
          softDeleteInbox({ ids: [mid] })
            .then(function (res) {
              var n = Number((res && res.updated) || 0);
              if (n > 0) toast("已删除", "success");
              delete state.selectedIds[mid];
              return loadMessages(state.page);
            })
            .catch(function (err) {
              toast((err && err.message) || "删除失败", "error");
            });
        });
      });
      foot.appendChild(delBtn);
      card.appendChild(foot);

      card.addEventListener("click", function (e) {
        if (e.target.closest("button") || e.target.closest("input")) return;
        // 先发已读请求，可跳转则立即深链（不等待），避免二次拉列表
        markOneRead(m, card);
        if (meta.nav !== "none") navigateMsgInbox(meta);
      });

      box.appendChild(card);
    });
  }

  function refreshUnread() {
    return api("/api/case-management/messages?page=1&page_size=1")
      .then(function (data) {
        state.unread = data.unread_count != null ? data.unread_count : 0;
        syncBadge();
        return state.unread;
      })
      .catch(function () {
        return 0;
      });
  }

  /** 仅已登录时拉未读；未登录不请求 messages，避免登录页 401。不改 refreshUnread 供已登录调用方。 */
  function refreshUnreadIfAuthenticated() {
    var clearBadge = function () {
      state.unread = 0;
      syncBadge();
      return 0;
    };
    if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === "function") {
      return global.HfAuthNav.fetchMe()
        .then(function (data) {
          if (data && data.authenticated) return refreshUnread();
          return clearBadge();
        })
        .catch(function () {
          return clearBadge();
        });
    }
    return Promise.resolve(clearBadge());
  }

  function loadMessages(page) {
    var p = page != null ? Math.max(1, Number(page) || 1) : state.page || 1;
    state.page = p;
    state.loading = true;
    renderLoadingInbox();
    var q =
      "/api/case-management/messages?page=" +
      encodeURIComponent(String(p)) +
      "&page_size=" +
      encodeURIComponent(String(PAGE_SIZE_INBOX));
    if (state.filter === "unread") q += "&status=unread";
    return api(q)
      .then(function (data) {
        state.items = data.items || [];
        state.unread = data.unread_count != null ? data.unread_count : 0;
        state.total = data.total != null ? Number(data.total) : state.items.length;
        state.pageSize = data.page_size != null ? Number(data.page_size) : PAGE_SIZE_INBOX;
        state.page = data.page != null ? Number(data.page) : p;
        state.pageCount =
          data.page_count != null
            ? Number(data.page_count)
            : Math.ceil(state.total / state.pageSize) || 0;
        // 当前页被删空（如未读筛选项已读完）且前面还有页 → 回退一页
        if (!state.items.length && state.page > 1) {
          var back = state.pageCount > 0 ? Math.min(state.page - 1, state.pageCount) : state.page - 1;
          return loadMessages(Math.max(1, back));
        }
        syncBadge();
        renderList();
      })
      .finally(function () {
        state.loading = false;
      });
  }

  function openMessages() {
    var mask = $("cm-messages-mask");
    if (!mask) return;
    var openPanel = function () {
      mask.classList.remove("is-hidden");
      clearSelectionInbox();
      state.page = 1;
      loadMessages(1).catch(function (err) {
        if (err && err.status === 401) {
          closeMessages();
          goLogin();
          return;
        }
        var box = $("cm-messages-list");
        if (box) {
          box.innerHTML = "";
          var empty = document.createElement("p");
          empty.className = "cm-messages-empty";
          empty.textContent = (err && err.message) || "加载消息失败";
          box.appendChild(empty);
        }
        syncPagerInbox();
        toast(err.message || "加载消息失败", "error");
      });
    };
    if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === "function") {
      global.HfAuthNav.fetchMe()
        .then(function (data) {
          if (!data || !data.authenticated) {
            goLogin();
            return;
          }
          openPanel();
        })
        .catch(function () {
          openPanel();
        });
      return;
    }
    openPanel();
  }

  function closeMessages() {
    closeDailyStatsDetailInbox();
    var mask = $("cm-messages-mask");
    if (mask) mask.classList.add("is-hidden");
  }

  function setFilterInbox(filter) {
    state.filter = filter === "unread" ? "unread" : "all";
    syncFilterTabs();
    clearSelectionInbox();
    state.page = 1;
    loadMessages(1).catch(function (err) {
      toast((err && err.message) || "加载失败", "error");
    });
  }

  function selectPageInbox() {
    state.selectAllMode = false;
    state.selectedIds = {};
    (state.items || []).forEach(function (m) {
      if (m && m.id != null) state.selectedIds[String(m.id)] = true;
    });
    renderList();
  }

  function selectAllInbox() {
    state.selectAllMode = true;
    state.selectedIds = {};
    (state.items || []).forEach(function (m) {
      if (m && m.id != null) state.selectedIds[String(m.id)] = true;
    });
    renderList();
  }

  function batchDeleteInbox() {
    var n = selectedCountInbox();
    if (n <= 0) return;
    var msg = state.selectAllMode
      ? "确定删除当前筛选下的全部 " + n + " 条消息？"
      : "确定删除已选的 " + n + " 条消息？";
    confirmInbox(msg, "批量删除").then(function (ok) {
      if (!ok) return;
      var payload;
      if (state.selectAllMode) {
        payload = { all: true };
        if (state.filter === "unread") payload.status = "unread";
      } else {
        payload = { ids: Object.keys(state.selectedIds) };
      }
      softDeleteInbox(payload)
        .then(function (res) {
          var updated = Number((res && res.updated) || 0);
          if (updated > 0) toast("已删除 " + updated + " 条", "success");
          clearSelectionInbox();
          return loadMessages(1);
        })
        .catch(function (err) {
          toast((err && err.message) || "删除失败", "error");
        });
    });
  }

  function init() {
    if (state.bound) return;
    state.bound = true;
    // 标记：深链已由本文件处理，messages_l5 勿再挂二次请求
    global.__CM_MSG_INBOX_NAV__ = true;

    var btn = $("cm-btn-messages");
    if (btn) btn.addEventListener("click", openMessages);
    var closeBtn = $("cm-messages-close");
    if (closeBtn) closeBtn.addEventListener("click", closeMessages);
    var doneBtn = $("cm-messages-done");
    if (doneBtn) doneBtn.addEventListener("click", closeMessages);
    var readAllBtn = $("cm-messages-read-all");
    if (readAllBtn) readAllBtn.addEventListener("click", markAllRead);
    var mask = $("cm-messages-mask");
    if (mask) {
      mask.addEventListener("click", function (e) {
        if (e.target === mask) closeMessages();
      });
    }
    var dailyDetail = $("cm-daily-detail");
    if (dailyDetail) {
      dailyDetail.addEventListener("click", function (e) {
        if (e.target === dailyDetail) closeDailyStatsDetailInbox();
      });
    }
    var dailyClose = $("cm-daily-detail-close");
    if (dailyClose) dailyClose.addEventListener("click", closeDailyStatsDetailInbox);
    var feedbackDetail = $("cm-feedback-detail");
    if (feedbackDetail) {
      feedbackDetail.addEventListener("click", function (e) {
        if (e.target === feedbackDetail) closeFeedbackDetailInbox();
      });
    }
    var feedbackClose = $("cm-feedback-detail-close");
    if (feedbackClose) feedbackClose.addEventListener("click", closeFeedbackDetailInbox);
    var feedbackLightbox = $("cm-feedback-lightbox");
    if (feedbackLightbox) {
      feedbackLightbox.addEventListener("click", function (e) {
        if (e.target === feedbackLightbox) closeFeedbackLightboxInbox();
      });
    }
    var feedbackLightboxClose = $("cm-feedback-lightbox-close");
    if (feedbackLightboxClose) feedbackLightboxClose.addEventListener("click", closeFeedbackLightboxInbox);
    var dailyUsersClose = $("cm-daily-users-close");
    if (dailyUsersClose) dailyUsersClose.addEventListener("click", closeDailyLoginUsersInbox);
    var dailyUsersLayer = $("cm-daily-users");
    if (dailyUsersLayer) {
      dailyUsersLayer.addEventListener("click", function (e) {
        if (e.target === dailyUsersLayer) closeDailyLoginUsersInbox();
      });
    }
    var viewTotalBtn = $("cm-daily-view-login-total");
    if (viewTotalBtn) {
      viewTotalBtn.addEventListener("click", function () {
        openDailyLoginUsersInbox("login-total");
      });
    }
    var viewUniqueBtn = $("cm-daily-view-login-unique");
    if (viewUniqueBtn) {
      viewUniqueBtn.addEventListener("click", function () {
        openDailyLoginUsersInbox("login-unique");
      });
    }
    var viewAnonTotalBtn = $("cm-daily-view-anon-total");
    if (viewAnonTotalBtn) {
      viewAnonTotalBtn.addEventListener("click", function () {
        openDailyAnonVisitorsInbox("anon-total");
      });
    }
    var viewAnonUniqueBtn = $("cm-daily-view-anon-unique");
    if (viewAnonUniqueBtn) {
      viewAnonUniqueBtn.addEventListener("click", function () {
        openDailyAnonVisitorsInbox("anon-unique");
      });
    }
    var viewAnonCleanBtn = $("cm-daily-view-anon-clean");
    if (viewAnonCleanBtn) {
      viewAnonCleanBtn.addEventListener("click", function () {
        openDailyAnonVisitorsInbox("anon-clean");
      });
    }
    var filterBar = $("cm-messages-filter");
    if (filterBar) {
      filterBar.addEventListener("click", function (e) {
        var t = e.target.closest("[data-filter]");
        if (!t) return;
        setFilterInbox(t.getAttribute("data-filter"));
      });
    }
    var prevBtn = $("cm-messages-prev");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (state.page <= 1 || state.loading) return;
        clearSelectionInbox();
        loadMessages(state.page - 1).catch(function (err) {
          toast((err && err.message) || "加载失败", "error");
        });
      });
    }
    var nextBtn = $("cm-messages-next");
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (state.pageCount <= 0 || state.page >= state.pageCount || state.loading) return;
        clearSelectionInbox();
        loadMessages(state.page + 1).catch(function (err) {
          toast((err && err.message) || "加载失败", "error");
        });
      });
    }
    var selPage = $("cm-messages-select-page");
    if (selPage) selPage.addEventListener("click", selectPageInbox);
    var selAll = $("cm-messages-select-all");
    if (selAll) selAll.addEventListener("click", selectAllInbox);
    var selClear = $("cm-messages-select-clear");
    if (selClear) selClear.addEventListener("click", clearSelectionInbox);
    var batchDel = $("cm-messages-batch-delete");
    if (batchDel) batchDel.addEventListener("click", batchDeleteInbox);
    var confOk = $("cm-messages-confirm-ok");
    if (confOk) confOk.addEventListener("click", function () {
      closeConfirmInbox(true);
    });
    var confCancel = $("cm-messages-confirm-cancel");
    if (confCancel) confCancel.addEventListener("click", function () {
      closeConfirmInbox(false);
    });
    var confLayer = $("cm-messages-confirm");
    if (confLayer) {
      confLayer.addEventListener("click", function (e) {
        if (e.target === confLayer) closeConfirmInbox(false);
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var conf = $("cm-messages-confirm");
      if (conf && !conf.classList.contains("is-hidden")) {
        closeConfirmInbox(false);
        return;
      }
      var dailyUsers = $("cm-daily-users");
      if (dailyUsers && !dailyUsers.classList.contains("is-hidden")) {
        closeDailyLoginUsersInbox();
        return;
      }
      var daily = $("cm-daily-detail");
      if (daily && !daily.classList.contains("is-hidden")) {
        closeDailyStatsDetailInbox();
        return;
      }
      var m = $("cm-messages-mask");
      if (m && !m.classList.contains("is-hidden")) closeMessages();
    });
    document.addEventListener("hf-auth-nav-updated", function (ev) {
      var detail = (ev && ev.detail) || {};
      if (detail.authenticated) refreshUnread();
      else {
        state.unread = 0;
        syncBadge();
      }
    });
    refreshUnreadIfAuthenticated();
  }

  global.CmMessagesUi = {
    init: init,
    open: openMessages,
    close: closeMessages,
    refreshUnread: refreshUnread,
    refreshUnreadIfAuthenticated: refreshUnreadIfAuthenticated,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
