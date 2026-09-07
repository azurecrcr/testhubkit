/**
 * 线程组监听器 · Backend Listener 改走 catalog 元件编辑器（替代 JmsTgBackendListenerUi）
 */
(function (global) {
    'use strict';

    function vb() { return global.JmsVisualBuilder; }
    function editor() { return global.JmsCatalogElementEditorUi; }

    function findPlan(model, planId) {
        return (model.test_plans || []).find(function (p) {
            return p && String(p.id) === String(planId);
        });
    }

    function findTg(model, planId, tgId) {
        var plan = findPlan(model, planId);
        if (!plan) return null;
        return (plan.thread_groups || []).find(function (t) {
            return t && String(t.id) === String(tgId);
        });
    }

    function walkSteps(list, fn) {
        (list || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
        });
    }

    function findListenerCatalogStep(tg, alias) {
        var found = null;
        walkSteps(tg && tg.steps, function (s) {
            if (found) return;
            if (s.type === 'catalog_element' && s.alias === alias) found = s;
        });
        return found;
    }

    function uid() {
        return 'cat_' + Math.random().toString(36).slice(2, 10);
    }

    function buildBackendListenerStep(tg) {
        var B = global.JmsBackendListenerCatalog;
        var props = B && typeof B.normalizeConfig === 'function'
            ? B.normalizeConfig((tg && tg.backend_listener) || {})
            : ((tg && tg.backend_listener) || {});
        return {
            id: uid(),
            type: 'catalog_element',
            name: props.name || 'InfluxDB Backend Listener',
            enabled: props.enabled !== false,
            alias: 'BackendListener',
            testclass: 'BackendListener',
            guiclass: 'BackendListenerGui',
            category: 'listener',
            label_zh: 'InfluxDB Backend Listener',
            container: false,
            scope: 'unified',
            catalog_props: props,
            jmx_fragment: ''
        };
    }

    function ensureBackendListenerStep(planId, tgId) {
        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return null;
        var tg = findTg(visual.getModel(), planId, tgId);
        if (!tg) return null;
        var step = findListenerCatalogStep(tg, 'BackendListener');
        if (step) return step;
        step = buildBackendListenerStep(tg);
        if (!Array.isArray(tg.steps)) tg.steps = [];
        tg.steps.unshift(step);
        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        if (typeof visual.triggerRender === 'function') visual.triggerRender();
        return step;
    }

    function openBackendListenerEditor(planId, tgId) {
        var Ed = editor();
        if (!Ed || typeof Ed.openForStep !== 'function') return false;
        var step = ensureBackendListenerStep(planId, tgId);
        if (!step) return false;
        Ed.openForStep(planId, tgId, step, null);
        return true;
    }

    function openEditor(planId, tgId, listenerKey) {
        if (listenerKey !== 'backend_listener') return false;
        return openBackendListenerEditor(planId, tgId);
    }

    global.JmsTgListenerCatalogBridge = {
        openEditor: openEditor,
        openBackendListenerEditor: openBackendListenerEditor,
        ensureBackendListenerStep: ensureBackendListenerStep
    };
})(typeof window !== 'undefined' ? window : this);
