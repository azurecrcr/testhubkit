/**
 * TestHub 用例工作台 — Simple Mind Map 画布静态配置（仅参数，不含业务逻辑）
 * 后续优化画布行为请优先改本文件。
 */
(function (global) {
    'use strict';

    var TC_SMM_RUNTIME_CONFIG = {
        layout: 'logicalStructure',
        theme: 'classic4',
        enableFreeDrag: true,
        mousewheelAction: 'move',
        mousewheelZoomActionReverse: false,
        disableMouseWheelZoom: true,
        readonly: false,
        isShowCreateChildBtnIcon: true,
        enableShortcutOnlyWhenMouseInSvg: false,
        containerFallbackMinHeightPx: 420,
        zoomStepDelta: 0.12,
        zoomMinRatioDefault: 20,
        zoomMaxRatioDefault: 400
    };

    function getTcSmmRuntimeConfig() {
        return TC_SMM_RUNTIME_CONFIG;
    }

    global.TC_SMM_RUNTIME_CONFIG = TC_SMM_RUNTIME_CONFIG;
    global.TcSmmRuntimeConfig = {
        get: getTcSmmRuntimeConfig
    };
})(typeof window !== 'undefined' ? window : this);
