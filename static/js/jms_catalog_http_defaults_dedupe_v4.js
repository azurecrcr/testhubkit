/**
 * JMX 导出 HTTP 默认值去重 V4（export-only）
 */
(function (global) {
    'use strict';
    function propsOf(step) { return (step && step.catalog_props) || step || {}; }
    function isEmptyHttpDefault(step) {
        var S = global.JmsCatalogEmptyConfigSuppressV1;
        if (S && typeof S.isEmptyConfigStep === 'function') return S.isEmptyConfigStep(step);
        if (!step || step.alias !== 'ConfigTestElement') return false;
        var p = propsOf(step);
        return !(p.domain || p.port || p.protocol || p.path || p.connect_timeout || p.response_timeout);
    }
    function hasEffectiveHttpDefault(steps) {
        return (steps || []).some(function (s) { return s && s.alias === 'ConfigTestElement' && !isEmptyHttpDefault(s); });
    }
    function allHttpUseBaseUrl(steps) {
        var found = false, ok = true;
        function walk(list) {
            (list || []).forEach(function (s) {
                if (!s || !ok) return;
                if (s.alias === 'HTTPSamplerProxy' || s.type === 'http' || (s.catalog_props && s.catalog_props.method)) {
                    found = true;
                    var path = String((s.catalog_props && s.catalog_props.path) || s.path || '');
                    if (path.indexOf('${BASE_URL}') < 0 && !/^https?:\/\//i.test(path)) ok = false;
                }
                if (Array.isArray(s.children)) walk(s.children);
                if (Array.isArray(s.catalog_hash_children)) walk(s.catalog_hash_children);
            });
        }
        walk(steps);
        return found && ok;
    }
    function dedupeThreadGroup(tg, planHas) {
        if (!tg || !Array.isArray(tg.steps)) return tg;
        if (!hasEffectiveHttpDefault(tg.steps) && !planHas) return tg;
        if (!allHttpUseBaseUrl(tg.steps)) return tg;
        tg.steps = tg.steps.filter(function (s) {
            if (!s || s.alias !== 'ConfigTestElement') return true;
            return !isEmptyHttpDefault(s);
        });
        return tg;
    }
    function dedupeScenarioHttpDefaultsV4(data) {
        if (!data) return data;
        var V3 = global.JmsCatalogHttpDefaultsDedupeV3;
        if (V3 && typeof V3.dedupeScenarioHttpDefaultsV3 === 'function') data = V3.dedupeScenarioHttpDefaultsV3(data);
        var planHas = false;
        (data.plan_catalog_items || []).forEach(function (it) {
            if (it && it.alias === 'ConfigTestElement') {
                var p = propsOf(it);
                if (p.domain || p.protocol) planHas = true;
            }
        });
        (data.setup_thread_groups || []).forEach(function (tg) { dedupeThreadGroup(tg, planHas); });
        (data.thread_groups || []).forEach(function (tg) { dedupeThreadGroup(tg, planHas); });
        (data.post_thread_groups || []).forEach(function (tg) { dedupeThreadGroup(tg, planHas); });
        return data;
    }
    global.JmsCatalogHttpDefaultsDedupeV4 = { dedupeScenarioHttpDefaultsV4: dedupeScenarioHttpDefaultsV4, isEmptyHttpDefault: isEmptyHttpDefault };
}(typeof window !== 'undefined' ? window : this));
