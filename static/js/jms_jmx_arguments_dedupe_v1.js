/**
 * JMX 导出 · 计划级 Arguments 去重（TestPlan 内嵌变量 vs 独立 Arguments 组件）
 */
(function (global) {
    'use strict';

    function hasVariableEntries(variables) {
        return !!(variables && typeof variables === 'object' && Object.keys(variables).length);
    }

    function shouldSkipPublicVariablesComponent(data) {
        if (!data) return false;
        if (!hasVariableEntries(data.variables)) return false;
        var R = global.JmsPlanCatalogResolve;
        if (R && typeof R.shouldSkipLegacyPlanHashExports === 'function' &&
            R.shouldSkipLegacyPlanHashExports(data)) {
            return true;
        }
        return true;
    }

    global.JmsJmxArgumentsDedupeV1 = {
        shouldSkipPublicVariablesComponent: shouldSkipPublicVariablesComponent
    };
})(typeof window !== 'undefined' ? window : this);
