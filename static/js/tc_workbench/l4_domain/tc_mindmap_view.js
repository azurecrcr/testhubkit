/**
 * TestHub TC Workbench — L4 DOMAIN
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
function tcMindmapZoomByStep(step, clientX, clientY) {
    if (!window.TcSmmEditor) return;
    if (typeof tcMindmapEnsureZoomUiBound === 'function') tcMindmapEnsureZoomUiBound();
    if (typeof TcSmmEditor.isInstanceReady === 'function' && !TcSmmEditor.isInstanceReady()) {
        if (typeof TcSmmEditor.ensure === 'function') TcSmmEditor.ensure();
    }
    if (typeof tcMindmapSyncCanvasSize === 'function') tcMindmapSyncCanvasSize();
    if (typeof TcSmmEditor.zoomStep === 'function') TcSmmEditor.zoomStep(step, clientX, clientY);
}

function tcMindmapFitToView() {
    if (!window.TcSmmEditor) return false;
    if (typeof TcSmmEditor.ensure === 'function') TcSmmEditor.ensure();
    if (typeof tcMindmapSyncCanvasSize === 'function') tcMindmapSyncCanvasSize();
    if (typeof TcSmmEditor.fitView === 'function') return TcSmmEditor.fitView();
    return false;
}

var _tcMindmapFitFocusTimer = null;
var _tcMindmapFitFocusAttempts = 0;
var TC_MINDMAP_FIT_FOCUS_MAX = 15;

function tcMindmapResolveRootNodeId() {
    if (tcMindmapExternalMindData && tcMindmapExternalMindData.data && tcMindmapExternalMindData.data.id) {
        return String(tcMindmapExternalMindData.data.id);
    }
    var root = tcMindmapInstance && tcMindmapInstance.mind && tcMindmapInstance.mind.root;
    if (root && root.id) return String(root.id);
    return 'tc_root';
}

function tcMindmapFitAndFocusMainBranch() {
    if (typeof tcMindmapFitToView === 'function') tcMindmapFitToView();
    if (typeof tcMindmapFocusMainBranch === 'function') tcMindmapFocusMainBranch();
    if (typeof tcMindmapUpdateZoomChrome === 'function') tcMindmapUpdateZoomChrome();
}

function tcMindmapScheduleFitAndFocusMainBranch() {
    if (_tcMindmapFitFocusTimer) {
        clearTimeout(_tcMindmapFitFocusTimer);
        _tcMindmapFitFocusTimer = null;
    }
    _tcMindmapFitFocusAttempts = 0;
    function attempt() {
        if (tcRightViewMode !== 'mindmap') return;
        if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) {
            if (_tcMindmapFitFocusAttempts < TC_MINDMAP_FIT_FOCUS_MAX) {
                _tcMindmapFitFocusAttempts += 1;
                _tcMindmapFitFocusTimer = window.setTimeout(attempt, 80);
            }
            return;
        }
        if (typeof tcMindmapContainerIsReady === 'function' && !tcMindmapContainerIsReady()) {
            if (_tcMindmapFitFocusAttempts < TC_MINDMAP_FIT_FOCUS_MAX) {
                _tcMindmapFitFocusAttempts += 1;
                _tcMindmapFitFocusTimer = window.setTimeout(attempt, 80);
            }
            return;
        }
        if (typeof ensureTcMindmapInstance === 'function') ensureTcMindmapInstance();
        if (!tcMindmapInstance) {
            if (_tcMindmapFitFocusAttempts < TC_MINDMAP_FIT_FOCUS_MAX) {
                _tcMindmapFitFocusAttempts += 1;
                _tcMindmapFitFocusTimer = window.setTimeout(attempt, 80);
            }
            return;
        }
        tcMindmapFitAndFocusMainBranch();
        if (_tcMindmapFitFocusAttempts < 2) {
            _tcMindmapFitFocusAttempts += 1;
            _tcMindmapFitFocusTimer = window.setTimeout(function () {
                tcMindmapFitAndFocusMainBranch();
            }, 220);
        }
    }
    _tcMindmapFitFocusTimer = window.setTimeout(attempt, 120);
}

function tcMindmapOnZoomWheel(e) {
    if (!tcMindmapIsMindmapZoomWheelEvent(e)) return;
    if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var dy = e.deltaY || 0;
    tcMindmapZoomByStep(dy > 0 ? -0.12 : 0.12, e.clientX, e.clientY);
}

function tcMindmapBindZoomBar() {
    var bar = document.getElementById('tc-mindmap-zoom-bar');
    if (!bar || bar._tcMindmapZoomBarBound) return;
    var outBtn = document.getElementById('tc-mindmap-zoom-out-btn');
    var inBtn = document.getElementById('tc-mindmap-zoom-in-btn');
    var fitBtn = document.getElementById('tc-mindmap-zoom-fit-btn');
    if (!outBtn && !inBtn && !fitBtn) return;
    bar._tcMindmapZoomBarBound = true;
    window._tcMindmapZoomBarBound = true;
    bar.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('#tc-mindmap-zoom-out-btn')) {
            e.preventDefault();
            e.stopPropagation();
            tcMindmapZoomByStep(-0.12);
            return;
        }
        if (t.closest('#tc-mindmap-zoom-in-btn')) {
            e.preventDefault();
            e.stopPropagation();
            tcMindmapZoomByStep(0.12);
            return;
        }
        if (t.closest('#tc-mindmap-zoom-fit-btn')) {
            e.preventDefault();
            e.stopPropagation();
            tcMindmapFitToView();
        }
    });
}

function tcMindmapEnsureZoomUiBound() {
    tcMindmapBindZoomBar();
    tcMindmapBindZoomWheel();
}

function tcMindmapEnsureCanvas() { return document.getElementById('tc-smm-container'); }

function tcMindmapSyncCanvasSize() {
    if (!window.TcSmmEditor) return false;
    if (typeof TcSmmEditor.prepareViewForZoom === 'function') return TcSmmEditor.prepareViewForZoom();
    return false;
}

function tcMindmapBindZoomWheel() {
    if (window._tcMindmapZoomWheelBound) return;
    window._tcMindmapZoomWheelBound = true;
    document.addEventListener('wheel', tcMindmapOnZoomWheel, { passive: false, capture: true });
}

function tcMindmapBindInnerZoomWheel() {}

function tcMindmapBindNodeDeleteHover() { tcMindmapHideDeleteBtn(); }

function tcMindmapUpdateZoomChrome() {
    var bar = document.getElementById('tc-mindmap-zoom-bar');
    var label = document.getElementById('tc-mindmap-zoom-label');
    var z = 1;
    if (window.TcSmmEditor && typeof TcSmmEditor.getViewScale === 'function') {
        z = TcSmmEditor.getViewScale();
    } else {
        var view = tcMindmapInstance && tcMindmapInstance.view;
        if (view && view.zoom_current) z = view.zoom_current;
    }
    if (label) label.textContent = Math.round(z * 100) + '%';
    if (bar) {
        var show = tcRightViewMode === 'mindmap' &&
            !(typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder());
        bar.classList.toggle('hidden', !show);
        bar.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
}

function tcMindmapIsMindmapZoomWheelEvent(e) {
    /* 仅 Ctrl / Alt / Meta + 滚轮缩放；普通滚轮由 SMM move 平移画布 */
    if (!e || (!e.ctrlKey && !e.altKey && !e.metaKey)) return false;
    if (tcRightViewMode !== 'mindmap') return false;
    var panel = document.getElementById('tc-mindmap-view-panel');
    if (!panel || panel.classList.contains('hidden')) return false;
    var t = e.target;
    if (!t || !t.closest) return false;
    return !!t.closest('#tc-mindmap-view-panel');
}

