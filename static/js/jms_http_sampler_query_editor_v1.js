/**
 * HTTPSamplerProxy 编辑弹窗 · Query 参数字段（隔离补丁）
 * - 补 schema.fields.query（kv）
 * - 打开编辑时：object/array query → kv 行；path 含 ? 时拆出参数
 * - 保存后：保证 query 行带 key，供 JMX path+query 合并使用
 * - 兼容 kv 仅有 name 的行（不改其他元件逻辑，只包一层 path_query）
 */
(function (global) {
    'use strict';

    var QUERY_FIELD = {
        key: 'query',
        type: 'kv',
        label: '查询参数 (query)',
        default: []
    };

    function ensureHttpQueryField(schema) {
        if (!schema || !Array.isArray(schema.fields)) return schema;
        var has = schema.fields.some(function (f) { return f && f.key === 'query'; });
        if (has) return schema;
        var fields = schema.fields.slice();
        var pathIdx = -1;
        for (var i = 0; i < fields.length; i += 1) {
            if (fields[i] && fields[i].key === 'path') { pathIdx = i; break; }
        }
        if (pathIdx >= 0) fields.splice(pathIdx + 1, 0, QUERY_FIELD);
        else fields.push(QUERY_FIELD);
        return { fields: fields };
    }

    function rowsFromQuery(query) {
        var rows = [];
        if (Array.isArray(query)) {
            query.forEach(function (row) {
                if (!row) return;
                var name = String(row.name || row.key || '').trim();
                if (!name) return;
                var value = row.value != null ? String(row.value) : (row.val != null ? String(row.val) : '');
                rows.push({ name: name, key: name, value: value });
            });
            return rows;
        }
        if (query && typeof query === 'object') {
            Object.keys(query).forEach(function (k) {
                var name = String(k || '').trim();
                if (!name) return;
                var v = query[k];
                if (v === undefined || v === null) return;
                rows.push({ name: name, key: name, value: String(v) });
            });
        }
        return rows;
    }

    function parseQuerySuffix(suffix) {
        var s = String(suffix || '').replace(/^\?/, '');
        if (!s) return [];
        var rows = [];
        s.split('&').forEach(function (part) {
            if (!part) return;
            var eq = part.indexOf('=');
            var rawK = eq >= 0 ? part.slice(0, eq) : part;
            var rawV = eq >= 0 ? part.slice(eq + 1) : '';
            var name = '';
            var value = '';
            try { name = decodeURIComponent(rawK.replace(/\+/g, ' ')); } catch (e1) { name = rawK; }
            try { value = decodeURIComponent(String(rawV).replace(/\+/g, ' ')); } catch (e2) { value = rawV; }
            name = String(name || '').trim();
            if (!name) return;
            rows.push({ name: name, key: name, value: value == null ? '' : String(value) });
        });
        return rows;
    }

    function mergeQueryRows(a, b) {
        var map = {};
        var order = [];
        function add(rows) {
            (rows || []).forEach(function (row) {
                if (!row) return;
                var name = String(row.name || row.key || '').trim();
                if (!name) return;
                if (!map[name]) order.push(name);
                map[name] = {
                    name: name,
                    key: name,
                    value: row.value != null ? String(row.value) : (row.val != null ? String(row.val) : '')
                };
            });
        }
        add(a);
        add(b);
        return order.map(function (k) { return map[k]; });
    }

    function normalizeHttpPropsForEditor(props) {
        var out = props && typeof props === 'object' ? props : {};
        var rows = rowsFromQuery(out.query);
        var path = out.path == null ? '' : String(out.path);
        var qi = path.indexOf('?');
        if (qi >= 0) {
            out.path = path.slice(0, qi) || '/';
            rows = mergeQueryRows(rows, parseQuerySuffix(path.slice(qi)));
        }
        out.query = rows;
        return out;
    }

    function normalizeHttpPropsForPersist(props) {
        var out = props && typeof props === 'object' ? Object.assign({}, props) : {};
        out.query = rowsFromQuery(out.query);
        if (out.path != null) {
            var path = String(out.path);
            var qi = path.indexOf('?');
            if (qi >= 0) {
                out.path = path.slice(0, qi) || '/';
                out.query = mergeQueryRows(out.query, parseQuerySuffix(path.slice(qi)));
            }
        }
        return out;
    }

    function patchSchemaApi() {
        var S = global.JmsCatalogElementEditorSchema;
        if (!S || S.__httpQueryEditorPatchedV1) return !!S;
        if (S.ALIAS_SCHEMAS && S.ALIAS_SCHEMAS.HTTPSamplerProxy && Array.isArray(S.ALIAS_SCHEMAS.HTTPSamplerProxy.fields)) {
            S.ALIAS_SCHEMAS.HTTPSamplerProxy = ensureHttpQueryField(S.ALIAS_SCHEMAS.HTTPSamplerProxy);
        }
        var origGet = S.getSchema;
        if (typeof origGet === 'function') {
            S.getSchema = function (step) {
                var schema = origGet(step);
                if (step && (step.alias === 'HTTPSamplerProxy' || step.alias === 'HTTPSampler' || step.alias === 'HTTPSampler2')) {
                    return ensureHttpQueryField(schema || { fields: [] });
                }
                return schema;
            };
        }
        var origDefault = S.defaultProps;
        if (typeof origDefault === 'function') {
            S.defaultProps = function (step) {
                var props = origDefault(step);
                if (step && (step.alias === 'HTTPSamplerProxy' || step.alias === 'HTTPSampler' || step.alias === 'HTTPSampler2')) {
                    if (!Array.isArray(props.query)) props.query = [];
                    else props.query = props.query.slice();
                }
                return props;
            };
        }
        var origForEditor = S.propsForEditor;
        if (typeof origForEditor === 'function') {
            S.propsForEditor = function (step) {
                var props = origForEditor(step);
                if (step && (step.alias === 'HTTPSamplerProxy' || step.alias === 'HTTPSampler' || step.alias === 'HTTPSampler2')) {
                    return normalizeHttpPropsForEditor(props);
                }
                return props;
            };
        }
        var origPersist = S.persistEditorProps;
        if (typeof origPersist === 'function') {
            S.persistEditorProps = function (step, props) {
                if (step && (step.alias === 'HTTPSamplerProxy' || step.alias === 'HTTPSampler' || step.alias === 'HTTPSampler2')) {
                    props = normalizeHttpPropsForPersist(props);
                }
                return origPersist(step, props);
            };
        }
        S.__httpQueryEditorPatchedV1 = true;
        return true;
    }

    function withNameAsKey(query) {
        if (!Array.isArray(query)) return query;
        return query.map(function (row) {
            if (!row) return row;
            if (row.key) return row;
            if (row.name) return Object.assign({}, row, { key: row.name });
            return row;
        });
    }

    function patchPathQueryCompat() {
        var H = global.JmsHttpPathQuery;
        if (H && typeof H.queryToSearchString === 'function' && !H.__queryNameCompatV1) {
            var orig = H.queryToSearchString;
            H.queryToSearchString = function (query) {
                return orig(withNameAsKey(query));
            };
            if (typeof H.mergePathAndQuery === 'function') {
                var origMerge = H.mergePathAndQuery;
                H.mergePathAndQuery = function (path, query) {
                    return origMerge(path, withNameAsKey(query));
                };
            }
            H.__queryNameCompatV1 = true;
        }
        var J = global.JmsHttpPathQueryJmxV1;
        if (J && typeof J.queryToSearchStringForJmx === 'function' && !J.__queryNameCompatV1) {
            var origJ = J.queryToSearchStringForJmx;
            J.queryToSearchStringForJmx = function (query) {
                return origJ(withNameAsKey(query));
            };
            if (typeof J.mergePathAndQueryForJmx === 'function') {
                var origMJ = J.mergePathAndQueryForJmx;
                J.mergePathAndQueryForJmx = function (path, query) {
                    return origMJ(path, withNameAsKey(query));
                };
            }
            J.__queryNameCompatV1 = true;
        }
    }

    function boot(tryNo) {
        tryNo = tryNo || 0;
        var ok = patchSchemaApi();
        patchPathQueryCompat();
        if ((!ok || !global.JmsHttpPathQuery) && tryNo < 80) {
            setTimeout(function () { boot(tryNo + 1); }, 50);
        }
    }

    global.JmsHttpSamplerQueryEditorV1 = {
        ensureHttpQueryField: ensureHttpQueryField,
        normalizeHttpPropsForEditor: normalizeHttpPropsForEditor,
        normalizeHttpPropsForPersist: normalizeHttpPropsForPersist,
        rowsFromQuery: rowsFromQuery
    };

    boot(0);
})(typeof window !== 'undefined' ? window : this);
