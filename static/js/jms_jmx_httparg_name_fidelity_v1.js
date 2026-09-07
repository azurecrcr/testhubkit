/**
 * JMX 导入：HTTPArgument 参数名保真（隔离模块）
 * JMeter 表单参数名常在 elementProp@name；原导入回退 arg0/arg1。
 * 新方法修复 step.form_params 与 catalog_props.form_params（含 setup/post TG）。
 * 导出时若仍残留 name="argN"，从源 JMX 按 sampler+参数值回填。
 */
(function (global) {
    'use strict';

    function fidelityActive(data) {
        return !!(data && data._jmx_import_fidelity) ||
            !!global.__jmxImportFidelityActive ||
            !!(global.__jmxLastImportedXml && String(global.__jmxLastImportedXml).indexOf('jmeterTestPlan') >= 0);
    }

    /** 新方法：从 HTTPArgument 元素解析参数名 */
    function resolveHttpArgumentNameFromEl(ap, index) {
        if (!ap) return 'arg' + (index || 0);
        var fromProp = '';
        try {
            var nodes = ap.getElementsByTagName('stringProp');
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].getAttribute('name') === 'Argument.name') {
                    fromProp = String(nodes[i].textContent || '').trim();
                    break;
                }
            }
        } catch (e) { /* ignore */ }
        if (fromProp) return fromProp;
        var attr = String(ap.getAttribute('name') || '').trim();
        if (attr && !/^arg\d+$/.test(attr)) return attr;
        if (attr) return attr;
        return 'arg' + (index || 0);
    }

    function getArgValue(ap) {
        try {
            var nodes = ap.getElementsByTagName('stringProp');
            for (var j = 0; j < nodes.length; j++) {
                if (nodes[j].getAttribute('name') === 'Argument.value') {
                    return String(nodes[j].textContent || '');
                }
            }
        } catch (e2) { /* ignore */ }
        return '';
    }

    /** 新方法：从 Arguments 节点重建有序 form map */
    function formParamsFromArgsEl(argsEl) {
        var form = {};
        var order = [];
        if (!argsEl) return { form: form, order: order };
        var argProps = argsEl.getElementsByTagName('elementProp');
        for (var i = 0; i < argProps.length; i++) {
            var ap = argProps[i];
            if (ap.getAttribute('elementType') !== 'HTTPArgument') continue;
            var k = resolveHttpArgumentNameFromEl(ap, i);
            form[k] = getArgValue(ap);
            order.push(k);
        }
        return { form: form, order: order };
    }

    function hasArgNKeys(obj) {
        if (!obj || typeof obj !== 'object') return false;
        return Object.keys(obj).some(function (k) { return /^arg\d+$/.test(k); });
    }

    function applyFormOntoTarget(target, rebuilt) {
        if (!target || !rebuilt || !rebuilt.order || !rebuilt.order.length) return;
        target.form_params = rebuilt.form;
        target._jmx_form_param_order = rebuilt.order;
        if (!target.body_type) target.body_type = 'form';
    }

    function repairStepFormParams(step, samplerEl) {
        if (!step || !samplerEl) return step;
        var argsEl = samplerEl.querySelector('elementProp[name="HTTPsampler.Arguments"]');
        if (!argsEl) return step;
        var rebuilt = formParamsFromArgsEl(argsEl);
        if (!rebuilt.order.length) return step;

        if (step.form_params || step.body_type === 'form' || hasArgNKeys(step.form_params)) {
            applyFormOntoTarget(step, rebuilt);
        }
        if (step.catalog_props && typeof step.catalog_props === 'object') {
            if (step.catalog_props.form_params || step.catalog_props.body_type === 'form' ||
                hasArgNKeys(step.catalog_props.form_params)) {
                applyFormOntoTarget(step.catalog_props, rebuilt);
            }
        }
        return step;
    }

    function findSamplerElsByName(doc, name) {
        var out = [];
        if (!doc || !name) return out;
        var nodes = doc.getElementsByTagName('HTTPSamplerProxy');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('testname') === name) out.push(nodes[i]);
        }
        return out;
    }

    function consumeSampler(map, name) {
        var list = map[name];
        if (!list || !list.length) return null;
        return list.shift();
    }

    function deepRepair(obj, samplerMap, depth) {
        if (!obj || typeof obj !== 'object' || depth > 14) return;
        if (Array.isArray(obj)) {
            obj.forEach(function (x) { deepRepair(x, samplerMap, depth + 1); });
            return;
        }
        var name = obj.name || obj.testname || '';
        var needs = hasArgNKeys(obj.form_params) ||
            (obj.catalog_props && hasArgNKeys(obj.catalog_props.form_params)) ||
            obj.body_type === 'form' ||
            (obj.catalog_props && obj.catalog_props.body_type === 'form');
        if (name && needs) {
            var el = consumeSampler(samplerMap, name);
            if (el) repairStepFormParams(obj, el);
        }
        Object.keys(obj).forEach(function (k) {
            if (k === 'raw_jmx' || k === '_import_report' || k === 'jmx_fragment') return;
            deepRepair(obj[k], samplerMap, depth + 1);
        });
    }

    function buildSamplerMap(doc) {
        var map = {};
        var nodes = doc.getElementsByTagName('HTTPSamplerProxy');
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i].getAttribute('testname') || '';
            if (!map[n]) map[n] = [];
            map[n].push(nodes[i]);
        }
        return map;
    }

    function repairScenarioFormArgNames(scenario, srcXml) {
        if (!scenario || !srcXml) return scenario;
        var doc;
        try {
            doc = new DOMParser().parseFromString(srcXml, 'text/xml');
        } catch (e) {
            return scenario;
        }
        if (!doc || doc.getElementsByTagName('parsererror').length) return scenario;
        deepRepair(scenario, buildSamplerMap(doc), 0);
        return scenario;
    }

    /**
     * 新方法：导出 XML 中残留的 argN，按源 sampler 同位 HTTPArgument@name 字符串替换（避免整树序列化）
     */
    function restoreHttpArgNamesInExportXml(xml, srcXml) {
        if (!xml || !srcXml || !fidelityActive()) return xml;
        var srcDoc;
        try {
            srcDoc = new DOMParser().parseFromString(srcXml, 'text/xml');
        } catch (e) {
            return xml;
        }
        if (!srcDoc) return xml;
        var srcMap = buildSamplerMap(srcDoc);
        // 逐 sampler：定位导出块内 Arguments 中的 HTTPArgument name="argN"
        return xml.replace(/<HTTPSamplerProxy\b[^>]*testname="([^"]*)"[^>]*>[\s\S]*?<\/HTTPSamplerProxy>/g, function (block, tn) {
            var srcEl = consumeSampler(srcMap, tn);
            if (!srcEl) return block;
            var srcArgs = srcEl.querySelector('elementProp[name="HTTPsampler.Arguments"]');
            if (!srcArgs) return block;
            var srcProps = [];
            var kids = srcArgs.getElementsByTagName('elementProp');
            for (var b = 0; b < kids.length; b++) {
                if (kids[b].getAttribute('elementType') === 'HTTPArgument') srcProps.push(kids[b]);
            }
            if (!srcProps.length) return block;
            var idx = 0;
            return block.replace(/<elementProp name="arg(\d+)" elementType="HTTPArgument">/g, function (m) {
                var srcName = resolveHttpArgumentNameFromEl(srcProps[idx], idx);
                idx += 1;
                if (!srcName || /^arg\d+$/.test(srcName)) return m;
                return '<elementProp name="' + srcName + '" elementType="HTTPArgument">';
            });
        });
    }

    function patchParseJmxXml() {
        var P = global.JmxImportParser;
        if (!P || typeof P.parseJmxXml !== 'function' || P.__httpArgNameFidelityV2) return false;
        P.__httpArgNameFidelityV2 = true;
        var orig = P.parseJmxXml;
        P.parseJmxXml = function (xml) {
            var scenario = orig.apply(P, arguments);
            try {
                repairScenarioFormArgNames(scenario, xml);
            } catch (e) { /* ignore */ }
            return scenario;
        };
        return true;
    }

    function patchExportXml() {
        var C = global.JmsJmxExportCompact;
        if (C && typeof C.compactExportXml === 'function' && !C.__httpArgNameExportV2) {
            C.__httpArgNameExportV2 = true;
            var origC = C.compactExportXml;
            C.compactExportXml = function (xml) {
                var out = origC.call(C, xml);
                var src = global.__jmxLastImportedXml || '';
                if (fidelityActive() && src) {
                    try { out = restoreHttpArgNamesInExportXml(out, src); } catch (e) { /* ignore */ }
                }
                return out;
            };
        }
        var R = global.JmsJmxRoundtripFidelityV1;
        if (R && typeof R.removePlanArgsPrefix === 'function' && !R.__httpArgNameExportV2) {
            R.__httpArgNameExportV2 = true;
            var origR = R.removePlanArgsPrefix;
            R.removePlanArgsPrefix = function (xml, data) {
                var out = origR.call(R, xml, data);
                var src = global.__jmxLastImportedXml || (data && data._jmx_source_xml) || '';
                if (fidelityActive(data) && src) {
                    try { out = restoreHttpArgNamesInExportXml(out, src); } catch (e2) { /* ignore */ }
                }
                return out;
            };
        }
        return true;
    }

    function install() {
        patchParseJmxXml();
        patchExportXml();
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

    global.JmsJmxHttpArgNameFidelityV1 = {
        install: install,
        resolveHttpArgumentNameFromEl: resolveHttpArgumentNameFromEl,
        formParamsFromArgsEl: formParamsFromArgsEl,
        repairScenarioFormArgNames: repairScenarioFormArgNames,
        restoreHttpArgNamesInExportXml: restoreHttpArgNamesInExportXml
    };
})(typeof window !== 'undefined' ? window : this);
