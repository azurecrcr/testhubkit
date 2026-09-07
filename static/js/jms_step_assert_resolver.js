/**
 * HTTP 步骤断言解析（隔离模块 · 修复 JMX 导入 phantom 状态码断言）
 */
(function (global) {
    'use strict';

    var ASSERT_TYPES = {
        status: 1, contains: 1, not_contains: 1, duration: 1, json: 1, xml: 1, xpath: 1, size: 1,
        jsr223_assert: 1, response_assert: 1, json_assert: 1, size_assert: 1, md5hex_assert: 1
    };

    function isValidAssertion(a) {
        if (!a || typeof a !== 'object' || !ASSERT_TYPES[a.type]) return false;
        if (a.type === 'jsr223_assert') {
            return !!(a.script != null && String(a.script).trim());
        }
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
        return !!(a.value != null && String(a.value).trim());
    }

    function normalizeAssertionList(list) {
        if (!Array.isArray(list)) return [];
        var src = list;
        if (global.JmsStepAssertLegacyMigrate &&
            typeof global.JmsStepAssertLegacyMigrate.migrateList === 'function') {
            src = global.JmsStepAssertLegacyMigrate.migrateList(list);
        }
        var out = [];
        src.forEach(function (a) {
            if (!isValidAssertion(a)) return;
            if (a.type === 'jsr223_assert') {
                out.push({
                    type: 'jsr223_assert',
                    name: a.name ? String(a.name) : (a.jmeter_name ? String(a.jmeter_name) : 'JSR223 断言'),
                    script: a.script !== undefined ? String(a.script) : '',
                    language: a.language ? String(a.language) : 'groovy',
                    enabled: a.enabled !== false
                });
                return;
            }
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
                return;
            }
            out.push({
                type: String(a.type).trim(),
                value: String(a.value).trim(),
                expected: a.expected !== undefined && a.expected !== null ? String(a.expected).trim() : undefined,
                operator: a.operator ? String(a.operator) : undefined,
                custom_message: a.custom_message ? String(a.custom_message) : undefined,
                jmeter_test_type: a.jmeter_test_type != null ? Number(a.jmeter_test_type) : undefined,
                jmeter_test_field: a.jmeter_test_field ? String(a.jmeter_test_field) : undefined,
                jmeter_name: a.jmeter_name ? String(a.jmeter_name) : undefined
            });
        });
        return out;
    }

    /** YAML 加载：仅当未显式提供空 assertions 数组时，才从 legacy assert_status 补全 */
    function parseAssertionsFromYaml(st) {
        var list = [];
        var hasAssertionsKey = !!(st && Array.isArray(st.assertions));
        if (hasAssertionsKey) {
            st.assertions.forEach(function (a) {
                if (!a || typeof a !== 'object') return;
                var type = String(a.type || '').trim();
                if (!ASSERT_TYPES[type]) return;
                if (type === 'jsr223_assert') {
                    var script = a.script !== undefined ? String(a.script) : String(a.value || '');
                    if (!script.trim()) return;
                    list.push({
                        type: 'jsr223_assert',
                        name: a.name ? String(a.name) : 'JSR223 断言',
                        script: script,
                        language: a.language ? String(a.language) : 'groovy',
                        enabled: a.enabled !== false
                    });
                    return;
                }
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
                        jmeter_test_type: a.jmeter_test_type != null ? Number(a.jmeter_test_type) : undefined,
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
                    return;
                }
                var value = a.value !== undefined && a.value !== null ? String(a.value).trim() : '';
                if (!value) return;
                var item = { type: type, value: value };
                if (a.expected !== undefined && a.expected !== null && String(a.expected).trim()) {
                    item.expected = String(a.expected).trim();
                }
                if (a.operator) item.operator = String(a.operator);
                if (a.custom_message) item.custom_message = String(a.custom_message);
                if (a.jmeter_test_type != null) item.jmeter_test_type = Number(a.jmeter_test_type);
                if (a.jmeter_test_field) item.jmeter_test_field = String(a.jmeter_test_field);
                if (a.jmeter_name) item.jmeter_name = String(a.jmeter_name);
                list.push(item);
            });
        }
        if (!hasAssertionsKey &&
            st && st.assert_status !== undefined && st.assert_status !== null && st.assert_status !== '') {
            if (!list.some(function (a) { return a.type === 'status'; })) {
                list.unshift({ type: 'status', value: String(st.assert_status) });
            }
        }
        return list;
    }

    /** 运行时读取：只认 assertions 数组，不再从 orphan assert_status 合成 */
    function getStepAssertions(step) {
        if (!step || !Array.isArray(step.assertions)) return [];
        return normalizeAssertionList(step.assertions);
    }

    function syncAssertStatusFromAssertions(step) {
        if (!step || typeof step !== 'object') return step;
        var status = (step.assertions || []).find(function (a) { return a && a.type === 'status'; });
        if (!status) {
            status = (step.assertions || []).find(function (a) {
                return a && a.type === 'response_assert' && a.test_field === 'response_code' &&
                    Array.isArray(a.patterns) && a.patterns.length;
            });
            if (status) {
                step.assert_status = String(status.patterns[0]);
            } else {
                step.assert_status = '';
            }
        } else {
            step.assert_status = status.value;
        }
        if (!getStepAssertions(step).length) {
            step.assertions = [];
            step.assert_status = '';
        }
        return step;
    }

    /** JMX 导入 / YAML 加载后：无断言则清空 legacy 字段 */
    function sanitizeImportedStepAssertions(step) {
        if (!step || typeof step !== 'object' || !step.method) return step;
        var list = getStepAssertions(step);
        if (list.length) {
            step.assertions = list;
            syncAssertStatusFromAssertions(step);
            return step;
        }
        step.assertions = [];
        step.assert_status = '';
        delete step.assert_status;
        return step;
    }

    global.JmsStepAssertResolver = {
        parseAssertionsFromYaml: parseAssertionsFromYaml,
        getStepAssertions: getStepAssertions,
        syncAssertStatusFromAssertions: syncAssertStatusFromAssertions,
        sanitizeImportedStepAssertions: sanitizeImportedStepAssertions,
        isValidAssertion: isValidAssertion
    };
}(typeof window !== 'undefined' ? window : this));
