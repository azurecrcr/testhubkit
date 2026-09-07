/**
 * catalog JMX 导出前整形（隔离模块，仅导出链路使用，不改页面存储）
 */
(function (global) {
    'use strict';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function walkSteps(list, fn) {
        (list || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
            if (Array.isArray(s.catalog_hash_children)) walkSteps(s.catalog_hash_children, fn);
        });
    }

    function prepareStepForExport(step) {
        if (!step || step.type !== 'catalog_element') return step;
        var out = clone(step);
        var NP = global.JmsCatalogJmxPropsNormalizeV1;
        if (NP && typeof NP.normalizeCatalogPropsForExport === 'function') {
            out = NP.normalizeCatalogPropsForExport(out);
        }
        var HP = global.JmsCatalogHttpSamplerPrepareV1;
        var skipHttpMigrate = HP && typeof HP.shouldSkipMountMigrateForHttp === 'function' && HP.shouldSkipMountMigrateForHttp(out);
        var PM = global.JmsCatalogPropsMountMigrateV1;
        if (!skipHttpMigrate && PM && typeof PM.migrateCatalogPropsMounts === 'function') {
            PM.migrateCatalogPropsMounts(out);
        }
        var MB = global.JmsMountCatalogBridge;
        if (MB && typeof MB.migrateLegacyMountArraysToHash === 'function' && MB.isMountHostStep && MB.isMountHostStep(out)) {
            MB.migrateLegacyMountArraysToHash(out);
        }
        return out;
    }

    function flattenHttpCatalogStep(step) {
        var HP = global.JmsCatalogHttpSamplerPrepareV1;
        if (HP && typeof HP.flattenHttpStepForJmxExport === 'function') {
            return HP.flattenHttpStepForJmxExport(step);
        }
        var props = (step && step.catalog_props) || {};
        var flat = clone(props) || {};
        flat.name = (step && step.name) || flat.name || 'HTTP 请求';
        flat.enabled = step && step.enabled !== false;
        return flat;
    }

    function legacyItemFromCatalog(step) {
        var props = (step && step.catalog_props) || {};
        var item = clone(props) || {};
        item.name = (step && step.name) || item.name || (step && step.label_zh) || '';
        item.enabled = step && step.enabled !== false;
        if (step && step.comments && !item.comments) item.comments = step.comments;
        return item;
    }

    function prepareScenarioForJmx(data) {
        if (!data || typeof data !== 'object') return data;
        var out = clone(data);
        function prepTg(tg) {
            if (!tg) return;
            walkSteps(tg.steps, prepareStepForExport);
        }
        (out.setup_thread_groups || []).forEach(prepTg);
        (out.post_thread_groups || []).forEach(prepTg);
        (out.thread_groups || []).forEach(prepTg);
        var VC = global.JmsJmxVariableCollectV1;
        if (VC && typeof VC.mergeMissingPlanVariables === 'function') {
            out = VC.mergeMissingPlanVariables(out);
        }
        return out;
    }

    global.JmsCatalogJmxPrepare = {
        prepareStepForExport: prepareStepForExport,
        flattenHttpCatalogStep: flattenHttpCatalogStep,
        legacyItemFromCatalog: legacyItemFromCatalog,
        prepareScenarioForJmx: prepareScenarioForJmx
    };
})(typeof window !== 'undefined' ? window : this);
