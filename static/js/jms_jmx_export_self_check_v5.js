/**
 * JMX 导出自检 V5（硬门禁，export-only）
 */
(function (global) {
    'use strict';
    var BUILTIN = { __P: true, __property: true, __time: true, __threadNum: true, __machineName: true, __javaScript: true, __groovy: true, __Random: true, __UUID: true };
    var REQUIRED = ['BASE_URL', 'BUILD_ID', 'GLOBAL_CHANNEL', 'ORDER_BUILD'];
    function isDemo(data) {
        var n = data && data.name ? String(data.name) : '';
        return n.indexOf('全元件') >= 0 || n.indexOf('压测全景') >= 0;
    }
    function collectDefined(jmx) {
        var d = {}, m;
        var re = /<stringProp name="Argument.name">([^<]*)<\/stringProp>\s*<stringProp name="Argument.value">/g;
        while ((m = re.exec(jmx)) !== null) d[m[1]] = true;
        var csvRe = /<stringProp name="variableNames">([^<]*)<\/stringProp>/g;
        while ((m = csvRe.exec(jmx)) !== null) String(m[1]).split(',').forEach(function (v) { v = v.trim(); if (v) d[v] = true; });
        var jsonRe = /<stringProp name="JSONPostProcessor.referenceNames">([^<]*)<\/stringProp>/g;
        while ((m = jsonRe.exec(jmx)) !== null) String(m[1]).split(',').forEach(function (v) { v = v.trim(); if (v) d[v] = true; });
        var ctrRe = /<stringProp name="CounterConfig.name">([^<]*)<\/stringProp>/g;
        while ((m = ctrRe.exec(jmx)) !== null) d[m[1]] = true;
        return d;
    }
    function collectRefs(jmx) {
        var refs = {}, re = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, m;
        while ((m = re.exec(jmx)) !== null) if (m[1] && !BUILTIN[m[1]]) refs[m[1]] = true;
        return Object.keys(refs);
    }
    function countEmptyHttpDefaults(jmx) {
        var n = 0, re = /<ConfigTestElement guiclass="HttpDefaultsGui"[\s\S]*?<\/ConfigTestElement>/g, m;
        while ((m = re.exec(jmx)) !== null) if (!/HTTPSampler\.(domain|port|protocol)/.test(m[0])) n++;
        return n;
    }
    function runV5(scenario, jmx, opts) {
        opts = opts || {};
        var base = (global.JmsJmxExportSelfCheckV4 && global.JmsJmxExportSelfCheckV4.run)
            ? global.JmsJmxExportSelfCheckV4.run(scenario, jmx, opts)
            : { ok: true, hard: 0, warn: 0, issues: [] };
        var issues = (base.issues || []).slice();
        var hard = base.hard || 0, warn = base.warn || 0;
        var demo = isDemo(scenario);
        if (jmx) {
            if (/<Arguments[^>]*testname="计划变量"/.test(jmx)) {
                issues.push({ level: 'hard', msg: 'S01: 存在独立计划变量 Arguments（应仅 TestPlan 内嵌）' }); hard++;
            }
            if (demo) {
                REQUIRED.forEach(function (k) {
                    if (jmx.indexOf('Argument.name">' + k + '</stringProp>') < 0) {
                        issues.push({ level: 'hard', msg: 'S02: TestPlan 缺少 ' + k }); hard++;
                    }
                });
                if (jmx.indexOf('${BUILD_ID}') < 0 && jmx.indexOf('local-build') >= 0) {
                    issues.push({ level: 'hard', msg: 'S03: BUILD_ID 被物化为 local-build' }); hard++;
                }
            }
            var emptyHttp = countEmptyHttpDefaults(jmx);
            if (emptyHttp > 0) {
                issues.push({ level: 'hard', msg: 'S04: 空壳 HTTP 默认值 ' + emptyHttp + ' 处' }); hard++;
            }
            if (jmx.indexOf('%24%7B') >= 0) {
                issues.push({ level: 'hard', msg: 'S05: 路径存在错误编码 %24%7B' }); hard++;
            }
            var defined = collectDefined(jmx);
            collectRefs(jmx).forEach(function (name) {
                if (!defined[name]) { issues.push({ level: 'hard', msg: 'S06: 未定义引用 ${' + name + '}' }); hard++; }
            });
            var tags = jmx.match(/eventTags<\/stringProp>\s*<stringProp name="Argument.value">([^<]+)/g) || [];
            if (tags.length >= 2) {
                var vals = tags.map(function (t) { var m = t.match(/Argument.value">([^<]+)/); return m ? m[1] : ''; });
                var keys0 = (vals[0].match(/(env|scenario|build)=/g) || []).sort().join(',');
                var keys1 = (vals[1].match(/(env|scenario|build)=/g) || []).sort().join(',');
                if (keys0 !== keys1) { issues.push({ level: 'warn', msg: 'S08: eventTags 键集不一致' }); warn++; }
            }
        }
        var result = { ok: hard === 0, hard: hard, warn: warn, issues: issues, blockDownload: hard > 0 };
        global.__jmsJmxExportSelfCheckV5Last = result;
        return result;
    }
    global.JmsJmxExportSelfCheckV5 = {
        run: runV5,
        getLast: function () { return global.__jmsJmxExportSelfCheckV5Last || null; },
        shouldBlockDownload: function () { var r = global.__jmsJmxExportSelfCheckV5Last; return !!(r && r.blockDownload); }
    };
}(typeof window !== 'undefined' ? window : this));
