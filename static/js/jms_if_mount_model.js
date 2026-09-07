/**
 * If 控制器 · 挂载区数据模型（隔离模块 · 不影响 HTTP 步骤模型）
 */
(function (global) {
    'use strict';

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findTgInPlan(plan, tgId) {
        if (!plan || !tgId) return null;
        var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
        return tg || null;
    }

    function findTg(planId, tgId) {
        var m = getModel();
        if (!m || !tgId) return null;
        var tg = (m.setup_thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        var plan = (m.test_plans || []).find(function (p) { return p.id === planId; });
        tg = findTgInPlan(plan, tgId);
        if (tg) return tg;
        tg = (m.post_thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        var i;
        for (i = 0; i < (m.test_plans || []).length; i++) {
            tg = findTgInPlan(m.test_plans[i], tgId);
            if (tg) return tg;
        }
        return null;
    }

    /** 与 jmeter_visual_builder.isLogicContainerStep 对齐（隔离副本，不依赖未导出 API） */
    function isCatalogContainerStepForMount(st) {
        return !!(st && st.type === 'catalog_element' && st.container);
    }

    function isLogicContainerStepForMount(st) {
        if (!st || !st.type) return false;
        return st.type === 'if_controller' ||
            st.type === 'random_controller' ||
            st.type === 'simple_controller' ||
            st.type === 'transaction_controller' ||
            st.type === 'loop_controller' ||
            isCatalogContainerStepForMount(st);
    }

    function findStepInList(list, stepId) {
        if (!list || !stepId) return null;
        var i;
        for (i = 0; i < list.length; i++) {
            var s = list[i];
            if (!s) continue;
            if (s.id === stepId) return s;
            if (isLogicContainerStepForMount(s) && s.children) {
                var nested = findStepInList(s.children, stepId);
                if (nested) return nested;
            }
        }
        return null;
    }

    function isCatalogSamplerMountHost(step) {
        if (global.JmsMountHostResolver && typeof global.JmsMountHostResolver.isCatalogSamplerMountHost === 'function') {
            return global.JmsMountHostResolver.isCatalogSamplerMountHost(step);
        }
        if (!step || step.type !== 'catalog_element') return false;
        if (step.alias === 'DebugSampler') return true;
        return step.category === 'sampler' && !step.container;
    }

    function isLogicMountHost(step) {
        if (global.JmsMountHostResolver && typeof global.JmsMountHostResolver.isMountHostStep === 'function') {
            return global.JmsMountHostResolver.isMountHostStep(step);
        }
        return !!(step && (step.type === 'if_controller' || step.type === 'random_controller' || step.type === 'simple_controller' || step.type === 'transaction_controller' || step.type === 'loop_controller' || isCatalogSamplerMountHost(step)));
    }

    function findLogicMountStep(planId, tgId, stepId) {
        var tg = findTg(planId, tgId);
        if (!tg || !stepId) return null;
        var step = findStepInList(tg.steps, stepId);
        return isLogicMountHost(step) ? step : null;
    }

    function findIfStep(planId, tgId, ifStepId) {
        var tg = findTg(planId, tgId);
        if (!tg || !ifStepId) return null;
        var step = findStepInList(tg.steps, ifStepId);
        return step && step.type === 'if_controller' ? step : null;
    }

    function defaultConstantTimer() {
        return { enabled: false, name: '固定定时器', comments: '', delay_ms: 300 };
    }

    function defaultUserParameters() {
        return { enabled: false, per_iteration: false, params: [] };
    }

    function defaultStepListeners() {
        return { view_results_tree: false, aggregate_report: false, backend_listener: false };
    }

    function removeMountTimelineKey(ifStep, key) {
        if (!ifStep || !key || !Array.isArray(ifStep.mount_timeline_keys)) return;
        ifStep.mount_timeline_keys = ifStep.mount_timeline_keys.filter(function (k) { return k !== key; });
    }

    function isBlankConstantTimer(t) {
        if (!t || typeof t !== 'object') return true;
        if (t.enabled === false) return false;
        if (t.enabled === true) return false;
        if (String(t.comments || '').trim()) return false;
        if (String(t.name || '').trim() && t.name !== '固定定时器') return false;
        if (t.delay_ms != null && Number(t.delay_ms) !== 300) return false;
        return true;
    }

    function isBlankUserParameters(up) {
        if (!up || typeof up !== 'object') return true;
        if (up.enabled === true) return false;
        if (up.per_iteration === true) return false;
        if (String(up.name || '').trim()) return false;
        if (String(up.comments || '').trim()) return false;
        if (Array.isArray(up.params) && up.params.some(function (p) { return p && String(p.key || '').trim(); })) {
            return false;
        }
        return true;
    }

    function isConstantTimerVisible(ifStep) {
        return !!(ifStep && ifStep.constant_timer && !isBlankConstantTimer(ifStep.constant_timer));
    }

    function isUserParametersVisible(ifStep) {
        return !!(ifStep && ifStep.user_parameters && !isBlankUserParameters(ifStep.user_parameters));
    }

    function pruneBlankMountSlots(ifStep) {
        if (!ifStep) return;
        if (isBlankConstantTimer(ifStep.constant_timer)) {
            delete ifStep.constant_timer;
            removeMountTimelineKey(ifStep, 'iftimer:constant');
        }
        if (isBlankUserParameters(ifStep.user_parameters)) {
            delete ifStep.user_parameters;
            removeMountTimelineKey(ifStep, 'ifpre:user_parameters');
        }
    }

    function ensureMountFields(ifStep) {
        if (!ifStep) return null;
        if (!Array.isArray(ifStep.children)) ifStep.children = [];
        if (!Array.isArray(ifStep.processors)) ifStep.processors = [];
        if (!Array.isArray(ifStep.pre_processors)) ifStep.pre_processors = [];
        if (!Array.isArray(ifStep.assertions)) ifStep.assertions = [];
        if (!Array.isArray(ifStep.http_managers)) ifStep.http_managers = [];
        if (!Array.isArray(ifStep.step_listener_items)) ifStep.step_listener_items = [];
        if (!ifStep.step_listeners) ifStep.step_listeners = defaultStepListeners();
        if (!Array.isArray(ifStep.mount_timeline_keys)) ifStep.mount_timeline_keys = [];
        pruneBlankMountSlots(ifStep);
        return ifStep;
    }

    function markDirty(planId, tgId, ifStepId) {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
        if (global.JmsTgIfMountRefresh &&
            typeof global.JmsTgIfMountRefresh.markDirtyAndRefresh === 'function') {
            global.JmsTgIfMountRefresh.markDirtyAndRefresh(planId, tgId, ifStepId);
            return;
        }
        if (vb && typeof vb.scheduleRender === 'function') vb.scheduleRender();
    }

    function findMountHostStep(planId, tgId, stepId) {
        if (global.JmsMountHostResolver && typeof global.JmsMountHostResolver.findMountHostStep === 'function') {
            return global.JmsMountHostResolver.findMountHostStep(getModel(), planId, tgId, stepId);
        }
        return findLogicMountStep(planId, tgId, stepId);
    }

    global.JmsIfMountModel = {
        findTg: findTg,
        isCatalogSamplerMountHost: isCatalogSamplerMountHost,
        isLogicMountHost: isLogicMountHost,
        findMountHostStep: findMountHostStep,
        findLogicMountStep: findLogicMountStep,
        findIfStep: findIfStep,
        findStepInList: findStepInList,
        ensureMountFields: ensureMountFields,
        isConstantTimerVisible: isConstantTimerVisible,
        isUserParametersVisible: isUserParametersVisible,
        isBlankConstantTimer: isBlankConstantTimer,
        isBlankUserParameters: isBlankUserParameters,
        defaultConstantTimer: defaultConstantTimer,
        defaultUserParameters: defaultUserParameters,
        defaultStepListeners: defaultStepListeners,
        markDirty: markDirty
    };
}(typeof window !== 'undefined' ? window : this));
