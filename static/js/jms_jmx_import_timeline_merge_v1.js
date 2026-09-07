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
