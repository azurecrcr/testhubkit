/**
 * catalog 配置写出中心 · 按 alias 路由专用写出器（隔离模块）
 */
(function (global) {
    'use strict';

    function writeStep(step, indent, helpers) {
        if (!step || step.type !== 'catalog_element') return '';
        var P = global.JmsCatalogJmxPrepare;
        var prepared = P && typeof P.prepareStepForExport === 'function' ? P.prepareStepForExport(step) : step;
        var writers = [
            global.JmsCatalogHttpSamplerJmx,
            global.JmsCatalogControllerJmx,
            global.JmsCatalogConfigJmx,
            global.JmsCatalogAuxJmx
        ];
        var i, mod, xml;
        for (i = 0; i < writers.length; i += 1) {
            mod = writers[i];
            if (!mod || typeof mod.genXml !== 'function') continue;
            if (mod === global.JmsCatalogHttpSamplerJmx) {
                if (!mod.isHttpAlias || !mod.isHttpAlias(prepared.alias)) continue;
            } else if (mod.MAP && !mod.MAP[prepared.alias]) {
                continue;
            }
            xml = mod.genXml(prepared, indent, helpers || {});
            if (xml) return xml;
        }
        var Plan = global.JmsPlanCatalogJmxProps;
        if (Plan && typeof Plan.tryGenFromProps === 'function') {
            xml = Plan.tryGenFromProps(prepared, indent);
            if (xml) return xml;
        }
        return '';
    }

    global.JmsCatalogJmxRegistry = {
        writeStep: writeStep
    };
})(typeof window !== 'undefined' ? window : this);
