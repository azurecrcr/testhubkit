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