function tcMindmapFocusNodeById(nodeId, opts) {
    if (!nodeId) return;
    if (typeof switchTcRightView === 'function') switchTcRightView('mindmap');
    if (window.TcSmmEditor && TcSmmEditor.focusNode) {
        window.setTimeout(function () {
            TcSmmEditor.focusNode(nodeId);
        }, opts && opts.delay != null ? opts.delay : 60);
    }
}


/** 表格/导图主内容区互斥展示（避免列表模板区在导图 Tab 占位） */
function syncTcRightViewPanelIsolation(isTable, tablePanel, mindmapPanel) {
    var listPanelWrap = document.getElementById('tc-table-list-panel');
    if (listPanelWrap) {
        listPanelWrap.classList.toggle('hidden', !isTable);
        listPanelWrap.setAttribute('aria-hidden', isTable ? 'false' : 'true');
    }
    if (tablePanel) {
        tablePanel.classList.toggle('hidden', !isTable);
        tablePanel.setAttribute('aria-hidden', isTable ? 'false' : 'true');
        if (isTable) tablePanel.classList.remove('hidden');
    }
    if (mindmapPanel) {
        mindmapPanel.classList.toggle('hidden', isTable);
        mindmapPanel.setAttribute('aria-hidden', isTable ? 'true' : 'false');
        if (!isTable) mindmapPanel.classList.remove('hidden');
    }
}

function syncTcRightViewChrome() {
    const tableBtn = document.getElementById('tc-right-view-table-btn');
    const mindmapBtn = document.getElementById('tc-right-view-mindmap-btn');
    const tableActions = document.getElementById('tc-table-toolbar-actions');
    const mindmapActions = document.getElementById('tc-mindmap-toolbar-actions');
    const tablePanel = document.getElementById('tc-vxe-table-view-panel');
    const mindmapPanel = document.getElementById('tc-mindmap-view-panel');
    const isTable = tcRightViewMode === 'table';
    document.body.classList.toggle('tc-right-view-table', isTable);
    document.body.classList.toggle('tc-right-view-mindmap', !isTable);
    if (tableBtn) {
        tableBtn.classList.toggle('tc-right-view-nav__btn--active', isTable);
        tableBtn.setAttribute('aria-selected', isTable ? 'true' : 'false');
    }
    if (mindmapBtn) {
        mindmapBtn.classList.toggle('tc-right-view-nav__btn--active', !isTable);
        mindmapBtn.setAttribute('aria-selected', !isTable ? 'true' : 'false');
    }
    if (typeof syncTcRightPanelMeta === 'function') syncTcRightPanelMeta();
    if (typeof syncTcLeftInputFloatChrome === 'function') syncTcLeftInputFloatChrome();
    if (typeof syncTcLeftGenPanelLayout === 'function') syncTcLeftGenPanelLayout();
    if (tableActions) tableActions.classList.toggle('hidden', true);
    if (mindmapActions) mindmapActions.classList.add('hidden');
    if (typeof syncTcRightViewPanelIsolation === 'function') {
        syncTcRightViewPanelIsolation(isTable, tablePanel, mindmapPanel);
    } else {
        var listPanelWrap = document.getElementById('tc-table-list-panel');
        if (listPanelWrap) listPanelWrap.classList.toggle('hidden', !isTable);
        if (tablePanel) {
            tablePanel.classList.toggle('hidden', !isTable);
            tablePanel.setAttribute('aria-hidden', isTable ? 'false' : 'true');
            if (isTable) tablePanel.classList.remove('hidden');
        }
        if (mindmapPanel) {
            mindmapPanel.classList.toggle('hidden', isTable);
            mindmapPanel.setAttribute('aria-hidden', isTable ? 'true' : 'false');
            if (!isTable) mindmapPanel.classList.remove('hidden');
        }
    }
    if (typeof syncTcTableTemplateChrome === 'function') syncTcTableTemplateChrome();
    syncTcTableFabMenu();
    if (isTable) {
        tcMindmapHideDeleteBtn();
        tcMindmapHideContextMenu();
    }
    tcMindmapUpdateZoomChrome();
    if (typeof window.TcTableProductivity !== 'undefined' && window.TcTableProductivity &&
        typeof window.TcTableProductivity.syncFilterBarVisibility === 'function') {
        window.TcTableProductivity.syncFilterBarVisibility();
    }
    if (typeof window !== 'undefined' && window.TcWorkbenchEnhancements &&
        window.TcWorkbenchEnhancements.TcQcPageSession &&
        typeof window.TcWorkbenchEnhancements.TcQcPageSession.syncReopenOnViewSwitch === 'function') {
        window.TcWorkbenchEnhancements.TcQcPageSession.syncReopenOnViewSwitch();
    }
}


function syncTcExportFabReviewItemsVisible() {
    var exportCommon = document.getElementById('tc-export-fab-sheet-common');
    if (!exportCommon) return;
    var hasItems = !!exportCommon.querySelector('.tc-workbench-fab-sheet__item, .tc-table-fab-sheet__item');
    exportCommon.classList.toggle('hidden', !hasItems);
    exportCommon.setAttribute('aria-hidden', hasItems ? 'false' : 'true');
}

/** 表格/思维导图 Tab 共用导出 FAB 中的评审入口（思维导图 Tab 不再隐藏） */
function syncTcExportFabCommonGroup() {
    syncTcExportFabReviewItemsVisible();
}

