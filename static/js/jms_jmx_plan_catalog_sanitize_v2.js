/**
 * JMX 导出 plan_catalog 净化 V2（export-only）
 */
(function (global) {
    'use strict';
    function propsOf(item) { return (item && item.catalog_props) || {}; }
    function isPlanArgumentsItem(item) {
        if (!item || item.enabled === false) return false;
        if (item.alias === 'Arguments' || item.testclass === 'Arguments') return true;
        return /^计划变量/.test(String(item.name || ''));
    }
    function isEmptyHttpDefaultItem(item) {
        if (!item || item.alias !== 'ConfigTestElement') return false;
        var p = propsOf(item);
        return !(p.domain || p.port || p.protocol || p.path || p.connect_timeout || p.response_timeout);
    }
    function sanitizePlanCatalogForExport(data) {
        if (!data || !data.__jmx_plan_variables_materialized) return data;
        if (!Array.isArray(data.plan_catalog_items)) return data;
        var skipIds = {};
        data.plan_catalog_items = data.plan_catalog_items.filter(function (item) {
            if (!item) return false;
            if (isPlanArgumentsItem(item)) { if (item.id) skipIds[item.id] = true; return false; }
            if (isEmptyHttpDefaultItem(item)) { if (item.id) skipIds[item.id] = true; return false; }
            return true;
        });
        data.__jmx_skip_plan_catalog_arguments = true;
        data.__jmx_skip_plan_catalog_item_ids = skipIds;
        return data;
    }
    global.JmsJmxPlanCatalogSanitizeV2 = {
        isPlanArgumentsItem: isPlanArgumentsItem,
        isEmptyHttpDefaultItem: isEmptyHttpDefaultItem,
        sanitizePlanCatalogForExport: sanitizePlanCatalogForExport
    };
}(typeof window !== 'undefined' ? window : this));
