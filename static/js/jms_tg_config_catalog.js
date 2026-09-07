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
