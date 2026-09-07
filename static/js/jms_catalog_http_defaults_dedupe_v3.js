/**
 * JMX 导出 · HTTP 默认值去重 V3（隔离模块）
 */
(function (global) {
    'use strict';
    function isEmptyHttpDefault(step) {
        var S = global.JmsCatalogEmptyConfigSuppressV1;
        if (S && typeof S.isEmptyConfigStep === 'function') return S.isEmptyConfigStep(step);
        if (!step || step.alias !== 'ConfigTestElement') return false;
        var p = (step && step.catalog_props) || {};
        return !(p.domain || p.port || p.protocol || p.connect_timeout || p.response_timeout || p.path);
    }
    function hasEffectiveHttpDefault(steps) {
        return (steps || []).some(function (s) {
            return s && s.alias === 'ConfigTestElement' && !isEmptyHttpDefault(s);
        });
    }
    function allHttpUseBaseUrl(steps) {
        var found = false;
        function walk(list) {
            (list || []).forEach(function (s) {
                if (!s) return;
                if (s.alias === 'HTTPSamplerProxy' || s.type === 'http' || (s.catalog_props && s.catalog_props.method)) {
                    found = true;
                    var path = String((s.catalog_props && s.catalog_props.path) || s.path || '');
                    if (path.indexOf('${BASE_URL}') < 0 && !/^https?:\/\//i.test(path)) return false;
                }
                if (Array.isArray(s.children)) walk(s.children);
                if (Array.isArray(s.catalog_hash_children)) walk(s.catalog_hash_children);
            });
        }
        walk(steps);
        return found;
    }
    function dedupeThreadGroup(tg, planHasDefaults) {
        if (!tg || !Array.isArray(tg.steps)) return tg;
        var hasEffective = hasEffectiveHttpDefault(tg.steps) || planHasDefaults;
        if (!hasEffective) return tg;
        if (!allHttpUseBaseUrl(tg.steps)) return tg;
        tg.steps = tg.steps.filter(function (s) {
            if (!s || s.alias !== 'ConfigTestElement') return true;
            return !isEmptyHttpDefault(s);
        });
        return tg;
    }
    function dedupeScenarioHttpDefaultsV3(data) {
        if (!data) return data;
        var V2 = global.JmsCatalogHttpDefaultsDedupeV2;
        if (V2 && typeof V2.dedupeScenarioHttpDefaultsV2 === 'function') {
            data = V2.dedupeScenarioHttpDefaultsV2(data);
        }
        var planHas = false;
        (data.plan_catalog_items || []).forEach(function (it) {
            if (it && it.alias === 'ConfigTestElement') {
                var p = it.catalog_props || {};
                if (p.domain || p.protocol) planHas = true;
            }
        });
        (data.setup_thread_groups || []).forEach(function (tg) { dedupeThreadGroup(tg, planHas); });
        (data.thread_groups || []).forEach(function (tg) { dedupeThreadGroup(tg, planHas); });
        (data.post_thread_groups || []).forEach(function (tg) { dedupeThreadGroup(tg, planHas); });
        return data;
    }
    global.JmsCatalogHttpDefaultsDedupeV3 = {
        dedupeScenarioHttpDefaultsV3: dedupeScenarioHttpDefaultsV3
    };
}(typeof window !== 'undefined' ? window : this));
