/**
 * HTTP 步骤 · 响应断言 ResponseAssertion · JMX 解析/生成（隔离模块）
 */
(function (global) {
    'use strict';

    var TEST_STRINGS_PROPS = ['Assertion.test_strings', 'Asserion.test_strings'];

    var TEST_FIELD_MAP = {
        response_text: 'Assertion.response_data',
        response_code: 'Assertion.response_code',
        response_message: 'Assertion.response_message',
        response_headers: 'Assertion.response_headers',
        request_headers: 'Assertion.request_headers',
        url_sample: 'Assertion.url',
        document: 'Assertion.response_data',
        request_data: 'Assertion.request_data'
    };

    var TEST_FIELD_REVERSE = {};
    Object.keys(TEST_FIELD_MAP).forEach(function (k) {
        TEST_FIELD_REVERSE[TEST_FIELD_MAP[k]] = k;
    });

    var SCOPE_MAP = {
        main_and_sub: 'all',
        main_only: 'parent',
        sub_only: 'children',
        jmeter_variable: 'variable'
    };

    var SCOPE_REVERSE = {};
    Object.keys(SCOPE_MAP).forEach(function (k) {
        SCOPE_REVERSE[SCOPE_MAP[k]] = k;
    });

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

    function getBoolProp(el, name, def) {
        var v = getStringProp(el, name);
        if (v === '') return def;
        return v === 'true';
    }

    function getIntProp(el, name, def) {
        var v = getStringProp(el, name);
        if (v === '') return def;
        var n = parseInt(v, 10);
        return isNaN(n) ? def : n;
    }

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
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

    function decodeTestType(testType) {
        var n = Number(testType) || 16;
        var match_mode = 'substring';
        if (n & 8) match_mode = 'equals';
        else if (n & 16) match_mode = 'substring';
        else if (n & 2) match_mode = 'contains';
        else if (n & 1) match_mode = 'matches';
        return {
            match_mode: match_mode,
            match_not: !!(n & 32),
            match_or: !!(n & 64),
            jmeter_test_type: n
        };
    }

    function encodeTestType(matchMode, matchNot, matchOr) {
        var base = { contains: 2, matches: 1, equals: 8, substring: 16 }[matchMode] || 16;
        if (matchNot) base |= 32;
        if (matchOr) base |= 64;
        return base;
    }

    function parseApplyTo(el) {
        var scope = getStringProp(el, 'Assertion.scope') || getStringProp(el, 'Scope') || 'parent';
        return SCOPE_REVERSE[scope] || 'main_only';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'ResponseAssertion') return null;
        var patterns = getTestStrings(node);
        if (!patterns.length) return null;
        var testFieldRaw = getStringProp(node, 'Assertion.test_field') || 'Assertion.response_data';
        var decoded = decodeTestType(getIntProp(node, 'Assertion.test_type', 16));
        return {
            type: 'response_assert',
            name: node.getAttribute('testname') || '响应断言',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            enabled: isEnabled(node),
            apply_to: parseApplyTo(node),
            jmeter_variable: getStringProp(node, 'Scope.variable') || getStringProp(node, 'Assertion.variable') || '',
            test_field: TEST_FIELD_REVERSE[testFieldRaw] || 'response_text',
            ignore_status: getBoolProp(node, 'Assertion.assume_success', false),
            match_mode: decoded.match_mode,
            match_not: decoded.match_not,
            match_or: decoded.match_or,
            jmeter_test_type: decoded.jmeter_test_type,
            patterns: patterns,
            custom_message: getStringProp(node, 'Assertion.custom_message') || ''
        };
    }

    function genXml(assertion, childPad, escapeXml) {
        if (!assertion || assertion.type !== 'response_assert' || assertion.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        childPad = childPad || '';
        var patterns = Array.isArray(assertion.patterns) ? assertion.patterns.filter(function (p) {
            return p != null && String(p).trim();
        }) : [];
        if (!patterns.length) return '';

        var testField = TEST_FIELD_MAP[assertion.test_field] || TEST_FIELD_MAP.response_text;
        var testType = assertion.jmeter_test_type != null && !isNaN(assertion.jmeter_test_type)
            ? Number(assertion.jmeter_test_type)
            : encodeTestType(assertion.match_mode, assertion.match_not, assertion.match_or);
        var applyTo = assertion.apply_to || 'main_only';
        var scope = SCOPE_MAP[applyTo] || 'parent';
        var en = assertion.enabled === false ? 'false' : 'true';
        var testName = escapeXml(assertion.name || '响应断言');

        var xml = '';
        xml += childPad + '<ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="' +
            testName + '" enabled="' + en + '">\n';
        if (assertion.comments && String(assertion.comments).trim()) {
            xml += childPad + '  <stringProp name="TestPlan.comments">' + escapeXml(assertion.comments) + '</stringProp>\n';
        }
        xml += childPad + '  <collectionProp name="Assertion.test_strings">\n';
        patterns.forEach(function (p, idx) {
            xml += childPad + '    <stringProp name="' + idx + '">' + escapeXml(String(p)) + '</stringProp>\n';
        });
        xml += childPad + '  </collectionProp>\n';
        xml += childPad + '  <stringProp name="Assertion.custom_message">' +
            escapeXml(assertion.custom_message || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="Assertion.test_field">' + escapeXml(testField) + '</stringProp>\n';
        xml += childPad + '  <boolProp name="Assertion.assume_success">' +
            (assertion.ignore_status ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <intProp name="Assertion.test_type">' + testType + '</intProp>\n';
        if (scope && scope !== 'parent') {
            xml += childPad + '  <stringProp name="Assertion.scope">' + escapeXml(scope) + '</stringProp>\n';
        }
        if (applyTo === 'jmeter_variable' && assertion.jmeter_variable) {
            xml += childPad + '  <stringProp name="Scope.variable">' +
                escapeXml(assertion.jmeter_variable) + '</stringProp>\n';
        }
        xml += childPad + '</ResponseAssertion>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    global.JmsHttpResponseAssertionJmx = {
        parseElement: parseElement,
        genXml: genXml,
        encodeTestType: encodeTestType,
        decodeTestType: decodeTestType
    };
}(typeof window !== 'undefined' ? window : this));
