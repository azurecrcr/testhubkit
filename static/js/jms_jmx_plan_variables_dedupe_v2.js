/**
 * JMX 导出 · 计划变量去重 V2（跳过 plan_catalog Arguments 重复写出，隔离模块）
 */
(function (global) {
    'use strict';

    function hasPlanVariables(data) {
        return !!(data && data.variables && typeof data.variables === 'object' && Object.keys(data.variables).length);
    }

    function filterPlanCatalogItemsForExport(data) {
        if (!data || !hasPlanVariables(data)) return data;
        if (!Array.isArray(data.plan_catalog_items)) return data;
        data.plan_catalog_items = data.plan_catalog_items.filter(function (item) {
            if (!item || item.enabled === false) return true;
            if (item.alias === 'Arguments' || item.testclass === 'Arguments') return false;
            return true;
        });
        return data;
    }

    global.JmsJmxPlanVariablesDedupeV2 = {
        hasPlanVariables: hasPlanVariables,
        filterPlanCatalogItemsForExport: filterPlanCatalogItemsForExport
    };
}(typeof window !== 'undefined' ? window : this));
