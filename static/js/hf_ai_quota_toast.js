/**
 * AI 每日免费额度 — 底部悬浮提示（纯文案、渐隐、无按钮）
 * 监听 JSON 响应中的 ai_quota 字段；SSE 事件请调用 hfAiQuotaNotify。
 */
(function (global) {
  "use strict";

  if (global.__hfAiQuotaToastBound) return;
  global.__hfAiQuotaToastBound = true;

  var hideTimer = null;
  var fadeTimer = null;

  function injectStyles() {
    if (global.document.getElementById("hf-ai-quota-toast-style")) return;
    var style = global.document.createElement("style");
    style.id = "hf-ai-quota-toast-style";
    style.textContent =
      ".hf-ai-quota-toast{position:fixed;left:50%;bottom:max(2rem,env(safe-area-inset-bottom,0px));" +
      "z-index:10070;width:min(92vw,24rem);pointer-events:none;opacity:0;" +
      "transform:translate(-50%,0.55rem);transition:opacity .38s ease,transform .38s ease}" +
      ".hf-ai-quota-toast.is-visible{opacity:1;transform:translate(-50%,0)}" +
      ".hf-ai-quota-toast.is-fading{opacity:0;transform:translate(-50%,0.4rem)}" +
      ".hf-ai-quota-toast__inner{border-radius:.85rem;padding:.72rem 1rem;text-align:center;" +
      "font-size:.8125rem;font-weight:600;line-height:1.45;letter-spacing:.02em;color:#f8fafc;" +
      "border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 32px -6px rgba(15,23,42,.28)}" +
      ".hf-ai-quota-toast__inner--info{background:linear-gradient(135deg,#334155 0%,#1e293b 55%,#0f172a 100%)}" +
      ".hf-ai-quota-toast__inner--warn{color:#fff7ed;border-color:rgba(255,255,255,.22);" +
      "background:linear-gradient(120deg,#c2410c 0%,#ea580c 40%,#f59e0b 75%,#fb923c 100%);" +
      "box-shadow:0 0 0 1px rgba(255,255,255,.12) inset,0 10px 32px -6px rgba(194,65,12,.42)}";
    global.document.head.appendChild(style);
  }

  function getWrap() {
    injectStyles();
    var wrap = global.document.getElementById("hf-ai-quota-toast");
    if (!wrap) {
      wrap = global.document.createElement("div");
      wrap.id = "hf-ai-quota-toast";
      wrap.className = "hf-ai-quota-toast";
      wrap.setAttribute("role", "status");
      wrap.setAttribute("aria-live", "polite");
      wrap.setAttribute("aria-atomic", "true");
      var inner = global.document.createElement("div");
      inner.id = "hf-ai-quota-toast-inner";
      inner.className = "hf-ai-quota-toast__inner hf-ai-quota-toast__inner--info";
      wrap.appendChild(inner);
      global.document.body.appendChild(wrap);
    } else if (wrap.parentElement !== global.document.body) {
      global.document.body.appendChild(wrap);
    }
    return wrap;
  }


  var HF_FILL_GAPS_MIN_FREE_QUOTA = 3;

  function buildFillGapsBlockMessage(remaining) {
    var left = parseInt(remaining, 10);
    if (isNaN(left) || left < 0) left = 0;
    return (
      "今日免费额度剩余 " + left + " 次，用例补充约需 " + HF_FILL_GAPS_MIN_FREE_QUOTA +
      " 次 AI 调用。请前往 AI 配置填写个人文本模型后再试"
    );
  }

  function hfAiQuotaNotifyFillGapsBlock(remaining) {
    var wrap = getWrap();
    var inner = global.document.getElementById("hf-ai-quota-toast-inner");
    if (!inner) return;
    clearTimers();
    wrap.classList.remove("is-visible", "is-fading");
    inner.textContent = buildFillGapsBlockMessage(remaining);
    inner.className = "hf-ai-quota-toast__inner hf-ai-quota-toast__inner--warn";
    global.requestAnimationFrame(function () {
      wrap.classList.add("is-visible");
    });
    hideTimer = global.setTimeout(function () {
      wrap.classList.add("is-fading");
      wrap.classList.remove("is-visible");
      fadeTimer = global.setTimeout(function () {
        wrap.classList.remove("is-fading");
        fadeTimer = null;
      }, 420);
      hideTimer = null;
    }, 4500);
  }

  function cursorQuotaExhaustedMessage() {
    return "今日免费运行次数已用完，增额或私有化请通过投稿/建议联系，或明日再试";
  }

  function buildMessage(quota) {
    var label = String((quota && quota.kind_label) || "模型");
    if (quota && quota.exhausted) {
      if (quota.kind === "cursor") {
        return cursorQuotaExhaustedMessage();
      }
      return (
        "今日" + label + "免费次数已用完。可通过「投稿/建议」联系我们申请增额，或自行前往 AI 配置填写个人模型"
      );
    }
    var remaining = quota && quota.remaining != null ? quota.remaining : 0;
    return "本次已使用 1 次免费额度，今日" + label + "剩余 " + remaining + " 次";
  }

  function clearTimers() {
    if (hideTimer) {
      global.clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (fadeTimer) {
      global.clearTimeout(fadeTimer);
      fadeTimer = null;
    }
  }

  function hfAiQuotaNotify(quota) {
    if (!quota || !quota.used_site_builtin) return;

    var wrap = getWrap();
    var inner = global.document.getElementById("hf-ai-quota-toast-inner");
    if (!inner) return;

    clearTimers();
    wrap.classList.remove("is-visible", "is-fading");
    inner.textContent = buildMessage(quota);
    inner.className =
      "hf-ai-quota-toast__inner " +
      (quota.exhausted
        ? "hf-ai-quota-toast__inner--warn"
        : "hf-ai-quota-toast__inner--info");

    global.requestAnimationFrame(function () {
      wrap.classList.add("is-visible");
    });

    var holdMs = quota.exhausted ? 4500 : 3800;
    var fadeMs = 420;
    hideTimer = global.setTimeout(function () {
      wrap.classList.add("is-fading");
      wrap.classList.remove("is-visible");
      fadeTimer = global.setTimeout(function () {
        wrap.classList.remove("is-fading");
        fadeTimer = null;
      }, fadeMs);
      hideTimer = null;
    }, holdMs);
  }


  function hfAiQuotaFromErrorBody(data) {
    if (!data || typeof data !== "object") return false;
    if (data.ai_quota) {
      var q = Object.assign({}, data.ai_quota, { exhausted: true, remaining: 0 });
      hfAiQuotaNotify(q);
      return true;
    }
    var code = String(data.code || "");
    var err = String(data.error || "");
    if (/FILL_GAPS_QUOTA_INSUFFICIENT/i.test(code) || /用例补充约需/i.test(err)) {
      hfAiQuotaNotifyFillGapsBlock(data.remaining);
      return true;
    }
    if (!/QUOTA_EXCEEDED/i.test(code) && !/额度已用完|免费额度已用完/i.test(err)) {
      return false;
    }
    var kind = "text";
    var kindLabel = "文本模型";
    if (/VISION/i.test(code) || /视觉模型/i.test(err)) {
      kind = "vision";
      kindLabel = "视觉模型";
    } else if (/CURSOR/i.test(code)) {
      kind = "cursor";
      kindLabel = "Cursor Agent";
    }
    hfAiQuotaNotify({
      kind: kind,
      kind_label: kindLabel,
      used_site_builtin: true,
      remaining: 0,
      exhausted: true
    });
    return true;
  }


  function hfAiQuotaFromErrorMsg(msg) {
    var text = String(msg || "");
    if (!text) return false;
    if (/用例补充约需|FILL_GAPS_QUOTA/i.test(text)) {
      hfAiQuotaNotifyFillGapsBlock(null);
      return true;
    }
    if (/QUOTA_EXCEEDED/i.test(text) || /额度已用完|免费额度已用完|今日.*免费.*额度/i.test(text)) {
      var kind = "text";
      var kindLabel = "文本模型";
      if (/视觉模型/i.test(text) || /VISION/i.test(text)) {
        kind = "vision";
        kindLabel = "视觉模型";
      } else if (/Cursor/i.test(text) || /免费运行次数已用完/i.test(text)) {
        kind = "cursor";
        kindLabel = "Cursor Agent";
      }
      hfAiQuotaNotify({
        kind: kind,
        kind_label: kindLabel,
        used_site_builtin: true,
        remaining: 0,
        exhausted: true
      });
      return true;
    }
    return false;
  }

  global.HF_AI_QUOTA_HANDLED = "__HF_AI_QUOTA_HANDLED__";

  function hfAiQuotaFromResponse(data) {
    if (!data || typeof data !== "object") return;
    if (data.ai_quota) hfAiQuotaNotify(data.ai_quota);
  }

  function shouldInspectQuotaResponse(input) {
    var url = "";
    if (typeof input === "string") url = input;
    else if (input && typeof input.url === "string") url = input.url;
    if (!url) return false;
    if (/\/api\/jmeter-scenario\/scenes/i.test(url)) return false;
    return /\/api\/(?:tc\/|test-cases|test-case-generator|user-ai|smart-edit|mindmap-smart-edit|builtin-llm|builtin-ai|doc-tools\/ai|media\/ai|hub\/ai|jmeter-scenario)/i.test(
      url
    );
  }

  function patchFetch() {
    if (!global.fetch || global.__hfAiQuotaFetchPatched) return;
    global.__hfAiQuotaFetchPatched = true;
    var orig = global.fetch.bind(global);
    global.fetch = function patchedFetch(input, init) {
      var inspectQuota = shouldInspectQuotaResponse(input);
      return orig(input, init).then(function (res) {
        if (inspectQuota && res) {
          try {
            var cloned = res.clone();
            cloned
              .json()
              .then(function (data) {
                if (res.ok) {
                  hfAiQuotaFromResponse(data);
                } else {
                  hfAiQuotaFromErrorBody(data);
                }
              })
              .catch(function () {
                /* non-json */
              });
          } catch (e) {
            /* ignore */
          }
        }
        return res;
      });
    };
  }

  global.hfAiQuotaNotify = hfAiQuotaNotify;
  global.hfAiQuotaFromErrorBody = hfAiQuotaFromErrorBody;
  global.hfAiQuotaFromErrorMsg = hfAiQuotaFromErrorMsg;
  global.hfAiQuotaNotifyFillGapsBlock = hfAiQuotaNotifyFillGapsBlock;
  global.hfAiQuotaFromResponse = hfAiQuotaFromResponse;
  patchFetch();

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", patchFetch);
  }
})(typeof window !== "undefined" ? window : this);
