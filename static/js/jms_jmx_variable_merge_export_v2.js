/**
 * JMX 导出 · 计划变量合并 V2（先合并后去重，隔离模块）
 */
(function (global) {
    'use strict';
    var EXPORT_VAR_SEEDS = {
        GLOBAL_CHANNEL: 'web',
        ORDER_BUILD: '1.0.0',
        BUILD_ID: '${BUILD_ID}',
        TG_ROLE: 'buyer'
    };
    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }
    function mergeObjects(target, source, overwrite) {
        target = target || {};
        Object.keys(source || {}).forEach(function (k) {
            if (!k) return;
            if (!overwrite && target[k] !== undefined && target[k] !== '') return;
            target[k] = source[k];
        });
        return target;
    }
    function normalizeBuildId(data, vars) {
        vars = vars || {};
        if (data && data.build) {
            var bv = String(data.build);
            if (bv.indexOf('${') >= 0) vars.BUILD_ID = vars.BUILD_ID || '${BUILD_ID}';
            else if (!vars.BUILD_ID) vars.BUILD_ID = bv;
        }
        return vars;
    }
    function mergePlanVariablesForExport(data) {
        if (!data || typeof data !== 'object') return data;
        var out = data;
        var vars = {};
        var snap = out.__jmx_export_snapshot || {};
        mergeObjects(vars, snap.planCatalogVariables || {}, false);
        mergeObjects(vars, snap.dataVariables || {}, false);
        mergeObjects(vars, out.variables || {}, false);
        if (!vars.BASE_URL && out.base_url) vars.BASE_URL = String(out.base_url).replace(/\/$/, '');
        var VC = global.JmsJmxVariableCollectV1;
        if (VC && typeof VC.mergeMissingPlanVariables === 'function') {
            var tmp = clone(out);
            tmp.variables = clone(vars);
            tmp = VC.mergeMissingPlanVariables(tmp);
            mergeObjects(vars, tmp.variables || {}, false);
        }
        Object.keys(EXPORT_VAR_SEEDS).forEach(function (k) {
            if (vars[k] === undefined || vars[k] === '') vars[k] = EXPORT_VAR_SEEDS[k];
        });
        normalizeBuildId(out, vars);
        var catBuild = (snap.planCatalogVariables || {}).BUILD_ID;
        if (catBuild && String(catBuild).indexOf('${') >= 0) {
            vars.BUILD_ID = catBuild;
        } else if (out.build && String(out.build).indexOf('${') >= 0) {
            vars.BUILD_ID = '${BUILD_ID}';
        }
        var refs = VC && VC.collectReferencedVars ? VC.collectReferencedVars(out) : {};
        Object.keys(refs).forEach(function (name) {
            if (vars[name] !== undefined && vars[name] !== '') return;
            if (EXPORT_VAR_SEEDS[name] != null) vars[name] = EXPORT_VAR_SEEDS[name];
        });
        out.variables = vars;
        out.__jmx_export_merged_variables = clone(vars);
        return out;
    }
    global.JmsJmxVariableMergeExportV2 = {
        EXPORT_VAR_SEEDS: EXPORT_VAR_SEEDS,
        mergePlanVariablesForExport: mergePlanVariablesForExport
    };
}(typeof window !== 'undefined' ? window : this));
