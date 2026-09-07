/**
 * 管理员：头像菜单「用户建议」→ 列表弹窗（只读）。
 */
(function (global) {
  "use strict";

  if (global.__hfFeedbackAdminBound) return;
  global.__hfFeedbackAdminBound = true;

  var PAGE_SIZE = 10;
  var page = 1;
  var total = 0;

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
    var modal = $("hf-feedback-admin-modal");
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
  }

  function hideModal() {
    var el = $("hf-feedback-admin-modal");
    if (!el) return;
    el.classList.add("hidden");
    el.classList.remove("flex");
    el.setAttribute("aria-hidden", "true");
    el.style.display = "";
    if (!document.querySelector("#hf-feedback-modal:not(.hidden), #hf-feedback-admin-modal:not(.hidden)")) {
      document.body.style.overflow = "";
    }
  }

  function setError(text) {
    var el = $("hf-feedback-admin-error");
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

  function renderItems(items) {
    var list = $("hf-feedback-admin-list");
    var empty = $("hf-feedback-admin-empty");
    if (!list) return;
    list.innerHTML = "";
    if (!items || !items.length) {
      if (empty) empty.classList.remove("is-hidden");
      return;
    }
    if (empty) empty.classList.add("is-hidden");
    items.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "hf-feedback-admin-card";
      var contact = (item.contact || "").trim() || "未填写";
      var pageUrl = (item.page_url || "").trim() || "—";
      var mailTag = item.email_sent ? "已发邮件" : "未发邮件";
      var mailClass = item.email_sent
        ? "hf-feedback-admin-card__tag hf-feedback-admin-card__tag--sent"
        : "hf-feedback-admin-card__tag hf-feedback-admin-card__tag--pending";
      card.innerHTML =
        '<div class="hf-feedback-admin-card__top">' +
        '<p class="hf-feedback-admin-card__content" title="' + escapeHtml(item.content || "") + '">' +
        escapeHtml(item.content || "") +
        "</p>" +
        '<span class="' + mailClass + '">' + escapeHtml(mailTag) + "</span>" +
        "</div>" +
        '<div class="hf-feedback-admin-card__meta">' +
        '<span class="hf-feedback-admin-card__time">' + escapeHtml(item.created_at || "") + "</span>" +
        '<span class="hf-feedback-admin-card__id">#' + escapeHtml((item.id || "").slice(0, 8)) + "</span>" +
        '<span class="hf-feedback-admin-card__chip" title="' + escapeHtml(contact) + '"><em>联系</em>' +
        escapeHtml(contact) +
        "</span>" +
        '<span class="hf-feedback-admin-card__chip hf-feedback-admin-card__chip--url" title="' +
        escapeHtml(pageUrl) +
        '"><em>来源</em>' +
        escapeHtml(pageUrl) +
        "</span>" +
        "</div>";
      var images = item.images || [];
      if (images.length) {
        var imgRow = document.createElement("div");
        imgRow.className = "hf-feedback-admin-card__images";
        images.forEach(function (img) {
          var a = document.createElement("a");
          a.href = img.url || ("/api/feedback/admin/images/" + encodeURIComponent(img.id || ""));
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.title = img.file_name || "截图";
          var im = document.createElement("img");
          im.src = a.href;
          im.alt = img.file_name || "截图";
          a.appendChild(im);
          imgRow.appendChild(a);
        });
        card.appendChild(imgRow);
      }
      list.appendChild(card);
    });
  }

  function updatePager() {
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
    var info = $("hf-feedback-admin-page-info");
    var prev = $("hf-feedback-admin-prev");
    var next = $("hf-feedback-admin-next");
    var desc = $("hf-feedback-admin-desc");
    if (info) info.textContent = "第 " + page + " / " + pages + " 页 · 每页 " + PAGE_SIZE + " 条";
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= pages || total === 0;
    if (desc) desc.textContent = total ? ("共 " + total + " 条建议") : "查看用户提交的投稿与建议";
  }

  function loadPage(targetPage) {
    page = Math.max(1, targetPage || 1);
    setError("");
    var list = $("hf-feedback-admin-list");
    if (list) list.innerHTML = '<p class="hf-feedback-admin-loading">加载中…</p>';
    fetch("/api/feedback/admin/list?page=" + page + "&page_size=" + PAGE_SIZE, {
      credentials: "same-origin",
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, status: r.status, data: d };
        });
      })
      .then(function (res) {
        if (!res.ok || (res.data && res.data.error)) {
          throw new Error((res.data && res.data.error) || "加载失败");
        }
        total = Number(res.data.total || 0);
        page = Number(res.data.page || page);
        renderItems(res.data.items || []);
        updatePager();
      })
      .catch(function (err) {
        if (list) list.innerHTML = "";
        setError(err.message || "加载失败");
        updatePager();
      });
  }

  function openModal() {
    closeUserMenu();
    closeMobileDrawer();
    showModal();
    loadPage(1);
  }

  function setupMenu(data) {
    var canView = !!(data && data.can_view_user_feedback);
    var deskBtn = $("hf-auth-open-feedback-admin");
    var sheetBtn = $("hf-auth-sheet-feedback-admin");
    if (deskBtn) deskBtn.classList.toggle("is-hidden", !canView);
    if (sheetBtn) sheetBtn.classList.toggle("is-hidden", !canView);
    if (!canView) return;

    function bindOnce(btn) {
      if (!btn || btn._hfFeedbackAdminBound) return;
      btn._hfFeedbackAdminBound = true;
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        openModal();
      });
    }
    bindOnce(deskBtn);
    bindOnce(sheetBtn);
  }

  function bindModal() {
    document.querySelectorAll("[data-hf-feedback-admin-close]").forEach(function (el) {
      el.addEventListener("click", hideModal);
    });
    var modal = ensureMounted();
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) hideModal();
      });
    }
    var prev = $("hf-feedback-admin-prev");
    if (prev) prev.addEventListener("click", function () { loadPage(page - 1); });
    var next = $("hf-feedback-admin-next");
    if (next) next.addEventListener("click", function () { loadPage(page + 1); });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var el = $("hf-feedback-admin-modal");
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
