/**
 * JMX 导出 · 线程组内空壳/重复 HTTP 请求默认值去重（隔离模块）
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
        return !(p.domain || p.port || p.protocol || p.connect_timeout || p.response_timeout);
    }

    function richness(step) {
        var p = props(step);
        var n = 0;
        ['domain', 'port', 'protocol', 'path', 'connect_timeout', 'response_timeout', 'content_encoding'].forEach(function (k) {
            if (p[k]) n += 1;
        });
        return n;
    }

    function dedupeStepsArray(steps) {
        if (!Array.isArray(steps) || !steps.length) return steps;
        var httpDefaults = [];
        steps.forEach(function (s, idx) {
            if (s && s.alias === 'ConfigTestElement') httpDefaults.push({ idx: idx, step: s });
        });
        if (httpDefaults.length <= 1) return steps;
        var best = httpDefaults.reduce(function (a, b) {
            return richness(b.step) > richness(a.step) ? b : a;
        });
        var removeIdx = {};
        httpDefaults.forEach(function (row) {
            if (row.idx === best.idx) return;
            if (isEmptyHttpDefault(row.step) || richness(row.step) < richness(best.step)) {
                removeIdx[row.idx] = true;
            }
        });
        if (!Object.keys(removeIdx).length) return steps;
        return steps.filter(function (_s, idx) { return !removeIdx[idx]; });
    }

    function dedupeThreadGroup(tg) {
        if (!tg || !Array.isArray(tg.steps)) return tg;
        tg.steps = dedupeStepsArray(tg.steps);
        return tg;
    }

    function dedupeScenarioHttpDefaults(data) {
        if (!data) return data;
        (data.setup_thread_groups || []).forEach(dedupeThreadGroup);
        (data.thread_groups || []).forEach(dedupeThreadGroup);
        (data.post_thread_groups || []).forEach(dedupeThreadGroup);
        return data;
    }

    global.JmsCatalogHttpDefaultsDedupeV1 = {
        dedupeScenarioHttpDefaults: dedupeScenarioHttpDefaults,
        dedupeStepsArray: dedupeStepsArray
    };
}(typeof window !== 'undefined' ? window : this));
