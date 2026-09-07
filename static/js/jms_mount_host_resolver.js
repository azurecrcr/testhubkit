/**
 * 挂载宿主 · 统一步骤定位（HTTP / 逻辑控制器 / catalog 取样器，全树递归）
 */
(function (global) {
    'use strict';

    function sid(v) { return v == null ? '' : String(v); }

    function isCatalogSamplerMountHost(step) {
        if (!step || step.type !== 'catalog_element') return false;
        if (step.alias === 'DebugSampler') return true;
        return step.category === 'sampler' && !step.container;
    }

    function isLogicControllerMountHost(step) {
        return !!(step && step.type === 'catalog_element' && step.container && step.category === 'controller');
    }

    function isHttpMountHost(step) {
        return !!(step && step.method);
    }

    function isCatalogControllerMountHost(step) {
        return !!(step && step.type === 'catalog_element' && step.container);
    }

    function isMountHostStep(step) {
        return isLogicControllerMountHost(step) || isCatalogSamplerMountHost(step) ||
            isHttpMountHost(step) || isCatalogControllerMountHost(step);
    }

    function shouldRecurseChildren(step) {
        if (!step) return false;
        if (isLogicControllerMountHost(step)) return true;
        if (step.type === 'catalog_element' && step.container) return true;
        return false;
    }

    function findStepInTree(list, stepId) {
        if (!list || !stepId) return null;
        var want = sid(stepId);
        var i, s, nested;
        for (i = 0; i < list.length; i += 1) {
            s = list[i];
            if (!s) continue;
            if (sid(s.id) === want) return s;
            if (Array.isArray(s.children) && s.children.length && shouldRecurseChildren(s)) {
                nested = findStepInTree(s.children, stepId);
                if (nested) return nested;
            }
        }
        return null;
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var want = sid(tgId);
        var tg = (model.setup_thread_groups || []).find(function (t) { return t && sid(t.id) === want; });
        if (tg) return tg;
        var plan = (model.test_plans || []).find(function (p) { return p && sid(p.id) === sid(planId); });
        tg = plan && (plan.thread_groups || []).find(function (t) { return t && sid(t.id) === want; });
        if (tg) return tg;
        tg = (model.post_thread_groups || []).find(function (t) { return t && sid(t.id) === want; });
        if (tg) return tg;
        var i;
        for (i = 0; i < (model.test_plans || []).length; i += 1) {
            tg = (model.test_plans[i].thread_groups || []).find(function (t) { return t && sid(t.id) === want; });
            if (tg) return tg;
        }
        return null;
    }

    function findMountHostStep(model, planId, tgId, stepId) {
        var tg = findTg(model, planId, tgId);
        if (!tg || !stepId) return null;
        var step = findStepInTree(tg.steps, stepId);
        return isMountHostStep(step) ? step : null;
    }

    global.JmsMountHostResolver = {
        isCatalogSamplerMountHost: isCatalogSamplerMountHost,
        isCatalogControllerMountHost: isCatalogControllerMountHost,
        isLogicControllerMountHost: isLogicControllerMountHost,
        isHttpMountHost: isHttpMountHost,
        isMountHostStep: isMountHostStep,
        findStepInTree: findStepInTree,
        findTg: findTg,
        findMountHostStep: findMountHostStep
    };
})(window);
