/**
 * 计划发布（工具栏内联，无弹窗）。
 *
 * 状态机：
 * - open（未发布）：仅「发布」
 * - released（已发布）：「取消发布」「通过」「未通过」——仍可执行用例
 * - passed / failed（已判定）：同上三按钮；执行/加用例锁定
 * - 取消发布 → open，并清空本计划全部执行结果
 */
(function (global) {
  "use strict";

  if (global.CmPlanGateUi) return;

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
    console.log("[CmPlanGateUi]", tone, text);
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

  function confirmDialog(opts) {
    opts = opts || {};
    if (global.CmDialogs && typeof global.CmDialogs.confirm === "function") {
      return global.CmDialogs.confirm(opts);
    }
    return Promise.resolve(window.confirm(opts.message || "确认？"));
  }

  function normalizeStatus(s) {
    var st = String(s || "open").trim().toLowerCase();
    if (st === "releasable") return "released";
    if (st === "released" || st === "passed" || st === "failed") return st;
    return "open";
  }

  function isPublished(s) {
    return normalizeStatus(s) !== "open";
  }

  function isLocked(s) {
    var st = normalizeStatus(s);
    return st === "passed" || st === "failed";
  }

  function statusLabel(s) {
    var map = {
      open: "未发布",
      released: "已发布",
      passed: "通过",
      failed: "未通过",
    };
    return map[normalizeStatus(s)] || "未发布";
  }

  function lockHintHtml(plan) {
    var st = normalizeStatus(plan && plan.release_status);
    if (st === "passed") {
      return (
        '<p class="cm-hint cm-gate-lock-hint">计划已判定为「通过」，执行已锁定。' +
        "改结果或加用例请先取消发布。</p>"
      );
    }
    if (st === "failed") {
      return (
        '<p class="cm-hint cm-gate-lock-hint">计划已判定为「未通过」，执行已锁定。' +
        "改结果或加用例请先取消发布。</p>"
      );
    }
    if (st === "released") {
      return (
        '<p class="cm-hint cm-gate-lock-hint">已发布，可继续执行；' +
        "点「通过 / 未通过」后将锁定执行。</p>"
      );
    }
    return "";
  }

  function buttonsHtml(plan, opts) {
    opts = opts || {};
    var size = opts.sizeClass || "cm-btn--sm";
    var st = normalizeStatus(plan && plan.release_status);
    if (!isPublished(st)) {
      return (
        '<button type="button" class="cm-btn cm-btn--primary ' +
        size +
        '" data-cm-release-action="released" title="发布本计划">发布</button>'
      );
    }
    return (
      '<button type="button" class="cm-btn cm-btn--ghost ' +
      size +
      '" data-cm-release-action="open" title="取消发布并清空执行结果">取消发布</button>' +
      '<button type="button" class="cm-btn ' +
      (st === "passed" ? "cm-btn--primary " : "cm-btn--ghost ") +
      size +
      '" data-cm-release-action="passed" title="标记计划通过（锁定执行）">通过</button>' +
      '<button type="button" class="cm-btn ' +
      (st === "failed" ? "cm-btn--primary " : "cm-btn--ghost ") +
      size +
      '" data-cm-release-action="failed" title="标记计划未通过（锁定执行）">未通过</button>'
    );
  }

  function setStatus(planId, status) {
    return api("/api/l5/plans/" + encodeURIComponent(planId) + "/release-status", {
      method: "POST",
      body: { status: status },
    }).then(function (data) {
      return (data && data.item) || null;
    });
  }

  function handleAction(action, ctx) {
    ctx = ctx || {};
    var planId = String(ctx.planId || "").trim();
    if (!planId) {
      toast("请先打开一个测试计划", "error");
      return Promise.resolve(null);
    }
    var st = String(action || "").trim().toLowerCase();
    var cur = normalizeStatus(ctx.plan && ctx.plan.release_status);

    var run = function () {
      return setStatus(planId, st).then(function (item) {
        if (!item) return null;
        var msg =
          st === "open"
            ? "已取消发布，执行结果已恢复为未测"
            : st === "released"
              ? "已发布"
              : st === "passed"
                ? "已判定为通过，执行已锁定"
                : st === "failed"
                  ? "已判定为未通过，执行已锁定"
                  : "已更新";
        toast(msg, "success");
        if (typeof ctx.onChange === "function") ctx.onChange(item);
        return item;
      });
    };

    if (st === "open") {
      return api("/api/l5/plans/" + encodeURIComponent(planId) + "/execution-summary")
        .catch(function () {
          return { executed: 0, total: 0 };
        })
        .then(function (sum) {
          var n = Number((sum && sum.executed) || 0);
          if (!isFinite(n) || n < 0) n = 0;
          var extra = isLocked(cur)
            ? "当前结论为「" + statusLabel(cur) + "」，取消后将解除锁定。"
            : "";
          return confirmDialog({
            title: "取消发布",
            message:
              "当前计划下的用例已执行了 " +
              n +
              " 条，取消发布会影响已执行用例，并将所有执行状态恢复为未测。" +
              (extra ? extra : "") +
              "确定取消发布吗？",
            confirmText: "取消发布",
            cancelText: "再想想",
            danger: true,
          }).then(function (ok) {
            if (!ok) return null;
            return run();
          });
        })
        .catch(function (err) {
          toast(err.message || "操作失败", "error");
          return null;
        });
    }

    if ((st === "passed" || st === "failed") && cur === st) {
      toast("当前已是「" + statusLabel(st) + "」", "info");
      return Promise.resolve(null);
    }

    return run().catch(function (err) {
      toast(err.message || "操作失败", "error");
      return null;
    });
  }

  function mount(root, ctx) {
    if (!root) return;
    var nodes = root.querySelectorAll("[data-cm-release-action]");
    for (var i = 0; i < nodes.length; i++) {
      (function (btn) {
        btn.onclick = function () {
          if (btn.disabled) return;
          btn.disabled = true;
          var nextCtx = Object.assign({}, ctx, {
            plan: typeof ctx.getPlan === "function" ? ctx.getPlan() : ctx.plan,
          });
          handleAction(btn.getAttribute("data-cm-release-action"), nextCtx).finally(function () {
            btn.disabled = false;
          });
        };
      })(nodes[i]);
    }
  }

  function open(opts) {
    opts = opts || {};
    handleAction("released", {
      planId: opts.planId,
      plan: opts.plan,
      onChange: opts.onChange,
    });
  }

  global.CmPlanGateUi = {
    buttonsHtml: buttonsHtml,
    lockHintHtml: lockHintHtml,
    mount: mount,
    handleAction: handleAction,
    isPublished: isPublished,
    isLocked: isLocked,
    normalizeStatus: normalizeStatus,
    statusLabel: statusLabel,
    open: open,
    close: function () {},
  };
})(window);
