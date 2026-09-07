/**
 * If 控制器挂载区 · BeanShell 前置处理器
 */
(function (global) {
    'use strict';

    function openCreate(planId, tgId, ifStepId) {
        if (global.JmsHttpBeanshellPreProcessorUi &&
            typeof global.JmsHttpBeanshellPreProcessorUi.openCreateForIfMount === 'function') {
            global.JmsHttpBeanshellPreProcessorUi.openCreateForIfMount(planId, tgId, ifStepId);
        }
    }

    global.JmsIfMountBeanshellPreUi = {
        openCreate: openCreate
    };
}(typeof window !== 'undefined' ? window : this));
