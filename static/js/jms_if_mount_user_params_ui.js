/**
 * If 控制器挂载区 · 用户参数（复用 HTTP 弹窗，保存后写入 ifStep.user_parameters）
 */
(function (global) {
    'use strict';

    function openEdit(planId, tgId, ifStepId) {
        if (global.JmsHttpStepUserParamsUi && typeof global.JmsHttpStepUserParamsUi.openEditForIfMount === 'function') {
            global.JmsHttpStepUserParamsUi.openEditForIfMount(planId, tgId, ifStepId);
        }
    }

    global.JmsIfMountUserParamsUi = {
        openEdit: openEdit
    };
}(typeof window !== 'undefined' ? window : this));
