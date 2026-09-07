/**
 * JSR223Assertion · JMX 导入/导出（隔离模块）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim();
        }
        return '';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'JSR223Assertion') return null;
        return {
            type: 'jsr223_assert',
            name: node.getAttribute('testname') || 'JSR223 断言',
            enabled: node.getAttribute('enabled') !== 'false',
            script: getStringProp(node, 'script') || '',
            language: getStringProp(node, 'scriptLanguage') || 'groovy'
        };
    }

    function genXml(assertion, samplerName, indent, escapeXml) {
        if (!assertion || assertion.type !== 'jsr223_assert' || assertion.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        var en = assertion.enabled === false ? 'false' : 'true';
        var testName = escapeXml(assertion.name || assertion.jmeter_name || ('JSR223 断言 ' + (samplerName || '')));
        var lang = assertion.language || 'groovy';
        var xml = indent + '<JSR223Assertion guiclass="TestBeanGUI" testclass="JSR223Assertion" testname="' + testName + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="cacheKey">true</stringProp>\n';
        xml += indent + '  <stringProp name="filename"></stringProp>\n';
        xml += indent + '  <stringProp name="parameters"></stringProp>\n';
        xml += indent + '  <stringProp name="script">' + escapeXml(assertion.script || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="scriptLanguage">' + escapeXml(lang) + '</stringProp>\n';
        xml += indent + '</JSR223Assertion>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    global.JmxJsr223Assertion = {
        parseElement: parseElement,
        genXml: genXml
    };
}(typeof window !== 'undefined' ? window : this));
