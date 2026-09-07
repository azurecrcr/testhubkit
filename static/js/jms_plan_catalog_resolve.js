/**
 * 测试计划级 catalog 元件 · 公共变量/请求头解析（单一数据源：plan_catalog_items）
 * 不直接读场景公共配置 legacy 字段；仅在 migrate 时一次性导入 legacy。
 */
(function (global) {
    'use strict';

    var ALIAS_HEADER = 'HeaderManager';
    var ALIAS_ARGUMENTS = 'Arguments';

    function sid(v) { return v == null ? '' : String(v); }

    function ensureItems(model) {
        if (!model) return [];
        if (!Array.isArray(model.plan_catalog_items)) model.plan_catalog_items = [];
        return model.plan_catalog_items;
    }

    function kvListToObj(rows) {
        var out = {};
        (rows || []).forEach(function (row) {
            if (!row) return;
            var k = sid(row.name || row.key).trim();
            if (!k) return;
            out[k] = row.value == null ? '' : String(row.value);
        });
        return out;
    }

    function objToKvList(obj) {
        var rows = [];
        Object.keys(obj || {}).forEach(function (k) {
            k = sid(k).trim();
            if (!k) return;
            rows.push({ name: k, key: k, value: obj[k] == null ? '' : String(obj[k]) });
        });
        return rows;
    }

    function kvRowsToObj(rows) {
        var out = {};
        if (Array.isArray(rows)) {
            rows.forEach(function (row) {
                var k = sid(row && (row.key != null ? row.key : row.name)).trim();
                if (!k) return;
                out[k] = row.value == null ? '' : String(row.value);
            });
            return out;
        }
        if (rows && typeof rows === 'object') {
            Object.keys(rows).forEach(function (k) {
                k = sid(k).trim();
                if (!k) return;
                out[k] = rows[k] == null ? '' : String(rows[k]);
            });
        }
        return out;
    }

    function legacyHeadersObj(model) {
        return kvRowsToObj(model && model.default_headers);
    }

    function legacyVariablesObj(model) {
        var out = {};
        var plan = model && model.test_plans && model.test_plans[0];
        Object.assign(out, kvRowsToObj(plan && plan.variables));
        if (!Object.keys(out).length) {
            Object.assign(out, kvRowsToObj(model && model.variables));
        }
        return out;
    }

    function headersFromCatalogItem(item) {
        if (!item || sid(item.alias) !== ALIAS_HEADER) return {};
        return kvListToObj((item.catalog_props || {}).headers || []);
    }

    function variablesFromCatalogItem(item) {
        if (!item || sid(item.alias) !== ALIAS_ARGUMENTS) return {};
        var props = item.catalog_props || {};
        return kvListToObj(props.arguments || props.variables || props.params || []);
    }

    function resolvePlanHeaders(model) {
        var merged = {};
        ensureItems(model).forEach(function (item) {
            if (!item || item.enabled === false || sid(item.alias) !== ALIAS_HEADER) return;
            Object.assign(merged, headersFromCatalogItem(item));
        });
        return merged;
    }

    function resolvePlanVariables(model) {
        var merged = {};
        ensureItems(model).forEach(function (item) {
            if (!item || item.enabled === false || sid(item.alias) !== ALIAS_ARGUMENTS) return;
            Object.assign(merged, variablesFromCatalogItem(item));
        });
        return merged;
    }

    function resolvePlanHeadersFromData(data) {
        return resolvePlanHeaders({
            plan_catalog_items: data && data.plan_catalog_items,
            default_headers: objToKvList(data && data.default_headers)
        });
    }

    function resolvePlanVariablesFromData(data) {
        return resolvePlanVariables({
            plan_catalog_items: data && data.plan_catalog_items,
            test_plans: [{ variables: objToKvList(data && data.variables) }],
            variables: data && data.variables
        });
    }

    function findCatalogItem(model, alias) {
        alias = sid(alias);
        var list = ensureItems(model);
        for (var i = 0; i < list.length; i += 1) {
            if (list[i] && sid(list[i].alias) === alias) return list[i];
        }
        return null;
    }

    function createCatalogItem(alias, name, category, catalogProps) {
        return {
            id: 'pcat_' + Math.random().toString(36).slice(2, 10),
            type: 'catalog_element',
            name: name || alias,
            label_zh: name || alias,
            enabled: true,
            alias: alias,
            testclass: alias,
            guiclass: alias === ALIAS_HEADER ? 'HeaderPanel' : 'ArgumentsPanel',
            category: category || 'config',
            container: false,
            scope: 'plan_catalog',
            catalog_props: catalogProps || { comments: '' }
        };
    }

    function mergeIntoCatalogItem(item, rowsObj, propKey) {
        if (!item) return;
        if (!item.catalog_props) item.catalog_props = { comments: '' };
        var existing = kvListToObj(item.catalog_props[propKey] || []);
        Object.keys(rowsObj || {}).forEach(function (k) { existing[k] = rowsObj[k]; });
        item.catalog_props[propKey] = objToKvList(existing);
    }

    function migrateLegacyToCatalog(model) {
        if (!model) return false;
        var changed = false;
        var headers = legacyHeadersObj(model);
        var variables = legacyVariablesObj(model);
        var list = ensureItems(model);

        if (Object.keys(headers).length) {
            var hm = findCatalogItem(model, ALIAS_HEADER);
            if (!hm) {
                hm = createCatalogItem(ALIAS_HEADER, '公共请求头', 'config', { comments: '', headers: objToKvList(headers) });
                list.push(hm);
                changed = true;
            } else if (!Object.keys(headersFromCatalogItem(hm)).length) {
                mergeIntoCatalogItem(hm, headers, 'headers');
                changed = true;
            }
        }

        if (Object.keys(variables).length) {
            var args = findCatalogItem(model, ALIAS_ARGUMENTS);
            if (!args) {
                args = createCatalogItem(ALIAS_ARGUMENTS, '计划变量', 'config', { comments: '', arguments: objToKvList(variables) });
                list.push(args);
                changed = true;
            } else if (!Object.keys(variablesFromCatalogItem(args)).length) {
                mergeIntoCatalogItem(args, variables, 'arguments');
                changed = true;
            }
        }

        if (changed) {
            model.default_headers = [];
            if (model.test_plans && model.test_plans[0]) model.test_plans[0].variables = [];
        }
        return changed;
    }

    function migrateLegacyDataToCatalog(data) {
        if (!data || typeof data !== 'object') return false;
        var model = {
            plan_catalog_items: data.plan_catalog_items,
            default_headers: objToKvList(data.default_headers),
            test_plans: [{ variables: objToKvList(data.variables) }],
            variables: data.variables
        };
        var changed = migrateLegacyToCatalog(model);
        if (changed) {
            data.plan_catalog_items = model.plan_catalog_items;
            data.default_headers = {};
            data.variables = {};
        }
        return changed;
    }

    function countCatalogItems(model, alias) {
        var n = 0;
        ensureItems(model).forEach(function (it) {
            if (it && it.enabled !== false && sid(it.alias) === sid(alias)) n += 1;
        });
        return n;
    }

    function countResolvedHeaderKeys(model) {
        return Object.keys(resolvePlanHeaders(model)).length;
    }

    function countResolvedVariableKeys(model) {
        return Object.keys(resolvePlanVariables(model)).length;
    }

    function applyResolvedForExport(data) {
        if (!data || typeof data !== 'object') return data;
        migrateLegacyDataToCatalog(data);
        var out = Object.assign({}, data);
        out.variables = resolvePlanVariablesFromData(out);
        out.default_headers = resolvePlanHeadersFromData(out);
        return out;
    }

    function shouldSkipLegacyPlanHashExports(data) {
        if (!data || !Array.isArray(data.plan_catalog_items)) return false;
        return data.plan_catalog_items.some(function (it) {
            return it && it.enabled !== false && (sid(it.alias) === ALIAS_HEADER || sid(it.alias) === ALIAS_ARGUMENTS);
        });
    }

    global.JmsPlanCatalogResolve = {
        ALIAS_HEADER: ALIAS_HEADER,
        ALIAS_ARGUMENTS: ALIAS_ARGUMENTS,
        ensureItems: ensureItems,
        kvListToObj: kvListToObj,
        objToKvList: objToKvList,
        headersFromCatalogItem: headersFromCatalogItem,
        variablesFromCatalogItem: variablesFromCatalogItem,
        resolvePlanHeaders: resolvePlanHeaders,
        resolvePlanVariables: resolvePlanVariables,
        resolvePlanHeadersFromData: resolvePlanHeadersFromData,
        resolvePlanVariablesFromData: resolvePlanVariablesFromData,
        migrateLegacyToCatalog: migrateLegacyToCatalog,
        migrateLegacyDataToCatalog: migrateLegacyDataToCatalog,
        countCatalogItems: countCatalogItems,
        countResolvedHeaderKeys: countResolvedHeaderKeys,
        countResolvedVariableKeys: countResolvedVariableKeys,
        applyResolvedForExport: applyResolvedForExport,
        shouldSkipLegacyPlanHashExports: shouldSkipLegacyPlanHashExports,
        createCatalogItem: createCatalogItem
    };
})(typeof window !== 'undefined' ? window : this);
