/**
 * HTTP 步骤 · JSON 断言 JSONPathAssertion · JMX 解析/生成（隔离模块）
 */
(function (global) {
    'use strict';

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

    function getBoolProp(el, name, defaultVal) {
        var v = getStringProp(el, name);
        if (v === '') return defaultVal;
        return v === 'true';
    }

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'JSONPathAssertion') return null;
        var jsonPath = getStringProp(node, 'JSON_PATH');
        if (!jsonPath) return null;
        var additionally = getBoolProp(node, 'JSONVALIDATION', false);
        return {
            type: 'json_assert',
            name: node.getAttribute('testname') || 'JSON断言',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            enabled: isEnabled(node),
            json_path: jsonPath,
            additionally_assert_value: additionally,
            is_regex: getBoolProp(node, 'ISREGEX', false),
            expected: getStringProp(node, 'EXPECTED_VALUE') || '',
            expect_null: getBoolProp(node, 'EXPECT_NULL', false),
            invert: getBoolProp(node, 'INVERT', false)
        };
    }

    function genXml(assertion, childPad, escapeXml) {
        if (!assertion || assertion.type !== 'json_assert' || assertion.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        childPad = childPad || '';
        var jsonPath = assertion.json_path ? String(assertion.json_path).trim() : '';
        if (!jsonPath) return '';
        var en = assertion.enabled === false ? 'false' : 'true';
        var testName = escapeXml(assertion.name || 'JSON断言');
        var additionally = !!assertion.additionally_assert_value;

        var xml = '';
        xml += childPad + '<JSONPathAssertion guiclass="JSONPathAssertionGui" testclass="JSONPathAssertion" testname="' +
            testName + '" enabled="' + en + '">\n';
        if (assertion.comments && String(assertion.comments).trim()) {
            xml += childPad + '  <stringProp name="TestPlan.comments">' + escapeXml(assertion.comments) + '</stringProp>\n';
        }
        xml += childPad + '  <stringProp name="JSON_PATH">' + escapeXml(jsonPath) + '</stringProp>\n';
        xml += childPad + '  <stringProp name="EXPECTED_VALUE">' + escapeXml(assertion.expected || '') + '</stringProp>\n';
        xml += childPad + '  <boolProp name="JSONVALIDATION">' + (additionally ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <boolProp name="EXPECT_NULL">' + (assertion.expect_null ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <boolProp name="INVERT">' + (assertion.invert ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <boolProp name="ISREGEX">' + (assertion.is_regex ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '</JSONPathAssertion>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    global.JmsHttpJsonAssertionJmx = {
        parseElement: parseElement,
        genXml: genXml
    };
}(typeof window !== 'undefined' ? window : this));
