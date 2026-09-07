/**
 * JMX 导出 · 计划变量去重 V3（resolve 后过滤 plan_catalog Arguments，隔离模块）
 */
(function (global) {
    'use strict';

    function hasPlanVariables(data) {
        return !!(data && data.variables && typeof data.variables === 'object' && Object.keys(data.variables).length);
    }

    function isPlanArgumentsItem(item) {
        if (!item || item.enabled === false) return false;
        if (item.alias === 'Arguments' || item.testclass === 'Arguments') return true;
        var nm = String(item.name || '');
        if (/^计划变量/.test(nm)) return true;
        return false;
    }

    function filterPlanCatalogArguments(data) {
        if (!data || !hasPlanVariables(data)) return data;
        if (Array.isArray(data.plan_catalog_items)) {
            data.plan_catalog_items = data.plan_catalog_items.filter(function (item) {
                return !isPlanArgumentsItem(item);
            });
        }
        data.__jmx_skip_plan_catalog_arguments = true;
        return data;
    }

    function postResolveFilterForExport(data) {
        var out = filterPlanCatalogArguments(data);
        var V2 = global.JmsJmxPlanVariablesDedupeV2;
        if (V2 && typeof V2.filterPlanCatalogItemsForExport === 'function') {
            out = V2.filterPlanCatalogItemsForExport(out);
        }
        return out;
    }

    global.JmsJmxPlanVariablesDedupeV3 = {
        hasPlanVariables: hasPlanVariables,
        isPlanArgumentsItem: isPlanArgumentsItem,
        filterPlanCatalogArguments: filterPlanCatalogArguments,
        postResolveFilterForExport: postResolveFilterForExport
    };
}(typeof window !== 'undefined' ? window : this));
