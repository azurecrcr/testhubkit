/**
 * JSON PostProcessor · JMX 导入/导出（隔离模块）
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

    function getBoolProp(el, name) {
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim() === 'true';
        }
        return false;
    }

    function scopeToApplyTo(scope) {
        var s = (scope || '').trim();
        if (s === 'all') return 'all';
        if (s === 'children') return 'sub';
        if (s === 'variable') return 'variable';
        return 'main';
    }

    function applyToToScope(applyTo) {
        if (applyTo === 'all') return 'all';
        if (applyTo === 'sub') return 'children';
        if (applyTo === 'variable') return 'variable';
        return 'parent';
    }

    function appendScopeXml(proc, indent, escapeXml) {
        var xml = '';
        var scope = applyToToScope(proc.apply_to || 'main');
        if (scope !== 'parent') {
            xml += indent + '  <stringProp name="Sample.scope">' + escapeXml(scope) + '</stringProp>\n';
        }
        if (scope === 'variable' && proc.apply_to_variable) {
            xml += indent + '  <stringProp name="Scope.variable">' + escapeXml(proc.apply_to_variable) + '</stringProp>\n';
        }
        if (proc.compute_concat) {
            xml += indent + '  <boolProp name="JSONPostProcessor.compute_concat">true</boolProp>\n';
        }
        return xml;
    }

    function genJsonPostProcessorXml(proc, indent, escapeXml) {
        if (!proc || proc.type !== 'json_post') return '';
        var en = proc.enabled === false ? 'false' : 'true';
        var testName = proc.name || ('提取 ' + (proc.var || ''));
        var xml = indent + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="' +
            escapeXml(testName) + '" enabled="' + en + '">\n';
        xml += appendScopeXml(proc, indent, escapeXml);
        xml += indent + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(proc.var || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(proc.json_path || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="JSONPostProcessor.match_numbers">' +
            escapeXml(proc.match_numbers !== undefined ? String(proc.match_numbers) : '0') + '</stringProp>\n';
        xml += indent + '  <stringProp name="JSONPostProcessor.defaultValues">' +
            escapeXml(proc.default_value !== undefined && proc.default_value !== '' ? String(proc.default_value) : 'NOT_FOUND') + '</stringProp>\n';
        xml += indent + '</JSONPostProcessor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function parseElement(node) {
        if (!node) return null;
        var varName = getStringProp(node, 'JSONPostProcessor.referenceNames');
        var jsonPath = getStringProp(node, 'JSONPostProcessor.jsonPathExprs');
        if (!varName || !jsonPath) return null;
        var scope = getStringProp(node, 'Sample.scope') || getStringProp(node, 'scope');
        return {
            type: 'json_post',
            name: node.getAttribute('testname') || 'JSON PostProcessor',
            enabled: node.getAttribute('enabled') !== 'false',
            apply_to: scopeToApplyTo(scope),
            apply_to_variable: getStringProp(node, 'Scope.variable') || '',
            var: varName,
            json_path: jsonPath,
            match_numbers: getStringProp(node, 'JSONPostProcessor.match_numbers') || '0',
            compute_concat: getBoolProp(node, 'JSONPostProcessor.compute_concat'),
            default_value: getStringProp(node, 'JSONPostProcessor.defaultValues') || ''
        };
    }

    function jsonPostVarsFromProcessors(processors) {
        var vars = {};
        (processors || []).forEach(function (p) {
            if (p && p.type === 'json_post' && p.var) vars[p.var] = true;
        });
        return vars;
    }

    function patchSamplerChildrenAdvanced() {
        var adv = global.JmxScenarioAdvanced;
        if (!adv || adv._jsonPostSamplerPatch) return;
        var orig = adv.genSamplerChildrenAdvanced;
        if (typeof orig !== 'function') return;
        adv._jsonPostSamplerPatch = true;
        adv.genSamplerChildrenAdvanced = function (st, childPad, helpers) {
            var escapeXml = helpers.escapeXml;
            var skipVars = jsonPostVarsFromProcessors(st.processors);
            var xml = '';

            (st.extractors || []).forEach(function (ex) {
                if (!ex || !ex.var || !ex.json_path || skipVars[ex.var]) return;
                xml += childPad + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="提取 ' +
                    escapeXml(ex.var) + '" enabled="true">\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(ex.var) + '</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(ex.json_path) + '</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.match_numbers">0</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>\n';
                xml += childPad + '</JSONPostProcessor>\n';
                xml += childPad + '<hashTree/>\n';
            });

            if (st.extract && st.extract.var && st.extract.json_path && !(st.extractors && st.extractors.length) && !skipVars[st.extract.var]) {
                xml += childPad + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="提取 ' +
                    escapeXml(st.extract.var) + '" enabled="true">\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(st.extract.var) + '</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(st.extract.json_path) + '</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.match_numbers">0</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>\n';
                xml += childPad + '</JSONPostProcessor>\n';
                xml += childPad + '<hashTree/>\n';
            }

            (st.processors || []).forEach(function (proc) {
                if (proc && proc.type === 'jsr223_post' && global.JmxJsr223PostProcessor &&
                    typeof global.JmxJsr223PostProcessor.genXml === 'function') {
                    xml += global.JmxJsr223PostProcessor.genXml(proc, childPad, escapeXml);
                } else if (proc && proc.type === 'json_post') {
                    xml += genJsonPostProcessorXml(proc, childPad, escapeXml);
                } else {
                    xml += adv.genBeanShellXml(proc, childPad, escapeXml);
                }
            });

            return xml;
        };
    }

    function boot() {
        patchSamplerChildrenAdvanced();
    }

    global.JmxJsonPostProcessor = {
        genXml: genJsonPostProcessorXml,
        parseElement: parseElement,
        patch: patchSamplerChildrenAdvanced
    };

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(typeof window !== 'undefined' ? window : this));
