/**
 * HTTP 路径与 Query 合并/分离（隔离模块，压测造数专用）
 */
(function (global) {
    'use strict';

    function queryToSearchString(query) {
        if (!query) return '';
        var pairs = [];
        if (Array.isArray(query)) {
            query.forEach(function (row) {
                if (!row || !row.key) return;
                pairs.push([String(row.key), row.val != null ? String(row.val) : (row.value != null ? String(row.value) : '')]);
            });
        } else if (typeof query === 'object') {
            Object.keys(query).forEach(function (k) {
                var v = query[k];
                if (v === undefined || v === null) return;
                pairs.push([String(k), String(v)]);
            });
        }
        if (!pairs.length) return '';
        var p = new URLSearchParams();
        pairs.forEach(function (pair) { p.append(pair[0], pair[1]); });
        var s = p.toString();
        return s ? '?' + s : '';
    }

    function mergePathAndQuery(path, query) {
        var p = String(path || '/').trim() || '/';
        var qs = queryToSearchString(query);
        if (!qs) return p;
        if (p.indexOf('?') >= 0) return p + '&' + qs.slice(1);
        return p + qs;
    }

    function splitPathAndQuery(fullPath) {
        var raw = String(fullPath || '/').trim() || '/';
        var idx = raw.indexOf('?');
        if (idx < 0) return { path: raw, querySuffix: '' };
        var base = raw.slice(0, idx) || '/';
        return { path: base, querySuffix: raw.slice(idx) };
    }

    function resolveJmxSamplerPath(step) {
        if (!step) return '/';
        return mergePathAndQuery(step.path, step.query);
    }

    function normalizeStepPathField(step) {
        if (!step || typeof step !== 'object') return step;
        step.path = mergePathAndQuery(step.path, step.query);
        step.query = [];
        return step;
    }

    function appendSearchToPath(pathname, search) {
        var p = String(pathname || '/').trim() || '/';
        var s = String(search || '').trim();
        if (!s) return p;
        if (s.charAt(0) !== '?') s = '?' + s;
        if (p.indexOf('?') >= 0) return p + '&' + s.slice(1);
        return p + s;
    }


    function normalizeLeadingSlashes(path) {
        var p = String(path || '/').trim() || '/';
        if (p.indexOf('://') >= 0) return p;
        if (global.JmsJmxPathHost && global.JmsJmxPathHost.isHostPrefixedPath(p)) return p;
        return p.replace(/^\/+/, '/');
    }

    function formatJmxExportPath(step, opts) {
        opts = opts || {};
        var merged = mergePathAndQuery(step && step.path, step && step.query);
        if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.restoreHostPathForJmxExport === 'function') {
            var restoredHost = global.JmsJmxPathHost.restoreHostPathForJmxExport(merged, step);
            if (restoredHost) return restoredHost;
        }
        if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.formatExportPathWithHost === 'function') {
            var hostPath = global.JmsJmxPathHost.formatExportPathWithHost(step, merged);
            if (hostPath) return hostPath;
        }
        var path = normalizeLeadingSlashes(merged);
        if (global.JmsJmxPathHost && global.JmsJmxPathHost.isHostPrefixedPath(path)) {
            return path;
        }
        if (global.JmsJmxPathImport && typeof global.JmsJmxPathImport.resolveExportPathWithBaseUrl === 'function') {
            return global.JmsJmxPathImport.resolveExportPathWithBaseUrl(path, opts.useBaseUrlVar);
        }
        if (opts.useBaseUrlVar) {
            return '${BASE_URL}' + (path.charAt(0) === '/' ? path : '/' + path);
        }
        return path;
    }
    global.JmsHttpPathQuery = {
        queryToSearchString: queryToSearchString,
        mergePathAndQuery: mergePathAndQuery,
        splitPathAndQuery: splitPathAndQuery,
        resolveJmxSamplerPath: resolveJmxSamplerPath,
        normalizeLeadingSlashes: normalizeLeadingSlashes,
        formatJmxExportPath: formatJmxExportPath,
        normalizeStepPathField: normalizeStepPathField,
        appendSearchToPath: appendSearchToPath
    };
}(typeof window !== 'undefined' ? window : this));
