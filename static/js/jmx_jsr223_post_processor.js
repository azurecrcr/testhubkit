/**
 * JSR223 PostProcessor · JMX 导入/导出（隔离模块）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return nodes[i].textContent || '';
        }
        return '';
    }

    function genJsR223PostProcessorXml(proc, indent, escapeXml) {
        if (!proc || proc.type !== 'jsr223_post') return '';
        var en = proc.enabled === false ? 'false' : 'true';
        var lang = proc.language || 'groovy';
        var cacheKey = proc.cache_compiled === false ? 'false' : 'true';
        var xml = indent + '<JSR223PostProcessor guiclass="TestBeanGUI" testclass="JSR223PostProcessor" testname="' +
            escapeXml(proc.name || 'JSR223 PostProcessor') + '" enabled="' + en + '">\n';
        if (proc.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(proc.comments) + '</stringProp>\n';
        }
        xml += indent + '  <stringProp name="cacheKey">' + cacheKey + '</stringProp>\n';
        xml += indent + '  <stringProp name="filename">' + escapeXml(proc.filename || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="parameters">' + escapeXml(proc.parameters || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="script">' + escapeXml(proc.script || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="scriptLanguage">' + escapeXml(lang) + '</stringProp>\n';
        xml += indent + '</JSR223PostProcessor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function parseElement(node) {
        if (!node) return null;
        var cacheRaw = getStringProp(node, 'cacheKey');
        return {
            type: 'jsr223_post',
            name: node.getAttribute('testname') || 'JSR223 PostProcessor',
            enabled: node.getAttribute('enabled') !== 'false',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            script: getStringProp(node, 'script') || '',
            language: getStringProp(node, 'scriptLanguage') || 'groovy',
            parameters: getStringProp(node, 'parameters') || '',
            filename: getStringProp(node, 'filename') || '',
            cache_compiled: cacheRaw !== 'false'
        };
    }

    function patchScenarioAdvanced() {
        var adv = global.JmxScenarioAdvanced;
        if (!adv || adv._jsr223GenPatched) return;
        adv._jsr223GenPatched = true;
        adv.genProcessorsXml = function (list, indent, escapeXml) {
            var xml = '';
            (list || []).forEach(function (proc) {
                if (proc && proc.type === 'jsr223_post') {
                    xml += genJsR223PostProcessorXml(proc, indent, escapeXml);
                } else {
                    xml += adv.genBeanShellXml(proc, indent, escapeXml);
                }
            });
            return xml;
        };
    }

    function boot() {
        patchScenarioAdvanced();
    }

    global.JmxJsr223PostProcessor = {
        genXml: genJsR223PostProcessorXml,
        parseElement: parseElement,
        patch: patchScenarioAdvanced
    };

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(typeof window !== 'undefined' ? window : this));
