/**
 * catalog HTTP 取样器导出前整形（隔离模块，仅 catalog HTTP 导出链路）
 */
(function (global) {
    'use strict';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function isHttpAlias(alias) {
        return alias === 'HTTPSamplerProxy' || alias === 'HTTPSampler' || alias === 'HTTPSampler2';
    }

    function rowsToHeadersObject(rows) {
        if (!rows) return {};
        if (!Array.isArray(rows)) return (typeof rows === 'object') ? clone(rows) : {};
        var o = {};
        rows.forEach(function (r) {
            if (!r) return;
            var k = r.name || r.key || '';
            if (k) o[k] = r.value != null ? String(r.value) : '';
        });
        return o;
    }

    function flattenHttpStepForJmxExport(step) {
        if (!step) return {};
        var props = step.catalog_props || {};
        var flat = clone(props) || {};
        flat.name = step.name || flat.name || 'HTTP 请求';
        flat.enabled = step.enabled !== false;
        if (Array.isArray(flat.headers)) {
            flat.headers = rowsToHeadersObject(flat.headers);
        }
        return flat;
    }

    function shouldSkipMountMigrateForHttp(step) {
        if (!step || step.type !== 'catalog_element') return false;
        return isHttpAlias(step.alias) || isHttpAlias(step.testclass);
    }

    global.JmsCatalogHttpSamplerPrepareV1 = {
        isHttpAlias: isHttpAlias,
        flattenHttpStepForJmxExport: flattenHttpStepForJmxExport,
        shouldSkipMountMigrateForHttp: shouldSkipMountMigrateForHttp,
        rowsToHeadersObject: rowsToHeadersObject
    };
})(typeof window !== 'undefined' ? window : this);
