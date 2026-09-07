/**
 * JMX 导出变量快照 V2（export-only）
 */
(function (global) {
    'use strict';
    function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }
    function captureExportSnapshot(data) {
        if (!data || typeof data !== 'object') return data;
        var R = global.JmsPlanCatalogResolve;
        data.__jmx_export_snapshot = {
            dataVariables: clone(data.variables || {}),
            planCatalogVariables: R && R.resolvePlanVariablesFromData ? clone(R.resolvePlanVariablesFromData(data)) : {},
            planCatalogHeaders: R && R.resolvePlanHeadersFromData ? clone(R.resolvePlanHeadersFromData(data)) : {},
            buildField: data.build,
            influxRootTags: clone((data.influxdb && data.influxdb.tags) || {}),
            capturedAt: 'pre-export-v2'
        };
        return data;
    }
    global.JmsJmxVariableSnapshotV2 = { captureExportSnapshot: captureExportSnapshot };
}(typeof window !== 'undefined' ? window : this));
