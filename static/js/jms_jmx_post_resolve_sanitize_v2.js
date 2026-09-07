/**
 * JMX 导出 resolve 后净化 V2（export-only）
 */
(function (global) {
    'use strict';
    function runPostResolveSanitize(data) {
        if (!data || typeof data !== 'object') return data;
        var M = global.JmsJmxVariableMaterializeV2 || global.JmsJmxVariableMaterializeV1;
        if (M && typeof M.restoreMaterializedVariables === 'function') data = M.restoreMaterializedVariables(data);
        var S = global.JmsJmxPlanCatalogSanitizeV2 || global.JmsJmxPlanCatalogSanitizeV1;
        if (S && typeof S.sanitizePlanCatalogForExport === 'function') data = S.sanitizePlanCatalogForExport(data);
        data.__jmx_post_resolve_done = true;
        return data;
    }
    global.JmsJmxPostResolveSanitizeV2 = { runPostResolveSanitize: runPostResolveSanitize };
}(typeof window !== 'undefined' ? window : this));
