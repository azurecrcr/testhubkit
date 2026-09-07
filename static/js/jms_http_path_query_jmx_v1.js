/**
 * JMX 导出专用 · HTTP Query 拼接（保留 JMeter 变量表达式，隔离模块）
 */
(function (global) {
    'use strict';

    var JMETER_EXPR_RE = /\$\{(?:__[^}]+|[^}]+)\}/g;

    function encodeJmxQueryComponent(s) {
        var str = String(s == null ? '' : s);
        if (!str) return '';
        var parts = str.split(JMETER_EXPR_RE);
        var exprs = str.match(JMETER_EXPR_RE) || [];
        var out = '';
        for (var i = 0; i < parts.length; i++) {
            if (parts[i]) out += encodeURIComponent(parts[i]);
            if (i < exprs.length) out += exprs[i];
        }
        return out;
    }

    function queryToSearchStringForJmx(query) {
        if (!query) return '';
        var pairs = [];
        if (Array.isArray(query)) {
            query.forEach(function (row) {
                if (!row || !row.key) return;
                var val = row.val != null ? row.val : (row.value != null ? row.value : '');
                pairs.push([String(row.key), String(val)]);
            });
        } else if (typeof query === 'object') {
            Object.keys(query).forEach(function (k) {
                var v = query[k];
                if (v === undefined || v === null) return;
                pairs.push([String(k), String(v)]);
            });
        }
        if (!pairs.length) return '';
        return '?' + pairs.map(function (pair) {
            return encodeURIComponent(pair[0]) + '=' + encodeJmxQueryComponent(pair[1]);
        }).join('&');
    }

    function mergePathAndQueryForJmx(path, query) {
        var p = String(path || '/').trim() || '/';
        var qs = queryToSearchStringForJmx(query);
        if (!qs) return p;
        if (p.indexOf('?') >= 0) return p + '&' + qs.slice(1);
        return p + qs;
    }

    function patchFormatJmxExportPath() {
        var H = global.JmsHttpPathQuery;
        if (!H || H.__jmxQueryExportPatched || typeof H.formatJmxExportPath !== 'function') return;
        var origFormat = H.formatJmxExportPath;
        H.formatJmxExportPath = function (step, opts) {
            if (!step) return origFormat(step, opts);
            var merged = mergePathAndQueryForJmx(step.path, step.query);
            var shadow = Object.assign({}, step, { path: merged, query: {} });
            return origFormat.call(H, shadow, opts || {});
        };
        H.queryToSearchStringForJmx = queryToSearchStringForJmx;
        H.mergePathAndQueryForJmx = mergePathAndQueryForJmx;
        H.__jmxQueryExportPatched = true;
    }

    var MAX_PATCH_RETRY = 80;
    function init(tryNo) {
        tryNo = tryNo || 0;
        patchFormatJmxExportPath();
        if ((!global.JmsHttpPathQuery || !global.JmsHttpPathQuery.__jmxQueryExportPatched) && tryNo < MAX_PATCH_RETRY) {
            setTimeout(function () { init(tryNo + 1); }, 50);
        }
    }

    global.JmsHttpPathQueryJmxV1 = {
        encodeJmxQueryComponent: encodeJmxQueryComponent,
        queryToSearchStringForJmx: queryToSearchStringForJmx,
        mergePathAndQueryForJmx: mergePathAndQueryForJmx,
        patchFormatJmxExportPath: patchFormatJmxExportPath,
        init: init
    };

    if (global.document) {
        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', init);
        } else {
            setTimeout(init, 0);
        }
    } else {
        init();
    }
}(typeof window !== 'undefined' ? window : this));
