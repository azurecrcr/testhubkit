/**
 * JMX 导出专用 · 计划变量补齐（保留 ${BUILD_ID} 等引用形式，隔离模块）
 */
(function (global) {
    'use strict';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function mergeMissingPlanVariablesForExport(data) {
        var VC = global.JmsJmxVariableCollectV1;
        if (!VC || typeof VC.mergeMissingPlanVariables !== 'function') return data;
        var out = VC.mergeMissingPlanVariables(clone(data));
        if (!out || typeof out !== 'object') return out;
        out.variables = out.variables || {};
        if (data && data.build) {
            var bv = String(data.build);
            if (bv.indexOf('${') >= 0) {
                out.variables.BUILD_ID = bv.indexOf('BUILD_ID') >= 0 ? bv : '${BUILD_ID}';
            }
        }
        return out;
    }

    global.JmsJmxVariableCollectExportV1 = {
        mergeMissingPlanVariablesForExport: mergeMissingPlanVariablesForExport
    };
}(typeof window !== 'undefined' ? window : this));
