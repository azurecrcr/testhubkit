/**
 * JMX 导出自检 V2 · 语义门禁 + 下载阻断（隔离模块，不修改 V1）
 */
(function (global) {
    'use strict';

    function runV2(scenario, jmx) {
        var base = null;
        if (global.JmsJmxExportSelfCheckV1 && typeof global.JmsJmxExportSelfCheckV1.run === 'function') {
            base = global.JmsJmxExportSelfCheckV1.run(scenario, jmx);
        } else {
            base = { ok: true, hard: 0, warn: 0, issues: [] };
        }
        var issues = (base.issues || []).slice();
        var hard = base.hard || 0;
        var warn = base.warn || 0;
        if (jmx) {
            var httpExpected = collectHttpSamplerNames(scenario);
            var httpActual = collectJmxSamplerNames(jmx);
            httpExpected.forEach(function (nm) {
                if (httpActual.indexOf(nm) < 0) {
                    issues.push({ level: 'hard', msg: 'HTTP 采样器缺失: ' + nm });
                    hard += 1;
                }
            });
            if (countPlanArgsDuplicate(jmx)) {
                issues.push({ level: 'warn', msg: '计划变量双份：TestPlan 内嵌变量与独立 Arguments 重复' });
                warn += 1;
            }
            var emptyDefaults = countEmptyHttpDefaults(jmx);
            if (emptyDefaults > 2) {
                issues.push({ level: 'warn', msg: '空壳 HTTP 请求默认值过多: ' + emptyDefaults + ' 处' });
                warn += 1;
            }
        }
        var result = { ok: hard === 0, hard: hard, warn: warn, issues: issues, blockDownload: hard > 0 };
        global.__jmsJmxExportSelfCheckV2Last = result;
        return result;
    }

    function walkSteps(list, fn) {
        (list || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
            if (Array.isArray(s.catalog_hash_children)) walkSteps(s.catalog_hash_children, fn);
        });
    }

    function collectHttpSamplerNames(data) {
        var names = [];
        function scanTg(tg) {
            walkSteps(tg && tg.steps, function (s) {
                if (s && (s.alias === 'HTTPSamplerProxy' || s.type === 'http' || (s.catalog_props && s.catalog_props.method))) {
                    var nm = s.name || (s.catalog_props && s.catalog_props.name);
                    if (nm) names.push(String(nm));
                }
            });
        }
        (data.setup_thread_groups || []).forEach(scanTg);
        (data.thread_groups || []).forEach(scanTg);
        (data.post_thread_groups || []).forEach(scanTg);
        walkSteps(data.steps, function (s) {
            if (s && s.method) names.push(String(s.name || 'step'));
        });
        return names;
    }

    function collectJmxSamplerNames(xml) {
        var names = [];
        var re = /<HTTPSamplerProxy[^>]*testname="([^"]*)"/g;
        var m;
        while ((m = re.exec(xml)) !== null) names.push(m[1]);
        return names;
    }

    function countPlanArgsDuplicate(xml) {
        var hasEmbedded = xml.indexOf('TestPlan.user_defined_variables') >= 0;
        var hasStandalone = /<Arguments[^>]*testname="[^"]*计划变量/i.test(xml);
        return hasEmbedded && hasStandalone;
    }

    function countEmptyHttpDefaults(xml) {
        var n = 0;
        var re = /<ConfigTestElement[^>]*testname="HTTP 请求默认值"[^>]*>([\s\S]*?)<\/ConfigTestElement>/g;
        var m;
        while ((m = re.exec(xml)) !== null) {
            var body = m[1];
            if (body.indexOf('HTTPSampler.domain') < 0 && body.indexOf('HTTPSampler.protocol') < 0 && body.indexOf('HTTPSampler.port') < 0) {
                n += 1;
            }
        }
        return n;
    }

    function shouldBlockDownload() {
        var r = global.__jmsJmxExportSelfCheckV2Last;
        return !!(r && r.blockDownload);
    }

    function getLast() { return global.__jmsJmxExportSelfCheckV2Last || null; }

    global.JmsJmxExportSelfCheckV2 = {
        run: runV2,
        getLast: getLast,
        shouldBlockDownload: shouldBlockDownload
    };
}(typeof window !== 'undefined' ? window : this));
