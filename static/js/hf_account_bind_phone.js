/**
 * 强制绑定手机号页（独立脚本，复用 /api/auth/phone/bind*，不改资料页逻辑）。
 */
(function (global) {
  "use strict";

  var captchaId = "";
  var cooldown = 0;
  var timer = null;
  var nextUrl = (global.__HF_BIND_PHONE_NEXT__ || "/app").toString();

  function $(id) { return document.getElementById(id); }

  function setMsg(text, isErr) {
    var el = $("hf-bind-phone-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "profile-msg" + (text ? (isErr ? " profile-msg--err" : " profile-msg--ok") : "");
  }

  function loadCaptcha() {
    return fetch("/api/auth/captcha", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        captchaId = data.captcha_id || "";
        if ($("hf-bind-captcha-q")) $("hf-bind-captcha-q").textContent = data.question || "?";
        if ($("hf-bind-captcha-a")) $("hf-bind-captcha-a").value = "";
      })
      .catch(function () {
        if ($("hf-bind-captcha-q")) $("hf-bind-captcha-q").textContent = "加载失败";
      });
  }

  function updateSendBtn() {
    var btn = $("hf-bind-send-code");
    if (!btn) return;
    if (cooldown > 0) {
      btn.disabled = true;
      btn.textContent = cooldown + "s";
    } else {
      btn.disabled = false;
      btn.textContent = "获取验证码";
    }
  }

  function startCooldown() {
    cooldown = 60;
    updateSendBtn();
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      cooldown -= 1;
      if (cooldown <= 0) {
        clearInterval(timer);
        timer = null;
      }
      updateSendBtn();
    }, 1000);
  }

  function sendCode() {
    var phone = (($("hf-bind-phone-input") && $("hf-bind-phone-input").value) || "").trim();
    var answer = (($("hf-bind-captcha-a") && $("hf-bind-captcha-a").value) || "").trim();
    if (!phone) {
      setMsg("请填写手机号", true);
      return;
    }
    if (!captchaId || !answer) {
      setMsg("请填写图形验证码", true);
      return;
    }
    var btn = $("hf-bind-send-code");
    if (btn) btn.disabled = true;
    fetch("/api/auth/phone/bind/send-code", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phone,
        captcha_id: captchaId,
        captcha_answer: answer,
      }),
    })
      .then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, data: d }; });
      })
      .then(function (res) {
        if (!res.ok || (res.data && res.data.error)) {
          throw new Error((res.data && res.data.error) || "发送失败");
        }
        setMsg((res.data && res.data.message) || "验证码已发送", false);
        startCooldown();
        loadCaptcha();
      })
      .catch(function (err) {
        setMsg(err.message || "发送失败", true);
        loadCaptcha();
        updateSendBtn();
      });
  }

  function submitBind() {
    var phone = (($("hf-bind-phone-input") && $("hf-bind-phone-input").value) || "").trim();
    var code = (($("hf-bind-sms-code") && $("hf-bind-sms-code").value) || "").trim();
    if (!phone) {
      setMsg("请填写手机号", true);
      return;
    }
    if (!code) {
      setMsg("请填写短信验证码", true);
      return;
    }
    var btn = $("hf-bind-phone-submit");
    if (btn) btn.disabled = true;
    fetch("/api/auth/phone/bind", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone, code: code }),
    })
      .then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, data: d }; });
      })
      .then(function (res) {
        if (!res.ok || (res.data && res.data.error)) {
          throw new Error((res.data && res.data.error) || "绑定失败");
        }
        setMsg("绑定成功，正在进入…", false);
        if (typeof global.hfFloatToast === "function") {
          global.hfFloatToast("手机号绑定成功", { variant: "success", placement: "top", duration: 1600 });
        }
        var go = function () {
          global.location.href = nextUrl || "/app";
        };
        if (global.HfAuthNav && global.HfAuthNav.refreshNav) {
          return global.HfAuthNav.refreshNav().then(go).catch(go);
        }
        go();
      })
      .catch(function (err) {
        setMsg(err.message || "绑定失败", true);
        if (btn) btn.disabled = false;
      });
  }

  function init() {
    loadCaptcha();
    var refresh = $("hf-bind-captcha-refresh");
    if (refresh) refresh.addEventListener("click", loadCaptcha);
    var send = $("hf-bind-send-code");
    if (send) send.addEventListener("click", sendCode);
    var submit = $("hf-bind-phone-submit");
    if (submit) submit.addEventListener("click", submitBind);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
