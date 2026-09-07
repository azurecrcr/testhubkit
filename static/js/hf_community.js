/**
 * 全站交流群面板（新功能，独立命名空间，不改投稿/消息/登录逻辑）。
 */
(function (global) {
  "use strict";

  if (global.HfCommunity) return;

  var QQ_NO = "1041496930";
  var bound = false;
  var isAdmin = false;

  function $(id) {
    return document.getElementById(id);
  }

  function toast(text, type) {
    if (typeof global.hfFloatToast === "function") {
      global.hfFloatToast(text, {
        variant: type === "error" ? "error" : type === "warning" ? "warning" : "success",
        placement: "top",
        duration: 2000,
      });
      return;
    }
    if (global.HfFloatToast && typeof global.HfFloatToast.show === "function") {
      global.HfFloatToast.show(text, type || "success");
      return;
    }
    try {
      console.log(text);
    } catch (e) {}
  }

  function setAdminUi(on) {
    isAdmin = !!on;
    var box = $("hf-community-wx-admin");
    if (!box) return;
    if (isAdmin) {
      box.classList.remove("is-hidden");
      box.removeAttribute("hidden");
    } else {
      box.classList.add("is-hidden");
      box.setAttribute("hidden", "hidden");
    }
  }

  function refreshAdminFromMe(data) {
    var admin = !!(
      data &&
      data.authenticated &&
      (data.can_manage_builtin_ai ||
        data.can_manage_prompt_visibility ||
        data.can_view_user_feedback)
    );
    setAdminUi(admin);
  }

  function ensureQrLoaded() {
    var img = $("hf-community-wx-qr");
    if (!img) return;
    if (img.getAttribute("data-qr-loaded") === "1" && img.getAttribute("src")) return;
    var base = img.getAttribute("data-src") || "/community-qr/wechat_group_qr.png";
    // 仅打开弹窗时加载；走 nginx 直出，不经 /api，避免拖慢首屏
    img.src = base + (base.indexOf("?") >= 0 ? "&" : "?") + "v=" + Date.now();
    img.setAttribute("data-qr-loaded", "1");
  }

  function openPanel() {
    var mask = $("hf-community-mask");
    if (!mask) return;
    mask.classList.remove("is-hidden");
    mask.setAttribute("aria-hidden", "false");
    ensureQrLoaded();
    if (global.HfAuthNav && typeof global.HfAuthNav.fetchMe === "function") {
      global.HfAuthNav.fetchMe().then(refreshAdminFromMe).catch(function () {
        setAdminUi(false);
      });
    }
  }

  function closePanel() {
    var mask = $("hf-community-mask");
    if (!mask) return;
    mask.classList.add("is-hidden");
    mask.setAttribute("aria-hidden", "true");
  }

  function copyQq() {
    var text = QQ_NO;
    var el = $("hf-community-qq-no");
    if (el && el.textContent) text = String(el.textContent).trim() || QQ_NO;
    var btn = $("hf-community-copy-qq");

    function done() {
      if (btn) {
        btn.classList.add("is-copied");
        btn.textContent = "已复制";
        setTimeout(function () {
          btn.classList.remove("is-copied");
          btn.textContent = "复制群号";
        }, 1600);
      }
      toast("已复制群号，打开 QQ 搜索加入", "success");
    }

    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text).then(done).catch(function () {
        fallbackCopy(text, done);
      });
      return;
    }
    fallbackCopy(text, done);
  }

  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch (e) {
      toast("复制失败，请手动选择群号", "error");
    }
  }

  function applyQrUrl(url) {
    var img = $("hf-community-wx-qr");
    if (!img || !url) return;
    img.src = url;
    img.setAttribute("data-src", url.split("?")[0] || "/community-qr/wechat_group_qr.png");
    img.setAttribute("data-qr-loaded", "1");
  }

  function uploadQr(file) {
    if (!file) return;
    var btn = $("hf-community-wx-replace");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "上传中…";
    }
    var fd = new FormData();
    fd.append("qr", file);
    fetch("/api/community/wechat-qr", {
      method: "POST",
      credentials: "same-origin",
      body: fd,
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, data: d };
        });
      })
      .then(function (res) {
        if (!res.ok || (res.data && res.data.error)) {
          throw new Error((res.data && res.data.error) || "上传失败");
        }
        applyQrUrl((res.data && res.data.url) || ("/community-qr/wechat_group_qr.png?v=" + Date.now()));
        toast("二维码已更新", "success");
      })
      .catch(function (err) {
        toast(err.message || "上传失败", "error");
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "更换二维码";
        }
        var input = $("hf-community-wx-file");
        if (input) input.value = "";
      });
  }

  function onDocClick(e) {
    var openBtn = e.target.closest("[data-hf-community-open]");
    if (openBtn) {
      e.preventDefault();
      openPanel();
      return;
    }
  }

  function init() {
    if (bound) return;
    bound = true;

    document.addEventListener("click", onDocClick);

    var closeBtn = $("hf-community-close");
    if (closeBtn) closeBtn.addEventListener("click", closePanel);

    var mask = $("hf-community-mask");
    if (mask) {
      mask.addEventListener("click", function (e) {
        if (e.target === mask) closePanel();
      });
    }

    var copyBtn = $("hf-community-copy-qq");
    if (copyBtn) copyBtn.addEventListener("click", copyQq);

    var replaceBtn = $("hf-community-wx-replace");
    var fileInput = $("hf-community-wx-file");
    if (replaceBtn && fileInput) {
      replaceBtn.addEventListener("click", function () {
        if (!isAdmin) {
          toast("仅管理员可更换二维码", "warning");
          return;
        }
        fileInput.click();
      });
      fileInput.addEventListener("change", function () {
        var f = fileInput.files && fileInput.files[0];
        if (f) uploadQr(f);
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var m = $("hf-community-mask");
      if (m && !m.classList.contains("is-hidden")) closePanel();
    });

    global.addEventListener("hf-auth-nav-updated", function (ev) {
      refreshAdminFromMe((ev && ev.detail) || {});
    });
  }

  global.HfCommunity = {
    init: init,
    open: openPanel,
    close: closePanel,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