function syncTcTableFabMenu() {
    var isMindmap = tcRightViewMode === 'mindmap';
    var editList = document.getElementById('tc-table-fab-sheet-list');
    var editMindmap = document.getElementById('tc-table-fab-sheet-mindmap');
    var exportList = document.getElementById('tc-export-fab-sheet-list');
    var exportMindmap = document.getElementById('tc-export-fab-sheet-mindmap');
    var editSheet = document.getElementById('tc-table-fab-sheet');
    var exportSheet = document.getElementById('tc-export-fab-sheet');
    var editToggle = document.getElementById('tc-table-fab-toggle');
    var exportToggle = document.getElementById('tc-export-fab-toggle');
    if (editList) {
        editList.classList.toggle('hidden', isMindmap);
        editList.setAttribute('aria-hidden', isMindmap ? 'true' : 'false');
    }
    if (editMindmap) {
        editMindmap.classList.toggle('hidden', !isMindmap);
        editMindmap.setAttribute('aria-hidden', !isMindmap ? 'true' : 'false');
    }
    if (exportList) {
        exportList.classList.toggle('hidden', isMindmap);
        exportList.setAttribute('aria-hidden', isMindmap ? 'true' : 'false');
    }
    if (exportMindmap) {
        exportMindmap.classList.toggle('hidden', !isMindmap);
        exportMindmap.setAttribute('aria-hidden', !isMindmap ? 'true' : 'false');
    }
    if (editSheet) editSheet.setAttribute('aria-label', isMindmap ? '编辑操作（导图）' : '编辑操作（表格）');
    if (exportSheet) exportSheet.setAttribute('aria-label', isMindmap ? '导出与协作（导图）' : '导出与协作（表格）');
    if (editToggle) {
        editToggle.setAttribute('title', '拖动移动 · 点击展开编辑菜单');
        editToggle.setAttribute('aria-label', isMindmap ? '编辑操作（导图，可拖动）' : '编辑操作（表格，可拖动）');
    }
    syncTcExportFabCommonGroup();
    if (typeof syncTcTableToolbarOpsLabel === 'function') syncTcTableToolbarOpsLabel();
    if (exportToggle) {
        exportToggle.setAttribute('title', '拖动移动 · 点击展开导出与协作');
        exportToggle.setAttribute('aria-label', isMindmap ? '导出与协作（导图，可拖动）' : '导出与协作（表格，可拖动）');
    }
}

var _tcMindmapRenderRetryTimer = null;
var _tcMindmapRenderRetryCount = 0;
var TC_MINDMAP_RENDER_RETRY_MAX = 30;
var _tcMindmapLibraryRetryCount = 0;
var TC_MINDMAP_LIBRARY_RETRY_MAX = 20;

function tcMindmapLibraryReady() {
    if (window.TcSmmEditor && typeof TcSmmEditor.isLibraryReady === 'function') {
        return TcSmmEditor.isLibraryReady();
    }
    if (typeof simpleMindMap === 'undefined') return false;
    var Ctor = simpleMindMap.default || simpleMindMap.MindMap || simpleMindMap;
    return !!Ctor;
}
var _tcMindmapRenderReadyTimer = null;
var _tcMindmapRenderReadyAttempts = 0;
var TC_MINDMAP_RENDER_READY_MAX = 24;



function tcMindmapPaintView(opts) {
    opts = opts || {};
    if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode !== 'mindmap') return;
    if (tcMindmapGenerating && !(typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData.length)) return;
    var release = opts.releaseInstance !== false;
    var paintToken = (window._tcMindmapPaintSeq = (window._tcMindmapPaintSeq || 0) + 1);
    var painted = false;

    function paintFull(forceWhenNotReady) {
        if (paintToken !== window._tcMindmapPaintSeq) return false;
        if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode !== 'mindmap') return false;
        if (painted) return true;
        if (typeof tcMindmapPrepareContainerLayout === 'function') tcMindmapPrepareContainerLayout();
        if (!forceWhenNotReady && typeof tcMindmapContainerIsReady === 'function' && !tcMindmapContainerIsReady()) {
            return false;
        }
        painted = true;
        if (release && typeof tcMindmapReleaseInstance === 'function') tcMindmapReleaseInstance();
        renderTcMindmap({ forceLayout: true, releaseInstance: false });
        return true;
    }

    function onFallbackDelay() {
        if (paintToken !== window._tcMindmapPaintSeq) return;
        if (!painted) paintFull(true);
    }

    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { requestAnimationFrame(function () { paintFull(false); }); });
    } else {
        window.setTimeout(function () { paintFull(false); }, 0);
    }
    window.setTimeout(onFallbackDelay, 300);
}
window.tcMindmapPaintView = tcMindmapPaintView;

/** 切回表格 Tab 时挂起导图实例，避免再次进入 Tab 时先闪旧画布再重建 */
function tcMindmapSuspendForTableView() {
    if (window.TcSmmEditor && typeof TcSmmEditor.captureViewTransform === 'function') {
        try {
            var vt = TcSmmEditor.captureViewTransform();
            if (vt) tcMindmapPendingViewTransform = vt;
        } catch (eVt) { /* ignore */ }
    }
    if (typeof tcMindmapReleaseInstance === 'function') tcMindmapReleaseInstance();
    var container = document.getElementById('tc-smm-container');
    if (container) container.classList.add('hidden');
}
window.tcMindmapSuspendForTableView = tcMindmapSuspendForTableView;

function tcMindmapPaintViewOnTabReshow() {
    tcMindmapPaintView({ releaseInstance: false });
}
window.tcMindmapPaintViewOnTabReshow = tcMindmapPaintViewOnTabReshow;


/** 导图面板刚显示时容器可能尚未完成布局，延迟到有尺寸后再 render */
function tcMindmapRenderWhenReady(opts) {
    opts = opts || {};
    tcMindmapPaintView({ releaseInstance: opts.releaseInstance !== false });
}
window.tcMindmapRenderWhenReady = tcMindmapRenderWhenReady;
window.ensureTcRightViewUiInited = ensureTcRightViewUiInited;
window.tcMindmapEnsureZoomUiBound = tcMindmapEnsureZoomUiBound;

