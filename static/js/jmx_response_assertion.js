/**
 * JMeter ResponseAssertion 导入/导出（隔离模块）
 * 支持 Assertion.test_strings、Asserion.test_strings 拼写变体、custom_message、test_type/test_field
 */
(function (global) {
    'use strict';

    var TEST_STRINGS_PROPS = ['Assertion.test_strings', 'Asserion.test_strings'];

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

    function getTestStrings(el) {
        var out = [];
        if (!el) return out;
        var coll = el.getElementsByTagName('collectionProp');
        for (var i = 0; i < coll.length; i++) {
            var propName = coll[i].getAttribute('name') || '';
            if (TEST_STRINGS_PROPS.indexOf(propName) < 0) continue;
            var strProps = coll[i].getElementsByTagName('stringProp');
            for (var j = 0; j < strProps.length; j++) {
                var v = (strProps[j].textContent || '').trim();
                if (v) out.push(v);
            }
        }
        return out;
    }

    function parseStatusCodeValue(strings, customMessage, testType) {
        if (strings.length) return strings[0];
        var msg = (customMessage || '').trim();
        if (!msg) return '';
        // 部分 JMX 将期望状态码写在 custom_message（如 test_type=8 且 test_strings 为空）
        if (/^\d{1,3}$/.test(msg)) return msg;
        return '';
    }

    function parseResponseAssertionElement(node) {
        if (!node) return null;
        var testField = getStringProp(node, 'Assertion.test_field') || 'Assertion.response_code';
        var testTypeRaw = getStringProp(node, 'Assertion.test_type');
        var testType = testTypeRaw !== '' ? parseInt(testTypeRaw, 10) : null;
        var customMessage = getStringProp(node, 'Assertion.custom_message');
        var strings = getTestStrings(node);
        var jmeterName = node.getAttribute('testname') || '';

        var base = {
            jmeter_name: jmeterName || undefined,
            jmeter_test_field: testField,
            jmeter_test_type: testType != null && !isNaN(testType) ? testType : undefined
        };

        if (customMessage) base.custom_message = customMessage;

        if (testField === 'Assertion.response_code') {
            var codeVal = parseStatusCodeValue(strings, customMessage, testType);
            if (!codeVal) return null;
            var num = parseInt(codeVal, 10);
            base.type = 'status';
            base.value = isNaN(num) ? codeVal : num;
            // custom_message 若仅为状态码数字，不作为失败提示保留
            if (base.custom_message && String(base.custom_message).trim() === String(codeVal)) {
                delete base.custom_message;
            }
            return base;
        }

        if (testField === 'Assertion.response_data' || testField === 'Assertion.response_headers') {
            var textVal = strings.length ? strings[0] : '';
            if (!textVal) return null;
            var isNot = testType === 6 || testType === 2 && false;
            if (testType === 6) {
                base.type = 'not_contains';
            } else {
                base.type = 'contains';
            }
            base.value = textVal;
            return base;
        }

        // 未知 test_field：若有 test_strings 则按包含文本处理
        if (strings.length) {
            base.type = 'contains';
            base.value = strings[0];
            return base;
        }
        return null;
    }

    function genResponseAssertionXml(assertion, samplerName, childPad, escapeXml) {
        if (!assertion) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        childPad = childPad || '';

        var type = assertion.type;
        if (type !== 'status' && type !== 'contains' && type !== 'not_contains') return '';

        var testField = assertion.jmeter_test_field ||
            (type === 'status' ? 'Assertion.response_code' : 'Assertion.response_data');
        var testType = assertion.jmeter_test_type;
        if (testType == null || isNaN(testType)) {
            if (type === 'status') testType = 8;
            else if (type === 'not_contains') testType = 6;
            else testType = 2;
        }

        var testName = assertion.jmeter_name
            ? escapeXml(assertion.jmeter_name)
            : escapeXml((type + ' ' + assertion.value + ' ' + (samplerName || '')).trim());

        var xml = '';
        xml += childPad + '<ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="' +
            testName + '" enabled="true">\n';
        xml += childPad + '  <collectionProp name="Assertion.test_strings">\n';
        xml += childPad + '    <stringProp name="0">' + escapeXml(String(assertion.value)) + '</stringProp>\n';
        xml += childPad + '  </collectionProp>\n';
        xml += childPad + '  <stringProp name="Assertion.custom_message">' +
            escapeXml(assertion.custom_message || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="Assertion.test_field">' + escapeXml(testField) + '</stringProp>\n';
        xml += childPad + '  <boolProp name="Assertion.assume_success">false</boolProp>\n';
        xml += childPad + '  <intProp name="Assertion.test_type">' + testType + '</intProp>\n';
        xml += childPad + '</ResponseAssertion>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    global.JmxResponseAssertion = {
        parseElement: parseResponseAssertionElement,
        genXml: genResponseAssertionXml,
        getTestStrings: getTestStrings
    };
})(typeof window !== 'undefined' ? window : this);
