/**
 * 注册 / 登录：单表单 + 手机/邮箱轻量切换（接口仍分邮箱与手机，互不影响）。
 */
(function () {
  "use strict";

  var cfg = window.__HF_AUTH_PAGE__ || {};
  var nextUrl = cfg.next || "/app";
  var loginMode = "password";
  var loginType = "phone";
  var regType = "phone"; // 仅手机注册；邮箱注册已关闭
  var loginCaptchaLoaded = false;
  var agreeResolver = null;

  function $(id) {
    return document.getElementById(id);
  }

  function msg(text, ok) {
    var el = $("auth-page-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "auth-msg " + (ok ? "auth-msg--ok" : "auth-msg--err");
  }

  function closeAgreeModal(ok) {
    var modal = $("auth-agree-modal");
    if (modal) modal.classList.add("is-hidden");
    var fn = agreeResolver;
    agreeResolver = null;
    if (typeof fn === "function") fn(!!ok);
  }

  /** 未勾选协议时弹出确认；同意则自动勾选并继续（国内常见交互） */
  function ensureAgreed(checkboxId) {
    var box = $(checkboxId);
    if (box && box.checked) return Promise.resolve(true);
    var modal = $("auth-agree-modal");
    if (!modal) {
      var ok = window.confirm("请阅读并同意《用户协议》和《隐私政策》后继续。");
      if (ok && box) box.checked = true;
      return Promise.resolve(!!ok);
    }
    modal.classList.remove("is-hidden");
    return new Promise(function (resolve) {
      agreeResolver = function (accepted) {
        if (accepted && box) box.checked = true;
        resolve(!!accepted);
      };
    });
  }

  function api(path, body) {
    return fetch("/api/auth/" + path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || "请求失败");
        return data;
      });
    });
  }

  function loadCaptcha(prefix) {
    return fetch("/api/auth/captcha", { credentials: "same-origin" })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var q = $(prefix + "-captcha-q");
        if (q) q.textContent = data.question || "—";
        if (q) q.dataset.captchaId = data.captcha_id || "";
        return data;
      });
  }

  function captchaPayload(prefix) {
    var q = $(prefix + "-captcha-q");
    return {
      captcha_id: (q && q.dataset.captchaId) || "",
      captcha_answer: ($(prefix + "-captcha-a") && $(prefix + "-captcha-a").value) || "",
    };
  }

  function makeCooldown(btnId, state) {
    return function setCooldown(sec) {
      state.sec = sec;
      var btn = $(btnId);
      if (!btn) return;
      btn.disabled = state.sec > 0;
      btn.textContent = state.sec > 0 ? state.sec + "s" : "获取验证码";
      if (state.timer) clearInterval(state.timer);
      if (state.sec <= 0) return;
      state.timer = setInterval(function () {
        state.sec -= 1;
        btn.disabled = state.sec > 0;
        btn.textContent = state.sec > 0 ? state.sec + "s" : "获取验证码";
        if (state.sec <= 0) clearInterval(state.timer);
      }, 1000);
    };
  }

  var regSendState = { sec: 0, timer: null };
  var loginSendState = { sec: 0, timer: null };
  var setRegSendCooldown = makeCooldown("auth-reg-send-code", regSendState);
  var setLoginSendCooldown = makeCooldown("auth-login-send-code", loginSendState);

  function applyAccountField(kind, type) {
    var isPhone = type === "phone";
    var input = $(kind === "login" ? "auth-login-account" : "auth-reg-account");
    var label = $(kind === "login" ? "auth-login-account-label" : "auth-reg-account-label");
    var codeLabel = $(kind === "login" ? "auth-login-code-label" : "auth-reg-code-label");
    var codeInp = $(kind === "login" ? "auth-login-code-inp" : "auth-reg-code-inp");
    var switchRoot = kind === "login"
      ? document.querySelector("#auth-pane-login .auth-type-switch")
      : document.querySelector("#auth-pane-register .auth-type-switch");

    if (switchRoot) {
      switchRoot.querySelectorAll(".auth-type-switch__btn").forEach(function (btn) {
        var t = btn.getAttribute(kind === "login" ? "data-login-type" : "data-reg-type");
        btn.classList.toggle("is-active", t === type);
      });
    }

    if (label) {
      label.innerHTML = isPhone
        ? (kind === "reg" ? '手机号 <span class="auth-label__req">*</span>' : "手机号")
        : (kind === "reg" ? '邮箱 <span class="auth-label__req">*</span>' : "邮箱");
    }
    if (codeLabel) {
      codeLabel.textContent = isPhone ? "短信验证码" : "邮箱验证码";
    }
    if (codeInp) {
      codeInp.maxLength = isPhone ? 8 : 6;
      codeInp.placeholder = isPhone ? "短信验证码" : "6 位数字";
    }
    if (input) {
      input.value = "";
      if (isPhone) {
        input.type = "tel";
        input.inputMode = "numeric";
        input.maxLength = 11;
        input.autocomplete = "tel";
        input.placeholder = "请输入手机号";
      } else {
        input.type = "email";
        input.inputMode = "email";
        input.removeAttribute("maxLength");
        input.autocomplete = "email";
        input.placeholder = "you@example.com";
      }
    }
  }

  function switchLoginMode(mode) {
    loginMode = mode === "code" ? "code" : "password";
    var pwdPanel = $("auth-login-panel-password");
    var codePanel = $("auth-login-panel-code");
    if (pwdPanel) pwdPanel.classList.toggle("is-hidden", loginMode !== "password");
    if (codePanel) codePanel.classList.toggle("is-hidden", loginMode !== "code");
    if (loginMode === "code" && !loginCaptchaLoaded) {
      loginCaptchaLoaded = true;
      loadCaptcha("auth-login");
    }
  }

  function afterAuthSuccess() {
    msg("成功，正在跳转…", true);
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (me) {
        var user = me && me.user;
        if (user && user.phone_bind_required) {
          var bindNext = "/account/bind-phone?next=" + encodeURIComponent(nextUrl || "/app");
          window.location.href = bindNext;
          return;
        }
        window.location.href = nextUrl;
      })
      .catch(function () {
        window.location.href = nextUrl;
      });
  }

  function accountValue() {
    return (($("auth-login-account") && $("auth-login-account").value) || "").trim();
  }

  function regAccountValue() {
    return (($("auth-reg-account") && $("auth-reg-account").value) || "").trim();
  }

  function switchAuthTab(tab) {
    var target = tab === "register" ? "register" : "login";
    var btn = document.querySelector('[data-auth-main-tab="' + target + '"]');
    if (btn) btn.click();
  }

  /** 已注册：切到登录并带入账号（国内常见引导） */
  function handleAlreadyRegistered(errMsg, account, accountType) {
    var text = String(errMsg || "");
    if (text.indexOf("已注册") < 0) return false;
    switchAuthTab("login");
    if (accountType === "email" || accountType === "phone") {
      loginType = accountType;
      applyAccountField("login", loginType);
    }
    var loginAccount = $("auth-login-account");
    if (loginAccount && account) loginAccount.value = account;
    msg(text.indexOf("请") >= 0 ? text : text + "，请直接登录", false);
    return true;
  }

  function init() {
    var initial = (cfg.initialTab || "login").toLowerCase();
    document.querySelectorAll("[data-auth-main-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-auth-main-tab");
        document.querySelectorAll("[data-auth-main-tab]").forEach(function (b) {
          var on = b.getAttribute("data-auth-main-tab") === tab;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        var loginPane = $("auth-pane-login");
        var regPane = $("auth-pane-register");
        if (loginPane) loginPane.classList.toggle("is-hidden", tab !== "login");
        if (regPane) regPane.classList.toggle("is-hidden", tab !== "register");
        document.body.classList.toggle("auth-tab-register", tab === "register");
        if (tab === "register") loadCaptcha("auth-reg");
      });
    });

    if (initial === "register") {
      var regTab = document.querySelector('[data-auth-main-tab="register"]');
      if (regTab) regTab.click();
    } else {
      loadCaptcha("auth-reg");
    }

    applyAccountField("login", loginType);
    applyAccountField("reg", regType);

    document.querySelectorAll("[data-login-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        loginType = btn.getAttribute("data-login-type") === "email" ? "email" : "phone";
        applyAccountField("login", loginType);
      });
    });
    // 邮箱注册入口已关闭：忽略 data-reg-type，强制手机注册
    regType = "phone";
    applyAccountField("reg", "phone");

    document.querySelectorAll("[data-login-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchLoginMode(btn.getAttribute("data-login-mode"));
      });
    });

    var regRefresh = $("auth-reg-captcha-refresh");
    if (regRefresh) regRefresh.addEventListener("click", function () { loadCaptcha("auth-reg"); });
    var loginRefresh = $("auth-login-captcha-refresh");
    if (loginRefresh) loginRefresh.addEventListener("click", function () { loadCaptcha("auth-login"); });

    $("auth-reg-send-code").addEventListener("click", function () {
      var account = regAccountValue();
      var cap = captchaPayload("auth-reg");
      var req = api("phone/send-code", Object.assign({ phone: account, purpose: "register" }, cap));
      req
        .then(function (d) {
          msg((d && d.message) || "验证码已发送", true);
          setRegSendCooldown(60);
          loadCaptcha("auth-reg");
        })
        .catch(function (e) {
          if (!handleAlreadyRegistered(e.message, account, "phone")) {
            msg(e.message, false);
          }
          loadCaptcha("auth-reg");
        });
    });

    $("auth-login-send-code").addEventListener("click", function () {
      var account = accountValue();
      var cap = captchaPayload("auth-login");
      var req = loginType === "phone"
        ? api("phone/send-code", Object.assign({ phone: account, purpose: "login" }, cap))
        : api("send-code", Object.assign({ email: account, purpose: "login" }, cap));
      req
        .then(function (d) {
          msg((d && d.message) || "验证码已发送", true);
          setLoginSendCooldown(60);
          loadCaptcha("auth-login");
        })
        .catch(function (e) {
          msg(e.message, false);
          loadCaptcha("auth-login");
        });
    });

    function doLoginRequest() {
      var account = accountValue();
      if (loginMode === "code") {
        var code = ($("auth-login-code-inp") && $("auth-login-code-inp").value) || "";
        var req = loginType === "phone"
          ? api("phone/login/code", { phone: account, code: code })
          : api("login/code", { email: account, code: code });
        req.then(afterAuthSuccess).catch(function (e) { msg(e.message, false); });
        return;
      }
      var password = ($("auth-login-password-inp") && $("auth-login-password-inp").value) || "";
      var pwdReq = loginType === "phone"
        ? api("phone/login/password", { phone: account, password: password })
        : api("login/password", { email: account, password: password });
      pwdReq.then(afterAuthSuccess).catch(function (e) { msg(e.message, false); });
    }

    function submitLogin() {
      ensureAgreed("auth-login-agree").then(function (ok) {
        if (!ok) {
          msg("请先同意《用户协议》和《隐私政策》", false);
          return;
        }
        doLoginRequest();
      });
    }

    function doRegisterRequest() {
      var displayName = (($("auth-reg-display-name") && $("auth-reg-display-name").value) || "").trim();
      var pwd = ($("auth-reg-password") && $("auth-reg-password").value) || "";
      var pwd2 = ($("auth-reg-password2") && $("auth-reg-password2").value) || "";
      var account = regAccountValue();
      var code = ($("auth-reg-code-inp") && $("auth-reg-code-inp").value) || "";

      if (!displayName) {
        msg("请填写昵称", false);
        return;
      }
      if (!account) {
        msg(regType === "phone" ? "请填写手机号" : "请填写邮箱", false);
        return;
      }
      if (pwd !== pwd2) {
        msg("两次输入的密码不一致", false);
        return;
      }
      if (!pwd || pwd.length < 8) {
        msg("密码至少 8 位", false);
        return;
      }

      var req = api("phone/register", {
            phone: account,
            code: code,
            password: pwd,
            display_name: displayName,
          });
      req.then(afterAuthSuccess).catch(function (e) {
        if (!handleAlreadyRegistered(e.message, account, regType)) {
          msg(e.message, false);
        }
      });
    }

    function submitRegister() {
      var displayName = (($("auth-reg-display-name") && $("auth-reg-display-name").value) || "").trim();
      var pwd = ($("auth-reg-password") && $("auth-reg-password").value) || "";
      var pwd2 = ($("auth-reg-password2") && $("auth-reg-password2").value) || "";
      var account = regAccountValue();
      if (!displayName) {
        msg("请填写昵称", false);
        return;
      }
      if (!account) {
        msg(regType === "phone" ? "请填写手机号" : "请填写邮箱", false);
        return;
      }
      if (pwd !== pwd2) {
        msg("两次输入的密码不一致", false);
        return;
      }
      if (!pwd || pwd.length < 8) {
        msg("密码至少 8 位", false);
        return;
      }
      ensureAgreed("auth-reg-agree").then(function (ok) {
        if (!ok) {
          msg("请先同意《用户协议》和《隐私政策》", false);
          return;
        }
        doRegisterRequest();
      });
    }

    var loginForm = $("auth-pane-login");
    if (loginForm) {
      loginForm.addEventListener("submit", function (e) {
        e.preventDefault();
        submitLogin();
      });
    }
    var loginSubmit = $("auth-login-submit");
    if (loginSubmit) {
      loginSubmit.addEventListener("click", function (e) {
        e.preventDefault();
        submitLogin();
      });
    }
    $("auth-reg-submit").addEventListener("click", function () {
      submitRegister();
    });

    var agreeOk = $("auth-agree-modal-ok");
    if (agreeOk) {
      agreeOk.addEventListener("click", function () {
        closeAgreeModal(true);
      });
    }
    var agreeCancel = $("auth-agree-modal-cancel");
    if (agreeCancel) {
      agreeCancel.addEventListener("click", function () {
        closeAgreeModal(false);
      });
    }
    var agreeModal = $("auth-agree-modal");
    if (agreeModal) {
      agreeModal.addEventListener("click", function (e) {
        if (e.target === agreeModal) closeAgreeModal(false);
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var modal = $("auth-agree-modal");
      if (modal && !modal.classList.contains("is-hidden")) closeAgreeModal(false);
    });

    document.querySelectorAll(".auth-agree a, .auth-agree-modal a").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    });

    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.authenticated) window.location.href = nextUrl;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