function resolveTcMindmapRenderPayload() {
    function cloneExtMind(src) {
        if (!src || !src.data) return null;
        try {
            var cloned = JSON.parse(JSON.stringify(src));
            if (cloned.data && typeof tcMindmapEnsureRootVisualDefaults === 'function') {
                tcMindmapEnsureRootVisualDefaults(cloned.data);
            }
            return cloned;
        } catch (eClone) {
            return src;
        }
    }
    function pickExternalMind() {
        var ext = typeof tcMindmapExternalMindData !== 'undefined' ? tcMindmapExternalMindData : null;
        if ((!ext || !ext.data) && typeof tcMindmapCommittedExternalMind !== 'undefined') {
            ext = tcMindmapCommittedExternalMind;
        }
        if ((!ext || !ext.data) && typeof window !== 'undefined') {
            ext = window.tcMindmapCommittedExternalMind || window.tcMindmapExternalMindData;
        }
        if (ext && ext.data && typeof tcMindmapStashMindHasUserNodes === 'function' &&
            tcMindmapStashMindHasUserNodes(ext)) {
            return cloneExtMind(ext);
        }
        return null;
    }
    var fromExt = pickExternalMind();
    if (fromExt) return fromExt;
    var hasCaseRows = !!(typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData.length);
    if (!hasCaseRows && typeof tcMindmapHydrateFromTableIfEmpty === 'function') {
        if (tcMindmapHydrateFromTableIfEmpty()) {
            hasCaseRows = tcMindmapCasesData.length > 0;
        }
    }
    if (hasCaseRows) {
        var fromRows = buildTcMindmapMindData();
        if (fromRows && fromRows.data && typeof tcMindmapEnsureRootVisualDefaults === 'function') {
            tcMindmapEnsureRootVisualDefaults(fromRows.data);
        }
        return fromRows;
    }
    var extFallback = typeof tcMindmapExternalMindData !== 'undefined' ? tcMindmapExternalMindData : null;
    if ((!extFallback || !extFallback.data) && typeof tcMindmapCommittedExternalMind !== 'undefined') {
        extFallback = tcMindmapCommittedExternalMind;
    }
    if (extFallback && extFallback.data) return cloneExtMind(extFallback);
    var built = buildTcMindmapMindData();
    if (built && built.data && typeof tcMindmapEnsureRootVisualDefaults === 'function') {
        tcMindmapEnsureRootVisualDefaults(built.data);
    }
    return built;
}


function tcMindmapPrepareContainerLayout() {
    var el = document.getElementById('tc-smm-container');
    var panel = document.getElementById('tc-mindmap-view-panel');
    if (!el || !panel) return false;
    if (panel.classList.contains('hidden') || panel.getAttribute('aria-hidden') === 'true') return false;
    if (document.body && document.body.classList.contains('tc-right-view-table')) return false;
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    var stage = el.closest ? el.closest('.tc-mindmap-stage') : null;
    var panelRect = panel.getBoundingClientRect ? panel.getBoundingClientRect() : null;
    var panelH = (panelRect && panelRect.height > 0) ? panelRect.height : (panel.offsetHeight || panel.clientHeight || 0);
    var panelW = (panelRect && panelRect.width > 0) ? panelRect.width : (panel.offsetWidth || panel.clientWidth || 0);
    if (panelH <= 0) {
        panel.style.flex = '1 1 auto';
        panel.style.minHeight = 'min(78vh, 720px)';
        void panel.offsetHeight;
        panelH = panel.offsetHeight || panel.clientHeight || 0;
    }
    if (panelH > 0) {
        el.style.width = '100%';
        el.style.height = panelH + 'px';
        el.style.minHeight = panelH + 'px';
        if (stage) {
            stage.style.height = panelH + 'px';
            stage.style.minHeight = panelH + 'px';
        }
    } else {
        el.style.width = '100%';
        el.style.minHeight = '420px';
        el.style.height = '420px';
    }
    if (panelW > 0) {
        el.style.width = '100%';
    }
    void el.offsetHeight;
    return (el.offsetHeight || el.clientHeight) > 0 && (el.offsetWidth || el.clientWidth) > 0;
}
window.tcMindmapPrepareContainerLayout = tcMindmapPrepareContainerLayout;

function tcMindmapContainerIsReady() {
    var el = document.getElementById('tc-smm-container');
    var panel = document.getElementById('tc-mindmap-view-panel');
    if (!el || !panel) return false;
    if (panel.classList.contains('hidden') || panel.getAttribute('aria-hidden') === 'true') return false;
    if (document.body && document.body.classList.contains('tc-right-view-table')) return false;
    var w = el.offsetWidth || el.clientWidth;
    var h = el.offsetHeight || el.clientHeight;
    return w > 0 && h > 0;
}

function tcMindmapScheduleRenderRetry() {
    if (_tcMindmapRenderRetryCount >= TC_MINDMAP_RENDER_RETRY_MAX) {
        _tcMindmapRenderRetryCount = 0;
        renderTcMindmap({ forceLayout: true });
        return;
    }
    if (_tcMindmapRenderRetryTimer) return;
    _tcMindmapRenderRetryTimer = window.setTimeout(function () {
        _tcMindmapRenderRetryTimer = null;
        _tcMindmapRenderRetryCount += 1;
        renderTcMindmap();
    }, 80);
}


function tcMindmapNeedsDbRestoreFromStore() {
    if (typeof TcRequirementMindmapStore !== 'undefined' &&
        typeof TcRequirementMindmapStore.mindmapNeedsDbRestore === 'function') {
        return TcRequirementMindmapStore.mindmapNeedsDbRestore();
    }
    if (typeof tcMindmapStashMindHasUserNodes === 'function') {
        var ext = tcMindmapExternalMindData || tcMindmapCommittedExternalMind;
        if (tcMindmapStashMindHasUserNodes(ext)) return false;
    }
    return !(typeof tcMindmapCasesData !== 'undefined' && tcMindmapCasesData.length);
}

function tcFinishMindmapViewSwitchAfterRestore(skipCacheRestore, opts) {
    opts = opts || {};
    if (!tcMindmapCasesData.length && !skipCacheRestore && typeof tcMindmapHydrateFromTableIfEmpty === 'function') {
        tcMindmapHydrateFromTableIfEmpty();
    }
    if (!tcMindmapHistory.length && tcMindmapCasesData.length) {
        tcMindmapEnsureHistoryReady();
    }
    if (tcMindmapGenerating) {
        showTcMindmapGeneratingUi();
    } else {
        if (!skipCacheRestore && tcMindmapCachedMindPayload) {
            tcMindmapRestoreCachedMindIfAny();
        }
        tcMindmapPaintViewOnTabReshow();
    }
    tcMindmapSkipCacheRestore = false;
    tcMindmapCachedMindPayload = null;
    tcMindmapFocusPanel();
}

function tcFinishMindmapViewSwitch() {
    var skipCacheRestore = tcMindmapSkipCacheRestore;

    function finishView() {
        if (!skipCacheRestore) tcMindmapSchedulePersistCache(true);
        tcFinishMindmapViewSwitchAfterRestore(skipCacheRestore, {});
    }

    if (typeof TcRequirementMindmapStore !== 'undefined' &&
        typeof TcRequirementMindmapStore.loadForMindmapTabView === 'function' &&
        typeof TcRequirementMindmapStore.mindmapNeedsDbRestore === 'function' &&
        TcRequirementMindmapStore.mindmapNeedsDbRestore()) {
        TcRequirementMindmapStore.loadForMindmapTabView({ deferRender: true })
            .then(function () { finishView(); })
            .catch(function () { finishView(); });
        return;
    }
    finishView();
}

