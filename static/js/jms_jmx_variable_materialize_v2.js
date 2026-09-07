/**
 * JMX 导出变量物化 V2（immutable 副本，export-only）
 */
(function (global) {
    'use strict';
    function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }
    function materializePlanVariables(data) {
        if (!data || typeof data !== 'object') return data;
        if (data.__jmx_export_merged_variables) data.variables = clone(data.__jmx_export_merged_variables);
        data.__jmx_plan_variables_materialized = true;
        data.__jmx_materialized_plan_variables = clone(data.variables || {});
        return data;
    }
    function restoreMaterializedVariables(data) {
        if (!data || typeof data !== 'object') return data;
        var saved = data.__jmx_materialized_plan_variables || data.__jmx_export_merged_variables;
        if (!saved) return data;
        data.variables = clone(saved);
        var M = global.JmsJmxVariableMergeExportV3 || global.JmsJmxVariableMergeExportV2;
        if (M && typeof M.mergePlanVariablesForExport === 'function') data = M.mergePlanVariablesForExport(data);
        return materializePlanVariables(data);
    }
    global.JmsJmxVariableMaterializeV2 = { materializePlanVariables: materializePlanVariables, restoreMaterializedVariables: restoreMaterializedVariables };
}(typeof window !== 'undefined' ? window : this));
