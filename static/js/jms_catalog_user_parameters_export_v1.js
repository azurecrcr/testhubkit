/**
 * catalog/HTTP · UserParameters 导出增强（value → values[] 兼容）
 */
(function (global) {
    'use strict';

    function normalizeForExport(cfg) {
        cfg = cfg && typeof cfg === 'object' ? cfg : {};
        var Catalog = global.JmsHttpStepUserParamsCatalog;
        if (Catalog && typeof Catalog.normalizeParams === 'function') {
            return Catalog.normalizeParams(cfg);
        }
        var raw = Array.isArray(cfg.params) ? cfg.params : [];
        var params = raw.map(function (p) {
            if (!p || typeof p !== 'object') return null;
            var key = String(p.key || p.name || '').trim();
            if (!key) return null;
            var values = [];
            if (Array.isArray(p.values)) {
                p.values.forEach(function (v) { values.push(v == null ? '' : String(v)); });
            } else if (p.value !== undefined) {
                values.push(String(p.value));
            } else {
                values.push('');
            }
            return { key: key, values: values };
        }).filter(Boolean);
        return {
            enabled: !!cfg.enabled,
            name: cfg.name ? String(cfg.name) : '用户参数',
            comments: cfg.comments != null ? String(cfg.comments) : '',
            per_iteration: !!cfg.per_iteration,
            params: params,
            user_count: Math.max(1, cfg.user_count || 1)
        };
    }

    function genUserParametersXml(cfg, indent, escapeXml) {
        var E = global.JmeterJmxExtra;
        if (!E || typeof E.genUserParametersXml !== 'function') return '';
        return E.genUserParametersXml(normalizeForExport(cfg), indent, escapeXml);
    }

    function legacyItem(step) {
        var P = global.JmsCatalogJmxPrepare;
        return P && typeof P.legacyItemFromCatalog === 'function' ? P.legacyItemFromCatalog(step) : (step.catalog_props || {});
    }

    function escapeFn(helpers) {
        var esc = helpers && helpers.escapeXml;
        return function (s) { return esc ? esc(s) : String(s == null ? '' : s); };
    }

    function genCatalogUserParametersXml(step, indent, helpers) {
        var item = legacyItem(step);
        return genUserParametersXml({
            enabled: step.enabled !== false,
            name: step.name || item.name || '用户参数',
            comments: item.comments || '',
            per_iteration: item.per_iteration,
            params: item.params || []
        }, indent, escapeFn(helpers));
    }

    function patchAuxUserParameters() {
        var A = global.JmsCatalogAuxJmx;
        if (!A || !A.MAP || A.__userParamsExportPatched) return;
        A.MAP.UserParameters = genCatalogUserParametersXml;
        A.__userParamsExportPatched = true;
    }

    function patchMountMigrate() {
        var M = global.JmsCatalogPropsMountMigrateV1;
        if (!M || M.__userParamsMigratePatched || typeof M.migrateCatalogPropsMounts !== 'function') return;
        var orig = M.migrateCatalogPropsMounts;
        M.migrateCatalogPropsMounts = function (step) {
            var props = step && step.catalog_props;
            if (props && props.user_parameters && Array.isArray(props.user_parameters.params)) {
                var norm = normalizeForExport(props.user_parameters);
                props.user_parameters = Object.assign({}, props.user_parameters, {
                    params: norm.params.map(function (p) {
                        return { key: p.key, value: p.values[0] || '', values: p.values.slice() };
                    })
                });
            }
            return orig.call(M, step);
        };
        M.__userParamsMigratePatched = true;
    }

    function init() {
        patchAuxUserParameters();
        patchMountMigrate();
    }

    global.JmsCatalogUserParametersExportV1 = {
        normalizeForExport: normalizeForExport,
        genUserParametersXml: genUserParametersXml,
        genCatalogUserParametersXml: genCatalogUserParametersXml,
        init: init
    };

    init();
})(typeof window !== 'undefined' ? window : this);
