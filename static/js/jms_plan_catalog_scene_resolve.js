/**
 * 测试计划级 catalog · 场景观测字段解析（base_url / influx / env / build）
 * 单一数据源：plan_catalog_items 中的 HTTP 请求默认值 + Backend Listener
 */
(function (global) {
    'use strict';

    var R = global.JmsPlanCatalogResolve;
    if (!R) return;

    var sid = R.ensureItems ? function (v) { return v == null ? '' : String(v); } : function (v) { return v == null ? '' : String(v); };
    var ensureItems = R.ensureItems;

    var GUI_HTTP_DEFAULTS = 'HttpDefaultsGui';
    var ALIAS_CONFIG = 'ConfigTestElement';
    var ALIAS_BACKEND = 'BackendListener';
    var INFLUX_CN = 'org.apache.jmeter.visualizers.backend.influxdb.InfluxdbBackendListenerClient';

    function isHttpDefaultsItem(item) {
        return !!(item && sid(item.alias) === ALIAS_CONFIG && sid(item.guiclass) === GUI_HTTP_DEFAULTS);
    }

    function isBackendListenerItem(item) {
        return !!(item && sid(item.alias) === ALIAS_BACKEND);
    }

    function isInfluxBackendClass(classname) {
        var c = sid(classname);
        return c.indexOf('influxdb') >= 0 || c.indexOf('InfluxDB') >= 0;
    }

    function findFirstItem(model, pred) {
        var hit = null;
        ensureItems(model).forEach(function (item) {
            if (hit || !item || item.enabled === false) return;
            if (pred(item)) hit = item;
        });
        return hit;
    }

    function paramVal(cfg, key) {
        if (!cfg) return '';
        var rows = cfg.parameters || [];
        for (var i = 0; i < rows.length; i += 1) {
            if (rows[i] && sid(rows[i].key) === sid(key)) {
                return rows[i].value == null ? '' : String(rows[i].value);
            }
        }
        return '';
    }

    function parseEventTags(raw) {
        var out = {};
        sid(raw).split(',').forEach(function (pair) {
            pair = pair.trim();
            if (!pair) return;
            var idx = pair.indexOf('=');
            if (idx <= 0) return;
            out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
        });
        return out;
    }

    function formatEventTags(tags, env, build, scenario) {
        tags = tags || {};
        var parts = [];
        if (tags.scenario || scenario) parts.push('scenario=' + (tags.scenario || scenario));
        if (tags.env || env) parts.push('env=' + (tags.env || env));
        var b = build || tags.build || '${BUILD_ID}';
        if (b.indexOf('${__P(') >= 0) parts.push('build=' + b);
        else parts.push('build=${__P(build,' + b.replace(/^\$\{|\}$/g, '') + ')}');
        return parts.join(',');
    }

    function httpDefaultsToBaseUrl(hd) {
        if (!hd) return '';
        var domain = sid(hd.domain).trim();
        if (!domain) return '';
        var protocol = sid(hd.protocol).trim() || 'https';
        var port = sid(hd.port).trim();
        if (!port) port = protocol === 'https' ? '443' : '80';
        var url = protocol + '://' + domain;
        if ((protocol === 'https' && port !== '443') || (protocol === 'http' && port !== '80')) {
            url += ':' + port;
        }
        return url;
    }

    function baseUrlToHttpDefaultsProps(baseUrl) {
        var u = sid(baseUrl).trim();
        var out = {
            comments: '',
            enabled: true,
            protocol: 'https',
            domain: '',
            port: '',
            path: '',
            follow_redirects: true,
            auto_redirects: false,
            use_keepalive: true
        };
        if (!u) return out;
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        try {
            var parsed = new global.URL(u);
            out.protocol = parsed.protocol.replace(':', '');
            out.domain = parsed.hostname;
            out.port = parsed.port || (out.protocol === 'https' ? '443' : '80');
            if (parsed.pathname && parsed.pathname !== '/') out.path = parsed.pathname;
        } catch (e) {
            out.domain = u.replace(/^https?:\/\//i, '');
        }
        return out;
    }

    function backendConfigFromItem(item) {
        if (!isBackendListenerItem(item)) return null;
        var props = item.catalog_props || {};
        if (global.JmsBackendListenerCatalog && typeof global.JmsBackendListenerCatalog.normalizeConfig === 'function') {
            return global.JmsBackendListenerCatalog.normalizeConfig({
                name: item.name || props.name || 'InfluxDB Backend Listener',
                comments: props.comments || '',
                classname: props.classname || INFLUX_CN,
                queue_size: props.queue_size || '5000',
                parameters: props.parameters || [],
                enabled: item.enabled !== false
            });
        }
        return {
            name: item.name || 'InfluxDB Backend Listener',
            comments: props.comments || '',
            classname: props.classname || INFLUX_CN,
            queue_size: props.queue_size || '5000',
            parameters: props.parameters || [],
            enabled: item.enabled !== false
        };
    }

    function resolveHttpDefaults(model) {
        var item = findFirstItem(model, isHttpDefaultsItem);
        if (!item) return null;
        return Object.assign({ enabled: item.enabled !== false, name: item.name }, item.catalog_props || {});
    }

    function resolveBaseUrl(model) {
        var hd = resolveHttpDefaults(model);
        var fromCatalog = httpDefaultsToBaseUrl(hd);
        if (fromCatalog) return fromCatalog;
        return sid(model && model.base_url).trim();
    }

    function resolveBaseUrlFromData(data) {
        return resolveBaseUrl({
            plan_catalog_items: data && data.plan_catalog_items,
            base_url: data && data.base_url
        });
    }

    function resolveInfluxdb(model) {
        var item = findFirstItem(model, isBackendListenerItem);
        if (item) {
            var cfg = backendConfigFromItem(item);
            if (cfg && isInfluxBackendClass(cfg.classname)) {
                var tags = parseEventTags(paramVal(cfg, 'eventTags'));
                return {
                    enabled: item.enabled !== false,
                    url: paramVal(cfg, 'influxdbUrl'),
                    application: paramVal(cfg, 'application'),
                    measurement: paramVal(cfg, 'measurement') || 'jmeter',
                    tags: {
                        env: tags.env || '',
                        scenario: tags.scenario || ''
                    }
                };
            }
        }
        var inf = (model && model.influxdb) || {};
        return {
            enabled: inf.enabled !== false,
            url: inf.url || '',
            application: inf.application || '',
            measurement: inf.measurement || 'jmeter',
            tags: (inf.tags && typeof inf.tags === 'object') ? inf.tags : {}
        };
    }

    function resolveInfluxdbFromData(data) {
        return resolveInfluxdb({
            plan_catalog_items: data && data.plan_catalog_items,
            influxdb: data && data.influxdb
        });
    }

    function resolveEnv(model) {
        var item = findFirstItem(model, isBackendListenerItem);
        if (item) {
            var cfg = backendConfigFromItem(item);
            var tags = parseEventTags(paramVal(cfg, 'eventTags'));
            if (tags.env) return tags.env;
        }
        var inf = model && model.influxdb;
        if (inf && inf.tags && inf.tags.env) return inf.tags.env;
        return (model && model.env) || 'staging';
    }

    function resolveEnvFromData(data) {
        return resolveEnv({
            plan_catalog_items: data && data.plan_catalog_items,
            influxdb: data && data.influxdb,
            env: data && data.env
        });
    }

    function resolveBuild(model) {
        var item = findFirstItem(model, isBackendListenerItem);
        if (item) {
            var cfg = backendConfigFromItem(item);
            var tags = parseEventTags(paramVal(cfg, 'eventTags'));
            if (tags.build) {
                var m = tags.build.match(/\$\{__P\(build,([^)]+)\)\}/);
                if (m) return '${' + m[1] + '}';
                return tags.build;
            }
        }
        return (model && model.build) || '${BUILD_ID}';
    }

    function resolveBuildFromData(data) {
        return resolveBuild({
            plan_catalog_items: data && data.plan_catalog_items,
            build: data && data.build
        });
    }

    function createCatalogItemBase(alias, name, category, guiclass, catalogProps) {
        return {
            id: 'pcat_' + Math.random().toString(36).slice(2, 10),
            type: 'catalog_element',
            name: name,
            label_zh: name,
            enabled: true,
            alias: alias,
            testclass: alias,
            guiclass: guiclass,
            category: category,
            container: false,
            scope: 'plan_catalog',
            catalog_props: catalogProps || { comments: '' }
        };
    }

    function createHttpDefaultsItem(hdProps, name) {
        return createCatalogItemBase(ALIAS_CONFIG, name || 'HTTP 请求默认值', 'config', GUI_HTTP_DEFAULTS, hdProps);
    }

    function defaultInfluxBackendProps(model) {
        var env = (model && model.env) || 'staging';
        var build = (model && model.build) || '${BUILD_ID}';
        var inf = (model && model.influxdb) || {};
        var planName = (model && model.test_plans && model.test_plans[0] && model.test_plans[0].name) || 'API Scenario';
        if (global.JmsBackendListenerCatalog && typeof global.JmsBackendListenerCatalog.defaultConfigFromListenerData === 'function') {
            var cfg = global.JmsBackendListenerCatalog.defaultConfigFromListenerData({
                name: planName,
                env: env,
                influxdb: inf
            });
            return {
                comments: cfg.comments || '',
                classname: cfg.classname,
                queue_size: cfg.queue_size,
                parameters: cfg.parameters
            };
        }
        return {
            comments: '',
            classname: INFLUX_CN,
            queue_size: '5000',
            parameters: [
                { key: 'influxdbUrl', value: inf.url || 'http://127.0.0.1:8086/write?db=jmeter' },
                { key: 'application', value: inf.application || 'application name' },
                { key: 'measurement', value: inf.measurement || 'jmeter' },
                { key: 'eventTags', value: formatEventTags(inf.tags, env, build, planName) }
            ]
        };
    }

    function createBackendListenerItem(props, name) {
        return createCatalogItemBase(ALIAS_BACKEND, name || 'InfluxDB Backend Listener', 'listener', 'BackendListenerGui', props);
    }

    function migrateLegacySceneToCatalog(model) {
        if (model && model._jmx_import_fidelity) return false;
        if (!model) return false;
        var changed = false;
        var list = ensureItems(model);

        if (sid(model.base_url).trim() && !findFirstItem(model, isHttpDefaultsItem)) {
            list.push(createHttpDefaultsItem(baseUrlToHttpDefaultsProps(model.base_url), 'HTTP 请求默认值'));
            changed = true;
        }

        var inf = model.influxdb || {};
        var hasInfluxLegacy = inf.url || inf.application;
        if (hasInfluxLegacy && !findFirstItem(model, isBackendListenerItem)) {
            list.push(createBackendListenerItem(defaultInfluxBackendProps(model), 'InfluxDB Backend Listener'));
            changed = true;
        }

        return changed;
    }

    function migrateLegacySceneDataToCatalog(data) {
        if (data && data._jmx_import_fidelity) return false;
        if (!data || typeof data !== 'object') return false;
        var model = {
            plan_catalog_items: data.plan_catalog_items,
            base_url: data.base_url,
            env: data.env,
            build: data.build,
            influxdb: data.influxdb,
            test_plans: [{ name: data.name }]
        };
        var changed = migrateLegacySceneToCatalog(model);
        if (changed) data.plan_catalog_items = model.plan_catalog_items;
        return changed;
    }

    function syncSceneFieldsOntoModel(model) {
        if (!model) return;
        model.base_url = resolveBaseUrl(model);
        model.env = resolveEnv(model);
        model.build = resolveBuild(model);
        if (!model.influxdb) model.influxdb = {};
        var inf = resolveInfluxdb(model);
        model.influxdb.enabled = inf.enabled !== false;
        model.influxdb.url = inf.url;
        model.influxdb.application = inf.application;
        model.influxdb.measurement = inf.measurement || 'jmeter';
        model.influxdb.tags = inf.tags || {};
    }

    function syncSceneFieldsToCatalog(model) {
        if (model && model._jmx_import_fidelity) return false;
        if (!model) return false;
        var changed = false;
        var list = ensureItems(model);

        if (sid(model.base_url).trim()) {
            var hdItem = findFirstItem(model, isHttpDefaultsItem);
            var hdProps = baseUrlToHttpDefaultsProps(model.base_url);
            if (!hdItem) {
                list.push(createHttpDefaultsItem(hdProps, 'HTTP 请求默认值'));
                changed = true;
            } else {
                hdItem.catalog_props = Object.assign({}, hdItem.catalog_props || {}, hdProps);
                changed = true;
            }
        }

        var inf = model.influxdb || {};
        if (inf.url || inf.application) {
            var blItem = findFirstItem(model, isBackendListenerItem);
            var blProps = defaultInfluxBackendProps(model);
            if (!blItem) {
                list.push(createBackendListenerItem(blProps, 'InfluxDB Backend Listener'));
                changed = true;
            } else {
                blItem.catalog_props = Object.assign({}, blItem.catalog_props || {}, blProps);
                changed = true;
            }
        }
        return changed;
    }

    function hasSceneCatalogSource(model) {
        return !!(findFirstItem(model, isHttpDefaultsItem) || findFirstItem(model, isBackendListenerItem));
    }

    function shouldSkipLegacySceneYamlFields(model) {
        return true;
    }

    function shouldSkipAutoPlanInfluxBackendExport(data) {
        if (!data || !Array.isArray(data.plan_catalog_items)) return false;
        return data.plan_catalog_items.some(function (it) {
            return it && it.enabled !== false && isBackendListenerItem(it);
        });
    }

    function applyResolvedSceneToData(data) {
        if (!data || typeof data !== 'object') return data;
        migrateLegacySceneDataToCatalog(data);
        data.base_url = resolveBaseUrlFromData(data);
        data.env = resolveEnvFromData(data);
        data.build = resolveBuildFromData(data);
        data.influxdb = resolveInfluxdbFromData(data);
        if (data.influxdb && data.influxdb.tags && data.influxdb.tags.env && !data.env) {
            data.env = data.influxdb.tags.env;
        }
        return data;
    }

    var origApply = R.applyResolvedForExport;
    R.applyResolvedForExport = function (data) {
        var out = origApply ? origApply(data) : Object.assign({}, data);
        return applyResolvedSceneToData(out);
    };

    Object.assign(R, {
        GUI_HTTP_DEFAULTS: GUI_HTTP_DEFAULTS,
        ALIAS_BACKEND: ALIAS_BACKEND,
        isHttpDefaultsItem: isHttpDefaultsItem,
        isBackendListenerItem: isBackendListenerItem,
        httpDefaultsToBaseUrl: httpDefaultsToBaseUrl,
        baseUrlToHttpDefaultsProps: baseUrlToHttpDefaultsProps,
        backendConfigFromItem: backendConfigFromItem,
        resolveHttpDefaults: resolveHttpDefaults,
        resolveBaseUrl: resolveBaseUrl,
        resolveBaseUrlFromData: resolveBaseUrlFromData,
        resolveInfluxdb: resolveInfluxdb,
        resolveInfluxdbFromData: resolveInfluxdbFromData,
        resolveEnv: resolveEnv,
        resolveEnvFromData: resolveEnvFromData,
        resolveBuild: resolveBuild,
        resolveBuildFromData: resolveBuildFromData,
        migrateLegacySceneToCatalog: migrateLegacySceneToCatalog,
        migrateLegacySceneDataToCatalog: migrateLegacySceneDataToCatalog,
        syncSceneFieldsOntoModel: syncSceneFieldsOntoModel,
        syncSceneFieldsToCatalog: syncSceneFieldsToCatalog,
        hasSceneCatalogSource: hasSceneCatalogSource,
        shouldSkipLegacySceneYamlFields: shouldSkipLegacySceneYamlFields,
        shouldSkipAutoPlanInfluxBackendExport: shouldSkipAutoPlanInfluxBackendExport,
        applyResolvedSceneToData: applyResolvedSceneToData,
        createHttpDefaultsItem: createHttpDefaultsItem,
        createBackendListenerItem: createBackendListenerItem,
        defaultInfluxBackendProps: defaultInfluxBackendProps
    });
})(typeof window !== 'undefined' ? window : this);
