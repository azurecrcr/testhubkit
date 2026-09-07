/**
 * JMX 导出 · 计划变量物化（隔离模块）
 */
(function (global) {
    'use strict';
    function materializePlanVariables(data) {
        if (!data || typeof data !== 'object') return data;
        if (data.__jmx_export_merged_variables) {
            data.variables = data.__jmx_export_merged_variables;
        }
        data.__jmx_plan_variables_materialized = true;
        data.__jmx_materialized_plan_variables = data.variables ? JSON.parse(JSON.stringify(data.variables)) : {};
        return data;
    }
    function restoreMaterializedVariables(data) {
        if (!data || typeof data !== 'object') return data;
        var saved = data.__jmx_materialized_plan_variables || data.__jmx_export_merged_variables;
        if (!saved) return data;
        data.variables = JSON.parse(JSON.stringify(saved));
        var M = global.JmsJmxVariableMergeExportV2;
        if (M && typeof M.mergePlanVariablesForExport === 'function') {
            data = M.mergePlanVariablesForExport(data);
        }
        return materializePlanVariables(data);
    }
    global.JmsJmxVariableMaterializeV1 = {
        materializePlanVariables: materializePlanVariables,
        restoreMaterializedVariables: restoreMaterializedVariables
    };
}(typeof window !== 'undefined' ? window : this));
