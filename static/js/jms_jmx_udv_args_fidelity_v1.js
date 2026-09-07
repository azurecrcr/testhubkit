/**
 * JMX 导入→导出 · TestPlan UDV / Arguments 索引 / HTTP Arguments 外壳保真（隔离模块）
 * - 从最近一次导入 XML 回填计划级 user_defined_variables（防 YAML 丢变量）
 * - 保真写出：UDV 用原片（无 guiclass），Arguments 用序号 name="0"..，HTTP Arguments 去 GUI 外壳
 * 不改 genJmx / compact 原函数语义：仅在保真会话包装。
 */
(function (global) {
    'use strict';

    function fidelityActive(data) {
        return !!(data && data._jmx_import_fidelity) ||
            !!global.__jmxImportFidelityActive ||
            !!(global.__jmxLastImportedXml && String(global.__jmxLastImportedXml).indexOf('jmeterTestPlan') >= 0);
    }

    /** 平衡截取指定 name 的 elementProp 整块 */
    function extractElementPropByName(xml, nameAttr) {
        if (!xml) return '';
        var needle = '<elementProp name="' + nameAttr + '"';
        var start = xml.indexOf(needle);
        if (start < 0) return '';
        var i = start;
        var depth = 0;
        while (i < xml.length) {
            var open = xml.indexOf('<elementProp', i);
            var close = xml.indexOf('</elementProp>', i);
            if (close < 0) return '';
            if (open >= 0 && open < close) {
                depth += 1;
                i = open + 12;
            } else {
                depth -= 1;
                i = close + '</elementProp>'.length;
                if (depth === 0) return xml.slice(start, i);
            }
        }
        return '';
    }


    /** 新方法：截取 UDV 原片并保留行首缩进 */
    function extractElementPropByNameWithLead(xml, nameAttr) {
        var block = extractElementPropByName(xml, nameAttr);
        if (!block || !xml) return block;
        var needle = '<elementProp name="' + nameAttr + '"';
        var start = xml.indexOf(needle);
        if (start < 0) return block;
        var lineStart = xml.lastIndexOf('\n', start - 1) + 1;
        var lead = xml.slice(lineStart, start);
        return lead + block;
    }

    /** 用原片替换导出中的 TestPlan UDV */
    function replaceElementPropByName(xml, nameAttr, replacement) {
        if (!xml || !replacement) return xml;
        var needle = '<elementProp name="' + nameAttr + '"';
        var start = xml.indexOf(needle);
        if (start < 0) return xml;
        var i = start;
        var depth = 0;
        while (i < xml.length) {
            var open = xml.indexOf('<elementProp', i);
            var close = xml.indexOf('</elementProp>', i);
            if (close < 0) return xml;
            if (open >= 0 && open < close) {
                depth += 1;
                i = open + 12;
            } else {
                depth -= 1;
                i = close + '</elementProp>'.length;
                if (depth === 0) {
                    return xml.slice(0, start) + replacement + xml.slice(i);
                }
            }
        }
        return xml;
    }

    /** 从源 JMX 解析计划级变量 name→value（供其它逻辑使用） */
    function parsePlanUdvFromXml(xml) {
        var block = extractElementPropByName(xml, 'TestPlan.user_defined_variables');
        var out = {};
        if (!block) return out;
        var re = /<elementProp[^>]*elementType="Argument"[^>]*>[\s\S]*?<stringProp name="Argument\.name">([\s\S]*?)<\/stringProp>[\s\S]*?<stringProp name="Argument\.value">([\s\S]*?)<\/stringProp>/g;
        var m;
        while ((m = re.exec(block))) {
            var k = String(m[1] || '').trim();
            if (k) out[k] = String(m[2] || '').trim();
        }
        return out;
    }

    /** 新方法：导出数据回填计划级变量 */
    function restorePlanUdvOntoData(data) {
        if (!data || typeof data !== 'object') return data;
        var src = global.__jmxLastImportedXml || data._jmx_source_xml || '';
        if (!src) return data;
        var udv = parsePlanUdvFromXml(src);
        if (!Object.keys(udv).length) return data;
        data._jmx_plan_udv = udv;
        data._jmx_plan_udv_xml = (typeof extractElementPropByNameWithLead === 'function'
            ? extractElementPropByNameWithLead(src, 'TestPlan.user_defined_variables')
            : extractElementPropByName(src, 'TestPlan.user_defined_variables'));
        if (!data.variables || typeof data.variables !== 'object') data.variables = {};
        Object.keys(udv).forEach(function (k) {
            if (data.variables[k] === undefined || data.variables[k] === '') {
                data.variables[k] = udv[k];
            }
        });
        // 源有值时以源为准（导入未改）
        if (fidelityActive(data)) {
            Object.keys(udv).forEach(function (k) {
                data.variables[k] = udv[k];
            });
        }
        return data;
    }

    /** 新方法：Argument elementProp 的 name 改为序号，对齐 JMeter 旧版导出 */
    function renumberArgumentElementPropNames(block) {
        if (!block) return block;
        var idx = 0;
        return block.replace(/<elementProp name="[^"]*" elementType="Argument">/g, function () {
            var s = '<elementProp name="' + idx + '" elementType="Argument">';
            idx += 1;
            return s;
        });
    }

    /** 新方法：HTTPSampler.Arguments 去掉 GUI 外壳属性（对齐 B plain） */
    function stripHttpArgumentsRichShell(xml) {
        if (!xml) return xml;
        return xml.replace(
            /<elementProp name="HTTPsampler\.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables"(?: enabled="(?:true|false)")?>/g,
            '<elementProp name="HTTPsampler.Arguments" elementType="Arguments">'
        );
    }

    /** 新方法：对独立 Arguments / TestPlan UDV / Backend 内？仅处理顶层 Arguments 标签与 UDV */
    function rewriteArgumentsIndexStyle(xml) {
        if (!xml) return xml;
        // 独立 Arguments 组件
        xml = xml.replace(/<Arguments\b[\s\S]*?<\/Arguments>/g, function (block) {
            return renumberArgumentElementPropNames(block);
        });
        // TestPlan UDV（若未整块替换）
        var udv = extractElementPropByName(xml, 'TestPlan.user_defined_variables');
        if (udv) {
            xml = replaceElementPropByName(xml, 'TestPlan.user_defined_variables', renumberArgumentElementPropNames(udv));
        }
        return xml;
    }

    /** 新方法：导出 XML 终态保真整形 */
    function applyUdvArgsFidelityXml(xml, data) {
        if (!xml || !fidelityActive(data)) return xml;
        var src = global.__jmxLastImportedXml || (data && data._jmx_source_xml) || '';
        var srcUdv = (data && data._jmx_plan_udv_xml) || extractElementPropByNameWithLead(src, 'TestPlan.user_defined_variables');
        if (!srcUdv && src) srcUdv = extractElementPropByName(src, 'TestPlan.user_defined_variables');
        if (srcUdv) {
            // 使用源脚本缩进原片，避免叠加导出缩进导致与 B 不一致
            var block = srcUdv.replace(/^\n+/, '').replace(/\n+$/, '');
            if (block.charAt(0) !== ' ' && block.charAt(0) !== '\t') {
                var mLead = xml.match(/\n(\s*)<elementProp name="TestPlan.user_defined_variables"/);
                var lead = mLead ? mLead[1] : '      ';
                block = lead + block;
            }
            xml = replaceElementPropByName(xml, 'TestPlan.user_defined_variables', block);
        }
        xml = stripHttpArgumentsRichShell(xml);
        xml = rewriteArgumentsIndexStyle(xml);
        return xml;
    }

    function patchPrepareRestoreUdv() {
        var P = global.JmsCatalogJmxPrepare;
        if (!P || typeof P.prepareScenarioForJmx !== 'function' || P.__udvArgsFidelityPrepareV1) return false;
        P.__udvArgsFidelityPrepareV1 = true;
        var orig = P.prepareScenarioForJmx;
        P.prepareScenarioForJmx = function (data) {
            var out = orig.call(P, data);
            out = restorePlanUdvOntoData(out || data);
            return out;
        };
        return true;
    }

    function patchApplyResolvedRestoreUdv() {
        var R = global.JmsPlanCatalogResolve;
        if (!R || typeof R.applyResolvedForExport !== 'function' || R.__udvArgsFidelityResolveV1) return false;
        R.__udvArgsFidelityResolveV1 = true;
        var orig = R.applyResolvedForExport;
        R.applyResolvedForExport = function (data) {
            var out = orig.call(R, data);
            out = restorePlanUdvOntoData(out);
            return out;
        };
        return true;
    }

    function patchCompactSkipRichHttpArgs() {
        var C = global.JmsJmxExportCompact;
        if (!C || typeof C.compactExportXml !== 'function' || C.__udvArgsFidelityCompactV1) return false;
        C.__udvArgsFidelityCompactV1 = true;
        var orig = C.compactExportXml;
        C.compactExportXml = function (xml) {
            var data = global.__jmxExportRootData || null;
            var active = fidelityActive(data);
            var savedRepair = null;
            // compact 内部会 repairMissingArgumentsGuiClass；保真时先跑原逻辑再剥外壳
            var out = orig.call(C, xml);
            if (active) {
                out = applyUdvArgsFidelityXml(out, data);
            }
            return out;
        };
        return true;
    }

    function patchRoundtripRemoveAlso() {
        // 挂到已有 Roundtrip.removePlanArgsPrefix 之后
        var R = global.JmsJmxRoundtripFidelityV1;
        if (!R || typeof R.removePlanArgsPrefix !== 'function' || R.__udvArgsFidelityHookV1) return false;
        R.__udvArgsFidelityHookV1 = true;
        var orig = R.removePlanArgsPrefix;
        R.removePlanArgsPrefix = function (xml, data) {
            var out = orig.call(R, xml, data);
            return applyUdvArgsFidelityXml(out, data);
        };
        return true;
    }

    function install() {
        patchPrepareRestoreUdv();
        patchApplyResolvedRestoreUdv();
        patchCompactSkipRichHttpArgs();
        patchRoundtripRemoveAlso();
    }

    function boot() {
        install();
        var n = 0;
        var t = setInterval(function () {
            n += 1;
            install();
            if (n > 50) clearInterval(t);
        }, 100);
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 0);
    }

    global.JmsJmxUdvArgsFidelityV1 = {
        install: install,
        restorePlanUdvOntoData: restorePlanUdvOntoData,
        parsePlanUdvFromXml: parsePlanUdvFromXml,
        extractElementPropByName: extractElementPropByName,
        extractElementPropByNameWithLead: extractElementPropByNameWithLead,
        applyUdvArgsFidelityXml: applyUdvArgsFidelityXml,
        stripHttpArgumentsRichShell: stripHttpArgumentsRichShell,
        renumberArgumentElementPropNames: renumberArgumentElementPropNames
    };
})(typeof window !== 'undefined' ? window : this);
