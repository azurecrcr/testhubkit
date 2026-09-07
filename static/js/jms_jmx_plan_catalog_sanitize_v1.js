/**
 * JMX 导出 · plan_catalog 净化（物化后删除重复 Arguments，隔离模块）
 */
(function (global) {
    'use strict';
    function isPlanArgumentsItem(item) {
        if (!item || item.enabled === false) return false;
        if (item.alias === 'Arguments' || item.testclass === 'Arguments') return true;
        return /^计划变量/.test(String(item.name || ''));
    }
    function sanitizePlanCatalogForExport(data) {
        if (!data || !data.__jmx_plan_variables_materialized) return data;
        if (!Array.isArray(data.plan_catalog_items)) return data;
        data.plan_catalog_items = data.plan_catalog_items.filter(function (item) {
            return !isPlanArgumentsItem(item);
        });
        data.__jmx_skip_plan_catalog_arguments = true;
        return data;
    }
    global.JmsJmxPlanCatalogSanitizeV1 = {
        isPlanArgumentsItem: isPlanArgumentsItem,
        sanitizePlanCatalogForExport: sanitizePlanCatalogForExport
    };
}(typeof window !== 'undefined' ? window : this));
