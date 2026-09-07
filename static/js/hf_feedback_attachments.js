/**
 * 投稿建议图片附件（最多 3 张；+ 按钮 / 粘贴）。
 * 独立模块，不改动其它上传组件。
 */
(function (global) {
  "use strict";

  if (global.HfFeedbackAttach) return;

  var MAX = 3;
  var MAX_BYTES = 5 * 1024 * 1024;
  var ACCEPT_MIME = {
    "image/jpeg": 1,
    "image/jpg": 1,
    "image/png": 1,
    "image/webp": 1,
    "image/gif": 1,
  };
  var ACCEPT_EXT = /\.(jpe?g|png|webp|gif)$/i;

  var state = {
    files: [],
    urls: [],
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setAttachError(msg) {
    var el = $("hf-feedback-attach-err");
    if (!el) return;
    if (!msg) {
      el.textContent = "";
      el.classList.add("is-hidden");
      return;
    }
    el.textContent = msg;
    el.classList.remove("is-hidden");
  }

  function revokeAll() {
    state.urls.forEach(function (u) {
      try {
        URL.revokeObjectURL(u);
      } catch (e) { /* ignore */ }
    });
    state.urls = [];
  }

  function clearAttachments() {
    closePreview();
    revokeAll();
    state.files = [];
    setAttachError("");
    render();
    var input = $("hf-feedback-attach-input");
    if (input) input.value = "";
  }

  function isAllowedFile(file) {
    if (!file) return false;
    var mime = String(file.type || "").toLowerCase();
    if (ACCEPT_MIME[mime]) return true;
    return ACCEPT_EXT.test(String(file.name || ""));
  }

  function addFiles(list) {
    var incoming = Array.prototype.slice.call(list || []);
    if (!incoming.length) return;
    var room = MAX - state.files.length;
    if (room <= 0) {
      setAttachError("最多 " + MAX + " 张");
      return;
    }
    var added = 0;
    var rejected = "";
    for (var i = 0; i < incoming.length; i++) {
      if (added >= room) {
        rejected = "最多 " + MAX + " 张";
        break;
      }
      var f = incoming[i];
      if (!isAllowedFile(f)) {
        rejected = "仅支持图片";
        continue;
      }
      if (f.size > MAX_BYTES) {
        rejected = "单张不超过 5MB";
        continue;
      }
      state.files.push(f);
      added += 1;
    }
    setAttachError(rejected || "");
    render();
  }

  function removeAt(index) {
    if (index < 0 || index >= state.files.length) return;
    state.files.splice(index, 1);
    setAttachError("");
    render();
  }

  function openPicker() {
    var input = $("hf-feedback-attach-input");
    if (input) input.click();
  }

  function closePreview() {
    var layer = $("hf-feedback-attach-preview");
    if (!layer) return;
    layer.classList.remove("is-open");
    var img = layer.querySelector(".hf-feedback-attach-preview__img");
    if (img) img.removeAttribute("src");
  }

  function ensurePreview() {
    var layer = $("hf-feedback-attach-preview");
    if (layer) return layer;
    layer = document.createElement("div");
    layer.id = "hf-feedback-attach-preview";
    layer.className = "hf-feedback-attach-preview";
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.setAttribute("aria-label", "图片预览");
    layer.innerHTML =
      '<button type="button" class="hf-feedback-attach-preview__close" aria-label="关闭">×</button>' +
      '<img class="hf-feedback-attach-preview__img" alt="预览">';
    document.body.appendChild(layer);
    layer.addEventListener("click", function (e) {
      if (e.target === layer || e.target.classList.contains("hf-feedback-attach-preview__close")) {
        closePreview();
      }
    });
    return layer;
  }

  function openPreview(url) {
    if (!url) return;
    var layer = ensurePreview();
    var img = layer.querySelector(".hf-feedback-attach-preview__img");
    if (img) img.src = url;
    layer.classList.add("is-open");
  }

  function render() {
    var thumbs = $("hf-feedback-attach-thumbs");
    var addBtn = $("hf-feedback-attach-add");
    if (!thumbs) return;
    revokeAll();
    thumbs.innerHTML = "";

    state.files.forEach(function (file, idx) {
      var url = URL.createObjectURL(file);
      state.urls.push(url);
      var wrap = document.createElement("div");
      wrap.className = "hf-feedback-attach__thumb";
      wrap.title = "点击放大";
      var img = document.createElement("img");
      img.src = url;
      img.alt = "图片";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hf-feedback-attach__remove";
      btn.setAttribute("aria-label", "删除");
      btn.textContent = "×";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        removeAt(idx);
      });
      wrap.addEventListener("click", function (e) {
        if (e.target.closest(".hf-feedback-attach__remove")) return;
        openPreview(url);
      });
      wrap.appendChild(img);
      wrap.appendChild(btn);
      thumbs.appendChild(wrap);
    });

    if (addBtn) {
      addBtn.classList.toggle("is-hidden", state.files.length >= MAX);
    }
  }

  function appendToFormData(fd) {
    state.files.forEach(function (file) {
      var name = file.name || "paste.png";
      fd.append("images", file, name);
    });
  }

  function getCount() {
    return state.files.length;
  }

  function bind() {
    var input = $("hf-feedback-attach-input");
    var addBtn = $("hf-feedback-attach-add");
    if (input && !input._hfFbAttachBound) {
      input._hfFbAttachBound = true;
      input.addEventListener("change", function () {
        addFiles(input.files);
        input.value = "";
      });
    }
    if (addBtn && !addBtn._hfFbAttachBound) {
      addBtn._hfFbAttachBound = true;
      addBtn.addEventListener("click", function (e) {
        e.preventDefault();
        openPicker();
      });
    }
    if (!document._hfFbAttachPasteBound) {
      document._hfFbAttachPasteBound = true;
      document.addEventListener("paste", function (e) {
        var modal = $("hf-feedback-modal");
        if (!modal || modal.classList.contains("hidden")) return;
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        var files = [];
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (it.kind === "file" && String(it.type || "").indexOf("image/") === 0) {
            var f = it.getAsFile();
            if (f) {
              if (!f.name) {
                try {
                  f = new File([f], "paste-" + Date.now() + ".png", { type: f.type || "image/png" });
                } catch (err) { /* ignore */ }
              }
              files.push(f);
            }
          }
        }
        if (!files.length) return;
        e.preventDefault();
        addFiles(files);
      });
    }
    if (!document._hfFbAttachPreviewEscBound) {
      document._hfFbAttachPreviewEscBound = true;
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        var layer = $("hf-feedback-attach-preview");
        if (layer && layer.classList.contains("is-open")) {
          e.stopPropagation();
          closePreview();
        }
      });
    }
    render();
  }

  global.HfFeedbackAttach = {
    bind: bind,
    clear: clearAttachments,
    appendToFormData: appendToFormData,
    getCount: getCount,
    render: render,
  };
})(typeof window !== "undefined" ? window : this);
