/**
 * JMX 导出自检 V4（隔离模块）
 */
(function (global) {
    'use strict';
    var JMETER_BUILTIN = {
        __P: true, __property: true, __time: true, __threadNum: true, __machineName: true,
        __javaScript: true, __groovy: true, __Random: true, __UUID: true, __BeanShell: true
    };
    var REQUIRED_PLAN_VARS = ['BASE_URL', 'BUILD_ID', 'GLOBAL_CHANNEL', 'ORDER_BUILD'];
    function isDemoScenario(data) {
        var n = data && data.name ? String(data.name) : '';
        return n.indexOf('全元件') >= 0 || n.indexOf('压测全景') >= 0;
    }
    function collectDefinedFromJmx(jmx) {
        var d = {};
        var argRe = /<stringProp name="Argument.name">([^<]*)<\/stringProp>\s*<stringProp name="Argument.value">/g;
        var m;
        while ((m = argRe.exec(jmx)) !== null) d[m[1]] = true;
        var csvRe = /<stringProp name="variableNames">([^<]*)<\/stringProp>/g;
        while ((m = csvRe.exec(jmx)) !== null) {
            String(m[1]).split(',').forEach(function (v) { v = v.trim(); if (v) d[v] = true; });
        }
        var jsonRe = /<stringProp name="JSONPostProcessor.referenceNames">([^<]*)<\/stringProp>/g;
        while ((m = jsonRe.exec(jmx)) !== null) {
            String(m[1]).split(',').forEach(function (v) { v = v.trim(); if (v) d[v] = true; });
        }
        var ctrRe = /<stringProp name="CounterConfig.name">([^<]*)<\/stringProp>/g;
        while ((m = ctrRe.exec(jmx)) !== null) d[m[1]] = true;
        return d;
    }
    function collectRefsFromJmx(jmx) {
        var refs = {};
        var re = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
        var m;
        while ((m = re.exec(jmx)) !== null) {
            if (m[1] && !JMETER_BUILTIN[m[1]]) refs[m[1]] = true;
        }
        return Object.keys(refs);
    }
    function runV4(scenario, jmx, opts) {
        opts = opts || {};
        var base = null;
        if (global.JmsJmxExportSelfCheckV3 && typeof global.JmsJmxExportSelfCheckV3.run === 'function') {
            base = global.JmsJmxExportSelfCheckV3.run(scenario, jmx, opts);
        } else {
            base = { ok: true, hard: 0, warn: 0, issues: [] };
        }
        var issues = (base.issues || []).slice();
        var hard = base.hard || 0;
        var warn = base.warn || 0;
        var demo = isDemoScenario(scenario);
        if (jmx) {
            if (/<Arguments[^>]*testname="[^"]*计划变量/i.test(jmx) &&
                jmx.indexOf('TestPlan.user_defined_variables') >= 0) {
                issues.push({ level: 'hard', msg: '计划变量双份：TestPlan 与独立 Arguments 重复' });
                hard += 1;
            }
            REQUIRED_PLAN_VARS.forEach(function (k) {
                var re = new RegExp('Argument.name">' + k + '</stringProp>[\\s\\S]*?Argument.value">([^<]*)</stringProp>');
                var m = jmx.match(re);
                if (!m && demo) {
                    issues.push({ level: 'hard', msg: 'TestPlan 缺少计划变量: ' + k });
                    hard += 1;
                }
            });
            if (demo && jmx.indexOf('${BUILD_ID}') < 0 && jmx.indexOf('BUILD_ID') >= 0) {
                issues.push({ level: 'hard', msg: 'BUILD_ID 未保留 ${BUILD_ID} 引用形式' });
                hard += 1;
            }
            var defined = collectDefinedFromJmx(jmx);
            var refs = collectRefsFromJmx(jmx);
            refs.forEach(function (name) {
                if (defined[name] || JMETER_BUILTIN[name]) return;
                issues.push({ level: 'hard', msg: 'JMX 引用未定义变量: ${' + name + '}' });
                hard += 1;
            });
        }
        var result = { ok: hard === 0, hard: hard, warn: warn, issues: issues, blockDownload: hard > 0 };
        global.__jmsJmxExportSelfCheckV4Last = result;
        return result;
    }
    function shouldBlockDownload() {
        var r = global.__jmsJmxExportSelfCheckV4Last;
        return !!(r && r.blockDownload);
    }
    global.JmsJmxExportSelfCheckV4 = {
        run: runV4,
        getLast: function () { return global.__jmsJmxExportSelfCheckV4Last || null; },
        shouldBlockDownload: shouldBlockDownload,
        collectDefinedFromJmx: collectDefinedFromJmx,
        collectRefsFromJmx: collectRefsFromJmx
    };
}(typeof window !== 'undefined' ? window : this));
