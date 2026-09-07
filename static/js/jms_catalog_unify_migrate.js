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
