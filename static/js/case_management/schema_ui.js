/**
 * 用例管理：目录列结构导入 UI（独立模块，不改动工作台）。
 * 依赖页面已有 CmDialogs / toast 由 app 注入回调。
 */
(function (global) {
  "use strict";

  if (global.CmSchemaUi) return;

  var pending = {
    kind: "", // excel | workbench
    projectId: "",
    suiteId: "",
    file: null,
    wbSource: null,
    preview: null,
    mapping: {},
    duplicateMode: "create",
    busy: false,
    inFlight: false,
  };

  function readDuplicateMode() {
    var sel = $("cm-import-dup-mode");
    var v = sel ? String(sel.value || "create").trim().toLowerCase() : "create";
    if (v !== "skip" && v !== "upsert") v = "create";
    return v;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setImportBusy(busy, message) {
    pending.busy = !!busy;
    var mask = $("cm-import-loading");
    var text = $("cm-import-loading-text");
    if (text && message) text.textContent = message;
    if (mask) {
      if (busy) mask.classList.remove("is-hidden");
      else mask.classList.add("is-hidden");
    }
    ["cm-schema-define-ok", "cm-schema-map-ok", "cm-schema-define-cancel", "cm-schema-map-cancel", "cm-import-suite-next"].forEach(
      function (id) {
        var btn = $(id);
        if (!btn) return;
        if (busy) {
          btn.disabled = true;
          btn.classList.add("is-loading");
          if (id === "cm-schema-define-ok" || id === "cm-schema-map-ok") {
            if (!btn.getAttribute("data-label")) {
              btn.setAttribute("data-label", btn.textContent || "");
            }
            btn.textContent = "导入中…";
          }
          if (id === "cm-import-suite-next") {
            if (!btn.getAttribute("data-label")) {
              btn.setAttribute("data-label", btn.textContent || "");
            }
            btn.textContent = "处理中…";
          }
        } else {
          btn.classList.remove("is-loading");
          if (btn.getAttribute("data-label")) {
            btn.textContent = btn.getAttribute("data-label");
            btn.removeAttribute("data-label");
          }
          if (id === "cm-schema-define-ok" || id === "cm-schema-map-ok" || id === "cm-schema-define-cancel" || id === "cm-schema-map-cancel") {
            btn.disabled = false;
          }
          if (id === "cm-import-suite-next") {
            var sel = $("cm-import-suite-select");
            btn.disabled = !(sel && sel.value);
          }
        }
      }
    );
  }

  function apiJson(url, opts) {
    opts = opts || {};
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || "请求失败");
        return data;
      });
    });
  }

  function hide(el) {
    if (el) el.classList.add("is-hidden");
  }

  function show(el) {
    if (el) el.classList.remove("is-hidden");
  }

  function closeAll() {
    hide($("cm-schema-define-mask"));
    hide($("cm-schema-map-mask"));
  }

  function renderDefineList(columns) {
    var box = $("cm-schema-define-list");
    if (!box) return;
    box.innerHTML = "";
    (columns || []).forEach(function (c) {
      var li = document.createElement("li");
      li.textContent =
        (c.label || c.key || "") +
        (c.role === "title" ? "（标题·必填）" : c.role && c.role !== "custom" ? "（" + c.role + "）" : "");
      box.appendChild(li);
    });
  }

  function fillMapRows(preview) {
    var box = $("cm-schema-map-rows");
    if (!box) return;
    box.innerHTML = "";
    var columns = (preview.schema && preview.schema.columns) || preview.proposed_columns || [];
    var suggested = preview.suggested_mapping || {};
    var headers = preview.source_headers || [];
    pending.mapping = {};

    headers.forEach(function (h) {
      var row = document.createElement("div");
      row.className = "cm-schema-map-row";
      var lab = document.createElement("span");
      lab.className = "cm-schema-map-row__src";
      lab.textContent = h;
      var sel = document.createElement("select");
      sel.className = "cm-select";
      sel.setAttribute("data-src", h);
      var ignore = document.createElement("option");
      ignore.value = "";
      ignore.textContent = "忽略此列";
      sel.appendChild(ignore);
      columns.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.key;
        o.textContent = (c.label || c.key) + (c.role === "title" ? " *标题" : "");
        sel.appendChild(o);
      });
      var sug = suggested[h];
      if (sug) sel.value = sug;
      if (sel.value) pending.mapping[h] = sel.value;
      sel.addEventListener("change", function () {
        if (sel.value) pending.mapping[h] = sel.value;
        else delete pending.mapping[h];
      });
      row.appendChild(lab);
      row.appendChild(sel);
      box.appendChild(row);
    });
  }

  function openDefine(preview) {
    pending.preview = preview;
    renderDefineList(preview.proposed_columns || []);
    var hint = $("cm-schema-define-hint");
    if (hint) {
      hint.textContent =
        "该目录尚未锁定列结构。确认后将按下列表头锁定";
    }
    show($("cm-schema-define-mask"));
  }

  function openMap(preview) {
    pending.preview = preview;
    fillMapRows(preview);
    var hint = $("cm-schema-map-hint");
    if (hint) {
      hint.textContent =
        "源表头与目录已锁定列不一致，请将源列映射到目标列（标题必选）。";
    }
    show($("cm-schema-map-mask"));
  }

  /** 已锁定表头不一致：拦截并提示差异（不再打开字段映射） */
  function formatHeaderMismatchMessage(preview) {
    preview = preview || {};
    if (preview.message) return String(preview.message);
    var expected = preview.expected_headers || [];
    var source = preview.source_headers || [];
    var missing = preview.missing_headers || [];
    var extra = preview.extra_headers || preview.unmapped_headers || [];
    var lines = [
      "项目表头已锁定，再次导入时表头必须与锁定表头完全一致。",
      "请按下方差异修改后重新导入。",
      "",
      "已锁定表头：" + (expected.length ? expected.join("、") : "（空）"),
      "当前导入表头：" + (source.length ? source.join("、") : "（空）"),
    ];
    if (missing.length) lines.push("缺少列：" + missing.join("、"));
    if (extra.length) lines.push("多余列：" + extra.join("、"));
    if (preview.order_mismatch) {
      lines.push("列名一致但顺序不同，请按已锁定表头的顺序调整后再导入。");
    }
    return lines.join("\n");
  }

  function showHeaderMismatch(preview, hooks) {
    pending.inFlight = false;
    setImportBusy(false);
    var msg = formatHeaderMismatchMessage(preview);
    if (global.CmDialogs && typeof global.CmDialogs.alert === "function") {
      global.CmDialogs.alert({
        title: "表头不一致",
        message: msg,
        confirmText: "我知道了",
      });
    } else if (hooks && typeof hooks.onError === "function") {
      hooks.onError(new Error(msg));
    } else {
      window.alert(msg);
    }
  }

  function afterPreview(preview, hooks) {
    pending.preview = preview;
    var mode = preview.mode || "";
    if (mode === "define_schema") {
      pending.inFlight = false;
      setImportBusy(false);
      openDefine(preview);
      return;
    }
    /* 已锁定且不一致：拦截提示，不再走映射弹窗 */
    if (mode === "header_mismatch" || mode === "need_map") {
      showHeaderMismatch(preview, hooks);
      return;
    }
    /* align / auto_map → 直接导入；auto_map 在新后端已收紧为 mismatch */
    setImportBusy(true, "正在导入用例，请稍候…");
    doImport(
      {
        confirm_schema: false,
        column_mapping: preview.suggested_mapping || {},
      },
      hooks
    );
  }

  function doImport(opts, hooks) {
    hooks = hooks || {};
    opts = opts || {};
    var projectId = pending.projectId;
    var suiteId = pending.suiteId;
    if (!projectId || !suiteId) {
      pending.inFlight = false;
      setImportBusy(false);
      if (hooks.onError) hooks.onError(new Error("缺少项目或目录"));
      return;
    }

    pending.inFlight = true;
    setImportBusy(true, "正在导入用例，请稍候…");

    var p;
    if (pending.kind === "excel") {
      if (!pending.file) {
        pending.inFlight = false;
        setImportBusy(false);
        if (hooks.onError) hooks.onError(new Error("未选择文件"));
        return;
      }
      var fd = new FormData();
      fd.append("file", pending.file);
      fd.append("suite_id", suiteId);
      fd.append("duplicate_mode", pending.duplicateMode || "create");
      if (opts.confirm_schema) fd.append("confirm_schema", "1");
      if (opts.column_mapping) {
        fd.append("column_mapping", JSON.stringify(opts.column_mapping));
      }
      if (opts.proposed_columns) {
        fd.append("proposed_columns", JSON.stringify(opts.proposed_columns));
      }
      p = apiJson("/api/case-management/projects/" + projectId + "/import/excel", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
    } else {
      var body = {
        suite_id: suiteId,
        lanhu_pid: pending.wbSource && pending.wbSource.lanhu_pid,
        lanhu_doc_id: pending.wbSource && pending.wbSource.lanhu_doc_id,
        lanhu_page_id: pending.wbSource && pending.wbSource.lanhu_page_id,
        confirm_schema: !!opts.confirm_schema,
        column_mapping: opts.column_mapping || null,
        proposed_columns: opts.proposed_columns || null,
        duplicate_mode: pending.duplicateMode || "create",
      };
      p = apiJson("/api/case-management/projects/" + projectId + "/import/workbench", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    p.then(function (data) {
      closeAll();
      pending.file = null;
      pending.inFlight = false;
      setImportBusy(false);
      if (hooks.onSuccess) hooks.onSuccess(data);
    }).catch(function (err) {
      pending.inFlight = false;
      setImportBusy(false);
      if (hooks.onError) hooks.onError(err);
    });
  }

  function startExcelImport(projectId, suiteId, file, hooks) {
    if (pending.inFlight) return;
    pending.inFlight = true;
    pending.kind = "excel";
    pending.projectId = projectId;
    pending.suiteId = suiteId;
    pending.file = file;
    pending.wbSource = null;
    pending.duplicateMode = readDuplicateMode();
    setImportBusy(true, "正在解析 Excel，请稍候…");
    var fd = new FormData();
    fd.append("file", file);
    fd.append("suite_id", suiteId);
    apiJson("/api/case-management/projects/" + projectId + "/import/excel/preview", {
      method: "POST",
      credentials: "same-origin",
      body: fd,
    })
      .then(function (preview) {
        afterPreview(preview, hooks);
      })
      .catch(function (err) {
        pending.inFlight = false;
        setImportBusy(false);
        if (hooks.onError) hooks.onError(err);
      });
  }

  function startWorkbenchImport(projectId, suiteId, wbSource, hooks) {
    if (pending.inFlight) return;
    pending.inFlight = true;
    pending.kind = "workbench";
    pending.projectId = projectId;
    pending.suiteId = suiteId;
    pending.file = null;
    pending.wbSource = wbSource;
    pending.duplicateMode = readDuplicateMode();
    setImportBusy(true, "正在读取工作台数据，请稍候…");
    apiJson("/api/case-management/projects/" + projectId + "/import/workbench/preview", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suite_id: suiteId,
        lanhu_pid: wbSource.lanhu_pid,
        lanhu_doc_id: wbSource.lanhu_doc_id,
        lanhu_page_id: wbSource.lanhu_page_id,
      }),
    })
      .then(function (preview) {
        afterPreview(preview, hooks);
      })
      .catch(function (err) {
        pending.inFlight = false;
        setImportBusy(false);
        if (hooks.onError) hooks.onError(err);
      });
  }

  function bindUi(hooks) {
    hooks = hooks || {};
    var defineClose = $("cm-schema-define-close");
    var defineCancel = $("cm-schema-define-cancel");
    var defineOk = $("cm-schema-define-ok");
    var mapClose = $("cm-schema-map-close");
    var mapCancel = $("cm-schema-map-cancel");
    var mapOk = $("cm-schema-map-ok");

    function cancel() {
      if (pending.inFlight || pending.busy) return;
      closeAll();
      pending.file = null;
    }

    if (defineClose) defineClose.addEventListener("click", cancel);
    if (defineCancel) defineCancel.addEventListener("click", cancel);
    if (mapClose) mapClose.addEventListener("click", cancel);
    if (mapCancel) mapCancel.addEventListener("click", cancel);

    if (defineOk) {
      defineOk.addEventListener("click", function () {
        if (pending.inFlight || pending.busy) return;
        var cols =
          (pending.preview && pending.preview.proposed_columns) || [];
        doImport(
          {
            confirm_schema: true,
            proposed_columns: cols,
            column_mapping: null,
          },
          hooks
        );
      });
    }
    if (mapOk) {
      mapOk.addEventListener("click", function () {
        if (pending.inFlight || pending.busy) return;
        doImport(
          {
            confirm_schema: false,
            column_mapping: pending.mapping || {},
          },
          hooks
        );
      });
    }
  }

  function systemListColumns() {
    return [
      { key: "__title", label: "标题", role: "title" },
      { key: "__priority", label: "优先级", role: "priority" },
      { key: "__status", label: "状态", role: "status" },
      { key: "__last_result", label: "最近结果", role: "last_result" },
      { key: "__updated", label: "更新时间", role: "updated" },
      { key: "__actions", label: "操作", role: "actions" },
    ];
  }

  /** 目录尚未锁定 schema 时的默认业务列表头（与默认导入模板一致） */
  function defaultTemplateListColumns() {
    return [
      { key: "title", label: "用例名称", role: "title" },
      { key: "col_module", label: "所属模块", role: "module" },
      { key: "priority", label: "优先级", role: "priority" },
      { key: "status", label: "状态", role: "status" },
      { key: "tags", label: "标签", role: "tags" },
      { key: "__actions", label: "操作", role: "actions" },
    ];
  }

  /** 详情等场景：完整业务列 + 操作列 */
  function listColumnsFromSchema(schema) {
    var cols = [];
    if (schema && schema.status === "locked" && schema.columns && schema.columns.length) {
      schema.columns.forEach(function (c) {
        cols.push(c);
      });
      cols.push({ key: "__actions", label: "操作", role: "actions" });
      return cols;
    }
    return defaultTemplateListColumns();
  }

  /**
   * 列表区域最多展示 maxCols 个业务列（默认 10），始终保留标题列与操作列。
   * 优先紧凑列；长文本列（步骤/预期/前置等）默认不进列表，避免宽表卡顿。
   * 详情抽屉请用 listColumnsFromSchema，不受此限制。
   */
  function listColumnsForTable(schema, maxCols) {
    var limit = Math.max(1, Math.min(Number(maxCols) || 10, 30));
    if (!(schema && schema.status === "locked" && schema.columns && schema.columns.length)) {
      return systemListColumns();
    }
    var all = schema.columns.slice();
    var compact = [];
    var wide = [];
    var titleCol = null;
    all.forEach(function (col) {
      if ((col.role || "") === "title" || col.key === "title" || col.key === "__title") {
        if (!titleCol) titleCol = col;
        return;
      }
      if (isWideListColumn(col)) wide.push(col);
      else compact.push(col);
    });
    var picked = [];
    if (titleCol) picked.push(titleCol);
    compact.forEach(function (col) {
      if (picked.length >= limit) return;
      picked.push(col);
    });
    // 列表默认不塞入长文本列；额度仍有剩余时最多补 1 列宽列（兼容旧习惯）
    if (picked.length < limit && wide.length) {
      picked.push(wide[0]);
    }
    // 系统列：最近结果不占用业务 10 列额度
    picked.push({ key: "__last_result", label: "最近结果", role: "last_result" });
    picked.push({ key: "__actions", label: "操作", role: "actions" });
    return picked;
  }

  function normalizeMultilineText(text) {
    return String(text == null ? "" : text)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\u2028|\u2029/g, "\n")
      .trim();
  }

  function formatNumberedLines(parts, prefix) {
    var lines = [];
    (parts || []).forEach(function (part, idx) {
      var text = normalizeMultilineText(part);
      if (!text) return;
      lines.push((prefix || "") + "[" + (idx + 1) + "] " + text);
    });
    return lines.join("\n");
  }

  /** 列表中应按多行展示的列（前置/步骤/预期/备注等） */
  function isWideListColumn(col) {
    if (!col) return false;
    var role = String(col.role || "");
    var key = String(col.key || "");
    var label = String(col.label || "");
    if (role === "precondition" || role === "steps" || role === "expect") return true;
    if (/前置条件|步骤描述|预期结果|备注|描述/.test(label)) return true;
    if (/precondition|steps|expect|remark|comment|desc/i.test(key)) return true;
    return false;
  }

  function cellValue(caseItem, col, suiteNameMap) {
    var role = col.role || "";
    var key = col.key || "";
    var fields = caseItem.fields || {};
    var fieldText =
      key && fields[key] != null && String(fields[key]).trim() !== ""
        ? normalizeMultilineText(fields[key])
        : "";

    if (role === "actions") return "";
    if (role === "suite" || key === "__suite") {
      var sid = caseItem.suite_id || "";
      if (suiteNameMap && suiteNameMap[sid]) return suiteNameMap[sid];
      return sid || "—";
    }
    if (role === "updated" || key === "__updated") {
      return String(caseItem.updated_at || "").replace("T", " ").slice(0, 19);
    }
    if (role === "last_result" || key === "__last_result") {
      var lr = String(caseItem.last_result || "").toLowerCase();
      if (!lr) return "未测";
      var map = { pass: "通过", fail: "失败", blocked: "阻塞", skip: "跳过" };
      return map[lr] || lr;
    }
    if (role === "title" || key === "__title" || key === "title") {
      return caseItem.title || fieldText || "";
    }
    if (role === "priority" || key === "__priority" || key === "priority") {
      return caseItem.priority || fieldText || "P2";
    }
    if (role === "status" || key === "__status" || key === "status") {
      return caseItem.status || fieldText || "";
    }
    if (role === "precondition") {
      return normalizeMultilineText(caseItem.precondition || "") || fieldText;
    }
    if (role === "module" || key === "col_module") {
      if (fieldText) return fieldText;
      var tags = caseItem.tags || [];
      return tags.length ? String(tags[0]) : "";
    }
    if (role === "tags" || key === "tags") {
      return fieldText || (caseItem.tags || []).join(",");
    }
    if (role === "steps") {
      if (fieldText) return fieldText;
      return formatNumberedLines(
        (caseItem.steps || []).map(function (s) {
          return s && s.step;
        })
      );
    }
    if (role === "expect") {
      if (fieldText) return fieldText;
      return formatNumberedLines(
        (caseItem.steps || []).map(function (s) {
          return s && s.expect;
        })
      );
    }
    // 自定义长文本列：优先原始字段（保留换行）
    if (fieldText) return fieldText;
    return "";
  }

  global.CmSchemaUi = {
    bindUi: bindUi,
    startExcelImport: startExcelImport,
    startWorkbenchImport: startWorkbenchImport,
    setImportBusy: setImportBusy,
    systemListColumns: systemListColumns,
    defaultTemplateListColumns: defaultTemplateListColumns,
    listColumnsFromSchema: listColumnsFromSchema,
    listColumnsForTable: listColumnsForTable,
    cellValue: cellValue,
    isWideListColumn: isWideListColumn,
    closeAll: closeAll,
    MAX_LIST_COLUMNS: 10,
    MAX_SCHEMA_COLUMNS: 30,
  };
})(typeof window !== "undefined" ? window : this);