function tcMindmapSyncExternalMindFromInstance() {
    if (window.TcSmmEditor && typeof TcSmmEditor.syncExternalMind === 'function') {
        return TcSmmEditor.syncExternalMind();
    }
    var snap = typeof tcMindmapCaptureMindSnapshot === 'function' ? tcMindmapCaptureMindSnapshot() : null;
    if (!snap || !snap.data) return null;
    tcMindmapExternalMindData = snap;
    tcMindmapCommittedExternalMind = snap;
    window.tcMindmapExternalMindData = snap;
    window.tcMindmapCommittedExternalMind = snap;
    if (typeof tcSyncWorkbenchGlobals === 'function') tcSyncWorkbenchGlobals();
    return snap;
}

function switchTcRightView(mode) {
    if (mode !== 'table' && mode !== 'mindmap') mode = 'table';
    if (typeof tcAutoRecoverySuppressForViewSwitch === 'function') {
        tcAutoRecoverySuppressForViewSwitch();
    }
    if (tcRightViewMode === 'mindmap' && mode !== 'mindmap') {
        tcMindmapCommitEditing();
        tcMindmapSyncExternalMindFromInstance();
        if (typeof TcRequirementMindmapStore !== 'undefined' &&
            typeof TcRequirementMindmapStore.persistNow === 'function') {
            TcRequirementMindmapStore.persistNow('manual_edit', {});
        }
        tcMindmapPersistCache();
        if (typeof tcMindmapSuspendForTableView === 'function') tcMindmapSuspendForTableView();
    }
    if (tcRightViewMode === mode) {
        if (mode === 'mindmap') {
            syncTcRightViewChrome();
            if (tcMindmapGenerating) showTcMindmapGeneratingUi();
            else tcMindmapRenderWhenReady();
            tcMindmapFocusPanel();
        }
        return;
    }
    var prevMode = tcRightViewMode;
    if (typeof tcFabPersistViewFabPositions === 'function') {
        tcFabPersistViewFabPositions(prevMode);
    }
    tcRightViewMode = mode;
    tcSyncWorkbenchGlobals();
    syncTcRightViewChrome();
    if (typeof closeTcTableFabSheet === 'function') closeTcTableFabSheet();
    if (typeof tcFabApplyViewFabPositions === 'function') {
        tcFabApplyViewFabPositions(mode);
    } else if (typeof syncTcWorkbenchFabPositionsOnViewSwitch === 'function') {
        syncTcWorkbenchFabPositionsOnViewSwitch();
    }
    if (mode === 'table') {
        if (window.TcTableView && typeof window.TcTableView.onViewShow === 'function') {
            window.TcTableView.onViewShow();
        }
        renderTableBody({ reload: true });
    } else if (mode === 'mindmap') {
        var afterTablePull = function() { tcFinishMindmapViewSwitch(); };
        var runPullThenFinish = function() {
            if (window.TcTableView && typeof window.TcTableView.pullRows === 'function') {
                var pullPromise = window.TcTableView.pullRows();
                if (pullPromise && typeof pullPromise.then === 'function') {
                    pullPromise.then(afterTablePull).catch(afterTablePull);
                } else {
                    afterTablePull();
                }
            } else {
                afterTablePull();
            }
        };
        if (window.TcTableView && typeof window.TcTableView.onViewHide === 'function') {
            var hidePromise = window.TcTableView.onViewHide();
            if (hidePromise && typeof hidePromise.then === 'function') {
                hidePromise.then(runPullThenFinish).catch(runPullThenFinish);
            } else {
                runPullThenFinish();
            }
        } else {
            runPullThenFinish();
        }
    }
}

function hideTcMindmapGenerating() {
    tcMindmapGenerating = false;
    var loadingEl = document.getElementById('tc-mindmap-loading');
    if (loadingEl) {
        loadingEl.classList.add('hidden');
        loadingEl.setAttribute('aria-hidden', 'true');
    }
}

/** 空占位副文案：未选模板时提示用户去表格页选择模板 */
function syncTcMindmapEmptyHint(showTemplateHint) {
    var hintEl = document.getElementById('tc-mindmap-empty-hint');
    if (!hintEl) return;
    if (showTemplateHint) {
        hintEl.classList.remove('hidden');
        hintEl.setAttribute('aria-hidden', 'false');
    } else {
        hintEl.classList.add('hidden');
        hintEl.setAttribute('aria-hidden', 'true');
    }
}

/** 仅更新导图区 DOM：展示「正在生成中」，不切换视图 */
function showTcMindmapGeneratingUi() {
    tcMindmapHideDeleteBtn();
    var container = document.getElementById('tc-smm-container');
    var emptyEl = document.getElementById('tc-mindmap-empty');
    var loadingEl = document.getElementById('tc-mindmap-loading');
    if (container) {
        if (typeof tcMindmapReleaseInstance === 'function') tcMindmapReleaseInstance();
        container.classList.add('hidden');
        if (container.innerHTML) container.innerHTML = '';
    }
    if (emptyEl) {
        emptyEl.classList.add('hidden');
        emptyEl.setAttribute('aria-hidden', 'true');
        syncTcMindmapEmptyHint(false);
    }
    if (loadingEl) {
        loadingEl.classList.remove('hidden');
        loadingEl.setAttribute('aria-hidden', 'false');
    }
}

function showTcMindmapGenerating() {
    tcMindmapGenerating = true;
    switchTcRightView('mindmap');
    showTcMindmapGeneratingUi();
}

