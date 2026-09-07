/**
 * JMX 导出 · HTTP 请求默认值去重 V2（删除空壳 ConfigTestElement，隔离模块）
 */
(function (global) {
    'use strict';

    function props(step) {
        return (step && step.catalog_props) || {};
    }

    function isEmptyHttpDefault(step) {
        var S = global.JmsCatalogEmptyConfigSuppressV1;
        if (S && typeof S.isEmptyConfigStep === 'function') return S.isEmptyConfigStep(step);
        if (!step || step.alias !== 'ConfigTestElement') return false;
        var p = props(step);
        return !(p.domain || p.port || p.protocol || p.connect_timeout || p.response_timeout || p.path);
    }

    function removeEmptyFromSteps(steps) {
        if (!Array.isArray(steps)) return steps;
        return steps.filter(function (s) {
            if (!s || s.alias !== 'ConfigTestElement') return true;
            return !isEmptyHttpDefault(s);
        });
    }

    function dedupeThreadGroup(tg) {
        if (!tg || !Array.isArray(tg.steps)) return tg;
        tg.steps = removeEmptyFromSteps(tg.steps);
        return tg;
    }

    function dedupeScenarioHttpDefaultsV2(data) {
        if (!data) return data;
        var V1 = global.JmsCatalogHttpDefaultsDedupeV1;
        if (V1 && typeof V1.dedupeScenarioHttpDefaults === 'function') {
            data = V1.dedupeScenarioHttpDefaults(data);
        }
        (data.setup_thread_groups || []).forEach(dedupeThreadGroup);
        (data.thread_groups || []).forEach(dedupeThreadGroup);
        (data.post_thread_groups || []).forEach(dedupeThreadGroup);
        return data;
    }

    global.JmsCatalogHttpDefaultsDedupeV2 = {
        isEmptyHttpDefault: isEmptyHttpDefault,
        dedupeScenarioHttpDefaultsV2: dedupeScenarioHttpDefaultsV2
    };
}(typeof window !== 'undefined' ? window : this));
