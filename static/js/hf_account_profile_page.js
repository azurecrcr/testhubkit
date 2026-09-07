(function (global) {
  "use strict";

  var pendingAvatarFile = null;
  var DEFAULT_AVATAR_URL = "/api/auth/avatar";
  var currentUser = null;
  /** @type {"bind"|"rebind"|"bind_email"} */
  var bindMode = "bind";
  var bindCaptchaId = "";
  var sendCooldownLeft = 0;
  var sendTimer = null;
  var pwdCaptchaId = "";
  var pwdSendCooldownLeft = 0;
  var pwdSendTimer = null;
  /** @type {"sms"|"email"} */
  var pwdChannel = "sms";

  function $(id) { return document.getElementById(id); }

  function setMsg(text, isErr) {
    var el = $("profile-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "profile-msg" + (text ? (isErr ? " profile-msg--err" : " profile-msg--ok") : "");
  }

  function setDrawerMsg(text, isErr) {
    var el = $("profile-drawer-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "profile-msg" + (text ? (isErr ? " profile-msg--err" : " profile-msg--ok") : "");
  }

  function setPwdDrawerMsg(text, isErr) {
    var el = $("profile-pwd-drawer-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "profile-msg" + (text ? (isErr ? " profile-msg--err" : " profile-msg--ok") : "");
  }

  function maskPhone(phone) {
    var p = String(phone || "").trim();
    if ((currentUser && currentUser.phone_masked) && p === currentUser.phone) {
      return currentUser.phone_masked;
    }
    if (p.length !== 11) return p;
    return p.slice(0, 3) + "****" + p.slice(7);
  }

  function showSuccessToastAndGoHome() {
    if (typeof global.hfFloatToast === "function") {
      global.hfFloatToast("保存成功", { variant: "success", placement: "top", duration: 1800 });
    }
    global.setTimeout(function () {
      global.location.href = "/app";
    }, 1600);
  }

  function fetchMe() {
    return fetch("/api/auth/me", { credentials: "same-origin" }).then(function (r) { return r.json(); });
  }

  function showAvatar(user, blobPreview) {
    var img = $("profile-avatar-img");
    var fallback = $("profile-avatar-fallback");
    if (!img || !fallback) return;
    if (blobPreview) {
      img.src = blobPreview;
      img.classList.remove("hidden");
      fallback.classList.add("hidden");
      return;
    }
    img.src = (user && user.avatar_url) || DEFAULT_AVATAR_URL;
    img.classList.remove("hidden");
    fallback.classList.add("hidden");
  }

  function loadBindCaptcha() {
    return fetch("/api/auth/captcha", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        bindCaptchaId = data.captcha_id || "";
        if ($("profile-bind-captcha-q")) $("profile-bind-captcha-q").textContent = data.question || "?";
        if ($("profile-bind-captcha-a")) $("profile-bind-captcha-a").value = "";
      })
      .catch(function () {
        if ($("profile-bind-captcha-q")) $("profile-bind-captcha-q").textContent = "加载失败";
      });
  }

  function updateSendBtn() {
    var btn = $("profile-bind-send-code");
    if (!btn) return;
    if (sendCooldownLeft > 0) {
      btn.disabled = true;
      btn.textContent = sendCooldownLeft + "s";
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

  function openDrawer() {
    closePwdDrawer();
    var drawer = $("profile-bind-drawer");
    if (!drawer) return;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("profile-drawer-open");
    loadBindCaptcha();
    global.setTimeout(function () {
      var focusId = bindMode === "bind_email" ? "profile-bind-email" : "profile-bind-phone";
      var inp = $(focusId);
      if (inp) inp.focus();
    }, 280);
  }

  function closeDrawer() {
    var drawer = $("profile-bind-drawer");
    if (!drawer) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    if (!isPwdDrawerOpen()) document.body.classList.remove("profile-drawer-open");
    setDrawerMsg("");
  }

  function isPwdDrawerOpen() {
    var drawer = $("profile-pwd-drawer");
    return !!(drawer && drawer.classList.contains("is-open"));
  }

  function isBindDrawerOpen() {
    var drawer = $("profile-bind-drawer");
    return !!(drawer && drawer.classList.contains("is-open"));
  }

  function setDrawerFieldsVisible(isEmail) {
    var phoneFields = $("profile-bind-phone-fields");
    var emailFields = $("profile-bind-email-fields");
    if (phoneFields) phoneFields.classList.toggle("is-hidden", !!isEmail);
    if (emailFields) emailFields.classList.toggle("is-hidden", !isEmail);
    if ($("profile-bind-code-label")) {
      $("profile-bind-code-label").textContent = isEmail ? "邮箱验证码" : "短信验证码";
    }
  }

  function openBindDrawer(mode) {
    bindMode = mode === "rebind" ? "rebind" : mode === "bind_email" ? "bind_email" : "bind";
    var isEmail = bindMode === "bind_email";
    setDrawerFieldsVisible(isEmail);

    if ($("profile-bind-title")) {
      if (isEmail) $("profile-bind-title").textContent = "绑定邮箱";
      else $("profile-bind-title").textContent = bindMode === "rebind" ? "更换手机号" : "绑定手机号";
    }
    if ($("profile-bind-desc")) {
      if (isEmail) {
        $("profile-bind-desc").textContent = "验证通过后即可绑定，用于登录与邮箱改密";
      } else {
        $("profile-bind-desc").textContent = bindMode === "rebind"
          ? "验证新手机号后即可完成更换"
          : "验证通过后即可绑定，用于登录与改密";
      }
    }
    if ($("profile-bind-phone-label")) {
      $("profile-bind-phone-label").textContent = bindMode === "rebind" ? "新手机号" : "手机号";
    }
    if ($("profile-bind-submit")) {
      $("profile-bind-submit").textContent = bindMode === "rebind" ? "确认更换" : "确认绑定";
    }
    if ($("profile-bind-phone")) $("profile-bind-phone").value = "";
    if ($("profile-bind-email")) $("profile-bind-email").value = "";
    if ($("profile-bind-code")) $("profile-bind-code").value = "";
    setDrawerMsg("");
    openDrawer();
  }

  function renderIdentity(user) {
    currentUser = user || null;
    var hasEmail = !!(user && user.has_email);
    var hasPhone = !!(user && user.has_phone);
    var emailText = $("profile-email-text");
    var emailAction = $("profile-email-action-btn");
    var phoneDisplay = $("profile-phone-display");
    var phoneHint = $("profile-phone-hint");
    var phoneAction = $("profile-phone-action-btn");
    var secHint = $("profile-security-hint");

    // 邮箱行：始终展示；手机注册未绑邮箱时显示「绑定邮箱」
    if (emailText) {
      emailText.textContent = hasEmail ? ((user && user.email) || "—") : "未绑定";
    }
    if (emailAction) {
      if (hasPhone && !hasEmail) {
        emailAction.classList.remove("is-hidden");
        emailAction.textContent = "绑定邮箱";
      } else {
        emailAction.classList.add("is-hidden");
      }
    }

    // 手机行：手机注册不展示绑定按钮；邮箱账号未绑手机时展示绑定；双绑展示更换
    if (hasPhone) {
      if (phoneDisplay) phoneDisplay.textContent = user.phone_masked || maskPhone(user.phone);
      if (phoneHint) {
        phoneHint.textContent = hasEmail
          ? "已绑定手机与邮箱，均可用于登录与改密"
          : "手机号注册账号，可绑定邮箱用于登录";
      }
      if (phoneAction) {
        if (hasEmail) {
          phoneAction.classList.remove("is-hidden");
          phoneAction.textContent = "更换手机号";
          phoneAction.dataset.mode = "rebind";
        } else {
          phoneAction.classList.add("is-hidden");
        }
      }
    } else if (hasEmail) {
      if (phoneDisplay) phoneDisplay.textContent = "未绑定";
      if (phoneHint) phoneHint.textContent = "绑定后可用手机号登录与短信改密";
      if (phoneAction) {
        phoneAction.classList.remove("is-hidden");
        phoneAction.textContent = "绑定手机号";
        phoneAction.dataset.mode = "bind";
      }
    } else {
      if (phoneDisplay) phoneDisplay.textContent = "—";
      if (phoneAction) phoneAction.classList.add("is-hidden");
    }

    if (secHint) {
      if (hasPhone && hasEmail) secHint.textContent = "支持邮箱或短信验证码修改密码";
      else if (hasPhone) secHint.textContent = "通过短信验证码验证后可设置新密码";
      else secHint.textContent = "通过邮箱验证码验证后可设置新密码";
    }
  }

  function fillForm(me) {
    var user = me && me.user;
    if ($("profile-display-name")) $("profile-display-name").value = (user && user.display_name) || "";
    renderIdentity(user);
    showAvatar(user, null);
  }

  function uploadAvatarIfNeeded() {
    if (!pendingAvatarFile) return Promise.resolve(null);
    var fd = new FormData();
    fd.append("avatar", pendingAvatarFile);
    return fetch("/api/auth/profile/avatar", {
      method: "POST",
      credentials: "same-origin",
      body: fd,
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok || data.error) throw new Error(data.error || "头像上传失败");
        pendingAvatarFile = null;
        return data.user;
      });
    });
  }

  function saveProfile() {
    var btn = $("profile-save-btn");
    var displayName = ($("profile-display-name") && $("profile-display-name").value || "").trim();
    if (!displayName) {
      setMsg("请填写昵称", true);
      return;
    }
    if (btn) btn.disabled = true;
    setMsg("");
    uploadAvatarIfNeeded()
      .then(function () {
        return fetch("/api/auth/profile", {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: displayName }),
        });
      })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || (res.data && res.data.error)) {
          throw new Error((res.data && res.data.error) || "保存失败");
        }
        if (global.HfAuthNav && global.HfAuthNav.refreshNav) {
          return global.HfAuthNav.refreshNav().then(function () { showSuccessToastAndGoHome(); });
        }
        showSuccessToastAndGoHome();
      })
      .catch(function (err) {
        setMsg(err.message || "保存失败", true);
        if (btn) btn.disabled = false;
      });
  }

  function sendBindCode() {
    var answer = ($("profile-bind-captcha-a") && $("profile-bind-captcha-a").value || "").trim();
    if (!bindCaptchaId || !answer) {
      setDrawerMsg("请填写图形验证码", true);
      return;
    }

    var path;
    var body;
    if (bindMode === "bind_email") {
      var email = ($("profile-bind-email") && $("profile-bind-email").value || "").trim();
      if (!email) {
        setDrawerMsg("请填写邮箱", true);
        return;
      }
      path = "/api/auth/email/bind/send-code";
      body = {
        email: email,
        captcha_id: bindCaptchaId,
        captcha_answer: answer,
      };
    } else {
      var phone = ($("profile-bind-phone") && $("profile-bind-phone").value || "").trim();
      if (!phone) {
        setDrawerMsg("请填写手机号", true);
        return;
      }
      path = bindMode === "rebind" ? "/api/auth/phone/rebind/send-code" : "/api/auth/phone/bind/send-code";
      body = {
        phone: phone,
        captcha_id: bindCaptchaId,
        captcha_answer: answer,
      };
    }

    var btn = $("profile-bind-send-code");
    if (btn) btn.disabled = true;
    setDrawerMsg("");
    fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || (res.data && res.data.error)) throw new Error((res.data && res.data.error) || "发送失败");
        setDrawerMsg((res.data && res.data.message) || "验证码已发送", false);
        startCooldown();
        return loadBindCaptcha();
      })
      .catch(function (err) {
        setDrawerMsg(err.message || "发送失败", true);
        updateSendBtn();
        loadBindCaptcha();
      });
  }

  function submitBind() {
    var code = ($("profile-bind-code") && $("profile-bind-code").value || "").trim();
    var path;
    var body;

    if (bindMode === "bind_email") {
      var email = ($("profile-bind-email") && $("profile-bind-email").value || "").trim();
      if (!email || !code) {
        setDrawerMsg("请填写邮箱和验证码", true);
        return;
      }
      path = "/api/auth/email/bind";
      body = { email: email, code: code };
    } else {
      var phone = ($("profile-bind-phone") && $("profile-bind-phone").value || "").trim();
      if (!phone || !code) {
        setDrawerMsg("请填写手机号和短信验证码", true);
        return;
      }
      path = bindMode === "rebind" ? "/api/auth/phone/rebind" : "/api/auth/phone/bind";
      body = { phone: phone, code: code };
    }

    var btn = $("profile-bind-submit");
    if (btn) btn.disabled = true;
    setDrawerMsg("");
    fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || (res.data && res.data.error)) throw new Error((res.data && res.data.error) || "操作失败");
        if (typeof global.hfFloatToast === "function") {
          global.hfFloatToast(res.data.message || "成功", { variant: "success", placement: "top", duration: 1800 });
        }
        currentUser = res.data.user || currentUser;
        renderIdentity(currentUser);
        closeDrawer();
        setMsg((res.data && res.data.message) || "成功", false);
        if (global.HfAuthNav && global.HfAuthNav.refreshNav) return global.HfAuthNav.refreshNav();
      })
      .catch(function (err) {
        setDrawerMsg(err.message || "操作失败", true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function usePwdSms() {
    var hasPhone = !!(currentUser && currentUser.has_phone);
    return pwdChannel === "sms" && hasPhone;
  }

  function applyPwdChannelUi() {
    var hasEmail = !!(currentUser && currentUser.has_email);
    var hasPhone = !!(currentUser && currentUser.has_phone);
    var dual = hasEmail && hasPhone;
    var switchEl = $("profile-pwd-channel-switch");
    if (switchEl) switchEl.classList.toggle("is-hidden", !dual);
    if (dual) {
      document.querySelectorAll("[data-pwd-channel]").forEach(function (btn) {
        btn.classList.toggle("is-active", btn.getAttribute("data-pwd-channel") === pwdChannel);
      });
    }

    var desc = $("profile-pwd-desc");
    var label = $("profile-pwd-account-label");
    var account = $("profile-pwd-account");
    var codeLabel = $("profile-pwd-code-label");
    var codeInp = $("profile-pwd-code");

    if (usePwdSms()) {
      if (desc) desc.textContent = "短信验证码验证后即可设置新密码";
      if (label) label.textContent = "绑定手机号";
      if (account) account.value = (currentUser && (currentUser.phone_masked || maskPhone(currentUser.phone))) || "";
      if (codeLabel) codeLabel.textContent = "短信验证码";
      if (codeInp) { codeInp.maxLength = 8; codeInp.placeholder = "短信验证码"; }
    } else {
      if (desc) desc.textContent = "邮箱验证码验证后即可设置新密码";
      if (label) label.textContent = "登录邮箱";
      if (account) account.value = (currentUser && currentUser.email) || "";
      if (codeLabel) codeLabel.textContent = "邮箱验证码";
      if (codeInp) { codeInp.maxLength = 6; codeInp.placeholder = "6 位数字"; }
    }
  }

  function loadPwdCaptcha() {
    return fetch("/api/auth/captcha", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        pwdCaptchaId = data.captcha_id || "";
        if ($("profile-pwd-captcha-q")) $("profile-pwd-captcha-q").textContent = data.question || "?";
        if ($("profile-pwd-captcha-a")) $("profile-pwd-captcha-a").value = "";
      })
      .catch(function () {
        if ($("profile-pwd-captcha-q")) $("profile-pwd-captcha-q").textContent = "加载失败";
      });
  }

  function updatePwdSendBtn() {
    var btn = $("profile-pwd-send-code");
    if (!btn) return;
    if (pwdSendCooldownLeft > 0) {
      btn.disabled = true;
      btn.textContent = pwdSendCooldownLeft + "s";
    } else {
      btn.disabled = false;
      btn.textContent = "获取验证码";
    }
  }

  function startPwdCooldown() {
    pwdSendCooldownLeft = 60;
    updatePwdSendBtn();
    if (pwdSendTimer) clearInterval(pwdSendTimer);
    pwdSendTimer = setInterval(function () {
      pwdSendCooldownLeft -= 1;
      if (pwdSendCooldownLeft <= 0) {
        clearInterval(pwdSendTimer);
        pwdSendTimer = null;
      }
      updatePwdSendBtn();
    }, 1000);
  }

  function openPwdDrawer() {
    closeDrawer();
    var hasEmail = !!(currentUser && currentUser.has_email);
    var hasPhone = !!(currentUser && currentUser.has_phone);
    if (hasPhone) pwdChannel = "sms";
    else pwdChannel = "email";

    if ($("profile-pwd-code")) $("profile-pwd-code").value = "";
    if ($("profile-pwd-new")) $("profile-pwd-new").value = "";
    if ($("profile-pwd-confirm")) $("profile-pwd-confirm").value = "";
    setPwdDrawerMsg("");
    applyPwdChannelUi();

    var drawer = $("profile-pwd-drawer");
    if (!drawer) return;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("profile-drawer-open");
    loadPwdCaptcha();
    global.setTimeout(function () {
      var inp = $("profile-pwd-captcha-a");
      if (inp) inp.focus();
    }, 280);
  }

  function closePwdDrawer() {
    var drawer = $("profile-pwd-drawer");
    if (!drawer) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    if (!isBindDrawerOpen()) document.body.classList.remove("profile-drawer-open");
    setPwdDrawerMsg("");
  }

  function sendPwdCode() {
    var answer = ($("profile-pwd-captcha-a") && $("profile-pwd-captcha-a").value || "").trim();
    if (!pwdCaptchaId || !answer) {
      setPwdDrawerMsg("请填写图形验证码", true);
      return;
    }
    var btn = $("profile-pwd-send-code");
    if (btn) btn.disabled = true;
    setPwdDrawerMsg("");
    var path = usePwdSms() ? "/api/auth/password/phone/send-code" : "/api/auth/password/send-code";
    fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captcha_id: pwdCaptchaId, captcha_answer: answer }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || (res.data && res.data.error)) throw new Error((res.data && res.data.error) || "发送失败");
        setPwdDrawerMsg((res.data && res.data.message) || "验证码已发送", false);
        startPwdCooldown();
        return loadPwdCaptcha();
      })
      .catch(function (err) {
        setPwdDrawerMsg(err.message || "发送失败", true);
        updatePwdSendBtn();
        loadPwdCaptcha();
      });
  }

  function submitPwdChange() {
    var code = ($("profile-pwd-code") && $("profile-pwd-code").value || "").trim();
    var nw = ($("profile-pwd-new") && $("profile-pwd-new").value || "");
    var cf = ($("profile-pwd-confirm") && $("profile-pwd-confirm").value || "");
    if (!code) {
      setPwdDrawerMsg(usePwdSms() ? "请输入短信验证码" : "请输入邮箱验证码", true);
      return;
    }
    if (!nw || nw.length < 8) {
      setPwdDrawerMsg("新密码至少 8 位", true);
      return;
    }
    if (nw !== cf) {
      setPwdDrawerMsg("两次输入的新密码不一致", true);
      return;
    }
    var btn = $("profile-pwd-submit");
    if (btn) btn.disabled = true;
    setPwdDrawerMsg("");
    var path = usePwdSms() ? "/api/auth/password/phone/change" : "/api/auth/password/change";
    fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, new_password: nw, confirm_password: cf }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || (res.data && res.data.error)) throw new Error((res.data && res.data.error) || "修改失败");
        if (typeof global.hfFloatToast === "function") {
          global.hfFloatToast(res.data.message || "密码修改成功", { variant: "success", placement: "top", duration: 1800 });
        }
        closePwdDrawer();
        setMsg((res.data && res.data.message) || "密码修改成功", false);
      })
      .catch(function (err) {
        setPwdDrawerMsg(err.message || "修改失败", true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function bindEvents() {
    var pick = $("profile-avatar-pick");
    var input = $("profile-avatar-input");
    if (pick && input) {
      pick.addEventListener("click", function () { input.click(); });
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          setMsg("头像不能超过 5 MB", true);
          input.value = "";
          return;
        }
        pendingAvatarFile = file;
        showAvatar(null, URL.createObjectURL(file));
        setMsg("");
      });
    }
    var saveBtn = $("profile-save-btn");
    if (saveBtn) saveBtn.addEventListener("click", saveProfile);

    var phoneAction = $("profile-phone-action-btn");
    if (phoneAction) {
      phoneAction.addEventListener("click", function () {
        openBindDrawer(phoneAction.dataset.mode === "rebind" ? "rebind" : "bind");
      });
    }
    var emailAction = $("profile-email-action-btn");
    if (emailAction) {
      emailAction.addEventListener("click", function () {
        openBindDrawer("bind_email");
      });
    }

    var mask = $("profile-bind-drawer-mask");
    if (mask) mask.addEventListener("click", closeDrawer);
    var closeBtn = $("profile-bind-drawer-close");
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    var cancel = $("profile-bind-cancel");
    if (cancel) cancel.addEventListener("click", closeDrawer);

    var pwdOpen = $("profile-pwd-open");
    if (pwdOpen) pwdOpen.addEventListener("click", openPwdDrawer);
    var pwdMask = $("profile-pwd-drawer-mask");
    if (pwdMask) pwdMask.addEventListener("click", closePwdDrawer);
    var pwdClose = $("profile-pwd-drawer-close");
    if (pwdClose) pwdClose.addEventListener("click", closePwdDrawer);
    var pwdCancel = $("profile-pwd-cancel");
    if (pwdCancel) pwdCancel.addEventListener("click", closePwdDrawer);
    var pwdRefresh = $("profile-pwd-captcha-refresh");
    if (pwdRefresh) pwdRefresh.addEventListener("click", loadPwdCaptcha);
    var pwdSend = $("profile-pwd-send-code");
    if (pwdSend) pwdSend.addEventListener("click", sendPwdCode);
    var pwdSubmit = $("profile-pwd-submit");
    if (pwdSubmit) pwdSubmit.addEventListener("click", submitPwdChange);
    document.querySelectorAll("[data-pwd-channel]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        pwdChannel = btn.getAttribute("data-pwd-channel") === "email" ? "email" : "sms";
        applyPwdChannelUi();
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (isPwdDrawerOpen()) closePwdDrawer();
      else if (isBindDrawerOpen()) closeDrawer();
    });

    var refresh = $("profile-bind-captcha-refresh");
    if (refresh) refresh.addEventListener("click", loadBindCaptcha);
    var send = $("profile-bind-send-code");
    if (send) send.addEventListener("click", sendBindCode);
    var submit = $("profile-bind-submit");
    if (submit) submit.addEventListener("click", submitBind);
  }

  function init() {
    bindEvents();
    fetchMe().then(function (me) {
      if (!me || !me.authenticated) {
        global.location.href = "/auth?next=" + encodeURIComponent("/account/profile");
        return;
      }
      fillForm(me);
    }).catch(function () {
      global.location.href = "/auth?next=" + encodeURIComponent("/account/profile");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