function renderTcMindmap(opts) {
    opts = opts || {};
    if (tcRightViewMode !== 'mindmap') return;
    if (tcMindmapGenerating && !tcMindmapCasesData.length) {
        showTcMindmapGeneratingUi();
        return;
    }
    hideTcMindmapGenerating();
    const container = document.getElementById('tc-smm-container');
    const emptyEl = document.getElementById('tc-mindmap-empty');
    if (!container) return;
    if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) {
        if (typeof tcMindmapReleaseInstance === 'function') tcMindmapReleaseInstance();
        if (container.innerHTML) container.innerHTML = '';
        container.classList.add('hidden');
        if (emptyEl) {
            emptyEl.classList.remove('hidden');
            emptyEl.setAttribute('aria-hidden', 'false');
            var emptyTitle = emptyEl.querySelector('.ds-table-empty__title');
            if (emptyTitle) emptyTitle.textContent = '暂无思维导图';
            syncTcMindmapEmptyHint(!(tableColumns && tableColumns.length));
        }
        tcMindmapUpdateZoomChrome();
        return;
    }
    container.classList.remove('hidden');
    if (emptyEl) {
        emptyEl.classList.add('hidden');
        emptyEl.setAttribute('aria-hidden', 'true');
        syncTcMindmapEmptyHint(false);
    }
    if (!tcMindmapLibraryReady()) {
        if (_tcMindmapLibraryRetryCount < TC_MINDMAP_LIBRARY_RETRY_MAX) {
            _tcMindmapLibraryRetryCount += 1;
            window.setTimeout(function () {
                if (tcRightViewMode === 'mindmap' && typeof renderTcMindmap === 'function') {
                    renderTcMindmap();
                }
            }, 120);
            return;
        }
        _tcMindmapLibraryRetryCount = 0;
        container.classList.add('hidden');
        if (emptyEl) {
            emptyEl.classList.remove('hidden');
            emptyEl.setAttribute('aria-hidden', 'false');
            var errTitle = emptyEl.querySelector('.ds-table-empty__title');
            if (errTitle) errTitle.textContent = '思维导图组件未加载';
            syncTcMindmapEmptyHint(false);
        }
        return;
    }
    _tcMindmapLibraryRetryCount = 0;
    tcMindmapPrepareContainerLayout();
    if (!opts.forceLayout && !tcMindmapContainerIsReady()) {
        tcMindmapScheduleRenderRetry();
        return;
    }
    _tcMindmapRenderRetryCount = 0;
    const mindData = resolveTcMindmapRenderPayload();
    if (typeof tcMindmapReleaseInstance === 'function' && opts.releaseInstance) {
        tcMindmapReleaseInstance();
    }
    ensureTcMindmapInstance();
    var mmInst = tcMindmapResolveInstance();
    if (!mmInst) {
        tcMindmapScheduleRenderRetry();
        return;
    }
    tcMindmapClearMindSelection();
    mmInst.show(mindData);
    _tcMindmapRenderReadyAttempts = 0;
    syncTcMindmapMetaCache();
    if (!tcMindmapInUndoSync) tcMindmapEnsureHistoryReady();
    window.setTimeout(function () {
        var mmResize = tcMindmapResolveInstance();
        if (mmResize && typeof mmResize.resize === 'function') {
            mmResize.resize();
        }
        if (typeof tcMindmapPendingViewTransform !== 'undefined' && tcMindmapPendingViewTransform &&
            window.TcSmmEditor && typeof TcSmmEditor.restoreViewTransform === 'function') {
            TcSmmEditor.restoreViewTransform(tcMindmapPendingViewTransform);
            tcMindmapPendingViewTransform = null;
            tcMindmapUpdateZoomChrome();
        } else if (tcMindmapPendingFitFocus) {
            tcMindmapPendingFitFocus = false;
            tcMindmapScheduleFitAndFocusMainBranch();
        } else {
            tcMindmapFitToView();
            tcMindmapUpdateZoomChrome();
        }
    }, 120);
    tcMindmapEnsureZoomUiBound();
    tcMindmapRebindMindmapInteractions();
    tcSyncWorkbenchGlobals();
}


function tcMindmapResolveInstance() {
    if (tcMindmapInstance) return tcMindmapInstance;
    if (typeof window !== 'undefined' && window.tcMindmapInstance) return window.tcMindmapInstance;
    if (window.TcSmmEditor && typeof TcSmmEditor.ensure === 'function') {
        return TcSmmEditor.ensure();
    }
    return null;
}

function tcMindmapHideContextMenu() {
    var menu = document.getElementById('tc-mindmap-context-menu');
    if (!menu) return;
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
}
window.tcMindmapHideContextMenu = tcMindmapHideContextMenu;

function tcMindmapExpandAll() {
    var inst = tcMindmapResolveInstance();
    if (inst && typeof inst.expand_all === 'function') {
        inst.expand_all();
    } else if (window.TcSmmEditor && typeof TcSmmEditor.expandAll === 'function') {
        TcSmmEditor.expandAll();
    }
}

function tcMindmapCollapseAll() {
    var inst = tcMindmapResolveInstance();
    if (inst && typeof inst.collapse_all === 'function') {
        inst.collapse_all();
    } else if (window.TcSmmEditor && typeof TcSmmEditor.collapseAll === 'function') {
        TcSmmEditor.collapseAll();
    }
}

function tcMindmapFocusMainBranch() {
    tcMindmapSafeSelectNode(null, tcMindmapResolveRootNodeId());
    tcMindmapFocusPanel();
}


function tcMindmapIsContextMenuOpen() {
    var menu = document.getElementById('tc-mindmap-context-menu');
    return !!(menu && !menu.classList.contains('hidden'));
}

function tcMindmapDismissContextMenuOnOutsidePointer(event) {
    if (!tcMindmapIsContextMenuOpen()) return;
    var target = event && event.target;
    if (target && target.closest && target.closest('#tc-mindmap-context-menu')) return;
    tcMindmapHideContextMenu();
}

function tcMindmapBindContextMenuOutsideDismiss() {
    if (window._tcMindmapCtxMenuOutsideDismissBound) return;
    window._tcMindmapCtxMenuOutsideDismissBound = true;
    var onOutside = function (e) {
        tcMindmapDismissContextMenuOnOutsidePointer(e);
    };
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('click', onOutside, true);
    document.addEventListener('contextmenu', function (e) {
        if (!tcMindmapIsContextMenuOpen()) return;
        var target = e && e.target;
        if (target && target.closest && target.closest('#tc-mindmap-context-menu')) return;
        tcMindmapHideContextMenu();
    }, true);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') tcMindmapHideContextMenu();
    }, true);
    window.addEventListener('scroll', tcMindmapHideContextMenu, true);
    window.addEventListener('resize', tcMindmapHideContextMenu, { passive: true });
}

function tcMindmapEnsureContextMenuMounted() {
    var menu = document.getElementById('tc-mindmap-context-menu');
    if (menu && menu.parentElement !== document.body) {
        document.body.appendChild(menu);
    }
    return menu;
}

var tcMindmapCtxState = {
    mode: 'canvas',
    node: null,
    clientX: 0,
    clientY: 0
};

