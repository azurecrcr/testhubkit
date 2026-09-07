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
