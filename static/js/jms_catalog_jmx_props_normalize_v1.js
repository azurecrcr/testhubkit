/**
 * catalog_props 导出前字段规范化（隔离模块，仅导出链路）
 */
(function (global) {
    'use strict';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function headersToRows(headers) {
        if (!headers) return [];
        if (Array.isArray(headers)) return headers.slice();
        if (typeof headers !== 'object') return [];
        return Object.keys(headers).map(function (k) {
            return { name: k, value: headers[k] };
        });
    }

    function normalizeHeadersProps(props) {
        if (!props || typeof props !== 'object') return props;
        if (props.headers && !Array.isArray(props.headers)) {
            props.headers = headersToRows(props.headers);
        }
        return props;
    }

    function normalizeCsvProps(props, step) {
        if (!props || typeof props !== 'object') return props;
        var alias = (step && (step.alias || step.testclass)) || '';
        if (alias !== 'CSVDataSet') return props;
        if (props.enabled === undefined && step && step.enabled !== false) {
            props.enabled = true;
        }
        var filename = props.filename ? String(props.filename).trim() : '';
        if (!filename && props.file_content) {
            props.filename = 'data/data.csv';
        }
        if (!props.variable_names && props.variableNames) {
            props.variable_names = props.variableNames;
        }
        if (!props.file_encoding && props.fileEncoding) {
            props.file_encoding = props.fileEncoding;
        }
        return props;
    }

    function synthesizeAssertStatus(props) {
        if (!props || props.assert_status == null || props.assert_status === '') return props;
        var list = Array.isArray(props.assertions) ? props.assertions.slice() : [];
        var hasStatus = list.some(function (a) {
            return a && (a.type === 'response_assert' || a.type === 'response') &&
                (a.test_field === 'response_code' || !a.test_field);
        });
        if (!hasStatus) {
            list.unshift({
                type: 'response_assert',
                name: '响应状态码',
                enabled: true,
                test_field: 'response_code',
                match_mode: 'equals',
                patterns: [String(props.assert_status)]
            });
        }
        props.assertions = list;
        return props;
    }


    function normalizeJdbcProps(props, step) {
        if (!props || typeof props !== 'object') return props;
        var alias = (step && (step.alias || step.testclass)) || '';
        if (alias !== 'JDBCPostProcessor') return props;
        if (!props.dataSource && props.data_source) props.dataSource = props.data_source;
        if (!props.variableNames && props.variable_names) props.variableNames = props.variable_names;
        if (!props.resultVariable && props.result_variable) props.resultVariable = props.result_variable;
        if (!props.queryTypes && props.query_types) props.queryTypes = props.query_types;
        if (!props.queryTypes && props.query_type) props.queryTypes = props.query_type;
        if (!props.queryArguments && props.query_arguments) props.queryArguments = props.query_arguments;
        return props;
    }

    function normalizeCatalogPropsForExport(step) {
        if (!step || step.type !== 'catalog_element') return step;
        var out = clone(step);
        if (!out.catalog_props || typeof out.catalog_props !== 'object') {
            out.catalog_props = {};
        }
        normalizeHeadersProps(out.catalog_props);
        normalizeCsvProps(out.catalog_props, out);
        normalizeJdbcProps(out.catalog_props, out);
        if (out.alias === 'HTTPSamplerProxy' || out.testclass === 'HTTPSamplerProxy') {
            synthesizeAssertStatus(out.catalog_props);
        }
        return out;
    }

    global.JmsCatalogJmxPropsNormalizeV1 = {
        headersToRows: headersToRows,
        normalizeHeadersProps: normalizeHeadersProps,
        normalizeCsvProps: normalizeCsvProps,
        normalizeCatalogPropsForExport: normalizeCatalogPropsForExport
    };
})(typeof window !== 'undefined' ? window : this);
