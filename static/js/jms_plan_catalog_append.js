/**
 * JMeter 测试计划级 catalog_element 写入（隔离模块，不影响线程组 appendCatalogAtContext）
 */
(function (global) {
    'use strict';

    function sid(v) {
        return v == null ? '' : String(v);
    }

    function ensureItems(model) {
        if (!model) return [];
        if (!Array.isArray(model.plan_catalog_items)) model.plan_catalog_items = [];
        return model.plan_catalog_items;
    }

    function findPlanCatalogItem(model, stepId) {
        if (!model || !stepId) return { step: null, list: null, index: -1 };
        var list = ensureItems(model);
        var want = sid(stepId);
        for (var i = 0; i < list.length; i += 1) {
            if (list[i] && sid(list[i].id) === want) {
                return { step: list[i], list: list, index: i };
            }
        }
        return { step: null, list: list, index: -1 };
    }

    function appendPlanCatalogItem(vb, stepData, insertCtx) {
        if (!vb || !stepData || !insertCtx) return { ok: false, error: 'bad_args' };
        if (insertCtx.context !== 'test_plan') return { ok: false, error: 'not_plan_context' };
        if (!insertCtx.planId) return { ok: false, error: 'no_plan' };

        if (typeof vb.readModelFromDom === 'function') vb.readModelFromDom();
        var model = typeof vb.getModel === 'function' ? vb.getModel() : null;
        if (!model) return { ok: false, error: 'no_model' };

        var list = ensureItems(model);
        var item = Object.assign({}, stepData);
        if (!item.id) item.id = 'pcat_' + Math.random().toString(36).slice(2, 10);
        if (item.container && !Array.isArray(item.children)) item.children = [];

        list.push(item);
        if (typeof vb.notifyUserEdit === 'function') vb.notifyUserEdit();

        return {
            ok: true,
            step: item,
            planId: insertCtx.planId,
            tgId: null,
            mount: 'test_plan'
        };
    }

    function removePlanCatalogItem(vb, stepId) {
        if (!vb || !stepId) return false;
        var model = typeof vb.getModel === 'function' ? vb.getModel() : null;
        if (!model) return false;
        var loc = findPlanCatalogItem(model, stepId);
        if (!loc.list || loc.index < 0) return false;
        loc.list.splice(loc.index, 1);
        if (typeof vb.notifyUserEdit === 'function') vb.notifyUserEdit();
        return true;
    }

    global.JmsPlanCatalogAppend = {
        ensureItems: ensureItems,
        appendPlanCatalogItem: appendPlanCatalogItem,
        findPlanCatalogItem: findPlanCatalogItem,
        removePlanCatalogItem: removePlanCatalogItem,
        sid: sid
    };
})(typeof window !== 'undefined' ? window : this);
