/**
 * catalog JMX 导出前整形编排 V2（隔离模块）
 */
(function (global) {
    'use strict';
    function prepareScenarioForJmxExport(data) {
        if (!data || typeof data !== 'object') return data;
        var out = data;
        var P = global.JmsCatalogJmxPrepare;
        if (P && typeof P.prepareScenarioForJmx === 'function') out = P.prepareScenarioForJmx(out);
        var SNAP = global.JmsJmxVariableSnapshotV1;
        if (SNAP && typeof SNAP.captureVariableSnapshot === 'function') out = SNAP.captureVariableSnapshot(out);
        var MERGE = global.JmsJmxVariableMergeExportV2;
        if (MERGE && typeof MERGE.mergePlanVariablesForExport === 'function') {
            out = MERGE.mergePlanVariablesForExport(out);
        } else {
            var VCE = global.JmsJmxVariableCollectExportV1;
            if (VCE && typeof VCE.mergeMissingPlanVariablesForExport === 'function') {
                out = VCE.mergeMissingPlanVariablesForExport(out);
            }
        }
        var MAT = global.JmsJmxVariableMaterializeV1;
        if (MAT && typeof MAT.materializePlanVariables === 'function') out = MAT.materializePlanVariables(out);
        var SAN = global.JmsJmxPlanCatalogSanitizeV1;
        if (SAN && typeof SAN.sanitizePlanCatalogForExport === 'function') out = SAN.sanitizePlanCatalogForExport(out);
        var HD3 = global.JmsCatalogHttpDefaultsDedupeV3;
        if (HD3 && typeof HD3.dedupeScenarioHttpDefaultsV3 === 'function') {
            out = HD3.dedupeScenarioHttpDefaultsV3(out);
        } else {
            var HD2 = global.JmsCatalogHttpDefaultsDedupeV2;
            if (HD2 && typeof HD2.dedupeScenarioHttpDefaultsV2 === 'function') out = HD2.dedupeScenarioHttpDefaultsV2(out);
        }
        var SCR = global.JmsJmxScriptSanitizeV1;
        if (SCR && typeof SCR.sanitizeScenario === 'function') out = SCR.sanitizeScenario(out);
        return out;
    }
    global.JmsCatalogJmxPrepareExportV2 = {
        prepareScenarioForJmxExport: prepareScenarioForJmxExport
    };
}(typeof window !== 'undefined' ? window : this));
