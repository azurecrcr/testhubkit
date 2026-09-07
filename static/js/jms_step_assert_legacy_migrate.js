/**
 * HTTP 步骤断言 · 旧格式迁移为新弹窗格式（隔离模块）
 * 导入/YAML 加载时自动转换；duration/jsr223 保留只读导出能力。
 */
(function (global) {
    'use strict';

    var KEEP_READONLY = { duration: 1, jsr223_assert: 1 };

    function isNewType(type) {
        return type === 'response_assert' || type === 'json_assert' ||
            type === 'size_assert' || type === 'md5hex_assert';
    }

    function migrateOne(a) {
        if (!a || typeof a !== 'object') return [];
        var type = String(a.type || '').trim();
        if (!type || isNewType(type) || KEEP_READONLY[type]) return [a];

        if (type === 'status') {
            return [{
                type: 'response_assert',
                name: a.name || '响应状态码',
                comments: a.comments != null ? String(a.comments) : '',
                enabled: a.enabled !== false,
                apply_to: 'main_only',
                test_field: 'response_code',
                match_mode: 'equals',
                patterns: [String(a.value != null ? a.value : '200')]
            }];
        }
        if (type === 'contains') {
            return [{
                type: 'response_assert',
                name: a.name || '响应包含',
                enabled: a.enabled !== false,
                apply_to: 'main_only',
                test_field: 'response_text',
                match_mode: 'substring',
                patterns: [String(a.value || '')]
            }];
        }
        if (type === 'not_contains') {
            return [{
                type: 'response_assert',
                name: a.name || '响应不包含',
                enabled: a.enabled !== false,
                apply_to: 'main_only',
                test_field: 'response_text',
                match_mode: 'substring',
                match_not: true,
                patterns: [String(a.value || '')]
            }];
        }
        if (type === 'json') {
            var jsonPath = a.value != null ? String(a.value).trim() : '';
            if (!jsonPath) return [];
            return [{
                type: 'json_assert',
                name: a.name || 'JSON断言',
                enabled: a.enabled !== false,
                json_path: jsonPath,
                additionally_assert_value: !!(a.expected != null && String(a.expected).trim()),
                expected: a.expected != null ? String(a.expected) : '',
                expect_null: !!a.expect_null,
                invert: !!a.invert,
                is_regex: !!a.is_regex
            }];
        }
        if (type === 'size') {
            return [{
                type: 'size_assert',
                name: a.name || '大小断言',
                enabled: a.enabled !== false,
                apply_to: 'main_only',
                test_field: 'full_response',
                size_bytes: String(a.value != null ? a.value : ''),
                compare_operator: a.operator ? String(a.operator) : 'eq'
            }];
        }
        if (type === 'xpath' || type === 'xml') {
            var hint = a.value != null ? String(a.value).trim() : '';
            if (!hint) return [];
            var pattern = hint.replace(/^\/\//, '');
            return [{
                type: 'response_assert',
                name: a.name || (type === 'xpath' ? 'XPath转响应断言' : 'XML转响应断言'),
                enabled: a.enabled !== false,
                apply_to: 'main_only',
                test_field: 'response_text',
                match_mode: 'substring',
                patterns: [pattern || hint]
            }];
        }
        return [a];
    }

    function migrateList(list) {
        if (!Array.isArray(list)) return [];
        var out = [];
        list.forEach(function (a) {
            migrateOne(a).forEach(function (item) {
                if (item) out.push(item);
            });
        });
        return out;
    }

    function migrateStep(step) {
        if (!step || typeof step !== 'object') return step;
        if (Array.isArray(step.assertions) && step.assertions.length) {
            step.assertions = migrateList(step.assertions);
        }
        if (step.type === 'if_controller' && global.JmsIfMountModel &&
            typeof global.JmsIfMountModel.ensureMountFields === 'function') {
            global.JmsIfMountModel.ensureMountFields(step);
            if (Array.isArray(step.assertions) && step.assertions.length) {
                step.assertions = migrateList(step.assertions);
            }
        }
        return step;
    }

    global.JmsStepAssertLegacyMigrate = {
        migrateOne: migrateOne,
        migrateList: migrateList,
        migrateStep: migrateStep
    };
}(typeof window !== 'undefined' ? window : this));
