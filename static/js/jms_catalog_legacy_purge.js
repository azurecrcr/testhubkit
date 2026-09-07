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
