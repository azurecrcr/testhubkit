/**
 * JMX 导入 · ThreadGroup 负载属性原片截获 + 计划级 Arguments 标记（隔离模块）
 */
(function (global) {
    'use strict';

    function captureInner(node) {
        var R = global.JmsJmxRoundtripFidelityV1;
        if (R && typeof R.captureTgPropsXml === 'function') return R.captureTgPropsXml(node);
        if (!node || !global.XMLSerializer) return '';
        try {
            var full = new global.XMLSerializer().serializeToString(node);
            var gt = full.indexOf('>');
            var close = full.lastIndexOf('</');
            if (gt < 0 || close <= gt) return '';
            return full.slice(gt + 1, close);
        } catch (e) {
            return '';
        }
    }

    function attachLoadCapture(tg, node) {
        if (!tg || !node) return;
        if (!tg.load || typeof tg.load !== 'object') tg.load = {};
        var xml = captureInner(node);
        if (xml) tg.load._jmx_tg_props_xml = xml;
    }

    function markPlanArguments(scenario, doc) {
        if (!scenario || !doc) return scenario;
        var had = false;
        var tp = doc.querySelector('jmeterTestPlan > hashTree > TestPlan');
        if (tp && tp.nextElementSibling && tp.nextElementSibling.tagName === 'hashTree') {
            var planHash = tp.nextElementSibling;
            for (var c = planHash.firstElementChild; c; c = c.nextElementSibling) {
                if (c.tagName === 'Arguments' || (c.getAttribute && c.getAttribute('testclass') === 'Arguments')) {
                    had = true;
                    break;
                }
            }
        }
        scenario._jmx_had_plan_arguments = had;
        return scenario;
    }

    function findByName(doc, tag, name) {
        var list = doc.getElementsByTagName(tag);
        for (var i = 0; i < list.length; i++) {
            if ((list[i].getAttribute('testname') || '') === name) return list[i];
        }
        return null;
    }

    function walkAttachFromRawXml(scenario, xmlText) {
        if (!scenario || !xmlText || !global.DOMParser) return scenario;
        var doc;
        try {
            doc = new global.DOMParser().parseFromString(xmlText, 'text/xml');
        } catch (e) {
            return scenario;
        }
        markPlanArguments(scenario, doc);

        function applyGroups(groups, tag) {
            (groups || []).forEach(function (tg) {
                if (!tg || !tg.name) return;
                var node = findByName(doc, tag, tg.name);
                if (node) attachLoadCapture(tg, node);
            });
        }
        applyGroups(scenario.setup_thread_groups, 'SetupThreadGroup');
        applyGroups(scenario.thread_groups, 'ThreadGroup');
        applyGroups(scenario.post_thread_groups, 'PostThreadGroup');
        return scenario;
    }

    function patchFidelitySanitizeWithXml() {
        var F = global.JmsJmxImportFidelityV1;
        if (!F || typeof F.sanitizeScenario !== 'function' || F.__tgLoadCaptureSanitizeV1) return false;
        F.__tgLoadCaptureSanitizeV1 = true;
        var orig = F.sanitizeScenario;
        F.sanitizeScenario = function (scenario) {
            var out = orig.call(F, scenario);
            var xml = global.__jmxLastImportedXml || (out && out._jmx_source_xml) || '';
            if (xml) out = walkAttachFromRawXml(out, xml);
            return out;
        };
        return true;
    }

    function patchParseJmxXmlCapture() {
        var api = global.JmxImportParser;
        if (!api || typeof api.parseJmxXml !== 'function' || api.__tgLoadCaptureParseV1) return !!api;
        api.__tgLoadCaptureParseV1 = true;
        var orig = api.parseJmxXml;
        api.parseJmxXml = function (xml, opts) {
            if (xml) global.__jmxLastImportedXml = String(xml);
            var result = orig.call(api, xml, opts);
            try {
                if (result && typeof result === 'object') {
                    // sanitize 可能已跑过；再挂原片
                    result = walkAttachFromRawXml(result, String(xml || ''));
                }
            } catch (e) { /* ignore */ }
            return result;
        };
        if (typeof api.parseFileAsync === 'function' && !api.__tgLoadCaptureFileV1) {
            api.__tgLoadCaptureFileV1 = true;
            var origFile = api.parseFileAsync;
            api.parseFileAsync = function (file, callbacks) {
                callbacks = callbacks || {};
                var origSuccess = callbacks.onSuccess;
                callbacks.onSuccess = function (result) {
                    try {
                        var xml = global.__jmxLastImportedXml || '';
                        if (result && result.scenario && xml) {
                            result.scenario = walkAttachFromRawXml(result.scenario, xml);
                        } else if (result && result.name && xml) {
                            result = walkAttachFromRawXml(result, xml);
                        }
                    } catch (e2) { /* ignore */ }
                    if (origSuccess) origSuccess(result);
                };
                return origFile.call(api, file, callbacks);
            };
        }
        return true;
    }

    function patchFileReaderXmlCapture() {
        if (global.__jmxImportXmlCapturePatched) return true;
        global.__jmxImportXmlCapturePatched = true;
        var FR = global.FileReader;
        if (!FR || !FR.prototype) return false;
        var origRead = FR.prototype.readAsText;
        if (typeof origRead !== 'function') return false;
        FR.prototype.readAsText = function () {
            this.addEventListener('load', function () {
                try {
                    var t = String(this.result || '');
                    if (t.indexOf('jmeterTestPlan') >= 0) {
                        global.__jmxLastImportedXml = t;
                    }
                } catch (e) { /* ignore */ }
            });
            return origRead.apply(this, arguments);
        };
        return true;
    }

    function install() {
        patchFidelitySanitizeWithXml();
        patchParseJmxXmlCapture();
        patchFileReaderXmlCapture();
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

    global.JmsJmxImportTgLoadCaptureV1 = {
        install: install,
        walkAttachFromRawXml: walkAttachFromRawXml,
        attachLoadCapture: attachLoadCapture,
        markPlanArguments: markPlanArguments
    };
})(typeof window !== 'undefined' ? window : this);
