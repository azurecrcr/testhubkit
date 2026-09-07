/**
 * JMeter Studio V2 · 插入上下文解析（hashTree 语义，隔离模块）
 */
(function (global) {
    'use strict';

    function findStepInList(list, stepId) {
        if (!list || !stepId) return null;
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (String(s.id) === String(stepId)) return s;
            if (Array.isArray(s.children)) {
                var n = findStepInList(s.children, stepId);
                if (n) return n;
            }
        }
        return null;
    }

    var LOGIC_TYPES = ['if_controller', 'random_controller', 'simple_controller', 'transaction_controller', 'loop_controller'];

    function isLogicContainer(step) {
        if (isCatalogContainer(step)) return true;
        return step && LOGIC_TYPES.indexOf(step.type) >= 0;
    }

    function isCatalogContainer(step) {
        return !!(step && step.type === 'catalog_element' && step.container);
    }

    function isContainer(step) {
        return isLogicContainer(step) || isCatalogContainer(step);
    }

    function isHttpSampler(step) {
        if (step && step.type === 'catalog_element' && step.alias === 'HTTPSamplerProxy') return true;
        return !!(step && step.method && !step.type);
    }

    function isDebugSampler(step) {
        return step && step.type === 'debug_sampler';
    }

    function isSamplerStep(step) {
        return isHttpSampler(step) || isDebugSampler(step) || (step && step.type === 'catalog_element' && step.category === 'sampler');
    }

    function getActiveTg(vb) {
        if (!vb || typeof vb.resolveActiveThreadGroupContext !== 'function') return null;
        var tgCtx = vb.resolveActiveThreadGroupContext();
        if (!tgCtx) return null;
        var model = vb.getModel && vb.getModel();
        if (!model) return tgCtx;
        var plan = (model.test_plans || []).filter(function (p) { return p.id === tgCtx.planId; })[0];
        var tg = [].concat(
            plan ? (plan.thread_groups || []) : [],
            model.setup_thread_groups || [],
            model.post_thread_groups || []
        ).filter(function (t) { return t && t.id === tgCtx.tgId; })[0];
        return { planId: tgCtx.planId, tgId: tgCtx.tgId, tg: tg, tgName: tgCtx.tgName };
    }

    function getSelectedStepId() {
        var node = global.document.querySelector(
            '.jms-tree-node.is-selected[data-step-id], .jms-if-card.is-selected[data-step-id], ' +
            '.jms-random-card.is-selected[data-step-id], .jms-simple-card.is-selected[data-step-id], ' +
            '.jms-transaction-card.is-selected[data-step-id], .jms-loop-card.is-selected[data-step-id], ' +
            '.jms-catalog-card.is-selected[data-step-id], .jms-http-card.is-selected[data-step-id]'
        );
        return node ? (node.getAttribute('data-step-id') || '') : '';
    }

    function resolve(vb) {
        var base = {
            context: 'thread_group',
            label: '线程组',
            planId: null,
            tgId: null,
            parentStepId: null,
            selectedStep: null
        };
        var active = getActiveTg(vb);
        if (!active) {
            base.context = 'test_plan';
            base.label = '测试计划';
            return base;
        }
        base.planId = active.planId;
        base.tgId = active.tgId;
        var stepId = getSelectedStepId();
        if (!stepId || !active.tg) return base;
        var step = findStepInList(active.tg.steps, stepId);
        if (!step) return base;
        base.selectedStep = step;
        if (isContainer(step)) {
            base.context = 'controller';
            base.parentStepId = step.id;
            base.label = step.name || '逻辑控制器';
            return base;
        }
        if (isSamplerStep(step)) {
            base.context = 'sampler_child';
            base.parentStepId = step.id;
            base.label = step.name || '取样器';
            return base;
        }
        return base;
    }

    global.JmsInsertContextV2 = {
        resolve: resolve,
        isContainer: isContainer,
        isSamplerStep: isSamplerStep,
        findStepInList: findStepInList
    };
})(window);
