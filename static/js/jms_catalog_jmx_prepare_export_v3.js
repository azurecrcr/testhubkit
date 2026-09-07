/**
 * JMX 导出前整形编排 V3（export-only）
 */
(function (global) {
    'use strict';
    function prepareScenarioForJmxExport(data) {
        if (!data || typeof data !== 'object') return data;
        var out = data;
        var P = global.JmsJmxExportPipelineV1;
        var base = global.JmsCatalogJmxPrepare;
        if (base && typeof base.prepareScenarioForJmx === 'function') out = base.prepareScenarioForJmx(out);
        if (P) P.markStage(out, 'BASE_PREPARE');
        var SNAP = global.JmsJmxVariableSnapshotV2 || global.JmsJmxVariableSnapshotV1;
        if (SNAP && SNAP.captureExportSnapshot) { out = SNAP.captureVariableSnapshot ? SNAP.captureVariableSnapshot(out) : SNAP.captureExportSnapshot(out); }
        if (P) P.markStage(out, 'SNAPSHOT');
        var MERGE = global.JmsJmxVariableMergeExportV3 || global.JmsJmxVariableMergeExportV2;
        if (MERGE && MERGE.mergePlanVariablesForExport) out = MERGE.mergePlanVariablesForExport(out);
        var MAT = global.JmsJmxVariableMaterializeV2 || global.JmsJmxVariableMaterializeV1;
        if (MAT && MAT.materializePlanVariables) out = MAT.materializePlanVariables(out);
        if (P) P.markStage(out, 'MERGE_MATERIALIZE');
        var SAN = global.JmsJmxPlanCatalogSanitizeV2 || global.JmsJmxPlanCatalogSanitizeV1;
        if (SAN && SAN.sanitizePlanCatalogForExport) out = SAN.sanitizePlanCatalogForExport(out);
        if (P) P.markStage(out, 'CATALOG_SANITIZE');
        var HD = global.JmsCatalogHttpDefaultsDedupeV4 || global.JmsCatalogHttpDefaultsDedupeV3;
        if (HD && HD.dedupeScenarioHttpDefaultsV4) out = HD.dedupeScenarioHttpDefaultsV4(out);
        else if (HD && HD.dedupeScenarioHttpDefaultsV3) out = HD.dedupeScenarioHttpDefaultsV3(out);
        if (P) P.markStage(out, 'HTTP_DEDUPE');
        var SCR = global.JmsJmxScriptSanitizeV1;
        if (SCR && SCR.sanitizeScenario) out = SCR.sanitizeScenario(out);
        if (P) P.markStage(out, 'SCRIPT_SANITIZE');
        if (P) P.markStage(out, 'READY_FOR_GEN');
        return out;
    }
    global.JmsCatalogJmxPrepareExportV3 = { prepareScenarioForJmxExport: prepareScenarioForJmxExport };
}(typeof window !== 'undefined' ? window : this));
