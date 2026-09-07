/**
 * 表格顶栏「表格操作」下拉 — 替代紫色浮动编辑 FAB（隔离模块，不影响其它 FAB）
 */
function isTcTableToolbarOpsMode() {
    var anchor = document.getElementById("tc-table-ops-anchor");
    var toggle = document.getElementById("tc-table-fab-toggle");
    return !!(anchor && toggle && anchor.contains(toggle) &&
        toggle.classList.contains("tc-table-ops-trigger"));
}


function hasTcTableToolbarOpsMenuItems() {
    var isMindmap = typeof tcRightViewMode !== "undefined" && tcRightViewMode === "mindmap";
    var groupId = isMindmap ? "tc-table-fab-sheet-mindmap" : "tc-table-fab-sheet-list";
    var group = document.getElementById(groupId);
    if (!group || group.classList.contains("hidden")) return false;
    return !!group.querySelector(".tc-workbench-fab-sheet__item, .tc-table-fab-sheet__item");
}

function syncTcTableToolbarOpsLabel() {
    if (!isTcTableToolbarOpsMode()) return;
    var isMindmap = typeof tcRightViewMode !== "undefined" && tcRightViewMode === "mindmap";
    var toggle = document.getElementById("tc-table-fab-toggle");
    var sheet = document.getElementById("tc-table-fab-sheet");
    var label = toggle && toggle.querySelector(".tc-table-ops-trigger__label");
    if (label) label.textContent = isMindmap ? "导图操作" : "表格操作";
    if (toggle) {
        toggle.setAttribute("title", isMindmap ? "导图编辑操作" : "表格行与表头操作");
        toggle.setAttribute("aria-label", isMindmap ? "导图操作" : "表格操作");
    }
    if (sheet) sheet.setAttribute("aria-label", isMindmap ? "导图操作" : "表格操作");
}

function syncTcTableToolbarOpsSheetPlacement(open) {
    var sheet = document.getElementById("tc-table-fab-sheet");
    var toggle = document.getElementById("tc-table-fab-toggle");
    if (!sheet || !toggle) return;
    if (open) {
        if (typeof applyTcFabSheetPlacement === "function") {
            applyTcFabSheetPlacement(sheet, toggle);
        }
    } else if (typeof resetTcFabSheetPlacement === "function") {
        resetTcFabSheetPlacement(sheet);
    }
}

function closeTcTableToolbarOpsSheet() {
    if (!isTcTableToolbarOpsMode()) return false;
    var sheet = document.getElementById("tc-table-fab-sheet");
    var toggle = document.getElementById("tc-table-fab-toggle");
    if (sheet) sheet.classList.add("hidden");
    if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
        toggle.classList.remove("tc-table-ops-trigger--open");
    }
    syncTcTableToolbarOpsSheetPlacement(false);
    return true;
}

