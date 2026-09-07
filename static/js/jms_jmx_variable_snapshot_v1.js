/**
 * JMX 导出 · 计划变量快照（只读，隔离模块）
 */
(function (global) {
    'use strict';
    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }
    function varsFromPlanCatalog(data) {
        var R = global.JmsPlanCatalogResolve;
        if (R && typeof R.resolvePlanVariablesFromData === 'function') {
            return clone(R.resolvePlanVariablesFromData(data));
        }
        return {};
    }
    function captureVariableSnapshot(data) {
        if (!data || typeof data !== 'object') return data;
        data.__jmx_export_snapshot = {
            dataVariables: clone(data.variables || {}),
            planCatalogVariables: varsFromPlanCatalog(data),
            capturedAt: 'pre-export'
        };
        return data;
    }
    global.JmsJmxVariableSnapshotV1 = {
        captureVariableSnapshot: captureVariableSnapshot,
        varsFromPlanCatalog: varsFromPlanCatalog
    };
}(typeof window !== 'undefined' ? window : this));
