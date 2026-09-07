/**
 * 线程组断言解析（隔离模块 · 与 HTTP 步骤断言 resolver 独立）
 */
(function (global) {
    'use strict';

    var ASSERT_TYPES = {
        response_assert: 1, json_assert: 1, size_assert: 1, md5hex_assert: 1
    };

    function isValidAssertion(a) {
        if (!a || typeof a !== 'object' || !ASSERT_TYPES[a.type]) return false;
        if (a.type === 'response_assert') {
            return Array.isArray(a.patterns) && a.patterns.some(function (p) {
                return p != null && String(p).trim();
            });
        }
        if (a.type === 'json_assert') {
            return !!(a.json_path != null && String(a.json_path).trim());
        }
        if (a.type === 'size_assert') {
            return a.size_bytes != null && String(a.size_bytes).trim() !== '' && !isNaN(Number(a.size_bytes));
        }
        if (a.type === 'md5hex_assert') {
            var hex = a.md5_hex != null ? String(a.md5_hex).trim().toLowerCase() : '';
            return /^[a-f0-9]{32}$/.test(hex);
        }
        return false;
    }

    function normalizeAssertionList(list) {
        if (!Array.isArray(list)) return [];
        var out = [];
        list.forEach(function (a) {
            if (!isValidAssertion(a)) return;
            if (a.type === 'response_assert') {
                out.push({
                    type: 'response_assert',
                    name: a.name ? String(a.name) : '响应断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    apply_to: a.apply_to ? String(a.apply_to) : 'main_only',
                    jmeter_variable: a.jmeter_variable != null ? String(a.jmeter_variable) : '',
                    test_field: a.test_field ? String(a.test_field) : 'response_text',
                    ignore_status: !!a.ignore_status,
                    match_mode: a.match_mode ? String(a.match_mode) : 'substring',
                    match_not: !!a.match_not,
                    match_or: !!a.match_or,
                    jmeter_test_type: a.jmeter_test_type != null ? Number(a.jmeter_test_type) : undefined,
                    patterns: Array.isArray(a.patterns) ? a.patterns.map(String) : [],
                    custom_message: a.custom_message != null ? String(a.custom_message) : ''
                });
                return;
            }
            if (a.type === 'json_assert') {
                out.push({
                    type: 'json_assert',
                    name: a.name ? String(a.name) : 'JSON断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    json_path: a.json_path ? String(a.json_path) : '$.',
                    additionally_assert_value: !!a.additionally_assert_value,
                    is_regex: !!a.is_regex,
                    expected: a.expected != null ? String(a.expected) : '',
                    expect_null: !!a.expect_null,
                    invert: !!a.invert
                });
                return;
            }
            if (a.type === 'size_assert') {
                out.push({
                    type: 'size_assert',
                    name: a.name ? String(a.name) : '大小断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    apply_to: a.apply_to ? String(a.apply_to) : 'main_only',
                    jmeter_variable: a.jmeter_variable != null ? String(a.jmeter_variable) : '',
                    test_field: a.test_field ? String(a.test_field) : 'full_response',
                    size_bytes: a.size_bytes != null ? String(a.size_bytes) : '',
                    compare_operator: a.compare_operator ? String(a.compare_operator) : 'eq'
                });
                return;
            }
            if (a.type === 'md5hex_assert') {
                out.push({
                    type: 'md5hex_assert',
                    name: a.name ? String(a.name) : 'MD5Hex断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    md5_hex: a.md5_hex != null ? String(a.md5_hex).trim().toLowerCase() : ''
                });
            }
        });
        return out;
    }

    function parseAssertionsFromYaml(tg) {
        var list = [];
        if (!tg || !Array.isArray(tg.assertions)) return list;
        tg.assertions.forEach(function (a) {
            if (!a || typeof a !== 'object') return;
            var type = String(a.type || '').trim();
            if (!ASSERT_TYPES[type]) return;
            if (type === 'response_assert') {
                var patternsYaml = [];
                if (Array.isArray(a.patterns)) {
                    a.patterns.forEach(function (p) {
                        var s = p != null ? String(p).trim() : '';
                        if (s) patternsYaml.push(s);
                    });
                }
                if (!patternsYaml.length) return;
                list.push({
                    type: 'response_assert',
                    name: a.name ? String(a.name) : '响应断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    apply_to: a.apply_to ? String(a.apply_to) : 'main_only',
                    jmeter_variable: a.jmeter_variable != null ? String(a.jmeter_variable) : '',
                    test_field: a.test_field ? String(a.test_field) : 'response_text',
                    ignore_status: !!a.ignore_status,
                    match_mode: a.match_mode ? String(a.match_mode) : 'substring',
                    match_not: !!a.match_not,
                    match_or: !!a.match_or,
                    patterns: patternsYaml,
                    custom_message: a.custom_message != null ? String(a.custom_message) : ''
                });
                return;
            }
            if (type === 'json_assert') {
                var jsonPath = a.json_path != null ? String(a.json_path).trim() : '';
                if (!jsonPath) return;
                list.push({
                    type: 'json_assert',
                    name: a.name ? String(a.name) : 'JSON断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    json_path: jsonPath,
                    additionally_assert_value: !!a.additionally_assert_value,
                    is_regex: !!a.is_regex,
                    expected: a.expected != null ? String(a.expected) : '',
                    expect_null: !!a.expect_null,
                    invert: !!a.invert
                });
                return;
            }
            if (type === 'size_assert') {
                var sizeBytes = a.size_bytes != null ? String(a.size_bytes).trim() : '';
                if (!sizeBytes || isNaN(Number(sizeBytes))) return;
                list.push({
                    type: 'size_assert',
                    name: a.name ? String(a.name) : '大小断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    apply_to: a.apply_to ? String(a.apply_to) : 'main_only',
                    jmeter_variable: a.jmeter_variable != null ? String(a.jmeter_variable) : '',
                    test_field: a.test_field ? String(a.test_field) : 'full_response',
                    size_bytes: sizeBytes,
                    compare_operator: a.compare_operator ? String(a.compare_operator) : 'eq'
                });
                return;
            }
            if (type === 'md5hex_assert') {
                var md5Hex = a.md5_hex != null ? String(a.md5_hex).trim().toLowerCase() : '';
                if (!/^[a-f0-9]{32}$/.test(md5Hex)) return;
                list.push({
                    type: 'md5hex_assert',
                    name: a.name ? String(a.name) : 'MD5Hex断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    md5_hex: md5Hex
                });
            }
        });
        return list;
    }

    function getTgAssertions(tg) {
        if (!tg || !Array.isArray(tg.assertions)) return [];
        return normalizeAssertionList(tg.assertions);
    }

    function sanitizeImportedTgAssertions(tg) {
        if (!tg || typeof tg !== 'object') return tg;
        var list = getTgAssertions(tg);
        tg.assertions = list;
        return tg;
    }

    function assertionsToYaml(assertions) {
        var list = normalizeAssertionList(assertions);
        return list.length ? list : undefined;
    }

    global.JmsTgAssertResolver = {
        parseAssertionsFromYaml: parseAssertionsFromYaml,
        getTgAssertions: getTgAssertions,
        sanitizeImportedTgAssertions: sanitizeImportedTgAssertions,
        assertionsToYaml: assertionsToYaml,
        isValidAssertion: isValidAssertion
    };
}(typeof window !== 'undefined' ? window : this));
