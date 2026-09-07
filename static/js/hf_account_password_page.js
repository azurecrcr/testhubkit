/**
 * 修改密码页：
 * - 仅邮箱：邮箱验证码
 * - 仅手机：短信验证码
 * - 双通道：可切换，默认短信
 */
(function (global) {
  "use strict";

  var captchaId = "";
  var sendCooldownLeft = 0;
  var sendTimer = null;
  var hasEmail = false;
  var hasPhone = false;
  var pwdChannel = "sms"; // sms | email

  function $(id) { return document.getElementById(id); }

  function setMsg(text, isErr) {
    var el = $("pwd-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "pwd-msg" + (text ? (isErr ? " pwd-msg--err" : " pwd-msg--ok") : "");
  }

  function maskPhone(phone, masked) {
    if (masked) return masked;
    var p = String(phone || "").trim();
    if (p.length !== 11) return p;
    return p.slice(0, 3) + "****" + p.slice(7);
  }

  function useSms() {
    return pwdChannel === "sms" && hasPhone;
  }

  function applyChannelUi() {
    var dual = hasEmail && hasPhone;
    var switchEl = $("pwd-channel-switch");
    if (switchEl) switchEl.classList.toggle("is-hidden", !dual);
    if (dual) {
      document.querySelectorAll("[data-pwd-channel]").forEach(function (btn) {
        btn.classList.toggle("is-active", btn.getAttribute("data-pwd-channel") === pwdChannel);
      });
    }

    var sub = $("pwd-sub");
    var label = $("pwd-account-label");
    var account = $("pwd-account");
    var codeLabel = $("pwd-code-label");
    var codeInp = $("pwd-code");
    var hint = $("pwd-hint");
    var user = global.__HF_PWD_USER__ || {};

    if (useSms()) {
      if (sub) sub.textContent = "验证码将以短信发送到您的绑定手机号，验证通过后即可设置新密码。";
      if (label) label.textContent = "绑定手机号";
      if (account) account.value = maskPhone(user.phone, user.phone_masked);
      if (codeLabel) codeLabel.textContent = "短信验证码";
      if (codeInp) { codeInp.maxLength = 8; codeInp.placeholder = "短信验证码"; }
      if (hint) hint.textContent = "短信验证码约 5 分钟内有效，请注意查收。";
    } else {
      if (sub) sub.textContent = "系统将向您的注册邮箱发送验证码，验证通过后即可设置新密码。";
      if (label) label.textContent = "注册邮箱";
      if (account) account.value = user.email || "";
      if (codeLabel) codeLabel.textContent = "邮箱验证码";
      if (codeInp) { codeInp.maxLength = 6; codeInp.placeholder = "6 位数字"; }
      if (hint) hint.textContent = "验证码由系统发件邮箱发出，约 10 分钟内有效，也可查看垃圾箱。";
    }
  }

  function applyAccountUi(user) {
    global.__HF_PWD_USER__ = user || {};
    hasEmail = !!(user && user.has_email);
    hasPhone = !!(user && user.has_phone);
    if (hasPhone) pwdChannel = "sms";
    else pwdChannel = "email";
    applyChannelUi();
  }

  function loadCaptcha() {
    return fetch("/api/auth/captcha", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        captchaId = data.captcha_id || "";
        if ($("pwd-captcha-q")) $("pwd-captcha-q").textContent = data.question || "?";
        if ($("pwd-captcha-a")) $("pwd-captcha-a").value = "";
      })
      .catch(function (err) {
        if ($("pwd-captcha-q")) $("pwd-captcha-q").textContent = "加载失败";
        setMsg(err.message || "图形验证码加载失败", true);
      });
  }

  function updateSendBtn() {
    var btn = $("pwd-send-code");
    if (!btn) return;
    if (sendCooldownLeft > 0) {
      btn.disabled = true;
      btn.textContent = sendCooldownLeft + "s 后重试";
    } else {
      btn.disabled = false;
      btn.textContent = "获取验证码";
    }
  }

  function startCooldown() {
    sendCooldownLeft = 60;
    updateSendBtn();
    if (sendTimer) clearInterval(sendTimer);
    sendTimer = setInterval(function () {
      sendCooldownLeft -= 1;
      if (sendCooldownLeft <= 0) {
        clearInterval(sendTimer);
        sendTimer = null;
      }
      updateSendBtn();
    }, 1000);
  }

  function sendCode() {
    var answer = ($("pwd-captcha-a") && $("pwd-captcha-a").value || "").trim();
    if (!captchaId) {
      setMsg("请先加载图形验证码", true);
      return;
    }
    if (!answer) {
      setMsg("请填写图形验证码", true);
      return;
    }
    var btn = $("pwd-send-code");
    if (btn) btn.disabled = true;
    setMsg("");
    var path = useSms() ? "/api/auth/password/phone/send-code" : "/api/auth/password/send-code";
    fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captcha_id: captchaId, captcha_answer: answer }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || (res.data && res.data.error)) throw new Error((res.data && res.data.error) || "发送失败");
        setMsg((res.data && res.data.message) || "验证码已发送", false);
        startCooldown();
        return loadCaptcha();
      })
      .catch(function (err) {
        setMsg(err.message || "发送失败", true);
        updateSendBtn();
        loadCaptcha();
      });
  }

  function submitChange() {
    var code = ($("pwd-code") && $("pwd-code").value || "").trim();
    var nw = ($("pwd-new") && $("pwd-new").value || "");
    var cf = ($("pwd-confirm") && $("pwd-confirm").value || "");
    if (!code) {
      setMsg(useSms() ? "请输入短信验证码" : "请输入邮箱验证码", true);
      return;
    }
    if (!nw || nw.length < 8) {
      setMsg("新密码至少 8 位", true);
      return;
    }
    if (nw !== cf) {
      setMsg("两次输入的新密码不一致", true);
      return;
    }
    var btn = $("pwd-submit");
    if (btn) btn.disabled = true;
    setMsg("");
    var path = useSms() ? "/api/auth/password/phone/change" : "/api/auth/password/change";
    fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, new_password: nw, confirm_password: cf }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || (res.data && res.data.error)) throw new Error((res.data && res.data.error) || "修改失败");
        setMsg((res.data && res.data.message) || "密码修改成功", false);
        if (typeof global.hfFloatToast === "function") {
          global.hfFloatToast("密码修改成功", { variant: "success", placement: "top", duration: 1800 });
        }
        global.setTimeout(function () {
          global.location.href = "/account/profile";
        }, 1200);
      })
      .catch(function (err) {
        setMsg(err.message || "修改失败", true);
        if (btn) btn.disabled = false;
      });
  }

  function bind() {
    var refresh = $("pwd-captcha-refresh");
    if (refresh) refresh.addEventListener("click", function () { loadCaptcha(); });
    var send = $("pwd-send-code");
    if (send) send.addEventListener("click", sendCode);
    var submit = $("pwd-submit");
    if (submit) submit.addEventListener("click", submitChange);
    document.querySelectorAll("[data-pwd-channel]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        pwdChannel = btn.getAttribute("data-pwd-channel") === "email" ? "email" : "sms";
        applyChannelUi();
      });
    });
  }

  function init() {
    bind();
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (me) {
        if (!me || !me.authenticated || !me.user) {
          global.location.href = "/auth?next=" + encodeURIComponent("/account/password");
          return;
        }
        applyAccountUi(me.user);
        return loadCaptcha();
      })
      .catch(function () {
        global.location.href = "/auth?next=" + encodeURIComponent("/account/password");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
