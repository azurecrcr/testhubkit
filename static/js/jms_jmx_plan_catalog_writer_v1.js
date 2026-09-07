/**
 * JMX 导出 plan_catalog 写出过滤 V1（export-only）
 */
(function (global) {
    'use strict';
    function shouldSkipItem(data, item) {
        if (!item) return true;
        var S = global.JmsJmxPlanCatalogSanitizeV2 || global.JmsJmxPlanCatalogSanitizeV1;
        if (data && data.__jmx_skip_plan_catalog_arguments && S && typeof S.isPlanArgumentsItem === 'function' && S.isPlanArgumentsItem(item)) return true;
        if (S && typeof S.isEmptyHttpDefaultItem === 'function' && S.isEmptyHttpDefaultItem(item)) return true;
        if (data && data.__jmx_skip_plan_catalog_item_ids && item.id && data.__jmx_skip_plan_catalog_item_ids[item.id]) return true;
        var D = global.JmsCatalogHttpDefaultsDedupeV4;
        if (D && typeof D.isEmptyHttpDefault === 'function' && item.alias === 'ConfigTestElement' && D.isEmptyHttpDefault(item)) return true;
        return false;
    }
    function forEachExportableItem(data, fn) {
        if (!data || !Array.isArray(data.plan_catalog_items) || typeof fn !== 'function') return;
        data.plan_catalog_items.forEach(function (item) {
            if (item && item.type === 'catalog_element' && !shouldSkipItem(data, item)) fn(item);
        });
    }
    global.JmsJmxPlanCatalogWriterV1 = { shouldSkipItem: shouldSkipItem, forEachExportableItem: forEachExportableItem };
}(typeof window !== 'undefined' ? window : this));
