/**
 * If 控制器挂载区 · 监听器 · 弹窗配置（保存后再启用）
 */
(function (global) {
    'use strict';

    function openCreate(planId, tgId, ifStepId, listenerType) {
        var B = global.JmsMountCatalogBridge;
        if (B && typeof B.openCreateMountAux === 'function') {
            B.openCreateMountAux(planId, tgId, ifStepId, listenerType);
        }
    }

    global.JmsIfMountListenerUi = {
        openCreate: openCreate
    };
}(typeof window !== 'undefined' ? window : this));
