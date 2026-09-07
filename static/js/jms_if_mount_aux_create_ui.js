/**
 * If 控制器挂载区 · 取样器 / 逻辑控制器 · 弹窗创建（保存后再写入 children）
 */
(function (global) {
    'use strict';

    var ROUTES = {
        debug_sampler: 'JmsTgDebugSamplerUi',
        random_controller: 'JmsTgRandomControllerUi',
        simple_controller: 'JmsTgSimpleControllerUi',
        transaction_controller: 'JmsTgTransactionControllerUi',
        loop_controller: 'JmsTgLoopControllerUi'
    };

    function openCreate(planId, tgId, ifStepId, auxType) {
        if (!auxType) return;
        var uiName = ROUTES[auxType];
        var ui = uiName ? global[uiName] : null;
        if (ui && typeof ui.openCreateForIfMount === 'function') {
            ui.openCreateForIfMount(planId, tgId, ifStepId);
        }
    }

    global.JmsIfMountAuxCreateUi = {
        openCreate: openCreate
    };
}(typeof window !== 'undefined' ? window : this));
