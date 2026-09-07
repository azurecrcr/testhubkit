/**
 * CM L5 增强：深链、关联缺陷、执行失败建缺陷、计划/度量入口。
 * 不修改 app.js 内部函数；仅旁路挂载。用例工作台零改动。
 * 新建用例抽屉不展示串联面板。
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }
  function qs(sel, root) {
    return (root || document).querySelector(sel);
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
      return;
    }
    console.log("[L5]", type || "info", msg);
  }
  function params() {
    var u = new URL(window.location.href);
    return {
      project_id: u.searchParams.get("project_id") || "",
      case_id: u.searchParams.get("case_id") || "",
    };
  }

  function isNewCaseDrawer() {
    var title = $("cm-drawer-title");
    var t = ((title && title.textContent) || "").replace(/\s+/g, "");
    if (t.indexOf("新建用例") >= 0 || t.indexOf("新建") === 0) return true;
    return false;
  }

  function hidePanel() {
    var panel = $("cm-l5-panel");
    if (panel) panel.remove();
    var lineage = $("cm-l5-lineage");
    if (lineage) lineage.remove();
    var btn = $("cm-l5-btn-create-defect");
    if (btn) btn.classList.add("is-hidden");
    var extra = $("cm-l5-extra");
    if (extra) extra.innerHTML = "";
    window.__CM_L5_CASE_ID = "";
  }

  function showCreateDefectBtn() {
    var btn = $("cm-l5-btn-create-defect");
    if (btn) btn.classList.remove("is-hidden");
  }

  function ensurePanel() {
    // 旧「快捷操作」面板已废弃，按钮改挂抽屉底栏
    var panel = $("cm-l5-panel");
    if (panel) panel.remove();
    if (isNewCaseDrawer()) {
      hidePanel();
      return null;
    }
    showCreateDefectBtn();
    return $("cm-l5-btn-create-defect");
  }

  function currentCaseId() {
    if (isNewCaseDrawer()) return "";
    if (window.__CM_L5_CASE_ID) return window.__CM_L5_CASE_ID;
    var editing = document.querySelector("[data-editing-id]");
    if (editing) return editing.getAttribute("data-editing-id") || "";
    return params().case_id || "";
  }

  function loadCaseL5(caseId) {
    if (!caseId || isNewCaseDrawer()) {
      hidePanel();
      return;
    }
    window.__CM_L5_CASE_ID = caseId;
    if (!ensurePanel()) return;
    bindActions();
  }

  function bindActions() {
    if (isNewCaseDrawer()) {
      hidePanel();
      return;
    }
    if (!ensurePanel()) return;
    var btn = $("cm-l5-btn-create-defect");
    if (btn && !btn._l5bound) {
      btn._l5bound = true;
      btn.addEventListener("click", function () {
        var caseId = currentCaseId();
        if (!caseId) return toast("请先打开用例", "error");
        var comment = ($("cm-exec-comment") && $("cm-exec-comment").value) || "";
        btn.disabled = true;
        api("/api/l5/cases/" + caseId + "/executions", {
          method: "POST",
          body: {
            result: "fail",
            comment: comment,
            create_defect: true,
            severity: "major",
          },
        })
          .then(function (data) {
            toast("已记录失败并创建缺陷", "success");
            if (data.defect && data.defect.id) {
              var link =
                "/tool/defect-management?project_id=" +
                encodeURIComponent(data.defect.project_id || "") +
                "&defect_id=" +
                encodeURIComponent(data.defect.id);
              var extra = $("cm-l5-extra");
              if (extra) {
                extra.innerHTML =
                  '<a class="cm-l5-link" href="' +
                  link +
                  '">打开缺陷 ' +
                  (data.defect.display_id || data.defect.id) +
                  "</a>";
              }
            }
          })
          .catch(function (err) {
            toast(err.message || "失败", "error");
          })
          .finally(function () {
            btn.disabled = false;
          });
      });
    }
  }

  function syncPanelVisibility() {
    if (isNewCaseDrawer()) {
      hidePanel();
      return;
    }
    var cid = currentCaseId();
    if (cid) loadCaseL5(cid);
    else hidePanel();
  }

  function hookOpenCase() {
    var drawer = $("cm-drawer");
    if (drawer && !drawer._l5VisHooked) {
      drawer._l5VisHooked = true;
      new MutationObserver(function () {
        syncPanelVisibility();
      }).observe(drawer, { attributes: true, attributeFilter: ["class", "aria-hidden"] });
    }
    var title = $("cm-drawer-title");
    if (title && !title._l5VisHooked) {
      title._l5VisHooked = true;
      new MutationObserver(function () {
        syncPanelVisibility();
      }).observe(title, { childList: true, characterData: true, subtree: true });
    }

    if (!window.__CM_L5_FETCH_HOOKED) {
      window.__CM_L5_FETCH_HOOKED = true;
      var rawFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        return rawFetch(input, init).then(function (res) {
          try {
            var url = typeof input === "string" ? input : (input && input.url) || "";
            var m = url.match(/\/api\/case-management\/cases\/([a-f0-9]{32})$/i);
            if (m && (!init || !init.method || init.method.toUpperCase() === "GET")) {
              var caseId = m[1];
              res
                .clone()
                .json()
                .then(function () {
                  if (isNewCaseDrawer()) hidePanel();
                  else loadCaseL5(caseId);
                })
                .catch(function () {});
            }
          } catch (e) {}
          return res;
        });
      };
    }

    document.addEventListener(
      "click",
      function (e) {
        var t = e.target.closest(
          "#cm-btn-new-case, #cm-case-empty-new, [data-cm-new-case]"
        );
        if (!t) return;
        hidePanel();
        setTimeout(hidePanel, 0);
        setTimeout(hidePanel, 30);
        setTimeout(hidePanel, 120);
        setTimeout(syncPanelVisibility, 200);
      },
      true
    );
  }

  function applyDeepLink() {
    var p = params();
    if (!p.project_id && !p.case_id) return;
    if (p.project_id) {
      var sel = $("cm-project-select");
      if (sel) {
        sel.value = p.project_id;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    if (p.case_id) {
      setTimeout(function () {
        loadCaseL5(p.case_id);
        var row = document.querySelector('[data-case-id="' + p.case_id + '"]');
        if (row) row.click();
      }, 800);
    }
  }

  function injectStyle() {
    if ($("cm-l5-style")) return;
    var s = document.createElement("style");
    s.id = "cm-l5-style";
    s.textContent =
      ".cm-l5-panel.is-hidden,.cm-l5-lineage.is-hidden{display:none!important}";
    document.head.appendChild(s);
  }

  function boot() {
    injectStyle();
    // 启动时不插入面板；新建抽屉强制隐藏
    hidePanel();
    hookOpenCase();
    applyDeepLink();
    setInterval(function () {
      if (isNewCaseDrawer()) hidePanel();
    }, 400);
    api("/api/l5/health").catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
