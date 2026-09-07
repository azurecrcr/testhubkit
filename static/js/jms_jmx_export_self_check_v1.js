/**
 * JMX 导出自检门禁 · 硬错误计数供 buildSummary 展示
 */
(function (global) {
    'use strict';

    function countTag(xml, tag) {
        if (!xml) return 0;
        var re = new RegExp('<' + tag + '[\\s>]', 'g');
        var m = xml.match(re);
        return m ? m.length : 0;
    }

    function walkSteps(list, fn) {
        (list || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
            if (Array.isArray(s.catalog_hash_children)) walkSteps(s.catalog_hash_children, fn);
        });
    }

    function countScenarioXPath(steps) {
        var n = 0;
        walkSteps(steps, function (s) {
            if (s.type === 'catalog_element' && s.alias === 'XPathExtractor' && s.enabled !== false) n += 1;
        });
        return n;
    }

    function countMountJsr223(data) {
        var n = 0;
        function scanProps(props) {
            (props && props.processors || []).forEach(function (p) {
                if (p && p.type === 'jsr223_post' && p.enabled !== false) n += 1;
            });
        }
        function scanTg(tg) {
            walkSteps(tg && tg.steps, function (s) {
                if (!s || s.type !== 'catalog_element') return;
                scanProps(s.catalog_props || {});
                (s.catalog_hash_children || []).forEach(function (c) {
                    if (c && c.alias === 'JSR223PostProcessor' && c.enabled !== false) n += 1;
                });
            });
        }
        (data.setup_thread_groups || []).forEach(scanTg);
        (data.thread_groups || []).forEach(scanTg);
        (data.post_thread_groups || []).forEach(scanTg);
        return n;
    }

    function countCsvWithoutContent(data) {
        var n = 0;
        function maybeCount(props) {
            if (!props || props.enabled === false) return;
            var fn = props.filename ? String(props.filename).trim() : '';
            var content = props.file_content != null ? String(props.file_content).trim() : '';
            if (fn && !content) n += 1;
        }
        function scanTg(tg) {
            walkSteps(tg && tg.steps, function (s) {
                if (s && s.alias === 'CSVDataSet') maybeCount(s.catalog_props || {});
            });
        }
        (data.setup_thread_groups || []).forEach(scanTg);
        (data.thread_groups || []).forEach(scanTg);
        (data.post_thread_groups || []).forEach(scanTg);
        return n;
    }

    function collectAllSteps(data) {
        var all = [];
        function pullTg(tg) {
            if (!tg) return;
            all = all.concat(tg.steps || []);
        }
        (data.setup_thread_groups || []).forEach(pullTg);
        (data.thread_groups || []).forEach(pullTg);
        (data.post_thread_groups || []).forEach(pullTg);
        if (data.steps) all = all.concat(data.steps);
        return all;
    }

    function findDuplicateHeaderManagers(xml) {
        var names = {};
        var dups = [];
        var re = /<HeaderManager[^>]*testname="([^"]*)"/g;
        var m;
        while ((m = re.exec(xml)) !== null) {
            var nm = m[1];
            if (names[nm]) dups.push(nm);
            else names[nm] = 1;
        }
        return dups;
    }

    function hasEncodedJmeterVarsInPaths(xml) {
        return /HTTPSampler\.path[^<]*%24%7B/i.test(xml || '');
    }

    function countCookieMissingName(xml) {
        var n = 0;
        var re = /<elementProp[^>]*elementType="Cookie"[^>]*>([\s\S]*?)<\/elementProp>/g;
        var m;
        while ((m = re.exec(xml)) !== null) {
            if (m[1].indexOf('Cookie.name') < 0) n += 1;
        }
        return n;
    }

    function run(scenario, jmx) {
        var issues = [];
        var hard = 0;
        var warn = 0;
        scenario = scenario || {};
        if (!jmx) {
            issues.push({ level: 'hard', msg: 'JMX 为空' });
            hard += 1;
        } else {
            var dupHeaders = findDuplicateHeaderManagers(jmx);
            dupHeaders.forEach(function (nm) {
                issues.push({ level: 'hard', msg: 'HeaderManager 重复: ' + nm });
                hard += 1;
            });
            var xpExpected = countScenarioXPath(collectAllSteps(scenario));
            var xpActual = countTag(jmx, 'XPathExtractor');
            if (xpExpected > 0 && xpActual < xpExpected) {
                issues.push({ level: 'hard', msg: 'XPathExtractor 缺失: 期望 ' + xpExpected + ' 实际 ' + xpActual });
                hard += 1;
            }
            if (hasEncodedJmeterVarsInPaths(jmx)) {
                issues.push({ level: 'hard', msg: 'GET 路径 query 变量被 URL 编码（%24%7B），运行时无法展开' });
                hard += 1;
            }
            var jsrExpected = countMountJsr223(scenario);
            var jsrActual = countTag(jmx, 'JSR223PostProcessor');
            if (jsrExpected > 0 && jsrActual < jsrExpected) {
                issues.push({ level: 'hard', msg: '挂载区 JSR223 后置缺失: 期望 ' + jsrExpected + ' 实际 ' + jsrActual });
                hard += 1;
            }
            var cookieMissing = countCookieMissingName(jmx);
            if (cookieMissing > 0) {
                issues.push({ level: 'warn', msg: 'Cookie 节点缺少 Cookie.name: ' + cookieMissing + ' 处' });
                warn += 1;
            }
            var csvOrphan = countCsvWithoutContent(scenario);
            if (csvOrphan > 0) {
                issues.push({ level: 'warn', msg: 'CSV 仅路径无内联内容: ' + csvOrphan + ' 处，单独运行需自备 data/*.csv 或下载 ZIP 包' });
                warn += 1;
            }
            if (countTag(jmx, 'hashTree') > 0 && jmx.indexOf('</HTTPSamplerProxy>\n      <hashTree/>\n      <HeaderManager') >= 0) {
                issues.push({ level: 'warn', msg: '疑似 hashTree 与 HeaderManager 邻接错位' });
                warn += 1;
            }
            if (/<IfController|<LoopController|<TransactionController|<RandomController|<GenericController/.test(jmx) &&
                countTag(jmx, 'ResponseAssertion') > countTag(jmx, 'HTTPSamplerProxy')) {
                issues.push({ level: 'warn', msg: '控制器挂载区含断言/提取器，默认不作用于子采样器，请确认压测语义' });
                warn += 1;
            }
        }
        var result = { ok: hard === 0, hard: hard, warn: warn, issues: issues };
        global.__jmsJmxExportSelfCheckLast = result;
        return result;
    }

    global.JmsJmxExportSelfCheckV1 = {
        run: run,
        getLast: function () { return global.__jmsJmxExportSelfCheckLast || null; }
    };
})(typeof window !== 'undefined' ? window : this);
