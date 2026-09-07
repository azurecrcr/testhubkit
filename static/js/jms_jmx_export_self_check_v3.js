/**
 * JMX 导出自检 V3 · 扩展语义门禁（隔离模块，基于 V2）
 */
(function (global) {
    'use strict';

    function isDemoScenario(data) {
        var n = data && data.name ? String(data.name) : '';
        return n.indexOf('全元件') >= 0 || n.indexOf('压测全景') >= 0;
    }

    function collectEventTagsFromJmx(jmx) {
        var tags = [];
        var re = /eventTags[\s\S]*?<stringProp name="Argument\.value">([^<]*)<\/stringProp>/g;
        var m;
        while ((m = re.exec(jmx)) !== null) tags.push(m[1]);
        return tags;
    }

    function eventTagsKeys(tagStr) {
        var keys = [];
        String(tagStr || '').split(',').forEach(function (pair) {
            var idx = pair.indexOf('=');
            if (idx > 0) keys.push(pair.slice(0, idx).trim());
        });
        return keys.sort().join('|');
    }

    function collectCsvFilenamesFromJmx(jmx) {
        var files = [];
        var re = /<CSVDataSet[\s\S]*?<stringProp name="filename">([^<]*)<\/stringProp>/g;
        var m;
        while ((m = re.exec(jmx)) !== null) {
            var fn = String(m[1] || '').trim().replace(/\\/g, '/');
            if (fn && files.indexOf(fn) < 0) files.push(fn);
        }
        return files;
    }

    function runV3(scenario, jmx, opts) {
        opts = opts || {};
        var base = null;
        if (global.JmsJmxExportSelfCheckV2 && typeof global.JmsJmxExportSelfCheckV2.run === 'function') {
            base = global.JmsJmxExportSelfCheckV2.run(scenario, jmx);
        } else if (global.JmsJmxExportSelfCheckV1 && typeof global.JmsJmxExportSelfCheckV1.run === 'function') {
            base = global.JmsJmxExportSelfCheckV1.run(scenario, jmx);
        } else {
            base = { ok: true, hard: 0, warn: 0, issues: [] };
        }
        var issues = (base.issues || []).slice();
        var hard = base.hard || 0;
        var warn = base.warn || 0;
        var demo = isDemoScenario(scenario);

        if (jmx) {
            var dupIdx = -1;
            issues.forEach(function (it, i) {
                if (it && it.msg && it.msg.indexOf('计划变量双份') >= 0) dupIdx = i;
            });
            if (dupIdx >= 0) {
                var dup = issues[dupIdx];
                if (demo || opts.strictPlanDedupe) {
                    dup.level = 'hard';
                    issues[dupIdx] = dup;
                    hard += 1;
                    warn = Math.max(0, warn - 1);
                }
            }

            var emptyDefaults = 0;
            if (global.JmsJmxExportSelfCheckV2) {
                var re = /<ConfigTestElement[^>]*testname="HTTP 请求默认值"[^>]*>([\s\S]*?)<\/ConfigTestElement>/g;
                var m;
                while ((m = re.exec(jmx)) !== null) {
                    var body = m[1];
                    if (body.indexOf('HTTPSampler.domain') < 0 && body.indexOf('HTTPSampler.protocol') < 0) emptyDefaults += 1;
                }
            }
            if (emptyDefaults > 0) {
                issues.push({ level: demo ? 'hard' : 'warn', msg: '空壳 HTTP 请求默认值: ' + emptyDefaults + ' 处' });
                if (demo) hard += 1; else warn += 1;
            }

            var etags = collectEventTagsFromJmx(jmx);
            if (etags.length > 1) {
                var keySets = etags.map(eventTagsKeys);
                var uniq = keySets.filter(function (v, i, a) { return a.indexOf(v) === i; });
                if (uniq.length > 1) {
                    issues.push({ level: 'warn', msg: 'InfluxDB eventTags 计划级与线程组级键不一致' });
                    warn += 1;
                }
            }

            var PathV1 = global.JmsHttpPathExportStrategyV1;
            if (PathV1 && typeof PathV1.detectBaseUrlFullPath === 'function') {
                var paths = PathV1.detectBaseUrlFullPath(jmx);
                if (paths.length) {
                    issues.push({ level: 'warn', msg: 'HTTP path 含 BASE_URL 全路径（与 domain 默认值可能冗余）: ' + paths.length + ' 处' });
                    warn += 1;
                }
            }

        }

        var result = { ok: hard === 0, hard: hard, warn: warn, issues: issues, blockDownload: hard > 0 };
        global.__jmsJmxExportSelfCheckV3Last = result;
        return result;
    }

    function shouldBlockDownload(mode) {
        var r = global.__jmsJmxExportSelfCheckV3Last;
        if (!r) {
            if (global.JmsJmxExportSelfCheckV2 && typeof global.JmsJmxExportSelfCheckV2.shouldBlockDownload === 'function') {
                return global.JmsJmxExportSelfCheckV2.shouldBlockDownload();
            }
            return false;
        }
        return !!r.blockDownload;
    }

    function getLast() { return global.__jmsJmxExportSelfCheckV3Last || null; }

    global.JmsJmxExportSelfCheckV3 = {
        run: runV3,
        getLast: getLast,
        shouldBlockDownload: shouldBlockDownload
    };
}(typeof window !== 'undefined' ? window : this));