function toggleTcTableToolbarOpsSheet() {
    if (!isTcTableToolbarOpsMode()) return;
    var sheet = document.getElementById("tc-table-fab-sheet");
    var toggle = document.getElementById("tc-table-fab-toggle");
    if (!sheet || !toggle) return;
    var open = sheet.classList.contains("hidden");
    if (open && typeof closeTcExportFabSheet === "function") closeTcExportFabSheet();
    sheet.classList.toggle("hidden", !open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.classList.toggle("tc-table-ops-trigger--open", !!open);
    syncTcTableToolbarOpsSheetPlacement(!!open);
    if (open) {
        bindTcTableToolbarOpsMenuItems(document.getElementById("tc-table-fab-sheet"));
    }
}

function syncTcTableToolbarOpsAnchor(opts) {
    opts = opts || {};
    if (!isTcTableToolbarOpsMode()) return false;
    var anchor = document.getElementById("tc-table-ops-anchor");
    var floatWrap = document.getElementById("tc-table-fab-wrap");
    if (!anchor) return false;
    if (floatWrap) {
        floatWrap.classList.add("hidden");
        floatWrap.setAttribute("aria-hidden", "true");
    }
    var showFab = opts.showFab !== false;
    var applied = !!opts.applied;
    var isTable = typeof tcRightViewMode !== "undefined" && tcRightViewMode === "table";
    var isMindmap = typeof tcRightViewMode !== "undefined" && tcRightViewMode === "mindmap";
    var show = showFab && applied && (isTable || isMindmap) && hasTcTableToolbarOpsMenuItems();
    anchor.classList.toggle("hidden", !show);
    anchor.setAttribute("aria-hidden", show ? "false" : "true");
    if (!show) closeTcTableToolbarOpsSheet();
    syncTcTableToolbarOpsLabel();
    return true;
}

function isTcTableToolbarOpsSheetOpen() {
    var sheet = document.getElementById("tc-table-fab-sheet");
    return !!(sheet && !sheet.classList.contains("hidden"));
}

function isTcTableToolbarOpsDismissTarget(target) {
    if (!target || !target.closest) return false;
    return !!(target.closest("#tc-table-ops-anchor") || target.closest("#tc-table-fab-sheet"));
}


function addEmptyRowFromToolbarOps() {
    if (typeof ensureTcTableTemplateApplied !== "function" || !ensureTcTableTemplateApplied()) return false;
    if (!tableColumns || !tableColumns.length) return false;
    if (!testCasesData) testCasesData = [];
    if (!testCasesProvenance) testCasesProvenance = [];
    var newRow = tableColumns.map(function () { return ""; });
    testCasesData.push(newRow);
    testCasesProvenance.push(null);
    var targetLen = testCasesData.length;
    window._tcToolbarOpsPreserveMinRows = targetLen;
    try {
        if (typeof renderTableBody === "function") {
            renderTableBody({ reload: false, preserveScroll: true });
        } else if (typeof addEmptyRow === "function") {
            window._tcToolbarOpsPreserveMinRows = 0;
            addEmptyRow();
            return true;
        }
    } finally {
        window._tcToolbarOpsPreserveMinRows = 0;
    }
    if (typeof tcTableRecordAfterMutation === "function") tcTableRecordAfterMutation();
    if (typeof tcTemplateSwitchOnCurrentTemplateMutated === "function") tcTemplateSwitchOnCurrentTemplateMutated();
    return testCasesData.length >= targetLen;
}


function shouldKeepTcTableToolbarOpsSheetOpen(item) {
    return !!(item && item.id === "add-row-btn");
}

function runTcTableToolbarOpsMenuAction(item) {
    if (!item || item.disabled) return false;
    var id = item.id;
    if (id === "add-row-btn") {
        addEmptyRowFromToolbarOps();
        return true;
    }
    if (id === "table-column-settings-btn" && typeof openColumnSettingsModal === "function") {
        openColumnSettingsModal();
        return true;
    }
    return false;
}

function bindTcTableToolbarOpsMenuItems(sheet) {
    if (!sheet || sheet._tcToolbarOpsMenuBound) return;
    sheet._tcToolbarOpsMenuBound = true;
    sheet.addEventListener("click", function (e) {
        var item = e.target.closest(".tc-workbench-fab-sheet__item, .tc-table-fab-sheet__item");
        if (!item || item.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        runTcTableToolbarOpsMenuAction(item);
        if (!shouldKeepTcTableToolbarOpsSheetOpen(item)) {
            window.setTimeout(function () {
                closeTcTableToolbarOpsSheet();
            }, 0);
        }
    }, true);
}

function initTcTableToolbarOpsUi() {
    if (!isTcTableToolbarOpsMode()) return;
    var toggle = document.getElementById("tc-table-fab-toggle");
    var anchor = document.getElementById("tc-table-ops-anchor");
    var sheet = document.getElementById("tc-table-fab-sheet");
    if (!toggle || toggle._tcToolbarOpsBound) return;
    toggle._tcToolbarOpsBound = true;
    toggle._tcFabBound = true;

    toggle.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleTcTableToolbarOpsSheet();
    });

    if (typeof bindTcFabSheetKeepOpen === "function") bindTcFabSheetKeepOpen("tc-table-fab-sheet");
    bindTcTableToolbarOpsMenuItems(sheet);

    if (!window._tcToolbarOpsDismissBound) {
        window._tcToolbarOpsDismissBound = true;
        document.addEventListener("click", function (e) {
            if (!isTcTableToolbarOpsMode() || !isTcTableToolbarOpsSheetOpen()) return;
            if (isTcTableToolbarOpsDismissTarget(e.target)) return;
            closeTcTableToolbarOpsSheet();
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && isTcTableToolbarOpsSheetOpen()) closeTcTableToolbarOpsSheet();
        });
    }
}

(function patchToggleTcTableFabSheetForToolbarOps() {
    if (typeof toggleTcTableFabSheet !== "function") return;
    var orig = toggleTcTableFabSheet;
    window.toggleTcTableFabSheet = function () {
        if (isTcTableToolbarOpsMode()) toggleTcTableToolbarOpsSheet();
        else orig();
    };
})();

(function patchRefreshOpenTcFabSheetPlacementsForToolbarOps() {
    if (typeof refreshOpenTcFabSheetPlacements !== "function") return;
    var orig = refreshOpenTcFabSheetPlacements;
    window.refreshOpenTcFabSheetPlacements = function () {
        if (isTcTableToolbarOpsMode()) {
            var tableSheet = document.getElementById("tc-table-fab-sheet");
            var tableToggle = document.getElementById("tc-table-fab-toggle");
            if (tableSheet && tableToggle && !tableSheet.classList.contains("hidden") &&
                typeof applyTcFabSheetPlacement === "function") {
                applyTcFabSheetPlacement(tableSheet, tableToggle);
            }
            var exportSheet = document.getElementById("tc-export-fab-sheet");
            var exportToggle = document.getElementById("tc-export-fab-toggle");
            if (exportSheet && exportToggle && !exportSheet.classList.contains("hidden") &&
                typeof applyTcFabSheetPlacement === "function") {
                applyTcFabSheetPlacement(exportSheet, exportToggle);
            }
            return;
        }
        orig();
    };
})();

(function patchCloseTcTableFabSheetForToolbarOps() {
    if (typeof closeTcTableFabSheet !== "function") return;
    var origClose = closeTcTableFabSheet;
    window.closeTcTableFabSheet = function () {
        if (isTcTableToolbarOpsMode()) {
            closeTcTableToolbarOpsSheet();
            if (typeof closeTcExportFabSheet === "function") closeTcExportFabSheet();
            return;
        }
        origClose();
    };
})();

