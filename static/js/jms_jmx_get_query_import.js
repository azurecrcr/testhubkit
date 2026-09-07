/**
 * JMX 导入 · GET/HEAD Parameters 合并到 path 查询串（隔离模块）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var list = el.getElementsByTagName('stringProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) return (list[i].textContent || '').trim();
        }
        return '';
    }

    function isGetOrHead(method) {
        var m = String(method || 'GET').toUpperCase();
        return m === 'GET' || m === 'HEAD';
    }

    /** 解析 Parameters 表中有 name 的 HTTPArgument（JMeter GET 查询参数） */
    function parseNamedQueryParamsFromArguments(argsEl) {
        if (!argsEl) return [];
        var pairs = [];
        var argProps = argsEl.getElementsByTagName('elementProp');
        for (var i = 0; i < argProps.length; i++) {
            var ap = argProps[i];
            if (ap.getAttribute('elementType') !== 'HTTPArgument') continue;
            var name = getStringProp(ap, 'Argument.name');
            if (!name) continue;
            pairs.push({ name: name, value: getStringProp(ap, 'Argument.value') });
        }
        return pairs;
    }

    /** 保留 JMeter 变量/函数字面量，不做 URL 编码 */
    function buildRawQueryString(pairs) {
        return pairs.map(function (p) {
            return p.name + '=' + (p.value != null ? p.value : '');
        }).join('&');
    }

    function appendRawQueryToPath(path, pairs) {
        if (!pairs || !pairs.length) return path;
        var qs = buildRawQueryString(pairs);
        path = String(path || '/');
        var hashIdx = path.indexOf('#');
        var hash = '';
        if (hashIdx >= 0) {
            hash = path.slice(hashIdx);
            path = path.slice(0, hashIdx);
        }
        var merged = path.indexOf('?') >= 0 ? (path + '&' + qs) : (path + '?' + qs);
        return merged + hash;
    }

    function applyImportedGetHeadQueryParams(step, argsEl) {
        if (!step || !argsEl || !isGetOrHead(step.method)) return step;
        var pairs = parseNamedQueryParamsFromArguments(argsEl);
        if (!pairs.length) return step;
        step.path = appendRawQueryToPath(step.path, pairs);
        step._jmx_get_query_merged = true;
        return step;
    }

    global.JmsJmxGetQueryImport = {
        parseNamedQueryParamsFromArguments: parseNamedQueryParamsFromArguments,
        appendRawQueryToPath: appendRawQueryToPath,
        applyImportedGetHeadQueryParams: applyImportedGetHeadQueryParams
    };
})(typeof window !== 'undefined' ? window : this);
