/**
 * XPathExtractor · JMX 导入/导出（隔离模块，仅 TG/步骤级 xpath_extract）
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

    function getBoolProp(el, name, defaultVal) {
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                return (nodes[i].textContent || '').trim() === 'true';
            }
        }
        return !!defaultVal;
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

    function boolXml(name, val) {
        return '  <boolProp name="' + name + '">' + (val ? 'true' : 'false') + '</boolProp>\n';
    }

    function genXPathExtractorXml(item, indent, escapeXml) {
        if (!item || item.type !== 'xpath_extract') return '';
        var en = item.enabled === false ? 'false' : 'true';
        var testName = item.name || ('XPath提取器 ' + (item.refname || ''));
        var xml = indent + '<XPathExtractor guiclass="XPathExtractorGui" testclass="XPathExtractor" testname="' +
            escapeXml(testName) + '" enabled="' + en + '">\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += appendScopeXml(item, indent, escapeXml);
        xml += indent + '  <stringProp name="XPathExtractor.refname">' + escapeXml(item.refname || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="XPathExtractor.xpathQuery">' + escapeXml(item.xpath_query || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="XPathExtractor.default">' +
            escapeXml(item.default_value !== undefined ? String(item.default_value) : '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="XPathExtractor.match_number">' +
            escapeXml(item.match_number !== undefined ? String(item.match_number) : '-1') + '</stringProp>\n';
        xml += indent + boolXml('XPathExtractor.validate', !!item.validate_xml);
        xml += indent + boolXml('XPathExtractor.whitespace', !!item.ignore_whitespace);
        xml += indent + boolXml('XPathExtractor.tolerant', !!item.use_tidy);
        xml += indent + boolXml('XPathExtractor.namespace', !!item.use_namespaces);
        xml += indent + boolXml('XPathExtractor.reportErrors', !!item.report_errors);
        xml += indent + boolXml('XPathExtractor.showWarnings', !!item.show_warnings);
        xml += indent + boolXml('XPathExtractor.quiet', item.quiet !== false);
        xml += indent + boolXml('XPathExtractor.downloadDTDs', !!item.fetch_external_dtds);
        xml += indent + boolXml('XPathExtractor.fragment', !!item.return_fragment);
        xml += indent + '</XPathExtractor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function parseElement(node) {
        if (!node) return null;
        var xpathQuery = getStringProp(node, 'XPathExtractor.xpathQuery');
        var refname = getStringProp(node, 'XPathExtractor.refname');
        if (!xpathQuery && !refname) return null;
        var scope = getStringProp(node, 'Sample.scope') || getStringProp(node, 'scope');
        return {
            type: 'xpath_extract',
            name: node.getAttribute('testname') || 'XPath提取器',
            enabled: node.getAttribute('enabled') !== 'false',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            apply_to: scopeToApplyTo(scope),
            apply_to_variable: getStringProp(node, 'Scope.variable') || '',
            use_tidy: getBoolProp(node, 'XPathExtractor.tolerant', false),
            quiet: getBoolProp(node, 'XPathExtractor.quiet', true),
            report_errors: getBoolProp(node, 'XPathExtractor.reportErrors', false),
            show_warnings: getBoolProp(node, 'XPathExtractor.showWarnings', false),
            use_namespaces: getBoolProp(node, 'XPathExtractor.namespace', false),
            validate_xml: getBoolProp(node, 'XPathExtractor.validate', false),
            ignore_whitespace: getBoolProp(node, 'XPathExtractor.whitespace', false),
            fetch_external_dtds: getBoolProp(node, 'XPathExtractor.downloadDTDs', false),
            return_fragment: getBoolProp(node, 'XPathExtractor.fragment', false),
            refname: refname,
            xpath_query: xpathQuery,
            match_number: getStringProp(node, 'XPathExtractor.match_number') || '-1',
            default_value: getStringProp(node, 'XPathExtractor.default') || ''
        };
    }

    global.JmxXPathExtractor = {
        genXml: genXPathExtractorXml,
        parseElement: parseElement
    };
    function patchSamplerChildrenForXPath() {
        var adv = global.JmxScenarioAdvanced;
        if (!adv || adv._xpathProcSamplerPatch) return;
        var prevGen = adv.genSamplerChildrenAdvanced;
        if (typeof prevGen !== 'function') return;
        adv._xpathProcSamplerPatch = true;
        adv.genSamplerChildrenAdvanced = function (st, childPad, helpers) {
            var escapeXml = helpers.escapeXml;
            var xpathProcs = (st.processors || []).filter(function (p) {
                return p && p.type === 'xpath_extract';
            });
            var otherProcs = (st.processors || []).filter(function (p) {
                return !p || p.type !== 'xpath_extract';
            });
            var stOther = Object.assign({}, st, { processors: otherProcs });
            var xml = prevGen.call(adv, stOther, childPad, helpers);
            xpathProcs.forEach(function (proc) {
                if (global.JmxXPathExtractor && typeof global.JmxXPathExtractor.genXml === 'function') {
                    xml += global.JmxXPathExtractor.genXml(proc, childPad, escapeXml);
                }
            });
            return xml;
        };
    }

    function bootXPathSamplerPatch() {
        patchSamplerChildrenForXPath();
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bootXPathSamplerPatch);
    } else {
        bootXPathSamplerPatch();
    }

}(typeof window !== 'undefined' ? window : this));
