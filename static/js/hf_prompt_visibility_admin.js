/**
 * 提示词库：管理员全站显隐控制（role = manager）。
 */
(function (global) {
  "use strict";

  if (global.__hfPromptVisibilityAdminBound) return;
  global.__hfPromptVisibilityAdminBound = true;

  function toast(msg, variant) {
    if (typeof global.hfFloatToast === "function") {
      global.hfFloatToast(msg, { placement: "top", variant: variant || "success", duration: 2600 });
      return;
    }
    alert(msg);
  }

  function updateToggleLabel(btn, blurred) {
    if (!btn) return;
    if (blurred) {
      btn.textContent = "显示提示词（全站）";
      btn.title = "当前为隐藏状态，点击后全站用户可查看提示词";
    } else {
      btn.textContent = "隐藏提示词（全站）";
      btn.title = "当前为显示状态，点击后全站用户将看到蒙层";
    }
    btn.setAttribute("data-blurred", blurred ? "1" : "0");
  }

  function init() {
    var wrap = document.getElementById("hf-prompt-visibility-admin-wrap");
    var btn = document.getElementById("hf-prompt-visibility-toggle");
    if (!wrap || !btn) return;

    var fetchMe =
      global.HfAuthNav && HfAuthNav.fetchMe
        ? HfAuthNav.fetchMe
        : function () {
            return fetch("/api/auth/me", { credentials: "same-origin" }).then(function (r) {
              return r.json();
            });
          };

    fetchMe()
      .then(function (data) {
        if (!data || !data.can_manage_prompt_visibility) return;
        wrap.classList.remove("hidden");
        updateToggleLabel(btn, !!global.HF_PROMPT_CARDS_BLURRED);

        btn.addEventListener("click", function () {
          var currentlyBlurred = btn.getAttribute("data-blurred") === "1";
          var nextBlurred = !currentlyBlurred;
          btn.disabled = true;
          fetch("/api/toolkit-lock/prompt-cards-blur/set", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blurred: nextBlurred }),
          })
            .then(function (res) {
              return res.json().then(function (payload) {
                return { ok: res.ok, data: payload };
              });
            })
            .then(function (result) {
              if (!result.ok || result.data.error) {
                throw new Error(result.data.error || "操作失败");
              }
              global.HF_PROMPT_CARDS_BLURRED = !!result.data.prompt_cards_blur;
              updateToggleLabel(btn, global.HF_PROMPT_CARDS_BLURRED);
              toast(
                global.HF_PROMPT_CARDS_BLURRED
                  ? "已隐藏提示词，全站用户将看到蒙层"
                  : "已显示提示词，全站用户可查看与复制",
                "success"
              );
              setTimeout(function () {
                global.location.reload();
              }, 600);
            })
            .catch(function (err) {
              toast(err && err.message ? err.message : "操作失败", "warning");
            })
            .finally(function () {
              btn.disabled = false;
            });
        });
      })
      .catch(function () {
        /* 未登录或非管理员：保持隐藏 */
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
