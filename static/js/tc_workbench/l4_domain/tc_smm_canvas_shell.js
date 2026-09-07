/**
 * TestHub 用例工作台 — SMM 画布容器与实例初始化壳层（从 tc_simple_mindmap_editor 抽出，逻辑不变）
 */
(function (global) {
    'use strict';

    function cfg() {
        if (global.TcSmmRuntimeConfig && typeof global.TcSmmRuntimeConfig.get === 'function') {
            return global.TcSmmRuntimeConfig.get() || {};
        }
        return global.TC_SMM_RUNTIME_CONFIG || {};
    }

    function isContainerSized(el) {
        if (!el) return false;
        var w = el.offsetWidth || el.clientWidth;
        var h = el.offsetHeight || el.clientHeight;
        return w > 0 && h > 0;
    }

    function prepareContainerForInit(el) {
        if (!el) return false;
        if (isContainerSized(el)) return true;
        var panel = document.getElementById('tc-mindmap-view-panel');
        if (!panel || panel.classList.contains('hidden') || panel.getAttribute('aria-hidden') === 'true') {
            return false;
        }
        if (typeof document !== 'undefined' && document.body &&
            document.body.classList.contains('tc-right-view-table')) {
            return false;
        }
        var stage = el.closest ? el.closest('.tc-mindmap-stage') : null;
        var panelH = panel.offsetHeight || panel.clientHeight || 0;
        var panelW = panel.offsetWidth || panel.clientWidth || 0;
        if (panelH <= 0 && stage) {
            panelH = stage.offsetHeight || stage.clientHeight || 0;
        }
        if (panelW <= 0 && stage) {
            panelW = stage.offsetWidth || stage.clientWidth || 0;
        }
        var fallbackH = cfg().containerFallbackMinHeightPx != null ? cfg().containerFallbackMinHeightPx : 420;
        if (panelH > 0) {
            el.style.height = panelH + 'px';
            el.style.minHeight = panelH + 'px';
        } else {
            el.style.minHeight = fallbackH + 'px';
            el.style.height = fallbackH + 'px';
        }
        el.style.width = '100%';
        if (stage && panelH > 0) {
            stage.style.height = panelH + 'px';
            stage.style.minHeight = panelH + 'px';
        }
        void el.offsetHeight;
        return isContainerSized(el);
    }

    /**
     * @param {HTMLElement} el
     * @param {{ resolveInitialData: function(): *, customCheckEnableShortcut: function, beforeShortcutRun: function }} hooks
     */
    function buildMindMapCtorOptions(el, hooks) {
        hooks = hooks || {};
        var c = cfg();
        return {
            el: el,
            data: typeof hooks.resolveInitialData === 'function' ? hooks.resolveInitialData() : null,
            layout: c.layout,
            theme: c.theme,
            enableFreeDrag: c.enableFreeDrag,
            mousewheelAction: c.mousewheelAction,
            mousewheelZoomActionReverse: c.mousewheelZoomActionReverse,
            disableMouseWheelZoom: c.disableMouseWheelZoom,
            readonly: c.readonly,
            isShowCreateChildBtnIcon: c.isShowCreateChildBtnIcon,
            enableShortcutOnlyWhenMouseInSvg: c.enableShortcutOnlyWhenMouseInSvg,
            customCheckEnableShortcut: hooks.customCheckEnableShortcut,
            beforeShortcutRun: hooks.beforeShortcutRun
        };
    }

    function getZoomStepDelta() {
        var d = cfg().zoomStepDelta;
        return d != null ? d : 0.12;
    }

    function getZoomMinRatioDefault() {
        var d = cfg().zoomMinRatioDefault;
        return d != null ? d : 20;
    }

    function getZoomMaxRatioDefault() {
        var d = cfg().zoomMaxRatioDefault;
        return d != null ? d : 400;
    }

    function getZoomRatioDefaults() {
        return {
            minRatio: getZoomMinRatioDefault(),
            maxRatio: getZoomMaxRatioDefault()
        };
    }

    global.TcSmmCanvasShell = {
        isContainerSized: isContainerSized,
        prepareContainerForInit: prepareContainerForInit,
        buildMindMapCtorOptions: buildMindMapCtorOptions,
        buildMindMapOptions: buildMindMapCtorOptions,
        getZoomStepDelta: getZoomStepDelta,
        getZoomMinRatioDefault: getZoomMinRatioDefault,
        getZoomMaxRatioDefault: getZoomMaxRatioDefault,
        getZoomRatioDefaults: getZoomRatioDefaults
    };
})(typeof window !== 'undefined' ? window : this);
