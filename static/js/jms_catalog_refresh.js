/**
 * JMeter catalog · 添加后刷新步骤区（树形 / 卡片视图）
 */
(function (global) {
    'use strict';

    function sid(v) {
        return v == null ? '' : String(v);
    }

    function isPlanLevelCtx(insertCtx) {
        insertCtx = insertCtx || {};
        return !!(insertCtx.planLevel || insertCtx.context === 'test_plan');
    }

    function refreshStepsArea(vb, planId, tgId, insertCtx) {
        if (!vb) return;
        planId = sid(planId);
        tgId = sid(tgId);
        insertCtx = insertCtx || {};

        if (typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();

        if (isPlanLevelCtx(insertCtx) || !tgId) {
            if (typeof vb.triggerRender === 'function') vb.triggerRender();
            else if (typeof vb.scheduleRender === 'function') vb.scheduleRender();
            if (global.JmsPlanCatalogItemsUi && typeof global.JmsPlanCatalogItemsUi.syncNavPlanId === 'function') {
                global.JmsPlanCatalogItemsUi.syncNavPlanId(planId);
            }
            return;
        }

        var shell = global.JmsTgTreeShell;
        if (shell && typeof shell.refreshTgDetailByTgId === 'function') {
            if (shell.refreshTgDetailByTgId(planId, tgId)) return;
            if (typeof shell.syncAll === 'function') shell.syncAll(true);
            return;
        }

        if (typeof vb.triggerRender === 'function') vb.triggerRender();
        else if (typeof vb.scheduleRender === 'function') vb.scheduleRender();
    }

    global.JmsCatalogRefresh = {
        sid: sid,
        refreshStepsArea: refreshStepsArea
    };
})(window);
