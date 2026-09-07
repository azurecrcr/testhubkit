/**
 * JMX 导出前变量引用扫描与缺失变量补齐（隔离模块）
 */
(function (global) {
    'use strict';

    var VAR_SEEDS = {
        GLOBAL_CHANNEL: 'web',
        ORDER_BUILD: '1.0.0',
        BUILD_ID: 'local-build',
        TG_ROLE: 'buyer'
    };

    var VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
    var SKIP_PREFIX = '__';

    function clone(v) {
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function collectRefsFromValue(val, refs) {
        if (val == null) return;
        if (typeof val === 'string') {
            VAR_RE.lastIndex = 0;
            var m;
            while ((m = VAR_RE.exec(val)) !== null) {
                if (m[1] && m[1].indexOf(SKIP_PREFIX) !== 0) refs[m[1]] = true;
            }
            return;
        }
        if (Array.isArray(val)) {
            val.forEach(function (v) { collectRefsFromValue(v, refs); });
            return;
        }
        if (typeof val === 'object') {
            Object.keys(val).forEach(function (k) { collectRefsFromValue(val[k], refs); });
        }
    }

    function walkSteps(steps, fn) {
        (steps || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
            if (Array.isArray(s.catalog_hash_children)) walkSteps(s.catalog_hash_children, fn);
        });
    }

    function collectDefinedVars(data, defined) {
        defined = defined || {};
        Object.keys(data.variables || {}).forEach(function (k) { defined[k] = true; });
        if (data.base_url) defined.BASE_URL = true;
        ['setup_thread_groups', 'thread_groups', 'post_thread_groups'].forEach(function (key) {
            (data[key] || []).forEach(function (tg) {
                Object.keys(tg.variables || {}).forEach(function (k) { defined[k] = true; });
                walkSteps(tg.steps, function (s) {
                    var props = s.catalog_props || {};
                    if (s.alias === 'CounterConfig' && props.variable_name) {
                        defined[String(props.variable_name).trim()] = true;
                    }
                    if (s.alias === 'CSVDataSet' && props.variable_names) {
                        String(props.variable_names).split(',').forEach(function (v) {
                            v = v.trim();
                            if (v) defined[v] = true;
                        });
                    }
                    if (props.extract && props.extract.var) defined[props.extract.var] = true;
                    (props.extractors || []).forEach(function (ex) {
                        if (ex && ex.var) defined[ex.var] = true;
                    });
                    (props.user_parameters && props.user_parameters.params || []).forEach(function (p) {
                        if (p && p.name) defined[p.name] = true;
                    });
                });
            });
        });
        return defined;
    }

    function collectReferencedVars(data) {
        var refs = {};
        collectRefsFromValue(data, refs);
        return refs;
    }

    function mergeMissingPlanVariables(data) {
        if (!data || typeof data !== 'object') return data;
        var out = clone(data);
        out.variables = (out.variables && typeof out.variables === 'object') ? out.variables : {};
        if (!out.variables.BASE_URL && out.base_url) {
            out.variables.BASE_URL = String(out.base_url).replace(/\/$/, '');
        }
        if (out.build && !out.variables.BUILD_ID) {
            var bv = String(out.build);
            out.variables.BUILD_ID = (bv.indexOf('${') >= 0) ? (VAR_SEEDS.BUILD_ID || 'local-build') : bv;
        }
        var defined = collectDefinedVars(out, {});
        var refs = collectReferencedVars(out);
        Object.keys(refs).forEach(function (name) {
            if (defined[name] || out.variables[name] !== undefined) return;
            out.variables[name] = VAR_SEEDS[name] != null ? String(VAR_SEEDS[name]) : '';
        });
        return out;
    }

    global.JmsJmxVariableCollectV1 = {
        VAR_SEEDS: VAR_SEEDS,
        mergeMissingPlanVariables: mergeMissingPlanVariables,
        collectReferencedVars: collectReferencedVars,
        collectDefinedVars: collectDefinedVars
    };
})(typeof window !== 'undefined' ? window : this);