var TC_MINDMAP_CTX_MENU_DEFS = {
    canvas: [
        { action: 'selectAll', label: '全选' },
        { action: 'paste', label: '粘贴', needClipboard: true },
        { type: 'separator' },
        { action: 'insertFreeTopic', label: '插入自由主题' },
        { type: 'separator' },
        { action: 'focusMainBranch', label: '聚焦主分支' },
        { action: 'fitView', label: '适应画布', primary: true }
    ],
    root: [
        { action: 'copy', label: '复制' },
        { action: 'cut', label: '剪切', disableOnRoot: true },
        { action: 'paste', label: '粘贴', needClipboard: true },
        { type: 'separator' },
        { action: 'insertChild', label: '插入子主题' },
        { action: 'insertSibling', label: '插入同级主题', disableOnRoot: true },
        { action: 'insertAssociativeLine', label: '插入关联线' },
        { type: 'separator' },
        { action: 'remove', label: '删除', disableOnRoot: true, danger: true },
        { type: 'separator' },
        { action: 'focusMainBranch', label: '聚焦主分支' },
        { action: 'fitView', label: '适应画布', primary: true }
    ],
    child: [
        { action: 'copy', label: '复制' },
        { action: 'cut', label: '剪切' },
        { action: 'paste', label: '粘贴', needClipboard: true },
        { action: 'clearText', label: '清空文本' },
        { type: 'separator' },
        { action: 'insertChild', label: '插入子主题' },
        { action: 'insertSibling', label: '插入同级主题' },
        { action: 'insertAssociativeLine', label: '插入关联线' },
        { type: 'separator' },
        { action: 'remove', label: '删除', danger: true },
        { type: 'separator' },
        { action: 'focusMainBranch', label: '聚焦主分支' },
        { action: 'fitView', label: '适应画布', primary: true }
    ]
};

function tcMindmapResolveContextMenuMode(node) {
    if (!node) return 'canvas';
    var Ed = window.TcSmmEditor;
    if (Ed && typeof Ed.isRootNode === 'function' && Ed.isRootNode(node)) return 'root';
    return 'child';
}

function tcMindmapResolveContextMenuItems(mode) {
    if (mode === 'root') return TC_MINDMAP_CTX_MENU_DEFS.root;
    if (mode === 'child') return TC_MINDMAP_CTX_MENU_DEFS.child;
    return TC_MINDMAP_CTX_MENU_DEFS.canvas;
}

function tcMindmapIsContextMenuItemDisabled(item, mode, node) {
    if (!item || item.type === 'separator') return false;
    var Ed = window.TcSmmEditor;
    if (item.needClipboard && Ed && typeof Ed.hasClipboardData === 'function' && !Ed.hasClipboardData()) {
        return true;
    }
    if (item.disableOnRoot && mode === 'root' && node && Ed && typeof Ed.isRootNode === 'function' && Ed.isRootNode(node)) {
        return true;
    }
    return false;
}

function tcMindmapRenderContextMenuBody() {
    var body = document.getElementById('tc-mindmap-context-menu-body');
    if (!body) return;
    var mode = tcMindmapCtxState.mode || 'canvas';
    var node = tcMindmapCtxState.node || null;
    var items = tcMindmapResolveContextMenuItems(mode);
    body.innerHTML = '';
    items.forEach(function (item) {
        if (item.type === 'separator') {
            var sep = document.createElement('div');
            sep.className = 'tc-mindmap-context-menu__separator';
            sep.setAttribute('role', 'separator');
            body.appendChild(sep);
            return;
        }
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tc-mindmap-context-menu__item';
        btn.setAttribute('role', 'menuitem');
        btn.textContent = item.label;
        btn.dataset.action = item.action;
        if (item.primary) btn.classList.add('tc-mindmap-context-menu__item--primary');
        if (item.danger) btn.classList.add('tc-mindmap-context-menu__item--danger');
        if (tcMindmapIsContextMenuItemDisabled(item, mode, node)) {
            btn.disabled = true;
            btn.classList.add('is-disabled');
        }
        btn.addEventListener('click', function () {
            if (btn.disabled) return;
            tcMindmapExecuteContextAction(item.action);
        });
        body.appendChild(btn);
    });
}

function tcMindmapExecuteContextAction(action) {
    tcMindmapHideContextMenu();
    var Ed = window.TcSmmEditor;
    if (!Ed) return;
    Ed.ensure();
    if (typeof Ed.commitTextEdit === 'function') Ed.commitTextEdit();
    var mode = tcMindmapCtxState.mode || 'canvas';
    var node = tcMindmapCtxState.node || null;
    if ((mode === 'root' || mode === 'child') && node && typeof Ed.activateNode === 'function') {
        Ed.activateNode(node);
    }
    switch (action) {
        case 'selectAll':
            if (typeof Ed.selectAllNodes === 'function') Ed.selectAllNodes();
            break;
        case 'paste':
            if (mode === 'canvas') {
                if (typeof Ed.pasteToRoot === 'function') Ed.pasteToRoot();
            } else if (typeof Ed.pasteToActive === 'function') {
                Ed.pasteToActive();
            }
            break;
        case 'insertFreeTopic':
            if (typeof Ed.insertFreeTopicAt === 'function') {
                Ed.insertFreeTopicAt(tcMindmapCtxState.clientX, tcMindmapCtxState.clientY);
            }
            break;
        case 'copy':
            if (typeof Ed.copySelection === 'function') Ed.copySelection();
            break;
        case 'cut':
            if (typeof Ed.cutSelection === 'function') Ed.cutSelection();
            break;
        case 'insertChild':
            if (typeof Ed.insertChildNode === 'function') Ed.insertChildNode();
            break;
        case 'insertSibling':
            if (typeof Ed.insertSiblingNode === 'function') Ed.insertSiblingNode();
            break;
        case 'insertParent':
            if (typeof Ed.insertParentNode === 'function') Ed.insertParentNode();
            break;
        case 'insertAssociativeLine':
            if (typeof Ed.insertAssociativeLine === 'function') Ed.insertAssociativeLine();
            break;
        case 'remove':
            if (typeof Ed.removeActiveNodes === 'function') Ed.removeActiveNodes();
            break;
        case 'clearText':
            if (typeof Ed.clearActiveNodeText === 'function') Ed.clearActiveNodeText();
            break;
        case 'expandAll':
            tcMindmapExpandAll();
            break;
        case 'collapseAll':
            tcMindmapCollapseAll();
            break;
        case 'focusMainBranch':
            tcMindmapFocusMainBranch();
            break;
        case 'fitView':
            tcMindmapFitToView();
            break;
        default:
            break;
    }
    if (typeof tcMindmapFocusPanel === 'function') tcMindmapFocusPanel();
}

function tcMindmapPlaceContextMenu(menu, clientX, clientY) {
    if (!menu) return;
    function placeMenu() {
        var rect = menu.getBoundingClientRect();
        var mw = rect.width || menu.offsetWidth || 168;
        var mh = rect.height || menu.offsetHeight || 140;
        var left = clientX;
        var top = clientY;
        if (left + mw > window.innerWidth - 8) left = clientX - mw;
        if (top + mh > window.innerHeight - 8) top = clientY - mh;
        left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
        top = Math.max(8, Math.min(top, window.innerHeight - mh - 8));
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }
    placeMenu();
    window.requestAnimationFrame(placeMenu);
}

