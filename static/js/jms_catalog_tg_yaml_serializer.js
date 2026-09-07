/**
 * Phase1 收尾 · 线程组 YAML 仅输出 catalog 字段（独立模块）
 */
(function (global) {
    'use strict';

    function numOr(v, d) {
        var n = Number(v);
        return isNaN(n) ? d : n;
    }

    function threadGroupToYaml(tg, helpers) {
        helpers = helpers || {};
        if (!tg) return {};
        var varsToObj = helpers.varsToObj || function () { return {}; };
        var stepsToYamlTree = helpers.stepsToYamlTree || function (s) { return s || []; };
        var appendTgAssertionsYaml = helpers.appendTgAssertionsYaml || function () {};

        var out = {
            name: tg.name,
            load: {
                users: numOr(tg.load && tg.load.users, 1),
                spawn_rate: numOr(tg.load && tg.load.spawn_rate, 1),
                duration_sec: numOr(tg.load && tg.load.duration_sec, 60),
                loops: tg.load && tg.load.loops !== undefined ? numOr(tg.load.loops, -1) : -1
            },
            variables: varsToObj(tg.variables),
            steps: stepsToYamlTree(tg.steps || [])
        };

        if (tg.processors && tg.processors.length) out.processors = tg.processors;
        if (tg.influx_scenario) {
            out.influxdb = { tags: { scenario: tg.influx_scenario } };
        }

        appendTgAssertionsYaml(out, tg);

        if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.applyYamlField === 'function') {
            global.JmsTgDisplayOrder.applyYamlField(out, tg);
        }
        return out;
    }

    global.JmsCatalogTgYamlSerializer = {
        threadGroupToYaml: threadGroupToYaml
    };
})(typeof window !== 'undefined' ? window : this);
