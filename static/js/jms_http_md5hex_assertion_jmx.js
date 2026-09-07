/**
 * HTTP 步骤 · MD5Hex 断言 · JMX 解析/生成（隔离模块）
 */
(function (global) {
    'use strict';

    var MD5_PROP = 'MD5HexAssertion.size';

    function getStringProp(el, name) {
        if (!el) return '';
        var tags = ['stringProp', 'intProp', 'longProp', 'boolProp'];
        for (var t = 0; t < tags.length; t++) {
            var list = el.getElementsByTagName(tags[t]);
            for (var i = 0; i < list.length; i++) {
                if (list[i].getAttribute('name') === name) {
                    return (list[i].textContent || '').trim();
                }
            }
        }
        return '';
    }

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'MD5HexAssertion') return null;
        var md5Hex = getStringProp(node, MD5_PROP);
        if (!md5Hex) return null;
        return {
            type: 'md5hex_assert',
            name: node.getAttribute('testname') || 'MD5Hex断言',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            enabled: isEnabled(node),
            md5_hex: md5Hex
        };
    }

    function genXml(assertion, childPad, escapeXml) {
        if (!assertion || assertion.type !== 'md5hex_assert' || assertion.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        childPad = childPad || '';
        var md5Hex = assertion.md5_hex != null ? String(assertion.md5_hex).trim() : '';
        if (!md5Hex) return '';
        var en = assertion.enabled === false ? 'false' : 'true';
        var testName = escapeXml(assertion.name || 'MD5Hex断言');

        var xml = '';
        xml += childPad + '<MD5HexAssertion guiclass="MD5HexAssertionGUI" testclass="MD5HexAssertion" testname="' +
            testName + '" enabled="' + en + '">\n';
        if (assertion.comments && String(assertion.comments).trim()) {
            xml += childPad + '  <stringProp name="TestPlan.comments">' + escapeXml(assertion.comments) + '</stringProp>\n';
        }
        xml += childPad + '  <stringProp name="' + MD5_PROP + '">' + escapeXml(md5Hex) + '</stringProp>\n';
        xml += childPad + '</MD5HexAssertion>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    global.JmsHttpMd5hexAssertionJmx = {
        parseElement: parseElement,
        genXml: genXml
    };
}(typeof window !== 'undefined' ? window : this));