function tcMindmapShowContextMenu(mode, clientX, clientY, node) {
    if (typeof tcRightViewMode !== 'undefined' && tcRightViewMode !== 'mindmap') return;
    var panel = document.getElementById('tc-mindmap-view-panel');
    if (!panel || panel.classList.contains('hidden')) return;
    if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) return;
    var menu = tcMindmapEnsureContextMenuMounted();
    if (!menu) return;
    if (window.TcSmmEditor && typeof TcSmmEditor.ensure === 'function') TcSmmEditor.ensure();
    var menuMode = mode === 'canvas' ? 'canvas' : tcMindmapResolveContextMenuMode(node);
    tcMindmapCtxState.mode = menuMode;
    tcMindmapCtxState.node = node || null;
    tcMindmapCtxState.clientX = clientX;
    tcMindmapCtxState.clientY = clientY;
    tcMindmapRenderContextMenuBody();
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    tcMindmapPlaceContextMenu(menu, clientX, clientY);
    tcMindmapBindContextMenuOutsideDismiss();
}
window.tcMindmapShowContextMenu = tcMindmapShowContextMenu;

function tcMindmapBindContextMenu() {
    var panel = document.getElementById('tc-mindmap-view-panel');
    var menu = tcMindmapEnsureContextMenuMounted();
    if (!panel || !menu || panel._tcMindmapCtxMenuBound) return;
    panel._tcMindmapCtxMenuBound = true;

    panel.addEventListener('contextmenu', function(e) {
        if (tcRightViewMode !== 'mindmap') return;
        if (panel.classList.contains('hidden')) return;
        if (typeof tcMindmapShouldShowEmptyPlaceholder === 'function' && tcMindmapShouldShowEmptyPlaceholder()) return;
        if (window._tcMindmapCtxFromNode) return;
        if (e.target.closest && (e.target.closest('.tc-mindmap-context-menu') ||
            e.target.closest('.smm-node-edit') || e.target.closest('.smm-text-edit-wrap'))) {
            return;
        }
        var Ed = window.TcSmmEditor;
        if (Ed && typeof Ed.isMindmapNodeDomTarget === 'function' && Ed.isMindmapNodeDomTarget(e.target)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        tcMindmapShowContextMenu('canvas', e.clientX, e.clientY, null);
    }, true);

    tcMindmapBindContextMenuOutsideDismiss();
}

function initTcRightViewUi() {
    syncTcRightViewChrome();
    window.setTimeout(function () {
        if (!window.TcTableView || tcRightViewMode !== 'table') return;
        if (typeof window.TcTableView.onViewShow === 'function') {
            window.TcTableView.onViewShow();
        }
    }, 0);
    tcMindmapBindContextMenu();
    tcMindmapEnsureZoomUiBound();
    tcMindmapBindPanelCommitEdit();
    tcMindmapBindNodeClickSelect();
    tcMindmapBindKeyboardShortcuts();
    tcMindmapBindEditorCommit();
    tcMindmapBindNodeDeleteHover();
}

function ensureTcRightViewUiInited() {
    if (window._tcRightViewUiInited) return;
    window._tcRightViewUiInited = true;
    try {
        initTcRightViewUi();
    } catch (viewUiErr) {
        console.error('[TestHub] ensureTcRightViewUiInited failed:', viewUiErr);
    }
}

// 初始化表格功能
function initTestCaseTable() {
    if (window._tcTestCaseTableInited) return;
    window._tcTestCaseTableInited = true;
    tcMindmapInitPageSession();
    initTcMindmapCacheLifecycle();
    // 初始化列显示状态和宽度
    initColumnState();
    
    // 添加行按钮
    const addRowBtn = document.getElementById('add-row-btn');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', addEmptyRow);
    }
    
    // 清空表格按钮
    const clearTableBtn1 = document.getElementById('clear-table-btn');
    if (clearTableBtn1) {
        clearTableBtn1.addEventListener('click', clearTable);
    }
    const clearMindmapBtn = document.getElementById('clear-mindmap-btn');
    if (clearMindmapBtn) {
        clearMindmapBtn.addEventListener('click', clearMindmapData);
    }
    const exportXmindBtn = document.getElementById('export-xmind-btn');
    if (exportXmindBtn) {
        exportXmindBtn.addEventListener('click', function () {
            if (typeof openTcExportXmindPickerModal === 'function') openTcExportXmindPickerModal();
            else if (typeof exportTcMindmapToXmind === 'function') exportTcMindmapToXmind();
        });
    }

    const deleteSelectedRowsBtn = document.getElementById('delete-selected-rows-btn');
    if (deleteSelectedRowsBtn) {
        deleteSelectedRowsBtn.addEventListener('click', deleteSelectedRows);
    }
    
    const clearAiFormPresetBtn = document.getElementById('clear-ai-form-preset');
    if (clearAiFormPresetBtn) {
        clearAiFormPresetBtn.addEventListener('click', clearTcAiPresetForm);
    }
    initTcFeatureUnlockUi();
    initTcPresetModelSettingsUi();
    initTcPresetLanhuFields();
    initTcRagToggle();
    initTcAiPromptIsolation();
    initTcAiTemperatureInput();
    initTcTableCellInteraction();
    tcTableBindKeyboardShortcuts();
    if (typeof switchAiConfigMode === 'function') {
        try {
            switchAiConfigMode('preset', true);
        } catch (bootModeErr) { /* AI 模式切换失败不影响表格编辑 */ }
    }

    // AI转导图按钮
    const exportBtn = document.getElementById('export-excel-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToExcel);
    }

    const tableToMindmapBtn = document.getElementById('table-to-mindmap-btn');
    if (tableToMindmapBtn) {
        tableToMindmapBtn.addEventListener('click', function () {
        if (typeof tcExportExcelFromFab === 'function') tcExportExcelFromFab();
        else if (typeof convertTableToMindmap === 'function') convertTableToMindmap();
    });
    }
    initTcViewConvertModalUi();
    
    const tableColumnSettingsBtn = document.getElementById('table-column-settings-btn');
    if (tableColumnSettingsBtn) {
        tableColumnSettingsBtn.addEventListener('click', openColumnSettingsModal);
    }

    // 初始化渲染表头和内容
    renderTableHeader();
    renderColumnHeaderTags();
    initTcAutoRecoveryOnLeave();
    try {
        initTcRightViewUi();
    } catch (viewUiErr) {
        console.error('[TestHub] initTcRightViewUi failed:', viewUiErr);
    }
    initTcTemplateModalUi();
    initTcTableFabUi();
    initTcLeftFloatUi();
    initTcWorkbenchClickDelegate();
    syncTcHubAiChrome();
    syncTcTableTemplateChrome();
    if (typeof applyDrawerLayout === 'function') {
        applyDrawerLayout(getTcActiveDrawerNum());
    }
}

if (typeof window !== 'undefined') {
    window.switchTcRightView = switchTcRightView;
}

