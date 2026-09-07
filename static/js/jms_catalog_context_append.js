/**
 * JMeter catalog · 线程组 / 逻辑控制器层级写入（隔离模块，不修改 appendCatalogElementStep）
 */
(function (global) {
    'use strict';

    function sid(v) {
        return v == null ? '' : String(v);
    }

    function findPlan(model, planId) {
        if (!model || !planId) return null;
        var want = sid(planId);
        return (model.test_plans || []).filter(function (p) {
            return p && sid(p.id) === want;
        })[0] || null;
    }

    function findTgInPlan(plan, tgId) {
        if (!plan || !tgId) return null;
        var want = sid(tgId);
        return (plan.thread_groups || []).filter(function (t) {
            return t && sid(t.id) === want;
        })[0] || null;
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var want = sid(tgId);

        var plan = findPlan(model, planId);
        var tg = plan ? findTgInPlan(plan, tgId) : null;
        if (tg) return tg;

        var plans = model.test_plans || [];
        for (var pi = 0; pi < plans.length; pi += 1) {
            tg = findTgInPlan(plans[pi], tgId);
            if (tg) return tg;
        }

        tg = (model.setup_thread_groups || []).filter(function (t) {
            return t && sid(t.id) === want;
        })[0];
        if (tg) return tg;

        return (model.post_thread_groups || []).filter(function (t) {
            return t && sid(t.id) === want;
        })[0] || null;
    }

    function resolvePlanTg(vb, planId, tgId) {
        if (typeof vb.readModelFromDom === 'function') vb.readModelFromDom();
        var model = vb.getModel();
        if (!model) return { model: null, plan: null, tg: null };

        var tg = findTg(model, planId, tgId);
        var plan = findPlan(model, planId);
        if (!plan && tg) {
            var plans = model.test_plans || [];
            for (var i = 0; i < plans.length; i += 1) {
                if (findTgInPlan(plans[i], tgId)) {
                    plan = plans[i];
                    planId = plan.id;
                    break;
                }
            }
        }
        if (!tg && typeof vb.resolveActiveThreadGroupContext === 'function') {
            var active = vb.resolveActiveThreadGroupContext();
            if (active && sid(active.tgId) === sid(tgId)) {
                plan = findPlan(model, active.planId) || plan;
                tg = findTg(model, active.planId, active.tgId);
                if (tg) {
                    planId = active.planId;
                    tgId = active.tgId;
                }
            } else if (active && !tgId) {
                tg = findTg(model, active.planId, active.tgId);
                if (tg) {
                    planId = active.planId;
                    tgId = active.tgId;
                }
            }
        }

        return { model: model, plan: plan, tg: tg, planId: planId, tgId: tgId };
    }

    function isCatalogContainer(step) {
        return !!(step && step.type === 'catalog_element' && step.container);
    }

    function isLogicContainer(step) {
        if (!step) return false;
        var IC = global.JmsInsertContextV2;
        if (IC && typeof IC.isContainer === 'function') return IC.isContainer(step);
        var types = ['if_controller', 'random_controller', 'simple_controller', 'transaction_controller', 'loop_controller'];
        return types.indexOf(step.type) >= 0 || isCatalogContainer(step);
    }

    function findStepInList(list, stepId) {
        if (!list || !stepId) return null;
        var want = sid(stepId);
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (sid(s.id) === want) return s;
            if (Array.isArray(s.children)) {
                var nested = findStepInList(s.children, stepId);
                if (nested) return nested;
            }
        }
        return null;
    }

    function resolveTargetList(tg, insertCtx) {
        insertCtx = insertCtx || {};
        var ctx = insertCtx.context;
        if (ctx === 'sampler' || ctx === 'sampler_child') return { error: 'sampler_context' };

        if (ctx === 'controller') {
            var parentId = insertCtx.parentStepId;
            if (!parentId) return { error: 'no_parent' };
            var parent = findStepInList(tg.steps, parentId);
            if (!parent) return { error: 'parent_not_found' };
            if (!isLogicContainer(parent)) return { error: 'parent_not_container' };
            if (!parent.children) parent.children = [];
            return { list: parent.children, host: parent, mount: 'controller_child' };
        }

        if (!tg.steps) tg.steps = [];
        return { list: tg.steps, host: tg, mount: 'thread_group' };
    }

    function appendCatalogAtContext(vb, stepData, insertCtx) {
        if (!vb || !stepData || !insertCtx) return { ok: false, error: 'bad_args' };
        if (insertCtx.context === 'sampler' || insertCtx.context === 'sampler_child') {
            return { ok: false, error: 'sampler_context' };
        }

        var loc = resolvePlanTg(vb, insertCtx.planId, insertCtx.tgId);
        if (!loc.tg) return { ok: false, error: 'no_tg' };

        var target = resolveTargetList(loc.tg, insertCtx);
        if (target.error) return { ok: false, error: target.error };

        var item = Object.assign({}, stepData);
        if (!item.id) item.id = 'cat_' + Math.random().toString(36).slice(2, 10);
        if (item.container && !Array.isArray(item.children)) item.children = [];

        target.list.push(item);
        if (typeof vb.notifyUserEdit === 'function') vb.notifyUserEdit();

        return {
            ok: true,
            step: item,
            planId: loc.planId,
            tgId: loc.tgId,
            mount: target.mount
        };
    }

    global.JmsCatalogContextAppend = {
        appendCatalogAtContext: appendCatalogAtContext,
        findStepInList: findStepInList,
        findTg: findTg,
        findPlan: findPlan,
        resolvePlanTg: resolvePlanTg,
        isLogicContainer: isLogicContainer,
        sid: sid
    };
})(window);
