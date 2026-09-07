/**
 * 管理员：额度增额授予弹窗（独立模块，不影响用户建议 / AI 配置主流程）。
 */
(function (global) {
  "use strict";

  if (global.__hfAiQuotaBonusAdminBound) return;
  global.__hfAiQuotaBonusAdminBound = true;

  var currentUserId = "";

  function $(id) {
    return document.getElementById(id);
  }

  function closeUserMenu() {
    var panel = $("hf-auth-user-menu-panel");
    var btn = $("hf-auth-user-menu-btn");
    if (panel) panel.classList.remove("is-open");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function closeMobileDrawer() {
    var drawer = document.querySelector("[data-gnav-drawer].is-open");
    if (!drawer) return;
    drawer.classList.remove("is-open");
    var burger = document.querySelector("[data-gnav-burger]");
    if (burger) burger.setAttribute("aria-expanded", "false");
  }

  function ensureMounted() {
    var modal = $("hf-quota-bonus-admin-modal");
    if (modal && modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    return modal;
  }

  function showModal() {
    var el = ensureMounted();
    if (!el) return;
    el.classList.remove("hidden");
    el.classList.add("flex");
    el.setAttribute("aria-hidden", "false");
    el.style.display = "flex";
    document.body.style.overflow = "hidden";
    ensureDefaultDates();
  }

  function hideModal() {
    var el = $("hf-quota-bonus-admin-modal");
    if (!el) return;
    el.classList.add("hidden");
    el.classList.remove("flex");
    el.setAttribute("aria-hidden", "true");
    el.style.display = "";
    document.body.style.overflow = "";
  }

  function setError(text) {
    var el = $("hf-quota-bonus-error");
    if (!el) return;
    if (text) {
      el.textContent = text;
      el.classList.remove("hidden");
    } else {
      el.textContent = "";
      el.classList.add("hidden");
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatLocalDate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function addDays(d, days) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + days);
    return x;
  }

  function ensureDefaultDates() {
    var startEl = $("hf-quota-bonus-start");
    var endEl = $("hf-quota-bonus-end");
    if (!startEl || !endEl) return;
    if (!startEl.value) {
      var today = new Date();
      startEl.value = formatLocalDate(today);
      endEl.value = formatLocalDate(addDays(today, 29));
    }
  }

  function applyPreset(name) {
    ensureDefaultDates();
    var today = new Date();
    var startEl = $("hf-quota-bonus-start");
    var endEl = $("hf-quota-bonus-end");
    var textEl = $("hf-quota-bonus-text");
    var visionEl = $("hf-quota-bonus-vision");
    var cursorEl = $("hf-quota-bonus-cursor");
    if (startEl) startEl.value = formatLocalDate(today);
    if (name === "text20") {
      if (textEl) textEl.value = "20";
      if (visionEl) visionEl.value = "0";
      if (cursorEl) cursorEl.value = "0";
      if (endEl) endEl.value = formatLocalDate(addDays(today, 29));
    } else if (name === "bundle") {
      if (textEl) textEl.value = "20";
      if (visionEl) visionEl.value = "5";
      if (cursorEl) cursorEl.value = "2";
      if (endEl) endEl.value = formatLocalDate(addDays(today, 29));
    } else if (name === "cursor5") {
      if (textEl) textEl.value = "0";
      if (visionEl) visionEl.value = "0";
      if (cursorEl) cursorEl.value = "5";
      if (endEl) endEl.value = formatLocalDate(addDays(today, 6));
    }
  }

  function fmtKind(q, label) {
    if (!q) return label + " —";
    var line = label + " " + (q.used || 0) + "/" + (q.limit || 0);
    if (q.bonus > 0) {
      line += "（基础" + (q.base_limit || 0) + "+增额" + q.bonus;
      if (q.bonus_until) line += "·至" + q.bonus_until;
      line += "）";
    }
    return line;
  }

  function renderPreview(data) {
    var box = $("hf-quota-bonus-preview");
    if (!box) return;
    if (!data || !data.user) {
      box.classList.add("is-hidden");
      box.innerHTML = "";
      return;
    }
    var u = data.user;
    var q = data.quota || {};
    currentUserId = String(u.id || "");
    var name = (u.display_name || "").trim() || "未命名";
    var contact = (u.phone || u.email || "").trim() || "—";
    box.innerHTML =
      "<strong>" + escapeHtml(name) + "</strong> · " + escapeHtml(contact) +
      "<br>ID: <code>" + escapeHtml(u.id || "") + "</code><br>" +
      escapeHtml(fmtKind(q.text, "文本")) + " · " +
      escapeHtml(fmtKind(q.vision, "视觉")) + " · " +
      escapeHtml(fmtKind(q.cursor, "Cursor"));
    box.classList.remove("is-hidden");
  }

  function renderGrants(grants) {
    var list = $("hf-quota-bonus-list");
    var empty = $("hf-quota-bonus-empty");
    if (!list) return;
    list.innerHTML = "";
    var onlyActive = $("hf-quota-bonus-only-active");
    var items = Array.isArray(grants) ? grants.slice() : [];
    if (onlyActive && onlyActive.checked) {
      items = items.filter(function (g) { return g && g.status === "active"; });
    }
    if (!items.length) {
      if (empty) {
        empty.textContent = currentUserId ? "暂无授予记录" : "查询用户后显示授予记录";
        empty.classList.remove("is-hidden");
      }
      return;
    }
    if (empty) empty.classList.add("is-hidden");
    items.forEach(function (g) {
      var card = document.createElement("article");
      card.className = "hf-quota-bonus-admin-modal__card";
      var active = g.status === "active";
      var tagClass = active
        ? "hf-quota-bonus-admin-modal__tag hf-quota-bonus-admin-modal__tag--active"
        : "hf-quota-bonus-admin-modal__tag hf-quota-bonus-admin-modal__tag--revoked";
      var top =
        '<div class="hf-quota-bonus-admin-modal__card-top">' +
        "<div><span class=\"" + tagClass + "\">" + escapeHtml(active ? "有效" : "已撤销") + "</span>" +
        "文本+" + escapeHtml(g.bonus_text) +
        " / 视觉+" + escapeHtml(g.bonus_vision) +
        " / Cursor+" + escapeHtml(g.bonus_cursor) +
        "<div class=\"hf-quota-bonus-admin-modal__card-meta\">" +
        escapeHtml(g.start_date) + " ~ " + escapeHtml(g.end_date) +
        (g.note ? " · " + escapeHtml(g.note) : "") +
        "</div></div>";
      if (active) {
        top +=
          '<button type="button" class="hf-quota-bonus-admin-modal__btn hf-quota-bonus-admin-modal__btn--danger" data-revoke-id="' +
          escapeHtml(g.id) + '">撤销</button>';
      }
      top += "</div>";
      card.innerHTML = top;
      list.appendChild(card);
    });
    list.querySelectorAll("[data-revoke-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-revoke-id");
        if (!id) return;
        if (!global.confirm("确认撤销该增额授予？撤销后立即生效，当日已用次数不退回。")) return;
        revokeGrant(id);
      });
    });
  }

  function lookup() {
    setError("");
    var account = (($("hf-quota-bonus-account") && $("hf-quota-bonus-account").value) || "").trim();
    if (!account) {
      setError("请输入账号");
      return;
    }
    var btn = $("hf-quota-bonus-lookup");
    if (btn) btn.disabled = true;
    fetch("/api/admin/ai-quota-bonus/preview?account=" + encodeURIComponent(account), {
      credentials: "same-origin",
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error((data && data.error) || ("HTTP " + r.status));
          return data;
        });
      })
      .then(function (data) {
        renderPreview(data);
        renderGrants(data.grants || []);
      })
      .catch(function (err) {
        currentUserId = "";
        renderPreview(null);
        renderGrants([]);
        setError((err && err.message) || "查询失败");
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function createGrant() {
    setError("");
    var account = (($("hf-quota-bonus-account") && $("hf-quota-bonus-account").value) || "").trim();
    if (!account) {
      setError("请先填写账号");
      return;
    }
    var payload = {
      account: account,
      bonus_text: parseInt(($("hf-quota-bonus-text") && $("hf-quota-bonus-text").value) || "0", 10) || 0,
      bonus_vision: parseInt(($("hf-quota-bonus-vision") && $("hf-quota-bonus-vision").value) || "0", 10) || 0,
      bonus_cursor: parseInt(($("hf-quota-bonus-cursor") && $("hf-quota-bonus-cursor").value) || "0", 10) || 0,
      start_date: (($("hf-quota-bonus-start") && $("hf-quota-bonus-start").value) || "").trim(),
      end_date: (($("hf-quota-bonus-end") && $("hf-quota-bonus-end").value) || "").trim(),
      note: (($("hf-quota-bonus-note") && $("hf-quota-bonus-note").value) || "").trim(),
    };
    var previewLine =
      "确认授予？\n文本+" + payload.bonus_text +
      " / 视觉+" + payload.bonus_vision +
      " / Cursor+" + payload.bonus_cursor +
      "\n" + payload.start_date + " ~ " + payload.end_date;
    if (!global.confirm(previewLine)) return;

    var btn = $("hf-quota-bonus-create");
    if (btn) btn.disabled = true;
    fetch("/api/admin/ai-quota-bonus", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error((data && data.error) || ("HTTP " + r.status));
          return data;
        });
      })
      .then(function (data) {
        if (data.preview) {
          renderPreview(data.preview);
          renderGrants(data.preview.grants || []);
        } else {
          lookup();
        }
      })
      .catch(function (err) {
        setError((err && err.message) || "创建失败");
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function revokeGrant(grantId) {
    setError("");
    fetch("/api/admin/ai-quota-bonus/" + encodeURIComponent(grantId) + "/revoke", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error((data && data.error) || ("HTTP " + r.status));
          return data;
        });
      })
      .then(function (data) {
        if (data.preview) {
          renderPreview(data.preview);
          renderGrants(data.preview.grants || []);
        } else {
          lookup();
        }
      })
      .catch(function (err) {
        setError((err && err.message) || "撤销失败");
      });
  }

  function openModal() {
    closeUserMenu();
    closeMobileDrawer();
    showModal();
    setError("");
  }

  function setupMenu(data) {
    var canView = !!(data && (data.can_manage_builtin_ai || data.can_view_user_feedback));
    var deskBtn = $("hf-auth-open-quota-bonus-admin");
    var sheetBtn = $("hf-auth-sheet-quota-bonus-admin");
    if (deskBtn) deskBtn.classList.toggle("is-hidden", !canView);
    if (sheetBtn) sheetBtn.classList.toggle("is-hidden", !canView);
    if (!canView) return;

    function bindOnce(btn) {
      if (!btn || btn._hfQuotaBonusAdminBound) return;
      btn._hfQuotaBonusAdminBound = true;
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        openModal();
      });
    }
    bindOnce(deskBtn);
    bindOnce(sheetBtn);
  }

  function bindModal() {
    document.querySelectorAll("[data-hf-quota-bonus-admin-close]").forEach(function (el) {
      el.addEventListener("click", hideModal);
    });
    var modal = ensureMounted();
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) hideModal();
      });
    }
    var lookupBtn = $("hf-quota-bonus-lookup");
    if (lookupBtn) lookupBtn.addEventListener("click", lookup);
    var createBtn = $("hf-quota-bonus-create");
    if (createBtn) createBtn.addEventListener("click", createGrant);
    var onlyActive = $("hf-quota-bonus-only-active");
    if (onlyActive) {
      onlyActive.addEventListener("change", function () {
        var account = (($("hf-quota-bonus-account") && $("hf-quota-bonus-account").value) || "").trim();
        if (account) lookup();
      });
    }
    document.querySelectorAll("[data-preset]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        applyPreset(chip.getAttribute("data-preset"));
      });
    });
    var accountEl = $("hf-quota-bonus-account");
    if (accountEl) {
      accountEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          lookup();
        }
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var el = $("hf-quota-bonus-admin-modal");
      if (el && !el.classList.contains("hidden")) hideModal();
    });
  }

  function init() {
    bindModal();
    var fetchMe = global.HfAuthNav && global.HfAuthNav.fetchMe;
    if (fetchMe) {
      fetchMe().then(setupMenu).catch(function () {});
    }
    document.addEventListener("hf-auth-nav-updated", function (ev) {
      setupMenu(ev.detail);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
