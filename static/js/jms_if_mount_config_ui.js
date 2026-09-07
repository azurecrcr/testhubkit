/**
 * If 控制器挂载区 · 配置元件
 */
(function (global) {
    'use strict';

    function openCreate(planId, tgId, ifStepId, type) {
        if (!type) return;
        if (global.JmsHttpStepConfigUi && typeof global.JmsHttpStepConfigUi.openCreateForIfMount === 'function') {
            global.JmsHttpStepConfigUi.openCreateForIfMount(planId, tgId, ifStepId, type);
        }
    }

    global.JmsIfMountConfigUi = {
        openCreate: openCreate
    };
}(typeof window !== 'undefined' ? window : this));
