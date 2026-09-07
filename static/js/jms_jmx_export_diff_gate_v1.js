/**
 * JMX 导出退化门禁 V1（export-only）
 */
(function (global) {
    'use strict';
    var BASELINE = { http_sampler_min: 1, plan_args_standalone: 0, empty_http_defaults_max: 0 };
    function check(jmx) {
        if (!jmx) return { ok: true };
        var http = (jmx.match(/testclass="HTTPSamplerProxy"/g) || []).length;
        var planArgs = (jmx.match(/testname="计划变量"/g) || []).length;
        var empty = 0;
        var re = /<ConfigTestElement guiclass="HttpDefaultsGui"[\s\S]*?<\/ConfigTestElement>/g, m;
        while ((m = re.exec(jmx)) !== null) if (!/HTTPSampler\.(domain|port|protocol)/.test(m[0])) empty++;
        var ok = http >= BASELINE.http_sampler_min && planArgs <= BASELINE.plan_args_standalone && empty <= BASELINE.empty_http_defaults_max;
        return { ok: ok, http: http, planArgs: planArgs, emptyHttp: empty };
    }
    global.JmsJmxExportDiffGateV1 = { check: check, BASELINE: BASELINE };
}(typeof window !== 'undefined' ? window : this));
