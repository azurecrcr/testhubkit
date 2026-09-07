/**
 * RegexExtractor · JMX 导入/导出（隔离模块，仅 TG/步骤级 regex_extract）
 */
(function (global) {
    'use strict';

    var FIELD_TO_USE_HEADERS = {
        body: 'false',
        body_unescaped: 'unescaped',
        body_document: 'as_document',
        response_headers: 'true',
        request_headers: 'request',
        url: 'URL',
        response_code: 'code',
        response_message: 'message'
    };

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

    function normalizeFieldToCheck(val) {
        var v = val ? String(val) : 'body';
        if (FIELD_TO_USE_HEADERS[v]) return v;
        return 'body';
    }

    function useHeadersToField(raw) {
        var v = raw == null ? '' : String(raw).trim();
        if (v === 'false' || v === '') return 'body';
        if (v === 'true') return 'response_headers';
        if (v === 'unescaped') return 'body_unescaped';
        if (v === 'as_document') return 'body_document';
        if (v === 'request') return 'request_headers';
        if (v === 'URL') return 'url';
        if (v === 'code') return 'response_code';
        if (v === 'message') return 'response_message';
        return 'body';
    }

    function fieldToUseHeaders(field) {
        return FIELD_TO_USE_HEADERS[normalizeFieldToCheck(field)] || 'false';
    }

    function appendScopeXml(item, indent, escapeXml) {
        var xml = '';
        var scope = applyToToScope(item.apply_to || 'main');
        if (scope !== 'parent') {
            xml += indent + '  <stringProp name="Sample.scope">' + escapeXml(scope) + '</stringProp>\n';
        }
        if (scope === 'variable' && item.apply_to_variable) {
            xml += indent + '  <stringProp name="Scope.variable">' + escapeXml(item.apply_to_variable) + '</stringProp>\n';
        }
        return xml;
    }

    function genRegexExtractorXml(item, indent, escapeXml) {
        if (!item || item.type !== 'regex_extract') return '';
        var en = item.enabled === false ? 'false' : 'true';
        var testName = item.name || ('正则表达式提取器 ' + (item.refname || ''));
        var xml = indent + '<RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor" testname="' +
            escapeXml(testName) + '" enabled="' + en + '">\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += appendScopeXml(item, indent, escapeXml);
        xml += indent + '  <stringProp name="RegexExtractor.useHeaders">' +
            escapeXml(fieldToUseHeaders(item.field_to_check)) + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.refname">' + escapeXml(item.refname || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.regex">' + escapeXml(item.regex || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.template">' +
            escapeXml(item.template !== undefined && item.template !== '' ? String(item.template) : '$1$') + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.default">' +
            escapeXml(item.default_value !== undefined ? String(item.default_value) : '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.match_number">' +
            escapeXml(item.match_number !== undefined ? String(item.match_number) : '1') + '</stringProp>\n';
        if (item.default_empty) {
            xml += indent + '  <boolProp name="RegexExtractor.default_empty_value">true</boolProp>\n';
        }
        xml += indent + '</RegexExtractor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function parseElement(node) {
        if (!node) return null;
        var refname = getStringProp(node, 'RegexExtractor.refname');
        var regex = getStringProp(node, 'RegexExtractor.regex');
        if (!refname && !regex) return null;
        var scope = getStringProp(node, 'Sample.scope') || getStringProp(node, 'scope');
        return {
            type: 'regex_extract',
            name: node.getAttribute('testname') || '正则表达式提取器',
            enabled: node.getAttribute('enabled') !== 'false',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            apply_to: scopeToApplyTo(scope),
            apply_to_variable: getStringProp(node, 'Scope.variable') || '',
            field_to_check: useHeadersToField(getStringProp(node, 'RegexExtractor.useHeaders')),
            refname: refname,
            regex: regex,
            template: getStringProp(node, 'RegexExtractor.template') || '$1$',
            match_number: getStringProp(node, 'RegexExtractor.match_number') || '1',
            default_value: getStringProp(node, 'RegexExtractor.default') || '',
            default_empty: getBoolProp(node, 'RegexExtractor.default_empty_value')
        };
    }

    global.JmxRegexExtractor = {
        genXml: genRegexExtractorXml,
        parseElement: parseElement,
        normalizeFieldToCheck: normalizeFieldToCheck,
        fieldToUseHeaders: fieldToUseHeaders,
        useHeadersToField: useHeadersToField
    };

    function exportHttpStepProcessor(proc, childPad, escapeXml, adv) {
        if (!proc) return '';
        if (proc.type === 'regex_extract') return genRegexExtractorXml(proc, childPad, escapeXml);
        if (proc.type === 'jsr223_post' && global.JmxJsr223PostProcessor &&
            typeof global.JmxJsr223PostProcessor.genXml === 'function') {
            return global.JmxJsr223PostProcessor.genXml(proc, childPad, escapeXml);
        }
        if (proc.type === 'json_post' && global.JmxJsonPostProcessor &&
            typeof global.JmxJsonPostProcessor.genXml === 'function') {
            return global.JmxJsonPostProcessor.genXml(proc, childPad, escapeXml);
        }
        if (adv && typeof adv.genBeanShellXml === 'function') {
            return adv.genBeanShellXml(proc, childPad, escapeXml);
        }
        return '';
    }

    function patchSamplerChildrenForRegex() {
        var adv = global.JmxScenarioAdvanced;
        if (!adv || adv._regexProcSamplerPatch) return;
        var prevGen = adv.genSamplerChildrenAdvanced;
        if (typeof prevGen !== 'function') return;
        adv._regexProcSamplerPatch = true;
        adv.genSamplerChildrenAdvanced = function (st, childPad, helpers) {
            var escapeXml = helpers.escapeXml;
            var stBase = Object.assign({}, st, { processors: [] });
            var xml = prevGen.call(adv, stBase, childPad, helpers);
            (st.processors || []).forEach(function (proc) {
                xml += exportHttpStepProcessor(proc, childPad, escapeXml, adv);
            });
            return xml;
        };
    }

    function boot() {
        patchSamplerChildrenForRegex();
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(typeof window !== 'undefined' ? window : this));
