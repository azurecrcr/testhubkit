/**
 * 逻辑控制器嵌套子步骤 · hashTree children 写入（隔离模块）
 * 修复：controllerMount 下 controller/sampler 误写入 catalog_hash_children 导致树区不展示
 */
(function (global) {
    'use strict';

    var TREE_CHILD_CATEGORIES = { controller: 1, sampler: 1 };

    function isTreeChild(step) {
        if (!step) return false;
        if (step.container) return true;
        var cat = step.category || '';
        return !!TREE_CHILD_CATEGORIES[cat];
    }

    function normalizeTreeCtx(ctx) {
        var treeCtx = Object.assign({}, ctx || {}, {
            context: 'controller',
            parentStepId: ctx && ctx.parentStepId ? ctx.parentStepId : null
        });
        delete treeCtx.controllerMount;
        delete treeCtx.httpMount;
        return treeCtx;
    }

    function append(vb, step, ctx) {
        if (!vb || !step || !ctx || !ctx.parentStepId) return null;
        var CA = global.JmsCatalogContextAppend;
        if (!CA || typeof CA.appendCatalogAtContext !== 'function') return null;
        var res = CA.appendCatalogAtContext(vb, step, normalizeTreeCtx(ctx));
        return res && res.ok ? res.step : null;
    }

    global.JmsCatalogControllerTreeChildAppend = {
        isTreeChild: isTreeChild,
        append: append,
        normalizeTreeCtx: normalizeTreeCtx
    };
})(window);
