/**
 * JMX 导出计划变量写出 V1（单点 TestPlan，export-only）
 */
(function (global) {
    'use strict';
    function getVariablesForTestPlan(data) {
        if (!data) return {};
        if (data.__jmx_materialized_plan_variables) return data.__jmx_materialized_plan_variables;
        if (data.__jmx_export_merged_variables) return data.__jmx_export_merged_variables;
        return data.variables || {};
    }
    function shouldWriteStandaloneArguments() { return false; }
    global.JmsJmxPlanVariablesWriterV1 = {
        getVariablesForTestPlan: getVariablesForTestPlan,
        shouldWriteStandaloneArguments: shouldWriteStandaloneArguments
    };
}(typeof window !== 'undefined' ? window : this));
