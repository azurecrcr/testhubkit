/**
 * CM 用例血缘面板（只读，不改 app.js）。
 * 底部布局与样式独立于旧卡片堆叠，避免影响其它模块。
 */
(function () {
  var PREVIEW_LIMIT = 3;
  var MODAL_PAGE_SIZE = 10;
  var execModalState = { items: [], page: 1, caseId: "" };

  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  var DEFECT_STATUS_LABEL = {
    open: "待处理",
    confirmed: "已确认",
    in_progress: "处理中",
    resolved: "已解决",
    closed: "已关闭",
    rejected: "已拒绝",
  };
  var EXEC_RESULT_LABEL = {
    pass: "通过",
    fail: "失败",
    blocked: "阻塞",
    skip: "跳过",
  };
  function defectStatusBadge(status) {
    var st = String(status || "").trim().toLowerCase() || "open";
    var label = DEFECT_STATUS_LABEL[st] || st;
    var tone = DEFECT_STATUS_LABEL[st] ? st : "unknown";
    return (
      '<span class="cm-l5-status cm-l5-status--' +
      esc(tone) +
      '">' +
      esc(label) +
      "</span>"
    );
  }
  function execResultLabel(result) {
    var key = String(result || "").toLowerCase();
    return EXEC_RESULT_LABEL[key] || key || "—";
  }
  function formatExecItem(e) {
    var result = String(e.result || "").toLowerCase();
    var html =
      "<li>" +
      '<div class="cm-l5-exec-item__head">' +
      '<span class="cm-l5-exec-item__result cm-l5-exec-item__result--' +
      esc(result || "skip") +
      '">' +
      esc(execResultLabel(result)) +
      "</span>" +
      '<span class="cm-l5-exec-item__time">' +
      esc(e.executed_at || "") +
      "</span>" +
      "</div>";
    if (e.comment) {
      html +=
        '<div class="cm-l5-exec-item__comment">' + esc(e.comment) + "</div>";
    }
    html += "</li>";
    return html;
  }
  function ensureExecModal() {
    var mask = $("cm-l5-exec-mask");
    if (mask) return mask;
    mask = document.createElement("div");
    mask.id = "cm-l5-exec-mask";
    mask.className = "cm-modal-mask cm-modal-mask--over-drawer is-hidden";
    mask.innerHTML =
      '<div class="cm-modal cm-modal--cyan cm-modal--l5-exec" role="dialog" aria-labelledby="cm-l5-exec-title">' +
      '<div class="cm-modal__head">' +
      "<div>" +
      '<p class="cm-modal__eyebrow">Executions</p>' +
      '<strong id="cm-l5-exec-title">执行记录</strong>' +
      "</div>" +
      '<button type="button" class="cm-icon-btn" id="cm-l5-exec-close" aria-label="关闭">×</button>' +
      "</div>" +
      '<div class="cm-l5-exec-modal__body">' +
      '<p class="cm-l5-muted" id="cm-l5-exec-loading">加载中…</p>' +
      '<ul class="cm-l5-exec-modal-list is-hidden" id="cm-l5-exec-modal-list"></ul>' +
      "</div>" +
      '<div class="cm-pager cm-l5-exec-pager is-hidden" id="cm-l5-exec-pager">' +
      '<button type="button" class="cm-btn cm-btn--ghost" id="cm-l5-exec-prev">上一页</button>' +
      '<span id="cm-l5-exec-page-info">1 / 1</span>' +
      '<button type="button" class="cm-btn cm-btn--ghost" id="cm-l5-exec-next">下一页</button>' +
      "</div>" +
      '<div class="cm-modal__actions">' +
      '<button type="button" class="cm-btn" id="cm-l5-exec-ok">关闭</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(mask);
    function close() {
      mask.classList.add("is-hidden");
    }
    mask.addEventListener("click", function (e) {
      if (e.target === mask) close();
    });
    $("cm-l5-exec-close").addEventListener("click", close);
    $("cm-l5-exec-ok").addEventListener("click", close);
    $("cm-l5-exec-prev").addEventListener("click", function () {
      if (execModalState.page <= 1) return;
      execModalState.page -= 1;
      renderExecModalPage();
    });
    $("cm-l5-exec-next").addEventListener("click", function () {
      var totalPages = Math.max(
        1,
        Math.ceil(execModalState.items.length / MODAL_PAGE_SIZE)
      );
      if (execModalState.page >= totalPages) return;
      execModalState.page += 1;
      renderExecModalPage();
    });
    return mask;
  }
  function renderExecModalPage() {
    var list = $("cm-l5-exec-modal-list");
    var pager = $("cm-l5-exec-pager");
    var info = $("cm-l5-exec-page-info");
    var prev = $("cm-l5-exec-prev");
    var next = $("cm-l5-exec-next");
    var title = $("cm-l5-exec-title");
    var items = execModalState.items || [];
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / MODAL_PAGE_SIZE) || 1);
    if (execModalState.page > totalPages) execModalState.page = totalPages;
    if (execModalState.page < 1) execModalState.page = 1;
    var page = execModalState.page;
    var start = (page - 1) * MODAL_PAGE_SIZE;
    var pageItems = items.slice(start, start + MODAL_PAGE_SIZE);
    if (title) title.textContent = "执行记录（" + total + "）";
    if (!list) return;
    if (!total) {
      list.innerHTML = '<li class="cm-l5-muted">暂无执行记录</li>';
    } else {
      list.innerHTML = pageItems.map(formatExecItem).join("");
    }
    list.classList.remove("is-hidden");
    if (pager) {
      if (total > MODAL_PAGE_SIZE) {
        pager.classList.remove("is-hidden");
        if (info) info.textContent = page + " / " + totalPages;
        if (prev) prev.disabled = page <= 1;
        if (next) next.disabled = page >= totalPages;
      } else {
        pager.classList.add("is-hidden");
      }
    }
    var body = list.parentElement;
    if (body) body.scrollTop = 0;
  }
  function openExecModal(caseId) {
    if (!caseId) return;
    var mask = ensureExecModal();
    var list = $("cm-l5-exec-modal-list");
    var loading = $("cm-l5-exec-loading");
    var pager = $("cm-l5-exec-pager");
    var title = $("cm-l5-exec-title");
    execModalState = { items: [], page: 1, caseId: caseId };
    if (title) title.textContent = "执行记录";
    if (list) {
      list.innerHTML = "";
      list.classList.add("is-hidden");
    }
    if (pager) pager.classList.add("is-hidden");
    if (loading) {
      loading.textContent = "加载中…";
      loading.classList.remove("is-hidden");
    }
    mask.classList.remove("is-hidden");
    fetch(
      "/api/case-management/cases/" +
        encodeURIComponent(caseId) +
        "/executions?limit=200",
      { credentials: "same-origin" }
    )
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error((j && j.error) || "加载失败");
          return j;
        });
      })
      .then(function (data) {
        var items = data.items || data || [];
        if (!Array.isArray(items)) items = [];
        if (loading) loading.classList.add("is-hidden");
        execModalState.items = items;
        execModalState.page = 1;
        renderExecModalPage();
      })
      .catch(function (e) {
        if (loading) {
          loading.textContent = e.message || "加载失败";
          loading.classList.remove("is-hidden");
        }
      });
  }
  function render(box, data, caseId) {
    var exes = data.executions || [];
    var execTotal = Number(data.execution_total);
    if (!isFinite(execTotal) || execTotal < exes.length) execTotal = exes.length;
    var html =
      '<section class="cm-l5-lineage cm-l5-lineage--exec" aria-label="最近执行">' +
      '<header class="cm-l5-section__head">' +
      '<div class="cm-l5-section__head-main">' +
      '<p class="cm-l5-section__eyebrow">Executions</p>' +
      '<h3 class="cm-l5-section__title">最近执行</h3>' +
      "</div>" +
      '<span class="cm-l5-section__tag">共 ' +
      execTotal +
      "</span>" +
      "</header>";
    if (!exes.length) {
      html += '<p class="cm-l5-muted">暂无执行记录</p>';
    } else {
      html +=
        '<ul class="cm-l5-exec-list">' +
        exes
          .slice(0, PREVIEW_LIMIT)
          .map(function (e) {
            return (
              "<li><span>" +
              esc(e.executed_at || "") +
              "</span><span class='cm-l5-exec-list__result'>" +
              esc(execResultLabel(e.result)) +
              "</span></li>"
            );
          })
          .join("") +
        "</ul>";
      if (execTotal > PREVIEW_LIMIT) {
        html +=
          '<button type="button" class="cm-l5-exec-more" id="cm-l5-exec-more">' +
          "查看全部（" +
          execTotal +
          "）</button>";
      }
    }
    html += "</section>";
    box.innerHTML = html;
    box.setAttribute("data-case-id", caseId || "");
    var more = $("cm-l5-exec-more");
    if (more) {
      more.addEventListener("click", function () {
        openExecModal(caseId || box.getAttribute("data-case-id") || "");
      });
    }
  }
  function load(caseId) {
    var old = document.getElementById("cm-l5-lineage");
    if (old) {
      old.remove();
    }
    // 底部「最近执行」已移除：请到「执行记录」Tab 查看
    return;
  }
  function hook() {
    if (window.__CM_L5_LINEAGE_HOOKED) return;
    window.__CM_L5_LINEAGE_HOOKED = true;
    // 不再挂载血缘 / 最近执行面板
    var old = document.getElementById("cm-l5-lineage");
    if (old) old.remove();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hook);
  } else {
    hook();
  }
})();
