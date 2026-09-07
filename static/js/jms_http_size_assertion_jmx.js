/**
 * HTTP 步骤 · 大小断言 SizeAssertion · JMX 解析/生成（隔离模块）
 */
(function (global) {
    'use strict';

    var TEST_FIELD_MAP = {
        full_response: 'SizeAssertion.response_network_size',
        response_headers: 'SizeAssertion.response_headers',
        response_body: 'SizeAssertion.response_body',
        response_code: 'SizeAssertion.response_code',
        response_message: 'SizeAssertion.response_message'
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

    var OPERATOR_TO_INT = {
        eq: 1, equals: 1, '=': 1,
        ne: 2, '!=': 2,
        gt: 3, '>': 3,
        lt: 4, '<': 4,
        ge: 5, '>=': 5,
        le: 6, '<=': 6
    };

    var INT_TO_OPERATOR = {
        1: 'eq', 2: 'ne', 3: 'gt', 4: 'lt', 5: 'ge', 6: 'le'
    };

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

    function operatorToInt(op) {
        if (op === undefined || op === null || op === '') return 1;
        var k = String(op).trim().toLowerCase();
        return OPERATOR_TO_INT[k] !== undefined ? OPERATOR_TO_INT[k] : 1;
    }

    function intToOperator(n) {
        return INT_TO_OPERATOR[Number(n)] || 'eq';
    }

    function parseApplyTo(el) {
        var scope = getStringProp(el, 'Assertion.scope') || getStringProp(el, 'Scope') || 'parent';
        return SCOPE_REVERSE[scope] || 'main_only';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'SizeAssertion') return null;
        var sizeBytes = getStringProp(node, 'SizeAssertion.size');
        if (sizeBytes === '') return null;
        var testFieldRaw = getStringProp(node, 'SizeAssertion.test_field') || TEST_FIELD_MAP.full_response;
        return {
            type: 'size_assert',
            name: node.getAttribute('testname') || '大小断言',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            enabled: isEnabled(node),
            apply_to: parseApplyTo(node),
            jmeter_variable: getStringProp(node, 'Scope.variable') || getStringProp(node, 'Assertion.variable') || '',
            test_field: TEST_FIELD_REVERSE[testFieldRaw] || 'full_response',
            size_bytes: sizeBytes,
            compare_operator: intToOperator(getIntProp(node, 'SizeAssertion.operator', 1))
        };
    }

    function genXml(assertion, childPad, escapeXml) {
        if (!assertion || assertion.type !== 'size_assert' || assertion.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        childPad = childPad || '';
        var sizeBytes = assertion.size_bytes != null ? String(assertion.size_bytes).trim() : '';
        if (!sizeBytes) return '';

        var testField = TEST_FIELD_MAP[assertion.test_field] || TEST_FIELD_MAP.full_response;
        var applyTo = assertion.apply_to || 'main_only';
        var scope = SCOPE_MAP[applyTo] || 'parent';
        var en = assertion.enabled === false ? 'false' : 'true';
        var testName = escapeXml(assertion.name || '大小断言');
        var opInt = operatorToInt(assertion.compare_operator);

        var xml = '';
        xml += childPad + '<SizeAssertion guiclass="SizeAssertionGui" testclass="SizeAssertion" testname="' +
            testName + '" enabled="' + en + '">\n';
        if (assertion.comments && String(assertion.comments).trim()) {
            xml += childPad + '  <stringProp name="TestPlan.comments">' + escapeXml(assertion.comments) + '</stringProp>\n';
        }
        xml += childPad + '  <stringProp name="SizeAssertion.size">' + escapeXml(sizeBytes) + '</stringProp>\n';
        xml += childPad + '  <intProp name="SizeAssertion.operator">' + opInt + '</intProp>\n';
        xml += childPad + '  <stringProp name="SizeAssertion.test_field">' + escapeXml(testField) + '</stringProp>\n';
        if (scope && scope !== 'parent') {
            xml += childPad + '  <stringProp name="Assertion.scope">' + escapeXml(scope) + '</stringProp>\n';
        }
        if (applyTo === 'jmeter_variable' && assertion.jmeter_variable) {
            xml += childPad + '  <stringProp name="Scope.variable">' +
                escapeXml(assertion.jmeter_variable) + '</stringProp>\n';
        }
        xml += childPad + '</SizeAssertion>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    global.JmsHttpSizeAssertionJmx = {
        parseElement: parseElement,
        genXml: genXml,
        operatorToInt: operatorToInt,
        intToOperator: intToOperator
    };
}(typeof window !== 'undefined' ? window : this));
