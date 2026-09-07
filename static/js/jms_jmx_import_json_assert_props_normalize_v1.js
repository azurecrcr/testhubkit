/**
 * JMX 导入 · JSONPathAssertion catalog_props 格式归一化（隔离模块）
 * 解析器 legacy 字段名与 catalog 编辑器字段名不一致时做双向映射。
 */
(function (global) {
    'use strict';

    function toEditorProps(props) {
        if (!props || typeof props !== 'object') {
            return {
                comments: '',
                json_path: '',
                expected_value: '',
                validate_json: false,
                is_regex: false,
                expect_null: false,
                invert: false
            };
        }
        var out = Object.assign({}, props);
        if (!out.json_path && out.value != null) out.json_path = String(out.value);
        if (out.expected_value == null || out.expected_value === '') {
            if (out.expected != null && out.expected !== '') out.expected_value = String(out.expected);
        }
        if (out.validate_json === undefined) {
            out.validate_json = !!(out.additionally_assert_value || out.validate);
        }
        out.is_regex = !!out.is_regex;
        out.expect_null = !!out.expect_null;
        out.invert = !!out.invert;
        delete out.type;
        delete out.expected;
        delete out.value;
        delete out.validate;
        delete out.additionally_assert_value;
        return out;
    }

    function toLegacyProps(props) {
        if (!props || typeof props !== 'object') return props;
        var out = Object.assign({}, props);
        var jsonPath = out.json_path != null ? String(out.json_path) : (out.value != null ? String(out.value) : '');
        var expected = out.expected_value != null ? String(out.expected_value)
            : (out.expected != null ? String(out.expected) : '');
        var additionally = out.validate_json !== undefined
            ? !!out.validate_json
            : !!(out.additionally_assert_value || out.validate);
        return {
            comments: out.comments || '',
            json_path: jsonPath,
            expected: expected,
            additionally_assert_value: additionally,
            is_regex: !!out.is_regex,
            expect_null: !!out.expect_null,
            invert: !!out.invert
        };
    }

    function normalizeJsonAssertProps(props) {
        return toEditorProps(props);
    }

    function isJsonAssertStep(step) {
        return !!(step && step.type === 'catalog_element' && step.alias === 'JSONPathAssertion');
    }

    function normalizeCatalogElementStep(step) {
        if (!isJsonAssertStep(step)) return step;
        step.catalog_props = normalizeJsonAssertProps(step.catalog_props);
        return step;
    }

    function normalizeHashChildren(list) {
        if (!Array.isArray(list)) return list;
        list.forEach(function (child) {
            if (!child) return;
            normalizeCatalogElementStep(child);
            if (Array.isArray(child.catalog_hash_children)) normalizeHashChildren(child.catalog_hash_children);
        });
        return list;
    }

    function normalizeSamplerHostStep(step) {
        if (!step || typeof step !== 'object') return step;
        if (Array.isArray(step.catalog_hash_children)) normalizeHashChildren(step.catalog_hash_children);
        return step;
    }

    global.JmsJmxImportJsonAssertPropsNormalizeV1 = {
        toEditorProps: toEditorProps,
        toLegacyProps: toLegacyProps,
        normalizeJsonAssertProps: normalizeJsonAssertProps,
        normalizeCatalogElementStep: normalizeCatalogElementStep,
        normalizeHashChildren: normalizeHashChildren,
        normalizeSamplerHostStep: normalizeSamplerHostStep
    };
}(typeof window !== 'undefined' ? window : this));
