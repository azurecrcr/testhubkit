/* ---- js/jms_http_step_config_catalog.js ---- */
/**
 * HTTP 步骤级配置元件 · 数据模型（隔离：仅步骤 http_managers，7 种类型）
 */
(function (global) {
    'use strict';

    var STEP_CONFIG_KEYS = ['http_defaults', 'header_manager', 'auth_manager', 'cookie_manager', 'cache_manager', 'csv_data_set', 'counter'];

    var LABELS = {
        http_defaults: 'HTTP 请求默认值',
        header_manager: 'HTTP 信息头管理器',
        auth_manager: 'HTTP 授权管理器',
        cookie_manager: 'HTTP Cookie 管理器',
        cache_manager: 'HTTP 缓存管理器',
        csv_data_set: 'CSV 数据文件设置',
        counter: '计数器'
    };

    function objToVars(obj) {
        if (!obj || typeof obj !== 'object') return [];
        return Object.keys(obj).map(function (k) {
            return { key: k, value: obj[k] == null ? '' : String(obj[k]) };
        });
    }

    function varsToObj(list) {
        var out = {};
        if (!list) return out;
        if (Array.isArray(list)) {
            list.forEach(function (row) {
                if (!row) return;
                var k = String(row.key || '').trim();
                if (k) out[k] = row.value == null ? '' : String(row.value);
            });
            return out;
        }
        if (typeof list === 'object') {
            Object.keys(list).forEach(function (k) {
                if (k) out[k] = list[k] == null ? '' : String(list[k]);
            });
        }
        return out;
    }

    function defaultHttpDefaultsData() {
        return Object.assign({
            enabled: false,
            protocol: '',
            domain: '',
            port: '',
            path: '',
            connect_timeout: '',
            response_timeout: '',
            implementation: '',
            content_encoding: '',
            name: '',
            comments: '',
            follow_redirects: true,
            auto_redirects: false,
            use_keepalive: true,
            arg_mode: 'params',
            parameters: [],
            body_data: ''
        }, global.JmsStepHttpDefaultsAdvanced && global.JmsStepHttpDefaultsAdvanced.DEFAULTS
            ? global.JmsStepHttpDefaultsAdvanced.DEFAULTS : {
                image_parser: false,
                concurrent_dwn: false,
                concurrent_pool: '6',
                embedded_url_re: '',
                ip_source_type: '0',
                ip_source: '',
                proxy_host: '',
                proxy_port: '',
                proxy_user: '',
                proxy_pass: '',
                md5: false
            });
    }

    function defaultCookieManagerData() {
        return {
            enabled: false,
            name: '',
            comments: '',
            clear_each_iteration: true,
            cookie_policy: 'standard',
            cookies: []
        };
    }

    function normalizeCookies(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.map(function (c) {
            if (!c || typeof c !== 'object') return { name: '', value: '', domain: '', path: '/', secure: false, expires: '' };
            return {
                name: String(c.name || ''),
                value: String(c.value || ''),
                domain: String(c.domain || ''),
                path: String(c.path || '/'),
                secure: !!c.secure,
                expires: c.expires !== undefined && c.expires !== null ? String(c.expires) : ''
            };
        });
    }

    function defaultCacheManagerData() {
        return {
            enabled: false,
            name: '',
            comments: '',
            clear_each_iteration: false,
            use_expires: true,
            max_size: '5000'
        };
    }

    function defaultCsvDataSetData() {
        return {
            enabled: false,
            name: '',
            comments: '',
            filename: '',
            source_path: '',
            file_encoding: '',
            variable_names: '',
            ignore_first_line: false,
            delimiter: ',',
            quoted_data: false,
            recycle: true,
            stop_thread: false,
            share_mode: 'shareMode.all',
            file_content: ''
        };
    }

    function defaultAuthManagerData() {
        return {
            enabled: false,
            name: '',
            comments: '',
            clear_each_iteration: false,
            authorizations: []
        };
    }

    function defaultCounterData() {
        return {
            enabled: false,
            name: '',
            comments: '',
            start: '',
            increment: '',
            maximum: '',
            format: '',
            variable_name: '',
            per_user: false,
            reset_each_iteration: false
        };
    }

    function defaultStepHttpManagers() {
        return {
            http_defaults: defaultHttpDefaultsData(),
            header_manager: { enabled: false, headers: [], name: "", comments: "" },
            auth_manager: defaultAuthManagerData(),
            cookie_manager: defaultCookieManagerData(),
            cache_manager: defaultCacheManagerData(),
            csv_data_set: defaultCsvDataSetData(),
            counter: defaultCounterData(),
            selected_types: []
        };
    }

    function parseSelectedTypes(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.filter(function (k) { return STEP_CONFIG_KEYS.indexOf(k) >= 0; });
    }

    function normalizeStepHttpManagers(raw) {
        var def = defaultStepHttpManagers();
        if (!raw || typeof raw !== 'object') return def;
        var hd = raw.http_defaults || {};
        var hm = raw.header_manager || {};
        var am = raw.auth_manager || {};
        var cm = raw.cookie_manager || {};
        var cache = raw.cache_manager || {};
        var csv = raw.csv_data_set || {};
        var counter = raw.counter || {};
        var headers = [];
        if (Array.isArray(hm.headers)) headers = hm.headers.slice();
        else if (hm.headers && typeof hm.headers === 'object') headers = objToVars(hm.headers);
        var httpDef = defaultHttpDefaultsData();
        httpDef.enabled = hd.enabled !== false && !!hd.enabled;
        Object.keys(httpDef).forEach(function (k) {
            if (k === 'enabled' || k === 'parameters' || k === 'arg_mode' || k === 'body_data' || k === 'name' || k === 'comments') return;
            if (hd[k] !== undefined && hd[k] !== null) httpDef[k] = hd[k];
        });
        httpDef.protocol = hd.protocol ? String(hd.protocol) : '';
        httpDef.domain = hd.domain ? String(hd.domain) : '';
        httpDef.port = hd.port !== undefined && hd.port !== null ? String(hd.port) : '';
        httpDef.path = hd.path !== undefined ? String(hd.path) : '';
        httpDef.connect_timeout = hd.connect_timeout !== undefined ? String(hd.connect_timeout) : '';
        httpDef.response_timeout = hd.response_timeout !== undefined ? String(hd.response_timeout) : '';
        httpDef.implementation = hd.implementation !== undefined && hd.implementation !== null ? String(hd.implementation) : '';
        httpDef.content_encoding = hd.content_encoding !== undefined ? String(hd.content_encoding) : '';
        httpDef.name = hd.name !== undefined ? String(hd.name) : '';
        httpDef.comments = hd.comments !== undefined ? String(hd.comments) : '';
        httpDef.follow_redirects = hd.follow_redirects !== false;
        httpDef.auto_redirects = !!hd.auto_redirects;
        httpDef.use_keepalive = hd.use_keepalive !== false;
        httpDef.arg_mode = hd.arg_mode === 'body' ? 'body' : 'params';
        httpDef.body_data = hd.body_data != null ? String(hd.body_data) : '';
        if (global.JmsStepHttpDefaultsJmx && typeof global.JmsStepHttpDefaultsJmx.normalizeParameters === 'function') {
            httpDef.parameters = global.JmsStepHttpDefaultsJmx.normalizeParameters(hd.parameters);
        } else {
            httpDef.parameters = Array.isArray(hd.parameters) ? hd.parameters : [];
        }
        if (global.JmsStepHttpDefaultsAdvanced && typeof global.JmsStepHttpDefaultsAdvanced.normalizeAdvanced === 'function') {
            var adv = global.JmsStepHttpDefaultsAdvanced.normalizeAdvanced(httpDef);
            Object.keys(adv).forEach(function (k) { httpDef[k] = adv[k]; });
        }
        return {
            http_defaults: httpDef,
            header_manager: {
                enabled: !!hm.enabled,
                headers: headers,
                name: hm.name !== undefined ? String(hm.name) : "",
                comments: hm.comments !== undefined ? String(hm.comments) : ""
            },
            auth_manager: (function () {
                var amDef = defaultAuthManagerData();
                amDef.enabled = !!am.enabled;
                amDef.name = am.name !== undefined ? String(am.name) : '';
                amDef.comments = am.comments !== undefined ? String(am.comments) : '';
                amDef.clear_each_iteration = am.clear_each_iteration === true;
                if (global.JmsStepAuthManagerJmx && typeof global.JmsStepAuthManagerJmx.normalizeAuthorizations === 'function') {
                    amDef.authorizations = global.JmsStepAuthManagerJmx.normalizeAuthorizations(am.authorizations);
                } else {
                    amDef.authorizations = Array.isArray(am.authorizations) ? am.authorizations : [];
                }
                return amDef;
            })(),
            cookie_manager: (function () {
                var cookieDef = defaultCookieManagerData();
                cookieDef.enabled = !!cm.enabled;
                cookieDef.name = cm.name !== undefined ? String(cm.name) : '';
                cookieDef.comments = cm.comments !== undefined ? String(cm.comments) : '';
                cookieDef.clear_each_iteration = cm.clear_each_iteration !== false;
                if (global.JmsStepCookieManagerJmx && typeof global.JmsStepCookieManagerJmx.normalizeCookiePolicy === 'function') {
                    cookieDef.cookie_policy = global.JmsStepCookieManagerJmx.normalizeCookiePolicy(cm.cookie_policy);
                } else {
                    cookieDef.cookie_policy = cm.cookie_policy ? String(cm.cookie_policy) : 'standard';
                }
                cookieDef.cookies = normalizeCookies(cm.cookies);
                return cookieDef;
            })(),
            cache_manager: (function () {
                var cacheDef = defaultCacheManagerData();
                cacheDef.enabled = !!cache.enabled;
                cacheDef.name = cache.name !== undefined ? String(cache.name) : '';
                cacheDef.comments = cache.comments !== undefined ? String(cache.comments) : '';
                cacheDef.clear_each_iteration = cache.clear_each_iteration === true;
                cacheDef.use_expires = cache.use_expires !== false;
                if (global.JmsStepCacheManagerJmx && typeof global.JmsStepCacheManagerJmx.normalizeMaxSize === 'function') {
                    cacheDef.max_size = global.JmsStepCacheManagerJmx.normalizeMaxSize(cache.max_size);
                } else {
                    cacheDef.max_size = cache.max_size ? String(cache.max_size) : '5000';
                }
                return cacheDef;
            })(),
            csv_data_set: (function () {
                var csvDef = defaultCsvDataSetData();
                csvDef.enabled = !!csv.enabled;
                csvDef.name = csv.name !== undefined ? String(csv.name) : '';
                csvDef.comments = csv.comments !== undefined ? String(csv.comments) : '';
                ['filename', 'file_encoding', 'variable_names', 'delimiter', 'share_mode', 'file_content'].forEach(function (k) {
                    if (csv[k] !== undefined && csv[k] !== null) csvDef[k] = String(csv[k]);
                });
                if (csv.source_path !== undefined && csv.source_path !== null) {
                    csvDef.source_path = String(csv.source_path);
                }
                csvDef.ignore_first_line = !!csv.ignore_first_line;
                csvDef.quoted_data = !!csv.quoted_data;
                csvDef.recycle = csv.recycle !== false;
                csvDef.stop_thread = !!csv.stop_thread;
                return csvDef;
            })(),
            counter: (function () {
                var ctrDef = defaultCounterData();
                ctrDef.enabled = !!counter.enabled;
                ctrDef.name = counter.name !== undefined ? String(counter.name) : '';
                ctrDef.comments = counter.comments !== undefined ? String(counter.comments) : '';
                ['start', 'increment', 'maximum', 'format', 'variable_name'].forEach(function (k) {
                    if (counter[k] !== undefined && counter[k] !== null) ctrDef[k] = String(counter[k]);
                });
                ctrDef.per_user = counter.per_user === true;
                ctrDef.reset_each_iteration = counter.reset_each_iteration === true;
                return ctrDef;
            })(),
            selected_types: parseSelectedTypes(raw.selected_types)
        };
    }

    /** 旧版配置元件 json_post → 后置处理器 processors（一次性迁移，不影响新数据） */
    function migrateJsonPostFromConfigToProcessors(step) {
        if (!step || !step.http_managers || typeof step.http_managers !== 'object') return step;
        var mgr = step.http_managers;
        var jp = mgr.json_post;
        var sel = parseSelectedTypes(mgr.selected_types);
        var wasActive = sel.indexOf('json_post') >= 0 || (jp && jp.enabled);
        if (jp) delete mgr.json_post;
        if (sel.indexOf('json_post') >= 0) {
            mgr.selected_types = sel.filter(function (k) { return k !== 'json_post'; });
        }
        if (!wasActive || !jp) return step;
        var proc = {
            type: 'json_post',
            name: jp.name ? String(jp.name) : 'JSON提取器',
            comments: jp.comments !== undefined ? String(jp.comments) : '',
            enabled: jp.enabled !== false,
            apply_to: jp.apply_to ? String(jp.apply_to) : 'main',
            apply_to_variable: jp.apply_to_variable !== undefined ? String(jp.apply_to_variable) : '',
            var: jp.var !== undefined ? String(jp.var) : '',
            json_path: jp.json_path !== undefined ? String(jp.json_path) : '',
            match_numbers: jp.match_numbers !== undefined ? String(jp.match_numbers) : '1',
            compute_concat: !!jp.compute_concat,
            default_value: jp.default_value !== undefined ? String(jp.default_value) : ''
        };
        if (!proc.var && !proc.json_path) return step;
        if (!Array.isArray(step.processors)) step.processors = [];
        var dup = step.processors.some(function (p) {
            return p && p.type === 'json_post' &&
                String(p.var || '') === proc.var &&
                String(p.json_path || '') === proc.json_path;
        });
        if (!dup) step.processors.push(proc);
        return step;
    }

    function typeActive(mgr, key) {
        mgr = mgr || defaultStepHttpManagers();
        var sel = parseSelectedTypes(mgr.selected_types);
        if (sel.length) return sel.indexOf(key) >= 0;
        if (key === 'http_defaults') return !!mgr.http_defaults.enabled;
        return !!(mgr[key] && mgr[key].enabled);
    }

    function anyActive(mgr) {
        mgr = mgr || defaultStepHttpManagers();
        return STEP_CONFIG_KEYS.some(function (k) { return typeActive(mgr, k); });
    }

    function migrateLegacyStepHeaders(step) {
        if (!step || typeof step !== 'object') return step;
        if (!step.http_managers) step.http_managers = defaultStepHttpManagers();
        var mgr = step.http_managers;
        var legacy = varsToObj(step.headers);
        if (!Object.keys(legacy).length) return step;
        var existing = varsToObj(mgr.header_manager.headers);
        Object.keys(legacy).forEach(function (k) {
            if (existing[k] === undefined) existing[k] = legacy[k];
        });
        mgr.header_manager.enabled = true;
        mgr.header_manager.headers = objToVars(existing);
        var sel = parseSelectedTypes(mgr.selected_types);
        if (sel.indexOf('header_manager') < 0) sel.push('header_manager');
        mgr.selected_types = sel;
        delete step.headers;
        return step;
    }

    function stepHttpManagersToYaml(mgr) {
        mgr = normalizeStepHttpManagers(mgr);
        var out = {};
        var has = false;
        if (typeActive(mgr, 'http_defaults')) {
            has = true;
            var hd = mgr.http_defaults;
            out.http_defaults = { enabled: hd.enabled !== false };
            if (hd.protocol) out.http_defaults.protocol = hd.protocol;
            if (hd.domain) out.http_defaults.domain = hd.domain;
            if (hd.port) out.http_defaults.port = hd.port;
            if (hd.path) out.http_defaults.path = hd.path;
            if (hd.connect_timeout) out.http_defaults.connect_timeout = hd.connect_timeout;
            if (hd.response_timeout) out.http_defaults.response_timeout = hd.response_timeout;
            if (hd.implementation) out.http_defaults.implementation = hd.implementation;
            if (hd.content_encoding) out.http_defaults.content_encoding = hd.content_encoding;
            if (hd.name) out.http_defaults.name = hd.name;
            if (hd.comments) out.http_defaults.comments = hd.comments;
            if (hd.follow_redirects === false) out.http_defaults.follow_redirects = false;
            if (hd.auto_redirects) out.http_defaults.auto_redirects = true;
            if (hd.use_keepalive === false) out.http_defaults.use_keepalive = false;
            if (hd.arg_mode === 'body') out.http_defaults.arg_mode = 'body';
            if (hd.body_data) out.http_defaults.body_data = hd.body_data;
            if (hd.parameters && hd.parameters.length) out.http_defaults.parameters = hd.parameters;
            if (global.JmsStepHttpDefaultsAdvanced && typeof global.JmsStepHttpDefaultsAdvanced.hasContent === 'function' &&
                global.JmsStepHttpDefaultsAdvanced.hasContent(hd)) {
                var advKeys = Object.keys(global.JmsStepHttpDefaultsAdvanced.DEFAULTS || {});
                advKeys.forEach(function (k) {
                    if (hd[k] !== undefined && hd[k] !== null && String(hd[k]) !== '') {
                        out.http_defaults[k] = hd[k];
                    }
                });
            }
        }
        if (typeActive(mgr, 'header_manager')) {
            var hdrs = varsToObj(mgr.header_manager.headers);
            var hmEn = mgr.header_manager.enabled !== false;
            if (Object.keys(hdrs).length) {
                has = true;
                out.header_manager = { enabled: hmEn, headers: hdrs };
                if (mgr.header_manager.name) out.header_manager.name = mgr.header_manager.name;
                if (mgr.header_manager.comments) out.header_manager.comments = mgr.header_manager.comments;
            } else if (typeActive(mgr, 'header_manager')) {
                has = true;
                out.header_manager = { enabled: hmEn };
                if (mgr.header_manager.name) out.header_manager.name = mgr.header_manager.name;
                if (mgr.header_manager.comments) out.header_manager.comments = mgr.header_manager.comments;
            }
        }
        if (typeActive(mgr, 'auth_manager')) {
            has = true;
            var amMgr = mgr.auth_manager || {};
            out.auth_manager = {
                enabled: amMgr.enabled !== false,
                clear_each_iteration: amMgr.clear_each_iteration === true,
                authorizations: (amMgr.authorizations || []).filter(function (r) {
                    return r && (String(r.url || '').trim() || String(r.username || '').trim() ||
                        String(r.password || '').trim() || String(r.domain || '').trim() || String(r.realm || '').trim());
                })
            };
            if (amMgr.name) out.auth_manager.name = amMgr.name;
            if (amMgr.comments) out.auth_manager.comments = amMgr.comments;
        }
        if (typeActive(mgr, 'cookie_manager')) {
            has = true;
            var cm = mgr.cookie_manager || {};
            var cookies = (cm.cookies || []).filter(function (c) { return c && String(c.name || '').trim(); });
            out.cookie_manager = {
                enabled: cm.enabled !== false,
                clear_each_iteration: cm.clear_each_iteration !== false,
                cookie_policy: cm.cookie_policy || 'standard',
                cookies: cookies
            };
            if (cm.name) out.cookie_manager.name = cm.name;
            if (cm.comments) out.cookie_manager.comments = cm.comments;
        }
        if (typeActive(mgr, 'cache_manager')) {
            has = true;
            var cacheMgr = mgr.cache_manager || {};
            out.cache_manager = {
                enabled: cacheMgr.enabled !== false,
                use_expires: cacheMgr.use_expires !== false
            };
            if (cacheMgr.clear_each_iteration === true) out.cache_manager.clear_each_iteration = true;
            if (cacheMgr.name) out.cache_manager.name = cacheMgr.name;
            if (cacheMgr.comments) out.cache_manager.comments = cacheMgr.comments;
            var maxSz = cacheMgr.max_size ? String(cacheMgr.max_size) : '5000';
            if (maxSz !== '5000') out.cache_manager.max_size = maxSz;
        }
        if (typeActive(mgr, 'csv_data_set')) {
            has = true;
            var csvMgr = mgr.csv_data_set || {};
            out.csv_data_set = { enabled: csvMgr.enabled !== false };
            if (csvMgr.name) out.csv_data_set.name = csvMgr.name;
            if (csvMgr.comments) out.csv_data_set.comments = csvMgr.comments;
            ['filename', 'file_encoding', 'variable_names', 'delimiter', 'share_mode', 'file_content'].forEach(function (k) {
                if (csvMgr[k]) out.csv_data_set[k] = String(csvMgr[k]);
            });
            if (csvMgr.source_path) out.csv_data_set.source_path = String(csvMgr.source_path);
            if (csvMgr.ignore_first_line) out.csv_data_set.ignore_first_line = true;
            if (csvMgr.quoted_data) out.csv_data_set.quoted_data = true;
            if (csvMgr.recycle === false) out.csv_data_set.recycle = false;
            if (csvMgr.stop_thread) out.csv_data_set.stop_thread = true;
        }
        if (typeActive(mgr, 'counter')) {
            has = true;
            var ctrMgr = mgr.counter || {};
            out.counter = { enabled: ctrMgr.enabled !== false };
            if (ctrMgr.name) out.counter.name = ctrMgr.name;
            if (ctrMgr.comments) out.counter.comments = ctrMgr.comments;
            ['start', 'increment', 'maximum', 'format', 'variable_name'].forEach(function (k) {
                if (ctrMgr[k]) out.counter[k] = String(ctrMgr[k]);
            });
            if (ctrMgr.per_user === true) out.counter.per_user = true;
            if (ctrMgr.reset_each_iteration === true) out.counter.reset_each_iteration = true;
        }
        if (!has) return null;
        var sel = parseSelectedTypes(mgr.selected_types);
        if (sel.length) out.selected_types = sel;
        return out;
    }

    function parseStepHttpManagersFromYaml(st) {
        if (!st || !st.http_managers) return defaultStepHttpManagers();
        return normalizeStepHttpManagers(st.http_managers);
    }

    function resolveHttpMethod(raw) {
        if (raw === true || raw === false || raw === null || raw === undefined) return '';
        return String(raw).trim().toUpperCase();
    }

    global.JmsHttpStepConfigCatalog = {
        STEP_CONFIG_KEYS: STEP_CONFIG_KEYS,
        LABELS: LABELS,
        objToVars: objToVars,
        varsToObj: varsToObj,
        defaultHttpDefaultsData: defaultHttpDefaultsData,
        defaultCookieManagerData: defaultCookieManagerData,
        defaultCacheManagerData: defaultCacheManagerData,
        defaultCsvDataSetData: defaultCsvDataSetData,
        defaultAuthManagerData: defaultAuthManagerData,
        defaultCounterData: defaultCounterData,
        normalizeCookies: normalizeCookies,
        defaultStepHttpManagers: defaultStepHttpManagers,
        normalizeStepHttpManagers: normalizeStepHttpManagers,
        parseSelectedTypes: parseSelectedTypes,
        typeActive: typeActive,
        anyActive: anyActive,
        migrateLegacyStepHeaders: migrateLegacyStepHeaders,
        migrateJsonPostFromConfigToProcessors: migrateJsonPostFromConfigToProcessors,
        stepHttpManagersToYaml: stepHttpManagersToYaml,
        parseStepHttpManagersFromYaml: parseStepHttpManagersFromYaml,
        resolveHttpMethod: resolveHttpMethod
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_http_step_config_jmx.js ---- */
/**
 * HTTP 步骤级配置元件 · JMX 导入/导出（隔离模块）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsHttpStepConfigCatalog;

    function getStringProp(el, name) {
        if (!el) return '';
        var list = el.getElementsByTagName('stringProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) return (list[i].textContent || '').trim();
        }
        return '';
    }

    function getBoolProp(el, name, defaultVal) {
        if (!el) return defaultVal;
        var list = el.getElementsByTagName('boolProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) {
                return (list[i].textContent || '').trim().toLowerCase() === 'true';
            }
        }
        return defaultVal;
    }

    function parseHeaderManagerMeta(el) {
        if (!el) return { name: "", comments: "" };
        return {
            name: (el.getAttribute('testname') || '').trim(),
            comments: getStringProp(el, 'TestPlan.comments') || ''
        };
    }

    function parseHeaderManagerEl(el) {
        var headers = {};
        if (!el) return headers;
        var props = el.querySelectorAll('elementProp[elementType="Header"]');
        for (var i = 0; i < props.length; i++) {
            var name = getStringProp(props[i], 'Header.name');
            var val = getStringProp(props[i], 'Header.value');
            if (name) headers[name] = val;
        }
        return headers;
    }

    function parseHttpDefaultsEl(el) {
        var argsEl = el ? el.querySelector('elementProp[name="HTTPsampler.Arguments"]') : null;
        var postBodyRaw = getBoolProp(el, 'HTTPSampler.postBodyRaw', false);
        var argData = global.JmsStepHttpDefaultsJmx && typeof global.JmsStepHttpDefaultsJmx.parseArguments === 'function'
            ? global.JmsStepHttpDefaultsJmx.parseArguments(argsEl, postBodyRaw)
            : { arg_mode: 'params', parameters: [], body_data: '' };
        var out = {
            enabled: true,
            protocol: getStringProp(el, 'HTTPSampler.protocol') || '',
            domain: getStringProp(el, 'HTTPSampler.domain') || '',
            port: getStringProp(el, 'HTTPSampler.port') || '',
            path: getStringProp(el, 'HTTPSampler.path') || '',
            connect_timeout: getStringProp(el, 'HTTPSampler.connect_timeout') || '',
            response_timeout: getStringProp(el, 'HTTPSampler.response_timeout') || '',
            implementation: getStringProp(el, 'HTTPSampler.implementation') || '',
            content_encoding: getStringProp(el, 'HTTPSampler.contentEncoding') || '',
            name: (el && el.getAttribute('testname')) ? String(el.getAttribute('testname')).trim() : '',
            comments: getStringProp(el, 'TestPlan.comments') || '',
            follow_redirects: getBoolProp(el, 'HTTPSampler.follow_redirects', true),
            auto_redirects: getBoolProp(el, 'HTTPSampler.auto_redirects', false),
            use_keepalive: getBoolProp(el, 'HTTPSampler.use_keepalive', true),
            arg_mode: argData.arg_mode,
            parameters: argData.parameters,
            body_data: argData.body_data
        };
        if (global.JmsStepHttpDefaultsAdvanced && typeof global.JmsStepHttpDefaultsAdvanced.parseFromEl === 'function') {
            var adv = global.JmsStepHttpDefaultsAdvanced.parseFromEl(el);
            Object.keys(adv).forEach(function (k) { out[k] = adv[k]; });
        }
        return out;
    }

    function elementChildren(el) {
        var out = [];
        if (!el) return out;
        for (var i = 0; i < el.childNodes.length; i++) {
            if (el.childNodes[i].nodeType === 1) out.push(el.childNodes[i]);
        }
        return out;
    }

    function pairedWalk(tree, visitor) {
        var kids = elementChildren(tree);
        for (var i = 0; i < kids.length; i++) {
            var node = kids[i];
            if (node.tagName === 'hashTree') continue;
            var sub = (kids[i + 1] && kids[i + 1].tagName === 'hashTree') ? kids[i + 1] : null;
            visitor(node, sub);
            if (sub) i++;
        }
    }


    function shouldPreserveHostPathDisplayInline(path) {
        path = String(path || '');
        if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.shouldPreserveHostPathDisplay === 'function') {
            return global.JmsJmxPathHost.shouldPreserveHostPathDisplay(path);
        }
        return /^\/\/[^/?#]+/.test(path) || /^\/[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+\/?$/.test(path);
    }

    function repairHostPathForImportDisplayInline(step) {
        if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.repairHostPathForImportDisplay === 'function') {
            return global.JmsJmxPathHost.repairHostPathForImportDisplay(step);
        }
        if (!step || typeof step !== 'object') return step;
        var path = String(step.path || '');
        if (!shouldPreserveHostPathDisplayInline(path)) return step;
        var m = path.match(/^\/\/([^/?#]+)(\/.*)?$/) || path.match(/^\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        if (m) {
            var domain = m[1];
            var sub = m[2] || '/';
            if (sub.charAt(0) !== '/') sub = '/' + sub;
            step.path = sub === '/' ? ('//' + domain + '/') : ('//' + domain + sub);
        }
        return step;
    }

    function normalizeDomainInPath(step) {
        if (!step || !step.path) return;
        if (shouldPreserveHostPathDisplayInline(String(step.path))) return;
        var path = String(step.path);
        var split = global.JmsJmxPathHost && typeof global.JmsJmxPathHost.splitHostFromPath === 'function'
            ? global.JmsJmxPathHost.splitHostFromPath(path) : null;
        if (!split) {
            var m = path.match(/^\/\/([^/?#]+)(\/.*)?$/);
            if (!m) return;
            split = { domain: m[1], path: m[2] || '/' };
        }
        step.path = split.path || '/';
        if (!Catalog) return;
        if (!step.http_managers) step.http_managers = Catalog.defaultStepHttpManagers();
        var mgr = step.http_managers;
        mgr.http_defaults.enabled = true;
        mgr.http_defaults.domain = split.domain;
        if (step._protocol && !mgr.http_defaults.protocol) mgr.http_defaults.protocol = step._protocol;
        var sel = Catalog.parseSelectedTypes(mgr.selected_types);
        if (sel.indexOf('http_defaults') < 0) sel.push('http_defaults');
        mgr.selected_types = sel;
    }

    function applyImportedSamplerConfig(step, samplerTree) {
        if (!step || !Catalog) return step;
        if (!samplerTree) {
            if (shouldPreserveHostPathDisplayInline(step.path)) {
                repairHostPathForImportDisplayInline(step);
            } else {
                normalizeDomainInPath(step);
            }
            Catalog.migrateLegacyStepHeaders(step);
            return step;
        }
        var mgr = Catalog.defaultStepHttpManagers();
        var selected = [];
        pairedWalk(samplerTree, function (node) {
            var tc = node.getAttribute('testclass') || node.tagName;
            var gui = node.getAttribute('guiclass') || '';
            if (tc === 'ConfigTestElement' && gui === 'HttpDefaultsGui') {
                mgr.http_defaults = parseHttpDefaultsEl(node);
                mgr.http_defaults.enabled = true;
                if (selected.indexOf('http_defaults') < 0) selected.push('http_defaults');
            } else if (tc === 'HeaderManager') {
                var hmMeta = parseHeaderManagerMeta(node);
                mgr.header_manager = {
                    enabled: true,
                    headers: Catalog.objToVars(parseHeaderManagerEl(node)),
                    name: hmMeta.name,
                    comments: hmMeta.comments
                };
                if (selected.indexOf('header_manager') < 0) selected.push('header_manager');
            } else if (tc === 'CookieManager') {
                var cmParsed = global.JmsStepCookieManagerJmx && typeof global.JmsStepCookieManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepCookieManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        enabled: true,
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'CookieManager.clearEachIteration', true),
                        cookie_policy: 'standard',
                        cookies: []
                    };
                mgr.cookie_manager = Object.assign({ enabled: true }, cmParsed);
                if (selected.indexOf('cookie_manager') < 0) selected.push('cookie_manager');
            } else if (tc === 'AuthManager') {
                var amParsed = global.JmsStepAuthManagerJmx && typeof global.JmsStepAuthManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepAuthManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'AuthManager.clearEachIteration', false),
                        authorizations: []
                    };
                mgr.auth_manager = Object.assign({ enabled: true }, amParsed);
                if (selected.indexOf('auth_manager') < 0) selected.push('auth_manager');
            } else if (tc === 'CacheManager') {
                var cacheParsed = global.JmsStepCacheManagerJmx && typeof global.JmsStepCacheManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepCacheManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'clearEachIteration', false),
                        use_expires: getBoolProp(node, 'useExpires', true),
                        max_size: '5000'
                    };
                mgr.cache_manager = Object.assign({ enabled: true }, cacheParsed);
                if (selected.indexOf('cache_manager') < 0) selected.push('cache_manager');
            } else if (tc === 'CSVDataSet') {
                var csvParsed = global.JmsStepCsvDataSetJmx && typeof global.JmsStepCsvDataSetJmx.parseFromEl === 'function'
                    ? global.JmsStepCsvDataSetJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        filename: getStringProp(node, 'filename') || '',
                        file_encoding: getStringProp(node, 'fileEncoding') || 'UTF-8',
                        variable_names: getStringProp(node, 'variableNames') || '',
                        ignore_first_line: getBoolProp(node, 'ignoreFirstLine', false),
                        delimiter: getStringProp(node, 'delimiter') || ',',
                        quoted_data: getBoolProp(node, 'quotedData', false),
                        recycle: getBoolProp(node, 'recycle', true),
                        stop_thread: getBoolProp(node, 'stopThread', false),
                        share_mode: getStringProp(node, 'shareMode') || 'shareMode.all',
                        file_content: ''
                    };
                mgr.csv_data_set = Object.assign({ enabled: true }, csvParsed);
                if (selected.indexOf('csv_data_set') < 0) selected.push('csv_data_set');
            } else if (tc === 'CounterConfig') {
                var ctrParsed = global.JmsStepCounterJmx && typeof global.JmsStepCounterJmx.parseFromEl === 'function'
                    ? global.JmsStepCounterJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        start: getStringProp(node, 'CounterConfig.start') || '',
                        increment: getStringProp(node, 'CounterConfig.incr') || '',
                        maximum: getStringProp(node, 'CounterConfig.end') || '',
                        format: getStringProp(node, 'CounterConfig.format') || '',
                        variable_name: getStringProp(node, 'CounterConfig.name') || '',
                        per_user: getBoolProp(node, 'CounterConfig.per_user', false),
                        reset_each_iteration: getBoolProp(node, 'CounterConfig.reset_on_tg_iteration', false)
                    };
                mgr.counter = Object.assign({ enabled: true }, ctrParsed);
                if (selected.indexOf('counter') < 0) selected.push('counter');
            }
        });
        if (step._protocol || step._domain) {
            if (selected.indexOf('http_defaults') < 0) {
                mgr.http_defaults.enabled = true;
                selected.push('http_defaults');
            }
            if (step._protocol) mgr.http_defaults.protocol = step._protocol;
            if (step._domain) mgr.http_defaults.domain = step._domain;
        }
        if (selected.length) {
            mgr.selected_types = selected;
            step.http_managers = mgr;
        }
        if (Catalog.migrateJsonPostFromConfigToProcessors) {
            Catalog.migrateJsonPostFromConfigToProcessors(step);
        }
        if (shouldPreserveHostPathDisplayInline(step.path)) {
            repairHostPathForImportDisplayInline(step);
        } else {
            normalizeDomainInPath(step);
        }
        Catalog.migrateLegacyStepHeaders(step);
        return step;
    }

    function hasActiveConfig(step) {
        if (!step || !Catalog) return false;
        if (Catalog.anyActive(step.http_managers)) return true;
        return !!(step.headers && Catalog.varsToObj(step.headers) && Object.keys(Catalog.varsToObj(step.headers)).length);
    }

    function genHttpDefaultsXml(hd, childPad, escapeXml) {
        if (!hd || !hd.enabled) return '';
        if (global.JmsStepHttpDefaultsJmx && typeof global.JmsStepHttpDefaultsJmx.genHttpDefaultsXml === 'function') {
            return global.JmsStepHttpDefaultsJmx.genHttpDefaultsXml(hd, childPad, escapeXml);
        }
        if (global.JmsJmxExportCompact) {
            return global.JmsJmxExportCompact.httpDefaultsBlock(hd, childPad, escapeXml);
        }
        var xml = childPad + '<ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="HTTP 请求默认值" enabled="true">\n';
        xml += childPad + '  <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">\n';
        xml += childPad + '    <collectionProp name="Arguments.arguments"/>\n';
        xml += childPad + '  </elementProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.domain">' + escapeXml(hd.domain || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.port">' + escapeXml(hd.port || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.protocol">' + escapeXml(hd.protocol || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.path">' + escapeXml(hd.path || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.contentEncoding">' + escapeXml(hd.content_encoding || '') + '</stringProp>\n';
        xml += childPad + '  <boolProp name="HTTPSampler.follow_redirects">' + (hd.follow_redirects !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <boolProp name="HTTPSampler.auto_redirects">' + (hd.auto_redirects ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <boolProp name="HTTPSampler.use_keepalive">' + (hd.use_keepalive !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.connect_timeout">' + escapeXml(hd.connect_timeout || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.response_timeout">' + escapeXml(hd.response_timeout || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.implementation">' + escapeXml(hd.implementation || 'HttpClient4') + '</stringProp>\n';
        xml += childPad + '</ConfigTestElement>\n' + childPad + '<hashTree/>\n';
        return xml;
    }

    function genAuthManagerXml(cfg, childPad, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        if (global.JmsStepAuthManagerJmx && typeof global.JmsStepAuthManagerJmx.genAuthManagerXml === 'function') {
            return global.JmsStepAuthManagerJmx.genAuthManagerXml(cfg, childPad, escapeXml);
        }
        return '';
    }

    function genCookieManagerXml(cfg, childPad, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        if (global.JmsStepCookieManagerJmx && typeof global.JmsStepCookieManagerJmx.genCookieManagerXml === 'function') {
            return global.JmsStepCookieManagerJmx.genCookieManagerXml(cfg, childPad, escapeXml);
        }
        return '';
    }

    function genCacheManagerXml(cfg, childPad, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        if (global.JmsStepCacheManagerJmx && typeof global.JmsStepCacheManagerJmx.genCacheManagerXml === 'function') {
            return global.JmsStepCacheManagerJmx.genCacheManagerXml(cfg, childPad, escapeXml);
        }
        var clear = cfg.clear_each_iteration === true ? 'true' : 'false';
        var expires = cfg.use_expires !== false ? 'true' : 'false';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        return childPad + '<CacheManager guiclass="CacheManagerGui" testclass="CacheManager" testname="HTTP 缓存管理器"' + en + '>\n' +
            childPad + '  <boolProp name="clearEachIteration">' + clear + '</boolProp>\n' +
            childPad + '  <boolProp name="useExpires">' + expires + '</boolProp>\n' +
            childPad + '</CacheManager>\n' + childPad + '<hashTree/>\n';
    }

    function genCounterXml(cfg, childPad, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        if (global.JmsStepCounterJmx && typeof global.JmsStepCounterJmx.genCounterXml === 'function') {
            return global.JmsStepCounterJmx.genCounterXml(cfg, childPad, escapeXml);
        }
        return '';
    }

    function genCsvDataSetXml(cfg, childPad, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        if (global.JmsStepCsvDataSetJmx && typeof global.JmsStepCsvDataSetJmx.genCsvDataSetXml === 'function') {
            return global.JmsStepCsvDataSetJmx.genCsvDataSetXml(cfg, childPad, escapeXml);
        }
        return '';
    }

    function genHeaderManagerXml(headers, childPad, escapeXml, samplerName, hmMeta) {
        var hdrs = headers || {};
        hmMeta = hmMeta || {};
        var testname = (hmMeta.name && String(hmMeta.name).trim()) ? String(hmMeta.name).trim() : ('步骤配置请求头 ' + (samplerName || ''));
        var comments = hmMeta.comments;
        if (global.JmsJmxExportCompact) {
            return global.JmsJmxExportCompact.headerManagerBlock(hdrs, childPad, testname, escapeXml, comments);
        }
        if (!Object.keys(hdrs).length) {
            return childPad + '<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="' + escapeXml(testname) + '" enabled="true">\n' +
                childPad + '  <collectionProp name="HeaderManager.headers"/>\n' +
                childPad + '</HeaderManager>\n' + childPad + '<hashTree/>\n';
        }
        var xml = childPad + '<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="' + escapeXml(testname) + '" enabled="true">\n';
        xml += childPad + '  <collectionProp name="HeaderManager.headers">\n';
        Object.keys(hdrs).forEach(function (hk) {
            xml += childPad + '    <elementProp name="' + escapeXml(hk) + '" elementType="Header">\n';
            xml += childPad + '      <stringProp name="Header.name">' + escapeXml(hk) + '</stringProp>\n';
            xml += childPad + '      <stringProp name="Header.value">' + escapeXml(hdrs[hk]) + '</stringProp>\n';
            xml += childPad + '    </elementProp>\n';
        });
        xml += childPad + '  </collectionProp>\n';
        xml += childPad + '</HeaderManager>\n' + childPad + '<hashTree/>\n';
        return xml;
    }

    function genStepConfigXml(step, childPad, escapeXml) {
        if (!step || !Catalog) return '';
        var mgr = Catalog.normalizeStepHttpManagers(step.http_managers || Catalog.defaultStepHttpManagers());
        Catalog.migrateLegacyStepHeaders(step);
        mgr = Catalog.normalizeStepHttpManagers(step.http_managers || mgr);
        var xml = '';
        var samplerName = step.name || '';
        if (Catalog.typeActive(mgr, 'http_defaults')) {
            xml += genHttpDefaultsXml(mgr.http_defaults, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'cookie_manager')) {
            xml += genCookieManagerXml(mgr.cookie_manager, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'auth_manager')) {
            xml += genAuthManagerXml(mgr.auth_manager, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'cache_manager')) {
            xml += genCacheManagerXml(mgr.cache_manager, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'csv_data_set')) {
            xml += genCsvDataSetXml(mgr.csv_data_set, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'counter')) {
            xml += genCounterXml(mgr.counter, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'header_manager')) {
            xml += genHeaderManagerXml(
                Catalog.varsToObj(mgr.header_manager.headers),
                childPad,
                escapeXml,
                samplerName,
                { name: mgr.header_manager.name, comments: mgr.header_manager.comments }
            );
        }
        return xml;
    }

    function quoteSpecialHttpMethodsInYaml(yamlText) {
        if (!yamlText) return yamlText;
        return yamlText.replace(/^(\s+method:\s+)(HEAD|OPTIONS)\s*$/gm, '$1"$2"');
    }


    /** JMX 导入专用：仅从 XML 子树中的配置元件还原，不从采样器 domain/path 推断 */
    function applyImportedSamplerConfigStrict(step, samplerTree) {
        if (!step || !Catalog) return step;
        if (!samplerTree) {
            if (shouldPreserveHostPathDisplayInline(step.path)) {
                repairHostPathForImportDisplayInline(step);
            }
            Catalog.migrateLegacyStepHeaders(step);
            return step;
        }
        var mgr = Catalog.defaultStepHttpManagers();
        var selected = [];
        pairedWalk(samplerTree, function (node) {
            var tc = node.getAttribute('testclass') || node.tagName;
            var gui = node.getAttribute('guiclass') || '';
            if (tc === 'ConfigTestElement' && gui === 'HttpDefaultsGui') {
                mgr.http_defaults = parseHttpDefaultsEl(node);
                mgr.http_defaults.enabled = true;
                if (selected.indexOf('http_defaults') < 0) selected.push('http_defaults');
            } else if (tc === 'HeaderManager') {
                var hmMetaStrict = parseHeaderManagerMeta(node);
                mgr.header_manager = {
                    enabled: true,
                    headers: Catalog.objToVars(parseHeaderManagerEl(node)),
                    name: hmMetaStrict.name,
                    comments: hmMetaStrict.comments
                };
                if (selected.indexOf('header_manager') < 0) selected.push('header_manager');
            } else if (tc === 'CookieManager') {
                var cmParsedStrict = global.JmsStepCookieManagerJmx && typeof global.JmsStepCookieManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepCookieManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        enabled: true,
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'CookieManager.clearEachIteration', true),
                        cookie_policy: 'standard',
                        cookies: []
                    };
                mgr.cookie_manager = Object.assign({ enabled: true }, cmParsedStrict);
                if (selected.indexOf('cookie_manager') < 0) selected.push('cookie_manager');
            } else if (tc === 'AuthManager') {
                var amParsedStrict = global.JmsStepAuthManagerJmx && typeof global.JmsStepAuthManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepAuthManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'AuthManager.clearEachIteration', false),
                        authorizations: []
                    };
                mgr.auth_manager = Object.assign({ enabled: true }, amParsedStrict);
                if (selected.indexOf('auth_manager') < 0) selected.push('auth_manager');
            } else if (tc === 'CacheManager') {
                var cacheParsedStrict = global.JmsStepCacheManagerJmx && typeof global.JmsStepCacheManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepCacheManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'clearEachIteration', false),
                        use_expires: getBoolProp(node, 'useExpires', true),
                        max_size: '5000'
                    };
                mgr.cache_manager = Object.assign({ enabled: true }, cacheParsedStrict);
                if (selected.indexOf('cache_manager') < 0) selected.push('cache_manager');
            } else if (tc === 'CSVDataSet') {
                var csvParsedStrict = global.JmsStepCsvDataSetJmx && typeof global.JmsStepCsvDataSetJmx.parseFromEl === 'function'
                    ? global.JmsStepCsvDataSetJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        filename: getStringProp(node, 'filename') || '',
                        file_encoding: getStringProp(node, 'fileEncoding') || 'UTF-8',
                        variable_names: getStringProp(node, 'variableNames') || '',
                        ignore_first_line: getBoolProp(node, 'ignoreFirstLine', false),
                        delimiter: getStringProp(node, 'delimiter') || ',',
                        quoted_data: getBoolProp(node, 'quotedData', false),
                        recycle: getBoolProp(node, 'recycle', true),
                        stop_thread: getBoolProp(node, 'stopThread', false),
                        share_mode: getStringProp(node, 'shareMode') || 'shareMode.all',
                        file_content: ''
                    };
                mgr.csv_data_set = Object.assign({ enabled: true }, csvParsedStrict);
                if (selected.indexOf('csv_data_set') < 0) selected.push('csv_data_set');
            } else if (tc === 'CounterConfig') {
                var ctrParsedStrict = global.JmsStepCounterJmx && typeof global.JmsStepCounterJmx.parseFromEl === 'function'
                    ? global.JmsStepCounterJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        start: getStringProp(node, 'CounterConfig.start') || '',
                        increment: getStringProp(node, 'CounterConfig.incr') || '',
                        maximum: getStringProp(node, 'CounterConfig.end') || '',
                        format: getStringProp(node, 'CounterConfig.format') || '',
                        variable_name: getStringProp(node, 'CounterConfig.name') || '',
                        per_user: getBoolProp(node, 'CounterConfig.per_user', false),
                        reset_each_iteration: getBoolProp(node, 'CounterConfig.reset_on_tg_iteration', false)
                    };
                mgr.counter = Object.assign({ enabled: true }, ctrParsedStrict);
                if (selected.indexOf('counter') < 0) selected.push('counter');
            }
        });
        if (selected.length) {
            mgr.selected_types = selected;
            step.http_managers = mgr;
        }
        if (Catalog.migrateJsonPostFromConfigToProcessors) {
            Catalog.migrateJsonPostFromConfigToProcessors(step);
        }
        if (shouldPreserveHostPathDisplayInline(step.path)) {
            repairHostPathForImportDisplayInline(step);
        }
        Catalog.migrateLegacyStepHeaders(step);
        return step;
    }

    global.JmsHttpStepConfigJmx = {
        applyImportedSamplerConfig: applyImportedSamplerConfig,
        applyImportedSamplerConfigStrict: applyImportedSamplerConfigStrict,
        hasActiveConfig: hasActiveConfig,
        genStepConfigXml: genStepConfigXml,
        quoteSpecialHttpMethodsInYaml: quoteSpecialHttpMethodsInYaml,
        normalizeDomainInPath: normalizeDomainInPath
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_logic_ctrl_append_order.js ---- */
/**
 * 线程组顶层逻辑控制器 · 追加到步骤区底部（隔离模块）
 */
(function (global) {
    'use strict';

    var LOGIC_TYPES = [
        'if_controller', 'random_controller', 'simple_controller',
        'transaction_controller', 'loop_controller'
    ];

    function isLogicContainerStep(st) {
        return !!(st && st.type && LOGIC_TYPES.indexOf(st.type) >= 0);
    }

    function readOrder(ref) {
        if (!ref) return null;
        if (ref.timeline_order != null) return ref.timeline_order;
        if (ref.import_order != null) return ref.import_order;
        return null;
    }

    function maxStepAreaOrder(tg, skipRef) {
        var max = -1;
        (tg.steps || []).forEach(function (st) {
            if (!st || st === skipRef) return;
            var o = readOrder(st);
            if (o != null && o > max) max = o;
        });
        return max;
    }

    function persistOrder(ref, order) {
        if (!ref || order == null) return;
        ref.timeline_order = order;
        ref.import_order = order;
    }

    /** 逻辑控制器写入步骤区时间线末尾（不影响 HTTP/后置等其它 append） */
    function assignLogicControllerTimelineOrder(tg, ref) {
        if (!tg || !ref || !isLogicContainerStep(ref)) return false;
        var TL = global.JmsTgDetailTimeline;
        if (TL && typeof TL.ensureAllTopLevelHaveTimelineOrder === 'function') {
            TL.ensureAllTopLevelHaveTimelineOrder(tg, ref);
        }
        var maxAmongSteps = maxStepAreaOrder(tg, ref);
        if (maxAmongSteps >= 0) {
            persistOrder(ref, maxAmongSteps + 1);
            return true;
        }
        if (TL && typeof TL.assignAppendTimelineOrder === 'function') {
            TL.assignAppendTimelineOrder(tg, ref);
            return true;
        }
        persistOrder(ref, 0);
        return true;
    }

    global.JmsTgLogicCtrlAppendOrder = {
        isLogicContainerStep: isLogicContainerStep,
        assignLogicControllerTimelineOrder: assignLogicControllerTimelineOrder
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_jmx_export_tg_scope.js ---- */
/**
 * JMX ?? ? ???????/HTTP??? ???????????
 * ???????????????????????????????
 */
(function (global) {
    'use strict';

    function isConfigTimelineActive(tg) {
        return !!(tg && (tg.config_timeline_active || tg._config_timeline_active));
    }

    function hasHttpDefaultsConfigItem(tg) {
        if (!tg || !Array.isArray(tg.config_items)) return false;
        return tg.config_items.some(function (it) {
            if (!it || it.type !== 'http_defaults' || it._deleted) return false;
            var d = it.data || {};
            return d.enabled !== false;
        });
    }

    function hasText(v) {
        return v !== undefined && v !== null && String(v).trim() !== '';
    }

    function hasExplicitHttpDefaultsContent(hd) {
        if (!hd || typeof hd !== 'object') return false;
        return hasText(hd.protocol) || hasText(hd.domain) || hasText(hd.port) || hasText(hd.path) ||
            hasText(hd.connect_timeout) || hasText(hd.response_timeout) || hasText(hd.content_encoding) ||
            (hasText(hd.implementation) && String(hd.implementation) !== 'HttpClient4') ||
            hd.auto_redirects === true || hd.follow_redirects === false || hd.use_keepalive === false;
    }

    function isHttpDefaultsSelected(httpMgr) {
        if (!httpMgr || !httpMgr.http_defaults) return false;
        var hd = httpMgr.http_defaults;
        if (hd.enabled === false) return false;
        var sel = httpMgr.selected_types;
        if (Array.isArray(sel) && sel.length) {
            return sel.indexOf('http_defaults') >= 0;
        }
        return hd.enabled === true;
    }

    /** ??? legacy http_managers ?????? HTTP ????? */
    function shouldExportLegacyHttpDefaults(httpMgr, tg) {
        if (!httpMgr || !httpMgr.http_defaults) return false;
        if (isConfigTimelineActive(tg) && !hasHttpDefaultsConfigItem(tg)) return false;
        if (!isHttpDefaultsSelected(httpMgr)) return false;
        return hasExplicitHttpDefaultsContent(httpMgr.http_defaults);
    }

    function planHeadersUsable(defaultHeaders) {
        return !!(defaultHeaders && typeof defaultHeaders === 'object' && Object.keys(defaultHeaders).length);
    }

    function tgHasExplicitHeaderManager(tg, httpMgr) {
        if (!tg) return false;
        var Catalog = global.JmsTgConfigCatalog;
        if (Catalog && typeof Catalog.ensureConfigItems === 'function') {
            var items = Catalog.ensureConfigItems(tg);
            var i;
            for (i = 0; i < items.length; i++) {
                var it = items[i];
                if (it && it.type === 'header_manager' && Catalog.isPersistable && Catalog.isPersistable(it)) return true;
            }
        }
        var hm = (httpMgr && httpMgr.header_manager) || (tg.http_managers && tg.http_managers.header_manager);
        if (!hm || hm.enabled === false) return false;
        var selected = (httpMgr && httpMgr.selected_types) || (tg.http_managers && tg.http_managers.selected_types);
        if (Array.isArray(selected) && selected.length) {
            return selected.indexOf('header_manager') >= 0;
        }
        return true;
    }

    /** 线程组未单独配置 HeaderManager 时，继承计划级 catalog 公共请求头 */
    function shouldInjectThreadGroupDefaultHeaders(tg, httpMgr, defaultHeaders) {
        if (!planHeadersUsable(defaultHeaders)) return false;
        return !tgHasExplicitHeaderManager(tg, httpMgr);
    }

    /** config_items 导出路径：同上 */
    function shouldInjectConfigItemsDefaultHeaders(tg, items, defaultHeaders) {
        if (!planHeadersUsable(defaultHeaders)) return false;
        var hasHeader = false;
        (items || []).forEach(function (it) {
            if (it && it.type === 'header_manager') hasHeader = true;
        });
        return !hasHeader;
    }

    global.JmsTgJmxExportTgScope = {
        shouldExportLegacyHttpDefaults: shouldExportLegacyHttpDefaults,
        shouldInjectThreadGroupDefaultHeaders: shouldInjectThreadGroupDefaultHeaders,
        shouldInjectConfigItemsDefaultHeaders: shouldInjectConfigItemsDefaultHeaders,
        isConfigTimelineActive: isConfigTimelineActive,
        hasHttpDefaultsConfigItem: hasHttpDefaultsConfigItem
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_jmx_export_filter.js ---- */
/**
 * 线程组 JMX 导出过滤器（隔离模块）
 * 仅导出步骤区域内已添加且未删除的组件；删除/关闭的不导出。
 * 线程组级 processors / variables：UI 显式添加或 YAML/时间线可见项均导出。
 */
(function (global) {
    'use strict';

    function isUiAddedProcessor(proc) {
        return !!(proc && proc._ui_added === true);
    }

    function isUiAddedTgVariables(tg) {
        return !!(tg && tg._variables_ui_added === true);
    }

    function shouldExportProcessorForTimeline(proc) {
        if (!proc || !proc.type || proc._deleted) return false;
        if (proc._timeline_export_skip === true) return false;
        return true;
    }

    function shouldExportTgVariablesForTimeline(tg, variables) {
        var obj = variablesToObject(variables);
        if (!Object.keys(obj).length) return false;
        if (tg && tg._variables_block && tg._variables_block.enabled === false) return false;
        var V = global.JmsTgVariablesTimelineUi;
        if (V && typeof V.isVariablesBlockActive === 'function' && !V.isVariablesBlockActive(tg)) {
            return false;
        }
        return true;
    }

    function filterListenersForExport(listeners) {
        var ls = listeners || {};
        var out = {};
        if (ls.view_results_tree === true) out.view_results_tree = true;
        if (ls.aggregate_report === true) out.aggregate_report = true;
        if (ls.backend_listener === true) out.backend_listener = true;
        return out;
    }

    function filterProcessorsForExport(processors) {
        return (processors || []).filter(function (proc) {
            return isUiAddedProcessor(proc) || shouldExportProcessorForTimeline(proc);
        });
    }

    function variablesToObject(variables) {
        if (!variables) return {};
        if (Array.isArray(variables)) {
            var out = {};
            variables.forEach(function (row) {
                var k = row && String(row.key || '').trim();
                if (!k) return;
                out[k] = row.value == null ? '' : String(row.value);
            });
            return out;
        }
        if (typeof variables === 'object') return Object.assign({}, variables);
        return {};
    }

    function filterVariablesForExport(variables, tg) {
        if (!isUiAddedTgVariables(tg) && !shouldExportTgVariablesForTimeline(tg, variables)) return {};
        var obj = variablesToObject(variables);
        Object.keys(obj).forEach(function (k) {
            if (!String(k).trim()) delete obj[k];
        });
        return obj;
    }

    function hasVariableEntries(variables, tg) {
        return Object.keys(filterVariablesForExport(variables, tg)).length > 0;
    }

    function filterHttpManagersForExport(mgr) {
        if (!mgr || typeof mgr !== 'object') return mgr;
        var out = JSON.parse(JSON.stringify(mgr));
        var selected = Array.isArray(out.selected_types) ? out.selected_types : null;

        function allowed(key) {
            if (!selected || !selected.length) {
                var block = out[key];
                return !!(block && block.enabled);
            }
            return selected.indexOf(key) >= 0 && out[key] && out[key].enabled;
        }

        ['http_defaults', 'header_manager', 'cookie_manager', 'cache_manager', 'csv_data_set', 'counter'].forEach(function (key) {
            if (!out[key]) return;
            if (!allowed(key)) out[key].enabled = false;
        });

        if (selected && selected.length) {
            out.selected_types = selected.filter(function (key) {
                return out[key] && out[key].enabled;
            });
        }
        return out;
    }

    function tgHasExplicitHeaderManager(tg) {
        if (!tg) return false;
        var Catalog = global.JmsTgConfigCatalog;
        if (Catalog && typeof Catalog.ensureConfigItems === 'function') {
            var items = Catalog.ensureConfigItems(tg);
            var i;
            for (i = 0; i < items.length; i++) {
                var it = items[i];
                if (it && it.type === 'header_manager' && Catalog.isPersistable && Catalog.isPersistable(it)) return true;
            }
        }
        var hm = tg.http_managers && tg.http_managers.header_manager;
        if (!hm || !hm.enabled) return false;
        var selected = tg.http_managers.selected_types;
        if (Array.isArray(selected) && selected.length) {
            return selected.indexOf('header_manager') >= 0;
        }
        return true;
    }

    /** 不向线程组注入场景级 default_headers fallback */
    function defaultHeadersForTgExport(tg, planHeaders) {
        if (!tgHasExplicitHeaderManager(tg)) return null;
        var hm = tg.http_managers && tg.http_managers.header_manager;
        if (hm && hm.headers && typeof hm.headers === 'object') return hm.headers;
        return null;
    }

    function shouldExportInheritedDefaultHeaders(tg, planHeaders) {
        if (!planHeaders || typeof planHeaders !== 'object' || !Object.keys(planHeaders).length) return false;
        var Scope = global.JmsTgJmxExportTgScope;
        if (Scope && typeof Scope.shouldInjectThreadGroupDefaultHeaders === 'function') {
            return Scope.shouldInjectThreadGroupDefaultHeaders(tg, tg && tg.http_managers, planHeaders);
        }
        return false;
    }

    function filterConfigItemsForExport(configItems) {
        var Catalog = global.JmsTgConfigCatalog;
        return (configItems || []).filter(function (item) {
            if (!item || !item.type || item._deleted) return false;
            if (Catalog && typeof Catalog.isPersistable === 'function') return Catalog.isPersistable(item);
            return true;
        });
    }

    function sanitizeTgUiExportGate(tg) {
        if (!tg) return;
        if (Array.isArray(tg.processors)) {
            tg.processors = tg.processors.filter(function (proc) {
                return isUiAddedProcessor(proc) || shouldExportProcessorForTimeline(proc);
            });
        }
        if (!isUiAddedTgVariables(tg) && !shouldExportTgVariablesForTimeline(tg, tg.variables)) {
            tg.variables = [];
        }
    }

    function sanitizeModelUiExportGate(model) {
        if (!model) return;
        function walk(list) {
            (list || []).forEach(sanitizeTgUiExportGate);
        }
        walk(model.setup_thread_groups);
        walk(model.post_thread_groups);
        (model.test_plans || []).forEach(function (plan) {
            walk(plan.thread_groups);
        });
    }

    function exportHost() {
        return global.JmsTgJmxExportFilter || null;
    }

    function callProcessorFilter(list) {
        var host = exportHost();
        if (host && typeof host.filterProcessorsForExport === 'function') {
            return host.filterProcessorsForExport(list);
        }
        return filterProcessorsForExport(list);
    }

    function callVariablesFilter(variables, tg) {
        var host = exportHost();
        if (host && typeof host.filterVariablesForExport === 'function') {
            return host.filterVariablesForExport(variables, tg);
        }
        return filterVariablesForExport(variables, tg);
    }

    function prepareTgForJmxExport(tg) {
        if (!tg || typeof tg !== 'object') return tg;
        var out = Object.assign({}, tg);
        out.listeners = filterListenersForExport(tg.listeners);

        if (!out.listeners.backend_listener) {
            delete out.backend_listener;
        }

        if (!out.listeners.view_results_tree) delete out.view_results_tree;
        if (!out.listeners.aggregate_report) delete out.aggregate_report;

        out.processors = callProcessorFilter(tg.processors);
        out.variables = callVariablesFilter(tg.variables, tg);
        var Sync = global.JmsTgConfigExportSync;
        if (Sync && typeof Sync.applyTgConfigExportFields === 'function') {
            var cfgExport = Sync.applyTgConfigExportFields(tg);
            out.config_items = cfgExport.config_items || [];
            out.http_managers = cfgExport.http_managers;
        } else {
            out.http_managers = filterHttpManagersForExport(tg.http_managers);
            if (Array.isArray(tg.config_items)) {
                out.config_items = filterConfigItemsForExport(tg.config_items);
            }
        }

        if (Array.isArray(tg.assertions)) {
            out.assertions = tg.assertions.filter(function (a) {
                return a && a.type && !a._deleted;
            });
        }

        return out;
    }

    function mapThreadGroups(list) {
        return (list || []).map(prepareTgForJmxExport);
    }

    function prepareScenarioForJmxExport(data) {
        if (!data || typeof data !== 'object') return data;
        if (global.JmsTgConfigExportSync &&
            typeof global.JmsTgConfigExportSync.mergeScenarioFromVisualModel === 'function') {
            data = global.JmsTgConfigExportSync.mergeScenarioFromVisualModel(data);
        }
        var out = Object.assign({}, data);
        out.setup_thread_groups = mapThreadGroups(data.setup_thread_groups);
        out.post_thread_groups = mapThreadGroups(data.post_thread_groups);
        if (Array.isArray(data.thread_groups)) {
            out.thread_groups = mapThreadGroups(data.thread_groups);
        }
        if (Array.isArray(data.test_plans)) {
            out.test_plans = data.test_plans.map(function (plan) {
                var p = Object.assign({}, plan);
                if (Array.isArray(plan.thread_groups)) {
                    p.thread_groups = mapThreadGroups(plan.thread_groups);
                }
                return p;
            });
        }
        return out;
    }

    function patchProcessorsExport() {
        var Adv = global.JmxScenarioAdvanced;
        if (!Adv || typeof Adv.genProcessorsXml !== 'function') return;
        if (!Adv.__jmxExportFilterOrigGenProcessorsXml) {
            Adv.__jmxExportFilterOrigGenProcessorsXml = Adv.genProcessorsXml;
        }
        var orig = Adv.__jmxExportFilterOrigGenProcessorsXml;
        Adv.genProcessorsXml = function (list, indent, escapeXml) {
            var filtered = callProcessorFilter(list);
            return orig.call(Adv, filtered, indent, escapeXml);
        };
        Adv.__jmxExportFilterPatched = true;
    }

    function findTgInModel(model, planId, tgId) {
        if (!model || !tgId) return null;
        var tg = (model.setup_thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        tg = (model.post_thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        var plan = (model.test_plans || []).find(function (p) { return !planId || p.id === planId; });
        if (!plan) return null;
        return (plan.thread_groups || []).find(function (t) { return t.id === tgId; }) || null;
    }

    function markLastTgProcessorUiAdded(planId, tgId) {
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.getModel !== 'function') return;
        var tg = findTgInModel(vb.getModel(), planId, tgId);
        if (!tg || !Array.isArray(tg.processors) || !tg.processors.length) return;
        var last = tg.processors[tg.processors.length - 1];
        if (last) last._ui_added = true;
    }

    function bindProcessorUiAddGate() {
        if (!global.document || !global.document.body) return;
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsTgProcessorUiExportGate === '1') return;
        root.dataset.jmsTgProcessorUiExportGate = '1';
        root.addEventListener('click', function (ev) {
            var addBtn = ev.target && ev.target.closest ? ev.target.closest('.jms-btn-add-tg-processor') : null;
            if (!addBtn) return;
            var planId = addBtn.getAttribute('data-plan-id');
            var tgId = addBtn.getAttribute('data-tg-id');
            global.setTimeout(function () { markLastTgProcessorUiAdded(planId, tgId); }, 0);
        }, true);
    }

    function tryPatch() {
        patchProcessorsExport();
        bindProcessorUiAddGate();
    }

    if (global.document) {
        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', tryPatch);
        } else {
            tryPatch();
        }
        if (global.addEventListener) global.addEventListener('load', tryPatch);
    } else {
        tryPatch();
    }

    global.JmsTgJmxExportFilter = {
        __jmxExportFilterHost: true,
        isUiAddedProcessor: isUiAddedProcessor,
        isUiAddedTgVariables: isUiAddedTgVariables,
        shouldExportProcessorForTimeline: shouldExportProcessorForTimeline,
        shouldExportTgVariablesForTimeline: shouldExportTgVariablesForTimeline,
        filterListenersForExport: filterListenersForExport,
        filterProcessorsForExport: filterProcessorsForExport,
        filterVariablesForExport: filterVariablesForExport,
        hasVariableEntries: hasVariableEntries,
        filterHttpManagersForExport: filterHttpManagersForExport,
        defaultHeadersForTgExport: defaultHeadersForTgExport,
        shouldExportInheritedDefaultHeaders: shouldExportInheritedDefaultHeaders,
        filterConfigItemsForExport: filterConfigItemsForExport,
        sanitizeTgUiExportGate: sanitizeTgUiExportGate,
        sanitizeModelUiExportGate: sanitizeModelUiExportGate,
        prepareTgForJmxExport: prepareTgForJmxExport,
        prepareScenarioForJmxExport: prepareScenarioForJmxExport,
        markLastTgProcessorUiAdded: markLastTgProcessorUiAdded
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_config_export_sync.js ---- */
/**
 * 线程组配置元件 · 步骤区/模型与 JMX 导出对齐（隔离模块）
 */
(function (global) {
    'use strict';

    var CONFIG_KEYS = ['http_defaults', 'header_manager', 'auth_manager', 'cookie_manager', 'cache_manager', 'csv_data_set', 'counter'];

    function catalog() {
        return global.JmsTgConfigCatalog;
    }

    function isConfigTimelineActive(tg) {
        return !!(tg && (tg._config_timeline_active || tg.config_timeline_active));
    }

    function markConfigTimelineActive(tg) {
        if (tg) tg._config_timeline_active = true;
    }

    function removeConfigTypeFromHttpManagers(tg, typeKey) {
        if (!tg || !typeKey) return;
        if (!tg.http_managers || typeof tg.http_managers !== 'object') return;
        var mgr = tg.http_managers;
        if (mgr[typeKey] && typeof mgr[typeKey] === 'object') {
            mgr[typeKey].enabled = false;
        }
        if (Array.isArray(mgr.selected_types)) {
            mgr.selected_types = mgr.selected_types.filter(function (k) { return k !== typeKey; });
        }
    }

    function normalizeRemovedConfigTypes(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.filter(function (k) { return CONFIG_KEYS.indexOf(k) >= 0; });
    }

    function getRemovedConfigTypes(tg) {
        if (!tg) return [];
        return normalizeRemovedConfigTypes(tg._removed_config_types);
    }

    function isConfigTypeRemoved(tg, typeKey) {
        if (!tg || !typeKey) return false;
        return getRemovedConfigTypes(tg).indexOf(typeKey) >= 0;
    }

    function recordRemovedConfigType(tg, typeKey) {
        if (!tg || !typeKey || CONFIG_KEYS.indexOf(typeKey) < 0) return;
        markConfigTimelineActive(tg);
        var list = getRemovedConfigTypes(tg).slice();
        if (list.indexOf(typeKey) < 0) list.push(typeKey);
        tg._removed_config_types = list;
    }

    function purgeHttpManagerConfigData(mgr, typeKey) {
        if (!mgr || !typeKey || !mgr[typeKey] || typeof mgr[typeKey] !== 'object') return;
        var slice = mgr[typeKey];
        slice.enabled = false;
        if (typeKey === 'csv_data_set') {
            slice.filename = '';
            slice.variable_names = '';
            slice.file_content = '';
        }
    }

    function syncConfigItemRemoval(tg, item) {
        if (!tg || !item || !item.type) return;
        markConfigTimelineActive(tg);
        recordRemovedConfigType(tg, item.type);
        removeConfigTypeFromHttpManagers(tg, item.type);
        if (tg.http_managers) purgeHttpManagerConfigData(tg.http_managers, item.type);
    }

    function resolveExportConfigItems(tg) {
        var items = Array.isArray(tg && tg.config_items) ? tg.config_items : [];
        var F = global.JmsTgJmxExportFilter;
        if (F && typeof F.filterConfigItemsForExport === 'function') {
            return F.filterConfigItemsForExport(items);
        }
        var Cat = catalog();
        return items.filter(function (it) {
            if (!it || it._deleted) return false;
            if (Cat && typeof Cat.isPersistable === 'function') return Cat.isPersistable(it);
            return true;
        });
    }

    function cloneMgr(mgr) {
        if (!mgr || typeof mgr !== 'object') return mgr;
        var F = global.JmsTgJmxExportFilter;
        if (F && typeof F.filterHttpManagersForExport === 'function') {
            return F.filterHttpManagersForExport(mgr);
        }
        try {
            return JSON.parse(JSON.stringify(mgr));
        } catch (e) {
            return mgr;
        }
    }

    function stripHttpManagersByConfigItems(mgr, configItems, tg) {
        var out = cloneMgr(mgr);
        if (!out) return out;
        var items = configItems || [];
        var present = {};
        items.forEach(function (it) {
            if (it && it.type) present[it.type] = true;
        });

        var shouldStrip = items.length > 0 || isConfigTimelineActive(tg);
        if (!shouldStrip) return out;

        CONFIG_KEYS.forEach(function (key) {
            if (present[key]) return;
            if (out[key] && typeof out[key] === 'object') {
                out[key].enabled = false;
            }
        });
        if (Array.isArray(out.selected_types)) {
            out.selected_types = out.selected_types.filter(function (key) {
                return !!present[key] && out[key] && out[key].enabled !== false;
            });
        }
        return out;
    }

    function applyTgConfigExportFields(tg) {
        if (!tg || typeof tg !== 'object') return { config_items: [], http_managers: tg && tg.http_managers };
        var items = resolveExportConfigItems(tg);
        return {
            config_items: items,
            http_managers: stripHttpManagersByConfigItems(tg.http_managers, items, tg)
        };
    }

    function findModelTg(model, scenarioTg) {
        if (!model || !scenarioTg) return null;
        var name = scenarioTg.name ? String(scenarioTg.name) : '';
        var id = scenarioTg.id ? String(scenarioTg.id) : '';
        var lists = [model.setup_thread_groups, model.post_thread_groups];
        var i;
        for (i = 0; i < lists.length; i++) {
            var list = lists[i] || [];
            var hit = list.find(function (t) {
                return t && ((id && t.id === id) || (name && t.name === name));
            });
            if (hit) return hit;
        }
        var plans = model.test_plans || [];
        for (i = 0; i < plans.length; i++) {
            var tgs = (plans[i] && plans[i].thread_groups) || [];
            var hit2 = tgs.find(function (t) {
                return t && ((id && t.id === id) || (name && t.name === name));
            });
            if (hit2) return hit2;
        }
        return null;
    }

    function modelTgHasConfigTimeline(modelTg) {
        if (!modelTg) return false;
        if (isConfigTimelineActive(modelTg)) return true;
        return Array.isArray(modelTg.config_items) && modelTg.config_items.length > 0;
    }

    function mergeTgConfigFromModel(scenarioTg, modelTg) {
        if (!scenarioTg || !modelTg || !modelTgHasConfigTimeline(modelTg)) return scenarioTg;
        var exportFields = applyTgConfigExportFields(modelTg);
        scenarioTg.config_items = exportFields.config_items || [];
        scenarioTg.http_managers = exportFields.http_managers;
        if (isConfigTimelineActive(modelTg)) {
            scenarioTg.config_timeline_active = true;
            scenarioTg._config_timeline_active = true;
        }
        return scenarioTg;
    }

    function mergeScenarioFromVisualModel(scenario) {
        var vb = global.JmsVisualBuilder;
        if (!scenario || !vb || typeof vb.getModel !== 'function') return scenario;
        var model = vb.getModel();
        if (!model) return scenario;

        function walk(list) {
            return (list || []).map(function (tg) {
                var modelTg = findModelTg(model, tg);
                return modelTg ? mergeTgConfigFromModel(Object.assign({}, tg), modelTg) : tg;
            });
        }

        var out = Object.assign({}, scenario);
        out.setup_thread_groups = walk(scenario.setup_thread_groups);
        out.post_thread_groups = walk(scenario.post_thread_groups);
        if (Array.isArray(scenario.thread_groups)) {
            out.thread_groups = walk(scenario.thread_groups);
        }
        return out;
    }

    global.JmsTgConfigExportSync = {
        CONFIG_KEYS: CONFIG_KEYS,
        markConfigTimelineActive: markConfigTimelineActive,
        isConfigTimelineActive: isConfigTimelineActive,
        removeConfigTypeFromHttpManagers: removeConfigTypeFromHttpManagers,
        normalizeRemovedConfigTypes: normalizeRemovedConfigTypes,
        getRemovedConfigTypes: getRemovedConfigTypes,
        isConfigTypeRemoved: isConfigTypeRemoved,
        recordRemovedConfigType: recordRemovedConfigType,
        purgeHttpManagerConfigData: purgeHttpManagerConfigData,
        syncConfigItemRemoval: syncConfigItemRemoval,
        resolveExportConfigItems: resolveExportConfigItems,
        stripHttpManagersByConfigItems: stripHttpManagersByConfigItems,
        applyTgConfigExportFields: applyTgConfigExportFields,
        mergeTgConfigFromModel: mergeTgConfigFromModel,
        mergeScenarioFromVisualModel: mergeScenarioFromVisualModel
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_config_catalog.js ---- */
/**
 * 线程组配置元件 · 数据模型（隔离模块，支持多实例 config_items）
 */
(function (global) {
    'use strict';

    var CONFIG_KEYS = ['http_defaults', 'header_manager', 'auth_manager', 'cookie_manager', 'cache_manager', 'csv_data_set', 'counter'];
    var LABELS = {
        http_defaults: 'HTTP 请求默认值',
        header_manager: 'HTTP 请求头管理器',
        auth_manager: 'HTTP 授权管理器',
        cookie_manager: 'HTTP Cookie 管理器',
        cache_manager: 'HTTP 缓存管理器',
        csv_data_set: 'CSV 数据文件设置',
        counter: '计数器'
    };

    function uid() {
        return 'cfg_' + Math.random().toString(36).slice(2, 10);
    }

    function defaultItemData(type) {
        if (type === 'http_defaults') {
            return Object.assign({
                enabled: true,
                protocol: '', domain: '', port: '', path: '',
                connect_timeout: '', response_timeout: '', implementation: '', content_encoding: '',
                name: '', comments: '',
                follow_redirects: true, auto_redirects: false, use_keepalive: true,
                arg_mode: 'params', parameters: [], body_data: ''
            }, global.JmsTgHttpDefaultsAdvanced && global.JmsTgHttpDefaultsAdvanced.DEFAULTS
                ? global.JmsTgHttpDefaultsAdvanced.DEFAULTS : {
                    image_parser: false, concurrent_dwn: false, concurrent_pool: '6', embedded_url_re: '',
                    ip_source_type: '0', ip_source: '', proxy_host: '', proxy_port: '', proxy_user: '', proxy_pass: '', md5: false
                });
        }
        if (type === 'header_manager') {
            return { enabled: true, name: '', comments: '', headers: [] };
        }
        if (type === 'auth_manager') {
            return { enabled: true, name: '', comments: '', clear_each_iteration: false, authorizations: [] };
        }
        if (type === 'cookie_manager') {
            return { enabled: true, name: '', comments: '', clear_each_iteration: true, cookie_policy: 'standard', cookies: [] };
        }
        if (type === 'cache_manager') {
            return { enabled: true, name: '', comments: '', clear_each_iteration: false, use_expires: true, max_size: '5000' };
        }
        if (type === 'csv_data_set') {
            return {
                enabled: true,
                name: '', comments: '',
                filename: '', file_encoding: '', variable_names: '', ignore_first_line: false,
                delimiter: ',', quoted_data: false, recycle: true, stop_thread: false,
                share_mode: 'shareMode.all', file_content: ''
            };
        }
        if (type === 'counter') {
            return {
                name: '', comments: '', enabled: true,
                start: '1', increment: '1', maximum: '999999', format: '',
                variable_name: 'counter', per_user: true, reset_each_iteration: false
            };
        }
        return {};
    }

    function objToVars(obj) {
        if (!obj || typeof obj !== 'object') return [];
        return Object.keys(obj).map(function (k) { return { key: k, value: String(obj[k] == null ? '' : obj[k]) }; });
    }

    function varsToObj(list) {
        var out = {};
        if (!list) return out;
        if (Array.isArray(list)) {
            list.forEach(function (row) {
                if (!row) return;
                var k = String(row.key || '').trim();
                if (k) out[k] = row.value == null ? '' : String(row.value);
            });
            return out;
        }
        if (typeof list === 'object') {
            Object.keys(list).forEach(function (k) {
                if (k) out[k] = list[k] == null ? '' : String(list[k]);
            });
        }
        return out;
    }

    function normalizeHeaders(raw) {
        if (Array.isArray(raw)) {
            return raw.filter(function (r) { return r && String(r.key || '').trim(); }).map(function (r) {
                return { key: String(r.key).trim(), value: r.value == null ? '' : String(r.value) };
            });
        }
        return objToVars(raw);
    }

    function normalizeCookies(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.map(function (c) {
            if (!c || typeof c !== 'object') return { name: '', value: '', domain: '', path: '/', secure: false, expires: '' };
            return {
                name: String(c.name || ''),
                value: String(c.value || ''),
                domain: String(c.domain || ''),
                path: String(c.path || '/'),
                secure: !!c.secure,
                expires: c.expires !== undefined && c.expires !== null ? String(c.expires) : ''
            };
        });
    }

    function normalizeItem(raw) {
        if (!raw || typeof raw !== 'object' || !raw.type) return null;
        var type = String(raw.type);
        if (CONFIG_KEYS.indexOf(type) < 0) return null;
        var data = raw.data && typeof raw.data === 'object' ? raw.data : {};
        var out = { id: raw.id ? String(raw.id) : uid(), type: type, name: raw.name ? String(raw.name) : '', data: defaultItemData(type) };
        if (type === 'http_defaults') {
            Object.keys(out.data).forEach(function (k) {
                if (k === 'parameters' || k === 'arg_mode' || k === 'body_data' || k === 'name' || k === 'comments') return;
                if (data[k] !== undefined && data[k] !== null) out.data[k] = data[k];
            });
            out.data.name = data.name !== undefined ? String(data.name) : '';
            out.data.comments = data.comments !== undefined ? String(data.comments) : '';
            if (!out.data.name && raw.name) out.data.name = String(raw.name);
            out.data.arg_mode = data.arg_mode === 'body' ? 'body' : 'params';
            out.data.body_data = data.body_data != null ? String(data.body_data) : '';
            if (global.JmsTgHttpDefaultsJmx && typeof global.JmsTgHttpDefaultsJmx.normalizeParameters === 'function') {
                out.data.parameters = global.JmsTgHttpDefaultsJmx.normalizeParameters(data.parameters);
            } else {
                out.data.parameters = Array.isArray(data.parameters) ? data.parameters : [];
            }
            if (global.JmsTgHttpDefaultsAdvanced && typeof global.JmsTgHttpDefaultsAdvanced.normalizeAdvanced === 'function') {
                var adv = global.JmsTgHttpDefaultsAdvanced.normalizeAdvanced(out.data);
                Object.keys(adv).forEach(function (k) { out.data[k] = adv[k]; });
            }
        } else if (type === 'header_manager') {
            out.data.name = data.name !== undefined ? String(data.name) : '';
            out.data.comments = data.comments !== undefined ? String(data.comments) : '';
            out.data.headers = normalizeHeaders(data.headers);
        } else if (type === 'auth_manager') {
            out.data.name = data.name !== undefined ? String(data.name) : '';
            out.data.comments = data.comments !== undefined ? String(data.comments) : '';
            out.data.clear_each_iteration = data.clear_each_iteration === true;
            if (global.JmsTgAuthManagerJmx && typeof global.JmsTgAuthManagerJmx.normalizeAuthorizations === 'function') {
                out.data.authorizations = global.JmsTgAuthManagerJmx.normalizeAuthorizations(data.authorizations);
            } else {
                out.data.authorizations = Array.isArray(data.authorizations) ? data.authorizations : [];
            }
        } else if (type === 'cookie_manager') {
            out.data.name = data.name !== undefined ? String(data.name) : '';
            out.data.comments = data.comments !== undefined ? String(data.comments) : '';
            out.data.clear_each_iteration = data.clear_each_iteration !== false;
            if (global.JmsTgCookieManagerJmx && typeof global.JmsTgCookieManagerJmx.normalizeCookiePolicy === 'function') {
                out.data.cookie_policy = global.JmsTgCookieManagerJmx.normalizeCookiePolicy(data.cookie_policy);
            } else {
                out.data.cookie_policy = data.cookie_policy ? String(data.cookie_policy) : 'standard';
            }
            out.data.cookies = normalizeCookies(data.cookies);
        } else if (type === 'cache_manager') {
            out.data.name = data.name !== undefined ? String(data.name) : '';
            out.data.comments = data.comments !== undefined ? String(data.comments) : '';
            out.data.clear_each_iteration = data.clear_each_iteration === true;
            out.data.use_expires = data.use_expires !== false;
            if (global.JmsTgCacheManagerJmx && typeof global.JmsTgCacheManagerJmx.normalizeMaxSize === 'function') {
                out.data.max_size = global.JmsTgCacheManagerJmx.normalizeMaxSize(data.max_size);
            } else {
                out.data.max_size = data.max_size ? String(data.max_size) : '5000';
            }
        } else if (type === 'csv_data_set') {
            out.data.name = data.name !== undefined ? String(data.name) : '';
            out.data.comments = data.comments !== undefined ? String(data.comments) : '';
            ['filename', 'file_encoding', 'variable_names', 'delimiter', 'share_mode', 'file_content'].forEach(function (k) {
                if (data[k] !== undefined && data[k] !== null) out.data[k] = String(data[k]);
            });
            if (data.source_path !== undefined && data.source_path !== null) {
                out.data.source_path = String(data.source_path);
            }
            out.data.ignore_first_line = !!data.ignore_first_line;
            out.data.quoted_data = !!data.quoted_data;
            out.data.recycle = data.recycle !== false;
            out.data.stop_thread = !!data.stop_thread;
        } else if (type === 'counter') {
            out.data.name = data.name !== undefined ? String(data.name) : '';
            out.data.comments = data.comments !== undefined ? String(data.comments) : '';
            out.data.enabled = data.enabled !== false;
            ['start', 'increment', 'maximum', 'format', 'variable_name'].forEach(function (k) {
                if (data[k] !== undefined && data[k] !== null) out.data[k] = String(data[k]);
            });
            out.data.per_user = data.per_user !== false;
            out.data.reset_each_iteration = !!data.reset_each_iteration;
        }
        if (CONFIG_KEYS.indexOf(type) >= 0 && type !== 'counter') {
            out.data.enabled = data.enabled !== false;
        }
        if (raw.import_order != null) out.import_order = raw.import_order;
        if (raw.timeline_order != null) out.timeline_order = raw.timeline_order;
        if (raw.parent_step_id) out.parent_step_id = String(raw.parent_step_id);
        if (!out.name) out.name = itemSummary(out);
        return out;
    }

    function isRemovedConfigType(tg, typeKey) {
        if (!tg || !typeKey) return false;
        var Sync = global.JmsTgConfigExportSync;
        if (Sync && typeof Sync.isConfigTypeRemoved === 'function') return Sync.isConfigTypeRemoved(tg, typeKey);
        return Array.isArray(tg._removed_config_types) && tg._removed_config_types.indexOf(typeKey) >= 0;
    }

    function migrateFromHttpManagers(tg) {
        var mgr = tg.http_managers;
        if (!mgr || typeof mgr !== 'object') return [];
        var items = [];
        var sel = Array.isArray(mgr.selected_types) ? mgr.selected_types.slice() : [];
        function selected(type) {
            if (isRemovedConfigType(tg, type)) return false;
            return sel.length ? sel.indexOf(type) >= 0 : !!(mgr[type] && mgr[type].enabled);
        }
        CONFIG_KEYS.forEach(function (type) {
            if (!selected(type)) return;
            var item = normalizeItem({ type: type, data: mgr[type] || {} });
            if (item && hasContent(item)) items.push(item);
        });
        return items;
    }

    function ensureConfigItems(tg) {
        if (!tg) return [];
        if (!Array.isArray(tg.config_items)) tg.config_items = [];
        if (!tg.config_items.length && tg.http_managers &&
            !tg._config_timeline_active && !tg.config_timeline_active) {
            var migrated = migrateFromHttpManagers(tg);
            if (migrated.length) tg.config_items = migrated;
        }
        tg.config_items = tg.config_items.map(normalizeItem).filter(Boolean);
        return tg.config_items;
    }

    function hasText(v) {
        return v !== undefined && v !== null && String(v).trim() !== '';
    }

    function hasContent(item) {
        if (!item || !item.type) return false;
        var d = item.data || {};
        if (d.enabled === false) return true;
        if (item.type === 'http_defaults') {
            var argHit = global.JmsTgHttpDefaultsJmx && typeof global.JmsTgHttpDefaultsJmx.hasArgContent === 'function' &&
                global.JmsTgHttpDefaultsJmx.hasArgContent(d);
            var advHit = global.JmsTgHttpDefaultsAdvanced && typeof global.JmsTgHttpDefaultsAdvanced.hasContent === 'function' &&
                global.JmsTgHttpDefaultsAdvanced.hasContent(d);
            return hasText(d.name) || hasText(d.comments) || hasText(d.protocol) || hasText(d.domain) || hasText(d.port) || hasText(d.path) ||
                hasText(d.connect_timeout) || hasText(d.response_timeout) || hasText(d.content_encoding) ||
                d.auto_redirects === true || d.follow_redirects === false || d.use_keepalive === false ||
                (hasText(d.implementation) && d.implementation !== 'HttpClient4') || argHit || advHit;
        }
        if (item.type === 'header_manager') {
            return hasText(d.name) || hasText(d.comments) || (d.headers || []).some(function (r) { return r && hasText(r.key); });
        }
        if (item.type === 'auth_manager') {
            if (global.JmsTgAuthManagerJmx && typeof global.JmsTgAuthManagerJmx.hasContent === 'function') {
                return global.JmsTgAuthManagerJmx.hasContent(d);
            }
            return (d.authorizations || []).some(function (r) {
                return r && (hasText(r.url) || hasText(r.username) || hasText(r.password));
            });
        }
        if (item.type === 'cookie_manager') {
            if (global.JmsTgCookieManagerJmx && typeof global.JmsTgCookieManagerJmx.hasContent === 'function') {
                return global.JmsTgCookieManagerJmx.hasContent(d);
            }
            return (d.cookies || []).some(function (c) { return c && hasText(c.name); });
        }
        if (item.type === 'cache_manager') {
            if (global.JmsTgCacheManagerJmx && typeof global.JmsTgCacheManagerJmx.hasContent === 'function') {
                return global.JmsTgCacheManagerJmx.hasContent(d);
            }
            return d.clear_each_iteration === true || d.use_expires === false;
        }
        if (item.type === 'csv_data_set') {
            return hasText(d.filename) || hasText(d.variable_names) || hasText(d.file_content);
        }
        if (item.type === 'counter') {
            return hasText(d.format) || hasText(d.name) || hasText(d.comments) ||
                hasText(d.variable_name) && d.variable_name !== 'counter' ||
                hasText(d.start) && d.start !== '1' || hasText(d.increment) && d.increment !== '1' ||
                hasText(d.maximum) && d.maximum !== '999999' || d.per_user === false ||
                d.reset_each_iteration === true || d.enabled === false;
        }
        return false;
    }

    var EMPTY_PERSISTABLE_TYPES = ['http_defaults', 'header_manager', 'auth_manager', 'cookie_manager', 'cache_manager', 'csv_data_set', 'counter'];

    function allowsEmptyPersist(type) {
        return EMPTY_PERSISTABLE_TYPES.indexOf(type) >= 0;
    }

    function isPersistable(item) {
        if (!item || !item.type) return false;
        if (allowsEmptyPersist(item.type)) return true;
        return hasContent(item);
    }

    function itemSummary(item) {
        if (!item) return '';
        var d = item.data || {};
        if (item.type === 'http_defaults') {
            if (hasText(d.name)) return d.name;
            var bits = [d.protocol, d.domain, d.port].filter(hasText);
            var extra = '';
            if (global.JmsTgHttpDefaultsJmx && global.JmsTgHttpDefaultsJmx.hasArgContent(d)) {
                if (d.arg_mode === 'body') extra = ' · 消息体';
                else {
                    var pn = (d.parameters || []).filter(function (r) { return r && hasText(r.name); }).length;
                    if (pn) extra = ' · ' + pn + ' 参数';
                }
            }
            return bits.length ? bits.join(' · ') + extra : (extra ? LABELS.http_defaults + extra : LABELS.http_defaults);
        }
        if (item.type === 'header_manager') {
            if (hasText(d.name)) return d.name;
            var n = (d.headers || []).filter(function (r) { return r && hasText(r.key); }).length;
            return n ? (n + ' 个请求头') : LABELS.header_manager;
        }
        if (item.type === 'auth_manager') {
            if (hasText(d.name)) return d.name;
            var an = (d.authorizations || []).filter(function (r) {
                return r && (hasText(r.url) || hasText(r.username));
            }).length;
            return an ? (an + ' 条授权') : LABELS.auth_manager;
        }
        if (item.type === 'cookie_manager') {
            if (hasText(d.name)) return d.name;
            var cn = (d.cookies || []).filter(function (c) { return c && hasText(c.name); }).length;
            return cn ? (cn + ' 个 Cookie') : LABELS.cookie_manager;
        }
        if (item.type === 'cache_manager') {
            if (hasText(d.name)) return d.name;
            var parts = [];
            if (d.clear_each_iteration === true) parts.push('清除迭代');
            if (d.use_expires !== false) parts.push('Expires');
            var ms = d.max_size ? String(d.max_size) : '5000';
            if (ms !== '5000') parts.push('max ' + ms);
            return parts.length ? parts.join(' · ') : LABELS.cache_manager;
        }
        if (item.type === 'csv_data_set') {
            if (hasText(d.name)) return d.name;
            return hasText(d.filename) ? d.filename : (hasText(d.variable_names) ? d.variable_names : LABELS.csv_data_set);
        }
        if (item.type === 'counter') {
            if (hasText(d.name)) return d.name;
            return hasText(d.variable_name) ? d.variable_name : LABELS.counter;
        }
        return LABELS[item.type] || item.type;
    }

    function itemToYaml(item) {
        item = normalizeItem(item);
        if (!item) return null;
        var row = { type: item.type, name: item.name || itemSummary(item), data: {} };
        var d = item.data;
        if (item.type === 'http_defaults') row.data = JSON.parse(JSON.stringify(d));
        else if (item.type === 'header_manager') {
            row.data = { name: d.name || '', comments: d.comments || '', headers: varsToObj(d.headers) };
        } else if (item.type === 'auth_manager') {
            row.data = {
                name: d.name || '',
                comments: d.comments || '',
                clear_each_iteration: d.clear_each_iteration === true,
                authorizations: (d.authorizations || []).filter(function (r) {
                    return r && (hasText(r.url) || hasText(r.username) || hasText(r.password) ||
                        hasText(r.domain) || hasText(r.realm));
                })
            };
        } else if (item.type === 'cookie_manager') {
            row.data = {
                name: d.name || '',
                comments: d.comments || '',
                clear_each_iteration: d.clear_each_iteration !== false,
                cookies: (d.cookies || []).filter(function (c) { return c && hasText(c.name); })
            };
            var policy = d.cookie_policy ? String(d.cookie_policy) : 'standard';
            if (policy && policy !== 'standard') row.data.cookie_policy = policy;
        } else if (item.type === 'cache_manager') {
            row.data = {
                name: d.name || '',
                comments: d.comments || '',
                use_expires: d.use_expires !== false
            };
            if (d.clear_each_iteration === true) row.data.clear_each_iteration = true;
            var maxSz = d.max_size ? String(d.max_size) : '5000';
            if (maxSz !== '5000') row.data.max_size = maxSz;
        } else if (item.type === 'csv_data_set') {
            row.data = JSON.parse(JSON.stringify(d));
            if (row.data.file_content) row.data.file_content = String(row.data.file_content);
        } else if (item.type === 'counter') row.data = JSON.parse(JSON.stringify(d));
        if (item.import_order != null) row.import_order = item.import_order;
        if (item.timeline_order != null) row.timeline_order = item.timeline_order;
        if (item.parent_step_id) row.parent_step_id = item.parent_step_id;
        if (d.enabled === false) row.data.enabled = false;
        return row;
    }

    function itemsToYaml(items) {
        items = (items || []).map(normalizeItem).filter(function (it) { return it && isPersistable(it); });
        if (!items.length) return null;
        return items.map(itemToYaml);
    }

    function parseItemsFromYaml(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.map(normalizeItem).filter(Boolean);
    }

    function anyItems(tg) {
        return ensureConfigItems(tg).some(isPersistable);
    }

    global.JmsTgConfigCatalog = {
        CONFIG_KEYS: CONFIG_KEYS,
        LABELS: LABELS,
        uid: uid,
        defaultItemData: defaultItemData,
        normalizeItem: normalizeItem,
        ensureConfigItems: ensureConfigItems,
        hasContent: hasContent,
        isPersistable: isPersistable,
        allowsEmptyPersist: allowsEmptyPersist,
        itemSummary: itemSummary,
        itemsToYaml: itemsToYaml,
        parseItemsFromYaml: parseItemsFromYaml,
        isRemovedConfigType: isRemovedConfigType,
        anyItems: anyItems,
        varsToObj: varsToObj,
        objToVars: objToVars,
        normalizeHeaders: normalizeHeaders,
        normalizeCookies: normalizeCookies
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_studio_v2_tree_step_edit_fix.js ---- */
/**
 * Studio v2 树形 · 新样式步骤编辑弹窗修复（隔离模块，不影响旧网格视图）
 */
(function (global) {
    "use strict";

    var ROUTES = {
        "jms-btn-edit-transaction": { mod: "JmsTgTransactionControllerUi", cards: ".jms-transaction-card", method: "openEditor", modalId: "modal-tg-transaction-edit" },
        "jms-btn-edit-loop": { mod: "JmsTgLoopControllerUi", cards: ".jms-loop-card", method: "openEditor", modalId: "modal-tg-loop-edit" },
        "jms-btn-edit-random": { mod: "JmsTgRandomControllerUi", cards: ".jms-random-card", method: "openEditor", modalId: "modal-tg-random-edit" },
        "jms-btn-edit-simple": { mod: "JmsTgSimpleControllerUi", cards: ".jms-simple-card", method: "openEditor", modalId: "modal-tg-simple-edit" },
        "jms-btn-edit-beanshell": { mod: "JmsTgBeanshellPostUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-beanshell-post-edit", extra: [false] },
        "jms-btn-edit-debug": { mod: "JmsTgDebugSamplerUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-debug-edit" },
        "jms-btn-edit-tg-xpath-extract": { mod: "JmsTgXpathExtractUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-xpath-extract-edit", extra: [false] },
        "jms-btn-edit-tg-regex-extract": { mod: "JmsTgRegexExtractUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-regex-extract-edit", extra: [false] },
        "jms-btn-edit-tg-jdbc-post": { mod: "JmsTgJdbcPostUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-jdbc-post-edit", extra: [false, 0] },
        "jms-btn-edit-tg-json-extract": { mod: "JmsTgJsonExtractUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-json-extract-edit", extra: [false] },
        "jms-btn-edit-tg-jsr223-post": { mod: "JmsTgJsr223PostUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-jsr223-post-edit", extra: [false] }
    };

    function sidEq(a, b) { return String(a) === String(b); }

    function isTreeStudio() {
        return global.document.body.classList.contains("lth-hub-jmeter-tab") &&
            global.document.body.classList.contains("lth-tg-view-tree");
    }

    function readModel() {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.readModelFromDom === "function") vb.readModelFromDom();
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel ? global.JmsVisualBuilder.getModel() : null;
    }

    function isNestedContainer(st) {
        return st && (st.type === "if_controller" || st.type === "random_controller" ||
            st.type === "simple_controller" || st.type === "transaction_controller" ||
            st.type === "loop_controller" || (st.type === "catalog_element" && st.container));
    }

    function findStepInTree(list, stepId) {
        var found = null;
        (list || []).some(function (s) {
            if (!s) return false;
            if (sidEq(s.id, stepId)) { found = s; return true; }
            if (isNestedContainer(s) && s.children) {
                found = findStepInTree(s.children, stepId);
                return !!found;
            }
            return false;
        });
        return found;
    }

    function findTgRobust(planId, tgId) {
        var m = getModel();
        if (!m || tgId == null || tgId === "") return null;
        var hits = [];
        function scan(list, pid) {
            (list || []).forEach(function (t) {
                if (t && sidEq(t.id, tgId)) hits.push({ tg: t, planId: pid });
            });
        }
        scan(m.setup_thread_groups, planId || "");
        (m.test_plans || []).forEach(function (p) { scan(p.thread_groups, p.id); });
        scan(m.post_thread_groups, planId || "");
        if (!hits.length) return null;
        if (planId) {
            var exact = hits.find(function (h) { return sidEq(h.planId, planId); });
            if (exact) return exact.tg;
        }
        return hits[0].tg;
    }

    function resolveCard(btn, route) {
        var sels = (route.cards || "").split(",");
        for (var i = 0; i < sels.length; i++) {
            var card = btn.closest(sels[i].trim());
            if (card) return card;
        }
        return btn.closest(".jms-aux-card, .jms-if-card, .jms-random-card, .jms-simple-card, .jms-transaction-card, .jms-loop-card");
    }

    function resolveIds(card) {
        var planId = card.getAttribute("data-plan-id") || "";
        var tgId = card.getAttribute("data-tg-id") || "";
        var stepId = card.getAttribute("data-step-id") || "";
        if (!tgId) {
            var tgBlock = card.closest(".jms-tg-block--tree, .jms-tg-block");
            if (tgBlock) tgId = tgBlock.getAttribute("data-tg-id") || tgId;
        }
        if (!planId) {
            var planCard = card.closest(".jms-plan-card");
            if (planCard) planId = planCard.getAttribute("data-plan-id") || planId;
            if (!planId) {
                var toolbar = global.document.getElementById("jms-studio-plan-toolbar");
                if (toolbar) planId = toolbar.getAttribute("data-plan-id") || planId;
            }
        }
        if (!planId) {
            var m = getModel();
            if (m && m.test_plans && m.test_plans[0]) planId = m.test_plans[0].id;
        }
        return { planId: planId, tgId: tgId, stepId: stepId };
    }

    function ensureModalOnBody(Ui, modalId) {
        var modal = null;
        if (Ui && typeof Ui.ensureModal === "function") modal = Ui.ensureModal();
        if (!modal && modalId) modal = global.document.getElementById(modalId);
        if (global.JmsStudioV2TreeStepEditUnify && typeof global.JmsStudioV2TreeStepEditUnify.ensureOnBody === "function") {
            global.JmsStudioV2TreeStepEditUnify.ensureOnBody(modal);
        } else if (modal && modal.parentElement !== global.document.body) {
            global.document.body.appendChild(modal);
        }
        return modal;
    }

    function modalIsOpen(modalId) {
        if (!modalId) return false;
        var modal = global.document.getElementById(modalId);
        return !!(modal && modal.classList.contains("jms-modal-open"));
    }

    function resolvePlanIdForTg(tgId) {
        var m = getModel();
        if (!m || tgId == null || tgId === "") return "";
        var i, j, p, tg;
        for (i = 0; i < (m.test_plans || []).length; i++) {
            p = m.test_plans[i];
            for (j = 0; j < (p.thread_groups || []).length; j++) {
                tg = p.thread_groups[j];
                if (tg && sidEq(tg.id, tgId)) return p.id;
            }
        }
        if ((m.setup_thread_groups || []).some(function (t) { return t && sidEq(t.id, tgId); })) {
            return (m.test_plans && m.test_plans[0]) ? m.test_plans[0].id : "";
        }
        if ((m.post_thread_groups || []).some(function (t) { return t && sidEq(t.id, tgId); })) {
            return (m.test_plans && m.test_plans[0]) ? m.test_plans[0].id : "";
        }
        return (m.test_plans && m.test_plans[0]) ? m.test_plans[0].id : "";
    }

    function invokeOpen(route, planId, tgId, stepId) {
        var Ui = global[route.mod];
        if (!Ui) return false;
        if (!planId) planId = resolvePlanIdForTg(tgId);
        ensureModalOnBody(Ui, route.modalId);
        if (typeof Ui[route.method] === "function") {
            var args = [planId, tgId, stepId].concat(route.extra || []);
            Ui[route.method].apply(Ui, args);
            if (modalIsOpen(route.modalId)) return true;
        }
        if (route.fallback === "openIfEditor" && global.JmsVisualBuilder &&
            typeof global.JmsVisualBuilder.openIfEditor === "function") {
            global.JmsVisualBuilder.openIfEditor(planId, tgId, stepId);
            return modalIsOpen(route.modalId || "modal-if-edit");
        }
        return false;
    }

    function stopClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    }

    function onCaptureClick(ev) {
        if (!isTreeStudio()) return;
        var btn = null;
        var route = null;
        var keys = Object.keys(ROUTES);
        for (var i = 0; i < keys.length; i++) {
            var cls = keys[i];
            var hit = ev.target.closest("." + cls);
            if (hit) { btn = hit; route = ROUTES[cls]; break; }
        }
        if (!btn || !route) return;

        var card = resolveCard(btn, route);
        if (!card) return;

        readModel();
        var ids = resolveIds(card);
        if (!ids.tgId || !ids.stepId) return;

        var tg = findTgRobust(ids.planId, ids.tgId);
        var step = tg ? findStepInTree(tg.steps, ids.stepId) : null;
        if (!tg || !step) return;

        var actions = btn.closest(".lth-step-actions");
        if (actions) actions.classList.remove("is-open", "is-hover");

        if (invokeOpen(route, ids.planId, ids.tgId, ids.stepId)) {
            stopClick(ev);
        }
    }

    function bind() {
        if (!global.document.body || global.document.body.dataset.jmsV2TreeStepEditFixBound === "1") return;
        global.document.body.dataset.jmsV2TreeStepEditFixBound = "1";
        global.document.addEventListener("click", onCaptureClick, true);
    }

    bind();
    if (global.document.readyState === "loading") {
        global.document.addEventListener("DOMContentLoaded", bind);
    }
    global.addEventListener("pageshow", bind);

    global.JmsStudioV2TreeStepEditFix = {
        bind: bind,
        findTgRobust: findTgRobust,
        findStepInTree: findStepInTree,
        invokeOpen: invokeOpen
    };
})(window);

/* ---- js/hf_jmeter_stash_ui.js ---- */
/** DISABLED: cloud scene UI owns buttons */
(function () {
    'use strict';
    window.__hfJmeterStashUiBound = true;

    function msg(text, ok) {
        if (typeof globalThis.hfFloatToast === 'function') {
            globalThis.hfFloatToast(text, { variant: ok ? 'success' : 'error', placement: 'bottom' });
            return;
        }
        if (ok) console.log(text); else console.warn(text);
    }

    function escapeHtml(t) {
        var d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    function showModal(el) {
        if (!el) return;
        el.classList.remove('hidden');
        el.classList.add('flex');
    }

    function hideModal(el) {
        if (!el) return;
        el.classList.add('hidden');
        el.classList.remove('flex');
    }

    function syncYamlFromVisual() {
        if (window.JmsVisualBuilder && typeof JmsVisualBuilder.beforeValidate === 'function') {
            try { JmsVisualBuilder.beforeValidate(); } catch (e) { /* ignore */ }
        }
    }

    function collectYamlPayload() {
        var yamlInput = document.getElementById('yaml-input');
        syncYamlFromVisual();
        return { yaml: yamlInput ? String(yamlInput.value || '') : '' };
    }

    function yamlHasContent() {
        var p = collectYamlPayload();
        return String(p.yaml || '').trim().length > 0;
    }

    function applyYamlToEditor(yaml) {
        var yamlInput = document.getElementById('yaml-input');
        if (!yamlInput) return;
        yamlInput.value = yaml;
        yamlInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (window.JmsVisualBuilder && typeof JmsVisualBuilder.loadTemplate === 'function') {
            try { JmsVisualBuilder.loadTemplate(yaml); } catch (e) { /* ignore */ }
        }
    }

    function init() {
        /* cloud scene UI owns buttons; disable local stash to avoid dual toast */
        if (true || window.__hfJmeterStashUiBound) return;
        window.__hfJmeterStashUiBound = true;
        var store = window.HfLocalStash && HfLocalStash.jmeter;
        if (!document.getElementById('jm-stash-save-btn')) return;

        var saveModal = document.getElementById('jm-stash-save-modal');
        var listModal = document.getElementById('jm-stash-list-modal');
        var restoreModal = document.getElementById('jm-stash-restore-modal');
        var saveTitleInp = document.getElementById('jm-stash-save-title');
        var listEl = document.getElementById('jm-stash-list');
        var countBadge = document.getElementById('jm-stash-count-badge');
        var pendingRestore = null;

        function ensureStore() {
            if (!window.HfLocalStash || !HfLocalStash.isAvailable || !store) {
                msg('当前浏览器无法使用本地保存', false);
                return false;
            }
            return true;
        }

        function refreshListUi() {
            if (!store || !listEl) return;
            try {
                var data = store.list();
                if (countBadge) countBadge.textContent = String((data.items || []).length);
                var items = data.items || [];
                if (!items.length) {
                    listEl.innerHTML = '<p class="px-3 py-8 text-center text-sm text-slate-400">暂无已保存场景</p>';
                    return;
                }
                listEl.innerHTML = items.map(function (it) {
                    return (
                        '<div class="flex items-stretch gap-1 border-b border-slate-100 py-1 last:border-0">' +
                        '<span class="min-w-0 flex-1 truncate px-2 py-2 text-sm font-medium text-slate-800" title="' + escapeHtml(it.title || '') + '">' + escapeHtml(it.title || '未命名') + '</span>' +
                        '<button type="button" class="jm-stash-restore px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded" data-id="' + escapeHtml(it.id) + '">恢复</button>' +
                        '<button type="button" class="jm-stash-del px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded" data-id="' + escapeHtml(it.id) + '">删除</button>' +
                        '</div>'
                    );
                }).join('');
            } catch (e) {
                listEl.innerHTML = '<p class="px-3 py-4 text-sm text-red-600">' + escapeHtml(e.message || '加载失败') + '</p>';
            }
        }

        function applyRestoreDoc(doc) {
            if (!doc || !doc.payload || typeof doc.payload.yaml !== 'string') {
                msg('场景数据无效', false);
                return;
            }
            applyYamlToEditor(doc.payload.yaml);
            hideModal(restoreModal);
            pendingRestore = null;
            msg('已恢复「' + (doc.title || '场景') + '」，请校验配置后使用。', true);
        }

        function startRestoreFlow(doc) {
            if (!doc) return;
            if (!yamlHasContent()) {
                applyRestoreDoc(doc);
                return;
            }
            pendingRestore = doc;
            var desc = document.getElementById('jm-stash-restore-desc');
            if (desc) {
                desc.textContent = '将「' + (doc.title || '场景') + '」写回场景（YAML / 可视化），会覆盖当前内容。';
            }
            showModal(restoreModal);
        }

        refreshListUi();

        function closeMoreMenu() {
            var panel = document.getElementById('lth-more-panel');
            var trigger = document.getElementById('lth-more-trigger');
            if (panel) panel.classList.add('hidden');
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }

        function onStashSaveClick() {
            if (!ensureStore()) return;
            if (!yamlHasContent()) {
                msg('请先搭建场景或填写 YAML 再保存。', false);
                return;
            }
            closeMoreMenu();
            if (saveTitleInp) saveTitleInp.value = '';
            showModal(saveModal);
            setTimeout(function () { if (saveTitleInp) saveTitleInp.focus(); }, 40);
        }

        function onStashListClick() {
            if (!ensureStore()) return;
            closeMoreMenu();
            refreshListUi();
            showModal(listModal);
        }

        var saveBtnEl = document.getElementById('jm-stash-save-btn');
        var listBtnEl = document.getElementById('jm-stash-list-btn');
        if (saveBtnEl) {
            saveBtnEl.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                onStashSaveClick();
            });
        }
        if (listBtnEl) {
            listBtnEl.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                onStashListClick();
            });
        }

        var saveCancel = document.getElementById('jm-stash-save-cancel');
        var listClose = document.getElementById('jm-stash-list-close');
        if (saveCancel) saveCancel.addEventListener('click', function () { hideModal(saveModal); });
        if (listClose) listClose.addEventListener('click', function () { hideModal(listModal); });
        if (saveModal) saveModal.addEventListener('click', function (e) { if (e.target === saveModal) hideModal(saveModal); });
        if (listModal) listModal.addEventListener('click', function (e) { if (e.target === listModal) hideModal(listModal); });

        var saveSubmit = document.getElementById('jm-stash-save-submit');
        if (saveSubmit) saveSubmit.addEventListener('click', function () {
            if (!ensureStore()) return;
            var title = saveTitleInp ? saveTitleInp.value.trim() : '';
            if (!title) {
                msg('请填写场景名称。', false);
                if (saveTitleInp) saveTitleInp.focus();
                return;
            }
            try {
                store.saveNew(title, collectYamlPayload());
                hideModal(saveModal);
                refreshListUi();
                msg('已保存到本机浏览器（' + title + '）。', true);
            } catch (e) {
                msg(e.message || '保存失败', false);
            }
        });

        var restoreCancel = document.getElementById('jm-stash-restore-cancel');
        if (restoreCancel) restoreCancel.addEventListener('click', function () {
            pendingRestore = null;
            hideModal(restoreModal);
        });
        var restoreOk = document.getElementById('jm-stash-restore-overwrite');
        if (restoreOk) restoreOk.addEventListener('click', function () {
            if (pendingRestore) applyRestoreDoc(pendingRestore);
        });
        if (restoreModal) restoreModal.addEventListener('click', function (e) {
            if (e.target === restoreModal) {
                pendingRestore = null;
                hideModal(restoreModal);
            }
        });

        if (listEl) {
            listEl.addEventListener('click', function (e) {
                var res = e.target.closest('.jm-stash-restore');
                var del = e.target.closest('.jm-stash-del');
                if (res && res.getAttribute('data-id')) {
                    try {
                        var doc = store.get(res.getAttribute('data-id'));
                        hideModal(listModal);
                        startRestoreFlow(doc);
                    } catch (err) {
                        msg(err.message || '加载失败', false);
                    }
                    return;
                }
                if (del && del.getAttribute('data-id')) {
                    var sid = del.getAttribute('data-id');
                    if (!window.confirm('确定删除该场景？')) return;
                    try {
                        store.remove(sid);
                        refreshListUi();
                        msg('已删除。', true);
                    } catch (err) {
                        msg(err.message || '删除失败', false);
                    }
                }
            });
        }
    }

    function boot() {
        init();
    }
    if (document.readyState === 'complete') {
        boot();
    } else {
        window.addEventListener('load', boot);
    }
})();

/* ---- js/load_test_hub_tailwind_refresh.js ---- */
(function(){function r(){if(window.tailwind&&typeof window.tailwind.refresh==='function')window.tailwind.refresh();}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',r);else r();window.addEventListener('load',r);})();

/* ---- js/hf_float_toast.js ---- */
(function (global) {
    'use strict';

    var hfFloatToastTimer = null;

    /** 统一渐变悬浮提示：placement top|bottom，variant warning|success|error|info */
    function hfFloatToast(message, opts) {
        opts = opts || {};
        var wrap = document.getElementById('hf-float-toast');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'hf-float-toast';
            wrap.className = 'hf-float-toast hf-float-toast--top';
            wrap.setAttribute('role', 'status');
            wrap.setAttribute('aria-live', 'polite');
            wrap.setAttribute('aria-atomic', 'true');
            var innerEl = document.createElement('div');
            innerEl.id = 'hf-float-toast-inner';
            innerEl.className = 'hf-float-toast__inner';
            wrap.appendChild(innerEl);
        }
        if (wrap.parentElement !== document.body) {
            document.body.appendChild(wrap);
        }
        var inner = document.getElementById('hf-float-toast-inner');
        if (!inner) return;
        if (hfFloatToastTimer) {
            clearTimeout(hfFloatToastTimer);
            hfFloatToastTimer = null;
        }
        var placement = opts.placement === 'bottom' ? 'bottom' : 'top';
        wrap.classList.remove('hf-float-toast--top', 'hf-float-toast--bottom', 'hf-float-toast--visible');
        wrap.classList.add(placement === 'bottom' ? 'hf-float-toast--bottom' : 'hf-float-toast--top');
        inner.textContent = String(message != null ? message : '').trim();
        var tone = opts.variant || (placement === 'top' ? 'warning' : 'success');
        inner.className = 'hf-float-toast__inner hf-float-toast__inner--' + tone;
        wrap.classList.add('hf-float-toast--visible');
        var ms = typeof opts.duration === 'number' ? opts.duration : (placement === 'top' ? 2000 : 3200);
        hfFloatToastTimer = setTimeout(function () {
            wrap.classList.remove('hf-float-toast--visible');
            hfFloatToastTimer = null;
        }, ms);
    }

    global.hfFloatToast = hfFloatToast;
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_http_beanshell_preprocessor_jmx.js ---- */
/**
 * HTTP 步骤 BeanShell PreProcessor · JMX 解析/生成（隔离模块）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim();
        }
        return '';
    }

    function getBoolProp(el, name, defaultVal) {
        if (!el) return defaultVal;
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                var t = (nodes[i].textContent || '').trim().toLowerCase();
                return t === 'true';
            }
        }
        return defaultVal;
    }

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'BeanShellPreProcessor') return null;
        return {
            type: 'beanshell_pre',
            name: node.getAttribute('testname') || 'BeanShell PreProcessor',
            enabled: isEnabled(node),
            comments: getStringProp(node, 'TestPlan.comments') || '',
            script: getStringProp(node, 'script') || '',
            filename: getStringProp(node, 'filename') || '',
            parameters: getStringProp(node, 'parameters') || '',
            reset_interpreter: getBoolProp(node, 'resetInterpreter', false)
        };
    }

    function parseUserParametersElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'UserParameters') return null;
        var params = [];
        var namesColl = node.querySelector('collectionProp[name="UserParameters.names"]');
        var threadValues = node.querySelector('collectionProp[name="UserParameters.thread_values"]');
        var names = [];
        if (namesColl) {
            var nameProps = namesColl.getElementsByTagName('stringProp');
            for (var i = 0; i < nameProps.length; i++) {
                names.push((nameProps[i].textContent || '').trim());
            }
        }
        var userColls = [];
        if (threadValues) {
            var children = threadValues.children || [];
            for (var c = 0; c < children.length; c++) {
                if ((children[c].tagName || '').toLowerCase() === 'collectionprop') userColls.push(children[c]);
            }
        }
        if (!userColls.length && threadValues) {
            var fallback = threadValues.querySelector('collectionProp');
            if (fallback) userColls = [fallback];
        }
        var userCount = userColls.length || 1;
        names.forEach(function (name, i) {
            if (!name) return;
            var values = [];
            for (var u = 0; u < userCount; u++) {
                var coll = userColls[u];
                var valProps = coll ? coll.getElementsByTagName('stringProp') : [];
                values.push(valProps[i] ? (valProps[i].textContent || '') : '');
            }
            if (userCount <= 1) params.push({ key: name, value: values[0] || '' });
            else params.push({ key: name, values: values });
        });
        var commentsEl = node.querySelector('stringProp[name="TestPlan.comments"]');
        return {
            enabled: isEnabled(node),
            name: node.getAttribute('testname') || '用户参数',
            comments: commentsEl ? (commentsEl.textContent || '') : '',
            per_iteration: getBoolProp(node, 'UserParameters.per_iteration', false),
            params: params
        };
    }

    function genXml(proc, indent, escapeXml) {
        if (!proc || proc.type !== 'beanshell_pre' || proc.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        var en = proc.enabled === false ? 'false' : 'true';
        var xml = indent + '<BeanShellPreProcessor guiclass="TestBeanGUI" testclass="BeanShellPreProcessor" testname="' +
            escapeXml(proc.name || 'BeanShell PreProcessor') + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="filename">' + escapeXml(proc.filename || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="parameters">' + escapeXml(proc.parameters || '') + '</stringProp>\n';
        xml += indent + '  <boolProp name="resetInterpreter">' + (proc.reset_interpreter ? 'true' : 'false') + '</boolProp>\n';
        if (proc.comments && String(proc.comments).trim()) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(proc.comments) + '</stringProp>\n';
        }
        xml += indent + '  <stringProp name="script">' + escapeXml(proc.script || '') + '</stringProp>\n';
        xml += indent + '</BeanShellPreProcessor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsHttpBeanshellPreProcessorJmx = {
        parseElement: parseElement,
        parseUserParametersElement: parseUserParametersElement,
        genXml: genXml
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jmeter_jmx_extra.js ---- */
/**
 * JMeter 扩展元件 JMX 片段生成（计数器、扩展断言、监听器、定时器、用户参数）
 * 供 api_scenario_studio_scripts.html 引用，与 JMeter 5.6 导出格式对齐。
 */
(function (global) {
    'use strict';

    function resultCollectorSaveConfig(indent) {
        var p = indent + '  ';
        return indent + '<objProp>\n' +
            p + '<name>saveConfig</name>\n' +
            p + '<value class="SampleSaveConfiguration">\n' +
            p + '  <time>true</time>\n' +
            p + '  <latency>true</latency>\n' +
            p + '  <timestamp>true</timestamp>\n' +
            p + '  <success>true</success>\n' +
            p + '  <label>true</label>\n' +
            p + '  <code>true</code>\n' +
            p + '  <message>true</message>\n' +
            p + '  <threadName>true</threadName>\n' +
            p + '  <dataType>true</dataType>\n' +
            p + '  <encoding>false</encoding>\n' +
            p + '  <assertions>true</assertions>\n' +
            p + '  <subresults>true</subresults>\n' +
            p + '  <responseData>false</responseData>\n' +
            p + '  <samplerData>false</samplerData>\n' +
            p + '  <xml>false</xml>\n' +
            p + '  <fieldNames>true</fieldNames>\n' +
            p + '  <responseHeaders>false</responseHeaders>\n' +
            p + '  <requestHeaders>false</requestHeaders>\n' +
            p + '  <responseDataOnError>false</responseDataOnError>\n' +
            p + '  <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>\n' +
            p + '  <assertionsResultsToSave>0</assertionsResultsToSave>\n' +
            p + '  <bytes>true</bytes>\n' +
            p + '  <sentBytes>true</sentBytes>\n' +
            p + '  <url>true</url>\n' +
            p + '  <threadCounts>true</threadCounts>\n' +
            p + '  <idleTime>true</idleTime>\n' +
            p + '  <connectTime>true</connectTime>\n' +
            p + '</value>\n' +
            indent + '</objProp>\n';
    }

    function genCounterXml(cfg, indent, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        var xml = indent + '<CounterConfig guiclass="CounterConfigGui" testclass="CounterConfig" testname="计数器" enabled="true">\n';
        xml += indent + '  <stringProp name="CounterConfig.start">' + escapeXml(cfg.start || '1') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.end">' + escapeXml(cfg.maximum || cfg.end || '999999') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.incr">' + escapeXml(cfg.increment || cfg.incr || '1') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.name">' + escapeXml(cfg.variable_name || cfg.name || 'counter') + '</stringProp>\n';
        xml += indent + '  <stringProp name="CounterConfig.format">' + escapeXml(cfg.format || '') + '</stringProp>\n';
        xml += indent + '  <boolProp name="CounterConfig.per_user">' + (cfg.per_user !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '</CounterConfig>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function sizeOperatorToInt(op) {
        var map = { eq: 1, ne: 2, gt: 3, lt: 4, ge: 5, le: 6, equals: 1, '!=': 2, '>': 3, '<': 4, '>=': 5, '<=': 6 };
        if (op === undefined || op === null || op === '') return 5;
        var k = String(op).trim().toLowerCase();
        return map[k] !== undefined ? map[k] : 5;
    }

    function genExtendedAssertionXml(assertion, samplerName, childPad, escapeXml) {
        var xml = '';
        var testName = escapeXml((assertion.type || 'assert') + ' ' + (assertion.value || '') + ' ' + samplerName);
        if (assertion.type === 'json') {
            xml += childPad + '<JSONPathAssertion guiclass="JSONPathAssertionGui" testclass="JSONPathAssertion" testname="' + testName + '" enabled="true">\n';
            xml += childPad + '  <stringProp name="JSON_PATH">' + escapeXml(assertion.value || '') + '</stringProp>\n';
            xml += childPad + '  <stringProp name="EXPECTED_VALUE">' + escapeXml(assertion.expected || '') + '</stringProp>\n';
            xml += childPad + '  <boolProp name="JSONVALIDATION">' + (assertion.expected ? 'true' : 'false') + '</boolProp>\n';
            xml += childPad + '  <boolProp name="EXPECT_NULL">false</boolProp>\n';
            xml += childPad + '  <boolProp name="INVERT">false</boolProp>\n';
            xml += childPad + '  <boolProp name="ISREGEX">' + (assertion.is_regex ? 'true' : 'false') + '</boolProp>\n';
            xml += childPad + '</JSONPathAssertion>\n';
            xml += childPad + '<hashTree/>\n';
        } else if (assertion.type === 'xml') {
            xml += childPad + '<XMLAssertion guiclass="XMLAssertionGui" testclass="XMLAssertion" testname="' + testName + '" enabled="true">\n';
            xml += childPad + '  <boolProp name="XMLAssertion.negate">false</boolProp>\n';
            xml += childPad + '  <stringProp name="XMLAssertion.user_defined_namespaces"></stringProp>\n';
            xml += childPad + '  <stringProp name="XMLAssertion.xpath">' + escapeXml(assertion.value || '') + '</stringProp>\n';
            xml += childPad + '  <boolProp name="XMLAssertion.validate">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XMLAssertion.whitespace">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XMLAssertion.tidy">false</boolProp>\n';
            xml += childPad + '</XMLAssertion>\n';
            xml += childPad + '<hashTree/>\n';
        } else if (assertion.type === 'xpath') {
            xml += childPad + '<XPathAssertion guiclass="XPathAssertionGui" testclass="XPathAssertion" testname="' + testName + '" enabled="true">\n';
            xml += childPad + '  <boolProp name="XPath.negate">false</boolProp>\n';
            xml += childPad + '  <stringProp name="XPath.xpath">' + escapeXml(assertion.value || '') + '</stringProp>\n';
            xml += childPad + '  <boolProp name="XPath.validate">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XPath.whitespace">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XPath.tidy">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XPath.document">false</boolProp>\n';
            xml += childPad + '  <boolProp name="XPath.jmeter_attribute">false</boolProp>\n';
            xml += childPad + '</XPathAssertion>\n';
            xml += childPad + '<hashTree/>\n';
        } else if (assertion.type === 'size') {
            xml += childPad + '<SizeAssertion guiclass="SizeAssertionGui" testclass="SizeAssertion" testname="' + testName + '" enabled="true">\n';
            xml += childPad + '  <stringProp name="SizeAssertion.size">' + escapeXml(assertion.value || '0') + '</stringProp>\n';
            xml += childPad + '  <intProp name="SizeAssertion.operator">' + sizeOperatorToInt(assertion.operator) + '</intProp>\n';
            xml += childPad + '  <stringProp name="SizeAssertion.test_field">SizeAssertion.response_network_size</stringProp>\n';
            xml += childPad + '</SizeAssertion>\n';
            xml += childPad + '<hashTree/>\n';
        }
        return xml;
    }

    function genViewResultsTreeXml(indent, escapeXml, cfgOrName, exportCtx) {
        if (global.JmsPlanViewResultsTreeJmx && typeof global.JmsPlanViewResultsTreeJmx.genXml === 'function' &&
            exportCtx && exportCtx.tgId === 'plan') {
            var planCfg = (cfgOrName && typeof cfgOrName === 'object') ? cfgOrName : { name: cfgOrName || '查看结果树' };
            return global.JmsPlanViewResultsTreeJmx.genXml(planCfg, indent, escapeXml, exportCtx);
        }
        if (global.JmsTgViewResultsTreeJmx && typeof global.JmsTgViewResultsTreeJmx.genXml === 'function') {
            var cfg = (cfgOrName && typeof cfgOrName === 'object')
                ? cfgOrName
                : { name: cfgOrName || '查看结果树' };
            return global.JmsTgViewResultsTreeJmx.genXml(cfg, indent, escapeXml);
        }
        var name = escapeXml(typeof cfgOrName === 'string' ? cfgOrName : '查看结果树');
        var xml = indent + '<ResultCollector guiclass="ViewResultsFullVisualizer" testclass="ResultCollector" testname="' + name + '" enabled="true">\n';
        xml += indent + '  <boolProp name="ResultCollector.error_logging">false</boolProp>\n';
        xml += resultCollectorSaveConfig(indent + '  ');
        xml += indent + '  <stringProp name="filename"></stringProp>\n';
        xml += indent + '</ResultCollector>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function genAggregateReportXml(indent, escapeXml, cfgOrName, exportCtx) {
        if (global.JmsPlanAggregateReportJmx && typeof global.JmsPlanAggregateReportJmx.genXml === 'function' &&
            exportCtx && exportCtx.tgId === 'plan') {
            var planAggCfg = (cfgOrName && typeof cfgOrName === 'object') ? cfgOrName : { name: cfgOrName || '聚合报告' };
            return global.JmsPlanAggregateReportJmx.genXml(planAggCfg, indent, escapeXml, exportCtx);
        }
        if (global.JmsTgAggregateReportJmx && typeof global.JmsTgAggregateReportJmx.genXml === 'function') {
            var cfg = (cfgOrName && typeof cfgOrName === 'object')
                ? cfgOrName
                : { name: cfgOrName || '聚合报告' };
            return global.JmsTgAggregateReportJmx.genXml(cfg, indent, escapeXml);
        }
        var name = escapeXml(typeof cfgOrName === 'string' ? cfgOrName : '聚合报告');
        var xml = indent + '<ResultCollector guiclass="StatVisualizer" testclass="ResultCollector" testname="' + name + '" enabled="true">\n';
        xml += indent + '  <boolProp name="ResultCollector.error_logging">false</boolProp>\n';
        xml += resultCollectorSaveConfig(indent + '  ');
        xml += indent + '  <stringProp name="filename"></stringProp>\n';
        xml += indent + '</ResultCollector>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function genConstantTimerXml(cfg, indent, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        var delay = cfg.delay_ms !== undefined ? cfg.delay_ms : (cfg.delay !== undefined ? cfg.delay : 300);
        var name = (cfg.name && String(cfg.name).trim()) || '固定定时器';
        var comments = cfg.comments != null ? String(cfg.comments) : '';
        var enabled = cfg.enabled !== false ? 'true' : 'false';
        var xml = indent + '<ConstantTimer guiclass="ConstantTimerGui" testclass="ConstantTimer" testname="' + escapeXml(name) + '" enabled="' + enabled + '">\n';
        if (comments) xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(comments) + '</stringProp>\n';
        xml += indent + '  <stringProp name="ConstantTimer.delay">' + escapeXml(String(delay)) + '</stringProp>\n';
        xml += indent + '</ConstantTimer>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function genUserParametersXml(cfg, indent, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        var Catalog = global.JmsHttpStepUserParamsCatalog;
        var norm = Catalog && typeof Catalog.normalizeParams === 'function' ? Catalog.normalizeParams(cfg) : cfg;
        if (!norm || !norm.enabled) return '';
        var params = (norm.params || []).filter(function (p) { return p && String(p.key || '').trim(); });
        if (!params.length) return '';
        var testname = escapeXml(norm.name || '用户参数');
        var xml = indent + '<UserParameters guiclass="UserParametersGui" testclass="UserParameters" testname="' + testname + '" enabled="true">\n';
        if (norm.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(norm.comments) + '</stringProp>\n';
        }
        xml += indent + '  <collectionProp name="UserParameters.names">\n';
        params.forEach(function (p, i) {
            xml += indent + '    <stringProp name="' + i + '">' + escapeXml(String(p.key).trim()) + '</stringProp>\n';
        });
        xml += indent + '  </collectionProp>\n';
        var userCount = norm.user_count || 1;
        xml += indent + '  <collectionProp name="UserParameters.thread_values">\n';
        for (var u = 0; u < userCount; u++) {
            xml += indent + '    <collectionProp name="' + u + '">\n';
            params.forEach(function (p, i) {
                var val = (p.values && p.values[u] !== undefined) ? p.values[u] : '';
                xml += indent + '      <stringProp name="' + i + '">' + escapeXml(String(val)) + '</stringProp>\n';
            });
            xml += indent + '    </collectionProp>\n';
        }
        xml += indent + '  </collectionProp>\n';
        xml += indent + '  <boolProp name="UserParameters.per_iteration">' + (norm.per_iteration ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '</UserParameters>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function genStepChildComponentsXml(st, childPad, escapeXml) {
        var xml = '';
        if (global.JmsHttpStepListenerJmx && typeof global.JmsHttpStepListenerJmx.genStepListenersXml === 'function') {
            xml += global.JmsHttpStepListenerJmx.genStepListenersXml(st, childPad, escapeXml);
        }
        var sl = st.step_listeners || {};
        var hasItems = global.JmsHttpStepListenerCatalog &&
            Array.isArray(st.step_listener_items) &&
            st.step_listener_items.length;
        if (!hasItems) {
            if (sl.view_results_tree) {
                xml += genViewResultsTreeXml(childPad, escapeXml, { name: '查看结果树 ' + (st.name || '') });
            }
            if (sl.aggregate_report) {
                xml += genAggregateReportXml(childPad, escapeXml, { name: '聚合报告 ' + (st.name || '') });
            }
        }
        if (st.constant_timer) {
            xml += genConstantTimerXml(st.constant_timer, childPad, escapeXml);
        }
        if (Array.isArray(st.pre_processors) && global.JmsHttpBeanshellPreProcessorJmx &&
            typeof global.JmsHttpBeanshellPreProcessorJmx.genXml === 'function') {
            st.pre_processors.forEach(function (p) {
                if (p && p.type === 'beanshell_pre') {
                    xml += global.JmsHttpBeanshellPreProcessorJmx.genXml(p, childPad, escapeXml);
                }
            });
        }
        if (st.user_parameters) {
            xml += genUserParametersXml(st.user_parameters, childPad, escapeXml);
        }
        if (global.JmsHttpStepConfigJmx &&
            typeof global.JmsHttpStepConfigJmx.genStepConfigXml === 'function') {
            xml += global.JmsHttpStepConfigJmx.genStepConfigXml(st, childPad, escapeXml);
        }
        return xml;
    }

    function genTgListenersXml(listeners, indent, escapeXml, tgName, vrtConfig, aggConfig, exportCtx) {
        var xml = '';
        var ls = listeners || {};
        if (ls.view_results_tree) {
            var cfg = vrtConfig && typeof vrtConfig === 'object'
                ? Object.assign({ name: vrtConfig.name || ('查看结果树 · ' + (tgName || '')) }, vrtConfig)
                : { name: '查看结果树 · ' + (tgName || '') };
            xml += genViewResultsTreeXml(indent, escapeXml, cfg, exportCtx);
        }
        if (ls.aggregate_report) {
            var aggCfg = aggConfig && typeof aggConfig === 'object'
                ? Object.assign({ name: aggConfig.name || ('聚合报告 · ' + (tgName || '')) }, aggConfig)
                : { name: '聚合报告 · ' + (tgName || '') };
            xml += genAggregateReportXml(indent, escapeXml, aggCfg, exportCtx);
        }
        return xml;
    }

    global.JmeterJmxExtra = {
        genCounterXml: genCounterXml,
        genExtendedAssertionXml: genExtendedAssertionXml,
        genViewResultsTreeXml: genViewResultsTreeXml,
        genAggregateReportXml: genAggregateReportXml,
        genConstantTimerXml: genConstantTimerXml,
        genUserParametersXml: genUserParametersXml,
        genStepChildComponentsXml: genStepChildComponentsXml,
        genTgListenersXml: genTgListenersXml
    };
})(window);

/* ---- js/jmeter_order_chain_template.js ---- */
/* catalog-first simple demo · generated */
(function (global) {
  'use strict';
  global.JMETER_ORDER_CHAIN_DEMO_YAML = "base_url: https://httpbin.org\nname: API\u538b\u6d4b\u5165\u95e8\u6f14\u793a\nenv: staging\nbuild: ${BUILD_ID}\nlayout: scenario\nexecution_mode: visual\nserialize_threadgroups: true\nvariables:\n  DEMO_TAG: hello\ninfluxdb:\n  enabled: false\n  url: http://127.0.0.1:8086/write?db=jmeter\n  measurement: jmeter\n  application: demo-api\n  tags:\n    env: staging\nthread_groups:\n  - name: \u4e3b\u6d41\u7a0b\n    load:\n      users: 2\n      spawn_rate: 1\n      duration_sec: 60\n      loops: -1\n    variables:\n      TG_ROLE: buyer\n    steps:\n      - type: catalog_element\n        name: HTTP \u8bf7\u6c42\u9ed8\u8ba4\u503c\n        enabled: true\n        alias: ConfigTestElement\n        testclass: ConfigTestElement\n        guiclass: HttpDefaultsGui\n        category: config\n        label_zh: HTTP \u8bf7\u6c42\u9ed8\u8ba4\u503c\n        container: false\n        scope: unified\n        catalog_props:\n          enabled: true\n          protocol: https\n          domain: httpbin.org\n          port: '443'\n          path: /\n          follow_redirects: true\n          auto_redirects: false\n          use_keepalive: true\n      - type: catalog_element\n        name: \u516c\u5171\u8bf7\u6c42\u5934\n        enabled: true\n        alias: HeaderManager\n        testclass: HeaderManager\n        guiclass: HeaderPanel\n        category: config\n        label_zh: HTTP \u4fe1\u606f\u5934\u7ba1\u7406\u5668\n        container: false\n        scope: unified\n        catalog_props:\n          enabled: true\n          name: \u516c\u5171\u8bf7\u6c42\u5934\n          headers:\n            - key: X-Demo-Tag\n              value: ${DEMO_TAG}\n            - key: X-Role\n              value: ${TG_ROLE}\n      - type: catalog_element\n        name: 01-GET\u63a2\u6d3b\n        enabled: true\n        alias: HTTPSamplerProxy\n        testclass: HTTPSamplerProxy\n        guiclass: HttpTestSampleGui\n        category: sampler\n        label_zh: HTTP \u8bf7\u6c42\n        container: false\n        scope: unified\n        catalog_props:\n          name: 01-GET\u63a2\u6d3b\n          method: GET\n          path: /get\n          query:\n            demo: ${DEMO_TAG}\n          assert_status: 200\n      - type: catalog_element\n        name: 02-POST\u63d0\u4ea4\n        enabled: true\n        alias: HTTPSamplerProxy\n        testclass: HTTPSamplerProxy\n        guiclass: HttpTestSampleGui\n        category: sampler\n        label_zh: HTTP \u8bf7\u6c42\n        container: false\n        scope: unified\n        catalog_props:\n          name: 02-POST\u63d0\u4ea4\n          method: POST\n          path: /post\n          headers:\n            Content-Type: application/json\n          body: '{\"tag\":\"${DEMO_TAG}\",\"role\":\"${TG_ROLE}\"}'\n          assert_status: 200\n      - type: catalog_element\n        name: 03-\u72b6\u6001\u68c0\u67e5\n        enabled: true\n        alias: HTTPSamplerProxy\n        testclass: HTTPSamplerProxy\n        guiclass: HttpTestSampleGui\n        category: sampler\n        label_zh: HTTP \u8bf7\u6c42\n        container: false\n        scope: unified\n        catalog_props:\n          name: 03-\u72b6\u6001\u68c0\u67e5\n          method: GET\n          path: /status/200\n          assert_status: 200\n      - type: catalog_element\n        name: \u805a\u5408\u62a5\u544a\n        enabled: true\n        alias: StatVisualizer\n        testclass: ResultCollector\n        guiclass: StatVisualizer\n        category: listener\n        label_zh: \u805a\u5408\u62a5\u544a\n        container: false\n        scope: unified\n        catalog_props:\n          name: \u805a\u5408\u62a5\u544a\n          enabled: true\n";
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_path_host.js ---- */
/**
 * JMeter path 中嵌入主机名（//host/ 或误折叠的 /host/）· 导入/导出隔离模块
 */
(function (global) {
    'use strict';

    /** JMeter 常见写法：//host/ 或 //host/path */
    function isHostPrefixedPath(path) {
        return /^\/\/[^/?#]+/.test(String(path || ''));
    }

    /** normalizeImportedPath 误折叠后的 /host/（仅单段域名） */
    function isCollapsedHostPath(path) {
        var p = String(path || '');
        return /^\/[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+\/?$/.test(p);
    }

    function splitHostFromPath(path) {
        path = String(path || '/');
        var m = path.match(/^\/\/([^/?#]+)(\/.*)?$/);
        if (m) {
            return { domain: m[1], path: m[2] || '/' };
        }
        m = path.match(/^\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        if (m) {
            return { domain: m[1], path: '/' };
        }
        return null;
    }

    function toHostPrefixedPath(domain, subPath) {
        if (!domain) return null;
        var p = subPath === undefined || subPath === null || subPath === '' ? '/' : String(subPath);
        if (p.charAt(0) !== '/') p = '/' + p;
        if (p === '/') return '//' + domain + '/';
        return '//' + domain + p;
    }

    function stepHttpDefaultsActive(step) {
        if (!step || !step.http_managers) return false;
        var Catalog = global.JmsHttpStepConfigCatalog;
        if (Catalog && typeof Catalog.typeActive === 'function') {
            return Catalog.typeActive(step.http_managers, 'http_defaults');
        }
        var hd = step.http_managers.http_defaults;
        return !!(hd && hd.enabled && hd.domain);
    }

    /** 导出：步骤级 http_defaults 含 domain 且 path 为根时，还原 //host/ 形式 */
    function formatExportPathWithHost(step, pathMerged) {
        if (!step) return null;
        pathMerged = pathMerged === undefined || pathMerged === null ? '' : String(pathMerged);
        if (isHostPrefixedPath(pathMerged)) return pathMerged;

        if (!stepHttpDefaultsActive(step)) return null;
        var hd = step.http_managers.http_defaults;
        if (!hd || !hd.domain) return null;

        var sub = pathMerged || '/';
        var hdPath = hd.path !== undefined && hd.path !== null ? String(hd.path) : '';
        if (hdPath && hdPath !== '/' && sub === '/') {
            sub = hdPath.charAt(0) === '/' ? hdPath : '/' + hdPath;
        }
        if (sub.indexOf('?') >= 0) return null;
        if (sub === '/' || sub === '') {
            return toHostPrefixedPath(hd.domain, '/');
        }
        if (sub.charAt(0) === '/' && sub.indexOf('://') < 0 && !/^\$\{/.test(sub)) {
            return toHostPrefixedPath(hd.domain, sub);
        }
        return null;
    }

    function shouldPreserveHostPathDisplay(path) {
        return isHostPrefixedPath(path) || isCollapsedHostPath(path);
    }

    /** JMX 导入/YAML 载入：将 //host/ 或 /host/ 统一还原为 //host/ 显示，不拆分到 http_defaults */
    function repairHostPathForImportDisplay(step) {
        if (!step || typeof step !== 'object') return step;
        var path = String(step.path || '');
        if (!shouldPreserveHostPathDisplay(path)) return step;
        var split = splitHostFromPath(path);
        if (split) {
            step.path = toHostPrefixedPath(split.domain, split.path);
        }
        return step;
    }

    /** 场景 YAML 载入/系统进入时：修复误折叠的 /host/ -> //host/ */
    function repairStepHostPathOnLoad(step) {
        if (!step || typeof step !== 'object') return step;
        return repairHostPathForImportDisplay(step);
    }

    /** JMX 导出：还原 //host/，避免被 ${BASE_URL} 拼成 ${BASE_URL}/host/ */
    function restoreHostPathForJmxExport(path, step) {
        path = String(path || '/');
        if (isHostPrefixedPath(path)) return path;
        if (isCollapsedHostPath(path)) {
            var splitCollapsed = splitHostFromPath(path);
            if (splitCollapsed) return toHostPrefixedPath(splitCollapsed.domain, splitCollapsed.path);
        }
        var baseVar = path.match(/^\$\{(BASE_URL|ORIGIN)\}\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        if (baseVar) return '//' + baseVar[2] + '/';
        if (step && typeof step === 'object') {
            var fromDefaults = formatExportPathWithHost(step, path);
            if (fromDefaults) return fromDefaults;
        }
        return null;
    }

    function quoteHostPathsInYaml(yamlText) {
        if (!yamlText) return yamlText;
        return yamlText.replace(/^(\s+path:\s+)(\/\/[^\s#]+)(\s*)$/gm, function (_, indent, val, tail) {
            if (val.indexOf('"') >= 0) return indent + val + tail;
            return indent + '"' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' + tail;
        });
    }

    function walkScenarioSteps(nodes, fn) {
        (nodes || []).forEach(function (st) {
            if (!st || typeof st !== 'object') return;
            if (st.method && st.path !== undefined) fn(st);
            if (Array.isArray(st.children)) walkScenarioSteps(st.children, fn);
        });
    }

    function repairHostPathsInScenarioObject(scenario) {
        if (!scenario || typeof scenario !== 'object') return scenario;
        function repairTg(tg) {
            if (!tg) return;
            walkScenarioSteps(tg.steps, repairHostPathForImportDisplay);
        }
        (scenario.thread_groups || []).forEach(repairTg);
        (scenario.setup_thread_groups || []).forEach(repairTg);
        (scenario.post_thread_groups || []).forEach(repairTg);
        (scenario.test_plans || []).forEach(function (plan) {
            (plan.thread_groups || []).forEach(repairTg);
            walkScenarioSteps(plan.steps, repairHostPathForImportDisplay);
        });
        walkScenarioSteps(scenario.steps, repairHostPathForImportDisplay);
        return scenario;
    }

    global.JmsJmxPathHost = {
        isHostPrefixedPath: isHostPrefixedPath,
        isCollapsedHostPath: isCollapsedHostPath,
        splitHostFromPath: splitHostFromPath,
        toHostPrefixedPath: toHostPrefixedPath,
        formatExportPathWithHost: formatExportPathWithHost,
        stepHttpDefaultsActive: stepHttpDefaultsActive,
        shouldPreserveHostPathDisplay: shouldPreserveHostPathDisplay,
        repairHostPathForImportDisplay: repairHostPathForImportDisplay,
        repairStepHostPathOnLoad: repairStepHostPathOnLoad,
        quoteHostPathsInYaml: quoteHostPathsInYaml,
        repairHostPathsInScenarioObject: repairHostPathsInScenarioObject,
        restoreHostPathForJmxExport: restoreHostPathForJmxExport
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_http_path_query.js ---- */
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

/* ---- js/jms_http_path_query_jmx_v1.js ---- */
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

/* ---- js/jms_step_assert_legacy_migrate.js ---- */
/**
 * HTTP 步骤断言 · 旧格式迁移为新弹窗格式（隔离模块）
 * 导入/YAML 加载时自动转换；duration/jsr223 保留只读导出能力。
 */
(function (global) {
    'use strict';

    var KEEP_READONLY = { duration: 1, jsr223_assert: 1 };

    function isNewType(type) {
        return type === 'response_assert' || type === 'json_assert' ||
            type === 'size_assert' || type === 'md5hex_assert';
    }

    function migrateOne(a) {
        if (!a || typeof a !== 'object') return [];
        var type = String(a.type || '').trim();
        if (!type || isNewType(type) || KEEP_READONLY[type]) return [a];

        if (type === 'status') {
            return [{
                type: 'response_assert',
                name: a.name || '响应状态码',
                comments: a.comments != null ? String(a.comments) : '',
                enabled: a.enabled !== false,
                apply_to: 'main_only',
                test_field: 'response_code',
                match_mode: 'equals',
                patterns: [String(a.value != null ? a.value : '200')]
            }];
        }
        if (type === 'contains') {
            return [{
                type: 'response_assert',
                name: a.name || '响应包含',
                enabled: a.enabled !== false,
                apply_to: 'main_only',
                test_field: 'response_text',
                match_mode: 'substring',
                patterns: [String(a.value || '')]
            }];
        }
        if (type === 'not_contains') {
            return [{
                type: 'response_assert',
                name: a.name || '响应不包含',
                enabled: a.enabled !== false,
                apply_to: 'main_only',
                test_field: 'response_text',
                match_mode: 'substring',
                match_not: true,
                patterns: [String(a.value || '')]
            }];
        }
        if (type === 'json') {
            var jsonPath = a.value != null ? String(a.value).trim() : '';
            if (!jsonPath) return [];
            return [{
                type: 'json_assert',
                name: a.name || 'JSON断言',
                enabled: a.enabled !== false,
                json_path: jsonPath,
                additionally_assert_value: !!(a.expected != null && String(a.expected).trim()),
                expected: a.expected != null ? String(a.expected) : '',
                expect_null: !!a.expect_null,
                invert: !!a.invert,
                is_regex: !!a.is_regex
            }];
        }
        if (type === 'size') {
            return [{
                type: 'size_assert',
                name: a.name || '大小断言',
                enabled: a.enabled !== false,
                apply_to: 'main_only',
                test_field: 'full_response',
                size_bytes: String(a.value != null ? a.value : ''),
                compare_operator: a.operator ? String(a.operator) : 'eq'
            }];
        }
        if (type === 'xpath' || type === 'xml') {
            var hint = a.value != null ? String(a.value).trim() : '';
            if (!hint) return [];
            var pattern = hint.replace(/^\/\//, '');
            return [{
                type: 'response_assert',
                name: a.name || (type === 'xpath' ? 'XPath转响应断言' : 'XML转响应断言'),
                enabled: a.enabled !== false,
                apply_to: 'main_only',
                test_field: 'response_text',
                match_mode: 'substring',
                patterns: [pattern || hint]
            }];
        }
        return [a];
    }

    function migrateList(list) {
        if (!Array.isArray(list)) return [];
        var out = [];
        list.forEach(function (a) {
            migrateOne(a).forEach(function (item) {
                if (item) out.push(item);
            });
        });
        return out;
    }

    function migrateStep(step) {
        if (!step || typeof step !== 'object') return step;
        if (Array.isArray(step.assertions) && step.assertions.length) {
            step.assertions = migrateList(step.assertions);
        }
        if (step.type === 'if_controller' && global.JmsIfMountModel &&
            typeof global.JmsIfMountModel.ensureMountFields === 'function') {
            global.JmsIfMountModel.ensureMountFields(step);
            if (Array.isArray(step.assertions) && step.assertions.length) {
                step.assertions = migrateList(step.assertions);
            }
        }
        return step;
    }

    global.JmsStepAssertLegacyMigrate = {
        migrateOne: migrateOne,
        migrateList: migrateList,
        migrateStep: migrateStep
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_step_assert_resolver.js ---- */
/**
 * HTTP 步骤断言解析（隔离模块 · 修复 JMX 导入 phantom 状态码断言）
 */
(function (global) {
    'use strict';

    var ASSERT_TYPES = {
        status: 1, contains: 1, not_contains: 1, duration: 1, json: 1, xml: 1, xpath: 1, size: 1,
        jsr223_assert: 1, response_assert: 1, json_assert: 1, size_assert: 1, md5hex_assert: 1
    };

    function isValidAssertion(a) {
        if (!a || typeof a !== 'object' || !ASSERT_TYPES[a.type]) return false;
        if (a.type === 'jsr223_assert') {
            return !!(a.script != null && String(a.script).trim());
        }
        if (a.type === 'response_assert') {
            return Array.isArray(a.patterns) && a.patterns.some(function (p) {
                return p != null && String(p).trim();
            });
        }
        if (a.type === 'json_assert') {
            return !!(a.json_path != null && String(a.json_path).trim());
        }
        if (a.type === 'size_assert') {
            return a.size_bytes != null && String(a.size_bytes).trim() !== '' && !isNaN(Number(a.size_bytes));
        }
        if (a.type === 'md5hex_assert') {
            var hex = a.md5_hex != null ? String(a.md5_hex).trim().toLowerCase() : '';
            return /^[a-f0-9]{32}$/.test(hex);
        }
        return !!(a.value != null && String(a.value).trim());
    }

    function normalizeAssertionList(list) {
        if (!Array.isArray(list)) return [];
        var src = list;
        if (global.JmsStepAssertLegacyMigrate &&
            typeof global.JmsStepAssertLegacyMigrate.migrateList === 'function') {
            src = global.JmsStepAssertLegacyMigrate.migrateList(list);
        }
        var out = [];
        src.forEach(function (a) {
            if (!isValidAssertion(a)) return;
            if (a.type === 'jsr223_assert') {
                out.push({
                    type: 'jsr223_assert',
                    name: a.name ? String(a.name) : (a.jmeter_name ? String(a.jmeter_name) : 'JSR223 断言'),
                    script: a.script !== undefined ? String(a.script) : '',
                    language: a.language ? String(a.language) : 'groovy',
                    enabled: a.enabled !== false
                });
                return;
            }
            if (a.type === 'response_assert') {
                out.push({
                    type: 'response_assert',
                    name: a.name ? String(a.name) : '响应断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    apply_to: a.apply_to ? String(a.apply_to) : 'main_only',
                    jmeter_variable: a.jmeter_variable != null ? String(a.jmeter_variable) : '',
                    test_field: a.test_field ? String(a.test_field) : 'response_text',
                    ignore_status: !!a.ignore_status,
                    match_mode: a.match_mode ? String(a.match_mode) : 'substring',
                    match_not: !!a.match_not,
                    match_or: !!a.match_or,
                    jmeter_test_type: a.jmeter_test_type != null ? Number(a.jmeter_test_type) : undefined,
                    patterns: Array.isArray(a.patterns) ? a.patterns.map(String) : [],
                    custom_message: a.custom_message != null ? String(a.custom_message) : ''
                });
                return;
            }
            if (a.type === 'json_assert') {
                out.push({
                    type: 'json_assert',
                    name: a.name ? String(a.name) : 'JSON断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    json_path: a.json_path ? String(a.json_path) : '$.',
                    additionally_assert_value: !!a.additionally_assert_value,
                    is_regex: !!a.is_regex,
                    expected: a.expected != null ? String(a.expected) : '',
                    expect_null: !!a.expect_null,
                    invert: !!a.invert
                });
                return;
            }
            if (a.type === 'size_assert') {
                out.push({
                    type: 'size_assert',
                    name: a.name ? String(a.name) : '大小断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    apply_to: a.apply_to ? String(a.apply_to) : 'main_only',
                    jmeter_variable: a.jmeter_variable != null ? String(a.jmeter_variable) : '',
                    test_field: a.test_field ? String(a.test_field) : 'full_response',
                    size_bytes: a.size_bytes != null ? String(a.size_bytes) : '',
                    compare_operator: a.compare_operator ? String(a.compare_operator) : 'eq'
                });
                return;
            }
            if (a.type === 'md5hex_assert') {
                out.push({
                    type: 'md5hex_assert',
                    name: a.name ? String(a.name) : 'MD5Hex断言',
                    comments: a.comments != null ? String(a.comments) : '',
                    enabled: a.enabled !== false,
                    md5_hex: a.md5_hex != null ? String(a.md5_hex).trim().toLowerCase() : ''
                });
                return;
            }
            out.push({
                type: String(a.type).trim(),
                value: String(a.value).trim(),
                expected: a.expected !== undefined && a.expected !== null ? String(a.expected).trim() : undefined,
                operator: a.operator ? String(a.operator) : undefined,
                custom_message: a.custom_message ? String(a.custom_message) : undefined,
                jmeter_test_type: a.jmeter_test_type != null ? Number(a.jmeter_test_type) : undefined,
                jmeter_test_field: a.jmeter_test_field ? String(a.jmeter_test_field) : undefined,
                jmeter_name: a.jmeter_name ? String(a.jmeter_name) : undefined
            });
        });
        return out;
    }

    /** YAML 加载：仅当未显式提供空 assertions 数组时，才从 legacy assert_status 补全 */
    function parseAssertionsFromYaml(st) {
        var list = [];
        var hasAssertionsKey = !!(st && Array.isArray(st.assertions));
        if (hasAssertionsKey) {
            st.assertions.forEach(function (a) {
                if (!a || typeof a !== 'object') return;
                var type = String(a.type || '').trim();
                if (!ASSERT_TYPES[type]) return;
                if (type === 'jsr223_assert') {
                    var script = a.script !== undefined ? String(a.script) : String(a.value || '');
                    if (!script.trim()) return;
                    list.push({
                        type: 'jsr223_assert',
                        name: a.name ? String(a.name) : 'JSR223 断言',
                        script: script,
                        language: a.language ? String(a.language) : 'groovy',
                        enabled: a.enabled !== false
                    });
                    return;
                }
                if (type === 'response_assert') {
                    var patternsYaml = [];
                    if (Array.isArray(a.patterns)) {
                        a.patterns.forEach(function (p) {
                            var s = p != null ? String(p).trim() : '';
                            if (s) patternsYaml.push(s);
                        });
                    }
                    if (!patternsYaml.length) return;
                    list.push({
                        type: 'response_assert',
                        name: a.name ? String(a.name) : '响应断言',
                        comments: a.comments != null ? String(a.comments) : '',
                        enabled: a.enabled !== false,
                        apply_to: a.apply_to ? String(a.apply_to) : 'main_only',
                        jmeter_variable: a.jmeter_variable != null ? String(a.jmeter_variable) : '',
                        test_field: a.test_field ? String(a.test_field) : 'response_text',
                        ignore_status: !!a.ignore_status,
                        match_mode: a.match_mode ? String(a.match_mode) : 'substring',
                        match_not: !!a.match_not,
                        match_or: !!a.match_or,
                        jmeter_test_type: a.jmeter_test_type != null ? Number(a.jmeter_test_type) : undefined,
                        patterns: patternsYaml,
                        custom_message: a.custom_message != null ? String(a.custom_message) : ''
                    });
                    return;
                }
                if (type === 'json_assert') {
                    var jsonPath = a.json_path != null ? String(a.json_path).trim() : '';
                    if (!jsonPath) return;
                    list.push({
                        type: 'json_assert',
                        name: a.name ? String(a.name) : 'JSON断言',
                        comments: a.comments != null ? String(a.comments) : '',
                        enabled: a.enabled !== false,
                        json_path: jsonPath,
                        additionally_assert_value: !!a.additionally_assert_value,
                        is_regex: !!a.is_regex,
                        expected: a.expected != null ? String(a.expected) : '',
                        expect_null: !!a.expect_null,
                        invert: !!a.invert
                    });
                    return;
                }
                if (type === 'size_assert') {
                    var sizeBytes = a.size_bytes != null ? String(a.size_bytes).trim() : '';
                    if (!sizeBytes || isNaN(Number(sizeBytes))) return;
                    list.push({
                        type: 'size_assert',
                        name: a.name ? String(a.name) : '大小断言',
                        comments: a.comments != null ? String(a.comments) : '',
                        enabled: a.enabled !== false,
                        apply_to: a.apply_to ? String(a.apply_to) : 'main_only',
                        jmeter_variable: a.jmeter_variable != null ? String(a.jmeter_variable) : '',
                        test_field: a.test_field ? String(a.test_field) : 'full_response',
                        size_bytes: sizeBytes,
                        compare_operator: a.compare_operator ? String(a.compare_operator) : 'eq'
                    });
                    return;
                }
                if (type === 'md5hex_assert') {
                    var md5Hex = a.md5_hex != null ? String(a.md5_hex).trim().toLowerCase() : '';
                    if (!/^[a-f0-9]{32}$/.test(md5Hex)) return;
                    list.push({
                        type: 'md5hex_assert',
                        name: a.name ? String(a.name) : 'MD5Hex断言',
                        comments: a.comments != null ? String(a.comments) : '',
                        enabled: a.enabled !== false,
                        md5_hex: md5Hex
                    });
                    return;
                }
                var value = a.value !== undefined && a.value !== null ? String(a.value).trim() : '';
                if (!value) return;
                var item = { type: type, value: value };
                if (a.expected !== undefined && a.expected !== null && String(a.expected).trim()) {
                    item.expected = String(a.expected).trim();
                }
                if (a.operator) item.operator = String(a.operator);
                if (a.custom_message) item.custom_message = String(a.custom_message);
                if (a.jmeter_test_type != null) item.jmeter_test_type = Number(a.jmeter_test_type);
                if (a.jmeter_test_field) item.jmeter_test_field = String(a.jmeter_test_field);
                if (a.jmeter_name) item.jmeter_name = String(a.jmeter_name);
                list.push(item);
            });
        }
        if (!hasAssertionsKey &&
            st && st.assert_status !== undefined && st.assert_status !== null && st.assert_status !== '') {
            if (!list.some(function (a) { return a.type === 'status'; })) {
                list.unshift({ type: 'status', value: String(st.assert_status) });
            }
        }
        return list;
    }

    /** 运行时读取：只认 assertions 数组，不再从 orphan assert_status 合成 */
    function getStepAssertions(step) {
        if (!step || !Array.isArray(step.assertions)) return [];
        return normalizeAssertionList(step.assertions);
    }

    function syncAssertStatusFromAssertions(step) {
        if (!step || typeof step !== 'object') return step;
        var status = (step.assertions || []).find(function (a) { return a && a.type === 'status'; });
        if (!status) {
            status = (step.assertions || []).find(function (a) {
                return a && a.type === 'response_assert' && a.test_field === 'response_code' &&
                    Array.isArray(a.patterns) && a.patterns.length;
            });
            if (status) {
                step.assert_status = String(status.patterns[0]);
            } else {
                step.assert_status = '';
            }
        } else {
            step.assert_status = status.value;
        }
        if (!getStepAssertions(step).length) {
            step.assertions = [];
            step.assert_status = '';
        }
        return step;
    }

    /** JMX 导入 / YAML 加载后：无断言则清空 legacy 字段 */
    function sanitizeImportedStepAssertions(step) {
        if (!step || typeof step !== 'object' || !step.method) return step;
        var list = getStepAssertions(step);
        if (list.length) {
            step.assertions = list;
            syncAssertStatusFromAssertions(step);
            return step;
        }
        step.assertions = [];
        step.assert_status = '';
        delete step.assert_status;
        return step;
    }

    global.JmsStepAssertResolver = {
        parseAssertionsFromYaml: parseAssertionsFromYaml,
        getStepAssertions: getStepAssertions,
        syncAssertStatusFromAssertions: syncAssertStatusFromAssertions,
        sanitizeImportedStepAssertions: sanitizeImportedStepAssertions,
        isValidAssertion: isValidAssertion
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_add_choice_ui.js ---- */
/**
 * 添加线程组 · 类型选择弹窗（隔离模块 · #modal-tg-add-choice）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-add-choice';
    var pendingPlanId = null;

    function getModal() {
        return global.document.getElementById(MODAL_ID);
    }

    function clearPending() {
        pendingPlanId = null;
    }

    function closeModal() {
        var modal = getModal();
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        clearPending();
    }

    function showErr(msg) {
        var studio = global.JmsScenarioStudio;
        if (studio && typeof studio.showMsg === 'function') {
            studio.showMsg(msg, false);
        }
    }

    function applyKind(kind) {
        if (!pendingPlanId) return;
        var planId = pendingPlanId;
        closeModal();
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.addThreadGroupByKind !== 'function') {
            showErr('线程组添加功能未就绪，请刷新页面后重试。');
            return;
        }
        try {
            vb.addThreadGroupByKind(planId, kind);
        } catch (e) {
            showErr(e.message || String(e));
        }
    }

    function bindEvents() {
        if (global.document.body.dataset.jmsTgAddChoiceBound === '1') return;
        global.document.body.dataset.jmsTgAddChoiceBound = '1';

        global.document.addEventListener('click', function (ev) {
            var setupBtn = ev.target.closest('#btn-tg-add-setup');
            var teardownBtn = ev.target.closest('#btn-tg-add-teardown');
            var threadBtn = ev.target.closest('#btn-tg-add-thread');
            if (setupBtn) {
                ev.preventDefault();
                applyKind('setup');
                return;
            }
            if (teardownBtn) {
                ev.preventDefault();
                applyKind('teardown');
                return;
            }
            if (threadBtn) {
                ev.preventDefault();
                applyKind('thread');
            }
        });

        var modal = getModal();
        if (modal) {
            modal.addEventListener('click', function (ev) {
                if (ev.target === modal) closeModal();
            });
        }

        global.document.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Escape') return;
            var m = getModal();
            if (m && m.classList.contains('jms-modal-open')) closeModal();
        });
    }

    function openModal(target) {
        var planId = target && target.planId;
        if (!planId) return;
        pendingPlanId = planId;
        var modal = getModal();
        if (!modal) {
            clearPending();
            showErr('线程组类型选择弹窗未加载，请刷新页面后重试。');
            return;
        }
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bindEvents);
    } else {
        bindEvents();
    }

    global.JmsTgAddChoiceUi = {
        openModal: openModal,
        closeModal: closeModal
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_load_drawer_ui.js ---- */
/**
 * 压测负载抽屉 · 线程组识别与卡片渲染（隔离模块 · #modal-tg-load）
 */
(function (global) {
    'use strict';

    function kindBadge(kind) {
        if (kind === 'setup') return 'SetUp';
        if (kind === 'post') return 'tearDown';
        return '线程组';
    }

    function cardKindClass(kind) {
        if (kind === 'setup') return 'jms-tg-load-card--setup';
        if (kind === 'post') return 'jms-tg-load-card--post';
        return 'jms-tg-load-card--thread';
    }

    function badgeKindClass(kind) {
        if (kind === 'setup') return 'jms-tg-load-kind-badge--setup';
        if (kind === 'post') return 'jms-tg-load-kind-badge--post';
        return 'jms-tg-load-kind-badge--thread';
    }

    function formatEntryLabel(planName, tg, kind) {
        var name = (tg && tg.name) ? String(tg.name) : '未命名';
        return String(planName || '场景') + ' / ' + kindBadge(kind) + ' · ' + name;
    }

    /** 收集抽屉内全部线程组（含 SetUp / tearDown / 主线程组，按 display_seq 排序） */
    function collectEntries(model) {
        var list = [];
        if (!model) return list;
        var plans = model.test_plans || [];
        if (!plans.length) return list;

        plans.forEach(function (plan, planIndex) {
            var planName = plan.name || ('测试计划 ' + (planIndex + 1));
            if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.collectInDisplayOrder === 'function') {
                global.JmsTgDisplayOrder.collectInDisplayOrder(model, plan.id).forEach(function (item) {
                    list.push({
                        plan: plan,
                        planIndex: planIndex,
                        tg: item.tg,
                        kind: item.kind || 'thread',
                        label: formatEntryLabel(planName, item.tg, item.kind || 'thread')
                    });
                });
                return;
            }
            (model.setup_thread_groups || []).forEach(function (tg, ti) {
                list.push({
                    plan: plan,
                    planIndex: planIndex,
                    tg: tg,
                    kind: 'setup',
                    label: formatEntryLabel(planName, tg, 'setup')
                });
            });
            (plan.thread_groups || []).forEach(function (tg, ti) {
                list.push({
                    plan: plan,
                    planIndex: planIndex,
                    tg: tg,
                    kind: 'thread',
                    label: formatEntryLabel(planName, tg, 'thread')
                });
            });
            (model.post_thread_groups || []).forEach(function (tg, ti) {
                list.push({
                    plan: plan,
                    planIndex: planIndex,
                    tg: tg,
                    kind: 'post',
                    label: formatEntryLabel(planName, tg, 'post')
                });
            });
        });
        return list;
    }

    function summarizeBanner(count, entries) {
        if (!count) return '请先添加测试计划与线程组。';
        var setupN = 0;
        var postN = 0;
        var threadN = 0;
        (entries || []).forEach(function (item) {
            if (item.kind === 'setup') setupN += 1;
            else if (item.kind === 'post') postN += 1;
            else threadN += 1;
        });
        var parts = ['检测到 ' + count + ' 个线程组'];
        var detail = [];
        if (setupN) detail.push('SetUp ' + setupN);
        if (threadN) detail.push('主线程 ' + threadN);
        if (postN) detail.push('tearDown ' + postN);
        if (detail.length) parts.push('（' + detail.join(' · ') + '）');
        parts.push('，分别配置并发与 Influx scenario 标签。');
        return parts.join('');
    }

    function escapeHtml(s) {
        var d = global.document && global.document.createElement ? global.document.createElement('div') : null;
        if (!d) return String(s == null ? '' : s);
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function renderCardHtml(item, esc) {
        if (!item || !item.tg || !item.plan || !item.plan.id) return '';
        var e = typeof esc === 'function' ? esc : escapeHtml;
        var tg = item.tg;
        var kind = item.kind || 'thread';
        var l = tg.load || {};
        return '<section class="jms-vars-plan jms-tg-load-card ' + cardKindClass(kind) + '" data-plan-id="' + e(item.plan.id) + '" data-tg-id="' + e(tg.id) + '" data-tg-kind="' + e(kind) + '">' +
            '<div class="jms-vars-plan__head">' +
            '<span class="jms-vars-plan__badge jms-tg-load-kind-badge ' + badgeKindClass(kind) + '">' + e(kindBadge(kind)) + '</span>' +
            '<span class="jms-tg-load-card__name">' + e(tg.name || '未命名') + '</span>' +
            '</div>' +
            '<div class="jms-tg-load-card__body">' +
            '<div class="jms-tg-load-grid">' +
            '<div class="jms-tg-load-field"><label>users</label><input type="number" class="tg-fld-users" min="1" value="' + e(l.users) + '" /></div>' +
            '<div class="jms-tg-load-field"><label>spawn_rate</label><input type="number" class="tg-fld-spawn" min="1" value="' + e(l.spawn_rate) + '" /></div>' +
            '<div class="jms-tg-load-field"><label>duration_sec</label><input type="number" class="tg-fld-duration" min="1" value="' + e(l.duration_sec) + '" /></div>' +
            '<div class="jms-tg-load-field"><label>loops</label><input type="number" class="tg-fld-loops" value="' + e(l.loops) + '" /></div>' +
            '<div class="jms-tg-load-field jms-tg-load-field--wide"><label>scenario tag</label><input type="text" class="tg-fld-scenario hf-mono" value="' + e(tg.influx_scenario) + '" placeholder="order-create" /></div>' +
            '</div></div></section>';
    }

    function renderCardsHtml(groups, esc) {
        return (groups || []).map(function (item) {
            return renderCardHtml(item, esc);
        }).join('');
    }

    global.JmsTgLoadDrawerUi = {
        collectEntries: collectEntries,
        summarizeBanner: summarizeBanner,
        renderCardHtml: renderCardHtml,
        renderCardsHtml: renderCardsHtml,
        kindBadge: kindBadge
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_http_blank_step_factory.js ---- */
/**
 * HTTP 空白步骤工厂（隔离模块）
 * 用户主动添加 HTTP 请求时使用，不预置断言/定时器/用户参数。
 */
(function (global) {
    'use strict';

    function createBlankHttpStep(uid) {
        var idFn = typeof uid === 'function' ? uid : function () {
            return 'jms-' + Math.random().toString(36).slice(2, 10);
        };
        return {
            id: idFn(),
            name: 'HTTP 请求',
            method: 'GET',
            path: '/',
            encoding: '',
            body_content_mode: 'json',
            body_type: 'none',
            body: '',
            body_params: [],
            multipart_fields: [],
            upload_files: [],
            headers: [],
            query: [],
            extract_json_path: '',
            extract_var: '',
            extractors: [],
            assert_status: '',
            assertions: [],
            step_listeners: { view_results_tree: false, aggregate_report: false },
            step_listener_items: [],
            processors: [],
            pre_processors: [],
            logic_controllers: [],
            editMode: 'form'
        };
    }

    global.JmsHttpBlankStepFactory = {
        createBlankHttpStep: createBlankHttpStep
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jmeter_visual_builder.js ---- */
/**
 * JMeter 压测场景 — 可视化搭建器
 * 与 api_scenario_studio.html 配合：维护内存模型，双向同步隐藏 yaml-input
 */
(function (global) {
    'use strict';

    var _api = null;
    var _model = null;
    var _selected = { planId: null, tgId: null };
    var _renderScheduled = false;
    var _suppressDirty = false;

    function notifyUserEdit() {
        if (_suppressDirty) return;
        if (_api && typeof _api.markScenarioDirty === 'function') _api.markScenarioDirty();
    }

    function isTreeViewMode() {
        return document.body.classList.contains('lth-tg-view-tree');
    }

    function patchTgListenerButtonUi(btn, listeners, key) {
        if (!btn || !key) return;
        var on = !!(listeners && listeners[key]);
        btn.classList.toggle('is-on', on);
    }


    function uid() {
        return 'jms-' + Math.random().toString(36).slice(2, 10);
    }

    function objToVars(obj) {
        if (!obj || typeof obj !== 'object') return [];
        return Object.keys(obj).map(function (k) {
            return { key: k, value: obj[k] !== undefined && obj[k] !== null ? String(obj[k]) : '' };
        });
    }

    function varsToObj(arr) {
        var o = {};
        (arr || []).forEach(function (row) {
            var k = (row.key || '').trim();
            if (k) o[k] = row.value !== undefined ? String(row.value) : '';
        });
        return o;
    }

    function inferBodyTypeFromYaml(st) {
        if (!st || typeof st !== 'object') return 'none';
        var t = st.body_type ? String(st.body_type).toLowerCase() : '';
        if (['none', 'json', 'form', 'multipart'].indexOf(t) >= 0) return t;
        if (st.multipart && typeof st.multipart === 'object') return 'multipart';
        if (st.form_params && typeof st.form_params === 'object' && Object.keys(st.form_params).length) return 'form';
        if (st.body !== undefined && st.body !== null && String(st.body).trim()) return 'json';
        return 'none';
    }

    function inferBodyTypeFromStep(s) {
        if (!s) return 'none';
        var t = s.body_type ? String(s.body_type).toLowerCase() : '';
        if (['none', 'json', 'form', 'multipart'].indexOf(t) >= 0) return t;
        if ((s.upload_files || []).some(function (f) { return f && String(f.path || '').trim(); })) return 'multipart';
        if ((s.multipart_fields || []).some(function (r) { return r && String(r.key || '').trim(); })) return 'multipart';
        if ((s.body_params || []).some(function (r) { return r && String(r.key || '').trim(); })) return 'form';
        if (s.body && String(s.body).trim()) return 'json';
        return 'none';
    }

    function defaultLoad() {
        return { users: 50, spawn_rate: 10, duration_sec: 300, loops: -1 };
    }

    function parseAssertionsFromYaml(st) {
        if (global.JmsStepAssertResolver &&
            typeof global.JmsStepAssertResolver.parseAssertionsFromYaml === 'function') {
            return global.JmsStepAssertResolver.parseAssertionsFromYaml(st);
        }
        return [];
    }

    function getStepAssertions(step) {
        if (global.JmsStepAssertResolver &&
            typeof global.JmsStepAssertResolver.getStepAssertions === 'function') {
            return global.JmsStepAssertResolver.getStepAssertions(step);
        }
        return Array.isArray(step && step.assertions) ? step.assertions.slice() : [];
    }

    function syncAssertStatusFromAssertions(step) {
        if (global.JmsStepAssertResolver &&
            typeof global.JmsStepAssertResolver.syncAssertStatusFromAssertions === 'function') {
            return global.JmsStepAssertResolver.syncAssertStatusFromAssertions(step);
        }
        var status = (step.assertions || []).find(function (a) { return a.type === 'status'; });
        step.assert_status = status ? status.value : '';
    }

    function defaultHttpManagers() {
        return {
            http_defaults: {
                enabled: false,
                protocol: '',
                domain: '',
                port: '',
                path: '',
                connect_timeout: '',
                response_timeout: '',
                implementation: 'HttpClient4',
                content_encoding: '',
                follow_redirects: true,
                auto_redirects: false,
                use_keepalive: true
            },
            header_manager: { enabled: false, headers: [], name: "", comments: "" },
            cookie_manager: {
                enabled: false,
                clear_each_iteration: true,
                controlled_by_thread_group: false,
                cookies: []
            },
            cache_manager: {
                enabled: false,
                clear_each_iteration: true,
                use_expires: true
            },
            csv_data_set: {
                enabled: false,
                filename: '',
                file_encoding: 'UTF-8',
                variable_names: '',
                ignore_first_line: false,
                delimiter: ',',
                quoted_data: false,
                recycle: true,
                stop_thread: false,
                share_mode: 'shareMode.all',
                file_content: ''
            },
            counter: {
                enabled: false,
                start: '1',
                increment: '1',
                maximum: '999999',
                format: '',
                variable_name: 'counter',
                per_user: true
            },
            selected_types: []
        };
    }

    var TG_CONFIG_TAB_KEYS = ['http_defaults', 'header_manager', 'cookie_manager', 'cache_manager', 'csv_data_set', 'counter'];

    function defaultStepListeners() {
        return { view_results_tree: false, aggregate_report: false };
    }

    function defaultConstantTimer() {
        return { enabled: false, delay_ms: 1000 };
    }

    function defaultUserParameters() {
        return { enabled: false, per_iteration: false, params: [] };
    }

    function defaultTgListeners() {
        return { view_results_tree: false, aggregate_report: false, backend_listener: false };
    }


    function defaultBlankHttpStep() {
        if (global.JmsHttpBlankStepFactory && typeof global.JmsHttpBlankStepFactory.createBlankHttpStep === 'function') {
            return global.JmsHttpBlankStepFactory.createBlankHttpStep(uid);
        }
        var s = defaultStep();
        s.assertions = [];
        s.assert_status = '';
        delete s.constant_timer;
        delete s.user_parameters;
        return s;
    }

    function defaultStep() {
        return {
            id: uid(),
            name: 'HTTP 请求',
            method: 'GET',
            path: '/',
            encoding: '',
            body_content_mode: 'json',
            body_type: 'none',
            body: '',
            body_params: [],
            multipart_fields: [],
            upload_files: [],
            headers: [],
            query: [],
            extract_json_path: '',
            extract_var: '',
            extractors: [],
            assert_status: '200',
            assertions: [{
                type: 'response_assert',
                name: '响应状态码',
                enabled: true,
                test_field: 'response_code',
                match_mode: 'equals',
                patterns: ['200']
            }],
            step_listeners: defaultStepListeners(),
            step_listener_items: [],
            processors: [],
            constant_timer: defaultConstantTimer(),
            user_parameters: defaultUserParameters(),
            pre_processors: [],
            logic_controllers: [],
            editMode: 'form'
        };
    }

    function compat() { return global.JmsCatalogStepCompat; }
    function isIfStep(st) { var C = compat(); return C ? C.isIfController(st) : false; }
    function isRandomStep(st) { var C = compat(); return C ? C.isRandomController(st) : false; }
    function isSimpleStep(st) { var C = compat(); return C ? C.isSimpleController(st) : false; }
    function isTransactionStep(st) { var C = compat(); return C ? C.isTransactionController(st) : false; }
    function isLoopStep(st) { var C = compat(); return C ? C.isLoopController(st) : false; }
    function isLogicContainerStep(st) {
        var C = compat();
        return C ? C.isLogicContainer(st) : !!(st && st.type === 'catalog_element' && st.container && st.category === 'controller');
    }
    function isBeanShellStep(st) { var C = compat(); return C ? C.isBeanShellPost(st) : false; }
    function isDebugStep(st) { var C = compat(); return C ? C.isDebugSampler(st) : false; }
    function isJsonPostAuxStep(st) { var C = compat(); return C ? C.isJsonPost(st) : false; }
    function isRegexExtractAuxStep(st) { var C = compat(); return C ? C.isRegexExtract(st) : false; }
    function isXPathExtractAuxStep(st) { var C = compat(); return C ? C.isXPathExtract(st) : false; }
    function isJsr223PostAuxStep(st) { var C = compat(); return C ? C.isJsr223Post(st) : false; }
    function isJdbcPostAuxStep(st) { var C = compat(); return C ? C.isJdbcPost(st) : false; }


    function catalogStepFromYaml(st) {
        if (!st || typeof st !== 'object') return defaultStep();
        var C = global.JmsCatalogStepCompat;
        if (C && typeof C.yamlToCatalogStep === 'function') {
            var cat = C.yamlToCatalogStep(st, uid, stepsFromYamlTree);
            if (cat) return cat;
        }
        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.stepToCatalog === 'function') {
            var migrated = M.stepToCatalog(st);
            if (migrated && migrated.type === 'catalog_element') {
                if (!migrated.id) migrated.id = uid();
                if (Array.isArray(migrated.children)) {
                    migrated.children = migrated.children.map(function (c) {
                        return catalogStepFromYaml(c);
                    }).filter(Boolean);
                }
                return migrated;
            }
        }
        throw new Error('仅支持 catalog_element 格式步骤，请使用官方元件 YAML');
    }

    function catalogStepToYaml(s) {
        if (!s) return null;
        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.stepToCatalog === 'function') {
            s = M.stepToCatalog(s);
        }
        var list = stepsToYamlTree([s]);
        return (list && list[0]) || null;
    }

    function stepsFromYamlTree(list) {
        if (!Array.isArray(list) || !list.length) return [defaultStep()];
        return list.map(function (st) {
            var C = global.JmsCatalogStepCompat;
            if (C && typeof C.yamlToCatalogStep === 'function') {
                var cat = C.yamlToCatalogStep(st, uid, stepsFromYamlTree);
                if (cat) return cat;
            }
            return catalogStepFromYaml(st);
        }).filter(Boolean);
    }

    function stepsToYamlTree(list) {
        if (global.JmsCatalogStepsYamlExport && typeof global.JmsCatalogStepsYamlExport.prepareSteps === 'function') {
            list = global.JmsCatalogStepsYamlExport.prepareSteps(list || []);
        }
        return (list || []).map(function (s) {
            if (!s || s.type !== 'catalog_element') return null;
            var catYaml = {
                type: 'catalog_element',
                name: s.name || s.label_zh || s.alias,
                enabled: s.enabled !== false,
                alias: s.alias,
                testclass: s.testclass || s.alias,
                guiclass: s.guiclass || '',
                jmeter_class: s.jmeter_class || '',
                category: s.category || 'other',
                label_zh: s.label_zh || s.alias,
                container: !!s.container,
                scope: s.scope || 'core',
                jmx_fragment: s.jmx_fragment || ''
            };
            if (s.catalog_props && typeof s.catalog_props === 'object') catYaml.catalog_props = s.catalog_props;
            if (global.JmsCatalogStepsYaml && typeof global.JmsCatalogStepsYaml.enrichCatalogStepYaml === 'function') {
                catYaml = global.JmsCatalogStepsYaml.enrichCatalogStepYaml(catYaml, s);
            }
            if (s.container) catYaml.children = stepsToYamlTree(s.children || []);
            if (s.import_order != null) catYaml.import_order = s.import_order;
            return catYaml;
        }).filter(Boolean);
    }

﻿    function countStepsInList(list) {
        var n = 0;
        (list || []).forEach(function (s) {
            if (!s) return;
            if (isLogicContainerStep(s)) n += countStepsInList(s.children);
            else if (s.method || isBeanShellStep(s) || isDebugStep(s) || isJsonPostAuxStep(s) || isRegexExtractAuxStep(s) || isXPathExtractAuxStep(s) || isJsr223PostAuxStep(s) || isJdbcPostAuxStep(s)) n += 1;
        });
        return n;
    }

    function findStepInList(list, stepId) {
        if (!list || !stepId) return null;
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            if (!s) continue;
            if (sidMatch(s.id, stepId)) return s;
            if (isLogicContainerStep(s) && s.children) {
                var nested = findStepInList(s.children, stepId);
                if (nested) return nested;
            }
        }
        return null;
    }

    function removeStepFromList(list, stepId) {
        if (!list || !stepId) return false;
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            if (!s) continue;
            if (sidMatch(s.id, stepId)) {
                list.splice(i, 1);
                return true;
            }
            if (isLogicContainerStep(s) && s.children && removeStepFromList(s.children, stepId)) {
                return true;
            }
        }
        return false;
    }

    function defaultThreadGroup(name) {
        return {
            id: uid(),
            name: name || '线程组 1',
            load: defaultLoad(),
            influx_scenario: '',
            variables: [],
            listeners: defaultTgListeners(),
            http_managers: defaultHttpManagers(),
            assertions: [],
            steps: [defaultStep()]
        };
    }

    function parseCookiesFromYaml(list) {
        if (!Array.isArray(list)) return [];
        return list.map(function (c) {
            if (!c || typeof c !== 'object') return { name: '', value: '', domain: '', path: '/', secure: false, expires: '' };
            return {
                name: String(c.name || ''),
                value: String(c.value || ''),
                domain: String(c.domain || ''),
                path: String(c.path || '/'),
                secure: !!c.secure,
                expires: c.expires !== undefined && c.expires !== null ? String(c.expires) : ''
            };
        });
    }

    function parseHttpManagersFromYaml(tg) {
        var def = defaultHttpManagers();
        var src = (tg && tg.http_managers && typeof tg.http_managers === 'object') ? tg.http_managers : {};
        var hm = src.header_manager || {};
        var cm = src.cookie_manager || {};
        var cache = src.cache_manager || {};
        var hd = src.http_defaults || {};
        return {
            http_defaults: {
                enabled: hd.enabled !== false,
                protocol: hd.protocol ? String(hd.protocol) : '',
                domain: hd.domain ? String(hd.domain) : '',
                port: hd.port !== undefined && hd.port !== null ? String(hd.port) : '',
                path: hd.path !== undefined ? String(hd.path) : '',
                connect_timeout: hd.connect_timeout !== undefined ? String(hd.connect_timeout) : '',
                response_timeout: hd.response_timeout !== undefined ? String(hd.response_timeout) : '',
                implementation: hd.implementation ? String(hd.implementation) : 'HttpClient4',
                content_encoding: hd.content_encoding !== undefined ? String(hd.content_encoding) : '',
                follow_redirects: hd.follow_redirects !== false,
                auto_redirects: !!hd.auto_redirects,
                use_keepalive: hd.use_keepalive !== false
            },
            header_manager: {
                enabled: !!hm.enabled,
                headers: objToVars(hm.headers),
                name: hm.name !== undefined ? String(hm.name) : "",
                comments: hm.comments !== undefined ? String(hm.comments) : ""
            },
            cookie_manager: {
                enabled: !!cm.enabled,
                clear_each_iteration: cm.clear_each_iteration !== false,
                controlled_by_thread_group: !!cm.controlled_by_thread_group,
                cookies: parseCookiesFromYaml(cm.cookies)
            },
            cache_manager: {
                enabled: !!cache.enabled,
                clear_each_iteration: cache.clear_each_iteration !== false,
                use_expires: cache.use_expires !== false
            },
            csv_data_set: parseCsvDataSetFromYaml(src.csv_data_set),
            counter: parseCounterFromYaml(src.counter),
            selected_types: parseTgConfigSelectedTypes(src.selected_types)
        };
    }

    function parseCounterFromYaml(src) {
        var def = defaultHttpManagers().counter;
        if (!src || typeof src !== 'object') return def;
        return {
            enabled: !!src.enabled,
            start: src.start !== undefined ? String(src.start) : '1',
            increment: src.increment !== undefined ? String(src.increment) : (src.incr !== undefined ? String(src.incr) : '1'),
            maximum: src.maximum !== undefined ? String(src.maximum) : (src.end !== undefined ? String(src.end) : '999999'),
            format: src.format !== undefined ? String(src.format) : '',
            variable_name: src.variable_name ? String(src.variable_name) : (src.name ? String(src.name) : 'counter'),
            per_user: src.per_user !== false
        };
    }

    function parseTgListenersFromYaml(src) {
        var def = defaultTgListeners();
        if (!src || typeof src !== 'object') return def;
        return {
            view_results_tree: !!src.view_results_tree,
            aggregate_report: !!src.aggregate_report,
            backend_listener: !!src.backend_listener
        };
    }

    function parseCsvDataSetFromYaml(src) {
        var def = defaultHttpManagers().csv_data_set;
        if (!src || typeof src !== 'object') return def;
        return {
            enabled: !!src.enabled,
            filename: src.filename !== undefined ? String(src.filename) : '',
            file_encoding: src.file_encoding ? String(src.file_encoding) : 'UTF-8',
            variable_names: src.variable_names !== undefined ? String(src.variable_names) : '',
            ignore_first_line: !!src.ignore_first_line,
            delimiter: src.delimiter !== undefined ? String(src.delimiter) : ',',
            quoted_data: !!src.quoted_data,
            recycle: src.recycle !== false,
            stop_thread: !!src.stop_thread,
            share_mode: src.share_mode ? String(src.share_mode) : 'shareMode.all',
            file_content: src.file_content !== undefined ? String(src.file_content) : ''
        };
    }

    function parseTgConfigSelectedTypes(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.filter(function (k) {
            return TG_CONFIG_TAB_KEYS.indexOf(k) >= 0;
        });
    }

    function httpManagersToYaml(mgr) {
        if (!mgr) return null;
        var out = {};
        var hd = mgr.http_defaults || {};
        if (hd.enabled !== false) {
            out.http_defaults = { enabled: true };
            if (hd.protocol) out.http_defaults.protocol = hd.protocol;
            if (hd.domain) out.http_defaults.domain = hd.domain;
            if (hd.port) out.http_defaults.port = hd.port;
            if (hd.path) out.http_defaults.path = hd.path;
            if (hd.connect_timeout) out.http_defaults.connect_timeout = hd.connect_timeout;
            if (hd.response_timeout) out.http_defaults.response_timeout = hd.response_timeout;
            if (hd.implementation && hd.implementation !== 'HttpClient4') out.http_defaults.implementation = hd.implementation;
            if (hd.content_encoding) out.http_defaults.content_encoding = hd.content_encoding;
            if (hd.follow_redirects === false) out.http_defaults.follow_redirects = false;
            if (hd.auto_redirects) out.http_defaults.auto_redirects = true;
            if (hd.use_keepalive === false) out.http_defaults.use_keepalive = false;
        } else {
            out.http_defaults = { enabled: false };
        }
        if (mgr.header_manager && mgr.header_manager.enabled) {
            out.header_manager = { enabled: true };
            var hdrs = varsToObj(mgr.header_manager.headers);
            if (Object.keys(hdrs).length) out.header_manager.headers = hdrs;
            if (mgr.header_manager.name) out.header_manager.name = mgr.header_manager.name;
            if (mgr.header_manager.comments) out.header_manager.comments = mgr.header_manager.comments;
        }
        if (mgr.cookie_manager && mgr.cookie_manager.enabled) {
            var cm = mgr.cookie_manager;
            out.cookie_manager = {
                enabled: true,
                clear_each_iteration: cm.clear_each_iteration !== false,
                controlled_by_thread_group: !!cm.controlled_by_thread_group
            };
            var cookies = (cm.cookies || []).filter(function (c) { return c && String(c.name || '').trim(); }).map(function (c) {
                var row = {
                    name: String(c.name).trim(),
                    value: String(c.value || '')
                };
                if (c.domain) row.domain = String(c.domain);
                if (c.path && c.path !== '/') row.path = String(c.path);
                if (c.secure) row.secure = true;
                if (c.expires) row.expires = String(c.expires);
                return row;
            });
            if (cookies.length) out.cookie_manager.cookies = cookies;
        }
        if (mgr.cache_manager && mgr.cache_manager.enabled) {
            out.cache_manager = {
                enabled: true,
                clear_each_iteration: mgr.cache_manager.clear_each_iteration !== false,
                use_expires: mgr.cache_manager.use_expires !== false
            };
        }
        if (mgr.csv_data_set && mgr.csv_data_set.enabled) {
            var csv = mgr.csv_data_set;
            out.csv_data_set = {
                enabled: true,
                filename: String(csv.filename || ''),
                file_encoding: csv.file_encoding ? String(csv.file_encoding) : 'UTF-8',
                variable_names: String(csv.variable_names || ''),
                ignore_first_line: !!csv.ignore_first_line,
                delimiter: csv.delimiter !== undefined ? String(csv.delimiter) : ',',
                quoted_data: !!csv.quoted_data,
                recycle: csv.recycle !== false,
                stop_thread: !!csv.stop_thread,
                share_mode: csv.share_mode ? String(csv.share_mode) : 'shareMode.all'
            };
        }
        if (mgr.counter && mgr.counter.enabled) {
            var ctr = mgr.counter;
            out.counter = {
                enabled: true,
                start: String(ctr.start || '1'),
                increment: String(ctr.increment || '1'),
                maximum: String(ctr.maximum || '999999'),
                format: String(ctr.format || ''),
                variable_name: String(ctr.variable_name || 'counter'),
                per_user: ctr.per_user !== false
            };
        }
        var selTypes = parseTgConfigSelectedTypes(mgr.selected_types);
        if (selTypes.length) out.selected_types = selTypes;
        return Object.keys(out).length ? out : null;
    }

    function resolveBodyTypeForSave(step) {
        var hasUpload = (step.upload_files || []).some(function (f) { return f && String(f.path || '').trim(); }) ||
            (step.multipart_fields || []).some(function (r) { return r && String(r.key || '').trim(); });
        if (hasUpload) return 'multipart';
        if (step.body_content_mode === 'form' || (step.body_params || []).some(function (r) { return r && String(r.key || '').trim(); })) {
            return 'form';
        }
        if ((step.body || '').trim()) return 'json';
        return 'none';
    }

    function defaultPlan(name) {
        return {
            id: uid(),
            name: name || '新测试计划',
            variables: [],
            thread_groups: [defaultThreadGroup('线程组 1')]
        };
    }


    function migrateLegacyPlanListenersToCatalog(m, data) {
        if (!m) return;
        if (!Array.isArray(m.plan_catalog_items)) m.plan_catalog_items = [];
        var hasAlias = function (alias, gui) {
            return m.plan_catalog_items.some(function (it) {
                return it && it.alias === alias && (!gui || it.guiclass === gui);
            });
        };
        var pushLegacy = function (item) {
            if (!item) return;
            if (hasAlias(item.alias, item.guiclass)) return;
            if (!item.id) item.id = 'pcat_' + Math.random().toString(36).slice(2, 10);
            m.plan_catalog_items.push(item);
        };
        var pl = (data && data.plan_listeners) || {};
        if (pl.view_results_tree || (data && data.view_results_tree)) {
            pushLegacy({
                type: 'catalog_element',
                name: (data.view_results_tree && data.view_results_tree.name) || '查看结果树',
                enabled: !(data.view_results_tree && data.view_results_tree.enabled === false),
                alias: 'ResultCollector',
                testclass: 'ResultCollector',
                guiclass: 'ViewResultsFullVisualizer',
                category: 'listener',
                label_zh: '查看结果树',
                container: false,
                scope: 'migrated',
                jmx_fragment: '',
                catalog_props: { comments: '从旧 plan_listeners 迁移' }
            });
        }
        if (pl.aggregate_report || (data && data.aggregate_report)) {
            pushLegacy({
                type: 'catalog_element',
                name: (data.aggregate_report && data.aggregate_report.name) || '聚合报告',
                enabled: !(data.aggregate_report && data.aggregate_report.enabled === false),
                alias: 'ResultCollector',
                testclass: 'ResultCollector',
                guiclass: 'StatVisualizer',
                category: 'listener',
                label_zh: '聚合报告',
                container: false,
                scope: 'migrated',
                jmx_fragment: '',
                catalog_props: { comments: '从旧 plan_listeners 迁移' }
            });
        }
        delete m.plan_listeners;
        delete m.view_results_tree;
        delete m.aggregate_report;
    }

    function defaultModel() {
        return {
            base_url: 'https://api.example.com',
            env: 'staging',
            build: '${BUILD_ID}',
            default_headers: [],
            influxdb: {
                enabled: true,
                url: 'http://127.0.0.1:8086/write?db=jmeter',
                application: 'order-api',
                measurement: 'jmeter',
                tags: { env: 'staging' }
            },
            plan_catalog_items: [],
            test_plans: [defaultPlan('订单创建链路')]
        };
    }


    function normalizeExtractorsFromYaml(st) {
        var list = [];
        if (!st || typeof st !== 'object') return list;
        if (Array.isArray(st.extractors)) {
            st.extractors.forEach(function (ex) {
                if (!ex || !ex.var || !ex.json_path) return;
                list.push({ var: String(ex.var).trim(), json_path: String(ex.json_path).trim() });
            });
        }
        if (!list.length && st.extract && st.extract.var && st.extract.json_path) {
            list.push({ var: String(st.extract.var).trim(), json_path: String(st.extract.json_path).trim() });
        }
        return list;
    }

    function syncStepExtractFields(step) {
        if (!step) return step;
        var list = Array.isArray(step.extractors) ? step.extractors.filter(function (ex) {
            return ex && ex.var && ex.json_path;
        }).map(function (ex) {
            return { var: String(ex.var).trim(), json_path: String(ex.json_path).trim() };
        }) : [];
        if (!list.length) {
            var v = step.extract_var != null ? String(step.extract_var).trim() : '';
            var p = step.extract_json_path != null ? String(step.extract_json_path).trim() : '';
            if (v && p) list.push({ var: v, json_path: p });
        }
        step.extractors = list;
        if (list.length) {
            step.extract_var = list[0].var;
            step.extract_json_path = list[0].json_path;
        } else {
            step.extract_var = '';
            step.extract_json_path = '';
        }
        return step;
    }

    function tgFromYaml(tg, fallbackLoad) {
        var loadSrc = (tg && tg.load) ? tg.load : (fallbackLoad || defaultLoad());
        var out = {
            id: uid(),
            name: (tg && tg.name) ? String(tg.name) : '线程组',
            load: {
                users: loadSrc.users || 50,
                spawn_rate: loadSrc.spawn_rate || 10,
                duration_sec: loadSrc.duration_sec || loadSrc.run_time_sec || 300,
                loops: loadSrc.loops !== undefined ? loadSrc.loops : -1
            },
            influx_scenario: (tg && tg.influxdb && tg.influxdb.tags && tg.influxdb.tags.scenario) ? String(tg.influxdb.tags.scenario) : '',
            variables: objToVars(tg && tg.variables),
            listeners: parseTgListenersFromYaml(tg && tg.listeners),
            backend_listener: (tg && tg.backend_listener && global.JmsBackendListenerCatalog)
                ? global.JmsBackendListenerCatalog.normalizeConfig(tg.backend_listener)
                : undefined,
            view_results_tree: (tg && tg.view_results_tree && typeof tg.view_results_tree === 'object' && global.JmsTgViewResultsTreeCatalog)
                ? global.JmsTgViewResultsTreeCatalog.normalizeConfig(tg.view_results_tree)
                : undefined,
            aggregate_report: (tg && tg.aggregate_report && typeof tg.aggregate_report === 'object' && global.JmsTgAggregateReportCatalog)
                ? global.JmsTgAggregateReportCatalog.normalizeConfig(tg.aggregate_report)
                : undefined,
            http_managers: parseHttpManagersFromYaml(tg),
            config_items: (global.JmsTgConfigCatalog && tg && tg.config_items)
                ? global.JmsTgConfigCatalog.parseItemsFromYaml(tg.config_items)
                : [],
            steps: (tg && Array.isArray(tg.steps) && tg.steps.length) ? stepsFromYamlTree(tg.steps) : [defaultStep()],
            processors: Array.isArray(tg && tg.processors) ? tg.processors : [],
            assertions: global.JmsTgAssertResolver
                ? global.JmsTgAssertResolver.parseAssertionsFromYaml(tg)
                : (Array.isArray(tg && tg.assertions) ? tg.assertions : [])
        };
        if (global.JmsTgAssertResolver &&
            typeof global.JmsTgAssertResolver.sanitizeImportedTgAssertions === 'function') {
            global.JmsTgAssertResolver.sanitizeImportedTgAssertions(out);
        }
        if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.parseFromYaml === 'function') {
            global.JmsTgDisplayOrder.parseFromYaml(tg, out);
        }
        if (tg && (tg.config_timeline_active || tg._config_timeline_active)) {
            out._config_timeline_active = true;
        }
        if (tg && Array.isArray(tg.removed_config_types)) {
            out._removed_config_types = tg.removed_config_types.filter(function (k) {
                return typeof k === 'string' && k;
            });
        } else if (tg && Array.isArray(tg._removed_config_types) && tg._removed_config_types.length) {
            out._removed_config_types = tg._removed_config_types.slice();
        }
        return out;
    }

    function appendTgAssertionsYaml(tgOut, tg) {
        if (!global.JmsTgAssertResolver ||
            typeof global.JmsTgAssertResolver.assertionsToYaml !== 'function') return;
        var assertYaml = global.JmsTgAssertResolver.assertionsToYaml(tg && tg.assertions);
        if (assertYaml) tgOut.assertions = assertYaml;
    }

    function planFromYaml(plan, rootLoad) {
        var p = {
            id: uid(),
            name: plan.name ? String(plan.name) : '测试计划',
            variables: objToVars(plan.variables)
        };
        if (Array.isArray(plan.thread_groups) && plan.thread_groups.length) {
            p.thread_groups = plan.thread_groups.map(function (tg) {
                return tgFromYaml(tg, plan.load || rootLoad);
            });
        } else {
            p.thread_groups = [tgFromYaml({
                name: plan.name || '线程组 1',
                load: plan.load || rootLoad,
                variables: plan.variables,
                influxdb: plan.influxdb,
                steps: plan.steps
            }, rootLoad)];
        }
        return p;
    }

    function yamlToModel(raw) {
        var data;
        try {
            data = jsyaml.load(raw);
        } catch (e) {
            throw new Error('YAML 解析失败：' + (e.message || e));
        }
        if (!data || typeof data !== 'object') throw new Error('根节点必须是对象');

        var m = defaultModel();
        if (data._jmx_import_fidelity) {
            m._jmx_import_fidelity = true;
            m.base_url = '';
            m.influxdb = {
                enabled: false,
                url: '',
                application: '',
                measurement: 'jmeter',
                tags: { env: data.env || m.env }
            };
        } else {
            m.base_url = data.base_url || m.base_url;
            var inf = data.influxdb || {};
            m.influxdb = {
                enabled: inf.enabled !== false,
                url: inf.url || m.influxdb.url,
                application: inf.application || m.influxdb.application,
                measurement: inf.measurement || 'jmeter',
                tags: {
                    env: (inf.tags && inf.tags.env) || data.env || m.env
                }
            };
        }
        m.env = data.env || m.env;
        m.build = data.build !== undefined ? String(data.build) : m.build;
        m.default_headers = objToVars(data.default_headers);

        var rootLoad = data.load || null;
        m.serialize_threadgroups = !!data.serialize_threadgroups;
        m.plan_catalog_items = Array.isArray(data.plan_catalog_items)
            ? stepsFromYamlTree(data.plan_catalog_items)
            : [];
        if (!Object.prototype.hasOwnProperty.call(data, 'plan_catalog_items')) {
            migrateLegacyPlanListenersToCatalog(m, data);
        }
        m.execution_mode = data.execution_mode || 'visual';
        m.raw_jmx = data.raw_jmx || null;
        m.setup_thread_groups = Array.isArray(data.setup_thread_groups)
            ? data.setup_thread_groups.map(function (tg) { return tgFromYaml(tg, rootLoad); })
            : [];
        m.post_thread_groups = Array.isArray(data.post_thread_groups)
            ? data.post_thread_groups.map(function (tg) { return tgFromYaml(tg, rootLoad); })
            : [];
        if (Array.isArray(data.thread_groups) && data.thread_groups.length) {
            m.test_plans = [planFromYaml({
                name: data.name || 'API Scenario',
                variables: data.variables,
                load: data.load,
                influxdb: data.influxdb,
                thread_groups: data.thread_groups
            }, rootLoad)];
        } else if (Array.isArray(data.test_plans) && data.test_plans.length) {
            if (data.test_plans.length > 1) {
                var mergedTgs = [];
                var mergedVars = objToVars(data.variables);
                data.test_plans.forEach(function (plan, pi) {
                    (plan.variables && typeof plan.variables === 'object' ? Object.keys(plan.variables) : []).forEach(function (k) {
                        mergedVars.push({ key: k, value: plan.variables[k] });
                    });
                    if (Array.isArray(plan.thread_groups) && plan.thread_groups.length) {
                        mergedTgs = mergedTgs.concat(plan.thread_groups);
                    } else if (plan.steps && plan.steps.length) {
                        mergedTgs.push({
                            name: plan.name || 'Thread Group',
                            load: plan.load,
                            variables: plan.variables,
                            steps: plan.steps
                        });
                    }
                });
                m.test_plans = [planFromYaml({
                    name: data.name || (data.test_plans[0] && data.test_plans[0].name) || 'API Scenario',
                    variables: mergedVars,
                    load: data.load,
                    influxdb: data.influxdb,
                    thread_groups: mergedTgs
                }, rootLoad)];
            } else {
                m.test_plans = data.test_plans.map(function (plan) {
                    return planFromYaml(plan, rootLoad);
                });
            }
        } else if (data.steps && data.steps.length) {
            m.test_plans = [planFromYaml({
                name: data.name || 'API Scenario',
                variables: data.variables,
                load: data.load,
                influxdb: data.influxdb,
                steps: data.steps
            }, rootLoad)];
        }
        if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.ensureAllPlans === 'function') {
            global.JmsTgDisplayOrder.ensureAllPlans(m);
        }
        if (global.JmsScenarioNormalize && typeof global.JmsScenarioNormalize.normalizeModel === 'function') {
            global.JmsScenarioNormalize.normalizeModel(m, { force: true });
        } else if (global.JmsCatalogUnifyMigrate && typeof global.JmsCatalogUnifyMigrate.migrateModel === 'function') {
            global.JmsCatalogUnifyMigrate.migrateModel(m);
            syncTgListenerCatalogFlagsOnModel(m);
            syncMountCatalogOnModel(m);
        }
        return m;
    }

    function modelToYaml(m) {
        var plan = (m.test_plans && m.test_plans[0]) || defaultPlan('API Scenario');
        var root = {
            base_url: m.base_url,
            name: plan.name,
            env: m.env,
            build: m.build,
            layout: 'scenario',
            execution_mode: m.execution_mode || 'visual',
            serialize_threadgroups: !!m.serialize_threadgroups,
            influxdb: {
                enabled: m.influxdb.enabled !== false,
                url: m.influxdb.url,
                measurement: m.influxdb.measurement || 'jmeter',
                application: m.influxdb.application,
                tags: { env: (m.influxdb.tags && m.influxdb.tags.env) || m.env }
            },
            setup_thread_groups: (m.setup_thread_groups || []).map(function (tg) {
                var Ser = global.JmsCatalogTgYamlSerializer;
                if (Ser && typeof Ser.threadGroupToYaml === 'function') {
                    return Ser.threadGroupToYaml(tg, {
                        varsToObj: varsToObj,
                        stepsToYamlTree: stepsToYamlTree,
                        appendTgAssertionsYaml: appendTgAssertionsYaml
                    });
                }
                return {
                    name: tg.name,
                    load: {
                        users: Number(tg.load.users) || 1,
                        spawn_rate: Number(tg.load.spawn_rate) || 1,
                        duration_sec: Number(tg.load.duration_sec) || 60,
                        loops: tg.load.loops !== undefined ? Number(tg.load.loops) : -1
                    },
                    variables: varsToObj(tg.variables),
                    steps: stepsToYamlTree(tg.steps || [])
                };
            }),
            post_thread_groups: (m.post_thread_groups || []).map(function (tg) {
                var SerPost = global.JmsCatalogTgYamlSerializer;
                if (SerPost && typeof SerPost.threadGroupToYaml === 'function') {
                    return SerPost.threadGroupToYaml(tg, {
                        varsToObj: varsToObj,
                        stepsToYamlTree: stepsToYamlTree,
                        appendTgAssertionsYaml: appendTgAssertionsYaml
                    });
                }
                return {
                    name: tg.name,
                    load: {
                        users: Number(tg.load.users) || 1,
                        spawn_rate: Number(tg.load.spawn_rate) || 1,
                        duration_sec: Number(tg.load.duration_sec) || 60,
                        loops: tg.load.loops !== undefined ? Number(tg.load.loops) : -1
                    },
                    variables: varsToObj(tg.variables),
                    steps: stepsToYamlTree(tg.steps || [])
                };
            }),
            thread_groups: (plan.thread_groups || []).map(function (tg) {
                var SerTg = global.JmsCatalogTgYamlSerializer;
                if (SerTg && typeof SerTg.threadGroupToYaml === 'function') {
                    return SerTg.threadGroupToYaml(tg, {
                        varsToObj: varsToObj,
                        stepsToYamlTree: stepsToYamlTree,
                        appendTgAssertionsYaml: appendTgAssertionsYaml
                    });
                }
                return {
                    name: tg.name,
                    load: {
                        users: Number(tg.load.users) || 1,
                        spawn_rate: Number(tg.load.spawn_rate) || 1,
                        duration_sec: Number(tg.load.duration_sec) || 60,
                        loops: tg.load.loops !== undefined ? Number(tg.load.loops) : -1
                    },
                    variables: varsToObj(tg.variables),
                    steps: stepsToYamlTree(tg.steps || [])
                };
            })
        };
        if (m.plan_catalog_items && m.plan_catalog_items.length) {
            root.plan_catalog_items = stepsToYamlTree(m.plan_catalog_items);
        }
        if (m._jmx_import_fidelity) {
            root._jmx_import_fidelity = true;
            root.base_url = '';
            root.influxdb = {
                enabled: false,
                url: '',
                application: '',
                measurement: 'jmeter',
                tags: { env: (m.influxdb.tags && m.influxdb.tags.env) || m.env }
            };
        }
        var yamlOut = jsyaml.dump(root, { lineWidth: 120, noRefs: true });
        if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.quoteHostPathsInYaml === 'function') {
            yamlOut = global.JmsJmxPathHost.quoteHostPathsInYaml(yamlOut);
        }
        if (global.JmsHttpStepConfigJmx && typeof global.JmsHttpStepConfigJmx.quoteSpecialHttpMethodsInYaml === 'function') {
            yamlOut = global.JmsHttpStepConfigJmx.quoteSpecialHttpMethodsInYaml(yamlOut);
        }
        return yamlOut;
    }


    /* catalog-sid-patch-v5 */
    function sidMatch(a, b) {
        return String(a == null ? '' : a) === String(b == null ? '' : b);
    }

    function findPlan(planId) {
        return (_model.test_plans || []).find(function (p) { return sidMatch(p.id, planId); });
    }

    function findTg(plan, tgId) {
        if (!tgId) return null;
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return sidMatch(t.id, tgId); });
            if (tg) return tg;
        }
        if (_model && Array.isArray(_model.setup_thread_groups)) {
            var setupTg = _model.setup_thread_groups.find(function (t) { return sidMatch(t.id, tgId); });
            if (setupTg) return setupTg;
        }
        if (_model && Array.isArray(_model.post_thread_groups)) {
            return _model.post_thread_groups.find(function (t) { return sidMatch(t.id, tgId); }) || null;
        }
        return null;
    }

    function syncYamlFromModel() {
        if (!_api || !_api.yamlInput || !_model) return;
        if (global.JmsCatalogYamlExportGuard && typeof global.JmsCatalogYamlExportGuard.prepareModel === 'function') {
            global.JmsCatalogYamlExportGuard.prepareModel(_model);
        } else if (global.JmsScenarioNormalize && typeof global.JmsScenarioNormalize.normalizeModel === 'function') {
            global.JmsScenarioNormalize.normalizeModel(_model, { force: false });
        } else if (global.JmsCatalogUnifyMigrate && typeof global.JmsCatalogUnifyMigrate.migrateModel === 'function') {
            global.JmsCatalogUnifyMigrate.migrateModel(_model);
            syncTgListenerCatalogFlagsOnModel(_model);
            syncMountCatalogOnModel(_model);
        }
        _api.yamlInput.value = modelToYaml(_model);
        if (typeof _api.syncPanelsFromYaml === 'function') _api.syncPanelsFromYaml();
    }

    function scheduleRender() {
        if (_renderScheduled) return;
        _renderScheduled = true;
        requestAnimationFrame(function () {
            _renderScheduled = false;
            render();
            syncYamlFromModel();
        });
    }

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function renderKvRows(rows, dataAttr) {
        var html = '';
        (rows || []).forEach(function (row, i) {
            html += '<div class="jms-kv-row" ' + dataAttr + '="' + i + '">' +
                '<input type="text" class="jms-kv-key hf-mono" placeholder="键" value="' + esc(row.key) + '" />' +
                '<input type="text" class="jms-kv-val hf-mono" placeholder="值" value="' + esc(row.value) + '" />' +
                '<button type="button" class="jms-kv-del" title="删除">×</button></div>';
        });
        if (!rows || !rows.length) {
            html += '<p class="jms-empty-hint">暂无项，点击下方添加</p>';
        }
        return html;
    }

    function renderFileRows(files) {
        var html = '';
        (files || []).forEach(function (row, i) {
            html += '<div class="jms-file-row" data-file-index="' + i + '">' +
                '<input type="text" class="jms-file-param hf-mono" placeholder="参数名 file" value="' + esc(row.param) + '" />' +
                '<input type="text" class="jms-file-path hf-mono" placeholder="本地路径 C:\\data\\a.jpg" value="' + esc(row.path) + '" />' +
                '<input type="text" class="jms-file-mime hf-mono" placeholder="MIME 可选" value="' + esc(row.mime) + '" />' +
                '<button type="button" class="jms-file-del" title="删除">×</button></div>';
        });
        if (!files || !files.length) {
            html += '<p class="jms-empty-hint">暂无文件，点击下方添加（填写 JMeter 运行机上的本地路径）</p>';
        }
        return html;
    }

    function readFilesFromList(listEl) {
        var list = [];
        if (!listEl) return list;
        listEl.querySelectorAll('.jms-file-row').forEach(function (row) {
            list.push({
                param: (row.querySelector('.jms-file-param') && row.querySelector('.jms-file-param').value) || '',
                path: (row.querySelector('.jms-file-path') && row.querySelector('.jms-file-path').value) || '',
                mime: (row.querySelector('.jms-file-mime') && row.querySelector('.jms-file-mime').value) || ''
            });
        });
        return list;
    }

    function readBodyContentFromDom() {
        return {
            body: (document.getElementById('step-edit-body') && document.getElementById('step-edit-body').value) || '',
            body_params: readKvFromList(document.getElementById('step-edit-body-params'))
        };
    }

    function hasJsonBodyInDom() {
        return !!readBodyContentFromDom().body.trim();
    }

    function hasFormBodyInDom() {
        return readBodyContentFromDom().body_params.some(function (r) {
            return String(r.key || '').trim() || String(r.value || '').trim();
        });
    }

    function isBodyModeLocked() {
        return hasJsonBodyInDom() || hasFormBodyInDom();
    }

    function getActiveBodyContentMode() {
        var active = document.querySelector('.jms-step-body-mode-btn.is-active');
        return active ? active.getAttribute('data-body-mode') : 'json';
    }

    function setActiveBodyContentMode(mode) {
        document.querySelectorAll('.jms-step-body-mode-btn').forEach(function (btn) {
            var on = btn.getAttribute('data-body-mode') === mode;
            btn.classList.toggle('is-active', on);
        });
        document.getElementById('step-edit-body-json').classList.toggle('hidden', mode !== 'json');
        document.getElementById('step-edit-body-form').classList.toggle('hidden', mode !== 'form');
    }

    function updateStepBodyPanels() {
        var methodEl = document.getElementById('step-edit-method');
        var section = document.getElementById('step-edit-body-section');
        if (!methodEl || !section) return;
        var method = methodEl.value;
        var canBody = ['POST', 'PUT', 'PATCH'].indexOf(method) >= 0;
        section.classList.toggle('hidden', !canBody);
        if (!canBody) return;

        var locked = isBodyModeLocked();
        var hint = document.getElementById('step-edit-body-lock-hint');
        if (hint) hint.classList.toggle('hidden', !locked);

        var activeMode = getActiveBodyContentMode();
        document.querySelectorAll('.jms-step-body-mode-btn').forEach(function (btn) {
            var mode = btn.getAttribute('data-body-mode');
            if (locked) {
                btn.disabled = mode !== activeMode;
            } else {
                btn.disabled = false;
            }
        });
        setActiveBodyContentMode(activeMode);
    }

    function renderAuxStepActions(planId, tgId, stepId, editClass, delClass) {
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="步骤操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost ' + editClass + '" role="menuitem">编辑</button>' +
            '<button type="button" class="jms-btn-ghost ' + delClass + '" role="menuitem">删除</button>' +
            '</div></div>';
    }

    function truncateAuxMeta(text, maxLen) {
        text = String(text || '').trim();
        if (!text) return '';
        if (text.length <= (maxLen || 56)) return text;
        return text.slice(0, maxLen || 56) + '…';
    }

    function ensureStepId(step) {
        if (step && !step.id) step.id = uid();
        return step;
    }

    function renderBeanShellStepCard(step, planId, tgId) {
        step = ensureStepId(step);
        var disabled = step.enabled === false ? ' is-disabled' : '';
        var scriptHint = truncateAuxMeta(step.script, 52);
        var status = step.enabled === false ? '<span class="jms-aux-status">已禁用</span>' : '';
        return '<div class="jms-aux-card jms-aux-card--beanshell' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '" data-step-kind="beanshell_post">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">{;}</span>' +
            '<div class="jms-aux-card__content">' +
            '<div class="jms-aux-card__row"><span class="jms-aux-type">BeanShell PostProcessor</span>' + status + '</div>' +
            '<span class="jms-aux-name">' + esc(step.name || 'BeanShell 后置处理器') + '</span>' +
            (scriptHint ? '<code class="jms-aux-meta hf-mono" title="脚本预览">' + esc(scriptHint) + '</code>' : '') +
            '</div>' +
            renderAuxStepActions(planId, tgId, step.id, 'jms-btn-edit-beanshell', 'jms-btn-del-aux-step') +
            '</div>';
    }

    function renderDebugStepCard(step, planId, tgId) {
        step = ensureStepId(step);
        var disabled = step.enabled === false ? ' is-disabled' : '';
        var status = step.enabled === false ? '<span class="jms-aux-status">已禁用</span>' : '';
        var meta = step.display_jmeter_variables !== false ? '显示 JMeter 变量' : '调试采样';
        if (step.comments) meta = truncateAuxMeta(step.comments, 40);
        return '<div class="jms-aux-card jms-aux-card--debug' + disabled + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-step-id="' + esc(step.id) + '" data-step-kind="debug_sampler">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">?</span>' +
            '<div class="jms-aux-card__content">' +
            '<div class="jms-aux-card__row"><span class="jms-aux-type">Debug Sampler</span>' + status + '</div>' +
            '<span class="jms-aux-name">' + esc(step.name || 'Debug Sampler') + '</span>' +
            '<span class="jms-aux-meta">' + esc(meta) + '</span>' +
            '</div>' +
            renderAuxStepActions(planId, tgId, step.id, 'jms-btn-edit-debug', 'jms-btn-del-aux-step') +
            '</div>';
    }

    function renderStepCard(step, planId, tgId) {
        if (!step) return '';
        if (step.type === 'catalog_element') {
            var _catRender = (global.JmsTgCatalogElementPlanV2 && global.JmsTgCatalogElementPlanV2.renderPlanCard)
                || (global.JmsTgCatalogElementPlan && global.JmsTgCatalogElementPlan.renderPlanCard);
            if (typeof _catRender === 'function') {
                return _catRender(step, planId, tgId, function (child) {
                    return renderStepCard(child, planId, tgId);
                });
            }
        }
        return '';
    }

    function tgLoadSummary(tg) {
        var l = tg.load || {};
        var sc = tg.influx_scenario ? (' · scenario=' + tg.influx_scenario) : '';
        return (l.users || 0) + ' 用户 · 爬升 ' + (l.spawn_rate || 0) + 's · ' + (l.duration_sec || 0) + 's · loops ' + (l.loops !== undefined ? l.loops : -1) + sc;
    }

    function renderCookieRows(cookies) {
        var html = '';
        (cookies || []).forEach(function (row, i) {
            html += '<div class="jms-cookie-row" data-cookie-index="' + i + '">' +
                '<input type="text" class="jms-cookie-name hf-mono" placeholder="名称" value="' + esc(row.name) + '" />' +
                '<input type="text" class="jms-cookie-value hf-mono" placeholder="值" value="' + esc(row.value) + '" />' +
                '<input type="text" class="jms-cookie-domain hf-mono" placeholder="域" value="' + esc(row.domain) + '" />' +
                '<input type="text" class="jms-cookie-path hf-mono" placeholder="路径" value="' + esc(row.path) + '" />' +
                '<label class="jms-cookie-secure-lbl" title="Secure"><input type="checkbox" class="jms-cookie-secure"' + (row.secure ? ' checked' : '') + ' /> S</label>' +
                '<button type="button" class="jms-cookie-del" title="删除">×</button></div>';
        });
        if (!cookies || !cookies.length) {
            html += '<p class="jms-empty-hint">暂无 Cookie，点击下方添加</p>';
        }
        return html;
    }

    function readCookiesFromList(listEl) {
        var list = [];
        if (!listEl) return list;
        listEl.querySelectorAll('.jms-cookie-row').forEach(function (row) {
            list.push({
                name: (row.querySelector('.jms-cookie-name') && row.querySelector('.jms-cookie-name').value) || '',
                value: (row.querySelector('.jms-cookie-value') && row.querySelector('.jms-cookie-value').value) || '',
                domain: (row.querySelector('.jms-cookie-domain') && row.querySelector('.jms-cookie-domain').value) || '',
                path: (row.querySelector('.jms-cookie-path') && row.querySelector('.jms-cookie-path').value) || '/',
                secure: !!(row.querySelector('.jms-cookie-secure') && row.querySelector('.jms-cookie-secure').checked),
                expires: ''
            });
        });
        return list;
    }

    var _tgMgrTarget = null;
    var _tgConfigPickerOutsideBound = false;

    var TG_CONFIG_TAB_LABELS = {
        http_defaults: 'HTTP 请求默认值',
        header_manager: 'HTTP 请求头管理器',
        cookie_manager: 'HTTP Cookie 管理器',
        cache_manager: 'HTTP 缓存管理器',
        csv_data_set: 'CSV 数据文件设置',
        counter: '计数器'
    };

    function tgConfigTypeActive(mgr, typeKey) {
        mgr = mgr || defaultHttpManagers();
        var sel = parseTgConfigSelectedTypes(mgr.selected_types);
        if (sel.length) return sel.indexOf(typeKey) >= 0;
        if (typeKey === 'http_defaults') return mgr.http_defaults.enabled !== false;
        return !!(mgr[typeKey] && mgr[typeKey].enabled);
    }

    function tgAnyMgrEnabled(mgr) {
        mgr = mgr || defaultHttpManagers();
        var sel = parseTgConfigSelectedTypes(mgr.selected_types);
        if (sel.length) return true;
        return mgr.http_defaults.enabled !== false ||
            !!mgr.header_manager.enabled ||
            !!mgr.cookie_manager.enabled ||
            !!mgr.cache_manager.enabled ||
            !!(mgr.csv_data_set && mgr.csv_data_set.enabled) ||
            !!(mgr.counter && mgr.counter.enabled);
    }

    function resolveTgListenerFlags(tg) {
        var B = global.JmsTgListenerCatalogBridge;
        if (B && typeof B.getListenerFlags === 'function') return B.getListenerFlags(tg);
        return tg.listeners || defaultTgListeners();
    }

    function syncMountCatalogOnModel(model) {
        var MB = global.JmsMountCatalogBridge;
        if (MB && typeof MB.migrateModelMountHosts === 'function') MB.migrateModelMountHosts(model);
    }

    function syncTgListenerCatalogFlagsOnModel(model) {
        var B = global.JmsTgListenerCatalogBridge;
        if (B && typeof B.syncAllThreadGroups === 'function') B.syncAllThreadGroups(model);
    }

    function renderTgListenerBtns(tg, planId) {
        var ls = resolveTgListenerFlags(tg);
        return '<div class="jms-tg-listeners lth-tg-listeners" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">' +
            '<button type="button" class="jms-tg-listener-btn' + (ls.view_results_tree ? ' is-on' : '') + '" data-listener="view_results_tree">查看结果树</button>' +
            '<button type="button" class="jms-tg-listener-btn' + (ls.aggregate_report ? ' is-on' : '') + '" data-listener="aggregate_report">聚合报告</button>' +
            '<button type="button" class="jms-tg-listener-btn' + (ls.backend_listener ? ' is-on' : '') + '" data-listener="backend_listener">后端监听器</button>' +
            '</div>';
    }

    function renderTgConfigBtn(tg, planId) {
        var mgr = tg.http_managers || defaultHttpManagers();
        var on = tgAnyMgrEnabled(mgr);
        return '<div class="jms-tg-managers">' +
            '<button type="button" class="jms-tg-config-btn' + (on ? ' is-on' : '') + '"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">配置元件</button>' +
            '</div>';
    }

    function getTgConfigSelectedTypes() {
        if (!_tgMgrTarget || !Array.isArray(_tgMgrTarget.selectedTypes)) return [];
        return _tgMgrTarget.selectedTypes.slice();
    }

    function sortTgConfigSelectedTypes(list) {
        return list.slice().sort(function (a, b) {
            return TG_CONFIG_TAB_KEYS.indexOf(a) - TG_CONFIG_TAB_KEYS.indexOf(b);
        });
    }

    function updateTgConfigPickerLabelMulti(selected) {
        var label = document.getElementById('tg-config-picker-label');
        if (!label) return;
        if (!selected.length) {
            label.textContent = '请选择配置元件';
            return;
        }
        if (selected.length === 1) {
            label.textContent = TG_CONFIG_TAB_LABELS[selected[0]] || selected[0];
            return;
        }
        label.textContent = '已选 ' + selected.length + ' 项';
    }

    function syncTgConfigPickerOptionsMulti(selected) {
        document.querySelectorAll('.jms-tg-config-picker__option').forEach(function (opt) {
            var key = opt.getAttribute('data-tab');
            var on = selected.indexOf(key) >= 0;
            opt.classList.toggle('is-selected', on);
            opt.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    }

    function openTgConfigPickerMenu() {
        var menu = document.getElementById('tg-config-picker-menu');
        var trigger = document.getElementById('tg-config-picker-trigger');
        if (menu) menu.classList.remove('hidden');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        bindTgConfigPickerOutsideClick();
    }

    function closeTgConfigPickerMenu() {
        var menu = document.getElementById('tg-config-picker-menu');
        var trigger = document.getElementById('tg-config-picker-trigger');
        if (menu) menu.classList.add('hidden');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        unbindTgConfigPickerOutsideClick();
    }

    function toggleTgConfigPickerMenu() {
        var menu = document.getElementById('tg-config-picker-menu');
        if (menu && menu.classList.contains('hidden')) openTgConfigPickerMenu();
        else closeTgConfigPickerMenu();
    }

    function bindTgConfigPickerOutsideClick() {
        if (_tgConfigPickerOutsideBound) return;
        _tgConfigPickerOutsideBound = true;
        setTimeout(function () {
            document.addEventListener('click', onTgConfigPickerOutsideClick, true);
        }, 0);
    }

    function unbindTgConfigPickerOutsideClick() {
        if (!_tgConfigPickerOutsideBound) return;
        _tgConfigPickerOutsideBound = false;
        document.removeEventListener('click', onTgConfigPickerOutsideClick, true);
    }

    function onTgConfigPickerOutsideClick(ev) {
        var picker = document.getElementById('tg-config-picker');
        if (!picker || picker.contains(ev.target)) return;
        closeTgConfigPickerMenu();
    }

    function renderTgConfigTabButtons(selected) {
        var container = document.getElementById('tg-config-tabs');
        if (!container) return;
        container.innerHTML = selected.map(function (key) {
            return '<button type="button" class="jms-tg-config-tab-btn" data-tab="' + esc(key) + '" role="tab">' +
                esc(TG_CONFIG_TAB_LABELS[key] || key) + '</button>';
        }).join('');
    }

    function resetTgConfigPickerUi() {
        closeTgConfigPickerMenu();
        if (_tgMgrTarget) {
            _tgMgrTarget.selectedTypes = [];
            _tgMgrTarget.tabKey = null;
        }
        updateTgConfigPickerLabelMulti([]);
        syncTgConfigPickerOptionsMulti([]);
        var wrap = document.getElementById('tg-config-tabs-wrap');
        var hint = document.getElementById('tg-config-pick-hint');
        var tabs = document.getElementById('tg-config-tabs');
        if (wrap) wrap.classList.add('hidden');
        if (hint) hint.classList.remove('hidden');
        if (tabs) tabs.innerHTML = '';
        document.querySelectorAll('.jms-tg-mgr-panel').forEach(function (p) {
            p.classList.add('hidden');
        });
    }

    function toggleTgConfigTypeFromDropdown(tabKey) {
        if (!_tgMgrTarget || !tabKey) return;
        if (!_tgMgrTarget.selectedTypes) _tgMgrTarget.selectedTypes = [];
        var list = _tgMgrTarget.selectedTypes;
        var idx = list.indexOf(tabKey);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(tabKey);
        _tgMgrTarget.selectedTypes = sortTgConfigSelectedTypes(list);
        applyTgConfigSelectionUi();
    }

    function applyTgConfigSelectionUi() {
        var selected = getTgConfigSelectedTypes();
        updateTgConfigPickerLabelMulti(selected);
        syncTgConfigPickerOptionsMulti(selected);

        var wrap = document.getElementById('tg-config-tabs-wrap');
        var hint = document.getElementById('tg-config-pick-hint');
        if (!selected.length) {
            if (wrap) wrap.classList.add('hidden');
            if (hint) hint.classList.remove('hidden');
            document.querySelectorAll('.jms-tg-mgr-panel').forEach(function (p) {
                p.classList.add('hidden');
            });
            if (_tgMgrTarget) _tgMgrTarget.tabKey = null;
            return;
        }

        if (wrap) wrap.classList.remove('hidden');
        if (hint) hint.classList.add('hidden');
        renderTgConfigTabButtons(selected);

        var plan = _tgMgrTarget && findPlan(_tgMgrTarget.planId);
        var tg = plan && findTg(plan, _tgMgrTarget.tgId);
        if (tg) updateTgConfigTabDots(tg.http_managers || defaultHttpManagers());

        var tabKey = _tgMgrTarget && _tgMgrTarget.tabKey;
        if (!tabKey || selected.indexOf(tabKey) < 0) tabKey = selected[0];
        setTgConfigTab(tabKey);
    }

    function setTgConfigTab(tabKey) {
        if (!tabKey) return;
        var selected = getTgConfigSelectedTypes();
        if (selected.length && selected.indexOf(tabKey) < 0) return;

        document.querySelectorAll('.jms-tg-config-tab-btn').forEach(function (btn) {
            btn.classList.toggle('is-active', btn.getAttribute('data-tab') === tabKey);
        });
        document.querySelectorAll('.jms-tg-mgr-panel').forEach(function (p) {
            p.classList.toggle('hidden', p.getAttribute('data-mgr-panel') !== tabKey);
        });
        if (_tgMgrTarget) _tgMgrTarget.tabKey = tabKey;
    }

    function updateTgConfigTabDots(mgr) {
        mgr = mgr || defaultHttpManagers();
        var sel = _tgMgrTarget ? getTgConfigSelectedTypes() : parseTgConfigSelectedTypes(mgr.selected_types);
        document.querySelectorAll('.jms-tg-config-tab-btn').forEach(function (btn) {
            var key = btn.getAttribute('data-tab');
            var on = sel.length ? sel.indexOf(key) >= 0 : tgConfigTypeActive(mgr, key);
            btn.classList.toggle('has-enabled', on);
        });
    }

    function populateTgMgrPanels(tg) {
        var mgr = tg.http_managers || defaultHttpManagers();
        var hd = mgr.http_defaults || {};
        document.getElementById('tg-hd-protocol').value = hd.protocol || '';
        document.getElementById('tg-hd-domain').value = hd.domain || '';
        document.getElementById('tg-hd-port').value = hd.port || '';
        document.getElementById('tg-hd-path').value = hd.path || '';
        document.getElementById('tg-hd-connect-timeout').value = hd.connect_timeout || '';
        document.getElementById('tg-hd-response-timeout').value = hd.response_timeout || '';
        document.getElementById('tg-hd-implementation').value = hd.implementation || 'HttpClient4';
        document.getElementById('tg-hd-content-encoding').value = hd.content_encoding || '';
        var fr = document.getElementById('tg-hd-follow-redirects');
        if (fr) fr.checked = hd.follow_redirects !== false;
        var ar = document.getElementById('tg-hd-auto-redirects');
        if (ar) ar.checked = !!hd.auto_redirects;
        var ka = document.getElementById('tg-hd-use-keepalive');
        if (ka) ka.checked = hd.use_keepalive !== false;
        var hint = document.getElementById('tg-hd-scene-hint');
        if (hint) hint.textContent = '留空协议/服务器名称/端口时使用场景 base_url：' + (_model.base_url || '');

        var hmNameEl = document.getElementById('tg-hm-name');
        if (hmNameEl) hmNameEl.value = (mgr.header_manager && mgr.header_manager.name) ? mgr.header_manager.name : '';
        var hmCommentsEl = document.getElementById('tg-hm-comments');
        if (hmCommentsEl) hmCommentsEl.value = (mgr.header_manager && mgr.header_manager.comments) ? mgr.header_manager.comments : '';
        document.getElementById('tg-hm-headers').innerHTML = renderKvRows(mgr.header_manager.headers);

        var cm = mgr.cookie_manager || {};
        document.getElementById('tg-cm-clear').checked = cm.clear_each_iteration !== false;
        document.getElementById('tg-cm-controlled').checked = !!cm.controlled_by_thread_group;
        document.getElementById('tg-cm-cookies').innerHTML = renderCookieRows(cm.cookies);

        var cache = mgr.cache_manager || {};
        document.getElementById('tg-cache-clear').checked = cache.clear_each_iteration !== false;
        document.getElementById('tg-cache-expires').checked = cache.use_expires !== false;

        var csv = mgr.csv_data_set || defaultHttpManagers().csv_data_set;
        document.getElementById('tg-csv-filename').value = csv.filename || '';
        document.getElementById('tg-csv-variable-names').value = csv.variable_names || '';
        document.getElementById('tg-csv-file-encoding').value = csv.file_encoding || 'UTF-8';
        document.getElementById('tg-csv-delimiter').value = csv.delimiter !== undefined ? csv.delimiter : ',';
        document.getElementById('tg-csv-share-mode').value = csv.share_mode || 'shareMode.all';
        var csvIgnore = document.getElementById('tg-csv-ignore-first-line');
        if (csvIgnore) csvIgnore.checked = !!csv.ignore_first_line;
        var csvQuoted = document.getElementById('tg-csv-quoted-data');
        if (csvQuoted) csvQuoted.checked = !!csv.quoted_data;
        var csvRecycle = document.getElementById('tg-csv-recycle');
        if (csvRecycle) csvRecycle.checked = csv.recycle !== false;
        var csvStop = document.getElementById('tg-csv-stop-thread');
        if (csvStop) csvStop.checked = !!csv.stop_thread;
        if (global.JmsTgCsvDataSetUi && typeof global.JmsTgCsvDataSetUi.setLegacyMgrCsvHint === 'function') {
            global.JmsTgCsvDataSetUi.setLegacyMgrCsvHint(
                global.JmsTgCsvDataSetUi.legacyMgrCsvHintForData(csv)
            );
        }

        var ctr = mgr.counter || defaultHttpManagers().counter;
        document.getElementById('tg-counter-var').value = ctr.variable_name || 'counter';
        document.getElementById('tg-counter-start').value = ctr.start || '1';
        document.getElementById('tg-counter-incr').value = ctr.increment || '1';
        document.getElementById('tg-counter-max').value = ctr.maximum || '999999';
        document.getElementById('tg-counter-format').value = ctr.format || '';
        var ctrPer = document.getElementById('tg-counter-per-user');
        if (ctrPer) ctrPer.checked = ctr.per_user !== false;

        updateTgConfigTabDots(mgr);
    }

    function openTgConfigModal(planId, tgId) {
        readModelFromDom();
        var plan = findPlan(planId);
        var tg = plan && findTg(plan, tgId);
        if (!tg) return;
        if (!tg.http_managers) tg.http_managers = defaultHttpManagers();
        _tgMgrTarget = {
            planId: planId,
            tgId: tgId,
            tabKey: null,
            selectedTypes: parseTgConfigSelectedTypes((tg.http_managers || {}).selected_types)
        };

        var modal = document.getElementById('modal-tg-http-mgr');
        if (!modal) return;
        var titleEl = document.getElementById('modal-tg-http-mgr-title');
        if (titleEl) titleEl.textContent = '配置元件 · ' + (tg.name || '线程组');
        var subEl = document.getElementById('modal-tg-http-mgr-sub');
        if (subEl) subEl.textContent = 'HTTP 默认值、请求头、Cookie、缓存、CSV、计数器（对应 JMeter 配置元件）';

        closeTgConfigPickerMenu();
        populateTgMgrPanels(tg);
        applyTgConfigSelectionUi();

        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeTgMgrModal() {
        var modal = document.getElementById('modal-tg-http-mgr');
        if (!modal) return;
        resetTgConfigPickerUi();
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        _tgMgrTarget = null;
    }

    function saveTgMgrModal() {
        if (!_tgMgrTarget) return;
        readModelFromDom();
        var plan = findPlan(_tgMgrTarget.planId);
        var tg = plan && findTg(plan, _tgMgrTarget.tgId);
        if (!tg) return;
        if (!tg.http_managers) tg.http_managers = defaultHttpManagers();

        var selected = getTgConfigSelectedTypes();
        tg.http_managers.http_defaults = {
            enabled: selected.indexOf('http_defaults') >= 0,
            protocol: document.getElementById('tg-hd-protocol').value.trim(),
            domain: document.getElementById('tg-hd-domain').value.trim(),
            port: document.getElementById('tg-hd-port').value.trim(),
            path: document.getElementById('tg-hd-path').value.trim(),
            connect_timeout: document.getElementById('tg-hd-connect-timeout').value.trim(),
            response_timeout: document.getElementById('tg-hd-response-timeout').value.trim(),
            implementation: document.getElementById('tg-hd-implementation').value.trim() || 'HttpClient4',
            content_encoding: document.getElementById('tg-hd-content-encoding').value.trim(),
            follow_redirects: !!(document.getElementById('tg-hd-follow-redirects') && document.getElementById('tg-hd-follow-redirects').checked),
            auto_redirects: !!(document.getElementById('tg-hd-auto-redirects') && document.getElementById('tg-hd-auto-redirects').checked),
            use_keepalive: !!(document.getElementById('tg-hd-use-keepalive') && document.getElementById('tg-hd-use-keepalive').checked)
        };
        tg.http_managers.header_manager = {
            enabled: selected.indexOf('header_manager') >= 0,
            headers: readKvFromList(document.getElementById('tg-hm-headers')),
            name: (document.getElementById('tg-hm-name') && document.getElementById('tg-hm-name').value.trim()) || '',
            comments: (document.getElementById('tg-hm-comments') && document.getElementById('tg-hm-comments').value) || ''
        };
        tg.http_managers.cookie_manager = {
            enabled: selected.indexOf('cookie_manager') >= 0,
            clear_each_iteration: !!(document.getElementById('tg-cm-clear') && document.getElementById('tg-cm-clear').checked),
            controlled_by_thread_group: !!(document.getElementById('tg-cm-controlled') && document.getElementById('tg-cm-controlled').checked),
            cookies: readCookiesFromList(document.getElementById('tg-cm-cookies'))
        };
        tg.http_managers.cache_manager = {
            enabled: selected.indexOf('cache_manager') >= 0,
            clear_each_iteration: !!(document.getElementById('tg-cache-clear') && document.getElementById('tg-cache-clear').checked),
            use_expires: !!(document.getElementById('tg-cache-expires') && document.getElementById('tg-cache-expires').checked)
        };
        var prevCsv = tg.http_managers.csv_data_set || defaultHttpManagers().csv_data_set;
        tg.http_managers.csv_data_set = {
            enabled: selected.indexOf('csv_data_set') >= 0,
            filename: document.getElementById('tg-csv-filename').value.trim(),
            variable_names: document.getElementById('tg-csv-variable-names').value.trim(),
            file_encoding: document.getElementById('tg-csv-file-encoding').value.trim() || 'UTF-8',
            delimiter: document.getElementById('tg-csv-delimiter').value || ',',
            share_mode: document.getElementById('tg-csv-share-mode').value || 'shareMode.all',
            ignore_first_line: !!(document.getElementById('tg-csv-ignore-first-line') && document.getElementById('tg-csv-ignore-first-line').checked),
            quoted_data: !!(document.getElementById('tg-csv-quoted-data') && document.getElementById('tg-csv-quoted-data').checked),
            recycle: !!(document.getElementById('tg-csv-recycle') && document.getElementById('tg-csv-recycle').checked),
            stop_thread: !!(document.getElementById('tg-csv-stop-thread') && document.getElementById('tg-csv-stop-thread').checked),
            file_content: prevCsv.file_content || ''
        };
        var prevCtr = tg.http_managers.counter || defaultHttpManagers().counter;
        tg.http_managers.counter = {
            enabled: selected.indexOf('counter') >= 0,
            start: document.getElementById('tg-counter-start').value.trim() || '1',
            increment: document.getElementById('tg-counter-incr').value.trim() || '1',
            maximum: document.getElementById('tg-counter-max').value.trim() || '999999',
            format: document.getElementById('tg-counter-format').value.trim(),
            variable_name: document.getElementById('tg-counter-var').value.trim() || 'counter',
            per_user: !!(document.getElementById('tg-counter-per-user') && document.getElementById('tg-counter-per-user').checked)
        };
        tg.http_managers.selected_types = selected;
        closeTgMgrModal();
        notifyUserEdit();
        scheduleRender();
        if (_api && _api.showMsg) _api.showMsg('已保存配置元件。', true);
    }

    function handleStepEditModalClick(ev) {
        var t = ev.target;
        if (t.classList.contains('jms-kv-del')) {
            var row = t.closest('.jms-kv-row');
            if (row) {
                var list = row.parentElement;
                row.remove();
                if (list && !list.querySelector('.jms-kv-row') && list.querySelector('.jms-empty-hint') === null) {
                    var emptyHint = '<p class="jms-empty-hint">暂无项，点击下方添加</p>';
                    list.innerHTML = emptyHint;
                }
                updateStepBodyPanels();
            }
            ev.preventDefault();
            ev.stopPropagation();
            return;
        }
        if (t.classList.contains('jms-file-del')) {
            var fileRow = t.closest('.jms-file-row');
            if (fileRow) {
                var flist = fileRow.parentElement;
                fileRow.remove();
                if (flist && !flist.querySelector('.jms-file-row')) {
                    flist.innerHTML = '<p class="jms-empty-hint">暂无文件，点击下方添加（填写 JMeter 运行机上的本地路径）</p>';
                }
            }
            ev.preventDefault();
            ev.stopPropagation();
        }
    }

    function renderThreadGroup(tg, planId) {
        function countBeanShellInSteps(list) {
            var n = 0;
            (list || []).forEach(function (s) {
                if (!s) return;
                if (isBeanShellStep(s)) n += 1;
                if (isIfStep(s)) n += countBeanShellInSteps(s.children);
            });
            return n;
        }
        var bsTotal = countBeanShellInSteps(tg.steps) + ((tg.processors && tg.processors.length) || 0);
        var procBadge = bsTotal
            ? '<span class="jms-plan-var-badge">' + bsTotal + ' 个 BeanShell</span>' : '';
        var stepsHtml = (tg.steps || []).map(function (s) {
            return renderStepCard(s, planId, tg.id);
        }).join('');
        if (!stepsHtml) stepsHtml = '<p class="jms-empty-hint">暂无线程步骤，点击下方添加 HTTP 请求</p>';
        if (!tg.http_managers) tg.http_managers = defaultHttpManagers();

        return '<div class="jms-tg-block" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">' +
            '<div class="jms-tg-head">' +
            '<span class="jms-tg-icon">⚙</span>' +
            '<input type="text" class="jms-tg-name" value="' + esc(tg.name) + '" placeholder="线程组名称" />' +
            '<span class="jms-tg-load-badge">' + esc(tgLoadSummary(tg)) + '</span>' + procBadge +
            '<button type="button" class="jms-btn-ghost jms-btn-del-tg">删除</button>' +
            '</div>' +
            '<div class="jms-tg-tools">' +
            renderTgConfigBtn(tg, planId) +
            renderTgListenerBtns(tg, planId) +
            '</div>' +
            '<div class="jms-tg-steps">' + stepsHtml + '</div>' +
            '<div class="jms-tg-add-row lth-tg-add-row">' +
            '<button type="button" class="jms-add-chip jms-btn-add-http" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">+ HTTP 请求</button>' +
            '<div class="lth-tg-add-more">' +
            '<button type="button" class="lth-tg-add-more-btn" aria-label="更多导入方式">⋯</button>' +
            '<div class="lth-tg-add-more-menu">' +
            (global.JmsAuxStepAdd && typeof global.JmsAuxStepAdd.renderMenuButtons === 'function'
                ? global.JmsAuxStepAdd.renderMenuButtons(planId, tg.id)
                : '') +
            '</div></div></div></div>';
    }

    function countPlanVariables(plan) {
        if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.countResolvedVariableKeys === 'function') {
            return global.JmsPlanCatalogResolve.countResolvedVariableKeys(_model);
        }
        return (plan.variables || []).filter(function (v) { return String(v.key || '').trim(); }).length;
    }

    function countPlanHeaders() {
        if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.countResolvedHeaderKeys === 'function') {
            return global.JmsPlanCatalogResolve.countResolvedHeaderKeys(_model);
        }
        return (_model.default_headers || []).filter(function (h) { return String(h.key || '').trim(); }).length;
    }


    function isStudioV2MergedHead() {
        return !!(document.body && document.body.classList.contains('lth-studio-v2')
            && document.getElementById('jms-studio-plan-toolbar'));
    }

    function renderStudioPlanHeadControls(plan) {
        var toolbar = document.getElementById('jms-studio-plan-toolbar');
        if (!toolbar || !plan) return;
        var varCount = countPlanVariables(plan);
        var headerCount = countPlanHeaders();
        var tgCount = (plan.thread_groups || []).length + ((_model.setup_thread_groups || []).length) + ((_model.post_thread_groups || []).length);
        toolbar.innerHTML =
            '<input type="text" class="jms-plan-name jms-studio-plan-name jms-plan-name--sync" value="' + esc(plan.name) + '" data-plan-id="' + esc(plan.id) + '" tabindex="-1" aria-hidden="true" />' +
            '<button type="button" class="jms-btn-add-tg jms-btn-add-tg--sync" data-plan-id="' + esc(plan.id) + '" tabindex="-1" aria-hidden="true"></button>';
        toolbar.setAttribute('data-plan-id', plan.id);
    }

    function renderStudioPlanToolbar() {
        if (!isStudioV2MergedHead()) return;
        var plans = _model.test_plans || [];
        if (!plans.length) return;
        var plan = findPlan(_selected.planId) || plans[0];
        renderStudioPlanHeadControls(plan);
    }

    function renderPlanTgsHtml(plan) {
        if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.collectInDisplayOrder === 'function') {
            return global.JmsTgDisplayOrder.collectInDisplayOrder(_model, plan.id).map(function (item) {
                var tg = item.tg;
                if (item.kind === 'setup') {
                    return renderThreadGroup(Object.assign({}, tg, { name: '[Setup] ' + stripSetupDisplayPrefix(tg.name) }), plan.id);
                }
                if (item.kind === 'post') {
                    return renderThreadGroup(Object.assign({}, tg, { name: '[Post] ' + stripPostDisplayPrefix(tg.name) }), plan.id);
                }
                return renderThreadGroup(tg, plan.id);
            }).join('');
        }
        var setupHtml = (_model.setup_thread_groups || []).map(function (tg) {
            return renderThreadGroup(Object.assign({}, tg, { name: '[Setup] ' + stripSetupDisplayPrefix(tg.name) }), plan.id);
        }).join('');
        var postHtml = (_model.post_thread_groups || []).map(function (tg) {
            return renderThreadGroup(Object.assign({}, tg, { name: '[Post] ' + stripPostDisplayPrefix(tg.name) }), plan.id);
        }).join('');
        return setupHtml + (plan.thread_groups || []).map(function (tg) {
            return renderThreadGroup(tg, plan.id);
        }).join('') + postHtml;
    }

    function renderPlan(plan) {
        var tgsHtml = renderPlanTgsHtml(plan);
        var varCount = countPlanVariables(plan);
        var tgCount = (plan.thread_groups || []).length + ((_model.setup_thread_groups || []).length) + ((_model.post_thread_groups || []).length);

        var planHeadHtml = isStudioV2MergedHead() ? '' :
            ('<header class="jms-plan-head">' +
            '<span class="jms-plan-num">测试计划</span>' +
            '<input type="text" class="jms-plan-name" value="' + esc(plan.name) + '" placeholder="测试计划名称" />' +
            '<div class="jms-plan-head-center">' +
            '<button type="button" class="jms-add-chip jms-btn-add-tg" data-plan-id="' + esc(plan.id) + '">+ 线程组</button>' +
            '</div>' +
            '<div class="jms-plan-meta">' +
            '<span class="jms-plan-var-badge">' + varCount + ' 个公共变量</span>' +
            '<span class="jms-plan-var-badge">' + countPlanHeaders() + ' 个公共请求头</span>' +
            '<span class="jms-plan-var-badge">' + tgCount + ' 个线程组</span>' +
            '</div>' +
            '</header>');
        var planCatalogHtml = '';
        if (global.JmsPlanCatalogItemsUi && typeof global.JmsPlanCatalogItemsUi.renderSection === 'function') {
            planCatalogHtml = global.JmsPlanCatalogItemsUi.renderSection(plan.id, _model.plan_catalog_items || []);
        }
        return '<article class="jms-plan-card' + (_selected.planId === plan.id ? ' is-selected' : '') + '" data-plan-id="' + esc(plan.id) + '">' +
            planHeadHtml +
            planCatalogHtml +
            '<div class="jms-plan-tgs">' + tgsHtml + '</div>' +
            '</article>';
    }

    function render() {
        var root = document.getElementById('jms-visual-root');
        if (!root || !_model) return;
        if (global.JmsScenarioNormalize && typeof global.JmsScenarioNormalize.normalizeModel === 'function') {
            global.JmsScenarioNormalize.normalizeModel(_model, { force: false });
        } else if (global.JmsCatalogUnifyMigrate && typeof global.JmsCatalogUnifyMigrate.migrateModel === 'function') {
            global.JmsCatalogUnifyMigrate.migrateModel(_model);
            syncTgListenerCatalogFlagsOnModel(_model);
            syncMountCatalogOnModel(_model);
        }

        var container = document.getElementById('jms-plans-container');
        if (!container) return;
        var treeView = document.body.classList.contains('lth-tg-view-tree');
        var SP = global.JmsTgTreeScrollPreserve;
        var scrollSnap = (treeView && SP && SP.captureAll) ? SP.captureAll() : null;
        container.classList.remove('jms-plans-container--scroll');
        container.innerHTML = (_model.test_plans || []).map(renderPlan).join('');
        renderStudioPlanToolbar();
        if (global.JmsPlanCatalogItemsUi && typeof global.JmsPlanCatalogItemsUi.syncNavPlanId === 'function') {
            var activePlan = findPlan(_selected.planId) || ((_model.test_plans || [])[0]);
            if (activePlan) global.JmsPlanCatalogItemsUi.syncNavPlanId(activePlan.id);
        }
        if (global.JmsTgTreeShell && treeView) {
            global.JmsTgTreeShell.syncAll(true);
        }
        if (scrollSnap && SP && SP.restoreAll) SP.restoreAll(scrollSnap);
    }

    function scrollPlanIntoView(planId) {
        requestAnimationFrame(function () {
            var container = document.getElementById('jms-plans-container');
            if (!container) return;
            var card = planId
                ? container.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]')
                : null;
            var target = card || container.lastElementChild;
            if (target && target.scrollIntoView) {
                target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    function listAllThreadGroups() {
        var list = [];
        (_model.test_plans || []).forEach(function (plan, pi) {
            (plan.thread_groups || []).forEach(function (tg, ti) {
                list.push({ plan: plan, planIndex: pi, tg: tg, tgIndex: ti, label: plan.name + ' / ' + tg.name });
            });
        });
        return list;
    }

    function openSceneMonitorModal() {
        readModelFromDom();
        var m = _model;
        var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v != null ? String(v) : ''; };
        set('scene-base-url', m.base_url);
        set('scene-env', m.env);
        set('scene-build', m.build);
        set('scene-influx-url', m.influxdb && m.influxdb.url);
        set('scene-application', m.influxdb && m.influxdb.application);
        var modal = document.getElementById('modal-scene-monitor');
        if (modal) {
            modal.classList.add('jms-modal-open');
            modal.setAttribute('aria-hidden', 'false');
        }
    }

    function closeSceneMonitorModal() {
        var modal = document.getElementById('modal-scene-monitor');
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function applySceneMonitorModal() {
        var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
        var baseUrl = g('scene-base-url');
        if (!baseUrl) throw new Error('base_url 不能为空');
        _model.base_url = baseUrl;
        _model.env = g('scene-env') || 'staging';
        _model.build = g('scene-build') || '${BUILD_ID}';
        if (!_model.influxdb) _model.influxdb = {};
        _model.influxdb.url = g('scene-influx-url') || _model.influxdb.url;
        _model.influxdb.application = g('scene-application');
        if (!_model.influxdb.application) throw new Error('application 不能为空');
        if (!_model.influxdb.tags) _model.influxdb.tags = {};
        _model.influxdb.tags.env = _model.env;
        closeSceneMonitorModal();
        scheduleRender();
    }

    function renderTgLoadCardFallback(item) {
        if (!item || !item.tg || !item.plan || !item.plan.id) return '';
        var tg = item.tg;
        var l = tg.load || {};
        return '<section class="jms-vars-plan jms-tg-load-card" data-plan-id="' + esc(item.plan.id) + '" data-tg-id="' + esc(tg.id) + '">' +
            '<div class="jms-vars-plan__head">' +
            '<span class="jms-vars-plan__badge">' + esc(item.label || tg.name || '线程组') + '</span>' +
            '</div>' +
            '<div class="jms-tg-load-card__body">' +
            '<div class="jms-tg-load-grid">' +
            '<div class="jms-tg-load-field"><label>users</label><input type="number" class="tg-fld-users" min="1" value="' + esc(l.users) + '" /></div>' +
            '<div class="jms-tg-load-field"><label>spawn_rate</label><input type="number" class="tg-fld-spawn" min="1" value="' + esc(l.spawn_rate) + '" /></div>' +
            '<div class="jms-tg-load-field"><label>duration_sec</label><input type="number" class="tg-fld-duration" min="1" value="' + esc(l.duration_sec) + '" /></div>' +
            '<div class="jms-tg-load-field"><label>loops</label><input type="number" class="tg-fld-loops" value="' + esc(l.loops) + '" /></div>' +
            '<div class="jms-tg-load-field jms-tg-load-field--wide"><label>scenario tag</label><input type="text" class="tg-fld-scenario hf-mono" value="' + esc(tg.influx_scenario) + '" placeholder="order-create" /></div>' +
            '</div></div></section>';
    }

    function renderTgLoadCardsHtml(groups, drawerUi) {
        if (drawerUi && typeof drawerUi.renderCardsHtml === 'function') {
            return drawerUi.renderCardsHtml(groups, esc);
        }
        if (drawerUi && typeof drawerUi.renderCardHtml === 'function') {
            return (groups || []).map(function (item) {
                return drawerUi.renderCardHtml(item, esc);
            }).join('');
        }
        return (groups || []).map(renderTgLoadCardFallback).join('');
    }

    function openTgLoadModal() {
        readModelFromDom();
        var titleEl = document.getElementById('jms-tg-load-modal-title');
        var banner = document.getElementById('jms-tg-load-modal-banner');
        var listEl = document.getElementById('jms-tg-load-modal-list');
        var applyBtn = document.getElementById('btn-tg-load-apply');
        if (!listEl) return;
        if (titleEl) titleEl.textContent = '压测负载';

        var drawerUi = global.JmsTgLoadDrawerUi;
        var groups = (drawerUi && typeof drawerUi.collectEntries === 'function')
            ? drawerUi.collectEntries(_model)
            : listAllThreadGroups();
        if (!groups.length) {
            if (banner) {
                banner.textContent = (drawerUi && typeof drawerUi.summarizeBanner === 'function')
                    ? drawerUi.summarizeBanner(0, groups)
                    : '请先添加测试计划与线程组。';
                banner.className = 'jms-vars-banner jms-vars-banner--warn';
                banner.classList.remove('hidden');
            }
            listEl.innerHTML = '<p class="jms-tg-load-empty-hint">暂无可用线程组。请先在场景中添加测试计划与线程组后再配置压测负载。</p>';
            if (applyBtn) applyBtn.classList.add('is-hidden');
        } else {
            if (banner) {
                banner.textContent = (drawerUi && typeof drawerUi.summarizeBanner === 'function')
                    ? drawerUi.summarizeBanner(groups.length, groups)
                    : ('检测到 ' + groups.length + ' 个线程组，分别配置 JMeter Thread Group 与 scenario 标签。');
                banner.className = 'jms-vars-banner jms-vars-banner--ok';
                banner.classList.remove('hidden');
            }
            if (applyBtn) applyBtn.classList.remove('is-hidden');
            listEl.innerHTML = renderTgLoadCardsHtml(groups, drawerUi);
            if (!listEl.querySelector('.jms-tg-load-card')) {
                listEl.innerHTML = groups.map(renderTgLoadCardFallback).join('');
            }
        }

        var modal = document.getElementById('modal-tg-load');
        if (modal) {
            modal.classList.add('jms-modal-open');
            modal.setAttribute('aria-hidden', 'false');
        }
    }

    function closeTgLoadModal() {
        var modal = document.getElementById('modal-tg-load');
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function applyTgLoadModal() {
        var cards = document.querySelectorAll('#jms-tg-load-modal-list .jms-tg-load-card');
        if (!cards.length) throw new Error('没有可保存的线程组');
        cards.forEach(function (card) {
            var plan = findPlan(card.getAttribute('data-plan-id'));
            var tg = plan && findTg(plan, card.getAttribute('data-tg-id'));
            if (!tg) return;
            tg.load.users = Number(card.querySelector('.tg-fld-users') && card.querySelector('.tg-fld-users').value) || 1;
            tg.load.spawn_rate = Number(card.querySelector('.tg-fld-spawn') && card.querySelector('.tg-fld-spawn').value) || 1;
            tg.load.duration_sec = Number(card.querySelector('.tg-fld-duration') && card.querySelector('.tg-fld-duration').value) || 60;
            tg.load.loops = Number(card.querySelector('.tg-fld-loops') && card.querySelector('.tg-fld-loops').value);
            if (!Number.isFinite(tg.load.loops)) tg.load.loops = -1;
            var sc = card.querySelector('.tg-fld-scenario');
            if (sc) tg.influx_scenario = sc.value.trim();
        });
        closeTgLoadModal();
        scheduleRender();
    }

    function readKvFromList(listEl) {
        var rows = [];
        if (!listEl) return rows;
        listEl.querySelectorAll('.jms-kv-row').forEach(function (row) {
            rows.push({
                key: (row.querySelector('.jms-kv-key') && row.querySelector('.jms-kv-key').value) || '',
                value: (row.querySelector('.jms-kv-val') && row.querySelector('.jms-kv-val').value) || ''
            });
        });
        return rows;
    }


    function stripSetupDisplayPrefix(name) {
        var s = String(name || '').trim();
        while (/^\[Setup\]\s*/i.test(s)) {
            s = s.replace(/^\[Setup\]\s*/i, '').trim();
        }
        return s;
    }

    function isSetupThreadGroupId(tgId) {
        return !!(_model.setup_thread_groups || []).some(function (t) { return t.id === tgId; });
    }

    function stripPostDisplayPrefix(name) {
        var s = String(name || '').trim();
        while (/^\[Post\]\s*/i.test(s)) {
            s = s.replace(/^\[Post\]\s*/i, '').trim();
        }
        return s;
    }

    function isPostThreadGroupId(tgId) {
        return !!(_model.post_thread_groups || []).some(function (t) { return t.id === tgId; });
    }

    function getThreadGroupKind(tgId) {
        if (isSetupThreadGroupId(tgId)) return 'setup';
        if (isPostThreadGroupId(tgId)) return 'post';
        return 'thread';
    }

    function countAllThreadGroups(planId) {
        var plan = findPlan(planId);
        return ((plan && plan.thread_groups) ? plan.thread_groups.length : 0)
            + ((_model.setup_thread_groups || []).length)
            + ((_model.post_thread_groups || []).length);
    }

    function canDeleteThreadGroup(planId, tgId) {
        if (countAllThreadGroups(planId) <= 1) {
            return { ok: false, msg: '至少需要保留一个线程组。' };
        }
        if (getThreadGroupKind(tgId) === 'thread') {
            var plan = findPlan(planId);
            if (plan && plan.thread_groups.length <= 1) {
                return { ok: false, msg: '每个测试计划至少保留一个主线程组。' };
            }
        }
        return { ok: true, msg: '' };
    }

    function threadGroupKindLabel(kind) {
        if (kind === 'setup') return 'SetUp 线程组';
        if (kind === 'post') return 'tearDown 线程组';
        return '线程组';
    }

    /** 删除指定线程组（setup / thread / post），供删除按钮与树形导航共用 */
    function deleteThreadGroupById(planId, tgId) {
        readModelFromDom();
        var kind = getThreadGroupKind(tgId);
        if (kind === 'setup') {
            _model.setup_thread_groups = (_model.setup_thread_groups || []).filter(function (x) { return x.id !== tgId; });
        } else if (kind === 'post') {
            _model.post_thread_groups = (_model.post_thread_groups || []).filter(function (x) { return x.id !== tgId; });
        } else {
            var plan = findPlan(planId);
            if (plan) {
                plan.thread_groups = (plan.thread_groups || []).filter(function (x) { return x.id !== tgId; });
            }
        }
        if (_selected.tgId === tgId) _selected.tgId = null;
        notifyUserEdit();
        scheduleRender();
    }

    function readModelFromDom() {
        if (isStudioV2MergedHead()) {
            var toolbar = document.getElementById('jms-studio-plan-toolbar');
            if (toolbar) {
                var toolbarPlanId = toolbar.getAttribute('data-plan-id');
                var toolbarPlan = findPlan(toolbarPlanId) || ((_model.test_plans || [])[0]);
                var sidebarNameEl = document.getElementById('lth-plan-name');
                var toolbarNameEl = toolbar.querySelector('.jms-plan-name');
                if (toolbarPlan && sidebarNameEl) {
                    toolbarPlan.name = sidebarNameEl.value.trim() || toolbarPlan.name;
                } else if (toolbarPlan && toolbarNameEl) {
                    toolbarPlan.name = toolbarNameEl.value.trim() || toolbarPlan.name;
                }
            }
        }
        document.querySelectorAll('.jms-plan-card').forEach(function (card) {
            var planId = card.getAttribute('data-plan-id');
            var plan = findPlan(planId);
            if (!plan) return;
            var nameEl = card.querySelector('.jms-plan-name');
            if (nameEl) plan.name = nameEl.value.trim() || plan.name;

            card.querySelectorAll('.jms-tg-block').forEach(function (tgEl) {
                var tgId = tgEl.getAttribute('data-tg-id');
                var tg = findTg(plan, tgId);
                if (!tg) return;
                var tgName = tgEl.querySelector('.jms-tg-name');
                if (tgName) {
                    var rawName = tgName.value.trim() || tg.name;
                    if (isSetupThreadGroupId(tgId)) tg.name = stripSetupDisplayPrefix(rawName);
                    else if (isPostThreadGroupId(tgId)) tg.name = stripPostDisplayPrefix(rawName);
                    else tg.name = rawName;
                    if (!tg.name) tg.name = rawName;
                }
            });
        });
        if (global.JmsScenarioNormalize && typeof global.JmsScenarioNormalize.normalizeModel === 'function') {
            global.JmsScenarioNormalize.normalizeModel(_model, { force: false });
        } else if (global.JmsCatalogUnifyMigrate && typeof global.JmsCatalogUnifyMigrate.migrateModel === 'function') {
            global.JmsCatalogUnifyMigrate.migrateModel(_model);
            syncTgListenerCatalogFlagsOnModel(_model);
            syncMountCatalogOnModel(_model);
        }
    }


    function openModalEl(modal) {
        if (!modal) return;
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeModalEl(modal) {
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function openIfEditor(planId, tgId, stepId) {
        var modal = document.getElementById('modal-if-edit');
        var tgRef = findTg(findPlan(planId), tgId);
        var step = tgRef && findStepInList(tgRef.steps, stepId);
        if (!modal || !step || !isIfStep(step)) return;
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
        modal.setAttribute('data-step-id', stepId);
        document.getElementById('if-edit-name').value = step.name || '';
        document.getElementById('if-edit-condition').value = step.condition || '';
        document.getElementById('if-edit-evaluate-all').checked = !!step.evaluate_all;
        document.getElementById('if-edit-use-expression').checked = step.use_expression !== false;
        document.getElementById('if-edit-enabled').checked = step.enabled !== false;
        openModalEl(modal);
    }

    function closeIfEditor() {
        closeModalEl(document.getElementById('modal-if-edit'));
    }

    function saveIfEditor() {
        var modal = document.getElementById('modal-if-edit');
        if (!modal) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var stepId = modal.getAttribute('data-step-id');
        var tg = findTg(findPlan(planId), tgId);
        var step = tg && findStepInList(tg.steps, stepId);
        if (!step || !isIfStep(step)) return;
        step.name = document.getElementById('if-edit-name').value.trim() || 'If 控制器';
        step.condition = document.getElementById('if-edit-condition').value;
        step.evaluate_all = !!document.getElementById('if-edit-evaluate-all').checked;
        step.use_expression = !!document.getElementById('if-edit-use-expression').checked;
        step.enabled = !!document.getElementById('if-edit-enabled').checked;
        closeIfEditor();
        notifyUserEdit();
        scheduleRender();
    }

    function openBeanShellEditor(planId, tgId, stepId) {
        if (global.JmsTgBeanshellPostUi && typeof global.JmsTgBeanshellPostUi.openEditor === 'function') {
            global.JmsTgBeanshellPostUi.openEditor(planId, tgId, stepId, false);
            return;
        }
        var modal = document.getElementById('modal-beanshell-edit');
        var tg = findTg(findPlan(planId), tgId);
        var step = tg && findStepInList(tg.steps, stepId);
        if (!modal || !step || !isBeanShellStep(step)) return;
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
        modal.setAttribute('data-step-id', stepId);
        document.getElementById('beanshell-edit-name').value = step.name || '';
        document.getElementById('beanshell-edit-script').value = step.script || '';
        document.getElementById('beanshell-edit-enabled').checked = step.enabled !== false;
        openModalEl(modal);
    }

    function closeBeanShellEditor() {
        closeModalEl(document.getElementById('modal-beanshell-edit'));
    }

    function saveBeanShellEditor() {
        var modal = document.getElementById('modal-beanshell-edit');
        if (!modal) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var stepId = modal.getAttribute('data-step-id');
        var tg = findTg(findPlan(planId), tgId);
        var step = tg && findStepInList(tg.steps, stepId);
        if (!step || !isBeanShellStep(step)) return;
        step.name = document.getElementById('beanshell-edit-name').value.trim() || 'BeanShell 后置处理器';
        step.script = document.getElementById('beanshell-edit-script').value;
        step.enabled = !!document.getElementById('beanshell-edit-enabled').checked;
        closeBeanShellEditor();
        notifyUserEdit();
        scheduleRender();
    }

    function openDebugEditor(planId, tgId, stepId) {
        var modal = document.getElementById('modal-debug-edit');
        var tg = findTg(findPlan(planId), tgId);
        var step = tg && findStepInList(tg.steps, stepId);
        if (!modal || !step || !isDebugStep(step)) return;
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
        modal.setAttribute('data-step-id', stepId);
        document.getElementById('debug-edit-name').value = step.name || '';
        document.getElementById('debug-edit-comments').value = step.comments || '';
        document.getElementById('debug-edit-show-vars').checked = step.display_jmeter_variables !== false;
        document.getElementById('debug-edit-show-props').checked = !!step.display_jmeter_properties;
        document.getElementById('debug-edit-show-sys').checked = !!step.display_system_properties;
        openModalEl(modal);
    }

    function closeDebugEditor() {
        closeModalEl(document.getElementById('modal-debug-edit'));
    }

    function saveDebugEditor() {
        var modal = document.getElementById('modal-debug-edit');
        if (!modal) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var stepId = modal.getAttribute('data-step-id');
        var tg = findTg(findPlan(planId), tgId);
        var step = tg && findStepInList(tg.steps, stepId);
        if (!step || !isDebugStep(step)) return;
        step.name = document.getElementById('debug-edit-name').value.trim() || 'Debug Sampler';
        step.comments = document.getElementById('debug-edit-comments').value;
        step.display_jmeter_variables = !!document.getElementById('debug-edit-show-vars').checked;
        step.display_jmeter_properties = !!document.getElementById('debug-edit-show-props').checked;
        step.display_system_properties = !!document.getElementById('debug-edit-show-sys').checked;
        /* enabled controlled by tree card toggle */
        closeDebugEditor();
        notifyUserEdit();
        scheduleRender();
    }


    function deleteAuxStepCard(card) {
        if (!card) return;
        var stepId = card.getAttribute('data-step-id');
        var planId = card.getAttribute('data-plan-id');
        var tgId = card.getAttribute('data-tg-id');
        readModelFromDom();
        var tg = findTg(findPlan(planId), tgId);
        if (tg) {
            removeStepFromList(tg.steps, stepId);
            if (!tg.steps.length) tg.steps.push(defaultStep());
        }
        notifyUserEdit();
        scheduleRender();
    }

    function deleteAuxOrIfStep(card, titlePrefix) {
        if (!card) return;
        var stepId = card.getAttribute('data-step-id');
        var planId = card.getAttribute('data-plan-id');
        var tgId = card.getAttribute('data-tg-id');
        var nameEl = card.querySelector('.jms-aux-name') || card.querySelector('.jms-http-name');
        var stepLabel = (nameEl && nameEl.textContent) ? nameEl.textContent.trim() : '该步骤';
        runWithConfirm({
            title: titlePrefix + '删除',
            message: '确定删除「' + stepLabel + '」吗？删除后不可恢复。'
        }, function () {
            readModelFromDom();
            var tg = findTg(findPlan(planId), tgId);
            if (tg) {
                removeStepFromList(tg.steps, stepId);
                if (!tg.steps.length) tg.steps.push(defaultStep());
            }
            notifyUserEdit();
            scheduleRender();
        });
    }

    function openStepEditor(planId, tgId, stepId) {
        var plan = findPlan(planId);
        if (!plan) return;
        var tg = findTg(plan, tgId);
        if (!tg) return;
        var step = findStepInList(tg.steps, stepId);
        if (!step) return;

        var modal = document.getElementById('modal-step-edit');
        if (!modal) return;
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
        modal.setAttribute('data-step-id', stepId);

        document.getElementById('step-edit-name').value = step.name || '';
        document.getElementById('step-edit-method').value = step.method || 'GET';
        var pathDisplay = global.JmsHttpPathQuery
            ? global.JmsHttpPathQuery.mergePathAndQuery(step.path, step.query)
            : (step.path || '/');
        document.getElementById('step-edit-path').value = pathDisplay;
        document.getElementById('step-edit-encoding').value = step.encoding || '';
        var contentMode = step.body_content_mode ||
            (inferBodyTypeFromStep(step) === 'form' ? 'form' : 'json');
        setActiveBodyContentMode(contentMode);
        document.getElementById('step-edit-body').value = step.body || '';
        /* step headers moved to mount-area config elements */
        document.getElementById('step-edit-body-params').innerHTML = renderKvRows(step.body_params);
        document.getElementById('step-edit-multipart-fields').innerHTML = renderKvRows(step.multipart_fields);
        document.getElementById('step-edit-upload-files').innerHTML = renderFileRows(step.upload_files);
        updateStepBodyPanels();

        var sl = step.step_listeners || defaultStepListeners();
        var vtree = document.getElementById('step-edit-view-tree');
        var agg = document.getElementById('step-edit-aggregate-report');
        var ctim = document.getElementById('step-edit-constant-timer');
        var upar = document.getElementById('step-edit-user-params-enable');
        if (vtree) vtree.checked = !!sl.view_results_tree;
        if (agg) agg.checked = !!sl.aggregate_report;
        if (ctim) ctim.checked = !!(step.constant_timer && step.constant_timer.enabled);
        if (upar) upar.checked = !!(step.user_parameters && step.user_parameters.enabled);
        var delayEl = document.getElementById('step-edit-timer-delay');
        if (delayEl) delayEl.value = String((step.constant_timer && step.constant_timer.delay_ms) || 1000);
        var upList = document.getElementById('step-edit-user-params-list');
        if (upList) upList.innerHTML = renderKvRows((step.user_parameters && step.user_parameters.params) || []);

        var yamlTa = document.getElementById('step-edit-yaml');
        yamlTa.value = jsyaml.dump(catalogStepToYaml(step) || {}, { lineWidth: 100, noRefs: true });

        var mode = step.editMode || 'form';
        document.querySelectorAll('.jms-step-mode-btn').forEach(function (btn) {
            btn.classList.toggle('is-active', btn.getAttribute('data-mode') === mode);
        });
        document.getElementById('step-edit-form-panel').classList.toggle('hidden', mode !== 'form');
        document.getElementById('step-edit-yaml-panel').classList.toggle('hidden', mode !== 'yaml');

        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeStepEditor() {
        var modal = document.getElementById('modal-step-edit');
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function saveStepEditor() {
        var modal = document.getElementById('modal-step-edit');
        if (!modal) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var stepId = modal.getAttribute('data-step-id');
        var plan = findPlan(planId);
        var tg = plan && findTg(plan, tgId);
        var step = tg && findStepInList(tg.steps, stepId);
        if (!step) return;

        var activeModeBtn = document.querySelector('.jms-step-mode-btn.is-active');
        var mode = activeModeBtn ? activeModeBtn.getAttribute('data-mode') : 'form';
        step.editMode = mode;

        if (mode === 'yaml') {
            try {
                var parsed = jsyaml.load(document.getElementById('step-edit-yaml').value);
                if (!parsed || typeof parsed !== 'object') throw new Error('需要 YAML 对象');
                Object.assign(step, catalogStepFromYaml(parsed));
                step.id = stepId;
                step.editMode = 'yaml';
            } catch (e) {
                if (_api && _api.showMsg) _api.showMsg(e.message || String(e), false);
                return;
            }
        } else {
            step.name = document.getElementById('step-edit-name').value.trim() || 'HTTP 请求';
            step.method = document.getElementById('step-edit-method').value;
            step.path = document.getElementById('step-edit-path').value.trim() || '/';
            step.query = [];
            step.encoding = document.getElementById('step-edit-encoding').value.trim();
            step.body_content_mode = getActiveBodyContentMode();
            step.body = document.getElementById('step-edit-body').value;
            step.body_params = readKvFromList(document.getElementById('step-edit-body-params'));
            step.multipart_fields = readKvFromList(document.getElementById('step-edit-multipart-fields'));
            step.upload_files = readFilesFromList(document.getElementById('step-edit-upload-files'));
            step.body_type = resolveBodyTypeForSave(step);
            var extractListElSave = document.getElementById('step-edit-extractors');
            if (extractListElSave && global.JmsStepExtractEditor) {
                global.JmsStepExtractEditor.applyToStep(step, extractListElSave);
            }
            /* step headers saved via mount-area config elements */
            var vtreeEl = document.getElementById('step-edit-view-tree');
            var aggEl = document.getElementById('step-edit-aggregate-report');
            if (vtreeEl || aggEl) {
                step.step_listeners = {
                    view_results_tree: !!(vtreeEl && vtreeEl.checked),
                    aggregate_report: !!(aggEl && aggEl.checked)
                };
            }
            var ctimEl = document.getElementById('step-edit-constant-timer');
            var delayElSave = document.getElementById('step-edit-timer-delay');
            if (ctimEl || delayElSave) {
                step.constant_timer = {
                    enabled: !!(ctimEl && ctimEl.checked),
                    delay_ms: Number(delayElSave && delayElSave.value) || (step.constant_timer && step.constant_timer.delay_ms) || 1000,
                    name: (step.constant_timer && step.constant_timer.name) || '固定定时器',
                    comments: (step.constant_timer && step.constant_timer.comments) || ''
                };
            }
            var upEnableEl = document.getElementById('step-edit-user-params-enable');
            var upListEl = document.getElementById('step-edit-user-params-list');
            if (upEnableEl || upListEl) {
                step.user_parameters = {
                    enabled: !!(upEnableEl && upEnableEl.checked),
                    per_iteration: false,
                    params: readKvFromList(upListEl)
                };
            }
        }
        closeStepEditor();
        notifyUserEdit();
        scheduleRender();
    }

    function runWithConfirm(opts, action) {
        if (_api && typeof _api.showConfirm === 'function') {
            _api.showConfirm({
                title: opts.title,
                message: opts.message,
                confirmText: opts.confirmText || '删除',
                onConfirm: action
            });
            return;
        }
        if (window.confirm(opts.message || '确定要继续吗？')) action();
    }

    /** 线程组级添加 HTTP 步骤（树形配置菜单与遗留 +HTTP 按钮共用，隔离入口） */
    function triggerTgAddHttpStep(planId, tgId) {
        readModelFromDom();
        if (_api && typeof _api.openHttpAddChoiceModal === 'function') {
            _api.openHttpAddChoiceModal({ planId: planId, tgId: tgId });
            return;
        }
        var p2 = findPlan(planId);
        var tg2 = p2 && findTg(p2, tgId);
        if (tg2) {
            var ns = defaultBlankHttpStep();
            ns.name = 'HTTP 请求 ' + ((tg2.steps || []).length + 1);
            if (!tg2.steps) tg2.steps = [];
            tg2.steps.push(ns);
            if (global.JmsTgDetailTimeline && typeof global.JmsTgDetailTimeline.assignAppendTimelineOrder === 'function') {
                global.JmsTgDetailTimeline.assignAppendTimelineOrder(tg2, ns);
            }
            openStepEditor(p2.id, tg2.id, ns.id);
            notifyUserEdit();
            scheduleRender();
        }
    }

    function onVisualClick(ev) {
        var t = ev.target;

        if (t.classList.contains('jms-btn-add-tg') || t.closest('.jms-btn-add-tg')) {
            readModelFromDom();
            var btn = t.closest('.jms-btn-add-tg') || t;
            var planIdForTg = btn.getAttribute('data-plan-id');
            if (global.JmsTgAddChoiceUi && typeof global.JmsTgAddChoiceUi.openModal === 'function') {
                global.JmsTgAddChoiceUi.openModal({ planId: planIdForTg });
                return;
            }
            var plan = findPlan(planIdForTg);
            if (plan) {
                var legacyTg = defaultThreadGroup('线程组 ' + plan.thread_groups.length);
                plan.thread_groups.push(legacyTg);
                if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.assignOnAdd === 'function') {
                    global.JmsTgDisplayOrder.assignOnAdd(_model, planIdForTg, legacyTg);
                }
            }
            notifyUserEdit();
            scheduleRender();
            return;
        }

        if (t.classList.contains('jms-btn-add-http') || t.closest('.jms-btn-add-http')) {
            readModelFromDom();
            var b2 = t.closest('.jms-btn-add-http') || t;
            triggerTgAddHttpStep(b2.getAttribute('data-plan-id'), b2.getAttribute('data-tg-id'));
            return;
        }
        if (t.classList.contains('jms-btn-import-step') || t.closest('.jms-btn-import-step')) {
            var stepBtn = t.closest('.jms-btn-import-step') || t;
            readModelFromDom();
            if (_api && typeof _api.openHttpAddChoiceModal === 'function') {
                _api.openHttpAddChoiceModal({
                    planId: stepBtn.getAttribute('data-plan-id'),
                    tgId: stepBtn.getAttribute('data-tg-id')
                });
            }
            return;
        }


/* logic edit: invoke module openEditor */
        if (t.classList.contains('jms-btn-edit-if') || t.closest('.jms-btn-edit-if')) {
            ev.preventDefault();
            ev.stopPropagation();
            var ifCard = t.closest('.jms-if-card');
            if (ifCard) {
                readModelFromDom();
            }
            return;
        }
        if (t.classList.contains('jms-btn-del-if') || t.closest('.jms-btn-del-if')) {
            var ifCardDel = t.closest('.jms-if-card');
            if (ifCardDel) {
                readModelFromDom();
                deleteAuxOrIfStep(ifCardDel, 'If 控制器');
            }
            return;
        }
        if (t.classList.contains('jms-btn-edit-random') || t.closest('.jms-btn-edit-random')) {
            ev.preventDefault();
            ev.stopPropagation();
            var randomCard = t.closest('.jms-random-card');
            if (randomCard && global.JmsTgRandomControllerUi && typeof global.JmsTgRandomControllerUi.openEditor === 'function') {
                readModelFromDom();
                global.JmsTgRandomControllerUi.openEditor(randomCard.getAttribute('data-plan-id'), randomCard.getAttribute('data-tg-id'), randomCard.getAttribute('data-step-id'));
            }
            return;
        }
        if (t.classList.contains('jms-btn-del-random') || t.closest('.jms-btn-del-random')) {
            var randomCardDel = t.closest('.jms-random-card');
            if (randomCardDel) {
                readModelFromDom();
                deleteAuxOrIfStep(randomCardDel, '随机控制器');
            }
            return;
        }
        if (t.classList.contains('jms-btn-edit-simple') || t.closest('.jms-btn-edit-simple')) {
            ev.preventDefault();
            ev.stopPropagation();
            var simpleCard = t.closest('.jms-simple-card');
            if (simpleCard && global.JmsTgSimpleControllerUi && typeof global.JmsTgSimpleControllerUi.openEditor === 'function') {
                readModelFromDom();
                global.JmsTgSimpleControllerUi.openEditor(simpleCard.getAttribute('data-plan-id'), simpleCard.getAttribute('data-tg-id'), simpleCard.getAttribute('data-step-id'));
            }
            return;
        }
        if (t.classList.contains('jms-btn-del-simple') || t.closest('.jms-btn-del-simple')) {
            var simpleCardDel = t.closest('.jms-simple-card');
            if (simpleCardDel) {
                readModelFromDom();
                deleteAuxOrIfStep(simpleCardDel, '简单控制器');
            }
            return;
        }
        if (t.classList.contains('jms-btn-edit-transaction') || t.closest('.jms-btn-edit-transaction')) {
            ev.preventDefault();
            ev.stopPropagation();
            var txnCard = t.closest('.jms-transaction-card');
            if (txnCard && global.JmsTgTransactionControllerUi && typeof global.JmsTgTransactionControllerUi.openEditor === 'function') {
                readModelFromDom();
                global.JmsTgTransactionControllerUi.openEditor(txnCard.getAttribute('data-plan-id'), txnCard.getAttribute('data-tg-id'), txnCard.getAttribute('data-step-id'));
            }
            return;
        }
        if (t.classList.contains('jms-btn-edit-loop') || t.closest('.jms-btn-edit-loop')) {
            ev.preventDefault();
            ev.stopPropagation();
            var loopCard = t.closest('.jms-loop-card');
            if (loopCard && global.JmsTgLoopControllerUi && typeof global.JmsTgLoopControllerUi.openEditor === 'function') {
                readModelFromDom();
                global.JmsTgLoopControllerUi.openEditor(loopCard.getAttribute('data-plan-id'), loopCard.getAttribute('data-tg-id'), loopCard.getAttribute('data-step-id'));
            }
            return;
        }
        if (t.classList.contains('jms-btn-del-loop') || t.closest('.jms-btn-del-loop')) {
            var loopCardDel = t.closest('.jms-loop-card');
            if (loopCardDel) {
                readModelFromDom();
                deleteAuxOrIfStep(loopCardDel, '循环控制器');
            }
            return;
        }
        if (t.classList.contains('jms-btn-del-transaction') || t.closest('.jms-btn-del-transaction')) {
            var txnCardDel = t.closest('.jms-transaction-card');
            if (txnCardDel) {
                readModelFromDom();
                deleteAuxOrIfStep(txnCardDel, '事务控制器');
            }
            return;
        }
        if (t.classList.contains('jms-btn-edit-beanshell') || t.closest('.jms-btn-edit-beanshell')) {
            ev.preventDefault();
            ev.stopPropagation();
            var bsCard = t.closest('.jms-aux-card');
            if (bsCard) {
                readModelFromDom();
                openBeanShellEditor(bsCard.getAttribute('data-plan-id'), bsCard.getAttribute('data-tg-id'), bsCard.getAttribute('data-step-id'));
            }
            return;
        }
        if (t.classList.contains('jms-btn-edit-debug') || t.closest('.jms-btn-edit-debug')) {
            ev.preventDefault();
            ev.stopPropagation();
            var dbgCard = t.closest('.jms-aux-card');
            if (dbgCard) {
                readModelFromDom();
                openDebugEditor(dbgCard.getAttribute('data-plan-id'), dbgCard.getAttribute('data-tg-id'), dbgCard.getAttribute('data-step-id'));
            }
            return;
        }
        if (t.classList.contains('jms-btn-del-aux-step') || t.closest('.jms-btn-del-aux-step')) {
            var auxCard = t.closest('.jms-aux-card');
            if (auxCard) {
                readModelFromDom();
                deleteAuxOrIfStep(auxCard, '步骤');
            }
            return;
        }

        if (t.classList.contains('jms-btn-edit-step') || t.closest('.jms-btn-edit-step')) {
            var card = t.closest('.jms-http-card');
            if (card) {
                readModelFromDom();
                openStepEditor(card.getAttribute('data-plan-id'), card.getAttribute('data-tg-id'), card.getAttribute('data-step-id'));
            }
            return;
        }


        if (t.classList.contains('jms-btn-del-step') || t.closest('.jms-btn-del-step')) {
            var c2 = t.closest('.jms-http-card');
            if (c2) {
                var stepId = c2.getAttribute('data-step-id');
                var planId3 = c2.getAttribute('data-plan-id');
                var tgId3 = c2.getAttribute('data-tg-id');
                var stepNameEl = c2.querySelector('.jms-http-name');
                var stepLabel = (stepNameEl && stepNameEl.textContent) ? stepNameEl.textContent.trim() : '该 HTTP 请求';
                runWithConfirm({
                    title: '删除 HTTP 请求',
                    message: '确定删除「' + stepLabel + '」吗？删除后不可恢复。'
                }, function () {
                    readModelFromDom();
                    var p3 = findPlan(planId3);
                    var tg3 = p3 && findTg(p3, tgId3);
                    if (tg3) {
                        removeStepFromList(tg3.steps, stepId);
                        if (!tg3.steps.length) tg3.steps.push(defaultStep());
                    }
                    notifyUserEdit();
                    scheduleRender();
                });
            }
            return;
        }

        if (t.classList.contains('jms-btn-del-tg') || t.closest('.jms-btn-del-tg')) {
            var tgBlock = t.closest('.jms-tg-block');
            if (tgBlock) {
                readModelFromDom();
                var planIdDel = tgBlock.getAttribute('data-plan-id');
                var tgIdDel = tgBlock.getAttribute('data-tg-id');
                var checkDel = canDeleteThreadGroup(planIdDel, tgIdDel);
                if (!checkDel.ok) {
                    if (_api && _api.showMsg) _api.showMsg(checkDel.msg, false);
                    return;
                }
                var tgNameEl = tgBlock.querySelector('.jms-tg-name');
                var tgLabel = (tgNameEl && tgNameEl.value) ? tgNameEl.value.trim() : '该线程组';
                var kindDel = getThreadGroupKind(tgIdDel);
                var typeLabel = threadGroupKindLabel(kindDel);
                runWithConfirm({
                    title: '删除' + typeLabel,
                    message: '确定删除' + typeLabel + '「' + tgLabel + '」及其下所有 HTTP 请求吗？删除后不可恢复。'
                }, function () {
                    deleteThreadGroupById(planIdDel, tgIdDel);
                });
            }
            return;
        }

        if (t.classList.contains('jms-tg-listener-btn') || t.closest('.jms-tg-listener-btn')) {
            var lb = t.closest('.jms-tg-listener-btn') || t;
            readModelFromDom();
            var lPlan = findPlan(lb.closest('.jms-tg-listeners').getAttribute('data-plan-id'));
            var lTg = lPlan && findTg(lPlan, lb.closest('.jms-tg-listeners').getAttribute('data-tg-id'));
            if (lTg) {
                var key = lb.getAttribute('data-listener');
                var Bridge = global.JmsTgListenerCatalogBridge;
                if (Bridge && typeof Bridge.openEditor === 'function' && key === 'backend_listener') {
                    Bridge.openEditor(lPlan.id, lTg.id, key);
                    notifyUserEdit();
                    if (isTreeViewMode()) {
                        patchTgListenerButtonUi(lb, resolveTgListenerFlags(lTg), key);
                        syncYamlFromModel();
                        if (global.JmsTgListenerTreeRows && typeof global.JmsTgListenerTreeRows.refreshTgTree === 'function') {
                            global.JmsTgListenerTreeRows.refreshTgTree(lPlan.id, lTg.id);
                        }
                    } else {
                        scheduleRender();
                    }
                    return;
                }
                if (Bridge && typeof Bridge.toggleListener === 'function') {
                    Bridge.toggleListener(lPlan.id, lTg.id, key);
                    lTg = findTg(lPlan, lTg.id) || lTg;
                    notifyUserEdit();
                    if (isTreeViewMode()) {
                        patchTgListenerButtonUi(lb, resolveTgListenerFlags(lTg), key);
                        syncYamlFromModel();
                        if (global.JmsTgListenerTreeRows && typeof global.JmsTgListenerTreeRows.refreshTgTree === 'function') {
                            global.JmsTgListenerTreeRows.refreshTgTree(lPlan.id, lTg.id);
                        }
                    } else {
                        scheduleRender();
                    }
                    return;
                }
                if (!lTg.listeners) lTg.listeners = defaultTgListeners();
                lTg.listeners[key] = !lTg.listeners[key];
                notifyUserEdit();
                if (isTreeViewMode()) {
                    patchTgListenerButtonUi(lb, lTg.listeners, key);
                    syncYamlFromModel();
                } else {
                    scheduleRender();
                }
            }
            return;
        }

        if (t.classList.contains('jms-tg-config-btn') || t.closest('.jms-tg-config-btn')) {
            if (isTreeViewMode()) return;
            var cfgBtn = t.closest('.jms-tg-config-btn') || t;
            readModelFromDom();
            openTgConfigModal(cfgBtn.getAttribute('data-plan-id'), cfgBtn.getAttribute('data-tg-id'));
            return;
        }

        if (t.classList.contains('jms-kv-del')) {
            if (t.closest('#modal-step-edit')) return;
            var row = t.closest('.jms-kv-row');
            if (row) {
                row.remove();
                readModelFromDom();
                notifyUserEdit();
                scheduleRender();
            }
            return;
        }

        if (t.classList.contains('jms-file-del')) {
            if (t.closest('#modal-step-edit')) return;
            var fileRow = t.closest('.jms-file-row');
            if (fileRow) fileRow.remove();
            return;
        }

        if (t.closest('.jms-plan-card')) {
            _selected.planId = t.closest('.jms-plan-card').getAttribute('data-plan-id');
            document.querySelectorAll('.jms-plan-card').forEach(function (c) {
                c.classList.toggle('is-selected', c.getAttribute('data-plan-id') === _selected.planId);
            });
        }
    }

    function parseBaseUrlSimple(url) {
        if (!url || !String(url).trim()) throw new Error('场景与监控：请填写 base_url');
        try {
            var u = new URL(String(url).trim());
            if (u.protocol !== 'http:' && u.protocol !== 'https:') {
                throw new Error('场景与监控：base_url 须为 http 或 https');
            }
            return u.href;
        } catch (e) {
            if (e.message && e.message.indexOf('场景与监控') === 0) throw e;
            throw new Error('场景与监控：base_url 格式无效');
        }
    }

    function validateLoad(load, label) {
        if (!load || typeof load !== 'object') throw new Error(label + '：请在「压测负载」中配置并发参数');
        var users = Number(load.users);
        var spawn = Number(load.spawn_rate);
        var dur = Number(load.duration_sec);
        var loops = Number(load.loops);
        if (!Number.isFinite(users) || users < 1) throw new Error(label + '：users 须 ≥ 1');
        if (!Number.isFinite(spawn) || spawn < 1) throw new Error(label + '：spawn_rate 须 ≥ 1');
        if (!Number.isFinite(dur) || dur < 1) throw new Error(label + '：duration_sec 须 ≥ 1');
        if (!Number.isFinite(loops)) throw new Error(label + '：loops 须为数字');
    }

    function isAuxStep(st) {
        return isBeanShellStep(st) || isDebugStep(st) || isJsonPostAuxStep(st) ||
            isRegexExtractAuxStep(st) || isXPathExtractAuxStep(st) ||
            isJsr223PostAuxStep(st) || isJdbcPostAuxStep(st);
    }

    function isCatalogLeafNonHttpStep(st) {
        var C = compat();
        if (!C || !C.isCatalog(st)) return false;
        if (C.isHttpSampler(st) || C.isLogicContainer(st)) return false;
        return !isAuxStep(st);
    }

    function isHttpStep(st) {
        if (!st) return false;
        var C = compat();
        if (C && C.isCatalog(st)) return C.isHttpSampler(st);
        return !isLogicContainerStep(st) && !isAuxStep(st);
    }

    function stepKindLabel(step) {
        var C = compat();
        if (C && C.isCatalog(step)) {
            if (C.isHttpSampler(step)) return 'HTTP「' + (step.name || '请求') + '」';
            var kind = step.label_zh || step.alias || '元件';
            return kind + '「' + (step.name || step.alias || '') + '」';
        }
        if (isIfStep(step)) return 'If「' + (step.name || '控制器') + '」';
        if (isRandomStep(step)) return '随机控制器「' + (step.name || '控制器') + '」';
        if (isSimpleStep(step)) return '简单控制器「' + (step.name || '控制器') + '」';
        if (isTransactionStep(step)) return '事务控制器「' + (step.name || '控制器') + '」';
        if (isLoopStep(step)) return '循环控制器「' + (step.name || '控制器') + '」';
        if (isBeanShellStep(step)) return 'BeanShell「' + (step.name || '处理器') + '」';
        if (isDebugStep(step)) return 'Debug「' + (step.name || '采样器') + '」';
        if (isJsonPostAuxStep(step)) return 'JSON提取「' + (step.name || '处理器') + '」';
        if (isRegexExtractAuxStep(step)) return '正则提取「' + (step.name || '处理器') + '」';
        if (isXPathExtractAuxStep(step)) return 'XPath提取「' + (step.name || '处理器') + '」';
        if (isJsr223PostAuxStep(step)) return 'JSR223「' + (step.name || '处理器') + '」';
        if (isJdbcPostAuxStep(step)) return 'JDBC「' + (step.name || '处理器') + '」';
        return 'HTTP「' + (step.name || '请求') + '」';
    }

/* --- validate-plan-full v1 --- */
    function resolveValidatePlans() {
        var plans = _model.test_plans || [];
        if (!plans.length) throw new Error('请先配置压测场景');
        if (isStudioV2MergedHead()) {
            var picked = findPlan(_selected.planId) || plans[0];
            return picked ? [picked] : plans;
        }
        return plans;
    }

    function collectAllThreadGroupsForValidatePlan(plan, includeGlobalTgs) {
        var out = [];
        if (includeGlobalTgs) (_model.setup_thread_groups || []).forEach(function (tg, i) {
            if (!tg) return;
            out.push({
                tg: tg,
                kind: 'setup',
                labelSuffix: '[SetUp] ' + stripSetupDisplayPrefix(String(tg.name || ('组 ' + (i + 1))))
            });
        });
        (plan.thread_groups || []).forEach(function (tg, i) {
            if (!tg) return;
            out.push({
                tg: tg,
                kind: 'main',
                labelSuffix: String(tg.name || ('组 ' + (i + 1)))
            });
        });
        if (includeGlobalTgs) (_model.post_thread_groups || []).forEach(function (tg, i) {
            if (!tg) return;
            out.push({
                tg: tg,
                kind: 'post',
                labelSuffix: '[tearDown] ' + stripPostDisplayPrefix(String(tg.name || ('组 ' + (i + 1))))
            });
        });
        return out;
    }

    function validateVisualProcessorItem(p, label) {
        if (!p || !p.type) throw new Error(label + '：类型无效');
        if (!p.name || !String(p.name).trim()) throw new Error(label + '：名称不能为空');
        if (p.type === 'json_post') {
            if (!String(p.var || '').trim()) throw new Error(label + '：请填写变量名');
            if (!String(p.json_path || '').trim()) throw new Error(label + '：请填写 JSON Path');
        } else if (p.type === 'regex_extract') {
            if (!String(p.refname || '').trim()) throw new Error(label + '：请填写引用名称');
            if (!String(p.regex || '').trim()) throw new Error(label + '：请填写正则表达式');
        } else if (p.type === 'xpath_extract') {
            if (!String(p.refname || '').trim()) throw new Error(label + '：请填写引用名称');
            if (!String(p.xpath_query || '').trim()) throw new Error(label + '：请填写 XPath');
        } else if (p.type === 'jdbc_post') {
            if (!String(p.query || '').trim()) throw new Error(label + '：请填写 SQL 查询');
        }
    }

    function validateVisualAssertions(list, label, useTgResolver) {
        (list || []).forEach(function (a, i) {
            if (!a || a._deleted || a.enabled === false) return;
            var aLabel = label + ' / 断言[' + (i + 1) + ']';
            if (useTgResolver && global.JmsTgAssertResolver &&
                typeof global.JmsTgAssertResolver.isValidAssertion === 'function') {
                if (!global.JmsTgAssertResolver.isValidAssertion(a)) {
                    throw new Error(aLabel + ' 无效或不完整');
                }
                return;
            }
            if (global.JmsStepAssertResolver &&
                typeof global.JmsStepAssertResolver.isValidAssertion === 'function') {
                if (!global.JmsStepAssertResolver.isValidAssertion(a)) {
                    throw new Error(aLabel + ' 无效或不完整');
                }
                return;
            }
            if (!a.type) throw new Error(aLabel + ' 类型无效');
        });
    }

    function countVisualHostMounts(host, label, useTgAssertions, skipAssertions) {
        var count = 0;
        (host.pre_processors || []).forEach(function (p, i) {
            if (!p || p._deleted) return;
            validateVisualProcessorItem(p, label + ' / 前置处理器[' + (i + 1) + ']');
            count += 1;
        });
        (host.processors || []).forEach(function (p, i) {
            if (!p || p._deleted) return;
            validateVisualProcessorItem(p, label + ' / 后置处理器[' + (i + 1) + ']');
            count += 1;
        });
        if (!skipAssertions) {
            var assertions = useTgAssertions ? (host.assertions || []) : getStepAssertions(host);
            validateVisualAssertions(assertions, label, !!useTgAssertions);
            assertions.forEach(function (a) {
                if (a && !a._deleted && a.enabled !== false) count += 1;
            });
        }
        if (host.constant_timer && host.constant_timer.enabled) {
            var delay = Number(host.constant_timer.delay_ms);
            if (!Number.isFinite(delay) || delay < 0) {
                throw new Error(label + ' / 固定定时器：delay_ms 须 ≥ 0');
            }
            count += 1;
        }
        if (host.user_parameters && host.user_parameters.enabled) {
            var params = host.user_parameters.params || [];
            if (!params.length) throw new Error(label + ' / 用户参数：请至少添加一组参数');
            params.forEach(function (row, i) {
                if (!row || !String(row.key || '').trim()) {
                    throw new Error(label + ' / 用户参数第 ' + (i + 1) + ' 项：参数名不能为空');
                }
            });
            count += 1;
        }
        return count;
    }

    function validateVisualTgConfigItems(items, label) {
        var count = 0;
        (items || []).forEach(function (item, i) {
            if (!item || !item.type) return;
            var data = item.data || {};
            if (data.enabled === false) return;
            var itemLabel = label + ' / 配置元件「' + (item.name || item.type || ('项 ' + (i + 1))) + '」';
            if (item.type === 'csv_data_set') {
                if (!String(data.filename || '').trim() && !String(data.file_content || '').trim()) {
                    throw new Error(itemLabel + '：请填写 CSV 文件名或文件内容');
                }
            } else if (item.type === 'counter') {
                if (!String(data.variable_name || '').trim()) {
                    throw new Error(itemLabel + '：请填写计数器变量名');
                }
            }
            count += 1;
        });
        return count;
    }

    function validateVisualStepTreeFull(steps, tgLabel) {
        var count = 0;
        (steps || []).forEach(function (step) {
            if (!step) return;
            var label = tgLabel + ' / ' + stepKindLabel(step);
            if (isLogicContainerStep(step)) {
                validateVisualLogicContainer(step, label);
                count += countVisualHostMounts(step, label, true);
                count += validateVisualStepTreeFull(step.children || [], tgLabel);
            } else if (isAuxStep(step)) {
                validateVisualAuxStep(step, label);
                count += 1;
            } else if (isCatalogLeafNonHttpStep(step)) {
                validateVisualAuxStep(step, label);
                count += 1;
            } else if (isHttpStep(step)) {
                validateVisualStep(step, label);
                count += countVisualHostMounts(step, label, false, true);
                count += 1;
            }
        });
        return count;
    }

    function validateVisualThreadGroupFull(entry, planLabel) {
        var tg = entry.tg;
        var tgLabel = planLabel + ' / 线程组「' + entry.labelSuffix + '」';
        if (!tg.name || !String(tg.name).trim()) throw new Error(tgLabel + '：名称不能为空');
        validateLoad(tg.load, tgLabel);
        var componentCount = 0;
        componentCount += countVisualHostMounts(tg, tgLabel + ' / 线程组挂载', true);
        componentCount += validateVisualTgConfigItems(tg.config_items, tgLabel);
        var steps = tg.steps || [];
        if (!steps.length) throw new Error(tgLabel + '：至少需要一个步骤');
        var stepCount = validateVisualStepTreeFull(steps, tgLabel);
        if (stepCount < 1) throw new Error(tgLabel + '：至少需要一个 HTTP 请求或有效步骤');
        return { stepCount: stepCount, componentCount: componentCount };
    }

    function validateVisualCurrentPlanFull() {
        readModelFromDom();
        if (!_model) throw new Error('场景模型为空');

        /* 场景与监控 UI 已移除：走独立可选校验，避免强制 root base_url */
        var _smOpt = global.JmsSceneMonitorValidateOptionalV1;
        if (_smOpt && typeof _smOpt.validateVisualSceneFieldsOptional === 'function') {
            _smOpt.validateVisualSceneFieldsOptional(_model, { parseBaseUrl: parseBaseUrlSimple });
        } else if (document.getElementById('btn-scene-monitor') || document.getElementById('modal-scene-monitor')) {
            parseBaseUrlSimple(_model.base_url);
            if (!_model.env || !String(_model.env).trim()) throw new Error('场景与监控：请填写 env');
            var infLegacy = _model.influxdb || {};
            if (infLegacy.enabled !== false) {
                if (!infLegacy.url || !String(infLegacy.url).trim()) throw new Error('场景与监控：请填写 Influx URL');
                if (!infLegacy.application || !String(infLegacy.application).trim()) {
                    throw new Error('场景与监控：请填写 Influx application');
                }
            }
        }
        var inf = _model.influxdb || {};

        var plans = resolveValidatePlans();
        var tgCount = 0;
        var stepCount = 0;
        var componentCount = 0;
        var planNames = [];

        plans.forEach(function (plan, pi) {
            var planLabel = '压测场景「' + (plan.name || '场景') + '」';
            if (!plan.name || !String(plan.name).trim()) throw new Error(planLabel + '：名称不能为空');
            planNames.push(String(plan.name || '场景'));
            var allTgs = collectAllThreadGroupsForValidatePlan(plan, pi === 0);
            if (!allTgs.length) throw new Error(planLabel + '：至少需要一个线程组');
            allTgs.forEach(function (entry) {
                tgCount += 1;
                var tgResult = validateVisualThreadGroupFull(entry, planLabel);
                stepCount += tgResult.stepCount;
                componentCount += tgResult.componentCount;
            });
        });

        syncYamlFromModel();
        return {
            tgCount: tgCount,
            stepCount: stepCount,
            componentCount: componentCount,
            planCount: plans.length,
            planName: planNames.join('、'),
            application: inf.application ? String(inf.application).trim() : ''
        };
    }

    function validateVisualLogicContainer(step, label) {
        if (!step.name || !String(step.name).trim()) throw new Error(label + '：名称不能为空');
        var props = step.catalog_props || {};
        if (isIfStep(step) && !String(props.condition || step.condition || '').trim()) {
            throw new Error(label + '：条件表达式不能为空');
        }
        var loopForever = !!(step.loop_forever || props.loop_forever);
        if (isLoopStep(step) && !loopForever) {
            var loopCount = Number(step.loops != null ? step.loops : props.loops);
            if (!Number.isFinite(loopCount) || loopCount < 1) {
                throw new Error(label + '：loops 须 ≥ 1');
            }
        }
    }

    function validateVisualAuxStep(step, label) {
        if (!step.name || !String(step.name).trim()) throw new Error(label + '：名称不能为空');
    }

    function validateVisualStepTree(steps, tgLabel) {
        var count = 0;
        (steps || []).forEach(function (step) {
            if (!step) return;
            var label = tgLabel + ' / ' + stepKindLabel(step);
            if (isLogicContainerStep(step)) {
                validateVisualLogicContainer(step, label);
                count += validateVisualStepTree(step.children || [], tgLabel);
            } else if (isAuxStep(step)) {
                validateVisualAuxStep(step, label);
                count += 1;
            } else if (isCatalogLeafNonHttpStep(step)) {
                validateVisualAuxStep(step, label);
                count += 1;
            } else if (isHttpStep(step)) {
                validateVisualStep(step, label);
                count += 1;
            }
        });
        return count;
    }

    function buildValidateHttpView(step) {
        var C = compat();
        if (!C || !C.isHttpSampler(step) || !step.catalog_props) return step;
        var p = step.catalog_props;
        var view = Object.assign({}, step);
        if (!String(view.method || '').trim() && p.method) view.method = p.method;
        if (!String(view.path || '').trim() && p.path != null) view.path = p.path;
        if (!view.body_type && p.body_type) view.body_type = p.body_type;
        if ((view.body === undefined || view.body === null) && p.body !== undefined) view.body = p.body;
        if (!view.form_params && p.form_params) view.form_params = p.form_params;
        if (!view.extract_var && p.extract && p.extract.var) view.extract_var = p.extract.var;
        if (!view.extract_json_path && p.extract && p.extract.json_path) view.extract_json_path = p.extract.json_path;
        if (!view.extractors && p.extractors) view.extractors = p.extractors;
        if (!view.assertions && p.assertions) view.assertions = p.assertions;
        if (!view.body_params && p.form_params && typeof p.form_params === 'object') {
            view.body_params = Object.keys(p.form_params).map(function (k) {
                return { key: k, value: p.form_params[k] };
            });
        }
        if (p.multipart) {
            if (!view.upload_files && p.multipart.files) view.upload_files = p.multipart.files;
            if (!view.multipart_fields && p.multipart.fields && typeof p.multipart.fields === 'object') {
                view.multipart_fields = Object.keys(p.multipart.fields).map(function (k) {
                    return { key: k, value: p.multipart.fields[k] };
                });
            }
        }
        return view;
    }

    function inferBodyTypeForValidate(s) {
        var t = inferBodyTypeFromStep(s);
        if (t !== 'none') return t;
        if (s && s.form_params && typeof s.form_params === 'object' && Object.keys(s.form_params).length) return 'form';
        return t;
    }

    function validateVisualStep(step, label) {
        if (!step.name || !String(step.name).trim()) throw new Error(label + '：请求名称不能为空');
        var vstep = buildValidateHttpView(step);
        var method = String(vstep.method || '').toUpperCase();
        if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method)) {
            throw new Error(label + '：HTTP 方法无效');
        }
        var path = String(vstep.path || '').trim();
        if (!path) throw new Error(label + '：path 不能为空');
        var _pathV = global.JmsHttpPathValidateV1;
        if (_pathV && typeof _pathV.assertJmeterHttpPath === 'function') {
            _pathV.assertJmeterHttpPath(path, label);
        } else if (path.charAt(0) !== '/') {
            throw new Error(label + '：path 须以 / 开头');
        }
        var bodyType = inferBodyTypeForValidate(vstep);
        if (['none', 'json', 'form', 'multipart'].indexOf(bodyType) < 0) {
            throw new Error(label + '：body_type 无效');
        }
        if (bodyType === 'multipart') {
            (vstep.upload_files || []).forEach(function (f, i) {
                if (!f || !String(f.path || '').trim()) return;
                if (!String(f.param || '').trim()) {
                    throw new Error(label + '：文件上传第 ' + (i + 1) + ' 项须填写参数名');
                }
            });
        }
        syncStepExtractFields(vstep);
        if (global.JmsStepExtractEditor) {
            global.JmsStepExtractEditor.validateExtractors(vstep.extractors || [], label);
        } else {
            var extPath = (vstep.extract_json_path || '').trim();
            var extVar = (vstep.extract_var || '').trim();
            if ((extPath && !extVar) || (!extPath && extVar)) {
                throw new Error(label + '：JSON 提取须同时填写 json_path 与 var');
            }
        }
        getStepAssertions(vstep).forEach(function (a, i) {
            if (global.JmsStepAssertResolver &&
                typeof global.JmsStepAssertResolver.isValidAssertion === 'function') {
                if (!global.JmsStepAssertResolver.isValidAssertion(a)) {
                    throw new Error(label + '：断言[' + (i + 1) + '] 无效或不完整');
                }
                return;
            }
            if (!a || !a.type) throw new Error(label + '：断言[' + (i + 1) + '] 类型无效');
        });
    }

    function validateVisual() {
        return validateVisualCurrentPlanFull();
    }

    function setEditorMode(mode) {
        var visual = document.getElementById('jms-visual-wrap');
        var yamlWrap = document.getElementById('jms-yaml-wrap');
        var visualToolbar = document.getElementById('jms-visual-toolbar');
        var yamlToolbar = document.getElementById('jms-yaml-toolbar');
        document.querySelectorAll('.jms-editor-mode-btn').forEach(function (btn) {
            var on = btn.getAttribute('data-mode') === mode;
            btn.classList.toggle('is-active', on);
        });
        if (visualToolbar) visualToolbar.classList.toggle('hidden', mode === 'yaml');
        if (yamlToolbar) yamlToolbar.classList.toggle('hidden', mode !== 'yaml');
        if (mode === 'yaml') {
            readModelFromDom();
            syncYamlFromModel();
            if (visual) visual.classList.add('hidden');
            if (yamlWrap) yamlWrap.classList.remove('hidden');
        } else {
            try {
                if (_api && _api.yamlInput) {
                    _model = yamlToModel(_api.yamlInput.value);
                }
            } catch (e) {
                if (_api && _api.showMsg) _api.showMsg('无法载入 YAML：' + (e.message || e), false);
            }
            if (visual) visual.classList.remove('hidden');
            if (yamlWrap) yamlWrap.classList.add('hidden');
            render();
            syncYamlFromModel();
        }
        if (_api && typeof _api.updateValidateButtonLabel === 'function') {
            _api.updateValidateButtonLabel();
        }
    }

    function init(api) {
        _api = api;
        _suppressDirty = true;
        _model = defaultModel();

        var visualRoot = document.getElementById('jms-visual-root');
        var visualToolbar = document.getElementById('jms-visual-toolbar');
        if (visualRoot) {
            visualRoot.addEventListener('click', onVisualClick);
            visualRoot.addEventListener('input', function (ev) {
                if (ev.target.closest('.jms-plan-card, .jms-tg-block, .jms-http-card')) notifyUserEdit();
            });
            visualRoot.addEventListener('change', function () {
                notifyUserEdit();
                scheduleRender();
            });
        }
        if (visualToolbar) {
            visualToolbar.addEventListener('click', onVisualClick);
        }
        var studioPlanToolbar = document.getElementById('jms-studio-plan-toolbar');
        if (studioPlanToolbar) {
            studioPlanToolbar.addEventListener('click', onVisualClick);
            studioPlanToolbar.addEventListener('input', function (ev) {
                if (ev.target.closest('.jms-plan-name')) notifyUserEdit();
            });
        }

        var btnScene = document.getElementById('btn-scene-monitor');
        var btnSceneCancel = document.getElementById('btn-scene-cancel');
        var btnSceneApply = document.getElementById('btn-scene-apply');
        var btnTgLoad = document.getElementById('btn-tg-load-config');
        var btnTgLoadCancel = document.getElementById('btn-tg-load-cancel');
        var btnTgLoadApply = document.getElementById('btn-tg-load-apply');
        if (btnScene) btnScene.addEventListener('click', openSceneMonitorModal);
        if (btnSceneCancel) btnSceneCancel.addEventListener('click', closeSceneMonitorModal);
        if (btnSceneApply) btnSceneApply.addEventListener('click', function () {
            try {
                applySceneMonitorModal();
                notifyUserEdit();
                if (_api && _api.showMsg) _api.showMsg('已保存场景与监控配置。', true);
            } catch (e) { if (_api && _api.showMsg) _api.showMsg(e.message || String(e), false); }
        });
        if (btnTgLoad) btnTgLoad.addEventListener('click', openTgLoadModal);
        if (btnTgLoadCancel) btnTgLoadCancel.addEventListener('click', closeTgLoadModal);
        if (btnTgLoadApply) btnTgLoadApply.addEventListener('click', function () {
            try {
                applyTgLoadModal();
                notifyUserEdit();
                if (_api && _api.showMsg) _api.showMsg('已保存压测负载配置。', true);
            } catch (e) { if (_api && _api.showMsg) _api.showMsg(e.message || String(e), false); }
        });
        var modalScene = document.getElementById('modal-scene-monitor');
        var modalTgLoad = document.getElementById('modal-tg-load');
        if (modalScene) modalScene.addEventListener('click', function (ev) { if (ev.target === modalScene) closeSceneMonitorModal(); });
        if (modalTgLoad) modalTgLoad.addEventListener('click', function (ev) { if (ev.target === modalTgLoad) closeTgLoadModal(); });

        document.querySelectorAll('.jms-editor-mode-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setEditorMode(btn.getAttribute('data-mode'));
            });
        });

        var stepModal = document.getElementById('modal-step-edit');
        if (stepModal) {
            stepModal.addEventListener('click', function (ev) {
                if (ev.target === stepModal) closeStepEditor();
                else handleStepEditModalClick(ev);
            });
        }

        var tgConfigTabsWrap = document.getElementById('tg-config-tabs-wrap');
        if (tgConfigTabsWrap) {
            tgConfigTabsWrap.addEventListener('click', function (ev) {
                var tabBtn = ev.target.closest('.jms-tg-config-tab-btn');
                if (tabBtn) setTgConfigTab(tabBtn.getAttribute('data-tab'));
            });
        }
        var tgPickerTrigger = document.getElementById('tg-config-picker-trigger');
        if (tgPickerTrigger) {
            tgPickerTrigger.addEventListener('click', function (ev) {
                ev.stopPropagation();
                toggleTgConfigPickerMenu();
            });
        }
        document.querySelectorAll('.jms-tg-config-picker__option').forEach(function (opt) {
            opt.addEventListener('click', function (ev) {
                ev.stopPropagation();
                toggleTgConfigTypeFromDropdown(opt.getAttribute('data-tab'));
            });
        });

        var tgMgrModal = document.getElementById('modal-tg-http-mgr');
        if (tgMgrModal) {
            tgMgrModal.addEventListener('click', function (ev) {
                if (ev.target === tgMgrModal) closeTgMgrModal();
                if (ev.target.classList.contains('jms-cookie-del')) {
                    var crow = ev.target.closest('.jms-cookie-row');
                    if (crow) {
                        var clist = crow.parentElement;
                        crow.remove();
                        if (clist && !clist.querySelector('.jms-cookie-row')) {
                            clist.innerHTML = '<p class="jms-empty-hint">暂无 Cookie，点击下方添加</p>';
                        }
                    }
                }
                if (ev.target.classList.contains('jms-kv-del') && ev.target.closest('#tg-hm-headers')) {
                    var hrow = ev.target.closest('.jms-kv-row');
                    if (hrow) hrow.remove();
                }
            });
        }
        var tgMgrCancel = document.getElementById('btn-tg-mgr-cancel');
        var tgMgrSave = document.getElementById('btn-tg-mgr-save');
        if (tgMgrCancel) tgMgrCancel.addEventListener('click', closeTgMgrModal);
        if (tgMgrSave) tgMgrSave.addEventListener('click', saveTgMgrModal);
        var btnTgHmAdd = document.getElementById('btn-tg-hm-add-header');
        if (btnTgHmAdd) {
            btnTgHmAdd.addEventListener('click', function () {
                var list = document.getElementById('tg-hm-headers');
                var hint = list.querySelector('.jms-empty-hint');
                if (hint) hint.remove();
                list.insertAdjacentHTML('beforeend',
                    '<div class="jms-kv-row"><input type="text" class="jms-kv-key hf-mono" placeholder="头名称" />' +
                    '<input type="text" class="jms-kv-val hf-mono" placeholder="值" />' +
                    '<button type="button" class="jms-kv-del" title="删除">×</button></div>');
            });
        }
        var btnTgCmAdd = document.getElementById('btn-tg-cm-add-cookie');
        if (btnTgCmAdd) {
            btnTgCmAdd.addEventListener('click', function () {
                var list = document.getElementById('tg-cm-cookies');
                var hint = list.querySelector('.jms-empty-hint');
                if (hint) hint.remove();
                list.insertAdjacentHTML('beforeend',
                    '<div class="jms-cookie-row">' +
                    '<input type="text" class="jms-cookie-name hf-mono" placeholder="名称" />' +
                    '<input type="text" class="jms-cookie-value hf-mono" placeholder="值" />' +
                    '<input type="text" class="jms-cookie-domain hf-mono" placeholder="域" />' +
                    '<input type="text" class="jms-cookie-path hf-mono" placeholder="路径" value="/" />' +
                    '<label class="jms-cookie-secure-lbl" title="Secure"><input type="checkbox" class="jms-cookie-secure" /> S</label>' +
                    '<button type="button" class="jms-cookie-del" title="删除">×</button></div>');
            });
        }
        if (global.JmsTgCsvDataSetUi && typeof global.JmsTgCsvDataSetUi.bindLegacyMgrCsvBrowse === 'function') {
            global.JmsTgCsvDataSetUi.bindLegacyMgrCsvBrowse({
                onApplied: function (applied) {
                    if (!_tgMgrTarget || !applied) return;
                    readModelFromDom();
                    var plan = findPlan(_tgMgrTarget.planId);
                    var tg = plan && findTg(plan, _tgMgrTarget.tgId);
                    if (!tg) return;
                    if (!tg.http_managers) tg.http_managers = defaultHttpManagers();
                    if (!tg.http_managers.csv_data_set) tg.http_managers.csv_data_set = defaultHttpManagers().csv_data_set;
                    tg.http_managers.csv_data_set.file_content = applied.file_content || '';
                    if (applied.filename) tg.http_managers.csv_data_set.filename = applied.filename;
                    notifyUserEdit();
                }
            });
        }

        (function bindLegacyIfModalOnce() {
            var ifModal = document.getElementById('modal-if-edit');
            if (!ifModal || ifModal.dataset.jmsLegacyIfBound === '1') return;
            ifModal.dataset.jmsLegacyIfBound = '1';
            ifModal.addEventListener('click', function (ev) {
                if (ev.target === ifModal) closeIfEditor();
            });
            var ifCancel = document.getElementById('btn-if-edit-cancel');
            var ifSave = document.getElementById('btn-if-edit-save');
            if (ifCancel) ifCancel.addEventListener('click', closeIfEditor);
            if (ifSave) ifSave.addEventListener('click', saveIfEditor);
        })();

        var bsModal = document.getElementById('modal-beanshell-edit');
        if (bsModal && !(global.JmsTgBeanshellPostUi && typeof global.JmsTgBeanshellPostUi.openEditor === 'function')) {
            bsModal.addEventListener('click', function (ev) {
                if (ev.target === bsModal) closeBeanShellEditor();
            });
        }
        var bsCancel = document.getElementById('btn-beanshell-edit-cancel');
        var bsSave = document.getElementById('btn-beanshell-edit-save');
        if (bsCancel && !(global.JmsTgBeanshellPostUi && typeof global.JmsTgBeanshellPostUi.openEditor === 'function')) {
            bsCancel.addEventListener('click', closeBeanShellEditor);
        }
        if (bsSave && !(global.JmsTgBeanshellPostUi && typeof global.JmsTgBeanshellPostUi.openEditor === 'function')) {
            bsSave.addEventListener('click', saveBeanShellEditor);
        }

        {
            var dbgModal = document.getElementById('modal-debug-edit');
            if (dbgModal && dbgModal.dataset.jmsDebugEditBound !== '1') {
                dbgModal.dataset.jmsDebugEditBound = '1';
                dbgModal.addEventListener('click', function (ev) {
                    if (ev.target === dbgModal) closeDebugEditor();
                });
            }
            var dbgCancel = document.getElementById('btn-debug-edit-cancel');
            var dbgSave = document.getElementById('btn-debug-edit-save');
            if (dbgCancel && dbgCancel.dataset.jmsDebugEditBound !== '1') {
                dbgCancel.dataset.jmsDebugEditBound = '1';
                dbgCancel.addEventListener('click', closeDebugEditor);
            }
            if (dbgSave && dbgSave.dataset.jmsDebugEditBound !== '1') {
                dbgSave.dataset.jmsDebugEditBound = '1';
                dbgSave.addEventListener('click', saveDebugEditor);
            }
        }

        var stepCancel = document.getElementById('btn-step-edit-cancel');
        var stepSave = document.getElementById('btn-step-edit-save');
        if (stepCancel) stepCancel.addEventListener('click', closeStepEditor);
        if (stepSave) stepSave.addEventListener('click', saveStepEditor);

        document.getElementById('btn-step-add-user-param') && document.getElementById('btn-step-add-user-param').addEventListener('click', function () {
            var list = document.getElementById('step-edit-user-params-list');
            if (!list) return;
            var hint = list.querySelector('.jms-empty-hint');
            if (hint) hint.remove();
            list.insertAdjacentHTML('beforeend',
                '<div class="jms-kv-row"><input type="text" class="jms-kv-key hf-mono" placeholder="参数名" />' +
                '<input type="text" class="jms-kv-val hf-mono" placeholder="值" />' +
                '<button type="button" class="jms-kv-del" title="删除">×</button></div>');
        });

        document.querySelectorAll('.jms-step-mode-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.jms-step-mode-btn').forEach(function (b) {
                    b.classList.toggle('is-active', b === btn);
                });
                var m = btn.getAttribute('data-mode');
                document.getElementById('step-edit-form-panel').classList.toggle('hidden', m !== 'form');
                document.getElementById('step-edit-yaml-panel').classList.toggle('hidden', m !== 'yaml');
            });
        });

        document.getElementById('btn-step-add-header') && document.getElementById('btn-step-add-header').addEventListener('click', function () {
            var list = document.getElementById('step-edit-headers');
            list.insertAdjacentHTML('beforeend',
                '<div class="jms-kv-row"><input type="text" class="jms-kv-key hf-mono" placeholder="键" />' +
                '<input type="text" class="jms-kv-val hf-mono" placeholder="值" />' +
                '<button type="button" class="jms-kv-del" title="删除">×</button></div>');
        });
        document.getElementById('btn-step-add-body-param') && document.getElementById('btn-step-add-body-param').addEventListener('click', function () {
            var list = document.getElementById('step-edit-body-params');
            var hint = list.querySelector('.jms-empty-hint');
            if (hint) hint.remove();
            list.insertAdjacentHTML('beforeend',
                '<div class="jms-kv-row"><input type="text" class="jms-kv-key hf-mono" placeholder="参数名" />' +
                '<input type="text" class="jms-kv-val hf-mono" placeholder="值" />' +
                '<button type="button" class="jms-kv-del" title="删除">×</button></div>');
            updateStepBodyPanels();
        });
        document.getElementById('btn-step-add-mp-field') && document.getElementById('btn-step-add-mp-field').addEventListener('click', function () {
            var list = document.getElementById('step-edit-multipart-fields');
            var hint = list.querySelector('.jms-empty-hint');
            if (hint) hint.remove();
            list.insertAdjacentHTML('beforeend',
                '<div class="jms-kv-row"><input type="text" class="jms-kv-key hf-mono" placeholder="字段名" />' +
                '<input type="text" class="jms-kv-val hf-mono" placeholder="值" />' +
                '<button type="button" class="jms-kv-del" title="删除">×</button></div>');
        });
        document.getElementById('btn-step-add-upload-file') && document.getElementById('btn-step-add-upload-file').addEventListener('click', function () {
            var list = document.getElementById('step-edit-upload-files');
            var hint = list.querySelector('.jms-empty-hint');
            if (hint) hint.remove();
            list.insertAdjacentHTML('beforeend',
                '<div class="jms-file-row"><input type="text" class="jms-file-param hf-mono" placeholder="参数名 file" />' +
                '<input type="text" class="jms-file-path hf-mono" placeholder="本地路径" />' +
                '<input type="text" class="jms-file-mime hf-mono" placeholder="MIME 可选" />' +
                '<button type="button" class="jms-file-del" title="删除">×</button></div>');
        });
        var stepMethodEl = document.getElementById('step-edit-method');
        if (stepMethodEl) stepMethodEl.addEventListener('change', updateStepBodyPanels);
        var stepBodyTa = document.getElementById('step-edit-body');
        if (stepBodyTa) {
            stepBodyTa.addEventListener('input', updateStepBodyPanels);
        }
        var stepBodyParamsEl = document.getElementById('step-edit-body-params');
        if (stepBodyParamsEl) {
            stepBodyParamsEl.addEventListener('input', updateStepBodyPanels);
        }
        document.querySelectorAll('.jms-step-body-mode-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (btn.disabled) return;
                if (isBodyModeLocked() && !btn.classList.contains('is-active')) {
                    if (_api && _api.showMsg) _api.showMsg('已填写请求体内容，请先清空再切换。', false);
                    return;
                }
                setActiveBodyContentMode(btn.getAttribute('data-body-mode'));
                updateStepBodyPanels();
            });
        });
        if (api.yamlInput && api.yamlInput.value) {
            try {
                _model = yamlToModel(api.yamlInput.value);
            } catch (e) { /* keep default */ }
        }
        setEditorMode('visual');
        _suppressDirty = false;
    }



    function appendAuxStep(planId, tgId, auxType) {
        if (global.JmsCatalogOnlyAppend && typeof global.JmsCatalogOnlyAppend.append === 'function') {
            global.JmsCatalogOnlyAppend.append({
                planId: planId,
                tgId: tgId,
                parentStepId: null,
                auxType: auxType
            });
        }
        return null;
    }

    function appendAuxStepToParent(planId, tgId, parentStepId, auxType) {
        if (!parentStepId) return null;
        if (global.JmsCatalogOnlyAppend && typeof global.JmsCatalogOnlyAppend.append === 'function') {
            global.JmsCatalogOnlyAppend.append({
                planId: planId,
                tgId: tgId,
                parentStepId: parentStepId,
                auxType: auxType
            });
        }
        return null;
    }

    function listIfControllersInTg(planId, tgId) {
        readModelFromDom();
        var plan = findPlan(planId);
        var tg = plan && findTg(plan, tgId);
        if (!tg) return [];
        var out = [];
        function walk(list, depth) {
            (list || []).forEach(function (s) {
                if (!s || !isIfStep(s)) return;
                out.push({
                    id: s.id,
                    name: s.name || 'If 控制器',
                    condition: s.condition || '',
                    depth: depth
                });
                walk(s.children, depth + 1);
            });
        }
        walk(tg.steps, 0);
        return out;
    }

    function getHttpStepContainer(tg, ifStepId) {
        if (!ifStepId) {
            if (!tg.steps) tg.steps = [];
            return tg.steps;
        }
        var ifStep = findStepInList(tg.steps, ifStepId);
        if (!ifStep || !isLogicContainerStep(ifStep)) throw new Error('未找到逻辑控制器');
        if (!ifStep.children) ifStep.children = [];
        return ifStep.children;
    }

    function nextHttpStepName(container) {
        var n = 0;
        (container || []).forEach(function (s) {
            if (s && (s.method || (!isLogicContainerStep(s) && !isBeanShellStep(s) && !isDebugStep(s) && !isJsonPostAuxStep(s) && !isRegexExtractAuxStep(s) && !isXPathExtractAuxStep(s) && !isJsr223PostAuxStep(s)))) n += 1;
        });
        return 'HTTP 请求 ' + (n + 1);
    }


    function getStepListForParent(tg, parentIfStepId) {
        if (!parentIfStepId) {
            if (!tg.steps) tg.steps = [];
            return tg.steps;
        }
        var ifStep = findStepInList(tg.steps, parentIfStepId);
        if (!ifStep || !isLogicContainerStep(ifStep)) return null;
        if (!ifStep.children) ifStep.children = [];
        return ifStep.children;
    }


    function reorderTreeTimelineByIndex(planId, tgId, fromIndex, toIndex) {
        if (!_model || fromIndex === toIndex) return false;
        var plan = findPlan(planId);
        var tg = plan && findTg(plan, tgId);
        if (!tg) return false;
        var Timeline = global.JmsTgDetailTimeline;
        if (!Timeline || typeof Timeline.canUse !== 'function' || !Timeline.canUse(tg)) {
            Timeline = global.JmsTgImportTimeline;
        }
        if (!Timeline || typeof Timeline.reorderTopLevel !== 'function') return false;
        var ok = Timeline.reorderTopLevel(tg, fromIndex, toIndex);
        if (!ok) return false;
        notifyUserEdit();
        scheduleRender();
        return true;
    }

    function reorderTreeStepByIndex(planId, tgId, fromIndex, toIndex, parentIfStepId) {
        if (!_model || fromIndex === toIndex) return false;
        var plan = findPlan(planId);
        var tg = plan && findTg(plan, tgId);
        if (!tg) return false;
        var list = getStepListForParent(tg, parentIfStepId || null);
        if (!list || fromIndex < 0 || fromIndex >= list.length) return false;
        toIndex = Math.max(0, Math.min(toIndex, list.length - 1));
        if (fromIndex === toIndex) return true;
        var item = list.splice(fromIndex, 1)[0];
        list.splice(toIndex, 0, item);
        notifyUserEdit();
        scheduleRender();
        return true;
    }


    function notifyIfChildAppended(tg, ifStepId, childStep) {
        if (!ifStepId || !childStep || !childStep.id) return;
        var ifStep = findStepInList(tg.steps, ifStepId);
        if (!ifStep || !isIfStep(ifStep)) return;
        var H = global.JmsIfMountSaveHelper;
        if (H && typeof H.notifyMountAdded === 'function') {
            H.notifyMountAdded(ifStep, 'ifchild:' + childStep.id);
        }
    }

    /** 按类型添加线程组（setup / teardown / thread），供 JmsTgAddChoiceUi 调用 */
    function addThreadGroupByKind(planId, kind) {
        readModelFromDom();
        var plan = findPlan(planId);
        if (!plan) throw new Error('未找到测试计划');
        var tgKind = String(kind || 'thread').toLowerCase();
        var tg = defaultThreadGroup();
        var activeKey = tg.id;

        if (tgKind === 'setup') {
            if (!_model.setup_thread_groups) _model.setup_thread_groups = [];
            tg.name = 'SetUp 线程组 ' + (_model.setup_thread_groups.length + 1);
            _model.setup_thread_groups.push(tg);
            activeKey = 'setup:' + tg.id;
        } else if (tgKind === 'teardown' || tgKind === 'post') {
            if (!_model.post_thread_groups) _model.post_thread_groups = [];
            tg.name = 'tearDown 线程组 ' + (_model.post_thread_groups.length + 1);
            _model.post_thread_groups.push(tg);
            activeKey = 'post:' + tg.id;
        } else {
            tg.name = '线程组 ' + (plan.thread_groups.length + 1);
            plan.thread_groups.push(tg);
        }

        if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.assignOnAdd === 'function') {
            global.JmsTgDisplayOrder.assignOnAdd(_model, planId, tg);
        }

        _selected.planId = planId;
        _selected.tgId = tg.id;
        notifyUserEdit();
        scheduleRender();

        if (global.JmsTgTreeShell && typeof global.JmsTgTreeShell.switchThreadGroup === 'function') {
            var card = document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
            if (card) global.JmsTgTreeShell.switchThreadGroup(card, planId, activeKey);
        }
        return tg;
    }

    function addBlankHttpStepAt(planId, tgId, ifStepId) {
        if (global.JmsCatalogOnlyAppend && typeof global.JmsCatalogOnlyAppend.append === 'function') {
            global.JmsCatalogOnlyAppend.append({
                planId: planId,
                tgId: tgId,
                parentStepId: ifStepId || null,
                auxType: 'http_request'
            });
            return null;
        }
        throw new Error('官方元件菜单未就绪');
    }

    function addBlankHttpStep(planId, tgId) {
        return addBlankHttpStepAt(planId, tgId, null);
    }

    function addImportedStepAt(planId, tgId, stepObj, baseUrlHint, ifStepId) {
        readModelFromDom();
        var plan = findPlan(planId);
        var tg = plan && findTg(plan, tgId);
        if (!tg) throw new Error('未找到目标线程组');
        if (!stepObj || typeof stepObj !== 'object') throw new Error('Step 数据无效');
        var step = catalogStepFromYaml(stepObj);
        var container = getHttpStepContainer(tg, ifStepId || null);
        if (!step.name) step.name = nextHttpStepName(container);
        container.push(step);
        if (ifStepId) notifyIfChildAppended(tg, ifStepId, step);
        if (baseUrlHint) {
            if (!_model.base_url || String(_model.base_url).trim() === '' || _model.base_url === 'https://api.example.com') {
                _model.base_url = baseUrlHint;
            }
        }
        _selected.planId = planId;
        _selected.tgId = tgId;
        notifyUserEdit();
        syncYamlFromModel();
        scheduleRender();
        return step;
    }

    function addImportedStep(planId, tgId, stepObj, baseUrlHint) {
        return addImportedStepAt(planId, tgId, stepObj, baseUrlHint, null);
    }

    function beforeValidate() {
        var yamlWrap = document.getElementById('jms-yaml-wrap');
        if (yamlWrap && yamlWrap.classList.contains('hidden')) {
            readModelFromDom();
            syncYamlFromModel();
        }
    }

    function loadTemplate(yamlText) {
        _suppressDirty = true;
        try {
            _model = yamlToModel(yamlText);
            render();
            syncYamlFromModel();
        } catch (e) {
            if (_api && _api.showMsg) _api.showMsg(e.message || String(e), false);
        } finally {
            _suppressDirty = false;
        }
    }


    /** ---- JMeter AI 步骤助手桥接（独立扩展，不影响现有 API） ---- */

    function attachRefIdsToYamlTree(yamlList, internalList) {
        return (yamlList || []).map(function (y, i) {
            var s = (internalList || [])[i];
            if (s && s.id) y._ref_id = s.id;
            if (y.children && s && s.children) {
                y.children = attachRefIdsToYamlTree(y.children, s.children);
            }
            return y;
        });
    }

    function buildSingleTgYamlObject(tg) {
        var tgOut = {
            name: tg.name,
            load: {
                users: Number(tg.load.users) || 1,
                spawn_rate: Number(tg.load.spawn_rate) || 1,
                duration_sec: Number(tg.load.duration_sec) || 60,
                loops: tg.load.loops !== undefined ? Number(tg.load.loops) : -1
            },
            variables: varsToObj(tg.variables),
            steps: attachRefIdsToYamlTree(stepsToYamlTree(tg.steps || []), tg.steps || [])
        };
        if (tg.influx_scenario) {
            tgOut.influxdb = { tags: { scenario: tg.influx_scenario } };
        }
        var ls = tg.listeners || defaultTgListeners();
        if (ls.view_results_tree || ls.aggregate_report || ls.backend_listener) {
            tgOut.listeners = {};
            if (ls.view_results_tree) tgOut.listeners.view_results_tree = true;
            if (ls.aggregate_report) tgOut.listeners.aggregate_report = true;
            if (ls.backend_listener) tgOut.listeners.backend_listener = true;
        }
        if (tg.backend_listener && global.JmsBackendListenerCatalog) {
            tgOut.backend_listener = global.JmsBackendListenerCatalog.configToYaml(tg.backend_listener);
        }
        if (ls.view_results_tree && tg.view_results_tree && global.JmsTgViewResultsTreeCatalog) {
            tgOut.view_results_tree = global.JmsTgViewResultsTreeCatalog.configToYaml(tg.view_results_tree);
        }
        if (ls.aggregate_report && tg.aggregate_report && global.JmsTgAggregateReportCatalog) {
            tgOut.aggregate_report = global.JmsTgAggregateReportCatalog.configToYaml(tg.aggregate_report);
        }
        if (global.JmsTgListenerCatalogBridge && typeof global.JmsTgListenerCatalogBridge.omitLegacyTgListenerYaml === 'function') {
            global.JmsTgListenerCatalogBridge.omitLegacyTgListenerYaml(tg, tgOut);
        }
        var mgrYaml = httpManagersToYaml(tg.http_managers);
        if (mgrYaml) tgOut.http_managers = mgrYaml;
        if (tg.processors && tg.processors.length) tgOut.processors = tg.processors;
        if (tg._config_timeline_active) tgOut.config_timeline_active = true;
        if (Array.isArray(tg._removed_config_types) && tg._removed_config_types.length) {
            tgOut.removed_config_types = tg._removed_config_types.slice();
        }
        var cfgYamlTg = global.JmsTgConfigCatalog && global.JmsTgConfigCatalog.itemsToYaml(tg.config_items);
        if (cfgYamlTg) tgOut.config_items = cfgYamlTg;
        else if (tg._config_timeline_active) tgOut.config_items = [];
        appendTgAssertionsYaml(tgOut, tg);
        if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.applyYamlField === 'function') {
            global.JmsTgDisplayOrder.applyYamlField(tgOut, tg);
        }
        return tgOut;
    }

    function resolveActiveThreadGroupContext() {
        readModelFromDom();
        if (!_model || !_model.test_plans || !_model.test_plans.length) return null;
        var plan = _model.test_plans[0];
        var planId = plan.id;
        var activeKey = '';
        try {
            var raw = global.sessionStorage.getItem('lth_tg_tree_active');
            var map = raw ? JSON.parse(raw) : {};
            activeKey = map[planId] || '';
        } catch (e1) { /* ignore */ }
        if (global.JmsTgTreeRenderer && typeof global.JmsTgTreeRenderer.findActiveGroup === 'function') {
            var active = global.JmsTgTreeRenderer.findActiveGroup(_model, planId, activeKey);
            if (active && active.tg) {
                return {
                    planId: planId,
                    tgId: active.tg.id,
                    tgName: active.tg.name,
                    tgKind: active.kind || (active.isSetup ? 'setup' : (active.isPost ? 'post' : 'thread'))
                };
            }
        }
        var fallback = (plan.thread_groups || [])[0]
            || (_model.setup_thread_groups || [])[0]
            || (_model.post_thread_groups || [])[0];
        if (!fallback) return null;
        return { planId: planId, tgId: fallback.id, tgName: fallback.name, tgKind: 'thread' };
    }

    function exportThreadGroupYamlForAi(planId, tgId) {
        readModelFromDom();
        var plan = findPlan(planId);
        var tg = findTg(plan, tgId);
        if (!tg) throw new Error('未找到目标线程组');
        var tgOut = buildSingleTgYamlObject(tg);
        return jsyaml.dump(tgOut, { lineWidth: 120, noRefs: true });
    }

    function insertStepIntoList(list, step, insertAfterRefId, insertIndex) {
        if (insertAfterRefId) {
            var idx = -1;
            for (var i = 0; i < list.length; i += 1) {
                if (list[i] && list[i].id === insertAfterRefId) { idx = i; break; }
            }
            if (idx >= 0) {
                list.splice(idx + 1, 0, step);
                return true;
            }
        }
        if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= list.length) {
            list.splice(insertIndex, 0, step);
            return true;
        }
        list.push(step);
        return true;
    }

    function deepUpdateStepFromYaml(existing, yamlPatch) {
        if (!existing || !yamlPatch || typeof yamlPatch !== 'object') return existing;
        var cleaned = Object.assign({}, yamlPatch);
        delete cleaned._ref_id;
        delete cleaned.id;
        var hasChildren = Object.prototype.hasOwnProperty.call(cleaned, 'children');
        if (hasChildren) delete cleaned.children;
        var importedList = stepsFromYamlTree([Object.assign({ name: cleaned.name || existing.name }, cleaned)]);
        var imported = importedList && importedList[0];
        if (!imported) return existing;
        Object.keys(imported).forEach(function (k) {
            if (k === 'id' || k === 'children') return;
            existing[k] = imported[k];
        });
        if (hasChildren && isLogicContainerStep(existing) && Array.isArray(yamlPatch.children)) {
            existing.children = stepsFromYamlTree(yamlPatch.children);
        }
        return existing;
    }

    function applyAiStepOperations(planId, tgId, operations) {
        readModelFromDom();
        var plan = findPlan(planId);
        var tg = findTg(plan, tgId);
        if (!tg) throw new Error('未找到目标线程组');
        var results = { added: 0, updated: 0, errors: [] };
        (operations || []).forEach(function (op, i) {
            try {
                op = normalizeAiStepTreeOp(op);
                var action = String(op.action || '').toLowerCase();
                if (action === 'add') {
                    var stepObj = op.step;
                    if (!stepObj || typeof stepObj !== 'object') throw new Error('缺少 step 对象');
                    var clean = Object.assign({}, stepObj);
                    delete clean._ref_id;
                    var newStep = stepsFromYamlTree([clean])[0];
                    if (!newStep) throw new Error('无法解析步骤');
                    if (!newStep.id) newStep.id = uid();
                    var parentRef = op.parent_ref_id || op.parentRefId || null;
                    var list = getStepListForParent(tg, parentRef || null);
                    if (!list) throw new Error('父步骤不存在或非逻辑容器');
                    insertStepIntoList(list, newStep, op.insert_after_ref_id || op.insertAfterRefId || null, op.insert_index);
                    if (parentRef) notifyIfChildAppended(tg, parentRef, newStep);
                    results.added += 1;
                } else if (action === 'update') {
                    var refId = op.ref_id || op.refId;
                    if (!refId) throw new Error('缺少 ref_id');
                    var existing = findStepInList(tg.steps, refId);
                    if (!existing) throw new Error('步骤不存在: ' + refId);
                    deepUpdateStepFromYaml(existing, op.step || op.patch || {});
                    results.updated += 1;
                } else if (action === 'delete') {
                    throw new Error('不支持 delete 操作');
                } else {
                    throw new Error('未知 action: ' + action);
                }
            } catch (err) {
                results.errors.push({ index: i, error: err.message || String(err) });
            }
        });
        _selected.planId = planId;
        _selected.tgId = tgId;
        notifyUserEdit();
        syncYamlFromModel();
        scheduleRender();
        return results;
    }


    /** ---- JMeter AI 时间线助手桥接（Timeline JSON，与 YAML 桥接并存） ---- */

    function getAiTimelineRefId(entry, tg) {
        if (!entry) return '';
        if (entry.kind === 'tg_variables') return 'tg_variables';
        if (entry.kind === 'listener') return 'listener:' + String(entry.listenerKey || '');
        var ref = entry.ref;
        if (!ref) return '';
        if (entry.kind === 'assert') {
            if (!ref._ai_ref_id) ref._ai_ref_id = uid();
            return ref._ai_ref_id;
        }
        if (entry.kind === 'processor') {
            if (!ref.id) ref.id = uid();
            return ref.id;
        }
        if (ref.id) return ref.id;
        if (!ref._ai_ref_id) ref._ai_ref_id = uid();
        return ref._ai_ref_id;
    }

    function getAiTimelineSubtype(entry, tg) {
        if (!entry) return '';
        if (entry.kind === 'step') {
            var st = entry.ref || {};
            if (st.type) return String(st.type);
            return 'http';
        }
        if (entry.kind === 'assert') return String((entry.ref && entry.ref.type) || 'response_assert');
        if (entry.kind === 'config') return String((entry.ref && entry.ref.type) || '');
        if (entry.kind === 'processor') return String((entry.ref && entry.ref.type) || '');
        if (entry.kind === 'listener') return String(entry.listenerKey || '');
        if (entry.kind === 'tg_variables') return 'variables';
        return '';
    }

    function getAiTimelineName(entry, tg) {
        if (!entry) return '';
        var ref = entry.ref;
        if (entry.kind === 'tg_variables') return '用户定义的变量';
        if (entry.kind === 'listener') {
            var LT = global.JmsTgListenerTimeline;
            if (LT && typeof LT.listenerDisplayName === 'function') {
                return LT.listenerDisplayName(tg, entry.listenerKey);
            }
            return String(entry.listenerKey || '监听器');
        }
        if (!ref) return '';
        if (ref.name) return String(ref.name);
        if (entry.kind === 'config' && global.JmsTgConfigCatalog) {
            var labels = global.JmsTgConfigCatalog.LABELS || {};
            return labels[ref.type] || ref.type || '配置元件';
        }
        if (entry.kind === 'step') return ref.method ? (ref.method + ' ' + (ref.path || '')) : 'HTTP 步骤';
        if (entry.kind === 'assert') return ref.name || '断言';
        if (entry.kind === 'processor') return ref.name || '后置处理器';
        return entry.kind || '';
    }

    function buildAiTimelineSummary(entry, tg) {
        if (!entry) return '';
        var ref = entry.ref;
        if (entry.kind === 'tg_variables') {
            var rows = Array.isArray(tg && tg.variables) ? tg.variables : [];
            var parts = [];
            rows.forEach(function (row) {
                var k = row && String(row.key || '').trim();
                if (!k) return;
                parts.push(k + '=' + (row.value == null ? '' : String(row.value)));
            });
            return parts.join(', ') || '(空)';
        }
        if (entry.kind === 'step') {
            var s = ref || {};
            if (s.type && s.type !== 'http') return String(s.type);
            return String(s.method || 'GET') + ' ' + String(s.path || '/');
        }
        if (entry.kind === 'assert') {
            var a = ref || {};
            if (a.type === 'response_assert' && Array.isArray(a.patterns)) {
                return (a.test_field || 'response') + ' ' + (a.match_mode || 'equals') + ' ' + a.patterns.slice(0, 2).join('|');
            }
            if (a.type === 'json_assert') return String(a.json_path || '') + ' = ' + String(a.expected || '');
            if (a.type === 'size_assert') return String(a.test_field || '') + ' size ' + String(a.size_bytes || '');
            if (a.type === 'md5hex_assert') return 'md5 ' + String(a.md5_hex || '').slice(0, 8) + '…';
            return a.type || 'assert';
        }
        if (entry.kind === 'config' && global.JmsTgConfigCatalog && typeof global.JmsTgConfigCatalog.itemSummary === 'function') {
            return global.JmsTgConfigCatalog.itemSummary(ref) || ref.type || '';
        }
        if (entry.kind === 'processor') {
            return String(ref && ref.type || '') + (ref && ref.script ? ' script' : '');
        }
        if (entry.kind === 'listener') {
            var LT2 = global.JmsTgListenerTimeline;
            if (LT2 && typeof LT2.listenerDisplayName === 'function') {
                return LT2.listenerDisplayName(tg, entry.listenerKey);
            }
            return String(entry.listenerKey || '');
        }
        return '';
    }

    function serializeAiTimelineDetail(entry, tg) {
        if (!entry) return {};
        var ref = entry.ref;
        if (entry.kind === 'step') return catalogStepToYaml(ref) || {};
        if (entry.kind === 'assert') {
            var AR = global.JmsTgAssertResolver;
            if (AR && typeof AR.assertionsToYaml === 'function') {
                var list = AR.assertionsToYaml([ref]);
                return (list && list[0]) ? list[0] : Object.assign({}, ref);
            }
            return Object.assign({}, ref);
        }
        if (entry.kind === 'config' && global.JmsTgConfigCatalog && typeof global.JmsTgConfigCatalog.itemsToYaml === 'function') {
            var yamlItems = global.JmsTgConfigCatalog.itemsToYaml([ref]);
            return (yamlItems && yamlItems[0]) ? yamlItems[0] : { type: ref.type, data: ref.data || {} };
        }
        if (entry.kind === 'processor') return JSON.parse(JSON.stringify(ref || {}));
        if (entry.kind === 'listener') {
            var detail = JSON.parse(JSON.stringify(ref || {}));
            detail.listener_key = entry.listenerKey;
            return detail;
        }
        if (entry.kind === 'tg_variables') {
            return { variables: varsToObj(tg.variables) };
        }
        return {};
    }

    function exportThreadGroupTimelineForAi(planId, tgId) {
        readModelFromDom();
        var plan = findPlan(planId);
        var tg = findTg(plan, tgId);
        if (!tg) throw new Error('未找到目标线程组');
        var DT = global.JmsTgDetailTimeline;
        if (!DT || typeof DT.buildTopLevelOnlyEntries !== 'function') {
            throw new Error('时间线模块未就绪');
        }
        var entries = DT.buildTopLevelOnlyEntries(tg);
        var timeline = [];
        var details = {};
        entries.forEach(function (entry, i) {
            var refId = getAiTimelineRefId(entry, tg);
            timeline.push({
                index: i + 1,
                ref_id: refId,
                kind: entry.kind,
                subtype: getAiTimelineSubtype(entry, tg),
                name: getAiTimelineName(entry, tg),
                summary: buildAiTimelineSummary(entry, tg)
            });
            details[refId] = serializeAiTimelineDetail(entry, tg);
        });
        return {
            thread_group: {
                name: tg.name,
                load: {
                    users: Number(tg.load && tg.load.users) || 1,
                    spawn_rate: Number(tg.load && tg.load.spawn_rate) || 1,
                    duration_sec: Number(tg.load && tg.load.duration_sec) || 60,
                    loops: tg.load && tg.load.loops !== undefined ? Number(tg.load.loops) : -1
                }
            },
            timeline: timeline,
            details: details
        };
    }

    function findAiTimelineEntry(tg, refId) {
        if (!tg || !refId) return null;
        var DT = global.JmsTgDetailTimeline;
        if (!DT || typeof DT.buildTopLevelOnlyEntries !== 'function') return null;
        var rid = String(refId);
        if (rid === 'tg_variables') {
            var entries0 = DT.buildTopLevelOnlyEntries(tg);
            for (var j = 0; j < entries0.length; j += 1) {
                if (entries0[j].kind === 'tg_variables') {
                    return { entry: entries0[j], index: j, entries: entries0 };
                }
            }
            return null;
        }
        var entries = DT.buildTopLevelOnlyEntries(tg);
        for (var i = 0; i < entries.length; i += 1) {
            if (getAiTimelineRefId(entries[i], tg) === rid) {
                return { entry: entries[i], index: i, entries: entries };
            }
        }
        return null;
    }

    function removeAiTimelineComponent(tg, entry) {
        if (!entry || !tg) return;
        if (entry.kind === 'assert') {
            tg.assertions = (tg.assertions || []).filter(function (a) { return a !== entry.ref; });
            return;
        }
        if (entry.kind === 'step') {
            tg.steps = (tg.steps || []).filter(function (s) { return s !== entry.ref; });
            return;
        }
        if (entry.kind === 'config') {
            tg.config_items = (tg.config_items || []).filter(function (c) { return c !== entry.ref; });
            return;
        }
        if (entry.kind === 'processor') {
            var idx = typeof entry.procIndex === 'number' ? entry.procIndex : -1;
            if (idx >= 0 && Array.isArray(tg.processors)) tg.processors.splice(idx, 1);
            return;
        }
        if (entry.kind === 'listener') {
            var LT = global.JmsTgListenerTimeline;
            if (LT && typeof LT.disableListener === 'function') LT.disableListener(tg, entry.listenerKey);
            return;
        }
        if (entry.kind === 'tg_variables') {
            tg.variables = [];
            if (tg._variables_block) tg._variables_block.enabled = false;
        }
    }

    function mergePlainObject(target, patch) {
        if (!target || !patch || typeof patch !== 'object') return target;
        Object.keys(patch).forEach(function (k) {
            if (k === 'ref_id' || k === '_ref_id' || k === '_ai_ref_id' || k === 'id') return;
            var val = patch[k];
            if (val && typeof val === 'object' && !Array.isArray(val) && typeof target[k] === 'object' && target[k] && !Array.isArray(target[k])) {
                mergePlainObject(target[k], val);
            } else {
                target[k] = val;
            }
        });
        return target;
    }

    function insertAiTimelinePosition(tg, refObj, op) {
        var DT = global.JmsTgDetailTimeline;
        if (!DT || !refObj) return;
        DT.assignAppendTimelineOrder(tg, refObj);
        var afterRefId = op.after_ref_id || op.afterRefId || null;
        var afterIndex = op.after_index != null ? parseInt(op.after_index, 10) : null;
        if (!afterRefId && (afterIndex == null || isNaN(afterIndex))) return;
        var entries = DT.buildTopLevelOnlyEntries(tg);
        var fromIndex = -1;
        var i;
        for (i = 0; i < entries.length; i += 1) {
            var hit = entries[i].ref === refObj;
            if (!hit && entries[i].kind === 'tg_variables' && refObj === tg._variables_block) hit = true;
            if (hit) { fromIndex = i; break; }
        }
        if (fromIndex < 0) return;
        var toIndex = entries.length - 1;
        if (afterRefId) {
            var found = findAiTimelineEntry(tg, afterRefId);
            if (found) toIndex = Math.min(found.index + 1, entries.length - 1);
        } else if (afterIndex != null && !isNaN(afterIndex)) {
            toIndex = Math.max(0, Math.min(afterIndex, entries.length - 1));
        }
        if (fromIndex !== toIndex && typeof DT.reorderTopLevel === 'function') {
            DT.reorderTopLevel(tg, fromIndex, toIndex);
        }
    }

    function createAiTimelineRef(tg, kind, component, op) {
        var comp = component && typeof component === 'object' ? component : {};
        var k = String(kind || '').toLowerCase();
        var refObj = null;
        if (k === 'step') {
            var cleanStep = Object.assign({}, comp);
            delete cleanStep._ref_id;
            delete cleanStep.ref_id;
            var newStep = stepsFromYamlTree([cleanStep])[0];
            if (!newStep) throw new Error('无法解析步骤');
            if (!newStep.id) newStep.id = uid();
            tg.steps = tg.steps || [];
            tg.steps.push(newStep);
            refObj = newStep;
        } else if (k === 'assert') {
            var AR = global.JmsTgAssertResolver;
            if (!AR || typeof AR.parseAssertionsFromYaml !== 'function') throw new Error('断言模块未就绪');
            var parsed = AR.parseAssertionsFromYaml({ assertions: [comp] });
            if (!parsed.length) throw new Error('无效断言');
            var a = parsed[0];
            if (!a._ai_ref_id) a._ai_ref_id = uid();
            tg.assertions = tg.assertions || [];
            tg.assertions.push(a);
            refObj = a;
        } else if (k === 'config') {
            var CC = global.JmsTgConfigCatalog;
            if (!CC || typeof CC.parseItemsFromYaml !== 'function') throw new Error('配置模块未就绪');
            var cfgItems = CC.parseItemsFromYaml([comp]);
            if (!cfgItems.length) throw new Error('无效配置元件');
            var item = cfgItems[0];
            if (!item.id) item.id = uid();
            tg.config_items = tg.config_items || [];
            tg.config_items.push(item);
            refObj = item;
        } else if (k === 'processor') {
            var proc = Object.assign({ type: 'beanshell_post', enabled: true, name: '后置处理器' }, comp);
            if (!proc.id) proc.id = uid();
            tg.processors = tg.processors || [];
            tg.processors.push(proc);
            refObj = proc;
        } else if (k === 'listener') {
            var lkey = op.listener_key || op.listenerKey || comp.listener_key || comp.type;
            if (!lkey) throw new Error('listener 缺少 listener_key');
            tg.listeners = tg.listeners || { view_results_tree: false, aggregate_report: false, backend_listener: false };
            tg.listeners[lkey] = true;
            var LT = global.JmsTgListenerTimeline;
            if (LT && typeof LT.ensureConfig === 'function') {
                refObj = LT.ensureConfig(tg, lkey);
                mergePlainObject(refObj, comp);
            } else {
                refObj = tg[lkey] || { name: lkey, enabled: true };
            }
        } else if (k === 'tg_variables') {
            var CC2 = global.JmsTgConfigCatalog;
            if (CC2 && typeof CC2.objToVars === 'function' && comp.variables) {
                tg.variables = CC2.objToVars(comp.variables);
            } else if (Array.isArray(comp.variables)) {
                tg.variables = comp.variables.slice();
            } else {
                tg.variables = tg.variables || [];
            }
            if (!tg._variables_block) tg._variables_block = { enabled: true };
            tg._variables_block.enabled = true;
            refObj = tg._variables_block;
        } else {
            throw new Error('不支持的 kind: ' + kind);
        }
        insertAiTimelinePosition(tg, refObj, op || {});
        return refObj;
    }

    function updateAiTimelineComponentByRef(tg, refId, kind, component) {
        var found = findAiTimelineEntry(tg, refId);
        if (!found) throw new Error('组件不存在: ' + refId);
        var entry = found.entry;
        var comp = component && typeof component === 'object' ? component : {};
        var expectedKind = String(kind || entry.kind || '').toLowerCase();
        if (expectedKind && expectedKind !== entry.kind) {
            throw new Error('kind 与目标组件不匹配: ' + expectedKind + ' vs ' + entry.kind);
        }
        if (entry.kind === 'step') {
            deepUpdateStepFromYaml(entry.ref, comp);
            return;
        }
        if (entry.kind === 'assert') {
            var AR = global.JmsTgAssertResolver;
            var savedAssertOrder = entry.ref.timeline_order;
            var savedAssertId = entry.ref._ai_ref_id;
            if (AR && typeof AR.parseAssertionsFromYaml === 'function') {
                var merged = Object.assign({}, entry.ref, comp);
                var parsed = AR.parseAssertionsFromYaml({ assertions: [merged] });
                if (parsed.length) {
                    Object.keys(entry.ref).forEach(function (k) { delete entry.ref[k]; });
                    Object.assign(entry.ref, parsed[0]);
                }
            } else {
                mergePlainObject(entry.ref, comp);
            }
            if (savedAssertOrder != null) entry.ref.timeline_order = savedAssertOrder;
            if (savedAssertId) entry.ref._ai_ref_id = savedAssertId;
            return;
        }
        if (entry.kind === 'config') {
            if (comp.type) entry.ref.type = comp.type;
            if (comp.name) entry.ref.name = comp.name;
            if (comp.data) mergePlainObject(entry.ref.data || (entry.ref.data = {}), comp.data);
            return;
        }
        if (entry.kind === 'processor') {
            mergePlainObject(entry.ref, comp);
            return;
        }
        if (entry.kind === 'listener') {
            mergePlainObject(entry.ref, comp);
            return;
        }
        if (entry.kind === 'tg_variables') {
            var CC = global.JmsTgConfigCatalog;
            if (CC && typeof CC.objToVars === 'function' && comp.variables) {
                tg.variables = CC.objToVars(comp.variables);
            } else if (comp.variables) {
                tg.variables = comp.variables;
            }
        }
    }

    function replaceAiTimelineComponent(tg, refId, newKind, component, op) {
        var found = findAiTimelineEntry(tg, refId);
        if (!found) throw new Error('组件不存在: ' + refId);
        var savedOrder = found.entry.ref && found.entry.ref.timeline_order;
        var savedImport = found.entry.ref && found.entry.ref.import_order;
        removeAiTimelineComponent(tg, found.entry);
        var newRef = createAiTimelineRef(tg, newKind, component, op || {});
        if (newRef && savedOrder != null) {
            newRef.timeline_order = savedOrder;
            if (newKind !== 'assert') newRef.import_order = savedImport != null ? savedImport : savedOrder;
        }
    }

    function applyAiTimelineOperations(planId, tgId, operations) {
        readModelFromDom();
        var plan = findPlan(planId);
        var tg = findTg(plan, tgId);
        if (!tg) throw new Error('未找到目标线程组');
        var results = { added: 0, updated: 0, replaced: 0, errors: [] };
        (operations || []).forEach(function (op, i) {
            try {
                var action = String(op.action || '').toLowerCase();
                if (action === 'delete') throw new Error('不支持 delete 操作');
                var kind = String(op.kind || '').toLowerCase();
                var component = op.component || op.data || op.step || {};
                if (action === 'add') {
                    if (!kind) throw new Error('add 缺少 kind');
                    createAiTimelineRef(tg, kind, component, op);
                    results.added += 1;
                } else if (action === 'update') {
                    var refId = op.ref_id || op.refId;
                    if (!refId) throw new Error('update 缺少 ref_id');
                    updateAiTimelineComponentByRef(tg, refId, kind, component);
                    results.updated += 1;
                } else if (action === 'replace') {
                    var refId2 = op.ref_id || op.refId;
                    if (!refId2) throw new Error('replace 缺少 ref_id');
                    if (!kind) throw new Error('replace 缺少 kind');
                    replaceAiTimelineComponent(tg, refId2, kind, component, op);
                    results.replaced += 1;
                } else {
                    throw new Error('未知 action: ' + action);
                }
            } catch (err) {
                results.errors.push({ index: i, error: err.message || String(err) });
            }
        });
        _selected.planId = planId;
        _selected.tgId = tgId;
        notifyUserEdit();
        syncYamlFromModel();
        scheduleRender();
        return results;
    }


    /** ---- JMeter AI 轻量 step_tree 桥接（独立扩展，不影响 Timeline/YAML 桥接） ---- */

    function ensureAiStepRefId(step) {
        if (!step) return '';
        if (!step.id) step.id = uid();
        return step.id;
    }

    function getAiStepSubtype(step) {
        if (!step) return 'http';
        if (step.type) return String(step.type);
        if (step.method || step.path) return 'http';
        return 'step';
    }

    function buildAiStepTreeSummary(step) {
        if (!step) return '';
        if (isLogicContainerStep(step)) return String(step.type || 'controller') + ' · ' + String(step.name || '');
        if (isBeanShellStep(step) || isDebugStep(step) || isJsonPostAuxStep(step) || isRegexExtractAuxStep(step)) {
            return String(step.type || 'aux') + ' · ' + String(step.name || '');
        }
        return String(step.method || 'GET') + ' ' + String(step.path || '/');
    }

    function serializeAiStepDetailNoChildren(step) {
        if (!step) return {};
        var yamlList = stepsToYamlTree([step]);
        var y = yamlList && yamlList[0];
        if (!y) return { name: step.name || 'step' };
        if (Object.prototype.hasOwnProperty.call(y, 'children')) delete y.children;
        return y;
    }


    function buildAiMountRefId(hostRefId, mountKey) {
        return String(hostRefId || "") + "@" + String(mountKey || "");
    }

    function parseAiMountRefId(refId) {
        var s = String(refId || "");
        var at = s.indexOf("@");
        if (at <= 0) return null;
        return { hostRefId: s.slice(0, at), mountKey: s.slice(at + 1) };
    }

    function isAiMountRefId(refId) {
        return parseAiMountRefId(refId) != null;
    }

    function buildAiIfMountSubtype(entry) {
        if (!entry) return "mount";
        return String(entry.mountKind || entry.kind || "mount");
    }

    function buildAiIfMountSummary(entry) {
        if (!entry) return "";
        var parts = [entry.typeLabel || entry.mountKind || entry.kind || "mount", entry.name || ""];
        if (entry.meta) parts.push(String(entry.meta));
        return parts.filter(Boolean).join(" · ");
    }

    function serializeAiIfMountDetail(hostStep, entry) {
        if (!hostStep || !entry) return {};
        var mk = entry.mountKind || entry.kind;
        var idx = entry.mountIndex;
        if (mk === "processor") {
            var p = (hostStep.processors || [])[idx];
            return p ? Object.assign({}, p) : {};
        }
        if (mk === "pre_processor") {
            var pre = (hostStep.pre_processors || [])[idx];
            return pre ? Object.assign({}, pre) : {};
        }
        if (mk === "assertion") {
            var a = (hostStep.assertions || [])[idx];
            return a ? Object.assign({}, a) : {};
        }
        if (mk === "config") {
            var c = (hostStep.http_managers || [])[idx];
            return c ? Object.assign({}, c) : {};
        }
        if (mk === "user_parameters") return Object.assign({}, hostStep.user_parameters || {});
        if (mk === "timer") return Object.assign({}, hostStep.constant_timer || {});
        if (mk === "listener") {
            var lk = entry.mountListenerKey;
            if (lk && hostStep[lk] && typeof hostStep[lk] === "object") return Object.assign({}, hostStep[lk]);
            return { listener_key: lk, enabled: !!(hostStep.step_listeners && hostStep.step_listeners[lk]) };
        }
        return {};
    }

    function buildAiHttpMountSubtype(entry) {
        if (!entry) return "mount";
        if (entry.kind === "postproc" && entry.ref) return String(entry.ref.type || "processor");
        if (entry.kind === "preproc") return String(entry.preprocKind || "pre_processor");
        if (entry.kind === "assert" && entry.ref) return String(entry.ref.type || "assert");
        return String(entry.kind || "mount");
    }

    function buildAiHttpMountSummary(entry) {
        if (!entry) return "";
        if (entry.name) return String(entry.shortType || entry.kind || "mount") + " · " + String(entry.name);
        return String(entry.kind || "mount");
    }

    function serializeAiHttpMountDetail(hostStep, entry) {
        if (!hostStep || !entry) return {};
        if (entry.kind === "postproc" && entry.ref) return Object.assign({}, entry.ref);
        if (entry.kind === "preproc") {
            if (entry.preprocKind === "user_parameters") return Object.assign({}, hostStep.user_parameters || {});
            var pre = (hostStep.pre_processors || [])[entry.preprocIndex];
            return pre ? Object.assign({}, pre) : {};
        }
        if (entry.kind === "assert" && entry.ref) return Object.assign({}, entry.ref);
        if (entry.kind === "timer") return Object.assign({}, hostStep.constant_timer || {});
        if (entry.kind === "config" && entry.configType) {
            var mgr = hostStep.http_managers || {};
            var cfg = mgr[entry.configType];
            return cfg ? Object.assign({ type: entry.configType }, cfg) : { type: entry.configType };
        }
        if (entry.kind === "listener" && entry.ref) return Object.assign({}, entry.ref);
        if (entry.kind === "logic" && entry.ref) {
            var y = stepsToYamlTree([entry.ref]);
            var one = y && y[0];
            if (one && Object.prototype.hasOwnProperty.call(one, "children")) delete one.children;
            return one || {};
        }
        return {};
    }

    function pushAiIfMountTreeNode(hostRefId, depth, entry, hostStep, tree, details) {
        var mountKey = entry.key;
        if (!mountKey) return;
        var refId = buildAiMountRefId(hostRefId, mountKey);
        tree.push({
            ref_id: refId,
            parent_ref_id: hostRefId,
            depth: depth,
            kind: "mount",
            mount_kind: buildAiIfMountSubtype(entry),
            mount_key: mountKey,
            subtype: buildAiIfMountSubtype(entry),
            name: entry.name || refId,
            summary: buildAiIfMountSummary(entry)
        });
        details[refId] = serializeAiIfMountDetail(hostStep, entry);
    }

    function pushAiHttpMountTreeNodes(hostRefId, depth, hostStep, tree, details) {
        var HttpTL = global.JmsHttpMountTimeline;
        if (!HttpTL || typeof HttpTL.buildMountEntries !== "function" || !hostStep || !hostStep.method) return;
        HttpTL.buildMountEntries(hostStep).forEach(function (entry) {
            if (!entry || !entry.key) return;
            var refId = buildAiMountRefId(hostRefId, entry.key);
            tree.push({
                ref_id: refId,
                parent_ref_id: hostRefId,
                depth: depth,
                kind: "mount",
                mount_kind: String(entry.kind || "mount"),
                mount_key: entry.key,
                subtype: buildAiHttpMountSubtype(entry),
                name: entry.name || refId,
                summary: buildAiHttpMountSummary(entry)
            });
            details[refId] = serializeAiHttpMountDetail(hostStep, entry);
        });
    }

    function collectAiStepTreeNodeWithMounts(step, parentRefId, depth, tree, details) {
        if (!step) return;
        var refId = ensureAiStepRefId(step);
        tree.push({
            ref_id: refId,
            parent_ref_id: parentRefId || null,
            depth: depth,
            kind: "step",
            subtype: getAiStepSubtype(step),
            name: step.name || refId,
            summary: buildAiStepTreeSummary(step)
        });
        details[refId] = serializeAiStepDetailNoChildren(step);
        if (step.method) {
            pushAiHttpMountTreeNodes(refId, depth + 1, step, tree, details);
        }
        if (!isLogicContainerStep(step)) return;
        var IfTL = global.JmsIfMountTimeline;
        if (!IfTL || typeof IfTL.buildBodyRenderPlan !== "function") {
            (step.children || []).forEach(function (child) {
                collectAiStepTreeNodeWithMounts(child, refId, depth + 1, tree, details);
            });
            return;
        }
        IfTL.buildBodyRenderPlan(step).forEach(function (item) {
            if (!item) return;
            if (item.kind === "mount" && item.entry) {
                pushAiIfMountTreeNode(refId, depth + 1, item.entry, step, tree, details);
            } else if (item.kind === "child" && item.step) {
                collectAiStepTreeNodeWithMounts(item.step, refId, depth + 1, tree, details);
            }
        });
    }

    function collectAiStepTreeNodesWithMounts(steps, parentRefId, depth, tree, details) {
        (steps || []).forEach(function (step) {
            collectAiStepTreeNodeWithMounts(step, parentRefId, depth, tree, details);
        });
    }

    function resolveAiIfMountContext(hostStep, mountKey) {
        if (!hostStep || !mountKey) return null;
        if (mountKey.indexOf("ifproc:") === 0) {
            var pi = parseInt(mountKey.slice(7), 10);
            return { mountKind: "processor", arrayKey: "processors", index: pi, obj: (hostStep.processors || [])[pi] };
        }
        if (mountKey === "ifpre:user_parameters") {
            return { mountKind: "user_parameters", obj: hostStep.user_parameters, singleton: true };
        }
        if (mountKey.indexOf("ifpre:") === 0) {
            var pri = parseInt(mountKey.slice(6), 10);
            return { mountKind: "pre_processor", arrayKey: "pre_processors", index: pri, obj: (hostStep.pre_processors || [])[pri] };
        }
        if (mountKey.indexOf("ifas:") === 0) {
            var ai = parseInt(mountKey.slice(5), 10);
            return { mountKind: "assertion", arrayKey: "assertions", index: ai, obj: (hostStep.assertions || [])[ai] };
        }
        if (mountKey.indexOf("ifcfg:") === 0) {
            var ci = parseInt(mountKey.slice(6), 10);
            return { mountKind: "config", arrayKey: "http_managers", index: ci, obj: (hostStep.http_managers || [])[ci] };
        }
        if (mountKey.indexOf("iftimer:") === 0) {
            return { mountKind: "timer", obj: hostStep.constant_timer, singleton: true, timerKey: "constant_timer" };
        }
        if (mountKey.indexOf("iflis:") === 0) {
            var lk = mountKey.slice(6);
            return { mountKind: "listener", listenerKey: lk, obj: hostStep[lk] };
        }
        return null;
    }

    function resolveAiHttpMountContext(hostStep, mountKey) {
        if (!hostStep || !mountKey) return null;
        if (mountKey.indexOf("proc:") === 0) {
            var pi = parseInt(mountKey.slice(5), 10);
            return { mountKind: "processor", arrayKey: "processors", index: pi, obj: (hostStep.processors || [])[pi] };
        }
        if (mountKey === "pre:user_parameters") {
            return { mountKind: "user_parameters", obj: hostStep.user_parameters, singleton: true };
        }
        if (mountKey.indexOf("pre:beanshell_pre:") === 0) {
            var pri = parseInt(mountKey.slice(18), 10);
            return { mountKind: "pre_processor", arrayKey: "pre_processors", index: pri, obj: (hostStep.pre_processors || [])[pri] };
        }
        if (mountKey.indexOf("as:") === 0) {
            var ai = parseInt(mountKey.slice(3), 10);
            var asserts = hostStep.assertions;
            if (global.JmsStepAssertResolver && typeof global.JmsStepAssertResolver.getStepAssertions === "function") {
                asserts = global.JmsStepAssertResolver.getStepAssertions(hostStep);
            }
            return { mountKind: "assertion", arrayKey: "assertions", index: ai, obj: (asserts || [])[ai] };
        }
        if (mountKey.indexOf("cfg:") === 0) {
            return { mountKind: "config", configType: mountKey.slice(4), obj: (hostStep.http_managers || {})[mountKey.slice(4)] };
        }
        if (mountKey === "timer:constant") {
            return { mountKind: "timer", obj: hostStep.constant_timer, singleton: true, timerKey: "constant_timer" };
        }
        if (mountKey.indexOf("lis:") === 0) {
            var li = parseInt(mountKey.slice(4), 10);
            var items = [];
            if (global.JmsHttpStepListenerCatalog && typeof global.JmsHttpStepListenerCatalog.ensureStepListenerItems === "function") {
                items = global.JmsHttpStepListenerCatalog.ensureStepListenerItems(hostStep);
            }
            return { mountKind: "listener", index: li, obj: items[li] };
        }
        if (mountKey.indexOf("logic:") === 0) {
            var lgi = parseInt(mountKey.slice(6), 10);
            return { mountKind: "logic", arrayKey: "logic_controllers", index: lgi, obj: (hostStep.logic_controllers || [])[lgi], isStepLike: true };
        }
        return null;
    }

    function resolveAiMountContext(tg, refId) {
        var parsed = parseAiMountRefId(refId);
        if (!parsed) return null;
        var host = findStepInList(tg.steps, parsed.hostRefId);
        if (!host) return null;
        var ctx = resolveAiIfMountContext(host, parsed.mountKey);
        if (!ctx && host.method) ctx = resolveAiHttpMountContext(host, parsed.mountKey);
        if (!ctx) return null;
        return { host: host, mountKey: parsed.mountKey, ctx: ctx };
    }

    function updateAiMountObject(ctx, component) {
        var comp = component && typeof component === "object" ? component : {};
        if (ctx.isStepLike && ctx.obj) {
            deepUpdateStepFromYaml(ctx.obj, comp);
            return;
        }
        if (ctx.mountKind === "assertion") {
            var AR = global.JmsTgAssertResolver || global.JmsStepAssertResolver;
            if (AR && typeof AR.parseAssertionsFromYaml === "function" && ctx.obj) {
                var merged = Object.assign({}, ctx.obj, comp);
                var parsed = AR.parseAssertionsFromYaml({ assertions: [merged] });
                if (parsed.length) {
                    Object.keys(ctx.obj).forEach(function (k) { delete ctx.obj[k]; });
                    Object.assign(ctx.obj, parsed[0]);
                }
            } else if (ctx.obj) {
                mergePlainObject(ctx.obj, comp);
            }
            return;
        }
        if (ctx.mountKind === "config" && ctx.configType) {
            mergePlainObject(ctx.obj || {}, comp);
            return;
        }
        if (ctx.singleton && ctx.obj) {
            mergePlainObject(ctx.obj, comp);
            return;
        }
        if (ctx.obj) mergePlainObject(ctx.obj, comp);
    }

    function updateAiMountByRef(tg, refId, component) {
        var found = resolveAiMountContext(tg, refId);
        if (!found || !found.ctx) throw new Error("挂载组件不存在: " + refId);
        if (!found.ctx.obj && !found.ctx.singleton && found.ctx.mountKind !== "listener") {
            throw new Error("挂载组件不存在: " + refId);
        }
        updateAiMountObject(found.ctx, component);
    }

    function removeAiIfMountByKey(hostStep, mountKey) {
        var ctx = resolveAiIfMountContext(hostStep, mountKey);
        if (!ctx) return;
        if (ctx.arrayKey && typeof ctx.index === "number") {
            var arr = hostStep[ctx.arrayKey] || [];
            if (ctx.index >= 0 && ctx.index < arr.length) arr.splice(ctx.index, 1);
        } else if (ctx.mountKind === "user_parameters") {
            hostStep.user_parameters = { enabled: false, per_iteration: false, params: [] };
        } else if (ctx.mountKind === "timer") {
            hostStep.constant_timer = { enabled: false, name: "固定定时器", comments: "", delay_ms: 300 };
        } else if (ctx.mountKind === "listener" && ctx.listenerKey) {
            if (hostStep.step_listeners) hostStep.step_listeners[ctx.listenerKey] = false;
        }
        var IfTL = global.JmsIfMountTimeline;
        if (IfTL && typeof IfTL.reconcileMountKeysAfterDelete === "function") {
            IfTL.reconcileMountKeysAfterDelete(hostStep);
        }
    }

    function removeAiHttpMountByKey(hostStep, mountKey) {
        var ctx = resolveAiHttpMountContext(hostStep, mountKey);
        if (!ctx) return;
        if (ctx.isStepLike && ctx.arrayKey) {
            var arrL = hostStep[ctx.arrayKey] || [];
            if (ctx.index >= 0 && ctx.index < arrL.length) arrL.splice(ctx.index, 1);
            return;
        }
        if (ctx.arrayKey && typeof ctx.index === "number") {
            var arr = hostStep[ctx.arrayKey] || [];
            if (ctx.index >= 0 && ctx.index < arr.length) arr.splice(ctx.index, 1);
        } else if (ctx.mountKind === "config" && ctx.configType && hostStep.http_managers) {
            delete hostStep.http_managers[ctx.configType];
        }
    }

    function replaceAiMountByRef(tg, refId, kind, component, op) {
        var found = resolveAiMountContext(tg, refId);
        if (!found) throw new Error("挂载组件不存在: " + refId);
        var host = found.host;
        var mountKey = found.mountKey;
        var newKind = String(kind || found.ctx.mountKind || "processor").toLowerCase();
        if (newKind === "step") {
            var IfTL = global.JmsIfMountTimeline;
            var keyList = [];
            if (isLogicContainerStep(host) && IfTL && typeof IfTL.buildBodyKeyList === "function") {
                IfTL.ensureBodyTimelineKeys(host);
                keyList = IfTL.buildBodyKeyList(host).slice();
            }
            var mountIdx = keyList.indexOf(mountKey);
            removeAiIfMountByKey(host, mountKey);
            if (host.method) removeAiHttpMountByKey(host, mountKey);
            if (mountIdx >= 0 && isLogicContainerStep(host) && IfTL) {
                var clean = Object.assign({}, component || {});
                delete clean.children;
                var newStep = stepsFromYamlTree([clean])[0];
                if (!newStep) throw new Error("无法解析步骤");
                if (!newStep.id) newStep.id = uid();
                host.children = host.children || [];
                host.children.push(newStep);
                var childKey = IfTL.keyChild(newStep.id);
                keyList.splice(mountIdx, 1, childKey);
                host.mount_timeline_keys = keyList;
                notifyIfChildAppended(tg, host.id, newStep);
                return newStep;
            }
            var insertOp = Object.assign({}, op || {}, { parent_ref_id: host.id });
            return addAiStepTreeStep(tg, component, insertOp);
        }
        updateAiMountByRef(tg, refId, component);
    }


    function collectAiStepTreeNodes(steps, parentRefId, depth, tree, details) {
        (steps || []).forEach(function (step) {
            if (!step) return;
            var refId = ensureAiStepRefId(step);
            tree.push({
                ref_id: refId,
                parent_ref_id: parentRefId || null,
                depth: depth,
                kind: 'step',
                subtype: getAiStepSubtype(step),
                name: step.name || refId,
                summary: buildAiStepTreeSummary(step)
            });
            details[refId] = serializeAiStepDetailNoChildren(step);
            if (isLogicContainerStep(step) && Array.isArray(step.children) && step.children.length) {
                collectAiStepTreeNodes(step.children, refId, depth + 1, tree, details);
            }
        });
    }

    function exportThreadGroupStepTreeForAi(planId, tgId) {
        var base = exportThreadGroupTimelineForAi(planId, tgId);
        readModelFromDom();
        var plan = findPlan(planId);
        var tg = findTg(plan, tgId);
        if (!tg) throw new Error('未找到目标线程组');
        var stepTree = [];
        var stepDetails = {};
        collectAiStepTreeNodesWithMounts(tg.steps || [], null, 0, stepTree, stepDetails);
        base.step_tree = stepTree;
        base.details = Object.assign({}, base.details || {}, stepDetails);
        return base;
    }

    function findAiStepParentContext(tg, stepId) {
        function walk(list) {
            if (!list) return null;
            for (var i = 0; i < list.length; i += 1) {
                var s = list[i];
                if (!s) continue;
                if (s.id === stepId) return { list: list, index: i, step: s };
                if (isLogicContainerStep(s) && s.children) {
                    var nested = walk(s.children);
                    if (nested) return nested;
                }
            }
            return null;
        }
        return walk(tg.steps || []);
    }

    function addAiStepTreeStep(tg, component, op) {
        var comp = component && typeof component === 'object' ? component : {};
        var clean = Object.assign({}, comp);
        delete clean._ref_id;
        delete clean.ref_id;
        delete clean.children;
        var parentRef = op.parent_ref_id || op.parentRefId || null;
        var list = getStepListForParent(tg, parentRef || null);
        if (!list) throw new Error('父步骤不存在或非逻辑容器');
        var newStep = stepsFromYamlTree([clean])[0];
        if (!newStep) throw new Error('无法解析步骤');
        if (!newStep.id) newStep.id = uid();
        insertStepIntoList(
            list,
            newStep,
            op.after_ref_id || op.afterRefId || op.insert_after_ref_id || op.insertAfterRefId || null,
            op.insert_index
        );
        if (parentRef) notifyIfChildAppended(tg, parentRef, newStep);
        return newStep;
    }

    function updateAiStepTreeStepByRef(tg, refId, component) {
        var step = findStepInList(tg.steps, refId);
        if (!step) throw new Error('步骤不存在: ' + refId);
        deepUpdateStepFromYaml(step, component || {});
    }

    function findParentStepOfStep(tg, targetStep) {
        var parent = null;
        function walk(list, p) {
            for (var i = 0; i < list.length; i += 1) {
                if (list[i] === targetStep) {
                    parent = p;
                    return true;
                }
                if (isLogicContainerStep(list[i]) && list[i].children) {
                    if (walk(list[i].children, list[i])) return true;
                }
            }
            return false;
        }
        walk(tg.steps || [], null);
        return parent;
    }

    function replaceAiStepTreeStep(tg, refId, component, op) {
        // AI_REPLACE_PRESERVE_ID_V1: 保留原 id，避免同批后续 parent_ref_id 指向已被删除的旧步骤
        var ctx = findAiStepParentContext(tg, refId);
        if (!ctx) throw new Error('步骤不存在: ' + refId);
        var savedIndex = ctx.index;
        var savedId = ctx.step && ctx.step.id ? String(ctx.step.id) : String(refId || '');
        var parentStep = findParentStepOfStep(tg, ctx.step);
        ctx.list.splice(savedIndex, 1);
        var insertOp = Object.assign({}, op || {}, { insert_index: savedIndex });
        insertOp.parent_ref_id = parentStep && parentStep.id ? parentStep.id : null;
        var newStep = addAiStepTreeStep(tg, component, insertOp);
        if (newStep && savedId) newStep.id = savedId;
        return newStep || null;
    }


    function normalizeAiStepTreeOp(op) {
        if (!op || typeof op !== 'object') return op || {};
        var out = Object.assign({}, op);
        if (!out.after_ref_id && !out.afterRefId) {
            var ins = out.insert_after_ref_id || out.insertAfterRefId;
            if (ins) out.after_ref_id = ins;
        }
        return out;
    }


    /** ---- AI 配置更新旁路（RoutedV1，不影响原 applyAiStepTreeOperations） ---- */
    var AI_CONFIG_TYPE_KEYS_V1 = {
        http_defaults: 1,
        header_manager: 1,
        auth_manager: 1,
        cookie_manager: 1,
        cache_manager: 1,
        csv_data_set: 1,
        counter: 1
    };

    function isAiConfigComponentShapeV1(kind, component) {
        var k = String(kind || "").toLowerCase();
        if (k === "config") return true;
        var comp = component && typeof component === "object" ? component : {};
        var t = String(comp.type || "");
        if (AI_CONFIG_TYPE_KEYS_V1[t]) return true;
        var Adapt = global.JmsAiConfigComponentAdaptV1;
        if (Adapt && typeof Adapt.adaptAiConfigComponent === "function") {
            try {
                var adapted = Adapt.adaptAiConfigComponent(comp);
                if (adapted && AI_CONFIG_TYPE_KEYS_V1[String(adapted.type || "")]) return true;
            } catch (e1) { /* ignore */ }
        }
        var alias = String(comp.alias || comp.testclass || "");
        if (alias === "ConfigTestElement" || alias === "HttpDefaults") return true;
        if (String(comp.guiclass || "") === "HttpDefaultsGui") return true;
        if (/HTTP\s*请求默认值|http\s*defaults/i.test(String(comp.name || ""))) return true;
        return false;
    }

    function adaptAiConfigPayloadV1(component) {
        var comp = component && typeof component === "object" ? component : {};
        var Adapt = global.JmsAiConfigComponentAdaptV1;
        if (Adapt && typeof Adapt.adaptAiConfigComponent === "function") {
            try {
                var adapted = Adapt.adaptAiConfigComponent(comp);
                if (adapted && typeof adapted === "object") return adapted;
            } catch (e2) { /* ignore */ }
        }
        return comp;
    }

    function findAiConfigItemInTgV1(tg, refId, component, op) {
        var items = (tg && tg.config_items) || [];
        var rid = String(refId || "");
        var i;
        if (rid) {
            for (i = 0; i < items.length; i += 1) {
                if (items[i] && sidMatch(items[i].id, rid)) return items[i];
            }
        }
        var targetName = String((op && (op.target_name || op.targetName)) || (component && component.name) || "").trim();
        if (targetName) {
            for (i = 0; i < items.length; i += 1) {
                if (items[i] && String(items[i].name || "").trim() === targetName) return items[i];
            }
        }
        var typ = String((component && component.type) || "");
        if (typ && AI_CONFIG_TYPE_KEYS_V1[typ]) {
            for (i = 0; i < items.length; i += 1) {
                if (items[i] && String(items[i].type || "") === typ) return items[i];
            }
        }
        return null;
    }

    function isAiConfigLikeStepV1(step) {
        if (!step || typeof step !== "object") return false;
        var alias = String(step.alias || step.testclass || "");
        if (alias === "ConfigTestElement" || alias === "HttpDefaults") return true;
        if (String(step.guiclass || "") === "HttpDefaultsGui") return true;
        if (step.category === "config" && AI_CONFIG_TYPE_KEYS_V1[String(step.type || "")]) return true;
        if (/HTTP\s*请求默认值|http\s*defaults/i.test(String(step.name || ""))) return true;
        return false;
    }

    function findAiConfigLikeStepV1(tg, refId, op, component) {
        var rid = String(refId || "");
        if (rid) {
            var byId = findStepInList(tg.steps, rid);
            if (byId && isAiConfigLikeStepV1(byId)) return byId;
        }
        var targetName = String((op && (op.target_name || op.targetName)) || (component && component.name) || "").trim();
        var found = null;
        function walk(list) {
            (list || []).forEach(function (s) {
                if (found || !s) return;
                if (isAiConfigLikeStepV1(s)) {
                    if (!targetName || String(s.name || "").trim() === targetName) {
                        found = s;
                        return;
                    }
                }
                if (isLogicContainerStep(s) && s.children) walk(s.children);
            });
        }
        walk(tg.steps || []);
        return found;
    }

    function mergeAiConfigDataIntoItemV1(item, component) {
        if (!item || !component) return;
        if (component.type) item.type = String(component.type);
        if (component.name) item.name = String(component.name);
        if (component.data && typeof component.data === "object") {
            if (!item.data || typeof item.data !== "object") item.data = {};
            mergePlainObject(item.data, component.data);
        }
    }

    function mergeAiConfigDataIntoCatalogStepV1(step, component) {
        if (!step || !component) return;
        if (component.name) step.name = String(component.name);
        var data = (component.data && typeof component.data === "object")
            ? component.data
            : component;
        if (!step.catalog_props || typeof step.catalog_props !== "object") step.catalog_props = {};
        [
            "protocol", "domain", "port", "path", "connect_timeout", "response_timeout",
            "implementation", "content_encoding", "follow_redirects", "auto_redirects",
            "use_keepalive", "enabled", "comments"
        ].forEach(function (k) {
            if (data[k] != null) step.catalog_props[k] = data[k];
        });
        if (data.domain != null && step.catalog_props.server == null) {
            step.catalog_props.server = data.domain;
        }
    }

    function mergeAiConfigIntoHttpManagersV1(host, component) {
        if (!host) return false;
        var comp = component || {};
        var typ = String(comp.type || "http_defaults");
        if (!AI_CONFIG_TYPE_KEYS_V1[typ]) typ = "http_defaults";
        if (!host.http_managers || typeof host.http_managers !== "object") host.http_managers = {};
        var slot = host.http_managers[typ];
        if (!slot || typeof slot !== "object") {
            slot = { enabled: true };
            host.http_managers[typ] = slot;
        }
        var data = (comp.data && typeof comp.data === "object") ? comp.data : comp;
        Object.keys(data || {}).forEach(function (k) {
            if (k === "type" || k === "name" || k === "data") return;
            if (data[k] != null) slot[k] = data[k];
        });
        if (slot.enabled === undefined) slot.enabled = true;
        return true;
    }

    function findStepOwningNestedConfigV1(tg, refId, op, component) {
        // config_items 带 parent_step_id 时，同时确保步骤侧 http_managers 同步（若存在）
        var items = (tg && tg.config_items) || [];
        var rid = String(refId || "");
        var parentId = null;
        var i;
        for (i = 0; i < items.length; i += 1) {
            if (items[i] && sidMatch(items[i].id, rid) && items[i].parent_step_id) {
                parentId = items[i].parent_step_id;
                break;
            }
        }
        if (!parentId && op && (op.parent_ref_id || op.parentRefId)) {
            parentId = op.parent_ref_id || op.parentRefId;
        }
        if (!parentId) return null;
        return findStepInList(tg.steps, parentId);
    }

    function updateAiConfigForAiV1(tg, refId, component, op) {
        var comp = adaptAiConfigPayloadV1(component);
        var item = findAiConfigItemInTgV1(tg, refId, comp, op || {});
        if (item) {
            mergeAiConfigDataIntoItemV1(item, comp);
            // 嵌套配置：同步到父步骤 http_managers（若有）
            var host = findStepOwningNestedConfigV1(tg, refId, op || {}, comp);
            if (host) mergeAiConfigIntoHttpManagersV1(host, comp);
            return { mode: "config_item", id: item.id };
        }
        var step = findAiConfigLikeStepV1(tg, refId, op || {}, comp);
        if (step) {
            mergeAiConfigDataIntoCatalogStepV1(step, comp);
            mergeAiConfigIntoHttpManagersV1(step, comp);
            return { mode: "config_step", id: step.id };
        }
        // 步骤挂载的 http_managers 默认值（无 config_items 时）
        var host2 = findStepOwningNestedConfigV1(tg, refId, op || {}, comp);
        if (host2 && mergeAiConfigIntoHttpManagersV1(host2, comp)) {
            return { mode: "http_managers", id: host2.id };
        }
        // 兜底：按名称找第一个含 http_managers.http_defaults 的 HTTP 步骤
        var wantName = String((op && (op.target_name || op.targetName)) || (comp && comp.name) || "").trim();
        var foundHm = null;
        function walkHm(list) {
            (list || []).forEach(function (s) {
                if (foundHm || !s) return;
                if (s.http_managers && s.http_managers.http_defaults) {
                    if (!wantName || String(s.name || "").indexOf("默认") >= 0) foundHm = s;
                }
                if (isLogicContainerStep(s) && s.children) walkHm(s.children);
            });
        }
        // 顶层 tg.http_managers
        if (tg.http_managers && tg.http_managers.http_defaults) {
            mergeAiConfigIntoHttpManagersV1(tg, comp);
            return { mode: "tg_http_managers", id: "tg" };
        }
        walkHm(tg.steps || []);
        if (foundHm && mergeAiConfigIntoHttpManagersV1(foundHm, comp)) {
            return { mode: "step_http_managers", id: foundHm.id };
        }
        // 最后尝试原时间线路由（不经步骤 YAML）
        updateAiTimelineComponentByRef(tg, refId, "config", comp);
        return { mode: "timeline_config", id: refId };
    }


    function inferAiListenerKeyV1(op, component) {
        var comp = component && typeof component === "object" ? component : {};
        op = op && typeof op === "object" ? op : {};
        var candidates = [
            op.listener_key, op.listenerKey,
            comp.listener_key, comp.listenerKey,
            comp.type, comp.alias, comp.guiclass, comp.testclass, comp.jmeter_class
        ];
        var i;
        var VALID = { view_results_tree: 1, aggregate_report: 1, backend_listener: 1 };
        for (i = 0; i < candidates.length; i += 1) {
            var raw = String(candidates[i] || "").trim();
            if (!raw) continue;
            if (VALID[raw]) return raw;
            var mapped = ({
                StatVisualizer: "aggregate_report",
                AggregateReport: "aggregate_report",
                "聚合报告": "aggregate_report",
                ViewResultsFullVisualizer: "view_results_tree",
                ViewResultsTree: "view_results_tree",
                ViewResultsVisualizer: "view_results_tree",
                "查看结果树": "view_results_tree",
                BackendListener: "backend_listener",
                "后端监听器": "backend_listener"
            })[raw];
            if (mapped) return mapped;
        }
        var name = String(comp.name || op.target_name || op.targetName || "").trim();
        if (/聚合报告|aggregate\s*report/i.test(name)) return "aggregate_report";
        if (/查看结果树|结果树|view\s*results/i.test(name)) return "view_results_tree";
        if (/后端监听|backend\s*listener/i.test(name)) return "backend_listener";
        return "";
    }

    function normalizeAiListenerOpV1(op) {
        if (!op || typeof op !== "object") return op || {};
        var out = Object.assign({}, op);
        var comp = Object.assign({}, out.component || out.data || {});
        var key = inferAiListenerKeyV1(out, comp);
        if (key) {
            out.listener_key = key;
            comp.listener_key = key;
            if (!comp.type || !({ view_results_tree: 1, aggregate_report: 1, backend_listener: 1 })[String(comp.type)]) {
                comp.type = key;
            }
            if (!comp.name) {
                var labels = { view_results_tree: "查看结果树", aggregate_report: "聚合报告", backend_listener: "后端监听器" };
                comp.name = labels[key] || key;
            }
            out.component = comp;
        }
        return out;
    }


    function aiListenerAliasMetaV1(listenerKey) {
        var key = String(listenerKey || "");
        var map = {
            view_results_tree: {
                alias: "ViewResultsFullVisualizer",
                testclass: "ResultCollector",
                guiclass: "ViewResultsFullVisualizer",
                label_zh: "查看结果树"
            },
            aggregate_report: {
                alias: "StatVisualizer",
                testclass: "ResultCollector",
                guiclass: "StatVisualizer",
                label_zh: "聚合报告"
            },
            backend_listener: {
                alias: "BackendListener",
                testclass: "BackendListener",
                guiclass: "BackendListenerGui",
                label_zh: "Backend Listener"
            }
        };
        return map[key] || null;
    }

    function isAiSamplerLikeHostV1(step) {
        if (!step) return false;
        if (step.method) return true;
        if (step.type === "catalog_element" && String(step.category || "") === "sampler") return true;
        if (step.type === "catalog_element" && /HTTPSampler/i.test(String(step.alias || ""))) return true;
        if (global.JmsMountHostResolver) {
            if (typeof global.JmsMountHostResolver.isCatalogSamplerMountHost === "function" &&
                global.JmsMountHostResolver.isCatalogSamplerMountHost(step)) return true;
            if (typeof global.JmsMountHostResolver.isHttpMountHost === "function" &&
                global.JmsMountHostResolver.isHttpMountHost(step)) return true;
        }
        return false;
    }


    function stripAiMountMetaPropsV1(props) {
        var out = Object.assign({}, props || {});
        [
            "type", "alias", "testclass", "guiclass", "jmeter_class", "category", "label_zh",
            "container", "scope", "jmx_fragment", "catalog_props", "catalog_hash_children",
            "children", "id", "ref_id", "_ref_id", "kind", "name", "enabled"
        ].forEach(function (k) { delete out[k]; });
        return out;
    }

    function isAiTimerLikeComponentV1(kind, component) {
        var k = String(kind || "").toLowerCase();
        if (k === "timer") return true;
        var comp = component && typeof component === "object" ? component : {};
        var alias = String(comp.alias || comp.testclass || comp.type || "");
        var name = String(comp.name || "");
        // 同步定时器在 GUI 常叫「集合点」；AI 也可能把 timer 误标为 kind=config/step
        if (/Timer$/i.test(alias) || /定时器|集合点/.test(name) || /synchronizing_timer|constant_timer|uniform_random_timer|SyncTimer/i.test(alias)) return true;
        if ((k === "step" || k === "config") && (comp.delay_ms != null || comp.groupSize != null || comp.group_size != null)) return true;
        return false;
    }

    
    function isAiUserParametersLikeV1(comp) {
        if (!comp || typeof comp !== "object") return false;
        var hint = String(comp.type || "").trim().toLowerCase();
        var alias = String(comp.alias || comp.testclass || "").trim();
        var name = String(comp.name || "").trim();
        if (hint === "user_parameters" || hint === "userparameters") return true;
        if (/^UserParameters$/i.test(alias)) return true;
        if (/用户参数/.test(name) && !/BeanShell|JSR223|script/i.test(alias + hint)) return true;
        if (Array.isArray(comp.names) || (comp.thread_values != null && String(comp.thread_values).length)) return true;
        return false;
    }

    function isAiArgumentsLikeV1(comp) {
        if (!comp || typeof comp !== "object") return false;
        var hint = String(comp.type || "").trim().toLowerCase();
        var alias = String(comp.alias || comp.testclass || "").trim();
        var name = String(comp.name || "").trim();
        if (hint === "user_defined_variables" || hint === "arguments" || hint === "udv" || hint === "user_defined_vars") return true;
        if (/^Arguments$/i.test(alias)) return true;
        if (/用户定义的变量|用户定义变量/.test(name)) return true;
        if (comp.variables && typeof comp.variables === "object" && !comp.script && !comp.json_path && !comp.language) return true;
        return false;
    }

    function normalizeAiUserParametersPropsV1(props) {
        props = props && typeof props === "object" ? Object.assign({}, props) : {};
        var names = Array.isArray(props.names) ? props.names.map(function (n) { return String(n == null ? "" : n).trim(); }).filter(Boolean) : [];
        var tv = props.thread_values != null ? String(props.thread_values) : "";
        var params = Array.isArray(props.params) ? props.params.slice() : [];

        if ((!params || !params.length) && names.length) {
            var parts;
            if (/\r?\n/.test(tv)) {
                parts = tv.split(/\r?\n/);
            } else if (tv.indexOf(",") >= 0 && names.length > 1) {
                parts = tv.split(",").map(function (s) { return String(s).trim(); });
            } else {
                parts = names.map(function (_n, i) { return i === 0 ? tv : ""; });
            }
            params = names.map(function (n, i) {
                return { key: n, value: parts[i] != null ? String(parts[i]).trim() : "" };
            });
        }

        if ((!params || !params.length) && props.variables && typeof props.variables === "object" && !Array.isArray(props.variables)) {
            params = Object.keys(props.variables).map(function (k) {
                var v = props.variables[k];
                return { key: String(k).trim(), value: v == null ? "" : String(v) };
            }).filter(function (p) { return p.key; });
        }

        if (params && params.length) {
            props.params = params.map(function (p) {
                if (!p || typeof p !== "object") return null;
                var key = String(p.key || p.name || "").trim();
                if (!key) return null;
                var out = { key: key };
                if (Array.isArray(p.values)) out.values = p.values.map(function (v) { return v == null ? "" : String(v); });
                else out.value = p.value != null ? String(p.value) : "";
                return out;
            }).filter(Boolean);
            props.names = props.params.map(function (p) { return p.key; });
            props.thread_values = props.params.map(function (p) {
                if (Array.isArray(p.values)) return p.values.join(",");
                return p.value != null ? String(p.value) : "";
            }).join("\n");
        }
        delete props.type;
        delete props.alias;
        delete props.testclass;
        delete props.guiclass;
        delete props.category;
        delete props.variables;
        delete props.name;
        return props;
    }

    function normalizeAiArgumentsPropsV1(props) {
        props = props && typeof props === "object" ? Object.assign({}, props) : {};
        var args = Array.isArray(props.arguments) ? props.arguments.slice() : null;
        if ((!args || !args.length) && props.variables) {
            if (Array.isArray(props.variables)) {
                args = props.variables.slice();
            } else if (typeof props.variables === "object") {
                args = Object.keys(props.variables).map(function (k) {
                    var v = props.variables[k];
                    return { name: k, key: k, value: v == null ? "" : String(v) };
                });
            }
        }
        if (args && args.length) {
            props.arguments = args.map(function (row) {
                if (!row || typeof row !== "object") return null;
                var name = String(row.name || row.key || "").trim();
                if (!name) return null;
                return {
                    name: name,
                    key: name,
                    value: row.value == null ? "" : String(row.value),
                    metadata: row.metadata != null ? String(row.metadata) : "="
                };
            }).filter(Boolean);
        }
        delete props.type;
        delete props.alias;
        delete props.testclass;
        delete props.guiclass;
        delete props.category;
        delete props.variables;
        delete props.name;
        return props;
    }


    function resolveAiMountAliasMetaV1(kind, component) {
        var comp = component && typeof component === "object" ? component : {};
        var k = String(kind || "").toLowerCase();
        var alias = String(comp.alias || comp.testclass || "").trim();
        var name = String(comp.name || "").trim();
        var typeHint = String(comp.type || "").trim();

        // UserParameters 必须优先于「前置」名称启发式，否则会被误判为 BeanShellPreProcessor
        if (isAiUserParametersLikeV1(comp) || /^(user_parameters|UserParameters)$/i.test(typeHint + alias)) {
            return { alias: "UserParameters", testclass: "UserParameters", guiclass: "UserParametersGui", category: "preprocessor", label_zh: "用户参数" };
        }
        // Arguments（用户定义的变量）——不要走 TG config_items 的 http_defaults 解析
        if (isAiArgumentsLikeV1(comp) || /^(user_defined_variables|arguments|udv)$/i.test(typeHint) || /^Arguments$/i.test(alias)) {
            return { alias: "Arguments", testclass: "Arguments", guiclass: "ArgumentsPanel", category: "config", label_zh: "用户定义的变量" };
        }

        if (k === "listener" || /Visualizer|Listener|结果树|聚合报告/i.test(alias + name)) {
            var lkey = inferAiListenerKeyV1({ listener_key: comp.listener_key }, comp);
            return aiListenerAliasMetaV1(lkey);
        }
        if (k === "assert" || /Assertion|断言/i.test(alias + name + typeHint)) {
            if (/JSONPath|json.?assert/i.test(alias + typeHint + name)) {
                return { alias: "JSONPathAssertion", testclass: "JSONPathAssertion", guiclass: "JSONPathAssertionGui", category: "assertion", label_zh: "JSON 断言" };
            }
            if (/SizeAssertion|大小断言/i.test(alias + name)) {
                return { alias: "SizeAssertion", testclass: "SizeAssertion", guiclass: "SizeAssertionGui", category: "assertion", label_zh: "大小断言" };
            }
            return { alias: "ResponseAssertion", testclass: "ResponseAssertion", guiclass: "AssertionGui", category: "assertion", label_zh: "响应断言" };
        }
        if (isAiTimerLikeComponentV1(k, comp) || /定时器|Timer|集合点/i.test(alias + name)) {
            if (/同步|Synchronizing|集合点|synchronizing_timer|SyncTimer/i.test(alias + name + typeHint)) {
                return { alias: "SynchronizingTimer", testclass: "SyncTimer", guiclass: "TestBeanGUI", category: "timer", label_zh: "同步定时器" };
            }
            if (/UniformRandom|均匀随机/i.test(alias + name)) {
                return { alias: "UniformRandomTimer", testclass: "UniformRandomTimer", guiclass: "UniformRandomTimerGui", category: "timer", label_zh: "均匀随机定时器" };
            }
            return { alias: "ConstantTimer", testclass: "ConstantTimer", guiclass: "ConstantTimerGui", category: "timer", label_zh: "固定定时器" };
        }
        if (k === "processor" || /Processor|Extractor|处理器|提取器/i.test(alias + name + typeHint)) {
            if (/JSR223Pre|前置/.test(alias + name) || (k === "processor" && /前置/.test(name))) {
                if (/JSR223|groovy|javascript/i.test(alias + name + String(comp.language || ""))) {
                    return { alias: "JSR223PreProcessor", testclass: "JSR223PreProcessor", guiclass: "TestBeanGUI", category: "preprocessor", label_zh: "JSR223 前置处理器" };
                }
                return { alias: "BeanShellPreProcessor", testclass: "BeanShellPreProcessor", guiclass: "TestBeanGUI", category: "preprocessor", label_zh: "BeanShell 前置处理器" };
            }
            if (/JSONPost|JSON提取|json_path|jsonPath/i.test(alias + name + typeHint) || comp.json_path) {
                return { alias: "JSONPostProcessor", testclass: "JSONPostProcessor", guiclass: "JSONPostProcessorGui", category: "postprocessor", label_zh: "JSON 提取器" };
            }
            if (/RegexExtractor|正则/i.test(alias + name)) {
                return { alias: "RegexExtractor", testclass: "RegexExtractor", guiclass: "RegexExtractorGui", category: "postprocessor", label_zh: "正则表达式提取器" };
            }
            if (/JSR223Post/i.test(alias + name)) {
                return { alias: "JSR223PostProcessor", testclass: "JSR223PostProcessor", guiclass: "TestBeanGUI", category: "postprocessor", label_zh: "JSR223 后置处理器" };
            }
            if (/BeanShellPost|后置/.test(alias + name)) {
                return { alias: "BeanShellPostProcessor", testclass: "BeanShellPostProcessor", guiclass: "TestBeanGUI", category: "postprocessor", label_zh: "BeanShell 后置处理器" };
            }
            if (/script|language/i.test(Object.keys(comp).join(",")) && /前置/.test(name)) {
                return { alias: "JSR223PreProcessor", testclass: "JSR223PreProcessor", guiclass: "TestBeanGUI", category: "preprocessor", label_zh: "JSR223 前置处理器" };
            }
            // default post json if looks like extractor
            if (comp.var || comp.json_path || comp.refname) {
                return { alias: "JSONPostProcessor", testclass: "JSONPostProcessor", guiclass: "JSONPostProcessorGui", category: "postprocessor", label_zh: "JSON 提取器" };
            }
            if (comp.script) {
                return { alias: "JSR223PreProcessor", testclass: "JSR223PreProcessor", guiclass: "TestBeanGUI", category: "preprocessor", label_zh: "JSR223 前置处理器" };
            }
        }
        if (alias) {
            return {
                alias: alias,
                testclass: String(comp.testclass || alias),
                guiclass: String(comp.guiclass || ""),
                category: String(comp.category || k || "other"),
                label_zh: String(comp.label_zh || comp.name || alias)
            };
        }
        return null;
    }

    function shouldAiMountUnderSamplerV1(kind, component, parentStep) {
        if (!parentStep || !isAiSamplerLikeHostV1(parentStep)) return false;
        var k = String(kind || "").toLowerCase();
        if (isAiUserParametersLikeV1(component) || isAiArgumentsLikeV1(component)) return true;
        if (k === "assert" || k === "processor" || k === "listener" || k === "timer") return true;
        // AI_TIMER_MISKIND_CONFIG_V1: synchronizing_timer 常被标成 kind=config
        if (isAiTimerLikeComponentV1(k, component)) return true;
        if (k === "config" && isAiArgumentsLikeV1(component)) return true;
        return false;
    }

    function addAiCatalogMountUnderSamplerV1(tg, parentStepId, kind, op, component) {
        var parent = findStepInList(tg.steps, parentStepId);
        if (!parent) throw new Error("父取样器不存在: " + parentStepId);
        if (!isAiSamplerLikeHostV1(parent)) throw new Error("父节点不是可挂载取样器: " + parentStepId);

        var comp = component && typeof component === "object" ? component : {};
        if (String(kind || "").toLowerCase() === "listener") {
            return addAiListenerUnderSamplerV1(tg, parentStepId, op, comp);
        }

        var meta = resolveAiMountAliasMetaV1(kind, comp);
        if (!meta || !meta.alias) throw new Error("无法识别挂载元件类型");

        var props = comp.catalog_props && typeof comp.catalog_props === "object"
            ? Object.assign({}, comp.catalog_props)
            : stripAiMountMetaPropsV1(comp);

        // ResponseAssertion AI 字段兼容
        if (meta.alias === "ResponseAssertion") {
            if (!props.test_field && props.field) props.test_field = props.field;
            if (!props.patterns && props.pattern) props.patterns = [props.pattern];
            if (props.test_field === "response_code" || props.test_field === "code") {
                props.test_field = "response_code";
            }
            if (!props.match_mode && props.pattern_matching) props.match_mode = props.pattern_matching;
        }
        // SynchronizingTimer / ConstantTimer
        if (meta.alias === "ConstantTimer" || meta.alias === "SynchronizingTimer") {
            if (props.delay_ms == null && props.delay != null) props.delay_ms = props.delay;
            if (meta.alias === "SynchronizingTimer") {
                if (props.groupSize == null && props.group_size != null) props.groupSize = props.group_size;
                var gs = Number(props.groupSize);
                if (!isFinite(gs) || gs <= 0) props.groupSize = 1;
                else props.groupSize = gs;
            }
        }
        // UserParameters / Arguments：对齐官方字段与编辑器/JMX 导出
        if (meta.alias === "UserParameters") {
            props = normalizeAiUserParametersPropsV1(props);
        }
        if (meta.alias === "Arguments") {
            props = normalizeAiArgumentsPropsV1(props);
        }

        var item = {
            id: "cat_" + Math.random().toString(36).slice(2, 10),
            type: "catalog_element",
            name: String(comp.name || meta.label_zh || meta.alias),
            enabled: comp.enabled !== false,
            alias: meta.alias,
            testclass: meta.testclass || meta.alias,
            guiclass: meta.guiclass || "",
            category: meta.category || "other",
            label_zh: meta.label_zh || meta.alias,
            container: false,
            scope: "unified",
            catalog_props: props,
            jmx_fragment: ""
        };
        if (!parent.catalog_hash_children) parent.catalog_hash_children = [];
        parent.catalog_hash_children.push(item);
        try {
            var Bridge = global.JmsMountCatalogBridge;
            var IfTL = global.JmsIfMountTimeline;
            var idx = parent.catalog_hash_children.length - 1;
            if (Bridge && typeof Bridge.hashMountKey === "function" && IfTL &&
                typeof IfTL.assignAppendMountKey === "function") {
                IfTL.assignAppendMountKey(parent, Bridge.hashMountKey(item, idx));
            }
            if (IfTL && typeof IfTL.ensureBodyTimelineKeys === "function") {
                IfTL.ensureBodyTimelineKeys(parent);
            }
        } catch (e1) { /* ignore */ }
        return item;
    }

    function addAiListenerUnderSamplerV1(tg, parentStepId, op, component) {
        var parent = findStepInList(tg.steps, parentStepId);
        if (!parent) throw new Error("父取样器不存在: " + parentStepId);
        if (!isAiSamplerLikeHostV1(parent)) {
            throw new Error("父节点不是可挂载取样器: " + parentStepId);
        }
        var norm = normalizeAiListenerOpV1(op || {});
        var comp = (norm.component && typeof norm.component === "object")
            ? norm.component
            : (component && typeof component === "object" ? component : {});
        var key = inferAiListenerKeyV1(norm, comp);
        if (!key) throw new Error("listener 缺少 listener_key");
        var meta = aiListenerAliasMetaV1(key);
        if (!meta) throw new Error("不支持的监听器: " + key);

        var item = {
            id: "cat_" + Math.random().toString(36).slice(2, 10),
            type: "catalog_element",
            name: String(comp.name || meta.label_zh),
            enabled: comp.enabled !== false,
            alias: meta.alias,
            testclass: meta.testclass,
            guiclass: meta.guiclass,
            category: "listener",
            label_zh: meta.label_zh,
            container: false,
            scope: "unified",
            catalog_props: (comp.catalog_props && typeof comp.catalog_props === "object")
                ? Object.assign({}, comp.catalog_props)
                : {}
        };
        if (!parent.catalog_hash_children) parent.catalog_hash_children = [];
        parent.catalog_hash_children.push(item);

        // 同步挂载时间线 key，便于树渲染
        try {
            var Bridge = global.JmsMountCatalogBridge;
            var IfTL = global.JmsIfMountTimeline;
            var idx = parent.catalog_hash_children.length - 1;
            if (Bridge && typeof Bridge.hashMountKey === "function" && IfTL &&
                typeof IfTL.assignAppendMountKey === "function") {
                IfTL.assignAppendMountKey(parent, Bridge.hashMountKey(item, idx));
            }
            if (IfTL && typeof IfTL.ensureBodyTimelineKeys === "function") {
                IfTL.ensureBodyTimelineKeys(parent);
            }
        } catch (eMount) { /* ignore */ }
        return item;
    }

    function resolveAiListenerParentStepIdV1(tg, op, lastAddedSamplerId) {
        var explicit = op && (op.parent_ref_id != null ? op.parent_ref_id : op.parentRefId);
        if (explicit != null && String(explicit).trim() !== "") {
            return String(explicit);
        }
        // 同批刚新增的取样器：用户意图多为「接口下」挂载（AI 常漏 parent_ref_id）
        if (lastAddedSamplerId) return String(lastAddedSamplerId);
        return null;
    }

    function shouldAiAutoMountToLastSamplerV1(kind, component) {
        var k = String(kind || "").toLowerCase();
        if (k === "assert" || k === "processor" || k === "listener" || k === "timer") return true;
        if (isAiUserParametersLikeV1(component) || isAiArgumentsLikeV1(component)) return true;
        if (isAiTimerLikeComponentV1(k, component)) return true;
        return false;
    }

    function resolveAiMountParentStepIdV1(tg, op, kind, component, lastAddedSamplerId) {
        var explicit = op && (op.parent_ref_id != null ? op.parent_ref_id : op.parentRefId);
        if (explicit != null && String(explicit).trim() !== "") {
            var exp = String(explicit).trim();
            if (tg && findStepInList(tg.steps, exp)) return exp;
            if (shouldAiAutoMountToLastSamplerV1(kind, component) && lastAddedSamplerId) {
                return String(lastAddedSamplerId);
            }
            return exp;
        }
        if (shouldAiAutoMountToLastSamplerV1(kind, component) && lastAddedSamplerId) {
            return String(lastAddedSamplerId);
        }
        return null;
    }

    function applyAiStepTreeOperationsRoutedV1(planId, tgId, operations) {
        readModelFromDom();
        var plan = findPlan(planId);
        var tg = findTg(plan, tgId);
        if (!tg) throw new Error("未找到目标线程组");
        var results = { added: 0, updated: 0, replaced: 0, errors: [] };
        var lastAddedSamplerId = null;
        (operations || []).forEach(function (op, i) {
            try {
                var action = String(op.action || "").toLowerCase();
                if (action === "delete") throw new Error("不支持 delete 操作");
                var kind = String(op.kind || "step").toLowerCase();
                var component = op.component || op.data || op.step || {};
                var refId = op.ref_id || op.refId;
                if (action === "add") {
                    if (kind === "listener") {
                        op = normalizeAiListenerOpV1(op);
                        component = op.component || component;
                    }
                    // 纠正 AI 误把定时器标成 config/step 的 kind，避免走「无效配置元件」
                    if (isAiTimerLikeComponentV1(kind, component) && kind !== "timer") {
                        kind = "timer";
                    }
                    // AI 常把断言/定时器/处理器写成 timeline 且漏 parent_ref_id：挂到同批刚新增取样器
                    var parentStepId2 = resolveAiMountParentStepIdV1(tg, op, kind, component, lastAddedSamplerId);
                    var parentStep = parentStepId2 ? findStepInList(tg.steps, parentStepId2) : null;
                    if (parentStep && shouldAiMountUnderSamplerV1(kind, component, parentStep)) {
                        addAiCatalogMountUnderSamplerV1(tg, parentStepId2, kind, op, component);
                    } else if (kind === "step" && isAiTimerLikeComponentV1(kind, component)) {
                        // 定时器不能当顶层 catalog HTTP 步骤解析
                        throw new Error("定时器需挂在取样器下（缺少 parent_ref_id 且无同批取样器）");
                    } else if (kind === "step") {
                        var newStep = addAiStepTreeStep(tg, component, op);
                        if (newStep && newStep.id && isAiSamplerLikeHostV1(newStep)) {
                            lastAddedSamplerId = newStep.id;
                        }
                    } else if (kind === "assert" || kind === "processor" || kind === "timer" || kind === "listener") {
                        // 无父取样器时 timeline 断言依赖 JmsTgAssertResolver，压测页常未加载 → 明确提示
                        if (kind === "assert" && !(global.JmsTgAssertResolver && typeof global.JmsTgAssertResolver.parseAssertionsFromYaml === "function")) {
                            throw new Error("断言需挂在取样器下（缺少 parent_ref_id 且无同批取样器）");
                        }
                        createAiTimelineRef(tg, kind, component, op);
                    } else {
                        createAiTimelineRef(tg, kind, component, op);
                    }
                    results.added += 1;
                } else if (action === "update") {
                    if (!refId) throw new Error("update 缺少 ref_id");
                    if (isAiMountRefId(refId)) {
                        updateAiMountByRef(tg, refId, component);
                    } else if (isAiConfigComponentShapeV1(kind, component)) {
                        // 关键：配置/默认值绝不走步骤 catalog_element 解析
                        updateAiConfigForAiV1(tg, refId, component, op);
                    } else if (kind === "step" || findStepInList(tg.steps, refId)) {
                        updateAiStepTreeStepByRef(tg, refId, component);
                        var updatedStep = findStepInList(tg.steps, refId);
                        if (updatedStep && isAiSamplerLikeHostV1(updatedStep)) {
                            lastAddedSamplerId = updatedStep.id;
                        }
                    } else {
                        updateAiTimelineComponentByRef(tg, refId, kind, component);
                    }
                    results.updated += 1;
                } else if (action === "replace") {
                    if (!refId) throw new Error("replace 缺少 ref_id");
                    if (!kind) throw new Error("replace 缺少 kind");
                    if (isAiMountRefId(refId)) {
                        replaceAiMountByRef(tg, refId, kind, component, op);
                    } else if (isAiConfigComponentShapeV1(kind, component)) {
                        updateAiConfigForAiV1(tg, refId, component, op);
                    } else if (kind === "step" && findStepInList(tg.steps, refId)) {
                        var replacedStep = replaceAiStepTreeStep(tg, refId, component, op);
                        if (replacedStep && replacedStep.id && isAiSamplerLikeHostV1(replacedStep)) {
                            lastAddedSamplerId = replacedStep.id;
                        } else {
                            var afterRep = findStepInList(tg.steps, refId);
                            if (afterRep && isAiSamplerLikeHostV1(afterRep)) lastAddedSamplerId = afterRep.id;
                        }
                    } else {
                        replaceAiTimelineComponent(tg, refId, kind, component, op);
                    }
                    results.replaced += 1;
                } else {
                    throw new Error("未知 action: " + action);
                }
            } catch (err) {
                results.errors.push({ index: i, error: err.message || String(err) });
            }
        });
        _selected.planId = planId;
        _selected.tgId = tgId;
        notifyUserEdit();
        syncYamlFromModel();
        scheduleRender();
        return results;
    }


    function applyAiStepTreeOperations(planId, tgId, operations) {
        readModelFromDom();
        var plan = findPlan(planId);
        var tg = findTg(plan, tgId);
        if (!tg) throw new Error('未找到目标线程组');
        var results = { added: 0, updated: 0, replaced: 0, errors: [] };
        (operations || []).forEach(function (op, i) {
            try {
                var action = String(op.action || '').toLowerCase();
                if (action === 'delete') throw new Error('不支持 delete 操作');
                var kind = String(op.kind || 'step').toLowerCase();
                var component = op.component || op.data || op.step || {};
                var refId = op.ref_id || op.refId;
                if (action === 'add') {
                    if (kind === 'step') {
                        addAiStepTreeStep(tg, component, op);
                    } else {
                        createAiTimelineRef(tg, kind, component, op);
                    }
                    results.added += 1;
                } else if (action === 'update') {
                    if (!refId) throw new Error('update 缺少 ref_id');
                    if (isAiMountRefId(refId)) {
                        updateAiMountByRef(tg, refId, component);
                    } else if (kind === 'step' || findStepInList(tg.steps, refId)) {
                        updateAiStepTreeStepByRef(tg, refId, component);
                    } else {
                        updateAiTimelineComponentByRef(tg, refId, kind, component);
                    }
                    results.updated += 1;
                } else if (action === 'replace') {
                    if (!refId) throw new Error('replace 缺少 ref_id');
                    if (!kind) throw new Error('replace 缺少 kind');
                    if (isAiMountRefId(refId)) {
                        replaceAiMountByRef(tg, refId, kind, component, op);
                    } else if (kind === 'step' && findStepInList(tg.steps, refId)) {
                        replaceAiStepTreeStep(tg, refId, component, op);
                    } else {
                        replaceAiTimelineComponent(tg, refId, kind, component, op);
                    }
                    results.replaced += 1;
                } else {
                    throw new Error('未知 action: ' + action);
                }
            } catch (err) {
                results.errors.push({ index: i, error: err.message || String(err) });
            }
        });
        _selected.planId = planId;
        _selected.tgId = tgId;
        notifyUserEdit();
        syncYamlFromModel();
        scheduleRender();
        return results;
    }


    function isCatalogContainerStep(st) {
        return !!(st && st.type === 'catalog_element' && st.container);
    }

    function getStepListForParentV2(tg, parentStepId) {
        if (!parentStepId) {
            if (!tg.steps) tg.steps = [];
            return tg.steps;
        }
        var parent = findStepInList(tg.steps, parentStepId);
        if (!parent) return null;
        if (isLogicContainerStep(parent) || isCatalogContainerStep(parent)) {
            if (!parent.children) parent.children = [];
            return parent.children;
        }
        return null;
    }

    function appendCatalogElementStep(planId, tgId, parentStepId, stepData) {
        readModelFromDom();
        var plan = findPlan(planId);
        var tg = plan && findTg(plan, tgId);
        if (!tg || !stepData) return null;
        var list = getStepListForParentV2(tg, parentStepId || null);
        if (!list) return null;
        var step = Object.assign({ id: uid() }, stepData);
        if (step.container && !Array.isArray(step.children)) step.children = [];
        list.push(step);
        _selected.planId = planId;
        _selected.tgId = tgId;
        notifyUserEdit();
        syncYamlFromModel();
        scheduleRender();
        return step;
    }


    function yamlToCatalogYaml(rawYaml) {
        var m = yamlToModel(rawYaml);
        if (global.JmsScenarioNormalize && typeof global.JmsScenarioNormalize.normalizeModel === 'function') {
            global.JmsScenarioNormalize.normalizeModel(m, { force: true });
        } else if (global.JmsCatalogUnifyMigrate && typeof global.JmsCatalogUnifyMigrate.migrateModel === 'function') {
            global.JmsCatalogUnifyMigrate.migrateModel(m);
            syncTgListenerCatalogFlagsOnModel(m);
            syncMountCatalogOnModel(m);
        }
        if (global.JmsCatalogYamlExportGuard && typeof global.JmsCatalogYamlExportGuard.prepareModel === 'function') {
            global.JmsCatalogYamlExportGuard.prepareModel(m);
        } else if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.syncSceneFieldsOntoModel === 'function') {
            global.JmsPlanCatalogResolve.syncSceneFieldsOntoModel(m);
        }
        return modelToYaml(m);
    }

    function triggerRender() {
        scheduleRender();
    }

    global.JmsVisualBuilder = {
        init: init,
        beforeValidate: beforeValidate,
        addImportedStep: addImportedStep,
        addImportedStepAt: addImportedStepAt,
        addBlankHttpStep: addBlankHttpStep,
        addBlankHttpStepAt: addBlankHttpStepAt,
        addThreadGroupByKind: addThreadGroupByKind,
        deleteThreadGroupById: deleteThreadGroupById,
        canDeleteThreadGroup: canDeleteThreadGroup,
        getThreadGroupKind: getThreadGroupKind,
        listIfControllersInTg: listIfControllersInTg,
        reorderTreeStepByIndex: reorderTreeStepByIndex,
        reorderTreeTimelineByIndex: reorderTreeTimelineByIndex,
        appendAuxStep: appendAuxStep,
        appendAuxStepToParent: appendAuxStepToParent,
        openStepEditor: openStepEditor,
        validateVisual: validateVisual,
        validateVisualCurrentPlanFull: validateVisualCurrentPlanFull,
        loadTemplate: loadTemplate,
        yamlToCatalogYaml: yamlToCatalogYaml,
        syncYamlFromModel: syncYamlFromModel,
        getModel: function () { return _model; },
        setRawJmxBundle: function (bundle) { _model._raw_jmx_bundle = bundle || null; },
        openSceneMonitorModal: openSceneMonitorModal,
        openTgLoadModal: openTgLoadModal,
        renderStudioPlanToolbar: renderStudioPlanToolbar,
        notifyUserEdit: notifyUserEdit,
        triggerTgAddHttpStep: triggerTgAddHttpStep,
        deleteAuxStepCard: deleteAuxStepCard,
        resolveActiveThreadGroupContext: resolveActiveThreadGroupContext,
        exportThreadGroupYamlForAi: exportThreadGroupYamlForAi,
        applyAiStepOperations: applyAiStepOperations,
        applyAiTimelineOperations: applyAiTimelineOperations,
        exportThreadGroupTimelineForAi: exportThreadGroupTimelineForAi,
        applyAiStepTreeOperationsLegacy: applyAiStepTreeOperations,
        applyAiStepTreeOperationsRoutedV1: applyAiStepTreeOperationsRoutedV1,
        // 默认走 RoutedV1：配置更新不进 catalog_element 步骤解析（AI 专用）
        applyAiStepTreeOperations: applyAiStepTreeOperationsRoutedV1,
        exportThreadGroupStepTreeForAi: exportThreadGroupStepTreeForAi,
        appendCatalogElementStep: appendCatalogElementStep,
        getStepListForParentV2: getStepListForParentV2,
        triggerRender: triggerRender,
        runWithConfirm: runWithConfirm,
    };
})(window);

/* ---- js/jms_tg_nav_viewport.js ---- */
/**
 * 线程组左侧导航：填满可用高度，内容超出时再滚动（隔离模块）
 */
(function (global) {
    'use strict';

    var syncTimer = null;
    var navObservers = new WeakMap();

    function debounce(fn, ms) {
        return function () {
            if (syncTimer) global.clearTimeout(syncTimer);
            var args = arguments;
            syncTimer = global.setTimeout(function () {
                syncTimer = null;
                fn.apply(null, args);
            }, ms);
        };
    }

    function isActiveContext() {
        var doc = global.document;
        return doc.body
            && doc.body.classList.contains('lth-tg-view-tree')
            && doc.body.classList.contains('lth-hub-jmeter-tab');
    }

    function syncNav(navEl) {
        if (!navEl || !isActiveContext()) return;
        var list = navEl.querySelector('.jms-tg-tree-nav__list');
        if (!list) return;

        if (global.matchMedia('(max-width: 960px)').matches) {
            list.style.maxHeight = '';
            list.style.overflowY = '';
            list.removeAttribute('data-jms-nav-scroll');
            return;
        }

        list.style.maxHeight = '';
        list.style.overflowY = '';

        global.requestAnimationFrame(function () {
            var needsScroll = list.scrollHeight > list.clientHeight + 1;
            if (needsScroll) {
                list.setAttribute('data-jms-nav-scroll', '1');
            } else {
                list.removeAttribute('data-jms-nav-scroll');
            }
        });
    }

    function observeNav(navEl) {
        if (!navEl || navObservers.has(navEl) || !global.ResizeObserver) return;
        var ro = new global.ResizeObserver(function () {
            syncNav(navEl);
        });
        ro.observe(navEl);
        var list = navEl.querySelector('.jms-tg-tree-nav__list');
        if (list) ro.observe(list);
        navObservers.set(navEl, ro);
    }

    function syncAll() {
        if (!isActiveContext()) return;
        global.document.querySelectorAll('.jms-tg-tree-nav').forEach(function (navEl) {
            observeNav(navEl);
            syncNav(navEl);
        });
    }

    var debouncedSync = debounce(syncAll, 100);

    function bind() {
        if (!global.document.body) return;
        global.addEventListener('resize', debouncedSync, { passive: true });
        global.addEventListener('orientationchange', debouncedSync, { passive: true });
        debouncedSync();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgNavViewport = {
        syncNav: syncNav,
        syncAll: syncAll
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_nav_collapse.js ---- */
/**
 * 压测造数 · 线程组左侧导航收起/展开（隔离模块，不影响其他页面）
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'lth-tg-tree-nav-collapsed';
    var syncTimer = null;
    var bound = false;

    function isActiveContext() {
        var doc = global.document;
        return doc.body
            && doc.body.classList.contains('lth-tg-view-tree')
            && doc.body.classList.contains('lth-hub-jmeter-tab');
    }

    function readStoredCollapsed() {
        try {
            return global.sessionStorage.getItem(STORAGE_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function storeCollapsed(collapsed) {
        try {
            global.sessionStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
        } catch (e) { /* ignore */ }
    }

    var CHEVRON_LEFT = '<svg class="jms-tg-tree-nav__chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
        '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M10 4 6 8l4 4"/>' +
        '</svg>';
    var CHEVRON_RIGHT = '<svg class="jms-tg-tree-nav__chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
        '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M6 4l4 4-4 4"/>' +
        '</svg>';

    function setCollapsed(workspace, collapsed) {
        if (!workspace) return;
        workspace.classList.toggle('is-nav-collapsed', !!collapsed);
        var collapseBtn = workspace.querySelector('.jms-tg-tree-nav__collapse-btn');
        var expandBtn = workspace.querySelector('.jms-tg-tree-nav__expand-btn');
        if (collapseBtn) {
            collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            collapseBtn.title = collapsed ? '展开线程组列表' : '收起线程组列表';
        }
        if (expandBtn) {
            expandBtn.hidden = !collapsed;
            expandBtn.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
        }
        storeCollapsed(!!collapsed);
        if (global.JmsTgNavViewport && typeof global.JmsTgNavViewport.syncAll === 'function') {
            global.JmsTgNavViewport.syncAll();
        }
    }

    function ensureHeadRight(head) {
        var right = head.querySelector('.jms-tg-tree-nav__head-right');
        if (!right) {
            right = global.document.createElement('div');
            right.className = 'jms-tg-tree-nav__head-right';
            head.appendChild(right);
        }
        return right;
    }

    function ensureTitleGroup(head) {
        var title = head.querySelector('.jms-tg-tree-nav__title');
        if (!title) return null;
        var group = title.closest('.jms-tg-tree-nav__title-group');
        if (!group) {
            group = global.document.createElement('div');
            group.className = 'jms-tg-tree-nav__title-group';
            title.parentNode.insertBefore(group, title);
            group.appendChild(title);
            var addBtn = head.querySelector('.jms-tg-tree-nav__add-btn');
            if (addBtn && addBtn.parentElement !== group) group.appendChild(addBtn);
        }
        return group;
    }

    function ensureControls(workspace) {
        if (!workspace || workspace.dataset.jmsNavCollapseReady === '1') return;
        var nav = workspace.querySelector('.jms-tg-tree-nav');
        if (!nav) return;

        var head = nav.querySelector('.jms-tg-tree-nav__head');
        if (head && !head.querySelector('.jms-tg-tree-nav__collapse-btn')) {
            var collapseBtn = global.document.createElement('button');
            collapseBtn.type = 'button';
            collapseBtn.className = 'jms-tg-tree-nav__collapse-btn';
            collapseBtn.setAttribute('aria-label', '收起线程组列表');
            collapseBtn.setAttribute('aria-expanded', 'true');
            collapseBtn.title = '收起线程组列表';
            collapseBtn.innerHTML = CHEVRON_LEFT;
            var headRight = ensureHeadRight(head);
            headRight.appendChild(collapseBtn);
        }

        if (!workspace.querySelector('.jms-tg-tree-nav__expand-btn')) {
            var expandBtn = global.document.createElement('button');
            expandBtn.type = 'button';
            expandBtn.className = 'jms-tg-tree-nav__expand-btn';
            expandBtn.hidden = true;
            expandBtn.setAttribute('aria-label', '展开线程组列表');
            expandBtn.setAttribute('aria-expanded', 'false');
            expandBtn.title = '展开线程组列表';
            expandBtn.innerHTML = CHEVRON_RIGHT;
            workspace.insertBefore(expandBtn, workspace.firstChild);
        }

        workspace.dataset.jmsNavCollapseReady = '1';
        setCollapsed(workspace, workspace.classList.contains('is-nav-collapsed') || readStoredCollapsed());
    }

    function syncAll() {
        if (!isActiveContext()) return;
        global.document.querySelectorAll('.jms-tg-tree-workspace').forEach(function (workspace) {
            if (!workspace.querySelector('.jms-tg-tree-nav')) {
                workspace.dataset.jmsNavCollapseReady = '';
                return;
            }
            if (!workspace.querySelector('.jms-tg-tree-nav__collapse-btn')) {
                workspace.dataset.jmsNavCollapseReady = '';
            }
            if (workspace.dataset.jmsNavCollapseReady !== '1') {
                ensureControls(workspace);
            }
        });
    }

    function debouncedSync() {
        if (syncTimer) global.clearTimeout(syncTimer);
        syncTimer = global.setTimeout(function () {
            syncTimer = null;
            syncAll();
        }, 50);
    }

    function onClick(ev) {
        var collapseBtn = ev.target.closest('.jms-tg-tree-nav__collapse-btn');
        if (collapseBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var ws = collapseBtn.closest('.jms-tg-tree-workspace');
            setCollapsed(ws, true);
            return;
        }
        var expandBtn = ev.target.closest('.jms-tg-tree-nav__expand-btn');
        if (expandBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var ws2 = expandBtn.closest('.jms-tg-tree-workspace');
            setCollapsed(ws2, false);
        }
    }

    function bind() {
        if (bound) return;
        bound = true;
        global.document.addEventListener('click', onClick, true);
        var container = global.document.getElementById('jms-plans-container');
        if (container && global.MutationObserver) {
            var observer = new global.MutationObserver(debouncedSync);
            observer.observe(container, { childList: true, subtree: true });
        }
        debouncedSync();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgNavCollapse = {
        syncAll: syncAll,
        setCollapsed: setCollapsed
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_tree_step_actions.js ---- */
/**
 * 树形视图 · 步骤 ⋯ 菜单操作（隔离模块，仅 lth-tg-view-tree）
 */
(function (global) {
    'use strict';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function renderMenuActions(opts) {
        opts = opts || {};
        var menuLabel = opts.menuLabel || '步骤操作';
        var editClass = opts.editClass || 'jms-btn-edit-step';
        var delClass = opts.delClass || 'jms-btn-del-step';
        var editLabel = opts.editLabel || '编辑';
        var delLabel = opts.delLabel || '删除';
        var extraMenuItems = opts.extraMenuItems || '';
        var editAttrs = opts.editAttrs || '';
        var delAttrs = opts.delAttrs || '';
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="' + esc(menuLabel) + '" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost ' + esc(editClass) + '" role="menuitem"' + editAttrs + '>' + esc(editLabel) + '</button>' +
            '<button type="button" class="jms-btn-ghost ' + esc(delClass) + '" role="menuitem"' + delAttrs + '>' + esc(delLabel) + '</button>' +
            extraMenuItems +
            '</div></div>';
    }

    function renderHttpActions() {
        return renderMenuActions({
            extraMenuItems: '<button type="button" class="jms-btn-edit-assert jms-http-assert-trigger-sr" hidden aria-hidden="true" tabindex="-1">断言</button>'
        });
    }

    function renderAuxActions(editClass, delClass, editLabel, delLabel) {
        return renderMenuActions({
            editClass: editClass,
            delClass: delClass,
            editLabel: editLabel,
            delLabel: delLabel
        });
    }

    function renderProcessorActions(planId, tgId, index) {
        var attrs = ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-proc-index="' + index + '"';
        return renderMenuActions({
            menuLabel: '处理器操作',
            editClass: 'jms-btn-edit-tg-processor',
            delClass: 'jms-btn-del-tg-processor',
            editAttrs: attrs,
            delAttrs: attrs
        });
    }

    global.JmsTgTreeStepActions = {
        renderHttpActions: renderHttpActions,
        renderAuxActions: renderAuxActions,
        renderProcessorActions: renderProcessorActions
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_enable_dirty_sync.js ---- */
/**
 * 启用/停用切换 · 脏数据同步（隔离模块）
 * 仅同步 YAML，不触发线程组导航全量刷新，避免左侧列表闪烁。
 */
(function (global) {
    'use strict';

    function syncYamlQuiet() {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /**
     * @param {{ planId?: string, tgId?: string, ifStepId?: string }} opts
     */
    function markEnableToggleDirty(opts) {
        opts = opts || {};
        var planId = opts.planId || '';
        var tgId = opts.tgId || '';
        var ifStepId = opts.ifStepId || '';

        if (ifStepId) {
            var H = global.JmsIfMountSaveHelper;
            if (H && typeof H.markDirty === 'function') {
                H.markDirty(planId, tgId, ifStepId);
                return;
            }
        }

        syncYamlQuiet();
    }

    global.JmsTgEnableDirtySync = {
        syncYamlQuiet: syncYamlQuiet,
        markEnableToggleDirty: markEnableToggleDirty
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_mgr_config_enable_ui.js ---- */
/**
 * HTTP 配置元件 · 树形卡片启用/停用切换（隔离模块，不含 counter）
 * 覆盖：HTTP 默认值 / 请求头 / 授权 / Cookie / 缓存 / CSV
 */
(function (global) {
    'use strict';

    var TOGGLE_TYPES = [
        'http_defaults', 'header_manager', 'auth_manager',
        'cookie_manager', 'cache_manager', 'csv_data_set'
    ];
    var SEG_CLASS = 'jms-mgr-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function supportsType(typeKey) {
        return TOGGLE_TYPES.indexOf(typeKey) >= 0;
    }

    function isEnabled(data) {
        return !data || data.enabled !== false;
    }

    function typeLabel(typeKey) {
        var Catalog = global.JmsHttpStepConfigCatalog || global.JmsTgConfigCatalog;
        if (Catalog && Catalog.LABELS && Catalog.LABELS[typeKey]) return Catalog.LABELS[typeKey];
        return typeKey;
    }

    function renderCardToggle(scope, typeKey, attrs, enabled) {
        if (!supportsType(typeKey)) return '';
        var on = enabled !== false;
        var attrStr = ' data-config-type="' + esc(typeKey) + '"';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="' + esc(typeLabel(typeKey)) + '启用状态"' +
            ' data-mgr-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-mgr-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-mgr-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-mgr-enable-val');
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function patchCardDisabled(cardEl, enabled) {
        if (!cardEl) return;
        cardEl.classList.toggle('is-disabled', enabled === false);
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findPlan(model, planId) {
        return (model.test_plans || []).find(function (p) { return p.id === planId; });
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var plan = findPlan(model, planId);
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
            if (tg) return tg;
        }
        if (Array.isArray(model.setup_thread_groups)) {
            var st = model.setup_thread_groups.find(function (t) { return t.id === tgId; });
            if (st) return st;
        }
        if (Array.isArray(model.post_thread_groups)) {
            return model.post_thread_groups.find(function (t) { return t.id === tgId; }) || null;
        }
        return null;
    }

    function findHttpStep(model, planId, tgId, stepId) {
        if (!model || !stepId) return null;
        var tg = findTg(model, planId, tgId);
        if (!tg || !Array.isArray(tg.steps)) return null;
        function walk(list) {
            var found = null;
            (list || []).some(function (s) {
                if (!s) return false;
                if (s.id === stepId) { found = s; return true; }
                if (s.type === 'if_controller' && s.children) {
                    found = walk(s.children);
                    return !!found;
                }
                return false;
            });
            return found;
        }
        return walk(tg.steps);
    }

    function getStepSlice(mgr, typeKey) {
        if (!mgr) return null;
        if (typeKey === 'http_defaults') return mgr.http_defaults;
        return mgr[typeKey];
    }

    function setStepSliceEnabled(mgr, typeKey, enabled) {
        if (!mgr || !supportsType(typeKey)) return false;
        if (typeKey === 'http_defaults') {
            if (!mgr.http_defaults) mgr.http_defaults = {};
            mgr.http_defaults.enabled = enabled !== false;
        } else {
            if (!mgr[typeKey]) {
                var Catalog = global.JmsHttpStepConfigCatalog;
                if (Catalog && typeof Catalog.defaultStepHttpManagers === 'function') {
                    mgr[typeKey] = Object.assign({}, Catalog.defaultStepHttpManagers()[typeKey] || {});
                } else {
                    mgr[typeKey] = { enabled: enabled !== false };
                }
            }
            mgr[typeKey].enabled = enabled !== false;
        }
        return true;
    }

    function setTgItemEnabled(planId, tgId, itemId, typeKey, enabled) {
        var Catalog = global.JmsTgConfigCatalog;
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !itemId || !Catalog || !supportsType(typeKey)) return false;
        var item = (Catalog.ensureConfigItems ? Catalog.ensureConfigItems(tg) : tg.config_items || [])
            .find(function (it) { return it && it.id === itemId && it.type === typeKey; });
        if (!item) return false;
        if (!item.data) item.data = Catalog.defaultItemData(typeKey);
        item.data.enabled = enabled !== false;
        return true;
    }

    function setStepMgrEnabled(planId, tgId, stepId, typeKey, enabled) {
        var Catalog = global.JmsHttpStepConfigCatalog;
        var step = findHttpStep(getModel(), planId, tgId, stepId);
        if (!step || !Catalog || !supportsType(typeKey)) return false;
        if (!step.http_managers) step.http_managers = Catalog.defaultStepHttpManagers();
        setStepSliceEnabled(step.http_managers, typeKey, enabled);
        var sel = Catalog.parseSelectedTypes(step.http_managers.selected_types);
        if (enabled !== false && sel.indexOf(typeKey) < 0) {
            sel.push(typeKey);
            step.http_managers.selected_types = sel;
        }
        return true;
    }

    function markTgDirty(planId, tgId) {
        if (global.JmsTgConfigUi && typeof global.JmsTgConfigUi.markDirtyAndSync === 'function') {
            global.JmsTgConfigUi.markDirtyAndSync(planId, tgId);
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
    }

    function markStepDirty(planId, tgId, stepId) {
        if (global.JmsHttpStepConfigUi && typeof global.JmsHttpStepConfigUi.markDirtyAndRefresh === 'function') {
            global.JmsHttpStepConfigUi.markDirtyAndRefresh(planId, tgId, stepId);
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
    }

    function mountVisible(mgr, typeKey) {
        var Catalog = global.JmsHttpStepConfigCatalog;
        if (!supportsType(typeKey)) return null;
        if (Catalog && typeof Catalog.typeActive === 'function') {
            return Catalog.typeActive(mgr, typeKey);
        }
        var slice = getStepSlice(mgr, typeKey);
        return !!(slice && slice.enabled !== false);
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg) return false;
        var typeKey = seg.getAttribute('data-config-type') || '';
        if (!supportsType(typeKey)) return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-mgr-enable-val') === '1';
        var scope = seg.getAttribute('data-mgr-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        if (scope === 'tg') {
            ok = setTgItemEnabled(planId, tgId, seg.getAttribute('data-config-id') || '', typeKey, enabled);
            if (ok) {
                if (global.JmsTgEnableDirtySync &&
                    typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
                    global.JmsTgEnableDirtySync.markEnableToggleDirty({ planId: planId, tgId: tgId });
                } else {
                    markTgDirty(planId, tgId);
                }
            }
        } else if (scope === 'step') {
            ok = setStepMgrEnabled(planId, tgId, seg.getAttribute('data-step-id') || '', typeKey, enabled);
            if (ok) {
                if (global.JmsTgEnableDirtySync &&
                    typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
                    global.JmsTgEnableDirtySync.markEnableToggleDirty({ planId: planId, tgId: tgId });
                } else {
                    markStepDirty(planId, tgId, seg.getAttribute('data-step-id') || '');
                }
            }
        }
        if (ok) {
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
            var ctxRow = seg.closest('.jms-http-context__config-row');
            if (ctxRow) ctxRow.classList.toggle('is-disabled', enabled === false);
        }
        return true;
    }

    function getTgCardClass(typeKey) {
        if (!supportsType(typeKey)) return '';
        return ' jms-aux-card--tg-config-mgr jms-aux-card--tg-config-' + typeKey.replace(/_/g, '-');
    }

    function getMountCardClass(typeKey) {
        if (!supportsType(typeKey)) return '';
        return ' jms-aux-card--http-mount-config-mgr jms-aux-card--http-mount-config-' + typeKey.replace(/_/g, '-');
    }

    /** 将启用切换与 ⋮ 菜单分离，避免悬浮切换按钮时误展开编辑/删除菜单 */
    function composeCardToolbar(enableToggleHtml, stepActionsHtml) {
        if (!enableToggleHtml) return stepActionsHtml || '';
        return '<div class="jms-config-card-toolbar">' + enableToggleHtml + (stepActionsHtml || '') + '</div>';
    }

    global.JmsMgrConfigEnableUi = {
        TOGGLE_TYPES: TOGGLE_TYPES,
        SEG_CLASS: SEG_CLASS,
        supportsType: supportsType,
        isEnabled: isEnabled,
        renderCardToggle: renderCardToggle,
        applyToggleUi: applyToggleUi,
        patchCardDisabled: patchCardDisabled,
        handleToggleClick: handleToggleClick,
        mountVisible: mountVisible,
        getTgCardClass: getTgCardClass,
        getMountCardClass: getMountCardClass,
        composeCardToolbar: composeCardToolbar,
        setTgItemEnabled: setTgItemEnabled,
        setStepMgrEnabled: setStepMgrEnabled
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_counter_config_enable_ui.js ---- */
/**
 * 计数器配置元件 · 树形卡片启用/停用切换（隔离模块，仅 counter）
 * 弹窗内仅保留参数编辑；启用态在组件卡片上操作。
 */
(function (global) {
    'use strict';

    var COUNTER_TYPE = 'counter';
    var SEG_CLASS = 'jms-counter-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function isEnabled(data) {
        return !data || data.enabled !== false;
    }

    function renderCardToggle(scope, attrs, enabled) {
        var on = enabled !== false;
        var attrStr = '';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="计数器启用状态" data-counter-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') + '" data-counter-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') + '" data-counter-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-counter-enable-val');
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function patchCardDisabled(cardEl, enabled) {
        if (!cardEl) return;
        cardEl.classList.toggle('is-disabled', enabled === false);
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findPlan(model, planId) {
        return (model.test_plans || []).find(function (p) { return p.id === planId; });
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var plan = findPlan(model, planId);
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
            if (tg) return tg;
        }
        if (Array.isArray(model.setup_thread_groups)) {
            var st = model.setup_thread_groups.find(function (t) { return t.id === tgId; });
            if (st) return st;
        }
        if (Array.isArray(model.post_thread_groups)) {
            return model.post_thread_groups.find(function (t) { return t.id === tgId; }) || null;
        }
        return null;
    }

    function findHttpStep(model, planId, tgId, stepId) {
        if (!model || !stepId) return null;
        var tg = findTg(model, planId, tgId);
        if (!tg || !Array.isArray(tg.steps)) return null;
        function walk(list) {
            var found = null;
            (list || []).some(function (s) {
                if (!s) return false;
                if (s.id === stepId) { found = s; return true; }
                if (s.type === 'if_controller' && s.children) {
                    found = walk(s.children);
                    return !!found;
                }
                return false;
            });
            return found;
        }
        return walk(tg.steps);
    }

    function setTgCounterEnabled(planId, tgId, itemId, enabled) {
        var Catalog = global.JmsTgConfigCatalog;
        var model = getModel();
        var tg = findTg(model, planId, tgId);
        if (!tg || !itemId || !Catalog) return false;
        var item = (Catalog.ensureConfigItems ? Catalog.ensureConfigItems(tg) : tg.config_items || [])
            .find(function (it) { return it && it.id === itemId && it.type === COUNTER_TYPE; });
        if (!item) return false;
        if (!item.data) item.data = {};
        item.data.enabled = enabled !== false;
        return true;
    }

    function setStepCounterEnabled(planId, tgId, stepId, enabled) {
        var Catalog = global.JmsHttpStepConfigCatalog;
        var step = findHttpStep(getModel(), planId, tgId, stepId);
        if (!step || !Catalog) return false;
        if (!step.http_managers) step.http_managers = Catalog.defaultStepHttpManagers();
        if (!step.http_managers.counter) step.http_managers.counter = Catalog.defaultCounterData();
        step.http_managers.counter.enabled = enabled !== false;
        var sel = Catalog.parseSelectedTypes(step.http_managers.selected_types);
        if (enabled !== false && sel.indexOf(COUNTER_TYPE) < 0) {
            sel.push(COUNTER_TYPE);
            step.http_managers.selected_types = sel;
        }
        return true;
    }

    function markTgDirty(planId, tgId) {
        if (global.JmsTgConfigUi && typeof global.JmsTgConfigUi.markDirtyAndSync === 'function') {
            global.JmsTgConfigUi.markDirtyAndSync(planId, tgId);
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
    }

    function markStepDirty(planId, tgId, stepId) {
        if (global.JmsHttpStepConfigUi && typeof global.JmsHttpStepConfigUi.markDirtyAndRefresh === 'function') {
            global.JmsHttpStepConfigUi.markDirtyAndRefresh(planId, tgId, stepId);
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
    }

    function patchInlineRowDisabled(segEl, enabled) {
        if (!segEl) return;
        var ctxRow = segEl.closest('.jms-http-context__config-row');
        if (ctxRow) ctxRow.classList.toggle('is-disabled', enabled === false);
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg) return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-counter-enable-val') === '1';
        var scope = seg.getAttribute('data-counter-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        if (scope === 'tg') {
            ok = setTgCounterEnabled(planId, tgId, seg.getAttribute('data-config-id') || '', enabled);
            if (ok) {
                if (global.JmsTgEnableDirtySync &&
                    typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
                    global.JmsTgEnableDirtySync.markEnableToggleDirty({ planId: planId, tgId: tgId });
                } else {
                    markTgDirty(planId, tgId);
                }
            }
        } else if (scope === 'step') {
            ok = setStepCounterEnabled(planId, tgId, seg.getAttribute('data-step-id') || '', enabled);
            if (ok) {
                if (global.JmsTgEnableDirtySync &&
                    typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
                    global.JmsTgEnableDirtySync.markEnableToggleDirty({ planId: planId, tgId: tgId });
                } else {
                    markStepDirty(planId, tgId, seg.getAttribute('data-step-id') || '');
                }
            }
        }
        if (ok) {
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
            patchInlineRowDisabled(seg, enabled);
        }
        return ok;
    }

    function counterMountVisible(mgr) {
        if (!mgr || typeof mgr.counter !== 'object') return false;
        var Catalog = global.JmsHttpStepConfigCatalog;
        if (Catalog && typeof Catalog.parseSelectedTypes === 'function') {
            var sel = Catalog.parseSelectedTypes(mgr.selected_types);
            if (sel.length) return sel.indexOf(COUNTER_TYPE) >= 0;
        }
        return mgr.counter.enabled !== false;
    }

    function bind() {
        if (global.document.body.dataset.jmsCounterConfigEnableBound === '1') return;
        global.document.body.dataset.jmsCounterConfigEnableBound = '1';
        global.document.addEventListener('click', function (ev) {
            if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
            handleToggleClick(ev);
        }, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsCounterConfigEnableUi = {
        COUNTER_TYPE: COUNTER_TYPE,
        SEG_CLASS: SEG_CLASS,
        isEnabled: isEnabled,
        renderCardToggle: renderCardToggle,
        applyToggleUi: applyToggleUi,
        patchCardDisabled: patchCardDisabled,
        handleToggleClick: handleToggleClick,
        counterMountVisible: counterMountVisible,
        setTgCounterEnabled: setTgCounterEnabled,
        setStepCounterEnabled: setStepCounterEnabled,
        bind: bind
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_logic_ctrl_enable_ui.js ---- */
/**
 * 逻辑控制器及其挂载元件 · 树形卡片启用/停用（隔离模块）
 * 交互对齐配置元件：卡片分段切换，弹窗仅编辑参数。
 */
(function (global) {
    'use strict';

    var LOGIC_TYPES = [
        'if_controller', 'random_controller', 'simple_controller',
        'transaction_controller', 'loop_controller'
    ];
    var IF_MOUNT_TOGGLE_KINDS = ['timer', 'user_parameters', 'config', 'processor', 'pre_processor'];
    var COUNTER_TYPE = 'counter';
    var SEG_CLASS = 'jms-logic-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function isLogicType(typeKey) {
        return LOGIC_TYPES.indexOf(typeKey) >= 0;
    }

    function isEnabledFlag(val) {
        return val !== false;
    }

    function renderCardToggle(scope, attrs, enabled) {
        var on = enabled !== false;
        var attrStr = '';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="启用状态"' +
            ' data-logic-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-logic-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-logic-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function renderLogicStepToggle(planId, tgId, stepId, stepType, enabled) {
        if (!isLogicType(stepType)) return '';
        return renderCardToggle('logic-step', {
            'plan-id': planId,
            'tg-id': tgId,
            'step-id': stepId,
            'logic-type': stepType
        }, enabled);
    }

    function renderIfMountToggle(planId, tgId, ifStepId, mountKind, mountIndex, configType, enabled) {
        if (IF_MOUNT_TOGGLE_KINDS.indexOf(mountKind) < 0) return '';
        if (mountKind === 'config') {
            var MgrUi = global.JmsMgrConfigEnableUi;
            if (configType === COUNTER_TYPE) {
                /* 计数器走 If 挂载 config 分支，启用态由 entry.enabled 控制 */
            } else if (!MgrUi || typeof MgrUi.supportsType !== 'function' || !MgrUi.supportsType(configType)) {
                return '';
            }
        }
        return renderCardToggle('if-mount', {
            'plan-id': planId,
            'tg-id': tgId,
            'if-step-id': ifStepId,
            'if-mount-kind': mountKind,
            'if-mount-index': String(mountIndex == null ? 0 : mountIndex),
            'config-type': configType || ''
        }, enabled);
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-logic-enable-val');
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function patchCardDisabled(cardEl, enabled) {
        if (!cardEl) return;
        cardEl.classList.toggle('is-disabled', enabled === false);
    }

    function composeCardToolbar(enableToggleHtml, stepActionsHtml) {
        if (global.JmsMgrConfigEnableUi &&
            typeof global.JmsMgrConfigEnableUi.composeCardToolbar === 'function') {
            return global.JmsMgrConfigEnableUi.composeCardToolbar(enableToggleHtml, stepActionsHtml);
        }
        if (!enableToggleHtml) return stepActionsHtml || '';
        return '<div class="jms-config-card-toolbar">' + enableToggleHtml + (stepActionsHtml || '') + '</div>';
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var plan = (model.test_plans || []).find(function (p) { return p.id === planId; });
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
            if (tg) return tg;
        }
        if (Array.isArray(model.setup_thread_groups)) {
            var st = model.setup_thread_groups.find(function (t) { return t.id === tgId; });
            if (st) return st;
        }
        if (Array.isArray(model.post_thread_groups)) {
            return model.post_thread_groups.find(function (t) { return t.id === tgId; }) || null;
        }
        return null;
    }

    function isLogicContainer(st) {
        return st && isLogicType(st.type);
    }

    function findStepInList(list, stepId) {
        var found = null;
        (list || []).some(function (s) {
            if (!s) return false;
            if (s.id === stepId) { found = s; return true; }
            if (isLogicContainer(s) && s.children) {
                found = findStepInList(s.children, stepId);
                return !!found;
            }
            return false;
        });
        return found;
    }

    function findStep(planId, tgId, stepId) {
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !stepId) return null;
        return findStepInList(tg.steps, stepId);
    }

    function getIfStep(planId, tgId, ifStepId) {
        var H = global.JmsIfMountSaveHelper;
        if (H && typeof H.getIf === 'function') return H.getIf(planId, tgId, ifStepId);
        var step = findStep(planId, tgId, ifStepId);
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isLogicMountHost === 'function') {
            return global.JmsIfMountModel.isLogicMountHost(step) ? step : null;
        }
        return step && step.type === 'if_controller' ? step : null;
    }

    function setLogicStepEnabled(planId, tgId, stepId, enabled) {
        var step = findStep(planId, tgId, stepId);
        if (!step || !isLogicType(step.type)) return false;
        step.enabled = enabled !== false;
        return true;
    }

    function setIfMountEnabled(planId, tgId, ifStepId, mountKind, mountIndex, configType, enabled) {
        var ifStep = getIfStep(planId, tgId, ifStepId);
        if (!ifStep) return false;
        var on = enabled !== false;
        if (mountKind === 'timer') {
            if (!ifStep.constant_timer) {
                var Cat = global.JmsIfMountTimerCatalog;
                ifStep.constant_timer = Cat && typeof Cat.defaultTimerData === 'function'
                    ? Cat.defaultTimerData() : { enabled: false, name: '固定定时器', delay_ms: 300 };
            }
            ifStep.constant_timer.enabled = on;
            return true;
        }
        if (mountKind === 'user_parameters') {
            if (!ifStep.user_parameters) {
                var UpCat = global.JmsHttpStepUserParamsCatalog;
                ifStep.user_parameters = UpCat && typeof UpCat.defaultUserParams === 'function'
                    ? UpCat.defaultUserParams() : { enabled: false, params: [] };
            }
            ifStep.user_parameters.enabled = on;
            return true;
        }
        if (mountKind === 'config') {
            var list = ifStep.http_managers || [];
            var entry = list[mountIndex];
            if (!entry || (configType && entry.type !== configType)) return false;
            entry.enabled = on;
            return true;
        }
        if (mountKind === 'processor') {
            var procList = ifStep.processors || [];
            var proc = procList[mountIndex];
            if (!proc) return false;
            proc.enabled = on;
            return true;
        }
        if (mountKind === 'pre_processor') {
            var preList = ifStep.pre_processors || [];
            var pre = preList[mountIndex];
            if (!pre) return false;
            pre.enabled = on;
            return true;
        }
        return false;
    }

    function markLogicStepDirty(planId, tgId) {
        if (global.JmsTgEnableDirtySync &&
            typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
            global.JmsTgEnableDirtySync.markEnableToggleDirty({ planId: planId, tgId: tgId });
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function markIfMountDirty(planId, tgId, ifStepId) {
        var H = global.JmsIfMountSaveHelper;
        if (H && typeof H.markDirty === 'function') {
            H.markDirty(planId, tgId, ifStepId);
            return;
        }
        markLogicStepDirty(planId, tgId);
    }

    function refreshIfMountCard(seg) {
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ifStepId = seg.getAttribute('data-if-step-id') || '';
        var ifStep = getIfStep(planId, tgId, ifStepId);
        if (!ifStep) return;
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        var stepsEl = card && card.querySelector('.jms-tg-tree-steps');
        if (stepsEl && global.JmsTgIfMountTreeRows &&
            typeof global.JmsTgIfMountTreeRows.patchIfBodyInDom === 'function') {
            global.JmsTgIfMountTreeRows.patchIfBodyInDom(stepsEl, ifStep, planId, tgId, '');
        }
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg) return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-logic-enable-val') === '1';
        var scope = seg.getAttribute('data-logic-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        if (scope === 'logic-step') {
            ok = setLogicStepEnabled(planId, tgId, seg.getAttribute('data-step-id') || '', enabled);
            if (ok) markLogicStepDirty(planId, tgId);
        } else if (scope === 'if-mount') {
            ok = setIfMountEnabled(
                planId, tgId,
                seg.getAttribute('data-if-step-id') || '',
                seg.getAttribute('data-if-mount-kind') || '',
                parseInt(seg.getAttribute('data-if-mount-index'), 10) || 0,
                seg.getAttribute('data-config-type') || '',
                enabled
            );
            if (ok) {
                markIfMountDirty(planId, tgId, seg.getAttribute('data-if-step-id') || '');
                applyToggleUi(seg, enabled);
                patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
                patchCardDisabled(seg.closest('.jms-if-card'), enabled);
                patchCardDisabled(seg.closest('.jms-loop-card'), enabled);
                patchCardDisabled(seg.closest('.jms-random-card'), enabled);
                patchCardDisabled(seg.closest('.jms-simple-card'), enabled);
                patchCardDisabled(seg.closest('.jms-transaction-card'), enabled);
                refreshIfMountCard(seg);
            }
            return ok;
        }
        if (ok) {
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-if-card'), enabled);
            patchCardDisabled(seg.closest('.jms-loop-card'), enabled);
            patchCardDisabled(seg.closest('.jms-random-card'), enabled);
            patchCardDisabled(seg.closest('.jms-simple-card'), enabled);
            patchCardDisabled(seg.closest('.jms-transaction-card'), enabled);
        }
        return ok;
    }

    /** 弹窗保存时保留卡片上的启用态，避免覆盖 */
    function applyModalFieldsPreservingEnabled(step, data) {
        if (!step || !data) return;
        var enabled = step.enabled;
        Object.keys(data).forEach(function (k) {
            if (k === 'enabled') return;
            step[k] = data[k];
        });
        if (enabled !== undefined) step.enabled = enabled;
    }

    function bind() {
        if (global.document.body.dataset.jmsLogicCtrlEnableBound === '1') return;
        global.document.body.dataset.jmsLogicCtrlEnableBound = '1';
        global.document.addEventListener('click', function (ev) {
            if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
            handleToggleClick(ev);
        }, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsLogicCtrlEnableUi = {
        LOGIC_TYPES: LOGIC_TYPES,
        SEG_CLASS: SEG_CLASS,
        isLogicType: isLogicType,
        isEnabledFlag: isEnabledFlag,
        renderLogicStepToggle: renderLogicStepToggle,
        renderIfMountToggle: renderIfMountToggle,
        composeCardToolbar: composeCardToolbar,
        applyModalFieldsPreservingEnabled: applyModalFieldsPreservingEnabled,
        handleToggleClick: handleToggleClick
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_postproc_enable_ui.js ---- */
/**
 * 线程组后置处理器 · 树形卡片启用/停用（隔离模块）
 * 覆盖：TG 步骤树 aux 后置步骤、线程组 tg.processors 区块
 */
(function (global) {
    'use strict';

    var POSTPROC_AUX_TYPES = [
        'beanshell_post', 'json_post', 'regex_extract',
        'xpath_extract', 'jdbc_post', 'jsr223_post'
    ];
    var SEG_CLASS = 'jms-postproc-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function isPostprocAuxType(typeKey) {
        return POSTPROC_AUX_TYPES.indexOf(typeKey) >= 0;
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var plan = (model.test_plans || []).find(function (p) { return p.id === planId; });
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
            if (tg) return tg;
        }
        if (Array.isArray(model.setup_thread_groups)) {
            var st = model.setup_thread_groups.find(function (t) { return t.id === tgId; });
            if (st) return st;
        }
        if (Array.isArray(model.post_thread_groups)) {
            return model.post_thread_groups.find(function (t) { return t.id === tgId; }) || null;
        }
        return null;
    }

    function findStepInList(list, stepId) {
        var found = null;
        (list || []).some(function (s) {
            if (!s) return false;
            if (s.id === stepId) { found = s; return true; }
            if (s.type === 'if_controller' && s.children) {
                found = findStepInList(s.children, stepId);
                return !!found;
            }
            return false;
        });
        return found;
    }

    function findAuxStep(planId, tgId, stepId) {
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !stepId) return null;
        return findStepInList(tg.steps, stepId);
    }

    function renderCardToggle(scope, attrs, enabled) {
        var on = enabled !== false;
        var attrStr = '';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="启用状态"' +
            ' data-postproc-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-postproc-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-postproc-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function renderAuxStepToggle(planId, tgId, stepId, enabled) {
        return renderCardToggle('tg-aux-step', {
            'plan-id': planId,
            'tg-id': tgId,
            'step-id': stepId
        }, enabled);
    }

    function renderTgProcessorToggle(planId, tgId, procIndex, enabled) {
        return renderCardToggle('tg-processor', {
            'plan-id': planId,
            'tg-id': tgId,
            'proc-index': String(procIndex == null ? 0 : procIndex)
        }, enabled);
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-postproc-enable-val');
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function patchCardDisabled(cardEl, enabled) {
        if (!cardEl) return;
        cardEl.classList.toggle('is-disabled', enabled === false);
    }

    function composeCardToolbar(enableToggleHtml, stepActionsHtml) {
        if (global.JmsMgrConfigEnableUi &&
            typeof global.JmsMgrConfigEnableUi.composeCardToolbar === 'function') {
            return global.JmsMgrConfigEnableUi.composeCardToolbar(enableToggleHtml, stepActionsHtml);
        }
        if (!enableToggleHtml) return stepActionsHtml || '';
        return '<div class="jms-config-card-toolbar">' + enableToggleHtml + (stepActionsHtml || '') + '</div>';
    }

    function setAuxStepEnabled(planId, tgId, stepId, enabled) {
        var step = findAuxStep(planId, tgId, stepId);
        if (!step || !isPostprocAuxType(step.type)) return false;
        step.enabled = enabled !== false;
        return true;
    }

    function setTgProcessorEnabled(planId, tgId, procIndex, enabled) {
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !Array.isArray(tg.processors)) return false;
        var proc = tg.processors[procIndex];
        if (!proc) return false;
        proc.enabled = enabled !== false;
        return true;
    }

    function markDirtyAndSync() {
        if (global.JmsTgEnableDirtySync &&
            typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
            global.JmsTgEnableDirtySync.markEnableToggleDirty({});
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg) return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-postproc-enable-val') === '1';
        var scope = seg.getAttribute('data-postproc-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        if (scope === 'tg-aux-step') {
            ok = setAuxStepEnabled(planId, tgId, seg.getAttribute('data-step-id') || '', enabled);
        } else if (scope === 'tg-processor') {
            ok = setTgProcessorEnabled(
                planId, tgId,
                parseInt(seg.getAttribute('data-proc-index'), 10) || 0,
                enabled
            );
        }
        if (ok) {
            markDirtyAndSync();
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
            patchCardDisabled(seg.closest('.jms-tree-processor-row'), enabled);
        }
        return ok;
    }

    /** 弹窗保存时保留卡片上的启用态，避免覆盖 */
    function resolveEnabledForSave(existingItem, fieldsFromForm) {
        if (existingItem && existingItem.enabled !== undefined) {
            return existingItem.enabled !== false;
        }
        if (fieldsFromForm && fieldsFromForm.enabled !== undefined) {
            return fieldsFromForm.enabled !== false;
        }
        return true;
    }

    function applyModalFieldsPreservingEnabled(target, data) {
        if (!target || !data) return;
        var enabled = target.enabled;
        Object.keys(data).forEach(function (k) {
            if (k === 'enabled') return;
            target[k] = data[k];
        });
        if (enabled !== undefined) target.enabled = enabled;
    }

    function bind() {
        if (global.document.body.dataset.jmsTgPostprocEnableBound === '1') return;
        global.document.body.dataset.jmsTgPostprocEnableBound = '1';
        global.document.addEventListener('click', function (ev) {
            if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
            handleToggleClick(ev);
        }, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgPostprocEnableUi = {
        SEG_CLASS: SEG_CLASS,
        POSTPROC_AUX_TYPES: POSTPROC_AUX_TYPES,
        isPostprocAuxType: isPostprocAuxType,
        renderAuxStepToggle: renderAuxStepToggle,
        renderTgProcessorToggle: renderTgProcessorToggle,
        composeCardToolbar: composeCardToolbar,
        resolveEnabledForSave: resolveEnabledForSave,
        applyModalFieldsPreservingEnabled: applyModalFieldsPreservingEnabled
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_sampler_enable_ui.js ---- */
/**
 * 线程组取样器 · HTTP 请求 / Debug Sampler 树形卡片启用/停用（隔离模块）
 */
(function (global) {
    'use strict';

    var SEG_CLASS = 'jms-tg-sampler-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var plan = (model.test_plans || []).find(function (p) { return p.id === planId; });
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
            if (tg) return tg;
        }
        if (Array.isArray(model.setup_thread_groups)) {
            var st = model.setup_thread_groups.find(function (t) { return t.id === tgId; });
            if (st) return st;
        }
        if (Array.isArray(model.post_thread_groups)) {
            return model.post_thread_groups.find(function (t) { return t.id === tgId; }) || null;
        }
        return null;
    }

    function isLogicContainer(st) {
        return st && ['if_controller', 'loop_controller', 'random_controller',
            'simple_controller', 'transaction_controller'].indexOf(st.type) >= 0;
    }

    function findStepInList(list, stepId) {
        var found = null;
        (list || []).some(function (s) {
            if (!s) return false;
            if (s.id === stepId) { found = s; return true; }
            if (isLogicContainer(s) && s.children) {
                found = findStepInList(s.children, stepId);
                return !!found;
            }
            return false;
        });
        return found;
    }

    function findStep(planId, tgId, stepId) {
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !stepId) return null;
        return findStepInList(tg.steps, stepId);
    }

    function isHttpStep(step) {
        return !!(step && step.method);
    }

    function isDebugStep(step) {
        return !!(step && step.type === 'debug_sampler');
    }

    function renderCardToggle(scope, attrs, enabled) {
        var on = enabled !== false;
        var attrStr = '';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="启用状态"' +
            ' data-tg-sampler-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-tg-sampler-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-tg-sampler-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function renderHttpStepToggle(planId, tgId, stepId, enabled) {
        return renderCardToggle('http-step', {
            'plan-id': planId,
            'tg-id': tgId,
            'step-id': stepId
        }, enabled);
    }

    function renderDebugStepToggle(planId, tgId, stepId, enabled) {
        return renderCardToggle('debug-sampler', {
            'plan-id': planId,
            'tg-id': tgId,
            'step-id': stepId
        }, enabled);
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-tg-sampler-enable-val');
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function patchCardDisabled(cardEl, enabled) {
        if (!cardEl) return;
        cardEl.classList.toggle('is-disabled', enabled === false);
    }

    function composeCardToolbar(enableToggleHtml, stepActionsHtml) {
        if (global.JmsMgrConfigEnableUi &&
            typeof global.JmsMgrConfigEnableUi.composeCardToolbar === 'function') {
            return global.JmsMgrConfigEnableUi.composeCardToolbar(enableToggleHtml, stepActionsHtml);
        }
        if (!enableToggleHtml) return stepActionsHtml || '';
        return '<div class="jms-config-card-toolbar">' + enableToggleHtml + (stepActionsHtml || '') + '</div>';
    }

    function setStepEnabled(planId, tgId, stepId, scope, enabled) {
        var step = findStep(planId, tgId, stepId);
        if (!step) return false;
        if (scope === 'http-step' && !isHttpStep(step)) return false;
        if (scope === 'debug-sampler' && !isDebugStep(step)) return false;
        step.enabled = enabled !== false;
        return true;
    }

    function markDirtyAndSync() {
        if (global.JmsTgEnableDirtySync &&
            typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
            global.JmsTgEnableDirtySync.markEnableToggleDirty({});
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg) return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-tg-sampler-enable-val') === '1';
        var scope = seg.getAttribute('data-tg-sampler-enable-scope') || '';
        var ok = setStepEnabled(
            seg.getAttribute('data-plan-id') || '',
            seg.getAttribute('data-tg-id') || '',
            seg.getAttribute('data-step-id') || '',
            scope,
            enabled
        );
        if (ok) {
            markDirtyAndSync();
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-http-card'), enabled);
            patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
        }
        return ok;
    }

    function resolveEnabledForSave(existingItem, fieldsFromForm) {
        if (existingItem && existingItem.enabled !== undefined) {
            return existingItem.enabled !== false;
        }
        if (fieldsFromForm && fieldsFromForm.enabled !== undefined) {
            return fieldsFromForm.enabled !== false;
        }
        return true;
    }

    function applyModalFieldsPreservingEnabled(target, data) {
        if (!target || !data) return;
        var enabled = target.enabled;
        Object.keys(data).forEach(function (k) {
            if (k === 'enabled') return;
            target[k] = data[k];
        });
        if (enabled !== undefined) target.enabled = enabled;
    }

    function bind() {
        if (global.document.body.dataset.jmsTgSamplerEnableBound === '1') return;
        global.document.body.dataset.jmsTgSamplerEnableBound = '1';
        global.document.addEventListener('click', function (ev) {
            if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
            handleToggleClick(ev);
        }, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgSamplerEnableUi = {
        SEG_CLASS: SEG_CLASS,
        isHttpStep: isHttpStep,
        isDebugStep: isDebugStep,
        renderHttpStepToggle: renderHttpStepToggle,
        renderDebugStepToggle: renderDebugStepToggle,
        composeCardToolbar: composeCardToolbar,
        resolveEnabledForSave: resolveEnabledForSave,
        applyModalFieldsPreservingEnabled: applyModalFieldsPreservingEnabled
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_assert_enable_ui.js ---- */
/**
 * 断言元件 · 树形卡片启用/停用（隔离模块）
 * 覆盖：线程组 tg.assertions、If 控制器 ifStep.assertions
 * HTTP 步骤挂载断言仍走 JmsHttpMountEnableUi
 */
(function (global) {
    'use strict';

    var SEG_CLASS = 'jms-assert-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var plan = (model.test_plans || []).find(function (p) { return p.id === planId; });
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
            if (tg) return tg;
        }
        if (Array.isArray(model.setup_thread_groups)) {
            var st = model.setup_thread_groups.find(function (t) { return t.id === tgId; });
            if (st) return st;
        }
        if (Array.isArray(model.post_thread_groups)) {
            return model.post_thread_groups.find(function (t) { return t.id === tgId; }) || null;
        }
        return null;
    }

    function getIfStep(planId, tgId, ifStepId) {
        var H = global.JmsIfMountSaveHelper;
        if (H && typeof H.getIf === 'function') return H.getIf(planId, tgId, ifStepId);
        return null;
    }

    function renderCardToggle(scope, attrs, enabled) {
        var on = enabled !== false;
        var attrStr = '';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="断言启用状态"' +
            ' data-assert-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-assert-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-assert-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function renderTgAssertToggle(planId, tgId, assertIndex, enabled) {
        return renderCardToggle('tg-assert', {
            'plan-id': planId,
            'tg-id': tgId,
            'assert-index': String(assertIndex == null ? 0 : assertIndex)
        }, enabled);
    }

    function renderIfMountAssertToggle(planId, tgId, ifStepId, assertIndex, enabled) {
        return renderCardToggle('if-mount-assert', {
            'plan-id': planId,
            'tg-id': tgId,
            'if-step-id': ifStepId,
            'assert-index': String(assertIndex == null ? 0 : assertIndex)
        }, enabled);
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-assert-enable-val');
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function patchCardDisabled(cardEl, enabled) {
        if (!cardEl) return;
        cardEl.classList.toggle('is-disabled', enabled === false);
    }

    function composeCardToolbar(enableToggleHtml, stepActionsHtml) {
        if (global.JmsMgrConfigEnableUi &&
            typeof global.JmsMgrConfigEnableUi.composeCardToolbar === 'function') {
            return global.JmsMgrConfigEnableUi.composeCardToolbar(enableToggleHtml, stepActionsHtml);
        }
        if (!enableToggleHtml) return stepActionsHtml || '';
        return '<div class="jms-config-card-toolbar">' + enableToggleHtml + (stepActionsHtml || '') + '</div>';
    }

    function setTgAssertEnabled(planId, tgId, assertIndex, enabled) {
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !Array.isArray(tg.assertions)) return false;
        var a = tg.assertions[assertIndex];
        if (!a) return false;
        a.enabled = enabled !== false;
        return true;
    }

    function setIfMountAssertEnabled(planId, tgId, ifStepId, assertIndex, enabled) {
        var ifStep = getIfStep(planId, tgId, ifStepId);
        if (!ifStep || !Array.isArray(ifStep.assertions)) return false;
        var a = ifStep.assertions[assertIndex];
        if (!a) return false;
        a.enabled = enabled !== false;
        return true;
    }

    function markDirtyAndSync(planId, tgId, ifStepId) {
        if (global.JmsTgEnableDirtySync &&
            typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
            global.JmsTgEnableDirtySync.markEnableToggleDirty({
                planId: planId,
                tgId: tgId,
                ifStepId: ifStepId || ''
            });
            return;
        }
        if (ifStepId) {
            var H = global.JmsIfMountSaveHelper;
            if (H && typeof H.markDirty === 'function') {
                H.markDirty(planId, tgId, ifStepId);
                return;
            }
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function refreshIfMountCard(planId, tgId, ifStepId) {
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        var stepsEl = card && card.querySelector('.jms-tg-tree-steps');
        var ifStep = getIfStep(planId, tgId, ifStepId);
        if (stepsEl && ifStep && global.JmsTgIfMountTreeRows &&
            typeof global.JmsTgIfMountTreeRows.patchIfBodyInDom === 'function') {
            global.JmsTgIfMountTreeRows.patchIfBodyInDom(stepsEl, ifStep, planId, tgId, '');
        }
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg) return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-assert-enable-val') === '1';
        var scope = seg.getAttribute('data-assert-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        var ifStepId = '';
        if (scope === 'tg-assert') {
            ok = setTgAssertEnabled(planId, tgId, parseInt(seg.getAttribute('data-assert-index'), 10) || 0, enabled);
        } else if (scope === 'if-mount-assert') {
            ifStepId = seg.getAttribute('data-if-step-id') || '';
            ok = setIfMountAssertEnabled(planId, tgId, ifStepId, parseInt(seg.getAttribute('data-assert-index'), 10) || 0, enabled);
        }
        if (ok) {
            markDirtyAndSync(planId, tgId, ifStepId);
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
            if (scope === 'if-mount-assert') refreshIfMountCard(planId, tgId, ifStepId);
        }
        return ok;
    }

    function resolveEnabledForSave(existingItem, fieldsFromForm) {
        if (existingItem && existingItem.enabled !== undefined) {
            return existingItem.enabled !== false;
        }
        if (fieldsFromForm && fieldsFromForm.enabled !== undefined) {
            return fieldsFromForm.enabled !== false;
        }
        return true;
    }

    function applyModalFieldsPreservingEnabled(target, data) {
        if (!target || !data) return;
        var enabled = target.enabled;
        Object.keys(data).forEach(function (k) {
            if (k === 'enabled') return;
            target[k] = data[k];
        });
        if (enabled !== undefined) target.enabled = enabled;
    }

    function bind() {
        if (global.document.body.dataset.jmsAssertEnableBound === '1') return;
        global.document.body.dataset.jmsAssertEnableBound = '1';
        global.document.addEventListener('click', function (ev) {
            if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
            handleToggleClick(ev);
        }, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsAssertEnableUi = {
        SEG_CLASS: SEG_CLASS,
        renderTgAssertToggle: renderTgAssertToggle,
        renderIfMountAssertToggle: renderIfMountAssertToggle,
        composeCardToolbar: composeCardToolbar,
        resolveEnabledForSave: resolveEnabledForSave,
        applyModalFieldsPreservingEnabled: applyModalFieldsPreservingEnabled
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_listener_enable_ui.js ---- */
/**
 * 监听器 · 树形卡片启用/停用（隔离模块）
 * 覆盖：线程组 tg.listeners、If 控制器 ifStep.step_listeners
 * HTTP 步骤挂载监听器仍走 JmsHttpMountEnableUi
 */
(function (global) {
    'use strict';

    var SEG_CLASS = 'jms-listener-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findTg(model, planId, tgId) {
        if (!model || !tgId) return null;
        var plan = (model.test_plans || []).find(function (p) { return p.id === planId; });
        if (plan) {
            var tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
            if (tg) return tg;
        }
        if (Array.isArray(model.setup_thread_groups)) {
            var st = model.setup_thread_groups.find(function (t) { return t.id === tgId; });
            if (st) return st;
        }
        if (Array.isArray(model.post_thread_groups)) {
            return model.post_thread_groups.find(function (t) { return t.id === tgId; }) || null;
        }
        return null;
    }

    var LISTENER_KEYS = ['view_results_tree', 'aggregate_report', 'backend_listener'];
    var TL = function () { return global.JmsTgListenerTimeline; };

    function getIfStep(planId, tgId, ifStepId) {
        var H = global.JmsIfMountSaveHelper;
        if (H && typeof H.getIf === 'function') return H.getIf(planId, tgId, ifStepId);
        return null;
    }

    function getTgListenerConfig(tg, key) {
        var cfg = tg && tg[key];
        return cfg && typeof cfg === 'object' ? cfg : null;
    }

    function getIfListenerConfig(ifStep, key) {
        var cfg = ifStep && ifStep[key];
        return cfg && typeof cfg === 'object' ? cfg : null;
    }

    function isTgListenerPresent(tg, key) {
        var timeline = TL();
        return timeline && typeof timeline.isEnabled === 'function'
            ? timeline.isEnabled(tg, key) : !!(tg && tg.listeners && tg.listeners[key]);
    }

    function isIfMountListenerPresent(ifStep, key) {
        var sl = ifStep && ifStep.step_listeners;
        return !!(sl && sl[key]);
    }

    function isTgListenerActive(tg, key) {
        if (!isTgListenerPresent(tg, key)) return false;
        var cfg = getTgListenerConfig(tg, key);
        return !(cfg && cfg.enabled === false);
    }

    function isIfMountListenerActive(ifStep, key) {
        if (!isIfMountListenerPresent(ifStep, key)) return false;
        var cfg = getIfListenerConfig(ifStep, key);
        return !(cfg && cfg.enabled === false);
    }

    function renderTgListenerToggle(planId, tgId, listenerKey, enabled) {
        return renderCardToggle('tg-listener', {
            'plan-id': planId,
            'tg-id': tgId,
            'listener-key': listenerKey || ''
        }, enabled);
    }

    function renderIfMountListenerToggle(planId, tgId, ifStepId, listenerKey, enabled) {
        return renderCardToggle('if-mount-listener', {
            'plan-id': planId,
            'tg-id': tgId,
            'if-step-id': ifStepId,
            'listener-key': listenerKey || ''
        }, enabled);
    }

    function ensureTgListenerConfig(tg, key) {
        var timeline = TL();
        if (timeline && typeof timeline.ensureConfig === 'function') return timeline.ensureConfig(tg, key);
        if (!tg[key] || typeof tg[key] !== 'object') tg[key] = { name: key, enabled: true };
        return tg[key];
    }

    function setTgListenerEnabled(planId, tgId, listenerKey, enabled) {
        if (LISTENER_KEYS.indexOf(listenerKey) < 0) return false;
        var tg = findTg(getModel(), planId, tgId);
        if (!tg || !isTgListenerPresent(tg, listenerKey)) return false;
        if (!tg.listeners) tg.listeners = {};
        tg.listeners[listenerKey] = true;
        var cfg = ensureTgListenerConfig(tg, listenerKey);
        cfg.enabled = enabled !== false;
        return true;
    }

    function setIfMountListenerEnabled(planId, tgId, ifStepId, listenerKey, enabled) {
        if (LISTENER_KEYS.indexOf(listenerKey) < 0) return false;
        var ifStep = getIfStep(planId, tgId, ifStepId);
        if (!ifStep || !isIfMountListenerPresent(ifStep, listenerKey)) return false;
        if (!ifStep.step_listeners) ifStep.step_listeners = {};
        ifStep.step_listeners[listenerKey] = true;
        var cfg = getIfListenerConfig(ifStep, listenerKey);
        if (!cfg) { cfg = { name: listenerKey, enabled: true }; ifStep[listenerKey] = cfg; }
        cfg.enabled = enabled !== false;
        return true;
    }

    function refreshTgListenerRows(planId, tgId) {
        if (global.JmsTgListenerTreeRows && typeof global.JmsTgListenerTreeRows.refreshTgTree === 'function') {
            global.JmsTgListenerTreeRows.refreshTgTree(planId, tgId);
        }
    }

    function renderCardToggle(scope, attrs, enabled) {
        var on = enabled !== false;
        var attrStr = '';
        Object.keys(attrs || {}).forEach(function (k) {
            if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') {
                attrStr += ' data-' + k + '="' + esc(String(attrs[k])) + '"';
            }
        });
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="监听器启用状态"' +
            ' data-listener-enable-scope="' + esc(scope) + '"' + attrStr + '>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-listener-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-listener-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function renderTgAssertToggle(planId, tgId, assertIndex, enabled) {
        return renderCardToggle('tg-listener', {
            'plan-id': planId,
            'tg-id': tgId,
            'assert-index': String(assertIndex == null ? 0 : assertIndex)
        }, enabled);
    }

    function renderIfMountAssertToggle(planId, tgId, ifStepId, assertIndex, enabled) {
        return renderCardToggle('if-mount-listener', {
            'plan-id': planId,
            'tg-id': tgId,
            'if-step-id': ifStepId,
            'assert-index': String(assertIndex == null ? 0 : assertIndex)
        }, enabled);
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-listener-enable-val');
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function patchCardDisabled(cardEl, enabled) {
        if (!cardEl) return;
        cardEl.classList.toggle('is-disabled', enabled === false);
    }

    function composeCardToolbar(enableToggleHtml, stepActionsHtml) {
        if (global.JmsMgrConfigEnableUi &&
            typeof global.JmsMgrConfigEnableUi.composeCardToolbar === 'function') {
            return global.JmsMgrConfigEnableUi.composeCardToolbar(enableToggleHtml, stepActionsHtml);
        }
        if (!enableToggleHtml) return stepActionsHtml || '';
        return '<div class="jms-config-card-toolbar">' + enableToggleHtml + (stepActionsHtml || '') + '</div>';
    }



    function markDirtyAndSync(planId, tgId, ifStepId) {
        if (global.JmsTgEnableDirtySync &&
            typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
            global.JmsTgEnableDirtySync.markEnableToggleDirty({
                planId: planId,
                tgId: tgId,
                ifStepId: ifStepId || ''
            });
            return;
        }
        if (ifStepId) {
            var H = global.JmsIfMountSaveHelper;
            if (H && typeof H.markDirty === 'function') {
                H.markDirty(planId, tgId, ifStepId);
                return;
            }
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function refreshIfMountCard(planId, tgId, ifStepId) {
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        var stepsEl = card && card.querySelector('.jms-tg-tree-steps');
        var ifStep = getIfStep(planId, tgId, ifStepId);
        if (stepsEl && ifStep && global.JmsTgIfMountTreeRows &&
            typeof global.JmsTgIfMountTreeRows.patchIfBodyInDom === 'function') {
            global.JmsTgIfMountTreeRows.patchIfBodyInDom(stepsEl, ifStep, planId, tgId, '');
        }
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg) return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-listener-enable-val') === '1';
        var scope = seg.getAttribute('data-listener-enable-scope') || '';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var ok = false;
        var ifStepId = '';
        if (scope === 'tg-listener') {
            ok = setTgListenerEnabled(planId, tgId, seg.getAttribute('data-listener-key') || '', enabled);
        } else if (scope === 'if-mount-listener') {
            ifStepId = seg.getAttribute('data-if-step-id') || '';
            ok = setIfMountListenerEnabled(planId, tgId, ifStepId, seg.getAttribute('data-listener-key') || '', enabled);
        }
        if (ok) {
            markDirtyAndSync(planId, tgId, ifStepId);
            applyToggleUi(seg, enabled);
            patchCardDisabled(seg.closest('.jms-aux-card'), enabled);
            if (scope === 'if-mount-listener') refreshIfMountCard(planId, tgId, ifStepId);
            else refreshTgListenerRows(planId, tgId);
        }
        return ok;
    }

    function resolveEnabledForSave(existingItem, fieldsFromForm) {
        if (existingItem && existingItem.enabled !== undefined) {
            return existingItem.enabled !== false;
        }
        if (fieldsFromForm && fieldsFromForm.enabled !== undefined) {
            return fieldsFromForm.enabled !== false;
        }
        return true;
    }

    function applyModalFieldsPreservingEnabled(target, data) {
        if (!target || !data) return;
        var enabled = target.enabled;
        Object.keys(data).forEach(function (k) {
            if (k === 'enabled') return;
            target[k] = data[k];
        });
        if (enabled !== undefined) target.enabled = enabled;
    }

    function bind() {
        if (global.document.body.dataset.jmsListenerEnableBound === '1') return;
        global.document.body.dataset.jmsListenerEnableBound = '1';
        global.document.addEventListener('click', function (ev) {
            if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
            handleToggleClick(ev);
        }, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsListenerEnableUi = {
        SEG_CLASS: SEG_CLASS,
        LISTENER_KEYS: LISTENER_KEYS,
        isTgListenerActive: isTgListenerActive,
        isIfMountListenerActive: isIfMountListenerActive,
        renderTgListenerToggle: renderTgListenerToggle,
        renderIfMountListenerToggle: renderIfMountListenerToggle,
        composeCardToolbar: composeCardToolbar,
        resolveEnabledForSave: resolveEnabledForSave
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_tree_step_enable_unify.js ---- */
/**
 * 树形视图 · Catalog 等通用步骤启用/停用（隔离模块，对齐 JMeter enabled）
 */
(function (global) {
    'use strict';

    var SEG_CLASS = 'jms-step-enable-seg';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function sidEq(a, b) {
        return String(a) === String(b);
    }

    function findTgRobust(planId, tgId) {
        if (global.JmsStudioV2TreeStepEditFix &&
            typeof global.JmsStudioV2TreeStepEditFix.findTgRobust === 'function') {
            return global.JmsStudioV2TreeStepEditFix.findTgRobust(planId, tgId);
        }
        var m = getModel();
        if (!m || !tgId) return null;
        var hits = [];
        function scan(list, pid) {
            (list || []).forEach(function (t) {
                if (t && sidEq(t.id, tgId)) hits.push({ tg: t, planId: pid });
            });
        }
        scan(m.setup_thread_groups, planId || '');
        (m.test_plans || []).forEach(function (p) { scan(p.thread_groups, p.id); });
        scan(m.post_thread_groups, planId || '');
        if (!hits.length) return null;
        if (planId) {
            var exact = hits.find(function (h) { return sidEq(h.planId, planId); });
            if (exact) return exact.tg;
        }
        return hits[0].tg;
    }

    function findStepInTree(list, stepId) {
        if (global.JmsStudioV2TreeStepEditFix &&
            typeof global.JmsStudioV2TreeStepEditFix.findStepInTree === 'function') {
            return global.JmsStudioV2TreeStepEditFix.findStepInTree(list, stepId);
        }
        var found = null;
        (list || []).some(function (s) {
            if (!s) return false;
            if (sidEq(s.id, stepId)) { found = s; return true; }
            if (s.children) {
                found = findStepInTree(s.children, stepId);
                return !!found;
            }
            return false;
        });
        return found;
    }

    function renderStepToggle(planId, tgId, stepId, enabled) {
        var on = enabled !== false;
        return '<div class="' + SEG_CLASS + '" role="group" aria-label="启用状态"' +
            ' data-step-enable-scope="catalog-step"' +
            ' data-plan-id="' + esc(planId) + '"' +
            ' data-tg-id="' + esc(tgId) + '"' +
            ' data-step-id="' + esc(stepId) + '">' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (on ? ' is-active' : '') +
            '" data-step-enable-val="1" aria-pressed="' + (on ? 'true' : 'false') + '">启用</button>' +
            '<button type="button" class="' + SEG_CLASS + '__btn' + (!on ? ' is-active' : '') +
            '" data-step-enable-val="0" aria-pressed="' + (!on ? 'true' : 'false') + '">停用</button>' +
            '</div>';
    }

    function composeCardToolbar(enableToggleHtml, stepActionsHtml) {
        if (global.JmsMgrConfigEnableUi &&
            typeof global.JmsMgrConfigEnableUi.composeCardToolbar === 'function') {
            return global.JmsMgrConfigEnableUi.composeCardToolbar(enableToggleHtml, stepActionsHtml);
        }
        if (!enableToggleHtml) return stepActionsHtml || '';
        return '<div class="jms-config-card-toolbar">' + enableToggleHtml + (stepActionsHtml || '') + '</div>';
    }

    function applyToggleUi(segEl, enabled) {
        if (!segEl) return;
        var on = enabled !== false;
        segEl.querySelectorAll('.' + SEG_CLASS + '__btn').forEach(function (btn) {
            var val = btn.getAttribute('data-step-enable-val');
            var active = (val === '1' && on) || (val === '0' && !on);
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function patchCardDisabled(cardEl, enabled) {
        if (!cardEl) return;
        cardEl.classList.toggle('is-disabled', enabled === false);
    }

    function markDirty(planId, tgId) {
        if (global.JmsTgEnableDirtySync &&
            typeof global.JmsTgEnableDirtySync.markEnableToggleDirty === 'function') {
            global.JmsTgEnableDirtySync.markEnableToggleDirty({ planId: planId, tgId: tgId });
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        if (vb && typeof vb.scheduleRender === 'function') vb.scheduleRender();
        if (global.JmsTgTreeShell && typeof global.JmsTgTreeShell.syncAll === 'function') {
            global.JmsTgTreeShell.syncAll(true);
        }
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function setStepEnabled(planId, tgId, stepId, enabled) {
        var tg = findTgRobust(planId, tgId);
        if (!tg || !stepId) return false;
        var step = findStepInTree(tg.steps, stepId);
        if (!step) return false;
        step.enabled = enabled !== false;
        return true;
    }

    function handleToggleClick(ev) {
        var btn = ev.target.closest('.' + SEG_CLASS + '__btn');
        if (!btn) return false;
        var seg = btn.closest('.' + SEG_CLASS);
        if (!seg || seg.getAttribute('data-step-enable-scope') !== 'catalog-step') return false;
        ev.preventDefault();
        ev.stopPropagation();
        var enabled = btn.getAttribute('data-step-enable-val') === '1';
        var planId = seg.getAttribute('data-plan-id') || '';
        var tgId = seg.getAttribute('data-tg-id') || '';
        var stepId = seg.getAttribute('data-step-id') || '';
        if (!setStepEnabled(planId, tgId, stepId, enabled)) return false;
        applyToggleUi(seg, enabled);
        patchCardDisabled(seg.closest('.jms-catalog-card'), enabled);
        markDirty(planId, tgId);
        return true;
    }

    function bind() {
        if (global.document.body.dataset.jmsTgTreeStepEnableUnifyBound === '1') return;
        global.document.body.dataset.jmsTgTreeStepEnableUnifyBound = '1';
        global.document.addEventListener('click', function (ev) {
            if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
            handleToggleClick(ev);
        }, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgTreeStepEnableUnify = {
        SEG_CLASS: SEG_CLASS,
        renderStepToggle: renderStepToggle,
        composeCardToolbar: composeCardToolbar
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_tree_head_badge_slots.js ---- */
/**
 * 树形视图 · 头行右侧动态标签（紧贴启用按钮左侧，向左扩展）
 */
(function (global) {
    'use strict';

    function renderDynamicBadges(badgeList) {
        var items = (badgeList || []).filter(function (b) { return b && String(b).trim(); });
        if (!items.length) return '';
        return '<span class="jms-card-head-badges">' + items.join('') + '</span>';
    }

    function wrapCardHeadActions(badgeBarHtml, toolbarHtml) {
        return '<div class="jms-card-head-actions">' +
            (badgeBarHtml || '') +
            (toolbarHtml || '') +
            '</div>';
    }

    function getHttpBadges(step) {
        var badges = [];
        var H = global.JmsHttpContextUi;
        if (H) {
            var assertCount = typeof H.getAssertCount === 'function' ? H.getAssertCount(step) : 0;
            var procCount = typeof H.getProcessorCount === 'function' ? H.getProcessorCount(step) : 0;
            if (assertCount) {
                badges.push('<span class="jms-http-assert-badge" title="已配置断言">' + assertCount + ' 条断言</span>');
            }
            if (procCount) {
                badges.push('<span class="jms-http-proc-badge" title="已配置后置处理器">' + procCount + ' 个后置处理器</span>');
            }
        } else {
            var a = step && step.assertions;
            var ac = Array.isArray(a) ? a.length : 0;
            if (ac) {
                badges.push('<span class="jms-http-assert-badge" title="已配置断言">' + ac + ' 条断言</span>');
            }
        }
        return badges;
    }

    function getHttpBadgeBarHtml(step) {
        return renderDynamicBadges(getHttpBadges(step));
    }

    function renderChildCountBadge(childCount, className) {
        return '<span class="' + className + ' jms-http-assert-badge jms-tree-child-count-badge">' + childCount + ' 子步骤</span>';
    }

    function composeLogicHead(childCount, childClass, toolbarHtml, extraBadges) {
        var badges = [];
        if (childCount != null && childCount !== '') {
            badges.push(renderChildCountBadge(childCount, childClass));
        }
        if (extraBadges && extraBadges.length) {
            badges = badges.concat(extraBadges);
        }
        return wrapCardHeadActions(renderDynamicBadges(badges), toolbarHtml);
    }

    function composeAuxHead(toolbarHtml, extraBadges) {
        return wrapCardHeadActions(renderDynamicBadges(extraBadges || []), toolbarHtml);
    }

    function composeHttpHead(step, toolbarHtml) {
        return wrapCardHeadActions(getHttpBadgeBarHtml(step), toolbarHtml);
    }

    function patchHttpCardBadges(node, step) {
        if (!node || !step) return;
        var actions = node.querySelector('.jms-card-head-actions');
        if (!actions) return;
        var html = getHttpBadgeBarHtml(step);
        var bar = actions.querySelector('.jms-card-head-badges');
        if (!html) {
            if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
            return;
        }
        if (bar) {
            bar.outerHTML = html;
            return;
        }
        var toolbar = actions.querySelector('.jms-config-card-toolbar, .lth-step-actions, .jms-http-card__actions');
        var wrap = global.document.createElement('div');
        wrap.innerHTML = html;
        var next = wrap.firstElementChild;
        if (!next) return;
        if (toolbar) actions.insertBefore(next, toolbar);
        else actions.insertBefore(next, actions.firstChild);
    }

    global.JmsTgTreeHeadBadgeSlots = {
        renderDynamicBadges: renderDynamicBadges,
        wrapCardHeadActions: wrapCardHeadActions,
        getHttpBadges: getHttpBadges,
        composeLogicHead: composeLogicHead,
        composeAuxHead: composeAuxHead,
        composeHttpHead: composeHttpHead,
        patchHttpCardBadges: patchHttpCardBadges
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_tree_renderer.js ---- */
/**
 * JMeter 压测 · 线程组树形渲染（隔离模块，仅 lth-tg-view-tree）
 */
(function (global) {
    'use strict';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function truncate(text, maxLen) {
        text = String(text || '').trim();
        if (!text) return '';
        maxLen = maxLen || 56;
        return text.length <= maxLen ? text : text.slice(0, maxLen) + '…';
    }

    function isCatalogContainerStep(st) {
        return !!(st && st.type === 'catalog_element' && st.container);
    }

    function isCatalogLeafStep(st) {
        return !!(st && st.type === 'catalog_element' && !st.container);
    }

    function countStepsInList(list) {
        var n = 0;
        (list || []).forEach(function (s) {
            if (!s) return;
            if (s.type !== 'catalog_element') return;
            if (isCatalogContainerStep(s)) n += countStepsInList(s.children);
            else n += 1;
        });
        return n;
    }

    function tgLoadSummary(tg) {
        var l = tg.load || {};
        var sc = tg.influx_scenario ? (' · ' + tg.influx_scenario) : '';
        return (l.users || 0) + ' 用户 · ' + (l.duration_sec || 0) + 's' + sc;
    }

    function tgAnyMgrEnabled(tgOrMgr) {
        if (global.JmsTgConfigCatalog && tgOrMgr && typeof tgOrMgr === 'object' && (tgOrMgr.config_items || tgOrMgr.http_managers || tgOrMgr.id)) {
            return global.JmsTgConfigCatalog.anyItems(tgOrMgr);
        }
        var mgr = tgOrMgr || {};
        var sel = mgr.selected_types;
        if (Array.isArray(sel) && sel.length) return true;
        return mgr.http_defaults && mgr.http_defaults.enabled !== false ||
            !!(mgr.header_manager && mgr.header_manager.enabled) ||
            !!(mgr.cookie_manager && mgr.cookie_manager.enabled) ||
            !!(mgr.cache_manager && mgr.cache_manager.enabled) ||
            !!(mgr.csv_data_set && mgr.csv_data_set.enabled) ||
            !!(mgr.counter && mgr.counter.enabled);
    }

    function renderDragHandle(planId, tgId, stepId, parentStepId) {
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '"' +
            ' data-step-id="' + esc(stepId) + '" data-parent-step-id="' + esc(parentStepId || '') + '">' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }

    function renderAuxActions(planId, tgId, editClass, delClass) {
        if (global.JmsTgTreeStepActions && typeof global.JmsTgTreeStepActions.renderAuxActions === 'function') {
            return global.JmsTgTreeStepActions.renderAuxActions(editClass, delClass);
        }
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="步骤操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost ' + editClass + '" role="menuitem">编辑</button>' +
            '<button type="button" class="jms-btn-ghost ' + delClass + '" role="menuitem">删除</button>' +
            '</div></div>';
    }

    function renderLogicHeadActions(planId, tgId, step, editClass, delClass) {
        var actions = renderAuxActions(planId, tgId, editClass, delClass);
        var L = global.JmsLogicCtrlEnableUi;
        if (!L || !step || typeof L.renderLogicStepToggle !== 'function' || typeof L.isLogicType !== 'function') {
            return actions;
        }
        if (!L.isLogicType(step.type)) return actions;
        var toggle = L.renderLogicStepToggle(planId, tgId, step.id, step.type, step.enabled);
        if (!toggle) return actions;
        return typeof L.composeCardToolbar === 'function'
            ? L.composeCardToolbar(toggle, actions)
            : actions;
    }


    function renderLogicHeadToolbar(planId, tgId, step, editClass, delClass, childCount, childCountClass) {
        var toolbar = renderLogicHeadActions(planId, tgId, step, editClass, delClass);
        var S = global.JmsTgTreeHeadBadgeSlots;
        if (S && typeof S.composeLogicHead === 'function') {
            return S.composeLogicHead(childCount, childCountClass, toolbar);
        }
        return '<div class="jms-card-head-actions">' + toolbar + '</div>';
    }
    function renderPostprocAuxActions(planId, tgId, step, editClass, delClass) {
        var actions = renderAuxActions(planId, tgId, editClass, delClass);
        var toolbar = actions;
        var P = global.JmsTgPostprocEnableUi;
        if (P && step && typeof P.renderAuxStepToggle === 'function' && typeof P.isPostprocAuxType === 'function'
            && P.isPostprocAuxType(step.type)) {
            var toggle = P.renderAuxStepToggle(planId, tgId, step.id, step.enabled);
            if (toggle) {
                toolbar = typeof P.composeCardToolbar === 'function'
                    ? P.composeCardToolbar(toggle, actions)
                    : actions;
            }
        }
        var SlotsP = global.JmsTgTreeHeadBadgeSlots;
        return (SlotsP && typeof SlotsP.composeAuxHead === 'function') ? SlotsP.composeAuxHead(toolbar) : toolbar;
    }

    function renderHttpHeadActions(planId, tgId, step) {
        var actions = renderHttpActions(planId, tgId);
        var toolbar = actions;
        var En = global.JmsTgSamplerEnableUi;
        if (En && step && typeof En.renderHttpStepToggle === 'function') {
            var toggle = En.renderHttpStepToggle(planId, tgId, step.id, step.enabled);
            if (toggle) {
                toolbar = typeof En.composeCardToolbar === 'function'
                    ? En.composeCardToolbar(toggle, actions)
                    : actions;
            }
        }
        var Slots = global.JmsTgTreeHeadBadgeSlots;
        if (Slots && typeof Slots.composeHttpHead === 'function') {
            return Slots.composeHttpHead(step, toolbar);
        }
        return toolbar;
    }

    function renderDebugAuxActions(planId, tgId, step, editClass, delClass) {
        var actions = renderAuxActions(planId, tgId, editClass, delClass);
        var toolbar = actions;
        var S = global.JmsTgSamplerEnableUi;
        if (S && step && step.type === 'debug_sampler' && typeof S.renderDebugStepToggle === 'function') {
            var toggle = S.renderDebugStepToggle(planId, tgId, step.id, step.enabled);
            if (toggle) {
                toolbar = typeof S.composeCardToolbar === 'function'
                    ? S.composeCardToolbar(toggle, actions)
                    : actions;
            }
        }
        var SlotsD = global.JmsTgTreeHeadBadgeSlots;
        return (SlotsD && typeof SlotsD.composeAuxHead === 'function') ? SlotsD.composeAuxHead(toolbar) : toolbar;
    }

    function renderHttpActions(planId, tgId) {
        if (global.JmsTgTreeStepActions && typeof global.JmsTgTreeStepActions.renderHttpActions === 'function') {
            return global.JmsTgTreeStepActions.renderHttpActions();
        }
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="步骤操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost jms-btn-edit-step" role="menuitem">编辑</button>' +
            '<button type="button" class="jms-btn-ghost jms-btn-del-step" role="menuitem">删除</button>' +
            '<button type="button" class="jms-btn-edit-assert jms-http-assert-trigger-sr" hidden aria-hidden="true" tabindex="-1">断言</button>' +
            '</div></div>';
    }

    function resolveSelectedHttpStepId(planId, tgId, selectedHttpStepId) {
        if (selectedHttpStepId === false) return '';
        if (selectedHttpStepId) return String(selectedHttpStepId);
        if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.getSelected === 'function') {
            return global.JmsHttpContextUi.getSelected(planId, tgId) || '';
        }
        return '';
    }

    function renderSingleStep(step, planId, tgId, depth, indexRef, parentStepId, selectedHttpStepId) {
        if (!step) return '';
        depth = depth || 0;
        indexRef = indexRef || { n: 0 };
        parentStepId = parentStepId || '';
        if (step.type === 'catalog_element' && global.JmsTgCatalogElementTree && typeof global.JmsTgCatalogElementTree.renderRow === 'function') {
            indexRef.n += 1;
            return global.JmsTgCatalogElementTree.renderRow(step, planId, tgId, depth, parentStepId, selectedHttpStepId);
        }
        return '';
    }

    function renderStepNodes(steps, planId, tgId, depth, indexRef, parentStepId, selectedHttpStepId) {
        depth = depth || 0;
        indexRef = indexRef || { n: 0 };
        parentStepId = parentStepId || '';
        var html = '';
        (steps || []).forEach(function (step) {
            html += renderSingleStep(step, planId, tgId, depth, indexRef, parentStepId, selectedHttpStepId);
        });
        return html;
    }

    /** If 挂载区 · 局部刷新子步骤（隔离导出，供 children patch 使用） */
    function renderChildStepNodes(steps, planId, tgId, depth, parentStepId, selectedHttpStepId) {
        return renderStepNodes(steps, planId, tgId, depth || 0, { n: 0 }, parentStepId || '', selectedHttpStepId || '');
    }


    function renderTgAddActions(planId, tgId) {
        return '<div class="jms-tg-add-row lth-tg-add-row jms-tg-tree-head-add">' +
            '<button type="button" class="jms-add-chip jms-btn-add-http jms-tg-tree-btn-primary" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">+ HTTP</button>' +
            '</div>';
    }

    function tgAnyListenerOn(ls) {
        ls = ls || {};
        return !!(ls.view_results_tree || ls.aggregate_report || ls.backend_listener);
    }

    function renderTgMenuShell(wrapCls, triggerCls, menuCls, label, planId, tgId, btnExtra) {
        btnExtra = btnExtra || '';
        return '<div class="' + wrapCls + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">' +
            '<button type="button" class="' + triggerCls + ' jms-tg-tree-btn-ghost' + btnExtra + '" title="' + esc(label) + '" aria-haspopup="true" aria-expanded="false">' +
            esc(label) + '<span class="jms-tg-sampler-caret" aria-hidden="true">▾</span></button>' +
            '<div class="' + menuCls + '" role="menu"></div></div>';
    }

    function renderTgSamplerMenu(tg, planId) {
        return renderTgMenuShell('jms-tg-sampler-more', 'jms-tg-sampler-trigger', 'jms-tg-sampler-menu', '取样器', planId, tg.id);
    }

    function renderTgAssertMenu(tg, planId) {
        return renderTgMenuShell('jms-tg-assert-more', 'jms-tg-assert-trigger', 'jms-tg-assert-menu', '断言', planId, tg.id);
    }

    function renderTgPostProcMenu(tg, planId) {
        return renderTgMenuShell('jms-tg-post-proc-more', 'jms-tg-post-proc-trigger', 'jms-tg-post-proc-menu', '后置处理器', planId, tg.id);
    }

    function renderTgLogicCtrlMenu(tg, planId) {
        return renderTgMenuShell('jms-tg-logic-ctrl-more', 'jms-tg-logic-ctrl-trigger', 'jms-tg-logic-ctrl-menu', '逻辑控制器', planId, tg.id);
    }

    function renderTgListenerMenu(tg, planId) {
        var ls = tg.listeners || {};
        var anyOn = tgAnyListenerOn(ls);
        return renderTgMenuShell('jms-tg-listener-more jms-tg-listeners lth-tg-listeners', 'jms-tg-listener-menu-trigger', 'jms-tg-listener-menu', '监听器', planId, tg.id, anyOn ? ' is-on' : '');
    }

    function renderTgTools(tg, planId) {
        var cfgOn = tgAnyMgrEnabled(tg);
        var configMenu = (global.JmsTgConfigMenuUi && typeof global.JmsTgConfigMenuUi.renderMenu === 'function')
            ? global.JmsTgConfigMenuUi.renderMenu(tg, planId)
            : '<button type="button" class="jms-tg-config-btn jms-tg-tree-btn-ghost' + (cfgOn ? ' is-on' : '') + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '" title="配置元件">配置元件</button>';
        if (!configMenu) {
            configMenu = '<button type="button" class="jms-tg-config-btn jms-tg-tree-btn-ghost' + (cfgOn ? ' is-on' : '') + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '" title="配置元件">配置元件</button>';
        }
        return '<div class="jms-tg-tools jms-tg-tree-tools jms-tg-tree-tools--inline">' +
            '<div class="jms-tg-tree-head__group jms-tg-tree-head__group--settings">' +
            configMenu +
            renderTgLogicCtrlMenu(tg, planId) +
            renderTgSamplerMenu(tg, planId) +
            renderTgPostProcMenu(tg, planId) +
            renderTgAssertMenu(tg, planId) +
            renderTgListenerMenu(tg, planId) +
            '</div>' +
            '</div>';
    }

    function renderTgDetail(planId, tg, kind, selectedHttpStepId) {
        var stepCount = countStepsInList(tg.steps);
        var selectedId = resolveSelectedHttpStepId(planId, tg.id, selectedHttpStepId);
        if (selectedId && global.JmsHttpContextUi && typeof global.JmsHttpContextUi.stepExistsInTg === 'function') {
            var model = global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
                ? global.JmsVisualBuilder.getModel()
                : null;
            if (!global.JmsHttpContextUi.stepExistsInTg(model, planId, tg.id, selectedId)) {
                selectedId = '';
                if (typeof global.JmsHttpContextUi.clearSelected === 'function') {
                    global.JmsHttpContextUi.clearSelected(planId, tg.id);
                }
            }
        }
        var stepsHtml;
        if (global.JmsTgDetailTimeline && typeof global.JmsTgDetailTimeline.canUse === 'function' &&
            global.JmsTgDetailTimeline.canUse(tg)) {
            stepsHtml = global.JmsTgDetailTimeline.render(planId, tg, selectedId, {
                renderSingleStep: renderSingleStep
            });
        } else if (global.JmsTgImportTimeline && typeof global.JmsTgImportTimeline.canUse === 'function' &&
            global.JmsTgImportTimeline.canUse(tg)) {
            stepsHtml = global.JmsTgImportTimeline.render(planId, tg, selectedId, {
                renderSingleStep: renderSingleStep
            });
        } else {
            var assertHtml = (global.JmsTgAssertTreeRows && typeof global.JmsTgAssertTreeRows.renderAssertNodes === 'function')
                ? global.JmsTgAssertTreeRows.renderAssertNodes(planId, tg) : '';
            var configHtml = (global.JmsTgConfigUi && typeof global.JmsTgConfigUi.renderConfigNodes === 'function')
                ? global.JmsTgConfigUi.renderConfigNodes(planId, tg) : '';
            stepsHtml = assertHtml + configHtml + renderStepNodes(tg.steps, planId, tg.id, 0, { n: 0 }, '', selectedId);
        }
        if (!stepsHtml) {
            stepsHtml = '<p class="jms-empty-hint jms-tree-empty">暂无线程步骤，可通过「取样器」→「HTTP请求」添加</p>';
        }
        var setupTag = kind === 'setup' ? '<span class="jms-tree-setup-tag">Setup</span>' : (kind === 'post' ? '<span class="jms-tree-setup-tag jms-tree-post-tag">Post</span>' : '');
        return '<div class="jms-tg-tree-main">' +
            '<div class="jms-tg-block jms-tg-block--tree" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">' +
            '<div class="jms-tg-head jms-tg-tree-head jms-tg-tree-head--single">' +
            '<span class="jms-tg-icon jms-tg-tree-head__icon">⚙</span>' +
            setupTag +
            '<input type="text" class="jms-tg-name jms-tg-name--tree" value="' + esc(tg.name) + '" placeholder="线程组名称" />' +
            renderTgTools(tg, planId) +
            '<span class="jms-tg-tree-head__meta">' +
            '<span class="jms-tg-load-badge">' + esc(tgLoadSummary(tg)) + '</span>' +
            '<span class="jms-tree-step-count">' + stepCount + ' 步</span>' +
            '</span>' +
            '</div>' +
            '<div class="jms-tg-steps jms-tg-tree-steps">' + stepsHtml + '</div>' +
            '</div></div>';
    }

    function collectThreadGroups(model, planId) {
        if (global.JmsTgDisplayOrder && typeof global.JmsTgDisplayOrder.collectInDisplayOrder === 'function') {
            return global.JmsTgDisplayOrder.collectInDisplayOrder(model, planId);
        }
        var list = [];
        if (!model) return list;
        (model.setup_thread_groups || []).forEach(function (tg) {
            list.push({ key: 'setup:' + tg.id, tg: tg, planId: planId, kind: 'setup', isSetup: true, isPost: false });
        });
        var plan = (model.test_plans || []).find(function (p) { return String(p.id) === String(planId); });
        if (plan) {
            (plan.thread_groups || []).forEach(function (tg) {
                list.push({ key: tg.id, tg: tg, planId: planId, kind: 'thread', isSetup: false, isPost: false });
            });
        }
        (model.post_thread_groups || []).forEach(function (tg) {
            list.push({ key: 'post:' + tg.id, tg: tg, planId: planId, kind: 'post', isSetup: false, isPost: true });
        });
        return list;
    }


    function renderNavHead(planId) {
        return '<div class="jms-tg-tree-nav__head">' +
            '<span class="jms-tg-tree-nav__title">线程组</span>' +
            '<button type="button" class="jms-tg-tree-nav__add-btn jms-btn-add-tg" data-plan-id="' + esc(planId) + '" aria-label="添加线程组" title="添加 Setup / 主流程 / 清理线程组">＋</button>' +
            '<div class="jms-tg-tree-nav__head-right" aria-hidden="false"></div>' +
            '</div>';
    }

    function renderNav(model, planId, activeKey) {
        var groups = collectThreadGroups(model, planId);
        if (!groups.length) {
            return '<nav class="jms-tg-tree-nav" aria-label="线程组导航">' + renderNavHead(planId) + '<p class="jms-empty-hint">暂无线程组</p></nav>';
        }
        var navIdx = 0;
        var items = groups.map(function (item) {
            var tg = item.tg;
            var active = item.key === activeKey ? ' is-active' : '';
            var stepCount = countStepsInList(tg.steps);
            navIdx += 1;
            var prefix = String(navIdx);
            var delHtml =
                '<button type="button" class="jms-tg-tree-nav__del" aria-label="删除线程组" title="删除线程组"' +
                ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '" data-tg-kind="' + esc(item.kind || 'thread') + '">' +
                '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
                '<path fill="currentColor" d="M5.5 1.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V2h2.5a.5.5 0 0 1 0 1H12v9.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 12.5V3H3a.5.5 0 0 1 0-1h2.5v-.5zm1 0v.5h3v-.5h-3zM5 3v9.5a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5V3H5zm2 2.75a.5.5 0 0 1 .5.5v4.5a.5.5 0 0 1-1 0V6.25a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v4.5a.5.5 0 0 1-1 0V6.25a.5.5 0 0 1 .5-.5z"/>' +
                '</svg></button>';
            return '<div class="jms-tg-tree-nav__item' + active + '" data-tg-key="' + esc(item.key) + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tg.id) + '">' +
                '<button type="button" class="jms-tg-tree-nav__main">' +
                '<span class="jms-tg-tree-nav__idx">' + esc(prefix) + '</span>' +
                '<span class="jms-tg-tree-nav__body">' +
                '<span class="jms-tg-tree-nav__name">' + esc(tg.name) + '</span>' +
                '<span class="jms-tg-tree-nav__meta">' + stepCount + ' 步 · ' + esc(tgLoadSummary(tg)) + '</span>' +
                '</span></button>' + delHtml + '</div>';
        }).join('');
        return '<nav class="jms-tg-tree-nav" aria-label="线程组导航">' +
            renderNavHead(planId) +
            '<div class="jms-tg-tree-nav__list">' + items + '</div>' +
            '<div class="jms-tg-tree-nav__foot">' + groups.length + ' 个线程组</div>' +
            '</nav>';
    }

    function renderWorkspace(model, planId, activeKey) {
        var groups = collectThreadGroups(model, planId);
        if (!activeKey && groups.length) activeKey = groups[0].key;
        var active = groups.find(function (g) { return g.key === activeKey; }) || groups[0];
        var detailHtml = active
            ? renderTgDetail(active.planId, active.tg, active.kind || (active.isSetup ? 'setup' : 'thread'))
            : '<div class="jms-tg-tree-main"><p class="jms-empty-hint">请选择线程组</p></div>';
        return '<div class="jms-tg-tree-workspace">' +
            renderNav(model, planId, activeKey) +
            detailHtml +
            '</div>';
    }

    function findActiveGroup(model, planId, activeKey) {
        var groups = collectThreadGroups(model, planId);
        if (!activeKey) return groups[0] || null;
        return groups.find(function (g) { return g.key === activeKey; }) || groups[0] || null;
    }

    function renderDetailPanel(model, planId, activeKey, selectedHttpStepId) {
        var active = findActiveGroup(model, planId, activeKey);
        if (!active) {
            return '<div class="jms-tg-tree-main"><p class="jms-empty-hint">请选择线程组</p></div>';
        }
        return renderTgDetail(
            active.planId,
            active.tg,
            active.kind || (active.isSetup ? 'setup' : 'thread'),
            selectedHttpStepId
        );
    }

    global.JmsTgTreeRenderer = {
        collectThreadGroups: collectThreadGroups,
        countStepsInList: countStepsInList,
        renderNav: renderNav,
        renderWorkspace: renderWorkspace,
        renderDetailPanel: renderDetailPanel,
        findActiveGroup: findActiveGroup,
        renderChildStepNodes: renderChildStepNodes
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_tree_scroll_preserve.js ---- */
/**
 * 树形工作台 · 滚动位置保留（隔离模块，添加/刷新组件时不跳顶）
 */
(function (global) {
    'use strict';

    function pageY() {
        return global.scrollY || global.pageYOffset || 0;
    }

    function capture(card) {
        var snap = { winY: pageY() };
        if (!card) return snap;
        var steps = card.querySelector('.jms-tg-tree-steps');
        var navList = card.querySelector('.jms-tg-tree-nav__list');
        snap.stepsTop = steps ? steps.scrollTop : 0;
        snap.navListTop = navList ? navList.scrollTop : 0;
        return snap;
    }

    function restore(card, snap) {
        if (!snap) return;
        var winY = snap.winY || 0;
        var stepsTop = snap.stepsTop || 0;
        var navListTop = snap.navListTop || 0;
        global.requestAnimationFrame(function () {
            global.requestAnimationFrame(function () {
                if (card) {
                    var steps = card.querySelector('.jms-tg-tree-steps');
                    var navList = card.querySelector('.jms-tg-tree-nav__list');
                    if (steps) steps.scrollTop = stepsTop;
                    if (navList) navList.scrollTop = navListTop;
                }
                if (Math.abs(pageY() - winY) > 1) {
                    try {
                        global.scrollTo({ top: winY, left: 0, behavior: 'auto' });
                    } catch (e) {
                        global.scrollTo(0, winY);
                    }
                }
            });
        });
    }

    function captureAll() {
        var container = global.document.getElementById('jms-plans-container');
        var cards = Object.create(null);
        if (container) {
            container.querySelectorAll('.jms-plan-card').forEach(function (card) {
                var pid = card.getAttribute('data-plan-id');
                if (pid) cards[pid] = capture(card);
            });
        }
        return { winY: pageY(), cards: cards };
    }

    function restoreAll(snap) {
        if (!snap) return;
        var container = global.document.getElementById('jms-plans-container');
        global.requestAnimationFrame(function () {
            global.requestAnimationFrame(function () {
                if (container && snap.cards) {
                    Object.keys(snap.cards).forEach(function (pid) {
                        var card = container.querySelector('.jms-plan-card[data-plan-id="' + pid + '"]');
                        if (card) restore(card, snap.cards[pid]);
                    });
                }
                var winY = snap.winY || 0;
                if (Math.abs(pageY() - winY) > 1) {
                    try {
                        global.scrollTo({ top: winY, left: 0, behavior: 'auto' });
                    } catch (e) {
                        global.scrollTo(0, winY);
                    }
                }
            });
        });
    }

    global.JmsTgTreeScrollPreserve = {
        capture: capture,
        restore: restore,
        captureAll: captureAll,
        restoreAll: restoreAll
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_tree_shell.js ---- */
/**
 * JMeter 压测 · 线程组树形工作台壳层（隔离模块）
 */
(function (global) {
    'use strict';

    var STORAGE_VIEW = 'lth_tg_view_mode';
    var STORAGE_ACTIVE = 'lth_tg_tree_active';
    var navSwitching = false;
    var syncTimer = null;

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree');
    }

    function isJmeterTab() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function readActiveMap() {
        try {
            var raw = global.sessionStorage.getItem(STORAGE_ACTIVE);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function writeActiveMap(map) {
        try {
            global.sessionStorage.setItem(STORAGE_ACTIVE, JSON.stringify(map));
        } catch (e) { /* ignore */ }
    }

    function getActiveKey(planId) {
        return readActiveMap()[planId] || '';
    }

    function setActiveKey(planId, key) {
        var map = readActiveMap();
        map[planId] = key;
        writeActiveMap(map);
    }

    function resolveActiveKey(model, planId) {
        var groups = global.JmsTgTreeRenderer.collectThreadGroups(model, planId);
        var activeKey = getActiveKey(planId);
        if (!activeKey || !groups.some(function (g) { return g.key === activeKey; })) {
            activeKey = groups.length ? groups[0].key : '';
            if (activeKey) setActiveKey(planId, activeKey);
        }
        return activeKey;
    }

    function syncTreeNameToLegacy(card) {
        var main = card.querySelector('.jms-tg-tree-main .jms-tg-block--tree');
        if (!main) return;
        var tgId = main.getAttribute('data-tg-id');
        var nameEl = main.querySelector('.jms-tg-name');
        if (!nameEl || !tgId) return;
        var legacy = card.querySelector('.jms-plan-tgs--legacy .jms-tg-block[data-tg-id="' + tgId + '"]');
        if (legacy) {
            var legacyName = legacy.querySelector('.jms-tg-name');
            if (legacyName) legacyName.value = nameEl.value;
        }
    }

    function applyIfCollapseState(card) {
        var T = global.JmsLogicCtrlCardToggle;
        if (T && typeof T.applyState === 'function') T.applyState(card);
        var C = global.JmsCatalogCardToggle;
        if (C && typeof C.applyState === 'function') C.applyState(card);
    }

    function updateNavActive(host, activeKey) {
        host.querySelectorAll('.jms-tg-tree-nav__item').forEach(function (btn) {
            var on = btn.getAttribute('data-tg-key') === activeKey;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-current', on ? 'true' : 'false');
        });
    }

    function getDetailScrollEl(card) {
        return card && card.querySelector('.jms-tg-tree-steps');
    }

    function scrollPreserveApi() {
        return global.JmsTgTreeScrollPreserve;
    }

    function replaceDetailPanel(card, planId, activeKey, selectedHttpStepId, opts) {
        opts = opts || {};
        if (!card || !global.JmsTgTreeRenderer) return;
        var model = getModel();
        if (!model) return;
        var host = card.querySelector('.jms-tg-tree-host');
        if (!host) return;
        var SP = scrollPreserveApi();
        var snap = (opts.preserveScroll && SP && SP.capture) ? SP.capture(card) : null;
        var wrap = global.document.createElement('div');
        wrap.innerHTML = global.JmsTgTreeRenderer.renderDetailPanel(model, planId, activeKey, selectedHttpStepId);
        var nextMain = wrap.firstElementChild;
        var curMain = host.querySelector('.jms-tg-tree-main');
        if (curMain && nextMain) {
            curMain.replaceWith(nextMain);
        } else if (nextMain && host.querySelector('.jms-tg-tree-workspace')) {
            host.querySelector('.jms-tg-tree-workspace').appendChild(nextMain);
        }
        if (snap && SP && SP.restore) SP.restore(card, snap);
        applyIfCollapseState(card);
        if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.ensureBind === 'function') {
            global.JmsHttpContextUi.ensureBind();
        }

    }

    function refreshHttpContext(card, planId) {
        if (!card || !global.JmsTgTreeRenderer) return;
        navSwitching = true;
        try {
            syncTreeNameToLegacy(card);
            var model = getModel();
            if (!model) return;
            var activeKey = resolveActiveKey(model, planId);
            var active = global.JmsTgTreeRenderer.findActiveGroup(model, planId, activeKey);
            if (!active) return;
            var tgId = active.tg.id;
            var stepId = global.JmsHttpContextUi && typeof global.JmsHttpContextUi.getSelected === 'function'
                ? (global.JmsHttpContextUi.getSelected(planId, tgId) || '')
                : '';
            if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.patchSelectionInDom === 'function') {
                if (global.JmsHttpContextUi.patchSelectionInDom(card, planId, tgId, stepId)) {
                    if (stepId && global.JmsHttpContextUi.findHttpStep) {
                        var httpStep = global.JmsHttpContextUi.findHttpStep(model, planId, tgId, stepId);
                        var stepsEl = card.querySelector('.jms-tg-tree-steps');
                        if (httpStep && stepsEl && global.JmsHttpMountTreeRows &&
                            typeof global.JmsHttpMountTreeRows.patchMountChildrenInDom === 'function') {
                            global.JmsHttpMountTreeRows.patchMountChildrenInDom(stepsEl, httpStep, planId, tgId);
                        }
                    }
                    return;
                }
            }
            replaceDetailPanel(card, planId, activeKey, stepId || undefined, { preserveScroll: true });
        } finally {
            global.setTimeout(function () { navSwitching = false; }, 40);
        }
    }

    function switchThreadGroup(card, planId, activeKey) {
        if (!card || !global.JmsTgTreeRenderer) return;
        var model = getModel();
        if (!model) return;

        navSwitching = true;
        try {
            syncTreeNameToLegacy(card);
            setActiveKey(planId, activeKey);
            if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.clearPlan === 'function') {
                global.JmsHttpContextUi.clearPlan(planId);
            }

            var host = card.querySelector('.jms-tg-tree-host');
            if (!host) return;

            updateNavActive(host, activeKey);
            replaceDetailPanel(card, planId, activeKey);
        } finally {
            global.setTimeout(function () { navSwitching = false; }, 80);
        }
    }

    function syncPlanCard(card, forceFull) {
        if (!global.JmsTgTreeRenderer) return;
        var planId = card.getAttribute('data-plan-id');
        if (!planId) return;
        var model = getModel();
        if (!model) return;

        syncTreeNameToLegacy(card);

        var legacy = card.querySelector('.jms-plan-tgs');
        if (legacy) legacy.classList.add('jms-plan-tgs--legacy');

        var host = card.querySelector('.jms-tg-tree-host');
        if (!host) {
            host = global.document.createElement('div');
            host.className = 'jms-tg-tree-host';
            card.appendChild(host);
            forceFull = true;
        }

        var activeKey = resolveActiveKey(model, planId);

        if (host.querySelector('.jms-tg-tree-workspace')) {
            var ws = host.querySelector('.jms-tg-tree-workspace');
            if (forceFull && global.JmsTgTreeRenderer.renderNav) {
                var oldNav = ws.querySelector('.jms-tg-tree-nav');
                var oldList = oldNav && oldNav.querySelector('.jms-tg-tree-nav__list');
                var scrollTop = oldList ? oldList.scrollTop : 0;
                var navWrap = global.document.createElement('div');
                navWrap.innerHTML = global.JmsTgTreeRenderer.renderNav(model, planId, activeKey);
                var nextNav = navWrap.firstElementChild;
                if (oldNav && nextNav) {
                    oldNav.replaceWith(nextNav);
                    var newList = nextNav.querySelector('.jms-tg-tree-nav__list');
                    if (newList) newList.scrollTop = scrollTop;
                }
            } else {
                updateNavActive(host, activeKey);
            }
            var SP = scrollPreserveApi();
            var detailSnap = SP && SP.capture ? SP.capture(card) : null;
            var wrap = global.document.createElement('div');
            wrap.innerHTML = global.JmsTgTreeRenderer.renderDetailPanel(model, planId, activeKey);
            var nextMain = wrap.firstElementChild;
            var curMain = host.querySelector('.jms-tg-tree-main');
            if (curMain && nextMain) curMain.replaceWith(nextMain);
            if (detailSnap && SP && SP.restore) SP.restore(card, detailSnap);
            applyIfCollapseState(card);
            if (global.JmsTgNavViewport && typeof global.JmsTgNavViewport.syncAll === 'function') {
                global.JmsTgNavViewport.syncAll();
            }
            return;
        }

        var SPws = scrollPreserveApi();
        var wsSnap = SPws && SPws.capture ? SPws.capture(card) : null;
        host.innerHTML = global.JmsTgTreeRenderer.renderWorkspace(model, planId, activeKey);
        if (wsSnap && SPws && SPws.restore) SPws.restore(card, wsSnap);
        applyIfCollapseState(card);
        if (global.JmsTgNavViewport && typeof global.JmsTgNavViewport.syncAll === 'function') {
            global.JmsTgNavViewport.syncAll();
        }
    }

    function scheduleSyncAll(forceFull) {
        if (!isTreeView() || !isJmeterTab() || navSwitching) return;
        if (syncTimer) global.clearTimeout(syncTimer);
        syncTimer = global.setTimeout(function () {
            syncTimer = null;
            if (navSwitching) return;
            var container = global.document.getElementById('jms-plans-container');
            if (!container) return;
            container.querySelectorAll('.jms-plan-card').forEach(function (card) {
                syncPlanCard(card, !!forceFull);
            });
        }, 60);
    }

    function refreshTgDetailByTgId(planId, tgId) {
        if (!isTreeView() || !isJmeterTab() || !planId || !tgId) return false;
        var card = global.document.querySelector('.jms-plan-card[data-plan-id="' + planId + '"]');
        if (!card || !global.JmsTgTreeRenderer) return false;
        var model = getModel();
        if (!model) return false;
        var groups = global.JmsTgTreeRenderer.collectThreadGroups(model, planId);
        var group = groups.find(function (g) { return g.tg && String(g.tg.id) === String(tgId); });
        if (!group) return false;
        var stepId = global.JmsHttpContextUi && typeof global.JmsHttpContextUi.getSelected === 'function'
            ? (global.JmsHttpContextUi.getSelected(planId, tgId) || '')
            : '';
        replaceDetailPanel(card, planId, group.key, stepId || undefined, { preserveScroll: true });
        return true;
    }

    function syncAll(forceFull) {
        if (!isTreeView() || !isJmeterTab()) return;
        var container = global.document.getElementById('jms-plans-container');
        if (!container) return;
        container.querySelectorAll('.jms-plan-card').forEach(function (card) {
            syncPlanCard(card, !!forceFull);
        });
    }

    function setTreeView(on) {
        if (!on) return;
        global.document.body.classList.add('lth-tg-view-tree');
        try {
            global.sessionStorage.setItem(STORAGE_VIEW, 'tree');
        } catch (e) { /* ignore */ }
        syncAll(true);
    }

    function triggerLegacyTgDelete(card, planId, tgId) {
        if (!card || !planId || !tgId) return false;
        syncTreeNameToLegacy(card);
        var legacy = card.querySelector('.jms-plan-tgs--legacy .jms-tg-block[data-tg-id="' + tgId + '"]');
        if (!legacy) return false;
        var legacyDel = legacy.querySelector('.jms-btn-del-tg');
        if (!legacyDel) return false;
        navSwitching = true;
        legacyDel.click();
        global.setTimeout(function () { navSwitching = false; }, 200);
        return true;
    }

    function onNavDeleteClick(ev) {
        var delBtn = ev.target.closest('.jms-tg-tree-nav__del');
        if (!delBtn || !isTreeView()) return;

        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }

        var card = delBtn.closest('.jms-plan-card');
        var planId = delBtn.getAttribute('data-plan-id');
        var tgId = delBtn.getAttribute('data-tg-id');
        triggerLegacyTgDelete(card, planId, tgId);
    }

    function onNavClick(ev) {
        if (ev.target.closest('.jms-tg-tree-nav__del')) return;

        var navItem = ev.target.closest('.jms-tg-tree-nav__item');
        if (!navItem || !isTreeView()) return;

        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
        }

        var card = navItem.closest('.jms-plan-card');
        var planId = navItem.getAttribute('data-plan-id');
        var key = navItem.getAttribute('data-tg-key');
        if (!planId || !key || !card) return;

        switchThreadGroup(card, planId, key);
    }

    function onContainerClick(ev) {
        if (!isTreeView()) return;
        var t = ev.target;


    }

    function onContainerInput(ev) {
        if (!isTreeView()) return;
        if (!ev.target.classList.contains('jms-tg-name')) return;
        var card = ev.target.closest('.jms-plan-card');
        if (card) syncTreeNameToLegacy(card);
    }

    function bindContainer(container) {
        if (!container || container.__jmsTgTreeBound) return;
        container.__jmsTgTreeBound = true;
        container.addEventListener('click', onNavDeleteClick, true);
        container.addEventListener('click', onNavClick, true);
        container.addEventListener('click', onContainerClick);
        container.addEventListener('input', onContainerInput);

        new MutationObserver(function (mutations) {
            if (!isTreeView() || navSwitching) return;
            var fromTreeHost = mutations.some(function (m) {
                var node = m.target;
                if (!node || !node.closest) return false;
                return !!node.closest('.jms-tg-tree-host');
            });
            if (fromTreeHost) return;
            scheduleSyncAll(true);
        }).observe(container, { childList: true, subtree: true });
    }



    function isStudioV2() {
        return !!(global.document.body && global.document.body.classList.contains('lth-studio-v2'));
    }

    function bootTreeView(container) {
        if (!container) return;
        try {
            global.sessionStorage.setItem(STORAGE_VIEW, 'tree');
        } catch (e) { /* ignore */ }
        global.document.body.classList.add('lth-tg-view-tree');
        bindContainer(container);
        if (global.JmsTgStepDrag && typeof global.JmsTgStepDrag.init === 'function') {
            global.JmsTgStepDrag.init();
        }
        var tries = 0;
        var waitModel = global.setInterval(function () {
            tries += 1;
            if (getModel() || tries > 80) {
                global.clearInterval(waitModel);
                syncAll(true);
            }
        }, 100);
    }

    function init() {
        if (!isJmeterTab()) return;
        var container = global.document.getElementById('jms-plans-container');
        if (!container) return;

        bootTreeView(container);
    }

    function initForStudioV2() {
        if (!isJmeterTab() || !isStudioV2()) return;
        bootTreeView(global.document.getElementById('jms-plans-container'));
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsTgTreeShell = {
        bootTreeView: bootTreeView,
        initForStudioV2: initForStudioV2,
        syncAll: syncAll,
        setTreeView: setTreeView,
        switchThreadGroup: switchThreadGroup,
        refreshHttpContext: refreshHttpContext,
        refreshTgDetailByTgId: refreshTgDetailByTgId
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_tree_card_click_guard.js ---- */
/**
 * 树形视图 · 阻止点击步骤卡片自动打开编辑抽屉（隔离模块）
 * 网格视图仍走 lth_studio_shell.js 原逻辑
 */
(function (global) {
    'use strict';

    function isTreeDetailView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function shouldAllowClick(target) {
        if (!target || !target.closest) return false;
        return !!target.closest(
            'button, a, input, select, textarea, label, .jms-tree-drag-handle,' +
            ' .jms-if-card__head, .jms-random-card__head, .jms-simple-card__head, .jms-transaction-card__head, .jms-loop-card__head,' +
            ' .jms-catalog-card__head, .jms-catalog-card__body, .jms-btn-edit-catalog,' +
            ' .jms-tg-tree-inline-actions, .jms-http-context, .jms-http-card, .jms-http-card__head, .jms-http-card__main, .jms-card-head-actions, .jms-card-head-badges,' +
            ' .jms-tree-node--http .jms-tree-node__body,' +
            ' .jms-tree-node--catalog .jms-tree-node__body,' +
            ' .jms-http-ctx-listener-more, .jms-http-context__listener-list,' +
            ' .jms-tg-listeners, .jms-tg-listener-more, .jms-tg-listener-menu, .jms-tg-logic-ctrl-more, .jms-tg-logic-ctrl-menu, .jms-tg-post-proc-more, .jms-tg-post-proc-menu, .jms-tg-sampler-more, .jms-tg-sampler-menu, .jms-tg-config-more, .jms-tg-config-menu, .jms-http-listeners, .jms-tg-config-btn, .jms-tg-tree-tools,' +
            ' .jms-if-mount-ctx-btn, .jms-if-mount-ctx-item, .jms-if-mount-ctx-menu,' +
            ' .jms-if-mount-ctx-sampler-more, .jms-if-mount-ctx-logic-more, .jms-if-mount-ctx-assert-more,' +
            ' .jms-if-mount-ctx-timer-more, .jms-if-mount-ctx-preproc-more, .jms-if-mount-ctx-proc-more,' +
            ' .jms-if-mount-ctx-config-more, .jms-if-mount-ctx-listener-more,' +
            ' .jms-catalog-mount-context, .jms-catalog-mount-ctx-more, .jms-catalog-mount-ctx-btn,' +
            ' .jms-tg-assert-more, .jms-tg-assert-menu, .jms-tg-assert-trigger,' +
            ' .jms-http-ctx-assert-more, .jms-http-ctx-assert-menu,' +
            ' .jms-http-context__assert-list, .jms-http-context__assert-row,' +
            ' .jms-tree-node--tg-assert, .jms-tree-node--http-mount-assert,' +
            ' .lth-step-actions, .lth-step-menu, .lth-step-menu-btn,' +
            ' .jms-tree-node--http-mount, .jms-aux-card--http-mount-preproc, .jms-aux-card--http-mount-timer, .jms-aux-card--http-mount-assert,' +
            ' .jms-aux-card--http-mount-catalog, .jms-tree-node--http-mount-catalog'
        );
    }

    function onRootClick(ev) {
        if (!isTreeDetailView()) return;
        var t = ev.target;

        if (t.closest('.jms-catalog-card')) {
            return;
        }

        if (shouldAllowClick(t)) return;

        var tgAssertCard = t.closest('.jms-aux-card--tg-assert, .jms-aux-card--http-mount-assert');
        if (tgAssertCard) {
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') {
                ev.stopImmediatePropagation();
            }
            if (global.JmsAssertCardEditClick &&
                typeof global.JmsAssertCardEditClick.openForCard === 'function') {
                global.JmsAssertCardEditClick.openForCard(tgAssertCard);
            }
            return;
        }
        var debugAux = t.closest('.jms-aux-card[data-step-kind="debug_sampler"]');
        if (debugAux && !t.closest('button, a, input, select, textarea, .lth-step-actions, .jms-tg-tree-inline-actions')) {
            debugAux.classList.toggle('jms-aux-card--collapsed');
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') {
                ev.stopImmediatePropagation();
            }
            return;
        }
        if (t.closest('.jms-http-card, .jms-aux-card, .jms-if-card__body, .jms-if-mount-context')) {
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') {
                ev.stopImmediatePropagation();
            }
        }
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsTgTreeCardGuardBound === '1') return;
        root.dataset.jmsTgTreeCardGuardBound = '1';
        root.addEventListener('click', onRootClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgTreeCardClickGuard = { bind: bind };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_tree_studio_v2_enable.js ---- */
/**
 * Studio v2 · 启用树形壳层（左线程组 + 右步骤区，隔离模块）
 */
(function (global) {
    'use strict';

    function isStudioV2() {
        return !!(global.document && global.document.body &&
            global.document.body.classList.contains('lth-studio-v2'));
    }

    function isJmeterTab() {
        return !!(global.document && global.document.body &&
            global.document.body.classList.contains('lth-hub-jmeter-tab'));
    }

    function enableTreeForStudio() {
        if (!isStudioV2() || !isJmeterTab()) return;
        global.document.body.classList.add('lth-tg-view-tree');
        try {
            global.sessionStorage.setItem('lth_tg_view_mode', 'tree');
        } catch (e) { /* ignore */ }
        global.document.querySelectorAll('.jms-tg-tree-host').forEach(function (el) {
            el.style.removeProperty('display');
        });
        var Shell = global.JmsTgTreeShell;
        if (Shell) {
            if (typeof Shell.initForStudioV2 === 'function') {
                Shell.initForStudioV2();
            } else if (typeof Shell.setTreeView === 'function') {
                Shell.setTreeView(true);
            }
            if (typeof Shell.syncAll === 'function') Shell.syncAll(true);
        }
        if (global.JmsHttpContextUi && typeof global.JmsHttpContextUi.ensureBind === 'function') {
            global.JmsHttpContextUi.ensureBind();
        }
    }

    function boot() {
        if (!isStudioV2() || !isJmeterTab()) return;
        enableTreeForStudio();
        var tries = 0;
        var wait = global.setInterval(function () {
            tries += 1;
            if (global.JmsTgTreeShell || tries > 120) {
                global.clearInterval(wait);
                enableTreeForStudio();
            }
        }, 50);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    global.JmsTgTreeStudioV2Enable = { enable: enableTreeForStudio };
})(window);

/* ---- js/jms_tg_setup_name_guard.js ---- */
/**
 * SetUp 线程组名称防污染（隔离）：启动时清理模型中累积的 [Setup] 前缀
 */
(function (global) {
    'use strict';

    function stripSetupDisplayPrefix(name) {
        var s = String(name || '').trim();
        while (/^\[Setup\]\s*/i.test(s)) {
            s = s.replace(/^\[Setup\]\s*/i, '').trim();
        }
        return s;
    }

    function sanitizeModelSetupNames() {
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.getModel !== 'function') return;
        var m = vb.getModel();
        if (!m || !Array.isArray(m.setup_thread_groups)) return;
        var changed = false;
        m.setup_thread_groups.forEach(function (tg) {
            if (!tg) return;
            var clean = stripSetupDisplayPrefix(tg.name);
            if (clean !== tg.name) {
                tg.name = clean;
                changed = true;
            }
        });
        if (changed && typeof vb.syncYamlFromModel === 'function') {
            vb.syncYamlFromModel();
        }
    }

    function init() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var tries = 0;
        var timer = global.setInterval(function () {
            tries += 1;
            if (global.JmsVisualBuilder && global.JmsVisualBuilder.getModel()) {
                global.clearInterval(timer);
                sanitizeModelSetupNames();
            } else if (tries > 80) {
                global.clearInterval(timer);
            }
        }, 100);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsTgSetupNameGuard = { stripSetupDisplayPrefix: stripSetupDisplayPrefix, sanitizeModelSetupNames: sanitizeModelSetupNames };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/lth_studio_shell.js ---- */
(function () {
    'use strict';
    if (!document.body || !document.body.classList.contains('lth-studio-v2')) return;

    function clickById(id) {
        var el = document.getElementById(id);
        if (el) el.click();
    }

    document.querySelectorAll('[data-lth-trigger]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            clickById(btn.getAttribute('data-lth-trigger'));
        });
    });

    var moreTrigger = document.getElementById('lth-more-trigger');
    var morePanel = document.getElementById('lth-more-panel');
    if (moreTrigger && morePanel) {
        moreTrigger.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = !morePanel.classList.contains('hidden');
            morePanel.classList.toggle('hidden', open);
            moreTrigger.setAttribute('aria-expanded', open ? 'false' : 'true');
        });
        document.addEventListener('click', function () {
            morePanel.classList.add('hidden');
            moreTrigger.setAttribute('aria-expanded', 'false');
        });
        morePanel.addEventListener('click', function (e) { e.stopPropagation(); });
    }

    document.querySelectorAll('[data-lth-mode]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var mode = btn.getAttribute('data-lth-mode');
            var modeBtn = document.querySelector('.jms-editor-mode-btn[data-mode="' + mode + '"]');
            if (modeBtn) modeBtn.click();
            if (morePanel) morePanel.classList.add('hidden');
        });
    });

    var navModes = document.getElementById('lth-nav-modes');
    var editorModes = document.querySelector('.jms-editor-modes');
    if (navModes && editorModes && !navModes.querySelector('.jms-editor-mode-btn')) {
        navModes.appendChild(editorModes);
    }


    function getStepMenuClipBottom(actions) {
        var margin = 8;
        var clipBottom = window.innerHeight - margin;
        var tg = actions.closest('.jms-tg-block');
        if (tg) clipBottom = Math.min(clipBottom, tg.getBoundingClientRect().bottom - margin);
        var plan = actions.closest('.jms-plan-card');
        if (plan) clipBottom = Math.min(clipBottom, plan.getBoundingClientRect().bottom - margin);
        var ws = actions.closest('.lth-studio-workspace');
        if (ws) clipBottom = Math.min(clipBottom, ws.getBoundingClientRect().bottom - margin);
        return clipBottom;
    }

    function measureStepMenuDropup(actions) {
        var menu = actions.querySelector('.lth-step-menu');
        if (!menu) return;
        menu.classList.remove('lth-step-menu--dropup');
        actions.classList.add('is-measuring');
        var menuRect = menu.getBoundingClientRect();
        if (menuRect.height && menuRect.bottom > getStepMenuClipBottom(actions)) {
            menu.classList.add('lth-step-menu--dropup');
        }
        actions.classList.remove('is-measuring');
    }

    function openStepMenuHover(actions) {
        if (!actions || actions.classList.contains('is-open')) return;
        measureStepMenuDropup(actions);
        actions.classList.add('is-hover');
    }

    function closeStepMenuHover(actions) {
        if (!actions || actions.classList.contains('is-open')) return;
        actions.classList.remove('is-hover', 'is-measuring');
        resetStepMenuPlacement(actions);
    }

    function resetStepMenuPlacement(actions) {
        if (!actions) return;
        actions.classList.remove('is-measuring');
        var menu = actions.querySelector('.lth-step-menu');
        if (menu) menu.classList.remove('lth-step-menu--dropup');
    }
    var visualRoot = document.getElementById('jms-visual-root');
    if (visualRoot) {
        visualRoot.addEventListener('click', function (ev) {
            var menuBtn = ev.target.closest('.lth-step-menu-btn');
            if (menuBtn) {
                ev.stopPropagation();
                var actions = menuBtn.closest('.lth-step-actions');
                if (!actions) return;
                document.querySelectorAll('.lth-step-actions.is-open, .lth-step-actions.is-hover').forEach(function (a) {
                    if (a !== actions) {
                        a.classList.remove('is-open', 'is-hover', 'is-measuring');
                        resetStepMenuPlacement(a);
                    }
                });
                var opening = !actions.classList.contains('is-open');
                actions.classList.remove('is-hover', 'is-measuring');
                actions.classList.toggle('is-open');
                if (opening) {
                    measureStepMenuDropup(actions);
                } else {
                    resetStepMenuPlacement(actions);
                }
                return;
            }
            var addMoreBtn = ev.target.closest('.lth-tg-add-more-btn');
            if (addMoreBtn) {
                ev.stopPropagation();
                var wrap = addMoreBtn.closest('.lth-tg-add-more');
                if (!wrap) return;
                document.querySelectorAll('.lth-tg-add-more.is-open').forEach(function (w) {
                    if (w !== wrap) w.classList.remove('is-open');
                });
                wrap.classList.toggle('is-open');
                return;
            }
            var isTreeStudioV2 = document.body.classList.contains('lth-studio-v2') &&
                document.body.classList.contains('lth-tg-view-tree') &&
                document.body.classList.contains('lth-hub-jmeter-tab');
            var auxCard = ev.target.closest('.jms-aux-card');
            if (auxCard) {
                if (ev.target.closest('.lth-step-actions, button, a, input, select, textarea')) return;
                if (isTreeStudioV2) {
                    var kindTree = auxCard.getAttribute('data-step-kind') || '';
                    if (kindTree === 'debug_sampler') {
                        auxCard.classList.toggle('jms-aux-card--collapsed');
                    }
                    return;
                }
                var kind = auxCard.getAttribute('data-step-kind') || '';
                var editAuxBtn = auxCard.querySelector(
                    kind === 'debug_sampler' ? '.jms-btn-edit-debug' :
                        (kind === 'json_post' ? '.jms-btn-edit-tg-json-extract' :
                            (kind === 'regex_extract' ? '.jms-btn-edit-tg-regex-extract' :
                                (kind === 'xpath_extract' ? '.jms-btn-edit-tg-xpath-extract' :
                                    (kind === 'jsr223_post' ? '.jms-btn-edit-tg-jsr223-post' :
                                        (kind === 'jdbc_post' ? '.jms-btn-edit-tg-jdbc-post' : '.jms-btn-edit-beanshell')))))
                );
                if (editAuxBtn) editAuxBtn.click();
                return;
            }
            var card = ev.target.closest('.jms-http-card, .jms-if-card, .jms-random-card, .jms-simple-card, .jms-transaction-card, .jms-loop-card');
            if (!card) return;
            if (ev.target.closest('.lth-step-actions, .jms-http-card__actions, button, a, input, select, textarea')) return;
            if (isTreeStudioV2 && card.classList.contains('jms-http-card')) {
                return;
            }
            if (document.body.classList.contains('lth-tg-view-tree') &&
                document.body.classList.contains('lth-hub-jmeter-tab') &&
                (card.classList.contains('jms-if-card') || card.classList.contains('jms-random-card') ||
                    card.classList.contains('jms-simple-card') || card.classList.contains('jms-transaction-card') ||
                    card.classList.contains('jms-loop-card'))) {
                return;
            }
            if (card.classList.contains('jms-if-card')) {
                var editIfBtn = card.querySelector('.jms-btn-edit-if');
                if (editIfBtn) editIfBtn.click();
                return;
            }
            if (card.classList.contains('jms-random-card')) {
                var editRandomBtn = card.querySelector('.jms-btn-edit-random');
                if (editRandomBtn) editRandomBtn.click();
                return;
            }
            if (card.classList.contains('jms-simple-card')) {
                var editSimpleBtn = card.querySelector('.jms-btn-edit-simple');
                if (editSimpleBtn) editSimpleBtn.click();
                return;
            }
            if (card.classList.contains('jms-transaction-card')) {
                var editTxnBtn = card.querySelector('.jms-btn-edit-transaction');
                if (editTxnBtn) editTxnBtn.click();
                return;
            }
            if (card.classList.contains('jms-loop-card')) {
                var editLoopBtn = card.querySelector('.jms-btn-edit-loop');
                if (editLoopBtn) editLoopBtn.click();
                return;
            }
            var editBtn = card.querySelector('.jms-btn-edit-step');
            if (editBtn) editBtn.click();
        });

/* step menu: click-only (no hover) */
        /* hover open disabled — menu opens on ⋮ click only */
    }

/* step menu: defer close on menu panel click */
    document.addEventListener('click', function (ev) {
        if (ev.target.closest('.lth-step-menu')) return;
        document.querySelectorAll('.lth-step-actions.is-open, .lth-step-actions.is-hover, .lth-tg-add-more.is-open').forEach(function (el) {
            el.classList.remove('is-open', 'is-hover', 'is-measuring');
            resetStepMenuPlacement(el);
        });
    });

    var progressSteps = document.querySelectorAll('.lth-studio-step');
    function setProgress(idx) {
        progressSteps.forEach(function (el, i) {
            el.classList.toggle('lth-studio-step--active', i === idx);
            el.classList.toggle('lth-studio-step--done', i < idx);
        });
    }

    var btnValidate = document.getElementById('btn-validate');
    var btnGenerate = document.getElementById('btn-generate-result');
    if (btnValidate) btnValidate.addEventListener('click', function () { setTimeout(function () { setProgress(1); }, 50); });
    if (btnGenerate) btnGenerate.addEventListener('click', function () { setTimeout(function () { setProgress(2); }, 200); });

    var drawerIds = ['modal-tg-load', 'modal-tg-http-mgr', 'modal-step-edit', 'modal-if-edit', 'modal-beanshell-edit', 'modal-debug-edit', 'modal-http-jdbc-post-proc-edit', 'modal-tg-jdbc-post-edit', 'modal-tg-if-edit', 'modal-if-mount-timer-edit', 'modal-http-if-edit', 'modal-http-step-user-params-edit'];
    function syncGnavOffset() {
        var gnav = document.querySelector('.hf-gnav');
        var h = gnav ? Math.ceil(gnav.getBoundingClientRect().height) : 62;
        document.documentElement.style.setProperty('--lth-gnav-h', h + 'px');
    }
    syncGnavOffset();
    window.addEventListener('resize', syncGnavOffset);
    drawerIds.forEach(function (id) {
        var modal = document.getElementById(id);
        if (modal && modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
    });
/* jmeter tab: center popup only, no drawer */
    function syncDrawerBodyClass() {
        if (document.body.classList.contains('lth-hub-jmeter-tab')) {
            document.body.classList.remove('lth-drawer-open');
            return;
        }
        var any = drawerIds.some(function (id) {
            var m = document.getElementById(id);
            return m && m.classList.contains('jms-modal-open');
        });
        document.body.classList.toggle('lth-drawer-open', any);
    }
    drawerIds.forEach(function (id) {
        var modal = document.getElementById(id);
        if (!modal) return;
        new MutationObserver(syncDrawerBodyClass).observe(modal, { attributes: true, attributeFilter: ['class'] });
    });

    function syncEditorLayoutClass() {
        var yamlWrap = document.getElementById('jms-yaml-wrap');
        var isYaml = yamlWrap && !yamlWrap.classList.contains('hidden');
        document.body.classList.toggle('lth-editor-yaml', !!isYaml);
        document.body.classList.toggle('lth-editor-visual', !isYaml);
    }
    syncEditorLayoutClass();
    document.querySelectorAll('.jms-editor-mode-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { setTimeout(syncEditorLayoutClass, 0); });
    });
    document.querySelectorAll('[data-lth-mode]').forEach(function (btn) {
        var orig = btn.onclick;
        btn.addEventListener('click', function () { setTimeout(syncEditorLayoutClass, 0); });
    });
    var yamlWrapEl = document.getElementById('jms-yaml-wrap');
    if (yamlWrapEl) {
        new MutationObserver(syncEditorLayoutClass).observe(yamlWrapEl, { attributes: true, attributeFilter: ['class'] });
    }


    var navCollapseBtn = document.getElementById('lth-nav-collapse-btn');
    var navEl = document.getElementById('lth-studio-nav');
    var navStorageKey = 'lth-studio-nav-collapsed';
    function setNavCollapsed(collapsed) {
        document.body.classList.toggle('lth-nav-collapsed', !!collapsed);
        if (navCollapseBtn) {
            navCollapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            navCollapseBtn.title = collapsed ? '展开场景配置' : '收起场景配置';
            var sr = navCollapseBtn.querySelector('.sr-only');
            if (sr) sr.textContent = collapsed ? '展开场景配置' : '收起场景配置';
        }
        try { sessionStorage.setItem(navStorageKey, collapsed ? '1' : '0'); } catch (e) {}
    }
    if (navCollapseBtn) {
        navCollapseBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            setNavCollapsed(!document.body.classList.contains('lth-nav-collapsed'));
        });
    }
    if (navEl) {
        navEl.addEventListener('click', function (e) {
            if (!document.body.classList.contains('lth-nav-collapsed')) return;
            if (e.target.closest('#lth-nav-collapse-btn, .lth-nav-collapse-btn')) return;
            setNavCollapsed(false);
        });
    }
    try {
        if (sessionStorage.getItem(navStorageKey) === '1') setNavCollapsed(true);
    } catch (e) {}


    function initTplCombobox() {
        var wrap = document.getElementById('tpl-select-wrap');
        var select = document.getElementById('tpl-select');
        if (!wrap || !select || wrap.dataset.lthCombobox === '1') return;
        wrap.dataset.lthCombobox = '1';
        select.classList.add('lth-tpl-select-native');
        select.tabIndex = -1;

        var combo = document.createElement('div');
        combo.className = 'lth-tpl-combobox';

        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'lth-tpl-combobox__trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-label', select.getAttribute('aria-label') || '场景模板');

        var valueEl = document.createElement('span');
        valueEl.className = 'lth-tpl-combobox__value';
        var chevron = document.createElement('span');
        chevron.className = 'lth-tpl-combobox__chevron';
        chevron.setAttribute('aria-hidden', 'true');
        trigger.appendChild(valueEl);
        trigger.appendChild(chevron);

        var menu = document.createElement('ul');
        menu.className = 'lth-tpl-combobox__menu hidden';
        menu.setAttribute('role', 'listbox');

        function buildOptions() {
            menu.innerHTML = '';
            Array.from(select.options).forEach(function (opt) {
                var li = document.createElement('li');
                li.className = 'lth-tpl-combobox__option';
                li.setAttribute('role', 'option');
                li.dataset.value = opt.value;
                li.textContent = opt.textContent;
                menu.appendChild(li);
            });
        }

        function syncUi() {
            var sel = select.options[select.selectedIndex];
            valueEl.textContent = sel ? sel.textContent : '';
            menu.querySelectorAll('.lth-tpl-combobox__option').forEach(function (el) {
                var on = el.dataset.value === select.value;
                el.classList.toggle('is-selected', on);
                el.setAttribute('aria-selected', on ? 'true' : 'false');
            });
        }

        function closeMenu() {
            menu.classList.add('hidden');
            combo.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
        }

        function openMenu() {
            menu.classList.remove('hidden');
            combo.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
        }

        buildOptions();
        syncUi();

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            if (menu.classList.contains('hidden')) openMenu();
            else closeMenu();
        });

        menu.addEventListener('click', function (e) {
            var opt = e.target.closest('.lth-tpl-combobox__option');
            if (!opt) return;
            if (select.value !== opt.dataset.value) {
                select.value = opt.dataset.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            syncUi();
            closeMenu();
        });

        select.addEventListener('change', syncUi);

        document.addEventListener('click', function () { closeMenu(); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeMenu();
        });

        combo.appendChild(trigger);
        combo.appendChild(menu);
        var slot = wrap.querySelector('.lth-tpl-select-slot');
        var row = wrap.querySelector('.lth-tpl-controls-row');
        if (slot) slot.appendChild(combo);
        else if (row) row.appendChild(combo);
        else wrap.appendChild(combo);
    }
    initTplCombobox();

})();
/* ---- js/jmx_response_assertion.js ---- */
/**
 * JMeter ResponseAssertion 导入/导出（隔离模块）
 * 支持 Assertion.test_strings、Asserion.test_strings 拼写变体、custom_message、test_type/test_field
 */
(function (global) {
    'use strict';

    var TEST_STRINGS_PROPS = ['Assertion.test_strings', 'Asserion.test_strings'];

    function getStringProp(el, name) {
        if (!el) return '';
        var tags = ['stringProp', 'intProp', 'longProp', 'boolProp'];
        for (var t = 0; t < tags.length; t++) {
            var list = el.getElementsByTagName(tags[t]);
            for (var i = 0; i < list.length; i++) {
                if (list[i].getAttribute('name') === name) {
                    return (list[i].textContent || '').trim();
                }
            }
        }
        return '';
    }

    function getTestStrings(el) {
        var out = [];
        if (!el) return out;
        var coll = el.getElementsByTagName('collectionProp');
        for (var i = 0; i < coll.length; i++) {
            var propName = coll[i].getAttribute('name') || '';
            if (TEST_STRINGS_PROPS.indexOf(propName) < 0) continue;
            var strProps = coll[i].getElementsByTagName('stringProp');
            for (var j = 0; j < strProps.length; j++) {
                var v = (strProps[j].textContent || '').trim();
                if (v) out.push(v);
            }
        }
        return out;
    }

    function parseStatusCodeValue(strings, customMessage, testType) {
        if (strings.length) return strings[0];
        var msg = (customMessage || '').trim();
        if (!msg) return '';
        // 部分 JMX 将期望状态码写在 custom_message（如 test_type=8 且 test_strings 为空）
        if (/^\d{1,3}$/.test(msg)) return msg;
        return '';
    }

    function parseResponseAssertionElement(node) {
        if (!node) return null;
        var testField = getStringProp(node, 'Assertion.test_field') || 'Assertion.response_code';
        var testTypeRaw = getStringProp(node, 'Assertion.test_type');
        var testType = testTypeRaw !== '' ? parseInt(testTypeRaw, 10) : null;
        var customMessage = getStringProp(node, 'Assertion.custom_message');
        var strings = getTestStrings(node);
        var jmeterName = node.getAttribute('testname') || '';

        var base = {
            jmeter_name: jmeterName || undefined,
            jmeter_test_field: testField,
            jmeter_test_type: testType != null && !isNaN(testType) ? testType : undefined
        };

        if (customMessage) base.custom_message = customMessage;

        if (testField === 'Assertion.response_code') {
            var codeVal = parseStatusCodeValue(strings, customMessage, testType);
            if (!codeVal) return null;
            var num = parseInt(codeVal, 10);
            base.type = 'status';
            base.value = isNaN(num) ? codeVal : num;
            // custom_message 若仅为状态码数字，不作为失败提示保留
            if (base.custom_message && String(base.custom_message).trim() === String(codeVal)) {
                delete base.custom_message;
            }
            return base;
        }

        if (testField === 'Assertion.response_data' || testField === 'Assertion.response_headers') {
            var textVal = strings.length ? strings[0] : '';
            if (!textVal) return null;
            var isNot = testType === 6 || testType === 2 && false;
            if (testType === 6) {
                base.type = 'not_contains';
            } else {
                base.type = 'contains';
            }
            base.value = textVal;
            return base;
        }

        // 未知 test_field：若有 test_strings 则按包含文本处理
        if (strings.length) {
            base.type = 'contains';
            base.value = strings[0];
            return base;
        }
        return null;
    }

    function genResponseAssertionXml(assertion, samplerName, childPad, escapeXml) {
        if (!assertion) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        childPad = childPad || '';

        var type = assertion.type;
        if (type !== 'status' && type !== 'contains' && type !== 'not_contains') return '';

        var testField = assertion.jmeter_test_field ||
            (type === 'status' ? 'Assertion.response_code' : 'Assertion.response_data');
        var testType = assertion.jmeter_test_type;
        if (testType == null || isNaN(testType)) {
            if (type === 'status') testType = 8;
            else if (type === 'not_contains') testType = 6;
            else testType = 2;
        }

        var testName = assertion.jmeter_name
            ? escapeXml(assertion.jmeter_name)
            : escapeXml((type + ' ' + assertion.value + ' ' + (samplerName || '')).trim());

        var xml = '';
        xml += childPad + '<ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="' +
            testName + '" enabled="true">\n';
        xml += childPad + '  <collectionProp name="Assertion.test_strings">\n';
        xml += childPad + '    <stringProp name="0">' + escapeXml(String(assertion.value)) + '</stringProp>\n';
        xml += childPad + '  </collectionProp>\n';
        xml += childPad + '  <stringProp name="Assertion.custom_message">' +
            escapeXml(assertion.custom_message || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="Assertion.test_field">' + escapeXml(testField) + '</stringProp>\n';
        xml += childPad + '  <boolProp name="Assertion.assume_success">false</boolProp>\n';
        xml += childPad + '  <intProp name="Assertion.test_type">' + testType + '</intProp>\n';
        xml += childPad + '</ResponseAssertion>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    global.JmxResponseAssertion = {
        parseElement: parseResponseAssertionElement,
        genXml: genResponseAssertionXml,
        getTestStrings: getTestStrings
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_http_response_assertion_jmx.js ---- */
/**
 * HTTP 步骤 · 响应断言 ResponseAssertion · JMX 解析/生成（隔离模块）
 */
(function (global) {
    'use strict';

    var TEST_STRINGS_PROPS = ['Assertion.test_strings', 'Asserion.test_strings'];

    var TEST_FIELD_MAP = {
        response_text: 'Assertion.response_data',
        response_code: 'Assertion.response_code',
        response_message: 'Assertion.response_message',
        response_headers: 'Assertion.response_headers',
        request_headers: 'Assertion.request_headers',
        url_sample: 'Assertion.url',
        document: 'Assertion.response_data',
        request_data: 'Assertion.request_data'
    };

    var TEST_FIELD_REVERSE = {};
    Object.keys(TEST_FIELD_MAP).forEach(function (k) {
        TEST_FIELD_REVERSE[TEST_FIELD_MAP[k]] = k;
    });

    var SCOPE_MAP = {
        main_and_sub: 'all',
        main_only: 'parent',
        sub_only: 'children',
        jmeter_variable: 'variable'
    };

    var SCOPE_REVERSE = {};
    Object.keys(SCOPE_MAP).forEach(function (k) {
        SCOPE_REVERSE[SCOPE_MAP[k]] = k;
    });

    function getStringProp(el, name) {
        if (!el) return '';
        var tags = ['stringProp', 'intProp', 'longProp', 'boolProp'];
        for (var t = 0; t < tags.length; t++) {
            var list = el.getElementsByTagName(tags[t]);
            for (var i = 0; i < list.length; i++) {
                if (list[i].getAttribute('name') === name) {
                    return (list[i].textContent || '').trim();
                }
            }
        }
        return '';
    }

    function getBoolProp(el, name, def) {
        var v = getStringProp(el, name);
        if (v === '') return def;
        return v === 'true';
    }

    function getIntProp(el, name, def) {
        var v = getStringProp(el, name);
        if (v === '') return def;
        var n = parseInt(v, 10);
        return isNaN(n) ? def : n;
    }

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function getTestStrings(el) {
        var out = [];
        if (!el) return out;
        var coll = el.getElementsByTagName('collectionProp');
        for (var i = 0; i < coll.length; i++) {
            var propName = coll[i].getAttribute('name') || '';
            if (TEST_STRINGS_PROPS.indexOf(propName) < 0) continue;
            var strProps = coll[i].getElementsByTagName('stringProp');
            for (var j = 0; j < strProps.length; j++) {
                var v = (strProps[j].textContent || '').trim();
                if (v) out.push(v);
            }
        }
        return out;
    }

    function decodeTestType(testType) {
        var n = Number(testType) || 16;
        var match_mode = 'substring';
        if (n & 8) match_mode = 'equals';
        else if (n & 16) match_mode = 'substring';
        else if (n & 2) match_mode = 'contains';
        else if (n & 1) match_mode = 'matches';
        return {
            match_mode: match_mode,
            match_not: !!(n & 32),
            match_or: !!(n & 64),
            jmeter_test_type: n
        };
    }

    function encodeTestType(matchMode, matchNot, matchOr) {
        var base = { contains: 2, matches: 1, equals: 8, substring: 16 }[matchMode] || 16;
        if (matchNot) base |= 32;
        if (matchOr) base |= 64;
        return base;
    }

    function parseApplyTo(el) {
        var scope = getStringProp(el, 'Assertion.scope') || getStringProp(el, 'Scope') || 'parent';
        return SCOPE_REVERSE[scope] || 'main_only';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'ResponseAssertion') return null;
        var patterns = getTestStrings(node);
        if (!patterns.length) return null;
        var testFieldRaw = getStringProp(node, 'Assertion.test_field') || 'Assertion.response_data';
        var decoded = decodeTestType(getIntProp(node, 'Assertion.test_type', 16));
        return {
            type: 'response_assert',
            name: node.getAttribute('testname') || '响应断言',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            enabled: isEnabled(node),
            apply_to: parseApplyTo(node),
            jmeter_variable: getStringProp(node, 'Scope.variable') || getStringProp(node, 'Assertion.variable') || '',
            test_field: TEST_FIELD_REVERSE[testFieldRaw] || 'response_text',
            ignore_status: getBoolProp(node, 'Assertion.assume_success', false),
            match_mode: decoded.match_mode,
            match_not: decoded.match_not,
            match_or: decoded.match_or,
            jmeter_test_type: decoded.jmeter_test_type,
            patterns: patterns,
            custom_message: getStringProp(node, 'Assertion.custom_message') || ''
        };
    }

    function genXml(assertion, childPad, escapeXml) {
        if (!assertion || assertion.type !== 'response_assert' || assertion.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        childPad = childPad || '';
        var patterns = Array.isArray(assertion.patterns) ? assertion.patterns.filter(function (p) {
            return p != null && String(p).trim();
        }) : [];
        if (!patterns.length) return '';

        var testField = TEST_FIELD_MAP[assertion.test_field] || TEST_FIELD_MAP.response_text;
        var testType = assertion.jmeter_test_type != null && !isNaN(assertion.jmeter_test_type)
            ? Number(assertion.jmeter_test_type)
            : encodeTestType(assertion.match_mode, assertion.match_not, assertion.match_or);
        var applyTo = assertion.apply_to || 'main_only';
        var scope = SCOPE_MAP[applyTo] || 'parent';
        var en = assertion.enabled === false ? 'false' : 'true';
        var testName = escapeXml(assertion.name || '响应断言');

        var xml = '';
        xml += childPad + '<ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="' +
            testName + '" enabled="' + en + '">\n';
        if (assertion.comments && String(assertion.comments).trim()) {
            xml += childPad + '  <stringProp name="TestPlan.comments">' + escapeXml(assertion.comments) + '</stringProp>\n';
        }
        xml += childPad + '  <collectionProp name="Assertion.test_strings">\n';
        patterns.forEach(function (p, idx) {
            xml += childPad + '    <stringProp name="' + idx + '">' + escapeXml(String(p)) + '</stringProp>\n';
        });
        xml += childPad + '  </collectionProp>\n';
        xml += childPad + '  <stringProp name="Assertion.custom_message">' +
            escapeXml(assertion.custom_message || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="Assertion.test_field">' + escapeXml(testField) + '</stringProp>\n';
        xml += childPad + '  <boolProp name="Assertion.assume_success">' +
            (assertion.ignore_status ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <intProp name="Assertion.test_type">' + testType + '</intProp>\n';
        if (scope && scope !== 'parent') {
            xml += childPad + '  <stringProp name="Assertion.scope">' + escapeXml(scope) + '</stringProp>\n';
        }
        if (applyTo === 'jmeter_variable' && assertion.jmeter_variable) {
            xml += childPad + '  <stringProp name="Scope.variable">' +
                escapeXml(assertion.jmeter_variable) + '</stringProp>\n';
        }
        xml += childPad + '</ResponseAssertion>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    global.JmsHttpResponseAssertionJmx = {
        parseElement: parseElement,
        genXml: genXml,
        encodeTestType: encodeTestType,
        decodeTestType: decodeTestType
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_http_json_assertion_jmx.js ---- */
/**
 * HTTP 步骤 · JSON 断言 JSONPathAssertion · JMX 解析/生成（隔离模块）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var tags = ['stringProp', 'intProp', 'longProp', 'boolProp'];
        for (var t = 0; t < tags.length; t++) {
            var list = el.getElementsByTagName(tags[t]);
            for (var i = 0; i < list.length; i++) {
                if (list[i].getAttribute('name') === name) {
                    return (list[i].textContent || '').trim();
                }
            }
        }
        return '';
    }

    function getBoolProp(el, name, defaultVal) {
        var v = getStringProp(el, name);
        if (v === '') return defaultVal;
        return v === 'true';
    }

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'JSONPathAssertion') return null;
        var jsonPath = getStringProp(node, 'JSON_PATH');
        if (!jsonPath) return null;
        var additionally = getBoolProp(node, 'JSONVALIDATION', false);
        return {
            type: 'json_assert',
            name: node.getAttribute('testname') || 'JSON断言',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            enabled: isEnabled(node),
            json_path: jsonPath,
            additionally_assert_value: additionally,
            is_regex: getBoolProp(node, 'ISREGEX', false),
            expected: getStringProp(node, 'EXPECTED_VALUE') || '',
            expect_null: getBoolProp(node, 'EXPECT_NULL', false),
            invert: getBoolProp(node, 'INVERT', false)
        };
    }

    function genXml(assertion, childPad, escapeXml) {
        if (!assertion || assertion.type !== 'json_assert' || assertion.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        childPad = childPad || '';
        var jsonPath = assertion.json_path ? String(assertion.json_path).trim() : '';
        if (!jsonPath) return '';
        var en = assertion.enabled === false ? 'false' : 'true';
        var testName = escapeXml(assertion.name || 'JSON断言');
        var additionally = !!assertion.additionally_assert_value;

        var xml = '';
        xml += childPad + '<JSONPathAssertion guiclass="JSONPathAssertionGui" testclass="JSONPathAssertion" testname="' +
            testName + '" enabled="' + en + '">\n';
        if (assertion.comments && String(assertion.comments).trim()) {
            xml += childPad + '  <stringProp name="TestPlan.comments">' + escapeXml(assertion.comments) + '</stringProp>\n';
        }
        xml += childPad + '  <stringProp name="JSON_PATH">' + escapeXml(jsonPath) + '</stringProp>\n';
        xml += childPad + '  <stringProp name="EXPECTED_VALUE">' + escapeXml(assertion.expected || '') + '</stringProp>\n';
        xml += childPad + '  <boolProp name="JSONVALIDATION">' + (additionally ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <boolProp name="EXPECT_NULL">' + (assertion.expect_null ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <boolProp name="INVERT">' + (assertion.invert ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <boolProp name="ISREGEX">' + (assertion.is_regex ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '</JSONPathAssertion>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    global.JmsHttpJsonAssertionJmx = {
        parseElement: parseElement,
        genXml: genXml
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_http_size_assertion_jmx.js ---- */
/**
 * HTTP 步骤 · 大小断言 SizeAssertion · JMX 解析/生成（隔离模块）
 */
(function (global) {
    'use strict';

    var TEST_FIELD_MAP = {
        full_response: 'SizeAssertion.response_network_size',
        response_headers: 'SizeAssertion.response_headers',
        response_body: 'SizeAssertion.response_body',
        response_code: 'SizeAssertion.response_code',
        response_message: 'SizeAssertion.response_message'
    };

    var TEST_FIELD_REVERSE = {};
    Object.keys(TEST_FIELD_MAP).forEach(function (k) {
        TEST_FIELD_REVERSE[TEST_FIELD_MAP[k]] = k;
    });

    var SCOPE_MAP = {
        main_and_sub: 'all',
        main_only: 'parent',
        sub_only: 'children',
        jmeter_variable: 'variable'
    };

    var SCOPE_REVERSE = {};
    Object.keys(SCOPE_MAP).forEach(function (k) {
        SCOPE_REVERSE[SCOPE_MAP[k]] = k;
    });

    var OPERATOR_TO_INT = {
        eq: 1, equals: 1, '=': 1,
        ne: 2, '!=': 2,
        gt: 3, '>': 3,
        lt: 4, '<': 4,
        ge: 5, '>=': 5,
        le: 6, '<=': 6
    };

    var INT_TO_OPERATOR = {
        1: 'eq', 2: 'ne', 3: 'gt', 4: 'lt', 5: 'ge', 6: 'le'
    };

    function getStringProp(el, name) {
        if (!el) return '';
        var tags = ['stringProp', 'intProp', 'longProp', 'boolProp'];
        for (var t = 0; t < tags.length; t++) {
            var list = el.getElementsByTagName(tags[t]);
            for (var i = 0; i < list.length; i++) {
                if (list[i].getAttribute('name') === name) {
                    return (list[i].textContent || '').trim();
                }
            }
        }
        return '';
    }

    function getIntProp(el, name, def) {
        var v = getStringProp(el, name);
        if (v === '') return def;
        var n = parseInt(v, 10);
        return isNaN(n) ? def : n;
    }

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function operatorToInt(op) {
        if (op === undefined || op === null || op === '') return 1;
        var k = String(op).trim().toLowerCase();
        return OPERATOR_TO_INT[k] !== undefined ? OPERATOR_TO_INT[k] : 1;
    }

    function intToOperator(n) {
        return INT_TO_OPERATOR[Number(n)] || 'eq';
    }

    function parseApplyTo(el) {
        var scope = getStringProp(el, 'Assertion.scope') || getStringProp(el, 'Scope') || 'parent';
        return SCOPE_REVERSE[scope] || 'main_only';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'SizeAssertion') return null;
        var sizeBytes = getStringProp(node, 'SizeAssertion.size');
        if (sizeBytes === '') return null;
        var testFieldRaw = getStringProp(node, 'SizeAssertion.test_field') || TEST_FIELD_MAP.full_response;
        return {
            type: 'size_assert',
            name: node.getAttribute('testname') || '大小断言',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            enabled: isEnabled(node),
            apply_to: parseApplyTo(node),
            jmeter_variable: getStringProp(node, 'Scope.variable') || getStringProp(node, 'Assertion.variable') || '',
            test_field: TEST_FIELD_REVERSE[testFieldRaw] || 'full_response',
            size_bytes: sizeBytes,
            compare_operator: intToOperator(getIntProp(node, 'SizeAssertion.operator', 1))
        };
    }

    function genXml(assertion, childPad, escapeXml) {
        if (!assertion || assertion.type !== 'size_assert' || assertion.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        childPad = childPad || '';
        var sizeBytes = assertion.size_bytes != null ? String(assertion.size_bytes).trim() : '';
        if (!sizeBytes) return '';

        var testField = TEST_FIELD_MAP[assertion.test_field] || TEST_FIELD_MAP.full_response;
        var applyTo = assertion.apply_to || 'main_only';
        var scope = SCOPE_MAP[applyTo] || 'parent';
        var en = assertion.enabled === false ? 'false' : 'true';
        var testName = escapeXml(assertion.name || '大小断言');
        var opInt = operatorToInt(assertion.compare_operator);

        var xml = '';
        xml += childPad + '<SizeAssertion guiclass="SizeAssertionGui" testclass="SizeAssertion" testname="' +
            testName + '" enabled="' + en + '">\n';
        if (assertion.comments && String(assertion.comments).trim()) {
            xml += childPad + '  <stringProp name="TestPlan.comments">' + escapeXml(assertion.comments) + '</stringProp>\n';
        }
        xml += childPad + '  <stringProp name="SizeAssertion.size">' + escapeXml(sizeBytes) + '</stringProp>\n';
        xml += childPad + '  <intProp name="SizeAssertion.operator">' + opInt + '</intProp>\n';
        xml += childPad + '  <stringProp name="SizeAssertion.test_field">' + escapeXml(testField) + '</stringProp>\n';
        if (scope && scope !== 'parent') {
            xml += childPad + '  <stringProp name="Assertion.scope">' + escapeXml(scope) + '</stringProp>\n';
        }
        if (applyTo === 'jmeter_variable' && assertion.jmeter_variable) {
            xml += childPad + '  <stringProp name="Scope.variable">' +
                escapeXml(assertion.jmeter_variable) + '</stringProp>\n';
        }
        xml += childPad + '</SizeAssertion>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    global.JmsHttpSizeAssertionJmx = {
        parseElement: parseElement,
        genXml: genXml,
        operatorToInt: operatorToInt,
        intToOperator: intToOperator
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_http_md5hex_assertion_jmx.js ---- */
/**
 * HTTP 步骤 · MD5Hex 断言 · JMX 解析/生成（隔离模块）
 */
(function (global) {
    'use strict';

    var MD5_PROP = 'MD5HexAssertion.size';

    function getStringProp(el, name) {
        if (!el) return '';
        var tags = ['stringProp', 'intProp', 'longProp', 'boolProp'];
        for (var t = 0; t < tags.length; t++) {
            var list = el.getElementsByTagName(tags[t]);
            for (var i = 0; i < list.length; i++) {
                if (list[i].getAttribute('name') === name) {
                    return (list[i].textContent || '').trim();
                }
            }
        }
        return '';
    }

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'MD5HexAssertion') return null;
        var md5Hex = getStringProp(node, MD5_PROP);
        if (!md5Hex) return null;
        return {
            type: 'md5hex_assert',
            name: node.getAttribute('testname') || 'MD5Hex断言',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            enabled: isEnabled(node),
            md5_hex: md5Hex
        };
    }

    function genXml(assertion, childPad, escapeXml) {
        if (!assertion || assertion.type !== 'md5hex_assert' || assertion.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        childPad = childPad || '';
        var md5Hex = assertion.md5_hex != null ? String(assertion.md5_hex).trim() : '';
        if (!md5Hex) return '';
        var en = assertion.enabled === false ? 'false' : 'true';
        var testName = escapeXml(assertion.name || 'MD5Hex断言');

        var xml = '';
        xml += childPad + '<MD5HexAssertion guiclass="MD5HexAssertionGUI" testclass="MD5HexAssertion" testname="' +
            testName + '" enabled="' + en + '">\n';
        if (assertion.comments && String(assertion.comments).trim()) {
            xml += childPad + '  <stringProp name="TestPlan.comments">' + escapeXml(assertion.comments) + '</stringProp>\n';
        }
        xml += childPad + '  <stringProp name="' + MD5_PROP + '">' + escapeXml(md5Hex) + '</stringProp>\n';
        xml += childPad + '</MD5HexAssertion>\n';
        xml += childPad + '<hashTree/>\n';
        return xml;
    }

    global.JmsHttpMd5hexAssertionJmx = {
        parseElement: parseElement,
        genXml: genXml
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_listener_import_jmx.js ---- */
/**
 * 线程组级 ResultCollector（察看结果树/聚合报告）· JMX 导入（隔离模块）
 */
(function (global) {
    'use strict';

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function ensureListeners(tg) {
        if (!tg.listeners) {
            tg.listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
        }
        return tg.listeners;
    }

    function applyResultCollector(node, tg) {
        if (!node || (node.getAttribute('testclass') || '') !== 'ResultCollector') return false;
        if (!isEnabled(node)) return true;
        var gui = node.getAttribute('guiclass') || '';
        var ls = ensureListeners(tg);
        if (gui === 'ViewResultsFullVisualizer') {
            ls.view_results_tree = true;
            if (global.JmsTgViewResultsTreeJmx && typeof global.JmsTgViewResultsTreeJmx.parseFromJmxNode === 'function') {
                tg.view_results_tree = global.JmsTgViewResultsTreeJmx.parseFromJmxNode(node);
            }
        }
        if (gui === 'StatVisualizer') {
            ls.aggregate_report = true;
            if (global.JmsTgAggregateReportJmx && typeof global.JmsTgAggregateReportJmx.parseFromJmxNode === 'function') {
                tg.aggregate_report = global.JmsTgAggregateReportJmx.parseFromJmxNode(node);
            }
        }
        return true;
    }

    global.JmsTgListenerImportJmx = {
        applyResultCollector: applyResultCollector
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_jmx_path_import.js ---- */
/**
 * JMX 导入/导出路径变量前缀（${BASE_URL} / ${ORIGIN}）· 隔离模块
 */
(function (global) {
    'use strict';

    var VAR_PREFIX_RE = /^\$\{(BASE_URL|ORIGIN)\}/;

    function hasJmxPathVarPrefix(path) {
        return VAR_PREFIX_RE.test(String(path || ''));
    }

    /**
     * JMX 导入：保留 path 中显式的 ${BASE_URL}/ ${ORIGIN}/ 前缀，其余走 legacy 规范化
     */

    function _importHostPrefixedPath(path) {
        return /^\/\/[^/?#]+/.test(String(path || ''));
    }

    function _importCollapsedHostPath(path) {
        return /^\/[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+\/?$/.test(String(path || ''));
    }

    function _importRestoreHostPath(path) {
        path = String(path || '/');
        if (_importHostPrefixedPath(path)) return path;
        if (!_importCollapsedHostPath(path)) return path;
        var m = path.match(/^\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        return m ? ('//' + m[1] + '/') : path;
    }

    function normalizeJmxImportedPath(path, variables, legacyNormalize) {
        path = String(path || '/');
        if (global.JmsJmxPathHost && global.JmsJmxPathHost.isHostPrefixedPath(path)) {
            return path;
        }
        if (_importHostPrefixedPath(path)) {
            return path;
        }
        if (hasJmxPathVarPrefix(path)) {
            return path;
        }
        if (typeof legacyNormalize === 'function') {
            path = legacyNormalize(path, variables);
        }
        if (global.JmsJmxPathHost && global.JmsJmxPathHost.isCollapsedHostPath(path)) {
            var split = global.JmsJmxPathHost.splitHostFromPath(path);
            if (split) {
                return global.JmsJmxPathHost.toHostPrefixedPath(split.domain, split.path);
            }
        }
        return _importRestoreHostPath(path);
    }

    /** 导出：path 已含 ${BASE_URL} 时不重复拼接 */
    function _exportRestoreHostPathInline(path) {
        path = String(path || '/');
        if (/^\/\/[^/?#]+/.test(path)) return path;
        var m1 = path.match(/^\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        if (m1) return '//' + m1[1] + '/';
        var m2 = path.match(/^\$\{(BASE_URL|ORIGIN)\}\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        if (m2) return '//' + m2[2] + '/';
        return null;
    }

    function resolveExportPathWithBaseUrl(path, useBaseUrlVar) {
        path = String(path || '/');
        if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.restoreHostPathForJmxExport === 'function') {
            var hostOnly = global.JmsJmxPathHost.restoreHostPathForJmxExport(path, null);
            if (hostOnly) return hostOnly;
        }
        var inlineHost = _exportRestoreHostPathInline(path);
        if (inlineHost) return inlineHost;
        if (hasJmxPathVarPrefix(path)) {
            return path;
        }
        if (!useBaseUrlVar) {
            return path;
        }
        return '${BASE_URL}' + (path.charAt(0) === '/' ? path : '/' + path);
    }

    global.JmsJmxPathImport = {
        hasJmxPathVarPrefix: hasJmxPathVarPrefix,
        normalizeJmxImportedPath: normalizeJmxImportedPath,
        resolveExportPathWithBaseUrl: resolveExportPathWithBaseUrl
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_jmx_get_body_import.js ---- */
/**
 * JMX 导入 · GET/HEAD 请求体解析（隔离模块，不影响 POST/PUT/PATCH 既有逻辑）
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

    function hasBodyContent(step) {
        if (!step || typeof step !== 'object') return false;
        if (step.body_type === 'form' && step.form_params && typeof step.form_params === 'object') {
            return Object.keys(step.form_params).length > 0;
        }
        return step.body !== undefined && step.body !== null && String(step.body).length > 0;
    }

    /** 从 HTTPsampler.Arguments 解析 GET/HEAD body */
    function parseGetHeadBodyFromArguments(argsEl, postRaw) {
        if (!argsEl) return null;
        var argProps = argsEl.getElementsByTagName('elementProp');
        if (!argProps.length) return null;

        if (postRaw) {
            var raw = getStringProp(argProps[0], 'Argument.value');
            if (raw === '') return null;
            return { body_type: 'json', body: raw };
        }

        var unnamed = [];
        for (var i = 0; i < argProps.length; i++) {
            var ap = argProps[i];
            if (ap.getAttribute('elementType') !== 'HTTPArgument') continue;
            var name = getStringProp(ap, 'Argument.name');
            var val = getStringProp(ap, 'Argument.value');
            if (name) continue;
            if (val !== '') unnamed.push(val);
        }

        if (unnamed.length === 1) {
            return { body_type: 'json', body: unnamed[0] };
        }
        if (unnamed.length > 1) {
            return { body_type: 'json', body: unnamed.join('') };
        }
        return null;
    }

    function applyImportedGetHeadBody(step, argsEl, postRaw) {
        if (!step || !argsEl || !isGetOrHead(step.method)) return step;
        var parsed = parseGetHeadBodyFromArguments(argsEl, postRaw);
        if (!parsed) return step;
        step._jmx_get_body = true;
        step.body_type = parsed.body_type;
        if (parsed.body_type === 'form') {
            step.form_params = parsed.form_params;
            delete step.body;
        } else {
            step.body = parsed.body;
            delete step.form_params;
        }
        return step;
    }

    function shouldExportGetHeadBody(step) {
        return !!(step && step._jmx_get_body === true && isGetOrHead(step.method) && hasBodyContent(step));
    }

    function hasGetHeadBodyForDisplay(step) {
        return !!(step && isGetOrHead(step.method) && hasBodyContent(step));
    }

    global.JmsJmxGetBodyImport = {
        parseGetHeadBodyFromArguments: parseGetHeadBodyFromArguments,
        applyImportedGetHeadBody: applyImportedGetHeadBody,
        shouldExportGetHeadBody: shouldExportGetHeadBody,
        hasGetHeadBodyForDisplay: hasGetHeadBodyForDisplay
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_get_query_import.js ---- */
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

/* ---- js/jms_tg_http_defaults_advanced.js ---- */
/**
 * 线程组 HTTP 请求默认值 · 高级 Tab 字段（隔离模块）
 */
(function (global) {
    'use strict';

    var DEFAULTS = {
        image_parser: false,
        concurrent_dwn: false,
        concurrent_pool: '6',
        embedded_url_re: '',
        ip_source_type: '0',
        ip_source: '',
        proxy_host: '',
        proxy_port: '',
        proxy_user: '',
        proxy_pass: '',
        md5: false
    };

    function stringPropIf(indent, name, value, escapeXml) {
        if (value === undefined || value === null || String(value) === '') return '';
        return indent + '<stringProp name="' + name + '">' + escapeXml(String(value)) + '</stringProp>\n';
    }

    function boolPropIf(indent, name, value, defaultVal) {
        var v = value !== undefined && value !== null ? !!value : defaultVal;
        if (v === defaultVal) return '';
        return indent + '<boolProp name="' + name + '">' + (v ? 'true' : 'false') + '</boolProp>\n';
    }

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return nodes[i].textContent || '';
        }
        return '';
    }

    function getBoolProp(el, name, def) {
        if (!el) return def;
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                var t = (nodes[i].textContent || '').trim().toLowerCase();
                return t === 'true';
            }
        }
        return def;
    }

    function normalizeAdvanced(raw) {
        raw = raw && typeof raw === 'object' ? raw : {};
        var out = {};
        Object.keys(DEFAULTS).forEach(function (k) {
            var def = DEFAULTS[k];
            if (typeof def === 'boolean') out[k] = raw[k] === true;
            else if (k === 'concurrent_pool') {
                var pool = raw.concurrent_pool != null ? String(raw.concurrent_pool).trim() : '';
                out.concurrent_pool = pool || DEFAULTS.concurrent_pool;
            } else if (k === 'ip_source_type') {
                var t = raw.ip_source_type != null ? String(raw.ip_source_type).trim() : '';
                out.ip_source_type = t === '' ? DEFAULTS.ip_source_type : t;
            } else out[k] = raw[k] != null ? String(raw[k]) : '';
        });
        return out;
    }

    function parseFromEl(el) {
        if (!el) return normalizeAdvanced({});
        return normalizeAdvanced({
            image_parser: getBoolProp(el, 'HTTPSampler.image_parser', false),
            concurrent_dwn: getBoolProp(el, 'HTTPSampler.concurrentDwn', false),
            concurrent_pool: getStringProp(el, 'HTTPSampler.concurrentPool') || DEFAULTS.concurrent_pool,
            embedded_url_re: getStringProp(el, 'HTTPSampler.embedded_url_re'),
            ip_source_type: getStringProp(el, 'HTTPSampler.ipSourceType') || DEFAULTS.ip_source_type,
            ip_source: getStringProp(el, 'HTTPSampler.ipSource'),
            proxy_host: getStringProp(el, 'HTTPSampler.proxyHost'),
            proxy_port: getStringProp(el, 'HTTPSampler.proxyPort'),
            proxy_user: getStringProp(el, 'HTTPSampler.proxyUser'),
            proxy_pass: getStringProp(el, 'HTTPSampler.proxyPass'),
            md5: getBoolProp(el, 'HTTPSampler.md5', false)
        });
    }

    function genXml(hd, indent, escapeXml) {
        if (!hd) return '';
        var d = normalizeAdvanced(hd);
        var xml = '';
        xml += boolPropIf(indent, 'HTTPSampler.image_parser', d.image_parser, false);
        xml += boolPropIf(indent, 'HTTPSampler.concurrentDwn', d.concurrent_dwn, false);
        if (d.concurrent_dwn) {
            xml += stringPropIf(indent, 'HTTPSampler.concurrentPool', d.concurrent_pool || DEFAULTS.concurrent_pool, escapeXml);
        }
        xml += stringPropIf(indent, 'HTTPSampler.embedded_url_re', d.embedded_url_re, escapeXml);
        if (d.ip_source_type && d.ip_source_type !== DEFAULTS.ip_source_type) {
            xml += stringPropIf(indent, 'HTTPSampler.ipSourceType', d.ip_source_type, escapeXml);
        }
        xml += stringPropIf(indent, 'HTTPSampler.ipSource', d.ip_source, escapeXml);
        xml += stringPropIf(indent, 'HTTPSampler.proxyHost', d.proxy_host, escapeXml);
        xml += stringPropIf(indent, 'HTTPSampler.proxyPort', d.proxy_port, escapeXml);
        xml += stringPropIf(indent, 'HTTPSampler.proxyUser', d.proxy_user, escapeXml);
        xml += stringPropIf(indent, 'HTTPSampler.proxyPass', d.proxy_pass, escapeXml);
        xml += boolPropIf(indent, 'HTTPSampler.md5', d.md5, false);
        return xml;
    }

    function hasContent(d) {
        if (!d) return false;
        var n = normalizeAdvanced(d);
        return n.image_parser || n.concurrent_dwn || n.md5 ||
            String(n.embedded_url_re || '').trim() !== '' ||
            String(n.ip_source || '').trim() !== '' ||
            (n.ip_source_type && n.ip_source_type !== DEFAULTS.ip_source_type) ||
            String(n.proxy_host || '').trim() !== '' ||
            String(n.proxy_port || '').trim() !== '' ||
            String(n.proxy_user || '').trim() !== '' ||
            String(n.proxy_pass || '').trim() !== '';
    }

    global.JmsTgHttpDefaultsAdvanced = {
        DEFAULTS: DEFAULTS,
        normalizeAdvanced: normalizeAdvanced,
        parseFromEl: parseFromEl,
        genXml: genXml,
        hasContent: hasContent
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_tg_http_defaults_jmx.js ---- */
/**
 * 线程组 HTTP 请求默认值 · 参数/消息体 JMX 与数据规范化（隔离模块）
 */
(function (global) {
    'use strict';

    function stringPropIf(indent, name, value, escapeXml) {
        if (value === undefined || value === null || String(value) === '') return '';
        return indent + '<stringProp name="' + name + '">' + escapeXml(String(value)) + '</stringProp>\n';
    }

    function boolPropIf(indent, name, value, defaultVal) {
        var v = value !== undefined && value !== null ? !!value : defaultVal;
        if (v === defaultVal) return '';
        return indent + '<boolProp name="' + name + '">' + (v ? 'true' : 'false') + '</boolProp>\n';
    }

    function normalizeParameters(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.map(function (row) {
            if (!row || typeof row !== 'object') {
                return { name: '', value: '', always_encode: false, use_equals: true, content_type: '' };
            }
            return {
                name: String(row.name != null ? row.name : (row.key != null ? row.key : '')),
                value: row.value == null ? '' : String(row.value),
                always_encode: !!row.always_encode,
                use_equals: row.use_equals !== false,
                content_type: row.content_type != null ? String(row.content_type) : ''
            };
        }).filter(function (row) { return String(row.name || '').trim() || String(row.value || '').trim(); });
    }

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return nodes[i].textContent || '';
        }
        return '';
    }

    function getBoolProp(el, name, def) {
        if (!el) return def;
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                var t = (nodes[i].textContent || '').trim().toLowerCase();
                return t === 'true';
            }
        }
        return def;
    }

    function parseArguments(argsEl, postBodyRaw) {
        var out = { arg_mode: 'params', parameters: [], body_data: '' };
        if (!argsEl) return out;
        var coll = argsEl.querySelector('collectionProp[name="Arguments.arguments"]');
        var argProps = coll ? coll.getElementsByTagName('elementProp') : argsEl.getElementsByTagName('elementProp');
        if (!argProps || !argProps.length) return out;

        if (postBodyRaw) {
            out.arg_mode = 'body';
            out.body_data = getStringProp(argProps[0], 'Argument.value') || '';
            return out;
        }

        var params = [];
        for (var i = 0; i < argProps.length; i++) {
            var ap = argProps[i];
            if (ap.getAttribute('elementType') !== 'HTTPArgument') continue;
            var name = getStringProp(ap, 'Argument.name') || ap.getAttribute('name') || '';
            if (name === '') name = getStringProp(ap, 'HTTPArgument.name') || '';
            params.push({
                name: name,
                value: getStringProp(ap, 'Argument.value'),
                always_encode: getBoolProp(ap, 'HTTPArgument.always_encode', false),
                use_equals: getBoolProp(ap, 'HTTPArgument.use_equals', true),
                content_type: getStringProp(ap, 'HTTPArgument.content_type') || ''
            });
        }
        out.parameters = normalizeParameters(params);
        return out;
    }

    function genArgumentsXml(d, indent, escapeXml) {
        var mode = d && d.arg_mode === 'body' ? 'body' : 'params';
        var p2 = indent + '  ';
        var p3 = p2 + '  ';
        var xml = '';

        if (mode === 'body') {
            var body = d.body_data != null ? String(d.body_data) : '';
            xml += p2 + '<boolProp name="HTTPSampler.postBodyRaw">true</boolProp>\n';
            xml += p2 + '<elementProp name="HTTPsampler.Arguments" elementType="Arguments">\n';
            xml += p3 + '<collectionProp name="Arguments.arguments">\n';
            if (body) {
                xml += p3 + '  <elementProp name="" elementType="HTTPArgument">\n';
                xml += p3 + '    <boolProp name="HTTPArgument.always_encode">false</boolProp>\n';
                xml += p3 + '    <stringProp name="Argument.value">' + escapeXml(body) + '</stringProp>\n';
                xml += p3 + '    <stringProp name="Argument.metadata">=</stringProp>\n';
                xml += p3 + '  </elementProp>\n';
            }
            xml += p3 + '</collectionProp>\n';
            xml += p2 + '</elementProp>\n';
            return xml;
        }

        var params = normalizeParameters(d && d.parameters);
        xml += p2 + '<elementProp name="HTTPsampler.Arguments" elementType="Arguments">\n';
        xml += p3 + '<collectionProp name="Arguments.arguments">\n';
        params.forEach(function (row) {
            var name = String(row.name || '').trim();
            if (!name) return;
            xml += p3 + '  <elementProp name="' + escapeXml(name) + '" elementType="HTTPArgument">\n';
            if (row.always_encode) {
                xml += p3 + '    <boolProp name="HTTPArgument.always_encode">true</boolProp>\n';
            }
            var ct = row.content_type != null ? String(row.content_type).trim() : '';
            if (ct) {
                xml += p3 + '    <stringProp name="HTTPArgument.content_type">' + escapeXml(ct) + '</stringProp>\n';
            }
            xml += p3 + '    <stringProp name="Argument.value">' + escapeXml(row.value || '') + '</stringProp>\n';
            xml += p3 + '    <stringProp name="Argument.metadata">=</stringProp>\n';
            if (row.use_equals === false) {
                xml += p3 + '    <boolProp name="HTTPArgument.use_equals">false</boolProp>\n';
            }
            xml += p3 + '  </elementProp>\n';
        });
        xml += p3 + '</collectionProp>\n';
        xml += p2 + '</elementProp>\n';
        return xml;
    }

    function genHttpDefaultsXml(hd, pad, escapeXml) {
        if (!hd || !hd.enabled) return '';

        var p2 = pad + '  ';
        var testname = (hd.name && String(hd.name).trim()) || 'HTTP 请求默认值';
        var xml = pad + '<ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="' + escapeXml(testname) + '">\n';
        xml += genArgumentsXml(hd, p2, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.domain', hd.domain, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.port', hd.port, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.protocol', hd.protocol, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.path', hd.path !== undefined ? hd.path : '', escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.contentEncoding', hd.content_encoding, escapeXml);
        xml += boolPropIf(p2, 'HTTPSampler.follow_redirects', hd.follow_redirects, true);
        xml += boolPropIf(p2, 'HTTPSampler.auto_redirects', hd.auto_redirects, false);
        xml += boolPropIf(p2, 'HTTPSampler.use_keepalive', hd.use_keepalive, true);
        xml += stringPropIf(p2, 'HTTPSampler.connect_timeout', hd.connect_timeout, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.response_timeout', hd.response_timeout, escapeXml);
        xml += stringPropIf(p2, 'TestPlan.comments', hd.comments, escapeXml);
        var implRaw = hd.implementation;
        if (implRaw !== undefined && implRaw !== null && String(implRaw) !== '' && String(implRaw) !== 'HttpClient4') {
            xml += p2 + '<stringProp name="HTTPSampler.implementation">' + escapeXml(String(implRaw)) + '</stringProp>\n';
        }
        if (global.JmsTgHttpDefaultsAdvanced && typeof global.JmsTgHttpDefaultsAdvanced.genXml === 'function') {
            xml += global.JmsTgHttpDefaultsAdvanced.genXml(hd, p2, escapeXml);
        }
        xml += pad + '</ConfigTestElement>\n' + pad + '<hashTree/>\n';
        return xml;
    }

    function hasArgContent(d) {
        if (!d) return false;
        if (d.arg_mode === 'body') return String(d.body_data || '').trim() !== '';
        return normalizeParameters(d.parameters).some(function (r) { return String(r.name || '').trim(); });
    }

    global.JmsTgHttpDefaultsJmx = {
        normalizeParameters: normalizeParameters,
        parseArguments: parseArguments,
        genArgumentsXml: genArgumentsXml,
        genHttpDefaultsXml: genHttpDefaultsXml,
        hasArgContent: hasArgContent
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_catalog_unify_migrate.js ---- */
/**
 * 全场景统一为 JMeter 官方 catalog_element（加载/YAML 导出前一次性转换）
 */
(function (global) {
    'use strict';

    var LEGACY_TYPE_MAP = {
        if_controller: { alias: 'IfController', testclass: 'IfController', guiclass: 'IfControllerPanel', category: 'controller', container: true, label_zh: 'If 控制器' },
        random_controller: { alias: 'RandomController', testclass: 'RandomController', guiclass: 'RandomControlPanel', category: 'controller', container: true, label_zh: '随机控制器' },
        simple_controller: { alias: 'GenericController', testclass: 'GenericController', guiclass: 'LogicControllerGui', category: 'controller', container: true, label_zh: '简单控制器' },
        transaction_controller: { alias: 'TransactionController', testclass: 'TransactionController', guiclass: 'TransactionControllerGui', category: 'controller', container: true, label_zh: '事务控制器' },
        loop_controller: { alias: 'LoopController', testclass: 'LoopController', guiclass: 'LoopControlPanel', category: 'controller', container: true, label_zh: '循环控制器' },
        debug_sampler: { alias: 'DebugSampler', testclass: 'DebugSampler', guiclass: 'TestBeanGUI', category: 'sampler', container: false, label_zh: 'Debug Sampler' },
        beanshell_post: { alias: 'BeanShellPostProcessor', testclass: 'BeanShellPostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', container: false, label_zh: 'BeanShell 后置处理器' },
        json_post: { alias: 'JSONPostProcessor', testclass: 'JSONPostProcessor', guiclass: 'JSONPostProcessorGui', category: 'postprocessor', container: false, label_zh: 'JSON 提取器' },
        regex_extract: { alias: 'RegexExtractor', testclass: 'RegexExtractor', guiclass: 'RegexExtractorGui', category: 'postprocessor', container: false, label_zh: '正则表达式提取器' },
        xpath_extract: { alias: 'XPathExtractor', testclass: 'XPathExtractor', guiclass: 'XPathExtractorGui', category: 'postprocessor', container: false, label_zh: 'XPath 提取器' },
        jdbc_post: { alias: 'JDBCPostProcessor', testclass: 'JDBCPostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', container: false, label_zh: 'JDBC 后置处理器' },
        jsr223_post: { alias: 'JSR223PostProcessor', testclass: 'JSR223PostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', container: false, label_zh: 'JSR223 后置处理器' }
    };

    var CONFIG_TYPE_MAP = {
        http_defaults: { alias: 'ConfigTestElement', testclass: 'ConfigTestElement', guiclass: 'HttpDefaultsGui', category: 'config', label_zh: 'HTTP 请求默认值' },
        header_manager: { alias: 'HeaderManager', testclass: 'HeaderManager', guiclass: 'HeaderPanel', category: 'config', label_zh: 'HTTP 信息头管理器' },
        auth_manager: { alias: 'AuthManager', testclass: 'AuthManager', guiclass: 'AuthPanel', category: 'config', label_zh: 'HTTP 授权管理器' },
        cookie_manager: { alias: 'CookieManager', testclass: 'CookieManager', guiclass: 'CookiePanel', category: 'config', label_zh: 'HTTP Cookie 管理器' },
        cache_manager: { alias: 'CacheManager', testclass: 'CacheManager', guiclass: 'CachePanel', category: 'config', label_zh: 'HTTP 缓存管理器' },
        csv_data_set: { alias: 'CSVDataSet', testclass: 'CSVDataSet', guiclass: 'TestBeanGUI', category: 'config', label_zh: 'CSV 数据文件设置' },
        counter: { alias: 'CounterConfig', testclass: 'CounterConfig', guiclass: 'CounterConfigGui', category: 'config', label_zh: '计数器' }
    };

    function uid(prefix) {
        return (prefix || 'cat_') + Math.random().toString(36).slice(2, 10);
    }

    function copyProps(src, skip) {
        skip = skip || {};
        var out = {};
        if (!src || typeof src !== 'object') return out;
        Object.keys(src).forEach(function (k) {
            if (skip[k]) return;
            out[k] = src[k];
        });
        return out;
    }

    function isHttpLegacyStep(step) {
        if (!step || step.type === 'catalog_element') return false;
        if (step.type) return false;
        return !!(step.method || step.path != null || step.body != null || step.headers || step.assertions);
    }

    function stepToCatalog(step) {
        if (!step) return null;
        if (step.type === 'catalog_element') {
            var cloned = Object.assign({}, step);
            if (Array.isArray(step.children)) cloned.children = stepsListToCatalog(step.children);
            if (Array.isArray(step.catalog_hash_children)) {
                cloned.catalog_hash_children = stepsListToCatalog(step.catalog_hash_children);
                var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
                if (HN && typeof HN.normalizeHashChildren === 'function') {
                    HN.normalizeHashChildren(cloned.catalog_hash_children);
                }
                var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
                if (JA && typeof JA.normalizeHashChildren === 'function') {
                    JA.normalizeHashChildren(cloned.catalog_hash_children);
                }
            }
            if (cloned.alias === 'HeaderManager' && cloned.catalog_props) {
                var HN2 = global.JmsJmxImportHeaderPropsNormalizeV1;
                if (HN2 && typeof HN2.normalizeHeaderProps === 'function') {
                    cloned.catalog_props = HN2.normalizeHeaderProps(cloned.catalog_props);
                }
            }
            if (cloned.alias === 'JSONPathAssertion' && cloned.catalog_props) {
                var JA2 = global.JmsJmxImportJsonAssertPropsNormalizeV1;
                if (JA2 && typeof JA2.normalizeJsonAssertProps === 'function') {
                    cloned.catalog_props = JA2.normalizeJsonAssertProps(cloned.catalog_props);
                }
            }
            if (step.import_order != null) cloned.import_order = step.import_order;
            return cloned;
        }
        if (isHttpLegacyStep(step)) {
            var httpCat = {
                id: step.id || uid(),
                type: 'catalog_element',
                name: step.name || 'HTTP 请求',
                enabled: step.enabled !== false,
                alias: 'HTTPSamplerProxy',
                testclass: 'HTTPSamplerProxy',
                guiclass: 'HttpTestSampleGui',
                category: 'sampler',
                label_zh: 'HTTP 请求',
                container: false,
                scope: 'unified',
                catalog_props: copyProps(step, { id: 1, type: 1, children: 1, catalog_hash_children: 1 }),
                jmx_fragment: step.jmx_fragment || ''
            };
            if (Array.isArray(step.catalog_hash_children) && step.catalog_hash_children.length) {
                httpCat.catalog_hash_children = stepsListToCatalog(step.catalog_hash_children);
            }
            if (step.import_order != null) httpCat.import_order = step.import_order;
            return httpCat;
        }
        var map = LEGACY_TYPE_MAP[step.type];
        if (!map) return step;
        var cat = {
            id: step.id || uid(),
            type: 'catalog_element',
            name: step.name || map.label_zh || map.alias,
            enabled: step.enabled !== false,
            alias: map.alias,
            testclass: map.testclass || map.alias,
            guiclass: map.guiclass || (map.alias + 'Gui'),
            category: map.category || 'other',
            label_zh: map.label_zh || step.name || map.alias,
            container: !!map.container,
            scope: 'unified',
            catalog_props: copyProps(step, { id: 1, type: 1, children: 1 }),
            jmx_fragment: step.jmx_fragment || ''
        };
        if (map.container) cat.children = stepsListToCatalog(step.children || []);
        if (step.import_order != null) cat.import_order = step.import_order;
        return cat;
    }

    function stepsListToCatalog(list) {
        if (!Array.isArray(list)) return [];
        return list.map(stepToCatalog).filter(Boolean);
    }

    function configItemToCatalog(item) {
        if (!item || !item.type) return null;
        var map = CONFIG_TYPE_MAP[item.type];
        if (!map) return null;
        var cat = {
            id: item.id || uid('cfg_'),
            type: 'catalog_element',
            name: item.name || map.label_zh || item.type,
            enabled: !(item.data && item.data.enabled === false),
            alias: map.alias,
            testclass: map.testclass || map.alias,
            guiclass: map.guiclass || '',
            category: map.category || 'config',
            label_zh: map.label_zh || item.name || map.alias,
            container: false,
            scope: 'unified',
            catalog_props: Object.assign({}, item.data || {}),
            jmx_fragment: ''
        };
        if (item.type === 'header_manager') {
            var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
            if (HN && typeof HN.normalizeHeaderProps === 'function') {
                cat.catalog_props = HN.normalizeHeaderProps(cat.catalog_props);
            }
        }
        if (item.import_order != null) cat.import_order = item.import_order;
        return cat;
    }

    function migrateThreadGroup(tg) {
        if (!tg) return;
        var P = global.JmsCatalogLegacyPurge;
        if (P && typeof P.enrichThreadGroupBeforeCatalog === 'function') {
            P.enrichThreadGroupBeforeCatalog(tg);
        }
        var Attach = global.JmsJmxImportConfigAttachV1;
        if (Attach && typeof Attach.attachNestedConfigItems === 'function') {
            Attach.attachNestedConfigItems(tg, configItemToCatalog);
        }
        var prefix = [];
        if (Array.isArray(tg.config_items) && tg.config_items.length) {
            tg.config_items.forEach(function (item) {
                if (item && item.parent_step_id) return;
                var cat = configItemToCatalog(item);
                if (cat) {
                    if (item.import_order != null) cat.import_order = item.import_order;
                    prefix.push(cat);
                }
            });
            tg.config_items = [];
        }
        tg.steps = stepsListToCatalog(tg.steps || []);
        if (prefix.length) tg.steps = prefix.concat(tg.steps);
        delete tg.http_managers;
        if (P && typeof P.purgeLegacyTgFields === 'function') {
            P.purgeLegacyTgFields(tg);
        }
        if (P && typeof P.cleanCatalogTree === 'function') {
            P.cleanCatalogTree(tg.steps);
        }
    }

    function migratePlanCatalog(model, opts) {
        if (!model) return;
        opts = opts || {};
        var R = global.JmsPlanCatalogResolve;
        if (!opts.catalogOnly) {
            if (R && typeof R.migrateLegacyToCatalog === 'function') R.migrateLegacyToCatalog(model);
            if (R && typeof R.migrateLegacySceneToCatalog === 'function') R.migrateLegacySceneToCatalog(model);
        }
        if (R && typeof R.syncSceneFieldsOntoModel === 'function') R.syncSceneFieldsOntoModel(model);
    }

    function migrateModel(model) {
        if (!model) return model;
        migratePlanCatalog(model, { catalogOnly: true });
        (model.test_plans || []).forEach(function (plan) {
            (plan.thread_groups || []).forEach(function (tg) {
                global.JmsCatalogUnifyMigrate.migrateThreadGroup(tg);
            });
        });
        (model.setup_thread_groups || []).forEach(function (tg) {
            global.JmsCatalogUnifyMigrate.migrateThreadGroup(tg);
        });
        (model.post_thread_groups || []).forEach(function (tg) {
            global.JmsCatalogUnifyMigrate.migrateThreadGroup(tg);
        });
        delete model.plan_listeners;
        return model;
    }

    var AUX_TO_ALIAS = { http_request: 'HTTPSamplerProxy' };
    Object.keys(LEGACY_TYPE_MAP).forEach(function (k) {
        AUX_TO_ALIAS[k] = LEGACY_TYPE_MAP[k].alias;
    });

    function normalizeCatalogModel(model) {
        return migrateModel(model);
    }

    global.JmsCatalogUnifyMigrate = {
        migrateModel: migrateModel,
        migrateThreadGroup: migrateThreadGroup,
        normalizeCatalogModel: normalizeCatalogModel,
        migratePlanCatalog: migratePlanCatalog,
        stepToCatalog: stepToCatalog,
        stepsListToCatalog: stepsListToCatalog,
        isHttpLegacyStep: isHttpLegacyStep,
        AUX_TO_ALIAS: AUX_TO_ALIAS
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_import_timeline_merge_v1.js ---- */
/**
 * JMX 导入 · 线程组 config_items/steps 按 import_order 交错合并（隔离模块，不影响导出）
 */
(function (global) {
    'use strict';

    var CONFIG_TYPE_MAP = {
        http_defaults: { alias: 'ConfigTestElement', testclass: 'ConfigTestElement', guiclass: 'HttpDefaultsGui', category: 'config', label_zh: 'HTTP 请求默认值' },
        header_manager: { alias: 'HeaderManager', testclass: 'HeaderManager', guiclass: 'HeaderPanel', category: 'config', label_zh: 'HTTP 信息头管理器' },
        auth_manager: { alias: 'AuthManager', testclass: 'AuthManager', guiclass: 'AuthPanel', category: 'config', label_zh: 'HTTP 授权管理器' },
        cookie_manager: { alias: 'CookieManager', testclass: 'CookieManager', guiclass: 'CookiePanel', category: 'config', label_zh: 'HTTP Cookie 管理器' },
        cache_manager: { alias: 'CacheManager', testclass: 'CacheManager', guiclass: 'CachePanel', category: 'config', label_zh: 'HTTP 缓存管理器' },
        csv_data_set: { alias: 'CSVDataSet', testclass: 'CSVDataSet', guiclass: 'TestBeanGUI', category: 'config', label_zh: 'CSV 数据文件设置' },
        counter: { alias: 'CounterConfig', testclass: 'CounterConfig', guiclass: 'CounterConfigGui', category: 'config', label_zh: '计数器' }
    };

    function uid(prefix) {
        return (prefix || 'cat_') + Math.random().toString(36).slice(2, 10);
    }

    function configItemToCatalog(item) {
        if (!item || !item.type) return null;
        var map = CONFIG_TYPE_MAP[item.type];
        if (!map) return null;
        var cat = {
            id: item.id || uid('cfg_'),
            type: 'catalog_element',
            name: item.name || map.label_zh || item.type,
            enabled: !(item.data && item.data.enabled === false),
            alias: map.alias,
            testclass: map.testclass || map.alias,
            guiclass: map.guiclass || '',
            category: map.category || 'config',
            label_zh: map.label_zh || item.name || map.alias,
            container: false,
            scope: 'unified',
            catalog_props: Object.assign({}, item.data || {}),
            jmx_fragment: ''
        };
        if (item.import_order != null) cat.import_order = item.import_order;
        if (item.parent_step_id) cat.parent_step_id = item.parent_step_id;
        return cat;
    }

    function dedupeHmConfigItems(tg) {
        if (!tg || !Array.isArray(tg.config_items)) return;
        var typedWithOrder = {};
        tg.config_items.forEach(function (it) {
            if (it && it.type && it.import_order != null) typedWithOrder[it.type] = true;
        });
        tg.config_items = tg.config_items.filter(function (it) {
            if (!it) return false;
            if (it.import_order != null) return true;
            if (it.type && typedWithOrder[it.type]) return false;
            return true;
        });
    }

    function sortKey(order, fallback) {
        return order != null ? order : fallback;
    }

    function mergeTopLevelByImportOrder(tg) {
        var entries = [];
        var fallback = 100000;
        (tg.config_items || []).forEach(function (item) {
            if (!item || item.parent_step_id) return;
            entries.push({
                kind: 'config',
                ref: item,
                order: sortKey(item.import_order, fallback++)
            });
        });
        (tg.steps || []).forEach(function (step) {
            if (!step) return;
            entries.push({
                kind: 'step',
                ref: step,
                order: sortKey(step.import_order, fallback++)
            });
        });
        entries.sort(function (a, b) { return a.order - b.order; });
        var merged = [];
        entries.forEach(function (entry, idx) {
            if (entry.kind === 'config') {
                var cat = configItemToCatalog(entry.ref);
                if (cat) {
                    cat.import_order = idx;
                    merged.push(cat);
                }
            } else {
                entry.ref.import_order = idx;
                merged.push(entry.ref);
            }
        });
        return merged;
    }

    function indexStepsById(steps, map) {
        map = map || {};
        (steps || []).forEach(function (step) {
            if (!step) return;
            if (step.id) map[step.id] = step;
            if (Array.isArray(step.children)) indexStepsById(step.children, map);
        });
        return map;
    }

    function attachNestedConfigItems(tg, steps) {
        var nested = (tg.config_items || []).filter(function (it) {
            return it && it.parent_step_id;
        });
        if (!nested.length) return;
        var byId = indexStepsById(steps, {});
        nested.sort(function (a, b) {
            return sortKey(a.import_order, 0) - sortKey(b.import_order, 0);
        });
        nested.forEach(function (item) {
            var parent = byId[item.parent_step_id];
            if (!parent) return;
            var cat = configItemToCatalog(item);
            if (!cat) return;
            if (!Array.isArray(parent.catalog_hash_children)) parent.catalog_hash_children = [];
            parent.catalog_hash_children.push(cat);
        });
    }

    function migrateThreadGroupImportTimeline(tg) {
        if (!tg) return;
        var U = global.JmsCatalogUnifyMigrate;
        var P = global.JmsCatalogLegacyPurge;
        if (!U) return;

        if (P && typeof P.enrichThreadGroupBeforeCatalog === 'function') {
            P.enrichThreadGroupBeforeCatalog(tg);
        }
        dedupeHmConfigItems(tg);

        var merged = mergeTopLevelByImportOrder(tg);
        tg.steps = typeof U.stepsListToCatalog === 'function'
            ? U.stepsListToCatalog(merged)
            : merged;

        attachNestedConfigItems(tg, tg.steps);

        var HT = global.JmsJmxImportSamplerHashTimelineV1;
        if (HT && typeof HT.migrateTree === 'function') {
            HT.migrateTree(tg.steps);
        }

        tg.config_items = [];
        if (P && typeof P.purgeLegacyTgFields === 'function') P.purgeLegacyTgFields(tg);
        if (P && typeof P.cleanCatalogTree === 'function') P.cleanCatalogTree(tg.steps);
    }

    function patchUnifyMigrate() {
        var U = global.JmsCatalogUnifyMigrate;
        if (!U || U.__importTimelineMergePatched) return;

        var origStepToCatalog = U.stepToCatalog;

        U.stepToCatalog = function (step) {
            var cat = origStepToCatalog(step);
            if (cat && step && step.import_order != null && cat.import_order == null) {
                cat.import_order = step.import_order;
            }
            return cat;
        };

        U.migrateThreadGroup = function (tg) {
            migrateThreadGroupImportTimeline(tg);
        };

        U.__importTimelineMergePatched = true;
        U.migrateThreadGroupImportTimeline = migrateThreadGroupImportTimeline;
        U.mergeTopLevelByImportOrder = mergeTopLevelByImportOrder;
    }

    function boot() {
        patchUnifyMigrate();
    }

    global.JmsJmxImportTimelineMergeV1 = {
        boot: boot,
        patchUnifyMigrate: patchUnifyMigrate,
        migrateThreadGroupImportTimeline: migrateThreadGroupImportTimeline,
        mergeTopLevelByImportOrder: mergeTopLevelByImportOrder
    };

    boot();
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_catalog_legacy_purge.js ---- */
/**
 * Phase1 · legacy 字段迁移进 catalog（独立模块，不修改既有 migrate 核心逻辑）
 */
(function (global) {
    'use strict';

    var LISTENER_LEGACY_MAP = {
        view_results_tree: {
            alias: 'ViewResultsFullVisualizer',
            testclass: 'ResultCollector',
            guiclass: 'ViewResultsFullVisualizer',
            category: 'listener',
            label_zh: '查看结果树',
            tgConfigKey: 'view_results_tree'
        },
        aggregate_report: {
            alias: 'StatVisualizer',
            testclass: 'ResultCollector',
            guiclass: 'StatVisualizer',
            category: 'listener',
            label_zh: '聚合报告',
            tgConfigKey: 'aggregate_report'
        },
        backend_listener: {
            alias: 'BackendListener',
            testclass: 'BackendListener',
            guiclass: 'BackendListenerGui',
            category: 'listener',
            label_zh: '后端监听器',
            tgConfigKey: 'backend_listener'
        }
    };

    var HM_LABELS = {
        http_defaults: 'HTTP 请求默认值',
        header_manager: 'HTTP 请求头管理器',
        auth_manager: 'HTTP 授权管理器',
        cookie_manager: 'HTTP Cookie 管理器',
        cache_manager: 'HTTP 缓存管理器',
        csv_data_set: 'CSV 数据文件设置',
        counter: '计数器'
    };

    var HM_KEYS = ['http_defaults', 'header_manager', 'auth_manager', 'cookie_manager', 'cache_manager', 'csv_data_set', 'counter'];

    function uid(prefix) {
        return (prefix || 'cat_') + Math.random().toString(36).slice(2, 10);
    }

    function buildCatalogElement(map, name, catalogProps, enabled) {
        return {
            id: uid('cat_'),
            type: 'catalog_element',
            name: name || map.label_zh || map.alias,
            enabled: enabled !== false,
            alias: map.alias,
            testclass: map.testclass || map.alias,
            guiclass: map.guiclass || (map.alias + 'Gui'),
            category: map.category || 'other',
            label_zh: map.label_zh || map.alias,
            container: false,
            scope: 'unified',
            catalog_props: catalogProps && typeof catalogProps === 'object' ? Object.assign({}, catalogProps) : {},
            jmx_fragment: ''
        };
    }

    function walkSteps(list, fn) {
        (list || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
        });
    }

    function stepsHasListenerAlias(steps, alias) {
        var found = false;
        walkSteps(steps, function (s) {
            if (found) return;
            if (s.type === 'catalog_element' && s.alias === alias) found = true;
        });
        return found;
    }

    function hashHasAlias(list, alias) {
        return (list || []).some(function (s) {
            return s && s.type === 'catalog_element' && s.alias === alias;
        });
    }

    function isSamplerStep(step) {
        if (!step) return false;
        if (step.type === 'catalog_element' && step.category === 'sampler') return true;
        if (step.type === 'catalog_element' && step.alias === 'HTTPSamplerProxy') return true;
        if (!step.type && (step.method || step.path != null)) return true;
        return false;
    }

    function normalizeListenerProps(key, raw) {
        raw = raw && typeof raw === 'object' ? raw : {};
        var V = global.JmsTgViewResultsTreeCatalog;
        var A = global.JmsTgAggregateReportCatalog;
        var B = global.JmsBackendListenerCatalog;
        if (key === 'view_results_tree' && V && typeof V.normalizeConfig === 'function') {
            return V.normalizeConfig(raw);
        }
        if (key === 'aggregate_report' && A && typeof A.normalizeConfig === 'function') {
            return A.normalizeConfig(raw);
        }
        if (key === 'backend_listener' && B && typeof B.normalizeConfig === 'function') {
            return B.normalizeConfig(raw);
        }
        return Object.assign({}, raw);
    }

    function migrateTgListenersToSteps(tg) {
        if (!tg || !tg.listeners || typeof tg.listeners !== 'object') return;
        if (!Array.isArray(tg.steps)) tg.steps = [];
        Object.keys(LISTENER_LEGACY_MAP).forEach(function (key) {
            if (!tg.listeners[key]) return;
            var map = LISTENER_LEGACY_MAP[key];
            if (stepsHasListenerAlias(tg.steps, map.alias)) return;
            var rawCfg = tg[map.tgConfigKey] || {};
            var props = normalizeListenerProps(key, rawCfg);
            var nm = props.name || map.label_zh;
            tg.steps.push(buildCatalogElement(map, nm, props, props.enabled !== false));
        });
    }

    function httpBlockEnabled(hm, key) {
        var block = hm[key];
        if (!block || typeof block !== 'object') return false;
        if (block.enabled === true) return true;
        if (block.enabled === false) return false;
        var sel = hm.selected_types;
        if (sel && sel[key]) return true;
        if (key === 'header_manager' && block.headers && block.headers.length) return true;
        return false;
    }

    function configItemsHasType(items, type) {
        return (items || []).some(function (it) { return it && it.type === type; });
    }

    function migrateHttpManagersToConfigItems(tg) {
        var hm = tg && tg.http_managers;
        if (!hm || typeof hm !== 'object') return [];
        var items = [];
        var existing = tg.config_items || [];
        HM_KEYS.forEach(function (type) {
            if (configItemsHasType(existing, type)) return;
            if (!httpBlockEnabled(hm, type)) return;
            var block = hm[type];
            if (!block || typeof block !== 'object') return;
            items.push({
                id: uid('cfg_'),
                type: type,
                name: block.name || HM_LABELS[type] || type,
                data: Object.assign({}, block, { enabled: block.enabled !== false })
            });
        });
        return items;
    }

    function migrateStepListenersOnStep(step) {
        if (!step || !isSamplerStep(step)) return;
        var sl = step.step_listeners;
        if (!sl || typeof sl !== 'object') return;
        if (!Array.isArray(step.catalog_hash_children)) step.catalog_hash_children = [];
        if (sl.view_results_tree && !hashHasAlias(step.catalog_hash_children, 'ViewResultsFullVisualizer')) {
            step.catalog_hash_children.push(buildCatalogElement(LISTENER_LEGACY_MAP.view_results_tree, '查看结果树', {}, true));
        }
        if (sl.aggregate_report && !hashHasAlias(step.catalog_hash_children, 'StatVisualizer')) {
            step.catalog_hash_children.push(buildCatalogElement(LISTENER_LEGACY_MAP.aggregate_report, '聚合报告', {}, true));
        }
        delete step.step_listeners;
        delete step.step_listener_items;
    }

    function migrateStepListenersInTree(list) {
        walkSteps(list, migrateStepListenersOnStep);
    }

    function cleanCatalogStep(step) {
        if (!step || step.type !== 'catalog_element') return;
        if (step.catalog_props && typeof step.catalog_props === 'object') {
            delete step.catalog_props.step_listeners;
            delete step.catalog_props.step_listener_items;
        }
        (step.children || []).forEach(cleanCatalogStep);
        (step.catalog_hash_children || []).forEach(cleanCatalogStep);
    }

    function cleanCatalogTree(steps) {
        walkSteps(steps, cleanCatalogStep);
    }

    function purgeLegacyTgFields(tg) {
        if (!tg) return;
        delete tg.listeners;
        delete tg.view_results_tree;
        delete tg.aggregate_report;
        delete tg.backend_listener;
        delete tg.http_managers;
        delete tg._config_timeline_active;
        delete tg._removed_config_types;
        walkSteps(tg.steps, function (s) {
            delete s.step_listeners;
            delete s.step_listener_items;
        });
    }

    function enrichThreadGroupBeforeCatalog(tg) {
        if (!tg) return;
        var MB = global.JmsMountCatalogBridge;
        if (MB && typeof MB.migrateLegacyMountArraysToHash === 'function') {
            function walkMountHosts(list) {
                (list || []).forEach(function (s) {
                    if (!s) return;
                    if (MB.isMountHostStep && MB.isMountHostStep(s)) {
                        MB.migrateLegacyMountArraysToHash(s);
                    }
                    if (Array.isArray(s.children)) walkMountHosts(s.children);
                });
            }
            walkMountHosts(tg.steps);
        }
        migrateStepListenersInTree(tg.steps);
        var SHT = global.JmsJmxImportSamplerHashTimelineV1;
        if (SHT && typeof SHT.migrateThreadGroup === 'function') {
            SHT.migrateThreadGroup(tg);
        }
        migrateTgListenersToSteps(tg);
        var fromHm = migrateHttpManagersToConfigItems(tg);
        if (fromHm.length) {
            if (!Array.isArray(tg.config_items)) tg.config_items = [];
            tg.config_items = fromHm.concat(tg.config_items);
        }
    }

    global.JmsCatalogLegacyPurge = {
        enrichThreadGroupBeforeCatalog: enrichThreadGroupBeforeCatalog,
        purgeLegacyTgFields: purgeLegacyTgFields,
        cleanCatalogTree: cleanCatalogTree,
        migrateTgListenersToSteps: migrateTgListenersToSteps,
        migrateStepListenersInTree: migrateStepListenersInTree
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_import_config_attach_v1.js ---- */
/**
 * JMX 导入 · 将带 parent_step_id 的 config_items 挂回父步骤（隔离模块）
 */
(function (global) {
    'use strict';

    function findStepById(steps, id) {
        var found = null;
        function walk(list) {
            (list || []).forEach(function (s) {
                if (found || !s) return;
                if (s.id === id) {
                    found = s;
                    return;
                }
                walk(s.children);
                walk(s.catalog_hash_children);
            });
        }
        walk(steps);
        return found;
    }

    function isHttpSamplerStep(step) {
        if (!step) return false;
        if (step.type === 'catalog_element' && step.alias === 'HTTPSamplerProxy') return true;
        if (!step.type && (step.method || step.path != null || step.body != null)) return true;
        return false;
    }

    function attachNestedConfigItems(tg, configItemToCatalog) {
        if (!tg || !Array.isArray(tg.config_items) || !tg.config_items.length) return;
        if (typeof configItemToCatalog !== 'function') return;

        var nested = [];
        var top = [];
        tg.config_items.forEach(function (item) {
            if (!item) return;
            if (item.parent_step_id) nested.push(item);
            else top.push(item);
        });
        if (!nested.length) {
            tg.config_items = top;
            return;
        }

        nested.sort(function (a, b) {
            return (a.import_order != null ? a.import_order : 0) - (b.import_order != null ? b.import_order : 0);
        });

        nested.forEach(function (item) {
            var parent = findStepById(tg.steps, item.parent_step_id);
            if (!parent) {
                top.push(item);
                return;
            }
            var cat = configItemToCatalog(item);
            if (!cat) return;
            if (item.import_order != null) cat.import_order = item.import_order;
            function insertByImportOrder(list, cat, order) {
                if (!Array.isArray(list)) list = [];
                if (order == null) {
                    list.push(cat);
                    return list;
                }
                var idx = list.length;
                for (var i = 0; i < list.length; i++) {
                    var o = list[i] && list[i].import_order;
                    if (o != null && order < o) { idx = i; break; }
                }
                list.splice(idx, 0, cat);
                return list;
            }
            if (isHttpSamplerStep(parent)) {
                parent.catalog_hash_children = insertByImportOrder(parent.catalog_hash_children, cat, item.import_order);
            } else {
                parent.children = insertByImportOrder(parent.children, cat, item.import_order);
            }
        });

        tg.config_items = top;
    }

    global.JmsJmxImportConfigAttachV1 = {
        attachNestedConfigItems: attachNestedConfigItems,
        findStepById: findStepById,
        isHttpSamplerStep: isHttpSamplerStep
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_jmx_import_catalog_bridge.js ---- */
/**
 * JMX 导入/导出 · scenario 数据 catalog 化（独立模块，包装 JmxImportParser 不修改其核心）
 */
(function (global) {
    'use strict';

    function scenarioToModel(scenario) {
        if (!scenario || typeof scenario !== 'object') return null;
        return {
            base_url: scenario.base_url,
            env: scenario.env,
            build: scenario.build,
            serialize_threadgroups: scenario.serialize_threadgroups,
            execution_mode: scenario.execution_mode,
            default_headers: scenario.default_headers,
            influxdb: scenario.influxdb,
            test_plans: [{
                name: scenario.name || 'API Scenario',
                thread_groups: JSON.parse(JSON.stringify(scenario.thread_groups || []))
            }],
            setup_thread_groups: JSON.parse(JSON.stringify(scenario.setup_thread_groups || [])),
            post_thread_groups: JSON.parse(JSON.stringify(scenario.post_thread_groups || [])),
            plan_catalog_items: JSON.parse(JSON.stringify(scenario.plan_catalog_items || []))
        };
    }

    function purgeTgLegacy(tg) {
        if (!tg || typeof tg !== 'object') return;
        delete tg.listeners;
        delete tg.view_results_tree;
        delete tg.aggregate_report;
        delete tg.backend_listener;
        delete tg.http_managers;
        delete tg.config_items;
        delete tg._config_timeline_active;
        delete tg._removed_config_types;
    }

    function applyModelToScenario(scenario, model) {
        if (!scenario || !model) return scenario;
        var plan = (model.test_plans || [])[0];
        if (plan && Array.isArray(plan.thread_groups)) {
            scenario.thread_groups = plan.thread_groups;
        }
        scenario.setup_thread_groups = model.setup_thread_groups || [];
        scenario.post_thread_groups = model.post_thread_groups || [];
        if (Array.isArray(model.plan_catalog_items)) {
            scenario.plan_catalog_items = model.plan_catalog_items;
        }
        (scenario.thread_groups || []).forEach(purgeTgLegacy);
        (scenario.setup_thread_groups || []).forEach(purgeTgLegacy);
        (scenario.post_thread_groups || []).forEach(purgeTgLegacy);
        delete scenario.plan_listeners;
        return scenario;
    }

    function prepareScenario(scenario) {
        if (!scenario || typeof scenario !== 'object') return scenario;
        var N = global.JmsScenarioNormalize;
        if (N && typeof N.normalizeScenarioData === 'function') {
            return N.normalizeScenarioData(scenario, { force: true });
        }
        var M = global.JmsCatalogUnifyMigrate;
        if (!M || typeof M.migrateModel !== 'function') return scenario;
        var model = scenarioToModel(scenario);
        if (!model) return scenario;
        M.migrateModel(model);
        return applyModelToScenario(scenario, model);
    }

    function prepareScenarioData(data) {
        return prepareScenario(data);
    }

    function wrapParserExports() {
        var P = global.JmxImportParser;
        if (!P || P.__catalogBridgeWrapped) return;
        var origParse = P.parseJmxXml;
        var origYaml = P.scenarioToYaml;
        if (typeof origParse === 'function') {
            P.parseJmxXml = function (xml, opts) {
                return prepareScenario(origParse.call(P, xml, opts));
            };
        }
        if (typeof origYaml === 'function') {
            P.scenarioToYaml = function (scenario) {
                return origYaml.call(P, prepareScenario(scenario));
            };
        }
        P.__catalogBridgeWrapped = true;
    }

    function init() {
        wrapParserExports();
    }

    global.JmsJmxImportCatalogBridge = {
        prepareScenario: prepareScenario,
        prepareScenarioData: prepareScenarioData,
        scenarioToModel: scenarioToModel,
        applyModelToScenario: applyModelToScenario,
        wrapParserExports: wrapParserExports,
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
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_scenario_normalize.js ---- */
/**
 * 场景归一化 · 唯一入口（打开 YAML / JMX / 粘贴 时转 catalog，日常不再重复 migrate）
 */
(function (global) {
    'use strict';

    var MARK = '__catalog_normalized_v';

    function isNormalized(model) {
        return !!(model && model[MARK] === 1);
    }

    function markNormalized(model) {
        if (model) model[MARK] = 1;
        return model;
    }

    function clearNormalized(model) {
        if (model) delete model[MARK];
        return model;
    }

    function normalizeModel(model, opts) {
        opts = opts || {};
        if (!model) return model;
        if (!opts.force && isNormalized(model)) return model;

        if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.migrateLegacyToCatalog === 'function') {
            global.JmsPlanCatalogResolve.migrateLegacyToCatalog(model);
        }
        if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.migrateLegacySceneToCatalog === 'function') {
            global.JmsPlanCatalogResolve.migrateLegacySceneToCatalog(model);
        }

        var M = global.JmsCatalogUnifyMigrate;
        if (M && typeof M.migrateModel === 'function') {
            M.migrateModel(model);
        }

        if (global.JmsMountCatalogBridge && typeof global.JmsMountCatalogBridge.migrateModelMountHosts === 'function') {
            global.JmsMountCatalogBridge.migrateModelMountHosts(model);
        }
        if (global.JmsTgListenerCatalogBridge && typeof global.JmsTgListenerCatalogBridge.syncAllThreadGroups === 'function') {
            global.JmsTgListenerCatalogBridge.syncAllThreadGroups(model);
        }

        return markNormalized(model);
    }

    function normalizeScenarioData(scenario, opts) {
        if (!scenario || typeof scenario !== 'object') return scenario;
        var B = global.JmsJmxImportCatalogBridge;
        var model = B && typeof B.scenarioToModel === 'function' ? B.scenarioToModel(scenario) : null;
        if (!model) return scenario;
        normalizeModel(model, opts || { force: true });
        if (B && typeof B.applyModelToScenario === 'function') {
            return B.applyModelToScenario(scenario, model);
        }
        return scenario;
    }

    global.JmsScenarioNormalize = {
        normalizeModel: normalizeModel,
        normalizeScenarioData: normalizeScenarioData,
        isNormalized: isNormalized,
        markNormalized: markNormalized,
        clearNormalized: clearNormalized
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_import_json_assert_props_normalize_v1.js ---- */
/**
 * JMX 导入 · JSONPathAssertion catalog_props 格式归一化（隔离模块）
 * 解析器 legacy 字段名与 catalog 编辑器字段名不一致时做双向映射。
 */
(function (global) {
    'use strict';

    function toEditorProps(props) {
        if (!props || typeof props !== 'object') {
            return {
                comments: '',
                json_path: '',
                expected_value: '',
                validate_json: false,
                is_regex: false,
                expect_null: false,
                invert: false
            };
        }
        var out = Object.assign({}, props);
        if (!out.json_path && out.value != null) out.json_path = String(out.value);
        if (out.expected_value == null || out.expected_value === '') {
            if (out.expected != null && out.expected !== '') out.expected_value = String(out.expected);
        }
        if (out.validate_json === undefined) {
            out.validate_json = !!(out.additionally_assert_value || out.validate);
        }
        out.is_regex = !!out.is_regex;
        out.expect_null = !!out.expect_null;
        out.invert = !!out.invert;
        delete out.type;
        delete out.expected;
        delete out.value;
        delete out.validate;
        delete out.additionally_assert_value;
        return out;
    }

    function toLegacyProps(props) {
        if (!props || typeof props !== 'object') return props;
        var out = Object.assign({}, props);
        var jsonPath = out.json_path != null ? String(out.json_path) : (out.value != null ? String(out.value) : '');
        var expected = out.expected_value != null ? String(out.expected_value)
            : (out.expected != null ? String(out.expected) : '');
        var additionally = out.validate_json !== undefined
            ? !!out.validate_json
            : !!(out.additionally_assert_value || out.validate);
        return {
            comments: out.comments || '',
            json_path: jsonPath,
            expected: expected,
            additionally_assert_value: additionally,
            is_regex: !!out.is_regex,
            expect_null: !!out.expect_null,
            invert: !!out.invert
        };
    }

    function normalizeJsonAssertProps(props) {
        return toEditorProps(props);
    }

    function isJsonAssertStep(step) {
        return !!(step && step.type === 'catalog_element' && step.alias === 'JSONPathAssertion');
    }

    function normalizeCatalogElementStep(step) {
        if (!isJsonAssertStep(step)) return step;
        step.catalog_props = normalizeJsonAssertProps(step.catalog_props);
        return step;
    }

    function normalizeHashChildren(list) {
        if (!Array.isArray(list)) return list;
        list.forEach(function (child) {
            if (!child) return;
            normalizeCatalogElementStep(child);
            if (Array.isArray(child.catalog_hash_children)) normalizeHashChildren(child.catalog_hash_children);
        });
        return list;
    }

    function normalizeSamplerHostStep(step) {
        if (!step || typeof step !== 'object') return step;
        if (Array.isArray(step.catalog_hash_children)) normalizeHashChildren(step.catalog_hash_children);
        return step;
    }

    global.JmsJmxImportJsonAssertPropsNormalizeV1 = {
        toEditorProps: toEditorProps,
        toLegacyProps: toLegacyProps,
        normalizeJsonAssertProps: normalizeJsonAssertProps,
        normalizeCatalogElementStep: normalizeCatalogElementStep,
        normalizeHashChildren: normalizeHashChildren,
        normalizeSamplerHostStep: normalizeSamplerHostStep
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_jmx_import_header_props_normalize_v1.js ---- */
/**
 * JMX 导入 · HeaderManager catalog_props.headers 格式归一化（隔离模块）
 * 解析器产出 object，编辑器需要 [{ key, value }] 数组。
 */
(function (global) {
    'use strict';

    function normalizeHeaderProps(props) {
        if (!props || typeof props !== 'object') return props;
        var out = Object.assign({}, props);
        if (out.headers == null) return out;
        var C = global.JmsTgConfigCatalog;
        if (C && typeof C.normalizeHeaders === 'function') {
            out.headers = C.normalizeHeaders(out.headers);
            return out;
        }
        if (Array.isArray(out.headers)) {
            out.headers = out.headers.map(function (r) {
                if (!r || typeof r !== 'object') return null;
                var k = String(r.key || r.name || '').trim();
                if (!k) return null;
                return { key: k, name: k, value: r.value == null ? '' : String(r.value) };
            }).filter(Boolean);
            return out;
        }
        if (typeof out.headers === 'object') {
            out.headers = Object.keys(out.headers).map(function (k) {
                return {
                    key: k,
                    name: k,
                    value: out.headers[k] == null ? '' : String(out.headers[k])
                };
            });
        } else {
            out.headers = [];
        }
        return out;
    }

    function normalizeConfigCatalogProps(props, cfgType) {
        if (!props || cfgType !== 'header_manager') return props;
        return normalizeHeaderProps(props);
    }

    function isHeaderManagerStep(step) {
        return !!(step && step.type === 'catalog_element' && step.alias === 'HeaderManager');
    }

    function normalizeCatalogElementStep(step) {
        if (!isHeaderManagerStep(step)) return step;
        if (!step.catalog_props || typeof step.catalog_props !== 'object') {
            step.catalog_props = { comments: '', headers: [] };
            return step;
        }
        step.catalog_props = normalizeHeaderProps(step.catalog_props);
        return step;
    }

    function normalizeHashChildren(list) {
        if (!Array.isArray(list)) return list;
        list.forEach(function (child) {
            if (!child) return;
            normalizeCatalogElementStep(child);
            if (Array.isArray(child.catalog_hash_children)) normalizeHashChildren(child.catalog_hash_children);
        });
        return list;
    }

    function normalizeSamplerHostStep(step) {
        if (!step || typeof step !== 'object') return step;
        if (Array.isArray(step.catalog_hash_children)) normalizeHashChildren(step.catalog_hash_children);
        return step;
    }

    global.JmsJmxImportHeaderPropsNormalizeV1 = {
        normalizeHeaderProps: normalizeHeaderProps,
        normalizeConfigCatalogProps: normalizeConfigCatalogProps,
        normalizeCatalogElementStep: normalizeCatalogElementStep,
        normalizeHashChildren: normalizeHashChildren,
        normalizeSamplerHostStep: normalizeSamplerHostStep
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_jmx_import_sampler_hash_timeline_v1.js ---- */
/**
 * JMX 导入 · HTTP 取样器 hashTree 子元件按时间线写入 catalog_hash_children（隔离模块）
 */
(function (global) {
    'use strict';

    var PROC_MAP = {
        json_post: { alias: 'JSONPostProcessor', testclass: 'JSONPostProcessor', guiclass: 'JSONPostProcessorGui', category: 'postprocessor', label_zh: 'JSON 提取器' },
        regex_extract: { alias: 'RegexExtractor', testclass: 'RegexExtractor', guiclass: 'RegexExtractorGui', category: 'postprocessor', label_zh: '正则表达式提取器' },
        xpath_extract: { alias: 'XPathExtractor', testclass: 'XPathExtractor', guiclass: 'XPathExtractorGui', category: 'postprocessor', label_zh: 'XPath 提取器' },
        jdbc_post: { alias: 'JDBCPostProcessor', testclass: 'JDBCPostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', label_zh: 'JDBC 后置处理器' },
        jsr223_post: { alias: 'JSR223PostProcessor', testclass: 'JSR223PostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', label_zh: 'JSR223 后置处理器' },
        beanshell_post: { alias: 'BeanShellPostProcessor', testclass: 'BeanShellPostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', label_zh: 'BeanShell 后置处理器' }
    };

    var PRE_MAP = {
        beanshell_pre: { alias: 'BeanShellPreProcessor', testclass: 'BeanShellPreProcessor', guiclass: 'TestBeanGUI', category: 'preprocessor', label_zh: 'BeanShell 前置处理器' }
    };

    var ASSERT_MAP = {
        response: { alias: 'ResponseAssertion', testclass: 'ResponseAssertion', guiclass: 'AssertionGui', category: 'assertion', label_zh: '响应断言' },
        response_assert: { alias: 'ResponseAssertion', testclass: 'ResponseAssertion', guiclass: 'AssertionGui', category: 'assertion', label_zh: '响应断言' },
        json: { alias: 'JSONPathAssertion', testclass: 'JSONPathAssertion', guiclass: 'JSONPathAssertionGui', category: 'assertion', label_zh: 'JSON 断言' },
        json_assert: { alias: 'JSONPathAssertion', testclass: 'JSONPathAssertion', guiclass: 'JSONPathAssertionGui', category: 'assertion', label_zh: 'JSON 断言' },
        size: { alias: 'SizeAssertion', testclass: 'SizeAssertion', guiclass: 'SizeAssertionGui', category: 'assertion', label_zh: '大小断言' },
        size_assert: { alias: 'SizeAssertion', testclass: 'SizeAssertion', guiclass: 'SizeAssertionGui', category: 'assertion', label_zh: '大小断言' },
        md5hex: { alias: 'MD5HexAssertion', testclass: 'MD5HexAssertion', guiclass: 'MD5HexAssertionGui', category: 'assertion', label_zh: 'MD5Hex 断言' },
        md5hex_assert: { alias: 'MD5HexAssertion', testclass: 'MD5HexAssertion', guiclass: 'MD5HexAssertionGui', category: 'assertion', label_zh: 'MD5Hex 断言' },
        jsr223_assert: { alias: 'JSR223Assertion', testclass: 'JSR223Assertion', guiclass: 'TestBeanGUI', category: 'assertion', label_zh: 'JSR223 断言' }
    };

    function uid(prefix) {
        return (prefix || 'cat_') + Math.random().toString(36).slice(2, 10);
    }

    function elementChildren(el) {
        var out = [];
        var ch = (el && el.childNodes) || [];
        for (var i = 0; i < ch.length; i++) {
            if (ch[i].nodeType === 1) out.push(ch[i]);
        }
        return out;
    }

    function pairedWalk(tree, visitor) {
        var kids = elementChildren(tree);
        for (var i = 0; i < kids.length; i++) {
            var node = kids[i];
            if (node.tagName === 'hashTree') continue;
            var sub = (kids[i + 1] && kids[i + 1].tagName === 'hashTree') ? kids[i + 1] : null;
            visitor(node, sub);
            if (sub) i++;
        }
    }

    function buildCatalog(map, name, props, enabled) {
        return {
            id: uid('cat_'),
            type: 'catalog_element',
            name: name || map.label_zh || map.alias,
            enabled: enabled !== false,
            alias: map.alias,
            testclass: map.testclass || map.alias,
            guiclass: map.guiclass || (map.alias + 'Gui'),
            category: map.category || 'other',
            label_zh: map.label_zh || map.alias,
            container: false,
            scope: 'unified',
            catalog_props: props && typeof props === 'object' ? Object.assign({}, props) : {},
            jmx_fragment: ''
        };
    }

    function legacyToCatalog(mapTable, raw, fallbackName) {
        if (!raw || !raw.type) return null;
        var map = mapTable[raw.type];
        if (!map) return null;
        var props = Object.assign({}, raw);
        delete props.type;
        delete props.id;
        return buildCatalog(map, raw.name || fallbackName || map.label_zh, props, raw.enabled !== false);
    }

    function configNodeToCatalog(node, gui, helpers) {
        var CC = global.JmsJmxImportControllerConfigStepV1;
        if (CC && typeof CC.buildStep === 'function' && helpers) {
            return CC.buildStep(node, gui, helpers);
        }
        return null;
    }

    function parseAssertionNode(node, helpers) {
        if (!node || !helpers || !helpers.isEnabled(node)) return null;
        var tc = node.getAttribute('testclass') || '';
        if (tc === 'JSONPathAssertion' && global.JmsHttpJsonAssertionJmx &&
            typeof global.JmsHttpJsonAssertionJmx.parseElement === 'function') {
            return global.JmsHttpJsonAssertionJmx.parseElement(node);
        }
        if (tc === 'ResponseAssertion' && global.JmsHttpResponseAssertionJmx &&
            typeof global.JmsHttpResponseAssertionJmx.parseElement === 'function') {
            return global.JmsHttpResponseAssertionJmx.parseElement(node);
        }
        if (tc === 'SizeAssertion' && global.JmsHttpSizeAssertionJmx &&
            typeof global.JmsHttpSizeAssertionJmx.parseElement === 'function') {
            return global.JmsHttpSizeAssertionJmx.parseElement(node);
        }
        if (tc === 'MD5HexAssertion' && global.JmsHttpMd5hexAssertionJmx &&
            typeof global.JmsHttpMd5hexAssertionJmx.parseElement === 'function') {
            return global.JmsHttpMd5hexAssertionJmx.parseElement(node);
        }
        if (tc === 'JSR223Assertion' && global.JmxJsr223Assertion &&
            typeof global.JmxJsr223Assertion.parseElement === 'function') {
            return global.JmxJsr223Assertion.parseElement(node);
        }
        if (tc === 'JSONPathAssertion') {
            return {
                type: 'json',
                name: node.getAttribute('testname') || 'JSON 断言',
                enabled: true,
                value: helpers.getStringProp(node, 'JSON_PATH'),
                expected: helpers.getStringProp(node, 'EXPECTED_VALUE'),
                validate: helpers.getBoolProp(node, 'JSONVALIDATION', false),
                expect_null: helpers.getBoolProp(node, 'EXPECT_NULL', false),
                invert: helpers.getBoolProp(node, 'INVERT', false),
                is_regex: helpers.getBoolProp(node, 'ISREGEX', false)
            };
        }
        return null;
    }

    function parseProcessorNode(node, helpers) {
        if (!node || !helpers || !helpers.isEnabled(node)) return null;
        var tc = node.getAttribute('testclass') || '';
        if (tc === 'JSONPostProcessor' && global.JmxJsonPostProcessor &&
            typeof global.JmxJsonPostProcessor.parseElement === 'function') {
            return global.JmxJsonPostProcessor.parseElement(node);
        }
        if (tc === 'JSONPostProcessor' && helpers.getStringProp) {
            var varName = helpers.getStringProp(node, 'JSONPostProcessor.referenceNames');
            var jsonPath = helpers.getStringProp(node, 'JSONPostProcessor.jsonPathExprs');
            if (varName && jsonPath) {
                return {
                    type: 'json_post',
                    name: node.getAttribute('testname') || 'JSON PostProcessor',
                    enabled: true,
                    var: varName,
                    json_path: jsonPath,
                    match_numbers: helpers.getStringProp(node, 'JSONPostProcessor.match_numbers') || '0',
                    default_value: helpers.getStringProp(node, 'JSONPostProcessor.defaultValues') || ''
                };
            }
        }
        if (tc === 'RegexExtractor' && global.JmxRegexExtractor &&
            typeof global.JmxRegexExtractor.parseElement === 'function') {
            return global.JmxRegexExtractor.parseElement(node);
        }
        if (tc === 'XPathExtractor' && global.JmxXPathExtractor &&
            typeof global.JmxXPathExtractor.parseElement === 'function') {
            return global.JmxXPathExtractor.parseElement(node);
        }
        if (tc === 'JSR223PostProcessor' && global.JmxJsr223PostProcessor &&
            typeof global.JmxJsr223PostProcessor.parseElement === 'function') {
            return global.JmxJsr223PostProcessor.parseElement(node);
        }
        if (tc === 'JDBCPostProcessor' && global.JmxJdbcPostProcessor &&
            typeof global.JmxJdbcPostProcessor.parseElement === 'function') {
            return global.JmxJdbcPostProcessor.parseElement(node);
        }
        if (tc === 'BeanShellPostProcessor' && helpers.parseBeanShell) {
            return helpers.parseBeanShell(node);
        }
        return null;
    }

    function parsePreProcessorNode(node, helpers) {
        if (!node || !helpers || !helpers.isEnabled(node)) return null;
        var tc = node.getAttribute('testclass') || '';
        if (tc === 'BeanShellPreProcessor' && global.JmsHttpBeanshellPreProcessorJmx &&
            typeof global.JmsHttpBeanshellPreProcessorJmx.parseElement === 'function') {
            return global.JmsHttpBeanshellPreProcessorJmx.parseElement(node);
        }
        return null;
    }

    function hashChildFromNode(node, gui, helpers) {
        if (!node || !helpers) return null;
        var tc = node.getAttribute('testclass') || node.tagName;
        if (helpers.configTypeFromNode && helpers.configTypeFromNode(node, gui)) {
            return configNodeToCatalog(node, gui, helpers);
        }
        var assertion = parseAssertionNode(node, helpers);
        if (assertion) return legacyToCatalog(ASSERT_MAP, assertion, node.getAttribute('testname'));
        var proc = parseProcessorNode(node, helpers);
        if (proc) return legacyToCatalog(PROC_MAP, proc, node.getAttribute('testname'));
        var pre = parsePreProcessorNode(node, helpers);
        if (pre) return legacyToCatalog(PRE_MAP, pre, node.getAttribute('testname'));
        return null;
    }

    function stripLegacyMountFields(step) {
        if (!step || typeof step !== 'object') return;
        delete step.assertions;
        delete step.processors;
        delete step.pre_processors;
        delete step.extractors;
        delete step.extract;
        delete step.http_managers;
        delete step.step_listeners;
        if (step.catalog_props && typeof step.catalog_props === 'object') {
            delete step.catalog_props.assertions;
            delete step.catalog_props.processors;
            delete step.catalog_props.pre_processors;
            delete step.catalog_props.extractors;
            delete step.catalog_props.extract;
            delete step.catalog_props.http_managers;
        }
    }

    function isSamplerHost(step) {
        if (!step) return false;
        if (!step.type && (step.method || step.path != null)) return true;
        return step.type === 'catalog_element' && step.alias === 'HTTPSamplerProxy';
    }

    function applyHashTimeline(subTree, step, helpers) {
        if (!subTree || !step || !helpers) return;
        if (!Array.isArray(step.catalog_hash_children)) step.catalog_hash_children = [];
        pairedWalk(subTree, function (node, sub) {
            var gui = node.getAttribute('guiclass') || '';
            var child = hashChildFromNode(node, gui, helpers);
            if (child) step.catalog_hash_children.push(child);
            if (sub && ((node.getAttribute('testclass') || '') === 'GenericController')) {
                pairedWalk(sub, function (nestedNode, nestedSub) {
                    var ng = nestedNode.getAttribute('guiclass') || '';
                    var nestedChild = hashChildFromNode(nestedNode, ng, helpers);
                    if (nestedChild) step.catalog_hash_children.push(nestedChild);
                });
            }
        });
        stripLegacyMountFields(step);
    }

    function mergeUniqueHashChildren(step, extra) {
        if (!step || !extra || !extra.length) return;
        if (!Array.isArray(step.catalog_hash_children)) step.catalog_hash_children = [];
        extra.forEach(function (item) {
            if (!item) return;
            var dup = step.catalog_hash_children.some(function (ex) {
                return ex && ex.alias === item.alias && ex.name === item.name;
            });
            if (!dup) step.catalog_hash_children.push(item);
        });
    }

    function migrateCatalogPropsMountsToHash(step) {
        if (!isSamplerHost(step)) return;
        var props = step.catalog_props || {};
        var extras = [];
        (props.assertions || step.assertions || []).forEach(function (a) {
            var cat = legacyToCatalog(ASSERT_MAP, a, a && a.name);
            if (cat) extras.push(cat);
        });
        (props.processors || step.processors || []).forEach(function (p) {
            var cat = legacyToCatalog(PROC_MAP, p, p && p.name);
            if (cat) extras.push(cat);
        });
        (props.pre_processors || step.pre_processors || []).forEach(function (p) {
            var cat = legacyToCatalog(PRE_MAP, p, p && p.name);
            if (cat) extras.push(cat);
        });
        mergeUniqueHashChildren(step, extras);
        stripLegacyMountFields(step);
    }

    function migrateTree(steps) {
        (steps || []).forEach(function (step) {
            if (!step) return;
            migrateCatalogPropsMountsToHash(step);
            if (Array.isArray(step.children)) migrateTree(step.children);
        });
    }

    function migrateThreadGroup(tg) {
        if (!tg || !Array.isArray(tg.steps)) return;
        migrateTree(tg.steps);
    }

    global.JmsJmxImportSamplerHashTimelineV1 = {
        applyHashTimeline: applyHashTimeline,
        migrateCatalogPropsMountsToHash: migrateCatalogPropsMountsToHash,
        migrateTree: migrateTree,
        migrateThreadGroup: migrateThreadGroup,
        stripLegacyMountFields: stripLegacyMountFields
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_jmx_import_controller_config_step_v1.js ---- */
/**
 * JMX 导入 · 逻辑控制器内配置元件直接写入 children 时间线（隔离模块）
 */
(function (global) {
    'use strict';

    var TYPE_MAP = {
        http_defaults: { alias: 'ConfigTestElement', testclass: 'ConfigTestElement', guiclass: 'HttpDefaultsGui', category: 'config', label_zh: 'HTTP 请求默认值' },
        header_manager: { alias: 'HeaderManager', testclass: 'HeaderManager', guiclass: 'HeaderPanel', category: 'config', label_zh: 'HTTP 信息头管理器' },
        auth_manager: { alias: 'AuthManager', testclass: 'AuthManager', guiclass: 'AuthPanel', category: 'config', label_zh: 'HTTP 授权管理器' },
        cookie_manager: { alias: 'CookieManager', testclass: 'CookieManager', guiclass: 'CookiePanel', category: 'config', label_zh: 'HTTP Cookie 管理器' },
        cache_manager: { alias: 'CacheManager', testclass: 'CacheManager', guiclass: 'CachePanel', category: 'config', label_zh: 'HTTP 缓存管理器' },
        csv_data_set: { alias: 'CSVDataSet', testclass: 'CSVDataSet', guiclass: 'TestBeanGUI', category: 'config', label_zh: 'CSV 数据文件设置' },
        counter: { alias: 'CounterConfig', testclass: 'CounterConfig', guiclass: 'CounterConfigGui', category: 'config', label_zh: '计数器' }
    };

    function isEnabled(node) {
        return node.getAttribute('enabled') !== 'false';
    }

    function buildCatalogProps(node, gui, cfgType, P) {
        if (!P || typeof P.buildConfigItemFromNode !== 'function') return null;
        var raw = P.buildConfigItemFromNode(node, gui);
        if (!raw || !raw.data) return null;
        return Object.assign({}, raw.data);
    }

    function buildStep(node, gui, parserApi) {
        if (!node || !parserApi || typeof parserApi.configTypeFromNode !== 'function') return null;
        var cfgType = parserApi.configTypeFromNode(node, gui);
        if (!cfgType || !TYPE_MAP[cfgType]) return null;
        var map = TYPE_MAP[cfgType];
        var props = buildCatalogProps(node, gui, cfgType, parserApi);
        if (!props) props = { name: node.getAttribute('testname') || map.label_zh };
        var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
        if (HN && typeof HN.normalizeConfigCatalogProps === 'function') {
            props = HN.normalizeConfigCatalogProps(props, cfgType);
        }
        var name = (props.name || node.getAttribute('testname') || map.label_zh).trim();
        return {
            type: 'catalog_element',
            name: name,
            enabled: isEnabled(node),
            alias: map.alias,
            testclass: map.testclass,
            guiclass: map.guiclass,
            category: map.category,
            label_zh: map.label_zh,
            container: false,
            scope: 'unified',
            catalog_props: props,
            jmx_fragment: ''
        };
    }

    global.JmsJmxImportControllerConfigStepV1 = {
        buildStep: buildStep,
        TYPE_MAP: TYPE_MAP
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_jmx_import_listener_step_v1.js ---- */
/**
 * JMX 导入 · 线程组级监听器按时间线写入 steps（隔离模块，不影响导出）
 */
(function (global) {
    'use strict';

    var LISTENER_MAP = {
        ViewResultsFullVisualizer: {
            alias: 'ViewResultsFullVisualizer',
            testclass: 'ResultCollector',
            guiclass: 'ViewResultsFullVisualizer',
            category: 'listener',
            label_zh: '查看结果树'
        },
        StatVisualizer: {
            alias: 'StatVisualizer',
            testclass: 'ResultCollector',
            guiclass: 'StatVisualizer',
            category: 'listener',
            label_zh: '聚合报告'
        },
        BackendListenerGui: {
            alias: 'BackendListener',
            testclass: 'BackendListener',
            guiclass: 'BackendListenerGui',
            category: 'listener',
            label_zh: '后端监听器'
        },
        MailerVisualizer: {
            alias: 'MailerResultCollector',
            testclass: 'MailerResultCollector',
            guiclass: 'MailerVisualizer',
            category: 'listener',
            label_zh: '邮件观察仪'
        }
    };

    function isEnabled(node) {
        return node.getAttribute('enabled') !== 'false';
    }

    function getStringProp(node, name) {
        if (!node) return '';
        var el = node.querySelector('stringProp[name="' + name + '"]');
        return el && el.textContent != null ? String(el.textContent) : '';
    }

    function getBoolProp(node, name, fallback) {
        if (!node) return !!fallback;
        var el = node.querySelector('boolProp[name="' + name + '"]');
        if (!el || el.textContent == null || el.textContent === '') return !!fallback;
        return String(el.textContent).toLowerCase() === 'true';
    }

    function buildCatalogProps(node, gui, tc) {
        if (tc === 'BackendListener') {
            if (global.JmsBackendListenerJmx && typeof global.JmsBackendListenerJmx.parseBackendListenerEl === 'function') {
                return global.JmsBackendListenerJmx.parseBackendListenerEl(node) || {};
            }
            return { name: node.getAttribute('testname') || '后端监听器' };
        }
        if (tc === 'ResultCollector' && gui === 'ViewResultsFullVisualizer') {
            if (global.JmsTgViewResultsTreeJmx && typeof global.JmsTgViewResultsTreeJmx.parseFromJmxNode === 'function') {
                return global.JmsTgViewResultsTreeJmx.parseFromJmxNode(node) || {};
            }
        }
        if (tc === 'ResultCollector' && gui === 'StatVisualizer') {
            if (global.JmsTgAggregateReportJmx && typeof global.JmsTgAggregateReportJmx.parseFromJmxNode === 'function') {
                return global.JmsTgAggregateReportJmx.parseFromJmxNode(node) || {};
            }
        }
        if (tc === 'MailerResultCollector') {
            return {
                name: node.getAttribute('testname') || '邮件观察仪',
                subject: getStringProp(node, 'MailerModel.subject') || getStringProp(node, 'MailerResultCollector.subject'),
                from: getStringProp(node, 'MailerModel.fromAddress') || getStringProp(node, 'MailerResultCollector.fromAddress'),
                success_limit: getStringProp(node, 'MailerModel.successLimit') || getStringProp(node, 'MailerResultCollector.successLimit'),
                failure_limit: getStringProp(node, 'MailerModel.failureLimit') || getStringProp(node, 'MailerResultCollector.failureLimit'),
                failure_only: getBoolProp(node, 'MailerModel.failureOnly', false)
            };
        }
        return { name: node.getAttribute('testname') || '' };
    }

    function buildStep(node) {
        if (!node) return null;
        var tc = node.getAttribute('testclass') || '';
        var gui = node.getAttribute('guiclass') || '';
        var map = LISTENER_MAP[gui] || (tc === 'BackendListener' ? LISTENER_MAP.BackendListenerGui : null);
        if (!map && tc === 'MailerResultCollector') map = LISTENER_MAP.MailerVisualizer;
        if (!map) return null;
        var props = buildCatalogProps(node, gui, tc);
        var name = (props && props.name) || node.getAttribute('testname') || map.label_zh;
        return {
            type: 'catalog_element',
            name: name,
            enabled: isEnabled(node),
            alias: map.alias,
            testclass: map.testclass,
            guiclass: map.guiclass,
            category: map.category,
            label_zh: map.label_zh,
            container: false,
            scope: 'unified',
            catalog_props: props || {},
            jmx_fragment: ''
        };
    }

    global.JmsJmxImportListenerStepV1 = {
        buildStep: buildStep,
        buildMailerStep: function (node) {
            if (!node || node.getAttribute('testclass') !== 'MailerResultCollector') return null;
            return buildStep(node);
        }
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jmx_import_parser.js ---- */
/**
 * JMeter JMX → TestHub 场景 YAML（增强版：递归控制器、SetupThreadGroup、BeanShell 等）
 */
(function (global) {
    'use strict';

    var MAX_BYTES = 2 * 1024 * 1024;

    function getStringProp(el, name) {
        if (!el) return '';
        var list = el.getElementsByTagName('stringProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) return (list[i].textContent || '').trim();
        }
        return '';
    }

    function getIntProp(el, name) {
        if (!el) return '';
        var tags = ['intProp', 'longProp', 'stringProp'];
        for (var t = 0; t < tags.length; t++) {
            var list = el.getElementsByTagName(tags[t]);
            for (var i = 0; i < list.length; i++) {
                if (list[i].getAttribute('name') === name) return (list[i].textContent || '').trim();
            }
        }
        return '';
    }

    function getProp(el, name, defaultVal) {
        var v = getStringProp(el, name);
        if (v !== '') return v;
        v = getIntProp(el, name);
        return v !== '' ? v : defaultVal;
    }

    function getBoolProp(el, name, defaultVal) {
        if (!el) return defaultVal;
        var list = el.getElementsByTagName('boolProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) {
                var t = (list[i].textContent || '').trim().toLowerCase();
                return t === 'true';
            }
        }
        return defaultVal;
    }

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function elementChildren(el) {
        var out = [];
        if (!el) return out;
        for (var i = 0; i < el.childNodes.length; i++) {
            var n = el.childNodes[i];
            if (n.nodeType === 1) out.push(n);
        }
        return out;
    }

    function pairedWalk(tree, visitor) {
        var kids = elementChildren(tree);
        for (var i = 0; i < kids.length; i++) {
            var node = kids[i];
            if (node.tagName === 'hashTree') continue;
            var sub = (kids[i + 1] && kids[i + 1].tagName === 'hashTree') ? kids[i + 1] : null;
            visitor(node, sub);
            if (sub) i++;
        }
    }

    function parseHeaderManager(el) {
        var headers = {};
        var coll = el.getElementsByTagName('elementProp');
        for (var i = 0; i < coll.length; i++) {
            var ep = coll[i];
            if (ep.getAttribute('elementType') !== 'Header') continue;
            var name = getStringProp(ep, 'Header.name');
            var val = getStringProp(ep, 'Header.value');
            if (name) headers[name] = val;
        }
        return headers;
    }

    function mergeHeaders(target, source) {
        if (!source) return target;
        Object.keys(source).forEach(function (k) {
            target[k] = source[k];
        });
        return target;
    }

    function parseHttpDefaults(el) {
        var result = {
            enabled: true,
            protocol: getProp(el, 'HTTPSampler.protocol', ''),
            domain: getProp(el, 'HTTPSampler.domain', ''),
            port: getProp(el, 'HTTPSampler.port', ''),
            path: getProp(el, 'HTTPSampler.path', ''),
            connect_timeout: getProp(el, 'HTTPSampler.connect_timeout', ''),
            response_timeout: getProp(el, 'HTTPSampler.response_timeout', ''),
            implementation: getProp(el, 'HTTPSampler.implementation', ''),
            content_encoding: getProp(el, 'HTTPSampler.contentEncoding', ''),
            follow_redirects: getBoolProp(el, 'HTTPSampler.follow_redirects', true),
            auto_redirects: getBoolProp(el, 'HTTPSampler.auto_redirects', false),
            use_keepalive: getBoolProp(el, 'HTTPSampler.use_keepalive', true),
            arg_mode: 'params',
            parameters: [],
            body_data: ''
        };
        if (global.JmsTgHttpDefaultsJmx && typeof global.JmsTgHttpDefaultsJmx.parseArguments === 'function') {
            var argsEl = el.querySelector('elementProp[name="HTTPsampler.Arguments"]');
            var postRaw = getBoolProp(el, 'HTTPSampler.postBodyRaw', false);
            var argPart = global.JmsTgHttpDefaultsJmx.parseArguments(argsEl, postRaw);
            result.arg_mode = argPart.arg_mode;
            result.parameters = argPart.parameters;
            result.body_data = argPart.body_data;
        }
        if (global.JmsTgHttpDefaultsAdvanced && typeof global.JmsTgHttpDefaultsAdvanced.parseFromEl === 'function') {
            Object.assign(result, global.JmsTgHttpDefaultsAdvanced.parseFromEl(el));
        }
        return result;
    }

    function parseThreadGroupLoad(el) {
        var loopVal = '';
        var main = el.getElementsByTagName('elementProp');
        for (var i = 0; i < main.length; i++) {
            if (main[i].getAttribute('name') === 'ThreadGroup.main_controller') {
                loopVal = getProp(main[i], 'LoopController.loops', '-1');
                break;
            }
        }
        if (loopVal === '') loopVal = getProp(el, 'LoopController.loops', '-1');
        var users = parseInt(getProp(el, 'ThreadGroup.num_threads', '1'), 10);
        var ramp = parseInt(getProp(el, 'ThreadGroup.ramp_time', '1'), 10);
        var duration = parseInt(getProp(el, 'ThreadGroup.duration', '60'), 10);
        return {
            users: Math.max(1, isNaN(users) ? 1 : users),
            spawn_rate: Math.max(1, isNaN(ramp) ? 1 : ramp),
            duration_sec: Math.max(1, isNaN(duration) ? 60 : duration),
            loops: loopVal === '' || loopVal === '-1' ? -1 : (parseInt(loopVal, 10) || -1)
        };
    }

    function parseTestPlanVariables(testPlan) {
        var vars = {};
        if (!testPlan) return vars;
        var args = testPlan.querySelector('elementProp[name="TestPlan.user_defined_variables"]');
        if (!args) return vars;
        var props = args.querySelectorAll('elementProp[elementType="Argument"]');
        for (var i = 0; i < props.length; i++) {
            var name = getStringProp(props[i], 'Argument.name');
            if (name) vars[name] = getStringProp(props[i], 'Argument.value');
        }
        return vars;
    }

    function objToCatalogKvList(obj) {
        var rows = [];
        Object.keys(obj || {}).forEach(function (k) {
            if (!k) return;
            rows.push({ name: k, key: k, value: obj[k] != null ? String(obj[k]) : '' });
        });
        return rows;
    }

    function pushPlanHeaderCatalogItem(planCatalogItems, hmObj, testname) {
        if (!Object.keys(hmObj || {}).length) return;
        planCatalogItems.push({
            type: 'catalog_element',
            id: 'pcat_imp_' + Math.random().toString(36).slice(2, 8),
            name: testname || '公共请求头',
            label_zh: testname || '公共请求头',
            enabled: true,
            alias: 'HeaderManager',
            testclass: 'HeaderManager',
            guiclass: 'HeaderPanel',
            category: 'config',
            container: false,
            scope: 'imported',
            catalog_props: { comments: '', headers: objToCatalogKvList(hmObj) }
        });
    }

    function pushPlanArgumentsCatalogItem(planCatalogItems, varsObj, testname) {
        if (!Object.keys(varsObj || {}).length) return;
        planCatalogItems.push({
            type: 'catalog_element',
            id: 'pcat_imp_' + Math.random().toString(36).slice(2, 8),
            name: testname || '计划变量',
            label_zh: testname || '计划变量',
            enabled: true,
            alias: 'Arguments',
            testclass: 'Arguments',
            guiclass: 'ArgumentsPanel',
            category: 'config',
            container: false,
            scope: 'imported',
            catalog_props: { comments: '', arguments: objToCatalogKvList(varsObj) }
        });
    }

    function parseArgumentsElement(node) {
        var vars = {};
        if (!node) return vars;
        var props = node.querySelectorAll('elementProp[elementType="Argument"]');
        for (var i = 0; i < props.length; i++) {
            var name = getStringProp(props[i], 'Argument.name');
            if (name) vars[name] = getStringProp(props[i], 'Argument.value');
        }
        return vars;
    }

    function inferBaseUrlFromVariables(variables, httpDefaults, firstStep) {
        if (variables && variables.BASE_URL) return String(variables.BASE_URL).replace(/\/$/, '');
        var protocol = (httpDefaults && httpDefaults.protocol) ||
            (firstStep && firstStep._protocol) || 'https';
        var domain = (httpDefaults && httpDefaults.domain) ||
            (firstStep && firstStep._domain) || '';
        if (!domain) return 'https://example.com';
        var port = httpDefaults && httpDefaults.port;
        var base = protocol + '://' + domain;
        if (port && port !== '80' && port !== '443') base += ':' + port;
        return base;
    }


    function _hostPrefixedImportPath(path) {
        return /^\/\/[^/?#]+/.test(String(path || ''));
    }

    function _collapsedHostImportPath(path) {
        return /^\/[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+\/?$/.test(String(path || ''));
    }

    function _restoreHostPrefixedImportPath(path) {
        path = String(path || '/');
        if (_hostPrefixedImportPath(path)) return path;
        if (!_collapsedHostImportPath(path)) return path;
        var m = path.match(/^\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        return m ? ('//' + m[1] + '/') : path;
    }

    function normalizeImportedPath(path, variables) {
        path = String(path || '/');
        var hostFn = global.JmsJmxPathHost && global.JmsJmxPathHost.isHostPrefixedPath;
        if (hostFn ? hostFn.call(global.JmsJmxPathHost, path) : _hostPrefixedImportPath(path)) {
            return path;
        }
        var base = variables && variables.BASE_URL ? String(variables.BASE_URL).replace(/\/$/, '') : '';
        if (base && path.indexOf(base) === 0) {
            path = path.slice(base.length) || '/';
        }
        path = path.replace(/^\$\{BASE_URL\}\/?/, '');
        path = path.replace(/^\$\{ORIGIN\}\/?/, '');
        if (hostFn ? hostFn.call(global.JmsJmxPathHost, path) : _hostPrefixedImportPath(path)) {
            return path;
        }
        path = path.replace(/^\/+/, '/');
        if (path.indexOf('://') > 0) {
            try {
                var u = path.match(/^(https?):\/\/[^/]+(\/.*)?$/);
                if (u) path = u[2] || '/';
            } catch (e) { /* ignore */ }
        }
        if (!path.startsWith('/')) path = '/' + path;
        return _restoreHostPrefixedImportPath(path);
    }

    function normalizeCsvFilename(filename) {
        filename = String(filename || '').trim();
        if (!filename) return '';
        var base = filename.replace(/\\/g, '/').split('/').pop();
        return 'data/' + base;
    }

    function parseBeanShell(node) {
        if (global.JmsTgBeanshellPostJmx && typeof global.JmsTgBeanshellPostJmx.parseElement === 'function') {
            var parsed = global.JmsTgBeanshellPostJmx.parseElement(node);
            if (parsed) return parsed;
        }
        return {
            type: 'beanshell_post',
            name: node.getAttribute('testname') || 'BeanShell PostProcessor',
            enabled: isEnabled(node),
            script: getStringProp(node, 'script') || ''
        };
    }


    function parseDebugSampler(node) {
        return {
            type: 'debug_sampler',
            name: node.getAttribute('testname') || 'Debug Sampler',
            enabled: isEnabled(node),
            display_jmeter_variables: getBoolProp(node, 'displayJMeterVariables', true),
            display_jmeter_properties: getBoolProp(node, 'displayJMeterProperties', false),
            display_system_properties: getBoolProp(node, 'displaySystemProperties', false),
            comments: getStringProp(node, 'TestPlan.comments') || ''
        };
    }

    function parseExtractors(samplerTree) {
        var extractors = [];
        if (!samplerTree) return extractors;
        pairedWalk(samplerTree, function (node) {
            if ((node.getAttribute('testclass') || '') !== 'JSONPostProcessor') return;
            if (!isEnabled(node)) return;
            var varName = getStringProp(node, 'JSONPostProcessor.referenceNames');
            var jsonPath = getStringProp(node, 'JSONPostProcessor.jsonPathExprs');
            if (varName && jsonPath) {
                extractors.push({ var: varName, json_path: jsonPath });
            }
        });
        return extractors;
    }

    function parseAssertions(samplerTree) {
        var assertions = [];
        if (!samplerTree) return assertions;
        pairedWalk(samplerTree, function (node) {
            var tc = node.getAttribute('testclass') || '';
            if (!isEnabled(node)) return;
            if (tc === 'ResponseAssertion') {
                if (global.JmsHttpResponseAssertionJmx &&
                    typeof global.JmsHttpResponseAssertionJmx.parseElement === 'function') {
                    var raFull = global.JmsHttpResponseAssertionJmx.parseElement(node);
                    if (raFull) {
                        assertions.push(raFull);
                        return;
                    }
                }
                if (global.JmxResponseAssertion && typeof global.JmxResponseAssertion.parseElement === 'function') {
                    var ra = global.JmxResponseAssertion.parseElement(node);
                    if (ra) assertions.push(ra);
                } else {
                    var code = getStringProp(node, 'Assertion.response_code');
                    if (code) assertions.push({ type: 'status', value: parseInt(code, 10) || 200 });
                }
            } else if (tc === 'DurationAssertion') {
                var dur = getStringProp(node, 'DurationAssertion.duration');
                if (dur) assertions.push({ type: 'duration', value: parseInt(dur, 10) || 3000 });
            } else if (tc === 'JSR223Assertion') {
                if (global.JmxJsr223Assertion && typeof global.JmxJsr223Assertion.parseElement === 'function') {
                    var jsrA = global.JmxJsr223Assertion.parseElement(node);
                    if (jsrA && jsrA.enabled !== false) assertions.push(jsrA);
                }
            } else if (tc === 'JSONPathAssertion') {
                if (global.JmsHttpJsonAssertionJmx &&
                    typeof global.JmsHttpJsonAssertionJmx.parseElement === 'function') {
                    var jaFull = global.JmsHttpJsonAssertionJmx.parseElement(node);
                    if (jaFull) {
                        assertions.push(jaFull);
                        return;
                    }
                }
                assertions.push({
                    type: 'json',
                    value: getStringProp(node, 'JSON_PATH'),
                    expected: getStringProp(node, 'EXPECTED_VALUE'),
                    validate: getBoolProp(node, 'JSONVALIDATION', false),
                    expect_null: getBoolProp(node, 'EXPECT_NULL', false),
                    invert: getBoolProp(node, 'INVERT', false),
                    is_regex: getBoolProp(node, 'ISREGEX', false)
                });
            } else if (tc === 'SizeAssertion') {
                if (global.JmsHttpSizeAssertionJmx &&
                    typeof global.JmsHttpSizeAssertionJmx.parseElement === 'function') {
                    var saFull = global.JmsHttpSizeAssertionJmx.parseElement(node);
                    if (saFull) {
                        assertions.push(saFull);
                        return;
                    }
                }
                var legacySize = getStringProp(node, 'SizeAssertion.size');
                if (legacySize) {
                    var opInt = parseInt(getStringProp(node, 'SizeAssertion.operator') || '1', 10);
                    var opMap = { 1: 'eq', 2: 'ne', 3: 'gt', 4: 'lt', 5: 'ge', 6: 'le' };
                    assertions.push({
                        type: 'size',
                        value: legacySize,
                        operator: opMap[opInt] || 'eq'
                    });
                }
            } else if (tc === 'MD5HexAssertion') {
                if (global.JmsHttpMd5hexAssertionJmx &&
                    typeof global.JmsHttpMd5hexAssertionJmx.parseElement === 'function') {
                    var m5Full = global.JmsHttpMd5hexAssertionJmx.parseElement(node);
                    if (m5Full) {
                        assertions.push(m5Full);
                    }
                }
            }
        });
        return assertions;
    }

    function parseTgLevelAssertionNode(node) {
        if (!node || !isEnabled(node)) return null;
        var tc = node.getAttribute('testclass') || '';
        if (tc === 'ResponseAssertion' && global.JmsHttpResponseAssertionJmx &&
            typeof global.JmsHttpResponseAssertionJmx.parseElement === 'function') {
            return global.JmsHttpResponseAssertionJmx.parseElement(node);
        }
        if (tc === 'JSONPathAssertion' && global.JmsHttpJsonAssertionJmx &&
            typeof global.JmsHttpJsonAssertionJmx.parseElement === 'function') {
            return global.JmsHttpJsonAssertionJmx.parseElement(node);
        }
        if (tc === 'SizeAssertion' && global.JmsHttpSizeAssertionJmx &&
            typeof global.JmsHttpSizeAssertionJmx.parseElement === 'function') {
            return global.JmsHttpSizeAssertionJmx.parseElement(node);
        }
        if (tc === 'MD5HexAssertion' && global.JmsHttpMd5hexAssertionJmx &&
            typeof global.JmsHttpMd5hexAssertionJmx.parseElement === 'function') {
            return global.JmsHttpMd5hexAssertionJmx.parseElement(node);
        }
        return null;
    }

    function parseTgLevelAssertions(tgTree) {
        var assertions = [];
        if (!tgTree || !tgTree.children) return assertions;
        var children = tgTree.children;
        for (var i = 0; i < children.length; i++) {
            var node = children[i];
            if (!node || node.tagName === 'hashTree') continue;
            var parsed = parseTgLevelAssertionNode(node);
            if (parsed) assertions.push(parsed);
        }
        if (global.JmsTgAssertResolver &&
            typeof global.JmsTgAssertResolver.sanitizeImportedTgAssertions === 'function') {
            return global.JmsTgAssertResolver.sanitizeImportedTgAssertions({ assertions: assertions }).assertions || [];
        }
        return assertions;
    }


    function parseSamplerPreProcessors(samplerTree) {
        var preProcessors = [];
        var userParams = null;
        if (!samplerTree) return { pre_processors: preProcessors, user_parameters: userParams };
        pairedWalk(samplerTree, function (node) {
            var tc = node.getAttribute('testclass') || '';
            if (tc === 'BeanShellPreProcessor') {
                if (global.JmsHttpBeanshellPreProcessorJmx && typeof global.JmsHttpBeanshellPreProcessorJmx.parseElement === 'function') {
                    var bp = global.JmsHttpBeanshellPreProcessorJmx.parseElement(node);
                    if (bp && bp.enabled !== false) preProcessors.push(bp);
                }
                return;
            }
            if (tc === 'UserParameters') {
                if (global.JmsHttpBeanshellPreProcessorJmx && typeof global.JmsHttpBeanshellPreProcessorJmx.parseUserParametersElement === 'function') {
                    userParams = global.JmsHttpBeanshellPreProcessorJmx.parseUserParametersElement(node);
                }
            }
        });
        return { pre_processors: preProcessors, user_parameters: userParams };
    }

    function parseSamplerProcessors(samplerTree) {
        var processors = [];
        if (!samplerTree) return processors;
        pairedWalk(samplerTree, function (node) {
            var tc = node.getAttribute('testclass') || '';
            if (tc === 'JSR223PostProcessor') {
                if (!isEnabled(node)) return;
                if (global.JmxJsr223PostProcessor && typeof global.JmxJsr223PostProcessor.parseElement === 'function') {
                    var jsr = global.JmxJsr223PostProcessor.parseElement(node);
                    if (jsr) processors.push(jsr);
                }
                return;
            }
            if (tc === 'JSONPostProcessor') {
                if (!isEnabled(node)) return;
                if (global.JmxJsonPostProcessor && typeof global.JmxJsonPostProcessor.parseElement === 'function') {
                    var jp = global.JmxJsonPostProcessor.parseElement(node);
                    if (jp) processors.push(jp);
                } else {
                    var varName = getStringProp(node, 'JSONPostProcessor.referenceNames');
                    var jsonPath = getStringProp(node, 'JSONPostProcessor.jsonPathExprs');
                    if (varName && jsonPath) {
                        processors.push({
                            type: 'json_post',
                            name: node.getAttribute('testname') || 'JSON PostProcessor',
                            enabled: true,
                            var: varName,
                            json_path: jsonPath,
                            match_numbers: getStringProp(node, 'JSONPostProcessor.match_numbers') || '0',
                            default_value: getStringProp(node, 'JSONPostProcessor.defaultValues') || ''
                        });
                    }
                }
                return;
            }
            if (tc === 'RegexExtractor') {
                if (!isEnabled(node)) return;
                if (global.JmxRegexExtractor && typeof global.JmxRegexExtractor.parseElement === 'function') {
                    var reProc = global.JmxRegexExtractor.parseElement(node);
                    if (reProc) processors.push(reProc);
                }
                return;
            }
            if (tc === 'XPathExtractor') {
                if (!isEnabled(node)) return;
                if (global.JmxXPathExtractor && typeof global.JmxXPathExtractor.parseElement === 'function') {
                    var xpProc = global.JmxXPathExtractor.parseElement(node);
                    if (xpProc) processors.push(xpProc);
                }
                return;
            }
            if (tc === 'JDBCPostProcessor') {
                if (!isEnabled(node)) return;
                if (global.JmxJdbcPostProcessor && typeof global.JmxJdbcPostProcessor.parseElement === 'function') {
                    var jdbcProc = global.JmxJdbcPostProcessor.parseElement(node);
                    if (jdbcProc) processors.push(jdbcProc);
                }
                return;
            }
            if (tc !== 'BeanShellPostProcessor') return;
            if (!isEnabled(node)) return;
            processors.push(parseBeanShell(node));
        });
        return processors;
    }

    function parseSampler(el, subTree, variables) {
        var method = (getProp(el, 'HTTPSampler.method', 'GET') || 'GET').toUpperCase();
        var step = {
            name: el.getAttribute('testname') || 'HTTP 请求',
            method: method,
            path: (global.JmsJmxPathImport && typeof global.JmsJmxPathImport.normalizeJmxImportedPath === 'function')
                ? global.JmsJmxPathImport.normalizeJmxImportedPath(getProp(el, 'HTTPSampler.path', '/'), variables, normalizeImportedPath)
                : normalizeImportedPath(getProp(el, 'HTTPSampler.path', '/'), variables),
            enabled: isEnabled(el)
        };
        var enc = getProp(el, 'HTTPSampler.contentEncoding', '');
        if (enc) step.encoding = enc;

        var domain = getProp(el, 'HTTPSampler.domain', '');
        var protocol = getProp(el, 'HTTPSampler.protocol', '');
        if (domain) step._domain = domain;
        if (protocol) step._protocol = protocol;

        var postRaw = getBoolProp(el, 'HTTPSampler.postBodyRaw', false);
        var argsEl = el.querySelector('elementProp[name="HTTPsampler.Arguments"]');
        if (argsEl && method !== 'GET' && method !== 'HEAD') {
            var argProps = argsEl.getElementsByTagName('elementProp');
            if (postRaw && argProps.length) {
                step.body_type = 'json';
                step.body = getStringProp(argProps[0], 'Argument.value') || '';
            } else if (argProps.length) {
                var form = {};
                for (var i = 0; i < argProps.length; i++) {
                    var ap = argProps[i];
                    if (ap.getAttribute('elementType') === 'HTTPArgument') {
                        var k = getStringProp(ap, 'Argument.name') || ('arg' + i);
                        form[k] = getStringProp(ap, 'Argument.value');
                    }
                }
                if (Object.keys(form).length) {
                    step.body_type = 'form';
                    step.form_params = form;
                }
            }
        } else if (argsEl && (method === 'GET' || method === 'HEAD')) {
            if (!postRaw &&
                global.JmsJmxGetQueryImport &&
                typeof global.JmsJmxGetQueryImport.applyImportedGetHeadQueryParams === 'function') {
                global.JmsJmxGetQueryImport.applyImportedGetHeadQueryParams(step, argsEl);
            }
            if (global.JmsJmxGetBodyImport &&
                typeof global.JmsJmxGetBodyImport.applyImportedGetHeadBody === 'function') {
                global.JmsJmxGetBodyImport.applyImportedGetHeadBody(step, argsEl, postRaw);
            }
        }

        var assertions = parseAssertions(subTree);
        if (assertions.length) {
            step.assertions = assertions;
            var st = assertions.find(function (a) { return a.type === 'status'; });
            if (st) step.assert_status = st.value;
        }

        var preParsed = parseSamplerPreProcessors(subTree);
        if (preParsed.pre_processors.length) step.pre_processors = preParsed.pre_processors;
        if (preParsed.user_parameters) step.user_parameters = preParsed.user_parameters;

        var processors = parseSamplerProcessors(subTree);
        if (processors.length) step.processors = processors;

        var extractors = parseExtractors(subTree);
        if (processors.length) {
            var jsonProcVars = {};
            processors.forEach(function (p) {
                if (p && p.type === 'json_post' && p.var) jsonProcVars[p.var] = true;
            });
            if (Object.keys(jsonProcVars).length) {
                extractors = extractors.filter(function (ex) { return ex && !jsonProcVars[ex.var]; });
            }
        }
        if (extractors.length) {
            step.extractors = extractors;
            step.extract = { json_path: extractors[0].json_path, var: extractors[0].var };
        }

        if (global.JmsJsonPostExtractSync &&
            typeof global.JmsJsonPostExtractSync.syncExtractorsFromJsonPostProcessors === 'function') {
            global.JmsJsonPostExtractSync.syncExtractorsFromJsonPostProcessors(step);
        }

        if (global.JmsStepAssertResolver &&
            typeof global.JmsStepAssertResolver.sanitizeImportedStepAssertions === 'function') {
            global.JmsStepAssertResolver.sanitizeImportedStepAssertions(step);
        }

        if (global.JmsHttpStepConfigJmx &&
            typeof global.JmsHttpStepConfigJmx.applyImportedSamplerConfigStrict === 'function') {
            global.JmsHttpStepConfigJmx.applyImportedSamplerConfigStrict(step, subTree);
        } else if (global.JmsHttpStepConfigJmx &&
            typeof global.JmsHttpStepConfigJmx.applyImportedSamplerConfig === 'function') {
            global.JmsHttpStepConfigJmx.applyImportedSamplerConfig(step, subTree);
        }

        return step;
    }

    function defaultCsvDataSet() {
        return {
            enabled: false,
            filename: '',
            file_encoding: 'UTF-8',
            variable_names: '',
            ignore_first_line: false,
            delimiter: ',',
            quoted_data: false,
            recycle: true,
            stop_thread: false,
            share_mode: 'shareMode.all',
            file_content: '',
            source_path: ''
        };
    }

    function defaultCounter() {
        return {
            enabled: false,
            start: '1',
            increment: '1',
            maximum: '999999',
            format: '',
            variable_name: 'counter',
            per_user: true
        };
    }

    function defaultHttpManagers() {
        return {
            http_defaults: {
                enabled: false,
                protocol: '', domain: '', port: '', path: '',
                connect_timeout: '', response_timeout: '',
                implementation: 'HttpClient4', content_encoding: '',
                follow_redirects: true, auto_redirects: false, use_keepalive: true
            },
            header_manager: { enabled: false, headers: {} },
            cookie_manager: {
                enabled: false, clear_each_iteration: true,
                controlled_by_thread_group: false, cookies: []
            },
            cache_manager: {
                enabled: false, clear_each_iteration: true, use_expires: true
            },
            csv_data_set: defaultCsvDataSet(),
            counter: defaultCounter(),
            selected_types: []
        };
    }

    function parseCsvDataSet(node) {
        var src = getStringProp(node, 'filename');
        return {
            enabled: true,
            filename: normalizeCsvFilename(src),
            source_path: src,
            file_encoding: getStringProp(node, 'fileEncoding') || 'UTF-8',
            variable_names: getStringProp(node, 'variableNames'),
            ignore_first_line: getBoolProp(node, 'ignoreFirstLine', false),
            delimiter: getStringProp(node, 'delimiter') || ',',
            quoted_data: getBoolProp(node, 'quotedData', false),
            recycle: getBoolProp(node, 'recycle', true),
            stop_thread: getBoolProp(node, 'stopThread', false),
            share_mode: getStringProp(node, 'shareMode') || 'shareMode.all',
            file_content: ''
        };
    }

    function applyConfigElement(node, gui, tg) {
        var tc = node.getAttribute('testclass') || node.tagName;
        if (tc === 'ConfigTestElement' && gui === 'HttpDefaultsGui') {
            tg.http_managers.http_defaults = parseHttpDefaults(node);
            if (tg._selectedTypes.indexOf('http_defaults') < 0) tg._selectedTypes.push('http_defaults');
        } else if (tc === 'HeaderManager') {
            tg.http_managers.header_manager = {
                enabled: true,
                headers: mergeHeaders(tg.http_managers.header_manager.headers || {}, parseHeaderManager(node)),
                name: (node.getAttribute('testname') || '').trim(),
                comments: getStringProp(node, 'TestPlan.comments') || ''
            };
            if (tg._selectedTypes.indexOf('header_manager') < 0) tg._selectedTypes.push('header_manager');
        } else if (tc === 'CookieManager') {
            tg.http_managers.cookie_manager = {
                enabled: true,
                clear_each_iteration: getBoolProp(node, 'CookieManager.clearEachIteration', true),
                controlled_by_thread_group: getBoolProp(node, 'CookieManager.controlledByThreadGroup', false),
                cookies: []
            };
            if (tg._selectedTypes.indexOf('cookie_manager') < 0) tg._selectedTypes.push('cookie_manager');
        } else if (tc === 'CacheManager') {
            tg.http_managers.cache_manager = {
                enabled: true,
                clear_each_iteration: getBoolProp(node, 'CacheManager.clearEachIteration', true),
                use_expires: getBoolProp(node, 'CacheManager.useExpires', true)
            };
            if (tg._selectedTypes.indexOf('cache_manager') < 0) tg._selectedTypes.push('cache_manager');
        } else if (tc === 'CSVDataSet') {
            tg.http_managers.csv_data_set = parseCsvDataSet(node);
            if (tg._selectedTypes.indexOf('csv_data_set') < 0) tg._selectedTypes.push('csv_data_set');
        } else if (tc === 'CounterConfig') {
            tg.http_managers.counter = {
                enabled: true,
                start: getProp(node, 'CounterConfig.start', '1'),
                increment: getProp(node, 'CounterConfig.incr', '1'),
                maximum: getProp(node, 'CounterConfig.end', '999999'),
                format: getProp(node, 'CounterConfig.format', ''),
                variable_name: getProp(node, 'CounterConfig.name', 'counter'),
                per_user: getBoolProp(node, 'CounterConfig.per_user', true)
            };
            if (tg._selectedTypes.indexOf('counter') < 0) tg._selectedTypes.push('counter');
        } else if (tc === 'BackendListener') {
            if (global.JmsTgBackendListenerJmx && typeof global.JmsTgBackendListenerJmx.applyImportConfig === 'function') {
                global.JmsTgBackendListenerJmx.applyImportConfig(node, tg);
            } else {
                if (!tg.listeners) tg.listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
                tg.listeners.backend_listener = isEnabled(node);
            }
        } else if (tc === 'ResultCollector') {
            if (global.JmsTgListenerImportJmx && typeof global.JmsTgListenerImportJmx.applyResultCollector === 'function') {
                global.JmsTgListenerImportJmx.applyResultCollector(node, tg);
            } else {
                if (!tg.listeners) tg.listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
                if (isEnabled(node)) {
                    if (gui === 'ViewResultsFullVisualizer') tg.listeners.view_results_tree = true;
                    if (gui === 'StatVisualizer') tg.listeners.aggregate_report = true;
                }
            }
        }
    }


    function configTypeFromNode(node, gui) {
        var tc = node.getAttribute('testclass') || node.tagName;
        if (tc === 'ConfigTestElement' && gui === 'HttpDefaultsGui') return 'http_defaults';
        if (tc === 'HeaderManager') return 'header_manager';
        if (tc === 'AuthManager') return 'auth_manager';
        if (tc === 'CookieManager') return 'cookie_manager';
        if (tc === 'CacheManager') return 'cache_manager';
        if (tc === 'CSVDataSet') return 'csv_data_set';
        if (tc === 'CounterConfig') return 'counter';
        return null;
    }

    function buildConfigItemFromNode(node, gui) {
        var type = configTypeFromNode(node, gui);
        if (!type) return null;
        var testname = (node.getAttribute('testname') || '').trim();
        var data;
        if (type === 'http_defaults') {
            data = parseHttpDefaults(node);
            data.name = testname;
            data.comments = getStringProp(node, 'TestPlan.comments') || '';
        } else if (type === 'header_manager') {
            data = {
                name: testname,
                comments: getStringProp(node, 'TestPlan.comments') || '',
                headers: parseHeaderManager(node)
            };
        } else if (type === 'auth_manager') {
            if (global.JmsTgAuthManagerJmx && typeof global.JmsTgAuthManagerJmx.parseFromEl === 'function') {
                data = global.JmsTgAuthManagerJmx.parseFromEl(node, testname);
            } else {
                data = {
                    name: testname,
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    clear_each_iteration: getBoolProp(node, 'AuthManager.clearEachIteration', false),
                    authorizations: []
                };
            }
        } else if (type === 'cookie_manager') {
            if (global.JmsTgCookieManagerJmx && typeof global.JmsTgCookieManagerJmx.parseFromEl === 'function') {
                data = global.JmsTgCookieManagerJmx.parseFromEl(node, testname);
            } else {
                data = {
                    name: testname,
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    clear_each_iteration: getBoolProp(node, 'CookieManager.clearEachIteration', true),
                    cookie_policy: 'standard',
                    cookies: []
                };
            }
        } else if (type === 'cache_manager') {
            if (global.JmsTgCacheManagerJmx && typeof global.JmsTgCacheManagerJmx.parseFromEl === 'function') {
                data = global.JmsTgCacheManagerJmx.parseFromEl(node, testname);
            } else {
                data = {
                    name: testname,
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    clear_each_iteration: getBoolProp(node, 'CacheManager.clearEachIteration', true),
                    use_expires: getBoolProp(node, 'CacheManager.useExpires', true),
                    max_size: '5000'
                };
            }
        } else if (type === 'csv_data_set') {
            data = parseCsvDataSet(node);
        } else if (type === 'counter') {
            data = {
                name: testname || '',
                comments: getStringProp(node, 'TestPlan.comments') || '',
                start: getProp(node, 'CounterConfig.start', '1'),
                increment: getProp(node, 'CounterConfig.incr', '1'),
                maximum: getProp(node, 'CounterConfig.end', '999999'),
                format: getProp(node, 'CounterConfig.format', ''),
                variable_name: getProp(node, 'CounterConfig.name', 'counter'),
                per_user: getBoolProp(node, 'CounterConfig.per_user', true),
                reset_each_iteration: getBoolProp(node, 'CounterConfig.reset_on_tg_iteration', false)
            };
        }
        return { type: type, name: testname, data: data || {} };
    }

    function recordConfigElement(node, gui, tg, opts) {
        opts = opts || {};
        if (!opts.parent_step_id) {
            applyConfigElement(node, gui, tg);
        }
        var raw = buildConfigItemFromNode(node, gui);
        if (!raw) return;
        var Catalog = global.JmsTgConfigCatalog;
        var item = Catalog && typeof Catalog.normalizeItem === 'function'
            ? Catalog.normalizeItem(raw)
            : Object.assign({ id: 'cfg_' + Math.random().toString(36).slice(2, 10) }, raw);
        if (!item) return;
        item.import_order = tg._importSeq++;
        if (opts.parent_step_id) item.parent_step_id = opts.parent_step_id;
        if (!Array.isArray(tg.config_items)) tg.config_items = [];
        tg.config_items.push(item);
    }

    function walkSamplerConfigTimeline(subTree, tg, stepId) {
        if (!subTree || !stepId) return;
        pairedWalk(subTree, function (node, sub) {
            var gui = node.getAttribute('guiclass') || '';
            if (!configTypeFromNode(node, gui)) return;
            recordConfigElement(node, gui, tg, { parent_step_id: stepId });
        });
    }

    function tagStepOrder(tg, step) {
        if (step && typeof step === 'object') {
            if (!step.id) step.id = 'stp_' + Math.random().toString(36).slice(2, 10);
            step.import_order = tg._importSeq++;
        }
        return step;
    }

    function preassignStepId(step) {
        if (step && typeof step === 'object' && !step.id) {
            step.id = 'stp_' + Math.random().toString(36).slice(2, 10);
        }
        return step && step.id;
    }

    function walkStepsTree(tree, tg, variables, parentStepId) {
        var steps = [];
        if (!tree) return steps;
        pairedWalk(tree, function (node, sub) {
            var tc = node.getAttribute('testclass') || node.tagName;
            var gui = node.getAttribute('guiclass') || '';

            if (tc === 'BeanShellPostProcessor') {
                steps.push(tagStepOrder(tg, parseBeanShell(node)));
                return;
            }

            if (tc === 'JSONPostProcessor') {
                if (global.JmxJsonPostProcessor && typeof global.JmxJsonPostProcessor.parseElement === 'function') {
                    var jp = global.JmxJsonPostProcessor.parseElement(node);
                    if (jp) steps.push(tagStepOrder(tg, jp));
                }
                return;
            }

            if (tc === 'RegexExtractor') {
                if (global.JmxRegexExtractor && typeof global.JmxRegexExtractor.parseElement === 'function') {
                    var re = global.JmxRegexExtractor.parseElement(node);
                    if (re) steps.push(tagStepOrder(tg, re));
                }
                return;
            }

            if (tc === 'XPathExtractor') {
                if (global.JmxXPathExtractor && typeof global.JmxXPathExtractor.parseElement === 'function') {
                    var xp = global.JmxXPathExtractor.parseElement(node);
                    if (xp) steps.push(tagStepOrder(tg, xp));
                }
                return;
            }

            if (tc === 'JSR223PostProcessor') {
                if (global.JmxJsr223PostProcessor && typeof global.JmxJsr223PostProcessor.parseElement === 'function') {
                    var j223 = global.JmxJsr223PostProcessor.parseElement(node);
                    if (j223) steps.push(tagStepOrder(tg, j223));
                }
                return;
            }

            if (tc === 'JDBCPostProcessor') {
                if (global.JmxJdbcPostProcessor && typeof global.JmxJdbcPostProcessor.parseElement === 'function') {
                    var jdbc = global.JmxJdbcPostProcessor.parseElement(node);
                    if (jdbc) steps.push(tagStepOrder(tg, jdbc));
                }
                return;
            }

            if (tc === 'DebugSampler') {
                steps.push(tagStepOrder(tg, parseDebugSampler(node)));
                return;
            }

            if (tc === 'RandomController') {
                var rndItem = {
                    type: 'random_controller',
                    name: node.getAttribute('testname') || '随机控制器',
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    ignore_sub_controller_blocks: getBoolProp(node, 'RandomController.ignoreSubControllerBlocks', false),
                    enabled: isEnabled(node),
                    children: []
                };
                var rndId = preassignStepId(rndItem);
                rndItem.children = walkStepsTree(sub, tg, variables, rndId);
                steps.push(tagStepOrder(tg, rndItem));
                return;
            }

            if (tc === 'IfController') {
                var item = {
                    type: 'if_controller',
                    name: node.getAttribute('testname') || 'If 控制器',
                    condition: getStringProp(node, 'IfController.condition'),
                    evaluate_all: getBoolProp(node, 'IfController.evaluateAll', false),
                    use_expression: getBoolProp(node, 'IfController.useExpression', true),
                    enabled: isEnabled(node),
                    children: []
                };
                var ifId = preassignStepId(item);
                item.children = walkStepsTree(sub, tg, variables, ifId);
                steps.push(tagStepOrder(tg, item));
                return;
            }

            if (tc === 'TransactionController') {
                var txnItem = {
                    type: 'transaction_controller',
                    name: node.getAttribute('testname') || '事务控制器',
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    generate_parent_sample: getBoolProp(node, 'TransactionController.parent', false),
                    include_timer_duration: getBoolProp(node, 'TransactionController.includeTimers', false),
                    enabled: isEnabled(node),
                    children: []
                };
                var txnId = preassignStepId(txnItem);
                txnItem.children = walkStepsTree(sub, tg, variables, txnId);
                steps.push(tagStepOrder(tg, txnItem));
                return;
            }

            if (tc === 'LoopController' && gui === 'LoopControlPanel') {
                var forever = getBoolProp(node, 'LoopController.continue_forever', false);
                var loopsRaw = getProp(node, 'LoopController.loops', '1');
                var loopsNum = parseInt(loopsRaw, 10);
                if (isNaN(loopsNum)) loopsNum = 1;
                var loopItem = {
                    type: 'loop_controller',
                    name: node.getAttribute('testname') || '循环控制器',
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    loop_forever: forever || loopsNum < 0,
                    loops: (forever || loopsNum < 0) ? -1 : (loopsNum > 0 ? loopsNum : 1),
                    enabled: isEnabled(node),
                    children: []
                };
                var loopId = preassignStepId(loopItem);
                loopItem.children = walkStepsTree(sub, tg, variables, loopId);
                steps.push(tagStepOrder(tg, loopItem));
                return;
            }

            if (tc === 'GenericController' && gui === 'LogicControllerGui') {
                var simpleItem = {
                    type: 'simple_controller',
                    name: node.getAttribute('testname') || '简单控制器',
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    enabled: isEnabled(node),
                    children: []
                };
                var simpleId = preassignStepId(simpleItem);
                simpleItem.children = walkStepsTree(sub, tg, variables, simpleId);
                steps.push(tagStepOrder(tg, simpleItem));
                return;
            }

            if (tc === 'HTTPSamplerProxy' || node.tagName === 'HTTPSamplerProxy') {
                var step = tagStepOrder(tg, parseSampler(node, sub, variables));
                if (sub) {
                    var HT = global.JmsJmxImportSamplerHashTimelineV1;
                    if (HT && typeof HT.applyHashTimeline === 'function') {
                        HT.applyHashTimeline(sub, step, {
                            isEnabled: isEnabled,
                            getStringProp: getStringProp,
                            getBoolProp: getBoolProp,
                            configTypeFromNode: configTypeFromNode,
                            buildConfigItemFromNode: buildConfigItemFromNode,
                            parseBeanShell: parseBeanShell
                        });
                    } else {
                        walkSamplerConfigTimeline(sub, tg, step.id);
                    }
                }
                steps.push(step);
                return;
            }

            if (tc === 'MailerResultCollector') {
                var ML = global.JmsJmxImportListenerStepV1;
                if (ML && typeof ML.buildMailerStep === 'function') {
                    var mailerStep = ML.buildMailerStep(node);
                    if (mailerStep) {
                        steps.push(tagStepOrder(tg, mailerStep));
                        return;
                    }
                }
            }

            if (tc === 'Arguments') {
                var ArgImp = global.JmsJmxImportTgArgumentsStepV1;
                if (ArgImp && typeof ArgImp.buildStep === 'function') {
                    var argStep = ArgImp.buildStep(node);
                    if (argStep) {
                        steps.push(tagStepOrder(tg, argStep));
                        if (typeof ArgImp.mergeIntoTgVariables === 'function') {
                            ArgImp.mergeIntoTgVariables(tg, argStep);
                        }
                        return;
                    }
                }
            }

            if (tc === 'BackendListener' || tc === 'ResultCollector') {
                var L = global.JmsJmxImportListenerStepV1;
                if (L && typeof L.buildStep === 'function') {
                    var listenerStep = L.buildStep(node);
                    if (listenerStep) {
                        steps.push(tagStepOrder(tg, listenerStep));
                        return;
                    }
                }
                applyConfigElement(node, gui, tg);
                return;
            }

            var cfgTypeInline = configTypeFromNode(node, gui);
            if (cfgTypeInline && parentStepId) {
                var CC = global.JmsJmxImportControllerConfigStepV1;
                if (CC && typeof CC.buildStep === 'function') {
                    var ctrlCfgStep = CC.buildStep(node, gui, {
                        configTypeFromNode: configTypeFromNode,
                        buildConfigItemFromNode: buildConfigItemFromNode
                    });
                    if (ctrlCfgStep) {
                        steps.push(tagStepOrder(tg, ctrlCfgStep));
                        return;
                    }
                }
            }

            recordConfigElement(node, gui, tg, { parent_step_id: parentStepId || undefined });

            if (sub && ((tc === 'GenericController' && gui !== 'LogicControllerGui') || tc === 'WhileController')) {
                var nested = walkStepsTree(sub, tg, variables, parentStepId);
                if (nested.length) steps = steps.concat(nested);
            }
        });
        return steps;
    }

    function createThreadGroupShell(node, kind) {
        if (kind === true) kind = 'setup';
        if (kind === false || kind == null) kind = 'thread';
        var kindLabels = { setup: 'Setup 线程组', thread: '线程组', post: 'Post 线程组' };
        return {
            kind: kind,
            name: node.getAttribute('testname') || (kindLabels[kind] || '线程组'),
            load: parseThreadGroupLoad(node),
            steps: [],
            processors: [],
            assertions: [],
            variables: {},
            http_managers: defaultHttpManagers(),
            config_items: [],
            _selectedTypes: [],
            _importSeq: 0
        };
    }

    function finalizeThreadGroup(tg) {
        if (global.JmsTgImportTimeline &&
            typeof global.JmsTgImportTimeline.normalizeTgImportTimelineOrder === 'function') {
            global.JmsTgImportTimeline.normalizeTgImportTimelineOrder(tg);
        }
        tg.http_managers.selected_types = tg._selectedTypes.slice();
        delete tg._selectedTypes;
        delete tg._importSeq;
        tg.steps = (tg.steps || []).map(stripInternalStep);
        if (global.JmsTgAssertResolver &&
            typeof global.JmsTgAssertResolver.sanitizeImportedTgAssertions === 'function') {
            global.JmsTgAssertResolver.sanitizeImportedTgAssertions(tg);
        }
        return tg;
    }

    function stripInternalStep(step) {
        if (!step || typeof step !== 'object') return step;
        if (step.type === 'if_controller' || step.type === 'random_controller' || step.type === 'simple_controller' || step.type === 'transaction_controller' || step.type === 'loop_controller') {
            step.children = (step.children || []).map(stripInternalStep);
            return step;
        }
        delete step._domain;
        delete step._protocol;
        return step;
    }

    function countHttpSteps(steps) {
        var n = 0;
        (steps || []).forEach(function (st) {
            if (!st || typeof st !== 'object') return;
            if (st.type === 'if_controller' || st.type === 'random_controller' || st.type === 'simple_controller' || st.type === 'transaction_controller' || st.type === 'loop_controller') n += countHttpSteps(st.children);
            else if (st.method) n += 1;
        });
        return n;
    }

    function collectCsvNeeds(groups) {
        var list = [];
        (groups || []).forEach(function (tg) {
            var csv = tg.http_managers && tg.http_managers.csv_data_set;
            if (!csv || !csv.enabled || !csv.source_path) return;
            list.push({
                normalized: csv.filename,
                source_path: csv.source_path,
                variable_names: csv.variable_names
            });
        });
        return list;
    }

    function buildImportReport(scenario, meta) {
        var httpSteps = 0;
        var ifControllers = 0;
        var beanshell = 0;
        var jsonAssertions = 0;
        var extractors = 0;
        var placeholders = 0;

        function walk(steps) {
            (steps || []).forEach(function (st) {
                if (!st) return;
                if (st.type === 'if_controller' || st.type === 'random_controller') {
                    ifControllers += 1;
                    walk(st.children);
                    return;
                }
                if (st.name === '占位请求' && st.path === '/') placeholders += 1;
                if (st.method) httpSteps += 1;
                if (st.type === 'beanshell_post') beanshell += 1;
                if (st.processors) beanshell += st.processors.length;
                if (st.extractors) extractors += st.extractors.length;
                if (st.assertions) {
                    st.assertions.forEach(function (a) {
                        if (a.type === 'json') jsonAssertions += 1;
                    });
                }
            });
        }

        (scenario.setup_thread_groups || []).forEach(function (tg) {
            if (tg.processors) beanshell += tg.processors.length;
            walk(tg.steps);
        });
        (scenario.thread_groups || []).forEach(function (tg) {
            if (tg.processors) beanshell += tg.processors.length;
            walk(tg.steps);
        });
        (scenario.post_thread_groups || []).forEach(function (tg) {
            if (tg.processors) beanshell += tg.processors.length;
            walk(tg.steps);
        });

        return {
            planName: scenario.name,
            threadGroups: (scenario.thread_groups || []).length,
            setupThreadGroups: (scenario.setup_thread_groups || []).length,
            postThreadGroups: (scenario.post_thread_groups || []).length,
            steps: httpSteps,
            variables: (function () {
                if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.resolvePlanVariablesFromData === 'function') {
                    return Object.keys(global.JmsPlanCatalogResolve.resolvePlanVariablesFromData(scenario)).length;
                }
                return Object.keys(scenario.variables || {}).length;
            })(),
            ifControllers: ifControllers,
            beanshellProcessors: beanshell,
            jsonAssertions: jsonAssertions,
            extractors: extractors,
            placeholders: placeholders,
            csvAttachments: collectCsvNeeds((scenario.setup_thread_groups || []).concat(scenario.thread_groups || []).concat(scenario.post_thread_groups || [])),
            warnings: meta.warnings || [],
            supportsRawJmx: true
        };
    }


    var CATALOG_CTRL_MAP = {
        if_controller: { alias: 'IfController', testclass: 'IfController', guiclass: 'IfControllerPanel', category: 'controller', container: true, label_zh: 'If 控制器' },
        random_controller: { alias: 'RandomController', testclass: 'RandomController', guiclass: 'RandomControlPanel', category: 'controller', container: true, label_zh: '随机控制器' },
        simple_controller: { alias: 'GenericController', testclass: 'GenericController', guiclass: 'LogicControllerGui', category: 'controller', container: true, label_zh: '简单控制器' },
        transaction_controller: { alias: 'TransactionController', testclass: 'TransactionController', guiclass: 'TransactionControllerGui', category: 'controller', container: true, label_zh: '事务控制器' },
        loop_controller: { alias: 'LoopController', testclass: 'LoopController', guiclass: 'LoopControlPanel', category: 'controller', container: true, label_zh: '循环控制器' }
    };

    function catalogUid(prefix) {
        return (prefix || 'cat_') + Math.random().toString(36).slice(2, 10);
    }

    function copyStepProps(src, skip) {
        skip = skip || {};
        var out = {};
        if (!src || typeof src !== 'object') return out;
        Object.keys(src).forEach(function (k) {
            if (skip[k]) return;
            out[k] = src[k];
        });
        return out;
    }

    function catalogizeStep(step) {
        if (!step) return null;
        if (global.JmsCatalogUnifyMigrate && typeof global.JmsCatalogUnifyMigrate.stepToCatalog === 'function') {
            return global.JmsCatalogUnifyMigrate.stepToCatalog(step);
        }
        if (step.type === 'catalog_element') {
            if (Array.isArray(step.children)) {
                step.children = step.children.map(catalogizeStep).filter(Boolean);
            }
            return step;
        }
        if (!step.type && (step.method || step.path != null)) {
            var httpCat = {
                id: step.id || catalogUid(),
                type: 'catalog_element',
                name: step.name || 'HTTP 请求',
                enabled: step.enabled !== false,
                alias: 'HTTPSamplerProxy',
                testclass: 'HTTPSamplerProxy',
                guiclass: 'HttpTestSampleGui',
                category: 'sampler',
                label_zh: 'HTTP 请求',
                container: false,
                scope: 'unified',
                method: step.method,
                path: step.path,
                catalog_props: copyStepProps(step, { id: 1, type: 1, children: 1, catalog_hash_children: 1 }),
                jmx_fragment: step.jmx_fragment || ''
            };
            if (Array.isArray(step.catalog_hash_children)) {
                httpCat.catalog_hash_children = step.catalog_hash_children.map(catalogizeStep).filter(Boolean);
            }
            if (step.import_order != null) httpCat.import_order = step.import_order;
            return httpCat;
        }
        var map = CATALOG_CTRL_MAP[step.type];
        if (!map) return step;
        var cat = {
            id: step.id || catalogUid(),
            type: 'catalog_element',
            name: step.name || map.label_zh || map.alias,
            enabled: step.enabled !== false,
            alias: map.alias,
            testclass: map.testclass || map.alias,
            guiclass: map.guiclass || (map.alias + 'Gui'),
            category: map.category || 'controller',
            label_zh: map.label_zh || step.name || map.alias,
            container: !!map.container,
            scope: 'unified',
            catalog_props: copyStepProps(step, { id: 1, type: 1, children: 1 }),
            jmx_fragment: step.jmx_fragment || ''
        };
        if (map.container) cat.children = (step.children || []).map(catalogizeStep).filter(Boolean);
        if (step.import_order != null) cat.import_order = step.import_order;
        return cat;
    }

    function catalogizeScenarioSteps(scenario) {
        if (!scenario || typeof scenario !== 'object') return scenario;
        function walkTg(tg) {
            if (!tg || !Array.isArray(tg.steps)) return;
            tg.steps = tg.steps.map(catalogizeStep).filter(Boolean);
        }
        (scenario.setup_thread_groups || []).forEach(walkTg);
        (scenario.thread_groups || []).forEach(walkTg);
        (scenario.post_thread_groups || []).forEach(walkTg);
        return scenario;
    }

    function parseJmxXml(xmlText, opts) {
        opts = opts || {};
        var parser = new DOMParser();
        var doc = parser.parseFromString(xmlText, 'application/xml');
        if (doc.querySelector('parsererror')) {
            throw new Error('JMX 不是有效的 XML');
        }

        var testPlan = doc.querySelector('TestPlan');
        var planName = (testPlan && testPlan.getAttribute('testname')) || '导入的测试计划';
        var planVariables = parseTestPlanVariables(testPlan);
        var serializeTg = testPlan ? getBoolProp(testPlan, 'TestPlan.serialize_threadgroups', false) : false;
        var defaultHeaders = {};
        var warnings = [];

        var rootHash = doc.querySelector('jmeterTestPlan > hashTree > hashTree');
        if (!rootHash) rootHash = doc.querySelector('hashTree');

        var globalHttpDefaults = null;
        var setupThreadGroups = [];
        var threadGroups = [];
        var postThreadGroups = [];
        var planCatalogItems = [];

        function planNodeHandledKey(node) {
            var tc = node.getAttribute('testclass') || node.tagName;
            var gui = node.getAttribute('guiclass') || '';
            if (tc === 'HeaderManager') return true;
            if (tc === 'Arguments') return true;
            if (tc === 'ConfigTestElement' && gui === 'HttpDefaultsGui') return true;
            if (tc === 'SetupThreadGroup' || tc === 'ThreadGroup' || tc === 'PostThreadGroup') return true;
            return false;
        }

        function nodeToJmxFragment(node) {
            try {
                if (global.XMLSerializer) return new global.XMLSerializer().serializeToString(node);
            } catch (e) {}
            return '';
        }

        function pushPlanCatalogNode(node, sub) {
            if (!node || node.parentNode !== rootHash) return;
            if (planNodeHandledKey(node)) return;
            var tc = node.getAttribute('testclass') || node.tagName;
            var gui = node.getAttribute('guiclass') || '';
            var alias = tc;
            var container = !!(sub && sub.querySelector && sub.querySelector('[testclass]'));
            var item = {
                type: 'catalog_element',
                name: node.getAttribute('testname') || alias,
                enabled: node.getAttribute('enabled') !== 'false',
                alias: alias,
                testclass: tc,
                guiclass: gui,
                category: tc === 'ResultCollector' ? 'listener' : (tc.indexOf('Config') >= 0 ? 'config' : 'other'),
                label_zh: node.getAttribute('testname') || alias,
                container: container,
                scope: 'imported',
                jmx_fragment: nodeToJmxFragment(node),
                catalog_props: { comments: '' }
            };
            if (container && sub) item.children = [];
            planCatalogItems.push(item);
        }

        if (rootHash) {
            pairedWalk(rootHash, function (node, sub) {
                var tc = node.getAttribute('testclass') || node.tagName;
                if (tc === 'ResultCollector' && node.parentNode === rootHash) {
                    pushPlanCatalogNode(node, sub);
                    return;
                }
                if (node.parentNode === rootHash && !planNodeHandledKey(node)) {
                    pushPlanCatalogNode(node, sub);
                    return;
                }
                if (tc === 'HeaderManager' && node.parentNode === rootHash) {
                    pushPlanHeaderCatalogItem(planCatalogItems, parseHeaderManager(node), node.getAttribute('testname'));
                    return;
                }
                if (tc === 'Arguments' && node.parentNode === rootHash) {
                    pushPlanArgumentsCatalogItem(planCatalogItems, parseArgumentsElement(node), node.getAttribute('testname'));
                    return;
                }
                if (tc === 'HeaderManager') {
                    defaultHeaders = mergeHeaders(defaultHeaders, parseHeaderManager(node));
                } else if (tc === 'ConfigTestElement' && node.getAttribute('guiclass') === 'HttpDefaultsGui') {
                    globalHttpDefaults = parseHttpDefaults(node);
                } else if (tc === 'SetupThreadGroup') {
                    var stg = createThreadGroupShell(node, 'setup');
                    if (sub) {
                        stg.assertions = parseTgLevelAssertions(sub);
                        stg.steps = walkStepsTree(sub, stg, planVariables);
                    }
                    setupThreadGroups.push(finalizeThreadGroup(stg));
                } else if (tc === 'ThreadGroup') {
                    var tg = createThreadGroupShell(node, 'thread');
                    if (sub) {
                        tg.assertions = parseTgLevelAssertions(sub);
                        tg.steps = walkStepsTree(sub, tg, planVariables);
                    }
                    finalizeThreadGroup(tg);
                    if (!tg.steps.length) {
                        warnings.push('线程组「' + tg.name + '」未解析到 HTTP 步骤');
                    }
                    threadGroups.push(tg);
                } else if (tc === 'PostThreadGroup') {
                    var ptg = createThreadGroupShell(node, 'post');
                    if (sub) {
                        ptg.assertions = parseTgLevelAssertions(sub);
                        ptg.steps = walkStepsTree(sub, ptg, planVariables);
                    }
                    finalizeThreadGroup(ptg);
                    if (!ptg.steps.length) {
                        warnings.push('后置线程组「' + ptg.name + '」未解析到 HTTP 步骤');
                    }
                    postThreadGroups.push(ptg);
                }
            });
        }

        if (!threadGroups.length) {
            var samplers = doc.querySelectorAll('HTTPSamplerProxy');
            var steps = [];
            for (var si = 0; si < samplers.length; si++) {
                steps.push(parseSampler(samplers[si], null, planVariables));
            }
            if (!steps.length) throw new Error('JMX 中未找到 ThreadGroup 或 HTTP 请求');
            threadGroups.push({
                kind: 'thread',
                name: '导入线程组',
                load: { users: 1, spawn_rate: 1, duration_sec: 60, loops: -1 },
                steps: steps,
                processors: [],
                variables: {},
                http_managers: defaultHttpManagers()
            });
        }

        var allSteps = [];
        setupThreadGroups.forEach(function (tg) { allSteps = allSteps.concat(tg.steps); });
        threadGroups.forEach(function (tg) { allSteps = allSteps.concat(tg.steps); });
        postThreadGroups.forEach(function (tg) { allSteps = allSteps.concat(tg.steps); });
        var firstHttp = null;
        function findHttp(steps) {
            for (var i = 0; i < (steps || []).length; i++) {
                var st = steps[i];
                if (st.type === 'if_controller') {
                    var nested = findHttp(st.children);
                    if (nested) return nested;
                } else if (st.method) return st;
            }
            return null;
        }
        setupThreadGroups.some(function (tg) { firstHttp = findHttp(tg.steps); return !!firstHttp; });
        if (!firstHttp) threadGroups.some(function (tg) { firstHttp = findHttp(tg.steps); return !!firstHttp; });
        if (!firstHttp) postThreadGroups.some(function (tg) { firstHttp = findHttp(tg.steps); return !!firstHttp; });

        var hd = globalHttpDefaults || (threadGroups[0] && threadGroups[0].http_managers.http_defaults);
        var baseUrl = inferBaseUrlFromVariables(planVariables, hd, firstHttp);

        if (Object.keys(planVariables).length) {
            pushPlanArgumentsCatalogItem(planCatalogItems, planVariables, '计划变量 ' + planName);
        }

        var scenario = {
            name: planName,
            base_url: baseUrl,
            env: 'staging',
            build: '${BUILD_ID}',
            layout: 'scenario',
            execution_mode: opts.preferRawJmx ? 'raw_jmx' : 'visual',
            serialize_threadgroups: serializeTg,
            default_headers: {},
            variables: {},
            influxdb: {
                enabled: true,
                url: 'http://127.0.0.1:8086/write?db=jmeter',
                measurement: 'jmeter',
                application: 'jmx-import',
                tags: { scenario: 'jmx-import', env: 'staging' }
            },
            setup_thread_groups: setupThreadGroups,
            thread_groups: threadGroups,
            post_thread_groups: postThreadGroups
        };
        if (planCatalogItems.length) {
            scenario.plan_catalog_items = planCatalogItems;
        } else if (Object.keys(defaultHeaders).length) {
            pushPlanHeaderCatalogItem(planCatalogItems, defaultHeaders, '公共请求头');
            scenario.plan_catalog_items = planCatalogItems;
        }

        if (opts.storeRawJmx !== false) {
            scenario.raw_jmx = {
                enabled: true,
                original_filename: opts.originalFilename || 'imported.jmx',
                xml: xmlText
            };
        }

        catalogizeScenarioSteps(scenario);
        var report = buildImportReport(scenario, { warnings: warnings });
        scenario._import_report = report;
        return scenario;
    }

    function scenarioToYaml(scenario) {
        var copy = JSON.parse(JSON.stringify(scenario));
        delete copy._import_report;
        if (copy.raw_jmx) delete copy.raw_jmx.xml;
        if (global.jsyaml && typeof global.jsyaml.dump === 'function') {
            if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.repairHostPathsInScenarioObject === 'function') {
                global.JmsJmxPathHost.repairHostPathsInScenarioObject(copy);
            }
            var yaml = global.jsyaml.dump(copy, { lineWidth: 120, noRefs: true });
            if (global.JmsHttpStepConfigJmx &&
                typeof global.JmsHttpStepConfigJmx.quoteSpecialHttpMethodsInYaml === 'function') {
                yaml = global.JmsHttpStepConfigJmx.quoteSpecialHttpMethodsInYaml(yaml);
            }
            if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.quoteHostPathsInYaml === 'function') {
                yaml = global.JmsJmxPathHost.quoteHostPathsInYaml(yaml);
            }
            return yaml;
        }
        throw new Error('jsyaml 未加载');
    }

    function parseFileAsync(file, callbacks) {
        callbacks = callbacks || {};
        if (!file) {
            if (callbacks.onError) callbacks.onError('未选择文件');
            return;
        }
        var name = (file.name || '').toLowerCase();
        if (!name.endsWith('.jmx')) {
            if (callbacks.onError) callbacks.onError('仅支持 .jmx 文件');
            return;
        }
        if (file.size > MAX_BYTES) {
            if (callbacks.onError) callbacks.onError('文件超过 2MB，请精简后重试');
            return;
        }
        if (callbacks.onStart) callbacks.onStart(file);

        var reader = new FileReader();
        reader.onload = function () {
            var text = reader.result;
            var runParse = function () {
                try {
                    if (callbacks.onProgress) callbacks.onProgress('正在解析 JMX…');
                    var P = global.JmxImportParser;
                    var parseFn = (P && typeof P.parseJmxXml === 'function') ? P.parseJmxXml : parseJmxXml;
                    var yamlFn = (P && typeof P.scenarioToYaml === 'function') ? P.scenarioToYaml : scenarioToYaml;
                    var scenario = parseFn.call(P || null, text, {
                        originalFilename: file.name,
                        storeRawJmx: true,
                        preferRawJmx: false
                    });
                    var yaml = yamlFn.call(P || null, scenario);
                    var summary = scenario._import_report || buildImportReport(scenario, { warnings: [] });
                    if (callbacks.onSuccess) {
                        callbacks.onSuccess({
                            yaml: yaml,
                            scenario: scenario,
                            summary: summary,
                            rawXml: text,
                            rawFilename: file.name
                        });
                    }
                } catch (e) {
                    if (callbacks.onError) callbacks.onError(e.message || String(e));
                }
            };
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(function () { setTimeout(runParse, 0); }, { timeout: 3000 });
            } else {
                setTimeout(runParse, 0);
            }
        };
        reader.onerror = function () {
            if (callbacks.onError) callbacks.onError('读取文件失败');
        };
        reader.readAsText(file);
    }

    global.JmxImportParser = {
        MAX_BYTES: MAX_BYTES,
        parseJmxXml: parseJmxXml,
        scenarioToYaml: scenarioToYaml,
        parseFileAsync: parseFileAsync,
        countHttpSteps: countHttpSteps,
        buildImportReport: buildImportReport,
        normalizeImportedPath: normalizeImportedPath,
        configTypeFromNode: configTypeFromNode,
        buildConfigItemFromNode: buildConfigItemFromNode
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jmx_import_modal_ui.js ---- */
/**
 * JMX 解析弹窗 UI 辅助（隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function measureNavOffset() {
        var gnav = global.document && global.document.querySelector('.hf-gnav');
        var h = gnav ? Math.ceil(gnav.getBoundingClientRect().height) : 0;
        if (!h || h < 40) h = 56;
        global.document.documentElement.style.setProperty('--hf-gnav-height', h + 'px');
        return h;
    }

    function summaryItems(summary) {
        if (!summary) return [];
        var items = [
            { label: '计划', value: summary.planName || '—', wide: true }
        ];
        if (summary.setupThreadGroups) {
            items.push({ label: '前置线程组', value: summary.setupThreadGroups + ' 个' });
        }
        items.push({ label: '线程组', value: (summary.threadGroups || 0) + ' 个' });
        if (summary.postThreadGroups) {
            items.push({ label: '后置线程组', value: summary.postThreadGroups + ' 个' });
        }
        items.push({ label: 'HTTP 步骤', value: (summary.steps || 0) + ' 个' });
        if (summary.officialElementCount) {
            items.push({ label: '官方元件', value: summary.officialElementCount + ' 个', wide: true });
        }
        items.push({ label: '公共变量', value: (summary.variables || 0) + ' 个' });
        if (summary.ifControllers) items.push({ label: 'IfController', value: summary.ifControllers + ' 个' });
        if (summary.beanshellProcessors) items.push({ label: 'BeanShell', value: summary.beanshellProcessors + ' 个' });
        if (summary.jsonAssertions) items.push({ label: 'JSON 断言', value: summary.jsonAssertions + ' 个' });
        if (summary.extractors) items.push({ label: 'JSON 提取', value: summary.extractors + ' 个' });
        if (summary.placeholders) {
            items.push({ label: '占位请求', value: summary.placeholders + ' 个', warn: true, wide: true });
        }
        if (summary.csvAttachments && summary.csvAttachments.length) {
            items.push({
                label: 'CSV 附件',
                value: '待上传 ' + summary.csvAttachments.length + ' 个',
                warn: true,
                wide: true
            });
        }
        (summary.warnings || []).forEach(function (w) {
            items.push({ label: '提示', value: w, warn: true, wide: true });
        });
        return items;
    }

    function renderSummary(el, summary) {
        if (!el) return;
        var items = summaryItems(summary);
        if (!items.length) {
            el.innerHTML = '';
            el.classList.add('hidden');
            return;
        }
        el.innerHTML = '<ul class="jmx-import-summary-grid">' + items.map(function (it) {
            var cls = 'jmx-import-summary-grid__item' +
                (it.wide ? ' jmx-import-summary-grid__item--wide' : '') +
                (it.label === '计划' ? ' jmx-import-summary-grid__item--plan' : '') +
                (it.warn ? ' jmx-import-summary-grid__item--warn' : '');
            return '<li class="' + cls + '">' +
                '<span class="jmx-import-summary-grid__label">' + esc(it.label) + '</span>' +
                '<span class="jmx-import-summary-grid__value">' + esc(it.value) + '</span>' +
                '</li>';
        }).join('') + '</ul>';
        el.classList.remove('hidden');
    }

    function getModalScrollEl() {
        var modal = global.document.getElementById('modal-jmx-import');
        return modal ? modal.querySelector('.jmx-import-modal__scroll') : null;
    }

    function restoreModalScroll(top) {
        if (top == null || top < 0) return;
        var scrollEl = getModalScrollEl();
        if (!scrollEl) return;
        var apply = function () { scrollEl.scrollTop = top; };
        apply();
        if (typeof global.requestAnimationFrame === 'function') {
            global.requestAnimationFrame(function () {
                apply();
                global.requestAnimationFrame(apply);
            });
        }
    }

    function pinCsvPickerScroll(input) {
        var scrollEl = getModalScrollEl();
        input.__jmxImportSavedScroll = scrollEl ? scrollEl.scrollTop : 0;
    }


    function csvBaseName(path) {
        return String(path || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
    }

    function csvTargetsMatch(target, fileName) {
        var t = String(target || '').trim();
        var f = String(fileName || '').trim();
        if (!t || !f) return false;
        var tb = csvBaseName(t);
        var fb = csvBaseName(f);
        if (tb === fb) return true;
        if (t === f) return true;
        if (t.endsWith('/' + fb)) return true;
        if (t.endsWith(f)) return true;
        return false;
    }

    function setInputFile(input, file) {
        if (!input || !file) return false;
        try {
            var dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            return true;
        } catch (e) {
            return false;
        }
    }

    function updateCsvPickUi(input, file) {
        var label = input && input.closest('.jmx-import-csv-row__pick');
        var nameEl = label && label.querySelector('.jmx-import-csv-row__pick-name');
        if (!nameEl) return;
        if (file) {
            nameEl.textContent = file.name;
            nameEl.classList.add('is-selected');
        } else {
            nameEl.textContent = '未选择';
            nameEl.classList.remove('is-selected');
        }
    }

    function showBulkCsvStatus(msg, isWarn) {
        var el = global.document.getElementById('jmx-import-csv-bulk-status');
        if (!el) return;
        if (!msg) {
            el.textContent = '';
            el.classList.add('hidden');
            el.classList.remove('is-warn');
            return;
        }
        el.textContent = msg;
        el.classList.remove('hidden');
        el.classList.toggle('is-warn', !!isWarn);
    }

    function applyBulkCsvFiles(fileList) {
        var listRoot = global.document.getElementById('jmx-import-csv-list');
        if (!listRoot) return { matched: 0, slotMatched: 0, unmatched: [] };
        var inputs = listRoot.querySelectorAll('.jmx-import-csv-file');
        if (!inputs.length) return { matched: 0, slotMatched: 0, unmatched: [] };
        var files = Array.prototype.slice.call(fileList || []);
        var matched = 0;
        var slotMatched = 0;
        var unmatched = [];
        files.forEach(function (file) {
            var matchedInputs = [];
            inputs.forEach(function (input) {
                var t = input.getAttribute('data-target') || '';
                if (csvTargetsMatch(t, file.name)) matchedInputs.push(input);
            });
            if (!matchedInputs.length && files.length === 1 && inputs.length === 1) {
                matchedInputs = [inputs[0]];
            }
            if (!matchedInputs.length) {
                unmatched.push(file.name);
                return;
            }
            var okAny = false;
            matchedInputs.forEach(function (input) {
                if (setInputFile(input, file)) {
                    updateCsvPickUi(input, file);
                    slotMatched += 1;
                    okAny = true;
                }
            });
            if (okAny) matched += 1;
            else unmatched.push(file.name);
        });
        return { matched: matched, slotMatched: slotMatched, unmatched: unmatched };
    }

    function readFileAsText(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || '')); };
            reader.onerror = function () { reject(reader.error || new Error('read failed')); };
            reader.readAsText(file, 'UTF-8');
        });
    }

    function applyCsvFilesToVisualBuilder(vb) {
        if (!vb || typeof vb.getModel !== 'function') return Promise.resolve({});
        var model = vb.getModel();
        if (!model) return Promise.resolve({});
        var inputs = global.document.querySelectorAll('#jmx-import-csv-list .jmx-import-csv-file');
        var tasks = [];
        var csvFiles = {};
        inputs.forEach(function (input) {
            var file = input.files && input.files[0];
            if (!file) return;
            var target = input.getAttribute('data-target') || ('data/' + file.name);
            tasks.push(readFileAsText(file).then(function (text) {
                csvFiles[target] = text;
                var groups = (model.setup_thread_groups || []).concat(model.thread_groups || []);
                groups.forEach(function (tg) {
                    var csv = tg.http_managers && tg.http_managers.csv_data_set;
                    if (!csv || !csv.enabled) return;
                    if (csvTargetsMatch(csv.filename, file.name) || csvTargetsMatch(target, file.name) || csv.filename === target) {
                        csv.file_content = text;
                        if (!csv.filename) csv.filename = target;
                    }
                });
            }));
        });
        return Promise.all(tasks).then(function () { return csvFiles; });
    }

    function resetBulkCsvUi() {
        var bulkInput = global.document.getElementById('jmx-import-csv-bulk-files');
        if (bulkInput) bulkInput.value = '';
        showBulkCsvStatus('');
    }

    function bindBulkCsvUpload() {
        var btn = global.document.getElementById('btn-jmx-csv-bulk-upload');
        var bulkInput = global.document.getElementById('jmx-import-csv-bulk-files');
        if (!btn || !bulkInput || btn.__jmxBulkCsvBound) return;
        btn.__jmxBulkCsvBound = true;
        btn.addEventListener('click', function () {
            pinCsvPickerScroll(bulkInput);
            bulkInput.click();
        });
        bulkInput.addEventListener('change', function () {
            var files = bulkInput.files;
            if (!files || !files.length) return;
            var result = applyBulkCsvFiles(files);
            var slots = result.slotMatched || result.matched || 0;
            if (slots > 0 && !result.unmatched.length) {
                var okMsg = '已匹配并同步 ' + slots + ' 个元件';
                if (result.matched > 0 && result.matched < slots) {
                    okMsg += '（' + result.matched + ' 个 CSV 文件）';
                }
                showBulkCsvStatus(okMsg, false);
            } else if (slots > 0 && result.unmatched.length) {
                showBulkCsvStatus('已同步 ' + slots + ' 个元件；未匹配文件：' + result.unmatched.join('、'), true);
            } else {
                showBulkCsvStatus('未能匹配 CSV，请按文件名（如 users.csv）选择或逐行上传', true);
            }
            bulkInput.value = '';
            restoreModalScroll(bulkInput.__jmxImportSavedScroll || 0);
        });
    }

    function renderCsvList(listEl, attachments) {
        if (!listEl) return;
        if (!attachments || !attachments.length) {
            listEl.innerHTML = '';
            return;
        }
        listEl.innerHTML = attachments.map(function (item, idx) {
            return '<div class="jmx-import-csv-row" data-csv-idx="' + idx + '">' +
                '<div class="jmx-import-csv-row__info">' +
                '<span class="jmx-import-csv-row__name">' + esc(item.normalized) + '</span>' +
                '<span class="jmx-import-csv-row__path" title="' + esc(item.source_path) + '">原路径: ' +
                esc(item.source_path) + '</span>' +
                '</div>' +
                '<label class="jmx-import-csv-row__pick">' +
                '<input type="file" accept=".csv,text/csv" class="jmx-import-csv-file sr-only" data-target="' +
                esc(item.normalized) + '" />' +
                '<span class="jmx-import-csv-row__pick-btn">选择 CSV</span>' +
                '<span class="jmx-import-csv-row__pick-name">未选择</span>' +
                '</label></div>';
        }).join('');
        bindCsvPickers(listEl);
        bindBulkCsvUpload();
        resetBulkCsvUi();
    }

    function bindCsvPickers(root) {
        if (!root) return;
        root.querySelectorAll('.jmx-import-csv-file').forEach(function (input) {
            if (input.__jmxImportUiBound) return;
            input.__jmxImportUiBound = true;
            input.__jmxImportSavedScroll = 0;

            var pick = input.closest('.jmx-import-csv-row__pick');
            if (pick) {
                pick.addEventListener('pointerdown', function () {
                    pinCsvPickerScroll(input);
                    var onWinFocus = function () {
                        restoreModalScroll(input.__jmxImportSavedScroll);
                        global.removeEventListener('focus', onWinFocus, true);
                    };
                    global.addEventListener('focus', onWinFocus, true);
                }, true);
            }

            input.addEventListener('focus', function () {
                restoreModalScroll(input.__jmxImportSavedScroll);
            });

            input.addEventListener('change', function () {
                var f = input.files && input.files[0];
                var top = input.__jmxImportSavedScroll;
                updateCsvPickUi(input, f);
                if (typeof input.blur === 'function') input.blur();
                restoreModalScroll(top);
            });
        });
    }

    function ensureModalInBody() {
        var modal = global.document.getElementById('modal-jmx-import');
        if (modal && modal.parentElement !== global.document.body) {
            global.document.body.appendChild(modal);
        }
    }

    function syncBodyScrollLock(modal) {
        if (!modal || !global.document.body) return;
        var open = modal.classList.contains('jms-modal-open');
        global.document.body.classList.toggle('jmx-import-modal-open', open);
    }

    function init() {
        measureNavOffset();
        ensureModalInBody();
        global.addEventListener('resize', measureNavOffset, { passive: true });
        var modal = global.document.getElementById('modal-jmx-import');
        if (modal && !modal.__jmxImportUiObs) {
            modal.__jmxImportUiObs = true;
            new MutationObserver(function () {
                syncBodyScrollLock(modal);
                if (modal.classList.contains('jms-modal-open')) {
                    measureNavOffset();
                    ensureModalInBody();
                }
            }).observe(modal, { attributes: true, attributeFilter: ['class'] });
            syncBodyScrollLock(modal);
        }
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }


    function renderOfficialTreeNode(node) {
        if (!node) return '';
        var name = esc(node.name || '未命名');
        var tc = esc(node.test_class || 'Unknown');
        var disabled = node.enabled === false;
        var children = node.children || [];
        var childHtml = children.map(renderOfficialTreeNode).join('');
        var badge = disabled ? '<span class="jmx-official-tree__badge jmx-official-tree__badge--off">禁用</span>' : '';
        if (!childHtml) {
            return '<li class="jmx-official-tree__item jmx-official-tree__item--leaf">' +
                '<span class="jmx-official-tree__name">' + name + '</span>' +
                '<span class="jmx-official-tree__type">' + tc + '</span>' + badge + '</li>';
        }
        return '<li class="jmx-official-tree__item">' +
            '<details class="jmx-official-tree__details" open>' +
            '<summary class="jmx-official-tree__summary">' +
            '<span class="jmx-official-tree__name">' + name + '</span>' +
            '<span class="jmx-official-tree__type">' + tc + '</span>' + badge +
            '</summary><ul class="jmx-official-tree__children">' + childHtml + '</ul></details></li>';
    }

    function renderOfficialTree(el, official) {
        if (!el) return;
        if (!official || !official.tree || !official.tree.length) {
            el.innerHTML = '';
            el.classList.add('hidden');
            return;
        }
        var meta = '<div class="jmx-official-tree__meta">官方导入 · ' +
            esc(official.plan_name || '测试计划') + ' · 共 ' +
            esc(String(official.element_count || 0)) + ' 个元件' +
            (official.truncated ? '（已截断展示）' : '') + '</div>';
        el.innerHTML = meta + '<ul class="jmx-official-tree__root">' +
            official.tree.map(renderOfficialTreeNode).join('') + '</ul>';
        el.classList.remove('hidden');
    }

    function resetOfficialTree() {
        var wrap = global.document.getElementById('jmx-import-official-wrap');
        var el = global.document.getElementById('jmx-import-official-tree');
        if (wrap) wrap.classList.add('hidden');
        if (el) {
            el.innerHTML = '';
            el.classList.add('hidden');
        }
    }

    global.JmxImportModalUi = {
        renderSummary: renderSummary,
        renderCsvList: renderCsvList,
        bindCsvPickers: bindCsvPickers,
        applyBulkCsvFiles: applyBulkCsvFiles,
        applyCsvFilesToVisualBuilder: applyCsvFilesToVisualBuilder,
        resetBulkCsvUi: resetBulkCsvUi,
        renderOfficialTree: renderOfficialTree,
        resetOfficialTree: resetOfficialTree,
        measureNavOffset: measureNavOffset
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_jmx_import_csv_passthrough_v1.js ---- */
/**
 * JMX 导入 · CSV 路径直通（隔离模块）
 * 保留 JMX 内原始 filename，不要求用户上传 CSV，不校验文件是否存在。
 */
(function (global) {
    'use strict';

    function trimStr(v) {
        return v == null ? '' : String(v).trim();
    }

    function applyCsvPassthrough(csv) {
        if (!csv || typeof csv !== 'object') return;
        var src = trimStr(csv.source_path);
        if (!src) src = trimStr(csv.filename);
        if (!src) return;
        csv.filename = src;
        csv.source_path = src;
        csv.file_content = '';
    }

    function walkStepsCsv(steps) {
        (steps || []).forEach(function (step) {
            if (!step || typeof step !== 'object') return;
            if (step.type === 'catalog_element' && step.alias === 'CSVDataSet' && step.catalog_props) {
                applyCsvPassthrough(step.catalog_props);
            }
            if (step.catalog_props && step.alias === 'CSVDataSet') {
                applyCsvPassthrough(step.catalog_props);
            }
            if (Array.isArray(step.catalog_hash_children)) walkStepsCsv(step.catalog_hash_children);
            if (Array.isArray(step.children)) walkStepsCsv(step.children);
        });
    }

    function passthroughCsvInScenario(scenario) {
        if (!scenario || typeof scenario !== 'object') return scenario;
        var groups = (scenario.setup_thread_groups || [])
            .concat(scenario.thread_groups || [])
            .concat(scenario.post_thread_groups || []);
        groups.forEach(function (tg) {
            if (!tg) return;
            if (tg.http_managers && tg.http_managers.csv_data_set) {
                applyCsvPassthrough(tg.http_managers.csv_data_set);
            }
            (tg.config_items || []).forEach(function (item) {
                if (!item || item.type !== 'csv_data_set' || !item.data) return;
                applyCsvPassthrough(item.data);
            });
            walkStepsCsv(tg.steps);
        });
        walkStepsCsv(scenario.plan_catalog_items);
        return scenario;
    }

    function stripCsvAttachments(report) {
        if (!report || typeof report !== 'object') return report;
        report.csvAttachments = [];
        return report;
    }

    function hideCsvPanel() {
        if (!global.document) return;
        var panel = global.document.getElementById('jmx-import-csv-panel');
        if (panel) panel.classList.add('hidden');
        var list = global.document.getElementById('jmx-import-csv-list');
        if (list) list.innerHTML = '';
    }

    function patchParser() {
        var P = global.JmxImportParser;
        if (!P || P.__csvPassthroughV1) return;
        P.__csvPassthroughV1 = true;

        if (typeof P.parseJmxXml === 'function') {
            var origParse = P.parseJmxXml;
            P.parseJmxXml = function (xml, opts) {
                var scenario = origParse(xml, opts);
                passthroughCsvInScenario(scenario);
                if (scenario && scenario._import_report) {
                    stripCsvAttachments(scenario._import_report);
                }
                return scenario;
            };
        }

        if (typeof P.buildImportReport === 'function') {
            var origReport = P.buildImportReport;
            P.buildImportReport = function (scenario, meta) {
                passthroughCsvInScenario(scenario);
                return stripCsvAttachments(origReport(scenario, meta));
            };
        }
    }

    function patchModalUi() {
        var UI = global.JmxImportModalUi;
        if (!UI || UI.__csvPassthroughV1) return;
        UI.__csvPassthroughV1 = true;

        if (typeof UI.renderCsvList === 'function') {
            UI.renderCsvList = function (listEl) {
                if (listEl) listEl.innerHTML = '';
                hideCsvPanel();
            };
        }

        if (typeof UI.applyCsvFilesToVisualBuilder === 'function') {
            UI.applyCsvFilesToVisualBuilder = function () {
                return Promise.resolve({});
            };
        }

        if (typeof UI.renderSummary === 'function') {
            var origSummary = UI.renderSummary;
            UI.renderSummary = function (el, summary) {
                if (summary) stripCsvAttachments(summary);
                return origSummary(el, summary);
            };
        }
    }

    function patchScenarioAdvanced() {
        var A = global.JmxScenarioAdvanced;
        if (!A || A.__csvPassthroughV1 || typeof A.formatImportReport !== 'function') return;
        A.__csvPassthroughV1 = true;
        var origFmt = A.formatImportReport;
        A.formatImportReport = function (summary) {
            if (summary) stripCsvAttachments(summary);
            return origFmt(summary);
        };
    }

    function boot() {
        patchParser();
        patchModalUi();
        patchScenarioAdvanced();
    }

    global.JmsJmxImportCsvPassthroughV1 = {
        applyCsvPassthrough: applyCsvPassthrough,
        passthroughCsvInScenario: passthroughCsvInScenario,
        stripCsvAttachments: stripCsvAttachments,
        patch: boot
    };

    boot();
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_backend_listener_catalog.js ---- */
/**
 * Backend Listener · 数据模型（隔离模块，TG / HTTP 步骤共用，默认值对齐 JMeter GUI）
 */
(function (global) {
    'use strict';

    var GRAPHITE_CN = 'org.apache.jmeter.visualizers.backend.graphite.GraphiteBackendListenerClient';
    var INFLUX_RAW_CN = 'org.apache.jmeter.visualizers.backend.influxdb.InfluxDBRawBackendListenerClient';
    var INFLUX_CN = 'org.apache.jmeter.visualizers.backend.influxdb.InfluxdbBackendListenerClient';

    var IMPLEMENTATIONS = [
        { value: GRAPHITE_CN, label: GRAPHITE_CN },
        { value: INFLUX_RAW_CN, label: INFLUX_RAW_CN },
        { value: INFLUX_CN, label: INFLUX_CN }
    ];

    var DEFAULT_GRAPHITE_PARAMS = [
        { key: 'graphiteMetricsSender', value: 'org.apache.jmeter.visualizers.backend.graphite.TextGraphiteMetricsSender' },
        { key: 'graphiteHost', value: '' },
        { key: 'graphitePort', value: '2003' },
        { key: 'rootMetricsPrefix', value: 'jmeter.' },
        { key: 'summaryOnly', value: 'true' },
        { key: 'samplersList', value: '' },
        { key: 'useRegexpForSamplersList', value: 'false' },
        { key: 'percentiles', value: '90;95;99' }
    ];

    var DEFAULT_INFLUX_RAW_PARAMS = [
        { key: 'influxdbMetricsSender', value: 'org.apache.jmeter.visualizers.backend.influxdb.HttpMetricsSender' },
        { key: 'influxdbUrl', value: 'http://host_to_change:8086/write?db=jmeter' },
        { key: 'influxdbToken', value: '' },
        { key: 'measurement', value: 'jmeter' }
    ];

    var DEFAULT_INFLUX_PARAMS = [
        { key: 'influxdbMetricsSender', value: 'org.apache.jmeter.visualizers.backend.influxdb.HttpMetricsSender' },
        { key: 'influxdbUrl', value: 'http://127.0.0.1:8086/write?db=jmeter' },
        { key: 'application', value: 'application name' },
        { key: 'measurement', value: 'jmeter' },
        { key: 'summaryOnly', value: 'false' },
        { key: 'samplersRegex', value: '.*' },
        { key: 'percentiles', value: '99;95;90' },
        { key: 'testTitle', value: 'Test name' },
        { key: 'eventTags', value: '' }
    ];

    function isGraphiteClassname(classname) {
        return classname && String(classname).indexOf('graphite') >= 0;
    }

    function isInfluxRawClassname(classname) {
        return classname && String(classname).indexOf('InfluxDBRaw') >= 0;
    }

    function defaultParamsForClassname(classname) {
        if (isGraphiteClassname(classname)) return cloneParams(DEFAULT_GRAPHITE_PARAMS);
        if (isInfluxRawClassname(classname)) return cloneParams(DEFAULT_INFLUX_RAW_PARAMS);
        return cloneParams(DEFAULT_INFLUX_PARAMS);
    }

    function cloneParams(list) {
        return (list || []).map(function (p) {
            return { key: String(p.key || ''), value: p.value == null ? '' : String(p.value) };
        });
    }

    function defaultConfig() {
        return {
            name: '后端监听器',
            comments: '',
            classname: GRAPHITE_CN,
            queue_size: '5000',
            parameters: cloneParams(DEFAULT_GRAPHITE_PARAMS)
        };
    }

    function defaultConfigFromListenerData(listenerData) {
        var cfg = defaultConfig();
        if (!listenerData || !listenerData.influxdb || listenerData.influxdb.enabled === false) {
            return cfg;
        }
        var inf = listenerData.influxdb || {};
        var tags = inf.tags || {};
        var eventTags = [];
        if (tags.scenario) eventTags.push('scenario=' + tags.scenario);
        if (tags.env || listenerData.env) eventTags.push('env=' + (tags.env || listenerData.env));
        if (listenerData.build) {
            var buildVal = String(listenerData.build);
            eventTags.push(buildVal.indexOf('${') >= 0 ? 'build=${__P(build,unknown)}' : ('build=' + buildVal));
        } else {
            eventTags.push('build=${__P(build,unknown)}');
        }
        cfg.classname = INFLUX_CN;
        cfg.parameters = cloneParams(DEFAULT_INFLUX_PARAMS).map(function (p) {
            if (p.key === 'influxdbUrl') return { key: p.key, value: inf.url || p.value };
            if (p.key === 'application') return { key: p.key, value: inf.application || p.value };
            if (p.key === 'measurement') return { key: p.key, value: inf.measurement || p.value };
            if (p.key === 'testTitle') return { key: p.key, value: listenerData.name || p.value };
            if (p.key === 'eventTags') return { key: p.key, value: eventTags.join(',') || p.value };
            return { key: p.key, value: p.value };
        });
        return cfg;
    }

    function normalizeConfig(raw) {
        if (!raw || typeof raw !== 'object') return defaultConfig();
        var classname = raw.classname ? String(raw.classname) : defaultConfig().classname;
        var params = [];
        if (Array.isArray(raw.parameters)) {
            raw.parameters.forEach(function (row) {
                if (!row) return;
                var k = String(row.key || row.name || '').trim();
                if (k) params.push({ key: k, value: row.value == null ? '' : String(row.value) });
            });
        }
        if (!params.length) params = defaultParamsForClassname(classname);
        return {
            name: raw.name !== undefined ? String(raw.name) : '后端监听器',
            comments: raw.comments !== undefined ? String(raw.comments) : '',
            classname: classname,
            queue_size: raw.queue_size !== undefined ? String(raw.queue_size)
                : (raw.queueSize !== undefined ? String(raw.queueSize) : '5000'),
            parameters: params,
            enabled: raw.enabled !== false
        };
    }

    function configToYaml(cfg) {
        cfg = normalizeConfig(cfg);
        var out = {
            name: cfg.name,
            classname: cfg.classname,
            queue_size: cfg.queue_size,
            parameters: cfg.parameters.map(function (p) { return { key: p.key, value: p.value }; })
        };
        if (cfg.comments) out.comments = cfg.comments;
        return out;
    }

    function listenerItemFromConfig(cfg) {
        cfg = normalizeConfig(cfg);
        return {
            name: cfg.name,
            comments: cfg.comments,
            classname: cfg.classname,
            queue_size: cfg.queue_size,
            parameters: cloneParams(cfg.parameters)
        };
    }

    function paramsEqual(a, b) {
        a = a || [];
        b = b || [];
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) {
            if (String(a[i].key) !== String(b[i].key)) return false;
            if (String(a[i].value) !== String(b[i].value)) return false;
        }
        return true;
    }

    global.JmsBackendListenerCatalog = {
        GRAPHITE_CN: GRAPHITE_CN,
        INFLUX_RAW_CN: INFLUX_RAW_CN,
        INFLUX_CN: INFLUX_CN,
        IMPLEMENTATIONS: IMPLEMENTATIONS,
        DEFAULT_GRAPHITE_PARAMS: DEFAULT_GRAPHITE_PARAMS,
        DEFAULT_INFLUX_RAW_PARAMS: DEFAULT_INFLUX_RAW_PARAMS,
        DEFAULT_INFLUX_PARAMS: DEFAULT_INFLUX_PARAMS,
        defaultConfig: defaultConfig,
        defaultConfigFromListenerData: defaultConfigFromListenerData,
        defaultParamsForClassname: defaultParamsForClassname,
        isGraphiteClassname: isGraphiteClassname,
        isInfluxRawClassname: isInfluxRawClassname,
        paramsEqual: paramsEqual,
        normalizeConfig: normalizeConfig,
        configToYaml: configToYaml,
        listenerItemFromConfig: listenerItemFromConfig,
        cloneParams: cloneParams
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_backend_listener_jmx.js ---- */
/**
 * Backend Listener · JMX 解析/导出（隔离模块，TG / HTTP 步骤共用）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsBackendListenerCatalog;

    function getStringProp(el, name) {
        if (!el) return '';
        var list = el.getElementsByTagName('stringProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) return (list[i].textContent || '').trim();
        }
        return '';
    }

    function parseParametersEl(el) {
        var params = [];
        if (!el) return params;
        var coll = el.querySelector('collectionProp[name="Arguments.arguments"]');
        if (!coll) return params;
        var props = coll.querySelectorAll('elementProp[elementType="Argument"]');
        for (var i = 0; i < props.length; i++) {
            var k = getStringProp(props[i], 'Argument.name');
            var v = getStringProp(props[i], 'Argument.value');
            if (k) params.push({ key: k, value: v });
        }
        return params;
    }

    function parseBackendListenerEl(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'BackendListener') return null;
        var argsEl = node.querySelector('elementProp[name="arguments"]');
        var cfg = {
            name: (node.getAttribute('testname') || '').trim(),
            comments: getStringProp(node, 'TestPlan.comments'),
            classname: getStringProp(node, 'classname'),
            queue_size: getStringProp(node, 'queueSize') || getStringProp(node, 'AsyncQueue.size') || '5000',
            parameters: parseParametersEl(argsEl),
            enabled: node.getAttribute('enabled') !== 'false'
        };
        return Catalog ? Catalog.normalizeConfig(cfg) : cfg;
    }

    function defaultEscapeXml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function genBackendListenerXml(cfg, indent, escapeXml) {
        if (!cfg) return '';
        if (Catalog) cfg = Catalog.normalizeConfig(cfg);
        escapeXml = escapeXml || defaultEscapeXml;
        var pad = indent || '';
        var pad2 = pad + '  ';
        var pad3 = pad2 + '  ';
        var pad4 = pad3 + '  ';
        var name = escapeXml(cfg.name || 'InfluxDB Backend Listener');
        var enabled = cfg.enabled === false ? 'false' : 'true';
        var xml = pad + '<BackendListener guiclass="BackendListenerGui" testclass="BackendListener" testname="' + name + '" enabled="' + enabled + '">\n';
        xml += pad2 + '<elementProp name="arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="Arguments" enabled="true">\n';
        xml += pad3 + '<collectionProp name="Arguments.arguments">\n';
        (cfg.parameters || []).forEach(function (p) {
            if (!p || !String(p.key || '').trim()) return;
            var pk = escapeXml(String(p.key).trim());
            xml += pad4 + '<elementProp name="' + pk + '" elementType="Argument">\n';
            xml += pad4 + '  <stringProp name="Argument.name">' + pk + '</stringProp>\n';
            xml += pad4 + '  <stringProp name="Argument.value">' + escapeXml(p.value == null ? '' : String(p.value)) + '</stringProp>\n';
            xml += pad4 + '  <stringProp name="Argument.metadata">=</stringProp>\n';
            xml += pad4 + '</elementProp>\n';
        });
        xml += pad3 + '</collectionProp>\n';
        xml += pad2 + '</elementProp>\n';
        var cls = cfg.classname || (Catalog ? Catalog.defaultConfig().classname : '');
        xml += pad2 + '<stringProp name="classname">' + escapeXml(cls) + '</stringProp>\n';
        if (cfg.comments) xml += pad2 + '<stringProp name="TestPlan.comments">' + escapeXml(cfg.comments) + '</stringProp>\n';
        if (cfg.queue_size) xml += pad2 + '<stringProp name="queueSize">' + escapeXml(String(cfg.queue_size)) + '</stringProp>\n';
        xml += pad + '</BackendListener>\n';
        xml += pad + '<hashTree/>\n';
        return xml;
    }

    global.JmsBackendListenerJmx = {
        parseBackendListenerEl: parseBackendListenerEl,
        genBackendListenerXml: genBackendListenerXml
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jms_mount_catalog_bridge.js ---- */
/**
 * 挂载区 · legacy 数组与 catalog_hash_children 统一桥接（Phase11+12）
 * 不修改既有模块签名；供 timeline / row_actions / legacy_purge 调用。
 */
(function (global) {
    'use strict';

    var LEGACY_PROC_MAP = {
        json_post: { alias: 'JSONPostProcessor', testclass: 'JSONPostProcessor', guiclass: 'JSONPostProcessorGui', category: 'postprocessor', label_zh: 'JSON 提取器' },
        regex_extract: { alias: 'RegexExtractor', testclass: 'RegexExtractor', guiclass: 'RegexExtractorGui', category: 'postprocessor', label_zh: '正则表达式提取器' },
        xpath_extract: { alias: 'XPathExtractor', testclass: 'XPathExtractor', guiclass: 'XPathExtractorGui', category: 'postprocessor', label_zh: 'XPath 提取器' },
        jdbc_post: { alias: 'JDBCPostProcessor', testclass: 'JDBCPostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', label_zh: 'JDBC 后置处理器' },
        jsr223_post: { alias: 'JSR223PostProcessor', testclass: 'JSR223PostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', label_zh: 'JSR223 后置处理器' },
        beanshell_post: { alias: 'BeanShellPostProcessor', testclass: 'BeanShellPostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', label_zh: 'BeanShell 后置处理器' }
    };

    var LEGACY_PRE_MAP = {
        beanshell_pre: { alias: 'BeanShellPreProcessor', testclass: 'BeanShellPreProcessor', guiclass: 'TestBeanGUI', category: 'preprocessor', label_zh: 'BeanShell 前置处理器' },
        jsr223_pre: { alias: 'JSR223PreProcessor', testclass: 'JSR223PreProcessor', guiclass: 'TestBeanGUI', category: 'preprocessor', label_zh: 'JSR223 前置处理器' }
    };

    var ASSERT_MAP = {
        response: { alias: 'ResponseAssertion', testclass: 'ResponseAssertion', guiclass: 'AssertionGui', category: 'assertion', label_zh: '响应断言' },
        response_assert: { alias: 'ResponseAssertion', testclass: 'ResponseAssertion', guiclass: 'AssertionGui', category: 'assertion', label_zh: '响应断言' },
        json: { alias: 'JSONPathAssertion', testclass: 'JSONPathAssertion', guiclass: 'JSONPathAssertionGui', category: 'assertion', label_zh: 'JSON 断言' },
        json_assert: { alias: 'JSONPathAssertion', testclass: 'JSONPathAssertion', guiclass: 'JSONPathAssertionGui', category: 'assertion', label_zh: 'JSON 断言' },
        size: { alias: 'SizeAssertion', testclass: 'SizeAssertion', guiclass: 'SizeAssertionGui', category: 'assertion', label_zh: '大小断言' },
        size_assert: { alias: 'SizeAssertion', testclass: 'SizeAssertion', guiclass: 'SizeAssertionGui', category: 'assertion', label_zh: '大小断言' },
        md5hex: { alias: 'MD5HexAssertion', testclass: 'MD5HexAssertion', guiclass: 'MD5HexAssertionGui', category: 'assertion', label_zh: 'MD5Hex 断言' },
        md5hex_assert: { alias: 'MD5HexAssertion', testclass: 'MD5HexAssertion', guiclass: 'MD5HexAssertionGui', category: 'assertion', label_zh: 'MD5Hex 断言' }
    };

    var CONFIG_TYPE_MAP = {
        http_defaults: { alias: 'ConfigTestElement', testclass: 'ConfigTestElement', guiclass: 'HttpDefaultsGui', category: 'config', label_zh: 'HTTP 请求默认值' },
        header_manager: { alias: 'HeaderManager', testclass: 'HeaderManager', guiclass: 'HeaderPanel', category: 'config', label_zh: 'HTTP 信息头管理器' },
        auth_manager: { alias: 'AuthManager', testclass: 'AuthManager', guiclass: 'AuthPanel', category: 'config', label_zh: 'HTTP 授权管理器' },
        cookie_manager: { alias: 'CookieManager', testclass: 'CookieManager', guiclass: 'CookiePanel', category: 'config', label_zh: 'HTTP Cookie 管理器' },
        cache_manager: { alias: 'CacheManager', testclass: 'CacheManager', guiclass: 'CachePanel', category: 'config', label_zh: 'HTTP 缓存管理器' },
        csv_data_set: { alias: 'CSVDataSet', testclass: 'CSVDataSet', guiclass: 'TestBeanGUI', category: 'config', label_zh: 'CSV 数据文件设置' },
        counter: { alias: 'CounterConfig', testclass: 'CounterConfig', guiclass: 'CounterConfigGui', category: 'config', label_zh: '计数器' }
    };

    var LISTENER_KEY_ALIAS = {
        view_results_tree: 'ViewResultsFullVisualizer',
        aggregate_report: 'StatVisualizer',
        backend_listener: 'BackendListener'
    };

    var CATEGORY_ICON = {
        postprocessor: 'P', preprocessor: 'BS', assertion: 'A', config: 'C', listener: 'L', timer: 'T', other: '·'
    };

    var CATEGORY_CARD = {
        postprocessor: 'jms-aux-card--json',
        preprocessor: 'jms-aux-card--beanshell',
        assertion: 'jms-aux-card--assert',
        config: 'jms-aux-card--config',
        listener: 'jms-aux-card--listener',
        timer: 'jms-aux-card--timer'
    };

    function uid(prefix) {
        return (prefix || 'cat_') + Math.random().toString(36).slice(2, 10);
    }

    function vb() { return global.JmsVisualBuilder; }

    function isMountHostStep(step) {
        if (global.JmsMountHostResolver && typeof global.JmsMountHostResolver.isMountHostStep === 'function') {
            return global.JmsMountHostResolver.isMountHostStep(step);
        }
        return !!(step && (step.method || (step.type === 'catalog_element' && (step.container || step.category === 'sampler'))));
    }

    function ensureHashChildren(step) {
        if (!step.catalog_hash_children) step.catalog_hash_children = [];
        return step.catalog_hash_children;
    }

    function buildCatalogElement(map, name, props, enabled) {
        return {
            id: uid('cat_'),
            type: 'catalog_element',
            name: name || map.label_zh || map.alias,
            enabled: enabled !== false,
            alias: map.alias,
            testclass: map.testclass || map.alias,
            guiclass: map.guiclass || (map.alias + 'Gui'),
            category: map.category || 'other',
            label_zh: map.label_zh || map.alias,
            container: false,
            scope: 'unified',
            catalog_props: props && typeof props === 'object' ? Object.assign({}, props) : {},
            jmx_fragment: ''
        };
    }

    function legacyProcToCatalog(raw) {
        if (!raw || !raw.type) return null;
        var map = LEGACY_PROC_MAP[raw.type];
        if (!map) return null;
        var props = Object.assign({}, raw);
        delete props.type;
        delete props.id;
        return buildCatalogElement(map, raw.name || map.label_zh, props, raw.enabled !== false);
    }

    function legacyPreToCatalog(raw) {
        if (!raw) return null;
        var map = LEGACY_PRE_MAP[raw.type || 'beanshell_pre'] || LEGACY_PRE_MAP.beanshell_pre;
        return buildCatalogElement(map, raw.name || map.label_zh, { script: raw.script || '', comments: raw.comments || '' }, raw.enabled !== false);
    }

    function legacyAssertToCatalog(raw) {
        if (!raw || !raw.type) return null;
        var map = ASSERT_MAP[raw.type] || ASSERT_MAP.response;
        var props = Object.assign({}, raw);
        delete props.type;
        if (map.alias === 'JSONPathAssertion') {
            var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
            if (JA && typeof JA.normalizeJsonAssertProps === 'function') {
                props = JA.normalizeJsonAssertProps(props);
            }
        }
        return buildCatalogElement(map, raw.name || map.label_zh, props, raw.enabled !== false);
    }

    function legacyConfigToCatalog(raw) {
        if (!raw || !raw.type) return null;
        var map = CONFIG_TYPE_MAP[raw.type];
        if (!map) return null;
        var props = Object.assign({}, raw.data || raw);
        delete props.type;
        delete props.id;
        var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
        if (HN && raw.type === 'header_manager' && typeof HN.normalizeHeaderProps === 'function') {
            props = HN.normalizeHeaderProps(props);
        }
        return buildCatalogElement(map, raw.name || map.label_zh, props, raw.enabled !== false);
    }

    function constantTimerToCatalog(t) {
        if (!t || typeof t !== 'object') return null;
        return buildCatalogElement(
            { alias: 'ConstantTimer', testclass: 'ConstantTimer', guiclass: 'ConstantTimerGui', category: 'timer', label_zh: '固定定时器' },
            t.name || '固定定时器',
            { delay_ms: t.delay_ms != null ? t.delay_ms : 300, comments: t.comments || '' },
            t.enabled !== false
        );
    }

    function userParamsToCatalog(up) {
        if (!up || typeof up !== 'object') return null;
        return buildCatalogElement(
            { alias: 'UserParameters', testclass: 'UserParameters', guiclass: 'UserParametersGui', category: 'preprocessor', label_zh: '用户参数' },
            up.name || '用户参数',
            { per_iteration: !!up.per_iteration, params: up.params || [] },
            up.enabled !== false
        );
    }

    function hashHasAlias(list, alias) {
        return (list || []).some(function (s) {
            return s && s.type === 'catalog_element' && s.alias === alias;
        });
    }

    function hasLegacyMountArrays(step) {
        if (!step) return false;
        if ((step.processors || []).length) return true;
        if ((step.pre_processors || []).length) return true;
        if ((step.assertions || []).length) return true;
        if ((step.http_managers || []).length) return true;
        return false;
    }

    function purgeLegacyMountArrays(step) {
        if (!step) return;
        delete step.processors;
        delete step.pre_processors;
        delete step.assertions;
        delete step.http_managers;
        delete step.step_listeners;
        delete step.step_listener_items;
        delete step.view_results_tree;
        delete step.aggregate_report;
        delete step.backend_listener;
        if (step.constant_timer && step.constant_timer.enabled === false) delete step.constant_timer;
        if (step.user_parameters && step.user_parameters.enabled === false) delete step.user_parameters;
    }

    function migrateLegacyMountArraysToHash(step) {
        if (!step || !isMountHostStep(step)) return false;
        if (!hasLegacyMountArrays(step) && !step.constant_timer && !step.user_parameters && !(step.step_listeners)) {
            return false;
        }
        var list = ensureHashChildren(step);
        var changed = false;

        (step.processors || []).forEach(function (p) {
            var cat = legacyProcToCatalog(p);
            if (cat) { list.push(cat); changed = true; }
        });
        (step.pre_processors || []).forEach(function (p) {
            var cat = legacyPreToCatalog(p);
            if (cat) { list.push(cat); changed = true; }
        });
        (step.assertions || []).forEach(function (a) {
            var cat = legacyAssertToCatalog(a);
            if (cat) { list.push(cat); changed = true; }
        });
        (step.http_managers || []).forEach(function (c) {
            var cat = legacyConfigToCatalog(c);
            if (cat) { list.push(cat); changed = true; }
        });

        var sl = step.step_listeners;
        if (sl && typeof sl === 'object') {
            if (sl.view_results_tree && !hashHasAlias(list, 'ViewResultsFullVisualizer')) {
                list.push(buildCatalogElement(
                    { alias: 'ViewResultsFullVisualizer', testclass: 'ResultCollector', guiclass: 'ViewResultsFullVisualizer', category: 'listener', label_zh: '查看结果树' },
                    '查看结果树', {}, true
                ));
                changed = true;
            }
            if (sl.aggregate_report && !hashHasAlias(list, 'StatVisualizer')) {
                list.push(buildCatalogElement(
                    { alias: 'StatVisualizer', testclass: 'ResultCollector', guiclass: 'StatVisualizer', category: 'listener', label_zh: '聚合报告' },
                    '聚合报告', {}, true
                ));
                changed = true;
            }
        }

        if (step.constant_timer && step.constant_timer.enabled !== false) {
            var vis = global.JmsIfMountModel && global.JmsIfMountModel.isConstantTimerVisible
                ? global.JmsIfMountModel.isConstantTimerVisible(step)
                : true;
            if (vis && !hashHasAlias(list, 'ConstantTimer')) {
                var tCat = constantTimerToCatalog(step.constant_timer);
                if (tCat) { list.push(tCat); changed = true; }
            }
        }
        if (step.user_parameters) {
            var visUp = global.JmsIfMountModel && global.JmsIfMountModel.isUserParametersVisible
                ? global.JmsIfMountModel.isUserParametersVisible(step)
                : step.user_parameters.enabled !== false;
            if (visUp && !hashHasAlias(list, 'UserParameters')) {
                var uCat = userParamsToCatalog(step.user_parameters);
                if (uCat) { list.push(uCat); changed = true; }
            }
        }

        if (changed) purgeLegacyMountArrays(step);
        return changed;
    }

    function hashMountKey(item, index) {
        return 'ifhash:' + (item && item.id ? item.id : String(index));
    }

    function buildHashMountEntries(ifStep) {
        if (!ifStep) return [];
        migrateLegacyMountArraysToHash(ifStep);
        var list = ifStep.catalog_hash_children || [];
        if (!list.length) return [];
        var entries = [];
        list.forEach(function (item, i) {
            if (!item || item.type !== 'catalog_element') return;
            var cat = item.category || 'other';
            entries.push({
                kind: cat,
                mountKind: 'catalog_hash',
                mountIndex: i,
                hashChildId: item.id,
                ifStepId: ifStep.id,
                key: hashMountKey(item, i),
                defaultOrder: i,
                icon: CATEGORY_ICON[cat] || '·',
                typeLabel: item.label_zh || cat,
                name: item.name || item.label_zh || item.alias || '元件',
                meta: item.alias || '',
                cardClass: CATEGORY_CARD[cat] || 'jms-aux-card--catalog-hash',
                disabled: item.enabled === false
            });
        });
        return entries;
    }

    function usesHashForArrayMounts(ifStep) {
        migrateLegacyMountArraysToHash(ifStep);
        return !!(ifStep.catalog_hash_children && ifStep.catalog_hash_children.length && !hasLegacyMountArrays(ifStep));
    }

    function hasAnyHashMounts(ifStep) {
        if (!ifStep) return false;
        migrateLegacyMountArraysToHash(ifStep);
        return !!(ifStep.catalog_hash_children && ifStep.catalog_hash_children.length);
    }

    function findMountHostInModel(model, planId, tgId, hostStepId) {
        if (global.JmsMountHostResolver && typeof global.JmsMountHostResolver.findMountHostStep === 'function') {
            return global.JmsMountHostResolver.findMountHostStep(model, planId, tgId, hostStepId);
        }
        return null;
    }

    function getHashChild(hostStep, index) {
        if (!hostStep || !Array.isArray(hostStep.catalog_hash_children)) return null;
        return hostStep.catalog_hash_children[index] || null;
    }

    function openHashChildEditor(planId, tgId, hostStepId, hashIndex) {
        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return false;
        var host = findMountHostInModel(visual.getModel(), planId, tgId, hostStepId);
        if (!host) return false;
        migrateLegacyMountArraysToHash(host);
        var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
        if (HN && typeof HN.normalizeSamplerHostStep === 'function') {
            HN.normalizeSamplerHostStep(host);
        }
        var JA0 = global.JmsJmxImportJsonAssertPropsNormalizeV1;
        if (JA0 && typeof JA0.normalizeSamplerHostStep === 'function') {
            JA0.normalizeSamplerHostStep(host);
        }
        var child = getHashChild(host, hashIndex);
        if (!child) return false;
        if (HN && typeof HN.normalizeCatalogElementStep === 'function') {
            HN.normalizeCatalogElementStep(child);
        }
        var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
        if (JA && typeof JA.normalizeCatalogElementStep === 'function') {
            JA.normalizeCatalogElementStep(child);
        }
        var Ed = global.JmsCatalogElementEditorUi;
        if (!Ed || typeof Ed.openForStep !== 'function') return false;
        Ed.openForStep(planId, tgId, child, { httpMount: true, parentStepId: hostStepId, context: 'sampler_child' });
        return true;
    }

    function deleteHashChild(planId, tgId, hostStepId, hashIndex, bodyKey) {
        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return false;
        var host = findMountHostInModel(visual.getModel(), planId, tgId, hostStepId);
        if (!host || !Array.isArray(host.catalog_hash_children)) return false;
        if (hashIndex < 0 || hashIndex >= host.catalog_hash_children.length) return false;
        host.catalog_hash_children.splice(hashIndex, 1);
        if (global.JmsIfMountTimeline && typeof global.JmsIfMountTimeline.removeMountKeyFromTimeline === 'function' && bodyKey) {
            global.JmsIfMountTimeline.removeMountKeyFromTimeline(host, bodyKey);
        }
        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        if (global.JmsCatalogSamplerMountRefresh && typeof global.JmsCatalogSamplerMountRefresh.patchByStepId === 'function') {
            global.JmsCatalogSamplerMountRefresh.patchByStepId(planId, tgId, hostStepId);
        } else if (global.JmsTgIfMountRefresh && typeof global.JmsTgIfMountRefresh.markDirtyAndRefresh === 'function') {
            global.JmsTgIfMountRefresh.markDirtyAndRefresh(planId, tgId, hostStepId);
        }
        return true;
    }

    function walkAllSteps(model, fn) {
        function walk(list) {
            (list || []).forEach(function (s) {
                if (!s) return;
                fn(s);
                if (Array.isArray(s.children)) walk(s.children);
            });
        }
        walk(model.setup_thread_groups);
        walk(model.post_thread_groups);
        (model.test_plans || []).forEach(function (plan) {
            (plan.thread_groups || []).forEach(function (tg) { walk(tg.steps); });
        });
    }

    function migrateModelMountHosts(model) {
        if (!model) return;
        walkAllSteps(model, function (step) {
            if (isMountHostStep(step)) migrateLegacyMountArraysToHash(step);
        });
    }


    var ASSERT_ALIAS = {
        response: 'ResponseAssertion', response_assert: 'ResponseAssertion',
        json: 'JSONPathAssertion', json_assert: 'JSONPathAssertion',
        size: 'SizeAssertion', size_assert: 'SizeAssertion',
        md5hex: 'MD5HexAssertion', md5hex_assert: 'MD5HexAssertion'
    };

    var CONFIG_ALIAS = {
        http_defaults: 'ConfigTestElement', header_manager: 'HeaderManager',
        auth_manager: 'AuthManager', cookie_manager: 'CookieManager',
        cache_manager: 'CacheManager', csv_data_set: 'CSVDataSet', counter: 'CounterConfig'
    };

    var LISTENER_ALIAS = {
        view_results_tree: 'ViewResultsFullVisualizer',
        aggregate_report: 'StatVisualizer',
        backend_listener: 'BackendListener'
    };

    function findCatalogComponent(alias) {
        var st = global.JmsCatalogMenuV2 && global.JmsCatalogMenuV2.getState
            ? global.JmsCatalogMenuV2.getState() : null;
        if (st && Array.isArray(st.components)) {
            for (var i = 0; i < st.components.length; i++) {
                if (st.components[i] && st.components[i].alias === alias) return st.components[i];
            }
        }
        return { alias: alias, testclass: alias, label_zh: alias, category: 'other', container: false };
    }

    function openCreateMountByAlias(planId, tgId, hostStepId, alias) {
        var Ed = global.JmsCatalogElementEditorUi;
        if (!Ed || typeof Ed.openForCreate !== 'function') return false;
        Ed.openForCreate(findCatalogComponent(alias), {
            planId: planId,
            tgId: tgId,
            parentStepId: hostStepId,
            context: 'controller',
            controllerMount: true,
            label: '挂载区'
        });
        return true;
    }

    function openCreateMountAux(planId, tgId, hostStepId, auxOrAlias) {
        if (!auxOrAlias) return false;
        var alias = ASSERT_ALIAS[auxOrAlias] || CONFIG_ALIAS[auxOrAlias] || LISTENER_ALIAS[auxOrAlias];
        if (!alias && global.JmsCatalogOnlyAppend && typeof global.JmsCatalogOnlyAppend.auxToAlias === 'function') {
            alias = global.JmsCatalogOnlyAppend.auxToAlias(auxOrAlias);
        }
        if (!alias) alias = auxOrAlias;
        if (global.JmsCatalogOnlyAppend && typeof global.JmsCatalogOnlyAppend.append === 'function' &&
            global.JmsCatalogOnlyAppend.auxToAlias(auxOrAlias)) {
            return !!global.JmsCatalogOnlyAppend.append({
                planId: planId,
                tgId: tgId,
                parentStepId: hostStepId,
                auxType: auxOrAlias
            }).ok || openCreateMountByAlias(planId, tgId, hostStepId, alias);
        }
        return openCreateMountByAlias(planId, tgId, hostStepId, alias);
    }

    global.JmsMountCatalogBridge = {
        migrateLegacyMountArraysToHash: migrateLegacyMountArraysToHash,
        migrateModelMountHosts: migrateModelMountHosts,
        buildHashMountEntries: buildHashMountEntries,
        usesHashForArrayMounts: usesHashForArrayMounts,
        hasAnyHashMounts: hasAnyHashMounts,
        hashMountKey: hashMountKey,
        openHashChildEditor: openHashChildEditor,
        deleteHashChild: deleteHashChild,
        getHashChild: getHashChild,
        isMountHostStep: isMountHostStep,
        openCreateMountByAlias: openCreateMountByAlias,
        openCreateMountAux: openCreateMountAux
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_tg_listener_catalog_bridge.js ---- */
/**
 * 线程组监听器 · 全量 catalog 桥接（ViewResultsFullVisualizer / StatVisualizer / BackendListener）
 * Phase10：统一 TG 级监听器为 catalog_element，兼容旧 tg.listeners 读写。
 */
(function (global) {
    'use strict';

    var LISTENER_REGISTRY = {
        view_results_tree: {
            alias: 'ViewResultsFullVisualizer',
            testclass: 'ResultCollector',
            guiclass: 'ViewResultsFullVisualizer',
            category: 'listener',
            label_zh: '查看结果树',
            legacyTgKey: 'view_results_tree',
            catalogModule: 'JmsTgViewResultsTreeCatalog'
        },
        aggregate_report: {
            alias: 'StatVisualizer',
            testclass: 'ResultCollector',
            guiclass: 'StatVisualizer',
            category: 'listener',
            label_zh: '聚合报告',
            legacyTgKey: 'aggregate_report',
            catalogModule: 'JmsTgAggregateReportCatalog'
        },
        backend_listener: {
            alias: 'BackendListener',
            testclass: 'BackendListener',
            guiclass: 'BackendListenerGui',
            category: 'listener',
            label_zh: 'InfluxDB Backend Listener',
            legacyTgKey: 'backend_listener',
            catalogModule: 'JmsBackendListenerCatalog'
        }
    };

    var KEYS = ['view_results_tree', 'aggregate_report', 'backend_listener'];

    function vb() { return global.JmsVisualBuilder; }
    function editor() { return global.JmsCatalogElementEditorUi; }

    function findPlan(model, planId) {
        return (model.test_plans || []).find(function (p) {
            return p && String(p.id) === String(planId);
        });
    }

    function findTg(model, planId, tgId) {
        var plan = findPlan(model, planId);
        if (!plan) return null;
        return (plan.thread_groups || []).find(function (t) {
            return t && String(t.id) === String(tgId);
        });
    }

    function walkSteps(list, fn) {
        (list || []).forEach(function (s) {
            if (!s) return;
            fn(s);
            if (Array.isArray(s.children)) walkSteps(s.children, fn);
        });
    }

    function registryForKey(key) {
        return LISTENER_REGISTRY[key] || null;
    }

    function aliasForKey(key) {
        var reg = registryForKey(key);
        return reg ? reg.alias : key;
    }

    function findListenerCatalogStep(tg, keyOrAlias, includeDisabled) {
        var alias = registryForKey(keyOrAlias) ? aliasForKey(keyOrAlias) : keyOrAlias;
        var found = null;
        walkSteps(tg && tg.steps, function (s) {
            if (found) return;
            if (s && s.type === 'catalog_element' && s.alias === alias) {
                if (includeDisabled || s.enabled !== false) found = s;
            }
        });
        if (!found && !includeDisabled) {
            walkSteps(tg && tg.steps, function (s) {
                if (found) return;
                if (s && s.type === 'catalog_element' && s.alias === alias) found = s;
            });
        }
        return found;
    }

    function hasListenerCatalogStep(tg, key) {
        return !!findListenerCatalogStep(tg, key, true);
    }

    function uid() {
        return 'cat_' + Math.random().toString(36).slice(2, 10);
    }

    function catalogModuleForKey(key) {
        var reg = registryForKey(key);
        return reg ? global[reg.catalogModule] : null;
    }

    function normalizeProps(key, tg) {
        var mod = catalogModuleForKey(key);
        var reg = registryForKey(key);
        if (!mod || typeof mod.normalizeConfig !== 'function') {
            return { name: reg ? reg.label_zh : key, enabled: true };
        }
        if (tg && reg && tg[reg.legacyTgKey]) {
            return mod.normalizeConfig(tg[reg.legacyTgKey]);
        }
        var step = findListenerCatalogStep(tg, key, true);
        if (step && step.catalog_props) {
            return mod.normalizeConfig(step.catalog_props);
        }
        return mod.normalizeConfig({});
    }

    function buildListenerStep(key, tg) {
        var reg = registryForKey(key);
        if (!reg) return null;
        var props = normalizeProps(key, tg);
        return {
            id: uid(),
            type: 'catalog_element',
            name: props.name || reg.label_zh,
            enabled: props.enabled !== false,
            alias: reg.alias,
            testclass: reg.testclass,
            guiclass: reg.guiclass,
            category: reg.category,
            label_zh: reg.label_zh,
            container: false,
            scope: 'unified',
            catalog_props: props,
            jmx_fragment: ''
        };
    }

    function ensureListenerStep(planId, tgId, key) {
        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return null;
        var tg = findTg(visual.getModel(), planId, tgId);
        if (!tg || !registryForKey(key)) return null;
        var step = findListenerCatalogStep(tg, key, true);
        if (step) {
            step.enabled = true;
            return step;
        }
        step = buildListenerStep(key, tg);
        if (!Array.isArray(tg.steps)) tg.steps = [];
        tg.steps.unshift(step);
        syncLegacyListenerFields(tg);
        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        return step;
    }

    function removeListenerStepFromList(list, alias) {
        if (!Array.isArray(list)) return false;
        var removed = false;
        var i;
        for (i = list.length - 1; i >= 0; i--) {
            var s = list[i];
            if (s && s.type === 'catalog_element' && s.alias === alias) {
                list.splice(i, 1);
                removed = true;
            }
        }
        return removed;
    }

    function disableListenerCatalog(tg, key) {
        if (!tg || !registryForKey(key)) return false;
        var reg = registryForKey(key);
        removeListenerStepFromList(tg.steps, reg.alias);
        if (!tg.listeners) tg.listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
        tg.listeners[key] = false;
        delete tg[reg.legacyTgKey];
        return true;
    }

    function isListenerEnabled(tg, key) {
        var step = findListenerCatalogStep(tg, key, false);
        if (step) return step.enabled !== false;
        return !!(tg && tg.listeners && tg.listeners[key]);
    }

    function getListenerFlags(tg) {
        return {
            view_results_tree: isListenerEnabled(tg, 'view_results_tree'),
            aggregate_report: isListenerEnabled(tg, 'aggregate_report'),
            backend_listener: isListenerEnabled(tg, 'backend_listener')
        };
    }

    function syncLegacyListenerFields(tg) {
        if (!tg) return;
        if (!tg.listeners) tg.listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
        KEYS.forEach(function (key) {
            var reg = registryForKey(key);
            var step = findListenerCatalogStep(tg, key, true);
            if (step && step.enabled !== false) {
                tg.listeners[key] = true;
                tg[reg.legacyTgKey] = Object.assign({}, step.catalog_props || {});
            } else {
                tg.listeners[key] = false;
                if (!step) delete tg[reg.legacyTgKey];
            }
        });
    }

    function getListenerConfig(tg, key) {
        var step = findListenerCatalogStep(tg, key, true);
        if (step && step.catalog_props) return step.catalog_props;
        var reg = registryForKey(key);
        if (reg && tg && tg[reg.legacyTgKey]) return tg[reg.legacyTgKey];
        return normalizeProps(key, tg);
    }

    function setListenerEnabled(planId, tgId, key, enabled) {
        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return false;
        var tg = findTg(visual.getModel(), planId, tgId);
        if (!tg || !registryForKey(key)) return false;
        if (enabled) {
            ensureListenerStep(planId, tgId, key);
            tg = findTg(visual.getModel(), planId, tgId);
            var LT = global.JmsTgListenerTimeline;
            if (LT && typeof LT.assignAppendTimelineOrder === 'function') {
                LT.assignAppendTimelineOrder(tg, key);
            }
        } else {
            disableListenerCatalog(tg, key);
        }
        syncLegacyListenerFields(tg);
        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        return true;
    }

    function toggleListener(planId, tgId, key) {
        var visual = vb();
        if (!visual || typeof visual.getModel !== 'function') return false;
        var tg = findTg(visual.getModel(), planId, tgId);
        if (!tg) return false;
        return setListenerEnabled(planId, tgId, key, !isListenerEnabled(tg, key));
    }

    function openListenerEditor(planId, tgId, listenerKey) {
        var Ed = editor();
        if (!Ed || typeof Ed.openForStep !== 'function') return false;
        var step = ensureListenerStep(planId, tgId, listenerKey);
        if (!step) return false;
        var visual = vb();
        if (visual && typeof visual.getModel === 'function') {
            var tg = findTg(visual.getModel(), planId, tgId);
            syncLegacyListenerFields(tg);
        }
        Ed.openForStep(planId, tgId, step, null);
        return true;
    }

    function openEditor(planId, tgId, listenerKey) {
        if (!registryForKey(listenerKey)) return false;
        return openListenerEditor(planId, tgId, listenerKey);
    }

    function omitLegacyTgListenerYaml(tg, tgOut) {
        if (!tg || !tgOut) return;
        KEYS.forEach(function (key) {
            if (!hasListenerCatalogStep(tg, key)) return;
            var reg = registryForKey(key);
            if (tgOut.listeners) delete tgOut.listeners[key];
            if (reg && reg.legacyTgKey) delete tgOut[reg.legacyTgKey];
        });
        if (tgOut.listeners) {
            var any = KEYS.some(function (k) { return !!tgOut.listeners[k]; });
            if (!any) delete tgOut.listeners;
        }
    }

    function syncAllThreadGroups(model) {
        if (!model) return;
        function walk(list) {
            (list || []).forEach(syncLegacyListenerFields);
        }
        walk(model.setup_thread_groups);
        walk(model.post_thread_groups);
        (model.test_plans || []).forEach(function (plan) {
            walk(plan.thread_groups);
        });
    }

    global.JmsTgListenerCatalogBridge = {
        LISTENER_REGISTRY: LISTENER_REGISTRY,
        KEYS: KEYS,
        openEditor: openEditor,
        openListenerEditor: openListenerEditor,
        ensureListenerStep: ensureListenerStep,
        ensureBackendListenerStep: function (planId, tgId) { return ensureListenerStep(planId, tgId, 'backend_listener'); },
        openBackendListenerEditor: function (planId, tgId) { return openEditor(planId, tgId, 'backend_listener'); },
        isListenerEnabled: isListenerEnabled,
        getListenerFlags: getListenerFlags,
        hasListenerCatalogStep: hasListenerCatalogStep,
        findListenerCatalogStep: findListenerCatalogStep,
        setListenerEnabled: setListenerEnabled,
        toggleListener: toggleListener,
        disableListenerCatalog: disableListenerCatalog,
        syncLegacyListenerFields: syncLegacyListenerFields,
        syncAllThreadGroups: syncAllThreadGroups,
        getListenerConfig: getListenerConfig,
        omitLegacyTgListenerYaml: omitLegacyTgListenerYaml
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_tg_backend_listener_jmx.js ---- */
/**
 * 线程组级 Backend Listener · JMX 导入/导出门控（隔离模块）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsBackendListenerCatalog;
    var BackendJmx = global.JmsBackendListenerJmx;

    function defaultTgListenersShape() {
        return { view_results_tree: false, aggregate_report: false, backend_listener: false };
    }

    function applyImportConfig(node, tg) {
        if (!node || (node.getAttribute('testclass') || '') !== 'BackendListener') return false;
        if (!tg.listeners) tg.listeners = defaultTgListenersShape();
        tg.listeners.backend_listener = node.getAttribute('enabled') !== 'false';
        if (BackendJmx && typeof BackendJmx.parseBackendListenerEl === 'function') {
            var cfg = BackendJmx.parseBackendListenerEl(node);
            if (cfg) tg.backend_listener = cfg;
        }
        return true;
    }

    /** 仅显式启用时导出（listeners.backend_listener === true） */
    function shouldExportExplicit(tgListeners) {
        var ls = tgListeners || {};
        if (ls.backend_listener === false) return false;
        return ls.backend_listener === true;
    }

    function shouldExport(tgListeners, listenerData) {
        return shouldExportExplicit(tgListeners);
    }

    function listenersToYaml(listeners, backendCfg) {
        var ls = listeners || {};
        var hasBackend = !!ls.backend_listener;
        if (!ls.view_results_tree && !ls.aggregate_report && !hasBackend) return null;
        var out = {};
        if (ls.view_results_tree) out.view_results_tree = true;
        if (ls.aggregate_report) out.aggregate_report = true;
        if (hasBackend) out.backend_listener = true;
        return out;
    }

    function backendConfigToYaml(cfg) {
        if (!cfg || !Catalog) return undefined;
        return Catalog.configToYaml(cfg);
    }

    global.JmsTgBackendListenerJmx = {
        applyImportConfig: applyImportConfig,
        shouldExport: shouldExport,
        shouldExportExplicit: shouldExportExplicit,
        listenersToYaml: listenersToYaml,
        backendConfigToYaml: backendConfigToYaml,
        defaultTgListenersShape: defaultTgListenersShape
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jmx_scenario_advanced.js ---- */
/**
 * JMeter 场景高级特性：SetupThreadGroup / IfController / BeanShell / Raw JMX
 * 与现有 genJmx 链路隔离，仅在检测到高级字段时启用扩展导出。
 */
(function (global) {
    'use strict';

    function compat() { return global.JmsCatalogStepCompat; }
    function isIfController(st) { var C = compat(); return C ? C.isIfController(st) : false; }

    function isRandomController(st) { var C = compat(); return C ? C.isRandomController(st) : false; }

    function isSimpleController(st) { var C = compat(); return C ? C.isSimpleController(st) : false; }

    function isTransactionController(st) { var C = compat(); return C ? C.isTransactionController(st) : false; }

    function isLoopController(st) { var C = compat(); return C ? C.isLoopController(st) : false; }

    function isLogicContainer(st) { var C = compat(); return C ? C.isLogicContainer(st) : false; }

    function isHttpStep(st) {
        var C = compat();
        if (C && C.isHttpSampler(st)) return true;
        return st && !isLogicContainer(st) && !!st.method;
    }

    function countStepsRecursive(steps) {
        var n = 0;
        (steps || []).forEach(function (st) {
            if (!st) return;
            if (isLogicContainer(st)) n += countStepsRecursive(st.children);
            else if (isHttpStep(st)) n += 1;
        });
        return n;
    }

    function flattenHttpSteps(steps, out) {
        out = out || [];
        (steps || []).forEach(function (st) {
            if (!st) return;
            if (isLogicContainer(st)) flattenHttpSteps(st.children, out);
            else if (isHttpStep(st)) out.push(st);
        });
        return out;
    }

    function hasAdvancedFeatures(data) {
        if (!data || typeof data !== 'object') return false;
        if (data.execution_mode === 'raw_jmx' && data.raw_jmx && data.raw_jmx.enabled) return true;
        if (Array.isArray(data.setup_thread_groups) && data.setup_thread_groups.length) return true;
        if (Array.isArray(data.post_thread_groups) && data.post_thread_groups.length) return true;
        function walk(steps) {
            for (var i = 0; i < (steps || []).length; i++) {
                var st = steps[i];
                if (!st) continue;
                if (isLogicContainer(st)) {
                    if (walk(st.children)) return true;
                    continue;
                }
                if (st.processors && st.processors.length) return true;
                if (st.extractors && st.extractors.length > 1) return true;
                if (st.assertions && st.assertions.some(function (a) { return a.type === 'json'; })) return true;
                if (st.type === 'beanshell_post' || st.type === 'debug_sampler' || st.type === 'json_post' || st.type === 'regex_extract' || st.type === 'xpath_extract' || st.type === 'jsr223_post' || st.type === 'jdbc_post') return true;
            }
            return false;
        }
        var groups = (data.setup_thread_groups || []).concat(data.thread_groups || []).concat(data.post_thread_groups || []);
        for (var g = 0; g < groups.length; g++) {
            if (groups[g].processors && groups[g].processors.length) return true;
            if (walk(groups[g].steps)) return true;
        }
        return false;
    }

    function shouldUseRawJmx(data) {
        return !!(data && data.execution_mode === 'raw_jmx' && data.raw_jmx && data.raw_jmx.enabled && data.raw_jmx.xml);
    }

    function normalizeStepTree(steps, label) {
        label = label || 'steps';
        if (!Array.isArray(steps) || !steps.length) throw new Error(label + ' 必须是非空数组');
        return steps.map(function (step, i) {
            if (!step || typeof step !== 'object') throw new Error(label + '[' + i + '] 必须是对象');
            if (step.type !== 'catalog_element') {
                var M = global.JmsCatalogUnifyMigrate;
                if (M && typeof M.stepToCatalog === 'function') step = M.stepToCatalog(step) || step;
            }
            if (step.container) {
                step.children = normalizeStepTree(step.children || [], label + '[' + i + '].children');
            }
            return step;
        });
    }

    function normalizeSetupThreadGroups(list, rootLoadFallback, data) {
        if (!Array.isArray(list)) return [];
        return list.map(function (tg, i) {
            if (typeof global.normalizeThreadGroup === 'function') {
                var row = global.normalizeThreadGroup(tg, 'setup_thread_groups[' + i + ']', rootLoadFallback, data);
                if (tg.processors) row.processors = tg.processors;
                if (tg.kind) row.kind = tg.kind;
                if (tg.config_timeline_active === true) row.config_timeline_active = true;
                if (Array.isArray(tg.config_items)) row.config_items = tg.config_items;
                if (Array.isArray(tg.removed_config_types)) row.removed_config_types = tg.removed_config_types.slice();
                row.steps = normalizeStepTree(row.steps, 'setup_thread_groups[' + i + '].steps');
                return row;
            }
            return tg;
        });
    }

    function normalizePostThreadGroups(list, rootLoadFallback, data) {
        if (!Array.isArray(list)) return [];
        return list.map(function (tg, i) {
            if (typeof global.normalizeThreadGroup === 'function') {
                var row = global.normalizeThreadGroup(tg, 'post_thread_groups[' + i + ']', rootLoadFallback, data);
                if (tg.processors) row.processors = tg.processors;
                if (tg.kind) row.kind = tg.kind;
                if (tg.config_timeline_active === true) row.config_timeline_active = true;
                if (Array.isArray(tg.config_items)) row.config_items = tg.config_items;
                if (Array.isArray(tg.removed_config_types)) row.removed_config_types = tg.removed_config_types.slice();
                row.steps = normalizeStepTree(row.steps, 'post_thread_groups[' + i + '].steps');
                return row;
            }
            return tg;
        });
    }

    function genBeanShellXml(proc, indent, escapeXml) {
        if (global.JmsTgBeanshellPostJmx && typeof global.JmsTgBeanshellPostJmx.genXml === 'function') {
            return global.JmsTgBeanshellPostJmx.genXml(proc, indent, escapeXml);
        }
        if (!proc || proc.type !== 'beanshell_post') return '';
        var en = proc.enabled === false ? 'false' : 'true';
        var xml = indent + '<BeanShellPostProcessor guiclass="TestBeanGUI" testclass="BeanShellPostProcessor" testname="' +
            escapeXml(proc.name || 'BeanShell PostProcessor') + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="filename"></stringProp>\n';
        xml += indent + '  <stringProp name="parameters"></stringProp>\n';
        xml += indent + '  <boolProp name="resetInterpreter">false</boolProp>\n';
        xml += indent + '  <stringProp name="script">' + escapeXml(proc.script || '') + '</stringProp>\n';
        xml += indent + '</BeanShellPostProcessor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function genProcessorsXml(list, indent, escapeXml) {
        var xml = '';
        var arr = Array.isArray(list) ? list : [];
        arr.forEach(function (proc) {
            xml += genBeanShellXml(proc, indent, escapeXml);
        });
        return xml;
    }


    function genDebugSamplerXml(item, indent, escapeXml) {
        if (!item || item.type !== 'debug_sampler') return '';
        var en = item.enabled === false ? 'false' : 'true';
        var xml = indent + '<DebugSampler guiclass="TestBeanGUI" testclass="DebugSampler" testname="' +
            escapeXml(item.name || 'Debug Sampler') + '" enabled="' + en + '">\n';
        xml += indent + '  <boolProp name="displayJMeterProperties">' + (item.display_jmeter_properties ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="displayJMeterVariables">' + (item.display_jmeter_variables !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="displaySystemProperties">' + (item.display_system_properties ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += indent + '</DebugSampler>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function isTreeStep(st) {
        return !!(st && st.type === 'catalog_element');
    }

    function stepsNeedTreeXml(steps) {
        for (var i = 0; i < (steps || []).length; i++) {
            var s = steps[i];
            if (!s) continue;
            if (isTreeStep(s)) return true;
            if (s.container && stepsNeedTreeXml(s.children)) return true;
        }
        return false;
    }



    function genRandomControllerXml(item, indent, helpers) {
        var escapeXml = helpers.escapeXml;
        var xml = indent + '<RandomController guiclass="RandomControlGui" testclass="RandomController" testname="' +
            escapeXml(item.name || '随机控制器') + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="RandomController.ignoreSubControllerBlocks">' + (item.ignore_sub_controller_blocks ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '</RandomController>\n';
        xml += indent + '<hashTree>\n';
        xml += genStepsTreeXml(item.children || [], indent + '  ', helpers);
        xml += indent + '</hashTree>\n';
        return xml;
    }


    function genSimpleControllerXml(item, indent, helpers) {
        var escapeXml = helpers.escapeXml;
        var xml = indent + '<GenericController guiclass="LogicControllerGui" testclass="GenericController" testname="' +
            escapeXml(item.name || '简单控制器') + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += indent + '</GenericController>\n';
        xml += indent + '<hashTree>\n';
        xml += genStepsTreeXml(item.children || [], indent + '  ', helpers);
        xml += indent + '</hashTree>\n';
        return xml;
    }


    function genTransactionControllerXml(item, indent, helpers) {
        var escapeXml = helpers.escapeXml;
        var xml = indent + '<TransactionController guiclass="TransactionControllerGui" testclass="TransactionController" testname="' +
            escapeXml(item.name || '事务控制器') + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="TransactionController.parent">' + (item.generate_parent_sample ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="TransactionController.includeTimers">' + (item.include_timer_duration ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += indent + '</TransactionController>\n';
        xml += indent + '<hashTree>\n';
        xml += genStepsTreeXml(item.children || [], indent + '  ', helpers);
        xml += indent + '</hashTree>\n';
        return xml;
    }



    function genLoopControllerXml(item, indent, helpers) {
        var escapeXml = helpers.escapeXml;
        var forever = !!item.loop_forever;
        var loopsVal = forever ? '-1' : String(Number(item.loops) > 0 ? Number(item.loops) : 1);
        var xml = indent + '<LoopController guiclass="LoopControlPanel" testclass="LoopController" testname="' +
            escapeXml(item.name || '循环控制器') + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="LoopController.continue_forever">' + (forever ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += indent + '  <intProp name="LoopController.loops">' + loopsVal + '</intProp>\n';
        xml += indent + '</LoopController>\n';
        xml += indent + '<hashTree>\n';
        xml += genStepsTreeXml(item.children || [], indent + '  ', helpers);
        xml += indent + '</hashTree>\n';
        return xml;
    }

    function genIfControllerXml(item, indent, helpers) {
        var escapeXml = helpers.escapeXml;
        var xml = indent + '<IfController guiclass="IfControllerPanel" testclass="IfController" testname="' +
            escapeXml(item.name || 'If 控制器') + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <stringProp name="IfController.condition">' + escapeXml(item.condition || '') + '</stringProp>\n';
        xml += indent + '  <boolProp name="IfController.evaluateAll">' + (item.evaluate_all ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="IfController.useExpression">' + (item.use_expression !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '</IfController>\n';
        xml += indent + '<hashTree>\n';
        xml += genStepsTreeXml(item.children || [], indent + '  ', helpers);
        xml += indent + '</hashTree>\n';
        return xml;
    }

    function genSamplerChildrenAdvanced(st, childPad, helpers) {
        var escapeXml = helpers.escapeXml;
        var xml = '';

        (st.extractors || []).forEach(function (ex) {
            if (!ex || !ex.var || !ex.json_path) return;
            xml += childPad + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="提取 ' +
                escapeXml(ex.var) + '" enabled="true">\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(ex.var) + '</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(ex.json_path) + '</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.match_numbers">0</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>\n';
            xml += childPad + '</JSONPostProcessor>\n';
            xml += childPad + '<hashTree/>\n';
        });

        if (st.extract && st.extract.var && st.extract.json_path && !(st.extractors && st.extractors.length)) {
            xml += childPad + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="提取 ' +
                escapeXml(st.extract.var) + '" enabled="true">\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(st.extract.var) + '</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(st.extract.json_path) + '</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.match_numbers">0</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>\n';
            xml += childPad + '</JSONPostProcessor>\n';
            xml += childPad + '<hashTree/>\n';
        }

        (st.processors || []).forEach(function (proc) {
            xml += genBeanShellXml(proc, childPad, escapeXml);
        });

        /* JSON/扩展断言统一由 genSingleHttpStepXml → genAssertionXml 导出，此处不再重复写入 */

        return xml;
    }

    function genStepsTreeXml(steps, indent, helpers) {
        helpers = helpers || {};
        if (global.JmsJmxExportCatalogGuard && typeof global.JmsJmxExportCatalogGuard.prepareSteps === 'function') {
            steps = global.JmsJmxExportCatalogGuard.prepareSteps(steps || []);
        }
        var xml = '';
        var usedStepNames = {};
        (steps || []).forEach(function (st, stepIdx) {
            if (!st) return;
            if (st.type === 'catalog_element' && global.JmxCatalogElement && typeof global.JmxCatalogElement.genXml === 'function') {
                xml += global.JmxCatalogElement.genXml(st, indent, helpers);
                return;
            }
            if (typeof helpers.genSingleStepXml === 'function' && st && st.method) {
                xml += helpers.genSingleStepXml(st, stepIdx, indent, usedStepNames);
            }
        });
        return xml;
    }

    function genLoadPropsXml(load, indent) {
        var loops = load.loops;
        var loopForever = loops < 0 ? 'true' : 'false';
        var loopsVal = loops < 0 ? '-1' : String(loops);
        var xml = '';
        xml += indent + '<intProp name="ThreadGroup.num_threads">' + (Number(load.users) || 1) + '</intProp>\n';
        xml += indent + '<intProp name="ThreadGroup.ramp_time">' + (Number(load.spawn_rate) || 1) + '</intProp>\n';
        xml += indent + '<longProp name="ThreadGroup.duration">' + (Number(load.duration_sec) || 60) + '</longProp>\n';
        xml += indent + '<longProp name="ThreadGroup.delay">0</longProp>\n';
        xml += indent + '<boolProp name="ThreadGroup.same_user_on_next_iteration">false</boolProp>\n';
        xml += indent + '<boolProp name="ThreadGroup.scheduler">true</boolProp>\n';
        xml += indent + '<stringProp name="ThreadGroup.on_sample_error">continue</stringProp>\n';
        xml += indent + '<elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="循环控制器">\n';
        xml += indent + '  <intProp name="LoopController.loops">' + loopsVal + '</intProp>\n';
        xml += indent + '  <boolProp name="LoopController.continue_forever">' + loopForever + '</boolProp>\n';
        xml += indent + '</elementProp>\n';
        return xml;
    }

    function genThreadGroupLikeXml(plan, bu, defaultHeaders, listenerData, tgLabel, opts) {
        opts = opts || {};
        var isSetup = !!opts.isSetup;
        var isPost = !!opts.isPost;
        var helpers = opts.helpers || {};
        var escapeXml = helpers.escapeXml || function (s) { return String(s == null ? '' : s); };
        var tgName = escapeXml(tgLabel || plan.name || 'Thread Group');
        var tag = isSetup ? 'SetupThreadGroup' : (isPost ? 'PostThreadGroup' : 'ThreadGroup');
        var gui = isSetup ? 'SetupThreadGroupGui' : (isPost ? 'PostThreadGroupGui' : 'ThreadGroupGui');
        var xml = '      <' + tag + ' guiclass="' + gui + '" testclass="' + tag + '" testname="' + tgName + '" enabled="true">\n';
        xml += genLoadPropsXml(plan.load, '        ');
        xml += '      </' + tag + '>\n      <hashTree>\n';

        if (helpers.genThreadGroupLocalVariablesXml) {
            xml += helpers.genThreadGroupLocalVariablesXml(plan.variables, '        ', '线程组变量 ' + (plan.name || ''));
        } else if (helpers.genUserDefinedVariablesXml && helpers.hasJmxVariableEntries && helpers.hasJmxVariableEntries(plan.variables)) {
            xml += helpers.genUserDefinedVariablesXml(plan.variables, '        ', '线程组变量 ' + (plan.name || ''));
        }

        xml += genProcessorsXml(plan.processors, '        ', escapeXml);

        if (helpers.genStepsTreeXml) {
            xml += helpers.genStepsTreeXml(plan.steps, '        ', helpers);
        } else if (helpers.genStepsXml) {
            xml += helpers.genStepsXml(plan.steps, '        ');
        }

        if (helpers.backendListenerXml) {
            var exportTgBackendAdv = (global.JmsTgBackendListenerJmx && typeof global.JmsTgBackendListenerJmx.shouldExport === 'function')
                ? global.JmsTgBackendListenerJmx.shouldExport(plan.listeners, listenerData)
                : (listenerData.influxdb && listenerData.influxdb.enabled !== false);
            if (exportTgBackendAdv) xml += helpers.backendListenerXml(listenerData, '        ');
        }
        xml += '      </hashTree>\n';
        return xml;
    }

    function formatImportReport(summary) {
        if (!summary) return '';
        var lines = [];
        lines.push('计划「' + (summary.planName || '') + '」');
        if (summary.setupThreadGroups) lines.push('前置线程组：' + summary.setupThreadGroups + ' 个');
        lines.push('线程组：' + (summary.threadGroups || 0) + ' 个');
        if (summary.postThreadGroups) lines.push('后置线程组：' + summary.postThreadGroups + ' 个');
        lines.push('HTTP 步骤：' + (summary.steps || 0) + ' 个');
        lines.push('公共变量：' + (summary.variables || 0) + ' 个');
        if (summary.ifControllers) lines.push('IfController：' + summary.ifControllers + ' 个');
        if (summary.beanshellProcessors) lines.push('BeanShell：' + summary.beanshellProcessors + ' 个');
        if (summary.jsonAssertions) lines.push('JSON 断言：' + summary.jsonAssertions + ' 个');
        if (summary.extractors) lines.push('JSON 提取：' + summary.extractors + ' 个');
        if (summary.placeholders) lines.push('⚠ 占位请求：' + summary.placeholders + ' 个');
        if (summary.csvAttachments && summary.csvAttachments.length) {
            lines.push('⚠ CSV 附件待上传：' + summary.csvAttachments.length + ' 个');
        }
        (summary.warnings || []).forEach(function (w) { lines.push('⚠ ' + w); });
        return lines.join('\n');
    }

    function collectCsvFilesForZipFromScenario(data) {
        var files = {};
        var groups = (data.setup_thread_groups || []).concat(data.thread_groups || []).concat(data.post_thread_groups || []);
        groups.forEach(function (tg) {
            var csv = tg.http_managers && tg.http_managers.csv_data_set;
            if (!csv || !csv.enabled) return;
            if (csv.file_content) {
                var name = (csv.filename || '').trim() || 'data/data.csv';
                files[name] = csv.file_content;
            }
        });
        if (data._csv_uploads && typeof data._csv_uploads === 'object') {
            Object.keys(data._csv_uploads).forEach(function (k) {
                files[k] = data._csv_uploads[k];
            });
        }
        return files;
    }

    global.JmxScenarioAdvanced = {
        isIfController: isIfController,
        isHttpStep: isHttpStep,
        countStepsRecursive: countStepsRecursive,
        flattenHttpSteps: flattenHttpSteps,
        hasAdvancedFeatures: hasAdvancedFeatures,
        shouldUseRawJmx: shouldUseRawJmx,
        normalizeStepTree: normalizeStepTree,
        normalizeSetupThreadGroups: normalizeSetupThreadGroups,
        normalizePostThreadGroups: normalizePostThreadGroups,
        genBeanShellXml: genBeanShellXml,
        genProcessorsXml: genProcessorsXml,
        genIfControllerXml: genIfControllerXml,
        genDebugSamplerXml: genDebugSamplerXml,
        stepsNeedTreeXml: stepsNeedTreeXml,
        genSamplerChildrenAdvanced: genSamplerChildrenAdvanced,
        genStepsTreeXml: genStepsTreeXml,
        genThreadGroupLikeXml: genThreadGroupLikeXml,
        formatImportReport: formatImportReport,
        collectCsvFilesForZipFromScenario: collectCsvFilesForZipFromScenario
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_output_summary_stats_v1.js ---- */
(function (global) {
    'use strict';

    function isLogicContainer(st) {
        if (global.JmxScenarioAdvanced && typeof global.JmxScenarioAdvanced.isLogicContainer === 'function') {
            return global.JmxScenarioAdvanced.isLogicContainer(st);
        }
        var t = st && st.type;
        return t === 'if_controller' || t === 'loop_controller' || t === 'while_controller' ||
            t === 'foreach_controller' || t === 'transaction_controller' || t === 'simple_controller' ||
            t === 'random_controller' || t === 'switch_controller';
    }

    function countHttpSteps(steps) {
        if (global.JmxScenarioAdvanced && typeof global.JmxScenarioAdvanced.countStepsRecursive === 'function') {
            return global.JmxScenarioAdvanced.countStepsRecursive(steps);
        }
        var n = 0;
        (steps || []).forEach(function (st) {
            if (!st) return;
            if (isLogicContainer(st)) n += countHttpSteps(st.children);
            else if (st.method) n += 1;
        });
        return n;
    }

    function countJsonExtractRecursive(steps) {
        var n = 0;
        (steps || []).forEach(function (st) {
            if (!st) return;
            if (st.extract && st.extract.json_path) n += 1;
            if (Array.isArray(st.extractors)) {
                st.extractors.forEach(function (ex) {
                    if (ex && ex.json_path) n += 1;
                });
            }
            if (isLogicContainer(st)) n += countJsonExtractRecursive(st.children);
        });
        return n;
    }

    function pushThreadGroupRows(rows, list) {
        (list || []).forEach(function (tg) {
            if (!tg) return;
            var load = tg.load || {};
            rows.push({
                name: tg.name || '—',
                users: load.users != null ? load.users : '—',
                httpSteps: countHttpSteps(tg.steps || [])
            });
        });
    }

    function buildScenarioSummaryStats(data) {
        if (!data || typeof data !== 'object') {
            return { tgCount: 0, totalHttpSteps: 0, totalJsonExtract: 0, threadGroups: [] };
        }
        var rows = [];
        pushThreadGroupRows(rows, data.setup_thread_groups);
        pushThreadGroupRows(rows, data.thread_groups);
        pushThreadGroupRows(rows, data.post_thread_groups);

        var totalHttp = 0;
        var totalJson = 0;
        rows.forEach(function (row) { totalHttp += row.httpSteps; });
        (data.setup_thread_groups || []).concat(data.thread_groups || []).concat(data.post_thread_groups || []).forEach(function (tg) {
            totalJson += countJsonExtractRecursive(tg.steps || []);
        });

        return {
            tgCount: rows.length,
            totalHttpSteps: totalHttp,
            totalJsonExtract: totalJson,
            threadGroups: rows
        };
    }


    function countJmxJsonExtractors(jmxText) {
        if (!jmxText) return null;
        var m = String(jmxText).match(/testclass=\"JSONPostProcessor\"/g);
        return m ? m.length : 0;
    }

    global.JmsOutputSummaryStats = {
        buildScenarioSummaryStats: buildScenarioSummaryStats,
        countHttpSteps: countHttpSteps,
        countJsonExtractRecursive: countJsonExtractRecursive,
        countJmxJsonExtractors: countJmxJsonExtractors
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jms_jmx_export_compact.js ---- */
/**
 * JMX 导出体积优化（隔离模块，仅影响导出路径，不影响导入解析）
 */
(function (global) {
    'use strict';

    /** 仅 disabled 时输出 enabled 属性；JMeter 默认 enabled=true */
    function enabledAttr(enabled) {
        return enabled === false ? ' enabled="false"' : '';
    }

    function stringPropIf(indent, name, value, escapeXml) {
        if (value === undefined || value === null || String(value) === '') return '';
        return indent + '<stringProp name="' + name + '">' + escapeXml(String(value)) + '</stringProp>\n';
    }

    function boolPropIf(indent, name, value, defaultVal) {
        var v = value !== undefined && value !== null ? !!value : defaultVal;
        if (v === defaultVal) return '';
        return indent + '<boolProp name="' + name + '">' + (v ? 'true' : 'false') + '</boolProp>\n';
    }

    /** 步骤级 HTTP 采样器公共属性：省略空值与 JMeter 默认值 */
    function httpSamplerCommonProps(indent, opts, escapeXml) {
        opts = opts || {};
        var p = indent + '  ';
        var enc = opts.encoding !== undefined && opts.encoding !== null ? String(opts.encoding) : '';
        var multipart = !!opts.multipart;
        var xml = '';
        xml += stringPropIf(p, 'HTTPSampler.contentEncoding', enc, escapeXml);
        xml += boolPropIf(p, 'HTTPSampler.follow_redirects', opts.follow_redirects, true);
        xml += boolPropIf(p, 'HTTPSampler.auto_redirects', opts.auto_redirects, false);
        xml += boolPropIf(p, 'HTTPSampler.use_keepalive', opts.use_keepalive, true);
        if (multipart) {
            xml += p + '<boolProp name="HTTPSampler.DO_MULTIPART_POST">true</boolProp>\n';
        }
        return xml;
    }

    /** 精简 HTTP 参数块 opening tag */
    function httpArgumentsOpen(indent, testname) {
        return indent + '<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables">\n';
    }

    /** GET/无 body 时的最小 Arguments 块 */
    function httpEmptyBodyArgs(indent) {
        var p = indent + '  ';
        return indent + '<boolProp name="HTTPSampler.postBodyRaw">false</boolProp>\n' +
            httpArgumentsOpen(indent) +
            p + '<collectionProp name="Arguments.arguments"/>\n' +
            indent + '</elementProp>\n';
    }

    /** 表单/字段 HTTPArgument（对齐 JMeter GUI 导出，省略重复的 Argument.name） */
    function httpNamedArgument(indent, name, value, alwaysEncode, escapeXml) {
        var xml = indent + '<elementProp name="' + escapeXml(name) + '" elementType="HTTPArgument">\n';
        if (alwaysEncode) {
            xml += indent + '  <boolProp name="HTTPArgument.always_encode">true</boolProp>\n';
        }
        xml += indent + '  <stringProp name="Argument.value">' + escapeXml(value) + '</stringProp>\n';
        xml += indent + '  <stringProp name="Argument.metadata">=</stringProp>\n';
        xml += indent + '  <boolProp name="HTTPArgument.use_equals">true</boolProp>\n';
        xml += indent + '</elementProp>\n';
        return xml;
    }

    /** HTTP 请求默认值 ConfigTestElement */
    function httpDefaultsBlock(hd, pad, escapeXml) {
        if (!hd || !hd.enabled) return '';
        var p2 = pad + '  ';
        var p3 = p2 + '  ';
        var xml = pad + '<ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="HTTP 请求默认值">\n';
        xml += p2 + '<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables">\n';
        xml += p3 + '<collectionProp name="Arguments.arguments"/>\n';
        xml += p2 + '</elementProp>\n';
        xml += stringPropIf(p2, 'HTTPSampler.domain', hd.domain, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.port', hd.port, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.protocol', hd.protocol, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.path', hd.path !== undefined ? hd.path : '', escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.contentEncoding', hd.content_encoding, escapeXml);
        xml += boolPropIf(p2, 'HTTPSampler.follow_redirects', hd.follow_redirects, true);
        xml += boolPropIf(p2, 'HTTPSampler.auto_redirects', hd.auto_redirects, false);
        xml += boolPropIf(p2, 'HTTPSampler.use_keepalive', hd.use_keepalive, true);
        xml += stringPropIf(p2, 'HTTPSampler.connect_timeout', hd.connect_timeout, escapeXml);
        xml += stringPropIf(p2, 'HTTPSampler.response_timeout', hd.response_timeout, escapeXml);
        var impl = hd.implementation || 'HttpClient4';
        if (impl && impl !== 'HttpClient4') {
            xml += p2 + '<stringProp name="HTTPSampler.implementation">' + escapeXml(impl) + '</stringProp>\n';
        }
        xml += pad + '</ConfigTestElement>\n' + pad + '<hashTree/>\n';
        return xml;
    }

    /** HeaderManager 导出 */
    function headerManagerBlock(headers, indent, testname, escapeXml, comments) {
        var xml = indent + '<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="' + escapeXml(testname) + '">\n';
        if (!headers || !Object.keys(headers).length) {
            xml += indent + '  <collectionProp name="HeaderManager.headers"/>\n';
        } else {
            xml += indent + '  <collectionProp name="HeaderManager.headers">\n';
            Object.keys(headers).forEach(function (hk) {
                xml += indent + '    <elementProp name="' + escapeXml(hk) + '" elementType="Header">\n';
                xml += indent + '      <stringProp name="Header.name">' + escapeXml(hk) + '</stringProp>\n';
                xml += indent + '      <stringProp name="Header.value">' + escapeXml(headers[hk]) + '</stringProp>\n';
                xml += indent + '    </elementProp>\n';
            });
            xml += indent + '  </collectionProp>\n';
        }
        if (comments !== undefined && comments !== null && String(comments).length) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(String(comments)) + '</stringProp>\n';
        }
        xml += indent + '</HeaderManager>\n' + indent + '<hashTree/>\n';
        return xml;
    }


    /** Export-only: ensure HTTPsampler.Arguments has guiclass for JMeter GUI */
    function repairMissingArgumentsGuiClass(xml) {
        if (!xml || typeof xml !== "string") return xml;
        return xml.replace(
            /<elementProp name="HTTPsampler\.Arguments" elementType="Arguments">/g,
            '<elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables">'
        );
    }

    /** 最终 XML 后处理：去掉冗余 enabled 与空属性行 */
    function compactExportXml(xml) {
        if (!xml || typeof xml !== 'string') return xml;
        xml = xml.replace(/ enabled="true"/g, '');
        xml = xml.replace(/^\s*<stringProp name="HTTPSampler\.(domain|port|protocol|embedded_url_re|connect_timeout|response_timeout)"><\/stringProp>\r?\n/gm, '');
        xml = xml.replace(/^\s*<stringProp name="ThreadGroup\.delay"><\/stringProp>\r?\n/gm, '');
        xml = xml.replace(/^\s*<stringProp name="filename"><\/stringProp>\r?\n/gm, '');
        xml = xml.replace(/^\s*<stringProp name="XMLAssertion\.user_defined_namespaces"><\/stringProp>\r?\n/gm, '');
        xml = xml.replace(/^\s*<stringProp name="CounterConfig\.format"><\/stringProp>\r?\n/gm, '');
        xml = repairMissingArgumentsGuiClass(xml);
        xml = xml.replace(/guiclass="RandomControllerGui"/g, 'guiclass="RandomControlGui"');
        /* 保留嵌套 elementProp 的 guiclass/testclass，避免 JMeter GUI 打开 JMX 时 guicomp 为 null */
        return xml;
    }

    global.JmsJmxExportCompact = {
        enabledAttr: enabledAttr,
        httpSamplerCommonProps: httpSamplerCommonProps,
        httpArgumentsOpen: httpArgumentsOpen,
        httpEmptyBodyArgs: httpEmptyBodyArgs,
        httpNamedArgument: httpNamedArgument,
        httpDefaultsBlock: httpDefaultsBlock,
        headerManagerBlock: headerManagerBlock,
        compactExportXml: compactExportXml
    };
})(typeof window !== 'undefined' ? window : this);

/* ---- js/jmx_jsr223_assertion.js ---- */
/**
 * JSR223Assertion · JMX 导入/导出（隔离模块）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim();
        }
        return '';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'JSR223Assertion') return null;
        return {
            type: 'jsr223_assert',
            name: node.getAttribute('testname') || 'JSR223 断言',
            enabled: node.getAttribute('enabled') !== 'false',
            script: getStringProp(node, 'script') || '',
            language: getStringProp(node, 'scriptLanguage') || 'groovy'
        };
    }

    function genXml(assertion, samplerName, indent, escapeXml) {
        if (!assertion || assertion.type !== 'jsr223_assert' || assertion.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        var en = assertion.enabled === false ? 'false' : 'true';
        var testName = escapeXml(assertion.name || assertion.jmeter_name || ('JSR223 断言 ' + (samplerName || '')));
        var lang = assertion.language || 'groovy';
        var xml = indent + '<JSR223Assertion guiclass="TestBeanGUI" testclass="JSR223Assertion" testname="' + testName + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="cacheKey">true</stringProp>\n';
        xml += indent + '  <stringProp name="filename"></stringProp>\n';
        xml += indent + '  <stringProp name="parameters"></stringProp>\n';
        xml += indent + '  <stringProp name="script">' + escapeXml(assertion.script || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="scriptLanguage">' + escapeXml(lang) + '</stringProp>\n';
        xml += indent + '</JSR223Assertion>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    global.JmxJsr223Assertion = {
        parseElement: parseElement,
        genXml: genXml
    };
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jmx_jsr223_post_processor.js ---- */
/**
 * JSR223 PostProcessor · JMX 导入/导出（隔离模块）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return nodes[i].textContent || '';
        }
        return '';
    }

    function genJsR223PostProcessorXml(proc, indent, escapeXml) {
        if (!proc || proc.type !== 'jsr223_post') return '';
        var en = proc.enabled === false ? 'false' : 'true';
        var lang = proc.language || 'groovy';
        var cacheKey = proc.cache_compiled === false ? 'false' : 'true';
        var xml = indent + '<JSR223PostProcessor guiclass="TestBeanGUI" testclass="JSR223PostProcessor" testname="' +
            escapeXml(proc.name || 'JSR223 PostProcessor') + '" enabled="' + en + '">\n';
        if (proc.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(proc.comments) + '</stringProp>\n';
        }
        xml += indent + '  <stringProp name="cacheKey">' + cacheKey + '</stringProp>\n';
        xml += indent + '  <stringProp name="filename">' + escapeXml(proc.filename || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="parameters">' + escapeXml(proc.parameters || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="script">' + escapeXml(proc.script || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="scriptLanguage">' + escapeXml(lang) + '</stringProp>\n';
        xml += indent + '</JSR223PostProcessor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function parseElement(node) {
        if (!node) return null;
        var cacheRaw = getStringProp(node, 'cacheKey');
        return {
            type: 'jsr223_post',
            name: node.getAttribute('testname') || 'JSR223 PostProcessor',
            enabled: node.getAttribute('enabled') !== 'false',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            script: getStringProp(node, 'script') || '',
            language: getStringProp(node, 'scriptLanguage') || 'groovy',
            parameters: getStringProp(node, 'parameters') || '',
            filename: getStringProp(node, 'filename') || '',
            cache_compiled: cacheRaw !== 'false'
        };
    }

    function patchScenarioAdvanced() {
        var adv = global.JmxScenarioAdvanced;
        if (!adv || adv._jsr223GenPatched) return;
        adv._jsr223GenPatched = true;
        adv.genProcessorsXml = function (list, indent, escapeXml) {
            var xml = '';
            (list || []).forEach(function (proc) {
                if (proc && proc.type === 'jsr223_post') {
                    xml += genJsR223PostProcessorXml(proc, indent, escapeXml);
                } else {
                    xml += adv.genBeanShellXml(proc, indent, escapeXml);
                }
            });
            return xml;
        };
    }

    function boot() {
        patchScenarioAdvanced();
    }

    global.JmxJsr223PostProcessor = {
        genXml: genJsR223PostProcessorXml,
        parseElement: parseElement,
        patch: patchScenarioAdvanced
    };

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jmx_json_post_processor.js ---- */
/**
 * JSON PostProcessor · JMX 导入/导出（隔离模块）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return nodes[i].textContent || '';
        }
        return '';
    }

    function getBoolProp(el, name) {
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim() === 'true';
        }
        return false;
    }

    function scopeToApplyTo(scope) {
        var s = (scope || '').trim();
        if (s === 'all') return 'all';
        if (s === 'children') return 'sub';
        if (s === 'variable') return 'variable';
        return 'main';
    }

    function applyToToScope(applyTo) {
        if (applyTo === 'all') return 'all';
        if (applyTo === 'sub') return 'children';
        if (applyTo === 'variable') return 'variable';
        return 'parent';
    }

    function appendScopeXml(proc, indent, escapeXml) {
        var xml = '';
        var scope = applyToToScope(proc.apply_to || 'main');
        if (scope !== 'parent') {
            xml += indent + '  <stringProp name="Sample.scope">' + escapeXml(scope) + '</stringProp>\n';
        }
        if (scope === 'variable' && proc.apply_to_variable) {
            xml += indent + '  <stringProp name="Scope.variable">' + escapeXml(proc.apply_to_variable) + '</stringProp>\n';
        }
        if (proc.compute_concat) {
            xml += indent + '  <boolProp name="JSONPostProcessor.compute_concat">true</boolProp>\n';
        }
        return xml;
    }

    function genJsonPostProcessorXml(proc, indent, escapeXml) {
        if (!proc || proc.type !== 'json_post') return '';
        var en = proc.enabled === false ? 'false' : 'true';
        var testName = proc.name || ('提取 ' + (proc.var || ''));
        var xml = indent + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="' +
            escapeXml(testName) + '" enabled="' + en + '">\n';
        xml += appendScopeXml(proc, indent, escapeXml);
        xml += indent + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(proc.var || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(proc.json_path || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="JSONPostProcessor.match_numbers">' +
            escapeXml(proc.match_numbers !== undefined ? String(proc.match_numbers) : '0') + '</stringProp>\n';
        xml += indent + '  <stringProp name="JSONPostProcessor.defaultValues">' +
            escapeXml(proc.default_value !== undefined && proc.default_value !== '' ? String(proc.default_value) : 'NOT_FOUND') + '</stringProp>\n';
        xml += indent + '</JSONPostProcessor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function parseElement(node) {
        if (!node) return null;
        var varName = getStringProp(node, 'JSONPostProcessor.referenceNames');
        var jsonPath = getStringProp(node, 'JSONPostProcessor.jsonPathExprs');
        if (!varName || !jsonPath) return null;
        var scope = getStringProp(node, 'Sample.scope') || getStringProp(node, 'scope');
        return {
            type: 'json_post',
            name: node.getAttribute('testname') || 'JSON PostProcessor',
            enabled: node.getAttribute('enabled') !== 'false',
            apply_to: scopeToApplyTo(scope),
            apply_to_variable: getStringProp(node, 'Scope.variable') || '',
            var: varName,
            json_path: jsonPath,
            match_numbers: getStringProp(node, 'JSONPostProcessor.match_numbers') || '0',
            compute_concat: getBoolProp(node, 'JSONPostProcessor.compute_concat'),
            default_value: getStringProp(node, 'JSONPostProcessor.defaultValues') || ''
        };
    }

    function jsonPostVarsFromProcessors(processors) {
        var vars = {};
        (processors || []).forEach(function (p) {
            if (p && p.type === 'json_post' && p.var) vars[p.var] = true;
        });
        return vars;
    }

    function patchSamplerChildrenAdvanced() {
        var adv = global.JmxScenarioAdvanced;
        if (!adv || adv._jsonPostSamplerPatch) return;
        var orig = adv.genSamplerChildrenAdvanced;
        if (typeof orig !== 'function') return;
        adv._jsonPostSamplerPatch = true;
        adv.genSamplerChildrenAdvanced = function (st, childPad, helpers) {
            var escapeXml = helpers.escapeXml;
            var skipVars = jsonPostVarsFromProcessors(st.processors);
            var xml = '';

            (st.extractors || []).forEach(function (ex) {
                if (!ex || !ex.var || !ex.json_path || skipVars[ex.var]) return;
                xml += childPad + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="提取 ' +
                    escapeXml(ex.var) + '" enabled="true">\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(ex.var) + '</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(ex.json_path) + '</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.match_numbers">0</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>\n';
                xml += childPad + '</JSONPostProcessor>\n';
                xml += childPad + '<hashTree/>\n';
            });

            if (st.extract && st.extract.var && st.extract.json_path && !(st.extractors && st.extractors.length) && !skipVars[st.extract.var]) {
                xml += childPad + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="提取 ' +
                    escapeXml(st.extract.var) + '" enabled="true">\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(st.extract.var) + '</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(st.extract.json_path) + '</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.match_numbers">0</stringProp>\n';
                xml += childPad + '  <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>\n';
                xml += childPad + '</JSONPostProcessor>\n';
                xml += childPad + '<hashTree/>\n';
            }

            (st.processors || []).forEach(function (proc) {
                if (proc && proc.type === 'jsr223_post' && global.JmxJsr223PostProcessor &&
                    typeof global.JmxJsr223PostProcessor.genXml === 'function') {
                    xml += global.JmxJsr223PostProcessor.genXml(proc, childPad, escapeXml);
                } else if (proc && proc.type === 'json_post') {
                    xml += genJsonPostProcessorXml(proc, childPad, escapeXml);
                } else {
                    xml += adv.genBeanShellXml(proc, childPad, escapeXml);
                }
            });

            return xml;
        };
    }

    function boot() {
        patchSamplerChildrenAdvanced();
    }

    global.JmxJsonPostProcessor = {
        genXml: genJsonPostProcessorXml,
        parseElement: parseElement,
        patch: patchSamplerChildrenAdvanced
    };

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jmx_regex_extractor.js ---- */
/**
 * RegexExtractor · JMX 导入/导出（隔离模块，仅 TG/步骤级 regex_extract）
 */
(function (global) {
    'use strict';

    var FIELD_TO_USE_HEADERS = {
        body: 'false',
        body_unescaped: 'unescaped',
        body_document: 'as_document',
        response_headers: 'true',
        request_headers: 'request',
        url: 'URL',
        response_code: 'code',
        response_message: 'message'
    };

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return nodes[i].textContent || '';
        }
        return '';
    }

    function getBoolProp(el, name) {
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim() === 'true';
        }
        return false;
    }

    function scopeToApplyTo(scope) {
        var s = (scope || '').trim();
        if (s === 'all') return 'all';
        if (s === 'children') return 'sub';
        if (s === 'variable') return 'variable';
        return 'main';
    }

    function applyToToScope(applyTo) {
        if (applyTo === 'all') return 'all';
        if (applyTo === 'sub') return 'children';
        if (applyTo === 'variable') return 'variable';
        return 'parent';
    }

    function normalizeFieldToCheck(val) {
        var v = val ? String(val) : 'body';
        if (FIELD_TO_USE_HEADERS[v]) return v;
        return 'body';
    }

    function useHeadersToField(raw) {
        var v = raw == null ? '' : String(raw).trim();
        if (v === 'false' || v === '') return 'body';
        if (v === 'true') return 'response_headers';
        if (v === 'unescaped') return 'body_unescaped';
        if (v === 'as_document') return 'body_document';
        if (v === 'request') return 'request_headers';
        if (v === 'URL') return 'url';
        if (v === 'code') return 'response_code';
        if (v === 'message') return 'response_message';
        return 'body';
    }

    function fieldToUseHeaders(field) {
        return FIELD_TO_USE_HEADERS[normalizeFieldToCheck(field)] || 'false';
    }

    function appendScopeXml(item, indent, escapeXml) {
        var xml = '';
        var scope = applyToToScope(item.apply_to || 'main');
        if (scope !== 'parent') {
            xml += indent + '  <stringProp name="Sample.scope">' + escapeXml(scope) + '</stringProp>\n';
        }
        if (scope === 'variable' && item.apply_to_variable) {
            xml += indent + '  <stringProp name="Scope.variable">' + escapeXml(item.apply_to_variable) + '</stringProp>\n';
        }
        return xml;
    }

    function genRegexExtractorXml(item, indent, escapeXml) {
        if (!item || item.type !== 'regex_extract') return '';
        var en = item.enabled === false ? 'false' : 'true';
        var testName = item.name || ('正则表达式提取器 ' + (item.refname || ''));
        var xml = indent + '<RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor" testname="' +
            escapeXml(testName) + '" enabled="' + en + '">\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += appendScopeXml(item, indent, escapeXml);
        xml += indent + '  <stringProp name="RegexExtractor.useHeaders">' +
            escapeXml(fieldToUseHeaders(item.field_to_check)) + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.refname">' + escapeXml(item.refname || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.regex">' + escapeXml(item.regex || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.template">' +
            escapeXml(item.template !== undefined && item.template !== '' ? String(item.template) : '$1$') + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.default">' +
            escapeXml(item.default_value !== undefined ? String(item.default_value) : '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="RegexExtractor.match_number">' +
            escapeXml(item.match_number !== undefined ? String(item.match_number) : '1') + '</stringProp>\n';
        if (item.default_empty) {
            xml += indent + '  <boolProp name="RegexExtractor.default_empty_value">true</boolProp>\n';
        }
        xml += indent + '</RegexExtractor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function parseElement(node) {
        if (!node) return null;
        var refname = getStringProp(node, 'RegexExtractor.refname');
        var regex = getStringProp(node, 'RegexExtractor.regex');
        if (!refname && !regex) return null;
        var scope = getStringProp(node, 'Sample.scope') || getStringProp(node, 'scope');
        return {
            type: 'regex_extract',
            name: node.getAttribute('testname') || '正则表达式提取器',
            enabled: node.getAttribute('enabled') !== 'false',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            apply_to: scopeToApplyTo(scope),
            apply_to_variable: getStringProp(node, 'Scope.variable') || '',
            field_to_check: useHeadersToField(getStringProp(node, 'RegexExtractor.useHeaders')),
            refname: refname,
            regex: regex,
            template: getStringProp(node, 'RegexExtractor.template') || '$1$',
            match_number: getStringProp(node, 'RegexExtractor.match_number') || '1',
            default_value: getStringProp(node, 'RegexExtractor.default') || '',
            default_empty: getBoolProp(node, 'RegexExtractor.default_empty_value')
        };
    }

    global.JmxRegexExtractor = {
        genXml: genRegexExtractorXml,
        parseElement: parseElement,
        normalizeFieldToCheck: normalizeFieldToCheck,
        fieldToUseHeaders: fieldToUseHeaders,
        useHeadersToField: useHeadersToField
    };

    function exportHttpStepProcessor(proc, childPad, escapeXml, adv) {
        if (!proc) return '';
        if (proc.type === 'regex_extract') return genRegexExtractorXml(proc, childPad, escapeXml);
        if (proc.type === 'jsr223_post' && global.JmxJsr223PostProcessor &&
            typeof global.JmxJsr223PostProcessor.genXml === 'function') {
            return global.JmxJsr223PostProcessor.genXml(proc, childPad, escapeXml);
        }
        if (proc.type === 'json_post' && global.JmxJsonPostProcessor &&
            typeof global.JmxJsonPostProcessor.genXml === 'function') {
            return global.JmxJsonPostProcessor.genXml(proc, childPad, escapeXml);
        }
        if (adv && typeof adv.genBeanShellXml === 'function') {
            return adv.genBeanShellXml(proc, childPad, escapeXml);
        }
        return '';
    }

    function patchSamplerChildrenForRegex() {
        var adv = global.JmxScenarioAdvanced;
        if (!adv || adv._regexProcSamplerPatch) return;
        var prevGen = adv.genSamplerChildrenAdvanced;
        if (typeof prevGen !== 'function') return;
        adv._regexProcSamplerPatch = true;
        adv.genSamplerChildrenAdvanced = function (st, childPad, helpers) {
            var escapeXml = helpers.escapeXml;
            var stBase = Object.assign({}, st, { processors: [] });
            var xml = prevGen.call(adv, stBase, childPad, helpers);
            (st.processors || []).forEach(function (proc) {
                xml += exportHttpStepProcessor(proc, childPad, escapeXml, adv);
            });
            return xml;
        };
    }

    function boot() {
        patchSamplerChildrenForRegex();
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(typeof window !== 'undefined' ? window : this));

/* ---- js/jmx_jdbc_post_processor.js ---- */
/**
 * JDBC PostProcessor · JMX 导入/导出（隔离模块，仅 TG 级 jdbc_post）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return nodes[i].textContent || '';
        }
        return '';
    }

    function genJdbcPostProcessorXml(proc, indent, escapeXml) {
        if (!proc || proc.type !== 'jdbc_post') return '';
        var en = proc.enabled === false ? 'false' : 'true';
        var xml = indent + '<JDBCPostProcessor guiclass="TestBeanGUI" testclass="JDBCPostProcessor" testname="' +
            escapeXml(proc.name || 'JDBC PostProcessor') + '" enabled="' + en + '">\n';
        if (proc.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(proc.comments) + '</stringProp>\n';
        }
        xml += indent + '  <stringProp name="dataSource">' + escapeXml(proc.data_source || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryType">' + escapeXml(proc.query_type || 'Select Statement') + '</stringProp>\n';
        xml += indent + '  <stringProp name="query">' + escapeXml(proc.query || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryArguments">' + escapeXml(proc.query_arguments || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryArgumentsTypes">' + escapeXml(proc.query_arguments_types || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="variableNames">' + escapeXml(proc.variable_names || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="resultVariable">' + escapeXml(proc.result_variable || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="queryTimeout">' +
            escapeXml(proc.query_timeout !== undefined ? String(proc.query_timeout) : '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="resultSetMaxRows">' +
            escapeXml(proc.result_set_max_rows !== undefined ? String(proc.result_set_max_rows) : '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="resultSetHandler">' +
            escapeXml(proc.result_set_handler || 'Store as String') + '</stringProp>\n';
        xml += indent + '</JDBCPostProcessor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function parseElement(node) {
        if (!node) return null;
        return {
            type: 'jdbc_post',
            name: node.getAttribute('testname') || 'JDBC PostProcessor',
            enabled: node.getAttribute('enabled') !== 'false',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            data_source: getStringProp(node, 'dataSource') || '',
            query_type: getStringProp(node, 'queryType') || 'Select Statement',
            query: getStringProp(node, 'query') || '',
            query_arguments: getStringProp(node, 'queryArguments') || '',
            query_arguments_types: getStringProp(node, 'queryArgumentsTypes') || '',
            variable_names: getStringProp(node, 'variableNames') || '',
            result_variable: getStringProp(node, 'resultVariable') || '',
            query_timeout: getStringProp(node, 'queryTimeout') || '',
            result_set_max_rows: getStringProp(node, 'resultSetMaxRows') || '',
            result_set_handler: getStringProp(node, 'resultSetHandler') || 'Store as String'
        };
    }

    global.JmxJdbcPostProcessor = {
        genXml: genJdbcPostProcessorXml,
        parseElement: parseElement
    };
    function patchSamplerChildrenForJdbc() {
        var adv = global.JmxScenarioAdvanced;
        if (!adv || adv._jdbcProcSamplerPatch) return;
        var prevGen = adv.genSamplerChildrenAdvanced;
        if (typeof prevGen !== 'function') return;
        adv._jdbcProcSamplerPatch = true;
        adv.genSamplerChildrenAdvanced = function (st, childPad, helpers) {
            var escapeXml = helpers.escapeXml;
            var jdbcProcs = (st.processors || []).filter(function (p) {
                return p && p.type === 'jdbc_post';
            });
            var otherProcs = (st.processors || []).filter(function (p) {
                return !p || p.type !== 'jdbc_post';
            });
            var stOther = Object.assign({}, st, { processors: otherProcs });
            var xml = prevGen.call(adv, stOther, childPad, helpers);
            jdbcProcs.forEach(function (proc) {
                if (global.JmxJdbcPostProcessor && typeof global.JmxJdbcPostProcessor.genXml === 'function') {
                    xml += global.JmxJdbcPostProcessor.genXml(proc, childPad, escapeXml);
                }
            });
            return xml;
        };
    }

    function bootJdbcSamplerPatch() {
        patchSamplerChildrenForJdbc();
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bootJdbcSamplerPatch);
    } else {
        bootJdbcSamplerPatch();
    }

}(typeof window !== 'undefined' ? window : this));

/* ---- js/jmx_xpath_extractor.js ---- */
/**
 * XPathExtractor · JMX 导入/导出（隔离模块，仅 TG/步骤级 xpath_extract）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return nodes[i].textContent || '';
        }
        return '';
    }

    function getBoolProp(el, name, defaultVal) {
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                return (nodes[i].textContent || '').trim() === 'true';
            }
        }
        return !!defaultVal;
    }

    function scopeToApplyTo(scope) {
        var s = (scope || '').trim();
        if (s === 'all') return 'all';
        if (s === 'children') return 'sub';
        if (s === 'variable') return 'variable';
        return 'main';
    }

    function applyToToScope(applyTo) {
        if (applyTo === 'all') return 'all';
        if (applyTo === 'sub') return 'children';
        if (applyTo === 'variable') return 'variable';
        return 'parent';
    }

    function appendScopeXml(item, indent, escapeXml) {
        var xml = '';
        var scope = applyToToScope(item.apply_to || 'main');
        if (scope !== 'parent') {
            xml += indent + '  <stringProp name="Sample.scope">' + escapeXml(scope) + '</stringProp>\n';
        }
        if (scope === 'variable' && item.apply_to_variable) {
            xml += indent + '  <stringProp name="Scope.variable">' + escapeXml(item.apply_to_variable) + '</stringProp>\n';
        }
        return xml;
    }

    function boolXml(name, val) {
        return '  <boolProp name="' + name + '">' + (val ? 'true' : 'false') + '</boolProp>\n';
    }

    function genXPathExtractorXml(item, indent, escapeXml) {
        if (!item || item.type !== 'xpath_extract') return '';
        var en = item.enabled === false ? 'false' : 'true';
        var testName = item.name || ('XPath提取器 ' + (item.refname || ''));
        var xml = indent + '<XPathExtractor guiclass="XPathExtractorGui" testclass="XPathExtractor" testname="' +
            escapeXml(testName) + '" enabled="' + en + '">\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += appendScopeXml(item, indent, escapeXml);
        xml += indent + '  <stringProp name="XPathExtractor.refname">' + escapeXml(item.refname || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="XPathExtractor.xpathQuery">' + escapeXml(item.xpath_query || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="XPathExtractor.default">' +
            escapeXml(item.default_value !== undefined ? String(item.default_value) : '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="XPathExtractor.match_number">' +
            escapeXml(item.match_number !== undefined ? String(item.match_number) : '-1') + '</stringProp>\n';
        xml += indent + boolXml('XPathExtractor.validate', !!item.validate_xml);
        xml += indent + boolXml('XPathExtractor.whitespace', !!item.ignore_whitespace);
        xml += indent + boolXml('XPathExtractor.tolerant', !!item.use_tidy);
        xml += indent + boolXml('XPathExtractor.namespace', !!item.use_namespaces);
        xml += indent + boolXml('XPathExtractor.reportErrors', !!item.report_errors);
        xml += indent + boolXml('XPathExtractor.showWarnings', !!item.show_warnings);
        xml += indent + boolXml('XPathExtractor.quiet', item.quiet !== false);
        xml += indent + boolXml('XPathExtractor.downloadDTDs', !!item.fetch_external_dtds);
        xml += indent + boolXml('XPathExtractor.fragment', !!item.return_fragment);
        xml += indent + '</XPathExtractor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function parseElement(node) {
        if (!node) return null;
        var xpathQuery = getStringProp(node, 'XPathExtractor.xpathQuery');
        var refname = getStringProp(node, 'XPathExtractor.refname');
        if (!xpathQuery && !refname) return null;
        var scope = getStringProp(node, 'Sample.scope') || getStringProp(node, 'scope');
        return {
            type: 'xpath_extract',
            name: node.getAttribute('testname') || 'XPath提取器',
            enabled: node.getAttribute('enabled') !== 'false',
            comments: getStringProp(node, 'TestPlan.comments') || '',
            apply_to: scopeToApplyTo(scope),
            apply_to_variable: getStringProp(node, 'Scope.variable') || '',
            use_tidy: getBoolProp(node, 'XPathExtractor.tolerant', false),
            quiet: getBoolProp(node, 'XPathExtractor.quiet', true),
            report_errors: getBoolProp(node, 'XPathExtractor.reportErrors', false),
            show_warnings: getBoolProp(node, 'XPathExtractor.showWarnings', false),
            use_namespaces: getBoolProp(node, 'XPathExtractor.namespace', false),
            validate_xml: getBoolProp(node, 'XPathExtractor.validate', false),
            ignore_whitespace: getBoolProp(node, 'XPathExtractor.whitespace', false),
            fetch_external_dtds: getBoolProp(node, 'XPathExtractor.downloadDTDs', false),
            return_fragment: getBoolProp(node, 'XPathExtractor.fragment', false),
            refname: refname,
            xpath_query: xpathQuery,
            match_number: getStringProp(node, 'XPathExtractor.match_number') || '-1',
            default_value: getStringProp(node, 'XPathExtractor.default') || ''
        };
    }

    global.JmxXPathExtractor = {
        genXml: genXPathExtractorXml,
        parseElement: parseElement
    };
    function patchSamplerChildrenForXPath() {
        var adv = global.JmxScenarioAdvanced;
        if (!adv || adv._xpathProcSamplerPatch) return;
        var prevGen = adv.genSamplerChildrenAdvanced;
        if (typeof prevGen !== 'function') return;
        adv._xpathProcSamplerPatch = true;
        adv.genSamplerChildrenAdvanced = function (st, childPad, helpers) {
            var escapeXml = helpers.escapeXml;
            var xpathProcs = (st.processors || []).filter(function (p) {
                return p && p.type === 'xpath_extract';
            });
            var otherProcs = (st.processors || []).filter(function (p) {
                return !p || p.type !== 'xpath_extract';
            });
            var stOther = Object.assign({}, st, { processors: otherProcs });
            var xml = prevGen.call(adv, stOther, childPad, helpers);
            xpathProcs.forEach(function (proc) {
                if (global.JmxXPathExtractor && typeof global.JmxXPathExtractor.genXml === 'function') {
                    xml += global.JmxXPathExtractor.genXml(proc, childPad, escapeXml);
                }
            });
            return xml;
        };
    }

    function bootXPathSamplerPatch() {
        patchSamplerChildrenForXPath();
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bootXPathSamplerPatch);
    } else {
        bootXPathSamplerPatch();
    }

}(typeof window !== 'undefined' ? window : this));

