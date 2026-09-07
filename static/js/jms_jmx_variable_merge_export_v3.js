/**
 * JMX 导出变量合并 V3（BUILD_ID 保护，export-only）
 */
(function (global) {
    'use strict';
    var EXPORT_SEEDS = { GLOBAL_CHANNEL: 'web', ORDER_BUILD: '1.0.0', BUILD_ID: '${BUILD_ID}', TG_ROLE: 'buyer' };
    var PROTECTED = { BUILD_ID: true, BASE_URL: true };
    function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }
    function mergeObjects(target, source, overwrite) {
        target = target || {};
        Object.keys(source || {}).forEach(function (k) {
            if (!k) return;
            if (PROTECTED[k] && target[k] !== undefined && target[k] !== '') return;
            if (!overwrite && target[k] !== undefined && target[k] !== '') return;
            target[k] = source[k];
        });
        return target;
    }
    function normalizeBuildId(data, vars) {
        vars = vars || {};
        var cat = ((data.__jmx_export_snapshot || {}).planCatalogVariables || {}).BUILD_ID;
        if (cat && String(cat).indexOf('${') >= 0) { vars.BUILD_ID = cat; return vars; }
        if (data && data.build && String(data.build).indexOf('${') >= 0) vars.BUILD_ID = '${BUILD_ID}';
        else if (!vars.BUILD_ID && data && data.build) vars.BUILD_ID = String(data.build);
        return vars;
    }
    function mergePlanVariablesForExport(data) {
        if (!data || typeof data !== 'object') return data;
        var snap = data.__jmx_export_snapshot || {};
        var vars = {};
        mergeObjects(vars, snap.planCatalogVariables || {}, false);
        mergeObjects(vars, snap.dataVariables || {}, false);
        mergeObjects(vars, data.variables || {}, false);
        if (!vars.BASE_URL && data.base_url) vars.BASE_URL = String(data.base_url).replace(/\/$/, '');
        var VC = global.JmsJmxVariableCollectV1;
        if (VC && typeof VC.mergeMissingPlanVariables === 'function') {
            var tmp = clone(data);
            tmp.variables = clone(vars);
            tmp = VC.mergeMissingPlanVariables(tmp);
            mergeObjects(vars, tmp.variables || {}, false);
        }
        Object.keys(EXPORT_SEEDS).forEach(function (k) {
            if (vars[k] === undefined || vars[k] === '') vars[k] = EXPORT_SEEDS[k];
        });
        normalizeBuildId(data, vars);
        if (data.build && String(data.build).indexOf('${') >= 0) vars.BUILD_ID = '${BUILD_ID}';
        var refs = VC && VC.collectReferencedVars ? VC.collectReferencedVars(data) : {};
        Object.keys(refs).forEach(function (name) {
            if (vars[name] !== undefined && vars[name] !== '') return;
            if (EXPORT_SEEDS[name] != null) vars[name] = EXPORT_SEEDS[name];
        });
        data.variables = vars;
        data.__jmx_export_merged_variables = clone(vars);
        return data;
    }
    global.JmsJmxVariableMergeExportV3 = { mergePlanVariablesForExport: mergePlanVariablesForExport, EXPORT_SEEDS: EXPORT_SEEDS };
}(typeof window !== 'undefined' ? window : this));
