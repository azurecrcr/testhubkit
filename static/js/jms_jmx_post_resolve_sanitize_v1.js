/**
 * JMX 导出 · resolve 后净化（恢复变量真相，隔离模块）
 */
(function (global) {
    'use strict';
    function runPostResolveSanitize(data) {
        if (!data || typeof data !== 'object') return data;
        var M = global.JmsJmxVariableMaterializeV1;
        if (M && typeof M.restoreMaterializedVariables === 'function') {
            data = M.restoreMaterializedVariables(data);
        }
        var S = global.JmsJmxPlanCatalogSanitizeV1;
        if (S && typeof S.sanitizePlanCatalogForExport === 'function') {
            data = S.sanitizePlanCatalogForExport(data);
        }
        return data;
    }
    global.JmsJmxPostResolveSanitizeV1 = {
        runPostResolveSanitize: runPostResolveSanitize
    };
}(typeof window !== 'undefined' ? window : this));
