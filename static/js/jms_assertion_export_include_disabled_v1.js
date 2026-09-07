/**
 * JMX 导出 · 断言包含 disabled 状态写出（不修改各断言模块 genXml）
 */
(function (global) {
    'use strict';

    var TYPE_CLASS = {
        response_assert: 'ResponseAssertion',
        json_assert: 'JSONPathAssertion',
        size_assert: 'SizeAssertion',
        md5hex_assert: 'MD5HexAssertion',
        jsr223_assert: 'JSR223Assertion'
    };

    function delegateGen(assertion, samplerName, childPad, escapeXml) {
        if (!assertion || !assertion.type) return '';
        if (assertion.type === 'response_assert' &&
            global.JmsHttpResponseAssertionJmx && typeof global.JmsHttpResponseAssertionJmx.genXml === 'function') {
            return global.JmsHttpResponseAssertionJmx.genXml(assertion, childPad, escapeXml);
        }
        if (assertion.type === 'json_assert' &&
            global.JmsHttpJsonAssertionJmx && typeof global.JmsHttpJsonAssertionJmx.genXml === 'function') {
            return global.JmsHttpJsonAssertionJmx.genXml(assertion, childPad, escapeXml);
        }
        if (assertion.type === 'size_assert' &&
            global.JmsHttpSizeAssertionJmx && typeof global.JmsHttpSizeAssertionJmx.genXml === 'function') {
            return global.JmsHttpSizeAssertionJmx.genXml(assertion, childPad, escapeXml);
        }
        if (assertion.type === 'md5hex_assert' &&
            global.JmsHttpMd5hexAssertionJmx && typeof global.JmsHttpMd5hexAssertionJmx.genXml === 'function') {
            return global.JmsHttpMd5hexAssertionJmx.genXml(assertion, childPad, escapeXml);
        }
        if (assertion.type === 'jsr223_assert' &&
            global.JmxJsr223Assertion && typeof global.JmxJsr223Assertion.genXml === 'function') {
            return global.JmxJsr223Assertion.genXml(assertion, samplerName, childPad, escapeXml);
        }
        return null;
    }

    function fixDisabledEnabledAttr(xml, testclass) {
        if (!xml || !testclass) return xml;
        var re = new RegExp('(<[^>]*testclass="' + testclass + '"[^>]*)enabled="true"', 'i');
        return xml.replace(re, '$1enabled="false"');
    }

    function genAssertionXml(assertion, samplerName, childPad, escapeXml) {
        if (!assertion) return '';
        if (assertion.enabled === false) {
            var clone = Object.assign({}, assertion);
            clone.enabled = true;
            var xml = delegateGen(clone, samplerName, childPad, escapeXml);
            if (xml === null || xml === '') return xml || '';
            return fixDisabledEnabledAttr(xml, TYPE_CLASS[assertion.type] || '');
        }
        var routed = delegateGen(assertion, samplerName, childPad, escapeXml);
        return routed === null ? '' : routed;
    }

    global.JmsAssertionExportIncludeDisabledV1 = {
        genAssertionXml: genAssertionXml
    };
})(typeof window !== 'undefined' ? window : this);
