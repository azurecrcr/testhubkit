/**
 * CM L5 运营面板：同步、审计、治理看板（独立模块）。
 * 暴露 window.CmL5OpsUi
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
    console.log("[CmL5Ops]", tone, text);
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
  function pid() {
    var sel = $("cm-project-select");
    return (sel && sel.value) || "";
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  /** 超长文案截断，title 悬浮看全文 */
  function ellipsisCell(text, maxLen) {
    var full = String(text == null ? "" : text).trim();
    if (!full) return "—";
    var lim = Math.max(4, Number(maxLen) || 20);
    if (full.length <= lim) return esc(full);
    return (
      '<span class="cm-l5ops-ellipsis" title="' +
      esc(full) +
      '">' +
      esc(full.slice(0, lim)) +
      "...</span>"
    );
  }

  function ensureDom() {
    var existing = $("cm-l5ops-mask");
    // 旧版含页签 / 基线 / 看板 / 同步时重建为纯日志弹窗
    if (
      existing &&
      (existing.querySelector("#cm-l5ops-tabs") ||
        existing.querySelector('[data-tab="baseline"]') ||
        existing.querySelector('[data-tab="board"]') ||
        existing.querySelector('[data-tab="sync"]') ||
        existing.querySelector('[data-tab="settings"]'))
    ) {
      existing.parentNode && existing.parentNode.removeChild(existing);
    }
    if ($("cm-l5ops-mask")) return;
    var mask = document.createElement("div");
    mask.id = "cm-l5ops-mask";
    mask.className = "cm-plan-mask is-hidden";
    mask.innerHTML =
      '<div class="cm-plan-modal cm-plan-modal--ops">' +
      '  <div class="cm-plan-modal__head">' +
      "    <div>" +
      '      <p class="cm-plan-modal__eyebrow">Log</p>' +
      '      <h2 class="cm-plan-modal__title" id="cm-l5ops-title">操作日志</h2>' +
      '      <p class="cm-plan-modal__sub" id="cm-l5ops-sub">项目内关键操作留痕（只读）</p>' +
      "    </div>" +
      '    <button type="button" class="cm-icon-btn" id="cm-l5ops-close" aria-label="关闭">×</button>' +
      "  </div>" +
      '  <div class="cm-plan-modal__toolbar" id="cm-l5ops-toolbar"></div>' +
      '  <div class="cm-plan-modal__body" id="cm-l5ops-body"></div>' +
      '  <div class="cm-plan-modal__foot">' +
      '    <button type="button" class="cm-btn cm-btn--ghost" id="cm-l5ops-done">关闭</button>' +
      "  </div>" +
      "</div>";
    document.body.appendChild(mask);
    mask.addEventListener("click", function (e) {
      if (e.target === mask) close();
    });
    $("cm-l5ops-close").onclick = close;
    $("cm-l5ops-done").onclick = close;
  }

  function ensureSettingsDom() {
    if ($("cm-l5settings-mask")) return;
    var mask = document.createElement("div");
    mask.id = "cm-l5settings-mask";
    mask.className = "cm-plan-mask is-hidden";
    mask.innerHTML =
      '<div class="cm-plan-modal cm-plan-modal--ops cm-plan-modal--settings">' +
      '  <div class="cm-plan-modal__head">' +
      "    <div>" +
      '      <p class="cm-plan-modal__eyebrow">Settings</p>' +
      '      <h2 class="cm-plan-modal__title">设置</h2>' +
      '      <p class="cm-plan-modal__sub">仅项目负责人可改</p>' +
      "    </div>" +
      '    <button type="button" class="cm-icon-btn" id="cm-l5settings-close" aria-label="关闭">×</button>' +
      "  </div>" +
      '  <div class="cm-plan-modal__body" id="cm-l5settings-body"></div>' +
      '  <div class="cm-plan-modal__foot">' +
      '    <button type="button" class="cm-btn cm-btn--ghost" id="cm-l5settings-cancel">取消</button>' +
      '    <button type="button" class="cm-btn cm-btn--primary" id="cm-l5settings-save">保存</button>' +
      "  </div>" +
      "</div>";
    document.body.appendChild(mask);
    mask.addEventListener("click", function (e) {
      if (e.target === mask) closeSettings();
    });
    $("cm-l5settings-close").onclick = closeSettings;
    $("cm-l5settings-cancel").onclick = closeSettings;
  }

  function open() {
    if (!pid()) return toast("请先选择项目", "error");
    ensureDom();
    $("cm-l5ops-mask").classList.remove("is-hidden");
    renderAudit();
  }
  function close() {
    var m = $("cm-l5ops-mask");
    if (m) m.classList.add("is-hidden");
  }

  function openSettings() {
    if (!pid()) return toast("请先选择项目", "error");
    ensureSettingsDom();
    $("cm-l5settings-mask").classList.remove("is-hidden");
    renderSettings();
  }
  function closeSettings() {
    var m = $("cm-l5settings-mask");
    if (m) m.classList.add("is-hidden");
  }

  function renderSettings() {
    var p = pid();
    var body = $("cm-l5settings-body");
    if (!body) return;
    body.innerHTML = '<p class="cm-plan-muted">加载中…</p>';

    api("/api/l5/projects/" + p + "/settings")
      .then(function (data) {
        var s = data.settings || {};
        body.innerHTML =
          '<div class="cm-l5ops-settings">' +
          '  <label class="cm-l5ops-toggle" for="cm-l5-rep">' +
          '    <span class="cm-l5ops-toggle__text">' +
          "      <strong>报告人可补充</strong>" +
          "      <em>开启后：缺陷提交人即使只是只读成员，也可补充复现步骤、期望/实际结果、环境等字段；关闭后仍需「编辑」及以上角色。</em>" +
          "    </span>" +
          '    <input type="checkbox" id="cm-l5-rep" ' +
          (s.reporter_can_edit ? "checked" : "") +
          ">" +
          "  </label>" +
          "</div>";
      })
      .catch(function (err) {
        body.innerHTML = '<p class="cm-plan-error">' + esc(err.message) + "</p>";
      });

    var saveBtn = $("cm-l5settings-save");
    if (saveBtn) {
      saveBtn.onclick = function () {
        api("/api/l5/projects/" + p + "/settings", {
          method: "PATCH",
          body: {
            overrides_enabled: false,
            reporter_can_edit: !!($("cm-l5-rep") && $("cm-l5-rep").checked),
          },
        })
          .then(function () {
            toast("保存成功", "success");
            closeSettings();
          })
          .catch(function (err) {
            toast(err.message, "error");
          });
      };
    }
  }

  function renderAudit() {
    var p = pid();
    var page = 1;
    var pageSize = 10;
    if ($("cm-l5ops-title")) $("cm-l5ops-title").textContent = "操作日志";
    if ($("cm-l5ops-sub")) $("cm-l5ops-sub").textContent = "项目内关键操作留痕（只读）";
    $("cm-l5ops-toolbar").innerHTML =
      '<input class="cm-input" id="cm-l5ops-audit-action" placeholder="动作筛选，如：变更缺陷状态">' +
      '<button type="button" class="cm-btn cm-btn--primary" id="cm-l5ops-audit-refresh">查询</button>' +
      '<a class="cm-btn cm-btn--ghost" id="cm-l5ops-audit-export" data-hf-no-nav-loading download href="/api/l5/projects/' +
      encodeURIComponent(p) +
      '/audit/export.csv">导出 CSV</a>';
    function renderPager(total, pages) {
      if (total <= pageSize) {
        return "";
      }
      return (
        '<div class="cm-pager cm-l5ops-audit-pager" id="cm-l5ops-audit-pager">' +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-l5ops-audit-prev"' +
        (page <= 1 ? " disabled" : "") +
        ">上一页</button>" +
        '<span id="cm-l5ops-audit-page-info">' +
        page +
        " / " +
        pages +
        "（共 " +
        total +
        " 条）</span>" +
        '<button type="button" class="cm-btn cm-btn--ghost cm-btn--sm" id="cm-l5ops-audit-next"' +
        (page >= pages ? " disabled" : "") +
        ">下一页</button>" +
        "</div>"
      );
    }
    function bindPager(pages) {
      var prev = $("cm-l5ops-audit-prev");
      var next = $("cm-l5ops-audit-next");
      if (prev) {
        prev.onclick = function () {
          if (page <= 1) return;
          page -= 1;
          load();
        };
      }
      if (next) {
        next.onclick = function () {
          if (page >= pages) return;
          page += 1;
          load();
        };
      }
    }
    function load() {
      $("cm-l5ops-body").innerHTML = '<p class="cm-plan-muted">加载中…</p>';
      var action = (($("cm-l5ops-audit-action") && $("cm-l5ops-audit-action").value) || "").trim();
      var qs =
        "?page=" +
        page +
        "&page_size=" +
        pageSize +
        (action ? "&action=" + encodeURIComponent(action) : "");
      api("/api/l5/projects/" + p + "/audit" + qs)
        .then(function (data) {
          var items = data.items || [];
          var total = Number(data.total || 0);
          var pages = Math.max(1, Number(data.pages || 1));
          if (page > pages) {
            page = pages;
            return load();
          }
            if (!items.length) {
            $("cm-l5ops-body").innerHTML =
              '<div class="cm-plan-empty">暂无操作日志。新建/编辑用例、导入导出、登记执行等操作后会出现。</div>';
            return;
          }
          var html =
            '<table class="cm-plan-table"><thead><tr><th>时间</th><th>动作</th><th>对象</th><th>操作者</th></tr></thead><tbody>';
          items.forEach(function (a) {
            html +=
              "<tr><td>" +
              esc(a.created_at) +
              "</td><td>" +
              ellipsisCell(a.action_label || a.action, 12) +
              "</td><td>" +
              ellipsisCell(a.ref_label || "—", 28) +
              "</td><td>" +
              ellipsisCell(a.actor_name || a.actor_id || "—", 10) +
              "</td></tr>";
          });
          html += "</tbody></table>" + renderPager(total, pages);
          $("cm-l5ops-body").innerHTML = html;
          bindPager(pages);
        })
        .catch(function (err) {
          $("cm-l5ops-body").innerHTML = '<p class="cm-plan-error">' + esc(err.message) + "</p>";
        });
    }
    $("cm-l5ops-audit-refresh").onclick = function () {
      page = 1;
      load();
    };
    load();
  }

  function ensureTopbar() {
    var logBtn = $("cm-btn-l5ops");
    if (logBtn && !logBtn._cmOpsBound) {
      logBtn._cmOpsBound = true;
      logBtn.title = "操作日志";
      logBtn.addEventListener("click", open);
    }
  }

  function boot() {
    ensureTopbar();
    var ws = $("cm-workspace");
    if (ws) {
      new MutationObserver(ensureTopbar).observe(ws, { attributes: true, attributeFilter: ["class"] });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.CmL5OpsUi = { open: open, openSettings: openSettings, close: close, closeSettings: closeSettings };
})(window);
