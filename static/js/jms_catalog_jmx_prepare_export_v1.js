/**
 * catalog JMX 导出前整形编排（隔离模块，仅导出链路，不改 jms_catalog_jmx_prepare.js）
 */
(function (global) {
    'use strict';

    function prepareScenarioForJmxExport(data) {
        if (!data || typeof data !== 'object') return data;
        var out = data;
        var P = global.JmsCatalogJmxPrepare;
        if (P && typeof P.prepareScenarioForJmx === 'function') {
            out = P.prepareScenarioForJmx(out);
        }
        var VCE = global.JmsJmxVariableCollectExportV1;
        if (VCE && typeof VCE.mergeMissingPlanVariablesForExport === 'function') {
            out = VCE.mergeMissingPlanVariablesForExport(out);
        }
        var PD3 = global.JmsJmxPlanVariablesDedupeV3;
        if (PD3 && typeof PD3.filterPlanCatalogArguments === 'function') {
            out = PD3.filterPlanCatalogArguments(out);
        }
        var PD = global.JmsJmxPlanVariablesDedupeV2;
        if (PD && typeof PD.filterPlanCatalogItemsForExport === 'function') {
            out = PD.filterPlanCatalogItemsForExport(out);
        }
        var HD2 = global.JmsCatalogHttpDefaultsDedupeV2;
        if (HD2 && typeof HD2.dedupeScenarioHttpDefaultsV2 === 'function') {
            out = HD2.dedupeScenarioHttpDefaultsV2(out);
        } else {
            var HD = global.JmsCatalogHttpDefaultsDedupeV1;
            if (HD && typeof HD.dedupeScenarioHttpDefaults === 'function') {
                out = HD.dedupeScenarioHttpDefaults(out);
            }
        }
        return out;
    }

    global.JmsCatalogJmxPrepareExportV1 = {
        prepareScenarioForJmxExport: prepareScenarioForJmxExport
    };
}(typeof window !== 'undefined' ? window : this));
