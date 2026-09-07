/**
 * 用例管理页专用：工具栏筛选下拉美化。
 * 仅包装指定 select，通过派发原生 change 保持现有筛选逻辑不变。
 */
(function (global) {
  "use strict";

  if (global.CmFilterSelect) return;

  var OPEN_CLASS = "is-open";

  function getPanel(wrap) {
    if (!wrap) return null;
    return wrap._cmPortalPanel || wrap.querySelector(".cm-filter-dd__panel");
  }

  function clearPanelFixed(panel) {
    if (!panel) return;
    panel.style.position = "";
    panel.style.left = "";
    panel.style.right = "";
    panel.style.top = "";
    panel.style.bottom = "";
    panel.style.minWidth = "";
    panel.style.width = "";
    panel.style.zIndex = "";
    panel.style.visibility = "";
  }

  function restorePortalPanel(wrap) {
    if (!wrap) return;
    var panel = getPanel(wrap);
    if (!panel) return;
    panel.classList.remove("is-portal-open");
    clearPanelFixed(panel);
    if (panel.parentNode !== wrap) {
      var btn = wrap.querySelector(".cm-filter-dd__btn");
      if (btn && btn.nextSibling) wrap.insertBefore(panel, btn.nextSibling);
      else wrap.appendChild(panel);
    }
    wrap._cmPortalPanel = null;
  }

  function portalAndPositionPanel(wrap, panel) {
    if (!wrap || !panel) return;
    var btn = wrap.querySelector(".cm-filter-dd__btn");
    if (!btn) return;
    wrap._cmPortalPanel = panel;
    document.body.appendChild(panel);
    panel.classList.add("is-portal-open");
    var rect = btn.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.left = Math.max(8, rect.left) + "px";
    panel.style.top = rect.bottom + 6 + "px";
    panel.style.bottom = "auto";
    panel.style.minWidth = Math.max(rect.width, 116) + "px";
    panel.style.width = "max-content";
    panel.style.zIndex = "400";
    var panelH = Math.max(panel.offsetHeight || 0, 72);
    var spaceBelow = window.innerHeight - rect.bottom;
    var openUp = spaceBelow < panelH + 16 && rect.top > panelH + 16;
    if (openUp) {
      panel.style.top = "auto";
      panel.style.bottom = Math.max(8, window.innerHeight - rect.top + 6) + "px";
    }
  }

  function closeAll(except) {
    var opens = document.querySelectorAll(".cm-filter-dd.is-open");
    var memberOpens = document.querySelectorAll(
      ".cm-members-table-wrap.is-dd-open, .cm-modal--members.is-dd-open"
    );
    if (!opens.length && !memberOpens.length) return;
    opens.forEach(function (wrap) {
      if (except && wrap === except) return;
      wrap.classList.remove(OPEN_CLASS);
      var btn = wrap.querySelector(".cm-filter-dd__btn");
      if (btn) btn.setAttribute("aria-expanded", "false");
      restorePortalPanel(wrap);
    });
    document.querySelectorAll(".cm-members-table-wrap.is-dd-open").forEach(function (el) {
      if (except && except.closest(".cm-members-table-wrap") === el) return;
      el.classList.remove("is-dd-open");
    });
    document.querySelectorAll(".cm-modal--members.is-dd-open").forEach(function (el) {
      if (except && except.closest(".cm-modal--members") === el) return;
      el.classList.remove("is-dd-open");
    });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function optionTone(value, kind) {
    var v = String(value || "");
    if (kind === "priority") {
      if (v === "P0") return "p0";
      if (v === "P1") return "p1";
      if (v === "P2") return "p2";
      if (v === "P3") return "p3";
      return "all";
    }
    if (kind === "status") {
      if (v === "draft") return "draft";
      if (v === "ready") return "ready";
      if (v === "deprecated") return "deprecated";
      return "all";
    }
    if (kind === "project") {
      return v ? "project" : "all";
    }
    if (kind === "role") {
      if (v === "owner") return "owner";
      if (v === "editor") return "editor";
      if (v === "viewer") return "viewer";
      return "all";
    }
    if (kind === "member") {
      return v ? "ready" : "all";
    }
    return "all";
  }

  function optionLabel(opt) {
    if (!opt) return "";
    return opt.getAttribute("data-label") || opt.textContent || "";
  }

  function syncLabel(wrap, select) {
    var btn = wrap.querySelector(".cm-filter-dd__btn-text");
    var tone = wrap.querySelector(".cm-filter-dd__btn-tone");
    if (!btn) return;
    var opt =
      select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    var text = optionLabel(opt);
    var kind = wrap.getAttribute("data-cm-filter-kind") || "";
    btn.textContent = text || (kind === "project" ? "选择项目" : "");
    if (tone) {
      tone.className =
        "cm-filter-dd__btn-tone cm-filter-dd__btn-tone--" +
        optionTone(select.value, kind);
    }
    var panel = getPanel(wrap);
    if (panel) {
      panel.querySelectorAll(".cm-filter-dd__option").forEach(function (el) {
        el.classList.toggle(
          "is-selected",
          el.getAttribute("data-value") === select.value
        );
      });
    }
  }

  function fillPanel(wrap, select) {
    var panel = getPanel(wrap);
    if (!panel) return;
    var kind = wrap.getAttribute("data-cm-filter-kind") || "";
    panel.innerHTML = "";
    Array.prototype.forEach.call(select.options, function (opt) {
      var item = document.createElement("button");
      item.type = "button";
      var tone = optionTone(opt.value, kind);
      item.className = "cm-filter-dd__option cm-filter-dd__option--" + tone;
      item.setAttribute("role", "option");
      item.setAttribute("data-value", opt.value);
      var label = optionLabel(opt);
      var desc = opt.getAttribute("data-desc") || "";
      if (kind === "role" && desc) {
        item.classList.add("cm-filter-dd__option--rich");
        item.innerHTML =
          '<span class="cm-filter-dd__option-body">' +
          '<span class="cm-filter-dd__option-main">' +
          escapeHtml(label) +
          "</span>" +
          '<span class="cm-filter-dd__option-desc">' +
          escapeHtml(desc) +
          "</span></span>" +
          '<span class="cm-filter-dd__option-check" aria-hidden="true"></span>';
      } else {
        item.innerHTML =
          '<span class="cm-filter-dd__option-label">' +
          escapeHtml(label) +
          "</span>" +
          '<span class="cm-filter-dd__option-check" aria-hidden="true"></span>';
      }
      item.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (select.value !== opt.value) {
          select.value = opt.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        syncLabel(wrap, select);
        closeAll();
      });
      panel.appendChild(item);
    });
    syncLabel(wrap, select);
  }

  function enhance(select) {
    if (!select || select._cmFilterEnhanced) return;
    if (select.closest(".cm-filter-dd")) {
      select._cmFilterEnhanced = true;
      return;
    }

    var kind = select.getAttribute("data-cm-filter") || "";
    var wrap = document.createElement("div");
    wrap.className = "cm-filter-dd";
    if (select.classList.contains("cm-import-suite-select") ||
        select.classList.contains("cm-suite-select")) {
      wrap.classList.add("cm-filter-dd--suite");
    }
    if (select.classList.contains("cm-select--project") || kind === "project") {
      wrap.classList.add("cm-filter-dd--project");
    }
    if (kind === "role") {
      wrap.classList.add("cm-filter-dd--role");
    }
    if (select.classList.contains("cm-members-role-select")) {
      wrap.classList.add("cm-filter-dd--compact");
    }
    if (select.classList.contains("cm-select--members-role-mini")) {
      wrap.classList.add("cm-filter-dd--role-mini");
    }
    wrap.setAttribute("data-cm-filter-kind", kind);

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add("cm-filter-dd__native");
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cm-filter-dd__btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML =
      (kind === "project"
        ? ""
        : '<span class="cm-filter-dd__btn-tone" aria-hidden="true"></span>') +
      '<span class="cm-filter-dd__btn-text"></span>' +
      '<span class="cm-filter-dd__chev" aria-hidden="true"></span>';

    var panel = document.createElement("div");
    panel.className = "cm-filter-dd__panel";
    panel.setAttribute("role", "listbox");

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    fillPanel(wrap, select);

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var willOpen = !wrap.classList.contains(OPEN_CLASS);
      closeAll();
      if (willOpen) {
        wrap.classList.add(OPEN_CLASS);
        btn.setAttribute("aria-expanded", "true");
        // 成员表在带 transform 的弹窗内，fixed 会被困住；挂到 body
        if (
          wrap.classList.contains("cm-filter-dd--compact") &&
          wrap.closest(".cm-members-table-wrap")
        ) {
          var tableWrap = wrap.closest(".cm-members-table-wrap");
          if (tableWrap) tableWrap.classList.add("is-dd-open");
          var membersModal = wrap.closest(".cm-modal--members");
          if (membersModal) membersModal.classList.add("is-dd-open");
          portalAndPositionPanel(wrap, panel);
        }
      }
    });

    select.addEventListener("change", function () {
      syncLabel(wrap, select);
    });

    select._cmFilterEnhanced = true;
  }

  function refresh(select) {
    if (!select) return;
    if (!select._cmFilterEnhanced) {
      enhance(select);
      return;
    }
    var wrap = select.closest(".cm-filter-dd");
    if (!wrap) {
      select._cmFilterEnhanced = false;
      enhance(select);
      return;
    }
    fillPanel(wrap, select);
  }

  function init(root) {
    var scope = root || document;
    scope.querySelectorAll("select.cm-filter-select").forEach(enhance);
  }

  if (!global.__cmFilterSelectDocBound) {
    global.__cmFilterSelectDocBound = true;
    document.addEventListener("click", function () {
      closeAll();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll();
    });
  }

  global.CmFilterSelect = {
    enhance: enhance,
    refresh: refresh,
    init: init,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init();
    });
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
