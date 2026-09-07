/**
 * AI 配置元件适配 · ConfigTestElement/平铺字段 → tg config_items（http_defaults 等）
 * 仅影响 parseItemsFromYaml 入口之前的归一化，合法 type+data 原样通过。
 */
(function (global) {
    'use strict';

    var CONFIG_KEYS = {
        http_defaults: 1,
        header_manager: 1,
        auth_manager: 1,
        cookie_manager: 1,
        cache_manager: 1,
        csv_data_set: 1,
        counter: 1
    };

    var ALIAS_TO_TYPE = {
        ConfigTestElement: 'http_defaults',
        HttpDefaults: 'http_defaults',
        HTTPSamplerProxy: null,
        HeaderManager: 'header_manager',
        AuthManager: 'auth_manager',
        CookieManager: 'cookie_manager',
        CacheManager: 'cache_manager',
        CSVDataSet: 'csv_data_set',
        CounterConfig: 'counter',
        Counter: 'counter'
    };

    function pickProps(comp) {
        if (!comp || typeof comp !== 'object') return {};
        if (comp.catalog_props && typeof comp.catalog_props === 'object') {
            return Object.assign({}, comp.catalog_props, comp.data && typeof comp.data === 'object' ? comp.data : {});
        }
        if (comp.data && typeof comp.data === 'object') return Object.assign({}, comp.data);
        return Object.assign({}, comp);
    }

    function looksLikeHttpDefaults(comp, props) {
        if (!comp) return false;
        var alias = String(comp.alias || comp.testclass || comp.type || '');
        var gui = String(comp.guiclass || '');
        if (alias === 'ConfigTestElement' || alias === 'HttpDefaults') return true;
        if (gui === 'HttpDefaultsGui') return true;
        if (/http.?defaults|请求默认值/i.test(String(comp.name || ''))) return true;
        if (props && (props.domain || props.protocol || props.port != null) && !props.headers && !comp.type) return true;
        return false;
    }

    function resolveType(comp, props) {
        var t = String(comp && comp.type || '');
        if (CONFIG_KEYS[t]) return t;
        if (ALIAS_TO_TYPE[t]) return ALIAS_TO_TYPE[t];
        var alias = String(comp && (comp.alias || comp.testclass) || '');
        if (ALIAS_TO_TYPE[alias]) return ALIAS_TO_TYPE[alias];
        var gui = String(comp && comp.guiclass || '');
        if (gui === 'HttpDefaultsGui') return 'http_defaults';
        if (gui === 'HeaderPanel') return 'header_manager';
        if (looksLikeHttpDefaults(comp, props)) return 'http_defaults';
        return '';
    }

    function stripMeta(props) {
        var out = Object.assign({}, props || {});
        [
            'type', 'alias', 'testclass', 'guiclass', 'jmeter_class', 'category', 'label_zh',
            'container', 'scope', 'jmx_fragment', 'catalog_props', 'catalog_hash_children',
            'children', 'id', 'ref_id', '_ref_id', 'kind', 'enabled'
        ].forEach(function (k) { delete out[k]; });
        return out;
    }

    function adaptAiConfigComponent(comp) {
        if (!comp || typeof comp !== 'object') return comp;
        var props = pickProps(comp);
        var type = resolveType(comp, props);
        if (!type || !CONFIG_KEYS[type]) return comp;

        var data;
        if (comp.data && typeof comp.data === 'object' && CONFIG_KEYS[String(comp.type || '')]) {
            // 已是合法结构，仅补全缺省
            data = Object.assign({}, comp.data);
        } else {
            data = stripMeta(props);
        }

        if (type === 'http_defaults') {
            if (!data.protocol && (data.domain || data.port === '443' || data.port === 443)) {
                data.protocol = 'https';
            }
            if (data.port != null) data.port = String(data.port);
            if (data.domain != null) data.domain = String(data.domain);
            if (data.enabled === undefined) data.enabled = true;
        }
        if (type === 'header_manager' && data.headers && !Array.isArray(data.headers) && typeof data.headers === 'object') {
            data.headers = Object.keys(data.headers).map(function (k) {
                return { key: k, name: k, value: data.headers[k] == null ? '' : String(data.headers[k]) };
            });
        }

        return {
            type: type,
            name: String(comp.name || data.name || ''),
            data: data,
            import_order: comp.import_order,
            timeline_order: comp.timeline_order,
            parent_step_id: comp.parent_step_id
        };
    }

    function patchParseItemsFromYaml() {
        var CC = global.JmsTgConfigCatalog;
        if (!CC || typeof CC.parseItemsFromYaml !== 'function' || CC.__aiConfigAdaptV1) return !!CC;
        var orig = CC.parseItemsFromYaml.bind(CC);
        CC.parseItemsFromYaml = function (raw) {
            var list = Array.isArray(raw) ? raw : [];
            var adapted = list.map(function (item) {
                try { return adaptAiConfigComponent(item); } catch (e1) { return item; }
            });
            return orig(adapted);
        };
        CC.__aiConfigAdaptV1 = true;
        return true;
    }

    function boot(tryNo) {
        tryNo = tryNo || 0;
        if (!patchParseItemsFromYaml() && tryNo < 80) {
            setTimeout(function () { boot(tryNo + 1); }, 50);
        }
    }

    global.JmsAiConfigComponentAdaptV1 = {
        adaptAiConfigComponent: adaptAiConfigComponent
    };
    boot(0);
})(typeof window !== 'undefined' ? window : this);
