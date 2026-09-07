/**
 * 线程组断言 · 共享辅助（隔离模块，仅供 TG 断言 UI 使用）
 */
(function (global) {
    'use strict';

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findPlan(planId) {
        var model = getModel();
        if (!model || !planId) return null;
        return (model.test_plans || []).find(function (p) { return p.id === planId; }) || null;
    }

    function findTg(planId, tgId) {
        if (!tgId) return null;
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.findTg === 'function') {
            return vb.findTg(findPlan(planId), tgId);
        }
        var model = getModel();
        if (!model) return null;
        var plan = findPlan(planId);
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
            if (tg) return tg;
        }
        if (Array.isArray(model.setup_thread_groups)) {
            var stg = model.setup_thread_groups.find(function (t) { return t.id === tgId; });
            if (stg) return stg;
        }
        if (Array.isArray(model.post_thread_groups)) {
            return model.post_thread_groups.find(function (t) { return t.id === tgId; }) || null;
        }
        return null;
    }

    function ensureTgAssertions(tg) {
        if (!tg) return [];
        if (!Array.isArray(tg.assertions)) tg.assertions = [];
        return tg.assertions;
    }

    function markDirtyAndRefreshTg(planId, tgId) {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
        if (global.JmsTgTreeShell &&
            typeof global.JmsTgTreeShell.refreshTgDetailByTgId === 'function' &&
            tgId &&
            global.JmsTgTreeShell.refreshTgDetailByTgId(planId, tgId)) {
            return;
        }
        if (global.JmsTgAssertionUi &&
            typeof global.JmsTgAssertionUi.patchAssertionPanelInDom === 'function') {
            if (global.JmsTgAssertionUi.patchAssertionPanelInDom(planId)) return;
        }
        if (vb && typeof vb.scheduleRender === 'function') vb.scheduleRender();
    }

    global.JmsTgAssertHelpers = {
        getModel: getModel,
        findPlan: findPlan,
        findTg: findTg,
        ensureTgAssertions: ensureTgAssertions,
        markDirtyAndRefreshTg: markDirtyAndRefreshTg
    };
}(typeof window !== 'undefined' ? window : this));
